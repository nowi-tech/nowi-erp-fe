import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Package, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LanguageToggle from '@/components/LanguageToggle';
import { cn } from '@/lib/utils';

interface FloorShellProps {
  children: ReactNode;
  title?: string;
}

export default function FloorShell({ children, title }: FloorShellProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);

  const role = user?.role;
  const homePath = role === 'finishing_master' ? '/finishing' : '/stitching';
  const lotsPath = homePath; // floor "Lots" tab points at the same role-home for v1

  const isHome = location.pathname === homePath;

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
        <TabButton
          icon={<Home size={22} />}
          label={t('nav.home')}
          active={isHome}
          onClick={() => navigate(homePath)}
        />
        <TabButton
          icon={<Package size={22} />}
          label={t('nav.lots')}
          onClick={() => navigate(lotsPath)}
        />
        <TabButton
          icon={<UserIcon size={22} />}
          label={t('nav.profile')}
          onClick={() => setProfileOpen(true)}
        />
      </nav>

      {profileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('profile.title')}
          className="fixed inset-0 z-40 flex"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileOpen(false);
          }}
        >
          <div className="flex-1 bg-black/40" />
          <aside className="w-72 max-w-[85vw] bg-[var(--color-background)] border-l border-[var(--color-border)] p-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t('profile.title')}</span>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="text-sm text-[var(--color-muted-foreground)]"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            {user && (
              <div className="text-sm">
                <div className="font-medium">{user.name}</div>
                <div className="text-[var(--color-muted-foreground)]">
                  {t(`roles.${user.role}` as const)}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm font-medium">{t('profile.languageLabel')}</div>
              <LanguageToggle />
            </div>
            <div className="mt-auto">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setProfileOpen(false);
                  void logout();
                }}
              >
                <LogOut size={16} />
                {t('profile.logout')}
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function TabButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
