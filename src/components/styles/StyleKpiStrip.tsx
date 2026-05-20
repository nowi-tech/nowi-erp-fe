import { useTranslation } from 'react-i18next';

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
    { i18n: 'admin.styles.kpi.developed', value: stylesDeveloped },
    {
      i18n: 'admin.styles.kpi.approved',
      value: approved,
      hint: stylesDeveloped
        ? `${Math.round((approved / stylesDeveloped) * 100)}% total`
        : '—',
    },
    { i18n: 'admin.styles.kpi.inProduction', value: inProduction },
    { i18n: 'admin.styles.kpi.live', value: live },
    { i18n: 'admin.styles.kpi.virtualLive', value: virtualLive, hint: 'Catalog mode' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.i18n}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 h-20 flex flex-col justify-between"
        >
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {t(c.i18n)}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-xl tabular-nums">{c.value}</span>
            {c.hint && (
              <span className="text-[10px] text-[var(--color-muted-foreground)]">
                {c.hint}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
