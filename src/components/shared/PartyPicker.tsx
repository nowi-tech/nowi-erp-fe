import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/components/ui/toast';
import { getBrands } from '@/api/brands';
import { getFactories } from '@/api/vendors';
import { useQuickAddParty } from './useQuickAddParty';

/** Stands in for "no brand" (Nowi's own label) — Combobox values can't be null. */
const NOWI = 0;

interface Props {
  role: 'brand' | 'factory';
  value: number | null;
  onChange: (id: number | null) => void;
  /** Brand pickers where no brand is a valid answer list "NOWI (own label)" for it. */
  nowiOption?: boolean;
  /** The saved party, kept listed even if it has since been deactivated. */
  current?: { id: number; name: string } | null;
}

/** Brand / "Made by" picker with "+ Add": a new name is saved as a party with this role. */
export function PartyPicker({ role, value, onChange, nowiOption = false, current }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [parties, setParties] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    let live = true;
    void (role === 'brand' ? getBrands() : getFactories())
      .then((rows) => live && setParties(rows))
      .catch(
        () =>
          live &&
          toast.show(
            t(`admin.party.loadFailed.${role}`, {
              defaultValue: role === 'brand' ? "Couldn't load brands." : "Couldn't load factories.",
            }),
            'error',
          ),
      );
    return () => {
      live = false;
    };
  }, [role]);

  const add = useQuickAddParty(
    role,
    (p) => {
      setParties((ps) =>
        ps.some((x) => x.id === p.id) ? ps : [...ps, p].sort((a, b) => a.name.localeCompare(b.name)),
      );
      onChange(p.id);
    },
    value,
  );

  const label =
    role === 'brand'
      ? t('admin.styles.intake.fork.brandLabel')
      : t('admin.styles.intake.fork.madeByLabel', { defaultValue: 'Made by' });

  return (
    <Combobox<number>
      value={value ?? (nowiOption ? NOWI : null)}
      options={[
        ...(nowiOption ? [{ value: NOWI, label: t('admin.styles.intake.fork.brandNone') }] : []),
        ...(current && !parties.some((p) => p.id === current.id) ? [current] : []).map((p) => ({
          value: p.id,
          label: p.name,
        })),
        ...parties.map((p) => ({ value: p.id, label: p.name })),
      ]}
      onChange={(id) => onChange(id === NOWI ? null : id)}
      onAddNew={(typed) => void add(typed)}
      addOnEnter={false}
      addNewLabel={
        role === 'brand'
          ? t('admin.party.addBrand', { defaultValue: 'Add a new brand' })
          : t('admin.party.addFactory', { defaultValue: 'Add a new factory' })
      }
      placeholder={
        role === 'brand'
          ? t('admin.styles.intake.fork.brandPick')
          : t('admin.styles.intake.fork.madeByPick', { defaultValue: 'Choose a factory…' })
      }
      ariaLabel={label}
    />
  );
}
