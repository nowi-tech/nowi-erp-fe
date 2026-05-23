import { CheckCircle2, UserRound } from 'lucide-react';

interface Props {
  /** Reviewer display name (e.g. "Parul", "Dheeraj"). */
  name: string;
  /** Short role line, e.g. "Women's pattern master · Approval #1". */
  role: string;
  /** Checks the reviewer will run — rendered as small chip pills. */
  checks: string[];
}

/**
 * Slim full-width card that surfaces who the Approval #1 reviewer is
 * before the user fills anything out. The navy left accent matches the
 * locked Stitch design — its only purpose is to set expectations:
 * "this is the human who will look at your submission next".
 */
export default function ReviewerCard({ name, role, checks }: Props) {
  return (
    <section className="flex items-start gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div
        aria-hidden
        className="h-full w-1 shrink-0 self-stretch bg-[var(--color-primary)]"
      />
      <div className="flex flex-1 flex-col gap-2 py-3 pr-5 sm:flex-row sm:items-center sm:justify-between sm:py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-primary)]">
            <UserRound size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-[var(--color-foreground)]">
              Approval #1 reviewer: {name}
            </div>
            <div className="truncate text-[12px] text-[var(--color-muted-foreground)]">
              {role}
            </div>
          </div>
        </div>
        {checks.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 sm:justify-end">
            {checks.map((c) => (
              <li
                key={c}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-foreground)]"
              >
                <CheckCircle2
                  size={11}
                  className="text-[var(--color-primary)]"
                />
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
