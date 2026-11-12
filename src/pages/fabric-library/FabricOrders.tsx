import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PackageCheck, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FilterChips } from '@/components/ui/filter-rail';
import { SummaryCard } from '@/components/ui/summary-card';
import { localISO, todayISO } from '@/lib/date';
import { ALL_TIME_FROM_ISO, DateRangePicker } from '@/components/ui/DateRangePicker';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import FabricOrdersTable from '@/components/fabrics/FabricOrdersTable';
import FabricOrderDialog from '@/components/fabrics/FabricOrderDialog';
import ReceiveChallanDialog from '@/components/fabrics/ReceiveChallanDialog';
import { listFabricOrders } from '@/api/fabricOrders';
import { listFabrics } from '@/api/styles';
import { useAuth } from '@/context/auth';
import { FABRIC_WRITE_ROLES, hasAnyRole } from '@/lib/userRoles';
import { OPEN_ORDER_STATUSES, poLabel } from '@/lib/fabric';
import type { Fabric, FabricOrder } from '@/api/types';

type Chip = 'overdue' | 'due_week' | 'need_to_order' | 'on_hold' | 'closed';
const CHIP_LABEL: Record<Chip, string> = {
  overdue: 'Overdue',
  due_week: 'Due this week',
  need_to_order: 'Need to order',
  on_hold: 'On hold',
  closed: 'Closed',
};

/** Expected in the next 7 days and not already late. */
function dueThisWeek(o: FabricOrder): boolean {
  if (!o.expectedDate || o.isOverdue || !OPEN_ORDER_STATUSES.includes(o.status)) return false;
  const weekOut = new Date();
  weekOut.setDate(weekOut.getDate() + 7);
  return o.expectedDate <= localISO(weekOut);
}

/** Overdue first, then by due date; undated last. */
const byUrgency = (a: FabricOrder, b: FabricOrder) =>
  Number(b.isOverdue) - Number(a.isOverdue) ||
  (a.expectedDate ?? '9999').localeCompare(b.expectedDate ?? '9999') ||
  b.id - a.id;

