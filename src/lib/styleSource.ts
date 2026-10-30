import type { useTranslation } from 'react-i18next';
import type { StyleSource } from '@/api/types';

type T = ReturnType<typeof useTranslation>['t'];

/** Where a style came from, as people name it. "Made for a brand" is a sampling style with a brand. */
export type SourceKind = StyleSource | 'for_brand';

export function sourceKind(s: { source: StyleSource; brandId?: number | null }): SourceKind {
  return s.source === 'sampling' && s.brandId != null ? 'for_brand' : s.source;
}

/** Bought in / Made for a brand — the two 3rd-party paths. */
export function isThirdPartyKind(kind: SourceKind): boolean {
  return kind === 'third_party' || kind === 'third_party_manufactured' || kind === 'for_brand';
}

export function sourceLabel(t: T, kind: SourceKind): string {
  return t(`admin.styles.source.${kind}`);
}
