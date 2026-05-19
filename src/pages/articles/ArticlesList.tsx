import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
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

  // Group colour/size variants under their parent style so the table
  // reads as "one style → its variants" instead of a flat wall of
  // near-empty rows. Orphan variants (parent not in the result set)
  // surface as their own standalone entries.
  const families = useMemo(() => {
    const parents = rows.filter((r) => !r.parentSku);
    const parentSkus = new Set(parents.map((p) => p.sku));
    const childrenBy = new Map<string, Article[]>();
    const orphans: Article[] = [];
    for (const r of rows) {
      if (!r.parentSku) continue;
      if (parentSkus.has(r.parentSku)) {
        const arr = childrenBy.get(r.parentSku) ?? [];
        arr.push(r);
        childrenBy.set(r.parentSku, arr);
      } else {
        orphans.push(r);
      }
    }
    const fam = parents
      .map((p) => ({ parent: p, children: childrenBy.get(p.sku) ?? [] }))
      .sort((a, b) => a.parent.sku.localeCompare(b.parent.sku));
    for (const orf of orphans) fam.push({ parent: orf, children: [] });
    return fam;
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (sku: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  const groupsWithChildren = families.filter((f) => f.children.length > 0);
  const allExpanded =
    groupsWithChildren.length > 0 &&
    groupsWithChildren.every((f) => expanded.has(f.parent.sku));
  const toggleAll = () =>
    setExpanded(
      allExpanded
        ? new Set()
        : new Set(groupsWithChildren.map((f) => f.parent.sku)),
    );
  // Collapse everything whenever the underlying list changes.
  useEffect(() => setExpanded(new Set()), [rows]);

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

  // The 12 data cells after the identity column — identical for a
  // parent style and its variants, so share one renderer.
  const dataCells = (a: Article) =>
    o && (
      <>
        <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
          {a.colour ?? '—'}
        </td>
        <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
          {a.fabric?.name ?? '—'}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          {a.samplingStatus ? (
            <StatusBadge text={labelOf(o.samplingStatus, a.samplingStatus)} />
          ) : (
            '—'
          )}
        </td>
        <td className="px-3 py-2 hidden lg:table-cell">
          {labelOf(o.modelFitSession, a.modelFitSession)}
        </td>
        <td className="px-3 py-2 hidden lg:table-cell">
          {labelOf(o.dxfApproved, a.dxfApproved)}
        </td>
        <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
          {a.sampleApproval ? (
            <StatusBadge text={labelOf(o.sampleApproval, a.sampleApproval)} />
          ) : (
            '—'
          )}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          {a.productionStatus ? (
            <StatusBadge
              text={labelOf(o.productionStatus, a.productionStatus)}
            />
          ) : (
            '—'
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">
          {a.cuttingQty ?? '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">
          {a.stitchingOutput ?? '—'}
        </td>
        <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">
          {a.packagingQty ?? '—'}
        </td>
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
      </>
    );

  const rowClasses =
    'border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-muted)] focus:outline-none focus-visible:bg-[var(--color-muted)]';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl">Article Tracker</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {families.length} styles · {total} SKUs in this category
          </p>
        </div>
        <div className="flex items-center gap-2">
          {groupsWithChildren.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus size={16} />
            <span className="ml-1">Add article</span>
          </Button>
        </div>
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
              families.map(({ parent, children }) => {
                const has = children.length > 0;
                const isOpen = expanded.has(parent.sku);
                return (
                  <Fragment key={parent.id}>
                    {/* Parent style */}
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${parent.sku}`}
                      onClick={() => openEdit(parent)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEdit(parent);
                        }
                      }}
                      className={cn(rowClasses, 'font-medium')}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {has ? (
                            <button
                              type="button"
                              aria-label={isOpen ? 'Collapse' : 'Expand'}
                              aria-expanded={isOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(parent.sku);
                              }}
                              className="shrink-0 p-0.5 -ml-1 rounded hover:bg-[var(--color-border)] text-[var(--color-muted-foreground)]"
                            >
                              {isOpen ? (
                                <ChevronDown size={15} />
                              ) : (
                                <ChevronRight size={15} />
                              )}
                            </button>
                          ) : (
                            <span className="w-[15px] shrink-0" aria-hidden />
                          )}
                          <span>{parent.sku}</span>
                          {parent.colour && (
                            <span className="text-[var(--color-muted-foreground)] font-normal">
                              · {parent.colour}
                            </span>
                          )}
                          {has && (
                            <Badge variant="outline" className="ml-1">
                              {children.length} variant
                              {children.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        <div className="md:hidden mt-0.5 ml-[21px] text-xs text-[var(--color-muted-foreground)] truncate max-w-[42vw]">
                          {[parent.colour, parent.fabric?.name]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                      {dataCells(parent)}
                    </tr>

                    {/* Variants — colour-led so they're identifiable */}
                    {has &&
                      isOpen &&
                      children.map((c) => (
                        <tr
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Edit ${c.colour ?? c.sku}`}
                          onClick={() => openEdit(c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openEdit(c);
                            }
                          }}
                          className={cn(
                            rowClasses,
                            'bg-[var(--color-surface-2)]/40',
                          )}
                        >
                          <td className="px-3 py-2">
                            <div className="pl-[21px]">
                              <span className="font-medium">
                                {c.colour || c.sku}
                              </span>
                              <div className="text-xs text-[var(--color-muted-foreground)] truncate max-w-[60vw] sm:max-w-none">
                                {c.colour ? c.sku : c.fabric?.name ?? ''}
                              </div>
                            </div>
                          </td>
                          {dataCells(c)}
                        </tr>
                      ))}
                  </Fragment>
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
