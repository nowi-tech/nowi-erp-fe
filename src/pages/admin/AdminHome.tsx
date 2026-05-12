import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Drawer } from '@/components/ui/drawer';
import { listOrders } from '@/api/orders';
import { getLocator } from '@/api/locator';
import { Badge } from '@/components/ui/badge';
import KpiTile from '@/components/KpiTile';
import { getThroughput, getReworkRate } from '@/api/dashboard';
import { FeatureUnavailableError } from '@/api/_errors';
import type {
  LocatorResponse,
  LocatorRow,
  Order,
  OrderStatus,
  ReworkRateResponse,
  ThroughputResponse,
} from '@/api/types';

type Days = 7 | 30;

export default function AdminHome() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const throughputDays: Days = 7;
  const [throughput, setThroughput] = useState<ThroughputResponse | null>(null);
  const [rework, setRework] = useState<ReworkRateResponse | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [locator, setLocator] = useState<LocatorResponse | null>(null);
  const [previewSku, setPreviewSku] = useState<LocatorRow | null>(null);

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
    listOrders()
      .then((o) => {
        if (!cancelled) setOrders(o);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      });
    // Top-of-list SKU rollup for the dashboard table
    getLocator({ take: 12 })
      .then((r) => {
        if (!cancelled) setLocator(r);
      })
      .catch(() => {
        if (!cancelled) setLocator({ rows: [], page: { skip: 0, take: 12, total: 0 } });
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

  // ── Cross-stage KPI derivations ──────────────────────────────
  const inStitching = statusCounts.in_stitching ?? 0;
  const inFinishing = statusCounts.in_finishing ?? 0;
  const inRework = statusCounts.in_rework ?? 0;
  const receiving = statusCounts.receiving ?? 0;
  const dispatched = statusCounts.dispatched ?? 0;
  const stuck = statusCounts.stuck ?? 0;
  const activeTotal = inStitching + inFinishing + inRework + receiving;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page heading + cross-stage narrative */}
      <header>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {t('admin.home.title', { defaultValue: 'Dashboard' })}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {orders === null ? (
            <span className="inline-block h-4 w-72 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : (
            <>
              <b className="text-[var(--color-foreground-2)] font-medium tabular-nums">
                {activeTotal}
              </b>{' '}
              {t('admin.home.activeLots', { defaultValue: 'active lots across stitching, finishing & dispatch' })}
              {(stuck > 0 || inRework > 0) && (
                <>
                  {' · '}
                  <b className="text-[var(--color-foreground-2)] font-medium tabular-nums">
                    {stuck + inRework}
                  </b>{' '}
                  {t('admin.home.needAttention', { defaultValue: 'need attention' })}
                </>
              )}
            </>
          )}
        </p>
      </header>

      {/* KPI strip — only metrics where we actually have data */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          stage="stitch"
          label={t('admin.home.kpi.inStitching', { defaultValue: 'In stitching' })}
          value={inStitching}
          unit={t('admin.home.kpi.lotsUnit', { defaultValue: 'lots' })}
        />
        <KpiTile
          stage="finish"
          label={t('admin.home.kpi.inFinishing', { defaultValue: 'In finishing' })}
          value={inFinishing}
          unit={t('admin.home.kpi.lotsUnit', { defaultValue: 'lots' })}
        />
        <KpiTile
          stage="disp"
          label={t('admin.home.kpi.throughput', { defaultValue: 'Throughput' })}
          value={throughput ? throughput.dispatchedUnits : dispatched}
          unit="u"
          period={`${throughputDays}D`}
          sparkPoints={sparkData}
        />
        {/* Rework rate hidden until we have ≥10 finishing-forward units —
            below that the % is a misleading divide-by-tiny. */}
        {rework && rework.overall.finishingForwardUnits >= 10 && (
          <KpiTile
            stage="accent"
            label={t('admin.home.kpi.reworkRate', { defaultValue: 'Rework rate' })}
            value={rework.overall.ratePct.toFixed(1)}
            unit="%"
            period="30D"
            context={
              rework.overall.reworkUnits > 0
                ? t('admin.home.kpi.reworkUnits', {
                    defaultValue: '{{n}} units',
                    n: rework.overall.reworkUnits,
                  })
                : undefined
            }
          />
        )}
        {/* TODO: re-add Avg cycle KPI once we have completed lots
            (currently /api/dashboard/cycle-time returns avgDays=0). */}
      </div>

      {/* SKU table — per-SKU rollup across stages */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-serif text-xl font-semibold leading-tight">
              {t('admin.home.skuTable.title', { defaultValue: 'SKU visibility' })}
            </h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {t('admin.home.skuTable.subtitle', {
                defaultValue: 'Units in each stage, per SKU. Click a row for the size breakdown.',
              })}
            </p>
          </div>
          <Link
            to="/admin/locator"
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline-offset-4 hover:underline"
          >
            {t('admin.home.openLocator', { defaultValue: 'Open locator →' })}
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="text-left font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3">
                      {t('admin.locator.columns.sku', { defaultValue: 'SKU' })}
                    </th>
                    <th className="text-left font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3 hidden md:table-cell">
                      {t('admin.locator.columns.origin', { defaultValue: 'Origin' })}
                    </th>
                    <th className="text-right font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3">
                      {t('admin.locator.columns.inbound', { defaultValue: 'Inbound' })}
                    </th>
                    <th className="text-right font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3">
                      {t('admin.locator.columns.stitching', { defaultValue: 'Stitching' })}
                    </th>
                    <th className="text-right font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3">
                      {t('admin.locator.columns.finishing', { defaultValue: 'Finishing' })}
                    </th>
                    <th className="text-right font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3">
                      {t('admin.locator.columns.dispatched', { defaultValue: 'Dispatched' })}
                    </th>
                    <th className="text-right font-mono uppercase tracking-[0.12em] text-[10.5px] font-medium px-4 py-3">
                      {t('admin.locator.columns.lots', { defaultValue: 'Lots' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {locator === null &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`s${i}`} className="border-t border-[var(--color-border)]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="h-4 animate-pulse rounded bg-[var(--color-muted)]" />
                        </td>
                      </tr>
                    ))}
                  {locator && locator.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-[var(--color-muted-foreground)]"
                      >
                        {t('admin.locator.emptyResults', { defaultValue: 'No SKUs to show.' })}
                      </td>
                    </tr>
                  )}
                  {locator?.rows.map((r) => (
                    <tr
                      key={r.sku}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer transition-colors"
                      onClick={() => setPreviewSku(r)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-[var(--color-foreground)]">
                          {r.sku}
                        </div>
                        <div className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
                          {r.baseCode} · {r.sizeLabel}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-[11px] text-[var(--color-muted-foreground)]">
                        {r.originVendor?.code ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.counts.inbound}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.counts.stitching}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.counts.finishing}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.counts.dispatched}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted-foreground)]">
                        {r.lotsCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {locator && locator.page.total > locator.rows.length && (
              <div className="px-4 py-3 text-xs text-[var(--color-muted-foreground)] border-t border-[var(--color-border)]">
                {t('admin.home.skuTable.showing', {
                  defaultValue: 'Showing top {{shown}} of {{n}} SKUs — open Locator for the full list.',
                  shown: locator.rows.length,
                  n: locator.page.total,
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Bottom detail cards (Throughput / Rework / Cycle) were
          folded into the KPI strip above. Drill into Locator for
          the per-SKU breakdown. */}

      {/* SKU quick-view drawer */}
      <Drawer
        open={previewSku !== null}
        onClose={() => setPreviewSku(null)}
        accent={
          previewSku
            ? previewSku.counts.dispatched > 0
              ? 'disp'
              : previewSku.counts.finishing > 0
                ? 'finish'
                : previewSku.counts.stitching > 0
                  ? 'stitch'
                  : 'ink'
            : 'ink'
        }
        title={previewSku?.sku}
        subtitle={
          previewSku
            ? `${previewSku.baseCode} · ${previewSku.sizeLabel}`
            : undefined
        }
        headerAction={
          previewSku ? (
            <Badge variant="outline" className="font-mono text-[11px]">
              {previewSku.originVendor?.code}
            </Badge>
          ) : null
        }
        footer={
          previewSku ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {t('admin.locator.columns.lots', { defaultValue: 'Lots' })}:{' '}
                <span className="font-serif text-base tabular-nums text-[var(--color-foreground)]">
                  {previewSku.lotsCount}
                </span>
              </span>
              <Button
                onClick={() =>
                  navigate(
                    `/admin/locator/sku/${encodeURIComponent(previewSku.sku)}`,
                  )
                }
              >
                {t('admin.locator.columns.open', { defaultValue: 'Open' })}
              </Button>
            </div>
          ) : null
        }
      >
        {previewSku && (
          <div className="grid grid-cols-2 gap-3">
            <SkuCountTile
              label={t('admin.locator.columns.inbound', { defaultValue: 'Inbound' })}
              value={previewSku.counts.inbound}
            />
            <SkuCountTile
              label={t('admin.locator.columns.stitching', { defaultValue: 'Stitching' })}
              value={previewSku.counts.stitching}
              tint="var(--stage-stitch-bg)"
              ink="var(--stage-stitch-ink)"
            />
            <SkuCountTile
              label={t('admin.locator.columns.finishing', { defaultValue: 'Finishing' })}
              value={previewSku.counts.finishing}
              tint="var(--stage-finish-bg)"
              ink="var(--stage-finish-ink)"
            />
            <SkuCountTile
              label={t('admin.locator.columns.dispatched', { defaultValue: 'Dispatched' })}
              value={previewSku.counts.dispatched}
              tint="var(--stage-disp-bg)"
              ink="var(--stage-disp-ink)"
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function SkuCountTile({
  label,
  value,
  tint,
  ink,
}: {
  label: string;
  value: number;
  tint?: string;
  ink?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
      style={{ background: tint }}
    >
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div
        className="font-serif text-2xl font-semibold tabular-nums leading-tight"
        style={{ color: ink }}
      >
        {value}
      </div>
    </div>
  );
}
