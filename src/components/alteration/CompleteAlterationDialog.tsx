import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import QtyTable from '@/components/production/QtyTable';
import type { AlterationEntry } from '@/api/alteration';

/** Per-size pieces back from alteration, seeded with everything that went in. */
export default function CompleteAlterationDialog({
  entry,
  busy,
  onClose,
  onConfirm,
}: {
  entry: AlterationEntry | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (items: { sku: string; qtyOut: number }[]) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (entry) setQty(Object.fromEntries(entry.sizes.map((s) => [s.sku, s.qtyIn])));
  }, [entry]);

  const cap = (sku: string) => entry?.sizes.find((s) => s.sku === sku)?.qtyIn ?? 0;
  const setQtyFor = (sku: string, raw: string) =>
    setQty((prev) => ({
      ...prev,
      [sku]: Math.min(cap(sku), Math.max(0, Number.parseInt(raw, 10) || 0)),
    }));
  const total = Object.values(qty).reduce((a, n) => a + n, 0);

  return (
    <Dialog
      open={entry != null}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      title={
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          {t('admin.alteration.completeTitle', {
            defaultValue: 'Complete {{no}}',
            no: entry?.entryNo ?? '',
          })}
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
              onConfirm(Object.entries(qty).map(([sku, qtyOut]) => ({ sku, qtyOut })))
            }
          >
            {t('admin.alteration.completeConfirm', {
              defaultValue: 'Complete · {{n}} back',
              n: total,
            })}
          </Button>
        </>
      }
    >
      {entry && (
        <QtyTable
          qtyLabel={t('admin.alteration.qtyBack', { defaultValue: 'Back (of sent)' })}
          rows={entry.sizes.map((s) => ({
            key: s.sku,
            size: `${s.size} · ${s.qtyIn}`,
            sku: s.sku,
            qty: qty[s.sku] ?? 0,
          }))}
          onQty={setQtyFor}
        />
      )}
    </Dialog>
  );
}
