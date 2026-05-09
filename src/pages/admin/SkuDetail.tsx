import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getSkuDetail } from '@/api/locator';
import { FeatureUnavailableError } from '@/api/_errors';
import type { SkuDetailResponse } from '@/api/types';

interface StatTileProps {
  label: string;
  value: number;
  small?: boolean;
}

function StatTile({ label, value, small }: StatTileProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
        <div className={small ? 'text-xl font-semibold' : 'text-3xl font-semibold'}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function SkuDetail() {
  const { t } = useTranslation();
  const { sku = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<SkuDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSkuDetail(sku)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof FeatureUnavailableError) {
          toast.show(t('common.featureUnavailable'), 'info');
        } else {
          toast.show(t('common.error'), 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--color-muted)]" />
        <div className="h-24 animate-pulse rounded bg-[var(--color-muted)]" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-sm text-[var(--color-muted-foreground)]">
        {t('admin.locator.emptyResults')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <h1 className="text-lg font-semibold font-mono">{data.sku}</h1>
        <span className="text-[var(--color-muted-foreground)] text-sm">
          {data.baseCode} · {data.sizeLabel}
        </span>
        {data.originVendor && (
          <Badge
            variant={data.originVendor.code === 'NOWI' ? 'default' : 'secondary'}
          >
            {data.originVendor.code}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatTile label={t('admin.skuDetail.totals.inbound')} value={data.totals.inbound} />
        <StatTile label={t('admin.skuDetail.totals.stitching')} value={data.totals.stitching} />
        <StatTile label={t('admin.skuDetail.totals.finishing')} value={data.totals.finishing} />
        <StatTile
          label={t('admin.skuDetail.totals.dispatched')}
          value={data.totals.dispatched}
        />
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatTile
          label={t('admin.skuDetail.totals.scrapped')}
          value={data.totals.scrapped}
          small
        />
        <StatTile
          label={t('admin.skuDetail.totals.reworking')}
          value={data.totals.reworking}
          small
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.skuDetail.lots')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="text-left text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-3 py-2">{t('admin.skuDetail.lotNo')}</th>
                  <th className="px-3 py-2">{t('admin.locator.filters.vendor')}</th>
                  <th className="px-3 py-2">{t('admin.skuDetail.order')}</th>
                  <th className="px-3 py-2">{t('admin.skuDetail.orderStatus')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.skuDetail.qtyIn')}</th>
                  <th className="px-3 py-2 text-right">
                    {t('admin.skuDetail.stitchingAvail')}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {t('admin.skuDetail.finishingAvail')}
                  </th>
                  <th className="px-3 py-2 text-right">{t('admin.skuDetail.scrapped')}</th>
                  <th className="px-3 py-2 text-right">{t('admin.skuDetail.openRework')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lots.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-4 text-center text-[var(--color-muted-foreground)]"
                    >
                      {t('admin.locator.emptyResults')}
                    </td>
                  </tr>
                )}
                {data.lots.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer"
                    onClick={() => navigate(`/admin/lots/${l.id}`)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{l.lotNo}</td>
                    <td className="px-3 py-2">{l.vendor?.name ?? '—'}</td>
                    <td className="px-3 py-2">{l.order?.orderNo ?? '—'}</td>
                    <td className="px-3 py-2">
                      {l.order?.status ? (
                        <Badge variant="outline">{l.order.status}</Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{l.qtyIn}</td>
                    <td className="px-3 py-2 text-right">{l.stitchingAvail}</td>
                    <td className="px-3 py-2 text-right">{l.finishingAvail}</td>
                    <td className="px-3 py-2 text-right">{l.scrapped}</td>
                    <td className="px-3 py-2 text-right">{l.openRework}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.skuDetail.recentReceipts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentReceipts.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('admin.locator.emptyResults')}
            </p>
          ) : (
            <ul className="text-sm divide-y divide-[var(--color-border)]">
              {data.recentReceipts.slice(0, 20).map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                  <span className="text-[var(--color-muted-foreground)] tabular-nums">
                    {new Date(r.at).toLocaleString()}
                  </span>
                  <span>{r.stage}</span>
                  <span className="font-medium">{r.qty}</span>
                  <Badge
                    variant={
                      r.kind === 'rework'
                        ? 'warning'
                        : r.kind === 'scrap'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {r.kind}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div>
        <Link
          to="/admin/locator"
          className="text-sm text-[var(--color-primary)] underline"
        >
          {t('common.back')}
        </Link>
      </div>
    </div>
  );
}
