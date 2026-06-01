import { apiClient } from './apiClient';
import { FeatureUnavailableError, is404 } from './_errors';
import type {
  CycleTimeResponse,
  ReworkRateResponse,
  StyleLifecycle,
  StyleSource,
  ThroughputResponse,
} from './types';

// ── Unified Home feed (PD module) ──────────────────────────────────────
// Types co-located here (not in types.ts) on purpose. The Home surface is
// self-contained and this keeps the one-feed contract next to its caller.

/** Tab buckets for the Home "Styles in flight" table. */
export type DashboardStyleTab =
  | 'all'
  | 'sampling'
  | 'in_production'
  | 'live'
  | 'needs_attention';

/** One row of the per-style Home feed. PD styles have no lots, so progress
 * is the coarse lifecycle + manual sampling/production status — never X/Y. */
export interface DashboardStyleRow {
  id: number;
  styleId: string | null;
  draftNo: number | null;
  /** styleId ?? `D-${draftNo}` ?? `#${id}` — the label the row links on. */
  styleRef: string;
  workingName: string | null;
  primaryColour: string | null;
  thumbnail: string | null;
  source: StyleSource;
  lifecycle: StyleLifecycle;
  /** Raw enum value (coarse) — meaningful while in_sampling. */
  samplingStatus: string | null;
  /** Raw enum value (coarse) — meaningful while in_pd. */
  productionStatus: string | null;
  factory: { id: number; name: string } | null;
  colourVariantCount: number;
  updatedAt: string;
}

export interface DashboardStylesResult {
  rows: DashboardStyleRow[];
  page: { skip: number; take: number; total: number };
}

/** Role-aware counts for the 4 Home summary cards. */
export interface DashboardCards {
  isApprover: boolean;
  pendingApprovals: number;
  mySamplingWork: number;
  inSampling: number;
  inProduction: number;
  live: number;
}

export interface DashboardStylesParams {
  tab?: DashboardStyleTab;
  search?: string;
  skip?: number;
  take?: number;
}

async function getOne<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.get<T>(path, { params });
    return res.data;
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}

export function getThroughput(days: 7 | 30 = 7): Promise<ThroughputResponse> {
  return getOne<ThroughputResponse>('/api/dashboard/throughput', { days });
}

export function getReworkRate(days = 30): Promise<ReworkRateResponse> {
  return getOne<ReworkRateResponse>('/api/dashboard/rework-rate', { days });
}

export function getCycleTime(days = 30): Promise<CycleTimeResponse> {
  return getOne<CycleTimeResponse>('/api/dashboard/cycle-time', { days });
}

/** Home "Styles in flight" feed — PD styles only, per-style, coarse stage. */
export async function getDashboardStyles(
  params: DashboardStylesParams = {},
): Promise<DashboardStylesResult> {
  const res = await apiClient.get<DashboardStylesResult>(
    '/api/dashboard/styles',
    { params },
  );
  return res.data;
}

/** Role-aware counts for the 4 Home summary cards. */
export async function getDashboardCards(): Promise<DashboardCards> {
  const res = await apiClient.get<DashboardCards>('/api/dashboard/cards');
  return res.data;
}
