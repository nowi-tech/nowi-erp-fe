import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import FabricEditorForm from '@/components/fabrics/FabricEditorForm';
import type { Fabric } from '@/api/types';
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
 * "+ Add fabric" opens the full FabricEditorForm — same form the
 * Fabric Library page uses, so the picker has every field a designer
 * needs (name, count, construction, GSM, cuttable width, UoM, price,
 * composition, notes). Shared component → both surfaces stay in sync.
 */
export default function FabricPicker({
  fabrics,
  value,
  onChange,
  onFabricCreated,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Prefill name when "+ Add 'Cotton Twill'" is clicked from the
  // combobox. Cleared whenever the modal closes.
  const [seedName, setSeedName] = useState<string>('');

  const options = useMemo<ComboboxOption<number>[]>(() => {
    const opts: ComboboxOption<number>[] = [];

    fabrics.forEach((f) => {
      // If fabric has colours, create one option per colour
      if (f.colours && f.colours.length > 0) {
        f.colours.forEach((c) => {
          const qty = c.availableQuantity;
          const uom = f.unitOfMeasure ?? "";
          const sub =
            qty !== undefined && qty !== null && qty > 0
              ? `${qty} ${uom} available`
              : "No stock";

          opts.push({
            value: f.id,
            label: `${f.name} — ${c.name}`,
            sublabel: sub,
            searchText: `${f.name} ${c.name} ${f.typeLabel ?? ""}`,
            trailing: <StockPill qty={qty} />,
          });
        });
      } else {
        // Fallback: if no colours, show fabric alone (shouldn't happen but safe)
        const qty = f.availableQuantity;
        const uom = f.unitOfMeasure ?? "";
        const sub =
          qty !== undefined && qty !== null && qty > 0
            ? `${qty} ${uom} available`
            : "No stock";

        opts.push({
          value: f.id,
          label: f.name,
          sublabel: sub,
          searchText: `${f.name} ${f.typeLabel ?? ""}`,
          trailing: <StockPill qty={qty} />,
        });
      }
    });

    return opts;
  }, [fabrics]);

  return (
    <>
      <Combobox<number>
        value={value}
        options={options}
        onChange={(next) => onChange(next as number | null)}
        onAddNew={(typed) => {
          setSeedName(typed);
          setOpen(true);
        }}
        addNewLabel={t('admin.styles.intake.addFabric', 'Add fabric')}
        placeholder={t('admin.styles.intake.fabricPh', 'Choose a fabric')}
        disabled={disabled}
        ariaLabel={t('admin.styles.intake.fabric')}
      />

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSeedName('');
        }}
        title={t('admin.styles.intake.newFabricTitle', 'New fabric')}
        maxWidthClassName="max-w-3xl"
      >
        {/* Always create mode (editing=null). `initialName` carries
            the search term the user typed in the combobox; `key`
            resets form state when the modal reopens with a new seed. */}
        <FabricEditorForm
          key={`new-${seedName}`}
          editing={null}
          initialName={seedName}
          initialUnitOfMeasure="meter"
          trimNotes
          successMessage={t('admin.styles.intake.fabricAddedToast', {
            defaultValue: 'Fabric added.',
          })}
          onCancel={() => {
            setOpen(false);
            setSeedName('');
          }}
          onSaved={(created) => {
            onFabricCreated?.(created);
            onChange(created.id);
            setOpen(false);
            setSeedName('');
          }}
        />
      </Dialog>
    </>
  );
}
