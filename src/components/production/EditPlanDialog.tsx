import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import QtyTable from '@/components/production/QtyTable';
import { type CreateBatchItem, type ProductionBatch } from '@/api/production';

/** A Pipeline lot's plan: planned pieces per size and the remark. */
export default function EditPlanDialog({
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
  onConfirm: (body: { items: CreateBatchItem[]; notes: string }) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !batch) return;
    setQty(Object.fromEntries(batch.sizes.map((s) => [s.sku, s.qtyPlanned])));
    setNotes(batch.notes ?? '');
  }, [open, batch]);

  const total = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  if (!batch) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {t('admin.production.editPlan.title', { defaultValue: 'Edit plan' })}
          </div>
          <div className="truncate text-base font-semibold">
            {batch.name ?? batch.styleRef ?? batch.batchNo}
          </div>
          <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
            {batch.batchNo}
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
            disabled={busy || total <= 0}
            onClick={() =>
              onConfirm({
                items: batch.sizes.map((s) => ({
                  sku: s.sku,
                  size: s.size,
                  qtyPlanned: qty[s.sku] ?? 0,
                })),
                notes,
              })
            }
          >
            {t('admin.production.editPlan.save', { defaultValue: 'Save · {{n}}', n: total })}
          </Button>
        </>
      }
    >
      <QtyTable
        rows={batch.sizes.map((s) => ({ key: s.sku, size: s.size, sku: s.sku, qty: qty[s.sku] ?? 0 }))}
        onQty={(sku, raw) =>
          setQty((p) => ({ ...p, [sku]: Math.max(0, Number.parseInt(raw, 10) || 0) }))
        }
      />

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium">
          {t('admin.production.remark', { defaultValue: 'Remark' })}
        </label>
        <Textarea
          className="min-h-[64px] text-sm"
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
