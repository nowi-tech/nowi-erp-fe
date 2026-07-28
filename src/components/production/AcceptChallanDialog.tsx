import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductionDispatch } from '@/api/productionDispatch';

/**
 * Warehouse acceptance: the receiver confirms received-per-line. Each line
 * pre-fills with what was sent (the common case is "it all arrived"); a value
 * that differs is flagged as a mismatch server-side.
 */
export default function AcceptChallanDialog({
  open,
  busy,
  dispatch,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  dispatch: ProductionDispatch | null;
  onClose: () => void;
  onConfirm: (items: { itemId: number; qtyReceived: number }[]) => void;
}) {
  const { t } = useTranslation();
  const [received, setReceived] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!open || !dispatch) return;
    const seeded: Record<number, number> = {};
    for (const it of dispatch.items) seeded[it.id] = it.qtySent;
    setReceived(seeded);
  }, [open, dispatch]);

  const total = useMemo(
    () => Object.values(received).reduce((a, b) => a + b, 0),
    [received],
  );

  if (!dispatch) return null;

  const set = (id: number, raw: string) => {
    const n = Math.max(0, Number.parseInt(raw, 10) || 0);
    setReceived((prev) => ({ ...prev, [id]: n }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {t('admin.production.dispatch.accept.eyebrow', { defaultValue: 'Receive challan' })}
          </div>
          <div className="truncate text-base font-semibold">{dispatch.challanNo}</div>
          <div className="truncate text-[11px] font-normal text-[var(--color-muted-foreground)]">
            {dispatch.destWarehouseName}
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onConfirm(dispatch.items.map((it) => ({ itemId: it.id, qtyReceived: received[it.id] ?? 0 })))
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">
              {t('admin.production.dispatch.accept.confirm', {
                defaultValue: 'Confirm received · {{n}}',
                n: total,
              })}
            </span>
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.dispatch.item', { defaultValue: 'Item' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">SKU</th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.size', { defaultValue: 'Size' })}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">
                {t('admin.production.dispatch.sent', { defaultValue: 'Sent' })}
              </th>
              <th className="py-2 text-left font-semibold">
                {t('admin.production.dispatch.received', { defaultValue: 'Received' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {dispatch.items.map((it) => {
              const diff = (received[it.id] ?? 0) - it.qtySent;
              return (
                <tr key={it.id} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{it.name}</div>
                    {it.batchNo && (
                      <div className="font-mono text-[11px] text-[var(--color-muted-foreground)]">
                        {it.batchNo}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-[var(--color-muted-foreground)]">
                    {it.sku}
                  </td>
                  <td className="py-2 pr-3 font-semibold">{it.sizeLabel}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-muted-foreground)]">
                    {it.qtySent}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="h-9 w-20 text-center text-sm font-semibold"
                        value={String(received[it.id] ?? 0)}
                        onChange={(e) => set(it.id, e.target.value)}
                      />
                      {diff !== 0 && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                            diff < 0 ? 'bg-red-50 text-[var(--color-destructive)]' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
