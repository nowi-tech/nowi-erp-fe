import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth';
import { listLots } from '@/api/lots';
import { listReceipts, type ReceiptRow } from '@/api/receipts';
import { listScraps, type ScrapRow } from '@/api/scrap';
import { cn } from '@/lib/utils';
import { orderStatusVariant } from '@/lib/statusBadge';
import type { Lot, OrderStatus } from '@/api/types';

function todayLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

// `in_finishing` is included because the BE flips status on the FIRST
// stitching forward (so the FM gets the "needs finishing assignment"
// signal early). The lot still belongs in the stitching master's queue
// until they've forwarded every unit — the qty gate below handles that.
// `dispatched` / `closed*` / `stuck` are intentionally absent.
const STITCHING_QUEUE_STATUSES: OrderStatus[] = [
  'receiving',
  'in_stitching',
  'in_rework',
  'in_finishing',
];
const STITCHING_STAGE = 'stitching';

function isInQueue(lot: Lot): boolean {
  const status = lot.order?.status;
  if (!status) return true;
  if (!STITCHING_QUEUE_STATUSES.includes(status)) return false;
  // forwarded + scrapped >= units ⇒ nothing left to do at stitching;
  // hide it from the queue even if the lot is still active downstream.
  const units = totalUnits(lot.qtyIn);
  if (units === 0) return true;
  const forwarded = lot.stageForwarded?.[STITCHING_STAGE] ?? 0;
  const scrapped = lot.stageScrapped?.[STITCHING_STAGE] ?? 0;
  return forwarded + scrapped < units;
}

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

const KPI_WINDOW_DAYS = 7;

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

    if (item.type === 'scrap') {
      group.scrapped += item.row.qty;
    }

    byLot.set(lotId, group);
  }
  return Array.from(byLot.values()).sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );
}

interface DailyKpi {
  forwarded: number;
  scrap: number;
  rework: number;
}

