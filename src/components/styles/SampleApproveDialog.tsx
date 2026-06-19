import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  costPrice,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  /** Existing cost price (prefill for re-approval / correction). */
  costPrice?: number | null;
  onClose: () => void;
  onConfirm: (body: SampleApproveStyleBody) => void;
}) {
  const { t } = useTranslation();
  const [verdict, setVerdict] = useState<SampleApprovalStatus>(
    'approved_for_production',
  );
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');

  useEffect(() => {
    if (open) {
      setVerdict('approved_for_production');
      setNote('');
      setCost(costPrice != null ? String(costPrice) : '');
    }
  }, [open, costPrice]);

  // Only the advancing verdict actually approves the sample — cost is required
  // then (an approved sample must carry its cost). Rework verdicts may omit it.
  const advancing = verdict === 'approved_for_production';
  const costNum = cost.trim() ? Number(cost) : NaN;
  const costValid = Number.isFinite(costNum) && costNum > 0;
  const costMissing = advancing && !costValid;

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
            disabled={busy || costMissing}
            onClick={() =>
              onConfirm({
                sampleApproval: verdict,
                note: note.trim() || undefined,
                costPrice: costValid ? costNum : undefined,
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
        {/* Cost price — required to approve (the advancing verdict). For a
            rework verdict it's optional context. */}
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.costPrice', {
              defaultValue: 'Cost price (₹)',
            })}
            {advancing && <span className="text-[var(--color-destructive)]"> *</span>}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
              ₹
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="h-10 pl-6 text-sm"
              placeholder={t('admin.styles.approval2.costPlaceholder', {
                defaultValue: 'e.g. 450',
              })}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              aria-invalid={costMissing}
            />
          </div>
          {costMissing && (
            <p className="mt-1 text-xs text-[var(--color-destructive)]">
              {t('admin.styles.approval2.costRequired', {
                defaultValue: 'A cost price is required to approve the sample.',
              })}
            </p>
          )}
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