/** Every fabric order in one list — what's late, what's coming, and Receive when it arrives. */
export default function FabricOrders() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = hasAnyRole(user, FABRIC_WRITE_ROLES);

  const [orders, setOrders] = useState<FabricOrder[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState<number | ''>('');
  const [params] = useSearchParams();
  // The Library's "Overdue orders" tile links here with ?chip=overdue.
  const [chip, setChip] = useState<Chip | null>(() => {
    const c = params.get('chip');
    return c && c in CHIP_LABEL ? (c as Chip) : null;
  });
  const [newOpen, setNewOpen] = useState(false);
  // Order-date window; all time until someone narrows it.
  const [dateFrom, setDateFrom] = useState(ALL_TIME_FROM_ISO);
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [receiveOpen, setReceiveOpen] = useState(false);

  // ponytail: whole list client-side; page it server-side once closed history grows large.
  const load = useCallback(async () => {
    try {
      const [os, fs] = await Promise.all([listFabricOrders(), listFabrics()]);
      setOrders(os);
      setFabrics(fs);
    } catch {
      toast.show(t('admin.fabricOrders.loadError', { defaultValue: 'Could not load orders.' }), 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const vendors = useMemo(
    () =>
      [...new Map(orders.filter((o) => o.vendor).map((o) => [o.vendor!.id, o.vendor!.name])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [orders],
  );

  // Supplier, dates and search; tiles count this set so a tile matches the list it opens.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const allTime = dateFrom === ALL_TIME_FROM_ISO;
    return orders.filter((o) => {
      if (vendorId !== '' && o.vendor?.id !== vendorId) return false;
      if (!allTime && (o.orderDate < dateFrom || o.orderDate > dateTo)) return false;
      if (!q) return true;
      return [poLabel(o.orderNo), String(o.orderNo), o.fabric?.name, o.fabric?.code, o.colour?.name, o.itemName, o.vendor?.name]
        .some((x) => x?.toLowerCase().includes(q));
    });
  }, [orders, search, vendorId, dateFrom, dateTo]);

  const open = filtered.filter((o) => OPEN_ORDER_STATUSES.includes(o.status));
  // Coloured only when there's something to act on.
  const tile = (k: Chip, label: string, tone: 'danger' | 'warning', match: (o: FabricOrder) => boolean) => {
    const n = open.filter(match).length;
    return (
      <SummaryCard
        label={label}
        value={loading ? '—' : n}
        tone={!loading && n > 0 ? tone : undefined}
        onClick={() => setChip(chip === k ? null : k)}
        className={cn('p-4', chip === k && 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20')}
      />
    );
  };

  const shown = useMemo(
    () =>
      filtered
        .filter((o) => {
          const open = OPEN_ORDER_STATUSES.includes(o.status);
          if (chip === 'closed' ? open : !open) return false;
          if (chip === 'overdue' && !o.isOverdue) return false;
          if (chip === 'due_week' && !dueThisWeek(o)) return false;
          if ((chip === 'need_to_order' || chip === 'on_hold') && o.status !== chip) return false;
          return true;
        })
        .sort(byUrgency),
    [filtered, chip],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {t('admin.nav.fabricOrders', { defaultValue: 'Fabric orders' })}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-9 w-auto text-[13px]"
            value={vendorId === '' ? '' : String(vendorId)}
            onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : '')}
            aria-label={t('admin.fabricOrders.vendor', { defaultValue: 'Supplier' })}
          >
            <option value="">{t('admin.fabricLibrary.allVendors', { defaultValue: 'All suppliers' })}</option>
            {vendors.map(([id, name]) => (
              <option key={id} value={String(id)}>
                {name}
              </option>
            ))}
          </Select>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            label={t('admin.fabricOrders.ordered', { defaultValue: 'Ordered' })}
            onApply={(f, to) => {
              setDateFrom(f);
              setDateTo(to);
            }}
          />
          {canEdit && (
          <>
            <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
              <Plus size={15} />
              {t('admin.fabricOrders.new', { defaultValue: 'New order' })}
            </Button>
            <Button size="sm" onClick={() => setReceiveOpen(true)}>
              <PackageCheck size={15} />
              {t('admin.receiveOrder.title', { defaultValue: 'Receive' })}
            </Button>
          </>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label={t('admin.fabricOrders.kpi.open', { defaultValue: 'Open orders' })}
          value={loading ? '—' : open.length}
          onClick={() => setChip(null)}
          className={cn('p-4', chip == null && 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20')}
        />
        {tile('overdue', t('admin.fabricOrders.chips.overdue', { defaultValue: 'Overdue' }), 'danger', (o) => o.isOverdue)}
        {tile('due_week', t('admin.fabricOrders.chips.due_week', { defaultValue: 'Due this week' }), 'warning', dueThisWeek)}
        {tile('need_to_order', t('admin.fabricOrders.chips.need_to_order', { defaultValue: 'Need to order' }), 'warning', (o) => o.status === 'need_to_order')}
        {tile('on_hold', t('admin.fabricOrders.chips.on_hold', { defaultValue: 'On hold' }), 'warning', (o) => o.status === 'on_hold')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-primary)]" />
          <Input
            className="h-9 pl-9 text-[13px] border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/30 focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
            placeholder={t('admin.fabricOrders.searchPh', { defaultValue: 'Search PO, fabric, colour or supplier…' })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterChips
          options={(Object.keys(CHIP_LABEL) as Chip[]).map((k) => ({
            value: k,
            label: t(`admin.fabricOrders.chips.${k}`, { defaultValue: CHIP_LABEL[k] }),
          }))}
          value={chip ? [chip] : []}
          onToggle={(k) => setChip(chip === k ? null : k)}
          onClear={() => setChip(null)}
          clearLabel={t('common.clear', { defaultValue: 'Clear' })}
        />
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {loading ? (
          <div className="px-4 py-8 text-center text-[13px] text-[var(--color-muted-foreground)]">
            {t('common.loading', 'Loading…')}
          </div>
        ) : (
          <FabricOrdersTable orders={shown} fabrics={fabrics} showFabric canEdit={canEdit} onChanged={() => void load()} />
        )}
      </section>

      <ReceiveChallanDialog
        open={receiveOpen}
        orders={orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status))}
        onClose={() => setReceiveOpen(false)}
        onSaved={() => {
          setReceiveOpen(false);
          void load();
        }}
      />
      <FabricOrderDialog
        open={newOpen}
        fabrics={fabrics}
        onClose={() => setNewOpen(false)}
        onSaved={() => {
          setNewOpen(false);
          void load();
        }}
      />
    </div>
  );
}
