import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ChevronLeft, Minus, Plus } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getAvailability, getLot } from '@/api/lots';
import {
  createReceipts,
  listReceipts,
  FeatureUnavailableError,
  type ReceiptRow,
} from '@/api/receipts';
import { useStageId } from '@/lib/useStageId';
import { openRework } from '@/api/rework';
import { requestUploadUrl } from '@/api/storage';
import { createDispatch } from '@/api/dispatches';
import { listWarehouses } from '@/api/filters';
import { orderStatusVariant } from '@/lib/statusBadge';
import type {
  CreateDispatchItemInput,
  FilterOption,
  Lot,
  SizeMatrix,
} from '@/api/types';

const REASON_KEYS = [
  'stitchingDefect',
  'printDefect',
  'wrongSize',
  'looseThreads',
  'other',
] as const;
type ReasonKey = (typeof REASON_KEYS)[number];

interface RowState {
  forwardQty: number;
  reworkOpen: boolean;
  reworkQty: number;
  reasonKey: ReasonKey;
  otherReason: string;
  photoPath: string | null;
  photoNoop: boolean;
}

function defaultRow(): RowState {
  return {
    forwardQty: 0,
    reworkOpen: false,
    reworkQty: 0,
    reasonKey: 'stitchingDefect',
    otherReason: '',
    photoPath: null,
    photoNoop: false,
  };
}

