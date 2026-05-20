import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StyleVariant } from '@/api/types';
import { cn } from '@/lib/utils';

interface Props {
  variants: StyleVariant[];
  onAddVariant?: () => void;
  onCellClick?: (variant: StyleVariant) => void;
}

function variantTone(v: StyleVariant) {
  if (v.sampleApproval === 'approved_for_production') return 'success';
  if (v.sampleApproval === 'under_review_corrections') return 'warning';
  if (v.samplingStatus === 'corrections_needed') return 'warning';
  if (v.isArchived) return 'outline';
  return 'secondary';
}

/**
 * Fabric × Colour matrix. Each cell is a small chip whose tone reflects
 * the variant's approval/sampling state.
 */
export default function VariantMatrix({
  variants,
  onAddVariant,
  onCellClick,
}: Props) {
  const { fabrics, colours, byKey } = useMemo(() => {
    const fSet = new Map<string, string>(); // id-key → display name
    const cSet = new Set<string>();
    const map = new Map<string, StyleVariant>();
    for (const v of variants) {
      if (v.isArchived) continue;
      const fKey = String(v.fabricId ?? 'none');
      const fLabel = v.fabric?.name ?? '—';
      if (!fSet.has(fKey)) fSet.set(fKey, fLabel);
      cSet.add(v.colour);
      map.set(`${fKey}::${v.colour}`, v);
    }
    return {
      fabrics: [...fSet.entries()],
      colours: [...cSet],
      byKey: map,
    };
  }, [variants]);

  if (variants.length === 0) {
    return (
      <div className="text-sm text-[var(--color-muted-foreground)] flex items-center justify-between gap-3">
        <span>No variants yet.</span>
        {onAddVariant && (
          <Button variant="outline" size="sm" onClick={onAddVariant}>
            <Plus size={14} /> <span className="ml-1">Add variant</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="text-[13px] border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium text-[var(--color-muted-foreground)] px-2 py-1.5">
                Fabric \ Colour
              </th>
              {colours.map((c) => (
                <th
                  key={c}
                  className="text-left font-medium text-[var(--color-muted-foreground)] px-2 py-1.5 whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fabrics.map(([fKey, fLabel]) => (
              <tr key={fKey} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1.5 whitespace-nowrap font-medium">
                  {fLabel}
                </td>
                {colours.map((c) => {
                  const v = byKey.get(`${fKey}::${c}`);
                  return (
                    <td key={c} className="px-2 py-1.5">
                      {v ? (
                        <button
                          type="button"
                          onClick={() => onCellClick?.(v)}
                          className={cn(
                            'inline-flex items-center',
                            onCellClick && 'cursor-pointer hover:opacity-80',
                          )}
                        >
                          <Badge variant={variantTone(v)}>
                            {v.cuttingQty ?? '—'}
                          </Badge>
                        </button>
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onAddVariant && (
        <Button variant="outline" size="sm" onClick={onAddVariant}>
          <Plus size={14} /> <span className="ml-1">Add variant</span>
        </Button>
      )}
    </div>
  );
}
