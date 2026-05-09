// Hand-written minimal types. Will be regenerated from BE OpenAPI via `pnpm gen:api`.

export type UserRole =
  | 'admin'
  | 'stitching_master'
  | 'finishing_master'
  | 'data_manager'
  | 'viewer';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  isTrainingMode: boolean;
}

export interface VerifyOtpResponse {
  token: string;
  user: User;
}

// ─── Master data ──────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  code: string;
  name: string;
  isInternal: boolean;
  easyecomEnabled: boolean;
  consumptionApiEnabled: boolean;
  isActive: boolean;
}

export interface Sku {
  id: string;
  code: string;
  baseCode: string;
  sizeLabel: string;
  brand?: string | null;
  gender?: string | null;
  category?: string | null;
  originVendorId?: string | null;
  costPrice?: number | null;
  sellingPrice?: number | null;
}

// ─── Orders / lots ────────────────────────────────────────────────────────

export type OrderStatus =
  | 'receiving'
  | 'in_stitching'
  | 'in_finishing'
  | 'in_rework'
  | 'dispatched'
  | 'closed'
  | 'closed_with_adjustment'
  | 'stuck';

export interface Order {
  id: string;
  orderNo: string;
  inboundChallanId: string;
  status: OrderStatus;
  createdAt: string;
  closedAt?: string | null;
}

/** Aggregated qty per size label, e.g. { S: 50, M: 30 }. */
export type SizeMatrix = Record<string, number>;

export interface Lot {
  id: string;
  lotNo: string;
  vendorId: string;
  vendorLotNo?: string | null;
  inboundChallanId?: string | null;
  orderId: string;
  sku: string;
  baseCode?: string | null;
  qtyIn: SizeMatrix;
  vendor?: Vendor | null;
  order?: Order | null;
  createdAt: string;
}

// ─── Inbound ──────────────────────────────────────────────────────────────

export interface InboundLotPayload {
  lotNo: string;
  baseCode?: string;
  sizeMatrix: SizeMatrix;
}

export interface CreateInboundPayload {
  vendorId: string;
  vendorChallanNo: string;
  vendorLotNo?: string;
  receivedAt?: string;
  notes?: string;
  lots: InboundLotPayload[];
}

export interface CreateInboundResponse {
  inboundChallanId: string;
  orderIds: string[];
  lotIds: string[];
}

// ─── Receipts ─────────────────────────────────────────────────────────────

export interface ReceiptLine {
  sizeLabel: string;
  qty: number;
}

export interface CreateReceiptsPayload {
  lotId: string;
  stageId: number;
  receipts: ReceiptLine[];
}

export interface AvailabilityResponse {
  stageId: number;
  available: SizeMatrix;
}

// ─── Rework ───────────────────────────────────────────────────────────────

export interface OpenReworkPayload {
  lotId: string;
  sku: string;
  sizeLabel: string;
  qty: number;
  reason: string;
  photoPaths?: string[];
}

export interface ReworkIssue {
  id: string;
  lotId: string;
  sku: string;
  sizeLabel: string;
  qty: number;
  reason: string;
  attemptNumber: number;
  status: 'open' | 'in_progress' | 'resolved' | 'exceeded_limit';
  openedAt: string;
}

// ─── Scrap ────────────────────────────────────────────────────────────────

export interface CreateScrapPayload {
  lotId: string;
  stageId?: number | null;
  sku: string;
  sizeLabel: string;
  qty: number;
  reason: string;
  photoPaths?: string[];
}