export default function FinishingReceiveLot() {
  const { t } = useTranslation();
  // useParams is intrinsically string (URL paths); parse to number once
  // here so downstream API calls operate on the real domain type.
  const { lotId: lotIdParam = '' } = useParams<{ lotId: string }>();
  const lotId = Number(lotIdParam);
  const navigate = useNavigate();

  const [lot, setLot] = useState<Lot | null>(null);
  const [available, setAvailable] = useState<SizeMatrix>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [recent, setRecent] = useState<ReceiptRow[]>([]);
  // Resolve finishing stage id at runtime via the shared hook so we
  // don't bake the seed's primary-key ordering into the FE.
  const finishingStageId = useStageId('finishing');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Dispatch challan state.
  const [warehouses, setWarehouses] = useState<FilterOption[]>([]);
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [shipQty, setShipQty] = useState<Record<string, number>>({});
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  // Two-step dispatch: confirm (Yes/No) sits between the form and the
  // actual API call so a misclick can't push units to the warehouse.
  const [dispatchConfirming, setDispatchConfirming] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const dispatchCancelRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    // Wait until the stage hook has resolved finishing's id (BE call).
    if (finishingStageId == null) return;
    setLoading(true);
    try {
      const [lotRes, avail, receipts] = await Promise.all([
        getLot(lotId),
        getAvailability(lotId, finishingStageId).catch(() => ({
          stageId: finishingStageId,
          available: {} as SizeMatrix,
        })),
        listReceipts({ lotId, stageId: finishingStageId, take: 10 }).catch(
          () => [] as ReceiptRow[],
        ),
      ]);
      setLot(lotRes);
      const a = avail.available ?? {};
      setAvailable(a);
      const next: Record<string, RowState> = {};
      Object.keys(a).forEach((s) => {
        next[s] = defaultRow();
      });
      setRows(next);
      setRecent(receipts);
    } catch {
      sonnerToast.error(t('stitching.lot.loadError'));
    } finally {
      setLoading(false);
    }
  }, [lotId, finishingStageId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listWarehouses().then(setWarehouses).catch(() => undefined);
  }, []);

  const sizes = useMemo(() => Object.keys(available ?? {}), [available]);

  const totals = useMemo(() => {
    let forward = 0;
    let rework = 0;
    Object.values(rows).forEach((r) => {
      forward += r.forwardQty;
      rework += r.reworkOpen ? r.reworkQty : 0;
    });
    return { forward, rework };
  }, [rows]);

  const allZero = sizes.length > 0 && sizes.every((s) => (available[s] ?? 0) === 0);
  const canSubmit = !submitting && (totals.forward > 0 || totals.rework > 0);

  function updateRow(size: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [size]: { ...prev[size], ...patch } }));
  }

  function setForward(size: string, raw: string) {
    const max = available[size] ?? 0;
    const cur = rows[size];
    const reworkPart = cur?.reworkOpen ? cur.reworkQty : 0;
    const cap = Math.max(0, max - reworkPart);
    const v = Math.max(0, Math.min(cap, parseInt(raw, 10) || 0));
    updateRow(size, { forwardQty: v });
  }

  function setRework(size: string, raw: string) {
    const max = available[size] ?? 0;
    const cur = rows[size];
    const fwdPart = cur?.forwardQty ?? 0;
    const cap = Math.max(0, max - fwdPart);
    const v = Math.max(0, Math.min(cap, parseInt(raw, 10) || 0));
    updateRow(size, { reworkQty: v });
  }

  async function attachPhoto(size: string) {
    if (!lot) return;
    try {
      const res = await requestUploadUrl({
        entityType: 'rework',
        entityId: String(lot.id),
        contentType: 'image/jpeg',
      });
      // Noop dev mode: skip the actual GCS PUT, just record the path.
      updateRow(size, {
        photoPath: res.objectPath,
        photoNoop: !!res.noop,
      });
      sonnerToast.success(
        res.noop
          ? `${t('finishing.photoAdded')} ${t('common.noopDevHint')}`
          : t('finishing.photoAdded'),
      );
    } catch {
      sonnerToast.error(t('common.error'));
    }
  }

  function reasonText(r: RowState): string {
    if (r.reasonKey === 'other') return r.otherReason.trim() || 'other';
    return t(`finishing.reasons.${r.reasonKey}`);
  }

  async function doSubmit() {
    if (!canSubmit || !lot || finishingStageId == null) return;
    setSubmitting(true);
    try {
      // Forwards (combined into one /api/receipts call).
      const forwardLines = sizes
        .map((s) => ({ sizeLabel: s, qty: rows[s]?.forwardQty ?? 0 }))
        .filter((l) => l.qty > 0);
      if (forwardLines.length) {
        await createReceipts({
          lotId: lot.id,
          stageId: finishingStageId,
          receipts: forwardLines,
        });
      }
      // Rework: one POST per size with rework qty > 0.
      const reworkStyleId = lot.style?.styleId ?? lot.sku;
      for (const s of sizes) {
        const r = rows[s];
        if (!r?.reworkOpen || r.reworkQty <= 0) continue;
        if (!reworkStyleId) continue;
        await openRework({
          lotId: lot.id,
          sku: `${reworkStyleId}-${s}`,
          sizeLabel: s,
          qty: r.reworkQty,
          reason: reasonText(r),
          photoPaths: r.photoPath ? [r.photoPath] : undefined,
        });
      }
      // Rich success toast — show what moved + flag rework (warning tone)
      // separately if any was opened, since rework is a "loss" event.
      const fwd = forwardLines.reduce((a, l) => a + l.qty, 0);
      const rework = Object.values(rows).reduce(
        (a, r) => a + (r.reworkOpen ? r.reworkQty : 0),
        0,
      );
      if (fwd > 0) {
        sonnerToast.success(
          t('finishing.lot.forwardedToast', {
            defaultValue: 'Forwarded {{n}} units → Dispatch',
            n: fwd,
          }),
          {
            description: forwardLines
              .map((r) => `${r.sizeLabel} × ${r.qty}`)
              .join(' · '),
            duration: 4500,
          },
        );
      }
      if (rework > 0) {
        sonnerToast.warning(
          t('finishing.lot.reworkToast', {
            defaultValue: 'Sent {{n}} units back for rework',
            n: rework,
          }),
          { duration: 4500 },
        );
      }
      try {
        localStorage.setItem('nowi.firstReceiptDoneAt', new Date().toISOString());
      } catch {
        // ignore quota / storage errors
      }
      setConfirmOpen(false);
      await refresh();
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        sonnerToast.info(t('common.featureUnavailable'));
      } else {
        sonnerToast.error(t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Build summary reason line for confirm dialog (first row that has rework).
  const firstReworkRow = Object.values(rows).find(
    (r) => r.reworkOpen && r.reworkQty > 0,
  );

  // ── Dispatch challan helpers ────────────────────────────────────────────
  const dispatchSizes = useMemo(() => Object.keys(available ?? {}), [available]);
  const dispatchTotal = useMemo(
    () => Object.values(shipQty).reduce((a, b) => a + (Number(b) || 0), 0),
    [shipQty],
  );
  const canDispatchSubmit =
    !!lot && !!destWarehouseId && dispatchTotal > 0 && !dispatching;

  function setShip(size: string, raw: string) {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setShipQty((prev) => ({ ...prev, [size]: v }));
  }

  async function doDispatch() {
    if (!lot || !destWarehouseId) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      // SKU code follows `<styleId>-<size>` (e.g. NOWI-W-DR-1001-S).
      // Fall back to the legacy `lot.sku` string if Style isn't embedded
      // (older API responses without `style`).
      const styleId = lot.style?.styleId ?? lot.sku;
      const items: CreateDispatchItemInput[] = dispatchSizes
        .map((s) => ({
          lotId: lot.id,
          sku: styleId ? `${styleId}-${s}` : '',
          sizeLabel: s,
          qty: Number(shipQty[s] ?? 0),
        }))
        .filter((i) => i.qty > 0 && i.sku.length > 0);
      if (items.length === 0) {
        setDispatchError(t('finishing.dispatch.noItems'));
        setDispatching(false);
        return;
      }
      const dispatch = await createDispatch({
        orderId: lot.orderId,
        destWarehouseId: Number(destWarehouseId),
        items,
      });
      sonnerToast.success(
        t('finishing.dispatch.successToast', { dispatchNo: dispatch.dispatchNo }),
        { duration: 5000 },
      );
      setDispatchConfirmOpen(false);
      setDispatchConfirming(false);
      setShipQty({});
      navigate(`/dispatches/${dispatch.id}/print`);
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        sonnerToast.info(t('common.featureUnavailable'));
      } else {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        const msg = e.response?.data?.error ?? e.message ?? t('common.error');
        setDispatchError(msg);
      }
    } finally {
      setDispatching(false);
    }
  }

  const destWarehouse = warehouses.find((w) => w.id === destWarehouseId);

  return (
    <FloorShell title={t('finishing.lot.title')}>
      <div>
        <button
          type="button"
          onClick={() => navigate('/finishing')}
          className="inline-flex items-center gap-1 pr-3.5 pl-2 py-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-foreground)] shadow-[0_1px_1px_rgba(14,23,48,0.03)] hover:bg-[var(--color-muted)] transition-colors"
        >
          <ChevronLeft size={20} />
          {t('stitching.queueShort', { defaultValue: 'Queue' })}
        </button>
      </div>
      <div className="mt-2">
        {loading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : lot ? (
          <>
            <div className="rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--stage-finish-acc)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_14px]">
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
                      <dd className="font-mono text-[var(--stage-finish-acc)]">
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
            <div className="mt-3.5 space-y-3.5">

            <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_6px]">
              <div className="flex items-baseline justify-between">
                <div className="font-semibold text-[18px] text-[var(--color-foreground)]">
                  {t('stitching.lot.forward', { defaultValue: 'Forward' })}
                </div>
                <span className="text-[12px] text-[var(--color-muted-foreground)] font-mono">
                  {t('stitching.lot.bySize', { defaultValue: 'by size' })}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                {t('stitching.lot.forwardHint', {
                  defaultValue:
                    'Tap size to forward all, or set quantity manually.',
                })}
              </p>
              {allZero ? (
                <p className="mt-3 pb-3 text-[var(--color-muted-foreground)]">
                  {t('stitching.lot.nothingLeft')}
                </p>
              ) : (
                <div className="mt-1.5">
                  {sizes.map((size) => {
                    const max = available[size] ?? 0;
                    const r = rows[size] ?? defaultRow();
                    return (
                      <FinishSizeRow
                        key={size}
                        size={size}
                        max={max}
                        row={r}
                        onForwardChange={(v) =>
                          updateRow(size, { forwardQty: v })
                        }
                        onSetForward={(raw) => setForward(size, raw)}
                        onToggleRework={(open) =>
                          updateRow(size, {
                            reworkOpen: open,
                            reworkQty: open ? r.reworkQty : 0,
                          })
                        }
                        onReworkQty={(raw) => setRework(size, raw)}
                        onReasonChange={(k) =>
                          updateRow(size, { reasonKey: k })
                        }
                        onOtherReasonChange={(v) =>
                          updateRow(size, { otherReason: v })
                        }
                        onAttachPhoto={() => attachPhoto(size)}
                        reasonKeys={REASON_KEYS}
                        labels={{
                          left: t('stitching.lot.left', {
                            defaultValue: 'left',
                          }),
                          rework: t('finishing.markRework', {
                            defaultValue: 'Rework',
                          }),
                          forwardAll: t('stitching.lot.forwardAll', {
                            defaultValue: 'Forward all {{n}}',
                            n: max,
                          }),
                          clear: t('common.clear', { defaultValue: 'Clear' }),
                          reworkQtyLabel: t('finishing.reworkQty'),
                          reasonLabel: t('finishing.reworkReason'),
                          otherLabel: t('finishing.otherReasonLabel'),
                          addPhoto: t('finishing.addPhoto'),
                          photoAdded: t('finishing.photoAdded'),
                          noopDev: t('common.noopDevHint'),
                          reasonOf: (k: ReasonKey) =>
                            t(`finishing.reasons.${k}`),
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {!allZero && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit}
                className={cn(
                  'mt-3.5 w-full p-[18px] rounded-[14px] text-center font-semibold text-[16px] tracking-[0.01em] text-white transition-transform active:translate-y-px',
                  canSubmit
                    ? 'bg-gradient-to-b from-[var(--stage-finish-acc)] to-[var(--stage-finish-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--stage-finish-ink),0_10px_24px_rgba(196,69,46,0.32)]'
                    : 'bg-[var(--color-disabled-bg)] cursor-default',
                )}
              >
                {totals.forward > 0 || totals.rework > 0
                  ? t('finishing.lot.submitN', {
                      defaultValue: 'Send {{fwd}} → Dispatch · {{rwk}} → Rework',
                      fwd: totals.forward,
                      rwk: totals.rework,
                    })
                  : t('finishing.lot.submit')}
              </button>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{t('finishing.dispatch.generateChallan')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t('finishing.dispatch.destinationWarehouse')}</Label>
                  <Select
                    value={destWarehouseId}
                    onChange={(e) => setDestWarehouseId(e.target.value)}
                  >
                    <option value="">
                      {t('finishing.dispatch.selectWarehouse')}
                    </option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {dispatchSizes.map((size) => (
                  <div
                    key={`ship-${size}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{size}</span>
                      <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
                        {t('finishing.dispatch.shipQtyHint')}
                      </span>
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={shipQty[size] ?? 0}
                      onChange={(e) => setShip(size, e.target.value)}
                      className="w-24 text-center"
                    />
                  </div>
                ))}

                {dispatchError && (
                  <p className="text-sm text-[var(--color-destructive)]">
                    {dispatchError}
                  </p>
                )}

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={() => setDispatchConfirmOpen(true)}
                  disabled={!canDispatchSubmit}
                >
                  {t('finishing.dispatch.generateChallan')}
                </Button>
              </CardContent>
            </Card>

            {/* Recently forwarded + rework-returned at finishing —
                stage-scoped: only this lot's events at finishing, so the
                master can see "did I already forward / send back these
                sizes today?". 24px gap from the cards above. */}
            {recent.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('stitching.lot.recent', {
                      defaultValue: 'Recently at finishing',
                    })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-[var(--color-border)] text-sm">
                    {recent.map((r) => {
                      const isRework = r.kind === 'rework_return';
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-3 py-2"
                        >
                          <div
                            className={cn(
                              'min-w-[34px] h-7 px-1.5 rounded-[var(--radius-sm)] flex items-center justify-center font-semibold text-xs',
                              isRework
                                ? 'bg-[var(--status-rework-bg)] text-[var(--status-rework-ink)]'
                                : 'bg-[var(--color-muted)]',
                            )}
                          >
                            {r.sizeLabel}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span
                              className={cn(
                                'font-mono tabular-nums',
                                isRework && 'text-[var(--status-rework-ink)]',
                              )}
                            >
                              ×{r.qty}
                            </span>
                            {isRework && (
                              <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-[var(--status-rework-ink)]">
                                {t('finishing.markRework', {
                                  defaultValue: 'Rework',
                                })}
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
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}
            </div>
          </>
        ) : null}
      </div>

      <Dialog
        open={dispatchConfirmOpen}
        onClose={() => {
          setDispatchConfirmOpen(false);
          setDispatchConfirming(false);
        }}
        title={
          dispatchConfirming
            ? t('finishing.dispatch.confirmYesNoTitle', {
                defaultValue: 'Send {{n}} units to {{warehouse}}?',
                n: dispatchTotal,
                warehouse: destWarehouse?.name ?? '',
              })
            : t('finishing.dispatch.confirmTitle')
        }
        initialFocusRef={dispatchCancelRef}
        footer={
          dispatchConfirming ? (
            // Step 2 — explicit Yes/No so a misclick on the form's
            // "Send" button can't push units to the warehouse.
            <>
              <Button
                variant="outline"
                onClick={() => setDispatchConfirming(false)}
                disabled={dispatching}
              >
                {t('common.no', { defaultValue: 'No' })}
              </Button>
              <Button
                onClick={() => void doDispatch()}
                disabled={dispatching}
              >
                {dispatching
                  ? t('common.saving')
                  : t('common.yes', { defaultValue: 'Yes' })}
              </Button>
            </>
          ) : (
            <>
              <Button
                ref={dispatchCancelRef}
                variant="outline"
                onClick={() => setDispatchConfirmOpen(false)}
                disabled={dispatching}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => setDispatchConfirming(true)}
                disabled={dispatching}
              >
                {t('finishing.dispatch.generateChallan', {
                  defaultValue: 'Send',
                })}
              </Button>
            </>
          )
        }
      >
        {!dispatchConfirming ? (
          <p>
            {t('finishing.dispatch.confirmBody', {
              total: dispatchTotal,
              sku: lot?.sku ?? '',
              warehouse: destWarehouse?.name ?? '',
            })}
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-[var(--color-foreground)]">
              {t('finishing.dispatch.confirmYesNoBody', {
                defaultValue:
                  'You are about to ship {{n}} units to {{warehouse}}. This will sync to EasyEcom and cannot be undone from here.',
                n: dispatchTotal,
                warehouse: destWarehouse?.name ?? '',
              })}
            </p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('finishing.lot.confirmTitle')}
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
        <div className="space-y-1">
          <p>{t('finishing.lot.confirmForward', { forward: totals.forward })}</p>
          <p>{t('finishing.lot.confirmRework', { rework: totals.rework })}</p>
          {firstReworkRow && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {t('finishing.lot.confirmReasonPrefix')} {reasonText(firstReworkRow)}
            </p>
          )}
        </div>
      </Dialog>
    </FloorShell>
  );
}

/**
 * Finishing size row — design's chip-tap-to-fill for forward qty, with
 * an inline "Rework" link that expands the row into a reason + photo +
 * rework-qty block when toggled. Forward and rework share the available
 * count: forwardQty + reworkQty ≤ max.
 */
function FinishSizeRow({
  size,
  max,
  row,
  onForwardChange,
  onSetForward,
  onToggleRework,
  onReworkQty,
  onReasonChange,
  onOtherReasonChange,
  onAttachPhoto,
  reasonKeys,
  labels,
}: {
  size: string;
  max: number;
  row: RowState;
  onForwardChange: (v: number) => void;
  onSetForward: (raw: string) => void;
  onToggleRework: (open: boolean) => void;
  onReworkQty: (raw: string) => void;
  onReasonChange: (k: ReasonKey) => void;
  onOtherReasonChange: (v: string) => void;
  onAttachPhoto: () => void;
  reasonKeys: readonly ReasonKey[];
  labels: {
    left: string;
    rework: string;
    forwardAll: string;
    clear: string;
    reworkQtyLabel: string;
    reasonLabel: string;
    otherLabel: string;
    addPhoto: string;
    photoAdded: string;
    noopDev: string;
    reasonOf: (k: ReasonKey) => string;
  };
}) {
  // forward + rework share the available pool; chip-cap = max - reworkQty
  const reworkPart = row.reworkOpen ? row.reworkQty : 0;
  const fwdCap = Math.max(0, max - reworkPart);
  const filled = row.forwardQty === fwdCap && fwdCap > 0;
  const active = row.forwardQty > 0;
  const disabled = max === 0;

  const set = (v: number) =>
    onForwardChange(Math.max(0, Math.min(fwdCap, v)));

  return (
    <div className="border-b border-[#efeee9] last:border-b-0 py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => set(filled ? 0 : fwdCap)}
          disabled={disabled || fwdCap === 0}
          title={filled ? labels.clear : labels.forwardAll}
          aria-label={filled ? labels.clear : labels.forwardAll}
          className={cn(
            'min-w-[44px] h-10 px-2.5 rounded-[10px] flex items-center justify-center font-semibold text-[17px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            active
              ? 'text-white bg-gradient-to-b from-[var(--stage-finish-acc)] to-[var(--stage-finish-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_10px_rgba(196,69,46,0.25)]'
              : 'text-[var(--color-foreground)] bg-[#f1efe8] shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-[var(--stage-finish-bg)]',
          )}
        >
          {size}
        </button>
        <div className="flex-1 min-w-0 text-[14px] whitespace-nowrap">
          <span className="font-mono font-semibold tabular-nums text-[var(--color-foreground)]">
            {max}
          </span>{' '}
          <span className="text-[var(--color-muted-foreground)]">{labels.left}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => set(row.forwardQty - 1)}
            disabled={disabled || row.forwardQty <= 0}
            aria-label="−"
            className="w-8 h-8 rounded-[9px] bg-[#f1efe8] text-[var(--color-foreground)] flex items-center justify-center disabled:opacity-40 shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]"
          >
            <Minus size={16} strokeWidth={2.4} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={row.forwardQty}
            onChange={(e) => onSetForward(e.target.value)}
            disabled={disabled}
            className={cn(
              'w-[42px] h-9 text-center rounded-[9px] border bg-white text-[16px] font-semibold tabular-nums outline-none transition-colors',
              row.forwardQty > 0
                ? 'border-[var(--stage-finish-acc)]'
                : 'border-[#e3e2dc]',
            )}
          />
          <button
            type="button"
            onClick={() => set(row.forwardQty + 1)}
            disabled={disabled || row.forwardQty >= fwdCap}
            aria-label="+"
            className="w-8 h-8 rounded-[9px] bg-[#f1efe8] text-[var(--color-foreground)] flex items-center justify-center disabled:opacity-40 shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]"
          >
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onToggleRework(!row.reworkOpen)}
          disabled={disabled}
          className={cn(
            'ml-0.5 px-1.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.02em] transition-colors disabled:opacity-40',
            row.reworkOpen
              ? 'bg-[var(--status-rework-bg)] text-[var(--status-rework-ink)]'
              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--status-rework-bg)] hover:text-[var(--status-rework-ink)]',
          )}
        >
          {labels.rework}
        </button>
      </div>

      {row.reworkOpen && (
        <div className="mt-3 ml-[54px] rounded-[10px] bg-[var(--status-rework-bg)]/40 border border-[var(--status-rework-bg)] p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">{labels.reworkQtyLabel}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.max(0, max - row.forwardQty)}
              value={row.reworkQty}
              onChange={(e) => onReworkQty(e.target.value)}
              className="w-24 h-10 text-center"
            />
          </div>
          <div>
            <Label className="mb-1">{labels.reasonLabel}</Label>
            <Select
              value={row.reasonKey}
              onChange={(e) => onReasonChange(e.target.value as ReasonKey)}
              className="h-10"
            >
              {reasonKeys.map((k) => (
                <option key={k} value={k}>
                  {labels.reasonOf(k)}
                </option>
              ))}
            </Select>
          </div>
          {row.reasonKey === 'other' && (
            <div>
              <Label className="mb-1">{labels.otherLabel}</Label>
              <Textarea
                rows={2}
                value={row.otherReason}
                onChange={(e) => onOtherReasonChange(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAttachPhoto}
            >
              <Camera size={14} />
              {labels.addPhoto}
            </Button>
            {row.photoPath && (
              <span className="text-xs text-[var(--color-muted-foreground)] truncate">
                {labels.photoAdded}
                {row.photoNoop ? ` ${labels.noopDev}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
