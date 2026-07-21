import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Search, ArrowUp, ArrowDown, ArrowUpDown, ArrowUpRight, Minus, Ban, RotateCcw, X, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { todayISO } from '@/lib/date';
import { useDebounced } from '@/lib/useDebounced';
import { useAuth } from '@/context/auth';
import { hasAnyRole } from '@/lib/userRoles';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { CARD_SHELL, Sparkline as TrendChart } from '@/components/admin/kpiPrimitives';
import { StyleQueueTable, QueueTabs, type QueueColumn, type QueueTab } from '@/components/styles/StyleQueueTable';
import {
  getInventoryHealth,
  setStyleDiscontinued,
  type Aging,
  type FilterKey,
  type InventoryHealthResponse,
  type InventoryKpis,
  type InventorySize,
  type InventoryStyle,
  type InventoryView,
  type Urgency,
} from '@/api/inventoryHealth';
import { refreshAllEasyEcom } from '@/api/salesKpis';

/** Refresh POSTs a background recompute, then polls GET until `syncing` clears. */
const REFRESH_POLL_MS = 5_000;
const REFRESH_MAX_WAIT_MS = 3 * 60_000;

// ── Neutral palette: colour = meaning only ───────────────────────────────
// Red = act now (out/critical), amber = watch, everything else neutral grey.
const RED = '#DC2626';
const AMBER = '#D97706';
const INK = '#18181B'; // near-black for emphasis
const MUTED = '#C4C4C8';
const NEUTRAL_DOT = '#A1A1AA';
// Trend direction colours: velocity rising = green, falling = red, flat = grey.
const TREND_UP = '#059669';
const TREND_DOWN = '#DC2626';
// Active-state accents use the app's theme blue.
const PRIMARY = 'var(--color-primary)';

/** Per-urgency: label + the meaning-colour (red/amber/neutral) for text + dot. */
const URG: Record<Urgency, { label: string; color: string; dot: string }> = {
  out: { label: 'Out of stock', color: RED, dot: RED },
  critical: { label: 'Critical', color: RED, dot: RED },
  watch: { label: 'Watch', color: AMBER, dot: AMBER },
  healthy: { label: 'Healthy', color: '#52525B', dot: NEUTRAL_DOT },
};

/** Per-aging lens: label + meaning-colour dot. `active` never renders a pill. */
const AGE: Record<Exclude<Aging, 'active'>, { label: string; dot: string }> = {
  slow: { label: 'Slow-mover', dot: AMBER },
  dead: { label: 'Dead stock', dot: '#52525B' },
};

/** Sortable columns. `null` = the priority (urgency-first) default order. A
 *  column sorts the STYLES by that metric aggregated over their sizes. */
type SortKey = 'style' | 'cover' | 'drr' | 'stock' | 'atrisk' | 'make';

const PAGE_SIZE = 50;

/** One flattened table row — a single size under its style. `firstOfStyle` marks
 *  the first size row of each style group, so style-level chrome (the disable
 *  action + new/disabled/low-volume badges) renders once, not per size. */
interface FlatRow {
  style: InventoryStyle;
  size: InventorySize;
  firstOfStyle: boolean;
  /** Style-group ordinal — bands alternating groups via rowAccent. */
  band: boolean;
}

