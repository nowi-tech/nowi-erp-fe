import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductionBatch } from '@/api/production';

/**
 * Cancels a batch with a required reason. Wording is deliberately unambiguous —
 * the destructive confirm says "Cancel batch", the safe button says "Keep it"
 * (never a bare "Cancel", which reads both ways next to a cancel action).
 */
export default function CancelBatchDialog({
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
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!batch) return null;
  const valid = reason.trim().length >= 3;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-md"
      title={
        <div className="text-base font-semibold">
          {t('admin.production.cancel.title', {
            defaultValue: 'Cancel lot {{no}}?',
            no: batch.batchNo,
          })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.production.cancel.keep', { defaultValue: 'Keep it' })}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || !valid}
            onClick={() => onConfirm(reason.trim())}
          >
            {t('admin.production.cancel.confirm', { defaultValue: 'Cancel batch' })}
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-xs font-semibold text-[var(--color-muted-foreground)]">
        {t('admin.production.cancel.reasonLabel', { defaultValue: 'Reason' })}
      </label>
      <Input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('admin.production.cancel.reasonPlaceholder', {
          defaultValue: 'Why is this being cancelled?',
        })}
      />
    </Dialog>
  );
}
