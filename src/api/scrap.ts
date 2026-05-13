import { apiClient } from './apiClient';
import type { CreateScrapPayload, ScrapEvent } from './types';
import { FeatureUnavailableError, is404 } from './_errors';

export async function createScrap(payload: CreateScrapPayload): Promise<ScrapEvent | null> {
  try {
    const res = await apiClient.post<ScrapEvent>('/api/scrap', payload);
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export interface ScrapRow extends ScrapEvent {
  /** Filled by BE so the floor "Recently forwarded" log can show who scrapped. */
  scrappedByName?: string;
}

export async function listScraps(params: {
  lotId: number | string;
  stageId?: number;
  take?: number;
}): Promise<ScrapRow[]> {
  try {
    const res = await apiClient.get<ScrapRow[]>('/api/scrap', { params });
    return res.data;
  } catch (err) {
    if (is404(err)) return [];
    throw err;
  }
}
