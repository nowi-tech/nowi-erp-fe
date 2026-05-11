import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Pill / badge.
 *
 * - `default` / `secondary` / `outline` / `destructive` — neutral & semantic.
 * - `stitch` / `finish` / `disp` — stage-colored "soft" pills using the
 *   `--stage-*-bg` + `--stage-*-ink` tokens. Match the Stage system v2 design.
 * - `ready` / `rework` / `stuck` / `transit` — status pills with their own
 *   tinted backgrounds.
 *
 * Soft pills (stage + status) are designed to sit on tinted or neutral
 * surfaces without fighting the page background.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
        secondary:
          'border border-transparent bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        destructive:
          'border border-transparent bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]',
        outline:
          'border border-[var(--color-border)] text-[var(--color-foreground)]',
        success:
          'border border-transparent bg-[var(--color-success-bg)] text-[var(--status-ready-ink)]',
        warning:
          'border border-transparent bg-[var(--color-warning-bg)] text-[var(--status-rework-ink)]',

        // Stage pills (soft)
        stitch:
          'border border-transparent bg-[var(--stage-stitch-bg)] text-[var(--stage-stitch-ink)]',
        finish:
          'border border-transparent bg-[var(--stage-finish-bg)] text-[var(--stage-finish-ink)]',
        disp:
          'border border-transparent bg-[var(--stage-disp-bg)] text-[var(--stage-disp-ink)]',

        // Anomaly / state pills (soft)
        ready:
          'border border-transparent bg-[var(--status-ready-bg)] text-[var(--status-ready-ink)]',
        rework:
          'border border-transparent bg-[var(--status-rework-bg)] text-[var(--status-rework-ink)]',
        stuck:
          'border border-transparent bg-[var(--status-stuck-bg)] text-[var(--status-stuck-ink)]',
        transit:
          'border border-transparent bg-[var(--status-transit-bg)] text-[var(--status-transit-ink)]',
      },
      dot: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      dot: false,
    },
  },
);

const dotColorByVariant: Record<string, string> = {
  stitch: 'var(--stage-stitch-ink)',
  finish: 'var(--stage-finish-ink)',
  disp: 'var(--stage-disp-ink)',
  ready: 'var(--status-ready-ink)',
  rework: 'var(--status-rework-ink)',
  stuck: 'var(--status-stuck-ink)',
  transit: 'var(--status-transit-ink)',
  success: 'var(--status-ready-ink)',
  warning: 'var(--status-rework-ink)',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Render a small leading dot in the pill's ink color. */
  dot?: boolean;
}

function Badge({
  className,
  variant,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const v = (variant ?? 'default') as string;
  const dotColor = dotColorByVariant[v] ?? 'currentColor';
  return (
    <div className={cn(badgeVariants({ variant, dot }), className)} {...props}>
      {dot && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
