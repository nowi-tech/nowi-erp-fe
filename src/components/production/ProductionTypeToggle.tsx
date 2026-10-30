import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { productionTypeLabel } from '@/lib/production';
import type { ProductionType } from '@/api/production';

const TYPES: ProductionType[] = ['low_moq', 'bulk'];

/** Low MOQ | Bulk segmented choice. `null` = not picked yet. */
export default function ProductionTypeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: ProductionType | null;
  onChange: (next: ProductionType) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t('admin.production.type.label', { defaultValue: 'Run type' })}
      className="inline-flex gap-1 rounded-[var(--radius-md)] bg-[var(--color-muted)] p-1"
    >
      {TYPES.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-[var(--radius-sm)] px-4 py-1.5 text-sm transition-colors',
            value === v
              ? 'bg-[var(--color-surface)] font-medium text-[var(--color-foreground)] shadow-sm'
              : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {productionTypeLabel(t, v)}
        </button>
      ))}
    </div>
  );
}
