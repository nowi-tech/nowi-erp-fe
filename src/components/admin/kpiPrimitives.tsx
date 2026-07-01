import { useState } from 'react';

// Shared KPI-card primitives, ported from the Claude Design file
// "Production KPIs.dc.html": Space Grotesk / Manrope type + an interactive
// sparkline. Used by both the Production-KPIs and Sales-KPIs dashboards so the
// two stay visually identical.

export const SANS = "'Manrope', system-ui, sans-serif";
export const DISPLAY = "'Space Grotesk', sans-serif";

/** Shared card shell (chrome for cards, skeletons, and error panels). */
export const CARD_SHELL: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #ebedf0',
  borderRadius: 16,
  padding: '18px 18px 16px',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -16px rgba(16,24,40,0.18)',
};

/** Default number format (en-IN, ≤1 decimal). */
export function fmt(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

/** Format an ISO date (YYYY-MM-DD) as "25 Jun" for the spark tooltip. */
export function fmtDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Compute the sparkline `polyline`/`polygon` strings + point coords. */
export function sparkPaths(data: number[]): {
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

/**
 * Interactive sparkline: full-width hover, guide line, styled tooltip.
 * `formatValue` overrides the tooltip number formatting (e.g. ₹ / %); when
 * omitted it falls back to `fmt(value) + unit`.
 */
export function Sparkline({
  data,
  dates,
  accent,
  unit,
  formatValue,
}: {
  data: number[];
  dates: string[];
  accent: string;
  unit?: string;
  formatValue?: (n: number) => string;
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
  const tip =
    hover != null
      ? formatValue
        ? formatValue(series[hover])
        : `${fmt(series[hover])}${unit ? ` ${unit}` : ''}`
      : '';

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
            // Clamp so the centered tooltip doesn't clip off the card edge.
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
          {fmtDate(dates[hover])}: {tip}
        </div>
      )}
    </div>
  );
}
