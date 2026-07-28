import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as production.ts).

export type DispatchStatus = 'sent' | 'received' | 'cancelled';

export interface DispatchItemRow {
  id: number;
  batchId: number | null;
  batchNo: string | null;
  /** Display name: the batch's style/SKU, or the off-system label. */
  name: string;
  brandName: string | null;
  sku: string;
  sizeLabel: string;
  qtySent: number;
  qtyReceived: number | null;
  mismatchFlagged: boolean;
}

export interface ProductionDispatch {
  id: number;
  challanNo: string;
  status: DispatchStatus;
  destWarehouseId: number;
  destWarehouseName: string;
  destWarehouseAddress: string | null;
  destWarehouseSpocName: string | null;
  destWarehouseSpocPhone: string | null;
  notes: string | null;
  dispatchedAt: string;
  dispatchedBy: { id: number; name: string } | null;
  receivedAt: string | null;
  receivedBy: { id: number; name: string } | null;
  qtySent: number;
  qtyReceived: number | null;
  hasMismatch: boolean;
  items: DispatchItemRow[];
}

export interface ListDispatchesResponse {
  rows: ProductionDispatch[];
  total: number;
  kpis: { awaiting: number; received: number };
}

export interface ListDispatchesParams {
  status?: DispatchStatus;
  search?: string;
  skip?: number;
  take?: number;
}

export function getDispatches(params: ListDispatchesParams = {}): Promise<ListDispatchesResponse> {
  const q: Record<string, string> = {};
  if (params.status) q.status = params.status;
  if (params.search) q.search = params.search;
  if (params.skip != null) q.skip = String(params.skip);
  if (params.take != null) q.take = String(params.take);
  return apiClient
    .get<ListDispatchesResponse>('/api/production/dispatches', { params: q })
    .then((r) => r.data);
}

export function getDispatch(id: number): Promise<ProductionDispatch> {
  return apiClient.get<ProductionDispatch>(`/api/production/dispatches/${id}`).then((r) => r.data);
}

/** One challan line. `batchId` present = from a completed batch; absent = off-system. */
export interface DispatchLineBody {
  batchId?: number;
  label?: string;
  brandId?: number;
  sku: string;
  size: string;
  qty: number;
}

export interface CreateDispatchBody {
  destWarehouseId: number;
  items: DispatchLineBody[];
  notes?: string;
}

export function createDispatch(body: CreateDispatchBody): Promise<ProductionDispatch> {
  return apiClient
    .post<ProductionDispatch>('/api/production/dispatches', body)
    .then((r) => r.data);
}

/** Void a mistaken challan (only while `sent`); restores any batch it flipped to dispatched. */
export function cancelDispatch(id: number, reason: string): Promise<ProductionDispatch> {
  return apiClient
    .post<ProductionDispatch>(`/api/production/dispatches/${id}/actions/cancel`, { reason })
    .then((r) => r.data);
}

/** Warehouse acceptance: received-per-line. */
export function acceptDispatch(
  id: number,
  items: { itemId: number; qtyReceived: number }[],
  notes?: string,
): Promise<ProductionDispatch> {
  return apiClient
    .post<ProductionDispatch>(`/api/production/dispatches/${id}/actions/accept`, { items, notes })
    .then((r) => r.data);
}
