import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/api/types';

/**
 * 4-dot pipeline showing where a lot is in the
 * Receive → Stitching → Finishing → Dispatch flow.
 * Completed stages: filled muted; current stage: filled with stage
 * accent; future: outlined. Anomalies (rework, stuck) tint the active
 * dot with the anomaly color.
 */
type Step = 'receive' | 'stitching' | 'finishing' | 'dispatch';

const STEPS: { id: Step; labelKey: string; accent: string }[] = [
  { id: 'receive', labelKey: 'stages.receive', accent: 'var(--color-foreground)' },
  { id: 'stitching', labelKey: 'stages.stitching', accent: 'var(--stage-stitch-acc)' },
  { id: 'finishing', labelKey: 'stages.finishing', accent: 'var(--stage-finish-acc)' },
  { id: 'dispatch', labelKey: 'stages.dispatch', accent: 'var(--stage-disp-acc)' },
];

/**
 * Map an order status to the current pipeline step + index.
 * Returns -1 for completed (status=closed*) which lights all dots.
 */
function statusToStepIndex(status: OrderStatus | undefined): {
  index: number;
  anomaly: 'rework' | 'stuck' | null;
} {
  if (!status) return { index: 0, anomaly: null };
  switch (status) {
    case 'receiving':
      return { index: 0, anomaly: null };
    case 'in_stitching':
      return { index: 1, anomaly: null };
    case 'in_rework':
      return { index: 1, anomaly: 'rework' };
    case 'stuck':
      return { index: 1, anomaly: 'stuck' };
    case 'in_finishing':
      return { index: 2, anomaly: null };
    case 'dispatched':
      return { index: 3, anomaly: null };
    case 'closed':
    case 'closed_with_adjustment':
      return { index: 4, anomaly: null };
    default:
      return { index: 0, anomaly: null };
  }
}

export interface StageTimelineProps {
  status?: OrderStatus | null;
  /** 'compact' (queue card) | 'detail' (lot page) */
  size?: 'compact' | 'detail';
  className?: string;
}

export default function StageTimeline({
  status,
  size = 'compact',
  className,
}: StageTimelineProps) {
  const { t } = useTranslation();
  const { index, anomaly } = statusToStepIndex(status ?? undefined);

  const dotSize = size === 'detail' ? 10 : 8;
  const dotGap = size === 'detail' ? 6 : 4;

  return (
    <div className={cn('flex items-center', className)}>
      {STEPS.map((step, i) => {
        const isCompleted = i < index;
        const isCurrent = i === index;
        const isFuture = i > index;

        const accent = anomaly === 'stuck'
          ? 'var(--status-stuck-acc)'
          : anomaly === 'rework'
            ? 'var(--status-rework-acc)'
            : step.accent;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className="flex flex-col items-center"
              style={{ minWidth: size === 'detail' ? 60 : 40 }}
            >
              <span
                className={cn(
                  'rounded-full border transition-colors',
                  isCurrent ? 'border-transparent' : 'border-current',
                )}
                style={{
                  width: dotSize,
                  height: dotSize,
                  backgroundColor: isFuture
                    ? 'transparent'
                    : isCurrent
                      ? accent
                      : 'var(--color-muted-foreground)',
                  color: isCurrent
                    ? accent
                    : isCompleted
                      ? 'var(--color-muted-foreground)'
                      : 'var(--color-muted-foreground-2)',
                  // tiny glow on the active dot in detail mode
                  boxShadow:
                    isCurrent && size === 'detail'
                      ? `0 0 0 3px color-mix(in srgb, ${accent} 20%, transparent)`
                      : undefined,
                }}
              />
              <span
                className={cn(
                  'mt-1 font-mono tabular-nums uppercase tracking-[0.06em]',
                  size === 'detail' ? 'text-[11px]' : 'text-[9px]',
                  isCurrent
                    ? 'text-[var(--color-foreground)] font-semibold'
                    : 'text-[var(--color-muted-foreground)]',
                )}
              >
                {t(step.labelKey, { defaultValue: step.id })}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                style={{
                  width: size === 'detail' ? 24 : 12,
                  height: 1,
                  backgroundColor:
                    i < index
                      ? 'var(--color-muted-foreground)'
                      : 'var(--color-border)',
                  marginInline: dotGap,
                  marginBottom: size === 'detail' ? 14 : 10,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
