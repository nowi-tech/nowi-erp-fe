import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnFilter, type ColumnFilterOption } from '@/components/ui/column-filter';
import InlineStatusCell from '@/components/styles/InlineStatusCell';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/auth';
import { hasAnyRole } from '@/lib/userRoles';
import { patchStyle } from '@/api/styles';
import type { Style, UserRole } from '@/api/types';
import { cn } from '@/lib/utils';
import { formatStyleRef } from '@/lib/styleRef';

// Enum option labels — mirror the BE Prisma enums and the same set the
// approval dialogs + SampleStateCard already use. Kept here so the
// table doesn't need to round-trip to `/api/styles/options`.
const SAMPLING_STATUS_OPTIONS = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'ready_for_inspection',
  'corrections_needed',
  'approved_for_production',
] as const;

const SAMPLE_APPROVAL_OPTIONS = [
  'approved_for_production',
  'under_review_corrections',
  'pattern_correction_approved',
] as const;

// Roles allowed to flip status cells inline — matches the styles WRITE
// set on the BE. Viewers see plain read-only badges.
const WRITE_ROLES: readonly UserRole[] = [
  'admin',
  'sampling_editor',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'operator',
] as const;

// Row-action role gates — mirror the BE guards (and the dashboard
// StylesInFlightTable) so /styles never shows a button that 403s:
//  • Approve (Approval #1) → APPROVE set (Option A drops sampling_editor).
//  • Inline Park → DRAFT rows only, reusing WRITE_ROLES (post-approval
//    "Withdraw" is a detail-page action, not a queue button).
// BE still enforces; this is UX.
const APPROVER_ROLES: readonly UserRole[] = [
  'admin',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'china_import_approver',
] as const;

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
  /** Row-level Approve action — null hides the button. */
  onApprove?: (style: Style) => void;
  /** Row-level Park action — null hides the button. */
  onPark?: (style: Style) => void;
  /** Row-level Revive action — null hides the button. */
  onRevive?: (style: Style) => void;
  /**
   * `"full"` (default) — all sampling-workflow columns (Stage, Approval,
   *   Web, Updated).
   * `"compact"` — minimal set for non-sampling flows (China Import): Style #,
   *   Working Name, Colour, Updated. Hides Stage / Approval / Web.
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
 * The submit-fork type of a style, derived from the two link columns
 * (mutually exclusive — XOR enforced on the BE):
 *   • `familyCode` set      → "Colour of <root code>"
 *   • `basedOnStyleId` set  → "Based on <code>"
 *   • neither               → "New design"
 */
function styleType(s: Style): {
  kind: 'new' | 'colour' | 'based_on';
  ref: string | null;
} {
  if (s.familyCode) return { kind: 'colour', ref: s.familyCode };
  if (s.basedOnStyleId != null)
    return { kind: 'based_on', ref: s.basedOnStyle?.styleId ?? null };
  return { kind: 'new', ref: null };
}

/**
 * Small pill in the Type column showing the submit-fork the style came
 * in through. Colour / based-on variants also carry the root code they
 * link to so the family is legible at a glance.
 */
