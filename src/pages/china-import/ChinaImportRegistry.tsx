import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StylesTable from '@/components/styles/StylesTable';
import StyleEditModal from '@/components/styles/StyleEditModal';
import { listStyles } from '@/api/styles';
import type { Style } from '@/api/types';

/**
 * China Import registry — a simple, flat list of `china_import` styles.
 *
 * Deliberately minimal: no sampling tabs, no KPI strip, no attention chips,
 * no sampling-funnel widgets. China Import is a separate, lightweight flow
 * (style numbers prefixed `NW-`); the sampling registry stays sampling-only.
 */
export default function ChinaImportRegistry() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Style | null>(null);

  // Collections + fabrics master used to be loaded here for the old
  // QuickEditDrawer. The new StyleEditModal fetches them itself on
  // first open, so this page no longer needs them.

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStyles({
        source: 'china_import',
        take: 200,
        search: searchText.trim() || undefined,
      });
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    return () => clearTimeout(id);
  }, [load]);

  const openCreate = () => navigate('/styles/new?source=china_import');

  const openEdit = (s: Style) => {
    setEditing(s);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header: title + action */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-[var(--color-primary)]">
            {t('admin.chinaImport.title')}
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            {t('admin.chinaImport.subtitle')}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          <span className="ml-1">{t('admin.chinaImport.new')}</span>
        </Button>
      </div>

      {/* Search + table card */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
        <div className="p-3 border-b border-[var(--color-border)]">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
            />
            <Input
              className="h-9 text-[13px] pl-9"
              placeholder={t('admin.chinaImport.search')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="p-3">
          <StylesTable
            rows={rows}
            loading={loading}
            onRowClick={openEdit}
            onStyleNoClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
            variant="compact"
          />
        </div>
      </div>

      <StyleEditModal
        open={drawerOpen}
        style={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
