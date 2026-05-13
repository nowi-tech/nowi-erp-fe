import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth';
import { markOnboarded } from '@/api/users';
import type { UserRole } from '@/api/types';

const ROLES_WITH_SLIDES: readonly UserRole[] = [
  'admin',
  'floor_manager',
  'stitching_master',
  'finishing_master',
  'data_manager',
  'viewer',
] as const;

function isOnboardingRole(role: UserRole): boolean {
  return (ROLES_WITH_SLIDES as readonly UserRole[]).includes(role);
}

const localKey = (userId: number | string) => `nowi.onboarded.${userId}`;

function isLocallyOnboarded(userId: number | string): boolean {
  try {
    return localStorage.getItem(localKey(userId)) === '1';
  } catch {
    return false;
  }
}

function markLocallyOnboarded(userId: number | string): void {
  try {
    localStorage.setItem(localKey(userId), '1');
  } catch {
    // private mode / quota — fine, server-side is the real source of truth
  }
}

export default function Onboarding() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // Local copy so we hide the modal immediately when the user completes /
  // skips, even before the BE round-trip resolves.
  const [dismissed, setDismissed] = useState<boolean>(() =>
    user ? isLocallyOnboarded(user.id) : true,
  );

  // If the auth user changes (login/logout), reset the dismissed flag based
  // on that new user's local mark.
  useEffect(() => {
    if (!user) {
      setDismissed(true);
      return;
    }
    setDismissed(isLocallyOnboarded(user.id) || Boolean(user.onboardedAt));
    setStep(0);
  }, [user?.id, user?.onboardedAt, user]);

  const slides = useMemo(() => {
    if (!user) return [] as { title: string; body: string }[];
    const role: UserRole = isOnboardingRole(user.role) ? user.role : 'viewer';
    // Roles can have a variable number of slides. We walk up from 1
    // and stop on the first missing key (i18next returns the key
    // itself when a translation is absent — sentinel by string match).
    const out: { title: string; body: string }[] = [];
    for (let n = 1; n <= 6; n++) {
      const titleKey = `onboarding.${role}.slide${n}.title`;
      const title = t(titleKey);
      if (title === titleKey) break;
      out.push({ title, body: t(`onboarding.${role}.slide${n}.body`) });
    }
    return out;
  }, [t, user]);

  if (!user || dismissed || user.onboardedAt) return null;

  const total = slides.length;
  const isLast = step === total - 1;
  const current = slides[step];

  const finish = async () => {
    if (busy) return;
    // Hide immediately and persist locally so the modal can never re-loop
    // — even if the server call is slow or fails.
    markLocallyOnboarded(user.id);
    setDismissed(true);
    updateUser({ onboardedAt: new Date().toISOString() });
    setBusy(true);
    try {
      await markOnboarded();
    } catch {
      // best-effort; local mark already protects against loops
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    if (isLast) void finish();
    else setStep((s) => Math.min(total - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <Dialog open onClose={() => void finish()} title={current?.title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-foreground)] whitespace-pre-line min-h-[5rem]">
          {current?.body}
        </p>
        <div className="flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === step
                  ? 'w-6 bg-[var(--color-primary)]'
                  : 'w-1.5 bg-[var(--color-border)]')
              }
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-border)] -mx-4 px-4 -mb-4 pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void finish()}
            disabled={busy}
          >
            {t('onboarding.skip')}
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={busy}
              >
                {t('onboarding.prev')}
              </Button>
            )}
            <Button type="button" size="sm" onClick={goNext} disabled={busy}>
              {isLast ? t('onboarding.done') : t('onboarding.next')}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
