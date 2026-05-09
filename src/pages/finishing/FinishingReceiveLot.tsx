import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import FloorShell from '@/components/layout/FloorShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { getAvailability, getLot } from '@/api/lots';
import { createReceipts, FeatureUnavailableError } from '@/api/receipts';
import { openRework } from '@/api/rework';
import { requestUploadUrl } from '@/api/storage';
import { createDispatch } from '@/api/dispatches';
import { listWarehouses } from '@/api/filters';
import { useAuth } from '@/context/auth';
import type {
  CreateDispatchItemInput,
  FilterOption,
  Lot,
  SizeMatrix,
} from '@/api/types';

const STAGE_ID_FINISHING = 2;

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
  const { lotId = '' } = useParams<{ lotId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const { user } = useAuth();
  const [lot, setLot] = useState<Lot | null>(null);
  const [available, setAvailable] = useState<SizeMatrix>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Dispatch challan state.
  const [warehouses, setWarehouses] = useState<FilterOption[]>([]);
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [shipQty, setShipQty] = useState<Record<string, number>>({});
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const dispatchCancelRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [lotRes, avail] = await Promise.all([
        getLot(lotId),
        getAvailability(lotId, STAGE_ID_FINISHING).catch(() => ({
          stageId: STAGE_ID_FINISHING,
          available: {} as SizeMatrix,
        })),
      ]);
      setLot(lotRes);
      const a = avail.available ?? {};
      setAvailable(a);
      const next: Record<string, RowState> = {};
      Object.keys(a).forEach((s) => {
        next[s] = defaultRow();
      });
      setRows(next);
    } catch {
      toast.show(t('stitching.lot.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [lotId, toast, t]);

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
        entityId: lot.id,
        contentType: 'image/jpeg',
      });
      // Noop dev mode: skip the actual GCS PUT, just record the path.
      updateRow(size, {
        photoPath: res.objectPath,
        photoNoop: !!res.noop,
      });
      toast.show(
        res.noop
          ? `${t('finishing.photoAdded')} ${t('common.noopDevHint')}`
          : t('finishing.photoAdded'),
        'success',
      );
    } catch {
      toast.show(t('common.error'), 'error');
    }
  }

  function reasonText(r: RowState): string {
    if (r.reasonKey === 'other') return r.otherReason.trim() || 'other';
    return t(`finishing.reasons.${r.reasonKey}`);
  }

  async function doSubmit() {
    if (!canSubmit || !lot) return;
    setSubmitting(true);
    try {
      // Forwards (combined into one /api/receipts call).
      const forwardLines = sizes
        .map((s) => ({ sizeLabel: s, qty: rows[s]?.forwardQty ?? 0 }))
        .filter((l) => l.qty > 0);
      if (forwardLines.length) {
        await createReceipts({
          lotId: lot.id,
          stageId: STAGE_ID_FINISHING,
          receipts: forwardLines,
        });
      }
      // Rework: one POST per size with rework qty > 0.
      for (const s of sizes) {
        const r = rows[s];
        if (!r?.reworkOpen || r.reworkQty <= 0) continue;
        await openRework({
          lotId: lot.id,
          sku: lot.sku,
          sizeLabel: s,
          qty: r.reworkQty,
          reason: reasonText(r),
          photoPaths: r.photoPath ? [r.photoPath] : undefined,
        });
      }
      toast.show(t('stitching.lot.successToast'), 'success');
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
      const items: CreateDispatchItemInput[] = dispatchSizes
        .map((s) => ({
          lotId: lot.id,
          sku: lot.sku,
          sizeLabel: s,
          qty: Number(shipQty[s] ?? 0),
        }))
        .filter((i) => i.qty > 0);
      if (items.length === 0) {
        setDispatchError(t('finishing.dispatch.noItems'));
        setDispatching(false);
        return;
      }
      const dispatch = await createDispatch({
        orderId: lot.orderId,
        destWarehouseId,
        items,
      });
      toast.show(
        t('finishing.dispatch.successToast', { dispatchNo: dispatch.dispatchNo }),
        'success',
      );
      setDispatchConfirmOpen(false);
      setShipQty({});
      if (user?.role === 'admin') {
        navigate(`/admin/dispatches/${dispatch.id}`);
      }
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        toast.show(t('common.featureUnavailable'), 'info');
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
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => navigate('/finishing')}>
          ← {t('common.back')}
        </Button>

        {loading ? (
          <div className="h-32 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : lot ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('stitching.lotNo')} {lot.lotNo}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <span className="text-[var(--color-muted-foreground)]">
                    {t('stitching.vendor')}:
                  </span>{' '}
                  {lot.vendor?.name ?? lot.vendorId}
                </div>
                {lot.order && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-muted-foreground)]">Order:</span>
                    <span>{lot.order.orderNo}</span>
                    <Badge variant="outline">{lot.order.status}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('finishing.lot.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {allZero ? (
                  <p className="text-[var(--color-muted-foreground)]">
                    {t('stitching.lot.nothingLeft')}
                  </p>
                ) : (
                  sizes.map((size) => {
                    const max = available[size] ?? 0;
                    const r = rows[size] ?? defaultRow();
                    return (
                      <div
                        key={size}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{size}</span>
                            <span className="ml-2 text-sm text-[var(--color-muted-foreground)]">
                              {t('stitching.lot.available')} {max}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <Label className="mb-0">{t('stitching.lot.forward')}</Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={max}
                            value={r.forwardQty}
                            onChange={(e) => setForward(size, e.target.value)}
                            className="w-24 text-center"
                            disabled={max === 0}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <Label className="mb-0">{t('finishing.markRework')}</Label>
                          <input
                            type="checkbox"
                            checked={r.reworkOpen}
                            onChange={(e) =>
                              updateRow(size, {
                                reworkOpen: e.target.checked,
                                reworkQty: e.target.checked ? r.reworkQty : 0,
                              })
                            }
                            className="h-5 w-5"
                            disabled={max === 0}
                          />
                        </div>

                        {r.reworkOpen && (
                          <div className="space-y-2 rounded bg-[var(--color-muted)] p-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label className="mb-0">{t('finishing.reworkQty')}</Label>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={max}
                                value={r.reworkQty}
                                onChange={(e) => setRework(size, e.target.value)}
                                className="w-24 text-center"
                              />
                            </div>
                            <div>
                              <Label>{t('finishing.reworkReason')}</Label>
                              <Select
                                value={r.reasonKey}
                                onChange={(e) =>
                                  updateRow(size, {
                                    reasonKey: e.target.value as ReasonKey,
                                  })
                                }
                              >
                                {REASON_KEYS.map((k) => (
                                  <option key={k} value={k}>
                                    {t(`finishing.reasons.${k}`)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            {r.reasonKey === 'other' && (
                              <div>
                                <Label>{t('finishing.otherReasonLabel')}</Label>
                                <Textarea
                                  rows={2}
                                  value={r.otherReason}
                                  onChange={(e) =>
                                    updateRow(size, { otherReason: e.target.value })
                                  }
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => attachPhoto(size)}
                              >
                                <Camera size={16} />
                                {t('finishing.addPhoto')}
                              </Button>
                              {r.photoPath && (
                                <span className="text-xs text-[var(--color-muted-foreground)] truncate">
                                  {t('finishing.photoAdded')}
                                  {r.photoNoop ? ` ${t('common.noopDevHint')}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {!allZero && (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit}
                  >
                    {t('finishing.lot.submit')}
                  </Button>
                )}
              </CardContent>
            </Card>
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
          </>
        ) : null}
      </div>

      <Dialog
        open={dispatchConfirmOpen}
        onClose={() => setDispatchConfirmOpen(false)}
        title={t('finishing.dispatch.confirmTitle')}
        initialFocusRef={dispatchCancelRef}
        footer={
          <>
            <Button
              ref={dispatchCancelRef}
              variant="outline"
              onClick={() => setDispatchConfirmOpen(false)}
              disabled={dispatching}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void doDispatch()} disabled={dispatching}>
              {dispatching ? t('common.saving') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>
          {t('finishing.dispatch.confirmBody', {
            total: dispatchTotal,
            sku: lot?.sku ?? '',
            warehouse: destWarehouse?.name ?? '',
          })}
        </p>
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
