import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ImageOff, Pause, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import Approval1Dialog from '@/components/styles/Approval1Dialog';
import ParkDialog from '@/components/styles/ParkDialog';
import {
  getDashboardStyles,
  type DashboardStyleRow,
  type DashboardStyleTab,
} from '@/api/dashboard';
import { approveStyle, parkStyle } from '@/api/styles';
import type { StyleLifecycle } from '@/api/types';
import { useAuth } from '@/context/auth';
import { hasAnyRole } from '@/lib/userRoles';
import { useDebounced } from '@/lib/useDebounced';
import { formatStyleRef } from '@/lib/styleRef';
import { cn } from '@/lib/utils';

/**
 * Self-contained Home content surface — the per-style "Styles in flight"
 * table. Owns its own tab + (debounced) search state and fetches its own
 * data via `getDashboardStyles`. PD styles carry no lots, so STAGE is a
 * coarse lifecycle/sampling/production pill — never a unit-level X/Y, and
 * there is no master-detail expander (see docs/DASHBOARD_REDESIGN.md).
 */

interface Props {
  /** Seed the starting tab — Home passes it from a `?tab=` query param. */
  initialTab?: DashboardStyleTab;
  /**
   * Called after a successful inline approve/park (in addition to the
   * table's own refetch) so the Home can refresh its summary cards.
   */
  onActionDone?: () => void;
}

const TABS: DashboardStyleTab[] = [
  'all',
  'sampling',
  'in_production',
  'live',
  'needs_attention',
];

// Roles allowed to Park a style once it's past `draft` (Approval #1 has
// minted the Style #). Mirrors the post-approval park guard in the spec.
const POST_APPROVAL_PARK_ROLES = ['admin', 'sampling_lead'] as const;

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

// Roles allowed to Park a draft (pre-approval) — mirrors StylesTable.tsx
// WRITE_ROLES (the styles write set on the BE).
const PARK_WRITE_ROLES = [
  'admin',
  'sampling_editor',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
] as const;

// Mirror StylesTable.tsx's lifecycle → Badge-variant mapping so the
// lifecycle pill reads identically across the Home and the Sampling page.
function lifecycleVariant(l: StyleLifecycle) {
  if (l === 'sample_approved' || l === 'dispatched') return 'success';
  if (l === 'parked' || l === 'archived') return 'outline';
  if (l === 'qc' || l === 'in_pd' || l === 'in_sampling') return 'stitch';
  return 'secondary';
}

/** Locale-aware relative time via Intl.RelativeTimeFormat (no extra dep) —
 *  honours the active i18n language (e.g. Hindi) instead of hardcoded
 *  English. `numeric: 'auto'` yields "now"/"yesterday" niceties. */
function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const sec = Math.round((Date.now() - then) / 1000); // +ve = in the past
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(sec) < 45) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  const mo = Math.round(day / 30);
  if (Math.abs(mo) < 12) return rtf.format(-mo, 'month');
  return rtf.format(-Math.round(mo / 12), 'year');
}