export interface ScrapEvent {
  id: string;
  lotId: string;
  stageId?: number | null;
  sku: string;
  sizeLabel: string;
  qty: number;
  reason: string;
  scrappedAt: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────

export interface UploadUrlResponse {
  uploadUrl: string;
  objectPath: string;
  noop?: boolean;
}

// ─── Filters ──────────────────────────────────────────────────────────────

export interface FilterOption {
  id: string;
  code: string;
  name: string;
}

export interface FilterStage extends FilterOption {
  sequence?: number;
}

export interface FilterStatus {
  id: string;
  code: OrderStatus | string;
  name: string;
}

export interface FilterSku {
  id: string;
  code: string;
  baseCode: string;
  sizeLabel: string;
  originVendorCode?: string | null;
}

// ─── Locator ──────────────────────────────────────────────────────────────

export interface LocatorOriginVendor {
  id: string;
  code: string;
  name: string;
}

export interface LocatorCounts {
  inbound: number;
  stitching: number;
  finishing: number;
  dispatched: number;
}

export interface LocatorRow {
  sku: string;
  baseCode: string;
  sizeLabel: string;
  originVendor: LocatorOriginVendor;
  counts: LocatorCounts;
  lotsCount: number;
}

export interface LocatorPage {
  skip: number;
  take: number;
  total: number;
}

export interface LocatorResponse {
  rows: LocatorRow[];
  page: LocatorPage;
}

export interface LocatorParams {
  vendorId?: string;
  stageId?: string;
  warehouseId?: string;
  status?: string;
  sku?: string;
  baseCode?: string;
  originVendorId?: string;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

export interface SkuDetailTotals extends LocatorCounts {
  scrapped: number;
  reworking: number;
}

export interface SkuDetailLot {
  id: string;
  lotNo: string;
  vendor: { id: string; code: string; name: string } | null;
  order: { id: string; orderNo: string; status: OrderStatus | string } | null;
  qtyIn: number;
  stitchingAvail: number;
  finishingAvail: number;
  scrapped: number;
  openRework: number;
}

export interface SkuDetailReceipt {
  id: string;
  at: string;
  stage: string;
  qty: number;
  kind: 'forward' | 'rework' | 'scrap' | string;
}

export interface SkuDetailResponse {
  sku: string;
  baseCode: string;
  sizeLabel: string;
  originVendor: LocatorOriginVendor | null;
  totals: SkuDetailTotals;
  lots: SkuDetailLot[];
  recentReceipts: SkuDetailReceipt[];
}

// ─── Dashboard ────────────────────────────────────────────────────────────

export interface ThroughputPoint {
  date: string;
  finished: number;
  dispatched: number;
}

export interface ThroughputResponse {
  finishedUnits: number;
  dispatchedUnits: number;
  trend: ThroughputPoint[];
}

export interface ReworkRateRow {
  sku: string;
  baseCode?: string;
  sizeLabel?: string;
  reworkUnits: number;
  finishingForwardUnits: number;
  ratePct: number;
}

export interface ReworkRateStageRow {
  stage: string;
  reworkUnits: number;
  ratePct: number;
}

export interface ReworkRateResponse {
  overall: {
    reworkUnits: number;
    finishingForwardUnits: number;
    ratePct: number;
  };
  bySku: ReworkRateRow[];
  byStage: ReworkRateStageRow[];
}

export interface CycleTimeBucket {
  bucket: string;
  count: number;
}

export interface CycleTimeSkuRow {
  sku: string;
  avgDays: number;
}

export interface CycleTimeResponse {
  avgDays: number;
  bySku: CycleTimeSkuRow[];
  distribution: CycleTimeBucket[];
}

// ─── Dispatches ───────────────────────────────────────────────────────────

export type DispatchStatus =
  | 'draft'
  | 'awaiting_confirmation'
  | 'synced'
  | 'manual_pdf'
  | 'awaiting_grn'
  | 'grn_received'
  | 'grn_mismatch'
  | 'sync_failed'
  | 'closed'
  | 'closed_with_adjustment';

export type DispatchSyncMode = 'easyecom' | 'manual_pdf';

export interface DispatchItem {
  id: string;
  dispatchId: string;
  lotId: string;
  lotNo?: string | null;
  sku: string;
  sizeLabel: string;
  qtySent: number;
  qtyReceived?: number | null;
  mismatch?: boolean;
  lastEditAt?: string | null;
  lastEditBy?: string | null;
  lastEditReason?: string | null;
}

export interface DispatchGrnEvent {
  id: string;
  dispatchId: string;
  receivedAt: string;
  payload: unknown;
}

export interface DispatchSyncQueueEntry {
  id: string;
  dispatchId: string;
  attempts: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  status?: string | null;
}

export interface Dispatch {
  id: string;
  dispatchNo: string;
  orderId: string;
  destWarehouseId: string;
  destWarehouse?: { id: string; name: string; code?: string | null } | null;
  status: DispatchStatus;
  syncMode: DispatchSyncMode;
  dispatchedAt: string;
  itemsCount?: number;
  totalQtySent?: number;
}

export interface DispatchDetail extends Dispatch {
  order?: Order | null;
  items: DispatchItem[];
  grnEvents: DispatchGrnEvent[];
  syncQueue: DispatchSyncQueueEntry[];
}

export interface CreateDispatchItemInput {
  lotId: string;
  sku: string;
  sizeLabel: string;
  qty: number;
}

export interface CreateDispatchPayload {
  orderId: string;
  destWarehouseId: string;
  items: CreateDispatchItemInput[];
  syncMode?: DispatchSyncMode;
}

export interface ListDispatchesParams {
  orderId?: string;
  destWarehouseId?: string;
  status?: DispatchStatus | string;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

export interface ListDispatchesResponse {
  rows: Dispatch[];
  page: { skip: number; take: number; total: number };
}

export interface EditDispatchItemPayload {
  qty: number;
  reason: string;
  note?: string;
}
