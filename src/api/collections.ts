import { apiClient } from './apiClient';
import type { Collection } from './types';

/**
 * Lists active collections — the picker list on the intake form and the
 * filter on the registry. Mirrors `listCategories`.
 */
export async function listCollections(): Promise<Collection[]> {
  const res = await apiClient.get<Collection[]>('/api/collections');
  return res.data;
}

/** Payload for `POST /api/collections`. `name` is required + unique. */
export interface CreateCollectionDto {
  name: string;
  code?: string | null;
}

/**
 * Inline collection creation from the intake form's "+ Add new" path.
 * Open to PD editors (MASTER_DATA_WRITE_ROLES on the BE).
 */
export async function createCollection(
  dto: CreateCollectionDto,
): Promise<Collection> {
  const res = await apiClient.post<Collection>('/api/collections', dto);
  return res.data;
}
