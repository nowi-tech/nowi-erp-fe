import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import QtyTable from '@/components/production/QtyTable';
import type { ProductionBatch } from '@/api/production';

/**
 * Planning → floor. The ONE place the operator commits "how many can you
 * actually make", overriding the forecast-seeded plan before cutting starts.
 * Pre-fills each size from its current planned qty (which for a Suggested-origin
 * batch is the forecast make-qty carried over).
 */
export default function SendToProductionDialog({
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
  onConfirm: (items: { sku: string; qtyPlanned: number }[]) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !batch) return;
    const seeded: Record<string, number> = {};
    for (const s of batch.sizes) seeded[s.sku] = s.qtyPlanned;
    setQty(seeded);
  }, [open, batch]);

  const total = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  if (!batch) return null;

  const set = (sku: string, raw: string) => {
    const n = Math.max(0, Number.parseInt(raw, 10) || 0);
    setQty((prev) => ({ ...prev, [sku]: n }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {t('admin.production.send.eyebrow', { defaultValue: 'Send to production' })}
          </div>
          <div className="truncate text-base font-semibold">
            {batch.name ??
              batch.styleRef ??
              batch.batchNo}
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
              onConfirm(
                batch.sizes.map((s) => ({ sku: s.sku, qtyPlanned: qty[s.sku] ?? 0 })),
              )
            }
          >
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.send.confirm', {
                defaultValue: 'Send to production · {{n}} pcs',
                n: total,
              })}
            </span>
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">
        {t('admin.production.send.hint', {
          defaultValue:
            'Confirm how many you can make per size. The batch opens at Cutting once sent.',
        })}
      </p>
      <QtyTable
        rows={batch.sizes.map((s) => ({
          key: s.sku,
          size: s.size,
          sku: s.sku,
          qty: qty[s.sku] ?? 0,
        }))}
        onQty={set}
      />

      <div className="mt-3 flex items-center justify-end rounded-[var(--radius-sm)] bg-[var(--color-muted)] px-4 py-2.5">
        <span className="text-sm text-[var(--color-muted-foreground)]">
          {t('admin.production.send.total', { defaultValue: 'Total' })}
        </span>
        <span className="ml-2 text-lg font-bold">{total} pcs</span>
      </div>
    </Dialog>
  );
}
