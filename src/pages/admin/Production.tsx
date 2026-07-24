import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Factory, Loader2, Search, X } from 'lucide-react';
import { QueueTabs } from '@/components/styles/StyleQueueTable';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import StartProductionDialog, {
  type StartProductionTarget,
} from '@/components/production/StartProductionDialog';
import RecordOutputDialog from '@/components/production/RecordOutputDialog';
import {
  ADVANCEABLE_STATUSES,
  advanceBatch,
  cancelBatch,
  completeBatch,
  createBatch,
  getBatches,
  type BatchOrigin,
  type BatchStatus,
  type CreateBatchBody,
  type ProductionBatch,
  type ProductionKpis,
} from '@/api/production';
import { getInventoryHealth, type InventoryStyle } from '@/api/inventoryHealth';
import { UrgencyPill } from '@/pages/admin/InventoryHealth';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/auth';
import { useDebounced } from '@/lib/useDebounced';
import {
  hasAnyRole,
  PRODUCTION_CANCEL_ROLES,
  PRODUCTION_WRITE_ROLES,
} from '@/lib/userRoles';

type Tab = 'to_start' | 'in_production' | 'completed';

const PAGE_SIZE = 50;

/** Grid template shared by the header, the batch rows, and the size sub-rows. */
const BATCH_GRID =
  'grid grid-cols-[22px_minmax(0,1.4fr)_96px_minmax(0,1fr)_70px_90px_140px_78px_180px] items-center gap-3 px-4';

type T = ReturnType<typeof useTranslation>['t'];

function statusLabel(t: T, status: BatchStatus): string {
  return t(`admin.production.status.${status}`, {
    defaultValue: status.charAt(0).toUpperCase() + status.slice(1),
  });
}

/** Amber past a week — a batch sitting in one stage is the thing to spot. */
function ageTone(days: number): string {
  return days >= 7 ? 'text-amber-600 font-semibold' : 'text-[var(--color-muted-foreground)]';
}

/** Cover-day colour, matching StartProductionDialog: red = reorder now. */
/** IH's rule: show the SKU-derived name only when it adds information — not
 *  when it is just the styleKey with a size suffix (e.g. "NOWIMPA1082 30",
 *  which normalises to the NOWIMPA1082_30 SKU code). */
function cleanName(
  name: string | null,
  styleKey: string | null,
  skus: string[],
): string | null {
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n = norm(name ?? '');
  if (!n) return null;
  if (styleKey && n === norm(styleKey)) return null;
  if (skus.some((sku) => norm(sku) === n)) return null;
  return name;
}
function meaningfulName(style: InventoryStyle): string | null {
  return cleanName(style.name, style.styleKey, style.sizes.map((z) => z.sku));
}

