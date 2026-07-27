import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Factory, Loader2, Search, X } from 'lucide-react';
import { QueueTabs } from '@/components/styles/StyleQueueTable';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { TruncText } from '@/components/ui/trunc-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import RecordOutputDialog from '@/components/production/RecordOutputDialog';
import SendToProductionDialog from '@/components/production/SendToProductionDialog';
import StartProductionIntakeDialog from '@/components/production/StartProductionIntakeDialog';
import {
  ADVANCEABLE_STATUSES,
  advanceBatch,
  cancelBatch,
  completeBatch,
  createBatch,
  getBatches,
  parkStyle,
  sendToProduction,
  unparkStyle,
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

type Tab = 'to_start' | 'planning' | 'in_production' | 'completed' | 'parked';

const PAGE_SIZE = 50;

/** Grid template shared by the header, the batch rows, and the size sub-rows. */
// Fixed Style column (288px, matching the To-start STYLE_COL) so it never
// stretches with the name; the Sizes column (1fr) absorbs the row's slack.
const BATCH_GRID =
  'grid grid-cols-[22px_256px_92px_minmax(0,1fr)_64px_84px_128px_64px_92px_236px] items-center gap-3 px-4';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = hasAnyRole(user, PRODUCTION_WRITE_ROLES);
  const canCancel = hasAnyRole(user, PRODUCTION_CANCEL_ROLES);

  // Opens on the queue by default ("what should I start?"), but honours ?tab=
  // so other pages can deep-link here — e.g. starting a batch elsewhere lands
  // on the Planning tab, its new home.
  const TABS: Tab[] = ['to_start', 'planning', 'in_production', 'completed', 'parked'];
  const initialTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(
    initialTab && TABS.includes(initialTab) ? initialTab : 'to_start',
  );
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  // Every keystroke would otherwise fire a request, and slow responses can land
  // out of order and render a stale result set.
  const debouncedSearch = useDebounced(search, 300);

  // Mirror the (debounced) search into ?q= so back-navigation restores it —
  // the same system the dashboard Sampling tab and Inventory Health use.
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const q = debouncedSearch.trim();
    if (q) params.set('q', q);
    else params.delete('q');
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [debouncedSearch, searchParams, setSearchParams]);
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

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [outputTarget, setOutputTarget] = useState<ProductionBatch | null>(null);
  const [sendTarget, setSendTarget] = useState<ProductionBatch | null>(null);
  const [stageTarget, setStageTarget] = useState<{ batch: ProductionBatch; status: BatchStatus } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProductionBatch | null>(null);
  const [dropTarget, setDropTarget] = useState<InventoryStyle | null>(null);

  const loadKpis = useCallback(async () => {
    // Board-level figures live on the batches endpoint; `take: 1` because we
    // only want the KPI block, not another page of rows.
    const res = await getBatches({ take: 1 });
    setKpis(res.kpis);
  }, []);

  const fetchPage = useCallback(
    async (skip: number) => {
      if (tab === 'to_start' || tab === 'parked') {
        const res = await getInventoryHealth({
          skip,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          filter: tab === 'parked' ? 'parked' : undefined,
          // Suggested drops any style already in Planning/Production (dedup).
          excludeInProduction: tab === 'to_start',
        });
        const styles =
          tab === 'parked'
            ? res.styles
            : res.styles.filter((x) => !x.discontinued && x.sizes.some((z) => z.makeQty > 0));
        return {
          styles,
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

  // Patch ONE batch into the visible list without a full reload — so a stage
  // change repaints just that row instead of blinking the whole table. If the
  // update takes the batch out of the current tab (completed leaves Planning,
  // cancelled leaves both) it's removed; otherwise replaced in place.
  const applyBatch = useCallback(
    (updated: ProductionBatch) => {
      const inTab =
        tab === 'planning'
          ? updated.status === 'planning'
          : tab === 'completed'
            ? updated.status === 'completed'
            : updated.status === 'cutting' ||
              updated.status === 'stitching' ||
              updated.status === 'finishing';
      setBatches((prev) => {
        if (!inTab) return prev.filter((b) => b.id !== updated.id);
        return prev.some((b) => b.id === updated.id)
          ? prev.map((b) => (b.id === updated.id ? updated : b))
          : [updated, ...prev];
      });
      void loadKpis(); // KPI cards are separate state — updating them can't blink the list
    },
    [tab, loadKpis],
  );

  // A batch mutation that returns the updated batch; patch it in place.
  const runAction = async (fn: () => Promise<ProductionBatch>) => {
    setBusy(true);
    try {
      applyBatch(await fn());
    } catch {
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

  const onStart = (body: CreateBatchBody) => {
    setBusy(true);
    // Direct-to-production opens on the floor; otherwise it lands in Planning.
    const dest: Tab = body.directToProduction ? 'in_production' : 'planning';
    createBatch(body)
      .then(() => {
        setIntakeOpen(false);
        toast.show(
          body.directToProduction
            ? t('admin.production.started', { defaultValue: 'Sent to production.' })
            : t('admin.production.plannedToast', { defaultValue: 'Added to pipeline.' }),
        );
        void loadKpis(); // KPI cards are separate state — refresh after a create.
        setTab(dest);
      })
      .catch(() =>
        toast.show(
          t('admin.production.startFailed', { defaultValue: "Couldn't start production." }),
          'error',
        ),
      )
      .finally(() => setBusy(false));
  };

  // Suggested → Planning: no quantity prompt. Create a planning batch straight
  // from the forecast, seeding qtyPlanned from the make-qty per size.
  const onAddToPlanning = (style: InventoryStyle) => {
    const needing = style.sizes.filter((z) => z.makeQty > 0);
    if (needing.length === 0) return;
    setBusy(true);
    createBatch({
      origin: 'forecast',
      styleKey: style.styleKey,
      styleId: style.linkedStyleId ?? undefined,
      items: needing.map((z) => ({
        sku: z.sku,
        size: z.size,
        qtyPlanned: z.makeQty,
        suggestedQty: z.makeQty,
      })),
    })
      .then(() => {
        // Drop it from Suggested in place, then reveal the Planning tab.
        setSuggestions((prev) => prev.filter((x) => x.styleKey !== style.styleKey));
        toast.show(t('admin.production.plannedToast', { defaultValue: 'Added to pipeline.' }));
        void loadKpis();
        setTab('planning');
      })
      .catch(() =>
        toast.show(
          t('admin.production.startFailed', { defaultValue: "Couldn't add to pipeline." }),
          'error',
        ),
      )
      .finally(() => setBusy(false));
  };

  const onRecordOutput = (items: { sku: string; qtyProduced: number }[], reason?: string) => {
    const target = outputTarget;
    if (!target) return;
    return runAction(async () => {
      const updated = await completeBatch(target.id, items, reason);
      setOutputTarget(null);
      return updated;
    });
  };

  const onSend = (items: { sku: string; qtyPlanned: number }[]) => {
    const target = sendTarget;
    if (!target) return;
    return runAction(async () => {
      const updated = await sendToProduction(target.id, items);
      setSendTarget(null);
      return updated;
    });
  };

  // A stage move (cutting/stitching) captures "how much" and advances.
  const onStageQty = (items: { sku: string; qtyPlanned: number }[]) => {
    const tgt = stageTarget;
    if (!tgt) return;
    return runAction(async () => {
      const updated = await advanceBatch(tgt.batch.id, tgt.status, items);
      setStageTarget(null);
      return updated;
    });
  };

  // Park (Drop) or un-park (Restore) a style, removing the row in place.
  const setParked = async (styleKey: string, parked: boolean) => {
    setBusy(true);
    try {
      await (parked ? parkStyle(styleKey) : unparkStyle(styleKey));
      setSuggestions((prev) => prev.filter((x) => x.styleKey !== styleKey));
    } catch {
      toast.show(
        t('admin.production.parkFailed', { defaultValue: "Couldn't update this style." }),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };
  const onDrop = (styleKey: string) => setParked(styleKey, true);

  const tabs = useMemo(
    () => [
      {
        key: 'to_start' as const,
        label: t('admin.production.tabs.toStart', { defaultValue: 'Suggested' }),
      },
      {
        key: 'planning' as const,
        label: t('admin.production.tabs.planning', { defaultValue: 'Pipeline' }),
      },
      {
        key: 'in_production' as const,
        label: t('admin.production.tabs.inProduction', { defaultValue: 'Production' }),
      },
      {
        key: 'completed' as const,
        label: t('admin.production.tabs.completed', { defaultValue: 'Completed' }),
      },
      {
        key: 'parked' as const,
        label: t('admin.production.tabs.parked', { defaultValue: 'Parked' }),
      },
    ],
    [t],
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
        {canWrite && (
          <Button size="sm" onClick={() => setIntakeOpen(true)}>
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.startCta', { defaultValue: 'Start production' })}
            </span>
          </Button>
        )}
      </div>

      <KpiRow kpis={kpis} onTab={setTab} />

      <QueueTabs tabs={tabs} active={tab} onSelect={setTab} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-primary)]"
          />
          <Input
            className="h-9 text-[13px] pl-9 pr-9 border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.production.searchPlaceholder', {
              defaultValue: 'Search styles, batches, or SKUs…',
            })}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('common.clear', { defaultValue: 'Clear' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              <X size={15} />
            </button>
          )}
        </div>
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
      ) : tab === 'to_start' || tab === 'parked' ? (
        <ToStartTable
          styles={suggestions}
          canWrite={canWrite}
          busy={busy}
          parked={tab === 'parked'}
          expanded={expandedStyles}
          onToggle={(k) => setExpandedStyles((p) => ({ ...p, [k]: !p[k] }))}
          onAddToPlanning={onAddToPlanning}
          onDrop={(style) => setDropTarget(style)}
          onRestore={(k) => void setParked(k, false)}
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
          onStage={(b, status) => {
            // Finishing = the completion step: capture produced qty and mark
            // completed. Other stages just capture "how much" and advance.
            if (status === 'finishing') setOutputTarget(b);
            else setStageTarget({ batch: b, status });
          }}
          onSend={(b) => setSendTarget(b)}
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

      <RecordOutputDialog
        open={outputTarget !== null}
        busy={busy}
        batch={outputTarget}
        onClose={() => setOutputTarget(null)}
        onConfirm={onRecordOutput}
      />
      <SendToProductionDialog
        open={sendTarget !== null}
        busy={busy}
        batch={sendTarget}
        onClose={() => setSendTarget(null)}
        onConfirm={onSend}
      />
      <SendToProductionDialog
        open={stageTarget !== null}
        busy={busy}
        batch={stageTarget?.batch ?? null}
        heading={stageTarget ? statusLabel(t, stageTarget.status) : undefined}
        confirmLabel={
          stageTarget
            ? t('admin.production.moveTo', {
                defaultValue: 'Move to {{stage}}',
                stage: statusLabel(t, stageTarget.status),
              })
            : undefined
        }
        onClose={() => setStageTarget(null)}
        onConfirm={onStageQty}
      />
      <StartProductionIntakeDialog
        open={intakeOpen}
        busy={busy}
        onClose={() => setIntakeOpen(false)}
        onConfirm={onStart}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        title={t('admin.production.cancel.title', { defaultValue: 'Dismiss this batch?' })}
        message={t('admin.production.cancel.message', {
          defaultValue:
            'Batch {{no}} will be dismissed and stop counting toward the forecast immediately. This cannot be undone.',
          no: cancelTarget?.batchNo ?? '',
        })}
        confirmLabel={t('admin.production.cancel.confirm', { defaultValue: 'Dismiss' })}
        cancelLabel={t('admin.production.cancel.keep', { defaultValue: 'Keep it' })}
        destructive
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (target) {
            void runAction(() =>
              cancelBatch(
                target.id,
                t('admin.production.cancel.reason', {
                  defaultValue: 'Dismissed from the production board',
                }),
              ),
            );
          }
        }}
      />
      <ConfirmDialog
        open={dropTarget !== null}
        title={t('admin.production.drop.title', { defaultValue: 'Drop this style?' })}
        message={t('admin.production.drop.message', {
          defaultValue:
            '{{name}} will be parked and removed from the suggested queue. Re-enable it from Inventory Health.',
          name: dropTarget?.erpStyleId ?? dropTarget?.styleKey ?? '',
        })}
        confirmLabel={t('admin.production.drop.confirm', { defaultValue: 'Drop' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        destructive
        onCancel={() => setDropTarget(null)}
        onConfirm={() => {
          const k = dropTarget?.styleKey;
          setDropTarget(null);
          if (k) void onDrop(k);
        }}
      />
    </div>
  );
}

function KpiRow({
  kpis,
  onTab,
}: {
  kpis: ProductionKpis | null;
  onTab: (tab: Tab) => void;
}) {
  const { t } = useTranslation();
  const card =
    'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)]/40';
  const label = 'text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]';
  const value = 'mt-2 text-2xl font-bold tracking-tight';

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <button type="button" className={card} onClick={() => onTab('planning')}>
        <div className={label}>
          {t('admin.production.kpi.planning', { defaultValue: 'In pipeline' })}
        </div>
        <div className={value}>{kpis?.planningBatches ?? '—'}</div>
      </button>
      <button type="button" className={card} onClick={() => onTab('in_production')}>
        <div className={label}>
          {t('admin.production.kpi.inProduction', { defaultValue: 'On the floor' })}
        </div>
        <div className={value}>{kpis?.inProductionBatches ?? '—'}</div>
      </button>
      <button type="button" className={card} onClick={() => onTab('in_production')}>
        <div className={label}>
          {t('admin.production.kpi.unitsInPipeline', { defaultValue: 'Units in pipeline' })}
        </div>
        <div className={value}>{kpis?.unitsInPipeline?.toLocaleString() ?? '—'}</div>
        {kpis && (
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {t('admin.production.kpi.originSplit', {
              defaultValue: '{{f}} forecast · {{s}} style · {{e}} external',
              f: kpis.unitsByOrigin.forecast,
              s: kpis.unitsByOrigin.style,
              e: kpis.unitsByOrigin.external,
            })}
          </div>
        )}
      </button>
      <button type="button" className={card} onClick={() => onTab('completed')}>
        <div className={label}>
          {t('admin.production.kpi.completedThisWeek', { defaultValue: 'Completed this week' })}
        </div>
        <div className={value}>{kpis?.completedThisWeek?.toLocaleString() ?? '—'}</div>
      </button>
      <button type="button" className={card} onClick={() => onTab('in_production')}>
        <div className={label}>
          {t('admin.production.kpi.avgBatchAge', { defaultValue: 'Avg batch age' })}
        </div>
        <div className={value}>
          {kpis?.avgBatchAgeDays != null ? `${kpis.avgBatchAgeDays}d` : '—'}
        </div>
      </button>
    </div>
  );
}

function ToStartTable({
  styles,
  canWrite,
  busy,
  parked,
  expanded,
  onToggle,
  onAddToPlanning,
  onDrop,
  onRestore,
}: {
  styles: InventoryStyle[];
  canWrite: boolean;
  busy: boolean;
  parked?: boolean;
  expanded: Record<string, boolean>;
  onToggle: (styleKey: string) => void;
  onAddToPlanning: (style: InventoryStyle) => void;
  onDrop: (style: InventoryStyle) => void;
  onRestore?: (styleKey: string) => void;
}) {
  const { t } = useTranslation();
  const head =
    'text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]';
  // Even data columns (equal fr) with a bounded Style column; the action column
  // is content-sized. gap-6 before nothing extra — actions get their own left
  // padding so the red Cover isn't crowding the button.
  const ROW =
    'grid grid-cols-[22px_40px_minmax(220px,1.6fr)_1fr_1fr_1fr_1fr_1fr_264px] items-center gap-5 px-4 min-w-[1080px]';

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
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header row \u2014 names every column below. */}
      <div className={`${ROW} border-b border-[var(--color-border)] bg-[var(--color-surface-2)] py-2.5`}>
        <span />
        <span />
        <span className={head}>{t('admin.production.style', { defaultValue: 'Style' })}</span>
        <span className={head}>{t('admin.production.sizes', { defaultValue: 'Sizes' })}</span>
        <span className={`text-right ${head}`}>{t('admin.production.stock', { defaultValue: 'Stock' })}</span>
        <span className={`text-right ${head}`}>{t('admin.production.drr', { defaultValue: 'DRR/d' })}</span>
        <span className={`text-right ${head}`}>{t('admin.production.toMake', { defaultValue: 'To make' })}</span>
        <span className={`text-right ${head}`}>{t('admin.production.cover', { defaultValue: 'Cover' })}</span>
        <span />
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
              <div className="min-w-0">
                <div className="mb-0.5">
                  <UrgencyPill urgency={s.worstUrgency} />
                </div>
                <TruncText text={s.erpStyleId ?? s.styleKey} className="text-sm font-semibold" />
                {meaningfulName(s) && (
                  <TruncText
                    text={meaningfulName(s)!}
                    className="font-mono text-[11px] text-[var(--color-muted-foreground)]"
                  />
                )}
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">
                {t('admin.production.sizesNeeding', {
                  defaultValue: '{{n}} of {{total}} sizes',
                  n: needing.length,
                  total: s.sizes.length,
                })}
              </div>
              <div className="text-right text-sm">{totalStock}</div>
              <div className="text-right text-sm text-[var(--color-muted-foreground)]">
                {totalDrr.toFixed(1)}
              </div>
              <div className="text-right text-base font-bold">{s.makeTotal}</div>
              <div
                className={`text-right text-sm font-semibold ${coverTone(covers.length > 0 ? Math.min(...covers) : null)}`}
              >
                {covers.length > 0 ? `${Math.min(...covers).toFixed(1)}d` : '\u2014'}
              </div>
              <div className="flex items-center justify-end gap-2 pl-2">
                {canWrite && parked && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore?.(s.styleKey);
                    }}
                  >
                    {t('admin.production.restore', { defaultValue: 'Restore' })}
                  </Button>
                )}
                {canWrite && !parked && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToPlanning(s);
                      }}
                    >
                      {t('admin.production.addToPlanning', {
                        defaultValue: 'Add to pipeline',
                      })}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDrop(s);
                      }}
                    >
                      {t('admin.production.drop', { defaultValue: 'Drop' })}
                    </Button>
                  </>
                )}
              </div>
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
                    {/* Only the sizes that need making \u2014 not every SKU on the style. */}
                    {needing.map((z) => (
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
  onSend,
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
  onSend: (batch: ProductionBatch) => void;
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
      <div className="min-w-[1300px]">
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
          <div />
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
                        <TruncText
                          text={
                            b.styleRef ??
                            b.styleKey ??
                            t('admin.production.untitled', { defaultValue: 'Untitled style' })
                          }
                          className="text-sm font-semibold"
                        />
                        {nm && (
                          <TruncText
                            text={nm}
                            className="font-mono text-[11px] text-[var(--color-muted-foreground)]"
                          />
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
                  {canWrite && tab === 'in_production' ? (
                    <select
                      value={b.status}
                      disabled={busy}
                      onChange={(e) => onStage(b, e.target.value as BatchStatus)}
                      className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                    >
                      {(['cutting', 'stitching', 'finishing'] as BatchStatus[]).map((s) => (
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

                <div className="min-w-0">
                  <div className="truncate text-xs">{fmtDate(b.startedAt)}</div>
                  <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {b.createdBy?.name ?? '—'}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5">
                    {canWrite && tab === 'planning' && (
                      <Button size="sm" disabled={busy} onClick={() => onSend(b)}>
                        {t('admin.production.sendToProduction', {
                          defaultValue: 'Send to production',
                        })}
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
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => onCancel(b)}
                      >
                        {t('admin.production.dismiss', { defaultValue: 'Dismiss' })}
                      </Button>
                    )}
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
