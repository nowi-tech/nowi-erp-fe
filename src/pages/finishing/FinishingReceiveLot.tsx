import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  Lock,
  Minus,
  Plus,
  Truck,
} from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getAvailability, getLot } from '@/api/lots';
import {
  createReceipts,
  FeatureUnavailableError,
} from '@/api/receipts';
import { useStageId } from '@/lib/useStageId';
import { openRework } from '@/api/rework';
import { requestUploadUrl } from '@/api/storage';
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Dispatch challan state.
  const [warehouses, setWarehouses] = useState<FilterOption[]>([]);
  const [destWarehouseId, setDestWarehouseId] = useState<string>('');
  const [shipQty, setShipQty] = useState<Record<string, number>>({});
  // Partial-dispatch sidestep — user opted to ship what's ready before
  // finishing is fully complete. Toggled by the "Ship N ready units now"
  // link inside the Finishing section. When false, the dispatch section
  // is hidden until isReady (strict gate).
  const [partialDispatchOpen, setPartialDispatchOpen] = useState(false);
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchConfirming, setDispatchConfirming] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const dispatchCancelRef = useRef<HTMLButtonElement>(null);
  const dispatchSectionRef = useRef<HTMLDivElement | null>(null);

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
    setLoading(true);
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
  const canSubmit = !submitting && (totals.forward > 0 || totals.rework > 0);

  // Dispatch section unlocks when finishing is strictly complete OR
  // the user opened the partial sidestep.
  const dispatchUnlocked =
    metrics?.stage === 'dispatched' ||
    metrics?.isReady === true ||
    partialDispatchOpen;
  const dispatchAlreadyDone = metrics?.stage === 'dispatched';

  // When dispatch first unlocks (transition false → true) auto-scroll
  // to the dispatch section so the finisher sees what's now available.
  // Track via a ref so we don't scroll repeatedly on every re-render.
  const wasUnlockedRef = useRef(false);
  useEffect(() => {
    if (
      !wasUnlockedRef.current &&
      dispatchUnlocked &&
      !dispatchAlreadyDone &&
      dispatchSectionRef.current
    ) {
      dispatchSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
    wasUnlockedRef.current = dispatchUnlocked;
  }, [dispatchUnlocked, dispatchAlreadyDone]);

  // Pre-fill ship qty when dispatch unlocks (or partial mode opens).
  // Re-pre-fill if the per-size forwarded numbers change (e.g. user
  // forwards more units, then reopens dispatch).
  useEffect(() => {
    if (!dispatchUnlocked || dispatchAlreadyDone) return;
    setShipQty((prev) => {
      // Only overwrite empty fields — preserve manual edits.
      const next = { ...prev };
      for (const s of sizes) {
        if (next[s] == null || next[s] === 0) {
          next[s] = finishingPerSize[s] ?? 0;
        }
      }
      return next;
    });
  }, [dispatchUnlocked, dispatchAlreadyDone, sizes, finishingPerSize]);

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

  // KNOWN BUG (tracked for second pass): no <input type="file"> here, so
  // the JPG never reaches GCS — only the would-be objectPath is recorded.
  // Works in noop dev mode; broken in prod. See PROD_READINESS.md.
  async function attachPhoto(size: string) {
    if (!lot) return;
    try {
      const res = await requestUploadUrl({
        entityType: 'rework',
        entityId: String(lot.id),
        contentType: 'image/jpeg',
      });
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

  const firstReworkRow = Object.values(rows).find(
    (r) => r.reworkOpen && r.reworkQty > 0,
  );

  // ── Dispatch challan helpers ────────────────────────────────────────────
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

      {loading || !lot || !metrics ? (
        <div className="mt-4 h-32 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : (
        <div className="mt-3">
          <LotHeader lot={lot} metrics={metrics} />
          <ChipRow
            stage={metrics.stage}
            isReady={metrics.isReady}
            unitsRemaining={Math.max(0, metrics.units - metrics.finishingForwarded)}
          />

          {/* FINISHING section — hidden once everything is dispatched. */}
          {metrics.stage !== 'dispatched' && (
            <FinishingSection
              allZero={allZero}
              sizes={sizes}
              available={available}
              rows={rows}
              updateRow={updateRow}
              setForward={setForward}
              setRework={setRework}
              attachPhoto={attachPhoto}
              canSubmit={canSubmit}
              totals={totals}
              onSubmitClick={() => setConfirmOpen(true)}
              partialReadyUnits={metrics.finishingForwarded}
              partialEnabled={
                !metrics.isReady &&
                metrics.finishingForwarded > 0 &&
                !partialDispatchOpen
              }
              onOpenPartial={() => setPartialDispatchOpen(true)}
              metrics={metrics}
            />
          )}

          {/* DISPATCH section — strict gate, with partial sidestep override. */}
          {dispatchUnlocked && (
            <div ref={dispatchSectionRef}>
              {dispatchAlreadyDone ? (
                <DispatchDone lot={lot} />
              ) : (
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
                  isPartial={!metrics.isReady}
                />
              )}
            </div>
          )}
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
    <div className="rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--stage-finish-acc)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px_14px]">
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
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold',
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
// Sticky chip row — Finishing · Dispatch (locked / unlocked)
// ─────────────────────────────────────────────────────────────────────

interface ChipRowProps {
  stage: LifeStage;
  isReady: boolean;
  unitsRemaining: number;
}

function ChipRow({ stage, isReady, unitsRemaining }: ChipRowProps) {
  const { t } = useTranslation();
  const [hint, setHint] = useState(false);
  const dispatchUnlocked =
    isReady || stage === 'dispatched' || stage === 'ready';

  return (
    <div className="sticky top-0 z-10 mt-3.5 -mx-1 px-1 py-2 bg-[var(--color-background)]/90 backdrop-blur-[6px]">
      <div className="flex items-center gap-2">
        <Chip
          icon={
            stage === 'dispatched' ? (
              <CheckCircle2 size={14} />
            ) : null
          }
          label={t('finishing.chip.finishing', { defaultValue: 'Finishing' })}
          tone={
            stage === 'dispatched'
              ? 'done'
              : stage === 'in_progress'
                ? 'active'
                : 'done'
          }
        />
        <Chip
          icon={dispatchUnlocked ? <Truck size={14} /> : <Lock size={14} />}
          label={
            stage === 'dispatched'
              ? t('finishing.chip.dispatchDone', { defaultValue: 'Dispatch ✓' })
              : dispatchUnlocked
                ? t('finishing.chip.dispatch', { defaultValue: 'Dispatch' })
                : t('finishing.chip.dispatchLocked', {
                    defaultValue: 'Dispatch · locked',
                  })
          }
          tone={
            stage === 'dispatched'
              ? 'done'
              : dispatchUnlocked
                ? 'active'
                : 'locked'
          }
          onClick={
            dispatchUnlocked
              ? undefined
              : () => {
                  setHint(true);
                  window.setTimeout(() => setHint(false), 3000);
                }
          }
        />
      </div>
      {hint && !dispatchUnlocked && (
        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-[var(--color-warning-bg)] text-[var(--color-warning)] text-[12px] font-medium">
          {t('finishing.chip.lockedHint', {
            defaultValue: 'Complete finishing first — {{n}} units remaining',
            n: unitsRemaining,
          })}
        </div>
      )}
    </div>
  );
}

function Chip({
  icon,
  label,
  tone,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  tone: 'active' | 'done' | 'locked';
  onClick?: () => void;
}) {
  const toneClasses =
    tone === 'active'
      ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
      : tone === 'done'
        ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
        : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] cursor-pointer';
  return (
    <button
      type="button"
      onClick={onClick}
      // disabled visually only for the locked tone — keep it focusable
      // so the hint can be triggered by keyboard too.
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold transition-colors',
        toneClasses,
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Finishing section — size matrix + primary CTA + partial sidestep
// ─────────────────────────────────────────────────────────────────────

interface FinishingSectionProps {
  allZero: boolean;
  sizes: string[];
  available: SizeMatrix;
  rows: Record<string, RowState>;
  updateRow: (size: string, patch: Partial<RowState>) => void;
  setForward: (size: string, raw: string) => void;
  setRework: (size: string, raw: string) => void;
  attachPhoto: (size: string) => Promise<void>;
  canSubmit: boolean;
  totals: { forward: number; rework: number };
  onSubmitClick: () => void;
  partialReadyUnits: number;
  partialEnabled: boolean;
  onOpenPartial: () => void;
  metrics: LotMetrics;
}

function FinishingSection({
  allZero,
  sizes,
  available,
  rows,
  updateRow,
  setForward,
  setRework,
  attachPhoto,
  canSubmit,
  totals,
  onSubmitClick,
  partialReadyUnits,
  partialEnabled,
  onOpenPartial,
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
                  onToggleRework={(open) =>
                    updateRow(size, {
                      reworkOpen: open,
                      reworkQty: open ? r.reworkQty : 0,
                    })
                  }
                  onReworkQty={(raw) => setRework(size, raw)}
                  onReasonChange={(k) => updateRow(size, { reasonKey: k })}
                  onOtherReasonChange={(v) =>
                    updateRow(size, { otherReason: v })
                  }
                  onAttachPhoto={() => attachPhoto(size)}
                  reasonKeys={REASON_KEYS}
                  labels={{
                    left: t('stitching.lot.left', { defaultValue: 'left' }),
                    rework: t('finishing.markRework', { defaultValue: 'Rework' }),
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
                    reasonOf: (k: ReasonKey) => t(`finishing.reasons.${k}`),
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

      {/* Partial dispatch sidestep — quietly available once at least
          one unit has been forwarded. Doesn't compete with the primary
          CTA above; finisher uses it when a truck is filling and they
          want to ship what's ready instead of waiting. */}
      {partialEnabled && (
        <div className="text-center">
          <button
            type="button"
            onClick={onOpenPartial}
            className="text-[13px] font-semibold text-[var(--color-primary)] hover:underline"
          >
            {t('finishing.lot.shipReady', {
              defaultValue: 'Ship {{n}} ready units now →',
              n: partialReadyUnits,
            })}
          </button>
        </div>
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
  isPartial: boolean;
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
  isPartial,
}: DispatchSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px] space-y-3.5">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold text-[18px] text-[var(--color-foreground)]">
          {t('finishing.dispatch.section', { defaultValue: 'Dispatch' })}
        </div>
        {isPartial && (
          <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 rounded">
            {t('finishing.dispatch.partial', { defaultValue: 'Partial' })}
          </span>
        )}
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
                value={shipQty[size] ?? 0}
                onChange={(e) => setShip(size, e.target.value)}
                className="w-24 text-center"
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
  const reworkPart = row.reworkOpen ? row.reworkQty : 0;
  const fwdCap = Math.max(0, max - reworkPart);
  const filled = row.forwardQty === fwdCap && fwdCap > 0;
  const active = row.forwardQty > 0;
  const disabled = max === 0;

  const set = (v: number) => onForwardChange(Math.max(0, Math.min(fwdCap, v)));

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
