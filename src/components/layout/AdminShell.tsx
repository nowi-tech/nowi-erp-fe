import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Truck,
  Search,
  LogOut,
  Database,
  FlaskConical,
  Inbox,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/auth';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import LanguageToggle from '@/components/LanguageToggle';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/api/types';

type NavStage = 'ink' | 'stitch' | 'finish' | 'disp';

interface NavItem {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  labelKey: string;
  roles: UserRole[];
  /** Drives the active-state accent color. Defaults to ink (primary). */
  stage?: NavStage;
}

const STAGE_VARS: Record<NavStage, { acc: string; bg: string }> = {
  ink:    { acc: 'var(--color-primary)',       bg: 'color-mix(in oklab, var(--color-primary) 12%, transparent)' },
  stitch: { acc: 'var(--stage-stitch-acc)',    bg: 'color-mix(in oklab, var(--stage-stitch-acc) 12%, transparent)' },
  finish: { acc: 'var(--stage-finish-acc)',    bg: 'color-mix(in oklab, var(--stage-finish-acc) 12%, transparent)' },
  disp:   { acc: 'var(--stage-disp-acc)',      bg: 'color-mix(in oklab, var(--stage-disp-acc) 12%, transparent)' },
};

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', end: true, icon: <LayoutDashboard size={20} />, labelKey: 'admin.nav.dashboard', roles: ['admin', 'viewer'], stage: 'ink' },
  { to: '/admin/locator', icon: <Search size={20} />, labelKey: 'admin.nav.locator', roles: ['admin', 'viewer'], stage: 'ink' },
  { to: '/admin/dispatches', icon: <Truck size={20} />, labelKey: 'admin.nav.dispatches', roles: ['admin', 'viewer'], stage: 'disp' },
  { to: '/admin/edit-requests', icon: <Inbox size={20} />, labelKey: 'admin.nav.editRequests', roles: ['admin'], stage: 'ink' },
  { to: '/data', icon: <Database size={20} />, labelKey: 'admin.nav.masterData', roles: ['data_manager'], stage: 'ink' },
  { to: '/admin/users', icon: <Users size={20} />, labelKey: 'admin.nav.users', roles: ['admin'], stage: 'ink' },
  // TODO: build — surface once admin Vendors / SKUs / Settings pages exist.
  // { to: '/admin/vendors', icon: <Truck size={20} />, labelKey: 'admin.nav.vendors', roles: ['admin', 'viewer', 'data_manager'] },
  // { to: '/admin/skus', icon: <Package size={20} />, labelKey: 'admin.nav.skus', roles: ['admin', 'viewer', 'data_manager'] },
  // { to: '/admin/settings', icon: <Settings size={20} />, labelKey: 'admin.nav.settings', roles: ['admin'] },
];

const TEST_DATA_KEY = 'nowi.showTestData';
const PRIMARY_BOTTOM_COUNT = 3;

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
        'flex items-center gap-2 px-2 py-1 rounded-[var(--radius-sm)] text-xs border transition-colors',
        on
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
      )}
      aria-pressed={on}
    >
      <FlaskConical size={14} />
      <span className="hidden sm:inline">{t('admin.testData.label')}</span>
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
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  const role: UserRole | undefined = user?.role;
  const visibleNav = NAV_ITEMS.filter((it) =>
    role ? it.roles.includes(role) : false,
  );
  const homePath = role === 'data_manager' ? '/data' : '/admin';

  const primary = visibleNav.slice(0, PRIMARY_BOTTOM_COUNT);
  const overflow = visibleNav.slice(PRIMARY_BOTTOM_COUNT);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-[var(--color-border)] flex-col bg-[var(--color-background-2)]">
        <Link
          to={homePath}
          aria-label={t('common.appName')}
          className="px-5 py-5 border-b border-[var(--color-border)] block hover:bg-[var(--color-muted)] transition-colors"
        >
          <Logo size="md" />
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((item) => {
            const stage: NavStage = item.stage ?? 'ink';
            const stageVars = STAGE_VARS[stage];
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={{ ['--nav-acc' as string]: stageVars.acc, ['--nav-bg' as string]: stageVars.bg }}
                className={({ isActive }) =>
                  cn(
                    'relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors',
                    'before:absolute before:left-1 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-[var(--nav-acc)] before:transition-opacity',
                    isActive
                      ? 'bg-[var(--nav-bg)] text-[var(--color-foreground)] font-medium before:opacity-100'
                      : 'text-[var(--color-foreground-3)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] before:opacity-0',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'shrink-0 transition-colors',
                        isActive
                          ? 'text-[var(--nav-acc)]'
                          : 'text-[var(--color-muted-foreground-2)]',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span>{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          {user?.name} · {user && t(`roles.${user.role}` as const)}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur px-3 sm:px-5 h-14">
          {/* Mobile: logo left, actions right */}
          <div className="lg:hidden flex items-center justify-between h-full">
            <Link
              to={homePath}
              aria-label={t('common.appName')}
              className="p-1 -ml-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)]"
            >
              <Logo size="md" />
            </Link>
            <div className="flex items-center gap-1">
              <LanguageToggle />
              <button
                type="button"
                onClick={() => void logout()}
                className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                aria-label={t('common.logout')}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* Desktop: logo lives in the sidebar; header carries identity + actions */}
          <div className="hidden lg:flex items-center justify-between h-full">
            <div className="flex items-center gap-3 min-w-0">
              {user && (
                <Badge variant="secondary">
                  {t(`roles.${user.role}` as const)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              {role === 'admin' && <TrainingModeToggle />}
              <LanguageToggle />
              <span className="text-sm text-[var(--color-muted-foreground)] max-w-[14ch] truncate">
                {user?.name}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)] text-sm text-[var(--color-muted-foreground)]"
                aria-label={t('common.logout')}
              >
                <LogOut size={14} />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--color-surface)]/95 backdrop-blur border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)]"
          aria-label="Primary"
        >
          <div className="flex items-stretch justify-around h-16">
            {primary.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                    isActive
                      ? 'text-[var(--color-primary)]'
                      : 'text-[var(--color-muted-foreground)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex items-center justify-center h-7 w-12 rounded-full transition-colors',
                        isActive && 'bg-[var(--color-primary)]/10',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="leading-none">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            ))}
            {overflow.length > 0 && (
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px]',
                  moreOpen
                    ? 'text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)]',
                )}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
              >
                <span className="flex items-center justify-center h-7 w-12 rounded-full">
                  <MoreHorizontal size={20} />
                </span>
                <span className="leading-none">{t('common.more')}</span>
              </button>
            )}
          </div>
        </nav>

        {/* Mobile "More" sheet */}
        {moreOpen && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-[var(--color-foreground)]/40"
              onClick={() => setMoreOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              className="absolute inset-x-0 bottom-0 rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)] pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom"
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-sm font-medium text-[var(--color-muted-foreground)]">
                  {t('common.more')}
                </span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-muted)]"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 px-3 pb-4">
                {overflow.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-[var(--radius-md)] text-xs text-center',
                        isActive
                          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]',
                      )
                    }
                  >
                    {item.icon}
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
