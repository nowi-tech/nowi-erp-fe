import { cn } from '@/lib/utils';

export interface HomePillTab<T extends string> {
  id: T;
  label: string;
  /** Optional count badge. `undefined` hides the badge entirely. */
  count?: number;
}

interface HomePillFiltersProps<T extends string> {
  tabs: ReadonlyArray<HomePillTab<T>>;
  active: T;
  onChange: (id: T) => void;
  /** Optional aria-label for the tablist container. */
  ariaLabel?: string;
}

/**
 * Horizontally-scrollable pill row used by the FM Floor home and the
 * Finishing master home. Same visual language so floor and finishing
 * users see one navigation pattern, not two.
 *
 * Each pill has a label + optional count badge. Active pill fills with
 * primary-soft; inactive is white-with-hairline. Counts > 99 render as
 * "99+" so a busy day doesn't break the layout.
 */
export default function HomePillFilters<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: HomePillFiltersProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      // Hide scrollbar across engines while keeping scroll on narrow phones.
      // Pad the bottom slightly so the active pill's shadow doesn't get clipped.
      className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
    >
      {tabs.map((opt) => {
        const isActive = active === opt.id;
        const countLabel =
          opt.count == null
            ? null
            : opt.count > 99
              ? '99+'
              : String(opt.count);
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 pl-4 pr-3 h-10 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors border',
              isActive
                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-transparent'
                : 'bg-[var(--color-surface)] text-[var(--color-foreground-2)] border-[var(--color-border)] hover:bg-[var(--color-muted)]',
            )}
          >
            <span>{opt.label}</span>
            {countLabel != null && (
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums',
                  isActive
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                )}
              >
                {countLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
