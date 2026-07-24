import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A detail pill portal'd to document.body so an ancestor's `overflow-x-auto`
 * (every scrollable table) can't clip it. Positioned centred just above `rect`.
 * Shared by TruncText / HoverTip and any hover-reveal that must escape a
 * scroll container.
 */
export function FloatingPill({
  rect,
  children,
}: {
  rect: DOMRect;
  children: ReactNode;
}) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
        transform: 'translate(-50%, -100%)',
      }}
      className="pointer-events-none z-50 max-w-[280px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--color-foreground)] shadow-md"
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * Truncating text that reveals its FULL value in a styled hover pill — but
 * ONLY when the text is actually clipped (scrollWidth > clientWidth), so short
 * values don't pop a redundant tooltip. Keeps the native `title` as a slow/a11y
 * fallback. The parent must constrain the width (fixed column / max-w + min-w-0)
 * for `truncate` to kick in.
 */
export function TruncText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = () => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth + 1) {
      setRect(el.getBoundingClientRect());
    }
  };
  const hide = () => setRect(null);
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        title={text}
        className={cn('block truncate', className)}
      >
        {text}
      </span>
      {rect && <FloatingPill rect={rect}>{text}</FloatingPill>}
    </>
  );
}
