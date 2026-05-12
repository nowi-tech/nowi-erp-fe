import { apiClient } from './apiClient';
import type { CreateReceiptsPayload } from './types';
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
  receivedAt: string;
}

export async function createReceipts(payload: CreateReceiptsPayload): Promise<void> {
  try {
    await apiClient.post('/api/receipts', payload);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function listReceipts(params: {
  lotId: number | string;
  stageId?: number;
  take?: number;
}): Promise<ReceiptRow[]> {
  const res = await apiClient.get<ReceiptRow[]>('/api/receipts', { params });
  return res.data;
}
