import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Truck } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth';
import { listLots } from '@/api/lots';
import { listReceipts, type ReceiptRow } from '@/api/receipts';
import { listScraps, type ScrapRow } from '@/api/scrap';
import { orderStatusVariant } from '@/lib/statusBadge';
import { cn } from '@/lib/utils';
import type { Lot, OrderStatus } from '@/api/types';

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

function todayLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

// A lot belongs in the finisher's active queue while it's at finishing
// and not yet shipped out. Once the order is dispatched/closed it lives
// in the "Worked on" history tab instead (mirrors StitchingHome).
const FINISHING_QUEUE_STATUSES: OrderStatus[] = [
  'in_finishing',
  'in_rework',
];

function isInQueue(lot: Lot): boolean {
  const status = lot.order?.status;
  if (status && !FINISHING_QUEUE_STATUSES.includes(status)) return false;
  // No stitching forward yet ⇒ nothing for the finisher to do. Status=
  // in_finishing without any forward shouldn't happen via the receipt
  // path (BE only flips status on a real forward) but corrupt seed/test
  // data can land here.
  return (lot.stageForwarded?.stitching ?? 0) > 0;
}

type Tab = 'queue' | 'history';
const PAGE_SIZE = 20;

type HistoryItem =
  | { type: 'receipt'; id: string; at: string; row: ReceiptRow }
  | { type: 'scrap'; id: string; at: string; row: ScrapRow };

interface LotHistoryGroup {
  lotId: number;
  lot?: Lot;
  lastAt: string;
  items: HistoryItem[];
  scrapped: number;
}

function sortHistory(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

function groupHistoryByLot(items: HistoryItem[]): LotHistoryGroup[] {
  const byLot = new Map<number, LotHistoryGroup>();
  for (const item of sortHistory(items)) {
    const lotId = Number(item.row.lot?.id ?? item.row.lotId);
    const existing = byLot.get(lotId);
    const group =
      existing ??
      ({
        lotId,
        lot: item.row.lot,
        lastAt: item.at,
        items: [],
        scrapped: 0,
      } satisfies LotHistoryGroup);

    if (!group.lot && item.row.lot) group.lot = item.row.lot;
    if (new Date(item.at).getTime() > new Date(group.lastAt).getTime()) {
      group.lastAt = item.at;
    }
    group.items.push(item);
    if (item.type === 'scrap') group.scrapped += item.row.qty;
    byLot.set(lotId, group);
  }
  return Array.from(byLot.values()).sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );
}

