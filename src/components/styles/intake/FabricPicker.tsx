import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { createFabric } from '@/api/styles';
import type { Fabric, FabricUnitOfMeasure } from '@/api/types';
import { cn } from '@/lib/utils';

interface Props {
  fabrics: Fabric[];
  value: number | null;
  onChange: (next: number | null) => void;
  onFabricCreated?: (created: Fabric) => void;
  disabled?: boolean;
}

/** Yellow "Stock OK" / red "No stock" pill that appears in the combobox row. */
function StockPill({ qty }: { qty: number | null | undefined }) {
  const ok = qty !== undefined && qty !== null && qty > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        ok
          ? 'bg-[var(--status-active-bg,#fef3c7)] text-[var(--status-active-ink,#92400e)]'
          : 'bg-[var(--status-stuck-bg)] text-[var(--status-stuck-ink)]',
      )}
    >
      {ok ? 'Stock OK' : 'No stock — procurement first'}
    </span>
  );
}

/**
 * Searchable Fabric picker. Each row shows the fabric name + a stock
 * pill (yellow when there's stock, red when procurement is needed).
 *
 * "+ Add fabric" opens a lightweight inline dialog that captures the
 * minimum fields the BE needs (name + uom) so the designer never has
 * to leave the intake page. The full composition editor still lives
 * in the Fabric Library page — designers can flesh out the row later.
 */
export default function FabricPicker({
  fabrics,
  value,
  onChange,
  onFabricCreated,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    unitOfMeasure: '' | FabricUnitOfMeasure;
    gsm: string;
    notes: string;
  }>({
    name: '',
    unitOfMeasure: 'meter',
    gsm: '',
    notes: '',
  });
  const nameRef = useRef<HTMLInputElement>(null);

  const options = useMemo<ComboboxOption<number>[]>(() => {
    return fabrics.map((f) => {
      const qty = f.availableQuantity;
      const uom = f.unitOfMeasure ?? '';
      const sub =
        qty !== undefined && qty !== null && qty > 0
          ? `${qty} ${uom} available`
          : 'No stock';
      return {
        value: f.id,
        label: f.name,
        sublabel: sub,
        searchText: `${f.name} ${f.typeLabel ?? ''}`,
        trailing: <StockPill qty={qty} />,
      };
    });
  }, [fabrics]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.show('Fabric name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await createFabric({
        name: form.name.trim(),
        unitOfMeasure: form.unitOfMeasure || null,
        gsm: form.gsm ? Number(form.gsm) : null,
        notes: form.notes.trim() || null,
      });
      onFabricCreated?.(created);
      onChange(created.id);
      toast.show('Fabric added.', 'success');
      setOpen(false);
      setForm({ name: '', unitOfMeasure: 'meter', gsm: '', notes: '' });
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Could not create fabric.';
      toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Combobox<number>
        value={value}
        options={options}
        onChange={(next) => onChange(next as number | null)}
        onAddNew={(typed) => {
          // Prefill the new-fabric dialog with whatever the user typed
          // so "+ Add 'Linen Twill'" lands on the form with the name
          // already in place.
          if (typed) setForm((f) => ({ ...f, name: typed }));
          setOpen(true);
        }}
        addNewLabel={t('admin.styles.intake.addFabric', 'Add fabric')}
        placeholder={t('admin.styles.intake.fabricPh', 'Choose a fabric')}
        disabled={disabled}
        ariaLabel={t('admin.styles.intake.fabric')}
      />

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('admin.styles.intake.newFabricTitle', 'New fabric')}
        initialFocusRef={nameRef}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void submit()}>
              {saving ? t('common.saving') : t('common.create', 'Create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            {t(
              'admin.styles.intake.newFabricHelp',
              'Quick-add a fabric so you can keep submitting. You can flesh out composition and pricing later in the Fabric Library.',
            )}
          </p>
          <div>
            <Label>{t('admin.styles.intake.fabricName', 'Name *')}</Label>
            <Input
              ref={nameRef}
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="e.g. Cotton Twill"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t('admin.styles.intake.fabricUom', 'Unit of measure')}</Label>
              <Select
                value={form.unitOfMeasure}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    unitOfMeasure: e.target.value as '' | FabricUnitOfMeasure,
                  }))
                }
              >
                <option value="meter">Meter</option>
                <option value="kg">Kilogram</option>
                <option value="oz">Ounce</option>
              </Select>
            </div>
            <div>
              <Label>{t('admin.styles.intake.fabricGsm', 'GSM')}</Label>
              <Input
                type="number"
                min={0}
                value={form.gsm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gsm: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <Label>{t('admin.styles.intake.fabricNotes', 'Notes')}</Label>
            <Input
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}
