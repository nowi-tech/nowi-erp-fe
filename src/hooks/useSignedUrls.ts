import { useEffect, useMemo, useState } from 'react';
import { getReadUrls, isAbsoluteUrl } from '@/api/storage';

/**
 * Resolve a set of GCS object paths to short-lived signed read URLs in a
 * single batched call, returning a `path → url` lookup. Absolute URLs
 * (remote CDN / data: / blob:) are returned as-is and never sent to the
 * signer, so callers can look up any value uniformly.
 *
 * Cancellation-safe: each effect run tags itself and a stale resolution
 * (e.g. an earlier request that resolves after a newer page/filter change)
 * is dropped instead of overwriting fresher state.
 *
 * Centralises the effect+batch+cancel pattern that the workspace gallery,
 * the fabric swatch, and the styles-registry thumbnail column all need.
 */
export function useSignedUrls(paths: Array<string | null | undefined>): Record<string, string> {
  // Stable key so the effect only re-runs when the meaningful set changes.
  const cleaned = useMemo(
    () => [...new Set(paths.filter((p): p is string => !!p))],
    // join captures the set's content; `paths` identity churns each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paths.filter(Boolean).join(',')],
  );
  const toSign = useMemo(
    () => cleaned.filter((p) => !isAbsoluteUrl(p)),
    [cleaned],
  );
  const toSignKey = toSign.join(',');

  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (toSign.length === 0) {
      setSigned({});
      return;
    }
    void getReadUrls(toSign)
      .then((map) => {
        if (!cancelled) setSigned(map);
      })
      .catch(() => {
        if (!cancelled) setSigned({});
      });
    return () => {
      cancelled = true;
    };
    // toSignKey captures the meaningful change; toSign is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toSignKey]);

  // Absolute URLs resolve to themselves; signed paths resolve to their URL.
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of cleaned) {
      if (isAbsoluteUrl(p)) out[p] = p;
      else if (signed[p]) out[p] = signed[p];
    }
    return out;
  }, [cleaned, signed]);
}
