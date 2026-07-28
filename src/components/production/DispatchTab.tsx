import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronRight, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import AcceptChallanDialog from '@/components/production/AcceptChallanDialog';
import { printChallan } from '@/components/production/printChallan';
import {
  acceptDispatch,
  cancelDispatch,
  getDispatches,
  type DispatchStatus,
  type ProductionDispatch,
} from '@/api/productionDispatch';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

const statusTone: Record<DispatchStatus, string> = {
  sent: 'bg-amber-50 text-amber-700',
  received: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]',
};

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
  const [rows, setRows] = useState<ProductionDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | ''>('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [acceptTarget, setAcceptTarget] = useState<ProductionDispatch | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProductionDispatch | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getDispatches({ status: statusFilter || undefined });
      setRows(res.rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onAccept = (items: { itemId: number; qtyReceived: number }[]) => {
    const target = acceptTarget;
    if (!target) return;
    setBusy(true);
    acceptDispatch(target.id, items)
      .then((updated) => {
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
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

  const onCancel = () => {
    const target = cancelTarget;
    if (!target || cancelReason.trim().length < 3) return;
    setBusy(true);
    cancelDispatch(target.id, cancelReason.trim())
      .then((updated) => {
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setCancelTarget(null);
        setCancelReason('');
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

  return (
    <div className="space-y-3">
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

      {loading ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
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
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          {rows.map((d) => {
            const isOpen = !!expanded[d.id];
            return (
              <div key={d.id} className="border-b border-[var(--color-border)] last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-2)]/50">
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [d.id]: !p[d.id] }))}
                    aria-expanded={isOpen}
                    aria-label={t('admin.production.dispatch.toggleItems', { defaultValue: 'Show lines' })}
                    className="text-[var(--color-muted-foreground)]"
                  >
                    <ChevronRight size={16} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <div className="w-32 font-mono text-xs font-semibold">{d.challanNo}</div>
                  <div className="min-w-0 flex-1 truncate text-sm">{d.destWarehouseName}</div>
                  <div className="w-24 text-right text-sm">
                    <span className="font-semibold">{d.qtySent}</span>{' '}
                    <span className="text-[11px] text-[var(--color-muted-foreground)]">
                      {t('admin.production.dispatch.pcs', { defaultValue: 'pcs' })}
                    </span>
                  </div>
                  <div className="w-24 text-xs text-[var(--color-muted-foreground)]">{fmtDate(d.dispatchedAt)}</div>
                  <div className="flex w-28 items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[d.status]}`}>
                      {t(`admin.production.dispatch.status.${d.status}`, {
                        defaultValue: d.status === 'sent' ? 'Awaiting' : d.status,
                      })}
                    </span>
                    {d.hasMismatch && (
                      <AlertTriangle size={14} className="text-amber-600" aria-label="mismatch" />
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => printChallan(d)}>
                      <Printer size={14} />
                    </Button>
                    {canCancel && d.status === 'sent' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setCancelReason('');
                          setCancelTarget(d);
                        }}
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
                  <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-3 pl-12">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                          <th className="py-1 text-left">
                            {t('admin.production.dispatch.item', { defaultValue: 'Item' })}
                          </th>
                          <th className="py-1 text-left">SKU</th>
                          <th className="py-1 text-left">{t('admin.production.size', { defaultValue: 'Size' })}</th>
                          <th className="py-1 text-right">{t('admin.production.dispatch.sent', { defaultValue: 'Sent' })}</th>
                          <th className="py-1 text-right">
                            {t('admin.production.dispatch.received', { defaultValue: 'Received' })}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((it) => (
                          <tr key={it.id} className="border-t border-[var(--color-border)]/50">
                            <td className="py-1">
                              {it.name}
                              {it.batchNo && (
                                <span className="ml-1 font-mono text-[11px] text-[var(--color-muted-foreground)]">
                                  {it.batchNo}
                                </span>
                              )}
                            </td>
                            <td className="py-1 font-mono text-xs text-[var(--color-muted-foreground)]">{it.sku}</td>
                            <td className="py-1 font-semibold">{it.sizeLabel}</td>
                            <td className="py-1 text-right">{it.qtySent}</td>
                            <td
                              className={`py-1 text-right ${
                                it.mismatchFlagged ? 'font-semibold text-amber-600' : ''
                              }`}
                            >
                              {it.qtyReceived ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {d.notes && (
                      <div className="mt-2 text-xs text-[var(--color-muted-foreground)]">{d.notes}</div>
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

      <Dialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        maxWidthClassName="max-w-md"
        title={
          <div className="text-base font-semibold">
            {t('admin.production.dispatch.cancel.title', {
              defaultValue: 'Cancel challan {{no}}?',
              no: cancelTarget?.challanNo ?? '',
            })}
          </div>
        }
        footer={
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setCancelTarget(null)}>
              {t('admin.production.dispatch.cancel.keep', { defaultValue: 'Keep it' })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || cancelReason.trim().length < 3}
              onClick={onCancel}
            >
              {t('admin.production.dispatch.cancel.confirm', { defaultValue: 'Cancel challan' })}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-xs font-semibold text-[var(--color-muted-foreground)]">
          {t('admin.production.dispatch.cancel.reasonLabel', { defaultValue: 'Reason' })}
        </label>
        <Input
          autoFocus
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder={t('admin.production.dispatch.cancel.reasonPlaceholder', {
            defaultValue: 'Why is this challan being voided?',
          })}
        />
      </Dialog>
    </div>
  );
}
