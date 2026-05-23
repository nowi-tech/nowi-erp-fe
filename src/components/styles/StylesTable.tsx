import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ColumnFilter, type ColumnFilterOption } from '@/components/ui/column-filter';
import type { Style } from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Distinct values + per-value row counts for a column. Used to populate
 * the column-filter popover. `getKey` is what we filter on (string, or
 * the empty token below for nulls), `getLabel` is what we render.
 */
const NONE_TOKEN = '__none__';

function distinct(
  rows: Style[],
  getKey: (s: Style) => string | null | undefined,
  getLabel: (key: string) => string,
): ColumnFilterOption[] {
  const counts = new Map<string, number>();
  for (const s of rows) {
    const raw = getKey(s);
    const key = raw == null || raw === '' ? NONE_TOKEN : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: value === NONE_TOKEN ? '— (none)' : getLabel(value),
      count,
    }))
    .sort((a, b) =>
      a.value === NONE_TOKEN
        ? 1
        : b.value === NONE_TOKEN
          ? -1
          : (a.label ?? a.value).localeCompare(b.label ?? b.value),
    );
}

interface Props {
  rows: Style[];
  loading: boolean;
  onRowClick?: (style: Style) => void;
  onStyleNoClick?: (style: Style) => void;
  /**
   * `"full"` (default) — all sampling-workflow columns (Pattern Master, Stage,
   *   Approval, Web, Updated).
   * `"compact"` — minimal set for non-sampling flows (China Import): Style #,
   *   Working Name, Colour, Updated. Hides Pattern Master / Stage / Approval / Web.
   */
  variant?: 'full' | 'compact';
}

function lifecycleVariant(l: Style['lifecycle']) {
  if (l === 'sample_approved' || l === 'dispatched') return 'success';
  if (l === 'parked' || l === 'archived') return 'outline';
  if (l === 'qc' || l === 'in_pd' || l === 'in_sampling') return 'stitch';
  return 'secondary';
}

/**
 * Parent/variant grouped table. Parents are styles with no
 * `parentStyleId`; variants are nested under their parent. Because the
 * BE doesn't yet expose a parentStyleId on the new Style schema, this
 * v1 implementation treats every Style as a parent and renders its
 * `variants[]` children inline when present.
 */
