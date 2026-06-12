import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
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
  /** When true, render the cards as borderless cells (divided by lines) so
   *  they read as part of an outer panel rather than standalone cards. */
  embedded?: boolean;
}

/** The grid wrapper, shared by the live cards and the loading skeleton so both
 *  lay out identically (4-up on desktop) and the row doesn't jump on load. */
const GRID_CLASS = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4';

/**
 * Loading placeholder for the four KPI cards — same chrome (rounded card +
 * border + shadow) and same grid as the real cards, so when the data lands the
 * cards swap in place rather than popping into existence.
 */
export function SummaryCardsSkeleton() {
  return (
    <div className={GRID_CLASS} aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-16" />
          <Skeleton className="mt-auto h-4 w-12 border-t border-transparent pt-3" />
        </div>
      ))}
    </div>
  );
}

export default function SummaryCards({ cards, embedded = false }: Props) {
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
        // Land on the Home dashboard's sampling tab (every card stays on the
        // dashboard now; "View more" → full registry comes in a later pass).
        to: '/?tab=sampling',
      };

  const items: SummaryCard[] = [
    firstCard,
    {
      key: 'inSampling',
      label: t('dashboard.cards.inSampling', { defaultValue: 'In sampling' }),
      count: cards.inSampling,
      to: '/?tab=sampling',
    },
    {
      key: 'inCataloguing',
      label: t('dashboard.cards.inCataloguing', {
        defaultValue: 'In cataloguing',
      }),
      count: cards.inCataloguing,
      // In-cataloguing = PD styles in the `cataloguing` (go-to-market) phase,
      // which live in the Home feed. Home's cataloguing tab filters to the
      // exact same lifecycle, so this count and that tab stay in lockstep and
      // it's reachable by every office role.
      to: '/?tab=cataloguing',
    },
    {
      key: 'live',
      label: t('dashboard.cards.live', { defaultValue: 'Live' }),
      count: cards.live,
      to: '/?tab=live',
    },
  ];

  return (
    <div
      className={cn(
        embedded
          ? // Borderless cells separated by dividers — reads as one panel.
            'grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:divide-y-0 lg:grid-cols-4'
          : GRID_CLASS,
      )}
    >
      {items.map((item) => (
        // Whole card is the click target (not just the "View →" cue).
        // Stitch "Precision Industrial" chrome — matches StyleQueueTable's
        // card (rounded + border + surface + soft shadow, label-caps). In
        // standalone mode the card lifts on hover so it reads as tactile.
        <Link
          key={item.key}
          to={item.to}
          className={cn(
            'group flex flex-col focus:outline-none',
            embedded
              ? 'p-5 transition-colors hover:bg-[var(--color-surface-2)]/40'
              : 'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-md focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20',
          )}
        >
          {/* Label — Stitch label-caps, muted, never coloured. */}
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)]">
            {item.label}
          </span>

          {/* Big tabular-numerals count — display style, plain foreground. */}
          <span className="mt-3 text-[40px] font-bold leading-none tabular-nums text-[var(--color-foreground)]">
            {item.count}
          </span>

          {/* Footer divider + the ONLY coloured element: the indigo "View →"
              cue. mt-auto pins it to the card's base so a row of cards keeps a
              flush footer regardless of label wrap. The arrow nudges on hover. */}
          <span
            className={cn(
              'mt-auto flex items-center gap-1 text-[13px] font-medium text-[var(--color-primary)]',
              embedded
                ? 'mt-3'
                : 'border-t border-[var(--color-border)]/60 pt-3',
            )}
          >
            {t('dashboard.cards.view', { defaultValue: 'View' })}
            <ArrowRight
              size={13}
              strokeWidth={2.25}
              aria-hidden
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </span>
        </Link>
      ))}
    </div>
  );
}
