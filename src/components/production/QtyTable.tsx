import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

export interface QtyRow {
  key: string;
  size: string;
  sku: string;
  /** Units already committed across the style's open batches. Omit/0 = none. */
  inFlight?: number;
  qty: number;
}

/**
 * Per-size quantity entry table — shared by the Start Production intake and the
 * Send-to-Production popup. The "In production" column shows only when
 * `showInFlight` is set (the intake dedup context); the send popup hides it.
 */
export default function QtyTable({
  rows,
  onQty,
  showInFlight = false,
}: {
  rows: QtyRow[];
  onQty: (key: string, raw: string) => void;
  showInFlight?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            <th className="py-2 pr-3 text-left font-semibold">
              {t('admin.production.size', { defaultValue: 'Size' })}
            </th>
            <th className="py-2 pr-3 text-left font-semibold">SKU</th>
            {showInFlight && (
              <th className="py-2 pr-3 text-right font-semibold">
                {t('admin.production.intake.inFlight', { defaultValue: 'In production' })}
              </th>
            )}
            <th className="py-2 text-left font-semibold">
              {t('admin.production.send.qtyToMake', { defaultValue: 'Qty to make' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[var(--color-border)]/60">
              <td className="py-2 pr-3 font-semibold">{r.size}</td>
              <td className="py-2 pr-3 font-mono text-xs text-[var(--color-muted-foreground)]">
                {r.sku}
              </td>
              {showInFlight && (
                <td className="py-2 pr-3 text-right">
                  {(r.inFlight ?? 0) > 0 ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      {r.inFlight}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted-foreground)]">—</span>
                  )}
                </td>
              )}
              <td className="py-2">
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="h-9 w-24 text-center text-sm font-semibold"
                  value={String(r.qty)}
                  onChange={(e) => onQty(r.key, e.target.value)}
                  aria-label={t('admin.production.send.qtyFor', {
                    defaultValue: 'Quantity for size {{size}}',
                    size: r.size,
                  })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
