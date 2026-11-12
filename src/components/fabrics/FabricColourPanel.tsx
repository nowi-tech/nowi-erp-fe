import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ClipboardCheck, Loader2, ShoppingCart } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { FilterRailSegments } from '@/components/ui/filter-rail';
import { ActivityTimeline, type TimelineItem } from '@/components/ui/activity-timeline';
import FabricOrdersTable from './FabricOrdersTable';
import { getColourLots, getFabricActivity } from '@/api/styles';
import type {
  Fabric,
  FabricActivity,
  FabricColour,
  FabricOrder,
  FabricOrderStatus,
  FabricStockActivity,
} from '@/api/types';
import { daysOfCover, fmtQty, OPEN_ORDER_STATUSES, ORDER_STATUS_LABEL, poLabel, PURPOSE_LABEL } from '@/lib/fabric';

export type ActivityLinks = { lot: boolean; style: boolean };

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

/** One page of a fabric's activity at a time, newest first; reloads when a filter or `version` changes. */
export function useFabricActivity(
  fabricId: number,
  kind: 'stock' | 'orders' | 'edits' | undefined,
  colourId: number | undefined,
  version: number,
) {
  const [activity, setActivity] = useState<FabricActivity[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only the latest request may write — a slow reply for an old filter is dropped.
  const seqRef = useRef(0);
  // A next-page request while a fresh load runs would append the old filter's page to the new list.
  const loading = useRef(false);

  const load = useCallback(
    async (before?: string) => {
      if (!Number.isFinite(fabricId) || (before && loading.current)) return;
      const seq = ++seqRef.current;
      loading.current = true;
      setBusy(true);
      try {
        const r = await getFabricActivity(fabricId, { kind, colourId, before });
        if (seq !== seqRef.current) return;
        // Pages overlap on the boundary timestamp, so drop rows already shown.
        setActivity((a) => {
          if (!before) return r.items;
          const seen = new Set(a.map((x) => x.id));
          return [...a, ...r.items.filter((x) => !seen.has(x.id))];
        });
        // A cursor that doesn't move would refetch the same page forever.
        setNextBefore(r.nextBefore === before ? null : r.nextBefore);
      } finally {
        if (seq === seqRef.current) {
          loading.current = false;
          setBusy(false);
        }
      }
    },
    [fabricId, kind, colourId],
  );

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load, version]);

  const loadMore = useCallback(() => void load(nextBefore ?? undefined).catch(() => undefined), [load, nextBefore]);
  return { activity, nextBefore, busy, loadMore };
}

/** The activity list; the next page loads when its bottom scrolls into view. */
export function ActivityList({
  feed,
  fabric,
  canEdit,
  links,
  onReturn,
  onSendBack,
}: {
  feed: ReturnType<typeof useFabricActivity>;
  fabric: Fabric;
  canEdit: boolean;
  links: ActivityLinks;
  onReturn: (a: FabricStockActivity) => void;
  onSendBack: (a: FabricStockActivity) => void;
}) {
  const { t } = useTranslation();
  const unit = fabric.unitOfMeasure ?? null;
  const colourName = (cid: number | null | undefined) => fabric.colours?.find((c) => c.id === cid)?.name ?? '';
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { nextBefore, busy, loadMore } = feed;
  // Re-armed after every load, so a sentinel still in view fetches the next page too.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextBefore || busy) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [nextBefore, busy, loadMore]);
  return (
    <>
      {feed.activity.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--color-muted-foreground)]">{t('admin.fabricLibrary.detail.noHistory')}</p>
      ) : (
        <ActivityTimeline
          items={feed.activity.map((a) => toTimelineItem(a, unit, colourName, canEdit, links, onReturn, onSendBack, t))}
        />
      )}
      {feed.nextBefore && (
        <div ref={sentinelRef} className="flex justify-center py-3 text-[var(--color-muted-foreground)]">
          {feed.busy && <Loader2 className="animate-spin" size={16} />}
        </div>
      )}
    </>
  );
}

/** Issue / Order / Update for one colour — on its row and in its panel. */
export function ColourActions({
  colour,
  canEdit,
  canCheck,
  onIssue,
  onOrder,
  onCheck,
}: {
  colour: FabricColour;
  canEdit: boolean;
  canCheck: boolean;
  onIssue: (c: FabricColour) => void;
  onOrder: (c: FabricColour) => void;
  onCheck: (c: FabricColour) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-2">
      {canEdit && (
        <>
          <Button size="sm" variant="outline" disabled={(colour.availableQuantity ?? 0) <= 0} onClick={() => onIssue(colour)}>
            <ArrowUpRight size={15} />
            {t('admin.fabricLibrary.issue')}
          </Button>
          <Button size="sm" onClick={() => onOrder(colour)}>
            <ShoppingCart size={15} />
            {t('admin.fabricLibrary.order', { defaultValue: 'Order' })}
          </Button>
        </>
      )}
      {canCheck && (
        <Button size="sm" variant="outline" onClick={() => onCheck(colour)}>
          <ClipboardCheck size={15} />
          {t('admin.stockCheck.short', { defaultValue: 'Update' })}
        </Button>
      )}
    </div>
  );
}