export default function StylesInFlightTable({
  initialTab = 'all',
  onActionDone,
}: Props) {
  const { t, i18n } = useTranslation();
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
  const [approvalTarget, setApprovalTarget] = useState<DashboardStyleRow | null>(
    null,
  );
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [parkTarget, setParkTarget] = useState<DashboardStyleRow | null>(null);
  const [parkBusy, setParkBusy] = useState(false);

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
        take: 100,
      });
      setRows(res.rows);
    } catch {
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedSearch]);

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
      return t(`dashboard.table.productionStatus.${row.productionStatus}` as const, {
        defaultValue: row.productionStatus.replace(/_/g, ' '),
      });
    }
    return '';
  };

  const colSpan = 6;

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)] overflow-x-auto">
        {TABS.map((tk) => (
          <button
            key={tk}
            type="button"
            onClick={() => selectTab(tk)}
            className={cn(
              'px-4 py-2.5 text-sm whitespace-nowrap transition-colors',
              tab === tk
                ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] font-semibold'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {t(`dashboard.table.tabs.${tk}` as const)}
          </button>
        ))}
      </div>

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

      {/* Table — horizontal scroll, never wraps. */}
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left font-medium px-3 py-2">
                {t('dashboard.table.columns.style')}
              </th>
              <th className="text-left font-medium px-3 py-2">
                {t('dashboard.table.columns.factory')}
              </th>
              <th className="text-left font-medium px-3 py-2">
                {t('dashboard.table.columns.lifecycle')}
              </th>
              <th className="text-left font-medium px-3 py-2">
                {t('dashboard.table.columns.stage')}
              </th>
              <th className="text-left font-medium px-3 py-2">
                {t('dashboard.table.columns.updated')}
              </th>
              <th className="text-right font-medium px-3 py-2">
                {t('dashboard.table.columns.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('dashboard.table.loading')}
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('dashboard.table.error')}
                </td>
              </tr>
            )}

            {!loading && !error && rows.length === 0 && (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-3 py-8 text-center text-[var(--color-muted-foreground)]"
                >
                  {t('dashboard.table.empty')}
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              rows.map((row) => {
                const stage = stageLabel(row);
                const subLine =
                  row.colourVariantCount > 0
                    ? t('dashboard.table.colourCount', {
                        count: row.colourVariantCount,
                      })
                    : (row.primaryColour ?? '');
                return (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--color-border)] text-[var(--color-foreground)]"
                  >
                    {/* STYLE — thumbnail + indigo code link + name + sub-line */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Thumbnail
                          src={row.thumbnail}
                          alt={row.workingName ?? formatStyleRef(row)}
                        />
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => openStyle(row)}
                            className="text-left font-mono text-[var(--color-primary)] hover:underline"
                          >
                            {formatStyleRef(row)}
                          </button>
                          {row.workingName && (
                            <span className="text-[var(--color-foreground)]">
                              {row.workingName}
                            </span>
                          )}
                          {subLine && (
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {subLine}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* FACTORY */}
                    <td className="px-3 py-2">
                      {row.factory ? (
                        <Badge variant="outline" className="text-[10px]">
                          {row.factory.name}
                        </Badge>
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">
                          —
                        </span>
                      )}
                    </td>

                    {/* LIFECYCLE */}
                    <td className="px-3 py-2">
                      <Badge
                        variant={lifecycleVariant(row.lifecycle)}
                        className="text-[10px]"
                      >
                        {t(`admin.styles.lifecycle.${row.lifecycle}` as const, {
                          defaultValue: row.lifecycle,
                        })}
                      </Badge>
                    </td>

                    {/* STAGE — coarse, no X/Y */}
                    <td className="px-3 py-2">
                      {stage ? (
                        <Badge variant="stitch" className="text-[10px]">
                          {stage}
                        </Badge>
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">
                          —
                        </span>
                      )}
                    </td>

                    {/* UPDATED */}
                    <td className="px-3 py-2 text-xs text-[var(--color-muted-foreground)] tabular-nums">
                      {relativeTime(row.updatedAt, i18n.language)}
                    </td>

                    {/* ACTIONS — role-gated, no "View" */}
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canApprove(row) && (
                          <Button
                            size="sm"
                            onClick={() => setApprovalTarget(row)}
                            className="h-7 px-2.5 text-xs"
                          >
                            <CheckCircle2 size={13} />
                            <span className="ml-1">
                              {t('dashboard.table.actions.approve')}
                            </span>
                          </Button>
                        )}
                        {canPark(row) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setParkTarget(row)}
                            className="h-7 px-2.5 text-xs"
                          >
                            <Pause size={13} />
                            <span className="ml-1">
                              {t('dashboard.table.actions.park')}
                            </span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Approval #1 — reuses the same dialog as the Sampling registry. */}
      <Approval1Dialog
        open={approvalTarget !== null}
        busy={approvalBusy}
        gender={null}
        defaultPatternMasterId={approvalTarget?.patternMaster?.id ?? null}
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
    </div>
  );
}

/** 28px square thumbnail with a graceful placeholder when null/broken. */
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
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
