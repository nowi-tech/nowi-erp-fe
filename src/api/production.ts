import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as inventoryHealth.ts).

/** Why the batch exists. Decides whether `suggestedQty` means anything. */
export type BatchOrigin = 'forecast' | 'style';

/**
 * Ordered production pipeline. `completed` is reachable ONLY through
 * `completeBatch` (the sole place per-size produced quantities are captured),
 * and `cancelled` only through `cancelBatch`. Everything else is a free move
 * in either direction.
 */
export type BatchStatus =
  | 'cutting'
  | 'stitching'
  | 'finishing'
  | 'completed'
  | 'dispatched'
  | 'cancelled';

/** The stages the inline dropdown offers — mirrors BE `ADVANCEABLE_STATUSES`. */
export const ADVANCEABLE_STATUSES: BatchStatus[] = [
  'cutting',
  'stitching',
  'finishing',
  'dispatched',
];

/** Stepper order for display. `cancelled` is an off-ramp, not a step. */
export const BATCH_STAGE_ORDER: BatchStatus[] = [
  'cutting',
  'stitching',
  'finishing',
  'completed',
  'dispatched',
];

export interface BatchSizeLine {
  sku: string;
  size: string;
  qtyPlanned: number;
  /** null = no forecast existed (style-origin), NOT "forecast said zero". */
  suggestedQty: number | null;
  qtyProduced: number | null;
}

export interface ProductionBatch {
  id: number;
  batchNo: string;
  origin: BatchOrigin;
  status: BatchStatus;
  styleKey: string | null;
  styleId: number | null;
  /** ERP Style # when linked, else the EasyEcom style key. */
  styleRef: string | null;
  name: string | null;
  imageUrl: string | null;
  sizes: BatchSizeLine[];
  qtyPlanned: number;
  /** null on style-origin batches — render "—", never 0. */
  qtySuggested: number | null;
  qtyProduced: number | null;
  statusChangedAt: string;
  /** Whole days sat in the current status — amber past 7. */
  daysInStatus: number;
  startedAt: string;
  completedAt: string | null;
  dispatchedAt: string | null;
  createdBy: { id: number; name: string } | null;
  notes: string | null;
  shortfallReason: string | null;
  cancelReason: string | null;
}

export interface ProductionKpis {
  openBatches: number;
  unitsInPipeline: number;
  /** Renders as the card sub-line "940 forecast · 344 style". */
  unitsByOrigin: { forecast: number; style: number };
  completedThisWeek: number;
  avgBatchAgeDays: number | null;
}

export interface ListBatchesResponse {
  rows: ProductionBatch[];
  total: number;
  kpis: ProductionKpis;
}

/** Board tabs. `to_start` is served by GET /inventory-health — no rows yet. */
export type ProductionTab = 'in_production' | 'completed';

export interface ListBatchesParams {
  tab?: ProductionTab;
  status?: BatchStatus;
  origin?: BatchOrigin;
  search?: string;
  skip?: number;
  take?: number;
}

export function getBatches(params: ListBatchesParams = {}): Promise<ListBatchesResponse> {
  const q: Record<string, string> = {};
  if (params.tab) q.tab = params.tab;
  if (params.status) q.status = params.status;
  if (params.origin) q.origin = params.origin;
  if (params.search) q.search = params.search;
  if (params.skip != null) q.skip = String(params.skip);
  if (params.take != null) q.take = String(params.take);
  return apiClient.get<ListBatchesResponse>('/api/production/batches', { params: q }).then((r) => r.data);
}

export interface StyleSizes {
  styleId: number;
  styleRef: string | null;
  name: string | null;
  imageUrl: string | null;
  sizes: { sku: string; size: string }[];
}

/** Seeds the start dialog when production is started from the dashboard live
 *  tab — a style-origin batch has no forecast, so no suggested quantities. */
export function getStyleSizes(styleId: number): Promise<StyleSizes> {
  return apiClient.get<StyleSizes>(`/api/production/style-sizes/${styleId}`).then((r) => r.data);
}

export interface CreateBatchItem {
  sku: string;
  size: string;
  qtyPlanned: number;
  /** OMIT on a style-origin batch — absent means "no forecast existed". */
  suggestedQty?: number;
}

export interface CreateBatchBody {
  origin: BatchOrigin;
  styleKey?: string;
  styleId?: number;
  notes?: string;
  items: CreateBatchItem[];
}

export function createBatch(body: CreateBatchBody): Promise<ProductionBatch> {
  return apiClient.post<ProductionBatch>('/api/production/batches', body).then((r) => r.data);
}

/** Sending `items` REPLACES the size lines wholesale. */
export function updateBatch(
  id: number,
  body: { items?: CreateBatchItem[]; notes?: string },
): Promise<ProductionBatch> {
  return apiClient.patch<ProductionBatch>(`/api/production/batches/${id}`, body).then((r) => r.data);
}

export function advanceBatch(id: number, status: BatchStatus): Promise<ProductionBatch> {
  return apiClient
    .post<ProductionBatch>(`/api/production/batches/${id}/actions/advance`, { status })
    .then((r) => r.data);
}

export function completeBatch(
  id: number,
  items: { sku: string; qtyProduced: number }[],
  shortfallReason?: string,
): Promise<ProductionBatch> {
  return apiClient
    .post<ProductionBatch>(`/api/production/batches/${id}/actions/complete`, { items, shortfallReason })
    .then((r) => r.data);
}

export function cancelBatch(id: number, reason: string): Promise<ProductionBatch> {
  return apiClient
    .post<ProductionBatch>(`/api/production/batches/${id}/actions/cancel`, { reason })
    .then((r) => r.data);
}
