import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
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
import Logo from '@/components/Logo';

const TEN_DIGITS = /^\d{10}$/;
const RESEND_SECONDS = 30;

function toE164(tenDigit: string): string {
  return `+91${tenDigit}`;
}

type Step = 'mobile' | 'otp';

const OTP_LENGTH = 6;

function OtpInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function set(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(clean);
    if (clean.length === OTP_LENGTH) onComplete?.(clean);
  }

  function handleChange(i: number, raw: string) {
    const c = raw.replace(/\D/g, '');
    if (!c) return;
    if (c.length > 1) {
      // user typed/pasted multiple digits into one box
      const next = (value.slice(0, i) + c + value.slice(i + c.length)).slice(0, OTP_LENGTH);
      set(next);
      const focusIndex = Math.min(i + c.length, OTP_LENGTH - 1);
      refs.current[focusIndex]?.focus();
      return;
    }
    const next = (value.slice(0, i) + c + value.slice(i + 1)).slice(0, OTP_LENGTH);
    set(next);
    if (i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = value.slice(0, i) + value.slice(i + 1);
        set(next);
      } else if (i > 0) {
        const next = value.slice(0, i - 1) + value.slice(i);
        set(next);
        refs.current[i - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) {
      refs.current[i + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData('text');
    if (!/\d/.test(txt)) return;
    e.preventDefault();
    set(txt);
    refs.current[Math.min(txt.replace(/\D/g, '').length, OTP_LENGTH) - 1]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`OTP digit ${i + 1}`}
          className="h-14 w-12 rounded-[var(--radius-md)] border border-[var(--color-input)] bg-[var(--color-background)] text-center text-2xl font-semibold tabular-nums tracking-tight text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/30 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

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

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!TEN_DIGITS.test(mobile)) {
      setError(t('auth.errors.invalidMobile'));
      return;
    }
    setSubmitting(true);
    try {
      await requestOtp(toE164(mobile));
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
      await requestOtp(toE164(mobile));
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
    if (!/^\d{6}$/.test(otp)) {
      setError(t('auth.errors.wrongOtp'));
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await verifyOtp(toE164(mobile), otp);
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
    <div className="density-comfortable min-h-screen grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] bg-[var(--color-background)]">
      {/* Brand panel — full bleed on desktop, hero strip on mobile */}
      <div className="relative overflow-hidden border-b border-white/10 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] lg:border-b-0">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-28 top-[-4.5rem] h-64 w-64 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-36 right-[-4.5rem] h-80 w-80 rounded-full bg-[var(--color-accent)]/20 blur-3xl"
        />
        <div className="relative flex h-full min-h-[220px] flex-col justify-between p-6 sm:p-8 lg:min-h-screen lg:p-14">
          <div className="inline-flex items-center px-4 py-3 shadow-2xl w-fit rounded-2xl bg-white/95 ring-1 ring-black/5 backdrop-blur-sm">
            <Logo size="xl" />
          </div>

          <div className="max-w-md pt-6 lg:pt-0">
            <p className="font-serif text-2xl leading-tight sm:text-3xl lg:text-4xl">
              From cut to dispatch — every stitch accounted for.
            </p>
            <p className="mt-3 text-sm text-white/80 lg:mt-4">
              Production tracking for the NOWI floor.
            </p>
          </div>

          <div className="pt-6 text-xs text-white/60 lg:pt-0">
            © {new Date().getFullYear()} NOWI
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center px-5 py-10 lg:py-0">
        <div className="absolute top-4 right-4">
          <LanguageToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="font-serif text-3xl text-[var(--color-foreground)]">
              {t("auth.title")}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {t("auth.subtitle")}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("auth.title")}</CardTitle>
              {step === "otp" && (
                <CardDescription>
                  {t("auth.otpHelp", { mobile: toE164(mobile) })}
                </CardDescription>
              )}
            </CardHeader>

            {step === "mobile" ? (
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
                    <Label htmlFor="mobile">{t("auth.mobileLabel")}</Label>
                    <div className="flex items-stretch gap-2">
                      <span className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-input)] bg-[var(--color-muted)] px-3 text-sm text-[var(--color-muted-foreground)]">
                        +91
                      </span>
                      <Input
                        id="mobile"
                        name="mobile"
                        type="tel"
                        autoComplete="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        placeholder={t("auth.mobilePlaceholder")}
                        value={mobile}
                        onChange={(e) =>
                          setMobile(
                            e.target.value.replace(/\D/g, "").slice(0, 10),
                          )
                        }
                        required
                        autoFocus
                      />
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {t("auth.mobileHelp")}
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full"
                  >
                    {submitting ? t("auth.sendingOtp") : t("auth.sendOtp")}
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
                    <Label className="block mb-2 text-center">
                      {t("auth.otpLabel")}
                    </Label>
                    <OtpInput
                      value={otp}
                      onChange={setOtp}
                      autoFocus
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("mobile");
                        setOtp("");
                        setError(null);
                      }}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline-offset-4 hover:underline"
                    >
                      {t("auth.changeMobile")}
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={cooldown > 0 || submitting}
                      className="text-[var(--color-primary)] disabled:text-[var(--color-muted-foreground)] disabled:cursor-not-allowed underline-offset-4 hover:underline"
                    >
                      {cooldown > 0
                        ? t("auth.resendIn", { seconds: cooldown })
                        : t("auth.resendOtp")}
                    </button>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full"
                  >
                    {submitting ? t("auth.loggingIn") : t("auth.verifyOtp")}
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
