import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  Link2,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { useToast } from '@/components/ui/toast';
import Approval1Dialog from '@/components/styles/Approval1Dialog';
import ParkDialog from '@/components/styles/ParkDialog';
import {
  StyleQueueTable,
  QueueTabs,
  StyleRefLink,
  ColourCell,
  compactAge,
  ApproveButton,
  GhostActionButton,
  PrimaryActionButton,
  RowChevron,
  type QueueColumn,
} from '@/components/styles/StyleQueueTable';
import {
  getDashboardStyles,
  type DashboardStyleRow,
  type DashboardStyleTab,
} from '@/api/dashboard';
import {
  approveStyle,
  parkStyle,
  patchStyle,
  setEasyecomDone,
  setMarketplaceListing,
  sampleApproveStyle,
  startCataloguing,
  type SamplingStatus,
  type GoLiveChannel,
  type SampleApproveStyleBody,
} from '@/api/styles';
import type { StyleChannelListing } from '@/api/types';
import GoLiveDialog from '@/components/styles/GoLiveDialog';
import SampleApproveDialog from '@/components/styles/SampleApproveDialog';
import { useAuth } from '@/context/auth';
import {
  hasAnyRole,
  PD_WRITE_ROLES,
  APPROVER_ROLES,
  ADMIN_ROLES,
  CATALOGUER_WRITE_ROLES,
} from '@/lib/userRoles';
import { useDebounced } from '@/lib/useDebounced';
import { formatStyleRef } from '@/lib/styleRef';

/**
 * Self-contained Home content surface — the per-style "Styles in flight"
 * table. Owns its own tab + (debounced) search state and fetches its own
 * data via `getDashboardStyles`. Renders the shared `StyleQueueTable` so
 * the dashboard and the Sampling registry share one table design; PD
 * styles carry no lots, so STAGE is a coarse lifecycle/sampling/production
 * pill — never a unit-level X/Y (see docs/DASHBOARD_REDESIGN.md).
 */

interface Props {
  /** Seed the starting tab — Home passes it from a `?tab=` query param. */
  initialTab?: DashboardStyleTab;
  /** Activity window (YYYY-MM-DD) from the shared dashboard date control. */
  from?: string;
  to?: string;
  /** Commit a new activity window — wires the in-card date filter back to the
   *  Home's `tableFrom`/`tableTo` state. When given, the filter renders inside
   *  the table card; omit to hide it. */
  onDateApply?: (from: string, to: string) => void;
  /** Upper bound for the in-card date filter (YYYY-MM-DD). */
  maxDate?: string;
  /**
   * Called after a successful inline approve/park (in addition to the
   * table's own refetch) so the Home can refresh its summary cards.
   */
  onActionDone?: () => void;
}

// `needs_attention` is the FIRST chip — it's the approver's queue (drafts
// awaiting Approval #1 + in-sampling awaiting Approval #2), the exact set the
// "Pending approvals" summary card counts, so the card lands on a highlighted
// tab instead of a chip-less filter.
const TABS: DashboardStyleTab[] = [
  'needs_attention',
  'all',
  'draft',
  'sampling',
  'cataloguing',
  'live',
];

// Rows per page in the in-flight feed. 50 keeps the smaller tabs on a single
// page while still paginating the larger "All" list (BE caps `take` at 200).
const PAGE_SIZE = 50;

// Roles allowed to inline-edit the sampling Stage — the styles write set on
// the BE (PD_WRITE_ROLES, incl. operator). Park has its own gate (see canPark).
const INLINE_WRITE_ROLES = PD_WRITE_ROLES;

// Sampling-status options for the inline Stage editor — the in-progress
// WORKING steps only. The terminal outcomes (sign-off / corrections) are NOT
// here: those go through the Approve-sample dialog (the single sign-off path),
// not a silent dropdown set. Labels render via `admin.styles.samplingSteps.*`.
const SAMPLING_STATUS_OPTIONS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'ready_for_inspection',
];

/**
 * A two-state status pill (e.g. EasyEcom Done/Pending). Done = filled green,
 * Pending = neutral outline. Clickable for PD writers (toggles + stops row
 * navigation); a static pill for everyone else. Reads as a status, matching
 * the marketplace badges in the adjacent column.
 */
function StatusPill({
  on,
  onLabel,
  offLabel,
  canEdit,
  onToggle,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  canEdit: boolean;
  onToggle: (next: boolean) => void;
}) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors';
  const tone = on
    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
    : 'bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]';
  const content = (
    <>
      {on && <Check size={12} />}
      {on ? onLabel : offLabel}
    </>
  );
  if (!canEdit) {
    return <span className={cn(base, tone)}>{content}</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(!on);
      }}
      className={cn(base, tone, 'hover:opacity-80')}
    >
      {content}
    </button>
  );
}

