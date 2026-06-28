import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { localISO, todayISO } from '@/lib/date';
import {
  getProductionKpis,
  type ProductionKpiCard,
  type ProductionKpisResponse,
} from '@/api/productionKpis';

// Ported from the Claude Design file "Production KPIs.dc.html": Space Grotesk /
// Manrope type, a live-status pill, and per-card accent + sparkline + trend chip.
const SANS = "'Manrope', system-ui, sans-serif";
const DISPLAY = "'Space Grotesk', sans-serif";
/** Per-card accent, in card order (Tailor, Loading, Out Machine, Productivity). */
const PALETTE = ['#3b5bdb', '#0ca678', '#7048e8', '#e8590c', '#0c8599'];

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

/** Format an ISO date (YYYY-MM-DD) as "25 Jun" for the spark tooltip. */
function fmtDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Compute the sparkline `polyline`/`polygon` strings + point coords. */
function sparkPaths(data: number[]): {
  line: string;
  area: string;
  lastX: number;
  lastY: number;
  pts: number[][];
} {
  const w = 100;
  const h = 40;
  const pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / Math.max(data.length - 1, 1);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return [x, y];
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${pad},${h} ${line} ${w - pad},${h}`;
  const last = pts[pts.length - 1];
  return { line, area, lastX: last[0], lastY: last[1], pts };
}

/** Interactive sparkline: full-width hover, guide line, styled tooltip. */
function Sparkline({
  data,
  dates,
  accent,
  unit,
}: {
  data: number[];
  dates: string[];
  accent: string;
  unit?: string;
}): React.ReactNode {
  const [hover, setHover] = useState<number | null>(null);
  const series = data.length ? data : [0, 0];
  const n = series.length;
  const sp = sparkPaths(series);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  };

  const hx = hover != null ? sp.pts[hover][0] : 0;
  const hy = hover != null ? sp.pts[hover][1] : 0;

  return (
    <div
      style={{ position: 'relative', marginTop: 12, height: 34 }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        style={{ width: '100%', height: 34, display: 'block', overflow: 'visible' }}
      >
        <polygon points={sp.area} fill={accent} fillOpacity={0.07} stroke="none" />
        <polyline
          points={sp.line}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover != null ? (
          <>
            <line
              x1={hx}
              y1={0}
              x2={hx}
              y2={40}
              stroke={accent}
              strokeOpacity={0.3}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hx} cy={hy} r={3.4} fill={accent} stroke="#fff" strokeWidth={1.5} />
          </>
        ) : (
          <circle cx={sp.lastX} cy={sp.lastY} r={2.6} fill={accent} stroke="#fff" strokeWidth={1.5} />
        )}
      </svg>
      {hover != null && (
        <div
          style={{
            position: 'absolute',
            // Clamp so the centered tooltip doesn't clip off the card at the
            // first/last spark point.
            left: `${Math.max(10, Math.min(90, hx))}%`,
            top: -6,
            transform: 'translate(-50%, -100%)',
            background: '#11151f',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: SANS,
            padding: '4px 8px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(16,24,40,0.22)',
            zIndex: 2,
          }}
        >
          {fmtDate(dates[hover])}: {fmt(series[hover])}
          {unit ? ` ${unit}` : ''}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  card,
  accent,
  live,
  showSpark,
  yesterdayLabel,
}: {
  card: ProductionKpiCard;
  accent: string;
  live: boolean;
  showSpark: boolean;
  /** Label under the headline value — the date of the day it's from. */
  yesterdayLabel: string;
}): React.ReactNode {
  const { t } = useTranslation();
  const up = card.trendPct >= 0;
  const unitSuffix = card.unit ? ` ${card.unit}` : '';

  return (
    <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column', fontFamily: SANS }}>
      {/* Header: accent square + label, trend chip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span
            style={{ flex: 'none', width: 7, height: 7, borderRadius: 2, background: accent }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: '#6b7280',
              lineHeight: 1.25,
            }}
          >
            {card.label}
          </span>
        </div>
        <span
          style={{
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 700,
            background: !live ? '#f3f4f6' : up ? 'rgba(15,122,82,0.10)' : 'rgba(196,50,42,0.10)',
            color: !live ? '#9ca3af' : up ? '#0f7a52' : '#c4322a',
          }}
        >
          {!live ? '–' : up ? '▲' : '▼'}{' '}
          {live ? `${Math.abs(card.trendPct).toFixed(1)}%` : '—'}
        </span>
      </div>

      {/* Headline: yesterday */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 40,
            lineHeight: 1,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: '#11151f',
            fontFeatureSettings: "'tnum' 1",
          }}
        >
          {live ? fmt(card.yesterday) : '—'}
        </span>
        {card.unit && (
          <span style={{ fontSize: 16, fontWeight: 600, color: '#9ca3af' }}>{card.unit}</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginTop: 5 }}>
        {yesterdayLabel}
      </div>

      {/* Sparkline */}
      {showSpark && (
        <Sparkline data={card.spark} dates={card.sparkDates} accent={accent} unit={card.unit} />
      )}

      <div style={{ height: 1, background: '#eef0f3', margin: '13px 0 12px' }} />

      {/* Secondary: last 7 days + this month */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div
            style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: '#1f2937', fontFeatureSettings: "'tnum' 1" }}
          >
            {live ? `${fmt(card.last7Days)}${unitSuffix}` : '—'}
          </div>
          <div
            style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af', marginTop: 4 }}
          >
            {t('admin.productionKpis.last7Days', { defaultValue: 'Last 7 days' })}
          </div>
        </div>
        <div>
          <div
            style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: '#1f2937', fontFeatureSettings: "'tnum' 1" }}
          >
            {live ? `${fmt(card.thisMonth)}${unitSuffix}` : '—'}
          </div>
          <div
            style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af', marginTop: 4 }}
          >
            {t('admin.productionKpis.thisMonth', { defaultValue: 'This month' })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared card shell (matches KpiCard chrome) for skeleton + error states. */
const CARD_SHELL: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #ebedf0',
  borderRadius: 16,
  padding: '18px 18px 16px',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -16px rgba(16,24,40,0.18)',
};

/** Shimmer placeholder shown while loading / before the sheet is connected. */
function SkeletonCard(): React.ReactNode {
  return (
    <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column' }}>
      <Skeleton className="h-3 w-28 rounded-md" />
      <Skeleton className="h-9 w-24 rounded-md mt-4" />
      <Skeleton className="h-3 w-16 rounded-md mt-2" />
      <Skeleton className="h-[30px] w-full rounded-md mt-4" />
      <div style={{ height: 1, background: '#eef0f3', margin: '13px 0 12px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[0, 1].map((i) => (
          <div key={i}>
            <Skeleton className="h-4 w-14 rounded-md" />
            <Skeleton className="h-2.5 w-16 rounded-md mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-width failure state with a retry — shown when the request errors. */
function ErrorPanel({ onRetry }: { onRetry: () => void }): React.ReactNode {
  const { t } = useTranslation();
  return (
    <div
      style={{
        ...CARD_SHELL,
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '44px 20px',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#fef2f2',
          color: '#c4322a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        !
      </span>
      <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: '#11151f' }}>
        {t('admin.productionKpis.failed', { defaultValue: 'Couldn’t load production KPIs' })}
      </div>
      <div style={{ fontSize: 13.5, color: '#6b7280', maxWidth: 360 }}>
        {t('admin.productionKpis.failedHint', {
          defaultValue: 'The request failed. Check your connection and try again.',
        })}
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 6,
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
        {t('admin.productionKpis.retry', { defaultValue: 'Retry' })}
      </button>
    </div>
  );
}

export default function ProductionKpis(): React.ReactNode {
  const { t } = useTranslation();
  const [data, setData] = useState<ProductionKpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const today = todayISO();
  // Calendar yesterday (local). Both the default reference day AND the label
  // rule: today's row usually isn't entered yet, so the page opens on yesterday;
  // and the headline reads the word "Yesterday" only when the data is actually
  // from yesterday — if it's older (holiday/weekend, or a back-dated pick) it
  // shows the real date instead.
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localISO(d);
  })();
  // The reference day being viewed (YYYY-MM-DD). Defaults to yesterday.
  const [asOf, setAsOf] = useState(yesterday);
  // Bumped by the error-state Retry button to re-run the fetch.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getProductionKpis(asOf)
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
  }, [asOf, tick]);

  const live = !!data?.isLive;
  // Headline column label. The day the figure is from = the BE's latest WORKING
  // day (holidays skipped), falling back to the selected date. Show the word
  // "Yesterday" when that IS yesterday; otherwise show its date (e.g. "23 Jun").
  const headlineDate = data?.latestWorkingDate || asOf;
  const headlineLabel =
    headlineDate === yesterday
      ? t('admin.productionKpis.yesterday', { defaultValue: 'Yesterday' })
      : fmtDate(headlineDate);
  const updated = data
    ? new Date(data.generatedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    // Negative margins cancel AdminShell's <main> padding so the design's
    // canvas background fills the content area edge-to-edge; the inline padding
    // re-supplies the design's own internal spacing.
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
      {/* Header + status pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 32,
          flexWrap: 'wrap',
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: DISPLAY,
              fontSize: 40,
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '0 0 10px',
              color: '#11151f',
            }}
          >
            {t('admin.productionKpis.title', { defaultValue: 'Production KPIs' })}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.4, color: '#6b7280', margin: 0, maxWidth: 560 }}>
            {t('admin.productionKpis.subtitle', {
              defaultValue: 'Floor output across Yesterday, the Last 7 days, and This month.',
            })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Date filter — the chosen day is the latest day VIEWED (windows end
              on it); defaults to yesterday. */}
          <input
            type="date"
            value={asOf}
            max={today}
            onChange={(e) => {
              if (e.target.value) setAsOf(e.target.value);
            }}
            aria-label={t('admin.productionKpis.asOf', { defaultValue: 'As of date' })}
            style={{
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 600,
              color: '#374151',
              padding: '8px 12px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 999,
              boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
              cursor: 'pointer',
            }}
          />
          <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 15px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 999,
            boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
          }}
        >
          <span
            className="nowi-kpi-dot"
            style={{ width: 8, height: 8, borderRadius: '50%', background: live ? '#0ca678' : '#f59e0b' }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', letterSpacing: '0.01em' }}>
            {loading
              ? t('admin.productionKpis.loading', { defaultValue: 'Loading…' })
              : live
                ? t('admin.productionKpis.live', { defaultValue: 'Live · synced' })
                : t('admin.productionKpis.notConnected', { defaultValue: 'Not connected' })}
            </span>
          </div>
        </div>
      </div>
      <style>{'@keyframes nowiPulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)}} .nowi-kpi-dot{animation:nowiPulseDot 2.4s ease-in-out infinite}'}</style>

      {/* Not-connected banner — BE reachable but sheet unreadable (not an error). */}
      {!loading && !failed && data && !live && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: 14,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              flex: 'none',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#f59e0b',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            !
          </span>
          <span style={{ fontSize: 14, color: '#92400e', fontWeight: 500 }}>
            {t('admin.productionKpis.notLive', {
              defaultValue: 'Sheet not connected yet — KPIs will appear once it’s reachable.',
            })}
          </span>
        </div>
      )}

      {/* Cards: failure → error panel; loading → shimmer skeletons; otherwise
          the KPI cards (live values, or muted "—" when the sheet isn't connected
          — never zeros, and never a perpetual shimmer once the BE has answered). */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-[18px]">
        {failed && !loading ? (
          <ErrorPanel onRetry={() => setTick((n) => n + 1)} />
        ) : loading || !data ? (
          // Skeleton count tracks the live card count (BE KPI_DEFS) — 3 since
          // Total Loading is hidden. Bump back to 4 if it's re-enabled.
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          data.cards.map((card, i) => (
            <KpiCard
              key={card.key}
              card={card}
              accent={PALETTE[i % PALETTE.length]}
              live={live}
              showSpark={live}
              yesterdayLabel={headlineLabel}
            />
          ))
        )}
      </div>

      {!loading && !failed && live && (
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 26, fontWeight: 500 }}>
          {t('admin.productionKpis.updated', { defaultValue: 'Updated' })} {updated}
        </div>
      )}
    </div>
  );
}
