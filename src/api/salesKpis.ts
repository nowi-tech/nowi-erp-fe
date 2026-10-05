import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as productionKpis.ts).

export type SalesBucket = 'sales' | 'fulfilment';
export type SalesFormat = 'currency' | 'number' | 'percent';
/** `snapshot` metrics (e.g. Total Design Live) show a single current value. */
export type SalesKind = 'flow' | 'ratio' | 'snapshot';

/** One metric row, measured over the picked range. `null` is "N/A" — distinct from a real 0. */
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
  value: number | null;
  /** Same number of days just before the range. */
  previous: number | null;
  /** Per-day values for the 7 days ending on the last uploaded day within the range, oldest → newest. */
  spark: number[];
  /** ISO date (YYYY-MM-DD) for each spark point, 1:1 with `spark`. */
  sparkDates: string[];
  /** Signed % change of `value` vs `previous`; null when there is nothing to compare. */
  trendPct: number | null;
}

export interface SalesBucketInfo {
  key: SalesBucket;
  label: string;
}

export interface SalesKpisResponse {
  buckets: SalesBucketInfo[];
  metrics: SalesMetric[];
  generatedAt: string;
  /** Range actually measured (YYYY-MM-DD, IST); `from` is pulled up to the first day with data. */
  from: string;
  to: string;
  /** True when the range holds imported sales data. */
  isLive: boolean;
  /** ISO timestamp of the upload that last rebuilt these days. */
  lastSyncedAt?: string | null;
  /** Last uploaded order day. */
  dataThrough?: string | null;
  /** True when an upload looks missed. */
  stale?: boolean;
  /** Earliest day (YYYY-MM-DD) that has Real/Virtual data. Older history is
   *  whole-account only, so a scoped view starts its range no earlier than this. */
  splitFrom?: string | null;
}

/** Real = shipped from the India warehouse, virtual = from China; an order with items from both counts in each. */
export type SalesInventoryView = 'all' | 'real' | 'virtual';

function rangeParams(from: string, to: string, inventory: SalesInventoryView = 'all'): Record<string, string> {
  return inventory === 'all' ? { from, to } : { from, to, inventory };
}

/** GET /api/sales-kpis — the bucketed dashboard metrics over [from, to]. */
export function getSalesKpis(
  from: string,
  to: string,
  inventory: SalesInventoryView = 'all',
): Promise<SalesKpisResponse> {
  return apiClient
    .get<SalesKpisResponse>('/api/sales-kpis', { params: rangeParams(from, to, inventory) })
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

/** GET /api/sales-kpis/cancellations — why orders were cancelled over [from, to]. */
export function getCancellations(
  from: string,
  to: string,
  inventory: SalesInventoryView = 'all',
): Promise<CancellationBreakdown> {
  return apiClient
    .get<CancellationBreakdown>('/api/sales-kpis/cancellations', { params: rangeParams(from, to, inventory) })
    .then((res) => res.data);
}

export interface TopStyle {
  styleKey: string;
  styleName: string | null;
  colour: string | null;
  units: number;
  revenue: number;
  /** GCS path or absolute URL; resolve with useSignedUrls. */
  imageUrl: string | null;
  myntraUrl: string | null;
  /** The style has a row on the Inventory Health page. */
  inInventoryHealth: boolean;
}

/** One design: an ERP colour family, or a lone style. */
export interface TopItem {
  key: string;
  name: string | null;
  units: number;
  revenue: number;
  /** Colours that sold in the range, best first. */
  styles: TopStyle[];
}

export interface TopItems {
  from: string;
  to: string;
  items: TopItem[];
}

/** GET /api/sales-kpis/top-items — top 10 designs by revenue over [from, to]. */
export function getTopItems(from: string, to: string, inventory: SalesInventoryView = 'all'): Promise<TopItems> {
  return apiClient
    .get<TopItems>('/api/sales-kpis/top-items', { params: rangeParams(from, to, inventory) })
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

/** One summary row, given for each view. */
export interface SummaryRow {
  key: string;
  label: string;
  format: 'number' | 'currency' | 'percent';
  /** Which page's section carries the row. */
  bucket: SalesBucket;
  /** real = India, virtual = China, all = both. */
  real: number | null;
  virtual: number | null;
  all: number | null;
}

export interface SalesSummary {
  from: string;
  to: string;
  rows: SummaryRow[];
}

/** GET /api/sales-kpis/summary — the detail rows over [from, to], each tagged with its page's bucket. */
export function getSalesSummary(from: string, to: string): Promise<SalesSummary> {
  return apiClient
    .get<SalesSummary>('/api/sales-kpis/summary', { params: rangeParams(from, to) })
    .then((res) => res.data);
}
