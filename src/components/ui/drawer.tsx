import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Header content (left side — usually a title block). */
  title?: ReactNode;
  /** Subtitle below the title; rendered in mono / muted. */
  subtitle?: ReactNode;
  /** Optional inline action on the right of the header. */
  headerAction?: ReactNode;
  /**
   * Stage / status accent for the drawer header dot + soft top border.
   * One of: stitch / finish / disp / ready / rework / stuck — falls back
   * to ink (foreground) when omitted.
   */
  accent?:
    | 'stitch'
    | 'finish'
    | 'disp'
    | 'ready'
    | 'rework'
    | 'stuck'
    | 'ink';
  children: ReactNode;
  /** Sticky footer area (e.g. "Open full page" + "Close"). */
  footer?: ReactNode;
  /** Max-width override (default `420px`). */
  width?: string;
}

const ACCENTS: Record<NonNullable<DrawerProps['accent']>, string> = {
  ink:    'var(--color-foreground)',
  stitch: 'var(--stage-stitch-acc)',
  finish: 'var(--stage-finish-acc)',
  disp:   'var(--stage-disp-acc)',
  ready:  'var(--status-ready-acc)',
  rework: 'var(--status-rework-acc)',
  stuck:  'var(--status-stuck-acc)',
};

/**
 * Right-anchored slide-in panel — matches the Stage system v2 drawer.
 *
 * - Backdrop scrim closes the drawer.
 * - Esc closes the drawer.
 * - Body scroll is locked while open.
 * - Header carries a stage-coloured dot + 2px top accent line.
 *
 * Built without Radix to keep the dependency footprint small.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerAction,
  accent = 'ink',
  children,
  footer,
  width = '420px',
}: DrawerProps) {
  // Esc to close + body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-[var(--color-foreground)]/30 backdrop-blur-[2px] transition-opacity',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          width,
          ['--drawer-acc' as string]: ACCENTS[accent],
        }}
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 max-w-[92vw] flex flex-col',
          'bg-[var(--color-surface)] border-l border-[var(--color-border)]',
          'shadow-[var(--shadow-pop)]',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Top accent line */}
        <div
          aria-hidden
          className="h-[2px] w-full"
          style={{ background: 'var(--drawer-acc)' }}
        />

        <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            {title && (
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: 'var(--drawer-acc)' }}
                />
                <h2 className="font-serif text-xl font-semibold leading-tight truncate">
                  {title}
                </h2>
              </div>
            )}
            {subtitle && (
              <div className="mt-1 font-mono text-xs text-[var(--color-muted-foreground)] tracking-wide">
                {subtitle}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
