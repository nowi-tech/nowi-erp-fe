import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Rocket, Search } from 'lucide-react';
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
  goLive,
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

// Roles allowed to Park during sampling (draft / in_sampling) — the styles
// write set on the BE, shared via PD_WRITE_ROLES. Park is unavailable once a
// sample is signed off, so there's no separate post-approval park gate.
const PARK_WRITE_ROLES = PD_WRITE_ROLES;

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
  // Sample sign-off (Approval #2) — opens the shared verdict dialog.
  const [sampleApproveTarget, setSampleApproveTarget] =
    useState<DashboardStyleRow | null>(null);
  const [sampleApproveBusy, setSampleApproveBusy] = useState(false);

  // Go-live — opens the SHARED multi-channel dialog (same one the workspace
  // uses), then calls the single `goLive` endpoint. The target is the whole
  // row; the dialog picks channels + URLs.
  const [goLiveTarget, setGoLiveTarget] = useState<DashboardStyleRow | null>(
    null,
  );
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

  // Park is only allowed DURING sampling (draft / in_sampling) — once a sample
  // is signed off the style is committed to the go-to-market path and can't be
  // parked (no parking a live style, which would strand its channel listings).
  const canPark = (row: DashboardStyleRow) =>
    (row.lifecycle === 'draft' || row.lifecycle === 'in_sampling') &&
    hasAnyRole(user, PARK_WRITE_ROLES);

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
  // (which 403s a non-approver on the live transition). Writers still mark
  // EasyEcom + see the listing, but can't publish.
  const isApprover = hasAnyRole(user, APPROVER_ROLES);

  // The cataloguing row has ONE progressive action button, surfaced in the
  // shared row-actions slot (same place as Approve-sample), enforcing order:
  //   EasyEcom pending → "Mark EasyEcom done" (writer/operator)
  //   EasyEcom done    → "Go live" (approver)
  // On a live row, the action becomes "Add channel" (go live on more).
  const canMarkEasyecom = (row: DashboardStyleRow) =>
    row.lifecycle === 'cataloguing' && !row.easyecomDone && canWriteInline;
  const canGoLiveRow = (row: DashboardStyleRow) =>
    row.lifecycle === 'cataloguing' && row.easyecomDone && isApprover;
  const canAddChannel = (row: DashboardStyleRow) =>
    row.lifecycle === 'live' && isApprover;

  // Mark the EasyEcom checkpoint done — the first step of the progressive
  // cataloguing action (writer/operator). Optimistic; on success the row's
  // button flips to "Go live" (for approvers), revert on error.
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

  // Open the shared go-live dialog. EasyEcom is the prerequisite — block (with
  // a toast) before opening; the BE enforces it too. Taking a channel back
  // offline is NOT done here — that lives in the Style workspace (captures a
  // reason). Going live itself is approver-only. The button only shows once
  // EasyEcom is done, but keep the guard as a safety net against a stale row.
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

  // EasyEcom — a read-only Done/Pending STATUS (scannable down the column).
  // It's no longer toggled here: the progressive row action ("Mark EasyEcom
  // done" → "Go live") owns the transition, so the column is pure status.
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
      // Render EVERY live channel (not just a hardcoded list) so a style live
      // on any channel shows its listing, never a blank cell.
      const channelLabel = (channel: string) =>
        t(`dashboard.table.channels.${channel}` as const, {
          defaultValue: channel,
        });
      if (row.liveListings.length === 0) {
        return <span className="text-[var(--color-muted-foreground)]">—</span>;
      }
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
          const sampleApprove = canSampleApprove(row);
          const startCat = canStartCataloguing(row);
          const markEasyecom = canMarkEasyecom(row);
          const goLiveRow = canGoLiveRow(row);
          const addChannel = canAddChannel(row);
          if (
            !approve &&
            !park &&
            !sampleApprove &&
            !startCat &&
            !markEasyecom &&
            !goLiveRow &&
            !addChannel
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
              {/* Progressive cataloguing action: EasyEcom → Go live. */}
              {markEasyecom && (
                <PrimaryActionButton
                  onClick={() => markEasyecomDone(row)}
                >
                  {t('dashboard.table.actions.markEasyecom', {
                    defaultValue: 'Mark EasyEcom done',
                  })}
                </PrimaryActionButton>
              )}
              {goLiveRow && (
                <PrimaryActionButton
                  icon={<Rocket size={13} />}
                  onClick={() => openGoLive(row)}
                >
                  {t('dashboard.table.actions.goLive', {
                    defaultValue: 'Go live',
                  })}
                </PrimaryActionButton>
              )}
              {addChannel && (
                <PrimaryActionButton
                  icon={<Rocket size={13} />}
                  onClick={() => openGoLive(row)}
                >
                  {t('dashboard.table.actions.addChannel', {
                    defaultValue: 'Add channel',
                  })}
                </PrimaryActionButton>
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
