import { useTranslation } from 'react-i18next';
import { CopyPlus } from 'lucide-react';
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
  // Copy one size's number onto every other size — the common case is the same
  // qty across the run. Uses the existing per-row setter, so both dialogs' state
  // updates stay functional and no extra prop is needed.
  const fillAll = (value: number) => {
    for (const r of rows) onQty(r.key, String(value));
  };
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
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="h-9 w-24 text-center text-sm font-semibold"
                    // Blank at zero — an entry box pre-filled with 0 forces you to
                    // clear it before typing.
                    value={r.qty === 0 ? '' : String(r.qty)}
                    placeholder="0"
                    onChange={(e) => onQty(r.key, e.target.value)}
                    aria-label={t('admin.production.send.qtyFor', {
                      defaultValue: 'Quantity for size {{size}}',
                      size: r.size,
                    })}
                  />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => fillAll(r.qty)}
                      disabled={r.qty === 0}
                      className="rounded p-1.5 text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-30"
                      title={t('admin.production.send.applyToAll', {
                        defaultValue: 'Use this quantity for every size',
                      })}
                      aria-label={t('admin.production.send.applyToAll', {
                        defaultValue: 'Use this quantity for every size',
                      })}
                    >
                      <CopyPlus size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
