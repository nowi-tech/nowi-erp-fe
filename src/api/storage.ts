import { apiClient } from './apiClient';
import type { ReadUrlsResponse, UploadUrlResponse } from './types';

export interface UploadUrlPayload {
  entityType: string;
  entityId?: string;
  contentType?: string;
}

/**
 * Resolve GCS object paths to short-lived signed read URLs. In local-FS
 * dev mode (no GCS creds) the BE returns http URLs pointing at its own
 * /api/storage/dev-files/ endpoint instead, so preview/print still
 * work. Either way callers get real http(s) URLs.
 */
export async function getReadUrls(
  objectPaths: string[],
): Promise<Record<string, string>> {
  if (objectPaths.length === 0) return {};
  const res = await apiClient.post<{ urls: Record<string, string> }>(
    '/api/storage/read-urls',
    { objectPaths },
  );
  return res.data.urls;
}

export async function requestUploadUrl(payload: UploadUrlPayload): Promise<UploadUrlResponse> {
  const res = await apiClient.post<UploadUrlResponse>('/api/storage/upload-url', payload);
  return res.data;
}

/**
 * Batch-mint signed read URLs for stored GCS object paths (e.g. rework
 * defect photos). Returns objectPath → signed URL; paths the BE can't
 * sign are simply absent from the map. Empty input short-circuits.
 */
export async function issueReadUrls(
  objectPaths: string[],
): Promise<Record<string, string>> {
  if (objectPaths.length === 0) return {};
  const res = await apiClient.post<ReadUrlsResponse>('/api/storage/read-urls', {
    objectPaths,
  });
  return res.data.urls ?? {};
}

/**
 * Resolve an upload-friendly content-type for a photo file.
 *
 * Android camera captures coming back through `<input type="file"
 * capture="environment">` can have `file.type` empty or set to a value
 * the BE's allow-list regex rejects (e.g. `image/jpg`). The BE only
 * accepts `image/(jpeg|png|webp)` for photos — anything else 400s on
 * /api/storage/upload-url and the user sees a generic error.
 *
 * Strategy:
 *  1. If `file.type` is already an allowed image MIME, use it.
 *  2. Otherwise fall back to the file extension.
 *  3. Final fallback is `image/jpeg` — the safest assumption for an
 *     Android camera output that didn't self-identify.
 */
function resolvePhotoContentType(file: File): string {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/jpeg' || t === 'image/png' || t === 'image/webp') {
    return t;
  }
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg' || t === 'image/jpg') return 'image/jpeg';
  // Camera intents on some Android OEMs return a File with no name + no
  // type at all. Defaulting to JPEG matches the actual encoding the
  // hardware uses in practice and unblocks the upload.
  return 'image/jpeg';
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
  const contentType = resolvePhotoContentType(file);
  const res = await requestUploadUrl({
    entityType,
    entityId: String(entityId),
    contentType,
  });
  if (!res.noop) {
    // Direct PUT to the GCS signed URL. Content-Type MUST match what
    // we asked the BE to sign for, otherwise GCS returns 403.
    const put = await fetch(res.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!put.ok) {
      // Include status in the thrown error so callers can surface a
      // more specific toast (e.g. "permission denied" vs "network").
      throw new Error(`Photo upload failed (${put.status})`);
    }
  }
  return { objectPath: res.objectPath, noop: !!res.noop };
}

/** Content-type the BE's upload-url DTO allow-lists, keyed by extension. */
const CAD_CONTENT_TYPE: Record<string, string> = {
  dxf: 'image/vnd.dxf',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * Upload a pattern / CAD file. Reuses the same two-step signed-URL flow
 * as {@link uploadPhoto}, but resolves the content-type from the file
 * extension — browsers frequently report an empty `file.type` for `.dxf`,
 * which would otherwise be rejected by the BE allow-list.
 */
export async function uploadCadFile(
  entityType: string,
  entityId: string | number,
  file: File,
): Promise<{ objectPath: string; noop: boolean }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = CAD_CONTENT_TYPE[ext];
  if (!contentType) {
    throw new Error('Unsupported file type — use .dxf, .pdf, .png, .jpg.');
  }
  const res = await requestUploadUrl({
    entityType,
    entityId: String(entityId),
    contentType,
  });
  if (!res.noop) {
    const put = await fetch(res.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!put.ok) {
      throw new Error(`CAD upload failed (${put.status})`);
    }
  }
  return { objectPath: res.objectPath, noop: !!res.noop };
}
