import { apiClient } from './apiClient';
import type { CreateReceiptsPayload } from './types';
import { FeatureUnavailableError, is404 } from './_errors';

export { FeatureUnavailableError, is404 };

export async function createReceipts(payload: CreateReceiptsPayload): Promise<void> {
  try {
    await apiClient.post('/api/receipts', payload);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
