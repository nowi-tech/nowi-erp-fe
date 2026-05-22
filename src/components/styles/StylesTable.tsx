import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { Style } from '@/api/types';
import { cn } from '@/lib/utils';

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

  // Collapse when the row set changes (filter / tab change).
  useEffect(() => setExpanded(new Set()), [rows]);

  const groupsWithChildren = useMemo(
    () => rows.filter((r) => (r.variants?.length ?? 0) > 0),
    [rows],
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
                  {t('admin.styles.table.colour')}
                </th>
              ) : (
                <>
                  <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                    {t('admin.styles.table.patternMaster')}
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">
                    {t('admin.styles.table.stage')}
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">
                    {t('admin.styles.table.approval')}
                  </th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">
                    {t('admin.styles.table.web')}
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
            {!loading && rows.length === 0 && (
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
              rows.map((s) => {
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
