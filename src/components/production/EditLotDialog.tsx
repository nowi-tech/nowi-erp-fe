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
  type BatchStatus,
  type CorrectStageQtyItem,
  type ProductionBatch,
  type UpdateLotBody,
} from '@/api/production';
import { apiErrorMessage, apiErrorStatus } from '@/api/apiClient';
import { FLOOR_STAGES, statusLabel, suggestedStage } from '@/lib/production';

/** Every stage total the dialog sets: its API name, the size-line field, and its heading. */
const STAGES = [
  { stage: 'cutting', field: 'qtyCut', key: 'cut', text: 'Cut' },
  { stage: 'stitching', field: 'qtyStitched', key: 'stitched', text: 'Stitched' },
  { stage: 'alteration', field: 'qtyAltered', key: 'inAlteration', text: 'In alteration' },
  { stage: 'finishing', field: 'qtyFinished', key: 'finished', text: 'Finished' },
  { stage: 'scrapped', field: 'qtyScrapped', key: 'scrapped', text: 'Scrapped' },
] as const;
type STAGE = (typeof STAGES)[number]['stage'];

/** Plan, stage totals, stage and remark for one lot — reviewed, then saved in one request. */
export default function EditLotDialog({
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
  /** The lot changed under the dialog; the caller may refresh its own copy (the dialog keeps what was typed). */
  onStale?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [planned, setPlanned] = useState<Record<string, number>>({});
  const [stages, setStages] = useState<Record<string, Record<STAGE, number>>>({});
  // null = follow the quantities; set once the stage is picked by hand.
  const [picked, setPicked] = useState<BatchStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  // The lot as the server last read it — replaces `lot` after a 409 so typed figures survive.
  const [fresh, setFresh] = useState<ProductionBatch | null>(null);

  useEffect(() => {
    if (!open || !lot) return;
    setPlanned(Object.fromEntries(lot.sizes.map((s) => [s.sku, s.qtyPlanned])));
    setStages(
      Object.fromEntries(
        lot.sizes.map((s) => [s.sku, Object.fromEntries(STAGES.map((m) => [m.stage, s[m.field]]))]),
      ) as Record<string, Record<STAGE, number>>,
    );
    setPicked(null);
    setNotes(lot.notes ?? '');
    setReviewing(false);
    setFresh(null);
  }, [open, lot]);

  if (!lot) return null;
  const base = fresh ?? lot;

  const held = base.status === 'on_hold';
  const valueOf = (s: BatchSizeLine, m: (typeof STAGES)[number]) => stages[s.sku]?.[m.stage] ?? s[m.field];
  const draft: BatchSizeLine[] = base.sizes.map((s) => ({
    ...s,
    qtyPlanned: planned[s.sku] ?? s.qtyPlanned,
    ...Object.fromEntries(STAGES.map((m) => [m.field, valueOf(s, m)])),
  }));
  const total = Object.values(planned).reduce((a, b) => a + b, 0);
  const nextNotes = notes.trim();
  const label = (st: BatchStatus) => statusLabel(t, st);

  // One pass over every size and figure: drives the confirm list and the saved body alike.
  const planDiffs = base.sizes.filter((s) => (planned[s.sku] ?? s.qtyPlanned) !== s.qtyPlanned);
  const stageDiffs = base.sizes.flatMap((s) =>
    STAGES.filter((m) => valueOf(s, m) !== s[m.field]).map((m) => ({ s, m, to: valueOf(s, m) })),
  );
  const corrections: CorrectStageQtyItem[] = base.sizes.flatMap((s) => {
    const mine = stageDiffs.filter((d) => d.s.sku === s.sku);
    return mine.length === 0
      ? []
      : [{ sku: s.sku, ...Object.fromEntries(mine.map((d) => [d.m.stage, d.to])) }];
  });

  // Starts on the saved stage; typed stage figures may move it forward, never back.
  const order = FLOOR_STAGES as readonly BatchStatus[];
  const suggested = suggestedStage(draft);
  const status: BatchStatus =
    picked ??
    (!held && stageDiffs.length > 0 && order.indexOf(suggested) > order.indexOf(base.status)
      ? suggested
      : base.status);
  const statusChanged = status !== base.status;
  const notesChanged = nextNotes !== (base.notes ?? '');

  const changes: string[] = [];
  if (statusChanged) {
    changes.push(
      t('admin.production.update.stageLine', {
        defaultValue: 'Stage: {{from}} → {{to}}',
        from: label(base.status),
        to: label(status),
      }),
    );
  }
  for (const s of planDiffs) {
    changes.push(
      `${s.size} · ${t('admin.production.lot.planned', { defaultValue: 'Planned' })} ${s.qtyPlanned} → ${planned[s.sku]}`,
    );
  }
  for (const d of stageDiffs) {
    changes.push(
      `${d.s.size} · ${t(`admin.production.lot.${d.m.key}`, { defaultValue: d.m.text })} ${d.s[d.m.field]} → ${d.to}`,
    );
  }
  if (notesChanged) {
    changes.push(
      nextNotes
        ? t('admin.production.update.remarkLine', { defaultValue: 'Remark: {{text}}', text: nextNotes })
        : t('admin.production.update.remarkCleared', { defaultValue: 'Remark cleared' }),
    );
  }

  const canSave = changes.length > 0 && total > 0 && !busy;

  const save = async () => {
    const body: UpdateLotBody = {
      ...(planDiffs.length > 0
        ? {
            items: base.sizes.map((s) => ({
              sku: s.sku,
              size: s.size,
              qtyPlanned: planned[s.sku] ?? s.qtyPlanned,
            })),
          }
        : {}),
      ...(corrections.length > 0 ? { stages: corrections } : {}),
      ...(statusChanged ? { status } : {}),
      ...(notesChanged ? { notes: nextNotes } : {}),
      // What the dialog is working from — the server refuses the save if the lot has moved on.
      expectedStatus: base.status,
      expected: base.sizes.map((s) => ({
        sku: s.sku,
        qtyPlanned: s.qtyPlanned,
        ...Object.fromEntries(STAGES.map((m) => [m.stage, s[m.field]])),
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
        if (latest) {
          // Untouched fields take the latest figures; only what was typed is kept.
          const was = new Map(base.sizes.map((z) => [z.sku, z]));
          setStages((prev) =>
            Object.fromEntries(
              latest.sizes.map((z) => [
                z.sku,
                Object.fromEntries(
                  STAGES.map((m) => {
                    const typed = prev[z.sku]?.[m.stage];
                    const old = was.get(z.sku)?.[m.field];
                    return [m.stage, typed == null || typed === old ? z[m.field] : typed];
                  }),
                ),
              ]),
            ) as Record<string, Record<STAGE, number>>,
          );
          setPlanned((prev) =>
            Object.fromEntries(
              latest.sizes.map((z) => {
                const typed = prev[z.sku];
                return [z.sku, typed == null || typed === was.get(z.sku)?.qtyPlanned ? z.qtyPlanned : typed];
              }),
            ),
          );
          setNotes((n) => (n.trim() === (base.notes ?? '') ? latest.notes ?? '' : n));
          setFresh(latest);
        }
        onStale?.();
        toast.show(
          t('admin.production.update.stale', {
            defaultValue: 'Someone updated this lot. The figures are refreshed — check your changes and save again.',
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

  const setStage = (sku: string, stage: STAGE, raw: string) =>
    setStages((p) => ({
      ...p,
      [sku]: { ...p[sku], [stage]: Math.max(0, Number.parseInt(raw, 10) || 0) },
    }));

  const selectClass =
    'h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-60';

  return (
    <>
      <Dialog
        open={open}
        // While reviewing, Escape goes back to the form rather than prompting a discard behind it.
        onClose={reviewing ? () => setReviewing(false) : onClose}
        confirmOnClose={!reviewing}
        maxWidthClassName="max-w-3xl"
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
        <div className="mb-4 max-w-xs">
          <label className="mb-1 block text-xs font-medium">
            {t('admin.production.stage', { defaultValue: 'Stage' })}
          </label>
          {/* A held lot keeps its status here — Resume owns that move. */}
          <select
            value={status}
            disabled={held}
            onChange={(e) => setPicked(e.target.value as BatchStatus)}
            className={selectClass}
          >
            {held && <option value={base.status}>{label(base.status)}</option>}
            {FLOOR_STAGES.map((st) => (
              <option key={st} value={st}>
                {label(st)}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <th className="py-2 pr-3 text-left font-semibold">
                  {t('admin.production.size', { defaultValue: 'Size' })}
                </th>
                <th className="py-2 pr-3 text-left font-semibold">
                  {t('admin.production.lot.planned', { defaultValue: 'Planned' })}
                </th>
                {STAGES.map((m) => (
                  <th key={m.stage} className="py-2 pr-3 text-left font-semibold">
                    {t(`admin.production.lot.${m.key}`, { defaultValue: m.text })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {base.sizes.map((s) => (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-3 font-semibold">{s.size}</td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-9 w-20 text-center text-sm font-semibold"
                      value={String(planned[s.sku] ?? 0)}
                      onChange={(e) =>
                        setPlanned((p) => ({
                          ...p,
                          [s.sku]: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      aria-label={t('admin.production.lot.plannedFor', {
                        defaultValue: 'Planned for size {{size}}',
                        size: s.size,
                      })}
                    />
                  </td>
                  {STAGES.map((m) => (
                    <td key={m.stage} className="py-2 pr-3">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="h-9 w-20 text-center text-sm font-semibold"
                        value={String(stages[s.sku]?.[m.stage] ?? 0)}
                        onChange={(e) => setStage(s.sku, m.stage, e.target.value)}
                        aria-label={t('admin.production.lot.stageQtyFor', {
                          defaultValue: '{{stage}} for size {{size}}',
                          stage: m.text,
                          size: s.size,
                        })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
