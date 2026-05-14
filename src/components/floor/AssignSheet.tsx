import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MasterWithLoad } from '@/api/users';
import type { AssignSlot } from '@/api/lots';

export interface AssignSheetLot {
  id: number;
  lotNo: string;
  units: number;
  assignedUserId?: number | null;
  assignedUserName?: string | null;
}

interface AssignSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Which assignment slot we're filling. Drives the title + i18n keys
   * so the same sheet works for stitching-master and finishing-master
   * picks. Defaults to stitching for back-compat.
   */
  slot?: AssignSlot;
  /** One-element array = single lot. Multi-element = bulk assign. */
  lots: AssignSheetLot[];
  masters: MasterWithLoad[];
  /** Master id currently shared across all selected lots (hides their card). */
  excludeMasterId?: number | null;
  busy?: boolean;
  onConfirm: (masterId: number) => void;
}

export default function AssignSheet({
  open,
  onClose,
  slot = 'stitching_master',
  lots,
  masters,
  excludeMasterId,
  busy = false,
  onConfirm,
}: AssignSheetProps) {
  const { t } = useTranslation();
  const isFinishing = slot === 'finishing_master';
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const isBulk = lots.length > 1;
  const single = lots[0];
  const isReassign = !isBulk && single?.assignedUserId != null;

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return masters
      .filter((m) => m.id !== excludeMasterId)
      .filter((m) => (q ? m.name.toLowerCase().includes(q) : true));
  }, [masters, excludeMasterId, query]);

  if (!open) return null;

  const titleSuffix = isFinishing
    ? t('floor.assignSheet.finisherSuffix', {
        defaultValue: 'Finishing Master',
      })
    : t('floor.assignSheet.stitcherSuffix', {
        defaultValue: 'Stitching Master',
      });
  const title = isBulk
    ? t('floor.bulkAssignBar', {
        defaultValue: 'Assign {{n}} lots',
        n: lots.length,
      })
    : isReassign
      ? t('floor.assignSheet.reassign', {
          defaultValue: 'Reassign {{slot}}',
          slot: titleSuffix,
        })
      : t('floor.assignSheet.assign', {
          defaultValue: 'Assign {{slot}}',
          slot: titleSuffix,
        });

  const totalUnits = lots.reduce((a, l) => a + l.units, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-[var(--color-background)] text-[var(--color-foreground)] rounded-t-[20px] sm:rounded-[16px] shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex flex-col items-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-[var(--color-border)] mb-1 sm:hidden" />
          <div className="w-full flex items-center justify-between px-4 h-12">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="bg-[var(--color-background-2)] border border-[var(--color-border)] rounded-[8px] p-4 mb-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--color-muted-foreground)] mb-1">
              {isBulk
                ? t('floor.activeLots', { defaultValue: 'ACTIVE LOTS' })
                : t('floor.activeLot', { defaultValue: 'ACTIVE LOT' })}
            </div>
            <div className="flex items-center justify-between gap-2">
              {isBulk ? (
                <span className="font-mono text-[15px] font-semibold tracking-[0.02em]">
                  {lots.length} lots
                </span>
              ) : (
                <span className="font-mono text-[15px] font-semibold tracking-[0.02em]">
                  {single?.lotNo}
                </span>
              )}
              <span className="bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded text-sm font-medium">
                {t('floor.unitsShort', {
                  defaultValue: '{{n}} units',
                  n: totalUnits,
                })}
              </span>
            </div>
            {!isBulk && isReassign && single?.assignedUserName && (
              <div className="text-sm text-[var(--color-muted-foreground)] mt-1">
                {t('floor.currentlyAssigned', {
                  defaultValue: 'Currently {{name}}',
                  name: single.assignedUserName,
                })}
              </div>
            )}
          </div>

          <div className="relative mb-4">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] pointer-events-none"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isFinishing
                  ? t('floor.searchFinishingMasters', {
                      defaultValue: 'Search Finishing Masters…',
                    })
                  : t('floor.searchMasters', {
                      defaultValue: 'Search Stitching Masters…',
                    })
              }
              className="w-full h-12 bg-[var(--color-background-2)] border border-[var(--color-border)] rounded-[8px] pl-11 pr-4 text-[16px] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
            />
          </div>

          <ul className="flex flex-col">
            {filtered.length === 0 ? (
              <li className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                {query.trim()
                  ? t('floor.noMatchingMasters', {
                      defaultValue: 'No matching masters.',
                    })
                  : t('floor.noOtherMasters', {
                      defaultValue: 'No other stitching masters available.',
                    })}
              </li>
            ) : (
              filtered.map((m) => {
                const isAvailable = m.inProgressLots === 0;
                const isSelected = selected === m.id;
                return (
                  <li
                    key={m.id}
                    className="border-b border-[var(--color-border)] last:border-b-0"
                  >
                    <label
                      className={cn(
                        'flex items-center gap-3 px-2 py-3 min-h-12 cursor-pointer transition-colors',
                        isSelected
                          ? 'bg-[var(--color-primary)]/10'
                          : 'hover:bg-[var(--color-muted)]/60',
                      )}
                    >
                      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[16px] font-semibold truncate">
                            {m.name}
                          </span>
                          <span className="font-mono text-[12px] text-[var(--color-muted-foreground)] bg-[var(--color-muted)] px-1.5 py-0.5 rounded shrink-0">
                            #{m.id}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'text-sm font-medium',
                            isAvailable
                              ? 'text-[var(--color-success,#16a34a)]'
                              : 'text-[var(--color-muted-foreground)]',
                          )}
                        >
                          {isAvailable
                            ? t('floor.available', { defaultValue: 'Available' })
                            : t('floor.inQueue', {
                                defaultValue: '{{n}} in queue',
                                n: m.inProgressLots,
                              })}
                        </span>
                      </div>
                      <span
                        aria-hidden
                        className={cn(
                          'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0',
                          isSelected
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                            : 'border-[var(--color-border)]',
                        )}
                      >
                        {isSelected && (
                          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary-foreground)]" />
                        )}
                      </span>
                      <input
                        type="radio"
                        name="assign-master"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() => setSelected(m.id)}
                      />
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="shrink-0 border-t border-[var(--color-border)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={selected == null || busy}
            onClick={() => selected != null && onConfirm(selected)}
            className="w-full h-12 rounded-[8px] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold text-[16px] disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {busy
              ? t('common.saving', { defaultValue: 'Saving…' })
              : t('floor.confirmAssignment', {
                  defaultValue: 'Confirm Assignment',
                })}
          </button>
        </div>
      </div>
    </div>
  );
}
