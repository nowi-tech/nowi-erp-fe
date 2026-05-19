import { apiClient } from './apiClient';

// ── enum unions (mirror prisma/schema.prisma) ───────────────────────
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

export interface Fabric {
  id: number;
  name: string;
  pricePerUnit: string | null;
  status: string | null;
}

export interface Article {
  id: number;
  sku: string;
  parentSku: string | null;
  category: ArticleCategory;
  colour: string | null;
  fabricId: number | null;
  fabric: Pick<Fabric, 'id' | 'name' | 'pricePerUnit'> | null;
  referenceLink: string | null;
  referenceImage: string | null;
  referenceImageUrl: string | null;
  patternMaster: string | null;
  samplingTimeline: string | null;
  samplingStatus: SamplingStatus | null;
  inspectionV1: string | null;
  inspectionV2: string | null;
  modelFitSession: FitSession | null;
  dxfApproved: YesNo | null;
  sampleApproval: SampleApprovalStatus | null;
  productionStatus: ProductionStatus | null;
  productionTimeline: string | null;
  cuttingQty: number | null;
  stitchingOutput: number | null;
  packagingQty: number | null;
  remark: string | null;
  websiteLive: LiveStatus | null;
  updatedAt: string;
}

export type ArticleInput = Partial<
  Omit<Article, 'id' | 'fabric' | 'updatedAt'>
> & { sku: string; category: ArticleCategory };

export interface Option {
  value: string;
  label: string;
}
export interface ArticleOptions {
  category: Option[];
  samplingStatus: Option[];
  sampleApproval: Option[];
  productionStatus: Option[];
  modelFitSession: Option[];
  dxfApproved: Option[];
  websiteLive: Option[];
}

export interface ListArticlesParams {
  category?: ArticleCategory;
  samplingStatus?: SamplingStatus;
  productionStatus?: ProductionStatus;
  search?: string;
  skip?: number;
  take?: number;
}

export interface ArticleListResponse {
  data: Article[];
  total: number;
  skip: number;
  take: number;
}

export interface SummaryRow {
  category: ArticleCategory;
  label: string;
  stylesDeveloped: number;
  skusDeveloped: number;
  stylesApproved: number;
  skusInProduction: number;
  liveSkus: number;
  plannedQty: number;
  producedQty: number;
}
export interface ArticleSummary {
  categories: SummaryRow[];
  totals: Omit<SummaryRow, 'category' | 'label'>;
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

export async function listArticles(
  params: ListArticlesParams = {},
): Promise<ArticleListResponse> {
  const res = await apiClient.get<ArticleListResponse>('/api/articles', {
    params,
  });
  return res.data;
}

export async function getArticleOptions(): Promise<ArticleOptions> {
  const res = await apiClient.get<ArticleOptions>('/api/articles/options');
  return res.data;
}

export async function listFabrics(): Promise<Fabric[]> {
  const res = await apiClient.get<Fabric[]>('/api/articles/fabrics');
  return res.data;
}

export async function getArticleSummary(): Promise<ArticleSummary> {
  const res = await apiClient.get<ArticleSummary>('/api/articles/summary');
  return res.data;
}

export async function createArticle(body: ArticleInput): Promise<Article> {
  const res = await apiClient.post<Article>('/api/articles', body);
  return res.data;
}

export async function updateArticle(
  id: number,
  body: Partial<ArticleInput>,
): Promise<Article> {
  const res = await apiClient.patch<Article>(`/api/articles/${id}`, body);
  return res.data;
}

/** Best-effort — resolves even when extraction fails (ok:false). */
export async function extractLink(url: string): Promise<LinkExtractResult> {
  try {
    const res = await apiClient.post<LinkExtractResult>(
      '/api/articles/extract-link',
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
