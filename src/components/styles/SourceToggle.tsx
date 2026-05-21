import { cn } from '@/lib/utils';
import type { StyleSource } from '@/api/types';

interface Option {
  value: StyleSource;
  label: string;
}

interface Props {
  value: StyleSource;
  onChange: (next: StyleSource) => void;
  options?: Option[];
  disabled?: boolean;
}

const DEFAULT_OPTIONS: Option[] = [
  { value: 'sampling', label: 'Design submission' },
  { value: 'china_reverse', label: 'China Reverse' },
];

/** Segmented control — drives the New Intake "Source" toggle. */
export default function SourceToggle({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Source"
      className="bg-[var(--color-muted)] rounded-[var(--radius-md)] p-1 inline-flex gap-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'px-4 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors',
              active
                ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] font-medium shadow-sm'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
