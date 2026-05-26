import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { listUsers } from '@/api/users';
import type {
  ApproveStyleBody,
  SamplingStatus,
} from '@/api/styles';
import type { Style, User as ApiUser } from '@/api/types';

/**
 * Approval #1 confirmation dialog — the approver ticks the three
 * intake checks (fabric feasible / price OK / collection fit) and
 * optionally records a note + initial sampling status + Pattern Master.
 *
 * Used both from the detail page (StyleWorkspace) and from the
 * Sampling registry's inline Approve action. Lifted out of
 * StyleWorkspace so the inline-approve flow gets the same disciplined
 * checklist instead of firing an empty body.
 */

const SAMPLING_STATUS_OPTIONS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'in_progress_stitching',
  'ready_for_inspection',
  'handed_over_for_inspection',
  'corrections_needed',
  'approved_for_production',
];

interface Props {
  open: boolean;
  busy: boolean;
  gender: Style['gender'];
  defaultPatternMasterId: number | null;
  onClose: () => void;
  onConfirm: (body: ApproveStyleBody) => void;
}

export default function Approval1Dialog({
  open,
  busy,
  gender,
  defaultPatternMasterId,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  // Single "I confirm" checkbox covers all three intake checks — the
  // user reads the list, then ticks once. All three booleans are still
  // recorded on the BE so the audit trail and historical data shape
  // stay the same.
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [samplingStatus, setSamplingStatus] = useState<SamplingStatus | ''>('');
  const [patternMasterId, setPatternMasterId] = useState<number | null>(
    defaultPatternMasterId,
  );
  // Pattern Master picker fetched lazily on open — narrow to the two
  // PM roles + admin so override choices are sensible.
  const [pmCandidates, setPmCandidates] = useState<ApiUser[]>([]);

  // Reset the checklist each time the dialog opens, and seed the
  // Pattern Master dropdown with the auto-routed user.
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setNote('');
      setSamplingStatus('');
      setPatternMasterId(defaultPatternMasterId);
    }
  }, [open, defaultPatternMasterId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listUsers({ take: 200 })
      .then((rows) => {
        if (cancelled) return;
        // Filter to Pattern Masters; show w/m matching the style's
        // gender first, then everyone else as fallback.
        const isPm = (u: ApiUser) =>
          u.role === 'pattern_master_w' ||
          u.role === 'pattern_master_m' ||
          u.role === 'admin';
        const matchesGender = (u: ApiUser) =>
          (gender === 'women' && u.role === 'pattern_master_w') ||
          (gender === 'men' && u.role === 'pattern_master_m') ||
          gender === 'unisex';
        const ordered = rows
          .filter(isPm)
          .sort((a, b) =>
            matchesGender(a) === matchesGender(b)
              ? a.name.localeCompare(b.name)
              : matchesGender(a)
                ? -1
                : 1,
          );
        setPmCandidates(ordered);
      })
      .catch(() => {
        if (!cancelled) setPmCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gender]);

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
                samplingStatus: samplingStatus || undefined,
                patternMasterId,
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

      {/* Workflow state set at Approval #1 — both optional. */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval1.samplingStatus', {
              defaultValue: 'Initial sampling status',
            })}
          </label>
          <select
            value={samplingStatus}
            onChange={(e) =>
              setSamplingStatus(e.target.value as SamplingStatus | '')
            }
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <option value="">
              {t('admin.styles.approval1.samplingStatusUnset', {
                defaultValue: '—',
              })}
            </option>
            {SAMPLING_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`admin.styles.samplingSteps.${s}` as const, {
                  defaultValue: s,
                })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval1.patternMaster', {
              defaultValue: 'Pattern Master',
            })}
          </label>
          <select
            value={patternMasterId ?? ''}
            onChange={(e) =>
              setPatternMasterId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <option value="">
              {t('admin.styles.approval1.patternMasterUnset', {
                defaultValue: '— Unassigned',
              })}
            </option>
            {pmCandidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.role === 'pattern_master_w' ? " (Women's)" : ''}
                {u.role === 'pattern_master_m' ? " (Men's)" : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

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
