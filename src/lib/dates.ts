// Calendar-date helpers on ISO dates (YYYY-MM-DD). Arithmetic runs in UTC so
// daylight-saving changes never shift a day. Pure: no React, no storage.

const MS_PER_DAY = 86_400_000;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Not an ISO date: "${iso}"`);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Label for plan day `day` counted from `startDate`, e.g. { weekday: 'MON', date: 3 }. */
export function dayLabel(startDate: string, day: number): { weekday: string; date: number } {
  const d = new Date(toUtc(addDays(startDate, day)));
  return { weekday: WEEKDAYS[d.getUTCDay()] ?? '', date: d.getUTCDate() };
}
