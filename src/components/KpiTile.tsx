import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Stage = 'stitch' | 'finish' | 'disp' | 'ink' | 'accent';

const STAGE_ACC: Record<Stage, string> = {
  stitch: 'var(--stage-stitch-acc)',
  finish: 'var(--stage-finish-acc)',
  disp: 'var(--stage-disp-acc)',
  ink: 'var(--color-foreground)',
  accent: 'var(--color-accent)',
};

interface Props {
  /** UPPERCASE label rendered in IBM Plex Mono. */
  label: string;
  /** Big number; rendered in Lora serif. */
  value: number | string;
  /** Optional unit appended in muted small text ("lots", "m", etc.). */
  unit?: string;
  /** Optional period chip on the right of the label ("7D", "TODAY"). */
  period?: string;
  /** Optional delta — { dir: 'up' | 'down', text: '4.2%' }. */
  delta?: { dir: 'up' | 'down'; text: string };
  /** Optional context line below the delta ("target 320"). */
  context?: string;
  /** Stage rail colour (3px left bar). Default `ink`. */
  stage?: Stage;
  /** Optional sparkline rendered in the corner. Provide [0..1]-normalised
   *  points; component scales to 84×28. */
  sparkPoints?: number[];
  className?: string;
}

/**
 * KPI tile — stage rail + mono label + serif number + delta + corner spark.
 * Direct port of the design's `.kpi` block in Stage system v2.html.
 */
export default function KpiTile({
  label,
  value,
  unit,
  period,
  delta,
  context,
  stage = 'ink',
  sparkPoints,
  className,
}: Props): ReactNode {
  const acc = STAGE_ACC[stage];
  return (
    <div
      style={{ ['--kpi-acc' as string]: acc }}
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 pb-3.5',
        'before:absolute before:left-0 before:top-3.5 before:bottom-3.5 before:w-[3px] before:rounded-r-full before:bg-[var(--kpi-acc)]',
        className,
      )}
    >
      <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-[0.12em] text-[var(--color-foreground-3)]">
        <span>{label}</span>
        {period && (
          <span className="font-normal tracking-[0.08em] text-[var(--color-muted-foreground-2)]">
            {period}
          </span>
        )}
      </div>
      <div className="mt-3 mb-1 font-serif font-medium text-[36px] leading-[1.1] tracking-[-0.01em] tabular-nums">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-[var(--color-muted-foreground)]">
            {unit}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[12.5px] text-[var(--color-muted-foreground)]">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 font-mono text-[11.5px] tabular-nums',
              delta.dir === 'up' ? 'text-[#3f6841]' : 'text-[#903c2f]',
            )}
          >
            <svg viewBox="0 0 10 10" width={8} height={8}>
              <path
                d={delta.dir === 'up' ? 'M5 1 L9 7 H1 Z' : 'M5 9 L9 3 H1 Z'}
                fill="currentColor"
              />
            </svg>
            {delta.text}
          </span>
        ) : (
          <span />
        )}
        {context && <span>{context}</span>}
      </div>

      {sparkPoints && sparkPoints.length > 1 && (
        <svg
          viewBox="0 0 84 28"
          preserveAspectRatio="none"
          className="absolute right-3.5 bottom-3 h-7 w-[84px] opacity-85"
        >
          {(() => {
            const xs = sparkPoints.map((_, i) =>
              (i / (sparkPoints.length - 1)) * 84,
            );
            const max = Math.max(...sparkPoints, 1);
            const ys = sparkPoints.map((v) => 28 - (v / max) * 22 - 2);
            const linePath = xs
              .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`)
              .join(' ');
            const fillPath = `${linePath} L84,28 L0,28 Z`;
            return (
              <>
                <path d={fillPath} fill="var(--kpi-acc)" opacity={0.08} />
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--kpi-acc)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}
