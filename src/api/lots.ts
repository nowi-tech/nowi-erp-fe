import { apiClient } from './apiClient';
import type { AvailabilityResponse, Lot, SizeMatrix } from './types';

export interface ListLotsParams {
  search?: string;
  status?: string;
  vendorId?: string;
  /** Filter to lots assigned to a specific user (stitching slot). */
  assignedUserId?: number;
  /** Floor manager view: only unassigned (stitching) lots. */
  unassigned?: boolean;
  /** Stitching home: lots assigned to me (stitching slot). */
  assignedToMe?: boolean;
  /** Floor manager view: lots in finishing with no finisher assigned. */
  unassignedFinishing?: boolean;
  /** Finishing home: lots whose finishing slot is me. */
  assignedFinisherToMe?: boolean;
  take?: number;
  skip?: number;
}

export async function listLots(params: ListLotsParams = {}): Promise<Lot[]> {
  const res = await apiClient.get<Lot[] | { data: Lot[] }>('/api/lots', { params });
  return Array.isArray(res.data) ? res.data : res.data.data;
}

export type AssignSlot = 'stitching_master' | 'finishing_master';

export async function assignLot(
  lotId: number,
  userId: number,
  role: AssignSlot = 'stitching_master',
): Promise<Lot> {
  const res = await apiClient.post<Lot>(`/api/lots/${lotId}/assign`, {
    userId,
    role,
  });
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

export interface EditRequestRow {
  id: number;
  lotId: number;
  lot: {
    id: number;
    lotNo: string;
    vendorLotNo: string | null;
    createdAt: string;
    assignedUser?: { id: number; name: string } | null;
    style?: { styleId: string } | null;
    vendor?: { name: string } | null;
  } | null;
  requestedAt: string;
  requestedByUserId: number | null;
  requestedByName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  status: 'pending' | 'resolved';
}

export async function listEditRequests(): Promise<EditRequestRow[]> {
  const res = await apiClient.get<EditRequestRow[]>('/api/lots/edit-requests');
  return res.data;
}

export interface LotCounts {
  all: number;
  /** Pending stitching assignment (status=receiving + no stitching master). */
  pending: number;
  in_stitching: number;
  /** Pending finishing assignment (status=in_finishing + no finishing master). */
  pending_finishing: number;
  /** Active in finishing (assigned finisher present). */
  in_finishing: number;
  stuck: number;
  /** Age of the oldest active lot, in ms. null when there are none. */
  oldestActiveAgeMs: number | null;
}

export async function getLotCounts(): Promise<LotCounts> {
  const res = await apiClient.get<LotCounts>('/api/lots/counts');
  return res.data;
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
