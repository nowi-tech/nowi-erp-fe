import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/auth';
import { mintSkucastSsoCode } from '@/api/auth';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';

// Where the SkuCast SPA lives. Inlined at build time; defaults to prod.
// Its /sso route exchanges the code (server-to-server back to the ERP) for
// a native SkuCast session.
const SKUCAST_URL = (
  import.meta.env.VITE_SKUCAST_URL || 'https://skucast.nowi.fashion'
).replace(/\/+$/, '');

type Phase = 'minting' | 'redirecting' | 'error';

/**
 * ERP → SkuCast SSO bridge (one-directional). SkuCast's "Login with ERP"
 * button sends the browser here. If the visitor isn't logged into the ERP,
 * we bounce to /login?next=/sso/skucast so the normal OTP flow returns here
 * afterward (mirrors the `next` idiom). Once authenticated we mint a
 * single-use code and hand the browser to SkuCast's /sso?code=… — the ERP
 * session token never crosses origins.
 */
export default function SsoSkucast() {
  const { t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const [phase, setPhase] = useState<Phase>('minting');
  const [errorMsg, setErrorMsg] = useState('');
  // Bumped by Retry to re-run the mint effect.
  const [attempt, setAttempt] = useState(0);
  // StrictMode double-invokes effects in dev; guard so we mint exactly once
  // per attempt (a code is single-use, so a stray second mint is wasteful).
  const startedRef = useRef(-1);

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;

    let cancelled = false;
    setPhase('minting');
    mintSkucastSsoCode()
      .then(({ code }) => {
        if (cancelled) return;
        setPhase('redirecting');
        // Hard navigation (cross-origin) — same tab, per the chosen UX.
        window.location.href = `${SKUCAST_URL}/sso?code=${encodeURIComponent(code)}`;
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMsg(
          t('sso.skucast.error', {
            defaultValue:
              'Could not start the SkuCast sign-in. Please try again.',
          }),
        );
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading, attempt, t]);

  // Not logged into the ERP → send them through login, then back here.
  if (!loading && !isAuthenticated) {
    return <Navigate to="/login?next=/sso/skucast" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-background)] px-5 text-center">
      <div className="inline-flex items-center rounded-2xl bg-white/95 px-5 py-3 shadow-lg ring-1 ring-black/5">
        <Logo size="lg" />
      </div>

      {phase !== 'error' ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
            aria-hidden
          />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('sso.skucast.redirecting', {
              defaultValue: 'Signing you in to SkuCast…',
            })}
          </p>
        </div>
      ) : (
        <div className="flex max-w-sm flex-col items-center gap-4">
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
          >
            {errorMsg}
          </p>
          <Button onClick={() => setAttempt((a) => a + 1)}>
            {t('sso.skucast.retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      )}
    </div>
  );
}
