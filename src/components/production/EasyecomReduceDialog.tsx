import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export interface EasyecomRemoval {
  warehouse: string;
  lines: { sku: string; qty: number }[];
}

/** EasyEcom can't reduce stock by API — after a downward correction, hand over the bulk-adjustment rows. */
export default function EasyecomReduceDialog({
  removal,
  onClose,
}: {
  removal: EasyecomRemoval | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  if (!removal) return null;

  // EasyEcom's Status-to-Status Transfer upload (Available → Lost); backtick keeps SKUs as text.
  const csv = [
    '`SKU/EAN*,"Old Status*","New Status*","Old Bin*","Old Batch*","New Bin*",Quantity*',
    ...removal.lines.map((l) => `\`${l.sku},Available,Lost,Default,,,${l.qty}`),
  ].join('\n');

  const copy = () =>
    navigator.clipboard
      .writeText(csv)
      .then(() => toast.show(t('common.copied', { defaultValue: 'Copied' }), 'success'))
      .catch(() => undefined);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      title={
        <div className="text-base font-semibold">
          {t('admin.production.dispatch.reduce.title', { defaultValue: 'Remove stock in EasyEcom' })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy size={14} />
            <span className="ml-1">{t('admin.production.dispatch.reduce.copy', { defaultValue: 'Copy upload rows' })}</span>
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('common.done', { defaultValue: 'Done' })}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm">
        {t('admin.production.dispatch.reduce.body', {
          defaultValue: "EasyEcom can't reduce stock automatically. Remove these at {{warehouse}}:",
          warehouse: removal.warehouse,
        })}
      </p>
      <ul className="mb-3 space-y-1 text-sm">
        {removal.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="font-mono text-xs">{l.sku}</span>
            <span className="font-semibold tabular-nums">−{l.qty}</span>
          </li>
        ))}
      </ul>
      <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] p-2 text-[11px]">{csv}</pre>
    </Dialog>
  );
}
