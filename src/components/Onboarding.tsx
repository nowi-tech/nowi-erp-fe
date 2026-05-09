import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth';
import { updateOnboardedAt } from '@/api/users';
import type { UserRole } from '@/api/types';

const ROLES_WITH_SLIDES: readonly UserRole[] = [
  'admin',
  'stitching_master',
  'finishing_master',
  'data_manager',
  'viewer',
] as const;

function isOnboardingRole(role: UserRole): boolean {
  return (ROLES_WITH_SLIDES as readonly UserRole[]).includes(role);
}

export default function Onboarding() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const slides = useMemo(() => {
    if (!user) return [] as { title: string; body: string }[];
    const role: UserRole = isOnboardingRole(user.role) ? user.role : 'viewer';
    return ([1, 2, 3] as const).map((n) => ({
      title: t(`onboarding.${role}.slide${n}.title`),
      body: t(`onboarding.${role}.slide${n}.body`),
    }));
  }, [t, user]);

  if (!user || user.onboardedAt) return null;

  const total = slides.length;
  const isLast = step === total - 1;

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateOnboardedAt(user.id);
    } catch {
      // best-effort: still mark locally so we don't loop the user.
    } finally {
      updateUser({ onboardedAt: new Date().toISOString() });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        // Block backdrop close — user must explicitly Skip or Done.
      }}
      title={slides[step]?.title}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void finish()}
            disabled={busy}
          >
            {t('onboarding.skip')}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || busy}
            >
              {t('onboarding.prev')}
            </Button>
            {isLast ? (
              <Button type="button" onClick={() => void finish()} disabled={busy}>
                {t('onboarding.done')}
              </Button>
            ) : (
              <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={busy}>
                {t('onboarding.next')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-foreground)] whitespace-pre-line">
          {slides[step]?.body}
        </p>
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {slides.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === step
                  ? 'w-6 bg-[var(--color-foreground)]'
                  : 'w-1.5 bg-[var(--color-muted)]')
              }
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
