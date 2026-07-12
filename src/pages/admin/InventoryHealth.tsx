import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, ChevronRight, ChevronLeft, ChevronDown, Search, ArrowUpDown, ArrowUp, ArrowDown, ArrowUpRight, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { todayISO } from '@/lib/date';
import { useDebounced } from '@/lib/useDebounced';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { CARD_SHELL } from '@/components/admin/kpiPrimitives';
import {
  getInventoryHealth,
  refreshInventoryHealth,
  type InventoryHealthResponse,
  type InventorySize,
  type InventoryStyle,
  type Urgency,
} from '@/api/inventoryHealth';

/** Refresh POSTs a background recompute, then polls GET until `syncing` clears. */
const REFRESH_POLL_MS = 5_000;
const REFRESH_MAX_WAIT_MS = 3 * 60_000;

const NEEDS_ACTION: Urgency[] = ['out', 'critical'];

// ── Neutral palette: colour = meaning only ───────────────────────────────
// Red = act now (out/critical), amber = watch, everything else neutral grey.
const RED = '#DC2626';
const AMBER = '#D97706';
const INK = '#18181B'; // near-black for emphasis
const LABEL_GREY = '#B0AFAE';
const MUTED = '#C4C4C8';
const NEUTRAL_DOT = '#A1A1AA';

/** Per-urgency: label + the meaning-colour (red/amber/neutral) for text + dot. */
const URG: Record<Urgency, { label: string; color: string; dot: string }> = {
  out: { label: 'Out of stock', color: RED, dot: RED },
  critical: { label: 'Critical', color: RED, dot: RED },
  watch: { label: 'Watch', color: AMBER, dot: AMBER },
  healthy: { label: 'Healthy', color: '#52525B', dot: NEUTRAL_DOT },
};

// One grid template shared by the column header + every size row so they align.
// SIZE · COVER · DRR · AT RISK · STOCK · PIPELINE · MAKE
const GRID = 'minmax(0,1.6fr) 0.85fr 0.7fr 1fr 0.75fr 0.85fr 0.85fr';

/** Which style filter is active. Chips map to these; `all` clears the filter. */
type FilterKey = 'all' | 'out' | 'critical' | 'watch' | 'healthy';

/** The urgencies a filter keeps; `all` keeps every style. */
const FILTER_URGENCIES: Record<FilterKey, Urgency[]> = {
  all: ['out', 'critical', 'watch', 'healthy'],
  out: ['out'],
  critical: ['critical'],
  watch: ['watch'],
  healthy: ['healthy'],
};

const PAGE_SIZE = 50;

/** Below this ₹/day, show "—" not a confusing tiny number (slow-tail noise).
 *  Ranking still uses the raw value — this only affects DISPLAY. */
const AT_RISK_MIN = 50;

/** Sortable columns. `null` sortKey = the revenue-at-risk default order. */
type SortKey = 'style' | 'cover' | 'drr' | 'atrisk' | 'stock' | 'pipeline' | 'make';

/** Min coverDays over high-confidence sizes (null cover → +∞) — the "closest to
 *  becoming at-risk next" tie-break among styles that aren't bleeding yet. */
function minCover(s: InventoryStyle): number {
  let min = Number.POSITIVE_INFINITY;
  for (const z of s.sizes) {
    if (z.confidence !== 'high' || z.coverDays == null) continue;
    if (z.coverDays < min) min = z.coverDays;
  }
  return min;
}

/** Per-style aggregate for a sort column (see the coordinator's spec). */
function styleMetric(s: InventoryStyle, key: SortKey): number | string {
  switch (key) {
    case 'style':
      return s.styleKey.toLowerCase();
    case 'cover': {
      // min coverDays across sizes; null (no velocity) = never runs out = last.
      const vals = s.sizes.map((z) => z.coverDays).filter((v): v is number => v != null);
      return vals.length ? Math.min(...vals) : Number.POSITIVE_INFINITY;
    }
    case 'drr':
      return s.sizes.reduce((a, z) => a + z.drr, 0);
    case 'atrisk':
      return s.atRiskRevenuePerDay;
    case 'stock':
      return s.sizes.reduce((a, z) => a + z.currentStock, 0);
    case 'pipeline':
      return s.sizes.reduce((a, z) => a + z.pipelineQty, 0);
    case 'make':
      return s.makeTotal;
  }
}

