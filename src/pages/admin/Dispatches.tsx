import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import CollapsibleFilters from '@/components/CollapsibleFilters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { listDispatches } from '@/api/dispatches';
import { listWarehouses } from '@/api/filters';
import { FeatureUnavailableError } from '@/api/_errors';
import type {
  Dispatch,
  DispatchStatus,
  FilterOption,
  ListDispatchesParams,
  ListDispatchesResponse,
} from '@/api/types';

const PAGE_SIZE = 25;

const STATUS_VALUES: DispatchStatus[] = [
  'draft',
  'awaiting_confirmation',
  'synced',
  'manual_pdf',
  'awaiting_grn',
  'grn_received',
  'grn_mismatch',
  'sync_failed',
  'closed',
  'closed_with_adjustment',
];

export function statusBadgeVariant(
  s: DispatchStatus,
): 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' {
  if (s === 'closed' || s === 'closed_with_adjustment' || s === 'grn_received') {
    return 'success';
  }
  if (s === 'grn_mismatch' || s === 'sync_failed') return 'destructive';
  if (s === 'synced' || s === 'awaiting_grn' || s === 'manual_pdf') return 'default';
  return 'secondary';
}

function paramsFromUrl(sp: URLSearchParams): ListDispatchesParams {
  const get = (k: string) => sp.get(k) ?? undefined;
  const skip = Number(sp.get('skip') ?? 0) || 0;
  return {
    status: get('status'),
    destWarehouseId: get('destWarehouseId'),
    from: get('from'),
    to: get('to'),
    skip,
    take: PAGE_SIZE,
  };
}

export default function Dispatches() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [warehouses, setWarehouses] = useState<FilterOption[]>([]);
  const [data, setData] = useState<ListDispatchesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const current = useMemo(() => paramsFromUrl(searchParams), [searchParams]);

  useEffect(() => {
    listWarehouses().then(setWarehouses).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listDispatches(current)
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
  }, [searchParams]);

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

  const total = data?.page.total ?? 0;
  const skip = current.skip ?? 0;
  const take = current.take ?? PAGE_SIZE;
  const start = total === 0 ? 0 : skip + 1;
  const end = Math.min(skip + take, total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('admin.dispatches.title')}</h1>
      </div>

      <CollapsibleFilters
        activeCount={
          (current.status ? 1 : 0) +
          (current.destWarehouseId ? 1 : 0) +
          (current.from ? 1 : 0) +
          (current.to ? 1 : 0)
        }
        onClear={() => setSearchParams(new URLSearchParams())}
      >
          <div>
            <Label>{t('admin.dispatches.filters.status')}</Label>
            <Select
              value={(current.status as string | undefined) ?? ''}
              onChange={(e) => updateParam('status', e.target.value || undefined)}
            >
              <option value="">{t('admin.dispatches.filters.all')}</option>
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.dispatches.status.${s}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.dispatches.filters.warehouse')}</Label>
            <Select
              value={current.destWarehouseId ?? ''}
              onChange={(e) =>
                updateParam('destWarehouseId', e.target.value || undefined)
              }
            >
              <option value="">{t('admin.dispatches.filters.all')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('admin.dispatches.filters.dateFrom')}</Label>
            <Input
              type="date"
              value={current.from ?? ''}
              onChange={(e) => updateParam('from', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label>{t('admin.dispatches.filters.dateTo')}</Label>
            <Input
              type="date"
              value={current.to ?? ''}
              onChange={(e) => updateParam('to', e.target.value || undefined)}
            />
          </div>
      </CollapsibleFilters>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-auto max-h-[60vh] border border-[var(--color-border)] rounded-[var(--radius-md)]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left px-3 py-2">
                    {t('admin.dispatches.columns.dispatchNo')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('admin.dispatches.columns.dispatchedAt')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('admin.dispatches.columns.warehouse')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('admin.dispatches.columns.syncMode')}
                  </th>
                  <th className="text-left px-3 py-2">
                    {t('admin.dispatches.columns.status')}
                  </th>
                  <th className="text-right px-3 py-2">
                    {t('admin.dispatches.columns.items')}
                  </th>
                  <th className="text-right px-3 py-2">
                    {t('admin.dispatches.columns.totalQty')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`s${i}`} className="border-t border-[var(--color-border)]">
                      <td colSpan={7} className="px-3 py-2">
                        <div className="h-4 animate-pulse rounded bg-[var(--color-muted)]" />
                      </td>
                    </tr>
                  ))}
                {!loading && data && data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-[var(--color-muted-foreground)]"
                    >
                      {t('admin.dispatches.empty')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.rows.map((r: Dispatch) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--color-border)] hover:bg-[var(--color-muted)] cursor-pointer"
                      onClick={() => navigate(`/admin/dispatches/${r.id}`)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.dispatchNo}</td>
                      <td className="px-3 py-2">
                        {r.dispatchedAt
                          ? new Date(r.dispatchedAt).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-3 py-2">{r.destWarehouse?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        {t(`admin.dispatches.syncMode.${r.syncMode}`)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusBadgeVariant(r.status)}>
                          {t(`admin.dispatches.status.${r.status}`)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{r.itemsCount ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{r.totalQtySent ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 text-sm">
            <span className="text-[var(--color-muted-foreground)]">
              {t('admin.dispatches.totalCount', { start, end, total })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={loading || skip === 0}
                onClick={() => setSkip(Math.max(0, skip - take))}
              >
                {t('admin.dispatches.prev')}
              </Button>
              <Button
                variant="outline"
                disabled={loading || end >= total}
                onClick={() => setSkip(skip + take)}
              >
                {t('admin.dispatches.next')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
