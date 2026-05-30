import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import SummaryCards from '@/components/dashboard/SummaryCards';
import StylesInFlightTable from '@/components/dashboard/StylesInFlightTable';
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
  'sampling',
  'in_production',
  'live',
  'needs_attention',
];

function tabFromParam(value: string | null): DashboardStyleTab {
  return VALID_TABS.includes(value as DashboardStyleTab)
    ? (value as DashboardStyleTab)
    : 'all';
}

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
  ]);

  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [cardsError, setCardsError] = useState(false);

  const loadCards = useCallback(async () => {
    setCardsError(false);
    try {
      const res = await getDashboardCards();
      setCards(res);
    } catch {
      setCardsError(true);
    }
  }, []);

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
                  {cards.inProduction}
                </b>{' '}
                {t('dashboard.narrative.inProduction', {
                  defaultValue: 'in production',
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

      {/* Four role-aware summary cards — all counts from real card data. */}
      {cards && <SummaryCards cards={cards} />}

      {/* Styles in flight — the single content surface. */}
      <StylesInFlightTable initialTab={initialTab} onActionDone={loadCards} />
    </div>
  );
}
