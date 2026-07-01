import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as productionKpis.ts).

export type SalesBucket = 'sales' | 'live' | 'inventory' | 'fulfilment';
export type SalesFormat = 'currency' | 'number' | 'percent';
/** `snapshot` metrics (e.g. Total Design Live) show a single current value. */
export type SalesKind = 'flow' | 'ratio' | 'snapshot';

/** One metric row, measured across the four reporting windows. A `null` window
 *  is "N/A" (the source isn't wired yet) — distinct from a real 0. */
export interface SalesMetric {
  key: string;
  label: string;
  bucket: SalesBucket;
  format: SalesFormat;
  kind: SalesKind;
  /** False = no data source wired yet — the FE hides the card and lists it below. */
  available: boolean;
  today: number | null;
  yesterday: number | null;
  last7Days: number | null;
  thisMonth: number | null;
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
  /** True when the latest synced day pulled EasyEcom sales successfully. */
  isLive: boolean;
  /** ISO timestamp of the most recent sync covering the window. */
  lastSyncedAt?: string | null;
  /** True when the latest sync served STALE (cached) data — the live fetch failed. */
  stale?: boolean;
}

/** GET /api/sales-kpis — the bucketed dashboard metrics. */
export function getSalesKpis(asOf?: string): Promise<SalesKpisResponse> {
  return apiClient
    .get<SalesKpisResponse>('/api/sales-kpis', { params: asOf ? { asOf } : undefined })
    .then((res) => res.data);
}

/** POST /api/sales-kpis/refresh — force an EasyEcom resync, then return fresh
 *  metrics. May take ~10–60s while the report is generated. */
export function refreshSalesKpis(asOf?: string): Promise<SalesKpisResponse> {
  // Body is `{}`, not `null`: the API client forces `Content-Type: application/json`
  // and Express's body-parser (strict mode) rejects a top-level `null`.
  return apiClient
    .post<SalesKpisResponse>('/api/sales-kpis/refresh', {}, {
      params: asOf ? { asOf } : undefined,
    })
    .then((res) => res.data);
}
