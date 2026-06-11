import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import Approval1Dialog from '@/components/styles/Approval1Dialog';
import ParkDialog from '@/components/styles/ParkDialog';
import {
  StyleQueueTable,
  QueueTabs,
  StyleRefLink,
  Thumbnail,
  LifecycleBadge,
  ColourCell,
  AgeCell,
  compactAge,
  ApproveButton,
  GhostActionButton,
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
  goLive,
  type SamplingStatus,
  type GoLiveChannel,
} from '@/api/styles';
import type { StyleChannelListing } from '@/api/types';
import GoLiveDialog from '@/components/styles/GoLiveDialog';
import { useAuth } from '@/context/auth';
import { hasAnyRole, PD_WRITE_ROLES, APPROVER_ROLES } from '@/lib/userRoles';
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
  /**
   * Called after a successful inline approve/park (in addition to the
   * table's own refetch) so the Home can refresh its summary cards.
   */
  onActionDone?: () => void;
}

// `needs_attention` is intentionally not a visible chip; its summary card
// still deep-links to it and the BE still supports the filter (see
// Home.VALID_TABS / dashboard.service).
const TABS: DashboardStyleTab[] = [
  'all',
  'draft',
  'sampling',
  'cataloguing',
  'live',
];

// Roles allowed to Park a style once it's past `draft` (Approval #1 has
// minted the Style #). Mirrors the post-approval park guard in the spec
// and in StyleWorkspace.POST_APPROVAL_PARK — admin only: re-parking a
// committed design is an admin-gated action (the BE enforces the same).
const POST_APPROVAL_PARK_ROLES = ['admin'] as const;

// Roles allowed to Park a draft (pre-approval) — the styles write set on
// the BE, shared via PD_WRITE_ROLES.
const PARK_WRITE_ROLES = PD_WRITE_ROLES;

