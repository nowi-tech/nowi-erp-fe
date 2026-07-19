import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as salesKpis.ts).

/** 4 tiers only. `needsAction` = out + critical. */
export type Urgency = 'out' | 'critical' | 'watch' | 'healthy';

/** One flat SKU row — each size its own row, carrying its style's display meta
 *  so the list is ungrouped with the product image on every row. */
export interface InventorySkuRow {
  styleKey: string;
  name: string | null;
  /** Signed URL or GCS object path or null (the style's image, shown per row). */
  imageUrl: string | null;
  linkedStyleId: number | null;
  /** Real ERP listing URLs — one clickable channel chip each (usually empty). */
  marketplaceLinks: { channel: string; url: string }[];
  /** Tiny seller — de-emphasised in the list (shown, not hidden). */
  lowVolume: boolean;
  /** Manually marked discontinued — still shown, but forced to the bottom. */
  discontinued: boolean;
  size: string;
  sku: string;
  urgency: Urgency;
  /** Days of cover left at the current DRR; null when DRR is 0/unknown. */
  coverDays: number | null;
  /** Daily run rate — units sold per day. */
  drr: number;
  /** 'low' = too little sales history to trust the DRR/cover. */
  confidence: 'high' | 'low';
  currentStock: number;
  /** Suggested units to make to restore healthy cover. */
  makeQty: number;
  /** Unmet demand per day once below target cover (units/day) — "stock at risk
   *  per day". No rupees. */
  atRiskUnitsPerDay: number;
  /** Raw daily units over the response window (aligned to response `trendDates`).
   *  Drives the per-row interactive trend sparkline. */
  trend: number[];
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
  /** Day keys (YYYY-MM-DD) the per-row `trend` arrays align to. */
  trendDates: string[];
  /** One page of flat SKU rows (server-side filtered/searched/sorted/sliced). */
  rows: InventorySkuRow[];
}

/** Real/virtual inventory view: virtual = has China-warehouse stock. */
export type InventoryView = 'all' | 'real' | 'virtual';

export interface InventoryHealthParams {
  /** LOCAL YYYY-MM-DD window; both or neither. Omit for the precomputed view. */
  from?: string;
  to?: string;
  skip?: number;
  limit?: number;
  filter?: string;
  inventory?: InventoryView;
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
  if (params.inventory && params.inventory !== 'all') q.inventory = params.inventory;
  if (params.search) q.search = params.search;
  if (params.sortKey) q.sortKey = params.sortKey;
  if (params.sortDir) q.sortDir = params.sortDir;
  return apiClient.get<InventoryHealthResponse>('/api/inventory-health', { params: q }).then((r) => r.data);
}

/** Mark / unmark a product (by styleKey) discontinued — sinks it to the bottom. */
export function setStyleDiscontinued(styleKey: string, discontinued: boolean): Promise<void> {
  return apiClient.post('/api/inventory-health/discontinued', { styleKey, discontinued }).then(() => undefined);
}
