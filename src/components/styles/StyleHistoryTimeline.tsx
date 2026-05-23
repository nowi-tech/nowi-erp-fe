import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { StyleAuditLog } from '@/api/types';

interface Props {
  /** Audit log entries — expected newest-first (BE orders by id desc). */
  auditLogs: StyleAuditLog[];
}

/** Human-readable action label. Falls back to the raw action string. */
function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Render a snapshot value compactly for the before/after diff. */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Vertical history timeline for a Style — renders the `style_audit_log`
 * rows returned (newest-first) by `getStyle`. Each entry shows the
 * action, actor, timestamp, an optional note, and a compact before/after
 * field diff.
 */
export default function StyleHistoryTimeline({ auditLogs }: Props) {
  const { t } = useTranslation();

  if (auditLogs.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t('admin.styles.drawer.history.empty')}
      </p>
    );
  }

  return (
    <ol className="relative ml-2 space-y-4 border-l border-[var(--color-border)] pl-5">
      {auditLogs.map((log) => {
        // Diff: keys that appear in `after` with a value different from
        // `before`. Both snapshots are partial field maps.
        const before = log.before ?? {};
        const after = log.after ?? {};
        const changedKeys = Object.keys(after).filter(
          (k) => fmt(before[k]) !== fmt(after[k]),
        );
        return (
          <li key={log.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <History size={9} className="text-[var(--color-primary)]" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-[var(--color-foreground)]">
                {actionLabel(log.action)}
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {t('admin.styles.drawer.history.by', {
                  name:
                    log.actor?.name ??
                    t('admin.styles.drawer.history.system'),
                })}
              </span>
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {new Date(log.createdAt).toLocaleString()}
            </div>
            {log.notes && (
              <p className="mt-1 text-sm text-[var(--color-foreground-2)]">
                <span className="font-medium">
                  {t('admin.styles.drawer.history.note')}:
                </span>{' '}
                {log.notes}
              </p>
            )}
            {changedKeys.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {changedKeys.map((k) => (
                  <li
                    key={k}
                    className="text-xs text-[var(--color-muted-foreground)]"
                  >
                    <span className="font-medium text-[var(--color-foreground-2)]">
                      {k}
                    </span>
                    : {fmt(before[k])}{' '}
                    <span className="text-[var(--color-muted-foreground)]">
                      →
                    </span>{' '}
                    {fmt(after[k])}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