// Sampling-status options for the inline Stage editor — the 5 live stages +
// the Corrections off-ramp. Mirrors StylesRegistry.SAMPLING_STATUS_FILTER_OPTIONS;
// the removed in_progress_stitching / handed_over statuses are intentionally
// absent. Labels render via the `admin.styles.samplingSteps.*` i18n keys.
const SAMPLING_STATUS_OPTIONS: SamplingStatus[] = [
  'in_progress_pattern_dev',
  'in_progress_fabric_sourcing',
  'in_progress_cutting',
  'ready_for_inspection',
  'approved_for_production',
  'corrections_needed',
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

export default function StylesInFlightTable({
  initialTab = 'all',
  from,
  to,
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

  // Inline action targets — opening either dialog stashes the row.
  const [approvalTarget, setApprovalTarget] =
    useState<DashboardStyleRow | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [parkTarget, setParkTarget] = useState<DashboardStyleRow | null>(null);
  const [parkBusy, setParkBusy] = useState(false);

  // Go-live — opens the SHARED multi-channel dialog (same one the workspace
  // uses), then calls the single `goLive` endpoint. The target is the whole
  // row; the dialog picks channels + URLs.
  const [goLiveTarget, setGoLiveTarget] = useState<DashboardStyleRow | null>(
    null,
  );
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  // Rows whose EasyEcom toggle is mid-flight — go-live is disabled for them so
  // we never open the dialog against an optimistic value the BE will reject.
  const [pendingEasyecom, setPendingEasyecom] = useState<Set<number>>(
    new Set(),
  );

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
        take: 100,
      });
      setRows(res.rows);
    } catch {
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refetch the table AND let the Home refresh its cards.
  const afterAction = () => {
    void load();
    onActionDone?.();
  };

  // The Style detail route — matches StylesRegistry.tsx's row link.
  const openStyle = (row: DashboardStyleRow) =>
    navigate(`/styles/${row.styleId ?? row.id}`);

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

  // Park is open while in `draft` (write roles only); post-approval
  // (anything else) only admins + sampling leads may park inline.
  const canPark = (row: DashboardStyleRow) => {
    if (
      row.lifecycle === 'parked' ||
      row.lifecycle === 'archived' ||
      row.lifecycle === 'dispatched'
    ) {
      return false;
    }
    if (row.lifecycle === 'draft') return hasAnyRole(user, PARK_WRITE_ROLES);
    return hasAnyRole(user, POST_APPROVAL_PARK_ROLES);
  };

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

  // Inline edits (sampling status, EasyEcom checkpoint) are gated on the PD
  // write set, which includes operator. Non-writers see read-only cells.
  const canWriteInline = hasAnyRole(user, PARK_WRITE_ROLES);

  // Going live is a sign-off — approver-only, matching the workspace + the BE
  // (which 403s a non-approver on the live transition). Writers still toggle
  // EasyEcom + see the listing, but can't publish.
  const canGoLive = hasAnyRole(user, APPROVER_ROLES);

  // EasyEcom checkpoint — optimistic. Track the in-flight row so go-live is
  // disabled until the server confirms (else the dialog could open against a
  // value the BE then rejects).
  const toggleEasyecom = (row: DashboardStyleRow, next: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, easyecomDone: next } : r)),
    );
    setPendingEasyecom((prev) => new Set(prev).add(row.id));
    setEasyecomDone(row.id, next)
      .catch(() => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, easyecomDone: !next } : r,
          ),
        );
        toast.show(
          t('dashboard.table.toast.checkpointError', {
            defaultValue: 'Could not update checkpoint.',
          }),
          'error',
        );
      })
      .finally(() =>
        setPendingEasyecom((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(row.id);
          return nextSet;
        }),
      );
  };

  // Open the shared go-live dialog. EasyEcom is the prerequisite — block (with
  // a toast) before opening; the BE enforces it too. Taking a channel back
  // offline is NOT done here — that lives in the Style workspace (captures a
  // reason). Going live itself is approver-only (see `canGoLive`).
  const openGoLive = (row: DashboardStyleRow) => {
    if (!row.easyecomDone) {
      toast.show(
        t('dashboard.table.toast.easyecomFirst', {
          defaultValue: 'Mark EasyEcom done before going live.',
        }),
        'error',
      );
      return;
    }
    setGoLiveTarget(row);
  };

  // Commit the go-live via the single `goLive` endpoint (multi-channel). The BE
  // advances lifecycle → live + stamps wentLiveAt. Refetch so the now-live row
  // leaves the Cataloguing tab and the summary cards update.
  const confirmGoLive = (channels: GoLiveChannel[]) => {
    if (!goLiveTarget) return;
    const row = goLiveTarget;
    setGoLiveBusy(true);
    goLive(row.id, { channels })
      .then(() => {
        setGoLiveTarget(null);
        toast.show(
          t('dashboard.table.toast.wentLive', { defaultValue: 'Marked live.' }),
          'success',
        );
        afterAction();
      })
      .catch((e: unknown) => {
        const m =
          (e as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ??
          t('dashboard.table.toast.goLiveError', {
            defaultValue: 'Could not go live.',
          });
        toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
      })
      .finally(() => setGoLiveBusy(false));
  };

  // Inline sampling-status change — optimistic, persisted via PATCH /styles/:id.
  const changeSamplingStatus = (
    row: DashboardStyleRow,
    next: SamplingStatus,
  ) => {
    const prevStatus = row.samplingStatus;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, samplingStatus: next } : r)),
    );
    patchStyle(row.id, { samplingStatus: next }).catch(() => {
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

  // The Style column + Updated column are shared across every tab.
  const styleColumn: QueueColumn<DashboardStyleRow> = {
    key: 'style',
    header: t('dashboard.table.columns.style', { defaultValue: 'Style' }),
    // Flexible widest column — absorbs the table's slack but truncates so a
    // long working name never forces the table into a horizontal scroll.
    width: '38%',
    cell: (row) => {
        // Colour has its own column now; the subline only surfaces the
        // colour-family fan-out count when there are variants.
        const subLine =
          row.colourVariantCount > 0
            ? t('dashboard.table.colourCount', {
                count: row.colourVariantCount,
              })
            : '';
        return (
          <div className="flex items-center gap-2.5">
            <Thumbnail
              src={row.thumbnail}
              alt={row.workingName ?? formatStyleRef(row)}
            />
            {/* min-w-0 lets the flex child shrink below its content so the
                working-name span can truncate instead of overflowing. */}
            <div className="flex min-w-0 flex-col">
              <StyleRefLink style={row} onClick={() => openStyle(row)} />
              {row.workingName && (
                <span className="truncate text-[var(--color-foreground)]">
                  {row.workingName}
                </span>
              )}
              {subLine && (
                <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                  {subLine}
                </span>
              )}
            </div>
          </div>
        );
    },
  };

  // Context-aware date column — its meaning follows the active tab so each
  // view surfaces the milestone that matters (Draft → submitted, Sampling →
  // in-sampling since, Cataloguing → sampling completed, Live → went live).
  // `updatedAt` rides along as a small subline (except on the All tab where it
  // IS the primary). Falls back to updatedAt when the milestone is null.
  const milestone: {
    headerKey: string;
    headerDefault: string;
    pick: (r: DashboardStyleRow) => string | null;
  } =
    tab === 'draft'
      ? {
          headerKey: 'dashboard.table.columns.submitted',
          headerDefault: 'Submitted',
          pick: (r) => r.createdAt,
        }
      : tab === 'sampling'
        ? {
            headerKey: 'dashboard.table.columns.inSampling',
            headerDefault: 'In sampling',
            pick: (r) => r.approvedAt,
          }
        : tab === 'cataloguing'
          ? {
              headerKey: 'dashboard.table.columns.sampleDone',
              headerDefault: 'Sampling done',
              pick: (r) => r.sampleApprovedAt,
            }
          : tab === 'live'
            ? {
                headerKey: 'dashboard.table.columns.wentLive',
                headerDefault: 'Went live',
                pick: (r) => r.wentLiveAt,
              }
            : {
                headerKey: 'dashboard.table.columns.updated',
                headerDefault: 'Updated',
                pick: (r) => r.updatedAt,
              };
  const showUpdatedSubline = tab !== 'all';

  const dateColumn: QueueColumn<DashboardStyleRow> = {
    key: 'date',
    header: t(milestone.headerKey, { defaultValue: milestone.headerDefault }),
    width: showUpdatedSubline ? '104px' : '76px',
    align: 'right',
    cell: (row) => {
      const iso = milestone.pick(row) ?? row.updatedAt;
      return (
        <div className="flex flex-col items-end leading-tight">
          <AgeCell iso={iso} />
          {showUpdatedSubline && (
            <span className="text-[10px] text-[var(--color-muted-foreground)]">
              {t('dashboard.table.updatedAgo', {
                age: compactAge(row.updatedAt),
                defaultValue: `upd ${compactAge(row.updatedAt)}`,
              })}
            </span>
          )}
        </div>
      );
    },
  };

  // Default columns (every tab except Cataloguing).
  const defaultColumns: QueueColumn<DashboardStyleRow>[] = [
    styleColumn,
    {
      key: 'lifecycle',
      header: t('dashboard.table.columns.lifecycle', {
        defaultValue: 'Lifecycle',
      }),
      width: '120px',
      cell: (row) => <LifecycleBadge lifecycle={row.lifecycle} />,
    },
    {
      key: 'stage',
      header: t('dashboard.table.columns.stage', { defaultValue: 'Stage' }),
      width: '180px',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      cell: (row) => {
        // While in sampling, the Stage is an inline-editable sampling status
        // for PD writers — change it right here, no detail-page round-trip.
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
              {/* A row with no status yet shows a placeholder option. */}
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
    },
    {
      key: 'colour',
      header: t('dashboard.table.columns.colour', { defaultValue: 'Colour' }),
      width: '140px',
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      cell: (row) => <ColourCell name={row.primaryColour} />,
    },
    dateColumn,
  ];

  // EasyEcom — an internal Done/Pending checkpoint. Cataloguing-only: on the
  // Live tab it's redundant (a live style has necessarily passed it).
  const easyecomColumn: QueueColumn<DashboardStyleRow> = {
    key: 'easyecom',
    header: t('dashboard.table.columns.easyecom', { defaultValue: 'EasyEcom' }),
    width: '130px',
    cell: (row) => (
      <StatusPill
        on={row.easyecomDone}
        onLabel={t('dashboard.table.done', { defaultValue: 'Done' })}
        offLabel={t('dashboard.table.pending', { defaultValue: 'Pending' })}
        canEdit={canWriteInline}
        onToggle={(next) => toggleEasyecom(row, next)}
      />
    ),
  };

  // Marketplace — per-channel status. A LIVE channel shows a "View now" link
  // to its public listing (read-only; taking it offline lives in the Style
  // workspace). A not-live channel shows a "Go live" action (EasyEcom-gated)
  // that opens the go-live modal.
  const marketplaceColumn: QueueColumn<DashboardStyleRow> = {
    key: 'marketplace',
    header: t('dashboard.table.columns.marketplace', {
      defaultValue: 'Marketplace',
    }),
    width: '190px',
    cell: (row) => {
      // Render EVERY live channel (not just a hardcoded list) so a style live
      // on any channel shows its listing, never a blank cell.
      const channelLabel = (channel: string) =>
        t(`dashboard.table.channels.${channel}` as const, {
          defaultValue: channel,
        });
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {row.liveListings.map((listing) => {
            const label = channelLabel(listing.channel);
            return listing.url ? (
              <a
                key={listing.channel}
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-200"
              >
                {label}
                <ExternalLink size={11} aria-hidden />
                {t('dashboard.table.viewNow', { defaultValue: 'View now' })}
              </a>
            ) : (
              <span
                key={listing.channel}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800"
              >
                <Check size={12} />
                {t('dashboard.table.channelLive', {
                  channel: label,
                  defaultValue: `${label} · Live`,
                })}
              </span>
            );
          })}
          {/* Go live — approver-only, opens the shared multi-channel dialog.
              Disabled while the EasyEcom toggle for this row is in flight. */}
          {canGoLive && (
            <button
              type="button"
              disabled={pendingEasyecom.has(row.id)}
              onClick={(e) => {
                e.stopPropagation();
                openGoLive(row);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
            >
              {t('dashboard.table.goLive.confirm', { defaultValue: 'Go live' })}
            </button>
          )}
          {row.liveListings.length === 0 && !canGoLive && (
            <span className="text-[var(--color-muted-foreground)]">—</span>
          )}
        </div>
      );
    },
  };

  // Cataloguing tab — the go-to-market workbench (EasyEcom + Marketplace).
  const cataloguingColumns: QueueColumn<DashboardStyleRow>[] = [
    styleColumn,
    easyecomColumn,
    marketplaceColumn,
    dateColumn,
  ];

  // Live tab — "what's selling, where". Marketplace only; EasyEcom is omitted
  // (always done for a live style, so it'd be a redundant column).
  const liveColumns: QueueColumn<DashboardStyleRow>[] = [
    styleColumn,
    marketplaceColumn,
    dateColumn,
  ];

  const columns =
    tab === 'cataloguing'
      ? cataloguingColumns
      : tab === 'live'
        ? liveColumns
        : defaultColumns;

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <QueueTabs
        tabs={TABS.map((tk) => ({
          key: tk,
          label: t(`dashboard.table.tabs.${tk}` as const),
        }))}
        active={tab}
        onSelect={selectTab}
      />

      {/* Search */}
      <div className="relative max-w-sm">
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

      <StyleQueueTable<DashboardStyleRow>
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        loading={loading}
        error={error}
        loadingLabel={t('dashboard.table.loading')}
        emptyLabel={t('dashboard.table.empty')}
        errorLabel={t('dashboard.table.error')}
        onRowClick={openStyle}
        actionsWidth="170px"
        rowAccent={(row) => row.lifecycle === 'draft'}
        renderActions={(row) => {
          const approve = canApprove(row);
          const park = canPark(row);
          if (!approve && !park) return <RowChevron />;
          // Show BOTH when both apply (a draft an approver can also park) —
          // don't let Approve hide the Park action. Park then Approve to
          // match the sampling queue's right-aligned cluster order.
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
              {approve && (
                <ApproveButton onClick={() => setApprovalTarget(row)} />
              )}
            </>
          );
        }}
      />

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

      {/* Go-live — the SAME multi-channel dialog the workspace uses. Picks
          channels + URLs, then calls the single `goLive` endpoint. */}
      <GoLiveDialog
        open={goLiveTarget !== null}
        busy={goLiveBusy}
        existing={
          (goLiveTarget?.liveListings.map((l) => ({
            channel: l.channel,
            listingUrl: l.url,
          })) ?? []) as StyleChannelListing[]
        }
        onClose={() => (goLiveBusy ? undefined : setGoLiveTarget(null))}
        onConfirm={confirmGoLive}
      />
    </div>
  );
}
