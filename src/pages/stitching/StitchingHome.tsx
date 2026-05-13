import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth';
import { listLots } from '@/api/lots';
import { listReceipts, type ReceiptRow } from '@/api/receipts';
import { cn } from '@/lib/utils';
import type { Lot, OrderStatus } from '@/api/types';

function todayLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const STITCHING_QUEUE_STATUSES: OrderStatus[] = ['receiving', 'in_stitching', 'in_rework'];

function isInQueue(lot: Lot): boolean {
  const status = lot.order?.status;
  if (!status) return true;
  return STITCHING_QUEUE_STATUSES.includes(status);
}

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

type Tab = 'queue' | 'history';
const PAGE_SIZE = 20;

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

  // "Worked on" — paginated stage_receipts authored by the current user
  // (BE filter ?byMe=1). Includes forwards + rework_returns + dispatches.
  const [history, setHistory] = useState<ReceiptRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);

  const loadHistory = useCallback(
    async (reset: boolean) => {
      setHistoryLoading(true);
      try {
        const nextSkip = reset ? 0 : skip;
        const rows = await listReceipts({
          // BE list endpoint reads currentUser when byMe=true; lotId is
          // optional on the FE param but the apiClient strips undefined.
          take: PAGE_SIZE,
          ...({ byMe: true, skip: nextSkip } as unknown as { lotId: number }),
        });
        if (reset) {
          setHistory(rows);
          setSkip(rows.length);
        } else {
          setHistory((prev) => [...prev, ...rows]);
          setSkip(nextSkip + rows.length);
        }
        setHasMore(rows.length === PAGE_SIZE);
      } catch {
        if (reset) setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [skip],
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
          onOpen={(id) => navigate(`/stitching/lot/${id}`)}
        />
      ) : (
        <HistoryTab
          rows={history}
          loading={historyLoading}
          hasMore={hasMore}
          onLoadMore={() => loadHistory(false)}
        />
      )}
    </FloorShell>
  );
}

function QueueTab({
  lots,
  loading,
  onOpen,
}: {
  lots: Lot[];
  loading: boolean;
  onOpen: (lotId: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-3">
        <div className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {t('stitching.queue', { defaultValue: 'In your queue' })}
        </div>
        <div className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
          {lots.length} lots · {lots.reduce((a, l) => a + totalUnits(l.qtyIn), 0)}u
        </div>
      </div>
      {loading ? (
        <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : lots.length === 0 ? (
        <p className="text-[var(--color-muted-foreground)]">{t('stitching.empty')}</p>
      ) : (
        <ul className="space-y-2.5">
          {lots.map((lot) => {
            const units = totalUnits(lot.qtyIn);
            const forwarded = lot.stageForwarded?.stitching ?? 0;
            const productLabel = lot.style
              ? [
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
                  .join(' ')
              : null;
            const anomaly =
              lot.order?.status === 'in_rework'
                ? 'rework'
                : lot.order?.status === 'stuck'
                  ? 'stuck'
                  : null;
            return (
              <li key={lot.id}>
                <button
                  type="button"
                  onClick={() => onOpen(lot.id)}
                  className="w-full text-left flex items-center gap-3 rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.04)] hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px transition-all p-4"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-semibold text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
                      {lot.lotNo}
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
                            : t('admin.locator.filters.rework', {
                                defaultValue: 'Rework',
                              })}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)]">
                    <ChevronRight size={18} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function HistoryTab({
  rows,
  loading,
  hasMore,
  onLoadMore,
}: {
  rows: ReceiptRow[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();

  if (rows.length === 0 && !loading) {
    return (
      <p className="text-[var(--color-muted-foreground)] px-1">
        {t('floor.workedOnEmpty')}
      </p>
    );
  }

  return (
    <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] overflow-hidden">
      <ul className="divide-y divide-[var(--color-border)]">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-[34px] h-7 px-1.5 rounded-[var(--radius-sm)] bg-[var(--color-muted)] flex items-center justify-center font-semibold text-xs">
              {r.sizeLabel}
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <span className="font-mono tabular-nums">×{r.qty}</span>
              {r.kind !== 'forward' && (
                <span className="ml-2 text-xs text-[var(--status-rework-ink)]">
                  ({r.kind})
                </span>
              )}
              <span className="ml-2 text-xs text-[var(--color-muted-foreground)] font-mono">
                {r.sku}
              </span>
            </div>
            <span className="text-xs text-[var(--color-muted-foreground)] font-mono">
              {new Date(r.receivedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </li>
        ))}
      </ul>
      {loading && (
        <div className="px-4 py-3 text-xs text-[var(--color-muted-foreground)]">
          {t('common.loading')}
        </div>
      )}
      {hasMore && !loading && (
        <div className="px-4 py-3 border-t border-[var(--color-border)]">
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
