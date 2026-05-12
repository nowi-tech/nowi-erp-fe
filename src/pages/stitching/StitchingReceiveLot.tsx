import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { toast as sonnerToast } from 'sonner';
import { getAvailability, getLot } from '@/api/lots';
import { createReceipts, FeatureUnavailableError } from '@/api/receipts';
import { orderStatusVariant } from '@/lib/statusBadge';
import { useStageId } from '@/lib/useStageId';
import type { Lot, SizeMatrix } from '@/api/types';

function totalOf(m: SizeMatrix): number {
  return Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
}

export default function StitchingReceiveLot() {
  const { t } = useTranslation();
  const { lotId = '' } = useParams<{ lotId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [lot, setLot] = useState<Lot | null>(null);
  const [available, setAvailable] = useState<SizeMatrix>({});
  const [qty, setQty] = useState<SizeMatrix>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Resolve the "stitching" stage id at runtime instead of hardcoding 1
  // — survives seed reorders / future stage additions.
  const stageId = useStageId('stitching');

  const refresh = useCallback(async () => {
    if (stageId === null) return;
    setLoading(true);
    try {
      const [lotRes, avail] = await Promise.all([
        getLot(lotId),
        getAvailability(lotId, stageId).catch(() => ({
          stageId,
          available: {} as SizeMatrix,
        })),
      ]);
      setLot(lotRes);
      setAvailable(avail.available ?? {});
      setQty({});
    } catch {
      toast.show(t('stitching.lot.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [lotId, stageId, toast, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sizes = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(available ?? {}),
      ...Object.keys(lot?.qtyIn ?? {}),
    ]);
    return Array.from(keys);
  }, [available, lot]);

  const total = totalOf(qty);
  const allZero =
    sizes.length > 0 && sizes.every((s) => (available?.[s] ?? 0) === 0);
  const canSubmit = total > 0 && !submitting;

  function setSize(size: string, raw: string) {
    const max = available?.[size] ?? 0;
    const v = Math.max(0, Math.min(max, parseInt(raw, 10) || 0));
    setQty((prev) => ({ ...prev, [size]: v }));
  }

  async function doSubmit() {
    if (!canSubmit || stageId === null) return;
    setSubmitting(true);
    try {
      const receipts = Object.entries(qty)
        .filter(([, v]) => (Number(v) || 0) > 0)
        .map(([sizeLabel, q]) => ({ sizeLabel, qty: Number(q) }));
      await createReceipts({
        lotId,
        stageId,
        receipts,
      });
      // Rich success toast: how many moved + where they're headed.
      const totalMoved = receipts.reduce((a, r) => a + r.qty, 0);
      sonnerToast.success(
        t('stitching.lot.forwardedToast', {
          defaultValue: 'Forwarded {{n}} units → Finishing',
          n: totalMoved,
        }),
        {
          description: receipts.map((r) => `${r.sizeLabel} × ${r.qty}`).join(' · '),
          duration: 4500,
        },
      );
      try {
        localStorage.setItem('nowi.firstReceiptDoneAt', new Date().toISOString());
      } catch {
        // ignore quota / storage errors
      }
      setConfirmOpen(false);
      await refresh();
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        toast.show(t('common.featureUnavailable'), 'info');
      } else {
        toast.show(t('common.error'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FloorShell title={t('stitching.lot.title')}>
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/stitching')}>
          ← {t('common.back')}
        </Button>

        {loading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : lot ? (
          <>
            <Card stage="stitch">
              <CardHeader>
                <CardTitle className="font-serif text-2xl">
                  <span className="text-[var(--color-muted-foreground)] text-xs uppercase tracking-wider mr-2 font-sans">
                    {t('stitching.lotNo')}
                  </span>
                  {lot.lotNo}
                </CardTitle>
                {lot.style && (
                  <div className="mt-1 font-mono text-sm text-[var(--stage-stitch-acc)]">
                    {lot.style.styleId}
                    {lot.style.category?.name
                      ? ` · ${lot.style.category.name}`
                      : ''}
                  </div>
                )}
                {/* Only surface anomalies — routine status is implied by being on this page. */}
                {(lot.order?.status === 'in_rework' || lot.order?.status === 'stuck') && (
                  <div className="mt-2">
                    <Badge variant={orderStatusVariant(lot.order.status)} dot>
                      {lot.order.status}
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <span className="text-[var(--color-muted-foreground)]">
                    {t('stitching.vendor')}:
                  </span>{' '}
                  {lot.vendor?.name ?? lot.vendorId}
                </div>
                {lot.vendorLotNo && (
                  <div>
                    <span className="text-[var(--color-muted-foreground)]">
                      {t('stitching.vendorLot')}:
                    </span>{' '}
                    {lot.vendorLotNo}
                  </div>
                )}
                {lot.order && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted-foreground)]">Order:</span>
                    <span className="font-mono">{lot.order.orderNo}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('stitching.lot.forward')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {allZero ? (
                  <p className="text-[var(--color-muted-foreground)]">
                    {t('stitching.lot.nothingLeft')}
                  </p>
                ) : (
                  sizes.map((size) => {
                    const max = available?.[size] ?? 0;
                    return (
                      <div
                        key={size}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{size}</span>
                          <span className="ml-2 text-sm text-[var(--color-muted-foreground)]">
                            {t('stitching.lot.available')} {max}
                          </span>
                        </div>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={max}
                          value={qty[size] ?? 0}
                          onChange={(e) => setSize(size, e.target.value)}
                          className="w-24 text-center"
                          disabled={max === 0}
                        />
                      </div>
                    );
                  })
                )}
                {!allZero && (
                  <Button
                    size="lg"
                    className="w-full mt-2"
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit}
                  >
                    {t('stitching.lot.submit')}
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('stitching.lot.confirmTitle')}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={doSubmit} disabled={submitting}>
              {submitting ? t('common.saving') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('stitching.lot.confirmBody', { total })}</p>
      </Dialog>
    </FloorShell>
  );
}
