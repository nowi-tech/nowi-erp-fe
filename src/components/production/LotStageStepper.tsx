import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { BatchStatus, ProductionBatch } from '@/api/production';
import { hasLeftFloor } from '@/lib/production';

const ORDER: BatchStatus[] = ['cutting', 'stitching', 'finishing'];

/**
 * The lot's journey as one strip: what each stage holds, and how many pieces are
 * waiting to move on. The "ready" figures are derived, never stored — the same
 * arithmetic the record dialog caps its inputs with, so the strip and the dialog
 * can't tell you different things.
 *
 * Cutting has no ready figure on purpose: its quantity is written when the lot is
 * SENT to the floor, so it would read "all ready" before anyone touched the cloth.
 */
export default function LotStageStepper({ lot }: { lot: ProductionBatch }) {
  const { t } = useTranslation();

  const sum = (pick: (s: ProductionBatch['sizes'][number]) => number) =>
    lot.sizes.reduce((n, s) => n + pick(s), 0);

  const planned = sum((s) => s.qtyPlanned);
  const cut = sum((s) => s.qtyCut);
  const stitched = sum((s) => s.qtyStitched);
  const finished = sum((s) => s.qtyFinished);
  const altered = sum((s) => s.qtyAltered);
  const scrapped = sum((s) => s.qtyScrapped);

  // -1 both before the floor (planning) and after it, so past-the-floor is named, not inferred.
  // Alteration sits at finishing on the strip; a held lot shows where it was held.
  const where = lot.status === 'on_hold' ? lot.heldFromStatus : lot.status;
  const at = ORDER.indexOf(where === 'alteration' ? 'finishing' : (where ?? lot.status));
  const pastFloor = hasLeftFloor(lot.status);
  // `value` is what the stage recorded; `pending` is work owed at the stage that owes it —
  // a stitched piece has arrived at finishing. Clamped: `finished` double-counts a rework round.
  // A closed lot owes nothing.
  const owed = (n: number) => (pastFloor ? 0 : Math.max(0, n));
  const steps = [
    { key: 'cutting', label: 'cut', value: cut, pending: owed(planned - cut) },
    { key: 'stitching', label: 'stitched', value: stitched, pending: owed(cut - stitched) },
    {
      key: 'finishing',
      label: 'finished',
      value: finished,
      // Pieces at the tailor are pending nowhere — they are in alteration.
      pending: owed(stitched - scrapped - altered - finished),
    },
  ];

  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {steps.map((step, i) => {
        const holds = step.pending > 0;
        const done = !holds && (pastFloor || (at !== -1 && i < at));
        const here = i === at;
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-shrink-0 items-center gap-2.5">
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  done
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : holds || here
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'
                }`}
              >
                {done ? <Check size={14} /> : i + 1}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  {t(`admin.production.stage.${step.key}`, { defaultValue: step.key })}
                </div>
                <div
                  className={`whitespace-nowrap text-[13px] font-semibold ${
                    holds || done || here ? '' : 'text-[var(--color-muted-foreground)]'
                  }`}
                >
                  {t(`admin.production.lot.stepValue.${step.key}`, {
                    defaultValue: '{{n}} {{label}}',
                    n: step.value,
                    label: step.label,
                  })}
                  {/* Its own span so the outstanding half carries the amber —
                      the moved-on half is not a warning. */}
                  {holds && (
                    <span className="ml-1 font-semibold text-amber-700">
                      {t('admin.production.lot.stepPending', {
                        defaultValue: '· {{p}} pending',
                        p: step.pending,
                      })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-2.5 h-0.5 min-w-3 flex-1 rounded ${
                  done ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                }`}
              />
            )}
          </div>
        );
      })}
      {altered > 0 && (
        <div className="ml-4 flex-shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-700">
          {t('admin.production.lot.outForAlteration', {
            defaultValue: '↩ {{n}} in alteration',
            n: altered,
          })}
        </div>
      )}
    </div>
  );
}
