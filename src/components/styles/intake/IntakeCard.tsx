import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Section heading rendered in the card header. */
  title: ReactNode;
  /** Optional muted helper line under the title. */
  subtitle?: ReactNode;
  /** Optional right-aligned header slot (e.g. a "+ Add" button). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Shared card chrome for the New Intake form. Plain surface + hairline
 * border + a section header — matches the locked Stitch design. The
 * accent stripe + reviewer affordance live in `ReviewerCard`; this is
 * the neutral wrapper used for every other section.
 */
export default function IntakeCard({
  title,
  subtitle,
  action,
  className,
  children,
}: Props) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h3 className="font-serif text-[16px] text-[var(--color-foreground)]">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}
