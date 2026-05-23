import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption<V extends string | number = string | number> {
  value: V;
  /** The text shown in the list and the trigger when selected. */
  label: string;
  /** Optional sublabel rendered as small muted text below the label. */
  sublabel?: string;
  /** Optional right-aligned pill / badge JSX. */
  trailing?: ReactNode;
  /** Optional extra haystack text for searching that isn't shown. */
  searchText?: string;
  disabled?: boolean;
}

interface Props<V extends string | number = string | number> {
  value: V | null;
  options: ComboboxOption<V>[];
  onChange: (next: V | null) => void;
  /**
   * Fires when the user clicks the first-row "+ Add" action.
   * The `typed` arg is the current search query — pass it through so
   * the create modal (or free-text commit) can prefill the name field.
   * When the typed value is empty, this is the generic "+ Add new" path.
   */
  onAddNew?: (typed: string) => void;
  /**
   * Label shown for the generic "+ Add new" row (empty query).
   * When the user has typed something with no match, the label
   * auto-switches to `+ Add "<typed value>"` regardless of this prop.
   */
  addNewLabel?: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  /** Tailwind className for the trigger. */
  className?: string;
  /** ARIA label for the trigger button. */
  ariaLabel?: string;
}

/**
 * Searchable combobox primitive. Used for the Category and Fabric
 * pickers on the intake form. Built locally (no Radix Combobox yet)
 * but follows the same keyboard contract:
 *   - Enter / Space opens; Esc closes; ↑/↓ moves the active row;
 *     Enter selects; typing filters; clicking outside closes.
 *
 * Visual:
 *   ┌────────────────────────── ▾ ┐
 *   │ <Selected label>             │
 *   └──────────────────────────────┘
 *      ▼ open
 *   ┌──────────────────────────────┐
 *   │ 🔍 [search]                   │
 *   ├──────────────────────────────┤
 *   │ + Add new <thing>            │
 *   │ ─────────────                │
 *   │ Option A           pill      │
 *   │ Option B           pill      │
 *   └──────────────────────────────┘
 */
export function Combobox<V extends string | number = string | number>({
  value,
  options,
  onChange,
  onAddNew,
  addNewLabel,
  placeholder = 'Select…',
  emptyLabel = 'No matches.',
  disabled = false,
  className,
  ariaLabel,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.sublabel ?? ''} ${o.searchText ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  // Reset active index whenever the visible list changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [query, open]);

  // Outside click → close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Focus the search input on open.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const commit = useCallback(
    (opt: ComboboxOption<V>) => {
      onChange(opt.value);
      close();
    },
    [onChange, close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // If the typed query has no exact match and "+ Add" is wired up,
      // commit the typed value directly. This makes the picker feel
      // like a free-form input when the user types something new.
      const q = query.trim();
      const exact = filtered.find(
        (o) => o.label.toLowerCase() === q.toLowerCase(),
      );
      if (q && !exact && onAddNew) {
        close();
        onAddNew(q);
        return;
      }
      const o = filtered[activeIdx];
      if (o && !o.disabled) commit(o);
    }
  };

  const trimmedQuery = query.trim();
  const exactMatch = useMemo(
    () =>
      trimmedQuery
        ? filtered.find(
            (o) => o.label.toLowerCase() === trimmedQuery.toLowerCase(),
          )
        : undefined,
    [filtered, trimmedQuery],
  );
  // "+ Add ..." row label switches to the typed value when there's no
  // exact match in the list. Empty query → generic "Add new" label.
  const addRowLabel = trimmedQuery
    ? exactMatch
      ? null
      : `Add "${trimmedQuery}"`
    : (addNewLabel ?? 'Add new');

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex w-full h-12 items-center justify-between gap-2 rounded-[10px] border border-[var(--color-input)] bg-white px-3.5 py-2 text-left text-[15px] text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span
          className={cn(
            'truncate',
            !selected && 'text-[var(--color-muted-foreground)]',
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-[var(--color-muted-foreground)]"
        />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
          role="listbox"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2.5 py-2">
            <Search
              size={14}
              className="shrink-0 text-[var(--color-muted-foreground)]"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              className="w-full bg-transparent text-[14px] focus:outline-none placeholder:text-[var(--color-muted-foreground)]"
            />
          </div>

          <div className="max-h-[260px] overflow-y-auto py-1">
            {onAddNew && addRowLabel && (
              <button
                type="button"
                onClick={() => {
                  const typed = trimmedQuery;
                  close();
                  onAddNew(typed);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
              >
                <Plus size={14} />
                <span className="font-medium">{addRowLabel}</span>
              </button>
            )}
            {onAddNew && addRowLabel && filtered.length > 0 && (
              <div className="my-1 border-t border-[var(--color-border)]" />
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-[var(--color-muted-foreground)]">
                {emptyLabel}
              </div>
            ) : (
              filtered.map((o, idx) => {
                const isSelected = o.value === value;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={String(o.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={o.disabled}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => commit(o)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[14px]',
                      o.disabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer',
                      isActive
                        ? 'bg-[var(--color-muted)]'
                        : 'hover:bg-[var(--color-muted)]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--color-foreground)]">
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span className="block truncate text-[12px] text-[var(--color-muted-foreground)]">
                          {o.sublabel}
                        </span>
                      )}
                    </span>
                    {o.trailing && <span className="shrink-0">{o.trailing}</span>}
                    {isSelected && !o.trailing && (
                      <Check
                        size={14}
                        className="shrink-0 text-[var(--color-primary)]"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