// Per-channel brand chip: a small coloured square with the channel's initial
// (Myntra red, Amazon amber, …). Keeps the marketplace cell scannable.
const CHANNEL_BRAND: Record<string, { bg: string; fg: string; ch: string }> = {
  myntra: { bg: '#ef4444', fg: '#ffffff', ch: 'M' },
  nykaa: { bg: '#e91e8c', fg: '#ffffff', ch: 'N' },
  amazon: { bg: '#ff9900', fg: '#1a1a1a', ch: 'A' },
  nowi_shopify: { bg: '#22c55e', fg: '#ffffff', ch: 'S' },
  other: { bg: '#64748b', fg: '#ffffff', ch: '•' },
};

/**
 * Row thumbnail (80px) that pops a large preview on hover. The preview is
 * portalled to <body> so the table's `overflow-x-auto` can't clip it, and
 * positioned to the right of the cell (flipping left near the viewport edge).
 */
function HoverThumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const SIZE = 240;
    const M = 8; // viewport margin
    // Prefer the right of the cell; flip to the left if it would overflow.
    const left =
      r.right + 12 + SIZE < window.innerWidth
        ? r.right + 12
        : r.left - 12 - SIZE;
    // Center on the row, then clamp so the preview never runs off the top or
    // bottom of the viewport (fixes the last-rows-clipped case).
    const rawTop = r.top + r.height / 2 - SIZE / 2;
    const top = Math.max(M, Math.min(rawTop, window.innerHeight - SIZE - M));
    setPos({ top, left });
    setHover(true);
  };
  const hide = () => setHover(false);

  const hasImg = !!src && !broken;
  return (
    <div
      ref={ref}
      onMouseEnter={hasImg ? show : undefined}
      onMouseLeave={hide}
      className="inline-block"
    >
      {hasImg ? (
        <img
          src={src}
          alt={alt}
          width={80}
          height={80}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-20 w-20 shrink-0 cursor-zoom-in rounded-[var(--radius-sm)] border border-[var(--color-border)] object-cover transition-transform"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]"
        >
          <ImageOff size={26} />
        </span>
      )}
      {hover &&
        hasImg &&
        pos &&
        createPortal(
          <div
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-[60] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]"
          >
            <img src={src} alt={alt} className="h-60 w-60 object-cover" />
          </div>,
          document.body,
        )}
    </div>
  );
}

function ChannelLogo({ channel }: { channel: string }) {
  const b = CHANNEL_BRAND[channel] ?? CHANNEL_BRAND.other;
  return (
    <span
      aria-hidden
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold"
      style={{ background: b.bg, color: b.fg }}
    >
      {b.ch}
    </span>
  );
}

/**
 * Status pill with a leading dot — e.g. "• LIVE". `tone` maps to the app's
 * semantic tokens so it reads consistently with the rest of the UI.
 */
function DotStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'live' | 'pending' | 'neutral';
}) {
  // Bordered pill (matches the Style-Tracking mock): a subtle tone-tinted
  // border + pale fill + a brighter accent dot than the label text.
  const cfg: Record<typeof tone, { box: string; dot: string }> = {
    live: {
      box: 'border-[var(--color-success)]/30 bg-[var(--color-success-bg)] text-[var(--status-ready-ink)]',
      dot: 'bg-[var(--color-success)]',
    },
    pending: {
      box: 'border-[var(--color-warning)]/40 bg-[var(--color-warning-bg)] text-[var(--status-rework-ink)]',
      dot: 'bg-[var(--color-warning)]',
    },
    neutral: {
      box: 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]',
      dot: 'bg-[var(--color-muted-foreground)]',
    },
  };
  const c = cfg[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        c.box,
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {label}
    </span>
  );
}

/**
 * Two-line metric cell — a bold primary line ("2d live") + a muted "Upd: Xd
 * ago" subline. Used by the go-to-market tabs where the row's age-in-state is
 * the at-a-glance signal.
 */
function MetricCell({
  primaryIso,
  primarySuffix,
  updatedIso,
}: {
  primaryIso: string | null;
  primarySuffix: string;
  updatedIso: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-bold text-[var(--color-foreground)] tabular-nums">
        {primaryIso ? `${compactAge(primaryIso)} ${primarySuffix}` : '—'}
      </span>
      <span className="text-[11px] text-[var(--color-muted-foreground)]">
        {t('dashboard.table.updatedAgo', {
          age: compactAge(updatedIso),
          defaultValue: `Upd: ${compactAge(updatedIso)}`,
        })}
      </span>
    </div>
  );
}

