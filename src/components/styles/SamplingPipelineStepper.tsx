import { useTranslation } from 'react-i18next';
import { Check, Undo2 } from 'lucide-react';
import type { SamplingStatus } from '@/api/styles';
import { cn } from '@/lib/utils';

/**
 * Forward steps only — the linear sampling pipeline, matching the Stitch
 * workspace mock's 5-node stepper exactly: Pattern dev → Fabric sourcing →
 * Cutting → Ready for inspection → Sample sign-off. The legacy
 * `in_progress_stitching` / `handed_over_for_inspection` statuses are NOT
 * shown here (the mock collapses them); a row still carrying one of those
 * resolves to index -1, which the highlight logic already tolerates.
 *
 * `corrections_needed` is intentionally NOT in this array: it's a
 * regression / off-ramp, surfaced as a separate "Send back for
 * corrections" button. `approved_for_production` sits at the end (rendered
 * as "Sample sign-off" with a lock affordance) — clicking it routes
 * through the sample sign-off dialog instead of patching the value.
 */
const STEPS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'ready_for_inspection',
  'ready_for_production',
];

interface Props {
  samplingStatus: SamplingStatus | null;
  /** Optional click-to-set handler — null disables interactivity. */
  onStepClick?: (next: SamplingStatus) => void;
  /**
   * Invoked when the user picks the terminal "Approved" option. The
   * host page opens the sample sign-off dialog (DXF / fit checks)
   * rather than patching `samplingStatus` straight to approved.
   */
  onApproveClick?: () => void;
}

/**
 * Horizontal connected-node progress stepper — matches the Stitch
 * workspace mock 1:1: a continuous hairline rail behind five evenly-
 * spaced nodes (Pattern dev → Fabric sourcing → Cutting → Ready for
 * inspection → Sample sign-off), labels below each node.
 *
 * Done nodes render a filled check, the active node a ringed dot, and
 * upcoming nodes their index. Clicking a node advances the live
 * `samplingStatus` via `onStepClick`; the terminal node routes through
 * the host's sign-off dialog (`onApproveClick`) instead of patching the
 * value directly. "Send back for corrections" lives in the host's action
 * bar, not in this strip.
 */
export default function SamplingPipelineStepper({
  samplingStatus,
  onStepClick,
  onApproveClick,
}: Props) {
  const { t } = useTranslation();
  // The terminal node reads "Sample sign-off" per the Stitch mock (the
  // shared `samplingSteps.approved_for_production` label — "Approved" — is
  // kept untouched for the registry/table surfaces).
  const stepLabel = (step: SamplingStatus) =>
    step === 'ready_for_production'
      ? t('admin.styles.workspace.sampleSignOff', {
          defaultValue: 'Sample sign-off',
        })
      : t(`admin.styles.samplingSteps.${step}`);
  const inCorrections = samplingStatus === 'corrections_needed';
  // Index into the forward STEPS array. `corrections_needed` doesn't
  // map to an index and intentionally returns -1 → no pill highlighted.
  const idx = !inCorrections && samplingStatus
    ? STEPS.indexOf(samplingStatus)
    : -1;
  // When the style has no sampling status yet (fresh out of intake),
  // we fall back to making the FIRST step the writable chip so the
  // user always has somewhere to click.
  // When the style has no sampling status yet (fresh out of intake),
  // fall back to step 0 so the user has somewhere to click. When the
  // style is in `corrections_needed`, idx is also -1 — but in that
  // case the active state is "off the linear path"; pretending step 1
  // is writable would misrepresent the progress, so we suppress the
  // fallback and leave NO chip writable until the user picks via the
  // popover that opens from any pill click.
  const writableIdx = inCorrections ? -1 : idx === -1 ? 0 : idx;
  const clickable = !!onStepClick;

  // Click handler for a node — advances the live samplingStatus. The
  // terminal node routes through the host's sign-off dialog rather than
  // patching the value directly.
  const onNode = (step: SamplingStatus) => {
    if (!clickable) return;
    if (step === 'ready_for_production') {
      onApproveClick?.();
      return;
    }
    // Don't let a tap on an already-completed (past) node silently regress
    // the live samplingStatus. Re-selecting the current step or moving
    // forward is fine; going BACKWARD is the explicit "Send back for
    // corrections" off-ramp in the host's action bar, not a casual node tap.
    const target = STEPS.indexOf(step);
    if (idx >= 0 && target >= 0 && target < idx) return;
    onStepClick?.(step);
  };

  return (
    <div className="space-y-3">
      {inCorrections && (
        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--status-rework-bg,var(--color-surface-2))] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-foreground)]">
          <Undo2 size={13} aria-hidden />
          {t('admin.styles.workspace.inCorrections', {
            defaultValue: 'Sent back for corrections',
          })}
        </div>
      )}

      {/* Horizontal connected-node stepper — matches the Stitch mock 1:1:
          a continuous hairline behind evenly-spaced nodes, labels below.
          Done nodes carry a check, the active node a ringed dot, upcoming
          nodes their index. Rendered in the app's tokens. */}
      <div className="relative flex w-full items-start">
        {/* Connector rail behind the node circles (top-aligned to the
            12px node radius). */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-3 h-px bg-[var(--color-border)]"
        />
        <ol className="relative z-10 flex w-full justify-between">
          {STEPS.map((step, i) => {
            const isActive = i === idx || (idx === -1 && i === writableIdx);
            const isDone = idx >= 0 && i < idx;
            return (
              <li
                key={step}
                className="flex flex-col items-center gap-2 bg-[var(--color-surface)] px-2"
              >
                <button
                  type="button"
                  // Completed nodes are non-interactive — clicking one would
                  // only ever regress, which is the explicit corrections
                  // off-ramp, not this strip.
                  disabled={!clickable || isDone}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => onNode(step)}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                    clickable && !isDone && 'cursor-pointer hover:opacity-90',
                    isDone
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : isActive
                        ? 'border-2 border-[var(--color-primary)] bg-[var(--color-surface)]'
                        : 'border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-muted-foreground)]',
                  )}
                >
                  {isDone ? (
                    <Check size={14} strokeWidth={3} aria-hidden />
                  ) : isActive ? (
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full bg-[var(--color-primary)]"
                    />
                  ) : (
                    i + 1
                  )}
                </button>
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-[0.05em] text-center',
                    isActive
                      ? 'font-bold text-[var(--color-primary)]'
                      : isDone
                        ? 'text-[var(--color-foreground)]'
                        : 'text-[var(--color-muted-foreground)]',
                  )}
                >
                  {stepLabel(step)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
