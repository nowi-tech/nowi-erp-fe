import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The dashboard KPI card, as a presentational unit: label-caps heading, one big
 * tabular count, an optional breakdown, and the indigo "View →" footer.
 *
 * Extracted from SummaryCards so the production board renders the SAME card
 * rather than a lookalike — the two drifted once already (production had a
 * flat `text-2xl` value and no footer).
 *
 * Navigation is either a route (`to`) or an in-page handler (`onClick`); the
 * dashboard deep-links, the production board switches tab. Exactly one of them
 * should be given.
 *
 * UI convention (locked, inherited from SummaryCards): only the "View →" link
 * is indigo — the label stays muted and the count stays charcoal.
 */
export interface SummaryCardProps {
  label: string;
  /** Rendered as-is, so a caller can pass "4.2d" as well as a count. */
  value: string | number;
  /** Muted "label · value" rows under the count. Values sit right-aligned. */
  breakdown?: { label: string; value: string | number }[];
  to?: string;
  onClick?: () => void;
  /** Hide the "View →" footer for a card that leads nowhere. */
  hideView?: boolean;
  className?: string;
}

const CARD_CLASS =
  'group flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md focus:outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20';

export function SummaryCard({
  label,
  value,
  breakdown,
  to,
  onClick,
  hideView,
  className,
}: SummaryCardProps) {
  const { t } = useTranslation();

  const body = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]">
        {label}
      </span>
      <span className="mt-3 text-[40px] font-bold leading-none tabular-nums text-[var(--color-foreground)]">
        {value}
      </span>
      {breakdown && breakdown.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-0.5">
          {breakdown.map((b) => (
            <span
              key={b.label}
              className="flex items-center justify-between text-[12px] text-[var(--color-muted-foreground)]"
            >
              <span>{b.label}</span>
              <span className="font-semibold tabular-nums text-[var(--color-foreground)]">
                {b.value}
              </span>
            </span>
          ))}
        </div>
      )}
      {!hideView && (
        <span className="mt-auto flex items-center gap-1 border-t border-[var(--color-border)]/60 pt-3 text-[13px] font-medium text-[var(--color-primary)]">
          {t('dashboard.cards.view', { defaultValue: 'View' })}
          <ArrowRight
            size={13}
            strokeWidth={2.25}
            aria-hidden
            className="transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cn(CARD_CLASS, className)}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(CARD_CLASS, className)}>
      {body}
    </button>
  );
}
