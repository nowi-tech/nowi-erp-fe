import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** A distinct value present in a column, with its row count. */
export interface ColumnFilterOption {
  /** Stable value used in the filter set. */
  value: string;
  /** Display label (defaults to `value`). */
  label?: string;
  /** Number of rows carrying this value. */
  count: number;
}

interface ColumnFilterProps {
  /** Column title — used for the popover heading + a11y label. */
  title: string;
  /** All distinct values present in the column (from the current dataset). */
  options: ColumnFilterOption[];
  /**
   * Currently-excluded values. Empty = no filter (everything passes).
   * A value in this set is hidden from results.
   */
  excluded: string[];
  /** Emit the next excluded set. */
  onChange: (next: string[]) => void;
}

/**
 * Excel-style per-column filter — a funnel icon that sits in a table header.
 *
 * Clicking opens a popover listing the column's distinct values as
 * checkboxes. All checked = no filter; unchecking a value excludes its rows.
 * Closes on outside-click or Escape. The icon is filled/highlighted while a
 * filter is active.
 */
export function ColumnFilter({
  title,
  options,
  excluded,
  onChange,
}: ColumnFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const active = excluded.length > 0;

  // Position the portal popover under the funnel button.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 240;
    let left = r.left;
    // keep within the viewport
    if (left + width > window.innerWidth - 8)
      left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 4, left });
  }, [open]);

  // Close on outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (
        !popRef.current?.contains(tgt) &&
        !btnRef.current?.contains(tgt)
      )
        setOpen(false);
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

  const toggle = (value: string) => {
    onChange(
      excluded.includes(value)
        ? excluded.filter((v) => v !== value)
        : [...excluded, value],
    );
  };

  const allSelected = excluded.length === 0;
  const selectAll = () => onChange([]);
  const clearAll = () => onChange(options.map((o) => o.value));

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={t('common.columnFilter.label', {
          column: title,
          defaultValue: 'Filter {{column}}',
        })}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--radius-sm)] p-0.5 transition-colors',
          active
            ? 'text-[var(--color-primary)]'
            : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
          open && 'bg-[var(--color-muted)]',
        )}
      >
        <Filter
          size={12}
          fill={active ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={t('common.columnFilter.label', {
              column: title,
              defaultValue: 'Filter {{column}}',
            })}
            style={{ top: pos.top, left: pos.left, width: 240 }}
            className="fixed z-50 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-lg text-[13px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
              <span className="font-medium text-xs text-[var(--color-muted-foreground)]">
                {title}
              </span>
              <button
                type="button"
                onClick={allSelected ? clearAll : selectAll}
                className="text-[11px] text-[var(--color-primary)] hover:underline shrink-0"
              >
                {allSelected
                  ? t('common.columnFilter.clearAll', {
                      defaultValue: 'Clear',
                    })
                  : t('common.columnFilter.selectAll', {
                      defaultValue: 'Select all',
                    })}
              </button>
            </div>
            <ul className="max-h-[260px] overflow-y-auto py-1">
              {options.length === 0 && (
                <li className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {t('common.columnFilter.noValues', {
                    defaultValue: 'No values',
                  })}
                </li>
              )}
              {options.map((opt) => {
                const checked = !excluded.includes(opt.value);
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-muted)]"
                    >
                      <span
                        className={cn(
                          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border',
                          checked
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                            : 'border-[var(--color-border)]',
                        )}
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="flex-1 truncate">
                        {opt.label ?? opt.value}
                      </span>
                      <span className="tabular-nums text-[10px] text-[var(--color-muted-foreground)]">
                        {opt.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </span>
  );
}
