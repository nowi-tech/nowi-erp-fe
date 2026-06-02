import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import FabricEditorForm from '@/components/fabrics/FabricEditorForm';
import type { Fabric } from '@/api/types';
import { cn } from '@/lib/utils';

/** The fabric-colour a picker row resolves to. */
export interface FabricColourChoice {
  fabricId: number;
  /** Chosen FabricColour id; null when the fabric has no colours defined. */
  fabricColourId: number | null;
  /** The colour's name — used to auto-fill the product colour. */
  colourName: string | null;
}

interface Props {
  fabrics: Fabric[];
  fabricId: number | null;
  /** Currently-selected fabric-colour, so the right row stays highlighted. */
  fabricColourId?: number | null;
  onChange: (choice: FabricColourChoice | null) => void;
  onFabricCreated?: (created: Fabric) => void;
  disabled?: boolean;
}

/**
 * Composite Combobox key: fabric id + (optional) fabric-colour id. A fabric
 * with N colours produces N rows, so the colour MUST be encoded in the value
 * — otherwise every row of a fabric collides on the same value and the
 * Combobox can't tell them apart (wrong selection, duplicate React keys).
 */
const rowKey = (fabricId: number, fabricColourId: number | null) =>
  `${fabricId}:${fabricColourId ?? ''}`;

/** Stock sublabel shared by the coloured + colourless row shapes. */
function stockSub(qty: number | null | undefined, uom: string): string {
  return qty != null && qty > 0 ? `${qty} ${uom} available` : 'No stock';
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
 * Searchable Fabric picker. When a fabric stocks colours it lists one row
 * per fabric-colour ("Fabric — Colour"), each with its own per-colour stock
 * pill; a colourless fabric shows a single row. Selecting a row reports the
 * chosen fabric-colour (via `onChange`) so the caller can auto-fill the
 * product colour.
 *
 * "+ Add fabric" opens the full FabricEditorForm — same form the
 * Fabric Library page uses, so the picker has every field a designer
 * needs (name, count, construction, GSM, cuttable width, UoM, price,
 * composition, notes). Shared component → both surfaces stay in sync.
 */
export default function FabricPicker({
  fabrics,
  fabricId,
  fabricColourId,
  onChange,
  onFabricCreated,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Prefill name when "+ Add 'Cotton Twill'" is clicked from the
  // combobox. Cleared whenever the modal closes.
  const [seedName, setSeedName] = useState<string>('');

  const options = useMemo<ComboboxOption<string>[]>(() => {
    const opts: ComboboxOption<string>[] = [];

    fabrics.forEach((f) => {
      const uom = f.unitOfMeasure ?? '';
      if (f.colours && f.colours.length > 0) {
        // One row per colour — each carries its own per-colour stock.
        f.colours.forEach((c) => {
          opts.push({
            value: rowKey(f.id, c.id),
            label: `${f.name} — ${c.name}`,
            sublabel: stockSub(c.availableQuantity, uom),
            searchText: `${f.name} ${c.name} ${f.typeLabel ?? ''}`,
            trailing: <StockPill qty={c.availableQuantity} />,
          });
        });
      } else {
        // Expected for fabrics with no colours defined (e.g. legacy rows):
        // a single fabric-level row with no colour to auto-fill.
        opts.push({
          value: rowKey(f.id, null),
          label: f.name,
          sublabel: stockSub(f.availableQuantity, uom),
          searchText: `${f.name} ${f.typeLabel ?? ''}`,
          trailing: <StockPill qty={f.availableQuantity} />,
        });
      }
    });

    return opts;
  }, [fabrics]);

  const selectedKey =
    fabricId != null ? rowKey(fabricId, fabricColourId ?? null) : null;

  // Keep the trigger representable even when the product colour was
  // overridden to something off the fabric's list (fabricId set, but the
  // selectedKey matches no row): synthesize a fabric-level entry so the
  // chosen fabric still shows instead of a blank trigger.
  const optionsWithSelection = useMemo<ComboboxOption<string>[]>(() => {
    if (selectedKey == null || options.some((o) => o.value === selectedKey)) {
      return options;
    }
    const f = fabrics.find((x) => x.id === fabricId);
    if (!f) return options;
    return [
      ...options,
      {
        value: selectedKey,
        label: f.name,
        sublabel: stockSub(f.availableQuantity, f.unitOfMeasure ?? ''),
        searchText: f.name,
        trailing: <StockPill qty={f.availableQuantity} />,
      },
    ];
  }, [options, selectedKey, fabrics, fabricId]);

  return (
    <>
      <Combobox<string>
        value={selectedKey}
        options={optionsWithSelection}
        onChange={(nextKey) => {
          if (nextKey == null) {
            onChange(null);
            return;
          }
          const [fidStr, fcidStr] = String(nextKey).split(':');
          const fid = Number(fidStr);
          const fcid = fcidStr ? Number(fcidStr) : null;
          const fabric = fabrics.find((f) => f.id === fid);
          const colourName =
            fcid != null
              ? (fabric?.colours?.find((c) => c.id === fcid)?.name ?? null)
              : null;
          onChange({ fabricId: fid, fabricColourId: fcid, colourName });
        }}
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
            // Auto-select the new fabric; if it was created with colours,
            // default to the first so the colour is captured too.
            const firstColour = created.colours?.[0] ?? null;
            onChange({
              fabricId: created.id,
              fabricColourId: firstColour?.id ?? null,
              colourName: firstColour?.name ?? null,
            });
            setOpen(false);
            setSeedName('');
          }}
        />
      </Dialog>
    </>
  );
}