export default function StylesInFlightTable({
  initialTab = 'all',
  from,
  to,
  onDateApply,
  maxDate,
  onActionDone,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<DashboardStyleTab>(initialTab);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounced(searchText, 300);

  const [rows, setRows] = useState<DashboardStyleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Pagination — page through the feed `PAGE_SIZE` at a time. `total` drives
  // the "Showing X–Y of Z" label + the prev/next enabled state.
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);

  // Inline action targets — opening either dialog stashes the row.
  const [approvalTarget, setApprovalTarget] =
    useState<DashboardStyleRow | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [parkTarget, setParkTarget] = useState<DashboardStyleRow | null>(null);
  const [parkBusy, setParkBusy] = useState(false);
  // Sample sign-off (Approval #2) — opens the shared verdict dialog.
  const [sampleApproveTarget, setSampleApproveTarget] =
    useState<DashboardStyleRow | null>(null);
  const [sampleApproveBusy, setSampleApproveBusy] = useState(false);

  // Add-listings — opens the SHARED channel+link dialog (same one the workspace
  // uses) and records each pick as a prepared listing. Going live happens when
  // EasyEcom is marked done, not here.
  const [listTarget, setListTarget] = useState<DashboardStyleRow | null>(null);
  const [listBusy, setListBusy] = useState(false);

  // If Home re-seeds the tab from a fresh `?tab=` deep link, follow it.
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getDashboardStyles({
        tab,
        search: debouncedSearch.trim() || undefined,
        from,
        to,
        skip,
        take: PAGE_SIZE,
      });
      setRows(res.rows);
      setTotal(res.page.total);
    } catch {
      setRows([]);
      setTotal(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, from, to, skip]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to the first page whenever the result SET changes (tab / search /
  // date window) — otherwise a stale `skip` could land past the last page.
  useEffect(() => {
    setSkip(0);
  }, [tab, debouncedSearch, from, to]);

  // Refetch the table AND let the Home refresh its cards.
  const afterAction = () => {
    void load();
    onActionDone?.();
  };

  // The Style detail route — matches StylesRegistry.tsx's row link. Stash the
  // active tab as `from` so the workspace back button returns here, to this
  // exact bucket, rather than the dashboard default.
  const openStyle = (row: DashboardStyleRow) =>
    navigate(`/styles/${row.styleId ?? row.id}`, {
      state: { from: `/?tab=${tab}` },
    });

  // Mirror the active tab into ?tab= so a refresh or shared link reopens
  // the selected bucket (not the stale deep-linked one) — matches the
  // Sampling registry's behaviour.
  const selectTab = (next: DashboardStyleTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const canApprove = (row: DashboardStyleRow) =>
    row.lifecycle === 'draft' && hasAnyRole(user, APPROVER_ROLES);

  // Park gate (mirrors the BE): an admin may park at ANY stage (a live style is
  // pulled off the market); a non-admin approver (e.g. sampling_lead) may park
  // during the sampling phase (draft or in_sampling). Parked/archived rows
  // can't be parked again.
  const canPark = (row: DashboardStyleRow) =>
    row.lifecycle !== 'parked' &&
    row.lifecycle !== 'archived' &&
    (hasAnyRole(user, ADMIN_ROLES) ||
      ((row.lifecycle === 'draft' || row.lifecycle === 'in_sampling') &&
        hasAnyRole(user, APPROVER_ROLES)));

  const stageLabel = (row: DashboardStyleRow): string => {
    if (row.lifecycle === 'in_sampling' && row.samplingStatus) {
      return t(`admin.styles.samplingSteps.${row.samplingStatus}` as const, {
        defaultValue: row.samplingStatus.replace(/_/g, ' '),
      });
    }
    if (row.lifecycle === 'in_pd' && row.productionStatus) {
      return t(
        `dashboard.table.productionStatus.${row.productionStatus}` as const,
        {
          defaultValue: row.productionStatus.replace(/_/g, ' '),
        },
      );
    }
    return '';
  };

  // Inline sampling-status edits are gated on the PD write set (incl. operator).
  // Non-writers see read-only cells.
  const canWriteInline = hasAnyRole(user, INLINE_WRITE_ROLES);

  // The cataloguing write (Mark EasyEcom done) admits the narrow `cataloguer`
  // too — its whole remit. A superset of PD writers; NOT the sampling dropdown.
  const canCataloguingWrite = hasAnyRole(user, CATALOGUER_WRITE_ROLES);

  // Cataloguing → live is now cataloguer/operator work: add listings (channel
  // + link), then mark EasyEcom done — the latter auto-promotes the prepared
  // listings to live. Both are CATALOGUER_WRITE; no approver gate on going live.
  //   • "Add listings"   — list channels + links (cataloguing or live row)
  //   • "Mark EasyEcom done" — the go-live trigger (requires a listed channel)
  const canMarkEasyecom = (row: DashboardStyleRow) =>
    row.lifecycle === 'cataloguing' && !row.easyecomDone && canCataloguingWrite;
  const canAddListings = (row: DashboardStyleRow) =>
    (row.lifecycle === 'cataloguing' || row.lifecycle === 'live') &&
    canCataloguingWrite;

  // Mark the EasyEcom checkpoint done — the go-live trigger (cataloguer/
  // operator). The BE auto-promotes the listed channels to live, so the row
  // leaves the Cataloguing tab on the next load. Optimistic; revert on error
  // (e.g. the BE 400 when no channel is listed yet).
  const markEasyecomDone = (row: DashboardStyleRow) => {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, easyecomDone: true } : r)),
    );
    setEasyecomDone(row.id, true)
      .then(() => {
        toast.show(
          t('dashboard.table.toast.easyecomDone', {
            defaultValue: 'EasyEcom marked done.',
          }),
          'success',
        );
      })
      .catch(() => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, easyecomDone: false } : r,
          ),
        );
        toast.show(
          t('dashboard.table.toast.checkpointError', {
            defaultValue: 'Could not update checkpoint.',
          }),
          'error',
        );
      });
  };

  // Open the shared channel+link dialog to add listings (no precondition —
  // listing is independent of EasyEcom; the BE enforces order at the EasyEcom
  // step). Taking a channel offline lives in the Style workspace (captures a
  // reason).
  const openListings = (row: DashboardStyleRow) => setListTarget(row);

  // Record each pick as a prepared listing (channel + link). Promotion to live
  // happens when EasyEcom is marked done; on a style that's already live the BE
  // lists the new channel live straight away. Refetch so the rows + cards sync.
  const confirmListings = (channels: GoLiveChannel[]) => {
    if (!listTarget) return;
    const row = listTarget;
    setListBusy(true);
    Promise.all(
      channels.map((ch) =>
        setMarketplaceListing(row.id, {
          channel: ch.channel,
          listed: true,
          listingUrl: ch.listingUrl,
        }),
      ),
    )
      .then(() => {
        setListTarget(null);
        toast.show(
          t('dashboard.table.toast.listingsSaved', {
            defaultValue: 'Listings saved.',
          }),
          'success',
        );
        afterAction();
      })
      .catch((e: unknown) => {
        const m =
          (e as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ??
          t('dashboard.table.toast.listingsError', {
            defaultValue: 'Could not save listings.',
          });
        toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
      })
      .finally(() => setListBusy(false));
  };

  // Inline sampling-status change (working steps only) — optimistic, persisted
  // via PATCH /styles/:id. Quiet success toast on save; revert on error.
  const changeSamplingStatus = (
    row: DashboardStyleRow,
    next: SamplingStatus,
  ) => {
    const prevStatus = row.samplingStatus;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, samplingStatus: next } : r)),
    );
    patchStyle(row.id, { samplingStatus: next })
      .then(() => {
        toast.show(
          t('dashboard.table.toast.statusSaved', {
            defaultValue: 'Stage updated.',
          }),
          'success',
        );
      })
      .catch(() => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, samplingStatus: prevStatus } : r,
          ),
        );
        toast.show(
          t('dashboard.table.toast.statusError', {
            defaultValue: 'Could not update status.',
          }),
          'error',
        );
      });
  };

  // Sample sign-off (Approval #2) — approver-only, opens the shared verdict
  // dialog (same as the workspace). Only in_sampling, non-china-import rows.
  const canSampleApprove = (row: DashboardStyleRow) =>
    row.lifecycle === 'in_sampling' &&
    row.source !== 'china_import' &&
    hasAnyRole(user, APPROVER_ROLES);

  const confirmSampleApprove = (body: SampleApproveStyleBody) => {
    if (!sampleApproveTarget) return;
    const row = sampleApproveTarget;
    setSampleApproveBusy(true);
    sampleApproveStyle(row.id, body)
      .then(() => {
        setSampleApproveTarget(null);
        toast.show(
          t('dashboard.table.toast.sampleApproved', {
            defaultValue: 'Sample verdict recorded.',
          }),
          'success',
        );
        afterAction();
      })
      .catch((e: unknown) => {
        const m =
          (e as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ??
          t('dashboard.table.toast.sampleApproveError', {
            defaultValue: 'Could not record the verdict.',
          });
        toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
      })
      .finally(() => setSampleApproveBusy(false));
  };

  // Start cataloguing — approver-only, sample_approved → cataloguing. Plain
  // action (no dialog), mirroring the workspace button.
  const canStartCataloguing = (row: DashboardStyleRow) =>
    row.lifecycle === 'sample_approved' &&
    row.source !== 'china_import' &&
    hasAnyRole(user, APPROVER_ROLES);

  const doStartCataloguing = (row: DashboardStyleRow) => {
    startCataloguing(row.id)
      .then(() => {
        toast.show(
          t('dashboard.table.toast.cataloguingStarted', {
            defaultValue: 'Cataloguing started.',
          }),
          'success',
        );
        afterAction();
      })
      .catch((e: unknown) => {
        const m =
          (e as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ??
          t('dashboard.table.toast.actionError', {
            defaultValue: 'Could not complete the action.',
          });
        toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
      });
  };

  // ── Shared grammar: IMG · Style/Name · [context] · Status · Metrics ──
  // A thumbnail in its own narrow column (split out of the Style cell).
  const imgColumn: QueueColumn<DashboardStyleRow> = {
    key: 'img',
    header: t('dashboard.table.columns.img', { defaultValue: 'Img' }),
    // 80px image + the cell's horizontal padding needs ~116px of column.
    width: '116px',
    cell: (row) => (
      <HoverThumbnail
        src={row.thumbnail}
        alt={row.workingName ?? formatStyleRef(row)}
      />
    ),
  };

  // Style # / draft link + working name (no thumbnail — IMG owns that now).
  const styleNameColumn: QueueColumn<DashboardStyleRow> = {
    key: 'styleName',
    header: t('dashboard.table.columns.styleName', {
      defaultValue: 'Style ID / Name',
    }),
    width: '280px',
    cell: (row) => (
      // Cap the name block at a fixed width so a long working name truncates
      // instead of stretching the column on wide screens.
      <div className="flex max-w-[248px] min-w-0 flex-col">
        <StyleRefLink style={row} onClick={() => openStyle(row)} />
        {row.workingName && (
          <span className="truncate text-[var(--color-foreground)]">
            {row.workingName}
          </span>
        )}
      </div>
    ),
  };

  // Status pill — the row's at-a-glance state. Live → "• LIVE"; cataloguing →
  // EasyEcom Done/Pending; otherwise the lifecycle.
  // One consistent dot-pill for the row's state across every tab. Live +
  // sample_approved read green; cataloguing reflects the EasyEcom gate;
  // everything else is neutral with its lifecycle label.
  const statusColumn: QueueColumn<DashboardStyleRow> = {
    key: 'status',
    header: t('dashboard.table.columns.status', { defaultValue: 'Status' }),
    width: '116px',
    cell: (row) => {
      if (row.lifecycle === 'live') {
        return (
          <DotStatusPill
            label={t('dashboard.table.statusLive', { defaultValue: 'LIVE' })}
            tone="live"
          />
        );
      }
      if (row.lifecycle === 'cataloguing') {
        return (
          <DotStatusPill
            label={
              row.easyecomDone
                ? t('dashboard.table.done', { defaultValue: 'Done' })
                : t('dashboard.table.pending', { defaultValue: 'Pending' })
            }
            tone={row.easyecomDone ? 'live' : 'pending'}
          />
        );
      }
      const tone = row.lifecycle === 'sample_approved' ? 'live' : 'neutral';
      return (
        <DotStatusPill
          label={t(`admin.styles.lifecycle.${row.lifecycle}` as const, {
            defaultValue: row.lifecycle.replace(/_/g, ' '),
          })}
          tone={tone}
        />
      );
    },
  };

  // Metrics cell — "time in current state" (bold) + "Upd: Xd". The primary
  // milestone + suffix follow the ROW's lifecycle (so it's right on the mixed
  // All tab too), not the active tab.
  const metricInfo = (
    row: DashboardStyleRow,
  ): { iso: string | null; suffix: string } => {
    switch (row.lifecycle) {
      case 'live':
        return {
          iso: row.wentLiveAt,
          suffix: t('dashboard.table.metricSuffix.live', {
            defaultValue: 'live',
          }),
        };
      case 'cataloguing':
        return {
          iso: row.sampleApprovedAt,
          suffix: t('dashboard.table.metricSuffix.cataloguing', {
            defaultValue: 'in cat.',
          }),
        };
      case 'in_sampling':
        return {
          iso: row.approvedAt,
          suffix: t('dashboard.table.metricSuffix.sampling', {
            defaultValue: 'sampling',
          }),
        };
      case 'sample_approved':
        return {
          iso: row.sampleApprovedAt,
          suffix: t('dashboard.table.metricSuffix.ready', {
            defaultValue: 'ready',
          }),
        };
      case 'draft':
        return {
          iso: row.createdAt,
          suffix: t('dashboard.table.metricSuffix.draft', {
            defaultValue: 'old',
          }),
        };
      default:
        return { iso: row.updatedAt, suffix: '' };
    }
  };
  const metricsColumn: QueueColumn<DashboardStyleRow> = {
    key: 'metrics',
    header: t('dashboard.table.columns.metrics', { defaultValue: 'Metrics' }),
    width: '116px',
    align: 'right',
    cell: (row) => {
      const m = metricInfo(row);
      return (
        <div className="flex justify-end">
          <MetricCell
            primaryIso={m.iso}
            primarySuffix={m.suffix}
            updatedIso={row.updatedAt}
          />
        </div>
      );
    },
  };

  // Stage column — for the Sampling tab. The inline-editable sampling-status
  // dropdown for in_sampling rows (PD writers); a read-only stage badge else.
  const stageColumn: QueueColumn<DashboardStyleRow> = {
    key: 'stage',
    header: t('dashboard.table.columns.stage', { defaultValue: 'Stage' }),
    width: '190px',
    cell: (row) => {
      if (row.lifecycle === 'in_sampling' && canWriteInline) {
        return (
          <select
            value={row.samplingStatus ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              changeSamplingStatus(row, e.target.value as SamplingStatus);
            }}
            className="h-8 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-surface)] px-2 text-[12px] text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {!row.samplingStatus && (
              <option value="" disabled>
                {t('dashboard.table.setStatus', {
                  defaultValue: 'Set status…',
                })}
              </option>
            )}
            {SAMPLING_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`admin.styles.samplingSteps.${s}` as const, {
                  defaultValue: s.replace(/_/g, ' '),
                })}
              </option>
            ))}
          </select>
        );
      }
      const stage = stageLabel(row);
      return stage ? (
        <Badge variant="stitch" className="text-[10px]">
          {stage}
        </Badge>
      ) : (
        <span className="text-[var(--color-muted-foreground)]">—</span>
      );
    },
  };

  // Colour swatch + name — context column for the draft / all views.
  const colourColumn: QueueColumn<DashboardStyleRow> = {
    key: 'colour',
    header: t('dashboard.table.columns.colour', { defaultValue: 'Colour' }),
    width: '150px',
    className: 'hidden sm:table-cell',
    headerClassName: 'hidden sm:table-cell',
    cell: (row) => <ColourCell name={row.primaryColour} />,
  };

  // Collection — the seasonal/thematic grouping. Shared across tabs; hidden
  // on narrower screens so it never crowds the curated mobile layout.
  const collectionColumn: QueueColumn<DashboardStyleRow> = {
    key: 'collection',
    header: t('dashboard.table.columns.collection', {
      defaultValue: 'Collection',
    }),
    width: '150px',
    className: 'hidden lg:table-cell',
    headerClassName: 'hidden lg:table-cell',
    cell: (row) => (
      <span
        className="block truncate text-[var(--color-muted-foreground)]"
        title={row.collection?.name ?? undefined}
      >
        {row.collection?.name ?? '—'}
      </span>
    ),
  };

  // Default grammar (All · Needs attention · Draft): IMG · Style/Name ·
  // Collection · Colour · Status · Metrics — same shared cells as every other tab.
  const defaultColumns: QueueColumn<DashboardStyleRow>[] = [
    imgColumn,
    styleNameColumn,
    collectionColumn,
    colourColumn,
    statusColumn,
    metricsColumn,
  ];

  // EasyEcom — a read-only Done/Pending STATUS (scannable down the column).
  // It's no longer toggled here: the row actions ("Add listings" then "Mark
  // EasyEcom done", which auto-lives) own the transition, so this is pure status.
  // Cataloguing-only: on the Live tab it's redundant (a live style passed it).
  const easyecomColumn: QueueColumn<DashboardStyleRow> = {
    key: 'easyecom',
    header: t('dashboard.table.columns.easyecom', { defaultValue: 'EasyEcom' }),
    width: '130px',
    cell: (row) => (
      <StatusPill
        on={row.easyecomDone}
        onLabel={t('dashboard.table.done', { defaultValue: 'Done' })}
        offLabel={t('dashboard.table.pending', { defaultValue: 'Pending' })}
        canEdit={false}
        onToggle={() => {}}
      />
    ),
  };

  // Marketplace — pure per-channel STATUS. Each LIVE channel shows a "View now"
  // link to its public listing (or a plain Live badge if no URL). The go-live
  // ACTION is not here — it's the progressive row-action button. Taking a
  // channel offline lives in the Style workspace (captures a reason).
  const marketplaceColumn: QueueColumn<DashboardStyleRow> = {
    key: 'marketplace',
    header: t('dashboard.table.columns.marketplace', {
      defaultValue: 'Marketplace',
    }),
    width: '190px',
    cell: (row) => {
      // Each live channel as a brand chip (logo + name), with an external-link
      // icon when a public listing URL exists.
      const channelLabel = (channel: string) =>
        t(`dashboard.table.channels.${channel}` as const, {
          defaultValue: channel,
        });
      if (row.liveListings.length === 0) {
        return <span className="text-[var(--color-muted-foreground)]">—</span>;
      }
      return (
        <div className="flex flex-wrap items-center gap-2">
          {row.liveListings.map((listing) => {
            const label = channelLabel(listing.channel);
            const inner = (
              <>
                <ChannelLogo channel={listing.channel} />
                <span className="font-medium text-[var(--color-foreground)]">
                  {label}
                </span>
                {listing.url && (
                  <ExternalLink
                    size={13}
                    className="text-[var(--color-primary)]"
                    aria-hidden
                  />
                )}
              </>
            );
            return listing.url ? (
              <a
                key={listing.channel}
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-[13px] hover:opacity-80"
                title={t('dashboard.table.viewNow', {
                  defaultValue: 'View now',
                })}
              >
                {inner}
              </a>
            ) : (
              <span
                key={listing.channel}
                className="inline-flex items-center gap-1.5 text-[13px]"
              >
                {inner}
              </span>
            );
          })}
        </div>
      );
    },
  };

  // Sampling tab — IMG · Style/Name · Stage (inline editor) · Metrics.
  // The Stage IS the status here, so no separate status pill.
  const samplingColumns: QueueColumn<DashboardStyleRow>[] = [
    imgColumn,
    styleNameColumn,
    collectionColumn,
    stageColumn,
    metricsColumn,
  ];

  // Cataloguing tab — IMG · Style/Name · EasyEcom · Marketplace · Metrics.
  // EasyEcom is the status pill for this stage.
  const cataloguingColumns: QueueColumn<DashboardStyleRow>[] = [
    imgColumn,
    styleNameColumn,
    collectionColumn,
    easyecomColumn,
    marketplaceColumn,
    metricsColumn,
  ];

  // Live tab — IMG · Style/Name · Marketplace · Status · Metrics.
  const liveColumns: QueueColumn<DashboardStyleRow>[] = [
    imgColumn,
    styleNameColumn,
    collectionColumn,
    marketplaceColumn,
    statusColumn,
    metricsColumn,
  ];

  const columns =
    tab === 'cataloguing'
      ? cataloguingColumns
      : tab === 'live'
        ? liveColumns
        : tab === 'sampling'
          ? samplingColumns
          : defaultColumns;

  // "Showing X–Y of Z" + prev/next — rendered both above and below the table
  // (the bottom copy saves a scroll-back-up after working a full page).
  const pager =
    total > 0 ? (
      <div className="flex items-center gap-3">
        <span className="text-[12px] tabular-nums text-[var(--color-muted-foreground)]">
          {t('dashboard.table.showing', {
            from: skip + 1,
            to: Math.min(skip + PAGE_SIZE, total),
            total,
            defaultValue: `Showing ${skip + 1}–${Math.min(
              skip + PAGE_SIZE,
              total,
            )} of ${total}`,
          })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('dashboard.table.prevPage', {
              defaultValue: 'Previous page',
            })}
            disabled={skip === 0}
            onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label={t('dashboard.table.nextPage', {
              defaultValue: 'Next page',
            })}
            disabled={skip + PAGE_SIZE >= total}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-2)] disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-3">
      {/* One unified panel: tabs · search/pagination · table all share a
          single bordered card (the "Style tracking" treatment). */}
      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        {/* Tabs row — the QueueTabs' own bottom border is the divider. */}
        <div className="px-4 pt-3">
          <QueueTabs
            tabs={TABS.map((tk) => ({
              key: tk,
              label: t(`dashboard.table.tabs.${tk}` as const),
            }))}
            active={tab}
            onSelect={selectTab}
          />
        </div>

        {/* Search · date filter · pagination row. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
              />
              <Input
                className="h-9 text-[13px] pl-9"
                placeholder={t('dashboard.table.searchPlaceholder')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            {/* In-card activity-window filter (the old "List" picker). */}
            {onDateApply && from && to && (
              <DateRangePicker
                from={from}
                to={to}
                maxDate={maxDate}
                label={t('dashboard.dateFilter.activity', {
                  defaultValue: 'Updated',
                })}
                onApply={onDateApply}
              />
            )}
          </div>

          {/* "Showing X–Y of Z" + prev/next (mirrored at the table bottom). */}
          {pager}
        </div>

        <StyleQueueTable<DashboardStyleRow>
          bare
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          loading={loading}
          error={error}
          loadingLabel={t('dashboard.table.loading')}
          emptyLabel={t('dashboard.table.empty')}
          errorLabel={t('dashboard.table.error')}
          onRowClick={openStyle}
          actionsWidth="240px"
          rowAccent={(row) => row.lifecycle === 'draft'}
          renderActions={(row) => {
            const approve = canApprove(row);
            const park = canPark(row);
            const sampleApprove = canSampleApprove(row);
            const startCat = canStartCataloguing(row);
            const markEasyecom = canMarkEasyecom(row);
            const addListings = canAddListings(row);
            // Live rows get a "Channel" affordance (manage channels in the
            // workspace) for those who can't add listings inline.
            const channel = row.lifecycle === 'live';
            if (
              !approve &&
              !park &&
              !sampleApprove &&
              !startCat &&
              !markEasyecom &&
              !addListings &&
              !channel
            ) {
              return <RowChevron />;
            }
            // One action per row, always in this same right-aligned slot — the
            // "next step" for that row's lifecycle stage (Park rides alongside).
            return (
              <>
                {park && (
                  <GhostActionButton
                    icon="park"
                    onClick={() => setParkTarget(row)}
                  >
                    {t('dashboard.table.actions.park')}
                  </GhostActionButton>
                )}
                {startCat && (
                  <PrimaryActionButton onClick={() => doStartCataloguing(row)}>
                    {t('dashboard.table.actions.startCataloguing', {
                      defaultValue: 'Start cataloguing',
                    })}
                  </PrimaryActionButton>
                )}
                {sampleApprove && (
                  <PrimaryActionButton
                    onClick={() => setSampleApproveTarget(row)}
                  >
                    {t('dashboard.table.actions.approveSample', {
                      defaultValue: 'Approve sample',
                    })}
                  </PrimaryActionButton>
                )}
                {/* Cataloguing → live: list channels first, then EasyEcom-done
                    auto-promotes them live. */}
                {addListings && (
                  <GhostActionButton
                    icon="link"
                    onClick={() => openListings(row)}
                  >
                    {t('dashboard.table.actions.addListings', {
                      defaultValue: 'Add listings',
                    })}
                  </GhostActionButton>
                )}
                {markEasyecom && (
                  <PrimaryActionButton onClick={() => markEasyecomDone(row)}>
                    {t('dashboard.table.actions.markEasyecom', {
                      defaultValue: 'Mark EasyEcom done',
                    })}
                  </PrimaryActionButton>
                )}
                {channel && !addListings && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openStyle(row);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                  >
                    <Link2 size={13} aria-hidden />
                    {t('dashboard.table.actions.channel', {
                      defaultValue: 'Channel',
                    })}
                  </button>
                )}
                {approve && (
                  <ApproveButton onClick={() => setApprovalTarget(row)} />
                )}
              </>
            );
          }}
        />

        {/* Bottom pager — mirrors the top control so you can page without
            scrolling back up after working a full page. */}
        {pager && (
          <div className="flex justify-end border-t border-[var(--color-border)] px-4 py-3">
            {pager}
          </div>
        )}
      </section>

      {/* Approval #1 — reuses the same dialog as the Sampling registry. */}
      <Approval1Dialog
        open={approvalTarget !== null}
        busy={approvalBusy}
        gender={null}
        onClose={() => setApprovalTarget(null)}
        onConfirm={async (body) => {
          if (!approvalTarget) return;
          setApprovalBusy(true);
          try {
            await approveStyle(approvalTarget.id, body);
            toast.show(t('dashboard.table.toast.approved'), 'success');
            setApprovalTarget(null);
            afterAction();
          } catch (e: unknown) {
            const m =
              (e as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data?.message ??
              t('dashboard.table.toast.approveError');
            toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
          } finally {
            setApprovalBusy(false);
          }
        }}
      />

      {/* Park — captures a reason for the audit log. */}
      <ParkDialog
        open={parkTarget !== null}
        busy={parkBusy}
        styleLabel={parkTarget ? formatStyleRef(parkTarget) : null}
        approved={parkTarget ? parkTarget.lifecycle !== 'draft' : false}
        onClose={() => setParkTarget(null)}
        onConfirm={async (reason) => {
          if (!parkTarget) return;
          setParkBusy(true);
          try {
            await parkStyle(parkTarget.id, { reason });
            toast.show(t('dashboard.table.toast.parked'), 'success');
            setParkTarget(null);
            afterAction();
          } catch (e: unknown) {
            const m =
              (e as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data?.message ??
              t('dashboard.table.toast.parkError');
            toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
          } finally {
            setParkBusy(false);
          }
        }}
      />

      {/* Add listings — the SAME channel+link dialog the workspace uses. Picks
          channels + URLs and records them as prepared listings (auto-live on
          EasyEcom done). */}
      <GoLiveDialog
        open={listTarget !== null}
        busy={listBusy}
        existing={
          ([
            ...(listTarget?.liveListings ?? []),
            ...(listTarget?.preparedListings ?? []),
          ].map((l) => ({
            channel: l.channel,
            listingUrl: l.url,
          })) ?? []) as StyleChannelListing[]
        }
        onClose={() => (listBusy ? undefined : setListTarget(null))}
        onConfirm={confirmListings}
      />

      {/* Approve sample (Approval #2) — the SAME verdict dialog the workspace
          uses. Records the verdict; only "approved" advances the lifecycle. */}
      <SampleApproveDialog
        open={sampleApproveTarget !== null}
        busy={sampleApproveBusy}
        onClose={() =>
          sampleApproveBusy ? undefined : setSampleApproveTarget(null)
        }
        onConfirm={confirmSampleApprove}
      />
    </div>
  );
}
