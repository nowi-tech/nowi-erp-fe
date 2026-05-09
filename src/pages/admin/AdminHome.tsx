import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Sparkline from '@/components/Sparkline';
import { useToast } from '@/components/ui/toast';
import { listOrders } from '@/api/orders';
import { getThroughput, getReworkRate, getCycleTime } from '@/api/dashboard';
import { FeatureUnavailableError } from '@/api/_errors';
import type {
  CycleTimeResponse,
  Order,
  OrderStatus,
  ReworkRateResponse,
  ThroughputResponse,
} from '@/api/types';

type Days = 7 | 30;

export default function AdminHome() {
  const { t } = useTranslation();
  const toast = useToast();
  const [throughputDays, setThroughputDays] = useState<Days>(7);
  const [throughput, setThroughput] = useState<ThroughputResponse | null>(null);
  const [rework, setRework] = useState<ReworkRateResponse | null>(null);
  const [cycle, setCycle] = useState<CycleTimeResponse | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThroughput(null);
    getThroughput(throughputDays)
      .then((d) => {
        if (!cancelled) setThroughput(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof FeatureUnavailableError) {
          toast.show(t('common.featureUnavailable'), 'info');
        }
        setThroughput({ finishedUnits: 0, dispatchedUnits: 0, trend: [] });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throughputDays]);

  useEffect(() => {
    let cancelled = false;
    getReworkRate(30)
      .then((d) => {
        if (!cancelled) setRework(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof FeatureUnavailableError) {
          toast.show(t('common.featureUnavailable'), 'info');
        }
        setRework({
          overall: { reworkUnits: 0, finishingForwardUnits: 0, ratePct: 0 },
          bySku: [],
          byStage: [],
        });
      });
    getCycleTime(30)
      .then((d) => {
        if (!cancelled) setCycle(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof FeatureUnavailableError) {
          toast.show(t('common.featureUnavailable'), 'info');
        }
        setCycle({ avgDays: 0, bySku: [], distribution: [] });
      });
    listOrders()
      .then((o) => {
        if (!cancelled) setOrders(o);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusCounts = useMemo(() => {
    const by: Partial<Record<OrderStatus, number>> = {};
    (orders ?? []).forEach((o) => {
      by[o.status] = (by[o.status] ?? 0) + 1;
    });
    return by;
  }, [orders]);

  const sparkData = throughput?.trend.map((p) => p.finished) ?? [];
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const distMax = useMemo(() => {
    if (!cycle) return 0;
    return cycle.distribution.reduce((m, b) => Math.max(m, b.count), 0);
  }, [cycle]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Throughput */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t('admin.dashboard.throughput')}</CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={throughputDays === 7 ? 'default' : 'outline'}
                onClick={() => setThroughputDays(7)}
              >
                {t('admin.dashboard.last7d')}
              </Button>
              <Button
                size="sm"
                variant={throughputDays === 30 ? 'default' : 'outline'}
                onClick={() => setThroughputDays(30)}
              >
                {t('admin.dashboard.last30d')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!throughput ? (
              <div className="h-16 animate-pulse rounded bg-[var(--color-muted)]" />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {t('admin.dashboard.finished')}
                    </div>
                    <div className="text-3xl font-semibold">{throughput.finishedUnits}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {t('admin.dashboard.dispatched')}
                    </div>
                    <div className="text-3xl font-semibold">{throughput.dispatchedUnits}</div>
                  </div>
                </div>
                <div className="text-[var(--color-primary)]">
                  <Sparkline data={sparkData} width={220} height={36} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rework rate */}
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.dashboard.reworkRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!rework ? (
              <div className="h-16 animate-pulse rounded bg-[var(--color-muted)]" />
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">
                    {t('admin.dashboard.overall')}
                  </div>
                  <div className="text-3xl font-semibold">
                    {rework.overall.ratePct.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--color-muted-foreground)] mb-1">
                    {t('admin.dashboard.topSkus')}
                  </div>
                  <ul className="text-xs space-y-1">
                    {rework.bySku.slice(0, 5).map((row) => (
                      <li key={row.sku} className="flex justify-between gap-2">
                        <Link
                          to={`/admin/locator?sku=${encodeURIComponent(row.sku)}&from=${since}`}
                          className="font-mono truncate text-[var(--color-primary)] hover:underline"
                        >
                          {row.sku}
                        </Link>
                        <span className="font-medium tabular-nums">
                          {row.ratePct.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                    {rework.bySku.length === 0 && (
                      <li className="text-[var(--color-muted-foreground)]">—</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cycle time */}
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.dashboard.cycleTime')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!cycle ? (
              <div className="h-16 animate-pulse rounded bg-[var(--color-muted)]" />
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">
                    {t('admin.dashboard.avgDays')}
                  </div>
                  <div className="text-3xl font-semibold">{cycle.avgDays.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--color-muted-foreground)] mb-1">
                    {t('admin.dashboard.distribution')}
                  </div>
                  <ul className="space-y-1 text-xs">
                    {cycle.distribution.slice(0, 5).map((b) => {
                      const pct = distMax === 0 ? 0 : (b.count / distMax) * 100;
                      return (
                        <li key={b.bucket} className="flex items-center gap-2">
                          <span className="w-12 text-[var(--color-muted-foreground)]">
                            {b.bucket}
                          </span>
                          <div className="flex-1 bg-[var(--color-muted)] h-2 rounded overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-primary)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="tabular-nums">{b.count}</span>
                        </li>
                      );
                    })}
                    {cycle.distribution.length === 0 && (
                      <li className="text-[var(--color-muted-foreground)]">—</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.lotsByStatus')}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders === null ? (
            <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : Object.keys(statusCounts).length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">—</p>
          ) : (
            <ul className="text-sm grid gap-1 grid-cols-2 md:grid-cols-4">
              {Object.entries(statusCounts).map(([status, n]) => (
                <li
                  key={status}
                  className="flex justify-between border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1"
                >
                  <span className="text-[var(--color-muted-foreground)]">{status}</span>
                  <span className="font-medium">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
