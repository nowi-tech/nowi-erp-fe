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
