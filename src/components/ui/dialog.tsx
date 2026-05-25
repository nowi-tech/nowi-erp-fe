import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './confirm-dialog';

/**
 * Module-level Dialog stack. Each open Dialog pushes its id on mount
 * and pops on unmount. Only the top entry handles Escape so a nested
 * popover (e.g. the colour-picker "Add new" dialog opened inside the
 * edit modal) dismisses by itself before its host.
 */
const dialogStack: number[] = [];
let nextDialogId = 1;

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Element id (or ref) to autofocus when the dialog opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Tailwind max-width class for the dialog panel. Defaults to `max-w-md`. */
  maxWidthClassName?: string;
  /**
   * When true (default), clicking the backdrop or pressing Escape
   * prompts the user with `window.confirm()` before dismissing — so a
   * stray click outside an edit form can't silently drop their work.
   * Pass `false` for read-only viewers / non-form popovers where
   * accidental dismiss has no cost.
   */
  confirmOnClose?: boolean;
  /**
   * Override the confirm prompt. Defaults to "Discard changes?".
   */
  confirmMessage?: string;
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
  maxWidthClassName = 'max-w-md',
  confirmOnClose = true,
  confirmMessage,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Keep the latest onClose without putting it in effect deps — otherwise
  // a parent re-render (e.g. typing in a field inside the dialog) gives
  // onClose a new identity, re-runs the effect, and the deferred
  // initialFocusRef.focus() STEALS focus from the input after one
  // keystroke. The effect must run only on the open→close transition.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Wrapper so backdrop click + Escape both route through the same
  // "ask first?" guard. The explicit Cancel/X buttons inside the
  // dialog still call onClose() directly — only the ambient dismiss
  // paths trigger the confirm. Refs let the keydown listener (registered
  // once per open) read the latest props without re-binding.
  const confirmOnCloseRef = useRef(confirmOnClose);
  confirmOnCloseRef.current = confirmOnClose;
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Clear any pending discard-confirm when the dialog itself closes;
  // otherwise reopening shows a stale prompt for changes that no
  // longer apply.
  useEffect(() => {
    if (!open) setConfirmOpen(false);
  }, [open]);
  const requestClose = () => {
    if (confirmOnCloseRef.current) {
      setConfirmOpen(true);
      return;
    }
    onCloseRef.current();
  };

  // Each open Dialog instance gets a stable id. Keep it across renders.
  const dialogIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    // Claim a slot on the stack — the topmost id is the active one
    // for Escape handling. Pop on close so siblings underneath don't
    // think they're still topmost.
    const id = nextDialogId++;
    dialogIdRef.current = id;
    dialogStack.push(id);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialogStack[dialogStack.length - 1] !== id) return;
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer focus until next paint so the element exists.
    const t = window.setTimeout(() => {
      initialFocusRef?.current?.focus();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      const idx = dialogStack.lastIndexOf(id);
      if (idx >= 0) dialogStack.splice(idx, 1);
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
        if (e.target === overlayRef.current) requestClose();
      }}
    >
      <div
        className={cn(
          'w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] shadow-lg',
          'flex flex-col max-h-[90vh]',
          maxWidthClassName,
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

      {/* In-app discard-confirm. Replaces window.confirm so the experience
          is styleable, doesn't freeze the JS thread, and behaves
          consistently inside the Capacitor Android WebView. */}
      <ConfirmDialog
        open={confirmOpen}
        title="Discard changes?"
        message={
          confirmMessage ??
          'Any unsaved edits will be lost. Are you sure?'
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onCloseRef.current();
        }}
      />
    </div>
  );
}
