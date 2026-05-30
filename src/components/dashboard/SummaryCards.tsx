import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { DashboardCards } from '@/api/dashboard';

/**
 * The four role-aware summary cards on the unified Home.
 *
 * PRESENTATIONAL: the parent fetches `DashboardCards` (via
 * `getDashboardCards()`) and passes it in — this component never
 * fetches. Every count is read straight from props; nothing is
 * hardcoded (the design spec's "ALL DATA REAL" rule).
 *
 * Card #1 is role-aware: approvers see "Pending approvals" (their
 * queue), everyone else sees "My sampling work". The other three are
 * fixed. Each card deep-links into the destination page with its
 * filter pre-applied as a query param the destination reads on load.
 *
 * UI convention (locked): only the "View →" link is indigo
 * (`--color-primary`); the label and the big tabular count stay
 * charcoal (`--color-foreground` / muted). Cards use the app's
 * surface + border CSS variables.
 */

interface SummaryCard {
  /** Stable key for React + the i18n leaf under `dashboard.cards.*`. */
  key: string;
  label: string;
  count: number;
  to: string;
}

interface Props {
  cards: DashboardCards;
}

export default function SummaryCards({ cards }: Props) {
  const { t } = useTranslation();

  const firstCard: SummaryCard = cards.isApprover
    ? {
        key: 'pendingApprovals',
        label: t('dashboard.cards.pendingApprovals', {
          defaultValue: 'Pending approvals',
        }),
        count: cards.pendingApprovals,
        // Home's own "Needs attention" tab = draft + in_sampling awaiting
        // Approval #2 — the EXACT set this count sums (the /styles inbox tab
        // is draft-only, which would undercount). Stays on Home so every
        // office role / approver can reach it.
        to: '/?tab=needs_attention',
      }
    : {
        key: 'mySamplingWork',
        label: t('dashboard.cards.mySamplingWork', {
          defaultValue: 'My sampling work',
        }),
        count: cards.mySamplingWork,
        to: '/styles?tab=in_sampling',
      };

  const items: SummaryCard[] = [
    firstCard,
    {
      key: 'inSampling',
      label: t('dashboard.cards.inSampling', { defaultValue: 'In sampling' }),
      count: cards.inSampling,
      to: '/styles?tab=in_sampling',
    },
    {
      key: 'inProduction',
      label: t('dashboard.cards.inProduction', {
        defaultValue: 'In production',
      }),
      count: cards.inProduction,
      // In-production = PD styles in in_pd/qc, which live in the Home feed —
      // NOT /admin/locator (that's the legacy-floor per-lot WIP page, gated
      // to admin/viewer/data_manager). Home's in_production tab matches this
      // count exactly and is reachable by every office role.
      to: '/?tab=in_production',
    },
    {
      key: 'live',
      label: t('dashboard.cards.live', { defaultValue: 'Live' }),
      count: cards.live,
      to: '/?tab=live',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 pt-3.5 pb-3.5 transition-colors hover:border-[var(--color-border-strong)]"
        >
          {/* Label — plain charcoal/muted, never coloured. */}
          <span className="text-[11px] font-mono uppercase tracking-[0.11em] leading-tight text-[var(--color-foreground-3)]">
            {item.label}
          </span>

          {/* Big tabular-numerals count — plain foreground. */}
          <span className="mt-3 font-serif text-[32px] font-medium leading-none tabular-nums tracking-[-0.015em] text-[var(--color-foreground)]">
            {item.count}
          </span>

          {/* The ONLY coloured element: the indigo "View →" link. */}
          <Link
            to={item.to}
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:underline"
          >
            {t('dashboard.cards.view', { defaultValue: 'View' })}
            <ArrowRight size={13} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      ))}
    </div>
  );
}
