// Client for the Product Development module. Mirrors the §8 endpoint
// contracts from docs/PRODUCT_DEV_MODULE_PLAN.md. Use these types
// instead of the old `articles.ts` — that file was dropped along with
// the standalone Article entity (decision #14).

import { apiClient } from './apiClient';
import type {
  Style,
  StyleVariant,
  StyleInspection,
  StyleChannelListing,
  StyleSource,
  StyleLifecycle,
  ChannelName,
  ChannelState,
  InspectionVerdict,
  Gender,
  Collection,
  FabricType,
  Fabric,
} from './types';

// ── enum unions (mirror prisma/schema.prisma) ──────────────────────────
export type ArticleCategory =
  | 'winterwear'
  | 'womens_bottom_wear'
  | 'mens_bottom_wear'
  | 'womens_top_wear'
  | 'mens_top_wear'
  | 'mens_suit'
  | 'china_reverse';

export type SamplingStatus =
  | 'in_progress_pattern_dev'
  | 'in_progress_fabric_sourcing'
  | 'in_progress_cutting'
  | 'in_progress_stitching'
  | 'ready_for_inspection'
  | 'handed_over_for_inspection'
  | 'corrections_needed'
  | 'approved_for_production';

export type SampleApprovalStatus =
  | 'approved_for_production'
  | 'under_review_corrections'
  | 'pattern_correction_approved';

export type ProductionStatus =
  | 'sample_handover'
  | 'in_progress_cutting'
  | 'in_progress_stitching'
  | 'in_progress_finishing'
  | 'packing_dispatch'
  | 'warehouse_dispatch';

export type FitSession = 'yes' | 'pending' | 'no';
export type YesNo = 'yes' | 'no';
export type LiveStatus = 'live' | 'not_live';

export type StyleTab =
  | 'inbox'
  | 'in_sampling'
  | 'parked'
  | 'sample_approved'
  | 'all'
  | 'china_reverse'
  | 'in_pd';

export interface ListStylesParams {
  source?: StyleSource;
  tab?: StyleTab;
  collectionId?: number;
  samplingStatus?: SamplingStatus;
  patternMasterId?: number;
  search?: string;
  skip?: number;
  take?: number;
}

export interface StyleListResponse {
  data: Style[];
  total: number;
  skip: number;
  take: number;
}

export type CreateStyleRequest = Partial<
  Omit<
    Style,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'variants'
    | 'inspections'
    | 'channelListings'
    | 'category'
  >
> & {
  source: StyleSource;
  category: ArticleCategory;
};

export type UpdateStyleRequest = Partial<CreateStyleRequest>;

export interface Option {
  value: string;
  label: string;
}
export interface StyleOptions {
  category: Option[];
  samplingStatus: Option[];
  sampleApproval: Option[];
  productionStatus: Option[];
  modelFitSession: Option[];
  dxfApproved: Option[];
  websiteLive: Option[];
}

export interface StylesSummary {
  attention: {
    awaitingApproval1: number;
    awaitingApproval2: number;
    readyForQc: number;
    readyToDispatch: number;
  };
  kpi: {
    stylesDeveloped: number;
    approved: number;
    inProduction: number;
    live: number;
    virtualLive: number;
  };
}

export interface LinkExtractResult {
  ok: boolean;
  imageUrl?: string;
  title?: string;
  price?: number;
  currency?: string;
  source?: 'jsonld' | 'opengraph' | 'flipkart' | 'myntra';
  reason?: string;
}

// ─── Styles list/detail/CRUD ──────────────────────────────────────────
export async function listStyles(
  params: ListStylesParams = {},
): Promise<StyleListResponse> {
  const res = await apiClient.get<StyleListResponse>('/api/styles', { params });
  return res.data;
}

export async function getStyle(styleId: number | string): Promise<Style> {
  const res = await apiClient.get<Style>(`/api/styles/${styleId}`);
  return res.data;
}

export async function getStyleOptions(): Promise<StyleOptions> {
  const res = await apiClient.get<StyleOptions>('/api/styles/options');
  return res.data;
}

export async function getStylesSummary(): Promise<StylesSummary> {
  const res = await apiClient.get<StylesSummary>('/api/styles/summary');
  return res.data;
}

export async function createStyle(body: CreateStyleRequest): Promise<Style> {
  const res = await apiClient.post<Style>('/api/styles', body);
  return res.data;
}

export async function patchStyle(
  styleId: number,
  body: UpdateStyleRequest,
): Promise<Style> {
  const res = await apiClient.patch<Style>(`/api/styles/${styleId}`, body);
  return res.data;
}

/** Soft delete (archive). For destructive deletes use {@link hardDeleteStyle}. */
export async function archiveStyle(styleId: number): Promise<void> {
  await apiClient.post(`/api/styles/${styleId}/archive`);
}

