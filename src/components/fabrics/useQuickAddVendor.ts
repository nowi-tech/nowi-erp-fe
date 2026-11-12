import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { createVendor, listVendorOptions, type VendorOption } from '@/api/vendors';

/** Supplier Combobox `onAddNew`: reuses a vendor already named that, else creates it. */
export function useQuickAddVendor(onAdded: (v: VendorOption) => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const busy = useRef(false);
  return async (typed: string) => {
    const name = typed.trim();
    if (!name || busy.current) return;
    busy.current = true;
    try {
      // A picker may list only some vendors, so check the full list before minting a duplicate.
      const existing = (await listVendorOptions()).find((o) => o.name.toLowerCase() === name.toLowerCase());
      if (existing) return onAdded(existing);
      const v = await createVendor(name);
      onAdded({ id: Number(v.id), name: v.name, code: v.code, isFactory: v.isFactory ?? false });
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
