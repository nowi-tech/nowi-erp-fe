// Client for fabric orders (`/api/fabric-orders`) — fabric ordered from a
// vendor and not yet (fully) received. Receipts fill them via challan lines.

import { apiClient } from './apiClient';
import type { FabricOrder, FabricOrderInput, FabricOrderStatus } from './types';

export async function listFabricOrders(params: {
  open?: boolean;
  status?: FabricOrderStatus;
  fabricId?: number;
  fabricColourId?: number;
} = {}): Promise<FabricOrder[]> {
  const res = await apiClient.get<FabricOrder[]>('/api/fabric-orders', { params });
  return res.data;
}

export async function createFabricOrder(body: FabricOrderInput): Promise<FabricOrder> {
  const res = await apiClient.post<FabricOrder>('/api/fabric-orders', body);
  return res.data;
}

export async function updateFabricOrder(id: number, body: FabricOrderInput): Promise<FabricOrder> {
  const res = await apiClient.patch<FabricOrder>(`/api/fabric-orders/${id}`, body);
  return res.data;
}

/** Close short: accept what arrived; the vendor won't send the rest. */
export async function closeFabricOrder(id: number, note?: string): Promise<FabricOrder> {
  const res = await apiClient.post<FabricOrder>(`/api/fabric-orders/${id}/close`, { note });
  return res.data;
}

/** Prefill for a new order of a colour: last vendor, and days the last delivery took. */
export async function getFabricOrderDefaults(
  fabricColourId: number,
): Promise<{ vendorId: number | null; leadDays: number | null }> {
  const res = await apiClient.get('/api/fabric-orders/defaults', { params: { fabricColourId } });
  return res.data;
}

export interface FabricOrderChange {
  id: number;
  action: 'fabric_order_created' | 'fabric_order_updated' | string;
  actor: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  at: string;
}

/** Who changed one order and how, newest first. */
export async function getFabricOrderHistory(id: number): Promise<FabricOrderChange[]> {
  const res = await apiClient.get<FabricOrderChange[]>(`/api/fabric-orders/${id}/history`);
  return res.data;
}
