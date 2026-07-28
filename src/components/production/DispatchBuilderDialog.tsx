import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listDestinationWarehouses } from '@/api/destinationWarehouses';
import type { DestinationWarehouse } from '@/api/types';
import type { CreateDispatchBody, DispatchLineBody } from '@/api/productionDispatch';
import type { ProductionBatch } from '@/api/production';

/** `${batchId}:${sku}` — the per-size key both this dialog and the BE remaining
 *  guard use. */
const key = (batchId: number, sku: string) => `${batchId}:${sku}`;

/**
 * Builds a challan from the Completed tab's selected sizes — each seeded to
 * what's left to ship. The one place a production challan is created; the
 * Dispatch surface is view + accept.
 */
export default function DispatchBuilderDialog({
  open,
  busy,
  batches,
  selectedKeys,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  /** Batches with at least one selected size. */
  batches: ProductionBatch[];
  /** Selected size keys `${batchId}:${sku}` — only these sizes ship. */
  selectedKeys: Set<string>;
  onClose: () => void;
  onConfirm: (body: CreateDispatchBody) => void;
}) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<DestinationWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    void listDestinationWarehouses().then((w) => {
      const active = w.filter((x) => x.isActive);
      setWarehouses(active);
      // Default to the Pul Prahladpur warehouse (the production destination),
      // else the first active one — so the common case needs no picking.
      const preferred = active.find((x) => /pul[\s-]?prahladpur/i.test(x.name)) ?? active[0];
      if (preferred) setWarehouseId(preferred.id);
    });
  }, [open]);

  // Seed each SELECTED size to its full remaining qty (the common case: ship
  // everything that's left of the sizes you picked).
  useEffect(() => {
    if (!open) return;
    const seeded: Record<string, number> = {};
    for (const b of batches) {
      for (const s of b.sizes) {
        const remaining = (s.qtyProduced ?? 0) - (s.qtyDispatched ?? 0);
        if (remaining > 0 && selectedKeys.has(key(b.id, s.sku))) seeded[key(b.id, s.sku)] = remaining;
      }
    }
    setQty(seeded);
    setNotes('');
  }, [open, batches, selectedKeys]);

  const remainingByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of batches) {
      for (const s of b.sizes) m.set(key(b.id, s.sku), (s.qtyProduced ?? 0) - (s.qtyDispatched ?? 0));
    }
    return m;
  }, [batches]);

  const setBatchQty = (k: string, raw: string) => {
    const cap = remainingByKey.get(k) ?? 0;
    const n = Math.min(cap, Math.max(0, Number.parseInt(raw, 10) || 0));
    setQty((prev) => ({ ...prev, [k]: n }));
  };

  const batchLines: DispatchLineBody[] = useMemo(
    () =>
      batches.flatMap((b) =>
        b.sizes
          .filter((s) => selectedKeys.has(key(b.id, s.sku)) && (qty[key(b.id, s.sku)] ?? 0) > 0)
          .map((s) => ({ batchId: b.id, sku: s.sku, size: s.size, qty: qty[key(b.id, s.sku)] })),
      ),
    [batches, selectedKeys, qty],
  );

  const total = batchLines.reduce((a, l) => a + l.qty, 0);
  const canSend = warehouseId !== '' && total > 0 && !busy;

  const submit = () => {
    if (warehouseId === '') return;
    onConfirm({ destWarehouseId: warehouseId, items: batchLines, notes: notes.trim() || undefined });
  };

  const inputCls =
    'h-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      title={
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          {t('admin.production.dispatch.build.eyebrow', { defaultValue: 'New challan' })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" disabled={!canSend} onClick={submit}>
            <Send size={14} />
            <span className="ml-1">
              {t('admin.production.dispatch.build.confirm', { defaultValue: 'Dispatch' })} · {total}
            </span>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-muted-foreground)]">
            {t('admin.production.dispatch.build.warehouse', { defaultValue: 'To warehouse' })}
          </label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
            className={`${inputCls} w-full`}
          >
            <option value="">
              {t('admin.production.dispatch.build.pickWarehouse', { defaultValue: 'Select…' })}
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {batches.map((b) => {
          const lines = b.sizes.filter(
            (s) => (s.qtyProduced ?? 0) - (s.qtyDispatched ?? 0) > 0 && selectedKeys.has(key(b.id, s.sku)),
          );
          if (lines.length === 0) return null;
          return (
            <div key={b.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
              <div className="mb-2 text-sm font-semibold">
                {b.styleRef ?? b.styleKey ?? b.batchNo}{' '}
                <span className="font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
                  {b.batchNo}
                </span>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    <th className="py-1 text-left font-semibold">
                      {t('admin.production.size', { defaultValue: 'Size' })}
                    </th>
                    <th className="py-1 pr-6 text-right font-semibold">
                      {t('admin.production.dispatch.build.remaining', { defaultValue: 'Remaining' })}
                    </th>
                    <th className="py-1 pl-4 text-right font-semibold">
                      {t('admin.production.dispatch.build.send', { defaultValue: 'Send' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((s) => {
                    const k = key(b.id, s.sku);
                    return (
                      <tr key={s.sku} className="border-t border-[var(--color-border)]/50">
                        <td className="py-1 font-semibold">{s.size}</td>
                        <td className="py-1 pr-6 text-right text-[var(--color-muted-foreground)]">
                          {remainingByKey.get(k) ?? 0}
                        </td>
                        <td className="py-1 pl-4 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={remainingByKey.get(k) ?? 0}
                            inputMode="numeric"
                            className="h-8 w-20 text-center text-sm font-semibold"
                            value={String(qty[k] ?? 0)}
                            onChange={(e) => setBatchQty(k, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        <Input
          className="text-sm"
          placeholder={t('admin.production.dispatch.build.notes', { defaultValue: 'Notes (optional)' })}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
