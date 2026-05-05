import { apiClient } from './apiClient';
import type { CreateInboundPayload, CreateInboundResponse } from './types';

export async function createInbound(
  payload: CreateInboundPayload,
): Promise<CreateInboundResponse> {
  const res = await apiClient.post<CreateInboundResponse>('/api/inbound', payload);
  return res.data;
}
