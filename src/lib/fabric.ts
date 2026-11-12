import type { FabricColour, FabricIssuePurpose, FabricOrderStatus, FabricUnitOfMeasure } from '@/api/types';

export const UOM_SHORT: Record<FabricUnitOfMeasure, string> = {
  meter: 'm',
  kg: 'kg',
  oz: 'oz',
};

/** "2000 m" / "149.5 kg" / "12" — quantity with the fabric's short unit. */
export function fmtQty(n: number, unit?: string | null): string {
  const u = unit ? UOM_SHORT[unit as FabricUnitOfMeasure] ?? unit : '';
  const v = Math.round(n * 100) / 100;
  return `${v.toLocaleString('en-IN')}${u ? ` ${u}` : ''}`;
}

/** What planning lots are short of after stock and open orders; undefined when nothing is. */
export function orderQtyForLots(c: FabricColour): number | undefined {
  const short = Math.round(((c.heldQuantity ?? 0) - (c.availableQuantity ?? 0) - (c.onOrderQuantity ?? 0)) * 100) / 100;
  return short > 0 ? short : undefined;
}

export const PURPOSE_LABEL: Record<FabricIssuePurpose, string> = {
  production: 'Production lot',
  sample: 'Sample',
  wastage: 'Wastage / damage',
  other: 'Other',
  vendor_return: 'Sent back',
};

/** "PO 12" — how a fabric order is named everywhere. */
export const poLabel = (orderNo: number) => `PO ${orderNo}`;

/** How available a colour is, worked out from its numbers — never stored. Orders have their own column. */
export type ColourState = 'out_of_stock' | 'short' | 'running_out' | 'in_stock';

export function colourState(c: FabricColour): ColourState {
  if ((c.availableQuantity ?? 0) <= 0) return 'out_of_stock';
  if (isShortForLots(c)) return 'short';
  if (isRunningOut(c)) return 'running_out';
  return 'in_stock';
}

export const COLOUR_STATE_VARIANT: Record<ColourState, 'ready' | 'warning' | 'stuck'> = {
  out_of_stock: 'stuck',
  short: 'stuck',
  running_out: 'warning',
  in_stock: 'ready',
};

export const COLOUR_STATE_LABEL: Record<ColourState, string> = {
  out_of_stock: 'Out of stock',
  short: 'Short for lots',
  running_out: 'Running out',
  in_stock: 'In stock',
};

export const OPEN_ORDER_STATUSES: FabricOrderStatus[] = [
  'need_to_order',
  'ordered',
  'dispatched',
  'on_hold',
];

/** Statuses a person may pick; `received` comes from receipts or Close short. */
export const SETTABLE_ORDER_STATUSES: FabricOrderStatus[] = [
  'need_to_order',
  'ordered',
  'dispatched',
  'on_hold',
];

export const ORDER_STATUS_VARIANT: Record<
  FabricOrderStatus,
  'outline' | 'transit' | 'stitch' | 'rework' | 'ready' | 'secondary'
> = {
  need_to_order: 'outline',
  ordered: 'transit',
  dispatched: 'stitch',
  on_hold: 'rework',
  received: 'ready',
  cancelled: 'secondary',
};

export const ORDER_STATUS_LABEL: Record<FabricOrderStatus, string> = {
  need_to_order: 'Need to order',
  ordered: 'Ordered',
  dispatched: 'Dispatched',
  on_hold: 'On hold',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** Days of stock left at the last 30 days' rate; null when the colour hasn't moved. */
export function daysOfCover(c: FabricColour): number | null {
  const used = c.used30d ?? 0;
  if (used <= 0) return null;
  return Math.floor((c.availableQuantity ?? 0) / (used / 30));
}

/** Under this many days of cover, a colour is "running out". */
export const RUNNING_OUT_DAYS = 14;

/** Lots in planning need more than is in stock. */
export const isShortForLots = (c: FabricColour) => (c.heldQuantity ?? 0) > (c.availableQuantity ?? 0);

/** In stock, but under two weeks at its recent rate of use. */
export function isRunningOut(c: FabricColour): boolean {
  const d = daysOfCover(c);
  return (c.availableQuantity ?? 0) > 0 && d != null && d < RUNNING_OUT_DAYS;
}

/** The fabric colour a style is made in: its primary colour by name, or the fabric's only colour. */
export function styleFabricColour(
  fabric: { colours?: FabricColour[] | null },
  primaryColour: string | null | undefined,
): FabricColour | undefined {
  const want = (primaryColour ?? '').trim().toLowerCase();
  return fabric.colours?.find((c) => c.name.toLowerCase() === want) ?? (fabric.colours?.length === 1 ? fabric.colours[0] : undefined);
}
