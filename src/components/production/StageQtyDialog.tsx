import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TailorPicker from '@/components/production/TailorPicker';
import { type ProductionBatch, type StageQtyItem } from '@/api/production';

/** Pipeline → floor: pieces cut per size and the tailor (whose code suffixes the lot number). */
export default function StageQtyDialog({
  open,
  busy,
  batch,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  batch: ProductionBatch | null;
  onClose: () => void;
  onConfirm: (
    items: StageQtyItem[],
    extra?: { tailorId?: number; fabricFeasible?: boolean },
  ) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tailorId, setTailorId] = useState<number | ''>('');

  useEffect(() => {
    if (!open || !batch) return;
    // Seeded with the plan; cutting over plan is allowed, it happens on the floor.
    setQty(
      Object.fromEntries(batch.sizes.map((s) => [s.sku, Math.max(0, s.qtyPlanned - s.qtyCut)])),
    );
    setTailorId(batch.tailorId ?? '');
  }, [open, batch]);

  const total = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  if (!batch) return null;

  const set = (sku: string, raw: string) =>
    setQty((p) => ({ ...p, [sku]: Math.max(0, Number.parseInt(raw, 10) || 0) }));
  const verb = t('admin.production.stage.cutting', { defaultValue: 'Cutting' });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {verb}
          </div>
          <div className="truncate text-base font-semibold">
            {batch.name ?? batch.styleRef ?? batch.batchNo}
          </div>
          <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
            {batch.batchNo}
            {batch.tailorName ? ` · ${batch.tailorName}` : ''}
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
            disabled={busy || total <= 0 || tailorId === ''}
            onClick={() =>
              onConfirm(
                batch.sizes.map((s) => ({ sku: s.sku, qty: qty[s.sku] ?? 0 })),
                { tailorId: tailorId === '' ? undefined : tailorId },
              )
            }
          >
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.stage.confirm', {
                defaultValue: '{{verb}} · {{n}}',
                verb,
                n: total,
              })}
            </span>
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium">
          {t('admin.production.stage.tailor', { defaultValue: 'Tailor' })}
        </label>
        <TailorPicker
          value={tailorId === '' ? null : tailorId}
          onChange={(id) => setTailorId(id ?? '')}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.size', { defaultValue: 'Size' })}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">
                {t('admin.production.stage.prev.qtyPlanned', { defaultValue: 'Planned' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">{verb}</th>
            </tr>
          </thead>
          <tbody>
            {batch.sizes.map((s) => (
              <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                <td className="py-2 pr-3 font-semibold">{s.size}</td>
                <td className="py-2 pr-3 text-right text-[var(--color-muted-foreground)]">
                  {s.qtyPlanned}
                </td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="h-9 w-24 text-center text-sm font-semibold"
                    value={qty[s.sku] === 0 ? '' : String(qty[s.sku] ?? '')}
                    placeholder="0"
                    onChange={(e) => set(s.sku, e.target.value)}
                    aria-label={t('admin.production.send.qtyFor', {
                      defaultValue: 'Quantity for size {{size}}',
                      size: s.size,
                    })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
