import { useTranslation } from 'react-i18next';
import { setLanguage, type AppLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

export default function LanguageToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'en') as AppLanguage;

  // iOS-style pill: chip-colored track with a raised white pill on the
  // active option (matches the design's EN/हि treatment in the chrome).
  const Btn = ({ lang, label }: { lang: AppLanguage; label: string }) => (
    <button
      type="button"
      onClick={() => setLanguage(lang)}
      aria-pressed={current === lang}
      className={cn(
        'px-3 py-[5px] text-[13px] font-semibold rounded-full transition-colors min-w-[28px] text-center',
        current === lang
          ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.08),0_0_0_1px_var(--color-border)]'
          : 'text-[var(--color-muted-foreground)]',
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        'inline-flex items-center p-[3px] rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]',
        className,
      )}
      role="group"
      aria-label="Language"
    >
      <Btn lang="en" label="EN" />
      <Btn lang="hi" label="हि" />
    </div>
  );
}
