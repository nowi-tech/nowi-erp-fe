import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  Settings,
  Truck,
  Search,
  ChevronDown,
  LogOut,
  Database,
  FlaskConical,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import LanguageToggle from '@/components/LanguageToggle';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/api/types';

interface NavItem {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  labelKey: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/admin',
    end: true,
    icon: <LayoutDashboard size={18} />,
    labelKey: 'admin.nav.dashboard',
    roles: ['admin', 'viewer'],
  },
  {
    to: '/admin/locator',
    icon: <Search size={18} />,
    labelKey: 'admin.nav.locator',
    roles: ['admin', 'viewer'],
  },
  {
    to: '/admin/dispatches',
    icon: <Truck size={18} />,
    labelKey: 'admin.nav.dispatches',
    roles: ['admin', 'viewer'],
  },
  {
    to: '/data',
    icon: <Database size={18} />,
    labelKey: 'admin.nav.masterData',
    roles: ['data_manager'],
  },
  {
    to: '/admin/vendors',
    icon: <Truck size={18} />,
    labelKey: 'admin.nav.vendors',
    roles: ['admin', 'viewer', 'data_manager'],
  },
  {
    to: '/admin/skus',
    icon: <Package size={18} />,
    labelKey: 'admin.nav.skus',
    roles: ['admin', 'viewer', 'data_manager'],
  },
  {
    to: '/admin/users',
    icon: <Users size={18} />,
    labelKey: 'admin.nav.users',
    roles: ['admin'],
  },
  {
    to: '/admin/settings',
    icon: <Settings size={18} />,
    labelKey: 'admin.nav.settings',
    roles: ['admin'],
  },
];

const TEST_DATA_KEY = 'nowi.showTestData';

function TrainingModeToggle() {
  const { t } = useTranslation();
  const toast = useToast();
  const [on, setOn] = useState<boolean>(
    () => localStorage.getItem(TEST_DATA_KEY) === '1',
  );

  useEffect(() => {
    if (on) localStorage.setItem(TEST_DATA_KEY, '1');
    else localStorage.removeItem(TEST_DATA_KEY);
  }, [on]);

  const onToggle = () => {
    const next = !on;
    setOn(next);
    toast.show(
      next ? t('admin.testData.toastOn') : t('admin.testData.toastOff'),
      'info',
    );
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded-[var(--radius-sm)] text-xs border',
        on
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
      )}
      aria-pressed={on}
    >
      <FlaskConical size={14} />
      <span>{t('admin.testData.label')}</span>
      <span
        aria-hidden
        className={cn(
          'inline-block w-7 h-3.5 rounded-full relative transition-colors',
          on ? 'bg-white/40' : 'bg-[var(--color-muted)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all',
            on ? 'left-4' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

export default function AdminShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const role: UserRole | undefined = user?.role;
  const visibleNav = NAV_ITEMS.filter((it) =>
    role ? it.roles.includes(role) : false,
  );

  return (
    <div className="density-compact min-h-screen flex bg-[var(--color-background)] text-[var(--color-foreground)]">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] flex flex-col">
        <div className="px-4 py-4 font-semibold border-b border-[var(--color-border)]">
          {t('common.appName')}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-left text-sm',
                  isActive
                    ? 'bg-[var(--color-muted)] text-[var(--color-foreground)] font-medium'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
                )
              }
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{t('common.appName')}</span>
            {user && <Badge variant="secondary">{t(`roles.${user.role}` as const)}</Badge>}
          </div>
          <div className="flex items-center gap-3 relative">
            {role === 'admin' && <TrainingModeToggle />}
            <LanguageToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)] text-sm"
            >
              <span>{user?.name ?? '—'}</span>
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)] text-sm text-[var(--color-muted-foreground)]"
              aria-label={t('common.logout')}
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{t('common.logout')}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-background)] shadow-md z-10">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--color-muted)]"
                >
                  <LogOut size={14} />
                  {t('common.logout')}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
