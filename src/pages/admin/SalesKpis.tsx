import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight, HeartPulse, Info, Upload } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { FilterRail, FilterRailDivider, FilterRailSegments } from '@/components/ui/filter-rail';
import { useToast } from '@/components/ui/toast';
import { todayISO } from '@/lib/date';
import { CARD_SHELL, DISPLAY, SANS, Sparkline } from '@/components/admin/kpiPrimitives';
import { useAuth } from '@/context/auth';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { HoverThumbnail } from '@/components/dashboard/StylesInFlightTable';
import { UrgencyPill } from '@/pages/admin/InventoryHealth';
import { hasAnyRole } from '@/lib/userRoles';
import {
  getCancellations,
  getFulfilmentActivity,
  getSalesKpis,
  getTopItems,
  uploadSalesCsv,
  type CancellationSection as CancellationData,
  type SalesChannel,
  type SalesInventoryView,
  type SalesBucket,
  type SalesFormat,
  type SalesKpisResponse,
  type SalesMetric,
  type TopItems,
  type TopStyle,
} from '@/api/salesKpis';

// Recharts ships only with the Fulfilment page.
const CancellationSection = lazy(() => import('@/components/admin/CancellationSection'));

const CHANNELS: SalesChannel[] = ['all', 'myntra', 'shopify', 'wishlink', 'flipkart'];

