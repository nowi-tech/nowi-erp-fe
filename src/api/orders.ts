import { apiClient } from './apiClient';
import type { Order } from './types';

export interface ListOrdersParams {
  status?: string;
}

export async function listOrders(params: ListOrdersParams = {}): Promise<Order[]> {
  const res = await apiClient.get<Order[] | { data: Order[] }>('/api/orders', { params });
  return Array.isArray(res.data) ? res.data : res.data.data;
}
