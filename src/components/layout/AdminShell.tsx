import { useState } from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { Badge } from '@/components/ui/badge';
import LanguageToggle from '@/components/LanguageToggle';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', end: true, icon: <LayoutDashboard size={18} />, labelKey: 'admin.nav.dashboard' },
  { to: '/admin/locator', icon: <Search size={18} />, labelKey: 'admin.nav.locator' },
  { to: '/admin/vendors', icon: <Truck size={18} />, labelKey: 'admin.nav.vendors' },
  { to: '/admin/skus', icon: <Package size={18} />, labelKey: 'admin.nav.skus' },
  { to: '/admin/users', icon: <Users size={18} />, labelKey: 'admin.nav.users' },
  { to: '/admin/settings', icon: <Settings size={18} />, labelKey: 'admin.nav.settings' },
];

export default function AdminShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="density-compact min-h-screen flex bg-[var(--color-background)] text-[var(--color-foreground)]">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] flex flex-col">
        <div className="px-4 py-4 font-semibold border-b border-[var(--color-border)]">
          {t('common.appName')}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => (
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