function coverTone(days: number | null): string {
  if (days == null) return 'text-[var(--color-muted-foreground)]';
  if (days < 7) return 'text-[var(--color-destructive)]';
  if (days <= 15) return 'text-amber-600';
  return 'text-[var(--color-muted-foreground)]';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export default function Production() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasAnyRole(user, PRODUCTION_WRITE_ROLES);
  const canCancel = hasAnyRole(user, PRODUCTION_CANCEL_ROLES);

  // Opens on the queue, not the backlog: the first question is "what should
  // I start?", and that tab is the forecast's own priority order.
  const [tab, setTab] = useState<Tab>('to_start');
  const [search, setSearch] = useState('');
  // Every keystroke would otherwise fire a request, and slow responses can land
  // out of order and render a stale result set.
  const debouncedSearch = useDebounced(search, 300);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryStyle[]>([]);
  const [kpis, setKpis] = useState<ProductionKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);
  /** RAW rows fetched (pre client-side trim) — what the "more pages?" test uses. */
  const [loaded, setLoaded] = useState(0);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BatchStatus | ''>('');
  const [originFilter, setOriginFilter] = useState<BatchOrigin | ''>('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [expandedStyles, setExpandedStyles] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const [startTarget, setStartTarget] = useState<StartProductionTarget | null>(null);
  const [outputTarget, setOutputTarget] = useState<ProductionBatch | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProductionBatch | null>(null);

  const loadKpis = useCallback(async () => {
    // Board-level figures live on the batches endpoint; `take: 1` because we
    // only want the KPI block, not another page of rows.
    const res = await getBatches({ take: 1 });
    setKpis(res.kpis);
  }, []);

  const fetchPage = useCallback(
    async (skip: number) => {
      if (tab === 'to_start') {
        const res = await getInventoryHealth({
          skip,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
        });
        return {
          styles: res.styles.filter((x) => x.sizes.some((z) => z.makeQty > 0)),
          batches: [] as ProductionBatch[],
          raw: res.styles.length,
          total: res.total,
          kpis: null,
        };
      }
      const res = await getBatches({
        tab,
        status: statusFilter || undefined,
        origin: originFilter || undefined,
        search: debouncedSearch || undefined,
        skip,
        take: PAGE_SIZE,
      });
      return {
        styles: [] as InventoryStyle[],
        batches: res.rows,
        raw: res.rows.length,
        total: res.total,
        kpis: res.kpis,
      };
    },
    [tab, debouncedSearch, statusFilter, originFilter],
  );

  const reqRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setLoadMoreError(false);
    const my = ++reqRef.current;
    try {
      const d = await fetchPage(0);
      if (reqRef.current !== my) return;
      setSuggestions(d.styles);
      setBatches(d.batches);
      setLoaded(d.raw);
      setTotal(d.total);
      if (d.kpis) setKpis(d.kpis);
    } catch {
      if (reqRef.current === my) setError(true);
    } finally {
      if (reqRef.current === my) setLoading(false);
    }
  }, [fetchPage]);

  // Append the next page when the sentinel scrolls into view.
  const loadMore = useCallback(() => {
    // Synchronous ref guard: two observer fires in one commit read the same
    // stale state, so gate on a ref that flips immediately.
    if (loading || loadingMoreRef.current || loaded >= total) return;
    loadingMoreRef.current = true;
    const my = reqRef.current;
    setLoadMoreError(false);
    fetchPage(loaded)
      .then((d) => {
        if (reqRef.current !== my) return; // query changed mid-flight
        setSuggestions((prev) => [...prev, ...d.styles]);
        setBatches((prev) => [...prev, ...d.batches]);
        setLoaded((prev) => prev + d.raw);
        setTotal(d.total);
      })
      .catch(() => {
        // The sentinel stays intersecting, so the observer won't auto-retry —
        // surface a Retry instead of stalling silently.
        if (reqRef.current === my) setLoadMoreError(true);
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  }, [fetchPage, loading, loaded, total]);

  const loadMoreRef = useRef<() => void>(() => {});
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);
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


  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  const refresh = useCallback(async () => {
    await Promise.all([load(), loadKpis()]);
  }, [load, loadKpis]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch {
      // Without this every mutation failed silently: the controlled <select>
      // just snapped back and the dialogs stayed open with no explanation.
      toast.show(
        t('admin.production.actionFailed', {
          defaultValue: "That didn't go through. Refresh and try again.",
        }),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const onStart = (body: CreateBatchBody) =>
    run(async () => {
      await createBatch(body);
      setStartTarget(null);
    });

  const onRecordOutput = (items: { sku: string; qtyProduced: number }[], reason?: string) => {
    const target = outputTarget;
    if (!target) return;
    return run(async () => {
      await completeBatch(target.id, items, reason);
      setOutputTarget(null);
    });
  };

  const tabs = useMemo(
    () => [
      {
        key: 'to_start' as const,
        label: t('admin.production.tabs.toStart', { defaultValue: 'To start' }),
        // Only trustworthy once every page is in: the makeQty trim is
        // client-side, so a partial load would understate the backlog.
        count: loaded >= total ? suggestions.length : undefined,
      },
      {
        key: 'in_production' as const,
        label: t('admin.production.tabs.inProduction', { defaultValue: 'In production' }),
        count: kpis?.inProductionBatches,
      },
      {
        key: 'completed' as const,
        label: t('admin.production.tabs.completed', { defaultValue: 'Completed' }),
      },
    ],
    [t, suggestions.length, loaded, total, kpis],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('admin.production.title', { defaultValue: 'Production pipeline' })}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {t('admin.production.subtitle', {
              defaultValue: 'Batches started from the Inventory Health forecast.',
            })}
          </p>
        </div>
        {canWrite && tab !== 'to_start' && (
          <Button size="sm" onClick={() => setTab('to_start')}>
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.startCta', { defaultValue: 'Start production' })}
            </span>
          </Button>
        )}
      </div>

      <KpiRow kpis={kpis} />

      <QueueTabs tabs={tabs} active={tab} onSelect={setTab} />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.production.searchPlaceholder', {
              defaultValue: 'Search styles, batches, or SKUs…',
            })}
          />
        </div>
        {search && (
          <Button variant="outline" size="sm" onClick={() => setSearch('')}>
            <X size={14} />
          </Button>
        )}
        {tab !== 'to_start' && (
          <>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BatchStatus | '')}
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              aria-label={t('admin.production.filterStatus', { defaultValue: 'Status' })}
            >
              <option value="">
                {t('admin.production.statusAll', { defaultValue: 'Status: All' })}
              </option>
              {(tab === 'completed'
                ? (['completed', 'dispatched'] as BatchStatus[])
                : ADVANCEABLE_STATUSES.filter((x) => x !== 'dispatched')
              ).map((x) => (
                <option key={x} value={x}>
                  {statusLabel(t, x)}
                </option>
              ))}
              <option value="cancelled">{statusLabel(t, 'cancelled')}</option>
            </select>
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value as BatchOrigin | '')}
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              aria-label={t('admin.production.filterOrigin', { defaultValue: 'Origin' })}
            >
              <option value="">
                {t('admin.production.originAll', { defaultValue: 'Origin: All' })}
              </option>
              <option value="forecast">
                {t('admin.production.originForecast', { defaultValue: 'From forecast' })}
              </option>
              <option value="style">
                {t('admin.production.originStyle', { defaultValue: 'From style' })}
              </option>
            </select>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 size={15} className="animate-spin" />
          {t('common.loading', { defaultValue: 'Loading…' })}
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-sm text-[var(--color-destructive)]">
          {t('admin.production.loadError', { defaultValue: "Couldn't load production data." })}
        </div>
      ) : tab === 'to_start' ? (
        <ToStartTable
          styles={suggestions}
          canWrite={canWrite}
          expanded={expandedStyles}
          onToggle={(k) => setExpandedStyles((p) => ({ ...p, [k]: !p[k] }))}
          onStart={(target) => setStartTarget(target)}
        />
      ) : (
        <BatchTable
          rows={batches}
          tab={tab}
          canWrite={canWrite}
          canCancel={canCancel}
          busy={busy}
          expanded={expanded}
          onToggle={(id) => setExpanded((p) => ({ ...p, [id]: !p[id] }))}
          onStage={(b, status) => void run(() => advanceBatch(b.id, status))}
          onComplete={(b) => setOutputTarget(b)}
          onCancel={(b) => setCancelTarget(b)}
        />
      )}

      {!loading && !error && loaded < total && (
        <div ref={sentinelRef} className="py-4 text-center text-sm text-[var(--color-muted-foreground)]">
          {loadMoreError ? (
            <Button variant="outline" size="sm" onClick={() => loadMoreRef.current()}>
              {t('admin.production.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              {t('admin.production.loadingMore', { defaultValue: 'Loading more…' })}
            </span>
          )}
        </div>
      )}

      <StartProductionDialog
        open={startTarget !== null}
        busy={busy}
        target={startTarget}
        onClose={() => setStartTarget(null)}
        onConfirm={onStart}
      />
      <RecordOutputDialog
        open={outputTarget !== null}
        busy={busy}
        batch={outputTarget}
        onClose={() => setOutputTarget(null)}
        onConfirm={onRecordOutput}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        title={t('admin.production.cancel.title', { defaultValue: 'Cancel this batch?' })}
        message={t('admin.production.cancel.message', {
          defaultValue:
            'Batch {{no}} will stop counting toward the forecast immediately. This cannot be undone.',
          no: cancelTarget?.batchNo ?? '',
        })}
        confirmLabel={t('admin.production.cancel.confirm', { defaultValue: 'Cancel batch' })}
        cancelLabel={t('admin.production.cancel.keep', { defaultValue: 'Keep it' })}
        destructive
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (target) {
            void run(() =>
              cancelBatch(
                target.id,
                t('admin.production.cancel.reason', {
                  defaultValue: 'Cancelled from the production board',
                }),
              ),
            );
          }
        }}
      />
    </div>
  );
}

