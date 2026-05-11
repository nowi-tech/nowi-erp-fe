import { cn } from '@/lib/utils';

export type StageChipKey =
  | 'all'
  | 'stitch'
  | 'finish'
  | 'disp'
  | 'rework'
  | 'ready'
  | 'stuck';

interface StageChipOption {
  key: StageChipKey;
  label: string;
  /** Optional count to display next to the label. */
  count?: number;
}

interface Props {
  options: StageChipOption[];
  value: StageChipKey;
  onChange: (key: StageChipKey) => void;
  className?: string;
}

const TOKENS: Record<
  StageChipKey,
  { acc: string; bg: string; ink: string }
> = {
  all:    { acc: 'var(--color-foreground)',     bg: 'rgba(20, 33, 58, 0.06)',     ink: 'var(--color-foreground)' },
  stitch: { acc: 'var(--stage-stitch-acc)',     bg: 'var(--stage-stitch-bg)',     ink: 'var(--stage-stitch-ink)' },
  finish: { acc: 'var(--stage-finish-acc)',     bg: 'var(--stage-finish-bg)',     ink: 'var(--stage-finish-ink)' },
  disp:   { acc: 'var(--stage-disp-acc)',       bg: 'var(--stage-disp-bg)',       ink: 'var(--stage-disp-ink)'   },
  rework: { acc: 'var(--status-rework-acc)',    bg: 'var(--status-rework-bg)',    ink: 'var(--status-rework-ink)' },
  ready:  { acc: 'var(--status-ready-acc)',     bg: 'var(--status-ready-bg)',     ink: 'var(--status-ready-ink)' },
  stuck:  { acc: 'var(--status-stuck-acc)',     bg: 'var(--status-stuck-bg)',     ink: 'var(--status-stuck-ink)' },
};

/**
 * Segmented chip group for stage / status filtering.
 * Each chip carries the stage's accent dot and, when active, takes
 * its tinted background + ink color. Matches the Stage system v2 design.
 */
export default function StageChips({
  options,
  value,
  onChange,
  className,
}: Props) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="tablist"
    >
      {options.map((opt) => {
        const tokens = TOKENS[opt.key];
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            style={
              active
                ? {
                    background: tokens.bg,
                    borderColor: tokens.acc,
                    color: tokens.ink,
                  }
                : undefined
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'shadow-[var(--shadow-card)]'
                : 'border-[var(--color-border-strong)] text-[var(--color-foreground-3)] hover:bg-[var(--color-muted)]',
            )}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: tokens.acc }}
            />
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span className="font-mono text-[10.5px] opacity-70 tabular-nums">
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
