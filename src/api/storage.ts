import { apiClient } from './apiClient';
import type { UploadUrlResponse } from './types';

export interface UploadUrlPayload {
  entityType: string;
  entityId?: string;
  contentType?: string;
}

export async function requestUploadUrl(payload: UploadUrlPayload): Promise<UploadUrlResponse> {
  const res = await apiClient.post<UploadUrlResponse>('/api/storage/upload-url', payload);
  return res.data;
}
