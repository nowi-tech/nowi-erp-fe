import { useTranslation } from 'react-i18next';
import { setLanguage, type AppLanguage } from '@/i18n';
import { cn } from '@/lib/utils';

export default function LanguageToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'en') as AppLanguage;

  const Btn = ({ lang, label }: { lang: AppLanguage; label: string }) => (
    <button
      type="button"
      onClick={() => setLanguage(lang)}
      aria-pressed={current === lang}
      className={cn(
        'px-3 py-1 text-sm font-medium rounded-[var(--radius-sm)] transition-colors',
        current === lang
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
      )}
    >
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] p-1',
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
