import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { createScrap } from '@/api/scrap';
import { toast as sonnerToast } from 'sonner';
import { getAvailability, getLot } from '@/api/lots';
import {
  createReceipts,
  listReceipts,
  FeatureUnavailableError,
  type ReceiptRow,
} from '@/api/receipts';
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
  const [recent, setRecent] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Scrap modal state — opened by the per-row trash button.
  const [scrapSize, setScrapSize] = useState<string | null>(null);
  const [scrapQty, setScrapQty] = useState<number>(0);
  const [scrapReason, setScrapReason] = useState('');
  const [scrapping, setScrapping] = useState(false);

  // Resolve the "stitching" stage id at runtime instead of hardcoding 1
  // — survives seed reorders / future stage additions.
  const stageId = useStageId('stitching');

  const refresh = useCallback(async () => {
    if (stageId === null) return;
    setLoading(true);
    try {
      const [lotRes, avail, receipts] = await Promise.all([
        getLot(lotId),
        getAvailability(lotId, stageId).catch(() => ({
          stageId,
          available: {} as SizeMatrix,
        })),
        listReceipts({ lotId, stageId, take: 10 }).catch(() => [] as ReceiptRow[]),
      ]);
      setLot(lotRes);
      setAvailable(avail.available ?? {});
      setRecent(receipts);
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

  // First size with availability > 0 — gets autofocus so the floor
  // master can start typing immediately on lot open.
  const firstFocusSize = useMemo(
    () => sizes.find((s) => (available?.[s] ?? 0) > 0) ?? null,
    [sizes, available],
  );

  const total = totalOf(qty);
  const allZero =
    sizes.length > 0 && sizes.every((s) => (available?.[s] ?? 0) === 0);
  const canSubmit = total > 0 && !submitting;

  function openScrap(size: string) {
    setScrapSize(size);
    setScrapQty(1);
    setScrapReason('');
  }
  function closeScrap() {
    setScrapSize(null);
    setScrapQty(0);
    setScrapReason('');
  }

  async function doScrap() {
    if (!lot || !lot.style || scrapSize === null || scrapping) return;
    const max = available?.[scrapSize] ?? 0;
    const qtyToScrap = Math.max(0, Math.min(max, scrapQty));
    if (qtyToScrap === 0 || scrapReason.trim().length === 0 || stageId === null) {
      return;
    }
    setScrapping(true);
    try {
      await createScrap({
        lotId: lot.id,
        stageId,
        sku: `${lot.style.styleId}-${scrapSize}`,
        sizeLabel: scrapSize,
        qty: qtyToScrap,
        reason: scrapReason.trim(),
      });
      sonnerToast.success(
        t('stitching.lot.scrappedToast', {
          defaultValue: 'Scrapped {{n}} × {{size}}',
          n: qtyToScrap,
          size: scrapSize,
        }),
        { description: scrapReason.trim(), duration: 4500 },
      );
      closeScrap();
      await refresh();
    } catch {
      toast.show(t('common.error'), 'error');
    } finally {
      setScrapping(false);
    }
  }

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
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{size}</span>
                          <span className="ml-2 text-sm text-[var(--color-muted-foreground)]">
                            {t('stitching.lot.available')} {max}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={max}
                            value={qty[size] ?? 0}
                            onChange={(e) => setSize(size, e.target.value)}
                            className="w-24 text-center"
                            disabled={max === 0}
                            autoFocus={size === firstFocusSize}
                          />
                          <button
                            type="button"
                            onClick={() => openScrap(size)}
                            disabled={max === 0}
                            aria-label={t('stitching.lot.scrap', {
                              defaultValue: 'Scrap',
                            })}
                            title={t('stitching.lot.scrap', { defaultValue: 'Scrap' })}
                            className="p-2 rounded-[var(--radius-sm)] text-[var(--color-muted-foreground)] hover:bg-[var(--status-stuck-bg)] hover:text-[var(--status-stuck-acc)] disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
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

            {/* Recent receipts at this stage — closes the "did I already
                forward this?" loop. Hidden when the lot is brand-new. */}
            {recent.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('stitching.lot.recent', {
                      defaultValue: 'Recently forwarded at stitching',
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-[var(--color-border)] text-sm">
                    {recent.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between py-1.5"
                      >
                        <span>
                          <span className="font-medium">{r.sizeLabel}</span>
                          <span className="ml-2 tabular-nums">× {r.qty}</span>
                          {r.kind !== 'forward' && (
                            <span className="ml-2 text-xs text-[var(--status-rework-ink)]">
                              ({r.kind})
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-[var(--color-muted-foreground)] font-mono">
                          {new Date(r.receivedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
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

      <Dialog
        open={scrapSize !== null}
        onClose={() => !scrapping && closeScrap()}
        title={t('stitching.lot.scrapTitle', {
          defaultValue: 'Scrap units',
        })}
        footer={
          <>
            <Button
              variant="outline"
              onClick={closeScrap}
              disabled={scrapping}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void doScrap()}
              disabled={
                scrapping ||
                scrapQty <= 0 ||
                scrapReason.trim().length === 0
              }
            >
              {scrapping ? t('common.saving') : t('stitching.lot.scrap', { defaultValue: 'Scrap' })}
            </Button>
          </>
        }
      >
        {scrapSize !== null && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('stitching.lot.scrapHint', {
                defaultValue: 'Scrapping units removes them from the lot permanently. {{max}} available in size {{size}}.',
                max: available?.[scrapSize] ?? 0,
                size: scrapSize,
              })}
            </p>
            <div>
              <Label htmlFor="scrap-qty" required>
                {t('stitching.lot.scrapQty', { defaultValue: 'Quantity' })}
              </Label>
              <Input
                id="scrap-qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={available?.[scrapSize] ?? 0}
                value={scrapQty}
                onChange={(e) => setScrapQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="scrap-reason" required>
                {t('stitching.lot.scrapReason', { defaultValue: 'Reason' })}
              </Label>
              <Input
                id="scrap-reason"
                value={scrapReason}
                onChange={(e) => setScrapReason(e.target.value)}
                placeholder={t('stitching.lot.scrapReasonPlaceholder', {
                  defaultValue: 'e.g. fabric tear, stitching defect',
                })}
              />
            </div>
          </div>
        )}
      </Dialog>
    </FloorShell>
  );
}
