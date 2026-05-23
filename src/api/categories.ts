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

/**
 * Payload for `POST /api/categories`. The BE accepts `code` + `name`
 * always; `styleCode` and `styleCounter` are optional but required if
 * this category should ever be used as the anchor of a Style ID.
 */
export interface CreateCategoryDto {
  code: string;
  name: string;
  styleCode?: string | null;
  styleCounter?: number | null;
}

/**
 * Inline category creation. The endpoint is now open to designers
 * (sampling_editor / sampling_lead / pattern_master_*) so they can
 * add categories from the intake form without breaking flow.
 */
export async function createCategory(
  dto: CreateCategoryDto,
): Promise<CategoryWithStyleCode> {
  const res = await apiClient.post<CategoryWithStyleCode>(
    '/api/categories',
    dto,
  );
  return res.data;
}
