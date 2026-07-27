import type { StyleLifecycle } from '@/api/types';

/**
 * Lifecycles a style can be a COLOUR PARENT from — a colour sibling inherits
 * an approved sample, so the family must already have one. `StyleLifecycle` is
 * NON-ORDINAL — enumerate explicitly, never `>=`.
 *
 * ⚠️ DRIFT HAZARD: mirrored server-side as the `SPAWNABLE` gate in
 * `spawnColourVariant` (nowi-erp-api styles.service) and in the LLD §Phase 3
 * `POST_SAMPLING` list — keep all three in sync. A picker that offers a parent
 * outside this set produces a 400 at submit.
 */
export const POST_SAMPLING = new Set<StyleLifecycle>([
  'sample_approved',
  'cataloguing',
  'live',
  'in_pd',
  'qc',
  'dispatched',
]);

/**
 * Canonical display form for a Style. Use this anywhere a human will
 * see the identifier — registry rows, detail headers, page titles,
 * drawer subtitles. Falls back through:
 *
 *   1. Real Style # (`NOWIWDR1001`) — once Approval #1 has minted it.
 *   2. Draft handle (`D-1042`) — minted at intake for sampling intakes
 *      so the team can reference the design before approval.
 *   3. The fallback label (default `(draft)`) — only hit when neither
 *      exists, e.g. legacy rows imported without a draft #.
 */
export function formatStyleRef(
  style: { styleId: string | null; draftNo: number | null },
  fallback: string = '(draft)',
): string {
  if (style.styleId) return style.styleId;
  if (style.draftNo != null) return `D-${style.draftNo}`;
  return fallback;
}
