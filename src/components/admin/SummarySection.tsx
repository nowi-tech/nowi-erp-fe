import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CARD_SHELL } from '@/components/admin/kpiPrimitives';
import type { SalesInventoryView, SummaryRow } from '@/api/salesKpis';

/** "29 Jun" for a YYYY-MM-DD. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmt(v: number | null, format: SummaryRow['format']): string {
  if (v === null || v === undefined) return '—';
  if (format === 'currency') return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  if (format === 'percent') return `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('en-IN');
}

/** The detail rows a card can't carry — India / China / Combined, side by side.
 *  Shows all three whatever the view is; the picked one is tinted. */
export function SummarySection({
  rows,
  from,
  to,
  active,
  perItem,
}: {
  rows: SummaryRow[];
  from: string;
  to: string;
  active: SalesInventoryView;
  /** Fulfilment rows count items, so they read differently from the cards, which count orders. */
  perItem: boolean;
}): ReactNode {
  const { t } = useTranslation();
  if (!rows.length) return null;
  const cols: { view: SalesInventoryView; label: string; pick: (r: SummaryRow) => number | null }[] = [
    { view: 'real', label: t('admin.salesSummary.india', { defaultValue: 'India' }), pick: (r) => r.real },
    { view: 'virtual', label: t('admin.salesSummary.china', { defaultValue: 'China' }), pick: (r) => r.virtual },
    { view: 'all', label: t('admin.salesSummary.combined', { defaultValue: 'Combined' }), pick: (r) => r.all },
  ];
  const tint = (view: SalesInventoryView): string => (view === active ? 'bg-neutral-50' : '');

  return (
    <section className="mt-7">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {t('admin.salesSummary.title', { defaultValue: 'Summary' })}
      </h2>
      <p className="mb-2.5 text-xs text-neutral-500">
        {perItem
          ? t('admin.salesSummary.caption', {
              defaultValue: 'Per item · {{from}} to {{to}}',
              from: dayLabel(from),
              to: dayLabel(to),
            })
          : t('admin.salesSummary.captionPlain', {
              defaultValue: '{{from}} to {{to}}',
              from: dayLabel(from),
              to: dayLabel(to),
            })}
      </p>
      <div style={CARD_SHELL} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-neutral-400">
              <th className="py-1.5 pr-3 text-left font-semibold">
                {t('admin.salesSummary.metric', { defaultValue: 'Metric' })}
              </th>
              {cols.map((c) => (
                <th key={c.view} className={`w-32 py-1.5 text-right font-semibold ${tint(c.view)}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-neutral-100">
                <td className="py-1.5 pr-3 text-neutral-700">{r.label}</td>
                {cols.map((c) => (
                  <td
                    key={c.view}
                    className={`py-1.5 text-right tabular-nums text-neutral-900 ${tint(c.view)} ${
                      c.view === 'all' ? 'font-medium' : ''
                    }`}
                  >
                    {fmt(c.pick(r), r.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
