import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CARD_SHELL, DISPLAY } from '@/components/admin/kpiPrimitives';
import type { CancellationFault, CancellationSection as Section } from '@/api/salesKpis';

/** Our-fault slices in warm tones, the rest cool, unknown grey. */
const SLICE_COLOUR: Record<string, string> = {
  failedHandover: '#c4322a',
  oursOther: '#f59f00',
  customer: '#4c6ef5',
  platform: '#7950f2',
  reasonUnknown: '#ced4da',
};
const REASON_COLOURS = ['#e8590c', '#4c6ef5', '#12b886', '#f59f00', '#7950f2'];
const OTHER_COLOUR = '#ced4da';
const TOP_REASONS = 5;

const fmt = (n: number): string => n.toLocaleString('en-IN');
const pct = (n: number, of: number): string => (of ? `${Math.round((n / of) * 100)}%` : '0%');

/** Cancellations before dispatch: three totals, who is to blame, why, and every reason. Lazy-loaded with Recharts. */
export default function CancellationSection({ data, range }: { data: Section; range: string }): ReactNode {
  const { t } = useTranslation();
  const faultSlices = data.slices
    .filter((s) => s.orders > 0)
    .map((s) => ({ name: s.label, value: s.orders, colour: SLICE_COLOUR[s.key] ?? OTHER_COLOUR }));
  const top = data.reasons.slice(0, TOP_REASONS);
  const rest = data.reasons.slice(TOP_REASONS).reduce((n, r) => n + r.orders, 0);
  const reasonSlices = [
    ...top.map((r, i) => ({ name: r.reason, value: r.orders, colour: REASON_COLOURS[i] })),
    ...(rest ? [{ name: t('admin.salesKpis.cancel.other', { defaultValue: 'Other' }), value: rest, colour: OTHER_COLOUR }] : []),
  ];
  const sliceTotal = faultSlices.reduce((n, s) => n + s.value, 0);
  const reasonTotal = reasonSlices.reduce((n, s) => n + s.value, 0);

  return (
    <section className="mt-7">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {t('admin.salesKpis.cancel.title', { defaultValue: 'Cancellations before dispatch' })}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-[18px]">
        <Total label={t('admin.salesKpis.cancel.total', { defaultValue: 'Cancelled before dispatch' })} value={data.cancelled} range={range} />
        <Total label={t('admin.salesKpis.cancel.ours', { defaultValue: 'Our fault' })} value={data.ours} range={range} tone="#c4322a" />
        <Total label={t('admin.salesKpis.cancel.notOurs', { defaultValue: 'Not our fault' })} value={data.notOurs} range={range} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-[18px]">
        <Donut title={t('admin.salesKpis.cancel.whose', { defaultValue: 'Whose fault' })} slices={faultSlices} total={sliceTotal} />
        <Donut title={t('admin.salesKpis.cancel.why', { defaultValue: 'Top reasons' })} slices={reasonSlices} total={reasonTotal} />
      </div>

      {data.reasons.length > 0 && (
        <div style={CARD_SHELL} className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {data.reasons.map((r) => (
                  <tr key={r.reason} className="border-t border-neutral-100 first:border-t-0">
                    <td className="py-1.5 pr-3">
                      <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${dot(r.fault)}`} />
                      <span className={r.fault === 'ours' ? 'text-neutral-900' : 'text-neutral-600'}>{r.reason}</span>
                    </td>
                    <td className="w-20 py-1.5 text-right tabular-nums text-neutral-900">{fmt(r.orders)}</td>
                    <td className="w-14 py-1.5 text-right tabular-nums text-neutral-400">{pct(r.orders, data.cancelled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function dot(fault: CancellationFault): string {
  if (fault === 'ours') return 'bg-orange-500';
  if (fault === 'platform') return 'bg-violet-500';
  if (fault === 'customer') return 'bg-indigo-400';
  return 'bg-neutral-300';
}

function Total({ label, value, range, tone }: { label: string; value: number; range: string; tone?: string }): ReactNode {
  return (
    <div style={CARD_SHELL}>
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 30, lineHeight: 1, fontWeight: 600, color: tone ?? '#11151f', fontFeatureSettings: "'tnum' 1" }}>
        {fmt(value)}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-neutral-400">{range}</div>
    </div>
  );
}

function Donut({
  title,
  slices,
  total,
}: {
  title: string;
  slices: { name: string; value: number; colour: string }[];
  total: number;
}): ReactNode {
  return (
    <div style={CARD_SHELL}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</div>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-44 w-44 flex-none">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1} stroke="none" isAnimationActive={false}>
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.colour} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`${fmt(v)} · ${pct(v, total)}`, '']} separator="" />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span style={{ fontFamily: DISPLAY }} className="text-2xl font-semibold tabular-nums text-neutral-900">
              {fmt(total)}
            </span>
          </div>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.colour }} />
              <span className="min-w-0 flex-1 truncate text-neutral-700">{s.name}</span>
              <span className="tabular-nums text-neutral-900">{fmt(s.value)}</span>
              <span className="w-10 text-right tabular-nums text-neutral-400">{pct(s.value, total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
