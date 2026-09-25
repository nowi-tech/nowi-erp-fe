import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import {
  getLot,
  updateLot,
  type BatchSizeLine,
  type CorrectStageQtyItem,
  type ProductionBatch,
  type UpdateLotBody,
} from '@/api/production';
import { apiErrorMessage, apiErrorStatus } from '@/api/apiClient';
import { FLOOR_STAGES, statusLabel, type FloorStage } from '@/lib/production';
import { todayISO } from '@/lib/date';

/** The size-line total each floor stage adds to, and its heading. */
const COLUMN: Record<FloorStage, { field: keyof BatchSizeLine; key: string; text: string }> = {
  cutting: { field: 'qtyCut', key: 'cut', text: 'Cut' },
  stitching: { field: 'qtyStitched', key: 'stitched', text: 'Stitched' },
  finishing: { field: 'qtyFinished', key: 'finished', text: 'Finished' },
  alteration: {
    field: 'qtyAltered',
    key: 'inAlteration',
    text: 'In alteration',
  },
};

/** A day's pieces for one stage of a lot: shows each size's total so far and adds to it. */
export default function DailyEntryDialog({
  open,
  lot,
  onClose,
  onSaved,
  onStale,
}: {
  open: boolean;
  lot: ProductionBatch | null;
  onClose: () => void;
  onSaved: (updated: ProductionBatch) => void;
  /** The lot changed under the dialog; the caller may refresh its own copy. */
  onStale?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [workDate, setWorkDate] = useState(todayISO());
  const [stage, setStage] = useState<FloorStage>('cutting');
  const [added, setAdded] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  // The lot as the server last read it — replaces `lot` after a 409; typed additions still apply.
  const [fresh, setFresh] = useState<ProductionBatch | null>(null);

  useEffect(() => {
    if (!open || !lot) return;
    const at = lot.status === 'on_hold' ? lot.heldFromStatus : lot.status;
    setStage((FLOOR_STAGES as readonly string[]).includes(at ?? '') ? (at as FloorStage) : 'cutting');
    setWorkDate(todayISO());
    setAdded({});
    setNotes(lot.notes ?? '');
    setReviewing(false);
    setFresh(null);
  }, [open, lot]);

  if (!lot) return null;
  const base = fresh ?? lot;
  const held = base.status === 'on_hold';
  const col = COLUMN[stage];
  const colText = t(`admin.production.lot.${col.key}`, {
    defaultValue: col.text,
  });
  const soFar = (s: BatchSizeLine) => s[col.field] as number;
  const nextNotes = notes.trim();
  const statusChanged = !held && stage !== base.status;
  const notesChanged = nextNotes !== (base.notes ?? '');

  // Totals, not deltas: the server writes the difference, and refuses if the lot moved meanwhile.
  const lines = base.sizes.filter((s) => (added[s.sku] ?? 0) > 0);
  const totalOf = (s: BatchSizeLine) => soFar(s) + added[s.sku];
  // Finished pieces were cut and stitched, so neither may trail finished.
  const raised = (s: BatchSizeLine) =>
    stage === 'finishing'
      ? (['cutting', 'stitching'] as const).filter((r) => totalOf(s) > (s[COLUMN[r].field] as number))
      : [];
  const stages: CorrectStageQtyItem[] = lines.map((s) => ({
    sku: s.sku,
    [stage]: totalOf(s),
    ...Object.fromEntries(raised(s).map((r) => [r, totalOf(s)])),
  }));

  const changes: string[] = [];
  if (statusChanged) {
    changes.push(
      t('admin.production.update.stageLine', {
        defaultValue: 'Stage: {{from}} → {{to}}',
        from: statusLabel(t, base.status),
        to: statusLabel(t, stage),
      }),
    );
  }
  for (const s of lines) {
    changes.push(`${s.size} · ${colText} ${soFar(s)} → ${totalOf(s)}`);
    for (const r of raised(s)) {
      const c = COLUMN[r];
      changes.push(
        `${s.size} · ${t(`admin.production.lot.${c.key}`, { defaultValue: c.text })} ${s[c.field] as number} → ${totalOf(s)}`,
      );
    }
  }
  if (lines.length > 0) {
    changes.unshift(
      t('admin.production.entry.dateLine', {
        defaultValue: 'Entry date: {{date}}',
        date: workDate,
      }),
    );
  }
  if (notesChanged) {
    changes.push(
      nextNotes
        ? t('admin.production.update.remarkLine', {
            defaultValue: 'Remark: {{text}}',
            text: nextNotes,
          })
        : t('admin.production.update.remarkCleared', {
            defaultValue: 'Remark cleared',
          }),
    );
  }
  const validDate = !!workDate && workDate <= todayISO();
  const canSave = (lines.length > 0 || statusChanged || notesChanged) && validDate && !busy;

  const save = async () => {
    const body: UpdateLotBody = {
      ...(stages.length > 0 ? { stages, workDate } : {}),
      ...(statusChanged ? { status: stage } : {}),
      ...(notesChanged ? { notes: nextNotes } : {}),
      expectedStatus: base.status,
      expected: base.sizes.map((s) => ({
        sku: s.sku,
        cutting: s.qtyCut,
        stitching: s.qtyStitched,
        alteration: s.qtyAltered,
        finishing: s.qtyFinished,
        scrapped: s.qtyScrapped,
      })),
    };
    setBusy(true);
    try {
      const updated = await updateLot(base.id, body);
      toast.show(t('common.saved', { defaultValue: 'Saved.' }));
      setReviewing(false);
      onSaved(updated);
    } catch (e) {
      setReviewing(false);
      if (apiErrorStatus(e) === 409) {
        const latest = await getLot(base.id).catch(() => null);
        if (latest) setFresh(latest);
        onStale?.();
        toast.show(
          t('admin.production.update.stale', {
            defaultValue:
              'Someone updated this lot. The figures are refreshed — check your changes and save again.',
          }),
          'error',
        );
      } else {
        toast.show(
          apiErrorMessage(e) ?? t('common.error', { defaultValue: 'Something went wrong.' }),
          'error',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const fieldClass =
    'h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-60';

  return (
    <>
      <Dialog
        open={open}
        onClose={reviewing ? () => setReviewing(false) : onClose}
        confirmOnClose={!reviewing}
        maxWidthClassName="max-w-xl"
        title={
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">
              {base.name ?? base.styleRef ?? base.batchNo}
            </div>
            <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
              {[base.batchNo, base.styleRef ?? base.styleKey].filter(Boolean).join(' · ')}
            </div>
          </div>
        }
        footer={
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button size="sm" disabled={!canSave} onClick={() => setReviewing(true)}>
              <Pencil size={14} />
              <span className="ml-1">{t('admin.production.update.cta', { defaultValue: 'Update' })}</span>
            </Button>
          </>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium">
              {t('admin.production.entry.date', { defaultValue: 'Date' })}
            </label>
            <input
              type="date"
              value={workDate}
              max={todayISO()}
              onChange={(e) => setWorkDate(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              {t('admin.production.stage', { defaultValue: 'Stage' })}
            </label>
            {/* A held lot keeps its status here — Resume owns that move. */}
            <select
              value={stage}
              disabled={held}
              onChange={(e) => {
                setStage(e.target.value as FloorStage);
                setAdded({});
              }}
              className={fieldClass}
            >
              {FLOOR_STAGES.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(t, st)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.size', { defaultValue: 'Size' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.entry.soFar', {
                  defaultValue: '{{stage}} so far',
                  stage: colText,
                })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.entry.add', { defaultValue: 'Add' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {base.sizes.map((s) => (
              <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                <td className="py-2 pr-3 font-semibold">{s.size}</td>
                <td className="py-2 pr-3 tabular-nums">{soFar(s)}</td>
                <td className="py-2 pr-3">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="h-9 w-24 text-center text-sm font-semibold"
                    value={added[s.sku] ? String(added[s.sku]) : ''}
                    onChange={(e) =>
                      setAdded((p) => ({
                        ...p,
                        [s.sku]: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                      }))
                    }
                    aria-label={t('admin.production.entry.addFor', {
                      defaultValue: 'Add {{stage}} for size {{size}}',
                      stage: colText,
                      size: s.size,
                    })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium">
            {t('admin.production.remark', { defaultValue: 'Remark' })}
          </label>
          <Textarea
            className="min-h-[64px] text-sm"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={reviewing}
        title={t('admin.production.update.confirmTitle', {
          defaultValue: 'Update lot {{no}}?',
          no: base.batchNo,
        })}
        message={
          <ul className="max-h-[50vh] list-disc space-y-1 overflow-y-auto pl-4">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        }
        confirmLabel={
          busy
            ? t('common.saving', { defaultValue: 'Saving…' })
            : t('admin.production.update.cta', { defaultValue: 'Update' })
        }
        cancelLabel={t('common.back', { defaultValue: 'Back' })}
        onConfirm={() => {
          if (!busy) void save();
        }}
        onCancel={() => setReviewing(false)}
      />
    </>
  );
}
