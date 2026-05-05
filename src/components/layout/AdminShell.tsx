import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, Package, Settings, Truck, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/context/auth';
import { Badge } from '@/components/ui/badge';
import LanguageToggle from '@/components/LanguageToggle';
import { cn } from '@/lib/utils';

interface AdminShellProps {
  children: ReactNode;
}

export default function AdminShell({ children }: AdminShellProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { icon: <LayoutDashboard size={18} />, label: t('nav.dashboard') },
    { icon: <Truck size={18} />, label: t('nav.vendors') },
    { icon: <Package size={18} />, label: t('nav.skus') },
    { icon: <Users size={18} />, label: t('nav.users') },
    { icon: <Settings size={18} />, label: t('nav.settings') },
  ];

  return (
    <div className="density-compact min-h-screen flex bg-[var(--color-background)] text-[var(--color-foreground)]">
      <aside className="w-56 shrink-0 border-r border-[var(--color-border)] flex flex-col">
        <div className="px-4 py-4 font-semibold border-b border-[var(--color-border)]">
          {t('common.appName')}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-left',
                'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]',
              )}
            >
              {item.icon}
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <div className="flex items-center gap-2">
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
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
