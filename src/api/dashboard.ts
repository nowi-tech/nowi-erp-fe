import { apiClient } from './apiClient';
import { FeatureUnavailableError, is404 } from './_errors';
import type {
  CycleTimeResponse,
  ReworkRateResponse,
  ThroughputResponse,
} from './types';

async function getOne<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.get<T>(path, { params });
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export function getThroughput(days: 7 | 30 = 7): Promise<ThroughputResponse> {
  return getOne<ThroughputResponse>('/api/dashboard/throughput', { days });
}

export function getReworkRate(days = 30): Promise<ReworkRateResponse> {
  return getOne<ReworkRateResponse>('/api/dashboard/rework-rate', { days });
}

export function getCycleTime(days = 30): Promise<CycleTimeResponse> {
  return getOne<CycleTimeResponse>('/api/dashboard/cycle-time', { days });
}
