import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import AttentionChips from '@/components/styles/AttentionChips';
import StyleKpiStrip from '@/components/styles/StyleKpiStrip';
import StylesTable from '@/components/styles/StylesTable';
import StyleQuickEditDrawer from '@/components/styles/StyleQuickEditDrawer';
import {
  listStyles,
  getStylesSummary,
  listCollections,
  listFabricTypes,
  listFabrics,
  type ListStylesParams,
  type StyleTab,
  type StylesSummary,
} from '@/api/styles';
import type {
  Style,
  StyleSource,
  Collection,
  Fabric,
  FabricType,
} from '@/api/types';
import { cn } from '@/lib/utils';

const TABS: StyleTab[] = [
  'inbox',
  'in_sampling',
  'parked',
  'in_pd',
  'all',
  'china_reverse',
];

/**
 * Merged Dashboard + Registry page (canonical_styles_registry.html).
 *
 * Header block: attention chips · KPI strip · collapsible widgets row.
 * Body: tabs + filter bar + parent/variant grouped table.
 *
 * The "China Reverse" sidebar link points at this page with
 * `?source=china_reverse`; we honor that on mount.
 */
export default function StylesRegistry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const sourceFromUrl =
    (search.get('source') as StyleSource | null) ?? undefined;
  const [tab, setTab] = useState<StyleTab>(
    sourceFromUrl === 'china_reverse' ? 'china_reverse' : 'inbox',
  );
  const [summary, setSummary] = useState<StylesSummary | null>(null);
  const [rows, setRows] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [samplingStatus, setSamplingStatus] = useState<string>('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Style | null>(null);
  const [showWidgets, setShowWidgets] = useState(true);

  // Load master data once.
  useEffect(() => {
    void Promise.all([
      listCollections().catch(() => [] as Collection[]),
      listFabricTypes().catch(() => [] as FabricType[]),
      listFabrics().catch(() => [] as Fabric[]),
      getStylesSummary().catch(() => null),
    ]).then(([c, ft, fb, s]) => {
      setCollections(c);
      setFabricTypes(ft);
      setFabrics(fb);
      setSummary(s);
    });
  }, []);

  // React to ?source= URL changes.
  useEffect(() => {
    if (sourceFromUrl === 'china_reverse') setTab('china_reverse');
  }, [sourceFromUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: ListStylesParams = {
        tab,
        search: searchText.trim() || undefined,
        collectionId: collectionId ? Number(collectionId) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        samplingStatus: (samplingStatus || undefined) as any,
        take: 200,
      };
      if (tab === 'china_reverse') params.source = 'china_reverse';
      const res = await listStyles(params);
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, searchText, collectionId, samplingStatus]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const openCreateDesign = () => navigate('/styles/new');
  const openCreateChinaReverse = () =>
    navigate('/styles/new?source=china_reverse');

  const openEdit = (s: Style) => {
    setEditing(s);
    setDrawerOpen(true);
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openCreateChinaReverse}>
            <Plus size={16} />
            <span className="ml-1">{t('admin.styles.newChinaReverse')}</span>
          </Button>
          <Button onClick={openCreateDesign}>
            <Plus size={16} />
            <span className="ml-1">{t('admin.styles.newDesign')}</span>
          </Button>
        </div>
      </div>

      {/* Attention chips */}
      {summary && (
        <AttentionChips
          awaitingApproval1={summary.attention.awaitingApproval1}
          awaitingApproval2={summary.attention.awaitingApproval2}
          readyForQc={summary.attention.readyForQc}
          readyToDispatch={summary.attention.readyToDispatch}
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

      {/* Collapsible widgets row */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
        <div className="flex gap-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => setShowWidgets((v) => !v)}
            className="text-[var(--color-primary)] hover:underline"
          >
            {showWidgets
              ? t('admin.styles.widgets.samplingFunnel')
              : '▸ ' + t('admin.styles.widgets.samplingFunnel').replace('▸ ', '')}
          </button>
          <a href="#" className="text-[var(--color-primary)] hover:underline">
            {t('admin.styles.widgets.byCollection')}
          </a>
          <a href="#" className="text-[var(--color-primary)] hover:underline">
            {t('admin.styles.widgets.recentRemarks')}
          </a>
        </div>
        <span className="text-[10px] text-[var(--color-muted-foreground)] italic">
          {t('admin.styles.widgets.note')}
        </span>
      </div>

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
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            <option value="">
              {t('admin.styles.filters.collection')}:{' '}
              {t('admin.styles.filters.all')}
            </option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
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
            onRowClick={openEdit}
            onStyleNoClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
          />
        </div>
      </div>

      <StyleQuickEditDrawer
        open={drawerOpen}
        style={editing}
        defaults={{ source: 'sampling', category: 'womens_top_wear' }}
        collections={collections}
        fabricTypes={fabricTypes}
        fabrics={fabrics}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => void load()}
      />

      {/* Hidden link kept for screen-reader / route prefetching. */}
      <Link to="/styles/new" className="sr-only">
        New design submission
      </Link>
    </div>
  );
}
