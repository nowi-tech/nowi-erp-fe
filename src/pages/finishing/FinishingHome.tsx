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
  /** Has any forwarded-out-of-finishing units waiting to ship. */
  hasReady: boolean;
  /** Has units forwarded by stitching that finisher hasn't processed yet. */
  hasInProgress: boolean;
}

function metricsFor(lot: Lot): LotMetrics {
  const units = totalUnits(lot.qtyIn);
  const stitchForwarded = lot.stageForwarded?.stitching ?? 0;
  const finishingForwarded = lot.stageForwarded?.finishing ?? 0;
  return {
    units,
    stitchForwarded,
    finishingForwarded,
    // "Ready to Dispatch" = anything-ready: at least one unit forwarded
    // out of finishing. Once the order flips to `dispatched` the lot
    // moves to the Dispatched bucket via classifyForFilters.
    hasReady: finishingForwarded > 0,
    // "In Progress" = anything-to-do: stitching has sent more than
    // finisher has forwarded out. A lot can be both in_progress AND
    // ready at the same time (stitching trickling in while finisher
    // ships what's done) — that's intentional.
    hasInProgress: stitchForwarded > finishingForwarded,
  };
}

/**
 * Returns ALL filter buckets the lot belongs to. A single lot can be
 * both `in_progress` and `ready` simultaneously — that matches the
 * real workflow (units arriving from stitching while finisher already
 * has a pile to ship).
 */
function classifyForFilters(lot: Lot, m: LotMetrics): FinFilter[] {
  const status = lot.order?.status;
  if (
    status === 'dispatched' ||
    status === 'closed' ||
    status === 'closed_with_adjustment'
  ) {
    return ['dispatched'];
  }
  if (status === 'in_rework') return ['rework'];
  if (status === 'in_finishing') {
    const out: FinFilter[] = [];
    if (m.hasInProgress) out.push('in_progress');
    if (m.hasReady) out.push('ready');
    return out;
  }
  // receiving / in_stitching / stuck shouldn't reach here (queue is
  // pre-filtered to lots with stitchForwarded > 0), but if one does
  // we drop it from filter pills.
  return [];
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
      // Defensive filter: a lot with zero stitching-forwards has no
      // work for the finisher. Status=in_finishing without any forward
      // shouldn't happen via the receipt path (BE only flips status on
      // a real forward) but corrupt seed/test data can land here.
      const actionable = all.filter((l) => (l.stageForwarded?.stitching ?? 0) > 0);
      setLots(actionable);
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
  // and we always agree with what the cards show. A lot can land in
  // multiple buckets (e.g. in_progress AND ready) — duplicates by lotId
  // collapse via the Set when rendering.
  const { counts, byBucket } = useMemo(() => {
    const byBucket = {
      in_progress: [] as Lot[],
      ready: [] as Lot[],
      rework: [] as Lot[],
      dispatched: [] as Lot[],
    };
    for (const lot of lots) {
      const m = metricsFor(lot);
      const buckets = classifyForFilters(lot, m);
      for (const b of buckets) {
        if (b !== 'all') byBucket[b].push(lot);
      }
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
        m.hasReady
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
