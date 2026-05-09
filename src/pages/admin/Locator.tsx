import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useDebounced } from '@/lib/useDebounced';
import {
  listVendors,
  listStages,
  listWarehouses,
  listStatuses,
} from '@/api/filters';
import { getLocator } from '@/api/locator';
import { downloadLocatorXlsx } from '@/api/exports';
import { FeatureUnavailableError } from '@/api/_errors';
import type {
  FilterOption,
  FilterStage,
  FilterStatus,
  LocatorParams,
  LocatorResponse,
} from '@/api/types';

const PAGE_SIZE = 25;
const ORIGIN_CODES = ['NOWI', 'KOTTY'] as const;

type OriginFilter = 'ALL' | (typeof ORIGIN_CODES)[number];

function paramsFromUrl(sp: URLSearchParams): LocatorParams & { origin: OriginFilter } {
  const get = (k: string) => sp.get(k) ?? undefined;
  const skip = Number(sp.get('skip') ?? 0) || 0;
  return {
    vendorId: get('vendorId'),
    stageId: get('stageId'),
    warehouseId: get('warehouseId'),
    status: get('status'),
    sku: get('sku'),
    from: get('from'),
    to: get('to'),
    skip,
    take: PAGE_SIZE,
    origin: (get('origin') as OriginFilter | undefined) ?? 'ALL',
  };
}

function originBadgeVariant(code: string): 'default' | 'secondary' | 'outline' {
  if (code === 'NOWI') return 'default';
  if (code === 'KOTTY') return 'secondary';
  return 'outline';
}

