import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, ImageOff, Link2, Pause, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Style, StyleLifecycle } from '@/api/types';
import { formatStyleRef } from '@/lib/styleRef';
import { cn } from '@/lib/utils';

/**
 * Shared sampling/styles queue table — the single component behind BOTH
 * the dashboard "Styles in flight" surface and the Sampling registry, so
 * the two read identically and users aren't confused by two table designs.
 *
 * It implements the approved Stitch "Sampling Queue — Compact View" chrome
 * (bordered card + soft shadow, sticky uppercase label-caps header, dense
 * rows with a hover-revealed action cluster, an explanatory footer note),
 * mapped onto the app's brand-blue design tokens so it sits with the rest
 * of the shipped UI. Only the TYPE pill follows the Stitch accent palette.
 *
 * The shell is column-CONFIGURABLE: each page passes its own
 * {@link QueueColumn}[] built from the exported cell helpers
 * (`StyleRefLink`, `TypePill`, `ColourCell`, `ApproverOrPanelCell`, `AgeCell`,
 * `LifecycleBadge`, `Thumbnail`). That keeps the chrome identical while
 * letting the dashboard show operational columns (factory / stage) and the
 * Sampling queue show submission columns (type / colour / reviewer).
 *
 * Layout is intentionally FLAT — colour and based-on styles are their own
 * rows carrying a TYPE pill (per the workspace submission-flow spec,
 * docs/STYLE_SUBMISSION_FLOWS.md in the erp workspace root), replacing the
 * old expand/collapse colour-family nesting.
 */
export interface QueueColumn<R> {
  /** Stable key for React + the header cell. */
  key: string;
  /** Already-translated header label (or node). */
  header: ReactNode;
  /** Cell renderer for a row. */
  cell: (row: R) => ReactNode;
  /** Right-align (used for AGE / numeric columns). */
  align?: 'left' | 'right';
  /**
   * Fixed column width (any CSS width — `'120px'`, `'36%'`). When ANY column
   * sets this the table switches to `table-fixed` layout, so columns honour
   * these widths instead of stretching to their content — that's what stops
   * a long cell from forcing horizontal scroll. Text cells should `truncate`.
   */
  width?: string;
  /** Extra cell classes — e.g. responsive hiding `hidden lg:table-cell`. */
  className?: string;
  /** Extra header classes (mirrors `className` for responsive hiding). */
  headerClassName?: string;
}

interface StyleQueueTableProps<R> {
  columns: QueueColumn<R>[];
  rows: R[];
  getRowKey: (row: R) => string | number;
  loading?: boolean;
  error?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  errorLabel?: string;
  onRowClick?: (row: R) => void;
  /**
   * Rightmost hover-revealed action cluster (Approve / Park / …). Rendered
   * in its own trailing cell. Return null for rows with no actions — the
   * cell still reserves space so columns stay aligned.
   */
  renderActions?: (row: R) => ReactNode;
  /** Fixed width for the trailing actions column (CSS width). Only applies
   *  when the table is in fixed layout (any column declares a `width`). */
  actionsWidth?: string;
  /** Subtle row highlight — e.g. un-reviewed inbox submissions. */
  rowAccent?: (row: R) => boolean;
  /** Explanatory note rendered under the table (Stitch footer copy). */
  footerNote?: ReactNode;
  /** Drop the table's own card chrome (border / rounding / shadow) — used when
   *  the table is nested inside an outer panel that already provides them. */
  bare?: boolean;
}

