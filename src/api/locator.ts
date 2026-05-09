import { apiClient } from './apiClient';
import { FeatureUnavailableError, is404 } from './_errors';
import type { LocatorParams, LocatorResponse, SkuDetailResponse } from './types';

export async function getLocator(params: LocatorParams = {}): Promise<LocatorResponse> {
  try {
    const res = await apiClient.get<LocatorResponse>('/api/locator', { params });
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function getSkuDetail(sku: string): Promise<SkuDetailResponse> {
  try {
    const res = await apiClient.get<SkuDetailResponse>(
      `/api/locator/sku/${encodeURIComponent(sku)}`,
    );
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