function StyleTypePill({ style }: { style: Style }) {
  const { t } = useTranslation();
  const { kind, ref } = styleType(style);
  if (kind === 'colour') {
    return (
      <Badge variant="stitch" className="text-[10px]" title={ref ?? undefined}>
        {t('admin.styles.table.type.colourOf', {
          code: ref ?? '—',
          defaultValue: `Colour of ${ref ?? '—'}`,
        })}
      </Badge>
    );
  }
  if (kind === 'based_on') {
    return (
      <Badge variant="outline" className="text-[10px]" title={ref ?? undefined}>
        {t('admin.styles.table.type.basedOn', {
          code: ref ?? '—',
          defaultValue: `Based on ${ref ?? '—'}`,
        })}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {t('admin.styles.table.type.new', { defaultValue: 'New design' })}
    </Badge>
  );
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
  onApprove,
  onPark,
  onRevive,
  variant = 'full',
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const isCompact = variant === 'compact';
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Inline-edit gating for the status cells.
  const canEdit = hasAnyRole(user, WRITE_ROLES);

  /**
   * Wrapper around `patchStyle` that emits a toast on failure and
   * re-throws so InlineStatusCell rolls back the optimistic update.
   */
  const commitStylePatch = async (
    styleId: number,
    patch: Parameters<typeof patchStyle>[1],
  ) => {
    try {
      await patchStyle(styleId, patch);
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Could not save change.';
      toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
      throw e;
    }
  };

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
  const [excLifecycle, setExcLifecycle] = useState<string[]>([]);
  const [excSamplingStatus, setExcSamplingStatus] = useState<string[]>([]);
  const [excSampleApproval, setExcSampleApproval] = useState<string[]>([]);
  const [excColour, setExcColour] = useState<string[]>([]);

  // Distinct values come from the unfiltered rows so the popover lists
  // every value even when other filters narrow the visible set.
  const lifecycleOptions = useMemo(
    () =>
      distinct(rows, (s) => s.lifecycle, (v) =>
        t(`admin.styles.lifecycle.${v}` as const, { defaultValue: v }),
      ),
    [rows, t],
  );
  const samplingStatusOptions = useMemo(
    () =>
      distinct(rows, (s) => s.samplingStatus, (v) =>
        t(`admin.styles.samplingSteps.${v}` as const, {
          defaultValue: v.replace(/_/g, ' '),
        }),
      ),
    [rows, t],
  );
  const sampleApprovalOptions = useMemo(
    () =>
      distinct(rows, (s) => s.sampleApproval, (v) =>
        t(`admin.styles.sampleApproval.${v}` as const, {
          defaultValue: v.replace(/_/g, ' '),
        }),
      ),
    [rows, t],
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
        checkExcl(s.lifecycle, excLifecycle) &&
        checkExcl(s.samplingStatus, excSamplingStatus) &&
        checkExcl(s.sampleApproval, excSampleApproval) &&
        checkExcl(s.primaryColour, excColour),
    );
  }, [
    rows,
    excLifecycle,
    excSamplingStatus,
    excSampleApproval,
    excColour,
  ]);

  /**
   * Colour-family grouping. Build a parent → child[] index from the
   * filtered set so each parent style can render its variants as a
   * nested sub-table below its summary row. A "child" here is any
   * Style whose `parentStyleId` points at another visible Style;
   * orphan variants (parent not in the current filter) are promoted
   * back to the top level so they don't silently vanish.
   */
  const colourChildrenByParent = useMemo(() => {
    const byParent = new Map<number, Style[]>();
    const presentIds = new Set(filteredRows.map((r) => r.id));
    for (const s of filteredRows) {
      if (s.parentStyleId != null && presentIds.has(s.parentStyleId)) {
        const arr = byParent.get(s.parentStyleId) ?? [];
        arr.push(s);
        byParent.set(s.parentStyleId, arr);
      }
    }
    return byParent;
  }, [filteredRows]);

  /** Top-level rows = anything that isn't already nested under another. */
  const topLevelRows = useMemo(
    () =>
      filteredRows.filter(
        (s) =>
          s.parentStyleId == null ||
          !filteredRows.some((p) => p.id === s.parentStyleId),
      ),
    [filteredRows],
  );

  // Collapse when the row set changes (filter / tab change). Then
  // pre-expand any family that has children so the variant block is
  // visible by default — matches the PO-table screenshot pattern where
  // sub-orders are shown as soon as the family is rendered.
  useEffect(() => {
    const next = new Set<number>();
    for (const [parentId] of colourChildrenByParent) next.add(parentId);
    setExpanded(next);
  }, [colourChildrenByParent, rows]);

  const groupsWithChildren = useMemo(
    () =>
      topLevelRows.filter(
        (r) =>
          (r.variants?.length ?? 0) > 0 ||
          (colourChildrenByParent.get(r.id)?.length ?? 0) > 0,
      ),
    [topLevelRows, colourChildrenByParent],
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

  // compact = expand + style# + name + type + colour + updated + chevron
  // full    = expand + style# + name + type + stage + approval + web + updated + chevron
  const COL_COUNT = isCompact ? 7 : 9;

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
                <span className="inline-flex items-center gap-1">
                  {t('admin.styles.table.styleNo')}
                  <ColumnFilter
                    title={t('admin.styles.lifecycle.label', {
                      defaultValue: 'Lifecycle',
                    })}
                    options={lifecycleOptions}
                    excluded={excLifecycle}
                    onChange={setExcLifecycle}
                  />
                </span>
              </th>
              <th className="text-left font-medium px-3 py-2">
                {t('admin.styles.table.workingName')}
              </th>
              <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">
                {t('admin.styles.table.type.label', { defaultValue: 'Type' })}
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
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1">
                      {t('admin.styles.table.stage')}
                      {/* Stage cell renders samplingStatus — filter
                          matches what's displayed in the column. */}
                      <ColumnFilter
                        title={t('admin.styles.table.samplingStatus', {
                          defaultValue: 'Sampling status',
                        })}
                        options={samplingStatusOptions}
                        excluded={excSamplingStatus}
                        onChange={setExcSamplingStatus}
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
                    {/* Web cell is just an external-link icon — no
                        filtering needed. */}
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
              topLevelRows.map((s) => {
                const variants = s.variants ?? [];
                const colourChildren = colourChildrenByParent.get(s.id) ?? [];
                const hasChildren =
                  variants.length > 0 || colourChildren.length > 0;
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
                            {formatStyleRef(s, `(${t('admin.styles.draft')})`)}
                          </button>
                          <div className="flex gap-1 flex-wrap">
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
                        {variants.length > 0 && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            {t('admin.styles.table.variantsCount', {
                              count: variants.length,
                            })}
                          </Badge>
                        )}
                        {colourChildren.length > 0 && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px]"
                            title={[s.primaryColour, ...colourChildren.map((c) => c.primaryColour)]
                              .filter(Boolean)
                              .join(', ')}
                          >
                            {`${1 + colourChildren.length} colours`}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <StyleTypePill style={s} />
                      </td>
                      {isCompact ? (
                        <td className="px-3 py-2 hidden sm:table-cell text-[var(--color-muted-foreground)]">
                          {s.primaryColour ?? '—'}
                        </td>
                      ) : (
                        <>
                          <td
                            className="px-3 py-2 hidden lg:table-cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <InlineStatusCell
                              value={s.samplingStatus ?? ''}
                              displayLabel={
                                s.samplingStatus
                                  ? t(
                                      `admin.styles.samplingSteps.${s.samplingStatus}` as const,
                                      { defaultValue: s.samplingStatus },
                                    )
                                  : '—'
                              }
                              options={SAMPLING_STATUS_OPTIONS.map((v) => ({
                                value: v,
                                label: t(
                                  `admin.styles.samplingSteps.${v}` as const,
                                  { defaultValue: v },
                                ),
                              }))}
                              badgeVariant="stitch"
                              editable={canEdit}
                              onCommit={(next) =>
                                commitStylePatch(s.id, {
                                  samplingStatus: (next || null) as never,
                                })
                              }
                            />
                          </td>
                          <td
                            className="px-3 py-2 hidden lg:table-cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <InlineStatusCell
                              value={s.sampleApproval ?? ''}
                              displayLabel={
                                s.sampleApproval
                                  ? t(
                                      `admin.styles.sampleApproval.${s.sampleApproval}` as const,
                                      { defaultValue: s.sampleApproval },
                                    )
                                  : '—'
                              }
                              options={SAMPLE_APPROVAL_OPTIONS.map((v) => ({
                                value: v,
                                label: t(
                                  `admin.styles.sampleApproval.${v}` as const,
                                  { defaultValue: v },
                                ),
                              }))}
                              badgeVariant="success"
                              editable={canEdit}
                              onCommit={(next) =>
                                commitStylePatch(s.id, {
                                  sampleApproval: (next || null) as never,
                                })
                              }
                            />
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
                      <td
                        className="px-3 py-2 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActions
                          style={s}
                          onApprove={onApprove}
                          onPark={onPark}
                          onRevive={onRevive}
                        />
                      </td>
                    </tr>

                    {/* Colour-family children rendered as a nested
                        sub-table — matches the program/orders pattern
                        from the procurement UI. Parent owns the family
                        summary (working name + total colours); the
                        sub-table below carries per-variant Style # /
                        colour / pattern master / stage / approval /
                        actions with its own column headers. */}
                    {isOpen && colourChildren.length > 0 && (
                      <tr className="bg-[var(--color-surface-2)]/30">
                        {/* Inset the sub-table from the parent's left
                            edge so it reads as "inside" the parent
                            row, not a sibling. Mirrors the procurement
                            UI's nested-orders block. */}
                        <td
                          colSpan={COL_COUNT}
                          className="pl-10 pr-3 py-2 sm:pl-14"
                        >
                          <ColourFamilySubTable
                            parent={s}
                            children={colourChildren}
                            isCompact={isCompact}
                            onRowClick={onRowClick}
                            onStyleNoClick={onStyleNoClick}
                            onApprove={onApprove}
                            onPark={onPark}
                            onRevive={onRevive}
                          />
                        </td>
                      </tr>
                    )}

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
                          <td className="px-3 py-2 hidden sm:table-cell" />
                          <td className="px-3 py-2 text-[var(--color-muted-foreground)]">
                            {v.cuttingQty != null
                              ? `Cut ${v.cuttingQty}`
                              : '—'}
                          </td>
                          {isCompact ? (
                            <td className="px-3 py-2 hidden sm:table-cell" />
                          ) : (
                            <>
                              <td className="px-3 py-2 hidden lg:table-cell">
                                {v.samplingStatus
                                  ? t(
                                      `admin.styles.samplingSteps.${v.samplingStatus}` as const,
                                      { defaultValue: v.samplingStatus },
                                    )
                                  : '—'}
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

/**
 * Inline action cell at the end of each row. Shows Approve / Park /
 * Revive contextually based on the style's lifecycle. Falls back to a
 * chevron when no action applies so the row still reads as a link.
 *
 * onApprove/onPark/onRevive are wired by the parent page so callbacks
 * can navigate into the right dialog (sampling needs a checklist) or
 * fire a direct API call (china_import + park + revive are one-click).
 */
function RowActions({
  style,
  onApprove,
  onPark,
  onRevive,
}: {
  style: Style;
  onApprove?: (s: Style) => void;
  onPark?: (s: Style) => void;
  onRevive?: (s: Style) => void;
}) {
  const { user } = useAuth();
  const canApprove =
    style.lifecycle === 'draft' && hasAnyRole(user, APPROVER_ROLES);
  // Inline Park belongs only on DRAFT (inbox) rows — it means "decide not
  // to develop." Once a style is approved (past draft) parking a committed
  // design is a rare admin/lead "Withdraw" on the detail page, not a queue
  // button (2026-06-01 refinement, STYLE_SUBMISSION_FLOWS.md).
  const canPark =
    style.lifecycle === 'draft' && hasAnyRole(user, WRITE_ROLES);
  const canRevive =
    style.lifecycle === 'parked' && hasAnyRole(user, WRITE_ROLES);
  const hasAny =
    (canApprove && onApprove) ||
    (canPark && onPark) ||
    (canRevive && onRevive);

  if (!hasAny) {
    return (
      <ChevronRight
        size={16}
        className="text-[var(--color-muted-foreground)] inline-block"
      />
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      {canApprove && onApprove && (
        <Button
          size="sm"
          onClick={() => onApprove(style)}
          className="h-7 px-2.5 text-xs"
        >
          <CheckCircle2 size={13} />
          <span className="ml-1">Approve</span>
        </Button>
      )}
      {canRevive && onRevive && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRevive(style)}
          className="h-7 px-2.5 text-xs"
        >
          <Play size={13} />
          <span className="ml-1">Revive</span>
        </Button>
      )}
      {canPark && onPark && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPark(style)}
          className="h-7 px-2.5 text-xs"
        >
          <Pause size={13} />
          <span className="ml-1">Park</span>
        </Button>
      )}
    </div>
  );
}

/**
 * Best-effort colour-name → CSS colour. Free-text `primaryColour`
 * values come straight from the workbook ("cream", "pink", …) — we
 * don't have a master swatch table so we map a handful of common
 * names plus everything CSS recognises natively (the wide
 * <named-color> list). Unknown values fall back to a neutral grey
 * so the dot still renders.
 */
function colourSwatch(name: string | null | undefined): string {
  if (!name) return 'var(--color-muted-foreground)';
  const n = name.trim().toLowerCase();
  const overrides: Record<string, string> = {
    cream: '#f5e9c8',
    'off white': '#f5f1e6',
    offwhite: '#f5f1e6',
    natural: '#ece1c8',
    nude: '#e8c7a0',
    blush: '#f4c2c2',
    sage: '#a8b9a0',
    olive: '#708238',
    mustard: '#e1b800',
    rust: '#b7410e',
    burgundy: '#800020',
    charcoal: '#36454f',
    navy: '#0a1f44',
  };
  return overrides[n] ?? n;
}

/**
 * Nested sub-table for a colour-family. Lives inside the parent's
 * colspan'd row in the outer styles table. Has its own column header
 * row so the variant-specific fields (per-colour Style #, colour, etc.)
 * read clearly without being squeezed into the parent's columns.
 *
 * Visual treatment: tinted background + left-border accent so the
 * block reads as "inside" the parent row rather than a sibling.
 *
 * Children are rendered ASCENDING by id (BE's listInclude already
 * orders them this way); the parent itself is NOT re-rendered here —
 * it's visible in the row above.
 */
function ColourFamilySubTable({
  parent,
  children,
  isCompact,
  onRowClick,
  onStyleNoClick,
  onApprove,
  onPark,
  onRevive,
}: {
  parent: Style;
  children: Style[];
  isCompact: boolean;
  onRowClick?: (style: Style) => void;
  onStyleNoClick?: (style: Style) => void;
  onApprove?: (style: Style) => void;
  onPark?: (style: Style) => void;
  onRevive?: (style: Style) => void;
}) {
  const { t } = useTranslation();
  void parent; // (parent identity is conveyed by the row above the block)
  return (
    <div className="rounded-[var(--radius-sm)] border-l-2 border-[var(--color-primary)]/40 bg-[var(--color-background)] overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead className="bg-[var(--color-surface-2)]/60 text-[var(--color-muted-foreground)] text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left font-medium px-3 py-1.5">
              {t('admin.styles.table.styleNo')}
            </th>
            <th className="text-left font-medium px-3 py-1.5">
              {t('admin.styles.table.colour', { defaultValue: 'Colour' })}
            </th>
            {!isCompact && (
              <>
                <th className="text-left font-medium px-3 py-1.5 hidden lg:table-cell">
                  {t('admin.styles.table.stage')}
                </th>
                <th className="text-left font-medium px-3 py-1.5 hidden lg:table-cell">
                  {t('admin.styles.table.approval')}
                </th>
              </>
            )}
            <th className="text-left font-medium px-3 py-1.5">
              {t('admin.styles.table.actions', {
                defaultValue: 'Actions',
              })}
            </th>
          </tr>
        </thead>
        <tbody>
          {children.map((v) => (
            <tr
              key={v.id}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick?.(v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick?.(v);
                }
              }}
              className="border-t border-[var(--color-border)]/60 cursor-pointer hover:bg-[var(--color-muted)] focus:outline-none focus-visible:bg-[var(--color-muted)]"
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStyleNoClick?.(v);
                  }}
                  className="text-left font-mono text-[var(--color-primary)] hover:underline"
                >
                  {formatStyleRef(v, `(${t('admin.styles.draft')})`)}
                </button>
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--color-border)]"
                    style={{ background: colourSwatch(v.primaryColour) }}
                  />
                  {v.primaryColour ?? '—'}
                </span>
              </td>
              {!isCompact && (
                <>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {v.samplingStatus
                      ? t(
                          `admin.styles.samplingSteps.${v.samplingStatus}` as const,
                          { defaultValue: v.samplingStatus },
                        )
                      : '—'}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {v.sampleApproval
                      ? t(
                          `admin.styles.sampleApproval.${v.sampleApproval}` as const,
                          { defaultValue: v.sampleApproval },
                        )
                      : '—'}
                  </td>
                </>
              )}
              <td
                className="px-3 py-2 whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                <RowActions
                  style={v}
                  onApprove={onApprove}
                  onPark={onPark}
                  onRevive={onRevive}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
