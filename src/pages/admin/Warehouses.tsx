import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { listDestinationWarehouses } from '@/api/destinationWarehouses';
import type { DestinationWarehouse } from '@/api/types';

/** Read-only: warehouses are parties with the warehouse role, changed by BE migration only. */
export default function Warehouses() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<DestinationWarehouse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDestinationWarehouses()
      .then(setRows)
      .catch(() => toast.show(t('common.error'), 'error'))
      .finally(() => setLoading(false));
  }, [t, toast]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {t('admin.warehouses.title', { defaultValue: 'Destination warehouses' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && rows.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              {t('admin.warehouses.empty', {
                defaultValue: 'No destination warehouses yet.',
              })}
            </p>
          ) : (
            <div className="overflow-auto border border-[var(--color-border)] rounded-[var(--radius-md)]">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.code', { defaultValue: 'Code' })}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.name', { defaultValue: 'Name' })}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.easyecom', { defaultValue: 'EasyEcom' })}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t('admin.warehouses.status', { defaultValue: 'Status' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                      <td className="px-3 py-2">
                        <div>{r.name}</div>
                        {r.address && (
                          <div className="text-xs text-[var(--color-muted-foreground)]">{r.address}</div>
                        )}
                        {(r.spocName || r.spocPhone) && (
                          <div className="text-xs text-[var(--color-muted-foreground)]">
                            {[r.spocName, r.spocPhone].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.easyecomEnabled ? (
                          <Badge variant="success" dot>
                            {r.easyecomWarehouseId
                              ? r.easyecomWarehouseId
                              : t('admin.warehouses.enabled', {
                                  defaultValue: 'Enabled',
                                })}
                          </Badge>
                        ) : (
                          !r.easyecomAutoGrn && (
                            <span className="text-[var(--color-muted-foreground)]">
                              —
                            </span>
                          )
                        )}
                        {r.easyecomAutoGrn && (
                          <Badge variant="success" dot>
                            {t('admin.warehouses.autoGrn', { defaultValue: 'Auto GRN' })}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.isActive ? (
                          <Badge variant="success" dot>
                            {t('admin.warehouses.active', { defaultValue: 'Active' })}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            {t('admin.warehouses.inactive', {
                              defaultValue: 'Inactive',
                            })}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
