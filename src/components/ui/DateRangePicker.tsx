import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DayPicker, type DateRange } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Polished date-range picker for the dashboard activity window. Replaces the
 * two native `<input type="date">` + reset button with one trigger + popover:
 * a presets sidebar (Today / Last 7·30·90 days / This year / This financial
 * year) and a dual-month react-day-picker range calendar, plus Cancel / Apply.
 *
 * OUTPUT CONTRACT: the parent owns `from`/`to` as LOCAL `YYYY-MM-DD` strings
 * (the same shape the dashboard cards + styles table consume). This component
 * never reaches `toISOString()` — every conversion goes through the local
 * `toLocalISO` / `fromLocalISO` helpers below, so an IST user in the small
 * hours never has "today" shift to yesterday (the bug `isoDaysAgo` guards).
 */

// ── Local-zone date helpers (NEVER toISOString — that formats in UTC) ──

/** `Date` → LOCAL `YYYY-MM-DD`, built from local Y/M/D parts. */
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** LOCAL `YYYY-MM-DD` → a `Date` at local midnight (no UTC parsing). */
function fromLocalISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today at local midnight. */
function localToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A local-midnight `Date` `n` days before today (0 = today). */
function daysAgo(n: number): Date {
  const d = localToday();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * India financial-year start (Apr 1) for the FY that contains `ref`. Months are
 * 0-indexed, so Jan–Mar (0–2) belong to the FY that began the previous calendar
 * year; Apr onward (3–11) to the current one.
 */
function indiaFyStart(ref: Date): Date {
  const y = ref.getMonth() < 3 ? ref.getFullYear() - 1 : ref.getFullYear();
  return new Date(y, 3, 1);
}

export interface PresetRange {
  key: string;
  label: string;
  /** Inclusive local-midnight bounds. */
  from: Date;
  to: Date;
}

/** Build the presets fresh on each open so "today" tracks the wall clock. */
function buildPresets(t: ReturnType<typeof useTranslation>['t']): PresetRange[] {
  const today = localToday();
  return [
    {
      key: 'today',
      label: t('dashboard.dateFilter.presets.today', { defaultValue: 'Today' }),
      from: today,
      to: today,
    },
    {
      key: 'last7',
      label: t('dashboard.dateFilter.presets.last7', {
        defaultValue: 'Last 7 days',
      }),
      from: daysAgo(6),
      to: today,
    },
    {
      key: 'last30',
      label: t('dashboard.dateFilter.presets.last30', {
        defaultValue: 'Last 30 days',
      }),
      from: daysAgo(29),
      to: today,
    },
    {
      key: 'last90',
      label: t('dashboard.dateFilter.presets.last90', {
        defaultValue: 'Last 90 days',
      }),
      from: daysAgo(89),
      to: today,
    },
    {
      key: 'thisYear',
      label: t('dashboard.dateFilter.presets.thisYear', {
        defaultValue: 'This year',
      }),
      from: new Date(today.getFullYear(), 0, 1),
      to: today,
    },
    {
      key: 'thisFy',
      label: t('dashboard.dateFilter.presets.thisFy', {
        defaultValue: 'This financial year',
      }),
      from: indiaFyStart(today),
      to: today,
    },
  ];
}

/** Short, locale-agnostic "Jun 5" style label for the trigger / range. */
function fmtShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Props {
  /** Current committed range — LOCAL `YYYY-MM-DD` strings. */
  from: string;
  to: string;
  /** Commit a new range. Both args are LOCAL `YYYY-MM-DD` strings. */
  onApply: (from: string, to: string) => void;
  /** Upper bound for selectable days (LOCAL `YYYY-MM-DD`). Defaults to today. */
  maxDate?: string;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onApply,
  maxDate,
  className,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Draft selection lives only while the popover is open; Apply commits it,
  // Cancel discards it. Seed from the committed props each time we open.
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  // Rebuild presets on each open so "today"-relative ranges stay current.
  const presets = useMemo(() => buildPresets(t), [t, open]);
  const maxDay = useMemo(
    () => (maxDate ? fromLocalISO(maxDate) : localToday()),
    [maxDate],
  );

  const committedFrom = useMemo(() => fromLocalISO(from), [from]);
  const committedTo = useMemo(() => fromLocalISO(to), [to]);

  // Which preset (if any) the committed range exactly matches → drives the
  // trigger label ("Last 7 days" reads better than "Jun 5 – Jun 11").
  const matchedPreset = useMemo(
    () =>
      presets.find(
        (p) => toLocalISO(p.from) === from && toLocalISO(p.to) === to,
      ) ?? null,
    [presets, from, to],
  );

  const triggerLabel = matchedPreset
    ? matchedPreset.label
    : from === to
      ? fmtShort(committedFrom)
      : `${fmtShort(committedFrom)} – ${fmtShort(committedTo)}`;

  const openPopover = useCallback(() => {
    setDraft({ from: committedFrom, to: committedTo });
    setOpen(true);
  }, [committedFrom, committedTo]);

  const close = useCallback(() => setOpen(false), []);

  // Outside click → close (discard). The popover is portalled to <body>, so a
  // click inside it isn't inside rootRef — check the portal node explicitly.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node;
      if (!rootRef.current?.contains(node) && !popRef.current?.contains(node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Esc → close (discard).
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, close]);

  // Position the portalled popover under the trigger; track scroll/resize.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 6, left: r.left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const applyPreset = useCallback((p: PresetRange) => {
    setDraft({ from: p.from, to: p.to });
  }, []);

  const apply = useCallback(() => {
    if (!draft?.from) {
      close();
      return;
    }
    // A single-day click leaves `to` undefined → treat it as a same-day range.
    const f = draft.from;
    const tEnd = draft.to ?? draft.from;
    onApply(toLocalISO(f), toLocalISO(tEnd));
    close();
  }, [draft, onApply, close]);

  // Default the calendar to show the month containing the draft's end (or
  // start), so reopening lands on the active range rather than today.
  const defaultMonth = draft?.to ?? draft?.from ?? committedTo;

  const dayBase =
    'h-9 w-9 rounded-[var(--radius-sm)] text-[13px] text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors';

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => (open ? close() : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-foreground)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] transition-colors"
      >
        <CalendarDays
          size={15}
          className="text-[var(--color-muted-foreground)]"
        />
        <span className="tabular-nums">{triggerLabel}</span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={t('dashboard.dateFilter.ariaLabel', {
              defaultValue: 'Select date range',
            })}
            style={{ position: 'fixed', top: rect.top, left: rect.left }}
            className="z-50 flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
          >
            <div className="flex flex-col sm:flex-row">
              {/* Presets sidebar */}
              <div className="flex shrink-0 flex-col gap-0.5 border-b border-[var(--color-border)] p-2 sm:w-44 sm:border-b-0 sm:border-r">
                {presets.map((p) => {
                  const active =
                    draft?.from &&
                    draft?.to &&
                    toLocalISO(draft.from) === toLocalISO(p.from) &&
                    toLocalISO(draft.to) === toLocalISO(p.to);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={cn(
                        'rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] transition-colors',
                        active
                          ? 'bg-[var(--color-primary-soft)] font-medium text-[var(--color-primary)]'
                          : 'text-[var(--color-foreground-2)] hover:bg-[var(--color-muted)]',
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Dual-month range calendar */}
              <div className="p-3">
                <DayPicker
                  mode="range"
                  numberOfMonths={2}
                  selected={draft}
                  onSelect={setDraft}
                  defaultMonth={defaultMonth}
                  disabled={{ after: maxDay }}
                  classNames={{
                    // `relative` so the absolutely-positioned nav arrows below
                    // scope to the calendar area — not the whole popover (which
                    // put the left arrow on top of the presets sidebar).
                    root: 'relative',
                    months: 'flex flex-col gap-4 sm:flex-row',
                    month: 'space-y-2',
                    month_caption:
                      'flex h-8 items-center justify-center px-8 text-[13px] font-medium text-[var(--color-foreground)]',
                    caption_label: 'tabular-nums',
                    nav: 'absolute inset-x-0 top-0 flex items-center justify-between px-1',
                    button_previous:
                      'inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:pointer-events-none disabled:opacity-30',
                    button_next:
                      'inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:pointer-events-none disabled:opacity-30',
                    month_grid: 'border-collapse',
                    weekdays: 'flex',
                    weekday:
                      'flex h-8 w-9 items-center justify-center text-[11px] font-medium text-[var(--color-muted-foreground)]',
                    week: 'flex',
                    day: 'p-0',
                    day_button: dayBase,
                    today:
                      '[&_button]:font-semibold [&_button]:text-[var(--color-primary)]',
                    outside:
                      '[&_button]:text-[var(--color-muted-foreground-2)]',
                    range_start:
                      'rounded-l-[var(--radius-sm)] [&_button]:bg-[var(--color-primary)] [&_button]:text-[var(--color-primary-foreground)] [&_button:hover]:bg-[var(--color-primary)]',
                    range_end:
                      'rounded-r-[var(--radius-sm)] [&_button]:bg-[var(--color-primary)] [&_button]:text-[var(--color-primary-foreground)] [&_button:hover]:bg-[var(--color-primary)]',
                    range_middle:
                      'bg-[var(--color-primary-soft)] [&_button]:rounded-none [&_button]:bg-transparent [&_button]:text-[var(--color-primary)] [&_button:hover]:bg-[var(--color-primary-soft)]',
                    disabled:
                      '[&_button]:pointer-events-none [&_button]:opacity-30',
                  }}
                />
              </div>
            </div>

            {/* Footer — Cancel / Apply */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-3 py-2">
              <Button size="sm" variant="outline" onClick={close}>
                {t('dashboard.dateFilter.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button size="sm" onClick={apply} disabled={!draft?.from}>
                {t('dashboard.dateFilter.apply', { defaultValue: 'Apply' })}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
