import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Plus,
  ShoppingCart,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { SummaryCard } from '@/components/ui/summary-card';
import { FilterChips } from '@/components/ui/filter-rail';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import FabricEditorForm from '@/components/fabrics/FabricEditorForm';
import FabricOrderDialog from '@/components/fabrics/FabricOrderDialog';
import FabricOrdersTable from '@/components/fabrics/FabricOrdersTable';
import { compareNullsLast, LastUpdated, SortHeader, useSortCycle } from '@/components/ui/sort-header';
import IssueSlipDialog from '@/components/fabrics/IssueSlipDialog';
import { StockCheckDialog } from '@/components/fabrics/StockActionDialogs';
import CountSheetDialog from '@/components/fabrics/CountSheetDialog';
import { listFabrics } from '@/api/styles';
import { listFabricOrders } from '@/api/fabricOrders';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { useAuth } from '@/context/auth';
import { FABRIC_STOCK_CHECK_ROLES, FABRIC_WRITE_ROLES, hasAnyRole } from '@/lib/userRoles';
import type { Fabric, FabricColour, FabricOrder } from '@/api/types';
import {
  colourState,
  COLOUR_STATE_LABEL,
  COLOUR_STATE_VARIANT,
  fmtQty,
  isRunningOut,
  isShortForLots,
  orderQtyForLots,
} from '@/lib/fabric';
import { cn } from '@/lib/utils';

// Set by the KPI tiles; order questions (overdue, need to order…) live on the Fabric orders page.
type Chip = 'in_stock' | 'running_out' | 'short' | 'out_of_stock' | 'check';

const CHIP_LABEL: Record<Chip, string> = {
  in_stock: 'In stock',
  running_out: 'Running out',
  short: 'Short for lots',
  out_of_stock: 'Out of stock',
  check: 'Check stock',
};

const CHIP_MATCH: Record<Chip, (c: FabricColour) => boolean> = {
  in_stock: (c) => (c.availableQuantity ?? 0) > 0,
  short: isShortForLots,
  running_out: isRunningOut,
  out_of_stock: (c) => (c.availableQuantity ?? 0) <= 0,
  check: (c) => (c.needsReview ?? 0) > 0,
};


/**
 * Fabric Library — one table: each fabric is a group header, each colour a
 * row with its stock, what's on order, what planning holds, and the actions
 * that move it. Status is worked out from those numbers, never typed.
 */
