import { apiClient } from './apiClient';
import type { CreateBatchBody } from './production';

export type AlterationStatus = 'received' | 'in_alteration' | 'on_hold' | 'completed' | 'cancelled';
export type AlterationSource = 'customer_return' | 'rto' | 'warehouse' | 'production' | 'other';
export type AlterationChannel = 'myntra' | 'flipkart' | 'shopify' | 'wishlink';

export const ALTERATION_SOURCES: AlterationSource[] = [
  'customer_return',
  'rto',
  'warehouse',
  'production',
  'other',
];
export const ALTERATION_CHANNELS: AlterationChannel[] = ['myntra', 'flipkart', 'shopify', 'wishlink'];
/** Sources that come back through a marketplace — the only ones offered a channel. */
export const CHANNEL_SOURCES: AlterationSource[] = ['customer_return', 'rto'];

export interface AlterationEntry {
  id: number;
  entryNo: string;
  status: AlterationStatus;
  source: AlterationSource;
  channel: AlterationChannel | null;
  sourceRef: string | null;
  styleKey: string | null;
  styleId: number | null;
  brandName: string | null;
  externalSku: string | null;
  colourName: string | null;
  colourHex: string | null;
  styleRef: string | null;
  name: string | null;
  imageUrl: string | null;
  sizes: { sku: string; size: string; qtyIn: number; qtyOut: number | null; qtyScrapped: number | null }[];
  qtyIn: number;
  qtyOut: number | null;
  qtyScrapped: number | null;
  /** Why pieces were scrapped or missing at completion. */
  closeReason: string | null;
  receivedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdBy: { id: number; name: string } | null;
  tailorId: number | null;
  tailorName: string | null;
  holdReason: string | null;
  heldAt: string | null;
  /** Where Resume puts it back; set only while on hold. */
  heldFromStatus: AlterationStatus | null;
}

export interface ListAlterationResponse {
  rows: AlterationEntry[];
  total: number;
  counts: Record<AlterationStatus, number>;
}

export interface AlterationSourceFields {
  source: AlterationSource;
  channel?: AlterationChannel;
  sourceRef?: string;
}

export function listAlteration(params: {
  status?: AlterationStatus;
  source?: AlterationSource;
  channel?: AlterationChannel;
  search?: string;
  skip?: number;
  take?: number;
}): Promise<ListAlterationResponse> {
  return apiClient.get<ListAlterationResponse>('/api/alteration', { params }).then((r) => r.data);
}

/** Takes the production intake's body as-is: same identity fields, qtyPlanned → qtyIn. */
export function createAlteration(
  intake: CreateBatchBody,
  source: AlterationSourceFields,
): Promise<AlterationEntry> {
  return apiClient
    .post<AlterationEntry>('/api/alteration', {
      ...source,
      styleKey: intake.styleKey,
      styleId: intake.styleId,
      brandId: intake.brandId,
      externalSku: intake.externalSku,
      colourId: intake.colourId,
      items: intake.items.map((i) => ({ sku: i.sku, size: i.size, qtyIn: i.qtyPlanned })),
    })
    .then((r) => r.data);
}

export function sendToAlteration(id: number, tailorId: number): Promise<AlterationEntry> {
  return apiClient
    .post<AlterationEntry>(`/api/alteration/${id}/send`, { tailorId })
    .then((r) => r.data);
}

export function holdAlteration(id: number, holdReason: string): Promise<AlterationEntry> {
  return apiClient
    .post<AlterationEntry>(`/api/alteration/${id}/hold`, { holdReason })
    .then((r) => r.data);
}

export function resumeAlteration(id: number): Promise<AlterationEntry> {
  return apiClient.post<AlterationEntry>(`/api/alteration/${id}/resume`).then((r) => r.data);
}

export function completeAlteration(
  id: number,
  items: { sku: string; qtyOut: number; qtyScrapped: number }[],
  reason?: string,
): Promise<AlterationEntry> {
  return apiClient
    .post<AlterationEntry>(`/api/alteration/${id}/complete`, { items, reason })
    .then((r) => r.data);
}

export function cancelAlteration(id: number): Promise<AlterationEntry> {
  return apiClient.post<AlterationEntry>(`/api/alteration/${id}/cancel`).then((r) => r.data);
}

export interface AlterationTimelineEntry {
  id: number;
  at: string;
  by: string | null;
  /** null on the create step. */
  from: AlterationStatus | null;
  to: AlterationStatus;
  holdReason: string | null;
  qtyOut: number | null;
  qtyScrapped: number | null;
  reason: string | null;
}

export function getAlteration(
  id: number,
): Promise<{ entry: AlterationEntry; timeline: AlterationTimelineEntry[] }> {
  return apiClient.get(`/api/alteration/${id}`).then((r) => r.data);
}
