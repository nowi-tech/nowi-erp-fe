import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface InlineOption {
  value: string;
  label: string;
}

interface Props {
  /** Current value (string enum key or '' for none). */
  value: string;
  /** Display text shown on the badge when not editing. */
  displayLabel: string;
  /** Full enum option list to render in the dropdown. */
  options: InlineOption[];
  /** Visual variant of the read-only badge. */
  badgeVariant?:
    | 'default'
    | 'secondary'
    | 'success'
    | 'outline'
    | 'stitch';
  /** Tailwind sizing utility — fonts/spacing. Defaults to text-[10px]. */
  className?: string;
  /** When false, falls back to a plain read-only badge (no click). */
  editable?: boolean;
  /** Async PATCH. Resolves on success, rejects on failure (cell reverts). */
  onCommit: (next: string) => Promise<void>;
  /** Placeholder shown for empty value. Defaults to "—". */
  unsetLabel?: string;
}

/**
 * Excel-style inline editable status cell. Renders as a Badge by
 * default; clicking the cell flips it to a `<select>` for one pick,
 * then PATCHes via `onCommit` with optimistic update + 1.5s "✓" flash.
 * On error, reverts to the original value.
 *
 * Used in StylesTable rows so a Pattern Master / Sampling Status /
 * Sample Approval can be flipped without leaving the registry.
 */
export default function InlineStatusCell({
  value,
  displayLabel,
  options,
  badgeVariant = 'outline',
  className,
  editable = true,
  onCommit,
  unsetLabel = '—',
}: Props) {
  // `displayed` is what the cell shows right now — optimistically
  // updated on pick, reverts to `value` on commit failure or when the
  // server value re-renders this component.
  const [displayed, setDisplayed] = useState(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setDisplayed(value);
  }, [value]);

  // Auto-focus the select once it mounts so the user lands directly on
  // the dropdown without an extra keystroke.
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  const commit = async (next: string) => {
    if (next === displayed) {
      setEditing(false);
      return;
    }
    const previous = displayed;
    setDisplayed(next); // optimistic
    setEditing(false);
    setSaving(true);
    try {
      await onCommit(next);
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), 1500);
    } catch {
      // Server rejected — roll back to the previous value. The toast
      // is the caller's responsibility (`onCommit` wraps the PATCH).
      setDisplayed(previous);
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <Badge variant={badgeVariant} className={cn('text-[10px]', className)}>
        {displayLabel || unsetLabel}
      </Badge>
    );
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={displayed}
        disabled={saving}
        onChange={(e) => void commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Escape cancels without committing.
          if (e.key === 'Escape') setEditing(false);
          e.stopPropagation();
        }}
        className={cn(
          'h-6 max-w-[180px] rounded-[var(--radius-sm)] border border-[var(--color-primary)] bg-white px-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          className,
        )}
      >
        <option value="">{unsetLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-full transition-colors',
        'hover:ring-1 hover:ring-[var(--color-primary)]/30',
        flashing && 'ring-1 ring-[var(--status-ready-acc,var(--color-primary))]',
      )}
      aria-label="Edit"
    >
      <Badge variant={badgeVariant} className={cn('text-[10px] cursor-pointer', className)}>
        {displayed
          ? options.find((o) => o.value === displayed)?.label ?? displayLabel
          : unsetLabel}
      </Badge>
      {flashing && (
        <CheckCircle2
          size={11}
          className="text-[var(--status-ready-acc,var(--color-primary))]"
        />
      )}
    </button>
  );
}
