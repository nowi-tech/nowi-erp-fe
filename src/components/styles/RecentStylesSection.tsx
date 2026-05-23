import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import StylesTable from '@/components/styles/StylesTable';
import { useAuth } from '@/context/auth';
import { hasAnyRole } from '@/lib/userRoles';
import { listStyles } from '@/api/styles';
import type { Style, UserRole } from '@/api/types';

const PD_ROLES: readonly UserRole[] = [
  'admin',
  'sampling_editor',
  'sampling_lead',
  'pattern_master_w',
  'pattern_master_m',
] as const;

/**
 * Dashboard "Styles in motion" section. Surfaces the most-recent active
 * styles (in_sampling + draft) so writers can flip Pattern Master /
 * Sampling Status / Sample Approval inline without navigating to the
 * registry. The same StylesTable + InlineStatusCell behaviour applies.
 *
 * Hidden for non-PD users — they have nothing to do here and the
 * section would just be noise on the dashboard.
 */
export default function RecentStylesSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<Style[] | null>(null);
  const isPd = hasAnyRole(user, PD_ROLES);

  useEffect(() => {
    if (!isPd) return;
    let cancelled = false;
    listStyles({ tab: 'in_sampling', take: 8 })
      .then((res) => {
        if (!cancelled) setRows(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isPd]);

  if (!isPd) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-xl font-semibold leading-tight">
            {t('admin.home.styles.title', {
              defaultValue: 'Styles in motion',
            })}
          </h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {t('admin.home.styles.subtitle', {
              defaultValue:
                'Recently active samples. Click any badge to flip Pattern Master, Sampling Status, or Approval inline.',
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/styles/new">
            <Button variant="outline" size="sm">
              <Plus size={14} />
              <span className="ml-1">
                {t('admin.home.styles.newIntake', {
                  defaultValue: 'New intake',
                })}
              </span>
            </Button>
          </Link>
          <Link to="/styles">
            <Button variant="outline" size="sm">
              <span>
                {t('admin.home.styles.openRegistry', {
                  defaultValue: 'Open registry',
                })}
              </span>
              <ArrowRight size={14} className="ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-muted-foreground)] text-center">
          {t('admin.home.styles.empty', {
            defaultValue: 'No styles in sampling right now.',
          })}
        </div>
      ) : (
        // Reuse the registry table verbatim — same row layout, same
        // inline-edit cells, same click → detail page.
        <StylesTable
          rows={rows}
          loading={false}
          variant="full"
          onRowClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
          onStyleNoClick={(s) => navigate(`/styles/${s.styleId ?? s.id}`)}
        />
      )}
    </section>
  );
}
