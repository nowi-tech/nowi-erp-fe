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

export function orderStatusVariant(status: OrderStatus | string): StatusVariant {
  switch (status) {
    case 'receiving':
      return 'outline';
    case 'in_stitching':
      return 'stitch';
    case 'in_finishing':
      return 'finish';
    case 'in_rework':
      return 'rework';
    case 'dispatched':
      return 'disp';
    case 'closed':
    case 'closed_with_adjustment':
      return 'ready';
    case 'stuck':
      return 'stuck';
    default:
      return 'outline';
  }
}

export function dispatchStatusVariant(
  status: DispatchStatus | string,
): StatusVariant {
  switch (status) {
    case 'draft':
    case 'awaiting_confirmation':
      return 'outline';
    case 'synced':
    case 'manual_pdf':
      return 'disp';
    case 'awaiting_grn':
      return 'transit';
    case 'grn_received':
      return 'ready';
    case 'grn_mismatch':
    case 'sync_failed':
      return 'stuck';
    case 'closed':
      return 'ready';
    default:
      return 'outline';
  }
}
