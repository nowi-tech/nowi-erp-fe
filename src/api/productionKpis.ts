import { apiClient } from './apiClient';

// Types co-located with the caller (same convention as dashboard.ts). The
// production KPI surface is self-contained, so its contract lives next to it
// rather than in the generated types.ts.

/** One KPI card: a metric measured across the three reporting windows. */
export interface ProductionKpiCard {
  key: string;
  label: string;
  yesterday: number;
  last7Days: number;
  last30Days: number;
  /** Per-day values for the last 7 days (oldest → newest), for the sparkline. */
  spark: number[];
  /** ISO date (YYYY-MM-DD) for each spark point, aligned 1:1 with `spark`. */
  sparkDates: string[];
  /** Signed % change of yesterday vs the 7-day average. */
  trendPct: number;
  unit?: string;
}

export interface ProductionKpisResponse {
  cards: ProductionKpiCard[];
  generatedAt: string;
  /** Reference date the windows were computed against (YYYY-MM-DD). */
  asOf: string;
  /** False when the BE sheet isn't configured/readable (every value is 0). */
  isLive: boolean;
  /**
   * Status of the headline (`asOf`) day: 'working' (show the value), 'holiday'
   * (closed, value 0), or 'not_filled' (blank → show N/A).
   */
  headlineStatus?: 'working' | 'holiday' | 'not_filled';
}

/**
 * GET /api/production-kpis — the floor KPI cards from the Google Sheet.
 * `asOf` (YYYY-MM-DD) treats that date as "today" for the windows.
 */
export function getProductionKpis(asOf?: string): Promise<ProductionKpisResponse> {
  return apiClient
    .get<ProductionKpisResponse>('/api/production-kpis', {
      params: asOf ? { asOf } : undefined,
    })
    .then((res) => res.data);
}
