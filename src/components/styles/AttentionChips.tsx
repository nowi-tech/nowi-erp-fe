import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  awaitingApproval1: number;
  awaitingApproval2: number;
  readyForQc: number;
}

interface Chip {
  i18n: string;
  n: number;
  /** Soft / ink tokens — keep within existing palette. */
  bg: string;
  fg: string;
  dot: string;
}

export default function AttentionChips({
  awaitingApproval1,
  awaitingApproval2,
  readyForQc,
}: Props) {
  const { t } = useTranslation();
  const chips: Chip[] = [
    {
      i18n: 'admin.styles.attention.awaitingApproval1',
      n: awaitingApproval1,
      bg: 'var(--status-rework-bg)',
      fg: 'var(--status-rework-ink)',
      dot: 'var(--status-rework-acc)',
    },
    {
      i18n: 'admin.styles.attention.awaitingApproval2',
      n: awaitingApproval2,
      bg: 'var(--status-rework-bg)',
      fg: 'var(--status-rework-ink)',
      dot: 'var(--status-rework-acc)',
    },
    {
      i18n: 'admin.styles.attention.readyForQc',
      n: readyForQc,
      bg: 'var(--stage-stitch-bg)',
      fg: 'var(--stage-stitch-ink)',
      dot: 'var(--stage-stitch-acc)',
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div
          key={c.i18n}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border',
          )}
          style={{
            background: c.bg,
            color: c.fg,
            borderColor: 'color-mix(in oklab, var(--color-border) 60%, transparent)',
          }}
        >
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: c.dot }}
          />
          {t(c.i18n, { n: c.n })}
        </div>
      ))}
    </div>
  );
}
