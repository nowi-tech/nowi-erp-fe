import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listLots } from '@/api/lots';
import type { Lot, OrderStatus } from '@/api/types';

const FINISHING_QUEUE_STATUSES: OrderStatus[] = [
  'in_stitching',
  'in_finishing',
  'in_rework',
];

function isInQueue(lot: Lot): boolean {
  const status = lot.order?.status;
  if (!status) return true;
  return FINISHING_QUEUE_STATUSES.includes(status);
}

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

export default function FinishingHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listLots();
      setLots(all.filter(isInQueue));
    } catch {
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <FloorShell title={t('finishing.title')}>
      <Card>
        <CardHeader>
          <CardTitle>{t('finishing.queue')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : lots.length === 0 ? (
            <p className="text-[var(--color-muted-foreground)]">{t('finishing.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {lots.map((lot) => (
                <li
                  key={lot.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {t('stitching.lotNo')} {lot.lotNo}
                    </div>
                    <div className="text-sm text-[var(--color-muted-foreground)] truncate">
                      {lot.vendor?.name ?? lot.vendorId}
                      {lot.vendorLotNo ? ` • ${lot.vendorLotNo}` : ''} • {totalUnits(lot.qtyIn)} u
                    </div>
                    {lot.order?.status && (
                      <Badge variant="outline" className="mt-1">
                        {lot.order.status}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/finishing/lot/${lot.id}`)}
                  >
                    {t('finishing.openLot')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </FloorShell>
  );
}
