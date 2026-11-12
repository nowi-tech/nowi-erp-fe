import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { dueOn, overReceiptMessage } from './ReceiveOrderDialog';
import { apiErrorMessage } from '@/api/apiClient';
import { createFabricChallan } from '@/api/fabricChallans';
import type { FabricOrder } from '@/api/types';
import { fmtQty, poLabel, UOM_SHORT } from '@/lib/fabric';
import { todayISO } from '@/lib/date';
import { cn } from '@/lib/utils';

/** A ticked order on this challan, with what actually arrived. */
interface Picked {
  qty: string;
  price: string;
}

/** Overdue first, then by due date. */
const byUrgency = (a: FabricOrder, b: FabricOrder) =>
  Number(b.isOverdue) - Number(a.isOverdue) || (a.expectedDate ?? '9999').localeCompare(b.expectedDate ?? '9999');

/** Supplier choice for orders placed without one; vendor ids are positive. */
const NO_SUPPLIER = -1;

/**
 * One supplier challan covering one or more orders. The supplier comes first,
 * so only their open orders are listed; ticking one fills what's still due and
 * the last price. A lone open order is ticked for you.
 */
export default function ReceiveChallanDialog({
  open,
  orders,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Open orders; only those linked to a fabric colour can be received. */
  orders: FabricOrder[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Map<number, Picked>>(new Map());
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [overMsg, setOverMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVendorId(null);
    setPicked(new Map());
    setChallanNo('');
    setChallanDate(todayISO());
  }, [open]);

  const receivable = useMemo(() => orders.filter((o) => o.fabricColourId != null), [orders]);
  const suppliers = useMemo(
    () =>
      [...new Map(receivable.filter((o) => o.vendor).map((o) => [o.vendor!.id, o.vendor!.name])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      ),
    [receivable],
  );
  const hasUnassigned = receivable.some((o) => !o.vendor);
  // That supplier's orders, plus any order placed without a supplier yet.
  const rows = useMemo(
    () => (vendorId == null ? [] : receivable.filter((o) => !o.vendor || o.vendor.id === vendorId).sort(byUrgency)),
    [receivable, vendorId],
  );

  const pick = (o: FabricOrder) =>
    setPicked((m) =>
      new Map(m).set(o.id, {
        qty: String(dueOn(o)),
        price: o.colour?.pricePerUnit != null ? String(o.colour.pricePerUnit) : '',
      }),
    );
  const chooseSupplier = (id: number | null) => {
    setVendorId(id);
    const theirs = receivable.filter((o) => (id === NO_SUPPLIER ? !o.vendor : o.vendor?.id === id));
    setPicked(new Map());
    if (theirs.length === 1) pick(theirs[0]);
  };
  const toggle = (o: FabricOrder) => {
    if (!picked.has(o.id)) return pick(o);
    setPicked((m) => {
      const n = new Map(m);
      n.delete(o.id);
      return n;
    });
  };
  const patch = (id: number, p: Partial<Picked>) => setPicked((m) => new Map(m).set(id, { ...m.get(id)!, ...p }));

  const pickedOrders = rows.filter((o) => picked.has(o.id));
  const ready =
    vendorId != null &&
    challanNo.trim() !== '' &&
    challanDate !== '' &&
    pickedOrders.length > 0 &&
    pickedOrders.every((o) => Number(picked.get(o.id)!.qty) > 0) &&
    !saving;

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await createFabricChallan({
        direction: 'in',
        challanNo: challanNo.trim(),
        challanDate,
        vendorId: vendorId === NO_SUPPLIER ? null : vendorId,
        lines: pickedOrders.map((o) => {
          const p = picked.get(o.id)!;
          return {
            fabricColourId: o.fabricColourId!,
            quantity: Number(p.qty),
            pricePerUnit: p.price === '' ? null : Number(p.price),
            fabricOrderId: o.id,
          };
        }),
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
    const msg = overReceiptMessage(
      t,
      pickedOrders.map((o) => ({ order: o, qty: Number(picked.get(o.id)!.qty) })),
    );
    if (msg) setOverMsg(msg);
    else void submit();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidthClassName="max-w-2xl"
        title={t('admin.fabricChallan.title', { defaultValue: 'Receive fabric' })}
        footer={
          <div className="flex justify-end">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button size="sm" disabled={!ready} onClick={attempt}>
                {saving
                  ? t('admin.fabricChallan.saving', { defaultValue: 'Recording…' })
                  : t('admin.receive.record', { defaultValue: 'Receive {{n}}', n: pickedOrders.length || '' })}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('admin.fabricChallan.vendor', { defaultValue: 'Supplier' })}</Label>
            <Combobox
              value={vendorId}
              options={[
                ...suppliers.map(([id, name]) => ({ value: id, label: name })),
                ...(hasUnassigned
                  ? [{ value: NO_SUPPLIER, label: t('admin.fabricChallan.noSupplier', { defaultValue: 'No supplier' }) }]
                  : []),
              ]}
              onChange={(id) => chooseSupplier((id as number) ?? null)}
              placeholder={t('admin.fabricChallan.vendorNone', { defaultValue: 'Choose a supplier…' })}
              ariaLabel={t('admin.fabricChallan.vendor', { defaultValue: 'Supplier' })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rcv-challanNo">{t('admin.fabricChallan.challanNo', { defaultValue: 'Challan no.' })}</Label>
              <Input id="rcv-challanNo" value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rcv-challanDate">{t('admin.fabricChallan.challanDate', { defaultValue: 'Challan date' })}</Label>
              <Input id="rcv-challanDate" type="date" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} />
            </div>
          </div>

          {vendorId != null && (
            <div className="max-h-[45vh] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {rows.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-[var(--color-muted-foreground)]">
                  {t('admin.receive.noOrders', { defaultValue: 'No open orders.' })}
                </p>
              )}
              {rows.map((o) => {
                const p = picked.get(o.id);
                const unit = o.fabric?.unitOfMeasure ? UOM_SHORT[o.fabric.unitOfMeasure] : '';
                return (
                  <div
                    key={o.id}
                    className={cn(
                      'flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0',
                      p && 'bg-[var(--color-primary-soft)]/30',
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" className="h-4 w-4" checked={!!p} onChange={() => toggle(o)} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          <span className="font-semibold">{poLabel(o.orderNo)}</span> · {o.fabric?.name} · {o.colour?.name}
                        </div>
                        <div className="text-xs text-[var(--color-muted-foreground)]">
                          {fmtQty(o.receivedQuantity)} / {fmtQty(o.quantityOrdered, o.fabric?.unitOfMeasure)}
                          {o.expectedDate && (
                            <span className={cn(o.isOverdue && 'font-semibold text-[var(--color-destructive)]')}>
                              {' · '}
                              {t('admin.fabricOrders.dueOn', {
                                defaultValue: 'due {{date}}',
                                date: new Date(o.expectedDate).toLocaleDateString(),
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                    {p && (
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-9 w-24"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={p.qty}
                          onChange={(e) => patch(o.id, { qty: e.target.value })}
                          aria-label={t('admin.fabricChallan.quantity', { defaultValue: 'Quantity' })}
                        />
                        <span className="w-6 text-xs text-[var(--color-muted-foreground)]">{unit}</span>
                        <Input
                          className="h-9 w-24"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={p.price}
                          placeholder="₹"
                          onChange={(e) => patch(o.id, { price: e.target.value })}
                          aria-label={t('admin.fabricChallan.price', { defaultValue: 'Price' })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={overMsg != null}
        message={overMsg ?? ''}
        confirmLabel={t('admin.receiveOrder.save', { defaultValue: 'Receive' })}
        cancelLabel={t('common.cancel', 'Cancel')}
        onConfirm={() => {
          setOverMsg(null);
          void submit();
        }}
        onCancel={() => setOverMsg(null)}
      />
    </>
  );
}
