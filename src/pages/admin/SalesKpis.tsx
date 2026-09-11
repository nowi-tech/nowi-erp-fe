import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Upload } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/DatePicker';
import { FilterRail, FilterRailDivider, FilterRailSegments } from '@/components/ui/filter-rail';
import { useToast } from '@/components/ui/toast';
import { localISO, todayISO } from '@/lib/date';
import { CARD_SHELL, DISPLAY, SANS, Sparkline } from '@/components/admin/kpiPrimitives';
import { useAuth } from '@/context/auth';
import { hasRole } from '@/lib/userRoles';
import {
  getCancellations,
  getSalesKpis,
  uploadSalesCsv,
  type CancellationBreakdown,
  type SalesInventoryView,
  type SalesBucket,
  type SalesFormat,
  type SalesKpisResponse,
  type SalesMetric,
} from '@/api/salesKpis';

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
  const canUpload = hasRole(user, 'admin'); // the upload endpoint is admin-only; viewers share this page
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Why orders were cancelled, for the card the "our fault" figure summarises.
  const [cancellations, setCancellations] = useState<CancellationBreakdown | null>(null);
  const today = todayISO();
  // Calendar yesterday (local) — so a back-dated pick of yesterday reads the
  // friendly word "Yesterday" (mirrors Production KPIs), not a raw date.
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localISO(d);
  })();
  // undefined = the BE default (last uploaded day); a date = explicit pick.
  const [sendAsOf, setSendAsOf] = useState<string | undefined>(undefined);
  const [displayAsOf, setDisplayAsOf] = useState(today);
  // Real / virtual view — by the warehouse that shipped each line.
  const [inventory, setInventory] = useState<SalesInventoryView>('all');
  const [tick, setTick] = useState(0);

  // Which query the screen is currently showing. The load effect bumps it on every
  // as-of / view change and compares before writing, so a slow request issued
  // under the previous view can't paint over the new one (the epoch guard
  // Production.tsx uses for the same hazard).
  const queryRef = useRef(0);

  useEffect(() => {
    const my = ++queryRef.current;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getSalesKpis(sendAsOf, inventory)
      .then((d) => {
        if (cancelled || queryRef.current !== my) return;
        setData(d);
        setDisplayAsOf(d.asOf);
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
  }, [sendAsOf, inventory, tick]);

  // Only the Fulfilment page shows the breakdown.
  const showsFulfilment = !buckets || buckets.includes('fulfilment');
  useEffect(() => {
    if (!showsFulfilment) return;
    let cancelled = false;
    getCancellations(sendAsOf, inventory)
      .then((c) => {
        if (!cancelled) setCancellations(c);
      })
      .catch(() => {
        if (!cancelled) setCancellations(null); // the table just doesn't render
      });
    return () => {
      cancelled = true;
    };
  }, [showsFulfilment, sendAsOf, inventory, tick]);

  // Switching into a scoped view while an older date is picked would land outside
  // the split's reach. Pull the date forward to the first day that HAS a split,
  // so the view change never leaves the page reading N/A.
  useEffect(() => {
    const floor = data?.splitFrom;
    if (inventory === 'all' || !floor || displayAsOf >= floor) return;
    setSendAsOf(floor);
    setDisplayAsOf(floor);
  }, [inventory, data?.splitFrom, displayAsOf]);

  /** Sends the picked CSV; the dashboard is rebuilt before the upload returns. */
  const onUpload = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const res = await uploadSalesCsv(await file.text());
      setSendAsOf(undefined); // back to the BE default, so the view lands on the new data
      setDisplayAsOf(res.toDay);
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
  // Headline column label: "Today" / "Yesterday" when the resolved as-of IS the
  // real today / yesterday; otherwise the actual picked date, so a back-dated
  // view reads the friendly day word when it applies and a plain date otherwise.
  const resolvedAsOf = data?.asOf ?? displayAsOf;
  const headlineLabel =
    resolvedAsOf === today
      ? t('admin.salesKpis.today', { defaultValue: 'Today' })
      : resolvedAsOf === yesterday
        ? t('admin.salesKpis.yesterday', { defaultValue: 'Yesterday' })
        : dayLabel(resolvedAsOf);

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
          <FilterRail className="mt-4">
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
            <DatePicker
              value={displayAsOf}
              onChange={(d) => {
                setSendAsOf(d);
                setDisplayAsOf(d);
              }}
              maxDate={today}
              // Sales history predates the Real/Virtual split and is whole-account
              // only, so a scoped view can't answer for those days — bar the picker
              // there rather than show a page of N/A under a false stale banner.
              minDate={inventory === 'all' ? undefined : (data?.splitFrom ?? undefined)}
              label={t('admin.salesKpis.asOf', { defaultValue: 'As of' })}
            />
          </FilterRail>
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
            {showsFulfilment && cancellations && (
              <CancellationTable t={t} data={cancellations} />
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
  const current = metric.today ?? metric.last7Days ?? metric.last30Days;
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
          <InfoDot text={metric.description} />
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

/** Why orders were cancelled, ranked, ours marked — the detail behind the "our fault" card. */
function CancellationTable({
  t,
  data,
}: {
  t: ReturnType<typeof useTranslation>['t'];
  data: CancellationBreakdown;
}): ReactNode {
  if (!data.reasons.length) return null;
  // Server totals, not a sum of rows — one order can sit under two reasons.
  const total = data.totalOrders;
  const ours = data.ourFaultOrders;
  const pctOurs = total ? Math.round((ours / total) * 100) : 0;
  return (
    <section className="mt-7">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {t('admin.salesKpis.whyCancelled', { defaultValue: 'Why orders were cancelled' })}
      </h2>
      <div style={CARD_SHELL}>
        <p className="mb-3 text-sm text-neutral-600">
          {t('admin.salesKpis.cancelSummary', {
            defaultValue:
              '{{ours}} of {{total}} cancellations ({{pct}}%) in the last 30 days were ours to prevent.',
            ours: ours.toLocaleString('en-IN'),
            total: total.toLocaleString('en-IN'),
            pct: pctOurs,
          })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {data.reasons.map((r) => (
                <tr key={r.reason} className="border-t border-neutral-100 first:border-t-0">
                  <td className="py-1.5 pr-3">
                    <span
                      className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                        r.ourFault ? 'bg-orange-500' : 'bg-neutral-300'
                      }`}
                    />
                    <span className={r.ourFault ? 'text-neutral-900' : 'text-neutral-600'}>
                      {r.reason}
                    </span>
                  </td>
                  <td className="w-20 py-1.5 text-right tabular-nums text-neutral-900">
                    {r.orders.toLocaleString('en-IN')}
                  </td>
                  <td className="w-14 py-1.5 text-right tabular-nums text-neutral-400">
                    {total ? Math.round((r.orders / total) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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
