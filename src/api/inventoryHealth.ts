import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as salesKpis.ts).

/** 4 tiers only. `needsAction` = out + critical. */
export type Urgency = 'out' | 'critical' | 'watch' | 'healthy';

/** One size row of a style: its stockout forecast. */
export interface InventorySize {
  size: string;
  sku: string;
  urgency: Urgency;
  /** Days of cover left at the current DRR; null when DRR is 0/unknown. */
  coverDays: number | null;
  /** Daily run rate — units sold per day. */
  drr: number;
  /** Units sold in the trailing 2 / 7 / 30 days. */
  sold2d: number;
  sold7d: number;
  sold30d: number;
  /** 'low' = too little sales history to trust the DRR/cover. */
  confidence: 'high' | 'low';
  currentStock: number;
  /** In-production units. 0 for now — production data not yet connected. */
  pipelineQty: number;
  /** Suggested units to make to restore healthy cover. */
  makeQty: number;
  /** Demand this size can't fill (units/day) once it's below target cover. */
  atRiskUnitsPerDay: number;
  /** Revenue bleeding per day from that unmet demand (₹/day). */
  atRiskRevenuePerDay: number;
  /** Selling price per unit (₹). */
  avgPrice: number;
}

export interface InventoryStyle {
  styleKey: string;
  name: string | null;
  category: string;
  /** Signed URL or GCS object path or null. */
  imageUrl: string | null;
  linkedStyleId: number | null;
  /** Marketplace/listing SKUs (Myntra etc.) — also matched by the search box. */
  marketplaceIds: string[];
  /** Real ERP listing URLs — one clickable channel chip each (usually empty). */
  marketplaceLinks: { channel: string; url: string }[];
  worstUrgency: Urgency;
  makeTotal: number;
  /** Style-level at-risk rollup (sum over sizes). Drives the default ranking. */
  atRiskUnitsPerDay: number;
  atRiskRevenuePerDay: number;
  /** Revenue tier — A = the critical few, C = the long tail. */
  abcClass: 'A' | 'B' | 'C';
  /** Tiny seller — de-emphasised in the list (shown, not hidden). */
  lowVolume: boolean;
  sizes: InventorySize[];
}

export interface InventoryKpis {
  unitsToMake: number;
  needsAction: number;
  outOfStock: number;
  critical: number;
  watch: number;
  healthy: number;
  totalStyles: number;
  totalSkus: number;
}

export interface InventoryHealthResponse {
  /** ISO timestamp of the last sync, or null if never synced. */
  syncedAt: string | null;
  /** True while a background refresh is still running. Poll until false. */
  syncing: boolean;
  /** True when the last successful sync is older than a nightly cycle (~26h). */
  stale: boolean;
  kpis: InventoryKpis;
  /** Match count AFTER filter+search, BEFORE the page slice (drives scroll). */
  total: number;
  /** One page of styles (server-side filtered/searched/sorted/sliced). */
  styles: InventoryStyle[];
}

export interface InventoryHealthParams {
  /** LOCAL YYYY-MM-DD window; both or neither. Omit for the precomputed view. */
  from?: string;
  to?: string;
  skip?: number;
  limit?: number;
  filter?: string;
  search?: string;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
}

/** GET /api/inventory-health — one page of the per-size stockout forecast.
 *  The server filters/searches/sorts the full set and returns a page + total. */
export function getInventoryHealth(params: InventoryHealthParams = {}): Promise<InventoryHealthResponse> {
  const q: Record<string, string> = {};
  if (params.from) q.from = params.from;
  if (params.to) q.to = params.to;
  if (params.skip != null) q.skip = String(params.skip);
  if (params.limit != null) q.limit = String(params.limit);
  if (params.filter && params.filter !== 'all') q.filter = params.filter;
  if (params.search) q.search = params.search;
  if (params.sortKey) q.sortKey = params.sortKey;
  if (params.sortDir) q.sortDir = params.sortDir;
  return apiClient.get<InventoryHealthResponse>('/api/inventory-health', { params: q }).then((r) => r.data);
}

/** POST /api/inventory-health/refresh — kicks off a background recompute and
 *  returns immediately. Poll {@link getInventoryHealth} until `syncing` clears. */
export function refreshInventoryHealth(): Promise<{ syncing: boolean }> {
  // Body `{}` not null — apiClient forces application/json (see salesKpis.ts).
  return apiClient
    .post<{ syncing: boolean }>('/api/inventory-health/refresh', {})
    .then((r) => r.data);
}
