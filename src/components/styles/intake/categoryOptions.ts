import type { Gender } from '@/api/types';
import type { ArticleCategory } from '@/api/styles';

/**
 * Fine-grained category codes the FE knows about. These match
 * `prisma/schema.prisma` Category seeds (DRESS, PANT, TSHIRT, BLAZER,
 * JACKET) — used to build the searchable Category combobox before the
 * server-side `/api/categories` list resolves. Once the server list
 * arrives those entries take precedence and merge in.
 */
export const FINE_CATEGORY_CODES = [
  'DRESS',
  'PANT',
  'TSHIRT',
  'BLAZER',
  'JACKET',
] as const;
export type FineCategoryCode = (typeof FINE_CATEGORY_CODES)[number];

/** Gender → which fine-grained categories are valid. */
export const GENDER_CATEGORIES: Record<Gender, FineCategoryCode[]> = {
  women: ['JACKET', 'PANT', 'TSHIRT', 'BLAZER', 'DRESS'],
  men: ['JACKET', 'PANT', 'TSHIRT', 'BLAZER'],
  unisex: ['JACKET', 'PANT', 'TSHIRT', 'BLAZER', 'DRESS'],
};

/**
 * Map a (gender, fine-category) pair to the legacy ArticleCategory
 * enum the BE still expects on `POST /api/styles`. Mirrors the server
 * fallback so the contract is symmetrical.
 */
export function deriveArticleCategory(
  gender: Gender,
  fine: FineCategoryCode | string,
): ArticleCategory {
  const code = String(fine).toUpperCase();
  if (gender === 'men') {
    if (code === 'PANT') return 'mens_bottom_wear';
    if (code === 'BLAZER') return 'mens_suit';
    if (code === 'JACKET') return 'winterwear';
    return 'mens_top_wear';
  }
  // women + unisex share the women's buckets (the fine code is what
  // anchors the style code on the BE).
  if (code === 'PANT') return 'womens_bottom_wear';
  if (code === 'JACKET') return 'winterwear';
  if (code === 'BLAZER') return 'womens_top_wear';
  return 'womens_top_wear';
}

/** Pretty label for a fine category code. */
export function fineCategoryLabel(code: string): string {
  switch (code.toUpperCase()) {
    case 'DRESS':
      return 'Dress';
    case 'PANT':
      return 'Pant';
    case 'TSHIRT':
      return 'T-shirt';
    case 'BLAZER':
      return 'Blazer';
    case 'JACKET':
      return 'Jacket';
    default:
      // Title-case the raw code (e.g. SKIRT → Skirt).
      return (
        code.charAt(0).toUpperCase() + code.slice(1).toLowerCase()
      ).replace(/_/g, ' ');
  }
}
