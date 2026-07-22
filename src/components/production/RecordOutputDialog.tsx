import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Info } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductionBatch } from '@/api/production';

/**
 * Records what the floor actually made. This is the ONLY place per-size
 * produced quantities are captured, which is why `completed` is absent from the
 * inline stage dropdown — reaching it any other way would leave the batch
 * complete with no output recorded.
 */
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
  onConfirm: (items: { sku: string; qtyProduced: number }[], shortfallReason?: string) => void;
}) {
  const { t } = useTranslation();
  const [produced, setProduced] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open || !batch) return;
    const seeded: Record<string, number> = {};
    // Prefill with the plan — the common case is "we made what we planned".
    for (const s of batch.sizes) seeded[s.sku] = s.qtyProduced ?? s.qtyPlanned;
    setProduced(seeded);
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

  const diff = totals.produced - totals.planned;
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
            disabled={busy}
            onClick={() =>
              onConfirm(
                batch.sizes.map((s) => ({ sku: s.sku, qtyProduced: produced[s.sku] ?? 0 })),
                reason.trim() || undefined,
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
              <th className="py-2 text-left font-semibold">
                {t('admin.production.variance', { defaultValue: 'Variance' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.sizes.map((s) => {
              const v = (produced[s.sku] ?? 0) - s.qtyPlanned;
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

      {diff < 0 && (
        <div className="mt-4">
          <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
            {t('admin.production.output.reason', {
              defaultValue: 'Shortfall reason (optional)',
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

      <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)]/10 px-3 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {t('admin.production.output.pipelineNote', {
            defaultValue:
              'These units keep counting toward the forecast until the batch is marked Dispatched.',
          })}
        </span>
      </div>
    </Dialog>
  );
}
