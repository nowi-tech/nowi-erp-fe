import { useEffect, useState } from 'react';
import { listStages } from '@/api/filters';

/**
 * Resolve a stage's numeric id from its code ("stitching" / "finishing")
 * via `/api/filters/stages`. Returns `null` until the lookup completes.
 *
 * Built so floor pages don't have to hardcode `STAGE_ID_STITCHING = 1`
 * — if someone reorders stages in the seed (or adds a new one), the
 * code on the FE keeps working.
 */
export function useStageId(code: string): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    listStages()
      .then((stages) => {
        if (cancelled) return;
        const match = stages.find((s) => s.code === code);
        setId(match ? Number(match.id) : null);
      })
      .catch(() => {
        if (!cancelled) setId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);
  return id;
}
