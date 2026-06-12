import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SampleApprovalStatus, SampleApproveStyleBody } from '@/api/styles';

// The sample-verdict options (Approval #2). `approved_for_production` is the
// only verdict that advances the lifecycle; the others record the verdict and
// keep the style in sampling for rework — so "send back for corrections" is
// just the `under_review_corrections` verdict, not a separate path.
const SAMPLE_APPROVAL_OPTIONS: SampleApprovalStatus[] = [
  'approved_for_production',
  'under_review_corrections',
  'pattern_correction_approved',
];

/**
 * Shared sample sign-off (Approval #2) dialog — the SINGLE way to record a
 * sample verdict, used by the workspace, the dashboard Sampling tab, and the
 * Sampling registry. Captures the verdict + an optional note. Only
 * `approved_for_production` advances the lifecycle to `sample_approved`.
 */
export default function SampleApproveDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (body: SampleApproveStyleBody) => void;
}) {
  const { t } = useTranslation();
  const [verdict, setVerdict] = useState<SampleApprovalStatus>(
    'approved_for_production',
  );
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setVerdict('approved_for_production');
      setNote('');
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.approval2.dialogTitle', {
        defaultValue: 'Approve sample',
      })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.styles.approval2.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              onConfirm({
                sampleApproval: verdict,
                note: note.trim() || undefined,
              })
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">
              {t('admin.styles.approval2.confirm', {
                defaultValue: 'Sign off',
              })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.approval2.dialogIntro', {
          defaultValue:
            'Record the sample verdict. Only "Approved for production" advances the lifecycle — other verdicts log the state and keep the style in sampling for rework.',
        })}
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.verdict', {
              defaultValue: 'Sample verdict',
            })}
          </label>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as SampleApprovalStatus)}
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {SAMPLE_APPROVAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {t(`admin.styles.sampleApproval.${v}` as const, {
                  defaultValue: v,
                })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.note', { defaultValue: 'Note' })}
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.styles.approval2.notePlaceholder', {
              defaultValue: 'Optional context — defects, corrections, …',
            })}
          />
        </div>
      </div>
    </Dialog>
  );
}
