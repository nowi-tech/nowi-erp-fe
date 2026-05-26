import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/**
 * Park confirmation dialog. The approver ticks one or more preset
 * reasons (same dimensions as the Approval #1 checks — fabric / price
 * / collection fit) or "Other" with free text. An optional context
 * note is appended to the joined reasons.
 *
 * Required: at least one reason. Without it the activity log is
 * unparseable ("Paused" doesn't say why). The default behaviour was
 * a hardcoded "Paused from inbox / Workspace" — that's gone.
 */

type ReasonKey = 'fabric' | 'price' | 'collectionFit' | 'other';

const REASON_KEYS: readonly ReasonKey[] = [
  'fabric',
  'price',
  'collectionFit',
  'other',
] as const;

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
  // Multi-select: a design may be parked for more than one reason
  // (e.g. fabric + price). Tracked as a Set so toggle is O(1).
  const [picked, setPicked] = useState<Set<ReasonKey>>(() => new Set());
  const [otherText, setOtherText] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setOtherText('');
      setNote('');
    }
  }, [open]);

  const toggle = (k: ReasonKey) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const reasonLabel = (k: ReasonKey): string => {
    switch (k) {
      case 'fabric':
        return t('admin.styles.park.reasons.fabric', {
          defaultValue: 'Fabric feasibility',
        });
      case 'price':
        return t('admin.styles.park.reasons.price', {
          defaultValue: 'Price',
        });
      case 'collectionFit':
        return t('admin.styles.park.reasons.collectionFit', {
          defaultValue: 'Compatibility with collection (design fit)',
        });
      case 'other':
        return t('admin.styles.park.reasons.other', {
          defaultValue: 'Other',
        });
    }
  };

  const canConfirm =
    !busy &&
    picked.size > 0 &&
    (!picked.has('other') || otherText.trim().length > 0);

  const buildReason = (): string => {
    if (picked.size === 0) return '';
    // Preserve the canonical order rather than insertion order so the
    // recorded string is stable regardless of click sequence.
    const parts = REASON_KEYS.filter((k) => picked.has(k)).map((k) =>
      k === 'other' ? otherText.trim() : reasonLabel(k),
    );
    const head = parts.join(' · ');
    const tail = note.trim();
    return tail ? `${head} — ${tail}` : head;
  };

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
            onClick={() => onConfirm(buildReason())}
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

      <div
        role="group"
        aria-label={t('admin.styles.park.reasonLabel', {
          defaultValue: 'Reasons (pick one or more)',
        })}
        className="space-y-2"
      >
        {REASON_KEYS.map((k) => (
          <label
            key={k}
            className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-2)]/40"
          >
            <input
              type="checkbox"
              checked={picked.has(k)}
              onChange={() => toggle(k)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm">{reasonLabel(k)}</span>
          </label>
        ))}
      </div>

      {picked.has('other') && (
        <div className="mt-3">
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.park.otherLabel', {
              defaultValue: 'Describe the reason',
            })}
          </label>
          <Textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder={t('admin.styles.park.otherPlaceholder', {
              defaultValue: 'Briefly describe why this is being parked…',
            })}
            autoFocus
          />
        </div>
      )}

      <div className="mt-3">
        <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
          {t('admin.styles.park.note', {
            defaultValue: 'Optional context',
          })}
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('admin.styles.park.notePlaceholder', {
            defaultValue:
              'Anything else worth noting? (e.g. supplier name, target retry date)',
          })}
        />
      </div>
    </Dialog>
  );
}