function fmtN(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** LOCAL YYYY-MM-DD `n` days before today — seeds the date picker. */
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Jun 5" style short label for the active-window line. */
function shortDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Absolute IST clock label for the last sync — mirrors SalesKpis absTime(). */
function absTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}, ${time}`;
}

/** "5 min ago" relative label — mirrors SalesKpis relativeTime(). */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Amber banner shown while a manual/background sync runs — an EasyEcom report
 *  takes a few minutes, so reassure the user it's working. Mirrors SalesKpis. */
function FetchingBanner({ t }: { t: ReturnType<typeof useTranslation>['t'] }): ReactNode {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <RefreshCw size={16} className="shrink-0 animate-spin" />
      <span>
        {t('admin.inventoryHealth.fetchingReport', {
          defaultValue:
            'Fetching the latest report from EasyEcom — this can take a few minutes. It runs in the background, so you can keep working.',
        })}
      </span>
    </div>
  );
}

export default function InventoryHealth(): ReactNode {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Server-paginated: `styles` accumulates pages of style groups.
  const [styles, setStyles] = useState<InventoryStyle[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<InventoryKpis | null>(null);
  // Day-key axis every visible size's trend sparkline aligns to (same for the page).
  const [trendDates, setTrendDates] = useState<string[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  // Real / virtual inventory view (display-only filter; China stock = virtual).
  const [inventory, setInventory] = useState<InventoryView>('all');
  // Clickable column sort; null = priority (urgency-first) default.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Optional DRR/cover window. Empty = precomputed default (no from/to sent).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const windowActive = !!(dateFrom && dateTo);
  // Seed search from ?q= so it survives navigating into a style and back.
  const [searchText, setSearchText] = useState(() => searchParams.get('q') ?? '');
  const debouncedSearch = useDebounced(searchText, 300);
  const { user } = useAuth();
  // Disable/enable is a merchandising action — admins + sampling editors.
  const canManage = hasAnyRole(user, ['admin', 'sampling_editor']);
  // Pending disable/enable confirmation (per style).
  const [confirmDisc, setConfirmDisc] = useState<{ styleKey: string; next: boolean } | null>(null);

  // Fetch one server page for the current query (server filters/trims/sorts/slices).
  const load = useCallback(
    (skip: number): Promise<InventoryHealthResponse> =>
      getInventoryHealth({
        from: windowActive ? dateFrom : undefined,
        to: windowActive ? dateTo : undefined,
        skip,
        limit: PAGE_SIZE,
        filter,
        inventory,
        search: debouncedSearch.trim() || undefined,
        sortKey: sortKey ?? undefined,
        sortDir,
      }),
    [windowActive, dateFrom, dateTo, filter, inventory, debouncedSearch, sortKey, sortDir],
  );

  // Discard out-of-order responses when the query changes mid-flight.
  const reqRef = useRef(0);
  // Synchronous append guard (state lags a same-commit double observer fire).
  const loadingMoreRef = useRef(false);
  // The IntersectionObserver calls the freshest loadMore via a ref (its own
  // callback ref is stable) and re-attaches on every sentinel (re)mount.
  const loadMoreRef = useRef<() => void>(() => {});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: '400px' },
    );
    io.observe(node);
    observerRef.current = io;
  }, []);

  // Mirror the (debounced) search into ?q= so back-navigation restores it.
  useEffect(() => {
    const q = debouncedSearch.trim();
    // Functional update reads the LATEST params (not a stale closure); return the
    // previous instance unchanged so an identical q doesn't cause a redundant nav.
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (q) params.set('q', q);
        else params.delete('q');
        return params.toString() === prev.toString() ? prev : params;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Replace-load page 0 whenever the query (via `load`) or a manual reload changes.
  useEffect(() => {
    const my = ++reqRef.current;
    setLoading(true);
    setError(false);
    setLoadMoreError(false);
    loadingMoreRef.current = false;
    load(0)
      .then((d) => {
        if (reqRef.current !== my) return;
        setStyles(d.styles);
        setTotal(d.total);
        setKpis(d.kpis);
        setTrendDates(d.trendDates);
        setSyncedAt(d.syncedAt);
        setSyncing(d.syncing);
        setStale(d.stale);
      })
      .catch(() => {
        if (reqRef.current === my) setError(true);
      })
      .finally(() => {
        if (reqRef.current === my) setLoading(false);
      });
  }, [load, reloadTick]);

  // Append the next page when the sentinel scrolls into view.
  const loadMore = useCallback(() => {
    // Synchronous ref guard: two observer fires in one commit window read the
    // same stale `loadingMore` state, so gate on a ref that flips immediately.
    // Also blocked during a refresh so onRefresh's page-0 reload can't collide.
    if (loading || refreshing || loadingMoreRef.current || styles.length >= total) return;
    loadingMoreRef.current = true;
    const my = reqRef.current;
    setLoadMoreError(false);
    load(styles.length)
      .then((d) => {
        if (reqRef.current !== my) return; // query changed mid-flight → drop this page
        setStyles((prev) => [...prev, ...d.styles]);
        setTotal(d.total);
      })
      .catch(() => {
        // Don't swallow — the sentinel stays intersecting, so the observer won't
        // auto-retry; surface a Retry affordance instead of stalling forever.
        if (reqRef.current === my) setLoadMoreError(true);
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  }, [load, loading, refreshing, styles.length, total]);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  // Passive watcher: if a sync (nightly cron / another admin) is already running
  // when we load, poll its status and do ONE race-safe reload when it finishes —
  // without the user clicking Refresh. Deliberately touches no pagination state.
  useEffect(() => {
    if (!syncing || refreshing) return;
    let cancelled = false;
    let elapsed = 0;
    const id = setInterval(async () => {
      elapsed += REFRESH_POLL_MS;
      let completed = false;
      try {
        const d = await load(0);
        completed = !d.syncing;
      } catch {
        /* transient — keep polling until the cap */
      }
      if (cancelled) return;
      if (completed) {
        clearInterval(id);
        setSyncing(false);
        setReloadTick((n) => n + 1); // pull the fresh data race-safely
      } else if (elapsed >= REFRESH_MAX_WAIT_MS) {
        // Give up watching WITHOUT reloading — a reload would re-read syncing=true
        // and restart this interval forever. The banner clears; manual Refresh stays.
        clearInterval(id);
        setSyncing(false);
      }
    }, REFRESH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [syncing, refreshing, load]);

  const onRefresh = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // ONE pull refreshes EVERY EasyEcom read model (Inventory Health + Sales KPI),
      // stamped with a single shared timestamp so every screen's "as of" matches.
      await refreshAllEasyEcom();
      const my = ++reqRef.current;
      const startAt = Date.now();
      let d = await load(0);
      while (d.syncing && Date.now() - startAt < REFRESH_MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, REFRESH_POLL_MS));
        try {
          d = await load(0);
        } catch {
          continue;
        }
      }
      if (reqRef.current === my) {
        setStyles(d.styles);
        setTotal(d.total);
        setKpis(d.kpis);
        setTrendDates(d.trendDates);
        setSyncedAt(d.syncedAt);
        setSyncing(d.syncing);
        setStale(d.stale);
        setLoadMoreError(false);
        loadingMoreRef.current = false;
        setError(false);
      }
      if (d.syncing) {
        // Polling timed out before the recompute finished — this is the last
        // available data, not a confirmed-fresh one; don't claim success.
        toast.show(
          t('admin.inventoryHealth.refreshTimeout', {
            defaultValue: 'Still refreshing in the background — showing the latest available data.',
          }),
          'error',
        );
      } else if (d.stale) {
        // Sync finished but the data didn't advance (EasyEcom fetch failed).
        toast.show(
          t('admin.inventoryHealth.refreshedStale', {
            defaultValue: 'Couldn’t fetch new data from EasyEcom — showing the latest available.',
          }),
          'error',
        );
      } else {
        toast.show(t('admin.inventoryHealth.refreshed', { defaultValue: 'Inventory health refreshed.' }), 'success');
      }
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { message?: string } } }).response;
      if (res?.status === 429) {
        // Shared cooldown with the Sales KPI refresh (refresh-all throttles non-admins
        // to one pull / 10 min) — data is still valid, not a failure. Mirror SalesKpis.
        toast.show(
          res.data?.message ??
            t('admin.inventoryHealth.refreshCooldown', { defaultValue: 'Refreshed recently — please try again soon.' }),
          'info',
        );
        return;
      }
      toast.show(t('admin.inventoryHealth.refreshFailed', { defaultValue: 'Refresh failed. Please try again.' }), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Sign any GCS object paths (v1 imageUrl is usually null → ImageOff fallback).
  const imagePaths = useMemo(() => [...new Set(styles.map((s) => s.imageUrl))], [styles]);
  const signed = useSignedUrls(imagePaths);

  // Flatten style groups → one row per size (sizes soonest-to-run-out first
  // within a style). `firstOfStyle` + `band` carry style-group identity into the
  // flat table (server paginates by style, so a group never splits across a page).
  const rows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    styles.forEach((style, i) => {
      const cover = (z: InventorySize): number => z.coverDays ?? Number.POSITIVE_INFINITY;
      const sized = [...style.sizes].sort((a, b) => cover(a) - cover(b));
      sized.forEach((size, j) => out.push({ style, size, firstOfStyle: j === 0, band: i % 2 === 1 }));
    });
    return out;
  }, [styles]);

  // Click a column header: toggle dir if it's the active one, else switch to it (asc).
  const onSort = useCallback(
    (key: SortKey): void => {
      // Update the two state pieces independently. Nesting setSortDir inside
      // setSortKey's updater double-fires the toggle under StrictMode (dev
      // double-invokes updaters) → the direction never flips locally.
      if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  // Absolute IST clock + "· 5 min ago" relative, mirroring the Sales KPI line.
  const syncedAbs = absTime(syncedAt);
  const syncedAgo = relativeTime(syncedAt);
  const synced = syncedAbs ? (syncedAgo ? `${syncedAbs} · ${syncedAgo}` : syncedAbs) : null;
  // Back-target for the style workspace, restoring this page + search. Held in a
  // ref so openStyle stays referentially stable — otherwise each search keystroke
  // (which mutates ?q=) changes `from`, rebuilding the whole columns memo.
  const from = `${location.pathname}${location.search}`;
  const fromRef = useRef(from);
  fromRef.current = from;

  const openStyle = useCallback(
    (linkedStyleId: number | null): void => {
      if (linkedStyleId == null) return;
      navigate(`/styles/${linkedStyleId}`, { state: { from: fromRef.current } });
    },
    [navigate],
  );

  // Confirm → mark/unmark the product discontinued, then race-safely reload page 0.
  const onConfirmDiscontinue = async (): Promise<void> => {
    if (!confirmDisc) return;
    const { styleKey, next } = confirmDisc;
    setConfirmDisc(null);
    try {
      await setStyleDiscontinued(styleKey, next);
      toast.show(
        next
          ? t('admin.inventoryHealth.discontinuedDone', { defaultValue: 'Product disabled.' })
          : t('admin.inventoryHealth.restoredDone', { defaultValue: 'Product enabled.' }),
        'success',
      );
      setReloadTick((n) => n + 1);
    } catch {
      toast.show(
        t('admin.inventoryHealth.discontinueFailed', { defaultValue: 'Couldn’t update. Please try again.' }),
        'error',
      );
    }
  };

  // The lens tabs (Sampling-style) — urgency tiers, then the aging + new lenses.
  const lensTabs: QueueTab<FilterKey>[] = kpis
    ? [
        { key: 'all', label: t('admin.inventoryHealth.tab.all', { defaultValue: 'All styles' }), count: kpis.totalStyles },
        { key: 'out', label: t('admin.inventoryHealth.tab.out', { defaultValue: 'Out of stock' }), count: kpis.outOfStock },
        { key: 'critical', label: t('admin.inventoryHealth.tab.critical', { defaultValue: 'Critical' }), count: kpis.critical },
        { key: 'watch', label: t('admin.inventoryHealth.tab.watch', { defaultValue: 'Watch' }), count: kpis.watch },
        { key: 'slow', label: t('admin.inventoryHealth.tab.slow', { defaultValue: 'Slow-movers' }), count: kpis.slow },
        { key: 'dead', label: t('admin.inventoryHealth.tab.dead', { defaultValue: 'Dead stock' }), count: kpis.dead },
        { key: 'new', label: t('admin.inventoryHealth.tab.new', { defaultValue: 'New arrivals' }), count: kpis.newArrivals },
      ]
    : [];

  const columns = useMemo<QueueColumn<FlatRow>[]>(
    () => buildColumns({ t, dates: trendDates, signed, sortKey, sortDir, onSort, openStyle }),
    [t, trendDates, signed, sortKey, sortDir, onSort, openStyle],
  );

  return (
    <div style={{ minHeight: '100%', background: '#f6f7f9' }} className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header — title + all filters on one line (no subtitle, for the room). */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">
            {t('admin.inventoryHealth.title', { defaultValue: 'Inventory Health' })}
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Real/virtual stock view lives in the table panel now (next to search). */}
            {/* DRR/cover window — same control the sampling dashboard uses. */}
            <DateRangePicker
              from={windowActive ? dateFrom : daysAgoISO(29)}
              to={windowActive ? dateTo : todayISO()}
              maxDate={todayISO()}
              label={t('admin.inventoryHealth.window', { defaultValue: 'Window' })}
              onApply={(f, tt) => {
                setDateFrom(f);
                setDateTo(tt);
              }}
            />
            <button
              type="button"
              onClick={onRefresh}
              aria-busy={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              {refreshing
                ? t('admin.inventoryHealth.syncing', { defaultValue: 'Syncing…' })
                : t('admin.inventoryHealth.refresh', { defaultValue: 'Refresh' })}
            </button>
          </div>
        </div>

        {/* Status line */}
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              loading ? 'animate-pulse bg-amber-400' : error ? 'bg-red-500' : stale ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
          />
          <span className={error ? 'font-medium text-red-600' : stale ? 'font-medium text-amber-600' : 'text-neutral-500'}>
            {loading
              ? t('admin.inventoryHealth.loading', { defaultValue: 'Loading…' })
              : error
                ? t('admin.inventoryHealth.loadError', { defaultValue: 'Couldn’t load inventory health.' })
                : stale && synced
                  ? t('admin.inventoryHealth.stale', {
                      defaultValue: 'Showing data from {{when}} — couldn’t fetch the latest from EasyEcom.',
                      when: synced,
                    })
                  : synced
                    ? t('admin.inventoryHealth.synced', { defaultValue: 'As of {{when}}', when: synced })
                    : t('admin.inventoryHealth.neverSynced', { defaultValue: 'Not synced yet' })}
          </span>
          {windowActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              {t('admin.inventoryHealth.windowActive', {
                defaultValue: 'Window: {{from}} – {{to}}',
                from: shortDay(dateFrom),
                to: shortDay(dateTo),
              })}
              <button
                type="button"
                aria-label={t('admin.inventoryHealth.windowClear', { defaultValue: 'Reset to default window' })}
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        {/* Persistent banner while a manual/background sync is running. */}
        {(refreshing || syncing) && !loading && <FetchingBanner t={t} />}

        {/* Body */}
        {loading && !styles.length ? (
          <>
            <div style={CARD_SHELL} className="mb-4">
              <Skeleton className="h-6 w-80 rounded-md" />
              <Skeleton className="mt-3 h-4 w-64 rounded-md" />
            </div>
            <div style={CARD_SHELL}>
              <Skeleton className="h-40 w-full rounded-md" />
            </div>
          </>
        ) : kpis ? (
          <>
            {/* One unified panel — the Sampling "style tracking" treatment: lens
                tabs · search + view filter · table · footer all share a single
                bordered card. */}
            <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
              {/* Tabs row — QueueTabs' own bottom border is the divider. */}
              <div className="px-4 pt-3">
                <QueueTabs tabs={lensTabs} active={filter} onSelect={setFilter} />
              </div>

              {/* Search · real/virtual view · to-make + count. */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="relative w-full max-w-sm">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-primary)]" />
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder={t('admin.inventoryHealth.search', { defaultValue: 'Search style, size or name…' })}
                      className="h-9 w-full rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 pl-9 pr-3 text-[13px] text-[var(--color-foreground)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    />
                  </div>
                  {/* Real / virtual stock view — in-panel, mirroring Sampling's status chips. */}
                  <div className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                    {(['all', 'real', 'virtual'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setInventory(v)}
                        aria-pressed={inventory === v}
                        className={`rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-semibold transition ${
                          inventory === v
                            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                            : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
                        }`}
                      >
                        {t(`admin.inventoryHealth.inv.${v}`, {
                          defaultValue: v === 'all' ? 'All stock' : v === 'real' ? 'Real' : 'Virtual',
                        })}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[12px] tabular-nums text-[var(--color-muted-foreground)]">
                  <span>
                    {t('admin.inventoryHealth.toMakeInline', {
                      defaultValue: 'To make: {{n}} units',
                      n: fmtN(kpis.unitsToMake),
                    })}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{t('admin.inventoryHealth.styleCount', { defaultValue: '{{n}} styles', n: total })}</span>
                </div>
              </div>

              {/* `bare` — the table drops its own card chrome; this panel provides it. */}
              <StyleQueueTable<FlatRow>
                bare
                columns={columns}
                rows={rows}
                getRowKey={(r) => `${r.style.styleKey}|${r.size.sku}`}
                loading={false}
                error={false}
                emptyLabel={t('admin.inventoryHealth.empty', { defaultValue: 'Nothing matches this filter.' })}
                rowAccent={(r) => r.band}
                actionsWidth="7rem"
                renderActions={(r) =>
                  canManage && r.firstOfStyle ? (
                    <DisableButton style={r.style} onRequest={(styleKey, next) => setConfirmDisc({ styleKey, next })} t={t} />
                  ) : null
                }
              />

              {/* Infinite-scroll sentinel as the panel footer: entering the viewport
                  fetches the next page. On a fetch error the observer can't self-retry
                  (sentinel stays in view), so show a manual Retry instead of stalling. */}
              {styles.length < total && (
                <div
                  ref={sentinelRef}
                  className="border-t border-[var(--color-border)] px-4 py-3 text-center text-xs text-[var(--color-muted-foreground)]"
                >
                  {loadMoreError ? (
                    <button
                      type="button"
                      onClick={() => loadMore()}
                      className="font-medium text-[var(--color-foreground)] underline underline-offset-2 hover:opacity-80"
                    >
                      {t('admin.inventoryHealth.loadMoreRetry', {
                        defaultValue: 'Couldn’t load more — retry',
                      })}
                    </button>
                  ) : (
                    t('admin.inventoryHealth.loadingMore', {
                      defaultValue: 'Loading more… ({{shown}} of {{total}})',
                      shown: styles.length,
                      total,
                    })
                  )}
                </div>
              )}
            </section>
          </>
        ) : error ? (
          <div style={CARD_SHELL} className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-neutral-600">
              {t('admin.inventoryHealth.loadError', { defaultValue: 'Couldn’t load inventory health.' })}
            </p>
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              {t('admin.inventoryHealth.retry', { defaultValue: 'Retry' })}
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDisc != null}
        destructive={confirmDisc?.next === true}
        title={
          confirmDisc?.next
            ? t('admin.inventoryHealth.discontinueTitle', { defaultValue: 'Disable product?' })
            : t('admin.inventoryHealth.restoreTitle', { defaultValue: 'Enable product?' })
        }
        message={
          confirmDisc?.next
            ? t('admin.inventoryHealth.discontinueMsg', {
                defaultValue: '“{{style}}” and all its sizes will drop to the bottom of the list.',
                style: confirmDisc?.styleKey ?? '',
              })
            : t('admin.inventoryHealth.restoreMsg', {
                defaultValue: '“{{style}}” will return to its normal position.',
                style: confirmDisc?.styleKey ?? '',
              })
        }
        confirmLabel={
          confirmDisc?.next
            ? t('admin.inventoryHealth.discontinueConfirm', { defaultValue: 'Disable' })
            : t('admin.inventoryHealth.restoreConfirm', { defaultValue: 'Enable' })
        }
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        onConfirm={onConfirmDiscontinue}
        onCancel={() => setConfirmDisc(null)}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Table column config + cell helpers.
 * ────────────────────────────────────────────────────────────────── */

/** Build the flat-table columns. Sortable numeric columns pass a clickable
 *  SortHeader as their `header` node, so the shared (sort-less) table keeps
 *  IH's server-side column sort without changing the primitive. */
function buildColumns({
  t,
  dates,
  signed,
  sortKey,
  sortDir,
  onSort,
  openStyle,
}: {
  t: ReturnType<typeof useTranslation>['t'];
  dates: string[];
  signed: Record<string, string | null>;
  sortKey: SortKey | null;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  openStyle: (linkedStyleId: number | null) => void;
}): QueueColumn<FlatRow>[] {
  const sortH = (label: string, col: SortKey, align: 'left' | 'right' = 'left'): ReactNode => (
    <SortHeader label={label} col={col} sortKey={sortKey} sortDir={sortDir} onSort={onSort} align={align} />
  );
  return [
    {
      key: 'product',
      header: sortH(t('admin.inventoryHealth.col.product', { defaultValue: 'Product' }), 'style'),
      width: '30%',
      cell: (r) => <ProductCell row={r} imageUrl={(r.style.imageUrl && signed[r.style.imageUrl]) || null} openStyle={openStyle} t={t} />,
    },
    {
      key: 'status',
      header: t('admin.inventoryHealth.col.status', { defaultValue: 'Status' }),
      width: '15%',
      cell: (r) => <StatusCell row={r} t={t} />,
    },
    {
      key: 'cover',
      header: sortH(t('admin.inventoryHealth.col.cover', { defaultValue: 'Cover' }), 'cover', 'right'),
      align: 'right',
      cell: (r) => <CoverCell size={r.size} t={t} />,
    },
    {
      key: 'drr',
      header: sortH(t('admin.inventoryHealth.col.drr', { defaultValue: 'DRR · /d' }), 'drr', 'right'),
      align: 'right',
      cell: (r) => <DrrCell size={r.size} t={t} />,
    },
    {
      key: 'trend',
      header: <span className="flex justify-end">{t('admin.inventoryHealth.col.trend', { defaultValue: 'Trend · /d' })}</span>,
      align: 'right',
      width: '9rem',
      className: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      cell: (r) => <TrendCell data={r.size.trend ?? []} dates={dates} t={t} />,
    },
    {
      key: 'stock',
      header: sortH(t('admin.inventoryHealth.col.stock', { defaultValue: 'Stock' }), 'stock', 'right'),
      align: 'right',
      cell: (r) => <span className="tabular-nums text-neutral-700">{fmtN(r.size.currentStock)}</span>,
    },
    {
      key: 'atrisk',
      header: sortH(t('admin.inventoryHealth.col.atRisk', { defaultValue: 'At risk · /d' }), 'atrisk', 'right'),
      align: 'right',
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      cell: (r) => (
        <span className="tabular-nums" style={{ color: r.size.atRiskUnitsPerDay >= 0.5 ? INK : MUTED }}>
          {r.size.atRiskUnitsPerDay >= 0.5
            ? `${r.size.atRiskUnitsPerDay.toLocaleString('en-IN', { maximumFractionDigits: 1 })}/d`
            : '—'}
        </span>
      ),
    },
    {
      key: 'make',
      header: sortH(t('admin.inventoryHealth.col.make', { defaultValue: 'Make' }), 'make', 'right'),
      align: 'right',
      cell: (r) => (
        <span className="font-bold tabular-nums" style={{ color: r.size.makeQty > 0 ? INK : MUTED }}>
          {fmtN(r.size.makeQty)}
        </span>
      ),
    },
  ];
}

/** Product cell — thumbnail + style code (links to the workspace when the style
 *  is linked to the ERP catalog) + the size, with the SKU beneath. */
function ProductCell({
  row,
  imageUrl,
  openStyle,
  t,
}: {
  row: FlatRow;
  imageUrl: string | null;
  openStyle: (linkedStyleId: number | null) => void;
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  const { style, size, firstOfStyle } = row;
  const linked = style.linkedStyleId != null;
  const codeColor = style.lowVolume ? 'text-neutral-500' : 'text-neutral-900';
  // Show the human name only when it adds info (differs from the code and isn't
  // just the SKU) and only once per style group. Marketplace out-links likewise.
  const norm = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normName = norm(style.name ?? '');
  const showName =
    firstOfStyle && !!normName && normName !== norm(style.styleKey) && !style.sizes.some((z) => norm(z.sku) === normName);
  const showLinks = firstOfStyle && style.marketplaceLinks.length > 0;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <HoverThumbnail src={imageUrl} alt={size.sku} size={36} radius="8px" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {linked ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openStyle(style.linkedStyleId);
              }}
              title={t('admin.inventoryHealth.openStyle', { defaultValue: 'Open style workspace' })}
              className="inline-flex min-w-0 items-center gap-1 truncate text-[13px] font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              <span className="truncate">{style.styleKey}</span>
              <ArrowUpRight size={12} className="shrink-0" style={{ color: PRIMARY }} />
            </button>
          ) : (
            <span className={`truncate text-[13px] font-semibold ${codeColor}`}>{style.styleKey}</span>
          )}
          <span className="shrink-0 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] font-bold text-neutral-700">
            {size.size}
          </span>
        </div>
        <span className="mt-0.5 block truncate font-mono text-[11px]" style={{ color: MUTED }}>
          {size.sku}
        </span>
        {(showName || showLinks) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            {showName && (
              <span className="truncate font-mono text-[11px]" style={{ color: NEUTRAL_DOT }}>
                {style.name}
              </span>
            )}
            {showLinks && <ChannelChips links={style.marketplaceLinks} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** Per-channel listing chips — clickable out-links to the live marketplace
 *  listing (only channels with a real ERP StyleChannelListing URL appear). */
function ChannelChips({ links }: { links: { channel: string; url: string }[] }): ReactNode {
  if (!links.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {links.map((l) => (
        <a
          key={l.channel}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`Open on ${l.channel}`}
          className="inline-flex items-center gap-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          {l.channel}
          <ArrowUpRight size={10} className="text-neutral-400" />
        </a>
      ))}
    </span>
  );
}

/** Status cell — urgency pill (always), an aging pill when idle, plus the
 *  style-level badges (new / disabled / low-volume) once per style group. */
function StatusCell({ row, t }: { row: FlatRow; t: ReturnType<typeof useTranslation>['t'] }): ReactNode {
  const { style, size, firstOfStyle } = row;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <UrgencyPill urgency={size.urgency} />
      {/* Guard on the exact keys — an unknown/undefined aging (e.g. FE deployed
          before BE) must not index AGE and crash the row. */}
      {(size.aging === 'slow' || size.aging === 'dead') && <AgingPill aging={size.aging} />}
      {firstOfStyle && style.isNew && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
          <Sparkles size={10} />
          {t('admin.inventoryHealth.newBadge', { defaultValue: 'New' })}
        </span>
      )}
      {firstOfStyle && style.discontinued && (
        <span className="inline-flex items-center rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          {t('admin.inventoryHealth.discontinuedBadge', { defaultValue: 'disabled' })}
        </span>
      )}
      {firstOfStyle && style.lowVolume && (
        <span className="inline-flex items-center rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
          {t('admin.inventoryHealth.lowVolume', { defaultValue: 'low volume' })}
        </span>
      )}
    </div>
  );
}

function CoverCell({ size, t }: { size: InventorySize; t: ReturnType<typeof useTranslation>['t'] }): ReactNode {
  if (size.coverDays == null) return <span className="font-semibold" style={{ color: MUTED }}>—</span>;
  return (
    <span className="font-semibold" style={{ color: URG[size.urgency].color }}>
      {t('admin.inventoryHealth.daysLeft', { defaultValue: '{{n}} days left', n: fmtN(size.coverDays) })}
    </span>
  );
}

/** DRR — up to 2dp so a 0.03/day slow-mover never rounds to a misleading "0". */
function DrrCell({ size, t }: { size: InventorySize; t: ReturnType<typeof useTranslation>['t'] }): ReactNode {
  const low = size.confidence === 'low';
  return (
    <span className="inline-flex items-center">
      <span className="tabular-nums" style={{ color: low ? MUTED : INK }}>
        {low ? '~' : ''}
        {size.drr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </span>
      {low && (
        <span className="ml-1.5 rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
          {t('admin.inventoryHealth.lowData', { defaultValue: 'low data' })}
        </span>
      )}
    </span>
  );
}

/** Disable / enable action — red for disable; shown once per style group. */
function DisableButton({
  style,
  onRequest,
  t,
}: {
  style: InventoryStyle;
  onRequest: (styleKey: string, next: boolean) => void;
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRequest(style.styleKey, !style.discontinued);
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
        style.discontinued
          ? 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
          : 'border-red-200 text-red-600 hover:bg-red-50'
      }`}
    >
      {style.discontinued ? (
        <>
          <RotateCcw size={13} />
          {t('admin.inventoryHealth.enable', { defaultValue: 'Enable' })}
        </>
      ) : (
        <>
          <Ban size={13} />
          {t('admin.inventoryHealth.disable', { defaultValue: 'Disable' })}
        </>
      )}
    </button>
  );
}

