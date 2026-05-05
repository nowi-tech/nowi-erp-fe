import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, Package, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { Badge } from '@/components/ui/badge';
import LanguageToggle from '@/components/LanguageToggle';
import { cn } from '@/lib/utils';

interface FloorShellProps {
  children: ReactNode;
  title?: string;
}

export default function FloorShell({ children, title }: FloorShellProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="density-comfortable min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{title ?? t('common.appName')}</span>
          {user && (
            <Badge variant="secondary" className="shrink-0">
              {t(`roles.${user.role}` as const)}
            </Badge>
          )}
        </div>
        <LanguageToggle />
      </header>

      <main className="flex-1 overflow-auto p-4 pb-24">{children}</main>

      <nav
        className="fixed bottom-0 inset-x-0 border-t border-[var(--color-border)] bg-[var(--color-background)] grid grid-cols-3"
        aria-label="primary"
      >
        <TabButton icon={<Home size={22} />} label={t('nav.home')} active />
        <TabButton icon={<Package size={22} />} label={t('nav.lots')} />
        <TabButton icon={<UserIcon size={22} />} label={t('nav.profile')} />
      </nav>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-center justify-center gap-1 py-2 min-h-[var(--density-tap-target)]',
        active
          ? 'text-[var(--color-primary)]'
          : 'text-[var(--color-muted-foreground)]',
      )}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
