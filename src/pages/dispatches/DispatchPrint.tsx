import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { getDispatch } from '@/api/dispatches';
import { FeatureUnavailableError } from '@/api/_errors';
import type { DispatchDetail as DispatchDetailT } from '@/api/types';

export default function DispatchPrint() {
  const { t } = useTranslation();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DispatchDetailT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getDispatch(id);
        if (!cancelled) setData(res);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof FeatureUnavailableError
            ? t('common.featureUnavailable')
            : t('common.error'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  // Auto-fire the browser print dialog once the data has rendered. Guard
  // against re-runs (StrictMode double-effect + state changes).
  useEffect(() => {
    if (!data || printedRef.current) return;
    printedRef.current = true;
    const orig = document.title;
    document.title = `Challan ${data.dispatchNo}`;
    const timer = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(timer);
      document.title = orig;
    };
  }, [data]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-[var(--color-destructive)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
      </div>
    );
  }

  const totalSent = data.items.reduce((a, it) => a + (it.qtySent ?? 0), 0);

  return (
    <div className="print-root mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <button
          type="button"
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={() => navigate(-1)}
        >
          ← {t('common.back')}
        </button>
        <button
          type="button"
          className="rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm text-white"
          onClick={() => window.print()}
        >
          {t('dispatchPrint.print', { defaultValue: 'Print' })}
        </button>
      </div>

      <header className="mb-6 border-b border-black/30 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('dispatchPrint.title', { defaultValue: 'Dispatch Challan' })}
        </h1>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-black/60">
              {t('dispatchPrint.no', { defaultValue: 'Challan No' })}:
            </span>{' '}
            <span className="font-mono font-semibold">{data.dispatchNo}</span>
          </div>
          <div>
            <span className="text-black/60">
              {t('dispatchPrint.date', { defaultValue: 'Date' })}:
            </span>{' '}
            {data.dispatchedAt
              ? new Date(data.dispatchedAt).toLocaleString()
              : '—'}
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-black/60">
            {t('dispatchPrint.to', { defaultValue: 'Ship to' })}
          </div>
          <div className="font-semibold">
            {data.destWarehouse?.name ?? data.destWarehouseId}
          </div>
          {data.destWarehouse?.code && (
            <div className="font-mono text-xs text-black/60">
              {data.destWarehouse.code}
            </div>
          )}
        </div>
        {data.order && (
          <div>
            <div className="text-black/60">
              {t('dispatchPrint.order', { defaultValue: 'Order' })}
            </div>
            <div className="font-mono">{data.order.orderNo}</div>
          </div>
        )}
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="px-2 py-2 text-left">
              {t('dispatchPrint.cols.lot', { defaultValue: 'Lot' })}
            </th>
            <th className="px-2 py-2 text-left">
              {t('dispatchPrint.cols.sku', { defaultValue: 'SKU' })}
            </th>
            <th className="px-2 py-2 text-left">
              {t('dispatchPrint.cols.size', { defaultValue: 'Size' })}
            </th>
            <th className="px-2 py-2 text-right">
              {t('dispatchPrint.cols.qty', { defaultValue: 'Qty' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it) => (
            <tr key={it.id} className="border-b border-black/20">
              <td className="px-2 py-1.5 font-mono text-xs">
                {it.lotNo ?? it.lotId}
              </td>
              <td className="px-2 py-1.5 font-mono text-xs">{it.sku}</td>
              <td className="px-2 py-1.5">{it.sizeLabel}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {it.qtySent}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-semibold">
            <td className="px-2 py-2" colSpan={3}>
              {t('dispatchPrint.total', { defaultValue: 'Total' })}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">{totalSent}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-12 grid grid-cols-2 gap-12 text-sm">
        <div>
          <div className="border-t border-black/60 pt-2">
            {t('dispatchPrint.signSender', { defaultValue: 'Sender signature' })}
          </div>
        </div>
        <div>
          <div className="border-t border-black/60 pt-2">
            {t('dispatchPrint.signReceiver', {
              defaultValue: 'Receiver signature',
            })}
          </div>
        </div>
      </footer>
    </div>
  );
}
