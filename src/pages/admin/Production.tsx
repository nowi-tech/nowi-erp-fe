import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Factory, Loader2, Search, X } from 'lucide-react';
import { QueueTabs } from '@/components/styles/StyleQueueTable';
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
  type BatchStatus,
  type CreateBatchBody,
  type ProductionBatch,
  type ProductionKpis,
} from '@/api/production';
import { getInventoryHealth, type InventoryStyle } from '@/api/inventoryHealth';
import { UrgencyPill } from '@/pages/admin/InventoryHealth';
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export default function Production() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasAnyRole(user, PRODUCTION_WRITE_ROLES);
  const canCancel = hasAnyRole(user, PRODUCTION_CANCEL_ROLES);

  const [tab, setTab] = useState<Tab>('in_production');
  const [search, setSearch] = useState('');
  // Every keystroke would otherwise fire a request, and slow responses can land
  // out of order and render a stale result set.
  const debouncedSearch = useDebounced(search, 300);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryStyle[]>([]);
  /** False when the forecast had more styles than one page — the makeQty filter
   *  is client-side, so the count would understate the real backlog. */
  const [suggestionsComplete, setSuggestionsComplete] = useState(true);
  const [kpis, setKpis] = useState<ProductionKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (tab === 'to_start') {
        // No `filter` / `sortKey`: that is exactly what the Inventory Health
        // page sends by default, so this tab inherits its priority ranking
        // (out/critical first, then watch, by revenue-at-risk per day).
        const res = await getInventoryHealth({
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
        });
        // Anything the forecast says needs making. Sizes with a batch already
        // running have had their makeQty reduced by the pipeline already.
        setSuggestions(res.styles.filter((s) => s.makeTotal > 0));
        setSuggestionsComplete(res.total <= PAGE_SIZE);
      } else {
        const res = await getBatches({
          tab,
          search: debouncedSearch || undefined,
          take: PAGE_SIZE,
        });
        setBatches(res.rows);
        setKpis(res.kpis);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch]);

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
        count: suggestionsComplete ? suggestions.length : undefined,
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
    [t, suggestions.length, suggestionsComplete, kpis],
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
  onStart,
}: {
  styles: InventoryStyle[];
  canWrite: boolean;
  onStart: (target: StartProductionTarget) => void;
}) {
  const { t } = useTranslation();

  if (styles.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        {t('admin.production.toStartEmpty', {
          defaultValue: 'Nothing needs making — every size has enough cover.',
        })}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {styles.map((s) => {
        const needing = s.sizes.filter((z) => z.makeQty > 0);
        const covers = s.sizes.map((z) => z.coverDays).filter((c): c is number => c != null);
        return (
          <div
            key={s.styleKey}
            className="flex items-center gap-4 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"
          >
            {s.imageUrl ? (
              <img src={s.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded bg-[var(--color-muted)]" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{s.name ?? s.styleKey}</span>
                <UrgencyPill urgency={s.worstUrgency} />
              </div>
              <div className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
                {s.styleKey}
              </div>
            </div>
            <div className="w-20 text-right">
              <div className="text-sm font-semibold">
                {s.sizes.reduce((a, z) => a + z.atRiskUnitsPerDay, 0).toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {t('admin.production.atRisk', { defaultValue: 'at risk/d' })}
              </div>
            </div>
            <div className="w-28 text-xs text-[var(--color-muted-foreground)]">
              {t('admin.production.sizesNeeding', {
                defaultValue: '{{n}} of {{total}} sizes',
                n: needing.length,
                total: s.sizes.length,
              })}
            </div>
            <div className="w-20 text-right">
              <div className="text-base font-bold">{s.makeTotal}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {t('admin.production.toMake', { defaultValue: 'to make' })}
              </div>
            </div>
            <div className="w-16 text-right text-sm text-[var(--color-muted-foreground)]">
              {covers.length > 0 ? `${Math.min(...covers).toFixed(1)}d` : '—'}
            </div>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onStart({
                    origin: 'forecast',
                    styleKey: s.styleKey,
                    styleId: s.linkedStyleId ?? undefined,
                    styleRef: null,
                    name: s.name,
                    imageUrl: s.imageUrl,
                    worstCoverDays: covers.length > 0 ? Math.min(...covers) : null,
                    drr: s.sizes.reduce((a, z) => a + z.drr, 0),
                    totalStock: s.sizes.reduce((a, z) => a + z.currentStock, 0),
                    sizes: s.sizes.map((z) => ({
                      sku: z.sku,
                      size: z.size,
                      suggestedQty: z.makeQty,
                      coverDays: z.coverDays,
                      currentStock: z.currentStock,
                    })),
                  })
                }
              >
                {t('admin.production.addToPipeline', {
                  defaultValue: 'Add to production pipeline',
                })}
              </Button>
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
                  {b.imageUrl ? (
                    <img src={b.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded bg-[var(--color-muted)]" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {b.name ??
                        b.styleRef ??
                        t('admin.production.untitled', { defaultValue: 'Untitled style' })}
                    </div>
                    <div className="truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
                      {b.styleRef ?? b.styleKey}
                    </div>
                  </div>
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
