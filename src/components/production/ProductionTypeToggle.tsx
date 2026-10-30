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
      className="inline-flex gap-2"
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
            'rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
            value === v
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {productionTypeLabel(t, v)}
        </button>
      ))}
    </div>
  );
}
