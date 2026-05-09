import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  /** Number of currently active (non-default) filters — shown as a chip. */
  activeCount?: number;
  /** Filter form contents (inputs / selects). */
  children: ReactNode;
  /** Optional onClear; when provided, shows a "Clear all" link. */
  onClear?: () => void;
  /** Default open state on mobile. Defaults to false (collapsed). */
  defaultOpenMobile?: boolean;
}

/**
 * Wraps a block of filter inputs. On `lg` and up the inputs render directly
 * (same look as before). Below `lg` the card collapses behind a "Filters" bar
 * with the active count, freeing vertical space for the actual list/table.
 */
export default function CollapsibleFilters({
  activeCount = 0,
  children,
  onClear,
  defaultOpenMobile = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpenMobile);

  return (
    <Card>
      {/* Mobile toggle bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
          <SlidersHorizontal size={16} />
          {t('common.filters')}
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[11px]">
              {activeCount}
            </Badge>
          )}
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'text-[var(--color-muted-foreground)] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <CardContent
        className={cn(
          'pt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
          // mobile: only show grid when expanded
          open ? 'block lg:!block' : 'hidden lg:grid',
          // restore grid behavior on mobile when expanded
          open && 'grid',
        )}
      >
        {children}
        {onClear && activeCount > 0 && (
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-4 flex justify-end">
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline-offset-4 hover:underline"
            >
              {t('common.clearAll')}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