export default function StitchingHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('queue');

  // Lots scoped to the stitching master. Admin gets all (no
  // assignedToMe), since admin doesn't have lots assigned to them.
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(true);
  const filterToMe = user?.role === 'stitching_master';

  const refreshLots = useCallback(async () => {
    setLotsLoading(true);
    try {
      const all = await listLots(filterToMe ? { assignedToMe: true } : {});
      setLots(all.filter(isInQueue));
    } catch {
      setLots([]);
    } finally {
      setLotsLoading(false);
    }
  }, [filterToMe]);

  // Rolling 7-day KPIs — forwarded / scrap / rework recorded by the current user.
  // Hidden from the UI for now; keep the wiring so re-enabling is a JSX uncomment.
  const [_kpi, setKpi] = useState<DailyKpi>({ forwarded: 0, scrap: 0, rework: 0 });
  void _kpi;

  // "Worked on" — paginated receipts + scraps authored by the current user.
  // Each stream paginates independently so a dried-up stream doesn't stall
  // pagination for the other.
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
        // Skip fetching a stream we've already drained (unless we're resetting).
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

  const refreshKpi = useCallback(async () => {
    // Last 7 days of activity by me. Window is enforced server-side via
    // `from`, so take=200 is the BE max and is plenty for a single master's
    // weekly throughput. Two receipt fetches scope to the kinds we sum
    // (avoids `rework_return` rows eating into the page budget).
    try {
      const from = new Date(
        Date.now() - KPI_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [forwards, reworks, scraps] = await Promise.all([
        listReceipts({ byMe: true, kind: 'forward', from, take: 200 }),
        listReceipts({ byMe: true, kind: 'rework_redo', from, take: 200 }),
        listScraps({ byMe: true, from, take: 200 }),
      ]);
      setKpi({
        forwarded: forwards.reduce((a, r) => a + r.qty, 0),
        rework: reworks.reduce((a, r) => a + r.qty, 0),
        scrap: scraps.reduce((a, s) => a + s.qty, 0),
      });
    } catch {
      setKpi({ forwarded: 0, scrap: 0, rework: 0 });
    }
  }, []);

  useEffect(() => {
    void refreshLots();
    // KPI fetch is paused while the KPI strip is commented out below.
    // Re-enable here when the strip ships.
    // void refreshKpi();
  }, [refreshLots]);
  void refreshKpi; // keep the symbol live so the wired-up function isn't tree-shaken into oblivion

  useEffect(() => {
    if (tab === 'history' && history.length === 0) {
      void loadHistory(true);
    }
  }, [tab, history.length, loadHistory]);

  return (
    <FloorShell title={t('stitching.title')}>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-semibold text-[30px] leading-none tracking-[-0.02em] text-[var(--color-foreground)]">
            {t('stitching.title')}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
            {todayLabel(i18n.language)}
          </p>
        </div>
      </div>

      {/* KPI strip — last 7 days, authored by the current user.
          Hidden for now; uncomment when we decide to surface it. */}
      {/* <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
        {t('stitching.kpi.lastNDays', {
          defaultValue: 'Last {{n}} days',
          n: KPI_WINDOW_DAYS,
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <KpiTile
          label={t('stitching.kpi.forwarded', { defaultValue: 'Forwarded' })}
          value={kpi.forwarded}
          tone="good"
        />
        <KpiTile
          label={t('stitching.kpi.rework', { defaultValue: 'Rework' })}
          value={kpi.rework}
          tone="warn"
        />
        <KpiTile
          label={t('stitching.kpi.scrap', { defaultValue: 'Scrap' })}
          value={kpi.scrap}
          tone="bad"
        />
      </div> */}

      {/* Tab bar — pill-style segmented control like the chrome language toggle */}
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
          onOpen={(id) => navigate(`/stitching/lot/${id}`)}
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-expect-error retained for the commented-out KPI strip
function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad';
}) {
  // green = healthy throughput, yellow = caution, red = loss.
  const toneClass =
    tone === 'good'
      ? 'bg-[var(--color-success-bg)] border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-[var(--color-success)]'
      : tone === 'warn'
        ? 'bg-[var(--color-warning-bg)] border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] text-[var(--color-warning)]'
        : 'bg-[var(--color-destructive-bg)] border-[color:color-mix(in_srgb,var(--color-destructive)_25%,transparent)] text-[var(--color-destructive-strong)]';
  return (
    <div
      className={cn(
        'rounded-[12px] border p-3 flex flex-col items-center justify-center min-h-[80px]',
        toneClass,
      )}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] opacity-80">
        {label}
      </span>
      <span className="mt-1 font-mono tabular-nums text-[24px] font-bold leading-none">
        {value}
        <span className="text-[16px] font-semibold">u</span>
      </span>
    </div>
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

  if (loading) {
    return <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />;
  }
  if (lots.length === 0) {
    return (
      <div className="text-[14px] text-[var(--color-muted-foreground)] px-1 leading-relaxed">
        <p>{t('stitching.empty')}</p>
        {forMaster && (
          <p className="mt-1 text-[13px]">
            {t('stitching.masterNoAssignments', {
              defaultValue:
                'New lots are assigned by the floor manager — they’ll show up here.',
            })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <div className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {forMaster
            ? t('stitching.queue', { defaultValue: 'In your queue' })
            : t('stitching.allLots', { defaultValue: 'All lots in stitching' })}
        </div>
        <div className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
          {lots.length} · {lots.reduce((a, l) => a + totalUnits(l.qtyIn), 0)}u
        </div>
      </div>
      <ul className="space-y-2.5">
        {lots.map((lot) => (
          <li key={lot.id}>
            <ActiveLotCard lot={lot} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
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

function ActiveLotCard({
  lot,
  onOpen,
}: {
  lot: Lot;
  onOpen: (lotId: number) => void;
}) {
  const { t } = useTranslation();
  const units = totalUnits(lot.qtyIn);
  const forwarded = lot.stageForwarded?.stitching ?? 0;
  const productLabel = productLabelOf(lot, t);
  const anomaly =
    lot.order?.status === 'in_rework'
      ? 'rework'
      : lot.order?.status === 'stuck'
        ? 'stuck'
        : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(lot.id)}
      className="w-full text-left flex items-center gap-3 rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.04)] hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px transition-all p-4"
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
            {lot.lotNo}
          </span>
          {lot.isTestData && <TestBadge />}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
          {productLabel && (
            <span className="font-medium text-[var(--color-foreground)]">
              {productLabel}
            </span>
          )}
          {productLabel && (
            <span className="text-[var(--color-muted-foreground-2)]">·</span>
          )}
          <span className="font-mono tabular-nums">{units}u</span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-[var(--color-muted-foreground)] font-mono">
          <span className="tabular-nums">
            {t('stitching.lot.forwardedOf', {
              defaultValue: '{{done}} of {{total}} forwarded',
              done: forwarded,
              total: units,
            })}
          </span>
          {anomaly && (
            <Badge variant={anomaly === 'stuck' ? 'stuck' : 'rework'} dot>
              {anomaly === 'stuck'
                ? t('common.error', { defaultValue: 'Stuck' })
                : t('admin.locator.filters.rework', { defaultValue: 'Rework' })}
            </Badge>
          )}
        </div>
      </div>
      <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)]">
        <ChevronRight size={18} />
      </div>
    </button>
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
                onClick={() => navigate(`/stitching/worked-on/${group.lotId}`)}
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
                            {t('stitching.lot.scrap', { defaultValue: 'Scrap' })}{' '}
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
