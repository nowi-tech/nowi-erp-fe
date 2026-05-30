import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import StylesTable from '@/components/styles/StylesTable';
import Approval1Dialog from '@/components/styles/Approval1Dialog';
import ParkDialog from '@/components/styles/ParkDialog';
import {
  approveStyle,
  listStyles,
  parkStyle,
  reviveStyle,
  type ListStylesParams,
  type StyleTab,
} from '@/api/styles';
import type { Style } from '@/api/types';
import { cn } from '@/lib/utils';

const TABS: StyleTab[] = ['inbox', 'in_sampling', 'parked', 'in_pd', 'all'];

// Read the initial tab from the `?tab=` deep-link param (the Home summary
// cards land here with a filter pre-applied). Falls back to the inbox.
function tabFromParam(value: string | null): StyleTab {
  return TABS.includes(value as StyleTab) ? (value as StyleTab) : 'inbox';
}

/**
 * Sampling registry — the "View more" drill-down target from the unified Home.
 *
 * The header summary (attention chips + KPI strip) moved to the Home page.
 * Body: tabs + filter bar + parent/variant grouped table + Submit design.
 *
 * Sampling-only — China Import has its own dedicated page (`/china-import`).
 */
export default function StylesRegistry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<StyleTab>(() =>
    tabFromParam(searchParams.get('tab')),
  );
  const [rows, setRows] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [samplingStatus, setSamplingStatus] = useState<string>('');
  // Selected row for the Approval #1 modal — clicking the inline ✓
  // opens the dialog with the row's gender + suggested pattern master.
  const [approvalTarget, setApprovalTarget] = useState<Style | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [parkTarget, setParkTarget] = useState<Style | null>(null);
  const [parkBusy, setParkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: ListStylesParams = {
        tab,
        search: searchText.trim() || undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        samplingStatus: (samplingStatus || undefined) as any,
        take: 200,
      };
      const res = await listStyles(params);
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, searchText, samplingStatus]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  // Honor a deep-link `?tab=` change (e.g. back/forward navigation or a
  // fresh card click while already on the page) by re-syncing the tab.
  useEffect(() => {
    setTab(tabFromParam(searchParams.get('tab')));
  }, [searchParams]);

  // Tab selection mirrors the active tab into the URL so the page is
  // shareable/back-button friendly and stays consistent with deep links.
  const selectTab = (next: StyleTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const openCreateDesign = () => navigate('/styles/new');

  // Inline row actions — Approve now opens the Approval #1 dialog so
  // the approver explicitly ticks fabric / price / collection checks
  // before the Style # is minted. Park / Revive remain one-click.
  const onRowApprove = (s: Style) => {
    setApprovalTarget(s);
  };
  const onRowPark = (s: Style) => {
    setParkTarget(s);
  };
  const onRowRevive = async (s: Style) => {
    try {
      await reviveStyle(s.id);
      toast.show('Revived.', 'success');
      void load();
    } catch {
      toast.show('Could not revive.', 'error');
    }
  };

  const TAB_COUNTS = useMemo(() => {
    // Best-effort client-side counts pending a BE summary endpoint.
    return { all: rows.length };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header: title + actions */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-[var(--color-primary)]">
            {t('admin.styles.title')}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t('admin.styles.subtitle')}
          </p>
        </div>
        <Button onClick={openCreateDesign}>
          <Plus size={16} />
          <span className="ml-1">{t('admin.styles.newDesign')}</span>
        </Button>
      </div>

      {/* Tab + filter + table card */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
        <div className="flex border-b border-[var(--color-border)] overflow-x-auto">
          {TABS.map((tk) => (
            <button
              key={tk}
              type="button"
              onClick={() => selectTab(tk)}
              className={cn(
                'px-5 py-3 text-sm whitespace-nowrap transition-colors',
                tab === tk
                  ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] font-semibold'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
              )}
            >
              {t(`admin.styles.tabs.${tk}`)}
              {tk === 'all' && TAB_COUNTS.all > 0 && (
                <span className="ml-1.5 text-[var(--color-muted-foreground)] tabular-nums">
                  ({TAB_COUNTS.all})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-3 border-b border-[var(--color-border)] flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
            />
            <Input
              className="h-9 text-[13px] pl-9"
              placeholder={t('admin.styles.filters.search')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Select
            className="h-9 text-[13px] w-auto"
            value={samplingStatus}
            onChange={(e) => setSamplingStatus(e.target.value)}
          >
            <option value="">{t('admin.styles.filters.samplingStatus')}</option>
            <option value="in_progress_pattern_dev">Pattern dev</option>
            <option value="in_progress_fabric_sourcing">Fabric sourcing</option>
            <option value="in_progress_cutting">Cutting</option>
            <option value="ready_for_inspection">Ready for inspection</option>
            <option value="handed_over_for_inspection">Handed over</option>
            <option value="corrections_needed">Corrections</option>
            <option value="approved_for_production">Approved</option>
          </Select>
        </div>

        <div className="p-3">
          <StylesTable
            rows={rows}
            loading={loading}
            // Single click target: every click (row OR style #) opens
            // the full Style detail page. The old QuickEditDrawer was a
            // second surface that's now redundant — inline-edit cells
            // cover quick status flips, and the detail page has the
            // always-editable SampleStateCard + full audit log.
            onRowClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
            onStyleNoClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
            onApprove={onRowApprove}
            onPark={onRowPark}
            onRevive={onRowRevive}
          />
        </div>
      </div>

      {/* Hidden link kept for screen-reader / route prefetching. */}
      <Link to="/styles/new" className="sr-only">
        New design submission
      </Link>

      {/* Park confirmation — captures the reason for the audit log
          instead of the old hardcoded "Paused from inbox" string. */}
      <ParkDialog
        open={parkTarget !== null}
        busy={parkBusy}
        styleLabel={
          parkTarget?.styleId ??
          (parkTarget?.draftNo != null
            ? `D-${parkTarget.draftNo}`
            : parkTarget?.workingName) ??
          null
        }
        approved={parkTarget ? parkTarget.lifecycle !== 'draft' : false}
        onClose={() => setParkTarget(null)}
        onConfirm={async (reason) => {
          if (!parkTarget) return;
          setParkBusy(true);
          try {
            await parkStyle(parkTarget.id, { reason });
            toast.show('Parked.', 'success');
            setParkTarget(null);
            void load();
          } catch {
            toast.show('Could not park.', 'error');
          } finally {
            setParkBusy(false);
          }
        }}
      />

      {/* Approval #1 confirmation — same dialog the detail page uses.
          All three intake checks must be ticked before Confirm enables. */}
      <Approval1Dialog
        open={approvalTarget !== null}
        busy={approvalBusy}
        gender={approvalTarget?.gender ?? null}
        defaultPatternMasterId={approvalTarget?.patternMasterId ?? null}
        onClose={() => setApprovalTarget(null)}
        onConfirm={async (body) => {
          if (!approvalTarget) return;
          setApprovalBusy(true);
          try {
            await approveStyle(approvalTarget.id, body);
            toast.show('Approved.', 'success');
            setApprovalTarget(null);
            void load();
          } catch (e: unknown) {
            const m =
              (e as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data?.message ?? 'Could not approve.';
            toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
          } finally {
            setApprovalBusy(false);
          }
        }}
      />
    </div>
  );
}
