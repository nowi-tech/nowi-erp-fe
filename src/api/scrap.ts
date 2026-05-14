import { apiClient } from './apiClient';
import type { CreateScrapPayload, Lot, ScrapEvent } from './types';
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
  lot?: Lot;
  stage?: { id: number; code: string; name: string } | null;
}

export async function listScraps(params: {
  lotId?: number;
  stageId?: number;
  byMe?: boolean;
  /** ISO datetime; scrap events with scrappedAt >= from are returned. */
  from?: string;
  /** ISO datetime; scrap events with scrappedAt <= to are returned. */
  to?: string;
  skip?: number;
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
