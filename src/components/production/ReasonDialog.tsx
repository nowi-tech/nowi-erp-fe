import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * A destructive confirm that requires a typed reason. Shared by batch-cancel and
 * challan-cancel so the wording ("Keep it" vs a destructive confirm), the
 * min-length gate, and the autofocus all stay identical across both.
 */
export default function ReasonDialog({
  open,
  busy,
  title,
  confirmLabel,
  placeholder,
  minLength = 3,
  destructive = true,
  cancelLabel,
  maxLength,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  title: string;
  confirmLabel: string;
  placeholder?: string;
  minLength?: number;
  /** False for a non-destructive ask, like putting a lot on hold. */
  destructive?: boolean;
  cancelLabel?: string;
  /** Mirrors the server's limit, so a long reason is stopped here rather than lost on save. */
  maxLength?: number;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const valid = reason.trim().length >= minLength;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-md"
      title={<div className="text-base font-semibold">{title}</div>}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {cancelLabel ?? t('admin.production.cancel.keep', { defaultValue: 'Keep it' })}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            disabled={busy || !valid}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
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
        maxLength={maxLength}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder}
      />
    </Dialog>
  );
}
