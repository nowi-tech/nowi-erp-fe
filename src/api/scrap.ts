import { apiClient } from './apiClient';
import type { CreateScrapPayload, ScrapEvent } from './types';
import { FeatureUnavailableError } from './receipts';

function is404(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const r = (err as { response?: { status?: number } }).response;
  return r?.status === 404;
}

export async function createScrap(payload: CreateScrapPayload): Promise<ScrapEvent | null> {
  try {
    const res = await apiClient.post<ScrapEvent>('/api/scrap', payload);
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
