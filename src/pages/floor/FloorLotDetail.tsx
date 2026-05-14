import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, UserPlus } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import StageTimeline from '@/components/StageTimeline';
import { Dialog } from '@/components/ui/dialog';
import { assignLot, getLot } from '@/api/lots';
import { listStitchingMasters, type StitchingMaster } from '@/api/users';
import type { Lot } from '@/api/types';
import { cn } from '@/lib/utils';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

export default function FloorLotDetail() {
  const { t } = useTranslation();
  const { lotId: lotIdParam = '' } = useParams<{ lotId: string }>();
  const lotId = Number(lotIdParam);
  const navigate = useNavigate();

  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [masters, setMasters] = useState<StitchingMaster[]>([]);
  const [assigning, setAssigning] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const l = await getLot(lotId);
      setLot(l);
    } catch {
      sonnerToast.error(t('stitching.lot.loadError'));
    } finally {
      setLoading(false);
    }
  }, [lotId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!assignOpen) return;
    listStitchingMasters()
      .then(setMasters)
      .catch(() => setMasters([]));
  }, [assignOpen]);

  async function doAssign(userId: number) {
    if (!lot) return;
    setAssigning(userId);
    const master = masters.find((m) => m.id === userId);
    try {
      await assignLot(lot.id, userId);
      sonnerToast.success(
        t('floor.assignSuccessToast', {
          defaultValue: 'Assigned to {{name}}',
          name: master?.name ?? '',
        }),
      );
      setAssignOpen(false);
      await refresh();
    } catch {
      sonnerToast.error(t('common.error'));
    } finally {
      setAssigning(null);
    }
  }

  const units = lot ? totalUnits(lot.qtyIn) : 0;
  const sizes = lot ? Object.keys(lot.qtyIn ?? {}) : [];
  const inEditWindow = lot
    ? Date.now() - new Date(lot.createdAt).getTime() <= EDIT_WINDOW_MS
    : false;
  const isAssigned = lot?.assignedUserId != null;
  const productLabel = lot?.style
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
    <FloorShell>
      <div>
        <button
          type="button"
          onClick={() => navigate('/floor')}
          className="inline-flex items-center gap-1 pr-3.5 pl-2 py-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-foreground)] shadow-[0_1px_1px_rgba(14,23,48,0.03)] hover:bg-[var(--color-muted)] transition-colors"
        >
          <ChevronLeft size={20} />
          {t('floor.title')}
        </button>
      </div>

      {loading || !lot ? (
        <div className="mt-3 h-32 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : (
        <div className="mt-3 space-y-3.5">
          {/* Identity */}
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
              <span className="font-mono tabular-nums">{units}u</span>
            </div>
            <div className="mt-3">
              <StageTimeline status={lot.order?.status} size="detail" />
            </div>
          </div>

          {/* Per-stage production status — units forwarded at each
              stage with a thin progress bar tinted to the stage accent.
              Builds on lot.stageForwarded which the BE list already
              provides; getById should also include it. Falls back to
              0 for missing keys. */}
          <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px] space-y-3">
            <div className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[var(--color-muted-foreground)]">
              {t('floor.statusBreakdown', { defaultValue: 'Production status' })}
            </div>
            <StageProgressRow
              label={t('stages.stitching')}
              done={lot.stageForwarded?.stitching ?? 0}
              total={units}
              accent="var(--stage-stitch-acc)"
              bg="var(--stage-stitch-bg)"
            />
            <StageProgressRow
              label={t('stages.finishing')}
              done={lot.stageForwarded?.finishing ?? 0}
              total={units}
              accent="var(--stage-finish-acc)"
              bg="var(--stage-finish-bg)"
            />
            <StageProgressRow
              label={t('stages.dispatch')}
              done={lot.stageForwarded?.dispatch ?? 0}
              total={units}
              accent="var(--stage-disp-acc)"
              bg="var(--stage-disp-bg)"
            />
            {lot.order?.status && (
              <div className="pt-2 border-t border-[var(--color-border)] text-[12px] text-[var(--color-muted-foreground)] flex items-center justify-between">
                <span className="font-mono uppercase tracking-wide">
                  {t('floor.currentStatus', { defaultValue: 'Status' })}
                </span>
                <span className="font-mono text-[var(--color-foreground)]">
                  {lot.order.status}
                </span>
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[var(--color-muted-foreground)]">
                  {t('floor.assignedSection')}
                </div>
                <div className="mt-1 text-[15px] font-medium text-[var(--color-foreground)]">
                  {lot.assignedUser?.name ?? '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-semibold transition-transform active:translate-y-px',
                  isAssigned
                    ? 'text-[var(--color-foreground)] border border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]'
                    : 'text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)]',
                )}
              >
                <UserPlus size={14} />
                {isAssigned ? t('floor.reassign') : t('floor.assignTo')}
              </button>
            </div>
          </div>

          {/* Size matrix */}
          <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px]">
            <div className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[var(--color-muted-foreground)] mb-3">
              {t('stitching.receiveFromKotty.sizeMatrix')}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
              {sizes.map((s) => (
                <div
                  key={s}
                  className="flex flex-col items-center rounded-[10px] bg-[var(--color-muted)]/60 py-2"
                >
                  <span className="text-[11px] font-medium tabular-nums text-[var(--color-muted-foreground)]">
                    {s}
                  </span>
                  <span className="font-mono font-semibold text-[16px] tabular-nums">
                    {lot.qtyIn[s] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] px-4 py-1">
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
              {lot.vendorLotNo && (
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[var(--color-muted-foreground)]">
                    {t('stitching.vendorLot')}
                  </dt>
                  <dd className="font-mono">{lot.vendorLotNo}</dd>
                </div>
              )}
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-[var(--color-muted-foreground)]">
                  {t('stitching.vendor')}
                </dt>
                <dd>{lot.vendor?.name ?? lot.vendorId}</dd>
              </div>
            </dl>
          </div>

          {/* Edit action */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                inEditWindow
                  ? navigate(`/floor/lot/${lot.id}/edit`)
                  : navigate(`/floor/lot/${lot.id}/edit?expired=1`)
              }
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-medium border transition-colors',
                inEditWindow
                  ? 'text-[var(--color-foreground)] border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]'
                  : 'text-[var(--color-muted-foreground)] border-[var(--color-border)] bg-[var(--color-muted)]/40',
              )}
              title={inEditWindow ? t('floor.editWindow') : t('floor.editExpired')}
            >
              <Pencil size={14} />
              {t('floor.edit')}
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={t(isAssigned ? 'floor.reassign' : 'floor.assignTo', {
          defaultValue: isAssigned ? 'Reassign' : 'Assign to…',
        })}
      >
        {lot && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              <span className="font-mono">{lot.lotNo}</span>
              {' · '}
              {units}u
              {isAssigned && lot.assignedUser && (
                <>
                  {' · '}
                  <span>
                    {t('floor.currentlyAssigned', {
                      defaultValue: 'Currently {{name}}',
                      name: lot.assignedUser.name,
                    })}
                  </span>
                </>
              )}
            </p>
            <ul className="divide-y divide-[var(--color-border)]">
              {masters
                .filter((m) => m.id !== lot.assignedUserId)
                .map((m) => (
                  <li key={m.id} className="py-1">
                    <button
                      type="button"
                      onClick={() => doAssign(m.id)}
                      disabled={assigning !== null}
                      className="w-full flex items-center justify-between gap-3 px-2 py-2 rounded-[10px] hover:bg-[var(--color-muted)] disabled:opacity-50 transition-colors"
                    >
                      <span className="text-[15px] font-medium text-[var(--color-foreground)]">
                        {m.name}
                      </span>
                      <span className="font-mono text-[12px] text-[var(--color-muted-foreground)]">
                        {t('floor.inQueue', {
                          defaultValue: '{{n}} in queue',
                          n: m.inProgressLots,
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              {masters.filter((m) => m.id !== lot.assignedUserId).length === 0 && (
                <li className="py-3 text-sm text-[var(--color-muted-foreground)]">
                  {t('floor.noOtherMasters', {
                    defaultValue: 'No other stitching masters available.',
                  })}
                </li>
              )}
            </ul>
          </div>
        )}
      </Dialog>
    </FloorShell>
  );
}

/**
 * One row of the per-stage status card: stage label · forwarded ratio
 * + a thin progress bar tinted to the stage accent. Used three times
 * (stitching / finishing / dispatch) on the lot detail page.
 */
function StageProgressRow({
  label,
  done,
  total,
  accent,
  bg,
}: {
  label: string;
  done: number;
  total: number;
  accent: string;
  bg: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[12px] font-mono uppercase tracking-wide font-semibold"
          style={{ color: accent }}
        >
          {label}
        </span>
        <span className="text-[13px] font-mono tabular-nums text-[var(--color-foreground-2)]">
          {done} / {total}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: bg }}
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}
