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
  | 'draft'
  | 'sampling'
  | 'cataloguing'
  | 'live'
  | 'needs_attention';

/** Inclusive activity window (YYYY-MM-DD), by style updatedAt. */
export interface DashboardDateRange {
  from?: string;
  to?: string;
}

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
  /** EasyEcom catalog checkpoint (Done/Pending pill on the Cataloguing tab).
   *  `live` is derived (any channel listing live). */
  easyecomDone: boolean;
  live: boolean;
  /** Live marketplace listings (state=live) — channel + public URL, for the
   *  "View now" links. */
  liveListings: { channel: string; url: string | null }[];
  /** Prepared listings (state=draft) — channel + link, awaiting EasyEcom-done.
   *  Lets the "Add listings" dialog pre-seed a half-prepared cataloguing row. */
  preparedListings: { channel: string; url: string | null }[];
  /** Milestone dates for the context-aware date column (per tab). */
  createdAt: string;
  approvedAt: string | null;
  sampleApprovedAt: string | null;
  wentLiveAt: string | null;
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
  inCataloguing: number;
  live: number;
}

export interface DashboardStylesParams {
  tab?: DashboardStyleTab;
  search?: string;
  skip?: number;
  take?: number;
  from?: string;
  to?: string;
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

/** Role-aware counts for the 4 Home summary cards, scoped to an optional
 *  activity window (by style updatedAt) so the date control narrows them. */
export async function getDashboardCards(
  range: DashboardDateRange = {},
): Promise<DashboardCards> {
  const res = await apiClient.get<DashboardCards>('/api/dashboard/cards', {
    params: range,
  });
  return res.data;
}
