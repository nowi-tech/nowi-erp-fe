import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/api/types';

/**
 * 5-segment lot progress, matching the design's miniprog component.
 *
 * Stages (left → right):
 *   1. Received          (inbound from vendor)
 *   2. Stitching         (in stitching)
 *   3. Finishing         (in finishing)
 *   4. Ready             (finishing complete, awaiting dispatch / QC)
 *   5. Dispatched
 *
 * Each segment can be:
 *   - done    → muted accent of that stage
 *   - now     → full accent of that stage (current step)
 *   - pending → background
 *
 * If the order is in rework / stuck, the "now" segment uses the warning
 * (rework) or destructive (stuck) accent instead of the stage colour.
 */

type SegState = 'done' | 'now' | 'pending';

interface Stage {
  key: 'received' | 'stitch' | 'finish' | 'ready' | 'disp';
  doneFill: string; // muted version used for completed segments
  nowFill: string; // bright accent used for the current segment
}

const STAGES: Stage[] = [
  { key: 'received', doneFill: 'var(--color-border-strong)', nowFill: 'var(--color-foreground-3)' },
  { key: 'stitch',   doneFill: 'var(--stage-stitch-bd)',     nowFill: 'var(--stage-stitch-acc)' },
  { key: 'finish',   doneFill: 'var(--stage-finish-bd)',     nowFill: 'var(--stage-finish-acc)' },
  { key: 'ready',    doneFill: 'var(--status-ready-bg)',     nowFill: 'var(--status-ready-acc)' },
  { key: 'disp',     doneFill: 'var(--stage-disp-bd)',       nowFill: 'var(--stage-disp-acc)' },
];

function statesFor(status: OrderStatus | string | undefined): SegState[] {
  const s = (status ?? 'receiving') as OrderStatus;
  switch (s) {
    case 'receiving':
      return ['now', 'pending', 'pending', 'pending', 'pending'];
    case 'in_stitching':
      return ['done', 'now', 'pending', 'pending', 'pending'];
    case 'in_finishing':
      return ['done', 'done', 'now', 'pending', 'pending'];
    case 'in_rework':
      // We don't know which stage we re-entered without extra data;
      // show stitching as "now" since rework loops back through stitching.
      return ['done', 'now', 'pending', 'pending', 'pending'];
    case 'dispatched':
      return ['done', 'done', 'done', 'done', 'now'];
    case 'closed':
    case 'closed_with_adjustment':
      return ['done', 'done', 'done', 'done', 'done'];
    case 'stuck':
      // We don't know exactly where it stuck. Use ready as a generic mid-flight.
      return ['done', 'now', 'pending', 'pending', 'pending'];
    default:
      return ['pending', 'pending', 'pending', 'pending', 'pending'];
  }
}

function position(states: SegState[]): { current: number; total: number } {
  const total = states.length;
  const allDone = states.every((s) => s === 'done');
  if (allDone) return { current: total, total };
  const idx = states.findIndex((s) => s === 'now');
  return { current: idx + 1, total };
}

interface Props {
  status?: OrderStatus | string;
  /** Show the "n/5" position label after the segments. */
  showPosition?: boolean;
  /** Override the "now" segment colour (used for rework / stuck rows). */
  anomaly?: 'rework' | 'stuck';
  className?: string;
}

export default function LotProgress({
  status,
  showPosition = true,
  anomaly,
  className,
}: Props) {
  const states = statesFor(status);
  const { current, total } = position(states);

  const anomalyAcc =
    anomaly === 'rework'
      ? 'var(--status-rework-acc)'
      : anomaly === 'stuck'
        ? 'var(--status-stuck-acc)'
        : null;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-label={`Stage ${current} of ${total}`}
    >
      <span className="inline-flex items-center gap-[3px]">
        {states.map((state, i) => {
          const stage = STAGES[i];
          const background =
            state === 'pending'
              ? 'var(--color-background-2)'
              : state === 'done'
                ? stage.doneFill
                : (anomalyAcc ?? stage.nowFill);
          return (
            <span
              key={stage.key}
              aria-hidden
              className={cn(
                'h-1 w-3.5 rounded-[2px] transition-colors',
                state === 'now' && 'h-1.5 w-4',
              )}
              style={{ background }}
            />
          );
        })}
      </span>
      {showPosition && (
        <span className="font-mono text-[10.5px] text-[var(--color-muted-foreground)] tabular-nums">
          {current}/{total}
        </span>
      )}
    </span>
  );
}
