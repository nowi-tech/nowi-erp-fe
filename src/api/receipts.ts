import { apiClient } from './apiClient';
import type { CreateReceiptsPayload, Lot } from './types';
import { FeatureUnavailableError, is404 } from './_errors';

export { FeatureUnavailableError, is404 };

export interface ReceiptRow {
  id: number;
  lotId: number;
  stageId: number;
  sku: string;
  sizeLabel: string;
  qty: number;
  kind: 'forward' | 'rework_return' | 'rework_redo';
  receivedBy: number;
  /** Display name of the user who recorded this — for "who did what" audit. */
  receivedByName?: string;
  receivedAt: string;
  /** When the receipt was accepted at the next stage. `null` until the
   *  receiving master taps Accept; until then units are "in transit"
   *  and do NOT count toward `available[size]` at the next stage. */
  acceptedAt?: string | null;
  acceptedBy?: number | null;
  lot?: Lot;
  stage?: { id: number; code: string; name: string };
}

export async function createReceipts(payload: CreateReceiptsPayload): Promise<void> {
  try {
    await apiClient.post('/api/receipts', payload);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function acceptReceipt(id: number): Promise<void> {
  try {
    await apiClient.post(`/api/receipts/${id}/accept`);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function listReceipts(params: {
  lotId?: number;
  stageId?: number;
  kind?: ReceiptRow['kind'];
  byMe?: boolean;
  /** ISO datetime; receipts with receivedAt >= from are returned. */
  from?: string;
  /** ISO datetime; receipts with receivedAt <= to are returned. */
  to?: string;
  skip?: number;
  take?: number;
}): Promise<ReceiptRow[]> {
  const res = await apiClient.get<ReceiptRow[]>('/api/receipts', { params });
  return res.data;
}