export default function StylesTable({
  rows,
  loading,
  onRowClick,
  onStyleNoClick,
  variant = 'full',
}: Props) {
  const { t } = useTranslation();
  const isCompact = variant === 'compact';
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Per-column filters ─────────────────────────────────────────
  // Excel-style: each column's funnel popover lists distinct values
  // in the current row set; checked = include, unchecked = exclude.
  // Empty excluded list = filter inactive. Filters apply to top-level
  // (parent) rows only; nested variant rows always render with their
  // parent for now.
  const [excPatternMaster, setExcPatternMaster] = useState<string[]>([]);
  const [excLifecycle, setExcLifecycle] = useState<string[]>([]);
  const [excSamplingStatus, setExcSamplingStatus] = useState<string[]>([]);
  const [excSampleApproval, setExcSampleApproval] = useState<string[]>([]);
  const [excColour, setExcColour] = useState<string[]>([]);

  // Distinct values come from the unfiltered rows so the popover lists
  // every value even when other filters narrow the visible set.
  const patternMasterOptions = useMemo(
    () => distinct(rows, (s) => s.patternMaster?.name ?? null, (v) => v),
    [rows],
  );
  const lifecycleOptions = useMemo(
    () =>
      distinct(rows, (s) => s.lifecycle, (v) =>
        t(`admin.styles.lifecycle.${v}` as const, { defaultValue: v }),
      ),
    [rows, t],
  );
  const samplingStatusOptions = useMemo(
    () => distinct(rows, (s) => s.samplingStatus, (v) => v),
    [rows],
  );
  const sampleApprovalOptions = useMemo(
    () => distinct(rows, (s) => s.sampleApproval, (v) => v),
    [rows],
  );
  const colourOptions = useMemo(
    () => distinct(rows, (s) => s.primaryColour, (v) => v),
    [rows],
  );

  // Apply filters. NONE_TOKEN is the key for missing values.
  const filteredRows = useMemo(() => {
    const checkExcl = (
      val: string | null | undefined,
      excluded: string[],
    ) => {
      if (excluded.length === 0) return true;
      const key = val == null || val === '' ? NONE_TOKEN : String(val);
      return !excluded.includes(key);
    };
    return rows.filter(
      (s) =>
        checkExcl(s.patternMaster?.name, excPatternMaster) &&
        checkExcl(s.lifecycle, excLifecycle) &&
        checkExcl(s.samplingStatus, excSamplingStatus) &&
        checkExcl(s.sampleApproval, excSampleApproval) &&
        checkExcl(s.primaryColour, excColour),
    );
  }, [
    rows,
    excPatternMaster,
    excLifecycle,
    excSamplingStatus,
    excSampleApproval,
    excColour,
  ]);

  // Collapse when the row set changes (filter / tab change).
  useEffect(() => setExpanded(new Set()), [rows]);

  const groupsWithChildren = useMemo(
    () => filteredRows.filter((r) => (r.variants?.length ?? 0) > 0),
    [filteredRows],
  );
  const allExpanded =
    groupsWithChildren.length > 0 &&
    groupsWithChildren.every((g) => expanded.has(g.id));

  const toggleAll = () =>
    setExpanded(
      allExpanded ? new Set() : new Set(groupsWithChildren.map((g) => g.id)),
    );

  const rowClasses =
    'border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-muted)] focus:outline-none focus-visible:bg-[var(--color-muted)]';

  // compact = 5 cols (expand + style# + name + colour + updated + chevron)
  // full    = 9 cols (expand + style# + name + patternMaster + stage + approval + web + updated + chevron)
  const COL_COUNT = isCompact ? 6 : 9;

  return (
    <div className="space-y-2">
      {groupsWithChildren.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
            <tr>
              <th className="w-8" />
              <th className="text-left font-medium px-3 py-2">
                {t('admin.styles.table.styleNo')}
              </th>
              <th className="text-left font-medium px-3 py-2">
                {t('admin.styles.table.workingName')}
              </th>
              {isCompact ? (
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1">
                    {t('admin.styles.table.colour')}
                    <ColumnFilter
                      title={t('admin.styles.table.colour')}
                      options={colourOptions}
                      excluded={excColour}
                      onChange={setExcColour}
                    />
                  </span>
                </th>
              ) : (
                <>
                  <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {t('admin.styles.table.patternMaster')}
                      <ColumnFilter
                        title={t('admin.styles.table.patternMaster')}
                        options={patternMasterOptions}
                        excluded={excPatternMaster}
                        onChange={setExcPatternMaster}
                      />
                    </span>
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {t('admin.styles.table.stage')}
                      <ColumnFilter
                        title={t('admin.styles.table.stage')}
                        options={lifecycleOptions}
                        excluded={excLifecycle}
                        onChange={setExcLifecycle}
                      />
                    </span>
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {t('admin.styles.table.approval')}
                      <ColumnFilter
                        title={t('admin.styles.table.approval')}
                        options={sampleApprovalOptions}
                        excluded={excSampleApproval}
                        onChange={setExcSampleApproval}
                      />
                    </span>
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {t('admin.styles.table.web')}
                      {/* Samplingstatus filter wired here rather than a
                          separate column — it's the closest column to
                          "web/sampling stage" in the Gurukul flow. */}
                      <ColumnFilter
                        title={t('admin.styles.table.samplingStatus', { defaultValue: 'Sampling status' })}
                        options={samplingStatusOptions}
                        excluded={excSamplingStatus}
                        onChange={setExcSamplingStatus}
                      />
                    </span>
                  </th>
                </>
              )}
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                {t('admin.styles.table.updated')}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={COL_COUNT}
                  className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={COL_COUNT}
                  className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('admin.styles.table.empty')}
                </td>
              </tr>
            )}
            {!loading &&
              filteredRows.map((s) => {
                const variants = s.variants ?? [];
                const hasChildren = variants.length > 0;
                const isOpen = expanded.has(s.id);
                return (
                  <Fragment key={s.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      onClick={() => onRowClick?.(s)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick?.(s);
                        }
                      }}
                      className={cn(rowClasses, 'font-medium')}
                    >
                      <td className="px-2 py-2 text-center">
                        {hasChildren ? (
                          <button
                            type="button"
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                            aria-expanded={isOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(s.id);
                            }}
                            className="p-0.5 rounded hover:bg-[var(--color-border)] text-[var(--color-muted-foreground)]"
                          >
                            {isOpen ? (
                              <ChevronDown size={15} />
                            ) : (
                              <ChevronRight size={15} />
                            )}
                          </button>
                        ) : (
                          <span aria-hidden className="inline-block w-[15px]" />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStyleNoClick?.(s);
                            }}
                            className={cn(
                              'text-left font-mono text-[var(--color-primary)]',
                              onStyleNoClick && 'hover:underline',
                            )}
                          >
                            {s.styleId ?? `(${t('admin.styles.draft')})`}
                          </button>
                          <div className="flex gap-1 flex-wrap">
                            {s.collection && (
                              <Badge variant="outline" className="text-[10px]">
                                {s.collection.name}
                              </Badge>
                            )}
                            <Badge
                              variant={lifecycleVariant(s.lifecycle)}
                              className="text-[10px]"
                            >
                              {t(`admin.styles.lifecycle.${s.lifecycle}`)}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {s.workingName ?? '—'}
                        {hasChildren && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {t('admin.styles.table.variantsCount', {
                              count: variants.length,
                            })}
                          </Badge>
                        )}
                      </td>
                      {isCompact ? (
                        <td className="px-3 py-2 hidden sm:table-cell text-[var(--color-muted-foreground)]">
                          {s.primaryColour ?? '—'}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 hidden md:table-cell">
                            {s.patternMaster?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell">
                            {s.samplingStatus ? (
                              <Badge variant="stitch" className="text-[10px]">
                                {s.samplingStatus}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell">
                            {s.sampleApproval ? (
                              <Badge variant="success" className="text-[10px]">
                                {s.sampleApproval}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            {s.referenceLink ? (
                              <a
                                href={s.referenceLink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex text-[var(--color-primary)]"
                                aria-label="Open reference link"
                              >
                                <ExternalLink size={14} />
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 hidden md:table-cell text-xs text-[var(--color-muted-foreground)] tabular-nums">
                        {new Date(s.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <ChevronRight
                          size={16}
                          className="text-[var(--color-muted-foreground)]"
                        />
                      </td>
                    </tr>
                    {hasChildren &&
                      isOpen &&
                      variants.map((v) => (
                        <tr
                          key={v.id}
                          className={cn(
                            rowClasses,
                            'bg-[var(--color-surface-2)]/40',
                          )}
                          onClick={() => onRowClick?.(s)}
                        >
                          <td />
                          <td className="px-3 py-2 pl-8">
                            <span className="text-[var(--color-muted-foreground)]">
                              ↳
                            </span>{' '}
                            <span className="font-medium">{v.colour}</span>
                            {v.fabric && (
                              <span className="text-[var(--color-muted-foreground)] font-normal ml-1.5">
                                · {v.fabric.name}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[var(--color-muted-foreground)]">
                            {v.cuttingQty != null
                              ? `Cut ${v.cuttingQty}`
                              : '—'}
                          </td>
                          {isCompact ? (
                            <td className="px-3 py-2 hidden sm:table-cell" />
                          ) : (
                            <>
                              <td className="px-3 py-2 hidden md:table-cell" />
                              <td className="px-3 py-2 hidden lg:table-cell">
                                {v.samplingStatus ?? '—'}
                              </td>
                              <td className="px-3 py-2 hidden lg:table-cell">
                                {v.sampleApproval ?? '—'}
                              </td>
                              <td className="px-3 py-2 hidden sm:table-cell">
                                {v.websiteLive === 'live' ? (
                                  <Badge variant="ready" className="text-[10px]">
                                    Live
                                  </Badge>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2 hidden md:table-cell" />
                          <td />
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