/** Clickable column header. A faint ArrowUpDown means "sortable"; the active
 *  column shows a solid ArrowUp/ArrowDown. Sorts the STYLES (server-side). */
function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey | null;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}): ReactNode {
  const activeSort = sortKey === col;
  const Icon = activeSort ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSort(col);
      }}
      className={`flex items-center gap-1 uppercase tracking-[inherit] transition hover:text-[var(--color-foreground)] ${
        align === 'right' ? 'ml-auto justify-end' : 'justify-start'
      }`}
      style={{ color: activeSort ? PRIMARY : 'inherit', letterSpacing: 'inherit' }}
    >
      {label}
      <Icon size={12} style={{ color: activeSort ? PRIMARY : MUTED }} />
    </button>
  );
}

function UrgencyPill({ urgency }: { urgency: Urgency }): ReactNode {
  const u = URG[urgency];
  // Neutral chrome; the dot carries the meaning-colour (red/amber/grey).
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
      <span style={{ width: 6, height: 6, borderRadius: 999, background: u.dot }} />
      {u.label}
    </span>
  );
}

function AgingPill({ aging }: { aging: Exclude<Aging, 'active'> }): ReactNode {
  const a = AGE[aging];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
      <span style={{ width: 6, height: 6, borderRadius: 999, background: a.dot }} />
      {a.label}
    </span>
  );
}

