import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import { Badge } from '@/components/ui/badge';
import { getLot } from '@/api/lots';
import { listReceipts, type ReceiptRow } from '@/api/receipts';
import { listScraps, type ScrapRow } from '@/api/scrap';
import { orderStatusVariant } from '@/lib/statusBadge';
import { cn } from '@/lib/utils';
import { ActivityLog, type ActivityItem } from '@/components/floor/ActivityLog';
import type { Lot } from '@/api/types';

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

export default function StitchingWorkedOnDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lotId: lotIdParam = '' } = useParams<{ lotId: string }>();
  const lotId = Number(lotIdParam);

  const [lot, setLot] = useState<Lot | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [lotRes, receipts, scraps] = await Promise.all([
        getLot(lotId),
        // No `byMe` — the lot detail shows the full activity log on this
        // lot (forward + scrap by anyone), not just the viewer's actions.
        // BE read-isolation lets lotId-scoped queries bypass per-user
        // filtering so stitching_master can see upstream activity too.
        listReceipts({ lotId, take: 200 }).catch(() => [] as ReceiptRow[]),
        listScraps({ lotId, take: 200 }).catch(() => [] as ScrapRow[]),
      ]);
      setLot(lotRes);
      setItems(
        sortActivity([
          ...receipts.map((row): ActivityItem => ({
            type: 'receipt',
            id: `receipt-${row.id}`,
            at: row.receivedAt,
            row,
          })),
          ...scraps.map((row): ActivityItem => ({
            type: 'scrap',
            id: `scrap-${row.id}`,
            at: row.scrappedAt,
            row,
          })),
        ]),
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403) {
        sonnerToast.error(
          t('stitching.lot.notAssigned', {
            defaultValue: 'This lot is not assigned to you.',
          }),
        );
        navigate('/stitching', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [lotId, navigate, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    let forwarded = 0;
    let scrapped = 0;
    let rework = 0;
    for (const item of items) {
      if (item.type === 'scrap') scrapped += item.row.qty;
      else if (item.row.kind === 'rework_redo') rework += item.row.qty;
      else if (item.row.kind === 'forward') forwarded += item.row.qty;
    }
    return { forwarded, scrapped, rework };
  }, [items]);

  const productLabel = lot?.style
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

  return (
    <FloorShell title={t('floor.workedOn', { defaultValue: 'Worked on' })}>
      <button
        type="button"
        onClick={() => navigate('/stitching')}
        className="inline-flex items-center gap-1 pr-3.5 pl-2 py-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-foreground)] shadow-[0_1px_1px_rgba(14,23,48,0.03)] hover:bg-[var(--color-muted)] transition-colors"
      >
        <ChevronLeft size={20} />
        {t('floor.workedOn', { defaultValue: 'Worked on' })}
      </button>

      <div className="mt-3 space-y-3">
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : lot ? (
          <>
            <div className="rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_14px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-[26px] leading-[1.05] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
                    {lot.lotNo}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
                    {productLabel && (
                      <span className="font-medium text-[var(--color-foreground)]">
                        {productLabel}
                      </span>
                    )}
                    {productLabel && (
                      <span className="text-[var(--color-muted-foreground-2)]">·</span>
                    )}
                    <span>{lot.vendor?.name ?? lot.vendorId}</span>
                    <span className="text-[var(--color-muted-foreground-2)]">·</span>
                    <span className="font-mono tabular-nums">
                      {totalUnits(lot.qtyIn)}u
                    </span>
                  </div>
                </div>
                {lot.order?.status && (
                  <Badge variant={orderStatusVariant(lot.order.status)} dot>
                    {t(`order.status.${lot.order.status}`, {
                      defaultValue: lot.order.status,
                    })}
                  </Badge>
                )}
              </div>
            </div>

            <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-4">
              <div className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[var(--color-muted-foreground)]">
                {t('floor.workedOn', { defaultValue: 'Worked on' })}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <SummaryCell
                  label={t('stitching.lot.forwarded', { defaultValue: 'Forwarded' })}
                  value={summary.forwarded}
                  tone="stitch"
                />
                <SummaryCell
                  label={t('stitching.lot.scrap', { defaultValue: 'Scrap' })}
                  value={summary.scrapped}
                  tone="scrap"
                />
                <SummaryCell
                  label={t('admin.locator.filters.rework', { defaultValue: 'Rework' })}
                  value={summary.rework}
                  tone="rework"
                />
              </div>
            </div>

            <ActivityLog
              items={items}
              title={t('common.details', { defaultValue: 'Details' })}
              emptyText={t('floor.workedOnEmpty')}
              truncatedAt={200}
            />
          </>
        ) : null}
      </div>
    </FloorShell>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'stitch' | 'scrap' | 'rework';
}) {
  const toneClass =
    tone === 'stitch'
      ? 'bg-[var(--stage-stitch-bg)] text-[var(--stage-stitch-ink)]'
      : tone === 'scrap'
        ? 'bg-[var(--status-stuck-bg)] text-[var(--status-stuck-ink)]'
        : 'bg-[var(--status-rework-bg)] text-[var(--status-rework-ink)]';
  return (
    <div className={cn('rounded-[10px] px-3 py-2', toneClass)}>
      <div className="text-[11px] uppercase tracking-[0.08em] font-semibold truncate">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums">
        {value}u
      </div>
    </div>
  );
}

