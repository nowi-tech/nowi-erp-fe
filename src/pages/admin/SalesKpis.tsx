import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/toast';
import { todayISO } from '@/lib/date';
import { CARD_SHELL, DISPLAY, SANS, Sparkline } from '@/components/admin/kpiPrimitives';
import {
  getSalesKpis,
  refreshSalesKpis,
  type SalesBucket,
  type SalesFormat,
  type SalesKpisResponse,
  type SalesMetric,
} from '@/api/salesKpis';

/** Per-bucket accent — cards in a bucket share a colour so groups read at a glance. */
const BUCKET_ACCENT: Record<SalesBucket, string> = {
  sales: '#3b5bdb',
  live: '#0ca678',
  inventory: '#7048e8',
  fulfilment: '#e8590c',
};

/** Format a metric value; `null` → N/A. `compact` is unused for now (full,
 *  grouped en-IN numbers fit the 3-up footer). */
function formatValue(v: number | null, format: SalesFormat): string {
  if (v === null || v === undefined) return 'N/A';
  if (format === 'currency') return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  if (format === 'percent') return `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/** Format a YYYY-MM-DD as "29 Jun" for the headline label of a back-dated view. */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** "5 min ago" style relative label for the last sync. */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** One Sales-analytics page: the same cards + Refresh, filtered to a section.
 *  `buckets` selects which metric groups show (Sales / Live / Inventory /
 *  Fulfilment); all pages share one `/sales-kpis` fetch (5-min cached) + Refresh. */
export default function SalesKpis({
  buckets,
  titleKey = 'admin.salesKpis.title',
  titleDefault = 'Sales KPIs',
  subtitleKey = 'admin.salesKpis.subtitle',
  subtitleDefault = 'Sales, listings, inventory & fulfilment — across all warehouses.',
}: {
  buckets?: SalesBucket[];
  titleKey?: string;
  titleDefault?: string;
  subtitleKey?: string;
  subtitleDefault?: string;
} = {}): ReactNode {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState<SalesKpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const today = todayISO();
  // undefined = default (BE anchors on today IST); a date = explicit pick.
  const [sendAsOf, setSendAsOf] = useState<string | undefined>(undefined);
  const [displayAsOf, setDisplayAsOf] = useState(today);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getSalesKpis(sendAsOf)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setDisplayAsOf(d.asOf);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sendAsOf, tick]);

  const onRefresh = (): void => {
    if (refreshing) {
      toast.show(
        t('admin.salesKpis.refreshInProgress', {
          defaultValue: 'Please wait — your data is still refreshing.',
        }),
        'info',
      );
      return;
    }
    setRefreshing(true);
    toast.show(
      t('admin.salesKpis.refreshStarted', {
        defaultValue: 'Refreshing your data — generating a fresh report can take 2–3 minutes…',
      }),
      'info',
    );
    // Scope the refresh to just this page's buckets — no need to pull every report.
    refreshSalesKpis(sendAsOf, buckets)
      .then((d) => {
        setData(d);
        setDisplayAsOf(d.asOf);
        setFailed(false);
        toast.show(
          d.stale
            ? t('admin.salesKpis.refreshedStale', {
                defaultValue: 'Couldn’t fetch new data from EasyEcom — showing the latest available.',
              })
            : t('admin.salesKpis.refreshed', { defaultValue: 'Sales data refreshed.' }),
          d.stale ? 'info' : 'success',
        );
      })
      .catch((err: unknown) => {
        const res = (err as { response?: { status?: number; data?: { message?: string } } }).response;
        if (res?.status === 429) {
          // Cooldown (non-admin refreshed too soon) — data is still valid, not a failure.
          toast.show(
            res.data?.message ??
              t('admin.salesKpis.refreshCooldown', {
                defaultValue: 'Refreshed recently — please try again soon.',
              }),
            'info',
          );
          return;
        }
        setFailed(true);
        toast.show(t('admin.salesKpis.refreshFailed', { defaultValue: 'Refresh failed. Please try again.' }), 'error');
      })
      .finally(() => setRefreshing(false));
  };

  const live = data?.isLive ?? false;
  const stale = data?.stale ?? false;
  const synced = relativeTime(data?.lastSyncedAt);
  // Headline column label: "Today" only when the resolved as-of IS today;
  // otherwise the actual picked date, so a back-dated view doesn't read "Today".
  const headlineLabel =
    (data?.asOf ?? displayAsOf) === today
      ? t('admin.salesKpis.today', { defaultValue: 'Today' })
      : dayLabel(data?.asOf ?? displayAsOf);

  return (
    <div style={{ minHeight: '100%', background: '#f6f7f9', fontFamily: SANS }} className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 style={{ fontFamily: DISPLAY }} className="text-2xl font-semibold text-neutral-900">
              {t(titleKey, { defaultValue: titleDefault })}
            </h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              {t(subtitleKey, { defaultValue: subtitleDefault })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker
              value={displayAsOf}
              onChange={(d) => {
                setSendAsOf(d);
                setDisplayAsOf(d);
              }}
              maxDate={today}
              label={t('admin.salesKpis.asOf', { defaultValue: 'As of' })}
            />
            <button
              type="button"
              onClick={onRefresh}
              aria-busy={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              {refreshing
                ? t('admin.salesKpis.syncing', { defaultValue: 'Syncing…' })
                : t('admin.salesKpis.refresh', { defaultValue: 'Refresh' })}
            </button>
          </div>
        </div>

        {/* Status line */}
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              loading ? 'animate-pulse bg-amber-400' : live && !stale ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
          />
          <span className={!loading && stale ? 'font-medium text-amber-600' : 'text-neutral-500'}>
            {loading
              ? t('admin.salesKpis.loading', { defaultValue: 'Loading…' })
              : stale
                ? t('admin.salesKpis.stale', {
                    defaultValue: 'Showing older data — couldn’t fetch the latest from EasyEcom.',
                  })
                : live
                  ? t('admin.salesKpis.liveSynced', {
                      defaultValue: 'Live · synced {{when}}',
                      when: synced ?? '—',
                    })
                  : t('admin.salesKpis.notConnected', {
                      defaultValue: 'Sales not connected — showing what we have',
                    })}
          </span>
        </div>

        {/* Body */}
        {failed && !data ? (
          <div style={CARD_SHELL} className="text-center text-sm text-amber-800">
            {t('admin.salesKpis.failed', { defaultValue: 'Could not load sales metrics.' })}{' '}
            <button className="font-medium underline" onClick={() => setTick((x) => x + 1)}>
              {t('admin.salesKpis.retry', { defaultValue: 'Retry' })}
            </button>
          </div>
        ) : (loading && !data) || refreshing ? (
          // Skeleton while first-loading OR while a manual Refresh is in flight.
          // A manual refresh generates a FRESH EasyEcom report, which takes a few
          // minutes — so show an explicit "please wait" banner above the skeleton
          // rather than leaving the user staring at bare placeholders.
          <>
            {refreshing && <FetchingBanner t={t} />}
            <SkeletonGrid />
          </>
        ) : data ? (
          <>
            <div className="flex flex-col gap-7">
              {data.buckets
                .filter((bucket) => !buckets || buckets.includes(bucket.key))
                .map((bucket) => {
                const cards = data.metrics.filter((m) => m.bucket === bucket.key && m.available);
                if (!cards.length) return null;
                return (
                  <section key={bucket.key}>
                    <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
                      {bucket.label}
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-[18px]">
                      {cards.map((m) => (
                        <SalesCard
                          key={m.key}
                          metric={m}
                          accent={BUCKET_ACCENT[bucket.key]}
                          headlineLabel={headlineLabel}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            <UnavailableNote
              metrics={data.metrics.filter((m) => !buckets || buckets.includes(m.bucket))}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Compact card for `snapshot` metrics (Total Design Live, Closing Inventory):
 *  a single current value — no Today/Yesterday/7d/Month breakdown or trend. */
function SnapshotCard({ metric, accent }: { metric: SalesMetric; accent: string }): ReactNode {
  const { t } = useTranslation();
  const current = metric.today ?? metric.last7Days ?? metric.last30Days;
  return (
    <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column' }}>
      <div className="mb-3.5 flex min-w-0 items-center gap-2.5">
        <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 2, background: accent }} />
        <span className="truncate text-xs font-bold uppercase leading-tight tracking-wider text-neutral-500">
          {metric.label}
        </span>
      </div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 34,
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: current == null ? '#c0c4cc' : '#11151f',
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {formatValue(current, metric.format)}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-neutral-400">
        {t('admin.salesKpis.currentTotal', { defaultValue: 'Current total' })}
      </div>
    </div>
  );
}

function SalesCard({
  metric,
  accent,
  headlineLabel,
}: {
  metric: SalesMetric;
  accent: string;
  headlineLabel: string;
}): ReactNode {
  const { t } = useTranslation();
  if (metric.kind === 'snapshot') return <SnapshotCard metric={metric} accent={accent} />;
  const naAll =
    metric.today == null &&
    metric.yesterday == null &&
    metric.last7Days == null &&
    metric.last30Days == null;
  const showSpark = !naAll && metric.spark.some((v) => v !== 0);
  const muted = naAll || metric.today == null;
  const up = metric.trendPct >= 0;

  return (
    <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column' }}>
      {/* Header: accent + label, trend chip */}
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 2, background: accent }} />
          <span className="truncate text-xs font-bold uppercase leading-tight tracking-wider text-neutral-500">
            {metric.label}
          </span>
        </div>
        <span
          className="inline-flex flex-none items-center gap-1 rounded-md px-2 py-1 text-xs font-bold"
          style={{
            background: muted ? '#f3f4f6' : up ? 'rgba(15,122,82,0.10)' : 'rgba(196,50,42,0.10)',
            color: muted ? '#9ca3af' : up ? '#0f7a52' : '#c4322a',
          }}
        >
          {muted ? '–' : up ? '▲' : '▼'} {muted ? '—' : `${Math.abs(metric.trendPct).toFixed(1)}%`}
        </span>
      </div>

      {/* Headline: Today */}
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: metric.today == null ? '#c0c4cc' : '#11151f',
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {formatValue(metric.today, metric.format)}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-neutral-400">{headlineLabel}</div>

      {/* Sparkline */}
      {showSpark && (
        <Sparkline
          data={metric.spark}
          dates={metric.sparkDates}
          accent={accent}
          formatValue={(n) => formatValue(n, metric.format)}
        />
      )}

      <div style={{ height: 1, background: '#eef0f3', margin: '13px 0 12px' }} />

      {/* Footer: Yesterday / Last 7 days / Last 30 days */}
      <div className="grid grid-cols-3 gap-2">
        <FooterCell
          label={t('admin.salesKpis.yesterday', { defaultValue: 'Yesterday' })}
          value={formatValue(metric.yesterday, metric.format)}
        />
        <FooterCell
          label={t('admin.salesKpis.last7Days', { defaultValue: 'Last 7 days' })}
          value={formatValue(metric.last7Days, metric.format)}
        />
        <FooterCell
          label={t('admin.salesKpis.last30Days', { defaultValue: 'Last 30 days' })}
          value={formatValue(metric.last30Days, metric.format)}
        />
      </div>
    </div>
  );
}

function FooterCell({ label, value }: { label: string; value: string }): ReactNode {
  const na = value === 'N/A';
  return (
    <div className="min-w-0">
      <div
        style={{ fontFamily: DISPLAY, fontFeatureSettings: "'tnum' 1" }}
        className={`truncate text-[13.5px] font-semibold ${na ? 'text-neutral-300' : 'text-neutral-800'}`}
        title={value}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{label}</div>
    </div>
  );
}

/** Small footnote listing metrics we don't have a data source for yet. */
function UnavailableNote({ metrics }: { metrics: SalesMetric[] }): ReactNode {
  const { t } = useTranslation();
  const missing = metrics.filter((m) => !m.available);
  if (!missing.length) return null;
  return (
    <div className="mt-7 border-t border-neutral-200 pt-3 text-xs text-neutral-400">
      <span className="font-semibold text-neutral-500">
        {t('admin.salesKpis.notYetAvailable', { defaultValue: 'Not yet available' })}
      </span>{' '}
      <span className="text-neutral-300">
        {t('admin.salesKpis.pendingAccess', { defaultValue: '(pending EasyEcom report access):' })}
      </span>{' '}
      {missing.map((m) => m.label).join(' · ')}
    </div>
  );
}

/** Shown above the skeleton during a manual refresh: a fresh EasyEcom report
 *  takes a few minutes to generate, so tell the user to hang on. */
function FetchingBanner({ t }: { t: ReturnType<typeof useTranslation>['t'] }): ReactNode {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <RefreshCw size={16} className="shrink-0 animate-spin" />
      <span>
        {t('admin.salesKpis.fetchingReport', {
          defaultValue:
            'Fetching your latest report from EasyEcom — this can take 2–3 minutes. Please keep this page open.',
        })}
      </span>
    </div>
  );
}

function SkeletonGrid(): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-[18px]">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column' }}>
          <Skeleton className="h-3 w-28 rounded-md" />
          <Skeleton className="mt-4 h-8 w-24 rounded-md" />
          <Skeleton className="mt-2 h-3 w-12 rounded-md" />
          <Skeleton className="mt-4 h-[30px] w-full rounded-md" />
          <div style={{ height: 1, background: '#eef0f3', margin: '13px 0 12px' }} />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((j) => (
              <div key={j}>
                <Skeleton className="h-4 w-12 rounded-md" />
                <Skeleton className="mt-1.5 h-2.5 w-14 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