/** Up / down / flat from the first-third vs last-third mean, with a 10% deadband
 *  so noise doesn't read as a trend (colours the sparkline + arrow). */
function trendDir(data: number[]): 'up' | 'down' | 'flat' {
  const n = data.length;
  if (n < 4) return 'flat';
  const k = Math.max(1, Math.floor(n / 3));
  const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const first = mean(data.slice(0, k));
  const last = mean(data.slice(n - k));
  const delta = (last - first) / Math.max(first, 0.001);
  if (delta > 0.1) return 'up';
  if (delta < -0.1) return 'down';
  return 'flat';
}

/** Inline INTERACTIVE trend sparkline: hover any day to read that day's units in
 *  the built-in tooltip. Colour + arrow show whether velocity is rising or
 *  falling. No enlarge/popover — the chart itself IS the interaction. */
function TrendCell({
  data,
  dates,
  t,
}: {
  data: number[];
  dates: string[];
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  const dir = useMemo(() => trendDir(data), [data]);
  const hasData = data.some((v) => v > 0);
  if (!hasData) return <span style={{ color: MUTED }}>—</span>;
  const color = dir === 'up' ? TREND_UP : dir === 'down' ? TREND_DOWN : NEUTRAL_DOT;
  const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
  return (
    <span className="flex w-full items-center justify-end gap-1.5">
      <span
        className="-mt-3 inline-block w-[92px] shrink-0"
        title={t('admin.inventoryHealth.trendTitle', { defaultValue: 'Daily units — hover a day for its value' })}
      >
        {/* Raw daily units → the built-in tooltip shows that day's actual value. */}
        <TrendChart
          data={data}
          dates={dates}
          accent={color}
          unit={t('admin.inventoryHealth.perDay', { defaultValue: '/d' })}
        />
      </span>
      <DirIcon size={13} style={{ color }} className="shrink-0" />
    </span>
  );
}