/** Everything about one colour of a fabric in a side panel: numbers, waiting lots, orders, activity, actions. */
export default function FabricColourPanel({
  fabric,
  colour,
  open,
  version,
  orders,
  allFabrics,
  canEdit,
  canCheck,
  links,
  onClose,
  onIssue,
  onOrder,
  onCheck,
  onReturn,
  onSendBack,
  onChanged,
}: {
  fabric: Fabric;
  colour: FabricColour;
  open: boolean;
  /** Bumped by the page after any change, so the panel refetches. */
  version: number;
  orders: FabricOrder[];
  allFabrics: Fabric[];
  canEdit: boolean;
  canCheck: boolean;
  links: ActivityLinks;
  onClose: () => void;
  onIssue: (c: FabricColour) => void;
  onOrder: (c: FabricColour) => void;
  onCheck: (c: FabricColour) => void;
  onReturn: (a: FabricStockActivity) => void;
  onSendBack: (a: FabricStockActivity) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const unit = fabric.unitOfMeasure ?? null;
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [lots, setLots] = useState<{ id: number; batchNo: string; style: string | null; held: number }[]>([]);
  const feed = useFabricActivity(fabric.id, undefined, colour.id, version);

  useEffect(() => {
    let live = true;
    void getColourLots(colour.id)
      .then((r) => {
        if (live) setLots(r);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [colour.id, version]);

  const shownOrders = orders.filter(
    (o) => o.fabricColourId === colour.id && (showAllOrders || OPEN_ORDER_STATUSES.includes(o.status)),
  );
  const days = daysOfCover(colour);
  const qty = (n: number | null | undefined) => ((n ?? 0) > 0 ? fmtQty(n!, unit) : '—');
  const stats: [string, string][] = [
    [t('admin.fabricLibrary.cols.stock', { defaultValue: 'Stock' }), fmtQty(colour.availableQuantity ?? 0, unit)],
    [t('admin.fabricLibrary.cols.onOrder', { defaultValue: 'On order' }), qty(colour.onOrderQuantity)],
    [t('admin.fabricLibrary.cols.held', { defaultValue: 'Held for lots' }), qty(colour.heldQuantity)],
    [t('admin.fabricLibrary.cols.used30d', { defaultValue: 'Used (30 days)' }), qty(colour.used30d)],
    [t('admin.fabricLibrary.colourPanel.daysLeft', { defaultValue: 'Days left' }), days != null ? String(days) : '—'],
    [t('admin.fabricLibrary.cols.price', { defaultValue: 'Price' }), colour.pricePerUnit != null ? `₹${colour.pricePerUnit}` : '—'],
  ];
  const lotLabel = (no: string) => t('admin.fabricActivity.lot', { defaultValue: 'lot {{no}}', no });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      confirmOnClose={false}
      width="760px"
      title={colour.name}
      subtitle={colour.code || undefined}
    >
      <div className="space-y-6">
        <ColourActions
          colour={colour}
          canEdit={canEdit}
          canCheck={canCheck}
          onIssue={onIssue}
          onOrder={onOrder}
          onCheck={onCheck}
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]">{label}</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">
            {t('admin.fabricLibrary.lotsHolding', { defaultValue: 'Lots waiting on it' })}
          </h3>
          {lots.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">—</p>
          ) : (
            <ul className="space-y-1 text-[13px]">
              {lots.map((l) => (
                <li key={l.id}>
                  {links.lot ? (
                    <Link to={`/admin/production/lots/${l.id}`} className="font-medium text-[var(--color-primary)] hover:underline">
                      {lotLabel(l.batchNo)}
                    </Link>
                  ) : (
                    lotLabel(l.batchNo)
                  )}
                  {' '}· {fmtQty(l.held, unit)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2">
            <h3 className="text-sm font-semibold">{t('admin.fabricOrders.title', { defaultValue: 'Orders' })}</h3>
            <FilterRailSegments
              options={[
                { value: 'open', label: t('admin.fabricOrders.open', { defaultValue: 'Open' }) },
                { value: 'all', label: t('admin.fabricOrders.all', { defaultValue: 'All' }) },
              ]}
              value={showAllOrders ? 'all' : 'open'}
              onChange={(v) => setShowAllOrders(v === 'all')}
            />
          </div>
          <FabricOrdersTable orders={shownOrders} fabrics={allFabrics} canEdit={canEdit} onChanged={onChanged} />
        </section>

        <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2">
            <h3 className="text-sm font-semibold">{t('admin.styles.workspace.activity', { defaultValue: 'Activity log' })}</h3>
          </div>
          <ActivityList feed={feed} fabric={fabric} canEdit={canEdit} links={links} onReturn={onReturn} onSendBack={onSendBack} />
        </section>
      </div>
    </Drawer>
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
export const returnableOf = (a: FabricStockActivity) => a.returnable ?? -a.quantity - a.returnedQuantity;

/** One activity row in words — "Issued 300 m · Green → Gurukul · lot 1001". */
function toTimelineItem(
  a: FabricActivity,
  unit: string | null,
  colourName: (id: number) => string,
  canEdit: boolean,
  links: ActivityLinks,
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

