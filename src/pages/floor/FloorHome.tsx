import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Pencil, Plus, UserPlus } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { assignLot, listLots } from '@/api/lots';
import { listStitchingMasters, type StitchingMaster } from '@/api/users';
import type { Lot, OrderStatus } from '@/api/types';
import { cn } from '@/lib/utils';

// Lots still flowing through stitching/finishing. Once dispatched the
// floor manager doesn't need to see them on this dashboard.
const ACTIVE_STATUSES: OrderStatus[] = [
  'receiving',
  'in_stitching',
  'in_finishing',
  'in_rework',
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

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function FloorHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState<Lot | null>(null);
  const [masters, setMasters] = useState<StitchingMaster[]>([]);
  const [assigning, setAssigning] = useState<number | null>(null);

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

  // Lazy-load the masters list when the assign dialog opens, so the
  // workload counts are fresh every time.
  useEffect(() => {
    if (!assignFor) return;
    listStitchingMasters()
      .then(setMasters)
      .catch(() => setMasters([]));
  }, [assignFor]);

  const { pending, assigned } = useMemo(() => {
    const pending: Lot[] = [];
    const assigned: Lot[] = [];
    for (const l of lots) {
      if (l.assignedUserId == null) pending.push(l);
      else assigned.push(l);
    }
    return { pending, assigned };
  }, [lots]);

  async function doAssign(userId: number) {
    if (!assignFor) return;
    setAssigning(userId);
    const master = masters.find((m) => m.id === userId);
    try {
      await assignLot(assignFor.id, userId);
      sonnerToast.success(
        t('floor.assignSuccessToast', {
          defaultValue: 'Assigned to {{name}}',
          name: master?.name ?? '',
        }),
      );
      setAssignFor(null);
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

      <Section
        title={t('floor.pending')}
        count={pending.length}
        emptyLabel={t('floor.pendingEmpty')}
        loading={loading}
        lots={pending}
        onAssign={(lot) => setAssignFor(lot)}
        onEdit={(lot) => navigate(`/floor/lot/${lot.id}/edit`)}
        showAssignButton
      />

      <div className="h-6" />

      <Section
        title={t('floor.assignedSection')}
        count={assigned.length}
        emptyLabel={t('floor.assignedEmpty')}
        loading={loading}
        lots={assigned}
        onAssign={(lot) => setAssignFor(lot)}
        onEdit={(lot) => navigate(`/floor/lot/${lot.id}/edit`)}
      />

      {/* Mobile FAB matches the stitching home pattern */}
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

      <Dialog
        open={!!assignFor}
        onClose={() => setAssignFor(null)}
        title={t('floor.assignTo', { defaultValue: 'Assign to…' })}
      >
        {assignFor && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              <span className="font-mono">{assignFor.lotNo}</span>
              {' · '}
              {totalUnits(assignFor.qtyIn)}u
            </p>
            <ul className="divide-y divide-[var(--color-border)]">
              {masters.length === 0 && (
                <li className="py-3 text-sm text-[var(--color-muted-foreground)]">
                  {t('common.loading')}
                </li>
              )}
              {masters.map((m) => (
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
            </ul>
          </div>
        )}
      </Dialog>
    </FloorShell>
  );
}

interface SectionProps {
  title: string;
  count: number;
  emptyLabel: string;
  loading: boolean;
  lots: Lot[];
  onAssign: (lot: Lot) => void;
  onEdit: (lot: Lot) => void;
  showAssignButton?: boolean;
}

function Section({
  title,
  count,
  emptyLabel,
  loading,
  lots,
  onAssign,
  onEdit,
  showAssignButton,
}: SectionProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-3">
        <div className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {title}
        </div>
        <div className="font-mono text-[12px] text-[var(--color-muted-foreground)] tabular-nums">
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
              onAssign={onAssign}
              onEdit={onEdit}
              showAssignButton={showAssignButton}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FloorLotRow({
  lot,
  onAssign,
  onEdit,
  showAssignButton,
}: {
  lot: Lot;
  onAssign: (lot: Lot) => void;
  onEdit: (lot: Lot) => void;
  showAssignButton?: boolean;
}) {
  const { t } = useTranslation();
  const units = totalUnits(lot.qtyIn);
  const ageMs = Date.now() - new Date(lot.createdAt).getTime();
  const inEditWindow = ageMs <= EDIT_WINDOW_MS;
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
    <li>
      <div className="w-full text-left flex items-center gap-3 rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(14,23,48,0.04)] p-4">
        <div className="flex-1 min-w-0 space-y-1">
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
          </div>
          {lot.assignedUser && (
            <div className="text-[12px] text-[var(--color-muted-foreground)] font-mono">
              {t('floor.assignedTo', {
                defaultValue: 'Assigned to {{name}}',
                name: lot.assignedUser.name,
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col gap-2 items-end">
          {showAssignButton ? (
            <button
              type="button"
              onClick={() => onAssign(lot)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-semibold text-white bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_var(--color-primary-hover),0_4px_10px_rgba(34,64,196,0.28)] active:translate-y-px transition-transform"
            >
              <UserPlus size={14} />
              {t('floor.assignTo')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAssign(lot)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-medium text-[var(--color-foreground)] border border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)] transition-colors"
            >
              <UserPlus size={14} />
              {t('floor.assignTo')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(lot)}
            disabled={!inEditWindow}
            title={
              inEditWindow
                ? t('floor.editWindow', { defaultValue: '' })
                : t('floor.editExpired', { defaultValue: '' })
            }
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-medium border transition-colors',
              inEditWindow
                ? 'text-[var(--color-foreground)] border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]'
                : 'text-[var(--color-muted-foreground)] border-[var(--color-border)] bg-[var(--color-muted)]/40 cursor-not-allowed opacity-60',
            )}
          >
            <Pencil size={14} />
            {t('floor.edit')}
          </button>
          <ChevronRight
            size={16}
            className="text-[var(--color-muted-foreground)]"
          />
        </div>
      </div>
    </li>
  );
}
