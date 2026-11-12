import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { createVendor, listVendorOptions, type VendorOption } from '@/api/vendors';

/** Supplier Combobox `onAddNew`: reuses a vendor already named that, else creates it. */
export function useQuickAddVendor(onAdded: (v: VendorOption) => void, choice: unknown) {
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
    const apply = (v: VendorOption) => {
      if (latest.current === at) onAdded(v);
    };
    try {
      // A picker may list only some vendors, so check the full list before minting a duplicate.
      const existing = (await listVendorOptions()).find((o) => o.name.toLowerCase() === name.toLowerCase());
      if (existing) return apply(existing);
      const v = await createVendor(name);
      apply({ id: Number(v.id), name: v.name, code: v.code, isFactory: v.isFactory ?? false });
    } catch (e) {
      toast.show(
        apiErrorMessage(e) ??
          t('admin.fabricChallan.vendorCreateError', { defaultValue: 'Could not add that supplier.' }),
        'error',
      );
    } finally {
      busy.current = false;
    }
  };
}