export default function FinishingHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');

  // Lots scoped to the finishing master. Admin/viewer get all (no
  // assignedFinisherToMe), since they don't have lots assigned to them.
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(true);
  const filterToMe = user?.role === 'finishing_master';

  const refreshLots = useCallback(async () => {
    setLotsLoading(true);
    try {
      const all = await listLots(
        filterToMe ? { assignedFinisherToMe: true } : {},
      );
      setLots(all.filter(isInQueue));
    } catch {
      setLots([]);
    } finally {
      setLotsLoading(false);
    }
  }, [filterToMe]);

  // "Worked on" — paginated receipts + scraps authored by the current
  // user. Each stream paginates independently so a drained stream
  // doesn't stall the other (mirrors StitchingHome).
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [receiptSkip, setReceiptSkip] = useState(0);
  const [scrapSkip, setScrapSkip] = useState(0);
  const [hasMoreReceipts, setHasMoreReceipts] = useState(true);
  const [hasMoreScraps, setHasMoreScraps] = useState(true);

  const loadHistory = useCallback(
    async (reset: boolean) => {
      setHistoryLoading(true);
      try {
        const nextReceiptSkip = reset ? 0 : receiptSkip;
        const nextScrapSkip = reset ? 0 : scrapSkip;
        const fetchReceipts = reset || hasMoreReceipts;
        const fetchScraps = reset || hasMoreScraps;
        const [receipts, scraps] = await Promise.all([
          fetchReceipts
            ? listReceipts({ take: PAGE_SIZE, byMe: true, skip: nextReceiptSkip })
            : Promise.resolve([] as ReceiptRow[]),
          fetchScraps
            ? listScraps({ take: PAGE_SIZE, byMe: true, skip: nextScrapSkip })
            : Promise.resolve([] as ScrapRow[]),
        ]);
        const rows = sortHistory([
          ...receipts.map((row): HistoryItem => ({
            type: 'receipt',
            id: `receipt-${row.id}`,
            at: row.receivedAt,
            row,
          })),
          ...scraps.map((row): HistoryItem => ({
            type: 'scrap',
            id: `scrap-${row.id}`,
            at: row.scrappedAt,
            row,
          })),
        ]);
        if (reset) {
          setHistory(rows);
          setReceiptSkip(receipts.length);
          setScrapSkip(scraps.length);
        } else {
          setHistory((prev) => sortHistory([...prev, ...rows]));
          setReceiptSkip(nextReceiptSkip + receipts.length);
          setScrapSkip(nextScrapSkip + scraps.length);
        }
        if (fetchReceipts) setHasMoreReceipts(receipts.length === PAGE_SIZE);
        if (fetchScraps) setHasMoreScraps(scraps.length === PAGE_SIZE);
      } catch {
        if (reset) setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [receiptSkip, scrapSkip, hasMoreReceipts, hasMoreScraps],
  );

  useEffect(() => {
    void refreshLots();
  }, [refreshLots]);

  useEffect(() => {
    if (tab === 'history' && history.length === 0) {
      void loadHistory(true);
    }
  }, [tab, history.length, loadHistory]);

  return (
    <FloorShell title={t('finishing.title')}>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-semibold text-[30px] leading-none tracking-[-0.02em] text-[var(--color-foreground)]">
            {t('finishing.title')}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
            {todayLabel(i18n.language)}
          </p>
        </div>
      </div>

      {/* Tab bar — pill-style segmented control, identical to StitchingHome */}
      <div className="mb-4 inline-flex p-[3px] rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]">
        {([
          { id: 'queue' as const, label: t('floor.yourLots') },
          { id: 'history' as const, label: t('floor.workedOn') },
        ]).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setTab(opt.id)}
            className={cn(
              'px-4 py-1.5 text-[13px] font-semibold rounded-full transition-colors',
              tab === opt.id
                ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.08),0_0_0_1px_var(--color-border)]'
                : 'text-[var(--color-muted-foreground)]',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {tab === 'queue' ? (
        <QueueTab
          lots={lots}
          loading={lotsLoading}
          forMaster={filterToMe}
          onOpen={(id) => navigate(`/finishing/lot/${id}`)}
        />
      ) : (
        <HistoryTab
          rows={history}
          loading={historyLoading}
          hasMore={hasMoreReceipts || hasMoreScraps}
          onLoadMore={() => loadHistory(false)}
        />
      )}
    </FloorShell>
  );
}

function productLabelOf(
  lot: Lot,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  if (!lot.style) return null;
  return [
    t(`stitching.gender.${lot.style.gender}`, {
      defaultValue:
        lot.style.gender === 'W'
          ? "Women's"
          : lot.style.gender === 'M'
            ? "Men's"
            : 'Unisex',
    }),
    lot.style.category?.name,
  ]
    .filter(Boolean)
    .join(' ');
}

function TestBadge() {
  const { t } = useTranslation();
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]"
      title={t('common.testDataTooltip', {
        defaultValue: 'Training / test data — not a real lot',
      })}
    >
      {t('common.testData', { defaultValue: 'Test' })}
    </span>
  );
}

