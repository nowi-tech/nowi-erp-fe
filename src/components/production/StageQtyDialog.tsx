import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TailorPicker from '@/components/production/TailorPicker';
import type { BatchStatus, ProductionBatch, StageQtyItem } from '@/api/production';

/** Which recorded figure the stage being entered is measured against. Cutting
 *  answers to the plan; every later stage answers to the stage before it. */
const PREVIOUS: Record<string, { key: 'qtyPlanned' | 'qtyCut' | 'qtyStitched'; label: string }> = {
  cutting: { key: 'qtyPlanned', label: 'Planned' },
  stitching: { key: 'qtyCut', label: 'Cut' },
  finishing: { key: 'qtyStitched', label: 'Stitched' },
};

const STAGE_VERB: Record<string, string> = {
  cutting: 'Cutting',
  stitching: 'Stitching',
  finishing: 'Finishing',
};

/**
 * Records how many pieces of each size reached ONE stage. Every floor move goes
 * through here — Pipeline → cutting (where the tailor is named and the lot
 * number gains its suffix), then cutting → stitching → finishing.
 *
 * The plan is shown but never editable: the whole point is that "planned 500,
 * cut 480" survives the move. Quantities are additive on the server, so moving
 * into a stage twice records more rather than replacing what was there.
 */
export default function StageQtyDialog({
  open,
  busy,
  batch,
  stage,
  askTailor = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  batch: ProductionBatch | null;
  /** Stage being entered — decides the column labels and what Δ compares to. */
  stage: BatchStatus;
  /** Pipeline → floor also names the tailor; later stage moves don't. */
  askTailor?: boolean;
  onClose: () => void;
  onConfirm: (
    items: StageQtyItem[],
    extra?: { tailorId?: number; fabricFeasible?: boolean },
  ) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tailorId, setTailorId] = useState<number | ''>('');
  // Asked once, on the way to the floor: cutting into fabric you don't have is
  // the expensive mistake. Recorded on the audit entry for the send.
  const [fabricOk, setFabricOk] = useState(false);

  const prev = PREVIOUS[stage] ?? PREVIOUS.cutting;

  useEffect(() => {
    if (!open || !batch) return;
    // Seed each size with what the previous step recorded — the common case is
    // "all of it moved on", and a short size is the exception you type over.
    const seeded: Record<string, number> = {};
    for (const s of batch.sizes) seeded[s.sku] = s[prev.key] ?? 0;
    setQty(seeded);
    setTailorId(batch.tailorId ?? '');
    setFabricOk(false);
  }, [open, batch, prev.key]);

  const total = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  if (!batch) return null;

  const set = (sku: string, raw: string) =>
    setQty((p) => ({ ...p, [sku]: Math.max(0, Number.parseInt(raw, 10) || 0) }));

  const verb = STAGE_VERB[stage] ?? stage;
  const canSubmit = total > 0 && (!askTailor || (tailorId !== '' && fabricOk));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {t(`admin.production.stage.${stage}`, { defaultValue: verb })}
          </div>
          <div className="truncate text-base font-semibold">
            {batch.name ?? batch.styleRef ?? batch.batchNo}
          </div>
          <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
            {batch.batchNo}
            {batch.tailorName ? ` · ${batch.tailorName}` : ''}
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy || !canSubmit}
            onClick={() =>
              onConfirm(
                batch.sizes.map((s) => ({ sku: s.sku, qty: qty[s.sku] ?? 0 })),
                askTailor
                  ? {
                      tailorId: tailorId === '' ? undefined : tailorId,
                      fabricFeasible: fabricOk,
                    }
                  : undefined,
              )
            }
          >
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.stage.confirm', {
                defaultValue: '{{verb}} · {{n}}',
                verb,
                n: total,
              })}
            </span>
          </Button>
        </>
      }
    >
      {askTailor && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium">
            {t('admin.production.stage.tailor', { defaultValue: 'Tailor' })}
          </label>
          <TailorPicker
            value={tailorId === '' ? null : tailorId}
            onChange={(id) => setTailorId(id ?? '')}
          />

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 hover:bg-[var(--color-surface-2)]/40">
            <input
              type="checkbox"
              checked={fabricOk}
              onChange={(e) => setFabricOk(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            <span className="text-sm">
              {t('admin.production.stage.fabricFeasible', {
                defaultValue: 'Fabric is available for this lot.',
              })}
            </span>
          </label>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.size', { defaultValue: 'Size' })}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">
                {t(`admin.production.stage.prev.${prev.key}`, { defaultValue: prev.label })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">{verb}</th>
              <th className="py-2 text-right font-semibold">
                {t('admin.production.stage.delta', { defaultValue: 'Diff' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.sizes.map((s) => {
              const before = s[prev.key] ?? 0;
              const delta = (qty[s.sku] ?? 0) - before;
              return (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-3 font-semibold">{s.size}</td>
                  <td className="py-2 pr-3 text-right text-[var(--color-muted-foreground)]">
                    {before}
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-9 w-24 text-center text-sm font-semibold"
                      value={qty[s.sku] === 0 ? '' : String(qty[s.sku] ?? '')}
                      placeholder="0"
                      onChange={(e) => set(s.sku, e.target.value)}
                      aria-label={t('admin.production.send.qtyFor', {
                        defaultValue: 'Quantity for size {{size}}',
                        size: s.size,
                      })}
                    />
                  </td>
                  <td className="py-2 text-right">
                    {delta === 0 ? (
                      <span className="text-[var(--color-muted-foreground)]">—</span>
                    ) : (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          delta < 0
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
