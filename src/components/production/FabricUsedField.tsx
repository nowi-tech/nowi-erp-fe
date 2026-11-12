import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import type { BatchFabric, BatchSizeLine } from '@/api/production';
import { fmtQty, UOM_SHORT } from '@/lib/fabric';
import type { FabricUnitOfMeasure } from '@/api/types';

/** A typed fabric-used value, remembered with the estimate it replaced. */
export type FabricUsedEdit = { value: string; forEstimate: number } | null;

/** What to send: the typed value while the pieces are unchanged, else the fresh estimate (blank when there is none). */
export function fabricUsedValue(edit: FabricUsedEdit, estimate: number): string {
  if (edit && edit.forEstimate === estimate) return edit.value;
  return estimate > 0 ? String(estimate) : '';
}

/** Pieces cut in this save × each size's per-piece estimate. */
export function estimateFabric(sizes: BatchSizeLine[], cutBySku: Record<string, number>): number {
  const n = sizes.reduce((s, l) => s + (cutBySku[l.sku] ?? 0) * (l.fabricPerPiece ?? 0), 0);
  return Math.round(n * 100) / 100;
}

/**
 * "Fabric used: [219] m — correct?" asked when cutting is saved. Prefilled
 * from the estimate; the confirmed number is what leaves fabric stock (less
 * anything already issued to the lot).
 */
export default function FabricUsedField({
  fabric,
  estimate,
  value,
  onChange,
}: {
  fabric: BatchFabric;
  estimate: number;
  /** null = untouched, follow the estimate. */
  value: FabricUsedEdit;
  onChange: (v: FabricUsedEdit) => void;
}) {
  const { t } = useTranslation();
  const u = fabric.unit ? UOM_SHORT[fabric.unit as FabricUnitOfMeasure] ?? fabric.unit : '';
  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <label className="mb-1 block text-xs font-medium">
        {t('admin.production.fabricUsed.label', {
          defaultValue: 'Fabric used for these pieces — {{fabric}} {{colour}}',
          fabric: fabric.fabricName,
          colour: fabric.colourName,
        })}
        <span className="text-[var(--color-destructive)]"> *</span>
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="h-9 w-32 text-sm font-semibold"
          value={fabricUsedValue(value, estimate)}
          onChange={(e) => onChange({ value: e.target.value, forEstimate: estimate })}
        />
        <span className="text-sm">{u}</span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        {t('admin.production.fabricUsed.hint', {
          defaultValue: 'Estimate {{estimate}} · issued to lot {{issued}}',
          estimate: fmtQty(estimate, fabric.unit),
          issued: fmtQty(fabric.issued, fabric.unit),
        })}
      </p>
    </div>
  );
}
