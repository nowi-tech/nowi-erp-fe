import { apiClient } from './apiClient';
import type { CreateReceiptsPayload } from './types';

export class FeatureUnavailableError extends Error {
  constructor(message = 'feature_unavailable') {
    super(message);
    this.name = 'FeatureUnavailableError';
  }
}

function is404(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const r = (err as { response?: { status?: number } }).response;
  return r?.status === 404;
}

export async function createReceipts(payload: CreateReceiptsPayload): Promise<void> {
  try {
    await apiClient.post('/api/receipts', payload);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
