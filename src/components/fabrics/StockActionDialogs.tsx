import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { returnFabric, sendBackFabric, stockCheck } from '@/api/fabricChallans';
import { fmtQty, UOM_SHORT } from '@/lib/fabric';
import type { FabricUnitOfMeasure } from '@/api/types';

/** Shared shell: one number, one text field, save. */
function QtyDialog({
  open,
  title,
  qtyLabel,
  textLabel,
  textRequired,
  initialQty,
  positive = false,
  hint,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  qtyLabel: string;
  textLabel: string;
  textRequired: boolean;
  initialQty: string;
  positive?: boolean;
  hint?: string;
  onClose: () => void;
  onSubmit: (qty: number, text: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setQty(initialQty);
      setText('');
    }
  }, [open, initialQty]);
  const ready = qty !== '' && (positive ? Number(qty) > 0 : Number(qty) >= 0) && (!textRequired || text.trim() !== '');
  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit(Number(qty), text.trim());
    } catch (e) {
      toast.show(apiErrorMessage(e) ?? t('common.saveError', 'Could not save.'), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!ready || saving} onClick={() => void submit()}>
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {hint && <p className="text-sm text-[var(--color-muted-foreground)]">{hint}</p>}
        <div className="space-y-1.5">
          <Label>{qtyLabel}</Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {textLabel}
            {textRequired ? ' *' : ''}
          </Label>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

/** Set a colour's stock to what was physically counted. */
export function StockCheckDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { fabricColourId: number; name: string; stock: number; unit: FabricUnitOfMeasure | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const u = target?.unit ? ` (${UOM_SHORT[target.unit]})` : '';
  return (
    <QtyDialog
      open={target != null}
      title={`${t('admin.stockCheck.title', { defaultValue: 'Update' })} — ${target?.name ?? ''}`}
      hint={
        target
          ? t('admin.stockCheck.hint', {
              defaultValue: 'System says {{stock}}.',
              stock: fmtQty(target.stock, target.unit),
            })
          : undefined
      }
      qtyLabel={`${t('admin.stockCheck.counted', { defaultValue: 'Counted' })}${u}`}
      textLabel={t('admin.stockCheck.reason', { defaultValue: 'Reason' })}
      textRequired
      initialQty=""
      onClose={onClose}
      onSubmit={async (qty, reason) => {
        await stockCheck({ fabricColourId: target!.fabricColourId, actualQuantity: qty, reason });
        onSaved();
      }}
    />
  );
}

/** Unused fabric coming back against one issue line. */
export function ReturnDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { entryId: number; label: string; open: number; unit: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  return (
    <QtyDialog
      open={target != null}
      title={`${t('admin.returnFabric.title', { defaultValue: 'Return fabric' })} — ${target?.label ?? ''}`}
      hint={
        target
          ? t('admin.returnFabric.hint', {
              defaultValue: 'Up to {{open}} can come back on this issue.',
              open: fmtQty(target.open, target.unit),
            })
          : undefined
      }
      qtyLabel={t('admin.returnFabric.qty', { defaultValue: 'Quantity back' })}
      textLabel={t('admin.fabricLibrary.stock.note')}
      textRequired={false}
      initialQty=""
      positive
      onClose={onClose}
      onSubmit={async (qty, note) => {
        await returnFabric(target!.entryId, { quantity: qty, note: note || null });
        onSaved();
      }}
    />
  );
}

/** Faulty fabric back to the vendor against one receipt line. */
export function SendBackDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { entryId: number; label: string; open: number; unit: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  return (
    <QtyDialog
      open={target != null}
      title={`${t('admin.sendBack.title', { defaultValue: 'Send back to vendor' })} — ${target?.label ?? ''}`}
      hint={
        target
          ? t('admin.sendBack.hint', {
              defaultValue: 'Up to {{open}} can go back on this receipt.',
              open: fmtQty(target.open, target.unit),
            })
          : undefined
      }
      qtyLabel={t('admin.sendBack.qty', { defaultValue: 'Quantity going back' })}
      textLabel={t('admin.stockCheck.reason', { defaultValue: 'Reason' })}
      textRequired
      initialQty=""
      positive
      onClose={onClose}
      onSubmit={async (qty, reason) => {
        await sendBackFabric(target!.entryId, { quantity: qty, reason });
        onSaved();
      }}
    />
  );
}
