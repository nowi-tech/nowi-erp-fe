import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ClipboardCheck, Pencil, ShoppingCart } from 'lucide-react';
import { FilterRailSegments } from '@/components/ui/filter-rail';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { ActivityTimeline, type TimelineItem } from '@/components/ui/activity-timeline';
import FabricEditorForm from '@/components/fabrics/FabricEditorForm';
import FabricOrderDialog from '@/components/fabrics/FabricOrderDialog';
import FabricOrdersTable from '@/components/fabrics/FabricOrdersTable';
import IssueSlipDialog from '@/components/fabrics/IssueSlipDialog';
import { ReturnDialog, SendBackDialog, StockCheckDialog } from '@/components/fabrics/StockActionDialogs';
import { getColourLots, getFabric, getFabricActivity, listFabrics } from '@/api/styles';
import { listFabricOrders } from '@/api/fabricOrders';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { useAuth } from '@/context/auth';
import {
  FABRIC_STOCK_CHECK_ROLES,
  FABRIC_WRITE_ROLES,
  hasAnyRole,
  PRODUCTION_BOARD_READ_ROLES,
  STYLE_VIEW_ROLES,
} from '@/lib/userRoles';
import type {
  Fabric,
  FabricActivity,
  FabricColour,
  FabricOrder,
  FabricOrderStatus,
  FabricStockActivity,
} from '@/api/types';
import {
  colourState,
  COLOUR_STATE_LABEL,
  COLOUR_STATE_VARIANT,
  daysOfCover,
  fmtQty,
  OPEN_ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  orderQtyForLots,
  poLabel,
  PURPOSE_LABEL,
} from '@/lib/fabric';
import { cn } from '@/lib/utils';

type Kind = 'all' | 'stock' | 'orders' | 'edits';

const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  gsm: 'GSM',
  cuttableWidth: 'Width',
  unitOfMeasure: 'Unit',
  construction: 'Construction',
  count: 'Count',
  composition: 'Composition',
  colours: 'Colours',
  imagePath: 'Image',
  notes: 'Notes',
  isActive: 'Active',
  status: 'Status',
  quantityOrdered: 'Quantity',
  expectedDate: 'Due',
  orderDate: 'Order date',
  vendorId: 'Vendor',
  fabricColourId: 'Fabric',
  itemName: 'Item',
  note: 'Remarks',
};

/**
 * Fabric detail — the fabric, its colours (stock, held, on order), its orders,
 * and at the bottom one activity log of stock moves, order changes and edits.
 */
