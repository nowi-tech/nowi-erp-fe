import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listLots } from '@/api/lots';
import type { Lot, OrderStatus } from '@/api/types';

function todayLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const STITCHING_QUEUE_STATUSES: OrderStatus[] = ['receiving', 'in_stitching', 'in_rework'];

function isInQueue(lot: Lot): boolean {
  const status = lot.order?.status;
  if (!status) return true; // be permissive when BE doesn't send embedded order
  return STITCHING_QUEUE_STATUSES.includes(status);
}

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

export default function StitchingHome() {
  const { t, i18n } = useTranslation();
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
    <FloorShell title={t('stitching.title')}>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-[var(--color-foreground)]">
            {t('stitching.title')}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            {todayLabel(i18n.language)}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="hidden lg:inline-flex"
          onClick={() => navigate('/stitching/receive')}
        >
          <Plus size={16} />
          {t('stitching.receiveFromKotty.fab')}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('stitching.queue')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
          ) : lots.length === 0 ? (
            <p className="text-[var(--color-muted-foreground)]">{t('stitching.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {lots.map((lot) => (
                <li
                  key={lot.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] border-l-[3px] border-l-[var(--stage-stitch-acc)] p-3 hover:bg-[var(--stage-stitch-bg)]/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-serif text-lg leading-snug truncate">
                      <span className="text-[var(--color-muted-foreground)] text-sm font-sans uppercase tracking-wider mr-2">
                        {t('stitching.lotNo')}
                      </span>
                      {lot.lotNo}
                    </div>
                    <div className="text-sm text-[var(--color-muted-foreground)] truncate">
                      {lot.vendor?.name ?? lot.vendorId}
                      {lot.vendorLotNo ? ` • ${lot.vendorLotNo}` : ''} •{' '}
                      <span className="tabular-nums">{totalUnits(lot.qtyIn)} u</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant="stitch" dot>
                        {t('stitching.title')}
                      </Badge>
                      {lot.order?.status && (
                        <Badge variant="outline">{lot.order.status}</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="min-h-[56px] px-6"
                    onClick={() => navigate(`/stitching/lot/${lot.id}`)}
                  >
                    {t('stitching.openLot')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Button
        type="button"
        size="lg"
        className="fixed right-4 bottom-24 shadow-lg lg:hidden"
        onClick={() => navigate('/stitching/receive')}
      >
        <Plus size={18} />
        {t('stitching.receiveFromKotty.fab')}
      </Button>
    </FloorShell>
  );
}
