import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title?: ReactNode;
  message: ReactNode;
  /** Confirm button label (defaults to "Discard"). */
  confirmLabel?: string;
  /** Cancel button label (defaults to "Keep editing"). */
  cancelLabel?: string;
  /** Treat the action as destructive — confirm button gets a red accent. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight in-app confirmation modal.
 *
 * **Important**: this is the project's replacement for `window.confirm`,
 * `window.alert`, and `window.prompt`. Native browser dialogs are
 * jarring, can't be styled, freeze the JS thread, and disrupt Capacitor
 * WebView event flow on Android. Always use this component (or the
 * `Dialog` it builds on) instead.
 *
 * Built deliberately small — no portal, no animation library, no extra
 * deps — so it can be used as the confirm step inside the base `Dialog`
 * without circular indirection.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Discard',
  cancelLabel = 'Keep editing',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : 'Confirm'}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        // Click outside the panel = cancel (NOT a recursive confirm).
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-border)]',
          'bg-[var(--color-background)] text-[var(--color-foreground)] shadow-lg',
          'flex flex-col',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="border-b border-[var(--color-border)] px-4 py-3 font-semibold">
            {title}
          </div>
        )}
        <div className="px-4 py-4 text-sm text-[var(--color-foreground-2)]">
          {message}
        </div>
        <div className="border-t border-[var(--color-border)] px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'inline-flex h-9 items-center rounded-[var(--radius-sm)] px-3 text-sm font-medium text-white',
              destructive
                ? 'bg-[var(--status-stuck-acc,#b91c1c)] hover:opacity-90'
                : 'bg-[var(--color-primary)] hover:opacity-90',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
