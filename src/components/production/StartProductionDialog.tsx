import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Factory } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BatchOrigin, CreateBatchBody } from '@/api/production';

/** One seed row. Cover/stock/suggested exist only when the seed is a forecast. */
export interface StartSizeSeed {
  sku: string;
  size: string;
  /** null = no forecast for this size. */
  suggestedQty: number | null;
  coverDays?: number | null;
  currentStock?: number | null;
}

export interface StartProductionTarget {
  origin: BatchOrigin;
  styleKey?: string;
  styleId?: number;
  styleRef: string | null;
  name: string | null;
  imageUrl: string | null;
  sizes: StartSizeSeed[];
  /** Forecast context for the header strip — omitted on style-origin. */
  drr?: number | null;
  worstCoverDays?: number | null;
  totalStock?: number | null;
}

function coverTone(days: number | null | undefined): string {
  if (days == null) return 'text-[var(--color-muted-foreground)]';
  if (days < 7) return 'text-[var(--color-destructive)]';
  if (days <= 15) return 'text-amber-600';
  return 'text-[var(--color-muted-foreground)]';
}

/**
 * The SINGLE way a production batch is started — used by the Production board
 * header, the Inventory Health rows, and the dashboard live tab. Quantities
 * prefill from the forecast where one exists; a style-origin batch starts at 0
 * per size and posts no `suggestedQty` at all (absent ≠ zero).
 */
