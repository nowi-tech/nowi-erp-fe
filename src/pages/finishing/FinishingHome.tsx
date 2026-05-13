import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Badge } from '@/components/ui/badge';
import { listLots } from '@/api/lots';
import type { Lot, OrderStatus } from '@/api/types';

const FINISHING_QUEUE_STATUSES: OrderStatus[] = [
  'in_stitching',
  'in_finishing',
  'in_rework',
];

function isInQueue(lot: Lot): boolean {
  const status = lot.order?.status;
  if (!status) return true;
  return FINISHING_QUEUE_STATUSES.includes(status);
}

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

export default function FinishingHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listLots();
      setLots(all.filter(isInQueue));
    } catch {
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <FloorShell title={t('finishing.title')}>
      <div className="mb-4">
        <h1 className="font-semibold text-[30px] leading-none tracking-[-0.02em] text-[var(--color-foreground)]">
          {t('finishing.title')}
        </h1>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
          {todayLabel(i18n.language)}
        </p>
      </div>
      <div className="flex items-baseline justify-between px-1 pb-3">
        <div className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {t('finishing.queue', { defaultValue: 'In your queue' })}
        </div>
        <div className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
          {lots.length} lots · {lots.reduce((a, l) => a + totalUnits(l.qtyIn), 0)}u
        </div>
      </div>
      <div>
        <div className="space-y-3">
          {loading ? (
            <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : lots.length === 0 ? (
            <p className="text-[var(--color-muted-foreground)]">{t('finishing.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {lots.map((lot) => {
                const units = totalUnits(lot.qtyIn);
                const forwarded = lot.stageForwarded?.finishing ?? 0;
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
                      onClick={() => navigate(`/finishing/lot/${lot.id}`)}
                      className="w-full text-left flex items-center gap-3 rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--stage-finish-acc)] shadow-[0_1px_2px_rgba(14,23,48,0.04)] hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px transition-all p-4"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="font-semibold text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
                          {lot.lotNo}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
                          {productLabel && (
                            <span className="font-medium text-[var(--color-foreground)]">{productLabel}</span>
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
                              {anomaly === 'stuck' ? 'Stuck' : 'Rework'}
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
      </div>
    </FloorShell>
  );
}