function KpiRow({ kpis }: { kpis: ProductionKpis | null }) {
  const { t } = useTranslation();
  const card = 'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4';
  const label = 'text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]';
  const value = 'mt-2 text-2xl font-bold tracking-tight';

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className={card}>
        <div className={label}>
          {t('admin.production.kpi.openBatches', { defaultValue: 'Open batches' })}
        </div>
        <div className={value}>{kpis?.openBatches ?? '—'}</div>
      </div>
      <div className={card}>
        <div className={label}>
          {t('admin.production.kpi.unitsInPipeline', { defaultValue: 'Units in pipeline' })}
        </div>
        <div className={value}>{kpis?.unitsInPipeline?.toLocaleString() ?? '—'}</div>
        {/* Split by origin: "counting toward forecast" is only true for the
            forecast share — a style-origin batch may have no forecast row at all. */}
        {kpis && (
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {t('admin.production.kpi.originSplit', {
              defaultValue: '{{f}} forecast · {{s}} style',
              f: kpis.unitsByOrigin.forecast,
              s: kpis.unitsByOrigin.style,
            })}
          </div>
        )}
      </div>
      <div className={card}>
        <div className={label}>
          {t('admin.production.kpi.completedThisWeek', { defaultValue: 'Completed this week' })}
        </div>
        <div className={value}>{kpis?.completedThisWeek?.toLocaleString() ?? '—'}</div>
      </div>
      <div className={card}>
        <div className={label}>
          {t('admin.production.kpi.avgBatchAge', { defaultValue: 'Avg batch age' })}
        </div>
        <div className={value}>
          {kpis?.avgBatchAgeDays != null ? `${kpis.avgBatchAgeDays}d` : '—'}
        </div>
      </div>
    </div>
  );
}

