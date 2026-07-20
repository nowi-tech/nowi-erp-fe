import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Search, Plus, ArrowUp, ArrowDown, ArrowUpDown, ArrowUpRight, Minus, Ban, RotateCcw, X } from 'lucide-react';
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
import {
  getInventoryHealth,
  setStyleDiscontinued,
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
const LABEL_GREY = '#B0AFAE';
const MUTED = '#C4C4C8';
const NEUTRAL_DOT = '#A1A1AA';
// Trend direction colours: velocity rising = green, falling = red, flat = grey.
const TREND_UP = '#059669';
const TREND_DOWN = '#DC2626';
// Table chrome — clean header bar + bold dark labels + a navy accent bar on the
// expanded child section (matches the reference master–detail styling).
const HEADER_BG = '#F6F7F9';
const HEADER_INK = '#334155';
const ACCENT_BAR = '#1F2A44';

/** Per-urgency: label + the meaning-colour (red/amber/neutral) for text + dot. */
const URG: Record<Urgency, { label: string; color: string; dot: string }> = {
  out: { label: 'Out of stock', color: RED, dot: RED },
  critical: { label: 'Critical', color: RED, dot: RED },
  watch: { label: 'Watch', color: AMBER, dot: AMBER },
  healthy: { label: 'Healthy', color: '#52525B', dot: NEUTRAL_DOT },
};

// Child (size) grid — the sub-header + every size row align to it.
// SIZE (thumb + size) · COVER · DRR · TREND · STOCK · AT-RISK · MAKE
const GRID = 'minmax(0,1.5fr) 0.8fr 0.6fr 1.05fr 0.6fr 0.8fr 0.6fr';

/** Which urgency filter is active. Cards map to these; re-clicking the active
 *  card clears it. Healthy is never listed. Filter/search run server-side;
 *  styles default to top-seller (DRR) order. */
type FilterKey = 'all' | 'out' | 'critical' | 'watch';

/** Sortable columns. `null` = the top-seller (DRR) default order. In the grouped
 *  view a column sorts the STYLES by that metric aggregated over their sizes
 *  (cover = soonest / drr,stock,atrisk = sum / make = total). */
type SortKey = 'style' | 'cover' | 'drr' | 'stock' | 'atrisk' | 'make';

const PAGE_SIZE = 50;

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
  // Per-style expand override (true = open, false = collapsed). Absent ⇒ the
  // default: out / critical styles open, Watch styles collapsed.
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
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
  // Clickable column sort; null = top-seller (DRR) default.
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
  // Discontinue/restore is a merchandising action — admins + sampling editors.
  const canManage = hasAnyRole(user, ['admin', 'sampling_editor']);
  // Pending discontinue/restore confirmation (per style).
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

  // Click a column header: toggle dir if it's the active one, else switch to it (asc).
  const onSort = (key: SortKey): void => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Absolute IST clock + "· 5 min ago" relative, mirroring the Sales KPI line.
  const syncedAbs = absTime(syncedAt);
  const syncedAgo = relativeTime(syncedAt);
  const synced = syncedAbs ? (syncedAgo ? `${syncedAbs} · ${syncedAgo}` : syncedAbs) : null;
  // Back-target for the style workspace, restoring this page + search.
  const from = `${location.pathname}${location.search}`;

  const openStyle = (linkedStyleId: number | null): void => {
    if (linkedStyleId == null) return;
    navigate(`/styles/${linkedStyleId}`, { state: { from } });
  };

  // Confirm → mark/unmark the product discontinued, then race-safely reload page 0.
  const onConfirmDiscontinue = async (): Promise<void> => {
    if (!confirmDisc) return;
    const { styleKey, next } = confirmDisc;
    setConfirmDisc(null);
    try {
      await setStyleDiscontinued(styleKey, next);
      toast.show(
        next
          ? t('admin.inventoryHealth.discontinuedDone', { defaultValue: 'Product marked discontinued.' })
          : t('admin.inventoryHealth.restoredDone', { defaultValue: 'Product restored.' }),
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

  return (
    <div style={{ minHeight: '100%', background: '#f6f7f9' }} className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              {t('admin.inventoryHealth.title', { defaultValue: 'Inventory Health' })}
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              {t('admin.inventoryHealth.subtitle', {
                defaultValue: 'Every size running low or out — its cover, trend, stock at risk, and what to make next.',
              })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            {/* Real / virtual inventory view — China stock = virtual (display-only).
                Pill-segmented control: padded container + a rounded active pill. */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
              {(['all', 'real', 'virtual'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setInventory(v)}
                  aria-pressed={inventory === v}
                  className={`rounded-lg px-4 py-1 text-sm font-semibold transition ${
                    inventory === v
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
                  }`}
                >
                  {t(`admin.inventoryHealth.inv.${v}`, {
                    defaultValue: v === 'all' ? 'All stock' : v === 'real' ? 'Real' : 'Virtual',
                  })}
                </button>
              ))}
            </div>
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
            {/* KPI cards. The three urgency cards double as filters (re-click the
                active one to clear); "To make" is the roll-up total. */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label={t('admin.inventoryHealth.chip.out', { defaultValue: 'Out of stock' })}
                value={kpis.outOfStock}
                dot={RED}
                active={filter === 'out'}
                onClick={() => setFilter(filter === 'out' ? 'all' : 'out')}
                t={t}
              />
              <StatCard
                label={t('admin.inventoryHealth.chip.critical', { defaultValue: 'Critical' })}
                value={kpis.critical}
                dot={RED}
                active={filter === 'critical'}
                onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}
                t={t}
              />
              <StatCard
                label={t('admin.inventoryHealth.chip.watch', { defaultValue: 'Watch' })}
                value={kpis.watch}
                dot={AMBER}
                active={filter === 'watch'}
                onClick={() => setFilter(filter === 'watch' ? 'all' : 'watch')}
                t={t}
              />
              <StatCard
                label={t('admin.inventoryHealth.toMake', { defaultValue: 'To make' })}
                value={kpis.unitsToMake}
                unit={t('admin.inventoryHealth.headlineUnits', { defaultValue: 'units' })}
              />
            </div>

            {/* Search (left) + pager (right) */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-72">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={t('admin.inventoryHealth.search', { defaultValue: 'Search style, size or name…' })}
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-700 shadow-sm outline-none focus:border-neutral-300"
                />
              </div>
              <span className="shrink-0 text-xs text-neutral-400 tabular-nums">
                {t('admin.inventoryHealth.styleCount', { defaultValue: '{{n}} styles', n: total })}
              </span>
            </div>

            {/* No parent column header — each style card's summary row is
                self-labeling; sorting lives on the child sub-header. */}
            {/* Each style is its own card, separated by a gap. */}
            {total === 0 ? (
              <div style={CARD_SHELL} className="px-4 py-12 text-center text-sm text-neutral-400">
                {t('admin.inventoryHealth.empty', { defaultValue: 'Nothing matches this filter.' })}
              </div>
            ) : (
              <div className="space-y-3">
                {styles.map((style) => {
                  // Default: auto-expand the act-now tiers (out / critical); the
                  // less-urgent Watch styles stay collapsed. A manual toggle wins.
                  const isOpen =
                    openState[style.styleKey] ??
                    (style.worstUrgency === 'out' || style.worstUrgency === 'critical');
                  return (
                    <StyleGroup
                      key={style.styleKey}
                      style={style}
                      imageUrl={(style.imageUrl && signed[style.imageUrl]) || null}
                      dates={trendDates}
                      open={isOpen}
                      onToggle={() => setOpenState((s) => ({ ...s, [style.styleKey]: !isOpen }))}
                      onOpen={() => openStyle(style.linkedStyleId)}
                      canManage={canManage}
                      onRequestDiscontinue={(styleKey, next) => setConfirmDisc({ styleKey, next })}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSort}
                      t={t}
                    />
                  );
                })}
              </div>
            )}

            {/* Infinite-scroll sentinel: entering the viewport fetches the next page.
                On a fetch error the observer can't self-retry (sentinel stays in
                view), so show a manual Retry instead of stalling silently. */}
            {styles.length < total && (
              <div ref={sentinelRef} className="mt-4 py-4 text-center text-xs text-neutral-400">
                {loadMoreError ? (
                  <button
                    type="button"
                    onClick={() => loadMore()}
                    className="font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
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
            ? t('admin.inventoryHealth.discontinueTitle', { defaultValue: 'Mark product discontinued?' })
            : t('admin.inventoryHealth.restoreTitle', { defaultValue: 'Restore product?' })
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
            ? t('admin.inventoryHealth.discontinueConfirm', { defaultValue: 'Discontinue' })
            : t('admin.inventoryHealth.restoreConfirm', { defaultValue: 'Restore' })
        }
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        onConfirm={onConfirmDiscontinue}
        onCancel={() => setConfirmDisc(null)}
      />
    </div>
  );
}

/** KPI card. The three urgency cards are clickable filters (active = ring +
 *  emphasised border); the "to make" roll-up is informational (no onClick).
 *  Uses the shared admin CARD_SHELL so it matches the other analytics screens. */
function StatCard({
  label,
  value,
  unit,
  dot,
  active,
  onClick,
  t,
}: {
  label: string;
  value: number;
  unit?: string;
  dot?: string;
  active?: boolean;
  onClick?: () => void;
  t?: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  const clickable = !!onClick;
  return (
    <div
      {...(clickable
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-pressed': !!active,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      style={{ ...CARD_SHELL, padding: '14px 16px', borderColor: active ? INK : '#EFEDEB' }}
      className={`flex flex-col transition ${
        clickable ? 'cursor-pointer hover:border-neutral-400' : 'cursor-default'
      } ${active ? 'ring-1 ring-neutral-900' : ''}`}
    >
      <span
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: LABEL_GREY }}
      >
        {dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} />}
        {label}
      </span>
      <span className="mt-2 tabular-nums" style={{ color: INK, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>
        {fmtN(value)}
        {unit && (
          <span className="ml-1 text-sm font-medium" style={{ color: MUTED }}>
            {unit}
          </span>
        )}
      </span>
      {clickable && active && (
        <span className="mt-1.5 text-[10px] font-medium" style={{ color: NEUTRAL_DOT }}>
          {t?.('admin.inventoryHealth.filtering', { defaultValue: 'filtering · click to clear' })}
        </span>
      )}
    </div>
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
      className={`flex items-center gap-1 uppercase tracking-[inherit] transition hover:text-neutral-700 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
      style={{ color: activeSort ? INK : 'inherit', letterSpacing: 'inherit' }}
    >
      {label}
      <Icon size={12} style={{ color: activeSort ? INK : MUTED }} />
    </button>
  );
}

/** Per-channel listing chips on the style header. Myntra links out (confirmed
 *  pattern: the path acts as a search that lands on the listing); Shopify /
 *  Only channels with a real ERP listing URL (StyleChannelListing.listingUrl via
 *  linkedStyleId) are shown; a style with no real link shows nothing. */
function ChannelChips({ links }: { links: { channel: string; url: string }[] }): ReactNode {
  if (!links.length) return null;
  const base =
    'inline-flex items-center gap-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-700 hover:bg-neutral-100';
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
          className={base}
        >
          {l.channel}
          <ArrowUpRight size={10} className="text-neutral-400" />
        </a>
      ))}
    </span>
  );
}

function UrgencyPill({ urgency }: { urgency: Urgency }): ReactNode {
  const u = URG[urgency];
  // Neutral chrome; the dot carries the meaning-colour (red/amber/grey).
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold text-neutral-600"
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: u.dot }} />
      {u.label}
    </span>
  );
}

/** A style group — an expandable parent summary row over its at-risk size rows.
 *  The whole parent row toggles expand; the code opens the style workspace. */
function StyleGroup({
  style,
  imageUrl,
  dates,
  open,
  onToggle,
  onOpen,
  canManage,
  onRequestDiscontinue,
  sortKey,
  sortDir,
  onSort,
  t,
}: {
  style: InventoryStyle;
  imageUrl: string | null;
  dates: string[];
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  canManage: boolean;
  onRequestDiscontinue: (styleKey: string, next: boolean) => void;
  sortKey: SortKey | null;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  const linked = style.linkedStyleId != null;
  const codeColor = style.lowVolume ? 'text-neutral-500' : 'text-neutral-900';
  const norm = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normName = norm(style.name ?? '');
  const showName =
    !!normName && normName !== norm(style.styleKey) && !style.sizes.some((z) => norm(z.sku) === normName);
  // Sizes soonest-to-run-out first within the group.
  const cover = (z: InventorySize): number => z.coverDays ?? Number.POSITIVE_INFINITY;
  const sizes = [...style.sizes].sort((a, b) => cover(a) - cover(b));
  return (
    // Each style is its own card; the whole parent row toggles expansion.
    <div
      className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition ${
        style.discontinued ? 'opacity-60' : ''
      }`}
    >
      {/* Parent summary row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer items-center gap-3 bg-white px-4 py-4 transition hover:bg-neutral-50/70"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Boxed ± toggle (matches the reference master–detail control). */}
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700">
            {open ? <Minus size={16} /> : <Plus size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {linked ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  title={t('admin.inventoryHealth.openStyle', { defaultValue: 'Open style workspace' })}
                  className={`inline-flex min-w-0 items-center gap-1 text-[15px] font-semibold ${codeColor} underline decoration-dotted underline-offset-4 hover:decoration-solid`}
                >
                  <span className="truncate">{style.styleKey}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-neutral-400" />
                </button>
              ) : (
                <span className={`truncate text-[15px] font-semibold ${codeColor}`}>{style.styleKey}</span>
              )}
              <UrgencyPill urgency={style.worstUrgency} />
              {style.discontinued && (
                <span className="inline-flex items-center rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                  {t('admin.inventoryHealth.discontinuedBadge', { defaultValue: 'disabled' })}
                </span>
              )}
              {style.lowVolume && (
                <span className="inline-flex items-center rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                  {t('admin.inventoryHealth.lowVolume', { defaultValue: 'low volume' })}
                </span>
              )}
            </div>
            {(showName || style.marketplaceLinks.length > 0) && (
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                {showName && (
                  <span className="truncate font-mono text-[11px]" style={{ color: NEUTRAL_DOT }}>
                    {style.name}
                  </span>
                )}
                <ChannelChips links={style.marketplaceLinks} />
              </div>
            )}
          </div>
        </div>
        {/* Disable / enable action — red for disable. */}
        <div className="shrink-0">
          {canManage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDiscontinue(style.styleKey, !style.discontinued);
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
          )}
        </div>
      </div>

      {/* Children — a navy accent bar marks the nested detail section. */}
      {open && (
        <div className="bg-white" style={{ borderLeft: `4px solid ${ACCENT_BAR}` }}>
          <div
            className="hidden gap-3 border-y border-neutral-200 px-4 py-3 text-[12px] font-semibold lg:grid"
            style={{ gridTemplateColumns: GRID, background: HEADER_BG, color: HEADER_INK }}
          >
            <span>{t('admin.inventoryHealth.col.size', { defaultValue: 'Size' })}</span>
            <SortHeader label={t('admin.inventoryHealth.col.cover', { defaultValue: 'Cover' })} col="cover" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label={t('admin.inventoryHealth.col.drr', { defaultValue: 'DRR · /d' })} col="drr" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <span className="flex justify-end">{t('admin.inventoryHealth.col.trend', { defaultValue: 'Trend · /d' })}</span>
            <SortHeader label={t('admin.inventoryHealth.col.stock', { defaultValue: 'Stock' })} col="stock" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label={t('admin.inventoryHealth.col.atRisk', { defaultValue: 'At risk · /d' })} col="atrisk" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <SortHeader label={t('admin.inventoryHealth.col.make', { defaultValue: 'Make' })} col="make" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
          </div>
          {sizes.map((sz) => (
            <SizeRow key={sz.sku} size={sz} imageUrl={imageUrl} dates={dates} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One at-risk size — a child row: thumbnail + size, then the metric columns. */
function SizeRow({
  size,
  imageUrl,
  dates,
  t,
}: {
  size: InventorySize;
  imageUrl: string | null;
  dates: string[];
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  const u = URG[size.urgency];
  const low = size.confidence === 'low';
  return (
    <div
      className="grid grid-cols-2 items-center gap-y-1 gap-x-3 border-t border-neutral-100 px-4 py-3.5 text-sm transition first:border-t-0 hover:bg-neutral-50/60 lg:grid-cols-[var(--ih-grid)]"
      style={{ ['--ih-grid' as string]: GRID }}
    >
      {/* Size: thumbnail + urgency dot + size + SKU */}
      <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
        <HoverThumbnail src={imageUrl} alt={size.sku} size={40} radius="8px" />
        <span style={{ width: 8, height: 8, borderRadius: 999, background: u.dot }} className="shrink-0" />
        <span className="text-[14px] font-semibold text-neutral-800">{size.size}</span>
        <span className="truncate font-mono text-[11px]" style={{ color: MUTED }}>
          {size.sku}
        </span>
      </div>

      <Cell label={t('admin.inventoryHealth.col.cover', { defaultValue: 'Cover' })}>
        {size.coverDays == null ? (
          <span className="font-semibold" style={{ color: MUTED }}>—</span>
        ) : (
          <span className="font-semibold" style={{ color: u.color }}>
            {t('admin.inventoryHealth.daysLeft', { defaultValue: '{{n}} days left', n: fmtN(size.coverDays) })}
          </span>
        )}
      </Cell>

      {/* DRR — up to 2dp so a 0.03/day slow-mover never rounds to a misleading "0". */}
      <Cell label={t('admin.inventoryHealth.col.drr', { defaultValue: 'DRR' })}>
        <span className="tabular-nums" style={{ color: low ? MUTED : INK }}>
          {low ? '~' : ''}
          {size.drr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </span>
        {low && (
          <span className="ml-1.5 rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            {t('admin.inventoryHealth.lowData', { defaultValue: 'low data' })}
          </span>
        )}
      </Cell>

      <Cell label={t('admin.inventoryHealth.col.trend', { defaultValue: 'Trend · /d' })} align="right">
        <TrendCell data={size.trend ?? []} dates={dates} t={t} />
      </Cell>

      <Cell label={t('admin.inventoryHealth.col.stock', { defaultValue: 'Stock' })} align="right">
        <span className="tabular-nums text-neutral-700">{fmtN(size.currentStock)}</span>
      </Cell>

      <Cell label={t('admin.inventoryHealth.col.atRisk', { defaultValue: 'At risk · /d' })} align="right">
        <span className="tabular-nums" style={{ color: size.atRiskUnitsPerDay >= 0.5 ? INK : MUTED }}>
          {size.atRiskUnitsPerDay >= 0.5
            ? `${size.atRiskUnitsPerDay.toLocaleString('en-IN', { maximumFractionDigits: 1 })}/d`
            : '—'}
        </span>
      </Cell>

      <Cell label={t('admin.inventoryHealth.col.make', { defaultValue: 'Make' })} align="right">
        <span className="font-bold tabular-nums" style={{ color: size.makeQty > 0 ? INK : MUTED }}>
          {fmtN(size.makeQty)}
        </span>
      </Cell>
    </div>
  );
}

/** One data cell — inline column label on small screens; right-align opt-in. */
function Cell({
  label,
  align = 'left',
  children,
}: {
  label: string;
  align?: 'left' | 'right';
  children: ReactNode;
}): ReactNode {
  const right = align === 'right';
  return (
    <div className={`flex items-center justify-between ${right ? 'lg:justify-end' : 'lg:block lg:justify-start'}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 lg:hidden">{label}</span>
      <span className="flex items-center">{children}</span>
    </div>
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
        className="inline-block w-[92px] shrink-0"
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
