import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import SummaryCards from '@/components/dashboard/SummaryCards';
import StylesInFlightTable from '@/components/dashboard/StylesInFlightTable';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { useAuth } from '@/context/auth';
import { hasAnyRole } from '@/lib/userRoles';
import {
  getDashboardCards,
  type DashboardCards,
  type DashboardStyleTab,
} from '@/api/dashboard';

/**
 * Unified, role-aware Home — the single office landing surface (kills the
 * old `/styles` sampling-home + `/admin` AdminHome split). Top → bottom:
 *   1. Header — serif "Dashboard" title + a narrative line built from REAL
 *      card counts + a "+ Submit design" link to the existing intake flow.
 *      (No test-data toggle here — AdminShell's header already owns it.)
 *   2. Four role-aware summary cards (SummaryCards) — all data real.
 *   3. The per-style "Styles in flight" table (StylesInFlightTable), seeded
 *      from the `?tab=` deep-link query param.
 * See docs/DASHBOARD_REDESIGN.md ("Home layout", "UI conventions").
 */

// Mirror the table's tab buckets so a `?tab=` deep link (e.g. the Live card)
// lands on the right tab. Anything unrecognised falls back to 'all'.
const VALID_TABS: DashboardStyleTab[] = [
  'all',
  'draft',
  'sampling',
  'cataloguing',
  'live',
  'needs_attention',
];

function tabFromParam(value: string | null): DashboardStyleTab {
  return VALID_TABS.includes(value as DashboardStyleTab)
    ? (value as DashboardStyleTab)
    : 'all';
}

/** YYYY-MM-DD for a date `n` days before today (0 = today), in the user's
 *  LOCAL zone. `toISOString()` would format in UTC and, for IST users in the
 *  early-morning hours, return yesterday — making "today" unselectable and
 *  shifting the default window a day back. Build the string from local parts. */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const DEFAULT_RANGE_DAYS = 7;

export default function Home() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialTab = tabFromParam(searchParams.get('tab'));
  const { user } = useAuth();
  // "+ Submit design" creates a Style → gate to the PD write roles so
  // read-only office roles (viewer / data_*) don't get a 403 CTA.
  const canSubmit = hasAnyRole(user, [
    'admin',
    'sampling_editor',
    'sampling_lead',
    'pattern_master_w',
    'pattern_master_m',
    'operator',
    'cataloguer',
  ]);

  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [cardsError, setCardsError] = useState(false);

  // Shared activity window (by style updatedAt). Default = last 7 days; one
  // control scopes both the summary cards and the styles table below.
  const [from, setFrom] = useState<string>(() =>
    isoDaysAgo(DEFAULT_RANGE_DAYS - 1),
  );
  const [to, setTo] = useState<string>(() => isoDaysAgo(0));

  const loadCards = useCallback(async () => {
    setCardsError(false);
    try {
      const res = await getDashboardCards({ from, to });
      setCards(res);
    } catch {
      setCardsError(true);
    }
  }, [from, to]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  return (
    <div className="space-y-6">
      {/* Header — serif title + real-data narrative + Submit design */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            {t('dashboard.title', { defaultValue: 'Dashboard' })}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {cards === null && !cardsError ? (
              <Skeleton className="inline-block h-4 w-80 align-middle" />
            ) : cards ? (
              <span className="tabular-nums">
                {/* First segment is role-aware, mirroring SummaryCards'
                    first card: approvers see their pending-approvals
                    queue; everyone else sees their own sampling queue.
                    Avoids surfacing an approvals count to non-approvers
                    (who never see it anywhere else). */}
                <b className="font-medium text-[var(--color-foreground-2)]">
                  {cards.isApprover
                    ? cards.pendingApprovals
                    : cards.mySamplingWork}
                </b>{' '}
                {cards.isApprover
                  ? t('dashboard.narrative.pendingApprovals', {
                      defaultValue: 'pending approvals',
                    })
                  : t('dashboard.narrative.inYourQueue', {
                      defaultValue: 'in your queue',
                    })}
                {' · '}
                <b className="font-medium text-[var(--color-foreground-2)]">
                  {cards.inSampling}
                </b>{' '}
                {t('dashboard.narrative.inSampling', {
                  defaultValue: 'in sampling',
                })}
                {' · '}
                <b className="font-medium text-[var(--color-foreground-2)]">
                  {cards.inCataloguing}
                </b>{' '}
                {t('dashboard.narrative.inCataloguing', {
                  defaultValue: 'in cataloguing',
                })}
                {' · '}
                <b className="font-medium text-[var(--color-foreground-2)]">
                  {cards.live}
                </b>{' '}
                {t('dashboard.narrative.live', { defaultValue: 'live' })}
              </span>
            ) : (
              t('dashboard.narrative.error', {
                defaultValue: "Couldn't load the summary.",
              })
            )}
          </p>
        </div>
        {canSubmit && (
          <Button asChild>
            <Link to="/styles/new">
              <Plus size={16} />
              <span className="ml-1">
                {t('dashboard.submitDesign', { defaultValue: 'Submit design' })}
              </span>
            </Link>
          </Button>
        )}
      </header>

      {/* Activity-window control — one polished range picker scoping the
          cards + the table below (by style updatedAt). Default = last 7
          days. Emits LOCAL YYYY-MM-DD bounds (see DateRangePicker). */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          from={from}
          to={to}
          maxDate={isoDaysAgo(0)}
          onApply={(nextFrom, nextTo) => {
            setFrom(nextFrom);
            setTo(nextTo);
          }}
        />
      </div>

      {/* Four role-aware summary cards — all counts from real card data. */}
      {cards && <SummaryCards cards={cards} />}

      {/* Styles in flight — the single content surface. */}
      <StylesInFlightTable
        initialTab={initialTab}
        from={from}
        to={to}
        onActionDone={loadCards}
      />
    </div>
  );
}