/** Hard delete — requires `data_admin` on the BE. */
export async function hardDeleteStyle(styleId: number): Promise<void> {
  await apiClient.delete(`/api/styles/${styleId}`);
}

// ─── Style actions ────────────────────────────────────────────────────
export async function approveStyle(
  styleId: number,
  body: { note?: string } = {},
): Promise<Style> {
  const res = await apiClient.post<Style>(
    `/api/styles/${styleId}/actions/approve`,
    body,
  );
  return res.data;
}

export async function parkStyle(
  styleId: number,
  body: { reason: string },
): Promise<Style> {
  const res = await apiClient.post<Style>(
    `/api/styles/${styleId}/actions/park`,
    body,
  );
  return res.data;
}

export async function reviveStyle(styleId: number): Promise<Style> {
  const res = await apiClient.post<Style>(
    `/api/styles/${styleId}/actions/revive`,
  );
  return res.data;
}

export async function sampleApproveStyle(
  styleId: number,
  body: { note?: string } = {},
): Promise<Style> {
  const res = await apiClient.post<Style>(
    `/api/styles/${styleId}/actions/sample-approve`,
    body,
  );
  return res.data;
}

// ─── Variants ─────────────────────────────────────────────────────────
export async function addVariant(
  styleId: number,
  body: Partial<StyleVariant> & { colour: string },
): Promise<StyleVariant> {
  const res = await apiClient.post<StyleVariant>(
    `/api/styles/${styleId}/variants`,
    body,
  );
  return res.data;
}

export async function patchVariant(
  styleId: number,
  variantId: number,
  body: Partial<StyleVariant>,
): Promise<StyleVariant> {
  const res = await apiClient.patch<StyleVariant>(
    `/api/styles/${styleId}/variants/${variantId}`,
    body,
  );
  return res.data;
}

// ─── Inspections ──────────────────────────────────────────────────────
export async function addInspection(
  styleId: number,
  body: { remarks: string; verdict?: InspectionVerdict },
): Promise<StyleInspection> {
  const res = await apiClient.post<StyleInspection>(
    `/api/styles/${styleId}/inspections`,
    body,
  );
  return res.data;
}

export async function patchInspection(
  styleId: number,
  roundNo: number,
  body: Partial<StyleInspection>,
): Promise<StyleInspection> {
  const res = await apiClient.patch<StyleInspection>(
    `/api/styles/${styleId}/inspections/${roundNo}`,
    body,
  );
  return res.data;
}

// ─── Channel listings ─────────────────────────────────────────────────
export async function updateChannel(
  styleId: number,
  channel: ChannelName,
  body: Partial<StyleChannelListing>,
): Promise<StyleChannelListing> {
  const res = await apiClient.patch<StyleChannelListing>(
    `/api/styles/${styleId}/channels/${channel}`,
    body,
  );
  return res.data;
}

// ─── Link extraction ──────────────────────────────────────────────────
/** Best-effort — resolves even when extraction fails (ok:false). */
export async function extractLink(url: string): Promise<LinkExtractResult> {
  try {
    const res = await apiClient.post<LinkExtractResult>(
      '/api/styles/extract-link',
      { url },
    );
    return res.data;
  } catch {
    return {
      ok: false,
      reason: 'Could not reach the extractor — paste or upload the image.',
    };
  }
}

// ─── Master data (collections / fabrics / fabric types) ───────────────
export async function listCollections(): Promise<Collection[]> {
  const res = await apiClient.get<Collection[]>('/api/collections');
  return res.data;
}

export async function listFabricTypes(): Promise<FabricType[]> {
  const res = await apiClient.get<FabricType[]>('/api/fabric-types');
  return res.data;
}

export async function listFabrics(params: { fabricTypeId?: number } = {}): Promise<Fabric[]> {
  const res = await apiClient.get<Fabric[]>('/api/fabrics', { params });
  return res.data;
}

export async function createFabric(
  body: Partial<Fabric> & { name: string },
): Promise<Fabric> {
  const res = await apiClient.post<Fabric>('/api/fabrics', body);
  return res.data;
}

export async function patchFabric(
  id: number,
  body: Partial<Fabric>,
): Promise<Fabric> {
  const res = await apiClient.patch<Fabric>(`/api/fabrics/${id}`, body);
  return res.data;
}

export async function deleteFabric(id: number): Promise<void> {
  await apiClient.delete(`/api/fabrics/${id}`);
}

// Re-export common types so screens don't need to reach into types.ts.
export type {
  Style,
  StyleVariant,
  StyleInspection,
  StyleChannelListing,
  StyleSource,
  StyleLifecycle,
  ChannelName,
  ChannelState,
  InspectionVerdict,
  Gender,
  Collection,
  FabricType,
  Fabric,
};