export default function StartProductionDialog({
  open,
  busy,
  target,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  target: StartProductionTarget | null;
  onClose: () => void;
  onConfirm: (body: CreateBatchBody) => void;
}) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !target) return;
    const seeded: Record<string, number> = {};
    for (const s of target.sizes) seeded[s.sku] = s.suggestedQty ?? 0;
    setQty(seeded);
    setNotes('');
  }, [open, target]);

  const totals = useMemo(() => {
    if (!target) return { planned: 0, suggested: 0, hasForecast: false };
    const planned = Object.values(qty).reduce((a, b) => a + b, 0);
    const withForecast = target.sizes.filter((s) => s.suggestedQty != null);
    return {
      planned,
      suggested: withForecast.reduce((a, s) => a + (s.suggestedQty ?? 0), 0),
      hasForecast: withForecast.length > 0,
    };
  }, [qty, target]);

  if (!target) return null;

  const delta = totals.planned - totals.suggested;
  const deltaLabel =
    delta > 0
      ? t('admin.production.start.over', { defaultValue: '+{{n}} over', n: delta })
      : delta < 0
        ? t('admin.production.start.under', { defaultValue: '{{n}} under', n: Math.abs(delta) })
        : t('admin.production.start.onPlan', { defaultValue: 'on plan' });

  const set = (sku: string, raw: string) => {
    const n = Math.max(0, Number.parseInt(raw, 10) || 0);
    setQty((prev) => ({ ...prev, [sku]: n }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      title={
        <div className="flex items-start gap-3">
          {target.imageUrl ? (
            <img
              src={target.imageUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-muted)]" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              {t('admin.production.start.eyebrow', { defaultValue: 'Start production' })}
            </div>
            <div className="truncate text-base font-semibold">
              {target.name ??
                target.styleRef ??
                t('admin.production.untitled', { defaultValue: 'Untitled style' })}
            </div>
            <div className="truncate font-mono text-[11px] font-normal text-[var(--color-muted-foreground)]">
              {[target.styleKey, target.styleRef].filter(Boolean).join(' · ')}
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
            disabled={busy || totals.planned <= 0}
            onClick={() =>
              onConfirm({
                origin: target.origin,
                styleKey: target.styleKey,
                styleId: target.styleId,
                notes: notes.trim() || undefined,
                items: target.sizes
                  .filter((s) => (qty[s.sku] ?? 0) > 0)
                  .map((s) => ({
                    sku: s.sku,
                    size: s.size,
                    qtyPlanned: qty[s.sku] ?? 0,
                    // Omitted entirely on style-origin — absent means "no
                    // forecast existed", which is not the same as 0.
                    ...(s.suggestedQty != null ? { suggestedQty: s.suggestedQty } : {}),
                  })),
              })
            }
          >
            <Factory size={14} />
            <span className="ml-1">
              {t('admin.production.start.confirm', {
                defaultValue: 'Start production · {{n}} pcs',
                n: totals.planned,
              })}
            </span>
          </Button>
        </>
      }
    >
      {/* Forecast context strip — only meaningful for a forecast-origin batch. */}
      {target.origin === 'forecast' && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--color-border)] pb-3 text-sm">
          <span>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t('admin.production.start.cover', { defaultValue: 'Cover' })}
            </span>{' '}
            <span className={`font-semibold ${coverTone(target.worstCoverDays)}`}>
              {target.worstCoverDays != null ? `${target.worstCoverDays.toFixed(1)}d` : '—'}
            </span>
          </span>
          <span>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t('admin.production.start.drr', { defaultValue: 'Daily run rate' })}
            </span>{' '}
            <span className="font-semibold">
              {target.drr != null ? `${target.drr.toFixed(1)}/day` : '—'}
            </span>
          </span>
          <span>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {t('admin.production.start.inStock', { defaultValue: 'In stock' })}
            </span>{' '}
            <span className="font-semibold">{target.totalStock ?? '—'}</span>
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.size', { defaultValue: 'Size' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.start.qtyToMake', { defaultValue: 'Qty to make' })}
              </th>
              <th className="py-2 pr-3 text-left font-semibold">
                {t('admin.production.suggested', { defaultValue: 'Suggested' })}
              </th>
              <th className="py-2 pr-3 text-right font-semibold">
                {t('admin.production.cover', { defaultValue: 'Cover' })}
              </th>
              <th className="py-2 text-right font-semibold">
                {t('admin.production.stock', { defaultValue: 'Stock' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {target.sizes.map((s) => {
              // A size the forecast says needs nothing is dimmed, not hidden —
              // you can still choose to make it.
              const idle = (s.suggestedQty ?? 0) === 0;
              const rowDelta = (qty[s.sku] ?? 0) - (s.suggestedQty ?? 0);
              return (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td
                    className={`py-2 pr-3 font-semibold ${idle ? 'text-[var(--color-muted-foreground)]' : ''}`}
                  >
                    {s.size}
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="h-9 w-24 text-center text-sm font-semibold"
                      value={String(qty[s.sku] ?? 0)}
                      onChange={(e) => set(s.sku, e.target.value)}
                      aria-label={t('admin.production.start.qtyFor', {
                        defaultValue: 'Quantity for size {{size}}',
                        size: s.size,
                      })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[var(--color-muted-foreground)]">
                        {s.suggestedQty ?? '—'}
                      </span>
                      {s.suggestedQty != null && rowDelta !== 0 && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          {rowDelta > 0 ? `+${rowDelta}` : rowDelta}
                        </span>
                      )}
                      {s.suggestedQty != null && rowDelta !== 0 && (
                        <button
                          type="button"
                          className="text-[12px] font-semibold text-[var(--color-primary)] hover:underline"
                          onClick={() => set(s.sku, String(s.suggestedQty ?? 0))}
                        >
                          {t('admin.production.start.use', { defaultValue: 'Use' })}
                        </button>
                      )}
                    </span>
                  </td>
                  <td className={`py-2 pr-3 text-right font-semibold ${coverTone(s.coverDays)}`}>
                    {s.coverDays != null ? `${s.coverDays.toFixed(1)}d` : '—'}
                  </td>
                  <td className="py-2 text-right text-[var(--color-muted-foreground)]">
                    {s.currentStock ?? '—'}
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
            {t('admin.production.start.totalToMake', { defaultValue: 'Total to make' })}
          </span>{' '}
          <span className="ml-1 text-lg font-bold">{totals.planned} pcs</span>
        </span>
        {/* Scoped to sizes that HAVE a forecast — mixing in style-origin sizes
            would average comparable and non-comparable rows together. */}
        {totals.hasForecast && (
          <span className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.production.start.suggestedTotal', {
              defaultValue: 'Suggested {{n}}',
              n: totals.suggested,
            })}{' '}
            ·{' '}
            <span
              className={
                delta > 0
                  ? 'font-semibold text-amber-600'
                  : delta < 0
                    ? 'font-semibold text-[var(--color-destructive)]'
                    : 'font-semibold text-emerald-600'
              }
            >
              {deltaLabel}
            </span>
          </span>
        )}
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          {t('admin.production.start.notes', { defaultValue: 'Production notes' })}
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('admin.production.start.notesPlaceholder', {
            defaultValue: 'e.g. rush order for Myntra EOSS',
          })}
        />
      </div>

      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        {t('admin.production.start.hint', {
          defaultValue:
            'The batch opens at Cutting. Quantities stay editable until you record output.',
        })}
      </p>
    </Dialog>
  );
}
