import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { listDestinationWarehouses } from '@/api/destinationWarehouses';
import type { DestinationWarehouse } from '@/api/types';
import type { AlterationEntry } from '@/api/alteration';

/** Good + altered pieces to a warehouse, which accepts the challan on the GRN page. */
export default function DispatchReturnDialog({
  entry,
  busy,
  onClose,
  onConfirm,
}: {
  entry: AlterationEntry | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (body: { destWarehouseId: number; items: { sku: string; qty: number }[] }) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [warehouses, setWarehouses] = useState<DestinationWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!entry) return;
    setQty(Object.fromEntries(entry.sizes.map((s) => [s.sku, s.qtyToDispatch])));
    listDestinationWarehouses()
      .then((w) => {
        const active = w.filter((x) => x.isActive);
        setWarehouses(active);
        // Same default as production: the auto-GRN warehouse, else the first active one.
        const preferred = active.find((x) => x.easyecomAutoGrn) ?? active[0];
        setWarehouseId(preferred ? preferred.id : '');
      })
      .catch(() =>
        toast.show(t('admin.alteration.warehousesFailed', { defaultValue: "Couldn't load warehouses." }), 'error'),
      );
  }, [entry, toast, t]);

  const lines = (entry?.sizes ?? []).filter((s) => s.qtyToDispatch > 0);
  const total = lines.reduce((a, s) => a + (qty[s.sku] ?? 0), 0);

  return (
    <Dialog
      open={entry != null}
      onClose={onClose}
      maxWidthClassName="max-w-md"
      title={
        <div className="text-base font-semibold">
          {t('admin.alteration.dispatchTitle', { defaultValue: 'Dispatch {{no}}', no: entry?.entryNo ?? '' })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy || warehouseId === '' || total === 0}
            onClick={() =>
              warehouseId !== '' &&
              onConfirm({
                destWarehouseId: warehouseId,
                items: lines.filter((s) => (qty[s.sku] ?? 0) > 0).map((s) => ({ sku: s.sku, qty: qty[s.sku] })),
              })
            }
          >
            {t('admin.production.dispatch.build.confirm', { defaultValue: 'Dispatch' })} · {total}
          </Button>
        </>
      }
    >
      {entry && (
        <div className="space-y-4">
          <div>
            <Label required>{t('admin.production.dispatch.build.warehouse', { defaultValue: 'To warehouse' })}</Label>
            <Select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">{t('admin.production.dispatch.build.pickWarehouse', { defaultValue: 'Select…' })}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <table className="text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <th className="py-2 pr-6 text-left font-semibold">
                  {t('admin.production.size', { defaultValue: 'Size' })}
                </th>
                <th className="py-2 pr-6 text-right font-semibold">
                  {t('admin.production.dispatch.build.remaining', { defaultValue: 'Remaining' })}
                </th>
                <th className="py-2 text-left font-semibold">
                  {t('admin.production.dispatch.build.qty', { defaultValue: 'Qty' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((s) => (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-6 font-semibold">{s.size}</td>
                  <td className="py-2 pr-6 text-right">{s.qtyToDispatch}</td>
                  <td className="py-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-9 w-20 text-center text-sm font-semibold"
                      value={qty[s.sku] ? String(qty[s.sku]) : ''}
                      placeholder="0"
                      onChange={(e) =>
                        setQty((prev) => ({
                          ...prev,
                          [s.sku]: Math.min(s.qtyToDispatch, Math.max(0, Number.parseInt(e.target.value, 10) || 0)),
                        }))
                      }
                      aria-label={`qty ${s.size}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
