import { apiClient } from './apiClient';
import type { DestinationWarehouse } from './types';

/** Parties with the warehouse role; read-only (changed by BE migration). Tolerates a `{ data }` envelope. */
export async function listDestinationWarehouses(): Promise<DestinationWarehouse[]> {
  const res = await apiClient.get<DestinationWarehouse[] | { data: DestinationWarehouse[] }>(
    '/api/destination-warehouses',
  );
  return Array.isArray(res.data) ? res.data : res.data.data;
}
