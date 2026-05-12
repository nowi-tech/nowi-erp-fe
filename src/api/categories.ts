import { apiClient } from './apiClient';
import type { CategoryWithStyleCode } from './types';

/**
 * Lists categories. The receive form filters client-side to only the
 * ones with a `styleCode` set, since those are the only categories the
 * Style ID generator can build a code from.
 */
export async function listCategories(): Promise<CategoryWithStyleCode[]> {
  const res = await apiClient.get<CategoryWithStyleCode[]>('/api/categories');
  return res.data;
}
