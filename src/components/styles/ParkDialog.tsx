import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/**
 * Park confirmation dialog. Used from the Sampling registry's inline
 * Park action and from the Style detail page. Same shape as the
 * Approval #1 dialog — explicit confirmation, free-text reason field.
 *
 * Reason is required: parking a Style without a why-line leaves an
 * unreadable audit log. The default behaviour was to send a hardcoded
 * "Paused from inbox" / "Paused from Workspace" string; this dialog
 * makes the human decide what to record.
 */

interface Props {
  open: boolean;
  busy: boolean;
  /** Optional — shown in the dialog title. */
  styleLabel?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function ParkDialog({
  open,
  busy,
  styleLabel,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const canConfirm = reason.trim().length > 0 && !busy;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.park.dialogTitle', {
        defaultValue: 'Park style',
      })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.styles.park.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
          >
            <Pause size={14} />
            <span className="ml-1">
              {t('admin.styles.park.confirm', { defaultValue: 'Park' })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-3">
        {styleLabel
          ? t('admin.styles.park.dialogIntroWithStyle', {
              defaultValue:
                'Parking {{styleLabel}} pauses sampling. It can be revived any time — the reason you record here will appear in the activity log.',
              styleLabel,
            })
          : t('admin.styles.park.dialogIntro', {
              defaultValue:
                'Parking pauses sampling. It can be revived any time — the reason you record here will appear in the activity log.',
            })}
      </p>

      <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
        {t('admin.styles.park.reason', { defaultValue: 'Reason' })}
      </label>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('admin.styles.park.reasonPlaceholder', {
          defaultValue:
            'e.g. Fabric supplier out of stock, awaiting alternative…',
        })}
        autoFocus
      />
    </Dialog>
  );
}
