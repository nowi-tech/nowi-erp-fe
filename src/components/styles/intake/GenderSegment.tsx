import { cn } from '@/lib/utils';
import type { Gender } from '@/api/types';

interface Props {
  value: Gender;
  onChange: (next: Gender) => void;
  /** Override the visible labels (i18n). Order: women, men, unisex. */
  labels?: { women: string; men: string; unisex: string };
  disabled?: boolean;
}

const OPTIONS: Gender[] = ['women', 'men', 'unisex'];

/**
 * Three-button segmented control for the intake-form gender field.
 * Visually identical to `SourceToggle` but bound to the `Gender`
 * union — kept separate so its semantics are explicit at call sites.
 */
export default function GenderSegment({
  value,
  onChange,
  labels,
  disabled = false,
}: Props) {
  const text = (g: Gender) =>
    labels?.[g] ?? (g === 'women' ? 'Women' : g === 'men' ? 'Men' : 'Unisex');
  return (
    <div
      role="radiogroup"
      aria-label="Gender"
      className="inline-flex w-full gap-1 rounded-[var(--radius-md)] bg-[var(--color-muted)] p-1 sm:w-auto"
    >
      {OPTIONS.map((g) => {
        const active = value === g;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(g)}
            className={cn(
              'flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] transition-colors sm:flex-none sm:px-4',
              active
                ? 'bg-[var(--color-surface)] font-medium text-[var(--color-foreground)] shadow-sm'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {text(g)}
          </button>
        );
      })}
    </div>
  );
}
