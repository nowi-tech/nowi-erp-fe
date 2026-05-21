import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { SamplingStatus } from '@/api/styles';
import { cn } from '@/lib/utils';

const STEPS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'in_progress_stitching',
  'ready_for_inspection',
  'handed_over_for_inspection',
  'corrections_needed',
  'approved_for_production',
];

interface Props {
  samplingStatus: SamplingStatus | null;
  /** Optional click-to-set handler — null disables interactivity. */
  onStepClick?: (next: SamplingStatus) => void;
}

/**
 * 8-step pipeline (Stitch's `canonical_style_workspace.html`).
 *
 * Steps before the active one render as completed; the active step is
 * accented; downstream steps are muted. The final step ("approved") is
 * always rendered with the ready/green accent — it doubles as the
 * "ship-ready" indicator.
 */
export default function SamplingPipelineStepper({
  samplingStatus,
  onStepClick,
}: Props) {
  const { t } = useTranslation();
  const idx = samplingStatus ? STEPS.indexOf(samplingStatus) : -1;

  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((step, i) => {
        const isActive = i === idx;
        const isDone = idx >= 0 && i < idx;
        const isApprovedFinal = step === 'approved_for_production';
        const clickable = !!onStepClick;
        return (
          <li key={step}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick?.(step)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors',
                clickable && 'cursor-pointer hover:opacity-90',
                !clickable && 'cursor-default',
                isApprovedFinal && (isActive || isDone)
                  ? 'bg-[var(--status-ready-bg)] text-[var(--status-ready-ink)] border-[var(--status-ready-acc)]'
                  : isActive
                    ? 'bg-[var(--stage-stitch-bg)] text-[var(--stage-stitch-ink)] border-[var(--stage-stitch-acc)] font-medium'
                    : isDone
                      ? 'bg-[var(--color-surface-2)] text-[var(--color-foreground)] border-[var(--color-border)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted-foreground)] border-[var(--color-border)]',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold',
                  isDone || (isApprovedFinal && isActive)
                    ? 'bg-[var(--status-ready-acc)] text-white'
                    : isActive
                      ? 'bg-[var(--stage-stitch-acc)] text-white'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                )}
              >
                {isDone || (isApprovedFinal && isActive) ? (
                  <Check size={9} strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              <span>{t(`admin.styles.samplingSteps.${step}`)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
