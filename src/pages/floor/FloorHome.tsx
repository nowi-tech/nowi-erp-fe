import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, UserPlus, X } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import StageTimeline from '@/components/StageTimeline';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { assignLot, listLots } from '@/api/lots';
import { listStitchingMasters, type StitchingMaster } from '@/api/users';
import type { Lot, OrderStatus } from '@/api/types';
import { cn } from '@/lib/utils';

// Lots that should appear on the floor manager dashboard.
const ACTIVE_STATUSES: OrderStatus[] = [
  'receiving',
  'in_stitching',
  'in_finishing',
  'in_rework',
  'stuck',
];

function isActive(lot: Lot): boolean {
  const s = lot.order?.status;
  return !s || ACTIVE_STATUSES.includes(s);
}

function totalUnits(matrix: Record<string, number> | null | undefined): number {
  if (!matrix) return 0;
  return Object.values(matrix).reduce((a, b) => a + (Number(b) || 0), 0);
}

function todayLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

type Filter = 'all' | 'pending' | 'in_stitching' | 'in_finishing' | 'stuck';
const LONG_PRESS_MS = 500;

export default function FloorHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Assign dialog state — either a single lot or bulk-selected lots.
  const [assignLots, setAssignLots] = useState<Lot[]>([]);
  const [masters, setMasters] = useState<StitchingMaster[]>([]);
  const [assigning, setAssigning] = useState<number | null>(null);

  // Bulk selection state — entered via long-press.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listLots();
      setLots(all.filter(isActive));
    } catch {
      setLots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (assignLots.length === 0) return;
    listStitchingMasters()
      .then(setMasters)
      .catch(() => setMasters([]));
  }, [assignLots.length]);

  const { pending, assigned } = useMemo(() => {
    const pendingArr: Lot[] = [];
    const assignedArr: Lot[] = [];
    for (const l of lots) {
      const match = matchesFilter(l, filter);
      if (!match) continue;
      if (l.assignedUserId == null) pendingArr.push(l);
      else assignedArr.push(l);
    }
    return { pending: pendingArr, assigned: assignedArr };
  }, [lots, filter]);

  // Common assignee for all selected lots, if any — used to filter the
  // master picker on bulk reassign. If lots have different assignees,
  // we show all masters (no exclusion).
  const sharedAssignee = useMemo(() => {
    if (assignLots.length === 0) return null;
    const ids = new Set(assignLots.map((l) => l.assignedUserId ?? null));
    if (ids.size > 1) return null;
    const [only] = [...ids];
    return only;
  }, [assignLots]);

  function exitSelection() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function toggleSelection(lotId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  }

  function openAssignFor(lot: Lot) {
    setAssignLots([lot]);
  }

  function openBulkAssign() {
    const targets = lots.filter((l) => selected.has(l.id));
    if (targets.length === 0) return;
    setAssignLots(targets);
  }

  async function doAssign(userId: number) {
    setAssigning(userId);
    const master = masters.find((m) => m.id === userId);
    try {
      // Sequential to keep audit rows ordered + simpler error UX.
      for (const lot of assignLots) {
        await assignLot(lot.id, userId);
      }
      sonnerToast.success(
        assignLots.length === 1
          ? t('floor.assignSuccessToast', {
              defaultValue: 'Assigned to {{name}}',
              name: master?.name ?? '',
            })
          : t('floor.bulkAssignSuccessToast', {
              defaultValue: 'Assigned {{n}} lots to {{name}}',
              n: assignLots.length,
              name: master?.name ?? '',
            }),
      );
      setAssignLots([]);
      exitSelection();
      await refresh();
    } catch {
      sonnerToast.error(t('common.error'));
    } finally {
      setAssigning(null);
    }
  }

  return (
    <FloorShell>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-semibold text-[30px] leading-none tracking-[-0.02em] text-[var(--color-foreground)]">
            {t('floor.title')}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
            {todayLabel(i18n.language)}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="hidden lg:inline-flex"
          onClick={() => navigate('/floor/receive')}
        >
          <Plus size={16} />
          {t('floor.receiveFab')}
        </Button>
      </div>

      {/* Filter tabs — pill style matching language toggle */}
      <div className="mb-4 inline-flex p-[3px] rounded-full bg-[var(--color-muted)] border border-[var(--color-border)] overflow-x-auto max-w-full">
        {(
          [
            { id: 'all' as const, label: t('floor.filters.all') },
            { id: 'pending' as const, label: t('floor.filters.pending') },
            { id: 'in_stitching' as const, label: t('floor.filters.inStitching') },
            { id: 'in_finishing' as const, label: t('floor.filters.inFinishing') },
            { id: 'stuck' as const, label: t('floor.filters.stuck') },
          ]
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={cn(
              'px-3 py-1.5 text-[13px] font-semibold rounded-full transition-colors whitespace-nowrap',
              filter === opt.id
                ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.08),0_0_0_1px_var(--color-border)]'
                : 'text-[var(--color-muted-foreground)]',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filter === 'all' || filter === 'pending' ? (
        <Section
          title={t('floor.pending')}
          count={pending.length}
          emptyLabel={t('floor.pendingEmpty')}
          loading={loading}
          lots={pending}
          selectionMode={selectionMode}
          selected={selected}
          onOpenLot={(lot) => {
            if (selectionMode) {
              toggleSelection(lot.id);
            } else {
              navigate(`/floor/lot/${lot.id}`);
            }
          }}
          onLongPress={(lot) => {
            if (!selectionMode) setSelectionMode(true);
            setSelected((prev) => new Set(prev).add(lot.id));
          }}
          onAssign={openAssignFor}
        />
      ) : null}

      {filter === 'pending' ? null : <div className="h-6" />}

      {filter !== 'pending' ? (
        <Section
          title={t('floor.assignedSection')}
          count={assigned.length}
          emptyLabel={t('floor.assignedEmpty')}
          loading={loading}
          lots={assigned}
          selectionMode={selectionMode}
          selected={selected}
          onOpenLot={(lot) => {
            if (selectionMode) {
              toggleSelection(lot.id);
            } else {
              navigate(`/floor/lot/${lot.id}`);
            }
          }}
          onLongPress={(lot) => {
            if (!selectionMode) setSelectionMode(true);
            setSelected((prev) => new Set(prev).add(lot.id));
          }}
          onAssign={openAssignFor}
        />
      ) : null}

      {/* Bulk-assign sticky bar — appears when selection has lots */}
      {selectionMode && (
        <div className="fixed left-0 right-0 bottom-16 z-30 px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-2 px-3 py-2.5 rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[0_8px_24px_rgba(14,23,48,0.16)]">
            <button
              type="button"
              onClick={exitSelection}
              className="w-9 h-9 rounded-full bg-[var(--color-muted)] flex items-center justify-center"
              aria-label={t('common.cancel')}
            >
              <X size={16} />
            </button>
            <span className="flex-1 text-[13px] font-semibold text-[var(--color-foreground)]">
              {selected.size === 0
                ? t('floor.bulkSelectHint')
                : t('floor.bulkAssignBar', {
                    defaultValue: 'Assign {{n}} lots',
                    n: selected.size,
                  })}
            </span>
            <button
              type="button"
              onClick={openBulkAssign}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-semibold text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)] disabled:opacity-50 active:translate-y-px transition-transform"
            >
              <UserPlus size={14} />
              {t('floor.assignTo')}
            </button>
          </div>
        </div>
      )}

      {/* Mobile FAB — hide while in selection mode (bulk bar takes over) */}
      {!selectionMode && (
        <div className="fixed left-0 right-0 bottom-20 z-20 px-4 pointer-events-none lg:hidden">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/floor/receive')}
              className="pointer-events-auto inline-flex items-center gap-2.5 px-6 py-[15px] rounded-full text-[15px] font-semibold tracking-[0.01em] text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_12px_28px_rgba(34,64,196,0.36)] active:translate-y-px transition-transform"
            >
              <Plus size={18} strokeWidth={2.4} />
              {t('floor.receiveFab')}
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={assignLots.length > 0}
        onClose={() => setAssignLots([])}
        title={
          assignLots.length > 1
            ? t('floor.bulkAssignBar', {
                defaultValue: 'Assign {{n}} lots',
                n: assignLots.length,
              })
            : t(
                assignLots[0]?.assignedUserId != null
                  ? 'floor.reassign'
                  : 'floor.assignTo',
                {
                  defaultValue:
                    assignLots[0]?.assignedUserId != null ? 'Reassign' : 'Assign to…',
                },
              )
        }
      >
        {assignLots.length > 0 && (
          <div className="space-y-2">
            {assignLots.length === 1 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                <span className="font-mono">{assignLots[0].lotNo}</span>
                {' · '}
                {totalUnits(assignLots[0].qtyIn)}u
                {assignLots[0].assignedUser && (
                  <>
                    {' · '}
                    <span>
                      {t('floor.currentlyAssigned', {
                        defaultValue: 'Currently {{name}}',
                        name: assignLots[0].assignedUser.name,
                      })}
                    </span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {assignLots.length} lots ·{' '}
                {assignLots.reduce((a, l) => a + totalUnits(l.qtyIn), 0)}u
              </p>
            )}
            <ul className="divide-y divide-[var(--color-border)]">
              {masters
                .filter((m) => m.id !== sharedAssignee)
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
              {masters.filter((m) => m.id !== sharedAssignee).length === 0 && (
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

function matchesFilter(lot: Lot, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return lot.assignedUserId == null;
  if (filter === 'stuck') return lot.order?.status === 'stuck';
  if (filter === 'in_stitching')
    return ['receiving', 'in_stitching', 'in_rework'].includes(
      lot.order?.status ?? '',
    );
  if (filter === 'in_finishing') return lot.order?.status === 'in_finishing';
  return true;
}

interface SectionProps {
  title: string;
  count: number;
  emptyLabel: string;
  loading: boolean;
  lots: Lot[];
  selectionMode: boolean;
  selected: Set<number>;
  onOpenLot: (lot: Lot) => void;
  onLongPress: (lot: Lot) => void;
  onAssign: (lot: Lot) => void;
}

function Section({
  title,
  count,
  emptyLabel,
  loading,
  lots,
  selectionMode,
  selected,
  onOpenLot,
  onLongPress,
  onAssign,
}: SectionProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-3">
        <div className="text-[18px] font-semibold text-[var(--color-foreground)]">
          {title}
        </div>
        <div className="font-mono text-[13px] text-[var(--color-muted-foreground)] tabular-nums">
          {count} lots
        </div>
      </div>
      {loading ? (
        <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : lots.length === 0 ? (
        <p className="text-[var(--color-muted-foreground)] px-1">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {lots.map((lot) => (
            <FloorLotRow
              key={lot.id}
              lot={lot}
              selectionMode={selectionMode}
              isSelected={selected.has(lot.id)}
              onOpen={() => onOpenLot(lot)}
              onLongPress={() => onLongPress(lot)}
              onAssign={() => onAssign(lot)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function progressForLot(
  lot: Lot,
): { stageKey: 'stitching' | 'finishing' | null; done: number; total: number } {
  const total = totalUnits(lot.qtyIn);
  // Map current order status -> the stage we want to show progress for.
  // Receiving / in_stitching / in_rework / stuck => stitching stage.
  // in_finishing => finishing stage.
  // dispatched / closed => no per-stage progress.
  const status = lot.order?.status;
  if (status === 'in_finishing') {
    return {
      stageKey: 'finishing',
      done: lot.stageForwarded?.finishing ?? 0,
      total,
    };
  }
  if (
    !status ||
    status === 'receiving' ||
    status === 'in_stitching' ||
    status === 'in_rework' ||
    status === 'stuck'
  ) {
    return {
      stageKey: 'stitching',
      done: lot.stageForwarded?.stitching ?? 0,
      total,
    };
  }
  return { stageKey: null, done: 0, total };
}

function FloorLotRow({
  lot,
  selectionMode,
  isSelected,
  onOpen,
  onLongPress,
  onAssign,
}: {
  lot: Lot;
  selectionMode: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onAssign: () => void;
}) {
  const { t } = useTranslation();
  const units = totalUnits(lot.qtyIn);
  const progress = progressForLot(lot);
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
  const isAssigned = lot.assignedUserId != null;

  // Long-press handlers — kick the user into selection mode on touch
  // hold or mouse down >500ms.
  let pressTimer: number | null = null;
  const startPress = () => {
    pressTimer = window.setTimeout(() => {
      onLongPress();
      pressTimer = null;
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  return (
    <li>
      <div
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onClick={onOpen}
        className={cn(
          'cursor-pointer select-none w-full text-left flex items-center gap-3 rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.04)] p-4 transition-all',
          selectionMode && isSelected
            ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary-soft)]/40'
            : 'hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px',
        )}
      >
        {selectionMode && (
          <div
            className={cn(
              'shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
              isSelected
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                : 'border-[var(--color-border-strong)] bg-white',
            )}
          >
            {isSelected && (
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                <path
                  d="M5 12l5 5L20 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="font-semibold text-[22px] leading-[1.1] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
            {lot.lotNo}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
            {productLabel && (
              <span className="font-medium text-[var(--color-foreground)]">
                {productLabel}
              </span>
            )}
            {productLabel && (
              <span className="text-[var(--color-muted-foreground-2)]">·</span>
            )}
            <span className="font-mono tabular-nums">{units}u</span>
            {lot.assignedUser && (
              <>
                <span className="text-[var(--color-muted-foreground-2)]">·</span>
                <span className="text-[var(--color-muted-foreground)]">
                  {lot.assignedUser.name}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StageTimeline status={lot.order?.status} size="compact" />
            {progress.stageKey && (
              <span className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
                {t(`stages.${progress.stageKey}`)} ·{' '}
                {t('stitching.lot.forwardedOf', {
                  defaultValue: '{{done}} of {{total}} forwarded',
                  done: progress.done,
                  total: progress.total,
                })}
              </span>
            )}
          </div>
        </div>
        {!selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssign();
            }}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-semibold transition-transform active:translate-y-px',
              isAssigned
                ? 'text-[var(--color-foreground)] border border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]'
                : 'text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)]',
            )}
          >
            <UserPlus size={14} />
            {isAssigned ? t('floor.reassign') : t('floor.assignTo')}
          </button>
        )}
      </div>
    </li>
  );
}
