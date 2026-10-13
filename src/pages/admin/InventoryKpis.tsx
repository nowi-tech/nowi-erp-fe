import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { getInventoryKpis, type InventoryKpisResponse } from '@/api/inventoryKpis';
import { CARD_SHELL, DISPLAY, fmt, SANS } from '@/components/admin/kpiPrimitives';

const PALETTE = ['#3b5bdb', '#0ca678', '#7048e8', '#e8590c', '#c4322a'];

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent: string;
}): React.ReactNode {
  return (
    <div style={{ ...CARD_SHELL, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 34, lineHeight: 1, fontWeight: 600, color: '#11151f' }}>
        {fmt(value)}
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

export default function InventoryKpis(): React.ReactNode {
  const { t } = useTranslation();
  const [data, setData] = useState<InventoryKpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumped by the error-state Retry button to re-run the fetch.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getInventoryKpis()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const styles = (n: number) => t('admin.inventoryKpis.styles', { count: n, defaultValue: '{{count}} styles' });
  const status = (s: 'out' | 'cut' | null) =>
    s === 'out'
      ? t('admin.inventoryKpis.out', { defaultValue: 'Out of stock' })
      : s === 'cut'
        ? t('admin.inventoryKpis.cut', { defaultValue: 'Cut size' })
        : t('admin.inventoryKpis.inStock', { defaultValue: 'In stock' });
  const synced = data?.syncedAt
    ? new Date(data.syncedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    // Negative margins cancel AdminShell's <main> padding, as on the other KPI dashboards.
    <div
      className="-m-4 sm:-m-6 lg:-m-8"
      style={{
        minHeight: '100%',
        background: '#f4f5f7',
        padding: '40px clamp(20px, 4vw, 56px) 44px',
        fontFamily: SANS,
        color: '#11151f',
      }}
    >
      <h1
        style={{
          fontFamily: DISPLAY,
          fontSize: 40,
          lineHeight: 1.05,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          margin: '0 0 28px',
        }}
      >
        {t('admin.inventoryKpis.title', { defaultValue: 'Inventory KPIs' })}
      </h1>

      {failed && !loading ? (
        <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '44px 20px' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>
            {t('admin.inventoryKpis.failed', { defaultValue: 'Couldn’t load inventory KPIs' })}
          </div>
          <button
            type="button"
            onClick={() => setTick((n) => n + 1)}
            style={{
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: '#11151f',
              border: 'none',
              borderRadius: 999,
              padding: '8px 18px',
              cursor: 'pointer',
            }}
          >
            {t('admin.inventoryKpis.retry', { defaultValue: 'Retry' })}
          </button>
        </div>
      ) : loading || !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-[18px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={CARD_SHELL}>
              <Skeleton className="h-3 w-28 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md mt-4" />
              <Skeleton className="h-3 w-32 rounded-md mt-3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-[18px]">
            <Tile
              label={t('admin.inventoryKpis.live', { defaultValue: 'Total inventory live' })}
              value={data.live.units}
              sub={t('admin.inventoryKpis.byWarehouse', {
                india: fmt(data.live.india),
                china: fmt(data.live.china),
                defaultValue: 'India {{india}} · China {{china}}',
              })}
              accent={PALETTE[0]}
            />
            <Tile
              label={t('admin.inventoryKpis.best', { defaultValue: 'Bestseller inventory' })}
              value={data.best.units}
              sub={styles(data.best.styles)}
              accent={PALETTE[1]}
            />
            <Tile
              label={t('admin.inventoryKpis.avg', { defaultValue: 'Avg seller inventory' })}
              value={data.avg.units}
              sub={styles(data.avg.styles)}
              accent={PALETTE[2]}
            />
            <Tile
              label={t('admin.inventoryKpis.poor', { defaultValue: 'Poor seller inventory' })}
              value={data.poor.units}
              sub={styles(data.poor.styles)}
              accent={PALETTE[3]}
            />
            <Tile
              label={t('admin.inventoryKpis.bestShort', { defaultValue: 'Bestseller with cut size / OOS' })}
              value={data.bestsellerCut + data.bestsellerOut}
              sub={t('admin.inventoryKpis.bestShortSplit', {
                cut: data.bestsellerCut,
                out: data.bestsellerOut,
                defaultValue: '{{cut}} cut size · {{out}} out of stock',
              })}
              accent={PALETTE[4]}
            />
          </div>

          <div style={{ ...CARD_SHELL, marginTop: 18, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 600 }}>{t('admin.inventoryKpis.colStyle', { defaultValue: 'Bestseller' })}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>{t('admin.inventoryKpis.colDrr', { defaultValue: 'DRR' })}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>{t('admin.inventoryKpis.colStock', { defaultValue: 'Stock' })}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 600 }}>{t('admin.inventoryKpis.colStatus', { defaultValue: 'Status' })}</th>
                </tr>
              </thead>
              <tbody>
                {data.bestsellers.map((b) => (
                  <tr key={b.styleKey} style={{ borderTop: '1px solid #eef0f3' }}>
                    <td style={{ padding: '12px 18px' }}>
                      <div style={{ fontWeight: 600 }}>{b.styleKey}</div>
                      {b.name && <div style={{ fontSize: 12.5, color: '#6b7280' }}>{b.name}</div>}
                    </td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>{fmt(b.drr)}</td>
                    <td style={{ padding: '12px 18px', textAlign: 'right' }}>{fmt(b.stock)}</td>
                    <td style={{ padding: '12px 18px', fontWeight: 600, color: b.stockout === 'out' ? '#c4322a' : b.stockout === 'cut' ? '#e8590c' : '#0ca678' }}>
                      {status(b.stockout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {synced && (
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 26, fontWeight: 500 }}>
              {t('admin.inventoryKpis.updated', { defaultValue: 'Updated' })} {synced}
            </div>
          )}
        </>
      )}
    </div>
  );
}
