import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineItem {
  id: string | number;
  actor: string | null;
  /** What happened, after "actor — ". */
  label: ReactNode;
  /** Changed fields as short "Field: value" chips. */
  chips?: string[];
  note?: string | null;
  /** Extra line under the chips (links, figures). */
  extra?: ReactNode;
  at: string | Date;
}

/**
 * Dotted "actor — action" timeline in a box that scrolls inside a capped
 * height, so a long history never pushes the page. Newest dot is highlighted.
 */
export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="relative">
      <div className="overflow-y-auto p-5 max-h-[480px] [scrollbar-width:thin] [scrollbar-color:var(--color-muted-foreground-2)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--color-muted-foreground-2)]">
        <ol className="relative ml-1.5 border-l border-[var(--color-border)] space-y-5">
          {items.map((item, i) => (
            <li key={item.id} className="relative pl-5">
              <span
                aria-hidden
                className={cn(
                  'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-surface)]',
                  i === 0 ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted-foreground-2)]',
                )}
              />
              <div className="text-sm text-[var(--color-foreground)]">
                <span className="font-medium">{item.actor ?? '—'}</span>
                {' — '}
                <span className="text-[var(--color-muted-foreground)]">{item.label}</span>
              </div>
              {item.chips && item.chips.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.chips.map((c) => (
                    <span
                      key={c}
                      className="rounded-[6px] bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] text-[var(--color-foreground)]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {item.extra && <div className="mt-1.5">{item.extra}</div>}
              {item.note && (
                <div className="mt-1.5 text-[12px] italic text-[var(--color-muted-foreground)]">
                  “{item.note}”
                </div>
              )}
              <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)] tabular-nums">
                {new Date(item.at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
