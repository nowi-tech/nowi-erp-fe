import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as productionKpis.ts).

export interface SellerTier {
  styles: number;
  units: number;
}

export interface Bestseller {
  styleKey: string;
  name: string | null;
  /** Units sold per day, summed over the style's sizes. */
  drr: number;
  stock: number;
  /** `out` = every size gone, `cut` = only some. */
  stockout: 'out' | 'cut' | null;
}

export interface InventoryKpisResponse {
  syncedAt: string | null;
  live: { units: number; india: number; china: number };
  best: SellerTier;
  avg: SellerTier;
  poor: SellerTier;
  bestsellerOut: number;
  bestsellerCut: number;
  bestsellers: Bestseller[];
}

/** GET /api/inventory-health/summary — the Inventory KPIs tiles. */
export function getInventoryKpis(): Promise<InventoryKpisResponse> {
  return apiClient.get<InventoryKpisResponse>('/api/inventory-health/summary').then((res) => res.data);
}