export function StyleQueueTable<R>({
  columns,
  rows,
  getRowKey,
  loading = false,
  error = false,
  loadingLabel = 'Loading…',
  emptyLabel = 'No rows.',
  errorLabel = "Couldn't load.",
  onRowClick,
  renderActions,
  actionsWidth,
  rowAccent,
  footerNote,
  bare = false,
}: StyleQueueTableProps<R>) {
  // +1 for the trailing actions column when present.
  const colSpan = columns.length + (renderActions ? 1 : 0);

  // Any declared column width ⇒ fixed layout, so widths are honoured and a
  // long cell truncates instead of stretching the table into a scroll.
  const isFixed = columns.some((c) => c.width) || !!actionsWidth;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'overflow-x-auto',
          // Own card chrome unless nested in an outer panel (bare).
          !bare &&
            'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm',
        )}
      >
        <table
          className={cn(
            'w-full border-collapse text-left text-[13px]',
            isFixed ? 'table-fixed' : 'whitespace-nowrap',
          )}
        >
          <thead className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-2 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)] whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
              {renderActions && (
                <th
                  style={actionsWidth ? { width: actionsWidth } : undefined}
                  className="px-4 py-2 text-right text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]"
                />
              )}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <>
                {/* Shimmer rows mirror the real column layout so the table
                    doesn't reflow when data lands. The shimmer is aria-hidden,
                    so announce the load to assistive tech with an sr-only row. */}
                <tr className="sr-only">
                  <td colSpan={colSpan}>{loadingLabel}</td>
                </tr>
                <SkeletonRows
                  rowCount={6}
                  columns={columns}
                  hasActions={!!renderActions}
                />
              </>
            )}
            {!loading && error && (
              <StateRow colSpan={colSpan}>{errorLabel}</StateRow>
            )}
            {!loading && !error && rows.length === 0 && (
              <StateRow colSpan={colSpan}>{emptyLabel}</StateRow>
            )}
            {!loading &&
              !error &&
              rows.map((row) => {
                const clickable = !!onRowClick;
                return (
                  <tr
                    key={getRowKey(row)}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    className={cn(
                      'group border-b border-[var(--color-border)] text-[var(--color-foreground)] transition-colors',
                      clickable && 'cursor-pointer',
                      'hover:bg-[var(--color-muted)] focus-within:bg-[var(--color-muted)]',
                      rowAccent?.(row) && 'bg-[var(--color-primary)]/[0.04]',
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-2',
                          col.align === 'right' && 'text-right',
                          col.className,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {renderActions && (
                      <td className="px-4 py-2 text-right">
                        {/* Always visible — the Approve / Park cluster is a
                            primary affordance, not a hover-reveal, so it's
                            reachable without hunting (and on touch). */}
                        <div className="flex items-center justify-end gap-2">
                          {renderActions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {footerNote && (
        <p className="text-[12px] text-[var(--color-muted-foreground)]">
          {footerNote}
        </p>
      )}
    </div>
  );
}

/**
 * Loading placeholder rows. One shimmer bar per column, aligned and right-/
 * left-justified to match the real cells, so the table holds its shape while
 * data loads instead of collapsing to a single centred "Loading…" line.
 */
function SkeletonRows<R>({
  rowCount,
  columns,
  hasActions,
}: {
  rowCount: number;
  columns: QueueColumn<R>[];
  hasActions: boolean;
}) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--color-border)]">
          {columns.map((col) => (
            <td
              key={col.key}
              className={cn(
                'px-4 py-3',
                col.align === 'right' && 'text-right',
                col.className,
              )}
            >
              <Skeleton
                className={cn(
                  'h-4',
                  col.align === 'right' ? 'ml-auto w-10' : 'w-3/4',
                )}
              />
            </td>
          ))}
          {hasActions && (
            <td className="px-4 py-3 text-right">
              <Skeleton className="ml-auto h-7 w-16" />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

function StateRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-8 text-center text-[var(--color-muted-foreground)]"
      >
        {children}
      </td>
    </tr>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Shared tab bar — Stitch "Inbox 7 · In sampling 12 · …" treatment.
 * Both pages drive their own tab state; this just renders the chrome.
 * ────────────────────────────────────────────────────────────────── */

export interface QueueTab<K extends string> {
  key: K;
  label: string;
  /** Optional count pill; omit/undefined to hide. */
  count?: number;
}

export function QueueTabs<K extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: QueueTab<K>[];
  active: K;
  onSelect: (key: K) => void;
}) {
  return (
    <div className="flex gap-6 overflow-x-auto border-b border-[var(--color-border)]">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 text-[14px] font-semibold transition-colors',
              isActive
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--color-muted-foreground)]">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Cell building blocks — compose these into QueueColumn.cell renderers.
 * ────────────────────────────────────────────────────────────────── */

/** Monospace Style #/draft link. Stops propagation so the row's own
 *  click handler doesn't double-fire (both go to the detail page, but
 *  the explicit link keeps the affordance + keyboard focus). */
export function StyleRefLink({
  style,
  onClick,
}: {
  style: { styleId: string | null; draftNo: number | null };
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={formatStyleRef(style)}
      className="block max-w-full truncate text-left font-mono text-[13px] text-[var(--color-primary)] hover:underline"
    >
      {formatStyleRef(style)}
    </button>
  );
}

/** 28px square thumbnail with a graceful placeholder. */
export function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]"
      >
        <ImageOff size={13} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className="h-7 w-7 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] object-cover"
    />
  );
}

/**
 * The submission-fork TYPE pill — New design / Colour of X / Based on X /
 * Relive of X. Derives the kind from familyCode (colour) → basedOnStyleId
 * (based-on) → oldStyleId (relive); none ⇒ new. Follows the Stitch accent
 * palette: new = filled primary, colour = amber, based-on = blue, relive =
 * violet.
 */
export function TypePill({ style }: { style: Style }) {
  const { t } = useTranslation();
  const base =
    'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium';

  if (style.familyCode) {
    return (
      <span
        className={cn(
          base,
          'border border-amber-200 bg-amber-100 text-amber-900',
        )}
        title={style.familyCode}
      >
        {t('admin.styles.table.type.colourOf', { code: style.familyCode })}
      </span>
    );
  }
  if (style.basedOnStyleId != null) {
    const ref = style.basedOnStyle?.styleId ?? undefined;
    return (
      <span
        className={cn(base, 'border border-blue-200 bg-blue-100 text-blue-900')}
        title={ref}
      >
        {t('admin.styles.table.type.basedOn', { code: ref ?? '—' })}
      </span>
    );
  }
  if (style.oldStyleId) {
    // Prefer the resolved source's current code; fall back to the typed code.
    const ref = style.relivedFromStyle?.styleId ?? style.oldStyleId;
    return (
      <span
        className={cn(
          base,
          'border border-violet-200 bg-violet-100 text-violet-900',
        )}
        title={ref}
      >
        {t('admin.styles.table.type.relive', { code: ref })}
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
      )}
    >
      {t('admin.styles.table.type.new')}
    </span>
  );
}

/** Colour swatch dot + name. */
export function ColourCell({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-[var(--color-muted-foreground)]">—</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--color-border)]"
        style={{ background: colourSwatch(name) }}
      />
      <span className="text-[var(--color-foreground-3)]">{name}</span>
    </span>
  );
}

/** Reviewer avatar (initials) + name; "—" when unknown. */
export function ReviewerCell({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-[var(--color-muted-foreground)]">—</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--color-surface-2)] text-[10px] font-bold text-[var(--color-foreground)]"
      >
        {initials(name)}
      </span>
      <span className="text-[var(--color-foreground)]">{name}</span>
    </span>
  );
}

/**
 * Sampling-queue Reviewer column. There's no per-style reviewer
 * assignment — the cell answers "who approves this submission?":
 *   • approver present  → a single avatar + the approver's name (it's
 *     already been approved by them).
 *   • no approver yet   → a compact avatar stack of up to 3 panel members'
 *     initials ("Pa Pr Ru"), titled with their full names, conveying
 *     "reviewed by the panel". Empty panel renders "—".
 */
export function ApproverOrPanelCell({
  approver,
  panel,
}: {
  approver: { name: string } | null | undefined;
  panel: { id: number; name: string }[];
}) {
  if (approver?.name) {
    return <ReviewerCell name={approver.name} />;
  }
  if (panel.length === 0) {
    return <span className="text-[var(--color-muted-foreground)]">—</span>;
  }
  const shown = panel.slice(0, 3);
  return (
    <span
      className="flex items-center -space-x-1"
      title={panel.map((p) => p.name).join(', ')}
    >
      {shown.map((p) => (
        <span
          key={p.id}
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-surface)] bg-[var(--color-surface-2)] text-[10px] font-bold text-[var(--color-foreground)]"
        >
          {initials(p.name)}
        </span>
      ))}
      {panel.length > shown.length && (
        <span className="pl-2 text-[11px] text-[var(--color-muted-foreground)]">
          +{panel.length - shown.length}
        </span>
      )}
    </span>
  );
}

