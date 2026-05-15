import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { consumeStepupOtp, requestStepupOtp } from '@/api/auth';

interface StepupDialogProps {
  open: boolean;
  /** Title for the dialog (e.g. "Confirm: Deactivate user"). */
  title: string;
  /** One-line description of the action being authorised. */
  description?: string;
  onClose: () => void;
  /**
   * Fired after the OTP is consumed successfully. Implementer runs the
   * gated action here (e.g. DELETE /users/:id). The dialog closes after
   * this resolves; if it throws, the dialog stays open with the error.
   */
  onConfirmed: () => Promise<void>;
}

/**
 * Step-up OTP gate for high-risk admin actions. On open, requests a
 * fresh OTP via WhatsApp; user enters the code; we consume it; on
 * success we run the caller's gated action. The BE permits the gated
 * action for ~60s after consume.
 */
export default function StepupDialog({
  open,
  title,
  description,
  onClose,
  onConfirmed,
}: StepupDialogProps) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Request a fresh OTP every time the dialog opens. If the user opens,
  // closes, reopens — they get a new code, not a stale one.
  useEffect(() => {
    if (!open) {
      setOtp('');
      setError(null);
      return;
    }
    setRequesting(true);
    requestStepupOtp()
      .catch(() =>
        setError(
          t('admin.stepup.requestFailed', {
            defaultValue: 'Could not send OTP. Try again.',
          }),
        ),
      )
      .finally(() => setRequesting(false));
  }, [open, t]);

  async function submit() {
    if (otp.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { ok } = await consumeStepupOtp(otp);
      if (!ok) {
        setError(
          t('admin.stepup.wrongOtp', {
            defaultValue: 'Wrong OTP. Try again.',
          }),
        );
        return;
      }
      // OTP consumed → gated action allowed for the next ~60s.
      await onConfirmed();
      onClose();
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      // 401 = wrong OTP per BE shape; surface inline so user can retry.
      if (e.response?.status === 401) {
        setError(
          t('admin.stepup.wrongOtp', {
            defaultValue: 'Wrong OTP. Try again.',
          }),
        );
      } else {
        setError(e.response?.data?.message ?? e.message ?? t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={submitting || otp.length === 0}>
            {submitting ? t('common.saving') : t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description && (
          <p className="text-sm text-[var(--color-foreground-2)]">{description}</p>
        )}
        <div>
          <Label className="mb-1">
            {t('admin.stepup.otpLabel', {
              defaultValue: 'Enter the 6-digit OTP sent to your phone',
            })}
          </Label>
          <Input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="••••••"
            className="font-mono text-center tracking-[0.5em] text-lg"
          />
        </div>
        {requesting && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('admin.stepup.sending', { defaultValue: 'Sending OTP…' })}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--color-destructive)]">{error}</p>
        )}
      </div>
    </Dialog>
  );
}
