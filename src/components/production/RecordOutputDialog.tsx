import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductionBatch } from '@/api/production';

/** Records what was made per size — the only way a lot reaches `completed`; unfinished pieces go to a sub-lot. */
export default function RecordOutputDialog({
  open,
  busy,
  batch,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  batch: ProductionBatch | null;
  onClose: () => void;
  onConfirm: (
    items: { sku: string; qtyProduced: number; qtyToSubLot?: number }[],
    shortfallReason?: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const [produced, setProduced] = useState<Record<string, number>>({});
  // Per size, how many unfinished pieces move to the sub-lot; unset = all of them.
  const [toSub, setToSub] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open || !batch) return;
    const seeded: Record<string, number> = {};
    // What finishing recorded is the output; only a lot with no stage history falls back to the plan.
    for (const s of batch.sizes) {
      seeded[s.sku] = s.qtyProduced ?? (s.qtyCut > 0 ? s.qtyFinished : s.qtyPlanned);
    }
    setProduced(seeded);
    setToSub({});
    setReason('');
  }, [open, batch]);

  const totals = useMemo(() => {
    if (!batch) return { produced: 0, planned: 0 };
    return {
      produced: Object.values(produced).reduce((a, b) => a + b, 0),
      planned: batch.qtyPlanned,
    };
  }, [produced, batch]);

  if (!batch) return null;

  // Cut but not completed — same maths as the server's splitRemainder.
  const remaining = (sku: string) => {
    const s = batch.sizes.find((z) => z.sku === sku)!;
    return Math.max(0, s.qtyCut - s.qtyScrapped - (produced[sku] ?? 0));
  };
  const movingFor = (sku: string) => Math.min(remaining(sku), toSub[sku] ?? remaining(sku));
  const moving = batch.sizes.reduce((n, s) => n + movingFor(s.sku), 0);
  const writtenOff = batch.sizes.reduce((n, s) => n + remaining(s.sku) - movingFor(s.sku), 0);
  // Moving pieces aren't short; written-off ones are.
  const diff = totals.produced + moving - totals.planned;
  const short = writtenOff > 0 || diff < 0;
  const diffLabel =
    diff < 0
      ? t('admin.production.output.short', { defaultValue: '{{n}} short', n: Math.abs(diff) })
      : diff > 0
        ? t('admin.production.output.over', { defaultValue: '+{{n}} over', n: diff })
        : t('admin.production.output.onPlan', { defaultValue: 'on plan' });

  const set = (sku: string, raw: string) => {
    const n = Math.max(0, Number.parseInt(raw, 10) || 0);
    setProduced((prev) => ({ ...prev, [sku]: n }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      title={
        <div className="flex items-start gap-3">
          {batch.imageUrl ? (
            <img
              src={batch.imageUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-muted)]" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              {t('admin.production.output.eyebrow', { defaultValue: 'Record output' })}
            </div>
            <div className="truncate text-base font-semibold">
              {batch.name ??
                batch.styleRef ??
                t('admin.production.untitled', { defaultValue: 'Untitled style' })}
            </div>
            <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
              {[batch.styleKey, batch.styleRef, batch.batchNo].filter(Boolean).join(' · ')}
            </div>
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
            // Short of plan needs a reason — the server refuses it otherwise,
            // and the lot is meant to stay open until the rest is made.
            disabled={busy || (short && !reason.trim())}
            onClick={() =>
              onConfirm(
                batch.sizes.map((s) => ({
                  sku: s.sku,
                  qtyProduced: produced[s.sku] ?? 0,
                  ...(remaining(s.sku) > 0 ? { qtyToSubLot: movingFor(s.sku) } : {}),
                })),
                short ? reason.trim() || undefined : undefined,
              )
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">
              {t('admin.production.output.confirm', {
                defaultValue: 'Mark complete · {{n}} pcs',
                n: totals.produced,
              })}
            </span>
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.size', { defaultValue: 'Size' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">SKU</th>
              <th className="py-2 pr-3 text-right font-semibold">
                {t('admin.production.planned', { defaultValue: 'Planned' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.produced', { defaultValue: 'Produced' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.output.toSubLot', { defaultValue: 'To sub-lot' })}
              </th>
              <th className="py-2 text-left font-semibold">
                {t('admin.production.variance', { defaultValue: 'Variance' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.sizes.map((s) => {
              const v = (produced[s.sku] ?? 0) + movingFor(s.sku) - s.qtyPlanned;
              return (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-3 font-semibold">{s.size}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-[var(--color-muted-foreground)]">
                    {s.sku}
                  </td>
                  <td className="py-2 pr-3 text-right text-[var(--color-muted-foreground)]">
                    {s.qtyPlanned}
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-9 w-24 text-center text-sm font-semibold"
                      value={String(produced[s.sku] ?? 0)}
                      onChange={(e) => set(s.sku, e.target.value)}
                      aria-label={t('admin.production.output.qtyFor', {
                        defaultValue: 'Produced quantity for size {{size}}',
                        size: s.size,
                      })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {remaining(s.sku) > 0 ? (
                      <Input
                        type="number"
                        min={0}
                        max={remaining(s.sku)}
                        inputMode="numeric"
                        className="h-9 w-24 text-center text-sm font-semibold"
                        value={String(movingFor(s.sku))}
                        onChange={(e) =>
                          setToSub((p) => ({
                            ...p,
                            [s.sku]: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                          }))
                        }
                        aria-label={t('admin.production.output.toSubLotFor', {
                          defaultValue: 'Pieces moving to the sub-lot for size {{size}}',
                          size: s.size,
                        })}
                      />
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {v !== 0 && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          v < 0
                            ? 'bg-red-50 text-[var(--color-destructive)]'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {v < 0
                          ? t('admin.production.output.unitsShort', {
                              defaultValue: '{{n}} units',
                              n: v,
                            })
                          : t('admin.production.output.unitsSurplus', {
                              defaultValue: '+{{n}} surplus',
                              n: v,
                            })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--color-muted)] px-4 py-3">
        <span>
          <span className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.production.output.totalProduced', { defaultValue: 'Total produced' })}
          </span>{' '}
          <span className="ml-1 text-lg font-bold">{totals.produced} pcs</span>
        </span>
        <span className="text-sm text-[var(--color-muted-foreground)]">
          {t('admin.production.output.plannedTotal', {
            defaultValue: 'Planned {{n}}',
            n: totals.planned,
          })}{' '}
          ·{' '}
          <span
            className={
              diff < 0
                ? 'font-semibold text-[var(--color-destructive)]'
                : diff > 0
                  ? 'font-semibold text-amber-600'
                  : 'font-semibold text-emerald-600'
            }
          >
            {diffLabel}
          </span>
        </span>
      </div>

      {/* Lots worked on the old board may never have had finishing recorded. */}
      {batch.sizes.every((s) => s.qtyFinished === 0) &&
        batch.sizes.some((s) => remaining(s.sku) > Math.max(0, s.qtyAltered)) && (
        <div className="mt-3 rounded-[var(--radius-sm)] border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
          {t('admin.production.output.nothingFinished', {
            defaultValue:
              'Nothing is recorded as finished on this lot — enter what was actually made before completing.',
          })}
        </div>
      )}

      {(moving > 0 || writtenOff > 0) && (
        <div className="mt-3 space-y-0.5 rounded-[var(--radius-sm)] bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
          {moving > 0 && (
            <div>
              {t('admin.production.output.subLot', {
                defaultValue: '{{n}} pcs not completed move to a new sub-lot',
                n: moving,
              })}
            </div>
          )}
          {writtenOff > 0 && (
            <div>
              {t('admin.production.output.writtenOff', {
                defaultValue: '{{n}} pcs written off as scrapped',
                n: writtenOff,
              })}
            </div>
          )}
        </div>
      )}

      {short && (
        <div className="mt-4">
          <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
            {t('admin.production.output.reason', {
              defaultValue: 'Why is it short?',
            })}
          </label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.production.output.reasonPlaceholder', {
              defaultValue: 'e.g. 3 pcs rejected at QC',
            })}
          />
        </div>
      )}
    </Dialog>
  );
}
