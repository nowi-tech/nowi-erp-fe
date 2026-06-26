/**
 * Local-calendar date helpers.
 *
 * Prefer these over `new Date().toISOString().slice(0, 10)`, which formats in
 * UTC and so reports the wrong day near midnight for non-UTC users. Several
 * screens hand-rolled this; new code should import from here.
 */

/** A Date → "YYYY-MM-DD" using its LOCAL calendar parts (not UTC). */
export function localISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Today as "YYYY-MM-DD" in the local calendar. */
export function todayISO(): string {
  return localISO(new Date());
}
