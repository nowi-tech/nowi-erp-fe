import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

/** Header click cycles a column: descending → ascending → off (the table's default order). */
export function useSortCycle<K extends string>() {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const onSort = (key: K): void => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') setSortDir('asc');
    else setSortKey(null);
  };
  return { sortKey, sortDir, onSort };
}

/** Clickable column header: faint ArrowUpDown when unsorted, solid ArrowUp/ArrowDown when active. */
export function SortHeader<K extends string>({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string;
  col: K;
  sortKey: K | null;
  sortDir: SortDir;
  onSort: (k: K) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === col;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSort(col);
      }}
      className={`items-center gap-1 uppercase tracking-[inherit] transition hover:text-[var(--color-foreground)] ${
        align === 'right' ? 'ml-auto flex justify-end' : 'inline-flex justify-start'
      } ${active ? 'text-[var(--color-primary)]' : ''}`}
    >
      {label}
      <Icon size={12} className={active ? 'text-[var(--color-primary)]' : 'opacity-60'} />
    </button>
  );
}

/** Compare two sort values in `dir`; missing values go last either way. */
export function compareNullsLast(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
  return dir === 'asc' ? a - b : b - a;
}

/** Date-only "last updated", full timestamp on hover. */
export function LastUpdated({ at }: { at: string | null | undefined }) {
  if (!at) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  const d = new Date(at);
  return <span title={d.toLocaleString()}>{d.toLocaleDateString()}</span>;
}
