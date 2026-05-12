import type { OrderStatus, DispatchStatus } from '@/api/types';

/**
 * Maps domain enums → Badge variant (see `components/ui/badge.tsx`).
 * Keeps status colour decisions in one place so every list/detail page
 * looks consistent.
 */

export type StatusVariant =
  | 'stitch'
  | 'finish'
  | 'disp'
  | 'ready'
  | 'rework'
  | 'stuck'
  | 'transit'
  | 'outline';

/**
 * Trim policy: colour is reserved for **anomalies / things the user
 * needs to act on**. Routine / healthy states render as plain outline
 * pills so the page stays calm and the few coloured rows actually pop.
 */

export function orderStatusVariant(status: OrderStatus | string): StatusVariant {
  switch (status) {
    case 'in_rework':
      return 'rework';
    case 'stuck':
      return 'stuck';
    // Everything else — receiving / in_stitching / in_finishing /
    // dispatched / closed / closed_with_adjustment — is plain outline.
    default:
      return 'outline';
  }
}

export function dispatchStatusVariant(
  status: DispatchStatus | string,
): StatusVariant {
  switch (status) {
    case 'grn_mismatch':
    case 'sync_failed':
      return 'stuck';
    // draft / awaiting_confirmation / synced / manual_pdf /
    // awaiting_grn / grn_received / closed / closed_with_adjustment
    // all render as plain outline.
    default:
      return 'outline';
  }
}
