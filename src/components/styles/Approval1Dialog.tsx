import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { ApproveStyleBody } from '@/api/styles';
import type { Style } from '@/api/types';

/**
 * Approval #1 confirmation dialog — the approver ticks the three
 * intake checks (fabric feasible / price OK / collection fit) and
 * optionally records a note.
 *
 * The BE now auto-sets `samplingStatus = Pattern dev` on approval, so
 * this dialog no longer asks for an initial sampling status; Pattern
 * Master has also been dropped entirely.
 *
 * Used both from the detail page (StyleWorkspace) and from the
 * Sampling registry's inline Approve action. Lifted out of
 * StyleWorkspace so the inline-approve flow gets the same disciplined
 * checklist instead of firing an empty body.
 */

interface Props {
  open: boolean;
  busy: boolean;
  gender: Style['gender'];
  onClose: () => void;
  onConfirm: (body: ApproveStyleBody) => void;
}

export default function Approval1Dialog({
  open,
  busy,
  gender,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  // Approver context is conveyed by the style's gender; retained as a
  // prop so callers stay in sync with the BE's gender-routed approver.
  void gender;
  // Single "I confirm" checkbox covers all three intake checks — the
  // user reads the list, then ticks once. All three booleans are still
  // recorded on the BE so the audit trail and historical data shape
  // stay the same.
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');

  // Reset the checklist each time the dialog opens.
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setNote('');
    }
  }, [open]);

  // The single confirmation must be ticked before Confirm enables —
  // policy reason for extracting the dialog: inline Approve used to
  // fire an empty body with no checks recorded.
  const canConfirm = confirmed && !busy;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.approval1.dialogTitle')}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.styles.approval1.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                // Single "I confirm" — record all three booleans true.
                approval1FabricFeasible: true,
                approval1PriceOk: true,
                approval1CollectionFit: true,
                approval1Note: note.trim() || undefined,
              })
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">{t('admin.styles.approval1.confirm')}</span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.approval1.dialogIntro')}
      </p>

      <ul className="mb-3 space-y-1.5 text-sm text-[var(--color-foreground-2)] list-disc pl-5">
        <li>{t('admin.styles.approval1.fabricFeasible')}</li>
        <li>{t('admin.styles.approval1.priceOk')}</li>
        <li>{t('admin.styles.approval1.collectionFit')}</li>
      </ul>

      <CheckboxRow
        label={t('admin.styles.approval1.confirmAll', {
          defaultValue: 'I have verified all three checks pass.',
        })}
        checked={confirmed}
        onChange={setConfirmed}
      />

      <div className="mt-4">
        <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
          {t('admin.styles.approval1.note')}
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('admin.styles.approval1.notePlaceholder')}
        />
      </div>
    </Dialog>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-2)]/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
