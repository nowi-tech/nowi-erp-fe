import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '@/components/ui/drawer';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import {
  addStyleRemark,
  getStyleDetails,
  type InventoryStyle,
  type InventoryView,
  type StyleDetails,
  type StyleRemark,
} from '@/api/inventoryHealth';
import { dayLabel, dayTimeLabel, fullDayLabel } from '@/lib/date';

const GROUPS = ['fit', 'looks', 'quality', 'other'] as const;
type Group = (typeof GROUPS)[number];

/** Inventory Health's right panel: per-size stock, sales and returns, return reasons, fabric and remarks. */
export function StyleDetailPanel({
  style,
  from,
  to,
  inventory,
  onClose,
  onRemarkAdded,
  onOpenStylePage,
  onOpenFamily,
}: {
  style: InventoryStyle | null;
  from: string;
  to: string;
  inventory: InventoryView;
  onClose: () => void;
  onRemarkAdded: (styleKey: string, remark: StyleRemark) => void;
  onOpenStylePage: (erpId: number) => void;
  /** Opens another colour of the same design in this panel. */
  onOpenFamily: (member: { id: number; styleId: string | null }) => void;
}): ReactNode {
  const { t } = useTranslation();
  const toast = useToast();
  const [details, setDetails] = useState<StyleDetails | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [hoverGroup, setHoverGroup] = useState<Group | null>(null);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const styleKey = style?.styleKey ?? null;
  const erpId = style?.linkedStyleId ?? null;

  useEffect(() => {
    setDraft('');
    setOpenGroup(null);
  }, [styleKey]);

  useEffect(() => {
    if (!styleKey) return;
    let stale = false;
    setDetails(null);
    setFailed(false);
    getStyleDetails(styleKey, erpId, from, to, inventory)
      .then((d) => !stale && setDetails(d))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, [styleKey, erpId, from, to, inventory, tick]);

  const save = async (): Promise<void> => {
    if (!style || !draft.trim()) return;
    setSaving(true);
    try {
      const r = await addStyleRemark(style.styleKey, draft.trim());
      setDraft('');
      setDetails((d) => (d ? { ...d, remarks: [r, ...d.remarks] } : d));
      onRemarkAdded(style.styleKey, r);
    } catch (e) {
      toast.show(apiErrorMessage(e) ?? t('admin.inventoryHealth.panel.remarkFailed', { defaultValue: 'Could not save the remark.' }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const reasonTotal = (details?.reasons ?? []).reduce((n, r) => n + r.count, 0);
  const groupCount = (g: Group): number =>
    (details?.reasons ?? []).filter((r) => r.group === g).reduce((a, r) => a + r.count, 0);
  const fabric = style?.fabric ?? null;
  const groupLabel: Record<(typeof GROUPS)[number], string> = {
    fit: t('admin.inventoryHealth.panel.groupFit', { defaultValue: 'Fit / size' }),
    looks: t('admin.inventoryHealth.panel.groupLooks', { defaultValue: 'Looks different' }),
    quality: t('admin.inventoryHealth.panel.groupQuality', { defaultValue: 'Quality' }),
    other: t('admin.inventoryHealth.panel.groupOther', { defaultValue: 'Other' }),
  };

  return (
    <Drawer
      open={style != null}
      onClose={() => !saving && onClose()}
      title={style?.displayKey}
      subtitle={style?.name ?? undefined}
      width="640px"
      confirmOnClose={draft.trim() !== ''}
      headerAction={
        erpId != null && (
          <button
            type="button"
            onClick={() => onOpenStylePage(erpId)}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {t('admin.inventoryHealth.panel.openStylePage', { defaultValue: 'Open style page' })}
            <ArrowUpRight size={12} />
          </button>
        )
      }
    >
      {style && (
        <div className="space-y-7 text-sm">
          {details?.erp && (
            <Section title={t('admin.inventoryHealth.panel.style', { defaultValue: 'Style' })}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
                <Fact label={t('admin.inventoryHealth.panel.cost', { defaultValue: 'Cost' })}>
                  {details.erp.costPrice == null ? '—' : `₹${details.erp.costPrice.toLocaleString('en-IN')}`}
                </Fact>
                <Fact label={t('admin.inventoryHealth.panel.styleFabric', { defaultValue: 'Fabric' })}>
                  {details.erp.fabricName ?? '—'}
                </Fact>
                <Fact label={t('admin.inventoryHealth.panel.sampleApproved', { defaultValue: 'Sample approved' })}>
                  {fullDayLabel(details.erp.sampleApprovedAt)}
                </Fact>
                <Fact label={t('admin.inventoryHealth.panel.wentLive', { defaultValue: 'Went live' })}>
                  {fullDayLabel(details.erp.wentLiveAt)}
                </Fact>
              </dl>
              {details.erp.family.length > 1 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {t('admin.inventoryHealth.panel.otherColours', { defaultValue: 'Other colours' })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {details.erp.family.map((m) =>
                      m.id === details.erp!.id ? (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1.5 rounded-md border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/[0.06] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)]"
                        >
                          <ColourDot name={m.primaryColour} />
                          {m.primaryColour ?? '—'} · {m.styleId}
                        </span>
                      ) : (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onOpenFamily(m)}
                          // Switching would drop a typed or saving remark.
                          disabled={draft.trim() !== '' || saving}
                          title={draft.trim() ? t('admin.inventoryHealth.panel.saveFirst', { defaultValue: 'Save or clear the remark first' }) : undefined}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ColourDot name={m.primaryColour} />
                          {m.primaryColour ?? '—'} · {m.styleId}
                          <ArrowRight size={12} />
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </Section>
          )}
          <Section
            title={t('admin.inventoryHealth.panel.sizes', { defaultValue: 'Sizes' })}
            tail={
              details
                ? t('admin.inventoryHealth.panel.window', {
                    defaultValue: '{{from}} – {{to}} · Myntra',
                    from: dayLabel(details.from),
                    to: dayLabel(details.to),
                  })
                : undefined
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-right tabular-nums">
                <thead className="text-[11px] uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="py-1.5 text-left font-semibold">{t('admin.inventoryHealth.panel.size', { defaultValue: 'Size' })}</th>
                    <th className="font-semibold">{t('admin.inventoryHealth.panel.sales', { defaultValue: 'Sales' })}</th>
                    <th className="font-semibold">{t('admin.inventoryHealth.panel.cancelled', { defaultValue: 'Cancelled' })}</th>
                    <th className="font-semibold">{t('admin.inventoryHealth.panel.delivered', { defaultValue: 'Delivered' })}</th>
                    <th className="font-semibold">{t('admin.inventoryHealth.panel.returned', { defaultValue: 'Returned' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {(details?.sizes ?? []).map((s) => (
                    <tr key={s.size} className="border-t border-neutral-100">
                      <td className="py-2 text-left font-semibold text-neutral-800">{s.size || '—'}</td>
                      <td>{s.ordered}</td>
                      <td>{s.cancelled}</td>
                      <td>{s.delivered}</td>
                      <td>
                        {s.returnRate == null ? (
                          '—'
                        ) : (
                          <span className={`font-semibold ${TONE_TEXT[returnTone(s.returnRate)]}`}>{s.returnRate}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {details && details.sizes.length === 0 && (
              <p className="mt-2 text-neutral-500">
                {t('admin.inventoryHealth.panel.noSales', { defaultValue: 'No Myntra orders for these dates.' })}
              </p>
            )}
            {failed && (
              <p className="mt-2 text-red-600">
                {t('admin.inventoryHealth.panel.loadFailed', { defaultValue: 'Couldn’t load sales and returns.' })}{' '}
                <button type="button" className="font-semibold underline" onClick={() => setTick((x) => x + 1)}>
                  {t('admin.inventoryHealth.panel.retry', { defaultValue: 'Retry' })}
                </button>
              </p>
            )}
          </Section>

          <Section title={t('admin.inventoryHealth.panel.reasons', { defaultValue: 'Why customers returned it' })}>
            {!details ? (
              <p className="text-neutral-400">…</p>
            ) : details.returnsReported === 0 ? (
              <p className="text-neutral-500">
                {t('admin.inventoryHealth.panel.noReasons', { defaultValue: 'No returns in the uploaded returns report for these dates.' })}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <div className="flex h-7 overflow-hidden rounded-md bg-neutral-100">
                    {GROUPS.map((g) => {
                      const n = groupCount(g);
                      if (!n) return null;
                      const pct = Math.round((n / reasonTotal) * 100);
                      return (
                        <button
                          key={g}
                          type="button"
                          onMouseEnter={() => setHoverGroup(g)}
                          onMouseLeave={() => setHoverGroup(null)}
                          onClick={() => setOpenGroup((x) => (x === g ? null : g))}
                          className={`${GROUP_BAR[g]} flex items-center justify-center overflow-hidden text-[11px] font-semibold text-white transition hover:brightness-95 ${
                            openGroup && openGroup !== g ? 'opacity-40' : ''
                          }`}
                          style={{ width: `${(n / reasonTotal) * 100}%` }}
                        >
                          {pct >= 12 ? `${pct}%` : ''}
                        </button>
                      );
                    })}
                  </div>
                  {hoverGroup && (
                    <div className="pointer-events-none absolute left-0 right-0 top-9 z-10 rounded-md border border-neutral-200 bg-white p-2.5 text-xs shadow-lg">
                      <p className="mb-1 font-semibold text-neutral-800">
                        {groupLabel[hoverGroup]} · {groupCount(hoverGroup)}
                      </p>
                      {details.reasons
                        .filter((r) => r.group === hoverGroup)
                        .slice(0, 3)
                        .map((r) => (
                          <p key={r.reason} className="flex justify-between gap-3 text-neutral-600">
                            <span>{r.reason}</span>
                            <span className="tabular-nums">{r.count}</span>
                          </p>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {GROUPS.map((g) => {
                    const n = groupCount(g);
                    if (!n) return null;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setOpenGroup((x) => (x === g ? null : g))}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${openGroup === g ? 'text-neutral-900 underline' : 'text-neutral-600'}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${GROUP_BAR[g]}`} />
                        {groupLabel[g]} {Math.round((n / reasonTotal) * 100)}%
                      </button>
                    );
                  })}
                </div>
                {openGroup && (
                  <ul className="space-y-1 rounded-md bg-neutral-50 p-2.5">
                    {details.reasons
                      .filter((r) => r.group === openGroup)
                      .map((r) => (
                        <li key={r.reason} className="flex justify-between gap-3 text-neutral-700">
                          <span>{r.reason}</span>
                          <span className="tabular-nums text-neutral-500">{r.count}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

          {fabric && (
          <Section title={t('admin.inventoryHealth.panel.fabric', { defaultValue: 'Fabric' })}>
            {(
              <div className="space-y-1 text-neutral-700">
                <p className="font-semibold">
                  {fabric.fabricName} · {fabric.colourName}
                  {fabric.check && <FabricPill state={fabric.check.state} className="ml-2" />}
                </p>
                <p>
                  {t('admin.inventoryHealth.panel.perPiece', {
                    defaultValue: '{{n}} m per piece, from the last lot',
                    n: fabric.perPiece,
                  })}
                </p>
                {fabric.check ? (
                  <p>
                    {t('admin.inventoryHealth.panel.fabricNeed', {
                      defaultValue: 'Needs {{needed}} {{unit}} for {{make}} pieces · {{free}} free · {{onOrder}} on order',
                      unit: !fabric.unit || fabric.unit === 'meter' ? t('admin.inventoryHealth.panel.metres', { defaultValue: 'm' }) : fabric.unit,
                      needed: fabric.check.needed,
                      make: style.makeTotal,
                      free: fabric.check.free,
                      onOrder: fabric.check.onOrder,
                    })}
                    {fabric.check.nextExpectedDate &&
                      t('admin.inventoryHealth.panel.fabricNext', { defaultValue: ' · next due {{d}}', d: dayLabel(fabric.check.nextExpectedDate.slice(0, 10)) })}
                  </p>
                ) : (
                  <p className="text-neutral-500">{t('admin.inventoryHealth.panel.nothingToMake', { defaultValue: 'Nothing to make right now.' })}</p>
                )}
              </div>
            )}
          </Section>
          )}

          <Section title={t('admin.inventoryHealth.panel.remarks', { defaultValue: 'Remarks' })}>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder={t('admin.inventoryHealth.panel.remarkPlaceholder', { defaultValue: 'Add a remark' })}
              className="min-h-[72px] text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => void save()} disabled={!draft.trim() || saving}>
                {saving ? t('admin.inventoryHealth.panel.saving', { defaultValue: 'Saving…' }) : t('admin.inventoryHealth.panel.save', { defaultValue: 'Save remark' })}
              </Button>
            </div>
            <ul className="mt-3 space-y-3">
              {(details?.remarks ?? []).map((r) => (
                <li key={r.id} className="border-l-2 border-neutral-200 pl-3">
                  <p className="whitespace-pre-wrap text-neutral-800">{r.body}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {r.author} · {dayTimeLabel(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </Drawer>
  );
}

/** Swatch from the colour's name; CSS knows most plain names ("Black", "Brown"), anything else shows grey. */
function ColourDot({ name }: { name: string | null }): ReactNode {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-full border border-black/10"
      style={{ background: name && CSS.supports('color', name) ? name : '#d4d4d4' }}
    />
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-neutral-800">{children}</dd>
    </div>
  );
}

function Section({ title, tail, children }: { title: string; tail?: string; children: ReactNode }): ReactNode {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">{title}</h3>
        {tail && <span className="text-xs text-neutral-400">{tail}</span>}
      </div>
      {children}
    </section>
  );
}

export type Tone = 'good' | 'warn' | 'bad';
export const TONE_CHIP: Record<Tone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warn: 'border-amber-200 bg-amber-50 text-amber-700',
  bad: 'border-red-200 bg-red-50 text-red-700',
};
export const TONE_TEXT: Record<Tone, string> = { good: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-red-600' };

/** Return % bands: under 30 fine, 30–50 watch, 50+ a problem. */
export function returnTone(rate: number): Tone {
  return rate >= 50 ? 'bad' : rate >= 30 ? 'warn' : 'good';
}

const FABRIC_TONE = { enough: TONE_CHIP.good, low: TONE_CHIP.warn, short: TONE_CHIP.bad } as const;
const GROUP_BAR: Record<(typeof GROUPS)[number], string> = {
  fit: 'bg-red-400',
  looks: 'bg-violet-400',
  quality: 'bg-amber-400',
  other: 'bg-neutral-300',
};

/** Enough / Low / Short for the style's make qty. */
export function FabricPill({ state, className = '' }: { state: keyof typeof FABRIC_TONE; className?: string }): ReactNode {
  const { t } = useTranslation();
  const label = {
    enough: t('admin.inventoryHealth.fabric.enough', { defaultValue: 'Fabric enough' }),
    low: t('admin.inventoryHealth.fabric.low', { defaultValue: 'Fabric low' }),
    short: t('admin.inventoryHealth.fabric.short', { defaultValue: 'Fabric short' }),
  }[state];
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${FABRIC_TONE[state]} ${className}`}>
      {label}
    </span>
  );
}
