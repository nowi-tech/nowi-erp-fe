import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { getStylesSummary } from '@/api/styles';
import { hasAnyRole } from '@/lib/userRoles';
import type { UserRole } from '@/api/types';

/**
 * Roles permitted to perform Approval #1 — mirrors the `@Roles(...WRITE)`
 * gating on `POST /styles/:id/actions/approve` in the backend
 * (styles-actions.controller.ts).
 */
const APPROVAL1_ROLES: readonly UserRole[] = ['admin', 'sampling_lead'] as const;

/**
 * Dashboard call-to-action: when the signed-in user can perform Approval #1,
 * surface how many styles are awaiting their sign-off. Renders nothing for
 * users without an approval role.
 */
export default function ApprovalCtaCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  // Multi-role: passes if any of the user's roles (primary OR
  // UserRoleAssignment) is in the approver set.
  const canApprove = hasAnyRole(user, APPROVAL1_ROLES);

  useEffect(() => {
    if (!canApprove) return;
    let cancelled = false;
    getStylesSummary()
      .then((s) => {
        if (!cancelled) setCount(s.attention.awaitingApproval1);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [canApprove]);

  if (!canApprove || count === null) return null;

  // All caught up — calm, low-key acknowledgement.
  if (count === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
        <CheckCircle2 size={16} className="text-[var(--status-ready-acc)]" />
        <span>
          {t('admin.home.approvalCta.allCaughtUp', {
            defaultValue: 'No styles awaiting your approval — all caught up.',
          })}
        </span>
      </div>
    );
  }

  return (
    <Link
      to="/styles"
      style={{ ['--cta-acc' as string]: 'var(--color-accent)' }}
      className="group relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[color-mix(in_oklab,var(--cta-acc)_45%,var(--color-border))] bg-[color-mix(in_oklab,var(--cta-acc)_7%,var(--color-surface))] px-5 py-4 transition-colors hover:bg-[color-mix(in_oklab,var(--cta-acc)_12%,var(--color-surface))] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--cta-acc)]"
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)]"
        style={{
          background: 'color-mix(in oklab, var(--cta-acc) 16%, transparent)',
          color: 'var(--cta-acc)',
        }}
      >
        <ClipboardCheck size={22} strokeWidth={2.25} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[26px] font-medium leading-none tabular-nums text-[var(--color-foreground)]">
            {count}
          </span>
          <span className="text-sm font-medium text-[var(--color-foreground)]">
            {t('admin.home.approvalCta.title', {
              defaultValue: '{{count}} styles awaiting your approval',
              count,
            })}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
          {t('admin.home.approvalCta.subtitle', {
            defaultValue: 'Approval #1 — review intake checks and mint the Style #.',
          })}
        </p>
      </div>

      <span className="flex shrink-0 items-center gap-1.5 text-xs font-mono uppercase tracking-[0.08em] text-[var(--cta-acc)]">
        {t('admin.home.approvalCta.action', { defaultValue: 'Review' })}
        <ArrowRight
          size={14}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
