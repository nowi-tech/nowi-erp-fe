import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronRight, Lock, Undo2 } from 'lucide-react';
import type { SamplingStatus } from '@/api/styles';
import { cn } from '@/lib/utils';

/**
 * Forward steps only — the linear sampling pipeline. `corrections_needed`
 * is intentionally NOT in this array: it's a regression / off-ramp, not
 * step 7. It surfaces as a separate "Send back for corrections" button
 * rendered next to the stepper. Approved sits at the end and is rendered
 * with a lock affordance — clicking it routes through the sample sign-off
 * dialog instead of patching the value directly.
 */
const STEPS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'in_progress_stitching',
  'ready_for_inspection',
  'handed_over_for_inspection',
  'approved_for_production',
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
  /**
   * Invoked when the user clicks "Send back for corrections". Sets
   * `samplingStatus = corrections_needed` via the host page so the
   * audit + side-effects stay consistent.
   */
  onSendBack?: () => void;
}

/**
 * Read-only progress strip + a single writable chip (the active step).
 *
 *   ① Pattern dev → ② Fabric ✓ → [③ Cutting ▾] → ④ Stitching → ⑤ Ready
 *
 * The strip shows linear progression at a glance. The active pill is
 * the only clickable one — it carries a chevron and opens a popover
 * with all 7 options so the user can advance, skip, or regress to any
 * step from a single control. The remaining pills are non-interactive
 * (numbered ticks + checkmarks). This is the Linear / GitHub status
 * pattern: visualize progress as a strip, but write through one chip.
 *
 * "Send back for corrections" stays a separate, demoted button.
 * `approved_for_production` is gated by the host's sign-off dialog —
 * picking it from the popover routes through `onApproveClick` instead
 * of patching the value directly.
 */
