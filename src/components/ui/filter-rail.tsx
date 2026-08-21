import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The filter rail — one bordered white container holding every list control,
 * its groups separated by hairline dividers. Introduced on Inventory Health and
 * shared from here so the production board and the sampling dashboard read the
 * same way instead of each hand-rolling a row of bordered selects.
 *
 * Left-aligned by design (`inline-flex`, `self-start`): the rail hugs its
 * controls rather than stretching across the page.
 */
export function FilterRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex">
      <div
        className={cn(
          'inline-flex flex-wrap items-stretch gap-2.5 self-start rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Hairline between two control groups inside a {@link FilterRail}. */
export function FilterRailDivider() {
  return <span aria-hidden className="my-0.5 w-px bg-neutral-300" />;
}

/**
 * Classes for a `<select>` sitting in the rail: borderless and transparent, so
 * the rail supplies the chrome and the control reads as part of it.
 */
export const RAIL_SELECT_CLASS =
  'h-9 cursor-pointer rounded-md border-none bg-transparent px-3 text-sm font-semibold text-[var(--color-foreground)] transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30';

/**
 * A segmented pill group (the "All stock · Real · Virtual" control). `value`
 * is compared against each option's `value`; the active one takes the primary
 * fill. Generic over the option union so callers keep their literal types.
 */
export function FilterRailSegments<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-semibold transition',
            value === o.value
              ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm'
              : 'text-neutral-500 hover:text-[var(--color-primary)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Multi-select for the rail — a select-shaped trigger that opens a checkbox
 * list. Deliberately NOT a {@link FilterRailSegments} pill: a segmented control
 * reads as exclusive (one lit, the rest dark), so people never discover they
 * can pick two. A dropdown that says "2 selected" does.
 *
 * `value` is the INCLUDED set; empty means "no filter", which is why the
 * trigger reads `allLabel` rather than "0 selected".
 *
 * Popover mechanics (portal + viewport clamp + outside-click/Escape) mirror
 * ColumnFilter — the house pattern, no dependency.
 */
export function FilterRailMultiSelect<T extends string>({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  /** Prefix on the trigger, e.g. "Status". */
  label: string;
  /** Trigger text when nothing is selected, e.g. "Status: All". */
  allLabel: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 232;
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (!popRef.current?.contains(tgt) && !btnRef.current?.contains(tgt)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (v: T) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const trigger =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? `${label}: ${options.find((o) => o.value === value[0])?.label ?? value[0]}`
        : `${label}: ${value.length}`;

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(RAIL_SELECT_CLASS, 'inline-flex items-center gap-1.5')}
      >
        {trigger}
        <ChevronDown size={14} aria-hidden className="text-[var(--color-muted-foreground)]" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            aria-multiselectable
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 232 }}
            className="z-[60] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-pop)]"
          >
            {options.map((o) => {
              const on = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      on
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                        : 'border-[var(--color-border)]',
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  {o.label}
                </button>
              );
            })}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-1 w-full border-t border-[var(--color-border)] px-3 py-1.5 text-left text-[12px] font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              >
                {allLabel}
              </button>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
