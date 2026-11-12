import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface MoreMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * "⋯" button with a short list of rarer actions. Fixed-positioned from the
 * button so a scrolling table can't clip it.
 */
export function MoreMenu({ items, label }: { items: MoreMenuItem[]; label?: string }) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) {
        setPos(null);
      }
    };
    const shut = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [pos]);

  if (items.length === 0) return null;
  return (
    <>
      <Button
        ref={btn}
        size="sm"
        variant="outline"
        className="w-9 px-0"
        aria-label={label ?? t('common.more', 'More')}
        aria-expanded={pos != null}
        onClick={() => {
          if (pos) return setPos(null);
          const r = btn.current!.getBoundingClientRect();
          const right = window.innerWidth - r.right;
          // Near the bottom of the screen (a drawer footer, the last table row) open upwards.
          const roomBelow = window.innerHeight - r.bottom > 44 * items.length + 16;
          setPos(roomBelow ? { top: r.bottom + 4, right } : { bottom: window.innerHeight - r.top + 4, right });
        }}
      >
        <MoreHorizontal size={16} />
      </Button>
      {pos && (
        <div
          ref={menu}
          role="menu"
          style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="fixed z-[60] min-w-[10rem] rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setPos(null);
                it.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-[var(--color-muted)] disabled:pointer-events-none disabled:opacity-50',
                it.destructive && 'text-[var(--color-destructive)]',
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
