import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type SortKey =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'recent';

/**
 * Per-column filter state. Each entry holds the *excluded* values for that
 * column — an empty array means the column is unfiltered (all values pass).
 */
export interface ColumnFilters {
  /** derived type label */
  typeLabel: string[];
  /** unit of measure */
  unitOfMeasure: string[];
  /** fibre / content names */
  fibre: string[];
}

export interface FabricFilters {
  /** free-text search over the fabric name */
  search: string;
  /** Excel-style per-column exclusion sets */
  columns: ColumnFilters;
  sort: SortKey;
}

export const EMPTY_FILTERS: FabricFilters = {
  search: '',
  columns: { typeLabel: [], unitOfMeasure: [], fibre: [] },
  sort: 'name_asc',
};

/** True when any column has excluded values. */
export function columnFiltersActive(c: ColumnFilters): boolean {
  return (
    c.typeLabel.length > 0 ||
    c.unitOfMeasure.length > 0 ||
    c.fibre.length > 0
  );
}

export function filtersAreActive(f: FabricFilters): boolean {
  return (
    f.search.trim() !== '' ||
    columnFiltersActive(f.columns) ||
    f.sort !== 'name_asc'
  );
}

interface Props {
  filters: FabricFilters;
  onChange: (next: FabricFilters) => void;
  /** total fabric count (for the active-filter summary) */
  totalCount: number;
  /** number of fabrics matching the current filters */
  matchCount: number;
}

/**
 * Top filter bar for the Fabric Library.
 *
 * Just the name search + a "clear all" affordance. Categorical filtering
 * (type, content, unit) now lives in the per-column header funnels.
 * All filtering is client-side — the dataset is small (~31 rows).
 */
export default function FabricFilterBar({
  filters,
  onChange,
  totalCount,
  matchCount,
}: Props) {
  const { t } = useTranslation();
  const set = (patch: Partial<FabricFilters>) =>
    onChange({ ...filters, ...patch });

  const active = filtersAreActive(filters);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
          />
          <Input
            className="h-9 text-[13px] pl-9"
            placeholder={t('admin.fabricLibrary.filters.searchPlaceholder')}
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>

        {active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="shrink-0"
          >
            <X size={14} />
            <span className="ml-1">
              {t('admin.fabricLibrary.filters.clear')}
            </span>
          </Button>
        )}
      </div>

      {/* Active-filter count summary */}
      {active && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {t('admin.fabricLibrary.filters.activeSummary', {
            count: matchCount,
          })}
          {' · '}
          {t('admin.fabricLibrary.filters.activeOf', {
            count: matchCount,
            total: totalCount,
          })}
        </p>
      )}
    </div>
  );
}
