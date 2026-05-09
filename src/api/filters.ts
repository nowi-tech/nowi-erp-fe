import { apiClient } from './apiClient';
import { FeatureUnavailableError, is404 } from './_errors';
import type {
  FilterOption,
  FilterStage,
  FilterSku,
  FilterStatus,
} from './types';

async function getList<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
  try {
    const res = await apiClient.get<T[] | { data: T[] }>(path, { params });
    return Array.isArray(res.data) ? res.data : res.data.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export function listVendors(): Promise<FilterOption[]> {
  return getList<FilterOption>('/api/filters/vendors');
}

export function listStages(): Promise<FilterStage[]> {
  return getList<FilterStage>('/api/filters/stages');
}

export function listWarehouses(): Promise<FilterOption[]> {
  return getList<FilterOption>('/api/filters/warehouses');
}

export function listStatuses(): Promise<FilterStatus[]> {
  return getList<FilterStatus>('/api/filters/statuses');
}

export function listBrands(): Promise<FilterOption[]> {
  return getList<FilterOption>('/api/filters/brands');
}

export function listGenders(): Promise<FilterOption[]> {
  return getList<FilterOption>('/api/filters/genders');
}

export function listCategories(): Promise<FilterOption[]> {
  return getList<FilterOption>('/api/filters/categories');
}

export interface SearchSkusParams {
  search?: string;
  originVendorId?: string;
  take?: number;
}

export function searchSkus(params: SearchSkusParams = {}): Promise<FilterSku[]> {
  const q: Record<string, unknown> = { ...params };
  return getList<FilterSku>('/api/filters/skus', q);
}
