/**
 * sidebar-tooltip.tsx
 *
 * Two primitives used exclusively by the collapsed icon-rail sidebar:
 *
 *  • RailTooltip   — wraps a trigger element and shows a floating label to
 *                    its right on hover. Uses fixed positioning so it escapes
 *                    any overflow:hidden/scroll ancestor.
 *
 *  • SectionFlyout — pops out a mini panel listing all nav items in a section,
 *                    making them clickable without expanding the rail.
 *
 * Both are zero-dependency (React + ReactDOM portals only) and rely exclusively
 * on design tokens from tokens.css.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const SIDE_GAP = 8; // px gap between rail right edge and popup

/* ── RailTooltip ─────────────────────────────────────────────────────── */

interface RailTooltipProps {
  label: string;
  children: ReactNode;
}

/**
 * Wraps `children` in a block div; on hover shows a pill-shaped label
 * to the right via a React portal (escapes any overflow ancestor).
 */
export function RailTooltip({ label, children }: RailTooltipProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = useCallback(() => {
    if (triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
  }, []);

  const hide = useCallback(() => setRect(null), []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>

      {rect &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: rect.top + rect.height / 2,
              left: rect.right + SIDE_GAP,
              transform: 'translateY(-50%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
            className={cn(
              'whitespace-nowrap rounded-[var(--radius-md)] px-2.5 py-1',
              'bg-[var(--color-foreground)] text-[var(--color-surface)] text-xs font-medium',
              'shadow-[var(--shadow-pop)]',
              'animate-in fade-in zoom-in-95 duration-100',
            )}
          >
            {label}
            {/* Arrow pointing left */}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                right: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderRight: '5px solid var(--color-foreground)',
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── SectionFlyout ───────────────────────────────────────────────────── */

export interface FlyoutNavItem {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
}

interface SectionFlyoutProps {
  /** The section title displayed at the top of the flyout */
  sectionLabel: string;
  items: FlyoutNavItem[];
  /** Trigger element — typically the divider rendered in icon-rail mode */
  children: ReactNode;
  onNavigate?: () => void;
}

/**
 * Renders `children` as the hover trigger; on hover opens a floating panel
 * to the right listing every `item` as a clickable NavLink.
 *
 * Hovering either the trigger or the panel keeps it open; leaving both
 * hides it after a short delay to allow crossing the gap.
 */
export function SectionFlyout({
  sectionLabel,
  items,
  children,
  onNavigate,
}: SectionFlyoutProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 80);
  }, [cancelClose]);

  const openFlyout = useCallback(() => {
    cancelClose();
    if (triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen(true);
  }, [cancelClose]);

  // Keyboard: close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={openFlyout}
        onMouseLeave={scheduleClose}
        className="cursor-pointer"
      >
        {children}
      </div>

      {open &&
        triggerRect &&
        createPortal(
          <div
            role="menu"
            aria-label={sectionLabel}
            style={{
              position: 'fixed',
              top: triggerRect.top,
              left: triggerRect.right + SIDE_GAP,
              zIndex: 9998,
              minWidth: 180,
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className={cn(
              'rounded-[var(--radius-lg)] border border-[var(--color-border)]',
              'bg-[var(--color-sidebar)] shadow-[var(--shadow-pop)]',
              'py-1.5 overflow-hidden',
              'animate-in fade-in slide-in-from-left-1 duration-150',
            )}
          >
            {/* Section title */}
            <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-nav-section)]">
              {sectionLabel}
            </div>
            {/* Nav items */}
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-2.5 mx-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)]',
                    'text-sm transition-colors',
                    isActive
                      ? 'bg-[var(--color-nav-active-bg)] text-[var(--color-nav-active-ink)] font-medium'
                      : 'text-[var(--color-foreground-2)] hover:bg-[var(--color-nav-hover-bg)] hover:text-[var(--color-foreground)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'shrink-0',
                        isActive
                          ? 'text-[var(--color-primary)]'
                          : 'text-[var(--color-muted-foreground)] group-hover:text-[var(--color-foreground)]',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
