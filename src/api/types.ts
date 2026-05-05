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
