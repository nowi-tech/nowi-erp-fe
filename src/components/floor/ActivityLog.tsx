import { useTranslation } from 'react-i18next';
import type { ReceiptRow } from '@/api/receipts';
import type { ScrapRow } from '@/api/scrap';
import { cn } from '@/lib/utils';

export type ActivityItem =
  | { type: 'receipt'; id: string; at: string; row: ReceiptRow }
  | { type: 'scrap'; id: string; at: string; row: ScrapRow };

interface ActivityLogProps {
  items: ActivityItem[];
  /** Section heading. Falls back to "Lot activity". */
  title?: string;
  /** Optional message when there are zero items. If absent, the section is hidden. */
  emptyText?: string;
  /** Top-margin for the section; useful when stacked under a form. */
  className?: string;
  /**
   * If set and `items.length >= truncatedAt`, we render a footer note
   * warning that older rows may be hidden. Pass the same value used as
   * the API `take=` limit so the threshold matches reality.
   */
  truncatedAt?: number;
}

/**
 * Shared activity feed for the stitching flow: forward receipts + scrap
 * events on a lot. Used by both the data-entry screen and the dedicated
 * worked-on detail page so both surfaces stay in sync.
 *
 * SKU is deliberately not shown — floor masters work by size, not SKU,
 * and the size badge on each row already conveys the dimension that matters.
 */
export function ActivityLog({
  items,
  title,
  emptyText,
  className,
  truncatedAt,
}: ActivityLogProps) {
  const { t } = useTranslation();
  if (items.length === 0 && !emptyText) return null;
  const truncated = truncatedAt != null && items.length >= truncatedAt;
  return (
    <section
      className={cn(
        'rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] overflow-hidden',
        className,
      )}
    >
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[var(--color-muted-foreground)]">
          {title ?? t('stitching.lot.activity', { defaultValue: 'Lot activity' })}
        </h3>
        {items.length > 0 && (
          <span className="font-mono text-[11px] text-[var(--color-muted-foreground)] tabular-nums">
            {items.length}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-[var(--color-muted-foreground)]">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {truncated && (
        <p className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-[var(--color-muted-foreground)] border-t border-[var(--color-border)] bg-[var(--color-background)]">
          {t('common.showingFirstN', {
            defaultValue:
              'Showing the most recent {{n}} — older rows are not loaded.',
            n: truncatedAt,
          })}
        </p>
      )}
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { t } = useTranslation();
  const isScrap = item.type === 'scrap';
  const label =
    item.type === 'scrap'
      ? t('stitching.lot.scrapped', { defaultValue: 'Scrapped' })
      : item.row.kind === 'forward'
        ? t('stitching.lot.forwarded', { defaultValue: 'Forwarded' })
        : item.row.kind === 'rework_redo'
          ? t('admin.locator.filters.rework', { defaultValue: 'Rework' })
          : item.row.kind;
  const actor =
    item.type === 'scrap' ? item.row.scrappedByName : item.row.receivedByName;
  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <div
        className={cn(
          'mt-0.5 min-w-[34px] h-7 px-1.5 rounded-md flex items-center justify-center font-semibold text-xs',
          isScrap
            ? 'bg-[var(--color-destructive-bg)] text-[var(--color-destructive-strong)]'
            : 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
        )}
      >
        {item.row.sizeLabel}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              'font-semibold text-[14px]',
              isScrap
                ? 'text-[var(--color-destructive-strong)]'
                : 'text-[var(--color-foreground)]',
            )}
          >
            {label}
          </span>
          <span className="font-mono tabular-nums text-[var(--color-foreground-2)]">
            ×{item.row.qty}
          </span>
        </div>
        {actor && (
          <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
            {t('common.by', { defaultValue: 'by' })} {actor}
          </p>
        )}
        {item.type === 'scrap' && item.row.reason && (
          <p className="mt-0.5 text-[13px] text-[var(--color-muted-foreground)]">
            {item.row.reason}
          </p>
        )}
      </div>
      <span className="font-mono text-[11px] text-[var(--color-muted-foreground)] shrink-0">
        {new Date(item.at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </li>
  );
}
