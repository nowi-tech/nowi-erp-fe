import { useTranslation } from 'react-i18next';
import ReasonDialog from '@/components/production/ReasonDialog';
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
  if (!batch) return null;

  return (
    <ReasonDialog
      open={open}
      busy={busy}
      title={t('admin.production.cancel.title', {
        defaultValue: 'Cancel lot {{no}}?',
        no: batch.batchNo,
      })}
      confirmLabel={t('admin.production.cancel.confirm', { defaultValue: 'Cancel batch' })}
      placeholder={t('admin.production.cancel.reasonPlaceholder', {
        defaultValue: 'Why is this being cancelled?',
      })}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