export default function SamplingPipelineStepper({
  samplingStatus,
  onStepClick,
  onApproveClick,
  onSendBack,
}: Props) {
  const { t } = useTranslation();
  const inCorrections = samplingStatus === 'corrections_needed';
  // Index into the forward STEPS array. `corrections_needed` doesn't
  // map to an index and intentionally returns -1 → no pill highlighted.
  const idx = !inCorrections && samplingStatus
    ? STEPS.indexOf(samplingStatus)
    : -1;
  // When the style has no sampling status yet (fresh out of intake),
  // we fall back to making the FIRST step the writable chip so the
  // user always has somewhere to click.
  const writableIdx = idx === -1 ? 0 : idx;
  const clickable = !!onStepClick;

  // Popover open state for the writable chip. Click-outside dismiss
  // is wired manually rather than via a portal to keep the markup
  // colocated with the strip.
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pickStep = (step: SamplingStatus) => {
    setOpen(false);
    if (step === 'approved_for_production' && onApproveClick) {
      onApproveClick();
      return;
    }
    onStepClick?.(step);
  };

  return (
    <div className="space-y-2">
      {inCorrections && (
        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--status-rework-bg,var(--color-surface-2))] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-foreground)]">
          <Undo2 size={13} aria-hidden />
          {t('admin.styles.workspace.inCorrections', {
            defaultValue: 'Sent back for corrections',
          })}
        </div>
      )}

      <div
        ref={wrapperRef}
        className="relative flex flex-wrap items-center gap-y-2"
      >
        <ol className="flex flex-wrap items-center gap-y-2">
          {STEPS.map((step, i) => {
            const isWritable = clickable && i === writableIdx;
            const isActive = i === idx;
            const isDone = idx >= 0 && i < idx;
            const isApprovedFinal = step === 'approved_for_production';
            return (
              <Fragment key={step}>
                <li>
                  {isWritable ? (
                    <button
                      type="button"
                      onClick={() => setOpen((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border font-medium transition-colors cursor-pointer hover:opacity-90',
                        isApprovedFinal
                          ? 'bg-[var(--status-ready-bg)] text-[var(--status-ready-ink)] border-[var(--status-ready-acc)]'
                          : 'bg-[var(--stage-stitch-bg)] text-[var(--stage-stitch-ink)] border-[var(--stage-stitch-acc)]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold',
                          isApprovedFinal
                            ? 'bg-[var(--status-ready-acc)] text-white'
                            : 'bg-[var(--stage-stitch-acc)] text-white',
                        )}
                      >
                        {isApprovedFinal ? (
                          <Check size={9} strokeWidth={3} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span>
                        {t(`admin.styles.samplingSteps.${step}`)}
                      </span>
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className="opacity-70"
                      />
                    </button>
                  ) : (
                    <span
                      aria-current={isActive ? 'step' : undefined}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border cursor-default',
                        isApprovedFinal
                          ? isDone
                            ? 'bg-[var(--status-ready-bg)] text-[var(--status-ready-ink)] border-[var(--status-ready-acc)] font-medium'
                            : 'bg-[var(--color-surface)] text-[var(--status-ready-ink)] border-[var(--status-ready-acc)]/60'
                          : isDone
                            ? 'bg-[var(--color-surface-2)] text-[var(--color-foreground)] border-[var(--color-border)]'
                            : 'bg-[var(--color-surface)] text-[var(--color-muted-foreground)] border-[var(--color-border)]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold',
                          isDone
                            ? 'bg-[var(--status-ready-acc)] text-white'
                            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                        )}
                      >
                        {isApprovedFinal && !isDone ? (
                          <Lock size={9} strokeWidth={2.5} />
                        ) : isDone ? (
                          <Check size={9} strokeWidth={3} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span>
                        {t(`admin.styles.samplingSteps.${step}`)}
                      </span>
                    </span>
                  )}
                </li>
                {i < STEPS.length - 1 && (
                  <li
                    aria-hidden
                    role="presentation"
                    className="inline-flex items-center"
                  >
                    <ChevronRight
                      size={14}
                      className={cn(
                        'mx-0.5 shrink-0',
                        isDone
                          ? 'text-[var(--status-ready-acc)]'
                          : 'text-[var(--color-muted-foreground)]/60',
                      )}
                    />
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>

        {/* "Send back for corrections" — visually demoted ghost button
            sitting next to the stepper. Hidden when there's no handler
            bound, or the style is already in corrections. */}
        {onSendBack && !inCorrections && (
          <button
            type="button"
            onClick={onSendBack}
            className="ml-3 inline-flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline-offset-2 hover:underline"
          >
            <Undo2 size={13} aria-hidden />
            {t('admin.styles.workspace.sendBack', {
              defaultValue: 'Send back for corrections',
            })}
          </button>
        )}

        {/* Status popover — list of all 7 steps with number + label +
            (for Approved) a small lock icon. Picking a step calls
            pickStep, which routes Approved through onApproveClick. */}
        {open && clickable && (
          <div
            role="listbox"
            aria-label={t('admin.styles.workspace.samplingStatus', {
              defaultValue: 'Sampling status',
            })}
            className="absolute z-20 top-full left-0 mt-1.5 min-w-[240px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)] py-1"
          >
            {STEPS.map((step, i) => {
              const isCurrent = i === idx;
              const isApprovedFinal = step === 'approved_for_production';
              return (
                <button
                  key={step}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => pickStep(step)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-muted)]',
                    isCurrent && 'bg-[var(--color-muted)]/60',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold shrink-0',
                      isApprovedFinal
                        ? 'bg-[var(--status-ready-acc)] text-white'
                        : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">
                    {t(`admin.styles.samplingSteps.${step}`)}
                  </span>
                  {isApprovedFinal && (
                    <Lock
                      size={11}
                      aria-hidden
                      className="text-[var(--color-muted-foreground)]"
                    />
                  )}
                  {isCurrent && (
                    <Check
                      size={12}
                      aria-hidden
                      className="text-[var(--color-primary)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
