import { useTranslation } from 'react-i18next';
import type { FabricPlanCheck } from '@/api/production';
import { fmtQty } from '@/lib/fabric';
import { cn } from '@/lib/utils';

const TONE: Record<FabricPlanCheck['state'], { dot: string; text: string }> = {
  enough: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  low: { dot: 'bg-amber-500', text: 'text-amber-700' },
  short: { dot: 'bg-red-500', text: 'text-red-700' },
};

/** "● Short by 52 m: needs 382 m · 330 m free · 1200 m on order, due 2 Nov"; compact is just "● Short", numbers on hover. */
export default function FabricCheckText({
  check,
  unit,
  compact,
}: {
  check: FabricPlanCheck;
  unit: string | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const q = (n: number) => fmtQty(n, unit);
  const left = check.free - check.needed;
  const head =
    check.state === 'short'
      ? t('admin.production.fabricCheck.short', { defaultValue: 'Short by {{qty}}', qty: q(-left) })
      : check.state === 'low'
        ? t('admin.production.fabricCheck.low', { defaultValue: 'Low' })
        : t('admin.production.fabricCheck.enough', { defaultValue: 'Enough fabric' });
  const detail = [
    t('admin.production.fabricCheck.needs', { defaultValue: 'needs {{qty}}', qty: q(check.needed) }),
    t('admin.production.fabricCheck.free', { defaultValue: '{{qty}} free', qty: q(check.free) }),
    check.state !== 'short'
      ? t('admin.production.fabricCheck.left', { defaultValue: '{{qty}} left after', qty: q(left) })
      : check.onOrder > 0
        ? check.nextExpectedDate
          ? t('admin.production.fabricCheck.onOrderDue', {
              defaultValue: '{{qty}} on order, due {{date}}',
              qty: q(check.onOrder),
              date: new Date(check.nextExpectedDate).toLocaleDateString(),
            })
          : t('admin.production.fabricCheck.onOrder', { defaultValue: '{{qty}} on order', qty: q(check.onOrder) })
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (compact) {
    const word = { enough: 'Enough', low: 'Low', short: 'Short' }[check.state];
    return (
      <span className="inline-flex items-center gap-1.5 text-xs" title={`${head}: ${detail}`}>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE[check.state].dot)} />
        <span className={cn('font-semibold', TONE[check.state].text)}>
          {t(`admin.production.fabricCheck.word.${check.state}`, { defaultValue: word })}
        </span>
      </span>
    );
  }
  return (
    <div className="flex items-start gap-1.5 text-sm">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[check.state].dot)} />
      <span>
        <span className={cn('font-semibold', TONE[check.state].text)}>{head}</span>
        {': '}
        <span className="text-[var(--color-muted-foreground)]">{detail}</span>
      </span>
    </div>
  );
}