/** Compact age, right-aligned ("3d", "2h", "now"). */
export function AgeCell({ iso }: { iso: string | null | undefined }) {
  return (
    <span className="tabular-nums text-[var(--color-muted-foreground)]">
      {compactAge(iso)}
    </span>
  );
}

/** Lifecycle pill — shared variant mapping so it reads identically
 *  on the dashboard and the Sampling queue. */
export function LifecycleBadge({ lifecycle }: { lifecycle: StyleLifecycle }) {
  const { t } = useTranslation();
  return (
    <Badge variant={lifecycleVariant(lifecycle)} className="text-[10px]">
      {t(`admin.styles.lifecycle.${lifecycle}` as const, {
        defaultValue: lifecycle,
      })}
    </Badge>
  );
}

/* ── Action buttons (Stitch: ghost Park + filled Approve) ─────────── */

export function ApproveButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded bg-[var(--color-primary)] px-2 py-1 text-[12px] font-medium text-[var(--color-primary-foreground)] transition-colors hover:opacity-90"
    >
      <Check size={14} />
      {t('dashboard.table.actions.approve', { defaultValue: 'Approve' })}
    </button>
  );
}

/**
 * Filled-primary row action — the row's "next step" (Approve sample, Mark
 * EasyEcom done, Go live, …). Same weight as {@link ApproveButton} but with a
 * caller-supplied label (and optional icon), so the primary action reads as
 * the action regardless of which lifecycle stage the row is in. Park / Revive
 * stay on the muted {@link GhostActionButton}.
 */