export default function FabricLibrary() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = hasAnyRole(user, FABRIC_WRITE_ROLES);
  const canCheck = hasAnyRole(user, FABRIC_STOCK_CHECK_ROLES);

  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [orders, setOrders] = useState<FabricOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<Chip | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const { sortKey, sortDir, onSort } = useSortCycle<'stock' | 'updated'>();

  const [newFabricOpen, setNewFabricOpen] = useState(false);
  const [orderFor, setOrderFor] = useState<{ fabricId?: number; fabricColourId?: number; quantity?: number } | null>(null);
  const [countOpen, setCountOpen] = useState(false);
  const [issueFor, setIssueFor] = useState<{ fabricId?: number; fabricColourId?: number } | null>(null);
  const [ordersOf, setOrdersOf] = useState<{ fabric: Fabric; colour: FabricColour } | null>(null);
  const [checkOf, setCheckOf] = useState<{ fabric: Fabric; colour: FabricColour } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fs, os] = await Promise.all([listFabrics(), listFabricOrders({ open: true })]);
      setFabrics(fs);
      setOrders(os);
    } catch {
      // graceful empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const imagePaths = useMemo(
    () => fabrics.flatMap((f) => [f.imagePath ?? null, ...(f.colours ?? []).map((c) => c.imagePath ?? null)]),
    [fabrics],
  );
  const imageUrls = useSignedUrls(imagePaths);

  const ordersByColour = useMemo(() => {
    const m = new Map<number, FabricOrder[]>();
    for (const o of orders) {
      if (o.fabricColourId != null) m.set(o.fabricColourId, [...(m.get(o.fabricColourId) ?? []), o]);
    }
    return m;
  }, [orders]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (f: Fabric, c: FabricColour): boolean => {
      const text = `${f.name} ${f.code ?? ''} ${c.name} ${c.code ?? ''}`;
      if (q && !text.toLowerCase().includes(q)) return false;
      return chip == null || CHIP_MATCH[chip](c);
    };
    return fabrics
      .map((f) => ({ fabric: f, colours: (f.colours ?? []).filter((c) => matches(f, c)) }))
      .filter(
        (g) =>
          g.colours.length > 0 ||
          // A fabric with no colours yet still shows under "All", so it can be found.
          (chip == null &&
            (g.fabric.colours ?? []).length === 0 &&
            g.fabric.name.toLowerCase().includes(q)),
      );
  }, [fabrics, search, chip]);

  // Last updated keeps the grouping: fabrics by their own date, colours by theirs.
  const groups = useMemo(() => {
    if (sortKey !== 'updated') return filteredGroups;
    const time = (d?: string | null) => (d ? Date.parse(d) : null);
    return filteredGroups
      .map((g) => ({
        ...g,
        colours: [...g.colours].sort((a, b) => compareNullsLast(time(a.lastUpdatedAt), time(b.lastUpdatedAt), sortDir)),
      }))
      .sort((a, b) => compareNullsLast(time(a.fabric.lastUpdatedAt), time(b.fabric.lastUpdatedAt), sortDir));
  }, [filteredGroups, sortKey, sortDir]);

  // Stock sort drops the grouping: every visible colour in one list, ranked by its own stock.
  const stockRanked = useMemo(
    () =>
      sortKey !== 'stock'
        ? null
        : filteredGroups
            .flatMap((g) => g.colours.map((c) => ({ fabric: g.fabric, colour: c })))
            .sort((a, b) =>
              compareNullsLast(a.colour.availableQuantity ?? 0, b.colour.availableQuantity ?? 0, sortDir),
            ),
    [filteredGroups, sortKey, sortDir],
  );

  const allColours = useMemo(() => fabrics.flatMap((f) => f.colours ?? []), [fabrics]);
  const kpi = (k: Chip) => allColours.filter(CHIP_MATCH[k]).length;
  const overdueOrders = orders.filter((o) => o.isOverdue).length;
  const TILE_TONE: Record<Exclude<Chip, 'in_stock'>, 'danger' | 'warning'> = {
    short: 'danger',
    out_of_stock: 'danger',
    running_out: 'warning',
    check: 'warning',
  };
  // Coloured only when there's something to act on — a red tile always means "look here".
  const tile = (k: Exclude<Chip, 'in_stock'>, label: string) => (
    <SummaryCard
      label={label}
      value={loading ? '—' : kpi(k)}
      tone={!loading && kpi(k) > 0 ? TILE_TONE[k] : undefined}
      onClick={() => setChip(chip === k ? null : k)}
      className={cn('p-4', chip === k && 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20')}
    />
  );
  /** Order prefilled with what planning lots are short of. */
  const orderColour = (f: Fabric, c: FabricColour) =>
    setOrderFor({ fabricId: f.id, fabricColourId: c.id, quantity: orderQtyForLots(c) });

  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** One colour's row; `flat` (stock-sorted list) labels it with its fabric too. */
  const colourRow = (f: Fabric, c: FabricColour, flat: boolean) => {
    const state = colourState(c);
    const swatch = c.imagePath ?? f.imagePath;
    const unit = f.unitOfMeasure;
    return (
      <tr
        key={c.id}
        className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/50"
        // The colour opens its fabric's page with that colour selected.
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, a, input, select')) {
            navigate(`/fabric-library/${f.id}?colour=${c.id}`);
          }
        }}
      >
        <td className={cn('py-3 pr-3', flat ? 'pl-3' : 'pl-10')}>
          <div className="flex items-center gap-2">
            {swatch && imageUrls[swatch] ? (
              <img src={imageUrls[swatch]} alt="" className="h-5 w-5 rounded-[3px] border border-black/10 object-cover" />
            ) : (
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ backgroundColor: c.hex || c.name.toLowerCase() }}
              />
            )}
            {flat ? (
              <span className="truncate">
                <span className="font-medium">
                  {f.name} · {c.name}
                </span>
                {f.code && <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">{f.code}</span>}
              </span>
            ) : (
              <span className="font-medium">{c.name}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-right font-medium tabular-nums">
              {fmtQty(c.availableQuantity ?? 0, unit)}
            </span>
            <Badge variant={COLOUR_STATE_VARIANT[state]}>
              {t(`admin.fabricLibrary.states.${state}`, { defaultValue: COLOUR_STATE_LABEL[state] })}
            </Badge>
            {(c.needsReview ?? 0) > 0 && (
              <Badge variant="warning">
                {t('admin.fabricLibrary.checkStock', { defaultValue: 'Check stock' })}
              </Badge>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-right tabular-nums">
          {(c.onOrderQuantity ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => setOrdersOf({ fabric: f, colour: c })}
              className="text-right underline-offset-2 hover:underline"
            >
              <div className="font-medium">{fmtQty(c.onOrderQuantity!, unit)}</div>
              {c.nextExpectedDate && (
                <div
                  className={cn(
                    'text-xs',
                    (c.overdueOrders ?? 0) > 0
                      ? 'font-semibold text-[var(--color-destructive)]'
                      : 'text-[var(--color-muted-foreground)]',
                  )}
                >
                  {t('admin.fabricOrders.dueOn', {
                    defaultValue: 'due {{date}}',
                    date: new Date(c.nextExpectedDate).toLocaleDateString(),
                  })}
                </div>
              )}
            </button>
          ) : (ordersByColour.get(c.id) ?? []).length > 0 ? (
            <button
              type="button"
              onClick={() => setOrdersOf({ fabric: f, colour: c })}
              className="text-xs text-[var(--color-muted-foreground)] hover:underline"
            >
              {t('admin.fabricLibrary.needToOrder', { defaultValue: 'Need to order' })}
            </button>
          ) : (
            <span className="text-[var(--color-muted-foreground)]">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          <LastUpdated at={c.lastUpdatedAt} />
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <div className="inline-flex items-center gap-2">
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(c.availableQuantity ?? 0) <= 0}
                  onClick={() => setIssueFor({ fabricId: f.id, fabricColourId: c.id })}
                >
                  <ArrowUpRight size={15} />
                  {t('admin.fabricLibrary.issue')}
                </Button>
                <Button size="sm" onClick={() => orderColour(f, c)}>
                  <ShoppingCart size={15} />
                  {t('admin.fabricLibrary.order', { defaultValue: 'Order' })}
                </Button>
              </>
            )}
            {canCheck && (
              <Button size="sm" variant="outline" onClick={() => setCheckOf({ fabric: f, colour: c })}>
                <ClipboardCheck size={15} />
                {t('admin.stockCheck.short', { defaultValue: 'Update' })}
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{t('admin.fabricLibrary.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canCheck && (
            <Button size="sm" variant="outline" onClick={() => setCountOpen(true)}>
              <ClipboardCheck size={15} />
              {t('admin.stockCheck.short', { defaultValue: 'Update' })}
            </Button>
          )}
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => setNewFabricOpen(true)}>
                <Plus size={15} />
                {t('admin.fabricLibrary.newFabric')}
              </Button>
              <Button size="sm" onClick={() => setIssueFor({})}>
                <ArrowUpRight size={15} />
                {t('admin.fabricLibrary.issueFabric')}
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tile('short', t('admin.fabricLibrary.kpi.short', { defaultValue: 'Short for lots' }))}
        {tile('running_out', t('admin.fabricLibrary.kpi.runningOut', { defaultValue: 'Running out' }))}
        {tile('out_of_stock', t('admin.fabricLibrary.kpi.outOfStock', { defaultValue: 'Out of stock' }))}
        <SummaryCard
          label={t('admin.fabricLibrary.kpi.overdue', { defaultValue: 'Overdue orders' })}
          value={loading ? '—' : overdueOrders}
          tone={!loading && overdueOrders > 0 ? 'warning' : undefined}
          to="/fabric-orders?chip=overdue"
          className="p-4"
        />
        {tile('check', t('admin.fabricLibrary.kpi.check', { defaultValue: 'Check stock' }))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full max-w-sm"
          value={search}
          onChange={setSearch}
          placeholder={t('admin.fabricLibrary.searchPh', { defaultValue: 'Search fabric, colour or code…' })}
        />
        {/* Same filter the tiles set — one active at a time. */}
        <FilterChips
          ariaLabel={t('admin.fabricLibrary.cols.stock', { defaultValue: 'Stock' })}
          options={(Object.keys(CHIP_LABEL) as Chip[]).map((k) => ({
            value: k,
            label: t(`admin.fabricLibrary.chips.${k}`, { defaultValue: CHIP_LABEL[k] }),
          }))}
          value={chip ? [chip] : []}
          onToggle={(k) => setChip(chip === k ? null : k)}
          onClear={() => setChip(null)}
          clearLabel={t('common.clear', { defaultValue: 'Clear' })}
        />
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          {/* Fixed widths so every row lines up; spare width goes to Actions, whose buttons sit right. */}
          <table className="w-full min-w-[1140px] table-fixed text-sm">
            <colgroup>
              <col className="w-[300px]" />
              <col className="w-[240px]" />
              <col className="w-[160px]" />
              <col className="w-[140px]" />
              <col />
            </colgroup>
            <thead className="bg-[var(--color-surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-3 py-2 text-left">{t('admin.fabricLibrary.cols.colour', { defaultValue: 'Colour' })}</th>
                <th className="px-3 py-2 text-left">
                  <SortHeader
                    label={t('admin.fabricLibrary.cols.stock', { defaultValue: 'Stock' })}
                    col="stock"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">{t('admin.fabricLibrary.cols.onOrder', { defaultValue: 'On order' })}</th>
                <th className="px-3 py-2 text-left">
                  <SortHeader
                    label={t('admin.fabricLibrary.cols.lastUpdated', { defaultValue: 'Last updated' })}
                    col="updated"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </th>
                <th className="px-3 py-2 text-right">{t('admin.fabricLibrary.cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted-foreground)]">
                    {t('common.loading', 'Loading…')}
                  </td>
                </tr>
              )}
              {!loading && (stockRanked ? stockRanked.length === 0 : groups.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-muted-foreground)]">
                    {t('admin.fabricLibrary.empty')}
                  </td>
                </tr>
              )}
              {!loading && stockRanked?.map(({ fabric: f, colour: c }) => colourRow(f, c, true))}
              {!loading &&
                !stockRanked &&
                groups.map(({ fabric: f, colours }) => {
                  const isCollapsed = collapsed.has(f.id);
                  const img = f.imagePath ? imageUrls[f.imagePath] : undefined;
                  return (
                    <Fragment key={f.id}>
                      <tr
                        className="cursor-pointer border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/60 hover:bg-[var(--color-surface-2)]"
                        onClick={(e) => {
                          // The name still opens the fabric; anywhere else on the heading folds its colours.
                          if (!(e.target as HTMLElement).closest('button, a')) toggle(f.id);
                        }}
                      >
                        <td colSpan={3} className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggle(f.id)}
                              className="text-[var(--color-muted-foreground)]"
                              aria-label={isCollapsed ? t('common.expand', { defaultValue: 'Expand' }) : t('common.collapse', { defaultValue: 'Collapse' })}
                            >
                              {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            </button>
                            {img && (
                              <img src={img} alt="" className="h-8 w-8 rounded-[var(--radius-sm)] border border-[var(--color-border)] object-cover" />
                            )}
                            <button
                              type="button"
                              onClick={() => navigate(`/fabric-library/${f.id}`)}
                              className="font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              {f.name}
                            </button>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {[
                                f.code,
                                f.typeLabel,
                                f.gsm != null ? `${f.gsm} GSM` : null,
                                f.cuttableWidth != null ? `${Number(f.cuttableWidth)}″` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            {(f.colours ?? []).length === 0 && (
                              <span className="text-xs italic text-[var(--color-muted-foreground)]">
                                {t('admin.fabricLibrary.noColoursYet', { defaultValue: 'no colours yet' })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <LastUpdated at={f.lastUpdatedAt} />
                        </td>
                        <td />
                      </tr>
                      {!isCollapsed && colours.map((c) => colourRow(f, c, false))}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        open={newFabricOpen}
        onClose={() => setNewFabricOpen(false)}
        maxWidthClassName="max-w-3xl"
        title={t('admin.fabricLibrary.newFabric')}
      >
        <FabricEditorForm
          editing={null}
          existing={fabrics}
          onCancel={() => setNewFabricOpen(false)}
          onSaved={() => {
            setNewFabricOpen(false);
            void load();
          }}
          onSavedAndOrder={(created) => {
            setNewFabricOpen(false);
            void load();
            const cs = created.colours ?? [];
            setOrderFor({ fabricId: created.id, fabricColourId: cs.length === 1 ? cs[0].id : undefined });
          }}
        />
      </Dialog>

      <FabricOrderDialog
        open={orderFor != null}
        preset={orderFor ?? undefined}
        fabrics={fabrics}
        onClose={() => setOrderFor(null)}
        onSaved={() => {
          setOrderFor(null);
          toast.show(t('admin.fabricOrders.saved', { defaultValue: 'Order saved.' }));
          void load();
        }}
      />

      <IssueSlipDialog
        open={issueFor != null}
        preset={issueFor ?? undefined}
        fabrics={fabrics}
        onClose={() => setIssueFor(null)}
        onSaved={() => {
          setIssueFor(null);
          void load();
        }}
      />

      <Dialog
        open={ordersOf != null}
        onClose={() => setOrdersOf(null)}
        maxWidthClassName="max-w-4xl"
        title={ordersOf ? `${ordersOf.fabric.name} · ${ordersOf.colour.name}` : ''}
      >
        {ordersOf && (
          <FabricOrdersTable
            orders={ordersByColour.get(ordersOf.colour.id) ?? []}
            fabrics={fabrics}
            canEdit={canEdit}
            onChanged={() => void load()}
          />
        )}
      </Dialog>

      <CountSheetDialog
        open={countOpen}
        fabrics={fabrics}
        onClose={() => setCountOpen(false)}
        onSaved={() => {
          setCountOpen(false);
          void load();
        }}
        onRefresh={() => void load()}
      />

      <StockCheckDialog
        target={
          checkOf
            ? {
                fabricColourId: checkOf.colour.id,
                name: `${checkOf.fabric.name} · ${checkOf.colour.name}`,
                stock: checkOf.colour.availableQuantity ?? 0,
                unit: checkOf.fabric.unitOfMeasure,
              }
            : null
        }
        onClose={() => setCheckOf(null)}
        onSaved={() => {
          setCheckOf(null);
          void load();
        }}
      />
    </div>
  );
}
