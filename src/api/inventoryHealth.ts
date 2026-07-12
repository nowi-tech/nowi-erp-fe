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
  name: string;
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
  kpis: InventoryKpis;
  styles: InventoryStyle[];
}

/** GET /api/inventory-health — per-size stockout forecast grouped by style.
 *  Optional `from`/`to` (LOCAL YYYY-MM-DD) scope the DRR/cover/sold window;
 *  omit both for the precomputed default view. */
export function getInventoryHealth(from?: string, to?: string): Promise<InventoryHealthResponse> {
  const params = from && to ? { from, to } : undefined;
  return apiClient.get<InventoryHealthResponse>('/api/inventory-health', { params }).then((r) => r.data);
}

/** POST /api/inventory-health/refresh — kicks off a background recompute and
 *  returns immediately. Poll {@link getInventoryHealth} until `syncing` clears. */
export function refreshInventoryHealth(): Promise<{ syncing: boolean }> {
  // Body `{}` not null — apiClient forces application/json (see salesKpis.ts).
  return apiClient
    .post<{ syncing: boolean }>('/api/inventory-health/refresh', {})
    .then((r) => r.data);
}