export default function Locator() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [vendors, setVendors] = useState<FilterOption[]>([]);
  const [stages, setStages] = useState<FilterStage[]>([]);
  const [warehouses, setWarehouses] = useState<FilterOption[]>([]);
  const [statuses, setStatuses] = useState<FilterStatus[]>([]);

  const current = useMemo(() => paramsFromUrl(searchParams), [searchParams]);
  const [skuInput, setSkuInput] = useState(current.sku ?? '');
  const debouncedSku = useDebounced(skuInput, 250);

  const [data, setData] = useState<LocatorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load filter lists once.
  useEffect(() => {
    listVendors().then(setVendors).catch(() => undefined);
    listStages().then(setStages).catch(() => undefined);
    listWarehouses().then(setWarehouses).catch(() => undefined);
    listStatuses().then(setStatuses).catch(() => undefined);
  }, []);

  // Sync debounced SKU input back to URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debouncedSku) next.set('sku', debouncedSku);
    else next.delete('sku');
    if ((next.get('sku') ?? '') !== (searchParams.get('sku') ?? '')) {
      next.delete('skip');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSku]);

  // Fetch when URL params change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { origin: originFilter, ...rest } = current;
    const merged: LocatorParams = { ...rest };
    if (originFilter !== 'ALL') {
      const v = vendors.find((vv) => vv.code === originFilter);
      if (v) merged.originVendorId = v.id;
    }
    getLocator(merged)
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
        setData({ rows: [], page: { skip: 0, take: PAGE_SIZE, total: 0 } });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vendors]);

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const next = new URLSearchParams(searchParams);
      if (value && value.length > 0) next.set(key, value);
      else next.delete(key);
      next.delete('skip');
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const setSkip = useCallback(
    (skip: number) => {
      const next = new URLSearchParams(searchParams);
      if (skip > 0) next.set('skip', String(skip));
      else next.delete('skip');
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const { origin: originFilter, ...rest } = current;
      const merged: LocatorParams = { ...rest };
      if (originFilter !== 'ALL') {
        const v = vendors.find((vv) => vv.code === originFilter);
        if (v) merged.originVendorId = v.id;
      }
      await downloadLocatorXlsx(merged);
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        toast.show(t('common.featureUnavailable'), 'info');
      } else {
        toast.show(t('common.error'), 'error');
      }
    } finally {
      setExporting(false);
    }
  };

  const total = data?.page.total ?? 0;
  const skip = current.skip ?? 0;
  const take = current.take ?? PAGE_SIZE;
  const start = total === 0 ? 0 : skip + 1;
  const end = Math.min(skip + take, total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('admin.locator.title')}</h1>
        <Button
          variant="outline"
          onClick={() => void handleExport()}
          disabled={exporting || loading}
        >
          {t('admin.locator.exportXlsx')}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 grid gap-3 md:grid-cols-4">
          <div>
            <Label>{t('admin.locator.filters.vendor')}</Label>
            <Select
              value={current.vendorId ?? ''}
              onChange={(e) => updateParam('vendorId', e.target.value || undefined)}
            >
              <option value="">{t('admin.locator.filters.all')}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.locator.filters.stage')}</Label>
            <Select
              value={current.stageId ?? ''}
              onChange={(e) => updateParam('stageId', e.target.value || undefined)}
            >
              <option value="">{t('admin.locator.filters.all')}</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.locator.filters.warehouse')}</Label>
            <Select
              value={current.warehouseId ?? ''}
              onChange={(e) => updateParam('warehouseId', e.target.value || undefined)}
            >
              <option value="">{t('admin.locator.filters.all')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.locator.filters.status')}</Label>
            <Select
              value={current.status ?? ''}
              onChange={(e) => updateParam('status', e.target.value || undefined)}
            >
              <option value="">{t('admin.locator.filters.all')}</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.locator.filters.origin')}</Label>
            <Select
              value={current.origin}
              onChange={(e) => updateParam('origin', e.target.value)}
            >
              <option value="ALL">{t('admin.locator.filters.all')}</option>
              {ORIGIN_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label>{t('admin.locator.filters.sku')}</Label>
            <Input
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              placeholder={t('admin.locator.filters.search')}
            />
          </div>
          <div>
            <Label>{t('admin.locator.filters.dateFrom')}</Label>
            <Input
              type="date"
              value={current.from ?? ''}
              onChange={(e) => updateParam('from', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label>{t('admin.locator.filters.dateTo')}</Label>
            <Input
              type="date"
              value={current.to ?? ''}
              onChange={(e) => updateParam('to', e.target.value || undefined)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-auto max-h-[60vh] border border-[var(--color-border)] rounded-[var(--radius-md)]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left px-3 py-2">{t('admin.locator.columns.sku')}</th>
                  <th className="text-left px-3 py-2">{t('admin.locator.columns.base')}</th>
                  <th className="text-left px-3 py-2">{t('admin.locator.columns.size')}</th>
                  <th className="text-left px-3 py-2">{t('admin.locator.columns.origin')}</th>
                  <th className="text-right px-3 py-2">{t('admin.locator.columns.inbound')}</th>
                  <th className="text-right px-3 py-2">{t('admin.locator.columns.stitching')}</th>
                  <th className="text-right px-3 py-2">{t('admin.locator.columns.finishing')}</th>
                  <th className="text-right px-3 py-2">{t('admin.locator.columns.dispatched')}</th>
                  <th className="text-right px-3 py-2">{t('admin.locator.columns.lots')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`s${i}`} className="border-t border-[var(--color-border)]">
                      <td colSpan={10} className="px-3 py-2">
                        <div className="h-4 animate-pulse rounded bg-[var(--color-muted)]" />
                      </td>
                    </tr>
                  ))}
                {!loading && data && data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-6 text-center text-[var(--color-muted-foreground)]"
                    >
                      {t('admin.locator.emptyResults')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.rows.map((r) => (
                    <tr
                      key={r.sku}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer"
                      onClick={() => navigate(`/admin/locator/sku/${encodeURIComponent(r.sku)}`)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-3 py-2">{r.baseCode}</td>
                      <td className="px-3 py-2">{r.sizeLabel}</td>
                      <td className="px-3 py-2">
                        <Badge variant={originBadgeVariant(r.originVendor.code)}>
                          {r.originVendor.code}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{r.counts.inbound}</td>
                      <td className="px-3 py-2 text-right">{r.counts.stitching}</td>
                      <td className="px-3 py-2 text-right">{r.counts.finishing}</td>
                      <td className="px-3 py-2 text-right">{r.counts.dispatched}</td>
                      <td className="px-3 py-2 text-right">{r.lotsCount}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-[var(--color-primary)] text-xs">
                          {t('admin.locator.columns.open')}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 text-sm">
            <span className="text-[var(--color-muted-foreground)]">
              {t('admin.locator.totalCount', { start, end, total })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={loading || skip === 0}
                onClick={() => setSkip(Math.max(0, skip - take))}
              >
                {t('admin.locator.prev')}
              </Button>
              <Button
                variant="outline"
                disabled={loading || end >= total}
                onClick={() => setSkip(skip + take)}
              >
                {t('admin.locator.next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
