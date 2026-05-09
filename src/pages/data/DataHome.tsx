import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Truck, Package, Users, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listVendors } from '@/api/vendors';
import { listSkus } from '@/api/skus';

interface CardSpec {
  to: string;
  icon: React.ReactNode;
  titleKey: string;
  bodyKey: string;
  loadCount?: () => Promise<number>;
}

const CARDS: CardSpec[] = [
  {
    to: '/admin/vendors',
    icon: <Truck size={18} />,
    titleKey: 'admin.nav.vendors',
    bodyKey: 'data.cards.vendorsBody',
    loadCount: async () => (await listVendors()).length,
  },
  {
    to: '/admin/skus',
    icon: <Package size={18} />,
    titleKey: 'admin.nav.skus',
    bodyKey: 'data.cards.skusBody',
    loadCount: async () => (await listSkus()).length,
  },
  {
    to: '/admin/users',
    icon: <Users size={18} />,
    titleKey: 'admin.nav.users',
    bodyKey: 'data.cards.usersBody',
  },
  {
    to: '/admin/settings',
    icon: <Settings size={18} />,
    titleKey: 'admin.nav.settings',
    bodyKey: 'data.cards.settingsBody',
  },
];

function CountBadge({ load }: { load?: () => Promise<number> }) {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load()
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  if (!load) return null;
  if (failed) return <Badge variant="outline">—</Badge>;
  if (count === null) return <Badge variant="outline">…</Badge>;
  return <Badge variant="secondary">{count}</Badge>;
}

export default function DataHome() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('data.title')}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t('data.subtitle')}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] rounded-[var(--radius-lg)]"
          >
            <Card className="h-full transition-colors group-hover:bg-[var(--color-muted)]">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {c.icon}
                  <span>{t(c.titleKey)}</span>
                </CardTitle>
                <CountBadge load={c.loadCount} />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {t(c.bodyKey)}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
