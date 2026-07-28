import type { InventoryStyle } from '@/api/inventoryHealth';

/**
 * Show a style's SKU-derived name only when it adds information — not when it is
 * just the styleKey with a size suffix (e.g. "NOWIMPA1082 30", which normalises
 * to the NOWIMPA1082_30 SKU code). Shared by the Production board and Inventory
 * Health so the "is this name meaningful?" rule never drifts between them.
 */
export function cleanName(
  name: string | null,
  styleKey: string | null,
  skus: string[],
): string | null {
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n = norm(name ?? '');
  if (!n) return null;
  if (styleKey && n === norm(styleKey)) return null;
  if (skus.some((sku) => norm(sku) === n)) return null;
  return name;
}

export function meaningfulName(style: InventoryStyle): string | null {
  return cleanName(
    style.name,
    style.styleKey,
    style.sizes.map((z) => z.sku),
  );
}

/** Cover-day colour: red = reorder now, amber = soon, muted otherwise. */
export function coverTone(days: number | null | undefined): string {
  if (days == null) return 'text-[var(--color-muted-foreground)]';
  if (days < 7) return 'text-[var(--color-destructive)]';
  if (days <= 15) return 'text-amber-600';
  return 'text-[var(--color-muted-foreground)]';
}
