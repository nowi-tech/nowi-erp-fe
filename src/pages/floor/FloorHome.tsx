import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Pencil, Plus, UserPlus, X } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import StageTimeline from '@/components/StageTimeline';
import { Button } from '@/components/ui/button';
import AssignSheet from '@/components/floor/AssignSheet';
import { assignLot, getLotCounts, listLots, type LotCounts } from '@/api/lots';
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
const PAGE_SIZE = 20;

export default function FloorHome() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [lots, setLots] = useState<Lot[]>([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  // Filter persisted in the URL query string so back-from-lot-detail
  // (and reload, and shared links) restore the same view. Default
  // landing tab = pending — the FM's primary action queue.
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: Filter = (() => {
    const raw = searchParams.get('tab');
    if (raw === 'all' || raw === 'pending' || raw === 'in_stitching' ||
        raw === 'in_finishing' || raw === 'stuck') {
      return raw;
    }
    return 'pending';
  })();
  const setFilter = (next: Filter) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'pending') {
      // Default — drop the param to keep URLs tidy.
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params, { replace: true });
  };

  // Assign dialog state — either a single lot or bulk-selected lots.
  const [assignLots, setAssignLots] = useState<Lot[]>([]);
  const [masters, setMasters] = useState<StitchingMaster[]>([]);
  const [assigning, setAssigning] = useState<number | null>(null);

  // Bulk selection state — entered via long-press.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Real bucket counts for the filter pills (independent of pagination).
  // Refreshed alongside the lot list after assigns.
  const [counts, setCounts] = useState<LotCounts | null>(null);
  const refreshCounts = useCallback(() => {
    getLotCounts()
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  /**
   * Paged loader. `reset=true` starts from skip 0 (initial load + after
   * an assign). `reset=false` appends the next page.
   *
   * We always paginate the unfiltered active set from the BE; tab
   * filtering is applied client-side. Trade-off: a deep-filtered tab
   * (e.g. "Stuck") may need to scroll through several pages to fill
   * up. Acceptable for the floor where active lots count in the
   * dozens, not thousands.
   */
  const loadPage = useCallback(
    async (reset: boolean) => {
      if (pageLoading) return;
      const nextSkip = reset ? 0 : skip;
      setPageLoading(true);
      try {
        const fetched = await listLots({ skip: nextSkip, take: PAGE_SIZE });
        const active = fetched.filter(isActive);
        if (reset) {
          setLots(active);
          setSkip(fetched.length);
        } else {
          // Dedup against existing — a refresh racing with a paginate
          // could theoretically duplicate. Cheap to guard.
          setLots((prev) => {
            const seen = new Set(prev.map((l) => l.id));
            return [...prev, ...active.filter((l) => !seen.has(l.id))];
          });
          setSkip(nextSkip + fetched.length);
        }
        // BE returns up to PAGE_SIZE; less than PAGE_SIZE means we're done.
        setHasMore(fetched.length === PAGE_SIZE);
      } catch {
        if (reset) setLots([]);
        setHasMore(false);
      } finally {
        setPageLoading(false);
        if (reset) setInitialLoading(false);
      }
    },
    [skip, pageLoading],
  );

  // Initial load — fire once.
  useEffect(() => {
    void loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sentinel — IntersectionObserver triggers loadPage(false) when the
  // bottom comes into view. 200px rootMargin so we start fetching just
  // before the user actually hits bottom (smoother feel).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || pageLoading || initialLoading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadPage(false);
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, pageLoading, initialLoading, loadPage]);

  // After mutations (assign / bulk assign), reset to page 1 so the
  // moved lots fall into the right section.
  const refreshFromTop = useCallback(() => {
    setHasMore(true);
    void loadPage(true);
  }, [loadPage]);

  useEffect(() => {
    if (assignLots.length === 0) return;
    listStitchingMasters()
      .then(setMasters)
      .catch(() => setMasters([]));
  }, [assignLots.length]);

  // Bucket lots by where they ACTUALLY are in the workflow — not by
  // assignment status. A lot that's already moved past `receiving`
  // belongs in its current stage's bucket even if no formal
  // stitching-master assignment ever happened (admin-triggered forward,
  // legacy data, etc).
  //
  // pending = "truly needs FM action": just received, no assignee.
  // Mirrors BE counts() so pill totals and section contents agree.
  const { pending, inStitching, inFinishing, stuck } = useMemo(() => {
    const buckets = {
      pending: [] as Lot[],
      inStitching: [] as Lot[],
      inFinishing: [] as Lot[],
      stuck: [] as Lot[],
    };
    for (const l of lots) {
      if (!matchesFilter(l, filter)) continue;
      const s = l.order?.status;
      if (s === 'stuck') buckets.stuck.push(l);
      else if (s === 'in_finishing') buckets.inFinishing.push(l);
      else if (s === 'in_stitching' || s === 'in_rework')
        buckets.inStitching.push(l);
      else if (s === 'receiving' || s == null) {
        // receiving = just landed. Pending only when no assignee;
        // already-assigned-but-not-started lots go to in_stitching.
        if (l.assignedUserId == null) buckets.pending.push(l);
        else buckets.inStitching.push(l);
      }
    }
    return buckets;
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
      refreshFromTop();
      refreshCounts();
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

      {/* KPI cards — traffic-light tones tell you status at a glance.
          1. Needs your attention: red if stuck > 0; amber if pending > 0
             but no stuck; green when nothing to do.
          2. Active pipeline: green if oldest < 1d; amber 1–3d; red > 3d.
             Falls back to ink when there's no active work. */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        {(() => {
          const stuck = counts?.stuck ?? 0;
          const pending = counts?.pending ?? 0;
          const attentionTone: KpiTone =
            stuck > 0 ? 'danger' : pending > 0 ? 'warning' : 'success';
          return (
            <KpiCard
              label={t('floor.kpi.attention', { defaultValue: 'Needs your attention' })}
              value={counts == null ? '—' : String(pending + stuck)}
              sub={
                counts == null
                  ? null
                  : stuck > 0
                    ? t('floor.kpi.attentionWithStuck', {
                        defaultValue: '{{n}} stuck',
                        n: stuck,
                      })
                    : pending > 0
                      ? t('floor.kpi.attentionPending', {
                          defaultValue: '{{n}} pending',
                          n: pending,
                        })
                      : t('floor.kpi.attentionAllClear', {
                          defaultValue: 'All clear',
                        })
              }
              tone={attentionTone}
              onClick={() =>
                setFilter(stuck > 0 ? 'stuck' : 'pending')
              }
            />
          );
        })()}
        {(() => {
          const inFlight =
            (counts?.in_stitching ?? 0) +
            (counts?.in_finishing ?? 0) +
            (counts?.pending ?? 0);
          const ageMs = counts?.oldestActiveAgeMs ?? null;
          const dayMs = 24 * 60 * 60 * 1000;
          const pipelineTone: KpiTone =
            inFlight === 0
              ? 'ink'
              : ageMs == null
                ? 'success'
                : ageMs > 3 * dayMs
                  ? 'danger'
                  : ageMs > dayMs
                    ? 'warning'
                    : 'success';
          return (
            <KpiCard
              label={t('floor.kpi.pipeline', { defaultValue: 'Active pipeline' })}
              value={counts == null ? '—' : String(inFlight)}
              sub={
                counts == null || ageMs == null
                  ? null
                  : t('floor.kpi.pipelineSub', {
                      defaultValue: 'oldest {{age}}',
                      age: formatAgeShort(ageMs),
                    })
              }
              tone={pipelineTone}
              onClick={() => setFilter('all')}
            />
          );
        })()}
      </div>

      {/* Filter tabs — floating pill row. Each tab is its own pill
          with the label inline + a count badge to the right. Active
          tab fills brand blue; inactive tabs are white with a hairline.
          All tab is last (the bird's-eye view) — Pending leads since
          it's the FM's primary action queue. Counts come from BE
          /api/lots/counts; capped visually at 99+. */}
      {/* `[&::-webkit-scrollbar]:hidden` + `[scrollbar-width:none]`
          hide the bar while keeping horizontal scroll on narrow
          phones. Pad the bottom slightly so the active pill's shadow
          doesn't get clipped. */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {(
          [
            { id: 'pending' as const, label: t('floor.filters.pending'), count: counts?.pending },
            { id: 'in_stitching' as const, label: t('floor.filters.inStitching'), count: counts?.in_stitching },
            { id: 'in_finishing' as const, label: t('floor.filters.inFinishing'), count: counts?.in_finishing },
            { id: 'stuck' as const, label: t('floor.filters.stuck'), count: counts?.stuck },
            { id: 'all' as const, label: t('floor.filters.all'), count: counts?.all },
          ]
        ).map((opt) => {
          const isActive = filter === opt.id;
          const countLabel =
            opt.count == null
              ? null
              : opt.count > 99
                ? '99+'
                : String(opt.count);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={cn(
                'shrink-0 inline-flex items-center gap-2 pl-4 pr-3 h-10 rounded-full text-[14px] font-semibold whitespace-nowrap transition-colors border',
                isActive
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-transparent'
                  : 'bg-[var(--color-surface)] text-[var(--color-foreground-2)] border-[var(--color-border)] hover:bg-[var(--color-muted)]',
              )}
            >
              <span>{opt.label}</span>
              {countLabel != null && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums',
                    isActive
                      ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                      : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                  )}
                >
                  {countLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/*
        Sections render in workflow order: Pending → In stitching →
        In finishing → Stuck. Each section is rendered only when:
          - the active filter includes that bucket, AND
          - the bucket has at least one lot OR it's a single-bucket filter (so empty state shows)
        Pending lots intentionally hide the stage timeline (a lot
        that's not yet assigned isn't IN any stage yet — showing the
        timeline would be misleading).
      */}
      {/* All view = dense flat list (one row per lot) so the bird's-eye
          page stays compact even with 50+ active lots. Each row carries
          a status chip + LOT id + product + assignee + age. Tap a row
          to open the lot detail. */}
      {filter === 'all' ? (
        initialLoading ? (
          <div className="h-12 animate-pulse rounded bg-[var(--color-muted)]" />
        ) : lots.length === 0 ? (
          <p className="text-[var(--color-muted-foreground)] px-1">
            {t('floor.assignedEmpty')}
          </p>
        ) : (
          <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] overflow-hidden">
            <ul className="divide-y divide-[var(--color-border)]">
              {lots.map((lot) => (
                <DenseLotRow
                  key={lot.id}
                  lot={lot}
                  onOpen={() => navigate(`/floor/lot/${lot.id}`)}
                />
              ))}
            </ul>
          </div>
        )
      ) : (
        // Single-bucket filter views — full cards via the existing
        // Section component. No per-section cap; the infinite-scroll
        // sentinel below handles pagination.
        (['pending', 'inStitching', 'inFinishing', 'stuck'] as const).map(
          (bucketKey) => {
            const buckets = { pending, inStitching, inFinishing, stuck };
            const bucket = buckets[bucketKey];
            const visibleByFilter =
              (filter === 'pending' && bucketKey === 'pending') ||
              (filter === 'in_stitching' && bucketKey === 'inStitching') ||
              (filter === 'in_finishing' && bucketKey === 'inFinishing') ||
              (filter === 'stuck' && bucketKey === 'stuck');
            if (!visibleByFilter) return null;

            const titleKey = {
              pending: 'floor.pending',
              inStitching: 'floor.filters.inStitching',
              inFinishing: 'floor.filters.inFinishing',
              stuck: 'floor.filters.stuck',
            }[bucketKey];
            const emptyKey = {
              pending: 'floor.pendingEmpty',
              inStitching: 'floor.assignedEmpty',
              inFinishing: 'floor.assignedEmpty',
              stuck: 'floor.assignedEmpty',
            }[bucketKey];

            return (
              <div key={bucketKey} className="mb-6">
                <Section
                  title={t(titleKey)}
                  count={bucket.length}
                  emptyLabel={t(emptyKey)}
                  loading={initialLoading}
                  lots={bucket}
                  hideTimeline={bucketKey === 'pending'}
                  selectionMode={selectionMode && bucketKey === 'pending'}
                  selected={selected}
                  onOpenLot={(lot) => {
                    if (selectionMode && bucketKey === 'pending') {
                      toggleSelection(lot.id);
                    } else {
                      navigate(`/floor/lot/${lot.id}`);
                    }
                  }}
                  onLongPress={(lot) => {
                    if (bucketKey !== 'pending') return;
                    if (!selectionMode) setSelectionMode(true);
                    setSelected((prev) => new Set(prev).add(lot.id));
                  }}
                  onAssign={openAssignFor}
                />
              </div>
            );
          },
        )
      )}

      {/* Infinite-scroll sentinel + load indicator */}
      <div ref={sentinelRef} className="h-1" />
      {pageLoading && !initialLoading && (
        <div className="py-4 text-center text-[12px] text-[var(--color-muted-foreground)] font-mono">
          {t('common.loading')}
        </div>
      )}
      {!hasMore && !initialLoading && lots.length > 0 && (
        <div className="py-4 text-center text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground-2)] font-mono">
          {t('floor.endOfList', { defaultValue: 'End of list' })}
        </div>
      )}

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

      <AssignSheet
        open={assignLots.length > 0}
        onClose={() => setAssignLots([])}
        lots={assignLots.map((l) => ({
          id: l.id,
          lotNo: l.lotNo,
          units: totalUnits(l.qtyIn),
          assignedUserId: l.assignedUserId,
          assignedUserName: l.assignedUser?.name ?? null,
        }))}
        masters={masters}
        excludeMasterId={sharedAssignee}
        busy={assigning !== null}
        onConfirm={doAssign}
      />
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
  hideTimeline?: boolean;
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
  hideTimeline,
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
              hideTimeline={hideTimeline}
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
  hideTimeline,
  selectionMode,
  isSelected,
  onOpen,
  onLongPress,
  onAssign,
}: {
  lot: Lot;
  hideTimeline?: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onAssign: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  const status = lot.order?.status;
  const isAnomaly = status === 'in_rework' || status === 'stuck';

  // Long-press handlers — kick into selection mode on touch hold >500ms.
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
          'cursor-pointer select-none w-full rounded-[16px] bg-[var(--color-surface)] border-l-[6px] shadow-[0_1px_2px_rgba(14,23,48,0.04)] transition-all',
          isAnomaly
            ? 'border-l-[var(--color-destructive)]'
            : 'border-l-[var(--color-primary)]',
          selectionMode && isSelected
            ? 'ring-2 ring-[var(--color-primary)] bg-[var(--color-primary-soft)]/40'
            : 'hover:shadow-[0_1px_2px_rgba(14,23,48,0.06),0_4px_12px_rgba(14,23,48,0.05)] hover:-translate-y-px',
        )}
      >
        <div className="p-4 pl-5 space-y-3">
          {/* Top row — selection checkbox · lot id + edit icon */}
          <div className="flex items-center gap-3">
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
            <h3 className="font-mono font-bold text-[22px] leading-[1.1] tracking-tight text-[var(--color-foreground)] break-all flex-1 min-w-0">
              {lot.lotNo}
            </h3>
            {!selectionMode && (
              <button
                type="button"
                aria-label={t('floor.edit')}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/floor/lot/${lot.id}/edit`);
                }}
                className="shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] p-1 transition-colors"
              >
                <Pencil size={18} />
              </button>
            )}
          </div>

          {/* Product · units · assignee */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-foreground-2)]">
            {productLabel && (
              <span className="font-medium text-[var(--color-foreground)]">
                {productLabel}
              </span>
            )}
            {productLabel && (
              <span className="text-[var(--color-muted-foreground-2)]">·</span>
            )}
            <span className="font-mono bg-[var(--color-muted)] px-1.5 py-0.5 rounded text-[var(--color-foreground)] tabular-nums text-[12px]">
              {units}u
            </span>
            {lot.assignedUser && (
              <>
                <span className="text-[var(--color-muted-foreground-2)]">·</span>
                <span className="text-[var(--color-muted-foreground)] italic text-[12px] flex items-center gap-1">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-muted-foreground-2)]"
                    aria-hidden
                  />
                  {lot.assignedUser.name}
                </span>
              </>
            )}
          </div>

          {/* Stage timeline + forwarded pill — hidden for pending lots
              since they aren't in any stage yet. */}
          {!hideTimeline && (
            <div className="space-y-2.5">
              <StageTimeline status={status} size="compact" />
              {progress.stageKey && (
                <div
                  className={cn(
                    'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] border text-[12px]',
                    isAnomaly
                      ? 'bg-[var(--color-destructive-bg)]/50 border-[var(--color-destructive-bg)] text-[var(--color-destructive-strong)]'
                      : 'bg-[var(--color-primary-soft)] border-[var(--color-primary-soft)] text-[var(--color-primary)]',
                  )}
                >
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-semibold uppercase tracking-wide text-[11px]">
                      {t(`stages.${progress.stageKey}`)}
                    </span>
                    <span className="opacity-60">·</span>
                    <span className="font-medium tabular-nums">
                      {progress.done} / {progress.total}
                    </span>
                    <span className="opacity-70 text-[11px]">
                      {t('floor.forwardedShort', { defaultValue: 'forwarded' })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer — Report + Assign/Reassign (hidden in selection mode) */}
          {!selectionMode && (
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  sonnerToast.info(
                    t('floor.reportComingSoon', {
                      defaultValue: 'Report flow coming soon.',
                    }),
                  );
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-9 rounded-[10px] text-[13px] font-medium border transition-colors',
                  isAnomaly
                    ? 'text-[var(--color-destructive)] border-[var(--color-destructive)]/30 bg-[var(--color-destructive-bg)]/30 hover:bg-[var(--color-destructive-bg)]'
                    : 'text-[var(--color-foreground)] border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]',
                )}
              >
                <AlertTriangle size={14} />
                {isAnomaly
                  ? t('floor.reportIssue', { defaultValue: 'Report issue' })
                  : t('floor.report', { defaultValue: 'Report' })}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAssign();
                }}
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
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Dense single-row representation of a lot, used in the All view so
 * 50+ lots fit on screen without infinite scroll fatigue. One line per
 * lot: status chip · LOT id · product · units · assignee · age · ›
 *
 * Tap to open the lot detail page.
 */
function DenseLotRow({
  lot,
  onOpen,
}: {
  lot: Lot;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const status = lot.order?.status;
  const units = totalUnits(lot.qtyIn);
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

  // status → { label, swatch color }. Mirrors the bucket logic.
  const statusInfo = (() => {
    if (lot.assignedUserId == null) {
      return { label: t('floor.filters.pending'), color: 'var(--color-foreground-2)' };
    }
    if (status === 'stuck') {
      return { label: t('floor.filters.stuck'), color: 'var(--color-destructive)' };
    }
    if (status === 'in_finishing') {
      return { label: t('floor.filters.inFinishing'), color: 'var(--stage-finish-acc)' };
    }
    if (status === 'in_rework') {
      return { label: t('admin.locator.filters.rework', { defaultValue: 'Rework' }), color: 'var(--status-rework-acc)' };
    }
    return { label: t('floor.filters.inStitching'), color: 'var(--stage-stitch-acc)' };
  })();

  const ageLabel = formatAge(lot.createdAt, i18n.language);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--color-muted)]/50 transition-colors"
      >
        {/* Status swatch — small colored dot encoding the bucket */}
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: statusInfo.color }}
          aria-label={statusInfo.label}
        />
        {/* Identity column */}
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono font-semibold text-[14px] text-[var(--color-foreground)] truncate">
            {lot.lotNo}
          </span>
          {productLabel && (
            <span className="text-[12px] text-[var(--color-muted-foreground)] truncate">
              {productLabel}
            </span>
          )}
          <span className="font-mono text-[11px] text-[var(--color-muted-foreground-2)] tabular-nums">
            {units}u
          </span>
        </div>
        {/* Assignee */}
        {lot.assignedUser && (
          <span className="hidden sm:inline text-[11px] text-[var(--color-muted-foreground)] italic truncate max-w-[80px]">
            {lot.assignedUser.name}
          </span>
        )}
        {/* Age */}
        <span className="font-mono text-[11px] text-[var(--color-muted-foreground-2)] tabular-nums">
          {ageLabel}
        </span>
        <span className="text-[var(--color-muted-foreground-2)]">›</span>
      </button>
    </li>
  );
}

type KpiTone = 'success' | 'warning' | 'danger' | 'ink';

/**
 * Compact KPI tile used at the top of the floor dashboard.
 * Traffic-light tone drives both the number color and the soft tinted
 * background so status reads at a glance.
 */
function KpiCard({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub: string | null;
  tone: KpiTone;
  onClick?: () => void;
}) {
  const palette: Record<
    KpiTone,
    { accent: string; bg: string; subColor: string }
  > = {
    success: {
      accent: 'var(--color-success)',
      bg: 'var(--color-success-bg)',
      subColor: 'var(--status-ready-ink)',
    },
    warning: {
      accent: 'var(--color-warning)',
      bg: 'var(--color-warning-bg)',
      subColor: 'var(--status-rework-ink)',
    },
    danger: {
      accent: 'var(--color-destructive)',
      bg: 'var(--color-destructive-bg)',
      subColor: 'var(--color-destructive-strong)',
    },
    ink: {
      accent: 'var(--color-foreground)',
      bg: 'var(--color-surface)',
      subColor: 'var(--color-muted-foreground)',
    },
  };
  const p = palette[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-[14px] border border-[var(--color-border)] shadow-[0_1px_2px_rgba(14,23,48,0.04)] px-4 py-3 transition-all',
        onClick && 'hover:brightness-95 active:scale-[0.99]',
      )}
      style={{ backgroundColor: p.bg }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.06em] truncate"
        style={{ color: p.subColor }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-mono font-bold text-[28px] leading-none tabular-nums"
        style={{ color: p.accent }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-1.5 text-[12px] font-medium"
          style={{ color: p.subColor }}
        >
          {sub}
        </div>
      )}
    </button>
  );
}

/** Short age — '2h', '3d', '1w' — for KPI subtitles. */
function formatAgeShort(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${Math.max(1, min)}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

/**
 * Compact relative-time label for the dense row. Matches what a floor
 * manager actually wants to know ("how stale is this?") without the
 * noise of full timestamps.
 */
function formatAge(iso: string, _locale: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}
