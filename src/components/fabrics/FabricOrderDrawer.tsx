import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PackageCheck } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreMenu } from '@/components/ui/more-menu';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { getFabricOrderHistory, type FabricOrderChange } from '@/api/fabricOrders';
import type { FabricOrder, FabricOrderStatus } from '@/api/types';
import { fmtQty, OPEN_ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, poLabel } from '@/lib/fabric';
import { cn } from '@/lib/utils';

const FIELD_LABEL: Record<string, string> = {
  status: 'Status',
  quantityOrdered: 'Quantity',
  expectedDate: 'Expected',
  orderDate: 'Ordered on',
  note: 'Remarks',
  vendorId: 'Supplier',
  fabricColourId: 'Fabric',
  itemName: 'Item',
};

/**
 * Everything about one order in a side panel: what was ordered, what arrived
 * (and went back), who changed what, and the actions — Receive, Edit, more.
 */
export default function FabricOrderDrawer({
  order,
  canEdit,
  onClose,
  onReceive,
  onEdit,
  onCloseShort,
  onCancel,
}: {
  order: FabricOrder | null;
  canEdit: boolean;
  onClose: () => void;
  onReceive: (o: FabricOrder) => void;
  onEdit: (o: FabricOrder) => void;
  onCloseShort: (o: FabricOrder) => void;
  onCancel: (o: FabricOrder) => void;
}) {
  const { t } = useTranslation();
  const [history, setHistory] = useState<FabricOrderChange[]>([]);

  useEffect(() => setHistory([]), [order?.id]);

  // Refetch when the order itself moves (a receipt, a status change).
  useEffect(() => {
    if (!order) return;
    let alive = true;
    void getFabricOrderHistory(order.id)
      .then((h) => {
        if (alive) setHistory(h);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order?.id, order?.status, order?.receivedQuantity, order?.quantityOrdered, order?.expectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;
  const unit = order.fabric?.unitOfMeasure ?? null;
  const isOpen = OPEN_ORDER_STATUSES.includes(order.status);
  const statusLabel = (s: FabricOrderStatus) => t(`admin.fabricOrders.statuses.${s}`, { defaultValue: ORDER_STATUS_LABEL[s] });
  const pct = order.quantityOrdered > 0 ? Math.min(100, (order.receivedQuantity / order.quantityOrdered) * 100) : 0;

  const fmtVal = (k: string, v: unknown): string => {
    if (v == null || v === '') return '—';
    if (k === 'status') return statusLabel(v as FabricOrderStatus);
    if (k === 'expectedDate' || k === 'orderDate') return new Date(String(v)).toLocaleDateString();
    return String(v);
  };
  const timeline = history.map((h) => {
    const after = h.after ?? {};
    const created = h.action === 'fabric_order_created';
    const chips = created
      ? []
      : Object.keys(after).map((k) => {
          const label = t(`admin.fabricOrders.fields.${k}`, { defaultValue: FIELD_LABEL[k] ?? k });
          // Ids mean nothing on screen — say the field changed.
          if (k === 'vendorId' || k === 'fabricColourId') return t('admin.fabricOrders.fieldChanged', { defaultValue: '{{label}} changed', label });
          return `${label}: ${fmtVal(k, h.before?.[k])} → ${fmtVal(k, after[k])}`;
        });
    return {
      id: h.id,
      actor: h.actor ?? t('admin.fabricActivity.system', { defaultValue: 'System' }),
      label: created
        ? t('admin.fabricOrders.placed', { defaultValue: 'Created the order' })
        : t('admin.fabricOrders.changed', { defaultValue: 'Updated' }),
      chips,
      note: h.reason,
      at: h.at,
    };
  });

  const fact = (label: string, value: ReactNode, tone?: string) => (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">{label}</div>
      <div className={cn('mt-0.5 text-sm font-medium', tone)}>{value}</div>
    </div>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      confirmOnClose={false}
      width="480px"
      accent={order.isOverdue ? 'stuck' : isOpen ? 'disp' : 'ready'}
      title={
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{poLabel(order.orderNo)}</span>
          <Badge variant={ORDER_STATUS_VARIANT[order.status]}>{statusLabel(order.status)}</Badge>
        </div>
      }
      subtitle={[order.fabric?.name ?? order.itemName, order.colour?.name].filter(Boolean).join(' · ')}
      footer={
        canEdit && isOpen ? (
          <div className="flex items-center justify-end gap-2">
            <MoreMenu
              items={[
                // Nothing received yet → Cancel covers it.
                ...(order.fabricColourId != null && order.receivedQuantity > 0
                  ? [{ label: t('admin.fabricOrders.closeShort', { defaultValue: 'Close short' }), onSelect: () => onCloseShort(order) }]
                  : []),
                {
                  label: t('admin.fabricOrders.cancelTitle', { defaultValue: 'Cancel order' }),
                  destructive: true,
                  onSelect: () => onCancel(order),
                },
              ]}
            />
            <Button size="sm" variant="outline" onClick={() => onEdit(order)}>
              {order.fabricColourId == null
                ? t('admin.fabricOrders.linkFabric', { defaultValue: 'Link fabric' })
                : t('admin.fabricOrders.editShort', { defaultValue: 'Edit' })}
            </Button>
            {order.fabricColourId != null && (
              <Button size="sm" onClick={() => onReceive(order)}>
                <PackageCheck size={15} />
                {t('admin.receiveOrder.title', { defaultValue: 'Receive' })}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold tabular-nums">
              {fmtQty(order.receivedQuantity)} / {fmtQty(order.quantityOrdered, unit)}
            </span>
            <span className="text-[var(--color-muted-foreground)]">
              {t('admin.fabricOrders.receivedWord', { defaultValue: 'received' })}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          {fact(t('admin.fabricOrders.vendor', { defaultValue: 'Supplier' }), order.vendor?.name ?? '—')}
          {fact(t('admin.fabricOrders.orderDate', { defaultValue: 'Ordered on' }), new Date(order.orderDate).toLocaleDateString())}
          {fact(
            t('admin.fabricOrders.expectedDate', { defaultValue: 'Expected' }),
            order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : '—',
            order.isOverdue ? 'text-[var(--color-destructive)]' : undefined,
          )}
          {fact(t('admin.fabricOrders.createdBy', { defaultValue: 'Placed by' }), order.createdBy?.name ?? '—')}
          {order.note && (
            <div className="col-span-2">{fact(t('admin.fabricOrders.note', { defaultValue: 'Remarks' }), order.note)}</div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('admin.fabricOrders.deliveries', { defaultValue: 'Deliveries' })}</h3>
          {order.receipts.length === 0 ? (
            <p className="text-[13px] text-[var(--color-muted-foreground)]">
              {t('admin.fabricOrders.noDeliveries', { defaultValue: 'Nothing received yet.' })}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {order.receipts.map((r) => (
                <li key={r.entryId} className="flex items-start justify-between gap-3 px-3 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {r.sentBack
                        ? t('admin.fabricOrders.sentBackTitle', { defaultValue: 'Sent back' })
                        : t('admin.fabricOrders.challanNo', { defaultValue: 'Challan {{no}}', no: r.challanNo ?? '—' })}
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {[r.challanDate ? new Date(r.challanDate).toLocaleDateString() : null, r.sentBack ? r.challanNo : null, r.receivedBy]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {r.sentBack && r.note && <div className="text-xs italic text-[var(--color-muted-foreground)]">“{r.note}”</div>}
                  </div>
                  <div
                    className={cn(
                      'whitespace-nowrap font-semibold tabular-nums',
                      r.sentBack && 'text-[var(--color-destructive)]',
                    )}
                  >
                    {r.sentBack ? `−${fmtQty(-r.quantity, unit)}` : `+${fmtQty(r.quantity, unit)}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('admin.fabricOrders.history', { defaultValue: 'History' })}</h3>
          {timeline.length > 0 ? (
            <div className="-mx-5">
              <ActivityTimeline items={timeline} />
            </div>
          ) : (
            <p className="text-[13px] text-[var(--color-muted-foreground)]">—</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
