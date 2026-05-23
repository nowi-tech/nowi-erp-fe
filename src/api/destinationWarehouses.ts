import { apiClient } from './apiClient';
import type {
  CreateDestinationWarehousePayload,
  DestinationWarehouse,
  UpdateDestinationWarehousePayload,
} from './types';

/**
 * Destination warehouses are the *receiving* end of a dispatch — and on
 * EasyEcom-enabled rows, the receiving end of the GRN webhook. Only
 * admin and data_manager can create/update; viewer reads. The BE list
 * may return either a bare array or a `{ data: [] }` envelope (the
 * project's tolerance pattern, mirrored from `vendors.ts`).
 */
export async function listDestinationWarehouses(): Promise<DestinationWarehouse[]> {
  const res = await apiClient.get<
    DestinationWarehouse[] | { data: DestinationWarehouse[] }
  >('/api/destination-warehouses');
  return Array.isArray(res.data) ? res.data : res.data.data;
}

export async function createDestinationWarehouse(
  payload: CreateDestinationWarehousePayload,
): Promise<DestinationWarehouse> {
  const res = await apiClient.post<DestinationWarehouse>(
    '/api/destination-warehouses',
    payload,
  );
  return res.data;
}

export async function updateDestinationWarehouse(
  id: number,
  payload: UpdateDestinationWarehousePayload,
): Promise<DestinationWarehouse> {
  const res = await apiClient.patch<DestinationWarehouse>(
    `/api/destination-warehouses/${id}`,
    payload,
  );
  return res.data;
}

/** Soft-delete on the BE; flips `isActive` to false. */
export async function disableDestinationWarehouse(
  id: number,
): Promise<DestinationWarehouse> {
  const res = await apiClient.delete<DestinationWarehouse>(
    `/api/destination-warehouses/${id}`,
  );
  return res.data;
}
