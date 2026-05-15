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

/**
 * Two-step photo upload:
 *   1. POST /api/storage/upload-url → get signed PUT URL + objectPath
 *   2. PUT the file bytes directly to GCS at that URL
 *
 * In noop dev mode (BE returns `noop: true`), step 2 is skipped — the
 * objectPath is recorded so the FE flow looks identical to prod, but
 * no actual GCS object exists. This is the path that's been broken in
 * prod since v0 — see PROD_READINESS.md.
 *
 * Returns the objectPath the caller should record on the parent entity
 * (rework, stage_receipt, etc.).
 */
export async function uploadPhoto(
  entityType: string,
  entityId: string | number,
  file: File,
): Promise<{ objectPath: string; noop: boolean }> {
  const res = await requestUploadUrl({
    entityType,
    entityId: String(entityId),
    contentType: file.type,
  });
  if (!res.noop) {
    // Direct PUT to the GCS signed URL. Content-Type MUST match what
    // we asked the BE to sign for, otherwise GCS returns 403.
    const put = await fetch(res.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Photo upload failed (${put.status})`);
    }
  }
  return { objectPath: res.objectPath, noop: !!res.noop };
}
