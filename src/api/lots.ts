import { apiClient } from './apiClient';
import type { AvailabilityResponse, Lot, SizeMatrix } from './types';

export interface ListLotsParams {
  search?: string;
  status?: string;
  vendorId?: string;
  /** Filter to lots assigned to a specific user. */
  assignedUserId?: number;
  /** Floor manager view: only unassigned lots. */
  unassigned?: boolean;
  /** Stitching home: lots assigned to me. */
  assignedToMe?: boolean;
  take?: number;
  skip?: number;
}

export async function listLots(params: ListLotsParams = {}): Promise<Lot[]> {
  const res = await apiClient.get<Lot[] | { data: Lot[] }>('/api/lots', { params });
  return Array.isArray(res.data) ? res.data : res.data.data;
}

export async function assignLot(lotId: number, userId: number): Promise<Lot> {
  const res = await apiClient.post<Lot>(`/api/lots/${lotId}/assign`, { userId });
  return res.data;
}

export interface PatchLotPayload {
  vendorLotNo?: string | null;
  styleId?: number;
  qtyIn?: SizeMatrix;
}

export async function patchLot(lotId: number, body: PatchLotPayload): Promise<Lot> {
  const res = await apiClient.patch<Lot>(`/api/lots/${lotId}`, body);
  return res.data;
}

/**
 * Edit-request — used when the 24h direct-edit window has passed.
 * BE writes a `lot_edit_requested` audit row; no mutation. Admin
 * reviews the audit log to act on it.
 */
export async function requestLotEdit(
  lotId: number,
  body: PatchLotPayload,
): Promise<void> {
  await apiClient.post(`/api/lots/${lotId}/edit-request`, body);
}

export async function getLot(id: number): Promise<Lot> {
  const res = await apiClient.get<Lot>(`/api/lots/${id}`);
  return res.data;
}

export async function getAvailability(
  lotId: number,
  stageId: number,
): Promise<AvailabilityResponse> {
  const res = await apiClient.get<AvailabilityResponse>(
    `/api/lots/${lotId}/availability`,
    { params: { stageId } },
  );
  return res.data;
}
