import { apiClient } from './apiClient';
import type { AvailabilityResponse, Lot } from './types';

export interface ListLotsParams {
  search?: string;
  status?: string;
  vendorId?: string;
}

export async function listLots(params: ListLotsParams = {}): Promise<Lot[]> {
  const res = await apiClient.get<Lot[] | { data: Lot[] }>('/api/lots', { params });
  return Array.isArray(res.data) ? res.data : res.data.data;
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
