import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  Minus,
  Plus,
} from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getAvailability, getLot } from '@/api/lots';
import {
  createReceipts,
  FeatureUnavailableError,
} from '@/api/receipts';
import { useStageId } from '@/lib/useStageId';
import { openRework } from '@/api/rework';
import { uploadPhoto } from '@/api/storage';
import { createDispatch } from '@/api/dispatches';
import { listWarehouses } from '@/api/filters';
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

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

type LifeStage =
  | 'in_progress'
  | 'ready'
  | 'dispatched'
  | 'rework'
  | 'stuck';

interface LotMetrics {
  units: number;
  stitchForwarded: number;
  finishingForwarded: number;
  stage: LifeStage;
  isReady: boolean;
}

function deriveMetrics(lot: Lot): LotMetrics {
  const units = totalUnits(lot.qtyIn);
  const stitchForwarded = lot.stageForwarded?.stitching ?? 0;
  const finishingForwarded = lot.stageForwarded?.finishing ?? 0;
  const status = lot.order?.status;
  const isReady =
    units > 0 && stitchForwarded >= units && finishingForwarded >= units;
  const stage: LifeStage =
    status === 'stuck'
      ? 'stuck'
      : status === 'in_rework'
        ? 'rework'
        : status === 'dispatched' ||
            status === 'closed' ||
            status === 'closed_with_adjustment'
          ? 'dispatched'
          : isReady
            ? 'ready'
            : 'in_progress';
  return { units, stitchForwarded, finishingForwarded, stage, isReady };
}

