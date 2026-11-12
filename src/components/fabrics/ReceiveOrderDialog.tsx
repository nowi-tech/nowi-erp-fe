import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { createFabricChallan } from '@/api/fabricChallans';
import { listVendorOptions, type VendorOption } from '@/api/vendors';
import type { FabricOrder } from '@/api/types';
import { fmtQty, poLabel, UOM_SHORT } from '@/lib/fabric';
import { todayISO } from '@/lib/date';

/** What's still due on an order — the default quantity for its next receipt. */
export const dueOn = (o: FabricOrder) => Math.max(0, Math.round((o.quantityOrdered - o.receivedQuantity) * 100) / 100);

/** "This is 900 m more than PO 1004 is waiting for. Receive anyway?" — null when no line is over. */
export function overReceiptMessage(
  t: ReturnType<typeof useTranslation>['t'],
  lines: { order: FabricOrder; qty: number }[]): string | null {
  const over = lines
    .filter(({ order, qty }) => qty > dueOn(order))
    .map(({ order, qty }) =>
      t('admin.receive.over', {
        defaultValue: 'This is {{qty}} more than {{po}} is waiting for.',
        qty: fmtQty(qty - dueOn(order), order.fabric?.unitOfMeasure),
        po: poLabel(order.orderNo),
      }),
    );
  return over.length ? `${over.join(' ')} ${t('admin.receive.overConfirm', { defaultValue: 'Receive anyway?' })}` : null;
}

/**
 * Receive one order: everything comes from the order, so only the supplier's
 * challan number is typed. Quantity, price and date are prefilled and editable.
 */
export default function ReceiveOrderDialog({
  order,
  onClose,
  onSaved,
}: {
  order: FabricOrder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const challanRef = useRef<HTMLInputElement>(null);
  const [challanNo, setChallanNo] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayISO());
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [overMsg, setOverMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setChallanNo('');
    setQty(String(dueOn(order)));
    setPrice(order.colour?.pricePerUnit != null ? String(order.colour.pricePerUnit) : '');
    setDate(todayISO());
    setVendorId(order.vendor?.id ?? null);
    // Only an order placed without a vendor needs the supplier asked.
    if (!order.vendor) void listVendorOptions().then(setVendors).catch(() => undefined);
  }, [order]);

  if (!order) return null;
  const unit = order.fabric?.unitOfMeasure ? UOM_SHORT[order.fabric.unitOfMeasure] : '';
  const ready = challanNo.trim() !== '' && Number(qty) > 0 && date !== '' && vendorId != null && !saving;

  const save = async () => {
    if (!ready || order.fabricColourId == null) return;
    setSaving(true);
    try {
      await createFabricChallan({
        direction: 'in',
        challanNo: challanNo.trim(),
        challanDate: date,
        vendorId,
        lines: [
          {
            fabricColourId: order.fabricColourId,
            quantity: Number(qty),
            pricePerUnit: price === '' ? null : Number(price),
            fabricOrderId: order.id,
          },
        ],
      });
      toast.show(t('admin.fabricChallan.savedToast', { defaultValue: 'Challan recorded — stock updated.' }));
      onSaved();
    } catch (e) {
      toast.show(apiErrorMessage(e) ?? t('admin.fabricChallan.saveError', { defaultValue: 'Could not record the challan.' }), 'error');
    } finally {
      setSaving(false);
    }
  };
  const attempt = () => {
    if (!ready) return;
    const msg = overReceiptMessage(t, [{ order, qty: Number(qty) }]);
    if (msg) setOverMsg(msg);
    else void save();
  };

  return (
    <>
    <Dialog
      open
      onClose={onClose}
      initialFocusRef={challanRef}
      title={
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {t('admin.receiveOrder.title', { defaultValue: 'Receive' })} · {poLabel(order.orderNo)}
          </div>
          <div className="truncate text-base font-semibold">
            {order.fabric?.name} · {order.colour?.name}
          </div>
          <div className="truncate text-[13px] font-normal text-[var(--color-muted-foreground)]">
            {[order.vendor?.name, `${fmtQty(order.receivedQuantity)} / ${fmtQty(order.quantityOrdered, order.fabric?.unitOfMeasure)}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!ready} onClick={attempt}>
            {saving ? t('common.saving', 'Saving…') : t('admin.receiveOrder.save', { defaultValue: 'Receive' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rcv-challan">{t('admin.fabricChallan.challanNo', { defaultValue: 'Challan no.' })}</Label>
          <Input
            id="rcv-challan"
            ref={challanRef}
            value={challanNo}
            onChange={(e) => setChallanNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') attempt();
            }}
          />
        </div>
        {!order.vendor && (
          <div className="space-y-1.5">
            <Label>{t('admin.fabricChallan.vendor', { defaultValue: 'Supplier' })}</Label>
            <Combobox
              value={vendorId}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
              onChange={(id) => setVendorId((id as number) ?? null)}
              placeholder={t('admin.fabricChallan.vendorNone', { defaultValue: 'Choose a supplier…' })}
              ariaLabel={t('admin.fabricChallan.vendor', { defaultValue: 'Supplier' })}
            />
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>
              {t('admin.fabricChallan.quantity', { defaultValue: 'Quantity' })}
              {unit ? ` (${unit})` : ''}
            </Label>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('admin.fabricChallan.price', { defaultValue: 'Price' })}
              {unit ? ` (₹/${unit})` : ' (₹)'}
            </Label>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('admin.fabricChallan.challanDate', { defaultValue: 'Challan date' })}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
    <ConfirmDialog
      open={overMsg != null}
      message={overMsg ?? ''}
      confirmLabel={t('admin.receiveOrder.save', { defaultValue: 'Receive' })}
      cancelLabel={t('common.cancel', 'Cancel')}
      onConfirm={() => {
        setOverMsg(null);
        void save();
      }}
      onCancel={() => setOverMsg(null)}
    />
    </>
  );
}
