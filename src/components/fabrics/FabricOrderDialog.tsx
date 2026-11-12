import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { listVendorOptions, type VendorOption } from '@/api/vendors';
import { useQuickAddVendor } from './useQuickAddVendor';
import { createFabricOrder, getFabricOrderDefaults, updateFabricOrder } from '@/api/fabricOrders';
import type { Fabric, FabricOrder, FabricOrderStatus } from '@/api/types';
import { ORDER_STATUS_LABEL, SETTABLE_ORDER_STATUSES, UOM_SHORT } from '@/lib/fabric';
import { localISO, todayISO } from '@/lib/date';

/** Order date + lead days, as a date string. */
function dueFrom(orderDate: string, leadDays: number): string {
  const due = new Date(`${orderDate}T00:00:00`);
  due.setDate(due.getDate() + leadDays);
  return localISO(due);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (o: FabricOrder) => void;
  fabrics: Fabric[];
  /** Edit this order; omit to create. */
  editing?: FabricOrder | null;
  /** Prefill a new order's fabric / colour / vendor / quantity (e.g. what lots are short). */
  preset?: { fabricId?: number; fabricColourId?: number; vendorId?: number; quantity?: number };
}

/** Create or edit a fabric order. "Not in library yet" orders carry a name instead. */
export default function FabricOrderDialog({ open, onClose, onSaved, fabrics, editing, preset }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    unlisted: false,
    itemName: '',
    fabricId: null as number | null,
    fabricColourId: null as number | null,
    vendorId: null as number | null,
    quantity: '',
    orderDate: todayISO(),
    expectedDate: '',
    status: 'ordered' as FabricOrderStatus,
    note: '',
  });
  // What the defaults filled in, so a colour change replaces those but never a typed value.
  const autoFilled = useRef<{ vendorId: number | null; expectedDate: string; leadDays: number | null }>({
    vendorId: null,
    expectedDate: '',
    leadDays: null,
  });

  useEffect(() => {
    if (!open) return;
    autoFilled.current = { vendorId: null, expectedDate: '', leadDays: null };
    void listVendorOptions()
      .then(setVendors)
      .catch(() =>
        toast.show(
          t('admin.fabricChallan.vendorLoadError', { defaultValue: 'Could not load suppliers. Reload to try again.' }),
          'error',
        ),
      );
    setForm({
      unlisted: editing ? editing.fabricColourId == null : false,
      itemName: editing?.itemName ?? '',
      fabricId: editing?.fabric?.id ?? preset?.fabricId ?? null,
      fabricColourId: editing?.fabricColourId ?? preset?.fabricColourId ?? null,
      vendorId: editing?.vendor?.id ?? preset?.vendorId ?? null,
      quantity: editing ? String(editing.quantityOrdered) : preset?.quantity ? String(preset.quantity) : '',
      orderDate: editing?.orderDate ?? todayISO(),
      expectedDate: editing?.expectedDate ?? '',
      status: editing?.status ?? 'ordered',
      note: editing?.note ?? '',
    });
    // Primitive deps: callers pass `preset` inline, a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, preset?.fabricId, preset?.fabricColourId, preset?.vendorId, preset?.quantity]);

  // New orders only: last vendor for this colour, and its last lead time from the order date.
  useEffect(() => {
    if (!open || editing || form.fabricColourId == null) return;
    let alive = true;
    void getFabricOrderDefaults(form.fabricColourId)
      .then((d) => {
        if (!alive) return;
        const prev = autoFilled.current;
        setForm((f) => {
          const takeVendor = f.vendorId == null || f.vendorId === prev.vendorId;
          const takeDate = f.expectedDate === '' || f.expectedDate === prev.expectedDate;
          const vendorId = takeVendor ? d.vendorId : f.vendorId;
          const expectedDate = takeDate ? (d.leadDays != null ? dueFrom(f.orderDate, d.leadDays) : '') : f.expectedDate;
          autoFilled.current = {
            vendorId: takeVendor ? vendorId : null,
            expectedDate: takeDate ? expectedDate : '',
            leadDays: d.leadDays,
          };
          return { ...f, vendorId, expectedDate };
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, editing, form.fabricColourId]);

  const fabric = fabrics.find((f) => f.id === form.fabricId);
  const uom = fabric?.unitOfMeasure ? UOM_SHORT[fabric.unitOfMeasure] : '';
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // An auto-filled due date follows the order date; a typed one stays put.
  const changeOrderDate = (orderDate: string) => {
    const a = autoFilled.current;
    if (!orderDate || a.leadDays == null || a.expectedDate === '' || form.expectedDate !== a.expectedDate) {
      return set('orderDate', orderDate);
    }
    const expectedDate = dueFrom(orderDate, a.leadDays);
    autoFilled.current = { ...a, expectedDate };
    setForm((f) => ({ ...f, orderDate, expectedDate }));
  };

  const fabricOptions = useMemo(
    () =>
      fabrics
        .filter((f) => (f.colours?.length ?? 0) > 0)
        .map((f) => ({ value: f.id, label: f.name, sublabel: f.code ?? undefined })),
    [fabrics],
  );
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const addVendor = useQuickAddVendor((v) => {
    setVendors((vs) => (vs.some((x) => x.id === v.id) ? vs : [...vs, v]));
    set('vendorId', v.id);
  });

  // Once placed, an order needs someone to chase and a date to be late against.
  const placed = !form.unlisted && form.status !== 'need_to_order';
  const ready =
    Number(form.quantity) > 0 &&
    form.orderDate !== '' &&
    (form.unlisted ? form.itemName.trim() !== '' : form.fabricColourId != null) &&
    (!placed || (form.vendorId != null && form.expectedDate !== ''));

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    const body = {
      fabricColourId: form.unlisted ? null : form.fabricColourId,
      itemName: form.unlisted ? form.itemName.trim() : null,
      vendorId: form.vendorId,
      quantityOrdered: Number(form.quantity),
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || null,
      // An unlisted fabric can't be ordered yet — it's still being sourced.
      status: form.unlisted ? ('need_to_order' as const) : form.status,
      note: form.note.trim() || null,
    };
    try {
      const saved = editing
        ? await updateFabricOrder(editing.id, body)
        : await createFabricOrder(body);
      onSaved(saved);
    } catch (e) {
      toast.show(
        apiErrorMessage(e) ??
          t('admin.fabricOrders.saveError', { defaultValue: 'Could not save the order.' }),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-xl"
      title={
        editing
          ? t('admin.fabricOrders.edit', { defaultValue: 'Edit order' })
          : t('admin.fabricOrders.new', { defaultValue: 'New fabric order' })
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!ready || saving} onClick={() => void submit()}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.unlisted}
            disabled={editing != null && editing.receivedQuantity > 0}
            onChange={(e) => set('unlisted', e.target.checked)}
          />
          {t('admin.fabricOrders.unlisted', { defaultValue: 'Not in library yet' })}
        </label>

        {form.unlisted ? (
          <div className="space-y-1.5">
            <Label>{t('admin.fabricOrders.itemName', { defaultValue: 'What is being sourced' })}</Label>
            <Input value={form.itemName} onChange={(e) => set('itemName', e.target.value)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('admin.fabricOrders.fabric', { defaultValue: 'Fabric' })}</Label>
              <Combobox
                value={form.fabricId}
                options={fabricOptions}
                onChange={(id) => {
                  const f = fabrics.find((x) => x.id === id);
                  setForm((s) => ({
                    ...s,
                    fabricId: (id as number) ?? null,
                    fabricColourId: f?.colours?.length === 1 ? f.colours[0].id : null,
                  }));
                }}
                disabled={editing != null && editing.receivedQuantity > 0}
                placeholder={t('admin.fabricChallan.fabricPh', { defaultValue: 'Choose a fabric…' })}
                ariaLabel={t('admin.fabricOrders.fabric', { defaultValue: 'Fabric' })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('admin.fabricOrders.colour', { defaultValue: 'Colour' })}</Label>
              <Combobox
                value={form.fabricColourId}
                options={(fabric?.colours ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                  sublabel: c.code ?? undefined,
                }))}
                onChange={(id) => set('fabricColourId', (id as number) ?? null)}
                disabled={!fabric || (editing != null && editing.receivedQuantity > 0)}
                placeholder={t('admin.fabricChallan.colourPh', { defaultValue: 'Choose a colour…' })}
                ariaLabel={t('admin.fabricOrders.colour', { defaultValue: 'Colour' })}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              {t('admin.fabricOrders.vendor', { defaultValue: 'Vendor' })}
              {placed && ' *'}
            </Label>
            <Combobox
              value={form.vendorId}
              options={vendorOptions}
              onChange={(id) => set('vendorId', (id as number) ?? null)}
              onAddNew={(typed) => void addVendor(typed)}
              addNewLabel={t('admin.fabricChallan.addVendor', { defaultValue: 'Add supplier' })}
              placeholder={t('admin.fabricChallan.vendorNone', { defaultValue: 'Choose a supplier…' })}
              ariaLabel={t('admin.fabricOrders.vendor', { defaultValue: 'Vendor' })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('admin.fabricOrders.quantity', { defaultValue: 'Quantity' })}
              {uom ? ` (${uom})` : ''}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('admin.fabricOrders.orderDate', { defaultValue: 'Order date' })}</Label>
            <Input type="date" value={form.orderDate} onChange={(e) => changeOrderDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t('admin.fabricOrders.expectedDate', { defaultValue: 'Expected in house' })}
              {placed && ' *'}
            </Label>
            <Input
              type="date"
              value={form.expectedDate}
              onChange={(e) => set('expectedDate', e.target.value)}
            />
          </div>
          {!form.unlisted && (
            <div className="space-y-1.5">
              <Label>{t('admin.fabricOrders.status', { defaultValue: 'Status' })}</Label>
              <Select
                value={form.status}
                onChange={(e) => set('status', e.target.value as FabricOrderStatus)}
              >
                {SETTABLE_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`admin.fabricOrders.statuses.${s}`, { defaultValue: ORDER_STATUS_LABEL[s] })}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>{t('admin.fabricOrders.note', { defaultValue: 'Remarks' })}</Label>
          <Textarea rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