function ToStartTable({
  styles,
  canWrite,
  expanded,
  onToggle,
  onStart,
}: {
  styles: InventoryStyle[];
  canWrite: boolean;
  expanded: Record<string, boolean>;
  onToggle: (styleKey: string) => void;
  onStart: (target: StartProductionTarget) => void;
}) {
  const { t } = useTranslation();
  const head =
    'text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]';
  // One template for the header and every row, so the columns line up.
  const ROW = 'flex items-center gap-4 px-4';

  if (styles.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        {t('admin.production.toStartEmpty', {
          defaultValue: 'Nothing needs making \u2014 every size has enough cover.',
        })}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header row \u2014 names every column below. */}
      <div className={`${ROW} border-b border-[var(--color-border)] bg-[var(--color-surface-2)] py-2.5`}>
        <span className="w-4 shrink-0" />
        <span className="w-10 shrink-0" />
        <span className={`flex-1 ${head}`}>{t('admin.production.style', { defaultValue: 'Style' })}</span>
        <span className={`w-24 ${head}`}>{t('admin.production.sizes', { defaultValue: 'Sizes' })}</span>
        <span className={`w-16 text-right ${head}`}>{t('admin.production.stock', { defaultValue: 'Stock' })}</span>
        <span className={`w-16 text-right ${head}`}>{t('admin.production.drr', { defaultValue: 'DRR/d' })}</span>
        <span className={`w-20 text-right ${head}`}>{t('admin.production.toMake', { defaultValue: 'To make' })}</span>
        <span className={`w-16 text-right ${head}`}>{t('admin.production.cover', { defaultValue: 'Cover' })}</span>
        {canWrite && <span className="w-[188px] shrink-0" />}
      </div>

      {styles.map((s) => {
        const needing = s.sizes.filter((z) => z.makeQty > 0);
        const covers = s.sizes.map((z) => z.coverDays).filter((c): c is number => c != null);
        const totalStock = s.sizes.reduce((a, z) => a + z.currentStock, 0);
        const totalDrr = s.sizes.reduce((a, z) => a + z.drr, 0);
        const isOpen = !!expanded[s.styleKey];
        return (
          <div key={s.styleKey} className="border-b border-[var(--color-border)] last:border-b-0">
            {/* Whole row toggles the breakdown; the CTA stops propagation. */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => onToggle(s.styleKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(s.styleKey);
                }
              }}
              className={`${ROW} cursor-pointer py-3 hover:bg-[var(--color-surface-2)]/50`}
            >
              <ChevronRight
                size={16}
                className={`w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
              <HoverThumbnail src={s.imageUrl} alt={s.name ?? s.styleKey} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {s.erpStyleId ?? s.styleKey}
                  </span>
                  <UrgencyPill urgency={s.worstUrgency} />
                </div>
                {meaningfulName(s) && (
                  <div className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
                    {meaningfulName(s)}
                  </div>
                )}
              </div>
              <div className="w-24 text-xs text-[var(--color-muted-foreground)]">
                {t('admin.production.sizesNeeding', {
                  defaultValue: '{{n}} of {{total}} sizes',
                  n: needing.length,
                  total: s.sizes.length,
                })}
              </div>
              <div className="w-16 text-right text-sm">{totalStock}</div>
              <div className="w-16 text-right text-sm text-[var(--color-muted-foreground)]">
                {totalDrr.toFixed(1)}
              </div>
              <div className="w-20 text-right text-base font-bold">{s.makeTotal}</div>
              <div
                className={`w-16 text-right text-sm font-semibold ${coverTone(covers.length > 0 ? Math.min(...covers) : null)}`}
              >
                {covers.length > 0 ? `${Math.min(...covers).toFixed(1)}d` : '\u2014'}
              </div>
              {canWrite && (
                <div className="w-[188px] shrink-0">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStart({
                        origin: 'forecast',
                        styleKey: s.styleKey,
                        styleId: s.linkedStyleId ?? undefined,
                        styleRef: s.erpStyleId,
                        name: meaningfulName(s),
                        imageUrl: s.imageUrl,
                        worstCoverDays: covers.length > 0 ? Math.min(...covers) : null,
                        drr: totalDrr,
                        totalStock,
                        sizes: s.sizes.map((z) => ({
                          sku: z.sku,
                          size: z.size,
                          suggestedQty: z.makeQty,
                          coverDays: z.coverDays,
                          currentStock: z.currentStock,
                        })),
                      });
                    }}
                  >
                    {t('admin.production.addToPipeline', {
                      defaultValue: 'Add to production pipeline',
                    })}
                  </Button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-3 pl-14">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className={head}>
                      <th className="py-1.5 text-left">{t('admin.production.size', { defaultValue: 'Size' })}</th>
                      <th className="py-1.5 text-left">SKU</th>
                      <th className="py-1.5 text-right">{t('admin.production.suggested', { defaultValue: 'Suggested' })}</th>
                      <th className="py-1.5 text-right">{t('admin.production.cover', { defaultValue: 'Cover' })}</th>
                      <th className="py-1.5 text-right">{t('admin.production.stock', { defaultValue: 'Stock' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.sizes.map((z) => (
                      <tr key={z.sku} className="border-t border-[var(--color-border)]/50">
                        <td className="py-1.5 font-semibold">{z.size}</td>
                        <td className="py-1.5 font-mono text-xs text-[var(--color-muted-foreground)]">{z.sku}</td>
                        <td className="py-1.5 text-right font-semibold">{z.makeQty}</td>
                        <td className={`py-1.5 text-right font-semibold ${coverTone(z.coverDays)}`}>
                          {z.coverDays != null ? `${z.coverDays.toFixed(1)}d` : '\u2014'}
                        </td>
                        <td className="py-1.5 text-right text-[var(--color-muted-foreground)]">{z.currentStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BatchTable({
  rows,
  tab,
  canWrite,
  canCancel,
  busy,
  expanded,
  onToggle,
  onStage,
  onComplete,
  onCancel,
}: {
  rows: ProductionBatch[];
  tab: Tab;
  canWrite: boolean;
  canCancel: boolean;
  busy: boolean;
  expanded: Record<number, boolean>;
  onToggle: (id: number) => void;
  onStage: (batch: ProductionBatch, status: BatchStatus) => void;
  onComplete: (batch: ProductionBatch) => void;
  onCancel: (batch: ProductionBatch) => void;
}) {
  const { t } = useTranslation();
  const head =
    'text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]';

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        {t('admin.production.empty', { defaultValue: 'No batches here yet.' })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="min-w-[1040px]">
        <div
          className={`${BATCH_GRID} border-b border-[var(--color-border)] bg-[var(--color-surface-2)] py-2.5`}
        >
          <div />
          <div className={head}>{t('admin.production.style', { defaultValue: 'Style' })}</div>
          <div className={head}>{t('admin.production.batch', { defaultValue: 'Batch' })}</div>
          <div className={head}>{t('admin.production.sizes', { defaultValue: 'Sizes' })}</div>
          <div className={`${head} text-right`}>
            {t('admin.production.planned', { defaultValue: 'Planned' })}
          </div>
          <div className={`${head} text-right`}>
            {tab === 'completed'
              ? t('admin.production.produced', { defaultValue: 'Produced' })
              : t('admin.production.suggested', { defaultValue: 'Suggested' })}
          </div>
          <div className={head}>{t('admin.production.stage', { defaultValue: 'Stage' })}</div>
          <div className={head}>
            {t('admin.production.inStatus', { defaultValue: 'In status' })}
          </div>
          <div className={head}>{t('admin.production.started', { defaultValue: 'Started' })}</div>
        </div>

        {rows.map((b) => {
          const isOpen = !!expanded[b.id];
          return (
            <div key={b.id} className="border-b border-[var(--color-border)] last:border-b-0">
              <div className={`${BATCH_GRID} py-3 hover:bg-[var(--color-surface-2)]/50`}>
                <button
                  type="button"
                  onClick={() => onToggle(b.id)}
                  aria-expanded={isOpen}
                  aria-label={t('admin.production.toggleSizes', {
                    defaultValue: 'Show size breakdown',
                  })}
                  className="text-[var(--color-muted-foreground)]"
                >
                  <ChevronRight
                    size={16}
                    className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                <div className="flex min-w-0 items-center gap-3">
                  <HoverThumbnail src={b.imageUrl} alt={b.styleRef ?? b.styleKey ?? b.batchNo} size={40} />
                  {(() => {
                    const nm = cleanName(b.name, b.styleKey, b.sizes.map((z) => z.sku));
                    return (
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {b.styleRef ??
                            b.styleKey ??
                            t('admin.production.untitled', { defaultValue: 'Untitled style' })}
                        </div>
                        {nm && (
                          <div className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
                            {nm}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                  {b.batchNo}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {b.sizes.slice(0, 3).map((s) => (
                    <span
                      key={s.sku}
                      className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px]"
                    >
                      <span className="font-semibold">{s.size}</span>{' '}
                      <span className="text-[var(--color-muted-foreground)]">{s.qtyPlanned}</span>
                    </span>
                  ))}
                  {b.sizes.length > 3 && (
                    <span className="text-[11px] text-[var(--color-muted-foreground)]">
                      +{b.sizes.length - 3}
                    </span>
                  )}
                </div>

                <div className="text-right text-sm font-semibold">{b.qtyPlanned}</div>

                <div className="text-right text-sm text-[var(--color-muted-foreground)]">
                  {tab === 'completed' ? (
                    (b.qtyProduced ?? '—')
                  ) : (
                    <>
                      {/* "—" not 0: a style-origin batch had no forecast. */}
                      {b.qtySuggested ?? '—'}
                      {b.qtySuggested != null && b.qtyPlanned !== b.qtySuggested && (
                        <div className="mt-0.5 text-[11px] font-semibold text-amber-600">
                          {b.qtyPlanned > b.qtySuggested ? '+' : ''}
                          {b.qtyPlanned - b.qtySuggested}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  {canWrite && tab !== 'completed' ? (
                    <select
                      value={b.status}
                      disabled={busy}
                      onChange={(e) => onStage(b, e.target.value as BatchStatus)}
                      className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                    >
                      {ADVANCEABLE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(t, s)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium">
                      {statusLabel(t, b.status)}
                    </span>
                  )}
                </div>

                <div className={`text-sm ${ageTone(b.daysInStatus)}`}>{b.daysInStatus}d</div>

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs">{fmtDate(b.startedAt)}</div>
                    <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                      {b.createdBy?.name ?? '—'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canWrite && tab !== 'completed' && (
                      <Button size="sm" disabled={busy} onClick={() => onComplete(b)}>
                        {t('admin.production.complete', { defaultValue: 'Complete' })}
                      </Button>
                    )}
                    {canWrite && b.status === 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onStage(b, 'dispatched')}
                      >
                        {t('admin.production.markDispatched', { defaultValue: 'Mark dispatched' })}
                      </Button>
                    )}
                    {canCancel && b.status !== 'dispatched' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onCancel(b)}
                        aria-label={t('admin.production.cancelBatch', {
                          defaultValue: 'Cancel batch',
                        })}
                      >
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* The expansion IS the detail view — a batch has no other child data. */}
              {isOpen && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-3 pl-12">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className={head}>
                        <th className="py-1.5 text-left">
                          {t('admin.production.size', { defaultValue: 'Size' })}
                        </th>
                        <th className="py-1.5 text-left">SKU</th>
                        <th className="py-1.5 text-right">
                          {t('admin.production.suggested', { defaultValue: 'Suggested' })}
                        </th>
                        <th className="py-1.5 text-right">
                          {t('admin.production.planned', { defaultValue: 'Planned' })}
                        </th>
                        <th className="py-1.5 text-right">
                          {t('admin.production.produced', { defaultValue: 'Produced' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.sizes.map((s) => (
                        <tr key={s.sku} className="border-t border-[var(--color-border)]/50">
                          <td className="py-1.5 font-semibold">{s.size}</td>
                          <td className="py-1.5 font-mono text-xs text-[var(--color-muted-foreground)]">
                            {s.sku}
                          </td>
                          <td className="py-1.5 text-right text-[var(--color-muted-foreground)]">
                            {s.suggestedQty ?? '—'}
                          </td>
                          <td className="py-1.5 text-right font-semibold">{s.qtyPlanned}</td>
                          <td className="py-1.5 text-right">{s.qtyProduced ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(b.notes || b.shortfallReason || b.cancelReason) && (
                    <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                      {b.notes && <div>{b.notes}</div>}
                      {b.shortfallReason && <div>{b.shortfallReason}</div>}
                      {b.cancelReason && <div>{b.cancelReason}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
