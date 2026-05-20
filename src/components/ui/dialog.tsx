import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Element id (or ref) to autofocus when the dialog opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Lightweight modal dialog. Keyboard-dismissable with Escape, traps focus on
 * the provided initial element. Built locally because shadcn/ui Dialog
 * (Radix) hasn't been pulled in yet.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  initialFocusRef,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose without putting it in effect deps — otherwise
  // a parent re-render (e.g. typing in a field inside the dialog) gives
  // onClose a new identity, re-runs the effect, and the deferred
  // initialFocusRef.focus() STEALS focus from the input after one
  // keystroke. The effect must run only on the open→close transition.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    // Defer focus until next paint so the element exists.
    const t = window.setTimeout(() => {
      initialFocusRef?.current?.focus();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
    // Only re-run when the dialog actually opens/closes. initialFocusRef
    // is a stable ref; onClose is read via onCloseRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={cn(
          'w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] shadow-lg',
          'flex flex-col max-h-[90vh]',
        )}
      >
        {title && (
          <div className="border-b border-[var(--color-border)] px-4 py-3 font-semibold">
            {title}
          </div>
        )}
        <div className="overflow-auto p-4 flex-1">{children}</div>
        {footer && (
          <div className="border-t border-[var(--color-border)] px-4 py-3 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
