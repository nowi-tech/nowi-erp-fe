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
  thisMonth: number;
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
   * ISO date (YYYY-MM-DD) of the latest WORKING day — the day the headline
   * (`card.yesterday`) figure is from, holidays skipped. Null when there's no
   * working day in range. Rendered as the first column's label.
   */
  latestWorkingDate?: string | null;
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
