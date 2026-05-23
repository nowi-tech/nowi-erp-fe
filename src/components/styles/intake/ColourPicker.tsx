import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { listDistinctColours } from '@/api/styles';

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Optional placeholder for the closed-state trigger. */
  placeholder?: string;
}

/**
 * Searchable Colour picker. Suggestions come from `GET /api/styles/colours`
 * (distinct `primaryColour` values across existing styles). There is no
 * master table — `primaryColour` is free text on Style — so the "+ Add"
 * row just commits the typed value verbatim.
 *
 * Same UX contract as Category/Fabric pickers:
 *   - type-ahead filters the list
 *   - typing a value not in the list flips the first row to `+ Add "X"`
 *   - Enter on an unmatched query commits via that path
 */
export default function ColourPicker({
  value,
  onChange,
  disabled,
  placeholder,
}: Props) {
  const { t } = useTranslation();
  const [colours, setColours] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    listDistinctColours()
      .then((rows) => {
        if (mounted) setColours(rows);
      })
      .catch(() => {
        // Soft-fail: a missing suggestions list shouldn't block intake.
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Combine the server list with the currently-selected value so an
  // off-list colour (just-added or imported) still shows as selected
  // in the closed trigger.
  const options = useMemo<ComboboxOption<string>[]>(() => {
    const set = new Set<string>(colours);
    if (value) set.add(value);
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c, searchText: c }));
  }, [colours, value]);

  return (
    <Combobox<string>
      value={value || null}
      options={options}
      onChange={(next) => onChange(next ?? '')}
      onAddNew={(typed) => {
        // No master table for colours — the typed value is the colour.
        const v = typed.trim();
        if (!v) return;
        // Keep the local suggestions in sync so the new value sticks
        // around for this session even before the server-side list
        // refreshes on next mount.
        setColours((cs) => (cs.includes(v) ? cs : [...cs, v]));
        onChange(v);
      }}
      addNewLabel={t('admin.styles.intake.addColour', 'Add colour')}
      placeholder={
        placeholder ?? t('admin.styles.intake.colourPh', 'Type or pick a colour')
      }
      disabled={disabled}
      ariaLabel={t('admin.styles.intake.primaryColour', 'Primary colour')}
    />
  );
}
