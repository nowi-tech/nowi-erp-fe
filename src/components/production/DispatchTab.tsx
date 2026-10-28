import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AlertTriangle, ChevronRight, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import AcceptChallanDialog from '@/components/production/AcceptChallanDialog';
import ReasonDialog from '@/components/production/ReasonDialog';
import { printChallan } from '@/components/production/printChallan';
import { useAuth } from '@/context/auth';
import { useDebounced } from '@/lib/useDebounced';
import { hasAnyRole, PRODUCTION_READ_ROLES, STYLE_VIEW_ROLES } from '@/lib/userRoles';
import {
  acceptDispatch,
  cancelDispatch,
  getDispatches,
  type DispatchItemRow,
  type DispatchStatus,
  type ProductionDispatch,
} from '@/api/productionDispatch';

// Web: open style details in a new tab. The APK WebView has no tabs, so stay in place.
const newTab = Capacitor.isNativePlatform() ? {} : { target: '_blank', rel: 'noopener noreferrer' };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

const statusLabel: Record<DispatchStatus, string> = {
  sent: 'Awaiting',
  received: 'Received',
  cancelled: 'Cancelled',
};

const statusTone: Record<DispatchStatus, string> = {
  sent: 'bg-amber-50 text-amber-700',
  received: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]',
};

interface StyleGroup {
  key: string;
  head: DispatchItemRow;
  lines: DispatchItemRow[];
  qtySent: number;
}

/** One group per batch (or per off-system label), sizes kept in challan order. */
function groupLines(items: DispatchItemRow[]): StyleGroup[] {
  const groups = new Map<string, StyleGroup>();
  for (const it of items) {
    const key = it.batchId != null ? `b${it.batchId}` : `l${it.name}|${it.brandName ?? ''}`;
    const g = groups.get(key) ?? { key, head: it, lines: [], qtySent: 0 };
    g.lines.push(it);
    g.qtySent += it.qtySent;
    groups.set(key, g);
  }
  return [...groups.values()];
}

/**
 * The Dispatch tab — a ledger of production challans and the warehouse
 * acceptance queue. Deliberately VIEW + ACCEPT only: challans are created from
 * the Completed tab, never here.
 */
