import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as productionKpis.ts).

export type SalesBucket = 'sales' | 'fulfilment';
export type SalesFormat = 'currency' | 'number' | 'percent';
/** `snapshot` metrics (e.g. Total Design Live) show a single current value. */
export type SalesKind = 'flow' | 'ratio' | 'snapshot';

/** One metric row, measured across the four reporting windows. A `null` window
 *  is "N/A" (the source isn't wired yet) — distinct from a real 0. */
export interface SalesMetric {
  key: string;
  label: string;
  /** Plain-English "exactly what this means" — shown in the card's ⓘ tooltip. */
  description?: string;
  bucket: SalesBucket;
  format: SalesFormat;
  kind: SalesKind;
  /** False = no data source wired yet — the FE hides the card and lists it below. */
  available: boolean;
  today: number | null;
  yesterday: number | null;
  last7Days: number | null;
  last30Days: number | null;
  /** Per-day values for the 7 days ending on the reference day (oldest → newest). */
  spark: number[];
  /** ISO date (YYYY-MM-DD) for each spark point, 1:1 with `spark`. */
  sparkDates: string[];
  /** Signed % change of Today vs the 7-day mean. */
  trendPct: number;
}

export interface SalesBucketInfo {
  key: SalesBucket;
  label: string;
}

export interface SalesKpisResponse {
  buckets: SalesBucketInfo[];
  metrics: SalesMetric[];
  generatedAt: string;
  /** Reference date the windows anchor on (YYYY-MM-DD, IST). */
  asOf: string;
  /** True when the anchored day holds imported sales data. */
  isLive: boolean;
  /** ISO timestamp of the upload that last rebuilt these days. */
  lastSyncedAt?: string | null;
  /** Last uploaded order day — what the dashboard is "as of". */
  dataThrough?: string | null;
  /** True when an upload looks missed. */
  stale?: boolean;
  /** Earliest day (YYYY-MM-DD) that has Real/Virtual data. Older history is
   *  whole-account only, so the As-of picker floors here in a scoped view. */
  splitFrom?: string | null;
}

/** Real = shipped from the India warehouse, virtual = from China; an order with items from both counts in each. */
export type SalesInventoryView = 'all' | 'real' | 'virtual';

/** GET /api/sales-kpis — the bucketed dashboard metrics. */
export function getSalesKpis(
  asOf?: string,
  inventory: SalesInventoryView = 'all',
): Promise<SalesKpisResponse> {
  const params: Record<string, string> = {};
  if (asOf) params.asOf = asOf;
  if (inventory !== 'all') params.inventory = inventory;
  return apiClient
    .get<SalesKpisResponse>('/api/sales-kpis', { params })
    .then((res) => res.data);
}

export interface CancellationReason {
  reason: string;
  orders: number;
  ourFault: boolean;
}

export interface CancellationBreakdown {
  from: string;
  to: string;
  /** Per-reason counts can sum past totalOrders — one order can be cancelled for two reasons. */
  reasons: CancellationReason[];
  totalOrders: number;
  ourFaultOrders: number;
}

/** GET /api/sales-kpis/cancellations — why orders were cancelled over the 30 days ending at asOf. */
export function getCancellations(
  asOf?: string,
  inventory: SalesInventoryView = 'all',
): Promise<CancellationBreakdown> {
  const params: Record<string, string> = {};
  if (asOf) params.asOf = asOf;
  if (inventory !== 'all') params.inventory = inventory;
  return apiClient
    .get<CancellationBreakdown>('/api/sales-kpis/cancellations', { params })
    .then((res) => res.data);
}

export interface SalesUploadResult {
  linesImported: number;
  /** Lines left as they were because an earlier upload came from a newer report. */
  linesKeptNewer: number;
  rowsSkipped: number;
  fromDay: string;
  toDay: string;
  daysRebuilt: number;
  /** Lines from a warehouse not mapped to Real or Virtual; they count under All only. */
  unmappedLines: number;
  unmappedWarehouses: string[];
}

/** POST /api/sales-kpis/upload — the dashboard is rebuilt before this resolves. */
export function uploadSalesCsv(csv: string): Promise<SalesUploadResult> {
  return apiClient
    .post<SalesUploadResult>('/api/sales-kpis/upload', csv, {
      headers: { 'Content-Type': 'text/csv' },
    })
    .then((res) => res.data);
}

/** POST /api/sales-kpis/refresh-all — refreshes Inventory Health from EasyEcom in the background. */
export function refreshAllEasyEcom(): Promise<{ syncing: boolean }> {
  return apiClient
    .post<{ syncing: boolean }>('/api/sales-kpis/refresh-all', {})
    .then((res) => res.data);
}