function QueueTab({
  lots,
  loading,
  forMaster,
  onOpen,
}: {
  lots: Lot[];
  loading: boolean;
  forMaster: boolean;
  onOpen: (lotId: number) => void;
}) {
  const { t } = useTranslation();

  // Stale-while-revalidate: only show the skeleton on first load (no
  // data yet). Subsequent refreshes keep showing the previous lots so
  // we don't stack a second loader next to a sibling list that's also
  // refreshing.
  if (loading && lots.length === 0) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (lots.length === 0) {
    return (
      <p className="text-[var(--color-muted-foreground)] px-1">
        {t('finishing.empty')}
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <div className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {forMaster
            ? t('finishing.queue', { defaultValue: 'In your queue' })
            : t('finishing.allLots', {
                defaultValue: 'All lots in finishing',
              })}
        </div>
        <div className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
          {lots.length} · {lots.reduce((a, l) => a + totalUnits(l.qtyIn), 0)}u
        </div>
      </div>
      <div className="space-y-2.5">
        {lots.map((lot) => (
          <FinishingLotCard key={lot.id} lot={lot} onOpen={() => onOpen(lot.id)} />
        ))}
      </div>
    </div>
  );
}

function HistoryTab({
  rows,
  loading,
  hasMore,
  onLoadMore,
}: {
  rows: HistoryItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const groups = groupHistoryByLot(rows);

  if (groups.length === 0 && !loading) {
    return (
      <p className="text-[var(--color-muted-foreground)] px-1">
        {t('floor.workedOnEmpty')}
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <ul className="space-y-2.5">
        {groups.map((group) => {
          const lot = group.lot;
          const units = totalUnits(lot?.qtyIn);
          const productLabel = lot ? productLabelOf(lot, t) : null;
          const status = lot?.order?.status;
          return (
            <li key={group.lotId}>
              <button
                type="button"
                onClick={() => navigate(`/finishing/worked-on/${group.lotId}`)}
                className="w-full text-left rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px transition-all p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
                            {lot?.lotNo ?? `#${group.lotId}`}
                          </span>
                          {lot?.isTestData && <TestBadge />}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
                          {productLabel && (
                            <span className="font-medium text-[var(--color-foreground)]">
                              {productLabel}
                            </span>
                          )}
                          {productLabel && (
                            <span className="text-[var(--color-muted-foreground-2)]">·</span>
                          )}
                          {lot && <span>{lot.vendor?.name ?? lot.vendorId}</span>}
                          {lot && (
                            <span className="text-[var(--color-muted-foreground-2)]">·</span>
                          )}
                          {units > 0 && (
                            <span className="font-mono tabular-nums">{units}u</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {status && (
                          <Badge variant={orderStatusVariant(status)} dot>
                            {t(`order.status.${status}`, { defaultValue: status })}
                          </Badge>
                        )}
                        <div className="w-9 h-9 rounded-full bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)]">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--color-muted-foreground)]">
                      <span className="font-mono uppercase tracking-wide">
                        {group.items.length}{' '}
                        {t('common.activities', { defaultValue: 'activities' })}
                      </span>
                      {group.scrapped > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-[var(--status-stuck-ink)]">
                            {t('finishing.lot.scrap', { defaultValue: 'Scrap' })}{' '}
                            {group.scrapped}u
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span className="font-mono">
                        {new Date(group.lastAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {loading && (
        <div className="rounded-[14px] bg-[var(--color-surface)] px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
          {t('common.loading')}
        </div>
      )}
      {hasMore && !loading && (
        <div className="px-1 py-2">
          <button
            type="button"
            onClick={onLoadMore}
            className="text-[13px] font-semibold text-[var(--color-primary)] hover:underline"
          >
            {t('common.more', { defaultValue: 'More' })}
          </button>
        </div>
      )}
    </div>
  );
}

interface LotMetrics {
  units: number;
  stitchForwarded: number;
  finishingForwarded: number;
  hasReady: boolean;
}

function metricsFor(lot: Lot): LotMetrics {
  const units = totalUnits(lot.qtyIn);
  const stitchForwarded = lot.stageForwarded?.stitching ?? 0;
  const finishingForwarded = lot.stageForwarded?.finishing ?? 0;
  return {
    units,
    stitchForwarded,
    finishingForwarded,
    hasReady: finishingForwarded > 0,
  };
}

interface CardProps {
  lot: Lot;
  onOpen: () => void;
}

function FinishingLotCard({ lot, onOpen }: CardProps) {
  const { t } = useTranslation();
  const m = metricsFor(lot);
  const productLabel = productLabelOf(lot, t);

  const anomaly =
    lot.order?.status === 'in_rework'
      ? 'rework'
      : lot.order?.status === 'stuck'
        ? 'stuck'
        : null;

  return (
    <div
      className={cn(
        'rounded-[14px] bg-[var(--color-surface)] border-l-[3px] shadow-[0_1px_2px_rgba(14,23,48,0.04)] hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px transition-all p-4',
        m.hasReady
          ? 'border-l-[var(--color-success)]'
          : 'border-l-[var(--color-primary)]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left flex items-start gap-3"
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-[20px] leading-[1.1] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
              {lot.lotNo}
            </div>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--color-muted-foreground)] bg-[var(--color-muted)] px-1.5 py-0.5 rounded">
              {m.units}u
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
            {productLabel && (
              <span className="font-medium text-[var(--color-foreground)]">
                {productLabel}
              </span>
            )}
            {anomaly && (
              <Badge variant={anomaly === 'stuck' ? 'stuck' : 'rework'} dot>
                {anomaly === 'stuck'
                  ? t('common.error', { defaultValue: 'Stuck' })
                  : t('admin.locator.filters.rework', {
                      defaultValue: 'Rework',
                    })}
              </Badge>
            )}
          </div>

          {/* Single progress bar — the finisher's own progress. Upstream
              (stitching → me) is informational and lives on the detail
              screen; surfacing it here just adds noise on every card. */}
          <div className="pt-1.5">
            <ProgressRow
              label={t('finishing.lot.progress', { defaultValue: 'Dispatched' })}
              value={m.finishingForwarded}
              max={m.units}
              tone={m.hasReady ? 'success' : 'neutral'}
            />
          </div>
        </div>
        <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)]">
          <ChevronRight size={18} />
        </div>
      </button>

      {/* Inline terminal CTA — same destination as the row tap, but
          surfaced as a primary button so the finisher can't miss it. */}
      {m.hasReady && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 h-11 rounded-[10px] text-[14px] font-semibold text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)] active:translate-y-px transition-transform"
        >
          <Truck size={16} />
          {t('finishing.lot.createDispatch', { defaultValue: 'Create Dispatch' })}
        </button>
      )}
    </div>
  );
}

interface ProgressRowProps {
  label: string;
  value: number;
  max: number;
  tone: 'neutral' | 'success';
}

function ProgressRow({ label, value, max, tone }: ProgressRowProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="shrink-0 w-[110px] text-[var(--color-muted-foreground)] font-medium">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            tone === 'success'
              ? 'bg-[var(--color-success)]'
              : 'bg-[var(--color-primary)]',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-mono tabular-nums text-[var(--color-muted-foreground)] min-w-[44px] text-right">
        {value}/{max}
      </span>
    </div>
  );
}