function fmtRupee(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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

/** Standalone mock so the page renders without the backend (shaped to the contract). */
const MOCK: InventoryHealthResponse = {
  syncedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
  syncing: false,
  kpis: { unitsToMake: 1840, needsAction: 7, outOfStock: 3, critical: 4, watch: 5, healthy: 12, totalStyles: 21, totalSkus: 96 },
  styles: [
    {
      // Highest ₹/day at risk → row 1, even though NW-1042 is more OUT.
      styleKey: 'NW-0987',
      name: 'Oversized Poplin Shirt',
      category: 'Shirt',
      imageUrl: null,
      linkedStyleId: null,
      marketplaceIds: ['MYN-POP-SHRT-9821'],
      marketplaceLinks: [],
      worstUrgency: 'critical',
      makeTotal: 380,
      atRiskUnitsPerDay: 3.3,
      atRiskRevenuePerDay: 3627,
      abcClass: 'A',
      lowVolume: false,
      sizes: [
        { size: 'S', sku: 'NW-0987-S', urgency: 'critical', coverDays: 4, drr: 3.3, sold2d: 7, sold7d: 23, sold30d: 99, confidence: 'high', currentStock: 14, pipelineQty: 0, makeQty: 120, avgPrice: 1099, atRiskUnitsPerDay: 2.4, atRiskRevenuePerDay: 2638 },
        { size: 'M', sku: 'NW-0987-M', urgency: 'watch', coverDays: 9, drr: 5.0, sold2d: 10, sold7d: 35, sold30d: 150, confidence: 'high', currentStock: 46, pipelineQty: 0, makeQty: 140, avgPrice: 1099, atRiskUnitsPerDay: 0.9, atRiskRevenuePerDay: 989 },
        { size: 'L', sku: 'NW-0987-L', urgency: 'watch', coverDays: 13, drr: 2.8, sold2d: 5, sold7d: 20, sold30d: 84, confidence: 'low', currentStock: 38, pipelineQty: 0, makeQty: 120, avgPrice: 1099, atRiskUnitsPerDay: 0, atRiskRevenuePerDay: 0 },
      ],
    },
    {
      styleKey: 'NW-1042',
      name: 'Ribbed Knit Co-ord',
      category: 'Co-ord',
      imageUrl: null,
      linkedStyleId: 1042,
      marketplaceIds: ['MYN-RIB-CO-771', 'NW1042'],
      marketplaceLinks: [{ channel: 'Myntra', url: 'https://www.myntra.com/32168842/buy' }],
      worstUrgency: 'out',
      makeTotal: 640,
      atRiskUnitsPerDay: 3.1,
      atRiskRevenuePerDay: 2477,
      abcClass: 'A',
      lowVolume: false,
      sizes: [
        { size: 'S', sku: 'NW-1042-S', urgency: 'out', coverDays: 0, drr: 6.2, sold2d: 13, sold7d: 44, sold30d: 186, confidence: 'high', currentStock: 0, pipelineQty: 0, makeQty: 220, avgPrice: 799, atRiskUnitsPerDay: 2.0, atRiskRevenuePerDay: 1598 },
        { size: 'M', sku: 'NW-1042-M', urgency: 'critical', coverDays: 3, drr: 8.1, sold2d: 17, sold7d: 57, sold30d: 243, confidence: 'high', currentStock: 24, pipelineQty: 0, makeQty: 260, avgPrice: 799, atRiskUnitsPerDay: 1.1, atRiskRevenuePerDay: 879 },
        { size: 'L', sku: 'NW-1042-L', urgency: 'watch', coverDays: 11, drr: 4.4, sold2d: 9, sold7d: 31, sold30d: 132, confidence: 'high', currentStock: 48, pipelineQty: 0, makeQty: 160, avgPrice: 799, atRiskUnitsPerDay: 0, atRiskRevenuePerDay: 0 },
        { size: 'XL', sku: 'NW-1042-XL', urgency: 'healthy', coverDays: 34, drr: 1.9, sold2d: 2, sold7d: 8, sold30d: 41, confidence: 'low', currentStock: 65, pipelineQty: 0, makeQty: 0, avgPrice: 799, atRiskUnitsPerDay: 0, atRiskRevenuePerDay: 0 },
      ],
    },
    {
      // Not at risk (₹0/day) → sinks below the bleeders; C-tier long tail.
      styleKey: 'NW-0771',
      name: 'Linen Wide-leg Trouser',
      category: 'Bottom',
      imageUrl: null,
      linkedStyleId: 771,
      marketplaceIds: ['MYN-LIN-TRSR-4410', 'NW0771'],
      marketplaceLinks: [],
      worstUrgency: 'watch',
      makeTotal: 0,
      atRiskUnitsPerDay: 0,
      atRiskRevenuePerDay: 0,
      abcClass: 'C',
      lowVolume: true,
      sizes: [
        { size: 'M', sku: 'NW-0771-M', urgency: 'watch', coverDays: 16, drr: 2.1, sold2d: 4, sold7d: 15, sold30d: 63, confidence: 'high', currentStock: 34, pipelineQty: 0, makeQty: 0, avgPrice: 649, atRiskUnitsPerDay: 0, atRiskRevenuePerDay: 0 },
        { size: 'L', sku: 'NW-0771-L', urgency: 'healthy', coverDays: 40, drr: 1.2, sold2d: 2, sold7d: 8, sold30d: 36, confidence: 'high', currentStock: 48, pipelineQty: 0, makeQty: 0, avgPrice: 649, atRiskUnitsPerDay: 0, atRiskRevenuePerDay: 0 },
      ],
    },
  ],
};

export default function InventoryHealth(): ReactNode {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<InventoryHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  // null sortKey = priority (soonest-out-first) default; a column sets asc/desc.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [skip, setSkip] = useState(0);
  // Optional DRR/cover window. Empty = precomputed default (no from/to sent).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const windowActive = !!(dateFrom && dateTo);
  // Seed search from ?q= so it survives navigating into a style and back.
  const [searchText, setSearchText] = useState(() => searchParams.get('q') ?? '');
  const debouncedSearch = useDebounced(searchText, 300);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const initExpanded = useRef(false);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInventoryHealth(windowActive ? dateFrom : undefined, windowActive ? dateTo : undefined)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setUsingMock(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Backend not up → render from the local mock so the page works standalone.
        setData(MOCK);
        setUsingMock(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowActive, dateFrom, dateTo]);

  // Expand needs-action styles on first data arrival; healthy ones stay collapsed.
  useEffect(() => {
    if (!data || initExpanded.current) return;
    initExpanded.current = true;
    const init: Record<string, boolean> = {};
    for (const s of data.styles) if (NEEDS_ACTION.includes(s.worstUrgency)) init[s.styleKey] = true;
    setExpanded(init);
  }, [data]);

  const onRefresh = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const wf = windowActive ? dateFrom : undefined;
      const wt = windowActive ? dateTo : undefined;
      await refreshInventoryHealth();
      const startAt = Date.now();
      let d = await getInventoryHealth(wf, wt);
      while (d.syncing && Date.now() - startAt < REFRESH_MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, REFRESH_POLL_MS));
        try {
          d = await getInventoryHealth(wf, wt);
        } catch {
          continue;
        }
      }
      setData(d);
      setUsingMock(false);
      toast.show(t('admin.inventoryHealth.refreshed', { defaultValue: 'Inventory health refreshed.' }), 'success');
    } catch {
      toast.show(t('admin.inventoryHealth.refreshFailed', { defaultValue: 'Refresh failed. Please try again.' }), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Sign any GCS object paths (v1 imageUrl is usually null → ImageOff fallback).
  const imagePaths = useMemo(() => (data?.styles ?? []).map((s) => s.imageUrl), [data]);
  const signed = useSignedUrls(imagePaths);

  // Keep a style if ANY of its sizes matches the active filter (but keep ALL its
  // sizes so an expanded style shows the full distribution), then rank: an
  // explicit column sort, else the priority (soonest-out-first) default.
  const filteredStyles = useMemo(() => {
    if (!data) return [];
    const q = debouncedSearch.trim().toLowerCase();
    const wanted = FILTER_URGENCIES[filter];
    const rows = data.styles
      .filter((s) => s.sizes.some((sz) => wanted.includes(sz.urgency)))
      .filter(
        (s) =>
          !q ||
          s.styleKey.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.marketplaceIds.some((m) => m.toLowerCase().includes(q)),
      );

    if (sortKey == null) {
      // Default: biggest money-bleeder first (₹/day at risk desc). Ties → more
      // at-risk units, then closest-to-at-risk (minCover asc) so the ₹0 styles
      // sink to the bottom ordered by soonest to become at-risk, then A→Z.
      return rows.sort(
        (a, b) =>
          b.atRiskRevenuePerDay - a.atRiskRevenuePerDay ||
          b.atRiskUnitsPerDay - a.atRiskUnitsPerDay ||
          minCover(a) - minCover(b) ||
          a.styleKey.localeCompare(b.styleKey),
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      const av = styleMetric(a, sortKey);
      const bv = styleMetric(b, sortKey);
      if (typeof av === 'string' || typeof bv === 'string') {
        return dir * String(av).localeCompare(String(bv));
      }
      return dir * (av - bv);
    });
  }, [data, filter, debouncedSearch, sortKey, sortDir]);

  // Reset to page 1 whenever the result set / order changes.
  useEffect(() => {
    setSkip(0);
  }, [filter, debouncedSearch, sortKey, sortDir]);

  const total = filteredStyles.length;
  const pageStyles = filteredStyles.slice(skip, skip + PAGE_SIZE);

  // Click a column header: toggle dir if it's the active one, else switch to it (asc).
  const onSort = (key: SortKey): void => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const kpis = data?.kpis;
  const synced = absTime(data?.syncedAt);
  // Back-target for the style workspace, restoring this page + search.
  const from = `${location.pathname}${location.search}`;

  const openStyle = (style: InventoryStyle): void => {
    if (style.linkedStyleId == null) return;
    navigate(`/styles/${style.linkedStyleId}`, { state: { from } });
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
                defaultValue: 'Per-size stockout forecast and what to make next, grouped by style.',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
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
              loading ? 'animate-pulse bg-amber-400' : usingMock ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
          />
          <span className={usingMock ? 'font-medium text-amber-600' : 'text-neutral-500'}>
            {loading
              ? t('admin.inventoryHealth.loading', { defaultValue: 'Loading…' })
              : usingMock
                ? t('admin.inventoryHealth.mock', {
                    defaultValue: 'Preview data — the inventory-health service isn’t connected yet.',
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

        {/* Body */}
        {loading && !data ? (
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
            {/* Consolidated header: headline + clickable health chips */}
            <div style={{ ...CARD_SHELL, border: '1px solid #EFEDEB' }} className="mb-4">
              <div className="text-[17px] leading-snug text-neutral-700">
                {t('admin.inventoryHealth.headlineMake', { defaultValue: 'Make' })}{' '}
                <span className="font-bold" style={{ color: INK }}>
                  {fmtN(kpis.unitsToMake)}
                </span>{' '}
                {t('admin.inventoryHealth.headlineUnits', { defaultValue: 'units' })}
                <span className="mx-2 text-neutral-300">·</span>
                <span className="font-bold" style={{ color: RED }}>
                  {fmtN(kpis.needsAction)}
                </span>{' '}
                {t('admin.inventoryHealth.headlineNeed', { defaultValue: 'SKUs need action now' })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <HealthChip active={filter === 'out'} onClick={() => setFilter(filter === 'out' ? 'all' : 'out')} dot={RED} n={kpis.outOfStock} label={t('admin.inventoryHealth.chip.out', { defaultValue: 'out' })} />
                <HealthChip active={filter === 'critical'} onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')} dot={RED} n={kpis.critical} label={t('admin.inventoryHealth.chip.critical', { defaultValue: 'critical' })} />
                <HealthChip active={filter === 'watch'} onClick={() => setFilter(filter === 'watch' ? 'all' : 'watch')} dot={AMBER} n={kpis.watch} label={t('admin.inventoryHealth.chip.watch', { defaultValue: 'watch' })} />
                <HealthChip active={filter === 'healthy'} onClick={() => setFilter(filter === 'healthy' ? 'all' : 'healthy')} dot={NEUTRAL_DOT} n={kpis.healthy} label={t('admin.inventoryHealth.chip.healthy', { defaultValue: 'healthy' })} />
                {filter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="ml-1 text-[12px] font-medium text-neutral-400 underline underline-offset-2 hover:text-neutral-700"
                  >
                    {t('admin.inventoryHealth.chip.clear', { defaultValue: 'clear' })}
                  </button>
                )}
              </div>
            </div>

            {/* Search (left) + pager (right) */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:w-72">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={t('admin.inventoryHealth.search', { defaultValue: 'Search style or name…' })}
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-700 shadow-sm outline-none focus:border-neutral-300"
                />
              </div>
              <Pager skip={skip} total={total} onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} onNext={() => setSkip((s) => s + PAGE_SIZE)} t={t} />
            </div>

            {/* Grouped table */}
            <div style={{ ...CARD_SHELL, padding: 0, overflow: 'hidden', border: '1px solid #EFEDEB' }}>
              {/* Sortable column header */}
              <div
                className="hidden gap-3 px-4 py-2.5 text-[11px] uppercase lg:grid"
                style={{ gridTemplateColumns: GRID, background: '#FCFCFB', letterSpacing: '0.08em', color: LABEL_GREY }}
              >
                <SortHeader label={t('admin.inventoryHealth.col.size', { defaultValue: 'Style' })} col="style" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label={t('admin.inventoryHealth.col.cover', { defaultValue: 'Cover' })} col="cover" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label={t('admin.inventoryHealth.col.drr', { defaultValue: 'DRR · /d' })} col="drr" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label={t('admin.inventoryHealth.col.atRisk', { defaultValue: 'Sales at risk · ₹/day' })} col="atrisk" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                <SortHeader label={t('admin.inventoryHealth.col.stock', { defaultValue: 'Stock' })} col="stock" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                <SortHeader label={t('admin.inventoryHealth.col.pipeline', { defaultValue: 'Pipeline' })} col="pipeline" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                <SortHeader label={t('admin.inventoryHealth.col.make', { defaultValue: 'Make' })} col="make" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              </div>

              {total === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-neutral-400">
                  {t('admin.inventoryHealth.empty', { defaultValue: 'Nothing matches this filter.' })}
                </div>
              ) : (
                pageStyles.map((style) => (
                  <StyleGroup
                    key={style.styleKey}
                    style={style}
                    imageUrl={(style.imageUrl && signed[style.imageUrl]) || null}
                    open={expanded[style.styleKey] ?? false}
                    onToggle={() =>
                      setExpanded((e) => ({ ...e, [style.styleKey]: !(e[style.styleKey] ?? false) }))
                    }
                    onOpenStyle={() => openStyle(style)}
                    t={t}
                  />
                ))
              )}
            </div>

            {/* Bottom pager mirror — saves a scroll back up after a full page. */}
            {total > PAGE_SIZE && (
              <div className="mt-4 flex justify-end">
                <Pager skip={skip} total={total} onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))} onNext={() => setSkip((s) => s + PAGE_SIZE)} t={t} />
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Clickable health chip: coloured dot + count + label; highlighted when active. */
function HealthChip({
  active,
  onClick,
  dot,
  n,
  label,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  n: number;
  label: string;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition ${
        active ? 'border-neutral-800 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
      }`}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
      <span className="font-bold tabular-nums">{fmtN(n)}</span>
      <span>{label}</span>
    </button>
  );
}

/** Clickable column header. Every header shows a faint ArrowUpDown ("sortable");
 *  the active column shows a solid ArrowUp/ArrowDown in the normal text colour. */
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
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 uppercase tracking-[inherit] transition hover:text-neutral-600 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
      style={{ color: activeSort ? INK : 'inherit', letterSpacing: 'inherit' }}
    >
      {label}
      <Icon size={12} style={{ color: activeSort ? INK : MUTED }} />
    </button>
  );
}

/** "Showing X–Y of Z" + prev/next — mirrors the sampling table's pager. */
function Pager({
  skip,
  total,
  onPrev,
  onNext,
  t,
}: {
  skip: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  if (total === 0) return null;
  const to = Math.min(skip + PAGE_SIZE, total);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] tabular-nums text-neutral-500">
        {t('dashboard.table.showing', {
          from: skip + 1,
          to,
          total,
          defaultValue: `Showing ${skip + 1}–${to} of ${total}`,
        })}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('dashboard.table.prevPage', { defaultValue: 'Previous page' })}
          disabled={skip === 0}
          onClick={onPrev}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label={t('dashboard.table.nextPage', { defaultValue: 'Next page' })}
          disabled={skip + PAGE_SIZE >= total}
          onClick={onNext}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/** Revenue-tier chip A/B/C — subtle outlined; A slightly emphasised (the
 *  "critical few"). Neutral by design so it doesn't compete with urgency. */
function AbcChip({ cls }: { cls: 'A' | 'B' | 'C' }): ReactNode {
  const strong = cls === 'A';
  return (
    <span
      title={`Revenue tier ${cls}`}
      className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] font-bold ${
        strong ? 'border-neutral-400 bg-neutral-100 text-neutral-800' : 'border-neutral-200 text-neutral-400'
      }`}
    >
      {cls}
    </span>
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

function StyleGroup({
  style,
  imageUrl,
  open,
  onToggle,
  onOpenStyle,
  t,
}: {
  style: InventoryStyle;
  imageUrl: string | null;
  open: boolean;
  onToggle: () => void;
  onOpenStyle: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}): ReactNode {
  const linked = style.linkedStyleId != null;
  const Chevron = open ? ChevronDown : ChevronRight;
  // Low-volume tiny sellers read as low priority: muted code + a subtle chip.
  const codeColor = style.lowVolume ? 'text-neutral-500' : 'text-neutral-900';
  // Sizes shown soonest-to-run-out first (coverDays asc; null = never = last).
  const cover = (z: InventorySize): number => z.coverDays ?? Number.POSITIVE_INFINITY;
  const sizes = [...style.sizes].sort((a, b) => cover(a) - cover(b));
  return (
    // 8px divider separates style groups for clear visual grouping.
    <div style={{ borderBottom: '8px solid #F4F3F2' }} className="last:border-b-0">
      {/* Header row — the whole row toggles expansion; clicking the code
          navigates to the style workspace when linkedStyleId exists. */}
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
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition"
        style={{ background: '#FBFAF9' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F4F2')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#FBFAF9')}
      >
        <Chevron size={18} className="shrink-0 text-neutral-400" />
        <HoverThumbnail src={imageUrl} alt={style.name} size={52} radius="11px" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {linked ? (
              // Subtle "this opens the style" affordance: dotted underline + arrow.
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStyle();
                }}
                title={t('admin.inventoryHealth.openStyle', { defaultValue: 'Open style workspace' })}
                className={`inline-flex min-w-0 items-center gap-1 text-[16px] font-semibold ${codeColor} underline decoration-dotted underline-offset-4 hover:decoration-solid`}
              >
                <span className="truncate">{style.styleKey}</span>
                <ArrowUpRight size={14} className="shrink-0 text-neutral-400" />
              </button>
            ) : (
              <span className={`truncate text-[16px] font-semibold ${codeColor}`}>{style.styleKey}</span>
            )}
            <AbcChip cls={style.abcClass} />
            {style.lowVolume && (
              <span className="inline-flex items-center rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                {t('admin.inventoryHealth.lowVolume', { defaultValue: 'low volume' })}
              </span>
            )}
            <UrgencyPill urgency={style.worstUrgency} />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs" style={{ color: NEUTRAL_DOT }}>
              {style.name}
            </span>
            <ChannelChips links={style.marketplaceLinks} />
          </div>
        </div>
        {/* Sales-at-risk ₹/DAY — WHY this style ranks where it does. Labelled
            per-day + tooltip so it can't be misread as the item price. */}
        <div
          className="hidden shrink-0 text-right sm:block"
          title={t('admin.inventoryHealth.atRiskTip', {
            defaultValue: 'Sales revenue lost per day this is out of stock — not the item price.',
          })}
        >
          {style.atRiskRevenuePerDay >= AT_RISK_MIN ? (
            <>
              <div className="tabular-nums leading-none" style={{ color: INK, fontSize: 18, fontWeight: 700 }}>
                {t('admin.inventoryHealth.atRiskValue', {
                  defaultValue: '{{amt}}/day at risk',
                  amt: fmtRupee(style.atRiskRevenuePerDay),
                })}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: LABEL_GREY }}>
                {t('admin.inventoryHealth.atRiskUnits', {
                  defaultValue: '(~{{n}} units/day)',
                  n: fmtN(style.atRiskUnitsPerDay),
                })}
              </div>
            </>
          ) : (
            <div className="text-[12px]" style={{ color: MUTED }}>
              {t('admin.inventoryHealth.notAtRisk', { defaultValue: '— not at risk' })}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div style={{ color: INK, fontSize: 22, fontWeight: 700 }} className="tabular-nums leading-none">
            {fmtN(style.makeTotal)}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: LABEL_GREY }}>
            {t('admin.inventoryHealth.toMake', { defaultValue: 'To make' })}
          </div>
        </div>
      </div>

      {/* Size rows — full per-size distribution, regardless of the active filter. */}
      {open && (
        <div className="bg-white">
          {sizes.map((sz) => (
            <SizeRow key={sz.sku} size={sz} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function SizeRow({ size, t }: { size: InventorySize; t: ReturnType<typeof useTranslation>['t'] }): ReactNode {
  const u = URG[size.urgency];
  const low = size.confidence === 'low';
  return (
    <div
      className="grid grid-cols-2 items-center gap-y-1 gap-x-3 border-t border-neutral-100 px-4 py-[13px] text-sm transition first:border-t-0 hover:bg-neutral-50/60 lg:grid-cols-[var(--ih-grid)]"
      style={{ ['--ih-grid' as string]: GRID }}
    >
      {/* Size + coloured urgency dot + SKU (mono) */}
      <div className="flex items-center gap-2">
        <span style={{ width: 8, height: 8, borderRadius: 999, background: u.dot }} className="shrink-0" />
        <span className="text-[14px] font-semibold text-neutral-800">{size.size}</span>
        <span className="truncate font-mono text-xs" style={{ color: MUTED }}>
          {size.sku}
        </span>
      </div>

      {/* Cover — text coloured by status (red out/critical, amber watch, neutral healthy) */}
      <Cell label={t('admin.inventoryHealth.col.cover', { defaultValue: 'Cover' })}>
        {size.coverDays == null ? (
          <span className="font-semibold" style={{ color: MUTED }}>—</span>
        ) : (
          <span className="font-semibold" style={{ color: u.color }}>
            {t('admin.inventoryHealth.daysLeft', { defaultValue: '{{n}} days left', n: fmtN(size.coverDays) })}
          </span>
        )}
      </Cell>

      {/* DRR — bare number (+ LOW DATA badge); "/d" lives in the header */}
      <Cell label={t('admin.inventoryHealth.col.drr', { defaultValue: 'DRR' })}>
        <span className="tabular-nums" style={{ color: low ? MUTED : INK }}>
          {low ? '~' : ''}
          {size.drr.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
        </span>
        {low && (
          <span className="ml-1.5 rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            {t('admin.inventoryHealth.lowData', { defaultValue: 'low data' })}
          </span>
        )}
      </Cell>

      {/* At risk (right) — ₹/day this size bleeds while out; "—" below threshold.
          Tooltip disambiguates it from the item price. */}
      <Cell label={t('admin.inventoryHealth.col.atRisk', { defaultValue: 'Sales at risk · ₹/day' })} align="right">
        <span
          className="tabular-nums"
          style={{ color: size.atRiskRevenuePerDay >= AT_RISK_MIN ? INK : MUTED }}
          title={t('admin.inventoryHealth.atRiskTip', {
            defaultValue: 'Sales revenue lost per day this is out of stock — not the item price.',
          })}
        >
          {size.atRiskRevenuePerDay >= AT_RISK_MIN
            ? t('admin.inventoryHealth.atRiskPerDay', { defaultValue: '{{amt}}/day', amt: fmtRupee(size.atRiskRevenuePerDay) })
            : '—'}
        </span>
      </Cell>

      {/* Stock (right) */}
      <Cell label={t('admin.inventoryHealth.col.stock', { defaultValue: 'Stock' })} align="right">
        <span className="tabular-nums text-neutral-700">{fmtN(size.currentStock)}</span>
      </Cell>

      {/* Pipeline (right) — "—" for now; tooltip explains why */}
      <Cell label={t('admin.inventoryHealth.col.pipeline', { defaultValue: 'Pipeline' })} align="right">
        <span
          className="cursor-help"
          style={{ color: MUTED }}
          title={t('admin.inventoryHealth.pipelineTip', { defaultValue: 'production data not yet connected' })}
        >
          —
        </span>
      </Cell>

      {/* Make (right) — neutral bold when >0, muted grey at 0 */}
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
