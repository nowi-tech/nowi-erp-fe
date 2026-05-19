import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import ArticleDrawer from '@/components/articles/ArticleDrawer';
import {
  getArticleOptions,
  listArticles,
  listFabrics,
  type Article,
  type ArticleCategory,
  type ArticleOptions,
  type Fabric,
} from '@/api/articles';
import { cn } from '@/lib/utils';

const labelOf = (opts: { value: string; label: string }[], v?: string | null) =>
  (v && opts.find((o) => o.value === v)?.label) || '—';

function StatusBadge({ text }: { text: string }) {
  const variant = /approved|live/i.test(text)
    ? 'success'
    : /correction|review|stuck|reject/i.test(text)
      ? 'warning'
      : 'outline';
  return <Badge variant={variant}>{text}</Badge>;
}

export default function ArticlesList() {
  const [options, setOptions] = useState<ArticleOptions | null>(null);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [category, setCategory] = useState<ArticleCategory>('winterwear');
  const [rows, setRows] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [samplingStatus, setSamplingStatus] = useState('');
  const [productionStatus, setProductionStatus] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);

  useEffect(() => {
    void Promise.all([getArticleOptions(), listFabrics()]).then(
      ([o, f]) => {
        setOptions(o);
        setFabrics(f);
      },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listArticles({
        category,
        search: search.trim() || undefined,
        samplingStatus: (samplingStatus || undefined) as never,
        productionStatus: (productionStatus || undefined) as never,
        take: 500,
      });
      setRows(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [category, search, samplingStatus, productionStatus]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (a: Article) => {
    setEditing(a);
    setDrawerOpen(true);
  };

  const o = options;
  // Responsive columns — phones keep only SKU / Sampling / Production /
  // Live; the rest progressively appear at sm / md / lg (mirrors the
  // Users.tsx convention of `hidden …:table-cell` instead of a wide
  // horizontal scroll). Secondary data is shown inline under the SKU
  // on small screens so nothing is lost.
  const COLS = useMemo(
    () =>
      [
        { label: 'SKU', cls: '' },
        { label: 'Colour', cls: 'hidden md:table-cell' },
        { label: 'Fabric', cls: 'hidden md:table-cell' },
        { label: 'Sampling', cls: '' },
        { label: 'Fit', cls: 'hidden lg:table-cell' },
        { label: 'DXF', cls: 'hidden lg:table-cell' },
        { label: 'Approval', cls: 'hidden md:table-cell' },
        { label: 'Production', cls: '' },
        { label: 'Cut', cls: 'hidden lg:table-cell text-right' },
        { label: 'Stitch', cls: 'hidden lg:table-cell text-right' },
        { label: 'Pack', cls: 'hidden lg:table-cell text-right' },
        { label: 'Live', cls: '' },
        { label: 'Link', cls: 'hidden sm:table-cell' },
      ] as const,
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl">Article Tracker</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            New article development — {total} in this category
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          <span className="ml-1">Add article</span>
        </Button>
      </div>

      {/* Category tabs */}
      {o && (
        <div className="flex gap-1.5 flex-wrap border-b border-[var(--color-border)] pb-2">
          {o.category.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value as ArticleCategory)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm transition-colors',
                category === c.value
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium'
                  : 'text-[var(--color-foreground-3)] hover:bg-[var(--color-muted)]',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
          />
          <Input
            className="h-9 text-[13px] pl-9"
            placeholder="Search SKU / colour / remark"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {o && (
          <>
            <Select
              className="h-9 text-[13px] w-auto"
              value={samplingStatus}
              onChange={(e) => setSamplingStatus(e.target.value)}
            >
              <option value="">All sampling</option>
              {o.samplingStatus.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select
              className="h-9 text-[13px] w-auto"
              value={productionStatus}
              onChange={(e) => setProductionStatus(e.target.value)}
            >
              <option value="">All production</option>
              {o.productionStatus.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]">
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.label}
                  className={cn(
                    'text-left font-medium px-3 py-2 whitespace-nowrap',
                    c.cls,
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-8 text-center text-[var(--color-muted-foreground)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-8 text-center text-[var(--color-muted-foreground)]">
                  No articles. Click “Add article” to create one.
                </td>
              </tr>
            )}
            {!loading &&
              o &&
              rows.map((a) => {
                const isChild = !!a.parentSku;
                return (
                  <tr
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit ${a.sku}`}
                    onClick={() => openEdit(a)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEdit(a);
                      }
                    }}
                    className={cn(
                      'border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-muted)] focus:outline-none focus-visible:bg-[var(--color-muted)]',
                      isChild && 'bg-[var(--color-surface-2)]/40',
                    )}
                  >
                    <td className="px-3 py-2 font-medium">
                      <span className={cn(isChild && 'pl-4 text-[var(--color-muted-foreground)]')}>
                        {isChild && '↳ '}
                        {a.sku}
                      </span>
                      {/* Mobile fallback — colour / fabric are hidden < md. */}
                      <div className="md:hidden mt-0.5 text-xs text-[var(--color-muted-foreground)] truncate max-w-[42vw]">
                        {[a.colour, a.fabric?.name].filter(Boolean).join(' · ') ||
                          '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">{a.colour ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">{a.fabric?.name ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.samplingStatus ? (
                        <StatusBadge text={labelOf(o.samplingStatus, a.samplingStatus)} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">{labelOf(o.modelFitSession, a.modelFitSession)}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">{labelOf(o.dxfApproved, a.dxfApproved)}</td>
                    <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
                      {a.sampleApproval ? (
                        <StatusBadge text={labelOf(o.sampleApproval, a.sampleApproval)} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.productionStatus ? (
                        <StatusBadge text={labelOf(o.productionStatus, a.productionStatus)} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">{a.cuttingQty ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">{a.stitchingOutput ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">{a.packagingQty ?? '—'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge text={labelOf(o.websiteLive, a.websiteLive)} />
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      {a.referenceLink && /^https?:/.test(a.referenceLink) ? (
                        <a
                          href={a.referenceLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[var(--color-primary)] inline-flex"
                          aria-label="Open reference link"
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {o && (
        <ArticleDrawer
          open={drawerOpen}
          article={editing}
          category={category}
          options={o}
          fabrics={fabrics}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
