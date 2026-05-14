import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/api/types';

/**
 * Pipeline showing where a lot is in the
 * Receive → Stitching → Finishing → Dispatch flow.
 *
 * - Completed steps: filled emerald with a check.
 * - Current step: filled with stage accent (blue/vermilion/marigold;
 *   red for anomalies), ringed with a soft halo, white pip in centre.
 * - Future steps: hollow gray.
 * - Connector line between dots: gray base with the active accent
 *   filled to the current step (percentage).
 *
 * Matches the Stitch handoff "Warehouse Floor Management - Improved UI"
 * + "Warehouse Floor - Cleaned Layout" combined card pattern.
 */
type Step = 'receive' | 'stitching' | 'finishing' | 'dispatch';

const STEPS: { id: Step; labelKey: string; accent: string; bg: string }[] = [
  { id: 'receive', labelKey: 'stages.receive', accent: 'var(--color-foreground)', bg: 'rgba(14,23,48,0.08)' },
  { id: 'stitching', labelKey: 'stages.stitching', accent: 'var(--stage-stitch-acc)', bg: 'var(--stage-stitch-bg)' },
  { id: 'finishing', labelKey: 'stages.finishing', accent: 'var(--stage-finish-acc)', bg: 'var(--stage-finish-bg)' },
  { id: 'dispatch', labelKey: 'stages.dispatch', accent: 'var(--stage-disp-acc)', bg: 'var(--stage-disp-bg)' },
];

/**
 * Map order status → current step index + anomaly tint.
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
  const isAnomaly = anomaly !== null;

  // Step sizing
  const dotSize = size === 'detail' ? 22 : 18;
  const ringWidth = size === 'detail' ? 4 : 3;
  const labelClass =
    size === 'detail'
      ? 'text-[11px]'
      : 'text-[10px]';

  // Active-step accent (anomaly overrides stage accent)
  const activeAccent = isAnomaly
    ? anomaly === 'stuck'
      ? 'var(--status-stuck-acc)'
      : 'var(--status-rework-acc)'
    : STEPS[Math.min(index, STEPS.length - 1)]?.accent ?? 'var(--color-primary)';
  const activeRing = isAnomaly
    ? anomaly === 'stuck'
      ? 'var(--status-stuck-bg)'
      : 'var(--status-rework-bg)'
    : STEPS[Math.min(index, STEPS.length - 1)]?.bg ?? 'var(--color-primary-soft)';

  // Connector fill ratio
  const totalSteps = STEPS.length;
  const fillPct = Math.max(0, Math.min(1, index / (totalSteps - 1))) * 100;

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        {/* connector line — sits behind the dots */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-full bg-[var(--color-border)]"
          style={{ transform: 'translateY(50%)', marginTop: dotSize / 2 - 1 }}
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 h-[2px] rounded-full transition-[width] duration-300"
          style={{
            width: `${fillPct}%`,
            backgroundColor: isAnomaly ? activeAccent : 'var(--color-foreground)',
            transform: 'translateY(50%)',
            marginTop: dotSize / 2 - 1,
            opacity: 0.7,
          }}
          aria-hidden
        />
        <ol className="flex justify-between items-start relative z-10">
          {STEPS.map((step, i) => {
            const isCompleted = i < index;
            const isCurrent = i === index;

            return (
              <li
                key={step.id}
                className="flex flex-col items-center min-w-[44px]"
              >
                <span
                  className={cn(
                    'rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors',
                  )}
                  style={{
                    width: dotSize,
                    height: dotSize,
                    backgroundColor: isCompleted
                      ? 'var(--color-success)'
                      : isCurrent
                        ? activeAccent
                        : 'var(--color-surface)',
                    borderColor: isCompleted || isCurrent ? '#fff' : 'var(--color-border-strong)',
                    boxShadow: isCurrent
                      ? `0 0 0 ${ringWidth}px ${activeRing}, 0 1px 2px rgba(14,23,48,0.08)`
                      : '0 1px 2px rgba(14,23,48,0.05)',
                  }}
                >
                  {isCompleted ? (
                    <Check size={dotSize * 0.55} strokeWidth={3} color="#fff" />
                  ) : isCurrent ? (
                    <span
                      style={{
                        width: dotSize * 0.3,
                        height: dotSize * 0.3,
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                      }}
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    'mt-1.5 font-mono uppercase tracking-[0.06em]',
                    labelClass,
                    isCurrent
                      ? 'font-bold'
                      : isCompleted
                        ? 'font-semibold text-[var(--color-foreground)]'
                        : 'font-semibold text-[var(--color-muted-foreground-2)]',
                  )}
                  style={
                    isCurrent
                      ? { color: activeAccent }
                      : undefined
                  }
                >
                  {t(step.labelKey, { defaultValue: step.id })}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
