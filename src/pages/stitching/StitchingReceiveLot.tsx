import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { cn } from '@/lib/utils';
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
      <div>
        <button
          type="button"
          onClick={() => navigate('/stitching')}
          className="inline-flex items-center gap-1 pr-3.5 pl-2 py-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-foreground)] shadow-[0_1px_1px_rgba(14,23,48,0.03)] hover:bg-[var(--color-muted)] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {t('stitching.queue', { defaultValue: 'Queue' })}
        </button>
      </div>
      <div className="space-y-0 mt-2">{/* sections handle their own spacing */}

        {loading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : lot ? (
          <>
            <div
              className="rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_14px]"
            >
              <div className="font-semibold text-[26px] leading-[1.05] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
                {lot.lotNo}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
                {lot.style && (
                  <span className="font-medium text-[var(--color-foreground)]">
                    {[
                      t(`stitching.gender.${lot.style.gender}`, {
                        defaultValue:
                          lot.style.gender === 'W'
                            ? "Women's"
                            : lot.style.gender === 'M'
                              ? "Men's"
                              : 'Unisex',
                      }),
                      lot.style.category?.name,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                )}
                <span className="text-[var(--color-muted-foreground-2)]">·</span>
                <span>{lot.vendor?.name ?? lot.vendorId}</span>
                <span className="text-[var(--color-muted-foreground-2)]">·</span>
                <span className="font-mono tabular-nums">
                  {Object.values(lot.qtyIn ?? {}).reduce(
                    (a, b) => a + (Number(b) || 0),
                    0,
                  )}
                  u
                </span>
              </div>
              {(lot.order?.status === 'in_rework' || lot.order?.status === 'stuck') && (
                <div className="mt-2">
                  <Badge variant={orderStatusVariant(lot.order.status)} dot>
                    {lot.order.status}
                  </Badge>
                </div>
              )}
            </div>

            {/* DETAILS — uppercase section header outside the identity
                card, matches design layout. */}
            <details className="group mt-3.5 px-1">
              <summary className="cursor-pointer list-none flex items-center justify-between py-1 text-xs uppercase tracking-[0.08em] font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] select-none">
                {t('common.details', { defaultValue: 'Details' })}
                <span className="group-open:rotate-180 inline-block transition-transform text-[10px]">▼</span>
              </summary>
              <div className="mt-2 rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] px-4 py-1">
                <dl className="divide-y divide-[var(--color-border)] text-[13px]">
                  {lot.style && (
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-[var(--color-muted-foreground)]">
                        {t('stitching.style', { defaultValue: 'Style' })}
                      </dt>
                      <dd className="font-mono text-[var(--color-primary)]">
                        {lot.style.styleId}
                      </dd>
                    </div>
                  )}
                  {lot.order && (
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-[var(--color-muted-foreground)]">
                        {t('stitching.lot.orderRef', { defaultValue: 'Order' })}
                      </dt>
                      <dd className="font-mono">{lot.order.orderNo}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[var(--color-muted-foreground)]">
                      {t('stitching.vendor')}
                    </dt>
                    <dd>{lot.vendor?.name ?? lot.vendorId}</dd>
                  </div>
                  {lot.vendorLotNo && (
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-[var(--color-muted-foreground)]">
                        {t('stitching.vendorLot')}
                      </dt>
                      <dd className="font-mono">{lot.vendorLotNo}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </details>

            <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_6px] mt-3.5">
              <div className="flex items-baseline justify-between">
                <div className="font-semibold text-[18px] text-[var(--color-foreground)]">
                  {t('stitching.lot.forward')}
                </div>
                <span className="text-[12px] text-[var(--color-muted-foreground)] font-mono">
                  {t('stitching.lot.bySize', { defaultValue: 'by size' })}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                {t('stitching.lot.forwardHint', {
                  defaultValue: 'Tap size to forward all, or set quantity manually.',
                })}
              </p>
              {allZero ? (
                <p className="mt-3 pb-3 text-[var(--color-muted-foreground)]">
                  {t('stitching.lot.nothingLeft')}
                </p>
              ) : (
                <div className="mt-1.5">
                  {sizes.map((size) => (
                    <StitchSizeRow
                      key={size}
                      size={size}
                      max={available?.[size] ?? 0}
                      value={qty[size] ?? 0}
                      autoFocus={size === firstFocusSize}
                      onChange={(v) =>
                        setQty((prev) => ({ ...prev, [size]: v }))
                      }
                      onScrap={() => openScrap(size)}
                      forwardAllLabel={t('stitching.lot.forwardAll', {
                        defaultValue: 'Forward all {{n}}',
                        n: available?.[size] ?? 0,
                      })}
                      clearLabel={t('common.clear', { defaultValue: 'Clear' })}
                      leftLabel={t('stitching.lot.left', { defaultValue: 'left' })}
                      scrapLabel={t('stitching.lot.scrap', { defaultValue: 'Scrap' })}
                    />
                  ))}
                </div>
              )}
            </div>

            {!allZero && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit}
                className={cn(
                  'mt-3.5 w-full py-[18px] rounded-[14px] text-center font-semibold text-[16px] tracking-[0.01em] text-white transition-transform active:translate-y-px',
                  canSubmit
                    ? 'bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_10px_24px_rgba(34,64,196,0.32)]'
                    : 'bg-[var(--color-disabled-bg)] cursor-default',
                )}
              >
                {total > 0
                  ? t('stitching.lot.forwardN', {
                      defaultValue: 'Forward {{n}} {{unit}} →',
                      n: total,
                      unit:
                        total === 1
                          ? t('common.unit', { defaultValue: 'unit' })
                          : t('common.units'),
                    })
                  : t('stitching.lot.submit')}
              </button>
            )}

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
                        className="flex items-center gap-3 py-2"
                      >
                        <div className="min-w-[34px] h-7 px-1.5 rounded-[var(--radius-sm)] bg-[var(--color-muted)] flex items-center justify-center font-semibold text-xs">
                          {r.sizeLabel}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-mono tabular-nums">×{r.qty}</span>
                          {r.kind !== 'forward' && (
                            <span className="ml-2 text-xs text-[var(--status-rework-ink)]">
                              ({r.kind})
                            </span>
                          )}
                          {r.receivedByName && (
                            <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                              {t('common.by', { defaultValue: 'by' })}{' '}
                              {r.receivedByName}
                            </span>
                          )}
                        </div>
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

/**
 * Size row: chip + count + stepper + scrap.
 * Chip is a "forward all / clear" toggle so the common case (forward
 * everything in this size) is one tap.
 */
function StitchSizeRow({
  size,
  max,
  value,
  autoFocus,
  onChange,
  onScrap,
  forwardAllLabel,
  clearLabel,
  leftLabel,
  scrapLabel,
}: {
  size: string;
  max: number;
  value: number;
  autoFocus?: boolean;
  onChange: (v: number) => void;
  onScrap: () => void;
  forwardAllLabel: string;
  clearLabel: string;
  leftLabel: string;
  scrapLabel: string;
}) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, v)));
  const filled = value === max && max > 0;
  const active = value > 0;
  const disabled = max === 0;

  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-[#efeee9] last:border-b-0">
      <button
        type="button"
        onClick={() => set(filled ? 0 : max)}
        disabled={disabled}
        title={filled ? clearLabel : forwardAllLabel}
        aria-label={filled ? clearLabel : forwardAllLabel}
        className={cn(
          'min-w-[44px] h-10 px-2.5 rounded-[10px] flex items-center justify-center font-semibold text-[17px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          active
            ? 'text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_10px_rgba(34,64,196,0.25)]'
            : 'text-[var(--color-foreground)] bg-[#f1efe8] shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-[var(--color-primary-soft)]',
        )}
      >
        {size}
      </button>
      <div className="flex-1 min-w-0 text-[14px] whitespace-nowrap">
        <span className="font-mono font-semibold tabular-nums text-[var(--color-foreground)]">
          {max}
        </span>{' '}
        <span className="text-[var(--color-muted-foreground)]">{leftLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set(value - 1)}
          disabled={disabled || value <= 0}
          aria-label="−"
          className="w-8 h-8 rounded-[9px] bg-[#f1efe8] text-[var(--color-foreground)] flex items-center justify-center disabled:opacity-40 shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]"
        >
          <Minus size={16} strokeWidth={2.4} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) =>
            set(parseInt(e.target.value.replace(/\D/g, '') || '0', 10))
          }
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            'w-[42px] h-9 text-center rounded-[9px] border bg-[var(--color-surface)] text-[16px] font-semibold tabular-nums outline-none transition-colors',
            value > 0
              ? 'border-[var(--color-primary)]'
              : 'border-[#e3e2dc]',
          )}
        />
        <button
          type="button"
          onClick={() => set(value + 1)}
          disabled={disabled || value >= max}
          aria-label="+"
          className="w-8 h-8 rounded-[9px] bg-[#f1efe8] text-[var(--color-foreground)] flex items-center justify-center disabled:opacity-40 shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]"
        >
          <Plus size={16} strokeWidth={2.4} />
        </button>
      </div>
      <button
        type="button"
        onClick={onScrap}
        disabled={disabled}
        className="ml-0.5 px-1.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.02em] text-[var(--color-muted-foreground)] hover:bg-[var(--color-destructive-bg)] hover:text-[var(--color-destructive)] disabled:opacity-40 transition-colors"
      >
        {scrapLabel}
      </button>
    </div>
  );
}
