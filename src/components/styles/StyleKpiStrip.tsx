import { useTranslation } from 'react-i18next';
import {
  PencilRuler,
  CheckCircle2,
  Factory,
  Globe,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

interface Props {
  stylesDeveloped: number;
  approved: number;
  inProduction: number;
  live: number;
  virtualLive: number;
}

interface Card {
  i18n: string;
  value: number;
  icon: LucideIcon;
  /** Stage-rail accent token. */
  acc: string;
  hint?: string;
}

export default function StyleKpiStrip({
  stylesDeveloped,
  approved,
  inProduction,
  live,
  virtualLive,
}: Props) {
  const { t } = useTranslation();
  const cards: Card[] = [
    {
      i18n: 'admin.styles.kpi.developed',
      value: stylesDeveloped,
      icon: PencilRuler,
      acc: 'var(--color-foreground-3)',
    },
    {
      i18n: 'admin.styles.kpi.approved',
      value: approved,
      icon: CheckCircle2,
      acc: 'var(--status-ready-acc)',
      hint: stylesDeveloped
        ? t('admin.styles.kpi.approvedHint', {
            defaultValue: '{{pct}}% of developed',
            pct: Math.round((approved / stylesDeveloped) * 100),
          })
        : undefined,
    },
    {
      i18n: 'admin.styles.kpi.inProduction',
      value: inProduction,
      icon: Factory,
      acc: 'var(--stage-stitch-acc)',
    },
    {
      i18n: 'admin.styles.kpi.live',
      value: live,
      icon: Globe,
      acc: 'var(--stage-disp-acc)',
    },
    {
      i18n: 'admin.styles.kpi.virtualLive',
      value: virtualLive,
      icon: LayoutGrid,
      acc: 'var(--color-accent)',
      hint: t('admin.styles.kpi.virtualLiveHint', { defaultValue: 'Catalog mode' }),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.i18n}
            style={{ ['--kpi-acc' as string]: c.acc }}
            className="group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 pt-3.5 pb-4 transition-colors hover:border-[var(--color-border-strong)] before:absolute before:inset-x-0 before:top-0 before:h-[2.5px] before:bg-[var(--kpi-acc)]"
          >
            {/* Header row — icon chip + uppercase label */}
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                style={{
                  background:
                    'color-mix(in oklab, var(--kpi-acc) 14%, transparent)',
                  color: 'var(--kpi-acc)',
                }}
              >
                <Icon size={15} strokeWidth={2.25} />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.11em] leading-tight text-[var(--color-foreground-3)]">
                {t(c.i18n)}
              </span>
            </div>

            {/* Value + optional hint */}
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-serif text-[32px] font-medium leading-none tabular-nums tracking-[-0.015em] text-[var(--color-foreground)]">
                {c.value}
              </span>
            </div>
            {c.hint && (
              <span className="mt-1.5 text-[11px] leading-tight text-[var(--color-muted-foreground)]">
                {c.hint}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