export default function FabricDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const fabricId = Number(id);
  const { user } = useAuth();
  const canEdit = hasAnyRole(user, FABRIC_WRITE_ROLES);
  const canCheck = hasAnyRole(user, FABRIC_STOCK_CHECK_ROLES);
  const links = { lot: hasAnyRole(user, PRODUCTION_BOARD_READ_ROLES), style: hasAnyRole(user, STYLE_VIEW_ROLES) };

  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [allFabrics, setAllFabrics] = useState<Fabric[]>([]);
  const [orders, setOrders] = useState<FabricOrder[]>([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [orderFor, setOrderFor] = useState<{ fabricColourId?: number; quantity?: number } | null>(null);
  const [issueFor, setIssueFor] = useState<{ fabricColourId?: number } | null>(null);
  const [checkOf, setCheckOf] = useState<FabricColour | null>(null);
  const [returnOf, setReturnOf] = useState<FabricStockActivity | null>(null);
  const [sendBackOf, setSendBackOf] = useState<FabricStockActivity | null>(null);

  const [kind, setKind] = useState<Kind>('all');
  // The selected colour: set by clicking a row (or arriving from the Library); filters orders and activity.
  const [params] = useSearchParams();
  const [colourFilter, setColourFilter] = useState<number | ''>(() => Number(params.get('colour')) || '');
  const [lotsHolding, setLotsHolding] = useState<{ id: number; batchNo: string; style: string | null; held: number }[]>([]);
  const [activity, setActivity] = useState<FabricActivity[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [activityBusy, setActivityBusy] = useState(false);
  // Only the latest request may write — a slow reply for an old filter is dropped.
  const activitySeq = useRef(0);

  const loadActivity = useCallback(
    async (before?: string) => {
      if (!Number.isFinite(fabricId)) return;
      const seq = ++activitySeq.current;
      setActivityBusy(true);
      try {
        const r = await getFabricActivity(fabricId, {
          kind: kind === 'all' ? undefined : kind,
          colourId: colourFilter === '' ? undefined : colourFilter,
          before,
        });
        if (seq !== activitySeq.current) return;
        // Pages overlap on the boundary timestamp, so drop rows already shown.
        setActivity((a) => {
          if (!before) return r.items;
          const seen = new Set(a.map((x) => x.id));
          return [...a, ...r.items.filter((x) => !seen.has(x.id))];
        });
        setNextBefore(r.nextBefore);
      } finally {
        if (seq === activitySeq.current) setActivityBusy(false);
      }
    },
    [fabricId, kind, colourFilter],
  );

  const load = useCallback(async () => {
    if (!Number.isFinite(fabricId)) {
      setFabric(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [f, os, all] = await Promise.all([
        getFabric(fabricId),
        listFabricOrders({ fabricId }),
        listFabrics(),
      ]);
      setFabric(f);
      setOrders(os);
      setAllFabrics(all);
    } catch {
      setFabric(null);
    } finally {
      setLoading(false);
    }
  }, [fabricId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadActivity().catch(() => undefined);
  }, [loadActivity]);

  const refresh = () => {
    void load();
    void loadActivity().catch(() => undefined);
  };

  const imagePaths = useMemo(
    () => [fabric?.imagePath ?? null, ...(fabric?.colours ?? []).map((c) => c.imagePath ?? null)],
    [fabric],
  );
  const imageUrls = useSignedUrls(imagePaths);

  const unit = fabric?.unitOfMeasure ?? null;
  const colours = fabric?.colours ?? [];
  const sum = (pick: (c: FabricColour) => number | undefined) => colours.reduce((s, c) => s + (pick(c) ?? 0), 0);
  const stockValue = colours.reduce(
    (s, c) => (c.pricePerUnit != null && c.availableQuantity != null ? s + c.pricePerUnit * c.availableQuantity : s),
    0,
  );
  /** Order prefilled with what planning lots are short of. */
  const orderColour = (c: FabricColour) => setOrderFor({ fabricColourId: c.id, quantity: orderQtyForLots(c) });
  const selected = colours.find((c) => c.id === colourFilter) ?? null;
  useEffect(() => {
    setLotsHolding([]);
    if (colourFilter === '') return;
    let live = true;
    void getColourLots(colourFilter)
      .then((r) => {
        if (live) setLotsHolding(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [colourFilter, selected?.availableQuantity]);

  const shownOrders = orders.filter(
    (o) =>
      (showAllOrders || OPEN_ORDER_STATUSES.includes(o.status)) &&
      (colourFilter === '' || o.fabricColourId === colourFilter),
  );

  if (loading && !fabric) {
    return <div className="p-6 text-sm text-[var(--color-muted-foreground)]">{t('common.loading')}</div>;
  }
  if (!fabric) {
    return (
      <div className="space-y-3 p-6">
        <BackLink onClick={() => navigate('/fabric-library')} label={t('admin.fabricLibrary.detail.back')} />
        <p className="text-sm text-[var(--color-muted-foreground)]">{t('admin.fabricLibrary.detail.notFound')}</p>
      </div>
    );
  }

  const parentImg = fabric.imagePath ? imageUrls[fabric.imagePath] : undefined;
  const colourName = (cid: number | null | undefined) => colours.find((c) => c.id === cid)?.name ?? '';

  return (
    <div className="space-y-6 pb-10">
      <BackLink onClick={() => navigate('/fabric-library')} label={t('admin.fabricLibrary.detail.back')} />

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-start gap-4">
          {parentImg && (
            <img src={parentImg} alt={fabric.name} className="h-24 w-24 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{fabric.name}</h1>
              {fabric.isBlended && (
                <Badge variant="outline" className="text-[9px]">
                  {t('admin.fabricLibrary.blended')}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              {[
                fabric.code,
                fabric.unitOfMeasure && t(`admin.fabricLibrary.uom.${fabric.unitOfMeasure}`, { defaultValue: fabric.unitOfMeasure }),
                fabric.gsm != null ? `${fabric.gsm} GSM` : null,
                fabric.cuttableWidth != null ? `${Number(fabric.cuttableWidth)}″` : null,
                ...(fabric.compositions ?? []).map((c) => `${Number(c.percent)}% ${c.fibre}`),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil size={15} />
                {t('admin.fabricLibrary.edit')}
              </Button>
              <Button size="sm" onClick={() => setIssueFor({})}>
                <ArrowUpRight size={15} />
                {t('admin.fabricLibrary.issue')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOrderFor({})}>
                <ShoppingCart size={15} />
                {t('admin.fabricLibrary.order', { defaultValue: 'Order' })}
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('admin.fabricLibrary.detail.totalStock')} value={fmtQty(sum((c) => c.availableQuantity), unit)} />
        <Stat label={t('admin.fabricLibrary.cols.onOrder', { defaultValue: 'On order' })} value={fmtQty(sum((c) => c.onOrderQuantity), unit)} />
        <Stat label={t('admin.fabricLibrary.cols.held', { defaultValue: 'Held for lots' })} value={fmtQty(sum((c) => c.heldQuantity), unit)} />
        <Stat
          label={t('admin.fabricLibrary.detail.stockValue')}
          value={stockValue > 0 ? `₹${stockValue.toLocaleString('en-IN')}` : '—'}
        />
      </div>

      <Card title={t('admin.fabricLibrary.detail.colours')}>
        {colours.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[var(--color-muted-foreground)]">{t('admin.fabricLibrary.detail.noColours')}</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Same columns and widths as the Library. */}
            <table className="w-full min-w-[1000px] table-fixed text-[13px]">
              <colgroup>
                <col className="w-[300px]" />
                <col className="w-[240px]" />
                <col className="w-[160px]" />
                <col />
              </colgroup>
              <thead className="bg-[var(--color-surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 text-left">{t('admin.fabricLibrary.cols.colour', { defaultValue: 'Colour' })}</th>
                  <th className="px-3 py-2 text-left">{t('admin.fabricLibrary.cols.stock', { defaultValue: 'Stock' })}</th>
                  <th className="px-3 py-2 text-right">{t('admin.fabricLibrary.cols.onOrder', { defaultValue: 'On order' })}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {colours.map((c) => {
                  const swatch = c.imagePath ?? fabric.imagePath;
                  const state = colourState(c);
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        'cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/50',
                        colourFilter === c.id && 'bg-[var(--color-primary-soft)]/40',
                      )}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest('button, a, input, select')) {
                          setColourFilter(colourFilter === c.id ? '' : c.id);
                        }
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {swatch && imageUrls[swatch] ? (
                            <img src={imageUrls[swatch]} alt="" className="h-8 w-8 rounded border border-[var(--color-border)] object-cover" />
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: c.hex || c.name.toLowerCase() }} />
                          )}
                          <div>
                            <div className="font-medium">{c.name}</div>
                            {c.code && <div className="text-xs text-[var(--color-muted-foreground)]">{c.code}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-right font-medium tabular-nums">
                            {fmtQty(c.availableQuantity ?? 0, unit)}
                          </span>
                          <Badge variant={COLOUR_STATE_VARIANT[state]}>
                            {t(`admin.fabricLibrary.states.${state}`, { defaultValue: COLOUR_STATE_LABEL[state] })}
                          </Badge>
                          {(c.needsReview ?? 0) > 0 && (
                            <Badge variant="warning">{t('admin.fabricLibrary.checkStock', { defaultValue: 'Check stock' })}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {(c.onOrderQuantity ?? 0) > 0 ? (
                          <>
                            <div className="font-medium">{fmtQty(c.onOrderQuantity!, unit)}</div>
                            {c.nextExpectedDate && (
                              <div
                                className={cn(
                                  'text-xs',
                                  (c.overdueOrders ?? 0) > 0
                                    ? 'font-semibold text-[var(--color-destructive)]'
                                    : 'text-[var(--color-muted-foreground)]',
                                )}
                              >
                                {t('admin.fabricOrders.dueOn', {
                                  defaultValue: 'due {{date}}',
                                  date: new Date(c.nextExpectedDate).toLocaleDateString(),
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[var(--color-muted-foreground)]">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canEdit && (
                            <>
                              <Button
                                size="sm"
                                disabled={(c.availableQuantity ?? 0) <= 0}
                                onClick={() => setIssueFor({ fabricColourId: c.id })}
                              >
                                <ArrowUpRight size={15} />
                                {t('admin.fabricLibrary.issue')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => orderColour(c)}>
                                <ShoppingCart size={15} />
                                {t('admin.fabricLibrary.order', { defaultValue: 'Order' })}
                              </Button>
                            </>
                          )}
                          {canCheck && (
                            <Button size="sm" variant="outline" onClick={() => setCheckOf(c)}>
                              <ClipboardCheck size={15} />
                              {t('admin.stockCheck.short', { defaultValue: 'Update' })}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selected && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--color-border)] bg-[var(--color-primary-soft)]/20 px-5 py-3 text-[13px]">
            <span className="font-semibold">{selected.name}</span>
            <span>
              {t('admin.fabricLibrary.cols.used30d', { defaultValue: 'Used (30 days)' })}:{' '}
              <b className="tabular-nums">{(selected.used30d ?? 0) > 0 ? fmtQty(selected.used30d!, unit) : '—'}</b>
              {daysOfCover(selected) != null &&
                ` · ${t('admin.fabricLibrary.daysLeftShort', { defaultValue: '{{n}} days left', n: daysOfCover(selected) })}`}
            </span>
            <span>
              {t('admin.fabricLibrary.cols.price', { defaultValue: 'Price' })}:{' '}
              <b className="tabular-nums">{selected.pricePerUnit != null ? `₹${selected.pricePerUnit}` : '—'}</b>
            </span>
            <span>
              {t('admin.fabricLibrary.lotsHolding', { defaultValue: 'Lots waiting on it' })}:{' '}
              {lotsHolding.length === 0
                ? '—'
                : lotsHolding.map((l, i) => (
                    <span key={l.id}>
                      {i > 0 && ', '}
                      {links.lot ? (
                        <Link to={`/admin/production/lots/${l.id}`} className="font-medium text-[var(--color-primary)] hover:underline">
                          {t('admin.fabricActivity.lot', { defaultValue: 'lot {{no}}', no: l.batchNo })}
                        </Link>
                      ) : (
                        t('admin.fabricActivity.lot', { defaultValue: 'lot {{no}}', no: l.batchNo })
                      )}{' '}
                      · {fmtQty(l.held, unit)}
                    </span>
                  ))}
            </span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setColourFilter('')}>
              {t('admin.fabricLibrary.showAllColours', { defaultValue: 'All colours' })}
            </Button>
          </div>
        )}
      </Card>

      <Card
        title={t('admin.fabricOrders.title', { defaultValue: 'Orders' })}
        right={
          <FilterRailSegments
            options={[
              { value: 'open', label: t('admin.fabricOrders.open', { defaultValue: 'Open' }) },
              { value: 'all', label: t('admin.fabricOrders.all', { defaultValue: 'All' }) },
            ]}
            value={showAllOrders ? 'all' : 'open'}
            onChange={(v) => setShowAllOrders(v === 'all')}
          />
        }
      >
        <FabricOrdersTable orders={shownOrders} fabrics={allFabrics} canEdit={canEdit} onChanged={refresh} />
      </Card>

      <Card
        title={t('admin.styles.workspace.activity', { defaultValue: 'Activity log' })}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FilterRailSegments
              options={(['all', 'stock', 'orders', 'edits'] as Kind[]).map((k) => ({
                value: k,
                label: t(`admin.fabricActivity.kinds.${k}`, {
                  defaultValue: { all: 'All', stock: 'Stock', orders: 'Orders', edits: 'Edits' }[k],
                }),
              }))}
              value={kind}
              onChange={setKind}
            />
            <Select
              className="h-9 w-auto text-[13px]"
              value={colourFilter === '' ? '' : String(colourFilter)}
              onChange={(e) => setColourFilter(e.target.value ? Number(e.target.value) : '')}
              aria-label={t('admin.fabricLibrary.cols.colour', { defaultValue: 'Colour' })}
            >
              <option value="">{t('admin.fabricActivity.allColours', { defaultValue: 'All colours' })}</option>
              {colours.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {activity.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--color-muted-foreground)]">{t('admin.fabricLibrary.detail.noHistory')}</p>
        ) : (
          <ActivityTimeline items={activity.map((a) => toTimelineItem(a, unit, colourName, canEdit, links, setReturnOf, setSendBackOf, t))} />
        )}
        {nextBefore && (
          <div className="border-t border-[var(--color-border)] px-5 py-2 text-center">
            <Button
              size="sm"
              variant="outline"
              disabled={activityBusy}
              onClick={() => void loadActivity(nextBefore).catch(() => undefined)}
            >
              {t('admin.fabricActivity.more', { defaultValue: 'Load more' })}
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidthClassName="max-w-3xl" title={`${t('admin.fabricLibrary.editFabric')} — ${fabric.name}`}>
        <FabricEditorForm
          editing={fabric}
          existing={allFabrics}
          onCancel={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            refresh();
          }}
        />
      </Dialog>

      <FabricOrderDialog
        open={orderFor != null}
        preset={orderFor ? { fabricId: fabric.id, ...orderFor } : undefined}
        fabrics={allFabrics}
        onClose={() => setOrderFor(null)}
        onSaved={() => {
          setOrderFor(null);
          refresh();
        }}
      />
      <IssueSlipDialog
        open={issueFor != null}
        preset={issueFor ? { fabricId: fabric.id, fabricColourId: issueFor.fabricColourId } : undefined}
        fabrics={allFabrics}
        onClose={() => setIssueFor(null)}
        onSaved={() => {
          setIssueFor(null);
          refresh();
        }}
      />
      <StockCheckDialog
        target={checkOf ? { fabricColourId: checkOf.id, name: checkOf.name, stock: checkOf.availableQuantity ?? 0, unit } : null}
        onClose={() => setCheckOf(null)}
        onSaved={() => {
          setCheckOf(null);
          refresh();
        }}
      />
      <ReturnDialog
        target={
          returnOf
            ? {
                entryId: returnOf.entryId,
                label: [returnOf.colour?.name, returnOf.challan?.challanNo].filter(Boolean).join(' · '),
                open: returnableOf(returnOf),
                unit,
              }
            : null
        }
        onClose={() => setReturnOf(null)}
        onSaved={() => {
          setReturnOf(null);
          refresh();
        }}
      />
      <SendBackDialog
        target={
          sendBackOf
            ? {
                entryId: sendBackOf.entryId,
                label: [sendBackOf.colour?.name, sendBackOf.challan?.challanNo].filter(Boolean).join(' · '),
                open: sendBackOf.quantity - sendBackOf.returnedQuantity,
                unit,
              }
            : null
        }
        onClose={() => setSendBackOf(null)}
        onSaved={() => {
          setSendBackOf(null);
          refresh();
        }}
      />
    </div>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function fmtValue(key: string, v: unknown, colourName: (id: number) => string, t: T): string | null {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'status') {
    const s = String(v) as FabricOrderStatus;
    return t(`admin.fabricOrders.statuses.${s}`, { defaultValue: ORDER_STATUS_LABEL[s] ?? s });
  }
  if (key === 'fabricColourId') return colourName(Number(v)) || String(v);
  if (key === 'expectedDate' || key === 'orderDate') return new Date(String(v)).toLocaleDateString();
  if (key === 'imagePath') return null;
  return String(v);
}

/** Issued less returned, unless the server sent its tighter cap. */
const returnableOf = (a: FabricStockActivity) => a.returnable ?? -a.quantity - a.returnedQuantity;

/** One activity row in words — "Issued 300 m · Green → Gurukul · lot 1001". */
function toTimelineItem(
  a: FabricActivity,
  unit: string | null,
  colourName: (id: number) => string,
  canEdit: boolean,
  links: { lot: boolean; style: boolean },
  onReturn: (a: FabricStockActivity) => void,
  onSendBack: (a: FabricStockActivity) => void,
  t: T,
): TimelineItem {
  if (a.kind !== 'stock') {
    const after = a.after ?? {};
    const before = a.before ?? {};
    const chips = Object.keys(after).flatMap((k) => {
      const label = t(`admin.fabricActivity.fields.${k}`, { defaultValue: FIELD_LABEL[k] ?? k });
      const v = fmtValue(k, after[k], colourName, t);
      if (v === null) return [label];
      return a.action.endsWith('_created') ? [`${label}: ${v}`] : [`${label}: ${fmtValue(k, before[k], colourName, t) ?? '—'} → ${v}`];
    });
    const po = a.orderNo != null ? poLabel(a.orderNo) : t('admin.fabricActivity.order', { defaultValue: 'Order' });
    const label = {
      fabric_created: t('admin.fabricActivity.created', { defaultValue: 'Created fabric' }),
      fabric_updated: t('admin.fabricActivity.edited', { defaultValue: 'Edited fabric' }),
      fabric_order_created: t('admin.fabricActivity.orderCreatedPo', { defaultValue: 'New order {{po}}', po }),
      fabric_order_updated: t('admin.fabricActivity.orderUpdatedPo', { defaultValue: '{{po}} updated', po }),
    }[a.action] ?? a.action;
    return { id: a.id, actor: a.actor ?? t('admin.fabricActivity.system', { defaultValue: 'System' }), label, chips, note: a.reason, at: a.at };
  }

  const qty = fmtQty(Math.abs(a.quantity), unit);
  const colour = a.colour?.name ?? '';
  const lotText = a.lot && t('admin.fabricActivity.lot', { defaultValue: 'lot {{no}}', no: a.lot.batchNo });
  const styleText = a.style && (a.style.styleId ?? a.style.workingName);
  const target = a.lot ? (
    links.lot ? (
      <Link to={`/admin/production/lots/${a.lot.id}`} className="text-[var(--color-primary)] hover:underline">
        {lotText}
      </Link>
    ) : (
      lotText
    )
  ) : a.style ? (
    links.style ? (
      <Link to={`/styles/${a.style.id}`} className="text-[var(--color-primary)] hover:underline">
        {styleText}
      </Link>
    ) : (
      styleText
    )
  ) : null;
  const challan = a.challan?.challanNo;
  const vendor = a.challan?.vendor?.name;
  let label: string;
  let chips: string[] = [];
  let extra: React.ReactNode = target;
  if (a.entryType === 'receipt') {
    label = t('admin.fabricActivity.received', { defaultValue: 'Received {{qty}} · {{colour}}', qty, colour });
    chips = [
      challan && t('admin.fabricActivity.challan', { defaultValue: 'challan {{no}}', no: challan }),
      vendor,
      a.fabricOrderNo != null &&
        t('admin.fabricActivity.againstPo', { defaultValue: 'against {{po}}', po: poLabel(a.fabricOrderNo) }),
      a.returnedQuantity > 0 &&
        t('admin.fabricActivity.sentBackSoFar', { defaultValue: '{{qty}} sent back', qty: fmtQty(a.returnedQuantity, unit) }),
    ].filter(Boolean) as string[];
    // Only fabric that came in against an order has a supplier to go back to.
    if (canEdit && a.fabricOrderId != null && a.quantity - a.returnedQuantity > 0) {
      extra = (
        <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => onSendBack(a)}>
          {t('admin.sendBack.action', { defaultValue: 'Send back' })}
        </Button>
      );
    }
  } else if (a.purpose === 'vendor_return') {
    label = t('admin.fabricActivity.sentBack', { defaultValue: 'Sent back {{qty}} · {{colour}}', qty, colour });
    chips = [vendor && `→ ${vendor}`, challan].filter(Boolean) as string[];
  } else if (a.entryType === 'return') {
    label = t('admin.fabricActivity.returned', { defaultValue: 'Returned {{qty}} · {{colour}}', qty, colour });
    chips = [vendor].filter(Boolean) as string[];
  } else if (a.entryType === 'adjustment') {
    // Cutting / sample top-ups are written under CUT-… / SAMPLE-…; counts under CHECK-….
    label = /^(CUT|SAMPLE)-/.test(challan ?? '')
      ? a.needsReview
        ? t('admin.fabricActivity.gap', { defaultValue: 'Cut but not in stock: {{qty}} · {{colour}} — check stock', qty, colour })
        : t('admin.fabricActivity.gapCleared', { defaultValue: 'Cut but not in stock: {{qty}} · {{colour}}', qty, colour })
      : t('admin.fabricActivity.check', { defaultValue: 'Stock check · {{colour}}: {{sign}}{{qty}}', colour, qty, sign: a.quantity >= 0 ? '+' : '−' });
  } else if (a.usedQuantity != null) {
    label = t('admin.fabricActivity.used', {
      defaultValue: 'Used {{used}} · {{colour}}',
      used: fmtQty(a.usedQuantity, unit),
      colour,
    });
    chips = [
      a.quantity !== 0
        ? t('admin.fabricActivity.deducted', { defaultValue: 'deducted {{qty}}', qty })
        : t('admin.fabricActivity.alreadyIssued', { defaultValue: 'already issued' }),
    ];
  } else {
    label = t('admin.fabricActivity.issued', { defaultValue: 'Issued {{qty}} · {{colour}}', qty, colour });
    chips = [
      vendor && `→ ${vendor}`,
      challan,
      a.purpose && a.purpose !== 'production'
        ? t(`admin.issueSlip.purposes.${a.purpose}`, { defaultValue: PURPOSE_LABEL[a.purpose] })
        : null,
      a.returnedQuantity > 0 && t('admin.fabricActivity.returnedSoFar', { defaultValue: '{{qty}} returned', qty: fmtQty(a.returnedQuantity, unit) }),
    ].filter(Boolean) as string[];
    const open = returnableOf(a);
    if (canEdit && open > 0) {
      extra = (
        <span className="inline-flex items-center gap-2">
          {target}
          <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => onReturn(a)}>
            {t('admin.returnFabric.action', { defaultValue: 'Return' })}
          </Button>
        </span>
      );
    }
  }
  return { id: a.id, actor: a.actor ?? t('admin.fabricActivity.system', { defaultValue: 'System' }), label, chips, note: a.note, extra, at: a.at };
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
      <ArrowLeft size={14} />
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3">
        <h3 className="m-0 font-serif text-base font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
