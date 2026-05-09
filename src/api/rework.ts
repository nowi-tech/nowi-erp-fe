import { apiClient } from './apiClient';
import type { OpenReworkPayload, ReworkIssue } from './types';
import { FeatureUnavailableError, is404 } from './_errors';

export async function openRework(payload: OpenReworkPayload): Promise<ReworkIssue | null> {
  try {
    const res = await apiClient.post<ReworkIssue>('/api/rework', payload);
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
