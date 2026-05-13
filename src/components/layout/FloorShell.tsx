import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, LogOut } from 'lucide-react';
import { useAuth } from '@/context/auth';
import LanguageToggle from '@/components/LanguageToggle';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils';

interface FloorShellProps {
  children: ReactNode;
  /** Kept for back-compat / accessibility; not rendered in the header anymore. */
  title?: string;
}

export default function FloorShell({ children }: FloorShellProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = user?.role;
  const homePath = role === 'finishing_master' ? '/finishing' : '/stitching';

  const isHome = location.pathname === homePath;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* ── MOBILE HEADER ── (logo left, lang right) */}
      <header className="lg:hidden sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur px-3 h-14">
        <div className="flex items-center justify-between h-full">
          <Link
            to={homePath}
            aria-label={t('common.appName')}
            className="p-1 -ml-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)]"
          >
            <Logo size="md" />
          </Link>
          <LanguageToggle />
        </div>
      </header>

      {/* ── DESKTOP HEADER ── (logo left, inline nav, identity + actions right) */}
      <header className="hidden lg:flex sticky top-0 z-20 items-center border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur px-6 h-16">
        <div className="flex items-center gap-8 max-w-5xl w-full mx-auto">
          <Link
            to={homePath}
            aria-label={t('common.appName')}
            className="p-1 -ml-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)] shrink-0"
          >
            <Logo size="md" />
          </Link>
          <nav className="flex items-center gap-1" aria-label="primary">
            <NavLink
              to={homePath}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-medium'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
                )
              }
            >
              <Home size={16} />
              <span>{t('nav.home')}</span>
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)] text-sm text-[var(--color-muted-foreground)]"
              aria-label={t('common.logout')}
              title={t('common.logout')}
            >
              <LogOut size={16} />
              <span className="sr-only">{t('common.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-6 max-w-3xl lg:max-w-5xl w-full mx-auto">
        {children}
      </main>

      {/* ── MOBILE BOTTOM NAV ── (hidden on desktop; nav lives in the header) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 border-t border-[var(--color-border)] bg-[var(--color-background)] pb-[env(safe-area-inset-bottom)]"
        aria-label="primary"
      >
        <div className="grid grid-cols-2 max-w-3xl mx-auto">
          <TabButton
            icon={<Home size={22} />}
            label={t('nav.home')}
            active={isHome}
            onClick={() => navigate(homePath)}
          />
          <TabButton
            icon={<LogOut size={22} />}
            label={t('common.logout')}
            onClick={() => void logout()}
          />
        </div>
      </nav>
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
        'flex flex-col items-center justify-center gap-1 py-2 min-h-11',
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
