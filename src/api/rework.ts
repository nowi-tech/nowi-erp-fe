import { apiClient } from './apiClient';
import type { OpenReworkPayload, ReworkIssue } from './types';
import { FeatureUnavailableError } from './receipts';

function is404(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const r = (err as { response?: { status?: number } }).response;
  return r?.status === 404;
}

export async function openRework(payload: OpenReworkPayload): Promise<ReworkIssue | null> {
  try {
    const res = await apiClient.post<ReworkIssue>('/api/rework', payload);
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
