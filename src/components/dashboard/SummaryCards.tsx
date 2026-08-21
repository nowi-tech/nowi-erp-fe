import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SummaryCard } from '@/components/ui/summary-card';
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
  /** Optional sub-status split shown beneath the big count (e.g. the
   *  Sampling / Cataloguing cards break their total into the next-step
   *  rungs). The values should partition `count`. */
  breakdown?: { label: string; value: number }[];
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

  // First card = "My work": the role-aware union the BE computes from the
  // caller's roles (approver → pending approvals; sampling author → their own
  // in-progress sampling; cataloguer → the cataloguing queue). The count and
  // its deep-link target are the SAME role-aware set, so the card and the
  // `my_work` tab always agree — a cataloguer finally sees a meaningful number
  // instead of an empty "My sampling work".
  const firstCard: SummaryCard = {
    key: 'myWork',
    label: t('dashboard.cards.myWork', { defaultValue: 'My work' }),
    count: cards.myWork,
    to: '/?tab=my_work',
  };

  const items: SummaryCard[] = [
    firstCard,
    {
      key: 'inSampling',
      label: t('dashboard.cards.inSampling', { defaultValue: 'Sampling' }),
      count: cards.inSampling,
      to: '/?tab=sampling',
      // Split the sampling total into still-in-progress vs signed-off and
      // awaiting "Start cataloguing" (sample_approved).
      breakdown: [
        {
          label: t('dashboard.cards.breakdown.inProgress', {
            defaultValue: 'In progress',
          }),
          value: Math.max(cards.inSampling - (cards.samplingReady ?? 0), 0),
        },
        {
          label: t('dashboard.cards.breakdown.readyForCataloguing', {
            defaultValue: 'Ready for cataloguing',
          }),
          value: cards.samplingReady ?? 0,
        },
      ],
    },
    {
      key: 'inCataloguing',
      label: t('dashboard.cards.inCataloguing', {
        defaultValue: 'Cataloguing',
      }),
      count: cards.inCataloguing,
      // In-cataloguing = PD styles in the `cataloguing` (go-to-market) phase,
      // which live in the Home feed. Home's cataloguing tab filters to the
      // exact same lifecycle, so this count and that tab stay in lockstep and
      // it's reachable by every office role.
      to: '/?tab=cataloguing',
      // Split into the go-live ladder rungs (reusing the table's status
      // labels): a channel prepared ("Ready to publish") vs none yet.
      breakdown: [
        {
          label: t('dashboard.table.status.readyToPublish', {
            defaultValue: 'Ready to publish',
          }),
          value: cards.cataloguingReady ?? 0,
        },
        {
          label: t('dashboard.table.status.listingsPending', {
            defaultValue: 'Listings pending',
          }),
          value: Math.max(cards.inCataloguing - (cards.cataloguingReady ?? 0), 0),
        },
      ],
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
        // Whole card is the click target (not just the "View →" cue). The card
        // body lives in the shared SummaryCard so the production board renders
        // the identical thing.
        <SummaryCard
          key={item.key}
          label={item.label}
          value={item.count}
          breakdown={item.breakdown}
          to={item.to}
          className={
            embedded
              ? 'rounded-none border-0 shadow-none hover:translate-y-0 hover:shadow-none hover:bg-[var(--color-surface-2)]/40'
              : undefined
          }
        />
      ))}
    </div>
  );
}
