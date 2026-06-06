// Client for the fabric receipt-challan endpoints (`/api/fabric-challans`).
// A challan groups several fabric lines from one physical supplier slip;
// recording it writes a positive `receipt` to each fabric's stock ledger.

import { apiClient } from './apiClient';
import type { FabricChallan, CreateFabricChallanInput } from './types';

export async function listFabricChallans(): Promise<FabricChallan[]> {
  const res = await apiClient.get<FabricChallan[]>('/api/fabric-challans');
  return res.data;
}

export async function getFabricChallan(id: number): Promise<FabricChallan> {
  const res = await apiClient.get<FabricChallan>(`/api/fabric-challans/${id}`);
  return res.data;
}

/** Record a challan: header + N receipt lines, in one transaction. */
export async function createFabricChallan(
  body: CreateFabricChallanInput,
): Promise<FabricChallan> {
  const res = await apiClient.post<FabricChallan>('/api/fabric-challans', body);
  return res.data;
}