export function PrimaryActionButton({
  onClick,
  children,
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded bg-[var(--color-primary)] px-2 py-1 text-[12px] font-medium text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-primary-hover)]"
    >
      {icon}
      {children}
    </button>
  );
}

export function GhostActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: 'park' | 'revive' | 'link';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded border border-transparent px-2 py-1 text-[12px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
    >
      {icon === 'park' && <Pause size={13} />}
      {icon === 'revive' && <Play size={13} />}
      {icon === 'link' && <Link2 size={13} />}
      {children}
    </button>
  );
}

/** Trailing affordance for rows with no actions, so the cell isn't empty. */
export function RowChevron() {
  return (
    <ChevronRight
      size={16}
      className="inline-block text-[var(--color-muted-foreground)]"
    />
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Pure helpers (exported for reuse / tests).
 * ────────────────────────────────────────────────────────────────── */

export function lifecycleVariant(l: StyleLifecycle) {
  if (l === 'sample_approved' || l === 'dispatched' || l === 'live')
    return 'success';
  if (l === 'parked' || l === 'archived') return 'outline';
  if (
    l === 'qc' ||
    l === 'in_pd' ||
    l === 'in_sampling' ||
    l === 'cataloguing'
  )
    return 'stitch';
  return 'secondary';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '');
}

/** Short relative age — "now", "5m", "3h", "2d", "4w", "3mo", "2y". */
export function compactAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 45) return 'now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(day / 365)}y`;
}

/**
 * Map a colour NAME to a CSS colour for the swatch dot. Tries a small
 * override table for fashion colours CSS doesn't know, then falls back
 * to the raw name (CSS named-colour list); unknown ⇒ neutral grey so the
 * dot still renders. Mirrors the legacy StylesTable helper.
 */
export function colourSwatch(name: string | null | undefined): string {
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
    indigo: '#4b0082',
  };
  return overrides[n] ?? n;
}
