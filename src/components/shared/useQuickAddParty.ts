import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { createBrand } from '@/api/brands';
import { createFactory, createVendor } from '@/api/vendors';

export type PartyRole = 'supplier' | 'factory' | 'brand';

const CREATE: Record<PartyRole, (name: string) => Promise<{ id: number | string; name: string }>> = {
  supplier: createVendor,
  factory: createFactory,
  brand: createBrand,
};

const FAILED: Record<PartyRole, string> = {
  supplier: 'Could not add that supplier.',
  factory: 'Could not add that factory.',
  brand: "Couldn't add that brand.",
};

/** State updater for a freshly loaded list that keeps any party quick-added before it arrived. */
export function keepAdded<T extends { id: number }>(rows: T[]) {
  return (prev: T[]) => [...rows, ...prev.filter((p) => !rows.some((r) => r.id === p.id))];
}

/** Combobox `onAddNew` for any party picker: the server reuses a party of that name, giving it this role. */
export function useQuickAddParty(
  role: PartyRole,
  onAdded: (p: { id: number; name: string }) => void,
  choice: unknown,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const busy = useRef(false);
  // A reply that lands after the user picked something else (or closed the dialog) is dropped.
  const latest = useRef(choice);
  latest.current = choice;
  return async (typed: string) => {
    const name = typed.trim();
    if (!name || busy.current) return;
    busy.current = true;
    const at = latest.current;
    try {
      const p = await CREATE[role](name);
      if (latest.current === at) onAdded({ id: Number(p.id), name: p.name });
    } catch (e) {
      toast.show(
        apiErrorMessage(e) ?? t(`admin.party.addFailed.${role}`, { defaultValue: FAILED[role] }),
        'error',
      );
    } finally {
      busy.current = false;
    }
  };
}
