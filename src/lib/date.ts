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

/** "17 Jun 2026" from an ISO timestamp; "—" when missing. */
export function fullDayLabel(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/** "26 Nov, 6:07 pm" from an ISO timestamp. */
export function dayTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "05 Nov" from a YYYY-MM-DD day key, read as a local date. */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
