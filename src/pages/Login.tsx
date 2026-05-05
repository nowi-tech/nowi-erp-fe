import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/auth';
import { requestOtp, verifyOtp } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import LanguageToggle from '@/components/LanguageToggle';

const E164 = /^\+[1-9]\d{6,14}$/;
const RESEND_SECONDS = 60;

type Step = 'mobile' | 'otp';

interface ApiErrorShape {
  response?: { status?: number; data?: { error?: string; message?: string } };
}

function getApiStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    return (err as ApiErrorShape).response?.status;
  }
  return undefined;
}

export default function Login() {
  const { t } = useTranslation();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!E164.test(mobile)) {
      setError(t('auth.errors.invalidMobile'));
      return;
    }
    setSubmitting(true);
    try {
      await requestOtp(mobile);
      setStep('otp');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      const status = getApiStatus(err);
      if (status === 429) setError(t('auth.errors.rateLimit'));
      else if (status === 400) setError(t('auth.errors.invalidMobile'));
      else setError(t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestOtp(mobile);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      const status = getApiStatus(err);
      if (status === 429) setError(t('auth.errors.rateLimit'));
      else setError(t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(otp)) {
      setError(t('auth.errors.wrongOtp'));
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await verifyOtp(mobile, otp);
      login(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      const status = getApiStatus(err);
      if (status === 401) setError(t('auth.errors.wrongOtp'));
      else if (status === 429) setError(t('auth.errors.rateLimit'));
      else setError(t('auth.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="density-comfortable min-h-screen flex items-center justify-center bg-[var(--color-muted)] px-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            {t('common.appName')}
          </h1>
          <p className="text-[var(--color-muted-foreground)] mt-1">{t('auth.subtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.title')}</CardTitle>
            {step === 'otp' && (
              <CardDescription>
                {t('auth.otpHelp', { mobile })}
              </CardDescription>
            )}
          </CardHeader>

          {step === 'mobile' ? (
            <form onSubmit={handleSendOtp}>
              <CardContent className="space-y-4">
                {error && (
                  <div
                    role="alert"
                    className="rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                  >
                    {error}
                  </div>
                )}
                <div>
                  <Label htmlFor="mobile">{t('auth.mobileLabel')}</Label>
                  <Input
                    id="mobile"
                    name="mobile"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder={t('auth.mobilePlaceholder')}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.trim())}
                    required
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                    {t('auth.mobileHelp')}
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? t('auth.sendingOtp') : t('auth.sendOtp')}
                </Button>
              </CardFooter>
            </form>
          ) : (
            <form onSubmit={handleVerify}>
              <CardContent className="space-y-4">
                {error && (
                  <div
                    role="alert"
                    className="rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                  >
                    {error}
                  </div>
                )}
                <div>
                  <Label htmlFor="otp">{t('auth.otpLabel')}</Label>
                  <Input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    required
                    ref={otpRef}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('mobile');
                      setOtp('');
                      setError(null);
                    }}
                    className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline-offset-4 hover:underline"
                  >
                    {t('auth.changeMobile')}
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || submitting}
                    className="text-[var(--color-primary)] disabled:text-[var(--color-muted-foreground)] disabled:cursor-not-allowed underline-offset-4 hover:underline"
                  >
                    {cooldown > 0
                      ? t('auth.resendIn', { seconds: cooldown })
                      : t('auth.resendOtp')}
                  </button>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? t('auth.loggingIn') : t('auth.verifyOtp')}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
