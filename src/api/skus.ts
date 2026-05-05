import { apiClient } from './apiClient';
import type { Sku } from './types';

export interface ListSkusParams {
  search?: string;
  baseCode?: string;
}

export async function listSkus(params: ListSkusParams = {}): Promise<Sku[]> {
  const res = await apiClient.get<Sku[] | { data: Sku[] }>('/api/skus', { params });
  return Array.isArray(res.data) ? res.data : res.data.data;
}

export async function listByBase(baseCode: string): Promise<Sku[]> {
  return listSkus({ baseCode });
}
