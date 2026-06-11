import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
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
  setMarketplaceListing,
  type SamplingStatus,
} from '@/api/styles';
import type { ChannelName } from '@/api/types';
import { useAuth } from '@/context/auth';
import { hasAnyRole, PD_WRITE_ROLES } from '@/lib/userRoles';
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

// `needs_attention` and `in_production` are intentionally not visible chips;
// their summary cards still deep-link to them and the BE still supports the
// filter (see Home.VALID_TABS / dashboard.service).
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

// Roles allowed to Approve (Approval #1) — mirrors the BE APPROVER_ROLES
// set in dashboard.service.ts. Home's allow-list is wide (viewers,
// data managers, etc. all land here), so the inline Approve button must
// be role-gated, not just lifecycle-gated, or non-approvers 403.
const APPROVER_ROLES = [
  'admin',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
  'china_import_approver',
] as const;

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

// Marketplace channels surfaced in the Cataloguing tab. Myntra only for now;
// add 'amazon' etc. here when those go live (the BE already models them).
const MARKETPLACE_CHANNELS: { channel: ChannelName; labelKey: string }[] = [
  { channel: 'myntra', labelKey: 'dashboard.table.channels.myntra' },
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

  // Go-live modal — opened when taking a marketplace channel live. Captures
  // the listing URL before committing (which advances lifecycle → live).
  const [goLiveTarget, setGoLiveTarget] = useState<{
    row: DashboardStyleRow;
    channel: ChannelName;
  } | null>(null);
  const [goLiveUrl, setGoLiveUrl] = useState('');
  const [goLiveBusy, setGoLiveBusy] = useState(false);

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

  // Inline edits (sampling status, EasyEcom checkpoint, marketplace listings)
  // are gated on the PD write set, which includes operator. Non-writers see
  // read-only cells.
  const canWriteInline = hasAnyRole(user, PARK_WRITE_ROLES);

  // EasyEcom checkpoint — optimistic, no side-effects (an internal OMS step).
  const toggleEasyecom = (row: DashboardStyleRow, next: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, easyecomDone: next } : r)),
    );
    setEasyecomDone(row.id, next).catch(() => {
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
    });
  };

  // Publish a marketplace channel from the dashboard. EasyEcom is a
  // prerequisite — block (with a toast) before opening the modal; the BE
  // enforces this too. Taking a channel back offline is NOT done here — that
  // lives in the Style workspace (more deliberate, captures a reason).
  const goLiveChannel = (row: DashboardStyleRow, channel: ChannelName) => {
    if (!row.easyecomDone) {
      toast.show(
        t('dashboard.table.toast.easyecomFirst', {
          defaultValue: 'Mark EasyEcom done before going live.',
        }),
        'error',
      );
      return;
    }
    setGoLiveUrl('');
    setGoLiveTarget({ row, channel });
  };

  // Commit the go-live: publish the channel with its URL; the BE advances
  // lifecycle → live. Refetch so the now-live row leaves the Cataloguing tab
  // and the summary cards update.
  const confirmGoLive = () => {
    if (!goLiveTarget) return;
    const { row, channel } = goLiveTarget;
    setGoLiveBusy(true);
    setMarketplaceListing(row.id, {
      channel,
      live: true,
      listingUrl: goLiveUrl.trim() || undefined,
    })
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
    cell: (row) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {MARKETPLACE_CHANNELS.map(({ channel, labelKey }) => {
          const label = t(labelKey, { defaultValue: channel });
          const listing = row.liveListings.find((l) => l.channel === channel);
          if (listing) {
            // Live — link out to the listing (or a plain Live badge if no URL).
            return listing.url ? (
              <a
                key={channel}
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
                key={channel}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800"
              >
                <Check size={12} />
                {t('dashboard.table.channelLive', {
                  channel: label,
                  defaultValue: `${label} · Live`,
                })}
              </span>
            );
          }
          // Not live — a Go-live action (gated on EasyEcom in the handler).
          if (!canWriteInline) {
            return (
              <span
                key={channel}
                className="text-[11px] text-[var(--color-muted-foreground)]"
              >
                {label}
              </span>
            );
          }
          return (
            <button
              key={channel}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goLiveChannel(row, channel);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              {t('dashboard.table.goLiveChannel', {
                channel: label,
                defaultValue: `${label} · Go live`,
              })}
            </button>
          );
        })}
      </div>
    ),
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

      {/* Go-live — opened when publishing a marketplace channel. Captures the
          listing URL, then the BE flips the style live. */}
      <Dialog
        open={goLiveTarget !== null}
        onClose={() => (goLiveBusy ? undefined : setGoLiveTarget(null))}
        title={t('dashboard.table.goLive.title', { defaultValue: 'Go live' })}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={goLiveBusy}
              onClick={() => setGoLiveTarget(null)}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button size="sm" disabled={goLiveBusy} onClick={confirmGoLive}>
              {goLiveBusy
                ? t('dashboard.table.goLive.submitting', {
                    defaultValue: 'Going live…',
                  })
                : t('dashboard.table.goLive.confirm', {
                    defaultValue: 'Go live',
                  })}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
          {goLiveTarget
            ? t('dashboard.table.goLive.intro', {
                ref: formatStyleRef(goLiveTarget.row),
                channel: t(`dashboard.table.channels.${goLiveTarget.channel}`, {
                  defaultValue: goLiveTarget.channel,
                }),
                defaultValue:
                  '{{ref}} will go live on {{channel}}. Add the listing URL (optional).',
              })
            : ''}
        </p>
        <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
          {t('dashboard.table.goLive.urlLabel', {
            defaultValue: 'Listing URL',
          })}
        </label>
        <Input
          type="url"
          inputMode="url"
          value={goLiveUrl}
          onChange={(e) => setGoLiveUrl(e.target.value)}
          placeholder="https://www.myntra.com/…"
        />
      </Dialog>
    </div>
  );
}