/** Per-bucket accent — cards in a bucket share a colour so groups read at a glance. */
const BUCKET_ACCENT: Record<SalesBucket, string> = {
  sales: '#3b5bdb',
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

/** "3 Sept" for one day, "17 Aug – 15 Sept" for a range. */
function rangeLabel(from: string, to: string): string {
  return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
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

/** Absolute clock label for the last sync, e.g. "3 Jul, 3:39 AM". Anchors exactly
 *  "as of when" the data is (relativeTime alone gets vague past ~a day). Users are
 *  in India, so this must read in IST no matter the viewer's browser timezone. */
function absTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Pin to IST so a viewer whose browser is on another timezone still reads the
  // Indian clock. Date part mirrors dayLabel()'s en-GB "03 Jul"; en-US time gives
  // the "3:39 AM" (uppercase meridiem) form.
  const date = d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}, ${time}`;
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
  const { user } = useAuth();
  const canUpload = hasAnyRole(user, ['admin']); // the upload endpoint is admin-only; viewers share this page
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Cancellations before dispatch: totals, whose fault, and why.
  const [cancellations, setCancellations] = useState<CancellationData | null>(null);
  const [cancellationsFailed, setCancellationsFailed] = useState(false);
  const today = todayISO();
  // One range drives every section on the page; empty until the first load adopts the server's default (the last day with data).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Real / virtual view — by the warehouse that shipped each line.
  const [inventory, setInventory] = useState<SalesInventoryView>('all');
  const [channel, setChannel] = useState<SalesChannel>('all');
  // Fulfilment only: count by the day the order was placed, or by the day each thing happened.
  const [view, setView] = useState<'orders' | 'activity'>('orders');
  const [tick, setTick] = useState(0);

  // Which query the screen is currently showing. The load effect bumps it on every
  // as-of / view change and compares before writing, so a slow request issued
  // under the previous view can't paint over the new one (the epoch guard
  // Production.tsx uses for the same hazard).
  const queryRef = useRef(0);

  // Only the Fulfilment page shows the breakdown.
  const showsFulfilment = !buckets || buckets.includes('fulfilment');
  const byActivity = showsFulfilment && view === 'activity';

  useEffect(() => {
    const my = ++queryRef.current;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    if (byActivity) {
      setCancellations(null);
      setCancellationsFailed(false);
    }
    Promise.all([getSalesKpis(from, to, inventory, channel), byActivity ? getFulfilmentActivity(from, to, inventory, channel) : null])
      .then(([kpis, activity]) => {
        if (cancelled || queryRef.current !== my) return;
        // The activity view swaps in its own Fulfilment cards; RTO and RTV are dated by event already, so they stay.
        const returns = kpis.metrics.filter((m) => m.key === 'rto' || m.key === 'rtv');
        const d = activity
          ? { ...kpis, metrics: [...kpis.metrics.filter((m) => m.bucket !== 'fulfilment'), ...activity.metrics, ...returns] }
          : kpis;
        setData(d);
        if (activity) setCancellations(activity.cancellations);
        if (!from) {
          setFrom(d.from);
          setTo(d.to);
        }
      })
      .catch(() => {
        if (cancelled || queryRef.current !== my) return;
        setData(null);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled && queryRef.current === my) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, inventory, channel, tick, byActivity]);

  useEffect(() => {
    // The activity view brings its own breakdown with its cards.
    if (!showsFulfilment || byActivity || !from) return;
    let cancelled = false;
    // Hide the previous view's breakdown until this one arrives, so it never sits under the wrong cards.
    setCancellations(null);
    setCancellationsFailed(false);
    getCancellations(from, to, inventory, channel)
      .then((c) => {
        if (!cancelled) setCancellations(c);
      })
      .catch(() => {
        if (!cancelled) setCancellationsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showsFulfilment, byActivity, from, to, inventory, channel, tick]);

  /** Sends the picked CSV; the dashboard is rebuilt before the upload returns. */
  const onUpload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const res = await uploadSalesCsv(await file.text());
      setTick((x) => x + 1);
      toast.show(
        t('admin.salesKpis.uploaded', {
          defaultValue: '{{count, number}} order lines imported, {{from}} to {{to}}.',
          count: res.linesImported,
          from: dayLabel(res.fromDay),
          to: dayLabel(res.toDay),
        }),
        'success',
      );
      if (res.linesKeptNewer > 0) {
        toast.show(
          t('admin.salesKpis.uploadKeptNewer', {
            defaultValue:
              '{{count, number}} lines already had a newer status from an earlier report and were left as they were.',
            count: res.linesKeptNewer,
          }),
          'info',
        );
      }
      if (res.rowsSkipped > 0) {
        toast.show(
          t('admin.salesKpis.uploadSkipped', {
            defaultValue: '{{count, number}} rows were skipped — no order line id or order date.',
            count: res.rowsSkipped,
          }),
          'info',
        );
      }
      if (res.unmappedLines > 0) {
        toast.show(
          t('admin.salesKpis.uploadUnmapped', {
            defaultValue:
              "{{count, number}} lines aren't mapped to Real or Virtual (warehouse {{codes}}) — they only count under All.",
            count: res.unmappedLines,
            codes: res.unmappedWarehouses.join(', '),
          }),
          'info',
        );
      }
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { message?: string } } }).response;
      toast.show(
        res?.data?.message ??
          t('admin.salesKpis.uploadFailed', { defaultValue: 'Could not import that file.' }),
        'error',
      );
    } finally {
      setUploading(false);
      // Lets the same file be picked again after a failure.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const live = data?.isLive ?? false;
  const stale = data?.stale ?? false;
  // How far the data reaches, not when the file was uploaded.
  const through = data?.dataThrough ? dayLabel(data.dataThrough) : null;
  const syncedRel = relativeTime(data?.lastSyncedAt);
  const syncedAbs = absTime(data?.lastSyncedAt);
  const synced = syncedAbs
    ? syncedRel
      ? `${syncedAbs} · ${syncedRel}`
      : syncedAbs
    : syncedRel;
  // The range actually measured — "All time" starts at the first day with data.
  const headlineLabel = data ? rangeLabel(data.from, data.to) : '';

  return (
    <div style={{ minHeight: '100%', background: '#f6f7f9', fontFamily: SANS }} className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header — the two tiers Inventory Health uses: title + Refresh above,
            the filter rail beneath, so both EasyEcom pages read the same way. */}
        <div className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 style={{ fontFamily: DISPLAY }} className="text-2xl font-semibold text-neutral-900">
                {t(titleKey, { defaultValue: titleDefault })}
              </h1>
              <p className="mt-0.5 text-sm text-neutral-500">
                {t(subtitleKey, { defaultValue: subtitleDefault })}
              </p>
            </div>
            {canUpload && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-busy={uploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
                >
                  <Upload size={15} className={uploading ? 'animate-pulse' : ''} />
                  {uploading
                    ? t('admin.salesKpis.uploading', { defaultValue: 'Importing…' })
                    : t('admin.salesKpis.upload', { defaultValue: 'Upload report' })}
                </button>
              </div>
            )}
          </div>

          {/* Same rail, same control, same labels as Inventory Health — the keys
              are ITS keys on purpose, so the two pages can never word the same
              filter differently. */}
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <FilterRail>
              <FilterRailSegments
                value={inventory}
                onChange={setInventory}
                ariaLabel={t('admin.salesKpis.inv.group', { defaultValue: 'Stock type' })}
                options={(['all', 'real', 'virtual'] as const).map((v) => ({
                  value: v,
                  label: t(`admin.inventoryHealth.inv.${v}`, {
                    defaultValue: v === 'all' ? 'All stock' : v === 'real' ? 'Real' : 'Virtual',
                  }),
                }))}
              />
              <FilterRailDivider />
              {from && (
                <DateRangePicker
                  from={from}
                  to={to}
                  maxDate={today}
                  label={t('dashboard.dateFilter.label', { defaultValue: 'Showing' })}
                  onApply={(f, t2) => {
                    setFrom(f);
                    setTo(t2);
                  }}
                />
              )}
            </FilterRail>
            <FilterRail>
              <FilterRailSegments
                value={channel}
                onChange={setChannel}
                ariaLabel={t('admin.salesKpis.channel.group', { defaultValue: 'Channel' })}
                options={CHANNELS.map((c) => ({
                  value: c,
                  label: t(`admin.salesKpis.channel.${c}`, {
                    defaultValue: c === 'all' ? 'All channels' : c[0].toUpperCase() + c.slice(1),
                  }),
                }))}
              />
            </FilterRail>
          </div>
          {showsFulfilment && (
            <div className="mt-3 flex justify-center">
              <FilterRail>
                <FilterRailSegments
                  value={view}
                  onChange={setView}
                  ariaLabel={t('admin.salesKpis.view.group', { defaultValue: 'Count by' })}
                  options={[
                    { value: 'orders' as const, label: t('admin.salesKpis.view.orders', { defaultValue: 'By order date' }) },
                    { value: 'activity' as const, label: t('admin.salesKpis.view.activity', { defaultValue: "By day's activity" }) },
                  ]}
                />
              </FilterRail>
            </div>
          )}
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
              : !through
                ? t('admin.salesKpis.noData', {
                    defaultValue: 'No sales data yet — upload a seller orders report to begin.',
                  })
                : stale
                  ? t('admin.salesKpis.staleUpload', {
                      defaultValue: 'Data through {{through}} — upload a newer report.',
                      through,
                    })
                  : t('admin.salesKpis.dataThrough', {
                      defaultValue: 'Data through {{through}} · imported {{when}}',
                      through,
                      when: synced ?? '—',
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
        ) : loading && !data ? (
          // First load only — bare placeholders while we have nothing to show.
          <SkeletonGrid />
        ) : data ? (
          <>
            {/* Old numbers never sit under a new filter. */}
            {loading ? (
              <SkeletonGrid />
            ) : (
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
            )}
            {from && (!buckets || buckets.includes('sales')) && (
              <TopItemsTable from={from} to={to} inventory={inventory} channel={channel} tick={tick} />
            )}
            {showsFulfilment && !cancellations && !cancellationsFailed && (
              <div style={CARD_SHELL} className="mt-7">
                <Skeleton className="h-40 w-full rounded-md" />
              </div>
            )}
            {/* An older API sends no slices; skip the section rather than crash the page. */}
            {showsFulfilment && cancellations?.slices && (
              <Suspense fallback={null}>
                <CancellationSection data={cancellations} range={rangeLabel(cancellations.from, cancellations.to)} />
              </Suspense>
            )}
            {showsFulfilment && cancellationsFailed && (
              <div style={CARD_SHELL} className="mt-7 text-center text-sm text-amber-800">
                {t('admin.salesKpis.cancellationsFailed', {
                  defaultValue: 'Could not load the cancellation breakdown.',
                })}{' '}
                <button className="font-medium underline" onClick={() => setTick((x) => x + 1)}>
                  {t('admin.salesKpis.retry', { defaultValue: 'Retry' })}
                </button>
              </div>
            )}
            <UnavailableNote
              metrics={data.metrics.filter((m) => !buckets || buckets.includes(m.bucket))}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** ⓘ next to a card label — styled hover/focus tooltip of the metric's meaning. */
function InfoDot({ text }: { text?: string }): ReactNode {
  if (!text) return null;
  return (
    <span
      tabIndex={0}
      aria-label={text}
      className="group relative flex-none cursor-default text-neutral-300 hover:text-neutral-500 focus:outline-none"
    >
      <Info size={13} />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[15rem] -translate-x-1/2 rounded-md bg-[#11151f] px-2.5 py-1.5 text-left text-[11px] font-medium normal-case leading-snug tracking-normal text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** Compact card for `snapshot` metrics (Total Design Live, Closing Inventory):
 *  a single current value — no Today/Yesterday/7d/Month breakdown or trend. */
function SnapshotCard({ metric, accent }: { metric: SalesMetric; accent: string }): ReactNode {
  const { t } = useTranslation();
  const current = metric.value;
  return (
    <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column' }}>
      <div className="mb-3.5 flex min-w-0 items-center gap-2.5">
        <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 2, background: accent }} />
        <span className="truncate text-xs font-bold uppercase leading-tight tracking-wider text-neutral-500">
          {metric.label}
        </span>
        <InfoDot text={metric.description} />
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
  const showSpark = metric.spark.some((v) => v !== 0);
  const trend = metric.trendPct;
  const muted = metric.value == null || trend == null;
  const up = (trend ?? 0) >= 0;

  return (
    <div style={{ ...CARD_SHELL, display: 'flex', flexDirection: 'column' }}>
      {/* Header: accent + label, trend chip */}
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span style={{ flex: 'none', width: 7, height: 7, borderRadius: 2, background: accent }} />
          <span className="truncate text-xs font-bold uppercase leading-tight tracking-wider text-neutral-500">
            {metric.label}
          </span>
          <InfoDot text={metric.description} />
        </div>
        <span
          className="inline-flex flex-none items-center gap-1 rounded-md px-2 py-1 text-xs font-bold"
          style={{
            background: muted ? '#f3f4f6' : up ? 'rgba(15,122,82,0.10)' : 'rgba(196,50,42,0.10)',
            color: muted ? '#9ca3af' : up ? '#0f7a52' : '#c4322a',
          }}
        >
          {muted ? '–' : up ? '▲' : '▼'} {muted ? '—' : `${Math.abs(trend ?? 0).toFixed(1)}%`}
        </span>
      </div>

      {/* Headline: the picked range */}
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: metric.value == null ? '#c0c4cc' : '#11151f',
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {formatValue(metric.value, metric.format)}
      </div>
      <div className="mt-1.5 text-xs font-semibold text-neutral-400">
        {metric.fromDay ? rangeLabel(metric.fromDay, metric.toDay ?? metric.fromDay) : headlineLabel}
      </div>
      {metric.breakdown?.length ? (
        <div className="mt-1 text-xs font-semibold tabular-nums text-neutral-600">
          {metric.breakdown.map((p) => `${p.label} ${p.value.toLocaleString('en-IN')}`).join(' · ')}
        </div>
      ) : null}
      {metric.sharePct != null && metric.shareOf && (
        <div className="mt-1 text-xs font-semibold tabular-nums text-neutral-600">
          {t('admin.salesKpis.shareOf', {
            defaultValue: '{{pct}}% of {{base}}',
            pct: metric.sharePct,
            base: metric.shareOf,
          })}
        </div>
      )}

      {/* Sparkline */}
      {showSpark && (
        <Sparkline
          data={metric.spark}
          dates={metric.sparkDates}
          accent={accent}
          formatValue={(n) => formatValue(n, metric.format)}
        />
      )}

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

/** Top 10 designs by revenue over the page's range, colours grouped under each. */
function TopItemsTable({
  from,
  to,
  inventory,
  channel,
  tick,
}: {
  from: string;
  to: string;
  inventory: SalesInventoryView;
  channel: SalesChannel;
  tick: number;
}): ReactNode {
  const { t } = useTranslation();
  const [data, setData] = useState<TopItems | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    getTopItems(from, to, inventory, channel)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, inventory, channel, tick]);

  const signed = useSignedUrls((data?.items ?? []).flatMap((it) => it.styles.map((s) => s.imageUrl)));
  const img = (path: string | null): string | null => (path && signed[path]) || null;
  return (
    <section className="mt-7">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {t('admin.salesKpis.topItems', { defaultValue: 'Top 10 selling styles' })}
      </h2>
      {failed ? (
        <p style={CARD_SHELL} className="text-center text-sm text-amber-800">
          {t('admin.salesKpis.topItemsFailed', { defaultValue: 'Could not load the top items.' })}
        </p>
      ) : !data ? (
        <div style={CARD_SHELL}>
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      ) : !data.items.length ? (
        <p style={CARD_SHELL} className="text-center text-sm text-neutral-400">
          {t('admin.salesKpis.topItemsEmpty', { defaultValue: 'No sales in this range.' })}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <div
            className={`${TOP_GRID} border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700`}
          >
            <span>{t('admin.salesKpis.col.style', { defaultValue: 'Style' })}</span>
            <span className="text-right">{t('admin.salesKpis.col.units', { defaultValue: 'Units' })}</span>
            <span className="text-right">{t('admin.salesKpis.col.revenue', { defaultValue: 'Revenue' })}</span>
          </div>
          <ol className="divide-y divide-neutral-200">
            {data.items.map((it, i) => {
              const top = it.styles[0];
              const grouped = it.styles.length > 1;
              return (
                <li key={it.key}>
                  <div className={`${TOP_GRID} px-4 py-2.5`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-5 flex-none text-sm font-semibold tabular-nums text-neutral-400">{i + 1}</span>
                      {!grouped && (
                        <HoverThumbnail src={img(top.imageUrl)} alt={it.name ?? top.styleKey} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-neutral-900">
                          {grouped ? (
                            <span className="truncate" title={it.name ?? top.styleKey}>
                              {it.name ?? top.styleKey}
                            </span>
                          ) : (
                            <StyleTitle style={top} label={it.name ?? top.styleKey} />
                          )}
                        </div>
                        <div className="truncate text-xs text-neutral-500">
                          {grouped ? (
                            t('admin.salesKpis.coloursCount', {
                              defaultValue: '{{count, number}} colours',
                              count: it.styles.length,
                            })
                          ) : (
                            <>
                              <span className="font-mono">{top.styleKey}</span>
                              {top.colour && ` · ${top.colour}`}
                            </>
                          )}
                        </div>
                      </div>
                      {!grouped && <TopStyleLinks style={top} />}
                    </div>
                    <span className="text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {formatValue(it.units, 'number')}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {formatValue(it.revenue, 'currency')}
                    </span>
                  </div>
                  {grouped &&
                    it.styles.map((s) => (
                      <div key={s.styleKey} className={`${TOP_GRID} border-t border-neutral-100 px-4 py-2`}>
                        <div className="flex min-w-0 items-center gap-3 pl-8">
                          <HoverThumbnail src={img(s.imageUrl)} alt={s.colour ?? s.styleKey} />
                          <div className="flex min-w-0 flex-1 items-baseline gap-2">
                            <span className="flex flex-none items-center gap-2 text-sm text-neutral-800">
                              <StyleTitle style={s} label={s.colour ?? s.styleKey} />
                            </span>
                            {s.colour && (
                              <span className="truncate font-mono text-[11px] text-neutral-500">{s.styleKey}</span>
                            )}
                          </div>
                          <TopStyleLinks style={s} />
                        </div>
                        <span className="text-right text-sm tabular-nums text-neutral-600">
                          {formatValue(s.units, 'number')}
                        </span>
                        <span className="text-right text-sm tabular-nums text-neutral-600">
                          {formatValue(s.revenue, 'currency')}
                        </span>
                      </div>
                    ))}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

// Style (thumb + name + links) · Units · Revenue
const TOP_GRID = 'grid grid-cols-[minmax(0,1fr)_3.5rem_6rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem]';
const TOP_BTN =
  'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition';

/** A style's name, linking to its Inventory Health row in a new tab, plus its stockout tag. */
function StyleTitle({ style, label }: { style: TopStyle; label: string }): ReactNode {
  const { t } = useTranslation();
  const health = t('admin.salesKpis.openInventoryHealth', { defaultValue: 'Inventory health' });
  return (
    <>
      {style.inInventoryHealth ? (
        <Link
          to={`/admin/analytics/inventory-health?q=${encodeURIComponent(style.styleKey)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={health}
          className="inline-flex min-w-0 items-center gap-1 text-[var(--color-primary)] hover:underline"
        >
          <span className="truncate">{label}</span>
          <HeartPulse size={12} className="flex-none text-[var(--color-primary)]" />
        </Link>
      ) : (
        <span className="truncate" title={label}>
          {label}
        </span>
      )}
      {style.stockout && <UrgencyPill urgency="healthy" stockout={style.stockout} />}
    </>
  );
}

/** A style's Myntra button. */
function TopStyleLinks({ style }: { style: TopStyle }): ReactNode {
  const { t } = useTranslation();
  const myntra = t('admin.salesKpis.openMyntra', { defaultValue: 'Myntra' });
  if (!style.myntraUrl) return null;
  return (
    <a
      href={style.myntraUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={myntra}
      className={`${TOP_BTN} flex-none border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100`}
    >
      <span className="hidden sm:inline">{myntra}</span>
      <ArrowUpRight size={12} className="text-neutral-400" />
    </a>
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
        </div>
      ))}
    </div>
  );
}
