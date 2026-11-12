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

/** Give unused fabric back against an issue line. */
export async function returnFabric(
  entryId: number,
  body: { quantity: number; note?: string | null },
): Promise<FabricChallan> {
  const res = await apiClient.post<FabricChallan>(
    `/api/fabric-challans/entries/${entryId}/return`,
    body,
  );
  return res.data;
}

/** Send faulty fabric back to the vendor against a receipt line. */
export async function sendBackFabric(
  entryId: number,
  body: { quantity: number; reason: string },
): Promise<FabricChallan> {
  const res = await apiClient.post<FabricChallan>(
    `/api/fabric-challans/entries/${entryId}/send-back`,
    body,
  );
  return res.data;
}

/** Set a colour's stock to a physical count; clears "check stock" flags. */
export async function stockCheck(body: {
  fabricColourId: number;
  actualQuantity: number;
  reason: string;
}): Promise<FabricChallan> {
  const res = await apiClient.post<FabricChallan>('/api/fabric-challans/stock-check', body);
  return res.data;
}

/** The factory a lot's (or a colour's) fabric last went to. */
export async function getLastIssueVendor(by: {
  productionBatchId?: number;
  fabricColourId?: number;
}): Promise<{ vendorId: number | null }> {
  const res = await apiClient.get('/api/fabric-challans/last-issue', { params: by });
  return res.data;
}
