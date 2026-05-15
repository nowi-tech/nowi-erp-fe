import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Truck } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Badge } from '@/components/ui/badge';
import HomePillFilters from '@/components/floor/HomePillFilters';
import { listLots } from '@/api/lots';
import type { Lot } from '@/api/types';
import { cn } from '@/lib/utils';

type FinFilter =
  | 'in_progress'
  | 'ready'
  | 'rework'
  | 'dispatched'
  | 'all';

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

interface LotMetrics {
  units: number;
  stitchForwarded: number;
  finishingForwarded: number;
  isReady: boolean;
}

function metricsFor(lot: Lot): LotMetrics {
  const units = totalUnits(lot.qtyIn);
  const stitchForwarded = lot.stageForwarded?.stitching ?? 0;
  const finishingForwarded = lot.stageForwarded?.finishing ?? 0;
  // "Ready to Dispatch" = finisher has pushed everything they received
  // out of the finishing stage AND nothing more is coming from
  // stitching. Stitching may still have units in progress for partial
  // forwards; we only flag a card ready when the line has caught up.
  const isReady =
    units > 0 &&
    stitchForwarded >= units &&
    finishingForwarded >= units;
  return { units, stitchForwarded, finishingForwarded, isReady };
}

function classifyForFilter(lot: Lot, m: LotMetrics): FinFilter | null {
  const status = lot.order?.status;
  if (status === 'dispatched' || status === 'closed' || status === 'closed_with_adjustment') {
    return 'dispatched';
  }
  if (status === 'in_rework') return 'rework';
  if (status === 'in_finishing') {
    return m.isReady ? 'ready' : 'in_progress';
  }
  // Anything else (receiving / in_stitching / stuck) shouldn't appear
  // in a finisher's queue once it's assigned, but if it does we hide
  // it from the filter pills (returns null).
  return null;
}

export default function FinishingHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter persists in the URL so back-from-detail and reload restore it.
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: FinFilter = (() => {
    const raw = searchParams.get('tab');
    if (
      raw === 'in_progress' ||
      raw === 'ready' ||
      raw === 'rework' ||
      raw === 'dispatched' ||
      raw === 'all'
    ) {
      return raw;
    }
    return 'in_progress';
  })();
  const setFilter = (next: FinFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'in_progress') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // Queue = lots whose finishing slot is me. Today this is a single
  // page; the finisher's load is rarely > 30 lots so we don't paginate.
  // Switch to the FloorHome infinite-scroll pattern if/when that
  // assumption breaks.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listLots({ assignedFinisherToMe: true });
      setLots(all);
    } catch {
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Compute counts client-side from the loaded lots — no separate BE
  // endpoint. The queue is small enough that the bookkeeping is cheap
  // and we always agree with what the cards show.
  const { counts, byBucket } = useMemo(() => {
    const byBucket = {
      in_progress: [] as Lot[],
      ready: [] as Lot[],
      rework: [] as Lot[],
      dispatched: [] as Lot[],
    };
    for (const lot of lots) {
      const m = metricsFor(lot);
      const bucket = classifyForFilter(lot, m);
      if (bucket && bucket !== 'all') byBucket[bucket].push(lot);
    }
    return {
      counts: {
        in_progress: byBucket.in_progress.length,
        ready: byBucket.ready.length,
        rework: byBucket.rework.length,
        dispatched: byBucket.dispatched.length,
        all: lots.length,
      },
      byBucket,
    };
  }, [lots]);

  const visible: Lot[] = filter === 'all' ? lots : byBucket[filter];

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

      <HomePillFilters<FinFilter>
        ariaLabel={t('finishing.filters.ariaLabel', {
          defaultValue: 'Finishing queue filters',
        })}
        active={filter}
        onChange={setFilter}
        tabs={[
          {
            id: 'in_progress',
            label: t('finishing.filters.inProgress', {
              defaultValue: 'In Progress',
            }),
            count: counts.in_progress,
          },
          {
            id: 'ready',
            label: t('finishing.filters.ready', {
              defaultValue: 'Ready to Dispatch',
            }),
            count: counts.ready,
          },
          {
            id: 'rework',
            label: t('finishing.filters.rework', { defaultValue: 'Rework' }),
            count: counts.rework,
          },
          {
            id: 'dispatched',
            label: t('finishing.filters.dispatched', {
              defaultValue: 'Dispatched',
            }),
            count: counts.dispatched,
          },
          {
            id: 'all',
            label: t('finishing.filters.all', { defaultValue: 'All' }),
            count: counts.all,
          },
        ]}
      />

      <div className="flex items-baseline justify-between px-1 pb-3">
        <div className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {t('finishing.queue', { defaultValue: 'In your queue' })}
        </div>
        <div className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
          {visible.length} lots ·{' '}
          {visible.reduce((a, l) => a + totalUnits(l.qtyIn), 0)}u
        </div>
      </div>

      <div className="space-y-2.5">
        {loading ? (
          <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : visible.length === 0 ? (
          <p className="text-[var(--color-muted-foreground)] px-1">
            {t('finishing.empty')}
          </p>
        ) : (
          visible.map((lot) => (
            <FinishingLotCard
              key={lot.id}
              lot={lot}
              onOpen={() => navigate(`/finishing/lot/${lot.id}`)}
            />
          ))
        )}
      </div>
    </FloorShell>
  );
}

interface CardProps {
  lot: Lot;
  onOpen: () => void;
}

function FinishingLotCard({ lot, onOpen }: CardProps) {
  const { t } = useTranslation();
  const m = metricsFor(lot);
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
    <div
      className={cn(
        'rounded-[14px] bg-[var(--color-surface)] border-l-[3px] shadow-[0_1px_2px_rgba(14,23,48,0.04)] hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] transition-shadow p-4',
        m.isReady
          ? 'border-l-[var(--color-success)]'
          : 'border-l-[var(--stage-finish-acc)]',
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
                {anomaly === 'stuck' ? 'Stuck' : 'Rework'}
              </Badge>
            )}
          </div>

          {/* Single progress bar — the finisher's own progress. Upstream
              (stitching → me) is informational and lives on the detail
              screen; surfacing it here just adds noise on every card. */}
          <div className="pt-1.5">
            <ProgressRow
              label={t('finishing.lot.progress', {
                defaultValue: 'Dispatched',
              })}
              value={m.finishingForwarded}
              max={m.units}
              tone={m.isReady ? 'success' : 'neutral'}
            />
          </div>
        </div>
        <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)]">
          <ChevronRight size={18} />
        </div>
      </button>

      {/* Inline terminal CTA — same destination as the row tap, but
          surfaced as a primary button so the finisher can't miss it. */}
      {m.isReady && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 h-11 rounded-[10px] text-[14px] font-semibold text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)] active:translate-y-px transition-transform"
        >
          <Truck size={16} />
          {t('finishing.lot.createDispatch', {
            defaultValue: 'Create Dispatch',
          })}
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