export default function FinishingReceiveLot() {
  const { t } = useTranslation();
  const { lotId: lotIdParam = '' } = useParams<{ lotId: string }>();
  const lotId = Number(lotIdParam);
  const navigate = useNavigate();

  const [lot, setLot] = useState<Lot | null>(null);
  const [available, setAvailable] = useState<SizeMatrix>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const finishingStageId = useStageId('finishing');
  // No separate `loading` flag — the page gates on `!lot || !metrics`
  // so the skeleton shows only on first load, never on later refreshes.
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Rework modal state — opened by the per-row "Rework" button, mirroring
  // the stitching scrap-modal pattern. The size whose rework dialog is
  // open; null = closed. All rework data still lives in `rows[size]`, so
  // the existing submission path (openRework in doSubmit) is untouched —
  // this just moves the editing UI from an inline panel into the shared
  // Dialog shell.
  const [reworkSize, setReworkSize] = useState<string | null>(null);
  const [reworkSubmitting, setReworkSubmitting] = useState(false);
  const reworkDoneRef = useRef<HTMLButtonElement>(null);

  // Dispatch challan state.
  const [warehouses, setWarehouses] = useState<FilterOption[]>([]);
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [shipQty, setShipQty] = useState<Record<string, number>>({});
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchConfirming, setDispatchConfirming] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const dispatchCancelRef = useRef<HTMLButtonElement>(null);

  // Per-size finishing forwarded — computed from receipts so we can
  // pre-fill the dispatch ship-qty inputs intelligently. The BE auth-
  // oritatively gates over-dispatch on submit, so we don't have to
  // perfectly track already-dispatched units client-side; if a prior
  // partial dispatch consumed some, the BE rejects and the user edits
  // down.
  const finishingPerSize = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (!lot?.receipts || finishingStageId == null) return out;
    for (const r of lot.receipts) {
      if (r.stageId === finishingStageId && r.kind === 'forward') {
        out[r.sizeLabel] = (out[r.sizeLabel] ?? 0) + r.qty;
      }
    }
    return out;
  }, [lot?.receipts, finishingStageId]);

  const refresh = useCallback(async () => {
    if (finishingStageId == null) return;
    try {
      const [lotRes, avail] = await Promise.all([
        getLot(lotId),
        getAvailability(lotId, finishingStageId).catch(() => ({
          stageId: finishingStageId,
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
    } catch (err) {
      // BE returns 403 when this finisher isn't assigned to the lot
      // (admin / FM / viewer can see anything). Bounce them back to the
      // queue with a one-line explanation so they're not stuck on a
      // half-loaded page.
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403) {
        sonnerToast.error(
          t('finishing.lot.notAssigned', {
            defaultValue: 'This lot is not assigned to you.',
          }),
        );
        navigate('/finishing', { replace: true });
        return;
      }
      sonnerToast.error(t('stitching.lot.loadError'));
    }
  }, [lotId, finishingStageId, navigate, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listWarehouses().then(setWarehouses).catch(() => undefined);
  }, []);

  const sizes = useMemo(() => Object.keys(available ?? {}), [available]);
  const metrics = lot ? deriveMetrics(lot) : null;

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
  // Forward-only: rework is committed straight from its modal now.
  const canSubmit = !submitting && totals.forward > 0;

  // Dispatch section is always visible — finisher can ship whatever
  // they've forwarded out of finishing at any time. Per-size cap on the
  // input enforces "only what you've processed". The post-dispatch
  // confirmation card replaces the form once the lot is fully shipped.
  const dispatchAlreadyDone = metrics?.stage === 'dispatched';
  // Anything sitting in finishing's "done" pool, awaiting dispatch.
  // Drives whether the Dispatch section even renders — an empty
  // form with all-zero caps is confusing before anything is ready.
  const hasDispatchable = Object.values(finishingPerSize).some(
    (v) => (v ?? 0) > 0,
  );

  // Pre-fill ship qty with what's currently forwarded out of finishing.
  // Preserve manual edits — only overwrite empty/zero fields.
  useEffect(() => {
    if (dispatchAlreadyDone) return;
    setShipQty((prev) => {
      const next = { ...prev };
      for (const s of sizes) {
        if (next[s] == null || next[s] === 0) {
          next[s] = finishingPerSize[s] ?? 0;
        }
      }
      return next;
    });
  }, [dispatchAlreadyDone, sizes, finishingPerSize]);

  function updateRow(size: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [size]: { ...prev[size], ...patch } }));
  }

  // Open the rework dialog for a size. Mark the row's rework as "open" so
  // it stays included in totals/submit — same semantics the inline toggle
  // had, just triggered from the modal flow now.
  function openReworkModal(size: string) {
    const cur = rows[size] ?? defaultRow();
    updateRow(size, {
      reworkOpen: true,
      reworkQty: cur.reworkQty > 0 ? cur.reworkQty : 0,
    });
    setReworkSize(size);
  }

  // Cancel: discard any in-progress rework edits for this size. Rework is
  // now committed straight from the modal (submitReworkForSize), never
  // staged into the global forward submit — so closing always resets.
  function closeReworkModal() {
    if (reworkSubmitting) return;
    const size = reworkSize;
    if (size) {
      updateRow(size, { reworkOpen: false, reworkQty: 0 });
    }
    setReworkSize(null);
  }

  // Commit this size's rework immediately (one self-contained step):
  // POST /rework with qty + reason + photo, then refresh. Forwarding good
  // units stays a separate action — they are different operations.
  async function submitReworkForSize() {
    const size = reworkSize;
    if (!size || !lot) return;
    const r = rows[size];
    if (!r || r.reworkQty <= 0) return;
    // Defect photo is RECOMMENDED but optional. A blocked camera /
    // failed GCS upload shouldn't stop a finisher from sending units
    // back — the reason text carries enough context. We just nudge
    // them once with a warning toast and proceed.
    if (!r.photoPath) {
      sonnerToast.warning(
        t('finishing.photoMissingHint', {
          defaultValue:
            'No defect photo — proceeding anyway. Add one later if possible.',
        }),
      );
    }
    const reworkStyleId = lot.style?.styleId ?? lot.sku;
    if (!reworkStyleId) {
      sonnerToast.error(t('common.error'));
      return;
    }
    setReworkSubmitting(true);
    try {
      await openRework({
        lotId: lot.id,
        sku: `${reworkStyleId}-${size}`,
        sizeLabel: size,
        qty: r.reworkQty,
        reason: reasonText(r),
        photoPaths: r.photoPath ? [r.photoPath] : [],
      });
      sonnerToast.warning(
        t('finishing.lot.reworkToast', {
          defaultValue: 'Sent {{n}} units back for rework',
          n: r.reworkQty,
        }),
        { duration: 4500 },
      );
      // Reset this row's rework fields and close before refreshing.
      updateRow(size, {
        reworkOpen: false,
        reworkQty: 0,
        photoPath: null,
        photoNoop: false,
      });
      setReworkSize(null);
      await refresh();
    } catch (err) {
      if (err instanceof FeatureUnavailableError) {
        sonnerToast.info(t('common.featureUnavailable'));
      } else {
        sonnerToast.error(t('common.error'));
      }
    } finally {
      setReworkSubmitting(false);
    }
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

  // attachPhoto now actually PUTs the bytes to GCS via uploadPhoto.
  // The caller (FinishSizeRow) wires a hidden <input type="file"
  // accept="image/*" capture="environment"> and forwards the picked
  // file here. In noop dev mode the BE returns noop=true and uploadPhoto
  // skips the PUT, so the dev flow stays identical.
  //
  // Android-WebView gotcha: camera captures sometimes arrive with an
  // empty `file.type`, or with a non-allowlisted MIME like `image/jpg`.
  // Normalization lives in `uploadPhoto` / `resolvePhotoContentType` so
  // this caller stays simple.
  async function attachPhoto(size: string, file: File) {
    if (!lot) return;
    // Defensive: bail early if the picker handed us something that isn't
    // an image at all (e.g. a doc on a desktop file picker). The BE
    // would reject this with a confusing 400; better to fail with a
    // clear local message.
    // Only accept what the BE allow-list actually accepts: JPEG / PNG
    // / WebP. heic/heif from iPhones aren't supported by the BE, so
    // we reject locally with a clear toast instead of letting the
    // upload 400 later.
    const supportedType =
      file.type === 'image/jpeg' ||
      file.type === 'image/png' ||
      file.type === 'image/webp' ||
      file.type === 'image/jpg' ||
      file.type === '';
    const supportedExt = /\.(jpe?g|png|webp)$/i.test(file.name);
    const looksLikeImage = supportedType && (file.type !== '' || supportedExt);
    if (!looksLikeImage) {
      sonnerToast.error(
        t('finishing.photoMustBeImage', {
          defaultValue: 'Please pick an image (JPG/PNG/WebP).',
        }),
      );
      return;
    }
    try {
      const res = await uploadPhoto('rework', lot.id, file);
      updateRow(size, {
        photoPath: res.objectPath,
        photoNoop: res.noop,
      });
      sonnerToast.success(
        res.noop
          ? `${t('finishing.photoAdded')} ${t('common.noopDevHint')}`
          : t('finishing.photoAdded'),
      );
    } catch (err) {
      // Surface the real reason — the previous generic "common.error"
      // toast hid network / permission failures and made the user think
      // the whole flow was broken. The thrown error from uploadPhoto
      // includes the HTTP status when the GCS PUT fails.
      const msg =
        err instanceof Error && err.message
          ? err.message
          : t('common.error');
      sonnerToast.error(msg);
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
      // Rework is no longer part of this submit — it commits immediately
      // from the rework modal (submitReworkForSize). This path forwards
      // good units only.
      const fwd = forwardLines.reduce((a, l) => a + l.qty, 0);
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


  // ── Dispatch challan helpers ────────────────────────────────────────────
  const dispatchTotal = useMemo(
    () => Object.values(shipQty).reduce((a, b) => a + (Number(b) || 0), 0),
    [shipQty],
  );
  const canDispatchSubmit =
    !!lot && !!destWarehouseId && dispatchTotal > 0 && !dispatching;

  function setShip(size: string, raw: string) {
    // Hard cap: only ship what's been forwarded out of finishing for
    // this size. The BE re-validates, but capping here keeps the user
    // from typing a number that's guaranteed to fail.
    const cap = finishingPerSize[size] ?? 0;
    const v = Math.max(0, Math.min(cap, parseInt(raw, 10) || 0));
    setShipQty((prev) => ({ ...prev, [size]: v }));
  }

  async function doDispatch() {
    if (!lot || !destWarehouseId) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      const styleId = lot.style?.styleId ?? lot.sku;
      const items: CreateDispatchItemInput[] = sizes
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
          {t('finishing.queueShort', { defaultValue: 'Queue' })}
        </button>
      </div>

      {!lot || !metrics ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="mt-3">
          <LotHeader lot={lot} metrics={metrics} />

          {/* FINISHING section — hidden once everything is dispatched. */}
          {metrics.stage !== 'dispatched' && (
            <div>
              <FinishingSection
                allZero={allZero}
                sizes={sizes}
                available={available}
                rows={rows}
                updateRow={updateRow}
                setForward={setForward}
                onOpenRework={openReworkModal}
                canSubmit={canSubmit}
                totals={totals}
                onSubmitClick={() => setConfirmOpen(true)}
                metrics={metrics}
              />
            </div>
          )}

          {/* DISPATCH section — only renders once something is actually
              forwarded out of finishing. Before that, a quiet note tells
              the user *why* there's nothing to dispatch yet, instead of
              an empty form with all-zero caps. */}
          <div>
            {dispatchAlreadyDone ? (
              <DispatchDone lot={lot} />
            ) : hasDispatchable ? (
              <DispatchSection
                sizes={sizes}
                warehouses={warehouses}
                destWarehouseId={destWarehouseId}
                setDestWarehouseId={setDestWarehouseId}
                shipQty={shipQty}
                setShip={setShip}
                finishingPerSize={finishingPerSize}
                dispatchError={dispatchError}
                canDispatchSubmit={canDispatchSubmit}
                onSubmitClick={() => setDispatchConfirmOpen(true)}
              />
            ) : (
              <p className="mt-6 text-[13px] text-[var(--color-muted-foreground)]">
                {t('finishing.dispatch.notReady', {
                  defaultValue:
                    'Nothing ready to dispatch yet — finish at least one size first.',
                })}
              </p>
            )}
          </div>
        </div>
      )}

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
        </div>
      </Dialog>

      {/* Rework modal — mirrors the stitching scrap-modal pattern: a
          per-row trigger opens this shared Dialog; the qty / reason /
          photo controls (unchanged) live inside. Submission is still
          handled by doSubmit → openRework, so nothing about what rework
          sends has changed — only where it's edited. */}
      {(() => {
        const rs = reworkSize ? rows[reworkSize] ?? defaultRow() : null;
        const maxRework = reworkSize
          ? Math.max(0, (available[reworkSize] ?? 0) - (rs?.forwardQty ?? 0))
          : 0;
        return (
          <Dialog
            open={reworkSize !== null}
            onClose={closeReworkModal}
            title={t('finishing.markRework', { defaultValue: 'Mark rework' })}
            initialFocusRef={reworkDoneRef}
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={closeReworkModal}
                  disabled={reworkSubmitting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  ref={reworkDoneRef}
                  onClick={() => void submitReworkForSize()}
                  disabled={
                    reworkSubmitting ||
                    !rs ||
                    rs.reworkQty <= 0
                  }
                >
                  {reworkSubmitting
                    ? t('common.saving')
                    : t('finishing.sendBackForRework', {
                        defaultValue: 'Send back for rework',
                      })}
                </Button>
              </>
            }
          >
            {reworkSize && rs && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="mb-0">{t('finishing.reworkQty')}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={maxRework}
                    value={rs.reworkQty || ''}
                    placeholder="0"
                    onChange={(e) => setRework(reworkSize, e.target.value)}
                    className="w-24 h-10 text-center"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="mb-1">{t('finishing.reworkReason')}</Label>
                  <Select
                    value={rs.reasonKey}
                    onChange={(e) =>
                      updateRow(reworkSize, {
                        reasonKey: e.target.value as ReasonKey,
                      })
                    }
                    className="h-10"
                  >
                    {REASON_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`finishing.reasons.${k}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                {rs.reasonKey === 'other' && (
                  <div>
                    <Label className="mb-1">
                      {t('finishing.otherReasonLabel')}
                    </Label>
                    <Textarea
                      rows={2}
                      value={rs.otherReason}
                      onChange={(e) =>
                        updateRow(reworkSize, { otherReason: e.target.value })
                      }
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {/* Native file input — capture="environment" opens the
                      rear camera directly on mobile so floor staff don't
                      have to tap through the gallery. The visible button
                      is just a styled label proxy.

                      `accept="image/*"` is intentional even though the BE
                      only allows JPEG/PNG/WebP: some Android WebView
                      builds silently ignore `capture` when `accept` is a
                      narrow MIME list (e.g. "image/jpeg,image/png"),
                      falling back to the gallery picker instead of the
                      camera. The MIME is normalised + validated in
                      uploadPhoto / attachPhoto. */}
                  {/* A <button> inside a <label> does NOT receive label
                      activation (HTML spec — labels skip nested form
                      controls), so the camera/file picker wouldn't open.
                      Use a styled <span role="button"> as the visible
                      trigger instead; the surrounding label forwards
                      taps to the hidden file input as expected.

                      `accept="image/*"` is intentional even though the BE
                      only allows JPEG/PNG/WebP: some Android WebView
                      builds silently ignore `capture` when `accept` is a
                      narrow MIME list (e.g. "image/jpeg,image/png"),
                      falling back to the gallery picker instead of the
                      camera. The MIME is normalised + validated in
                      uploadPhoto / attachPhoto. */}
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void attachPhoto(reworkSize, file);
                        // Reset so picking the same file twice still
                        // fires onChange.
                        e.target.value = '';
                      }}
                    />
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        // Span needs an explicit keyboard handler —
                        // unlike a real <button>, Enter/Space don't
                        // activate the parent <label> automatically.
                        // Forward to the previous sibling (the
                        // hidden file input) so keyboard users get
                        // the same picker as click users.
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const input = e.currentTarget
                            .previousElementSibling as HTMLInputElement | null;
                          input?.click();
                        }
                      }}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-input)] bg-transparent px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
                    >
                      <Camera size={14} />
                      {t('finishing.addPhoto')}
                    </span>
                  </label>
                  {rs.photoPath && (
                    <span className="text-xs text-[var(--color-muted-foreground)] truncate">
                      {t('finishing.photoAdded')}
                      {rs.photoNoop ? ` ${t('common.noopDevHint')}` : ''}
                    </span>
                  )}
                </div>
                {!rs.photoPath && (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {t('finishing.photoOptionalHint', {
                      defaultValue:
                        'A defect photo is recommended but optional.',
                    })}
                  </p>
                )}
              </div>
            )}
          </Dialog>
        );
      })()}
    </FloorShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header — title + product line + status pill
// ─────────────────────────────────────────────────────────────────────

interface LotHeaderProps {
  lot: Lot;
  metrics: LotMetrics;
}

function LotHeader({ lot, metrics }: LotHeaderProps) {
  const { t } = useTranslation();
  const productLabel = lot.style
    ? [
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
        .join(' ')
    : null;

  return (
    <div className="rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_14px]">
      <div className="font-semibold text-[26px] leading-[1.05] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
        {lot.lotNo}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
        {productLabel && (
          <span className="font-medium text-[var(--color-foreground)]">
            {productLabel}
          </span>
        )}
        <span className="text-[var(--color-muted-foreground-2)]">·</span>
        <span>{lot.vendor?.name ?? lot.vendorId}</span>
        <span className="text-[var(--color-muted-foreground-2)]">·</span>
        <span className="font-mono tabular-nums">{metrics.units}u</span>
      </div>
      <div className="mt-2.5">
        <StagePill metrics={metrics} />
      </div>
    </div>
  );
}

function StagePill({ metrics }: { metrics: LotMetrics }) {
  const { t } = useTranslation();
  const styleByStage: Record<LifeStage, { bg: string; text: string; label: string }> = {
    in_progress: {
      bg: 'bg-[var(--color-primary-soft)]',
      text: 'text-[var(--color-primary)]',
      label: t('finishing.pill.inProgress', {
        defaultValue: 'In Progress · {{done}} / {{total}}',
        done: metrics.finishingForwarded,
        total: metrics.units,
      }),
    },
    ready: {
      bg: 'bg-[var(--color-success-bg)]',
      text: 'text-[var(--color-success)]',
      label: t('finishing.pill.ready', {
        defaultValue: 'Ready to Dispatch · {{n}} / {{n}}',
        n: metrics.units,
      }),
    },
    dispatched: {
      bg: 'bg-[var(--color-warning-bg)]',
      text: 'text-[var(--color-warning)]',
      label: t('finishing.pill.dispatched', {
        defaultValue: 'Dispatched · awaiting GRN',
      }),
    },
    rework: {
      bg: 'bg-[var(--status-rework-bg)]',
      text: 'text-[var(--status-rework-ink)]',
      label: t('finishing.pill.rework', {
        defaultValue: 'Rework in progress',
      }),
    },
    stuck: {
      bg: 'bg-[var(--color-destructive-bg)]',
      text: 'text-[var(--color-destructive-strong)]',
      label: t('finishing.pill.stuck', { defaultValue: 'Stuck — admin only' }),
    },
  };
  const s = styleByStage[metrics.stage];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em]',
        s.bg,
        s.text,
      )}
    >
      <span
        aria-hidden
        className={cn('inline-block w-1.5 h-1.5 rounded-full', s.text.replace('text-', 'bg-'))}
      />
      {s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Finishing section — size matrix + primary CTA
// ─────────────────────────────────────────────────────────────────────

interface FinishingSectionProps {
  allZero: boolean;
  sizes: string[];
  available: SizeMatrix;
  rows: Record<string, RowState>;
  updateRow: (size: string, patch: Partial<RowState>) => void;
  setForward: (size: string, raw: string) => void;
  onOpenRework: (size: string) => void;
  canSubmit: boolean;
  totals: { forward: number; rework: number };
  onSubmitClick: () => void;
  metrics: LotMetrics;
}

function FinishingSection({
  allZero,
  sizes,
  available,
  rows,
  updateRow,
  setForward,
  onOpenRework,
  canSubmit,
  totals,
  onSubmitClick,
  metrics,
}: FinishingSectionProps) {
  const { t } = useTranslation();
  // Three flavours of "no inputs" — copy + iconography differ so the
  // finisher knows whether to wait, dispatch, or do nothing.
  const isAllForwarded = allZero && metrics.isReady;
  const isWaitingOnStitch =
    allZero &&
    !metrics.isReady &&
    metrics.units > metrics.finishingForwarded;
  const stitchPending = Math.max(0, metrics.units - metrics.stitchForwarded);

  return (
    <div className="mt-4 space-y-3.5">
      <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_6px]">
        <div className="flex items-baseline justify-between">
          <div className="font-semibold text-[18px] text-[var(--color-foreground)]">
            {t('stitching.lot.forward', { defaultValue: 'Forward' })}
          </div>
          <span className="text-[12px] text-[var(--color-muted-foreground)] font-mono">
            {t('stitching.lot.bySize', { defaultValue: 'by size' })}
          </span>
        </div>
        {!allZero && (
          <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
            {t('stitching.lot.forwardHint', {
              defaultValue: 'Tap size to forward all, or set quantity manually.',
            })}
          </p>
        )}
        {allZero ? (
          <div className="mt-3 pb-3 space-y-1">
            {isWaitingOnStitch ? (
              <>
                <p className="text-[14px] font-medium text-[var(--color-foreground)]">
                  {t('finishing.lot.waitingOnStitch', {
                    defaultValue: 'Waiting on stitching',
                  })}
                </p>
                <p className="text-[12px] text-[var(--color-muted-foreground)]">
                  {t('finishing.lot.waitingOnStitchSub', {
                    defaultValue:
                      '{{received}} of {{total}} received from stitching · {{pending}} still being made',
                    received: metrics.stitchForwarded,
                    total: metrics.units,
                    pending: stitchPending,
                  })}
                </p>
              </>
            ) : isAllForwarded ? (
              <p className="text-[14px] font-medium text-[var(--color-success)]">
                {t('finishing.lot.allForwarded', {
                  defaultValue:
                    'All units forwarded · create the dispatch challan below',
                })}
              </p>
            ) : (
              <p className="text-[var(--color-muted-foreground)]">
                {t('stitching.lot.nothingLeft')}
              </p>
            )}
          </div>
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
                  onForwardChange={(v) => updateRow(size, { forwardQty: v })}
                  onSetForward={(raw) => setForward(size, raw)}
                  onOpenRework={() => onOpenRework(size)}
                  labels={{
                    left: t('stitching.lot.left', { defaultValue: 'left' }),
                    rework: t('finishing.markRework', { defaultValue: 'Rework' }),
                    forwardAll: t('stitching.lot.forwardAll', {
                      defaultValue: 'Forward all {{n}}',
                      n: max,
                    }),
                    clear: t('common.clear', { defaultValue: 'Clear' }),
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
          onClick={onSubmitClick}
          disabled={!canSubmit}
          className={cn(
            'w-full p-[18px] rounded-[14px] text-center font-semibold text-[16px] tracking-[0.01em] text-white transition-transform active:translate-y-px',
            canSubmit
              ? 'bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_10px_24px_rgba(34,64,196,0.32)]'
              : 'bg-[var(--color-disabled-bg)] cursor-default',
          )}
        >
          {totals.forward > 0
            ? t('finishing.lot.submitN', {
                defaultValue: 'Send {{n}} {{unit}} →',
                n: totals.forward,
                unit:
                  totals.forward === 1
                    ? t('common.unit', { defaultValue: 'unit' })
                    : t('common.units'),
              })
            : t('finishing.lot.submit')}
        </button>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Dispatch section — warehouse picker + per-size ship qty
// ─────────────────────────────────────────────────────────────────────

interface DispatchSectionProps {
  sizes: string[];
  warehouses: FilterOption[];
  destWarehouseId: string;
  setDestWarehouseId: (id: string) => void;
  shipQty: Record<string, number>;
  setShip: (size: string, raw: string) => void;
  finishingPerSize: Record<string, number>;
  dispatchError: string | null;
  canDispatchSubmit: boolean;
  onSubmitClick: () => void;
}

function DispatchSection({
  sizes,
  warehouses,
  destWarehouseId,
  setDestWarehouseId,
  shipQty,
  setShip,
  finishingPerSize,
  dispatchError,
  canDispatchSubmit,
  onSubmitClick,
}: DispatchSectionProps) {
  const { t } = useTranslation();
  const totalReady = sizes.reduce((a, s) => a + (finishingPerSize[s] ?? 0), 0);
  return (
    <div className="mt-4 rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px] space-y-3.5">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold text-[18px] text-[var(--color-foreground)]">
          {t('finishing.dispatch.section', { defaultValue: 'Dispatch' })}
        </div>
        <span className="text-[12px] text-[var(--color-muted-foreground)] font-mono tabular-nums">
          {t('finishing.dispatch.readyTotal', {
            defaultValue: '{{n}} ready to ship',
            n: totalReady,
          })}
        </span>
      </div>

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

      <div className="space-y-1">
        <Label>{t('finishing.dispatch.shipQty', { defaultValue: 'Ship quantity' })}</Label>
        {sizes.map((size) => {
          const ready = finishingPerSize[size] ?? 0;
          return (
            <div
              key={`ship-${size}`}
              className="flex items-center justify-between gap-3 py-1"
            >
              <div className="min-w-[44px] h-7 px-1.5 rounded-[var(--radius-sm)] flex items-center justify-center font-semibold text-xs bg-[var(--color-muted)]">
                {size}
              </div>
              <span className="flex-1 text-[12px] text-[var(--color-muted-foreground)] font-mono tabular-nums">
                {t('finishing.dispatch.readyN', {
                  defaultValue: '{{n}} ready',
                  n: ready,
                })}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={ready}
                value={shipQty[size] || ''}
                placeholder="0"
                onChange={(e) => setShip(size, e.target.value)}
                disabled={ready === 0}
                className="w-24 text-center disabled:opacity-50"
              />
            </div>
          );
        })}
      </div>

      {dispatchError && (
        <p className="text-sm text-[var(--color-destructive)]">
          {dispatchError}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmitClick}
        disabled={!canDispatchSubmit}
        className={cn(
          'w-full p-[16px] rounded-[14px] text-center font-semibold text-[15px] text-white transition-transform active:translate-y-px',
          canDispatchSubmit
            ? 'bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)]'
            : 'bg-[var(--color-disabled-bg)] cursor-default',
        )}
      >
        {t('finishing.dispatch.createChallan', {
          defaultValue: 'Create Dispatch Challan',
        })}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Post-dispatch confirmation card — shown when status === 'dispatched'
// ─────────────────────────────────────────────────────────────────────

function DispatchDone({ lot }: { lot: Lot }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-success)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px] space-y-2">
      <div className="flex items-center gap-2 text-[var(--color-success)]">
        <CheckCircle2 size={18} />
        <span className="font-semibold text-[15px]">
          {t('finishing.dispatch.done', { defaultValue: 'Dispatched · awaiting GRN' })}
        </span>
      </div>
      <p className="text-[13px] text-[var(--color-foreground-2)]">
        {t('finishing.dispatch.doneBody', {
          defaultValue:
            'Lot {{lotNo}} has been dispatched and synced. Wait for the destination warehouse to confirm receipt.',
          lotNo: lot.lotNo,
        })}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-size finishing input row (forward + optional rework)
// ─────────────────────────────────────────────────────────────────────

function FinishSizeRow({
  size,
  max,
  row,
  onForwardChange,
  onSetForward,
  onOpenRework,
  labels,
}: {
  size: string;
  max: number;
  row: RowState;
  onForwardChange: (v: number) => void;
  onSetForward: (raw: string) => void;
  onOpenRework: () => void;
  labels: {
    left: string;
    rework: string;
    forwardAll: string;
    clear: string;
  };
}) {
  const reworkPart = row.reworkOpen ? row.reworkQty : 0;
  const fwdCap = Math.max(0, max - reworkPart);
  const filled = row.forwardQty === fwdCap && fwdCap > 0;
  const active = row.forwardQty > 0;
  const disabled = max === 0;

  const set = (v: number) => onForwardChange(Math.max(0, Math.min(fwdCap, v)));

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0 py-2.5">
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
              ? 'text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_10px_rgba(34,64,196,0.25)]'
              : 'text-[var(--color-foreground)] bg-[var(--color-muted)] shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-[var(--color-primary-soft)]',
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
            className="w-8 h-8 rounded-[9px] bg-[var(--color-muted)] text-[var(--color-foreground)] flex items-center justify-center disabled:opacity-40 shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]"
          >
            <Minus size={16} strokeWidth={2.4} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={row.forwardQty || ''}
            placeholder="0"
            onChange={(e) => onSetForward(e.target.value)}
            disabled={disabled}
            className={cn(
              'w-[42px] h-9 text-center rounded-[9px] border bg-[var(--color-surface)] text-[16px] font-semibold tabular-nums outline-none transition-colors',
              row.forwardQty > 0
                ? 'border-[var(--color-primary)]'
                : 'border-[var(--color-border-strong)]',
            )}
          />
          <button
            type="button"
            onClick={() => set(row.forwardQty + 1)}
            disabled={disabled || row.forwardQty >= fwdCap}
            aria-label="+"
            className="w-8 h-8 rounded-[9px] bg-[var(--color-muted)] text-[var(--color-foreground)] flex items-center justify-center disabled:opacity-40 shadow-[inset_0_-1px_0_rgba(14,23,48,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]"
          >
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenRework}
          disabled={disabled}
          className={cn(
            'ml-0.5 px-1.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.02em] transition-colors disabled:opacity-40',
            row.reworkOpen && row.reworkQty > 0
              ? 'bg-[var(--status-rework-bg)] text-[var(--status-rework-ink)]'
              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--status-rework-bg)] hover:text-[var(--status-rework-ink)]',
          )}
        >
          {row.reworkOpen && row.reworkQty > 0
            ? `${labels.rework} · ${row.reworkQty}`
            : labels.rework}
        </button>
      </div>
    </div>
  );
}
