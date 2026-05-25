import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import AttentionChips from '@/components/styles/AttentionChips';
import StyleKpiStrip from '@/components/styles/StyleKpiStrip';
import StylesTable from '@/components/styles/StylesTable';
import {
  approveStyle,
  listStyles,
  getStylesSummary,
  parkStyle,
  reviveStyle,
  type ListStylesParams,
  type StyleTab,
  type StylesSummary,
} from '@/api/styles';
import type { Style } from '@/api/types';
import { cn } from '@/lib/utils';

const TABS: StyleTab[] = ['inbox', 'in_sampling', 'parked', 'in_pd', 'all'];

/**
 * Merged Dashboard + Registry page (canonical_styles_registry.html).
 *
 * Header block: attention chips · KPI strip · collapsible widgets row.
 * Body: tabs + filter bar + parent/variant grouped table.
 *
 * Sampling-only — China Import has its own dedicated page (`/china-import`).
 */
export default function StylesRegistry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<StyleTab>('inbox');
  const [summary, setSummary] = useState<StylesSummary | null>(null);
  const [rows, setRows] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [samplingStatus, setSamplingStatus] = useState<string>('');

  const reloadSummary = useCallback(async () => {
    try {
      const s = await getStylesSummary();
      setSummary(s);
    } catch {
      /* leave the previous summary in place on transient failures */
    }
  }, []);

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
    // Fire-and-forget — KPI strip refresh in the background while the
    // table renders. Doesn't block the visible list.
    void reloadSummary();
  }, [tab, searchText, samplingStatus, reloadSummary]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  // Refresh summary when the tab regains focus — covers the case
  // where the user approves a style on the detail page and uses the
  // browser back button or a quick swipe back to the registry.
  useEffect(() => {
    const onFocus = () => void reloadSummary();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [reloadSummary]);

  const openCreateDesign = () => navigate('/styles/new');

  // Inline row actions — all three are one-click against the API and
  // refresh the list. Approve sends an empty body (BE accepts it; the
  // checklist fields are all optional and live on the detail page for
  // designers who want to record them). Park / Revive are unchanged.
  const onRowApprove = async (s: Style) => {
    try {
      await approveStyle(s.id);
      toast.show('Approved.', 'success');
      void load();
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? 'Could not approve.';
      toast.show(Array.isArray(m) ? m.join(', ') : String(m), 'error');
    }
  };
  const onRowPark = async (s: Style) => {
    try {
      await parkStyle(s.id, { reason: 'Paused from inbox' });
      toast.show('Parked.', 'success');
      void load();
    } catch {
      toast.show('Could not park.', 'error');
    }
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

      {/* Attention chips */}
      {summary && (
        <AttentionChips
          awaitingApproval1={summary.attention.awaitingApproval1}
          awaitingApproval2={summary.attention.awaitingApproval2}
          readyForQc={summary.attention.readyForQc}
        />
      )}

      {/* KPI strip */}
      {summary && (
        <StyleKpiStrip
          stylesDeveloped={summary.kpi.stylesDeveloped}
          approved={summary.kpi.approved}
          inProduction={summary.kpi.inProduction}
          live={summary.kpi.live}
          virtualLive={summary.kpi.virtualLive}
        />
      )}

      {/* Tab + filter + table card */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
        <div className="flex border-b border-[var(--color-border)] overflow-x-auto">
          {TABS.map((tk) => (
            <button
              key={tk}
              type="button"
              onClick={() => setTab(tk)}
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
    </div>
  );
}
