import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import QtyTable from '@/components/production/QtyTable';
import { getLot, updateBatch, type ProductionBatch } from '@/api/production';
import { apiErrorMessage, apiErrorStatus } from '@/api/apiClient';

/** A Pipeline lot's plan: planned pieces per size and the remark. */
export default function EditPlanDialog({
  open,
  lot,
  onClose,
  onSaved,
  onStale,
}: {
  open: boolean;
  lot: ProductionBatch | null;
  onClose: () => void;
  onSaved: (updated: ProductionBatch) => void;
  /** The lot changed under the dialog; the caller may refresh its own copy (the dialog keeps what was typed). */
  onStale?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // The lot as the server last read it — replaces `lot` after a 409 so typed figures survive.
  const [fresh, setFresh] = useState<ProductionBatch | null>(null);

  useEffect(() => {
    if (!open || !lot) return;
    setQty(Object.fromEntries(lot.sizes.map((s) => [s.sku, s.qtyPlanned])));
    setNotes(lot.notes ?? '');
    setFresh(null);
  }, [open, lot]);

  if (!lot) return null;
  const base = fresh ?? lot;
  const total = Object.values(qty).reduce((a, b) => a + b, 0);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateBatch(base.id, {
        items: base.sizes.map((s) => ({ sku: s.sku, size: s.size, qtyPlanned: qty[s.sku] ?? 0 })),
        notes,
        // What the dialog is working from — the server refuses the save if the lot has moved on.
        expectedStatus: base.status,
        expected: base.sizes.map((s) => ({ sku: s.sku, qtyPlanned: s.qtyPlanned })),
      });
      toast.show(t('common.saved', { defaultValue: 'Saved.' }));
      onSaved(updated);
    } catch (e) {
      const latest = apiErrorStatus(e) === 409 ? await getLot(base.id).catch(() => null) : null;
      if (latest?.status === 'planning') {
        // Untouched sizes take the latest figures; only what was typed is kept.
        const was = new Map(base.sizes.map((z) => [z.sku, z.qtyPlanned]));
        setQty((prev) =>
          Object.fromEntries(
            latest.sizes.map((z) => {
              const typed = prev[z.sku];
              return [z.sku, typed == null || typed === was.get(z.sku) ? z.qtyPlanned : typed];
            }),
          ),
        );
        setNotes((n) => (n.trim() === (base.notes ?? '') ? latest.notes ?? '' : n));
        setFresh(latest);
        toast.show(
          t('admin.production.update.stale', {
            defaultValue: 'Someone updated this lot. The figures are refreshed — check your changes and save again.',
          }),
          'error',
        );
      } else {
        toast.show(
          apiErrorMessage(e) ?? t('common.error', { defaultValue: 'Something went wrong.' }),
          'error',
        );
        // Gone to the floor (or gone altogether) — its plan is no longer edited from here.
        if (apiErrorStatus(e) === 409) onClose();
      }
      if (apiErrorStatus(e) === 409) onStale?.();
    } finally {
      setBusy(false);
    }
  };

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
            {base.name ?? base.styleRef ?? base.batchNo}
          </div>
          <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
            {base.batchNo}
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" disabled={busy || total <= 0} onClick={() => void save()}>
            {t('admin.production.editPlan.save', { defaultValue: 'Save · {{n}}', n: total })}
          </Button>
        </>
      }
    >
      <QtyTable
        rows={base.sizes.map((s) => ({ key: s.sku, size: s.size, sku: s.sku, qty: qty[s.sku] ?? 0 }))}
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
