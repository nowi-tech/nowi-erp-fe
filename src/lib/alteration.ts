import { useTranslation } from 'react-i18next';
import type { AlterationChannel, AlterationSource, AlterationStatus } from '@/api/alteration';

/** Status / source / channel labels shared by the Alteration list and detail pages. */
export function useAlterationLabels() {
  const { t } = useTranslation();
  const statusLabel = (s: AlterationStatus) =>
    ({
      received: t('admin.alteration.status.received', { defaultValue: 'Received' }),
      in_alteration: t('admin.alteration.status.inAlteration', { defaultValue: 'In alteration' }),
      on_hold: t('admin.alteration.status.onHold', { defaultValue: 'On hold' }),
      completed: t('admin.alteration.status.completed', { defaultValue: 'Completed' }),
      cancelled: t('admin.alteration.status.cancelled', { defaultValue: 'Cancelled' }),
    })[s];
  const sourceLabel = (s: AlterationSource) =>
    ({
      customer_return: t('admin.alteration.source.customerReturn', { defaultValue: 'Customer return' }),
      rto: t('admin.alteration.source.rto', { defaultValue: 'RTO' }),
      warehouse: t('admin.alteration.source.warehouse', { defaultValue: 'Warehouse' }),
      production: t('admin.alteration.source.production', { defaultValue: 'Production' }),
      other: t('admin.alteration.source.other', { defaultValue: 'Other' }),
    })[s];
  const channelLabel = (c: AlterationChannel) =>
    ({ myntra: 'Myntra', flipkart: 'Flipkart', shopify: 'Shopify', wishlink: 'Wishlink' })[c];
  return { statusLabel, sourceLabel, channelLabel };
}
