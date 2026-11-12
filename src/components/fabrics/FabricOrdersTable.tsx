import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PackageCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReceiveOrderDialog from './ReceiveOrderDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { closeFabricOrder, updateFabricOrder } from '@/api/fabricOrders';
import type { Fabric, FabricOrder, FabricOrderStatus } from '@/api/types';
import {
  fmtQty,
  OPEN_ORDER_STATUSES,
  poLabel,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  SETTABLE_ORDER_STATUSES,
} from '@/lib/fabric';
import FabricOrderDialog from './FabricOrderDialog';
import FabricOrderDrawer from './FabricOrderDrawer';

interface Props {
  orders: FabricOrder[];
  /** Needed by the edit dialog's fabric picker. */
  fabrics: Fabric[];
  /** Show the fabric name column (off on a fabric's own page). */
  showFabric?: boolean;
  canEdit: boolean;
  onChanged: () => void;
}

/** Orders with received / ordered, due date and inline status; a row opens the order's side panel. */
export default function FabricOrdersTable({ orders, fabrics, showFabric, canEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  // By id, so the panel shows the refreshed order after a receipt or edit.
  const [viewingId, setViewingId] = useState<number | null>(null);
  const viewing = orders.find((o) => o.id === viewingId) ?? null;
  const [editing, setEditing] = useState<FabricOrder | null>(null);
  const [receiving, setReceiving] = useState<FabricOrder | null>(null);
  const [confirm, setConfirm] = useState<{ order: FabricOrder; kind: 'close' | 'cancel' } | null>(null);

  const run = async (p: Promise<unknown>) => {
    try {
      await p;
      onChanged();
    } catch (e) {
      toast.show(
        apiErrorMessage(e) ??
          t('admin.fabricOrders.saveError', { defaultValue: 'Could not save the order.' }),
        'error',
      );
    }
  };

  if (orders.length === 0) {
    return (
      <div className="px-4 py-3 text-[13px] text-[var(--color-muted-foreground)]">
        {t('admin.fabricOrders.none', { defaultValue: 'No orders.' })}
      </div>
    );
  }

  const statusLabel = (s: FabricOrderStatus) =>
    t(`admin.fabricOrders.statuses.${s}`, { defaultValue: ORDER_STATUS_LABEL[s] });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <tr>
            <th className="px-3 py-2 text-left">{t('admin.fabricOrders.orderNo', { defaultValue: 'Order' })}</th>
            <th className="px-3 py-2 text-left">
              {showFabric
                ? t('admin.fabricOrders.fabricColour', { defaultValue: 'Fabric · colour' })
                : t('admin.fabricOrders.colour', { defaultValue: 'Colour' })}
            </th>
            <th className="px-3 py-2 text-left">{t('admin.fabricOrders.vendor', { defaultValue: 'Vendor' })}</th>
            <th className="px-3 py-2 text-right">{t('admin.fabricOrders.received', { defaultValue: 'Received / ordered' })}</th>
            <th className="px-3 py-2 text-left">{t('admin.fabricOrders.due', { defaultValue: 'Due' })}</th>
            <th className="px-3 py-2 text-left">{t('admin.fabricOrders.status', { defaultValue: 'Status' })}</th>
            <th className="px-3 py-2 text-left">{t('admin.fabricOrders.note', { defaultValue: 'Remarks' })}</th>
            {canEdit && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const isOpen = OPEN_ORDER_STATUSES.includes(o.status);
            const unit = o.fabric?.unitOfMeasure ?? null;
            return (
                // The row opens the order's panel; controls in the row keep their own clicks.
                <tr
                  key={o.id}
                  className={cn(
                    'cursor-pointer border-t border-[var(--color-border)] align-middle hover:bg-[var(--color-surface-2)]/50',
                    viewingId === o.id && 'bg-[var(--color-primary-soft)]/30',
                  )}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button, select, a, input')) setViewingId(o.id);
                  }}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-semibold">{poLabel(o.orderNo)}</div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">{new Date(o.orderDate).toLocaleDateString()}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {showFabric ? (
                      <>
                        <div className="whitespace-nowrap font-medium">{o.fabric?.name ?? o.itemName ?? '—'}</div>
                        {o.colour && <div className="text-xs text-[var(--color-muted-foreground)]">{o.colour.name}</div>}
                      </>
                    ) : (
                      o.colour?.name ?? o.itemName ?? '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5">{o.vendor?.name ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {fmtQty(o.receivedQuantity)} / {fmtQty(o.quantityOrdered, unit)}
                  </td>
                  <td
                    className={`px-3 py-1.5 whitespace-nowrap ${
                      o.isOverdue ? 'font-semibold text-[var(--color-destructive)]' : ''
                    }`}
                  >
                    {o.expectedDate ? new Date(o.expectedDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit && isOpen && o.fabricColourId != null ? (
                      <Select
                        value={o.status}
                        onChange={(e) => {
                          const status = e.target.value as FabricOrderStatus;
                          // A placed order needs a vendor and a due date — ask for them first.
                          if (status !== 'need_to_order' && (!o.vendor || !o.expectedDate)) {
                            setEditing({ ...o, status });
                            return;
                          }
                          void run(updateFabricOrder(o.id, { status }));
                        }}
                        className="h-9 w-36 rounded-md px-2 text-[13px]"
                      >
                        {SETTABLE_ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge variant={ORDER_STATUS_VARIANT[o.status]}>{statusLabel(o.status)}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-muted-foreground)]">{o.note ?? ''}</td>
                  {canEdit && (
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {isOpen && o.fabricColourId != null && (
                        <Button size="sm" onClick={() => setReceiving(o)}>
                          <PackageCheck size={15} />
                          {t('admin.receiveOrder.title', { defaultValue: 'Receive' })}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
            );
          })}
        </tbody>
      </table>

      <FabricOrderDrawer
        order={viewing}
        canEdit={canEdit}
        onClose={() => setViewingId(null)}
        // Each action hands over to its dialog; the panel closes so the dialog isn't behind it.
        onReceive={(o) => {
          setViewingId(null);
          setReceiving(o);
        }}
        onEdit={(o) => {
          setViewingId(null);
          setEditing(o);
        }}
        onCloseShort={(o) => {
          setViewingId(null);
          setConfirm({ order: o, kind: 'close' });
        }}
        onCancel={(o) => {
          setViewingId(null);
          setConfirm({ order: o, kind: 'cancel' });
        }}
      />
      <ReceiveOrderDialog
        order={receiving}
        onClose={() => setReceiving(null)}
        onSaved={() => {
          setReceiving(null);
          onChanged();
        }}
      />
      <FabricOrderDialog
        open={editing != null}
        editing={editing}
        fabrics={fabrics}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
      <ConfirmDialog
        open={confirm != null}
        title={
          confirm?.kind === 'close'
            ? t('admin.fabricOrders.closeShort', { defaultValue: 'Close short' })
            : t('admin.fabricOrders.cancelTitle', { defaultValue: 'Cancel order' })
        }
        message={
          confirm?.kind === 'close'
            ? t('admin.fabricOrders.closeMsg', {
                defaultValue: 'Accept {{got}} received and stop waiting for the rest?',
                got: confirm ? fmtQty(confirm.order.receivedQuantity, confirm.order.fabric?.unitOfMeasure) : '',
              })
            : t('admin.fabricOrders.cancelMsg', { defaultValue: 'Cancel this order? It stays in the history.' })
        }
        destructive={confirm?.kind === 'cancel'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          void run(
            c.kind === 'close'
              ? closeFabricOrder(c.order.id)
              : updateFabricOrder(c.order.id, { status: 'cancelled' }),
          );
        }}
      />
    </div>
  );
}
