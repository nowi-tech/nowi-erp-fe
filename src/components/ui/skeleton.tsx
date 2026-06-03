import { cn } from '@/lib/utils';

/**
 * Shimmer skeleton placeholder. A linear-gradient sweeps across a muted
 * block — quieter than Tailwind's opacity `animate-pulse` and reads as
 * "loading" without the page strobing.
 *
 * Pass any sizing classes via `className` (e.g. `h-32 w-full`,
 * `h-4 w-32`). The animation is defined in `src/index.css`
 * (`@keyframes shimmer`) and the colour follows the design tokens
 * (`--color-muted` / `--color-border`), so it stays in step with the
 * theme everywhere it's used.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  // Rendered as a <span> (not <div>) so it's valid HTML inside a <p> or other
  // phrasing context — e.g. an inline subtitle placeholder — while `block` in
  // the base keeps standalone usages behaving like the old block element. A
  // caller's `inline-block` still wins (Tailwind orders it after `block`).
  return (
    <span
      aria-hidden
      className={cn(
        'block relative isolate overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-muted)]',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:bg-gradient-to-r before:from-transparent before:via-[color-mix(in_oklab,var(--color-border)_60%,transparent)] before:to-transparent',
        'before:animate-[shimmer_1.5s_infinite]',
        className,
      )}
      {...props}
    />
  );
}
