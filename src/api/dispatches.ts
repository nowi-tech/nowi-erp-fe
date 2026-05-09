import { apiClient } from './apiClient';
import { FeatureUnavailableError, is404 } from './_errors';
import type {
  CreateDispatchPayload,
  Dispatch,
  DispatchDetail,
  EditDispatchItemPayload,
  ListDispatchesParams,
  ListDispatchesResponse,
} from './types';

function normalizeList(
  data: ListDispatchesResponse | Dispatch[] | { data: Dispatch[] },
): ListDispatchesResponse {
  if (Array.isArray(data)) {
    return { rows: data, page: { skip: 0, take: data.length, total: data.length } };
  }
  if ('rows' in data) return data;
  const arr = (data as { data: Dispatch[] }).data ?? [];
  return { rows: arr, page: { skip: 0, take: arr.length, total: arr.length } };
}

export async function listDispatches(
  params: ListDispatchesParams = {},
): Promise<ListDispatchesResponse> {
  try {
    const res = await apiClient.get<
      ListDispatchesResponse | Dispatch[] | { data: Dispatch[] }
    >('/api/dispatches', { params });
    return normalizeList(res.data);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function getDispatch(id: string): Promise<DispatchDetail> {
  try {
    const res = await apiClient.get<DispatchDetail>(
      `/api/dispatches/${encodeURIComponent(id)}`,
    );
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function createDispatch(
  payload: CreateDispatchPayload,
): Promise<DispatchDetail> {
  try {
    const res = await apiClient.post<DispatchDetail>('/api/dispatches', payload);
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function retrySync(id: string): Promise<DispatchDetail> {
  try {
    const res = await apiClient.post<DispatchDetail>(
      `/api/dispatches/${encodeURIComponent(id)}/retry-sync`,
    );
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export async function editItemQty(
  dispatchId: string,
  itemId: string,
  payload: EditDispatchItemPayload,
): Promise<DispatchDetail> {
  try {
    const res = await apiClient.patch<DispatchDetail>(
      `/api/dispatches/${encodeURIComponent(dispatchId)}/items/${encodeURIComponent(itemId)}/edit-qty`,
      payload,
    );
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
