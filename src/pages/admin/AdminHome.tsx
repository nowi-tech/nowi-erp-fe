import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminShell from '@/components/layout/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listOrders } from '@/api/orders';
import type { Order, OrderStatus } from '@/api/types';

export default function AdminHome() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listOrders()
      .then((o) => {
        if (!cancelled) setOrders(o);
      })
      .catch(() => {
        if (!cancelled) {
          setOrders([]);
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const by: Partial<Record<OrderStatus, number>> = {};
    (orders ?? []).forEach((o) => {
      by[o.status] = (by[o.status] ?? 0) + 1;
    });
    return by;
  }, [orders]);

  const total = orders?.length ?? 0;

  return (
    <AdminShell>
      <div className="grid gap-4 md:grid-cols-2 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.today')}</CardTitle>
          </CardHeader>
          <CardContent>
            {orders === null ? (
              <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-[var(--color-muted-foreground)]">
                  {t('admin.totalOrders')}: <span className="font-semibold">{total}</span>
                </div>
                {error && (
                  <div className="text-sm text-[var(--color-destructive)]">
                    {t('common.error')}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.lotsByStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            {orders === null ? (
              <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
            ) : Object.keys(counts).length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">—</p>
            ) : (
              <ul className="text-sm space-y-1">
                {Object.entries(counts).map(([status, n]) => (
                  <li key={status} className="flex justify-between">
                    <span>{status}</span>
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <Button variant="outline" disabled>
              {t('admin.openLocator')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