export default function DispatchTab({
  canAccept,
  canCancel = false,
}: {
  canAccept: boolean;
  canCancel?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const canOpenStyle = hasAnyRole(user, STYLE_VIEW_ROLES);
  const canOpenHealth = hasAnyRole(user, PRODUCTION_READ_ROLES);
  const [rows, setRows] = useState<ProductionDispatch[]>([]);
  const [kpis, setKpis] = useState<{ awaiting: number; received: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | ''>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 300);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [acceptTarget, setAcceptTarget] = useState<ProductionDispatch | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProductionDispatch | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // A newer search/filter supersedes this one; drop its late response.
    let ignore = false;
    setLoading(true);
    setError(false);
    getDispatches({ status: statusFilter || undefined, search: debouncedSearch || undefined })
      .then((res) => {
        if (ignore) return;
        setRows(res.rows);
        setKpis(res.kpis);
      })
      .catch(() => {
        if (!ignore) setError(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [statusFilter, debouncedSearch]);

  /** ERP style → its workspace; EasyEcom-only → Inventory Health on that style; off-system → none. */
  const styleHref = (it: DispatchItemRow): string | null => {
    if (it.styleId != null && canOpenStyle) return `/styles/${it.styleRef ?? it.styleId}`;
    if (it.styleKey && canOpenHealth) {
      return `/admin/analytics/inventory-health?q=${encodeURIComponent(it.styleKey)}`;
    }
    return null;
  };

  const onAccept = (items: { itemId: number; qtyReceived: number }[]) => {
    const target = acceptTarget;
    if (!target) return;
    setBusy(true);
    acceptDispatch(target.id, items)
      .then((updated) => {
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setKpis((k) => k && { awaiting: k.awaiting - 1, received: k.received + 1 });
        setAcceptTarget(null);
      })
      .catch(() =>
        toast.show(
          t('admin.production.dispatch.acceptFailed', { defaultValue: "Couldn't record the receipt." }),
          'error',
        ),
      )
      .finally(() => setBusy(false));
  };

  const onCancel = (reason: string) => {
    const target = cancelTarget;
    if (!target) return;
    setBusy(true);
    cancelDispatch(target.id, reason)
      .then((updated) => {
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setKpis((k) => k && { ...k, awaiting: k.awaiting - 1 });
        setCancelTarget(null);
      })
      .catch(() =>
        toast.show(
          t('admin.production.dispatch.cancelFailed', { defaultValue: "Couldn't cancel the challan." }),
          'error',
        ),
      )
      .finally(() => setBusy(false));
  };

  const filterCls =
    'h-9 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]';

  const kpiChip = (status: DispatchStatus, label: string, value: number) => (
    <button
      type="button"
      onClick={() => setStatusFilter((s) => (s === status ? '' : status))}
      aria-pressed={statusFilter === status}
      className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-left transition-colors ${
        statusFilter === status
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]'
      }`}
    >
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {kpis && (
          <>
            {kpiChip('sent', t('admin.production.dispatch.status.sent', { defaultValue: 'Awaiting' }), kpis.awaiting)}
            {kpiChip(
              'received',
              t('admin.production.dispatch.status.received', { defaultValue: 'Received' }),
              kpis.received,
            )}
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.production.dispatch.searchPlaceholder', {
                defaultValue: 'Challan, style or SKU',
              })}
              className="h-9 w-60 pl-8"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DispatchStatus | '')}
            className={filterCls}
            aria-label={t('admin.production.dispatch.filterStatus', { defaultValue: 'Status' })}
          >
            <option value="">{t('admin.production.dispatch.statusAll', { defaultValue: 'Status: All' })}</option>
            <option value="sent">{t('admin.production.dispatch.status.sent', { defaultValue: 'Awaiting' })}</option>
            <option value="received">
              {t('admin.production.dispatch.status.received', { defaultValue: 'Received' })}
            </option>
            <option value="cancelled">
              {t('admin.production.dispatch.status.cancelled', { defaultValue: 'Cancelled' })}
            </option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton className="h-8 w-24 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-sm text-[var(--color-destructive)]">
          {t('admin.production.dispatch.loadError', { defaultValue: "Couldn't load challans." })}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          {t('admin.production.dispatch.empty', { defaultValue: 'No challans yet.' })}
        </div>
      ) : (
        <div className="@container overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((d) => {
            const isOpen = !!expanded[d.id];
            const groups = groupLines(d.items);
            const toggle = () => setExpanded((p) => ({ ...p, [d.id]: !p[d.id] }));
            return (
              <div key={d.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <div
                  className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 hover:bg-[var(--color-surface-2)]/50 @3xl:flex-nowrap"
                  onClick={toggle}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={t('admin.production.dispatch.toggleItems', { defaultValue: 'Show lines' })}
                    className="text-[var(--color-muted-foreground)]"
                  >
                    <ChevronRight size={16} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <div className="w-28 shrink-0">
                    <div className="font-mono text-xs font-semibold">{d.challanNo}</div>
                    <div className="text-[11px] text-[var(--color-muted-foreground)]">{fmtDate(d.dispatchedAt)}</div>
                  </div>
                  <div className="flex shrink-0 -space-x-2">
                    {groups.slice(0, 3).map((g) => (
                      <div key={g.key} className="rounded-[var(--radius-sm)] ring-2 ring-[var(--color-surface)]">
                        <HoverThumbnail src={g.head.imageUrl} alt={g.head.name} size={32} />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {groups.length === 1
                        ? groups[0].head.name
                        : t('admin.production.dispatch.styleCount', {
                            defaultValue: '{{count}} styles',
                            count: groups.length,
                          })}
                    </div>
                    <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                      → {d.destWarehouseName}
                    </div>
                  </div>
                  {/* Narrow list: qty, status and actions drop to a second line. */}
                  <div className="basis-full @3xl:hidden" />
                  <div className="shrink-0 pl-7 text-sm @3xl:w-20 @3xl:pl-0 @3xl:text-right">
                    <span className="font-semibold tabular-nums">{d.qtySent}</span>{' '}
                    <span className="text-[11px] text-[var(--color-muted-foreground)]">
                      {t('admin.production.dispatch.pcs', { defaultValue: 'pcs' })}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 @3xl:w-28">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[d.status]}`}>
                      {t(`admin.production.dispatch.status.${d.status}`, { defaultValue: statusLabel[d.status] })}
                    </span>
                    {d.hasMismatch && (
                      <AlertTriangle size={14} className="text-amber-600" aria-label="mismatch" />
                    )}
                  </div>
                  <div
                    className="ml-auto flex shrink-0 items-center justify-end gap-1.5 @3xl:ml-0 @3xl:w-52"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="outline" size="sm" onClick={() => printChallan(d)}>
                      <Printer size={14} />
                    </Button>
                    {canCancel && d.status === 'sent' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setCancelTarget(d)}
                      >
                        {t('admin.production.dispatch.cancel.cta', { defaultValue: 'Cancel' })}
                      </Button>
                    )}
                    {canAccept && d.status === 'sent' && (
                      <Button size="sm" onClick={() => setAcceptTarget(d)}>
                        {t('admin.production.dispatch.accept.cta', { defaultValue: 'Receive' })}
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="divide-y divide-[var(--color-border)]/60 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 pl-11">
                    {groups.map((g) => {
                      const href = styleHref(g.head);
                      const title = (
                        <span className="text-sm font-medium">{g.head.name}</span>
                      );
                      return (
                        <div key={g.key} className="flex items-center gap-3 py-2.5">
                          {href ? (
                            <Link to={href} {...newTab} className="shrink-0">
                              <HoverThumbnail src={g.head.imageUrl} alt={g.head.name} size={48} />
                            </Link>
                          ) : (
                            <HoverThumbnail src={g.head.imageUrl} alt={g.head.name} size={48} />
                          )}
                          <div className="min-w-0 flex-1">
                            {href ? (
                              <Link to={href} {...newTab} className="text-[var(--color-primary)] hover:underline">
                                {title}
                              </Link>
                            ) : (
                              title
                            )}
                            <div className="flex flex-wrap gap-x-2 text-[11px] text-[var(--color-muted-foreground)]">
                              {g.head.batchNo && <span className="font-mono">{g.head.batchNo}</span>}
                              {(g.head.styleRef ?? g.head.styleKey) && (
                                <span className="font-mono">{g.head.styleRef ?? g.head.styleKey}</span>
                              )}
                              {g.head.brandName && <span>{g.head.brandName}</span>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {g.lines.map((it) => {
                                const short = it.qtyReceived != null && it.qtyReceived !== it.qtySent;
                                return (
                                  <span
                                    key={it.id}
                                    title={it.sku}
                                    className={`rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[11px] tabular-nums ${
                                      it.mismatchFlagged || short
                                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                                    }`}
                                  >
                                    <span className="font-semibold">{it.sizeLabel}</span> {it.qtySent}
                                    {short && <> → {it.qtyReceived}</>}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                            {g.qtySent}
                          </div>
                        </div>
                      );
                    })}
                    {d.notes && (
                      <div className="py-2 text-xs text-[var(--color-muted-foreground)]">{d.notes}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AcceptChallanDialog
        open={acceptTarget !== null}
        busy={busy}
        dispatch={acceptTarget}
        onClose={() => setAcceptTarget(null)}
        onConfirm={onAccept}
      />

      <ReasonDialog
        open={cancelTarget !== null}
        busy={busy}
        title={t('admin.production.dispatch.cancel.title', {
          defaultValue: 'Cancel challan {{no}}?',
          no: cancelTarget?.challanNo ?? '',
        })}
        confirmLabel={t('admin.production.dispatch.cancel.confirm', { defaultValue: 'Cancel challan' })}
        placeholder={t('admin.production.dispatch.cancel.reasonPlaceholder', {
          defaultValue: 'Why is this challan being voided?',
        })}
        onClose={() => setCancelTarget(null)}
        onConfirm={onCancel}
      />
    </div>
  );
}
