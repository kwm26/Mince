// Words and numbers for the screens: signed deltas that never rely on colour,
// plan totals, and day names. Pure: no React, no storage.

import type { PlanResult, Recipe } from '../types';
import { addDays, dayLabel } from './dates';

const MINUS = '−';
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** A number with an explicit sign and a true minus: "+6", "−0.4", "0". */
export function signed(n: number, digits = 0): string {
  const r = round(n, digits);
  if (r === 0) return '0';
  const body = Math.abs(r).toFixed(digits);
  return r > 0 ? `+${body}` : `${MINUS}${body}`;
}

export interface DeltaWords {
  unit: string;          // "packs", "g", "min"
  digits?: number;
  less: string;          // said when the number goes down, e.g. "less waste"
  more: string;          // said when it goes up, e.g. "more waste"
  same: string;          // said when it rounds to zero, e.g. "No change in waste"
}

/** "−0.4 packs, less waste". The sign and the word carry the meaning, never colour alone. */
export function deltaPhrase(n: number, words: DeltaWords): string {
  const digits = words.digits ?? 0;
  const r = round(n, digits);
  if (r === 0) return words.same;
  return `${signed(r, digits)} ${words.unit}, ${r < 0 ? words.less : words.more}`;
}

export const WASTE_WORDS: DeltaWords = { unit: 'packs', digits: 1, less: 'less waste', more: 'more waste', same: 'No change in waste' };
export const PROTEIN_WORDS: DeltaWords = { unit: 'g', less: 'less protein', more: 'more protein', same: 'No change in protein' };
export const COOK_WORDS: DeltaWords = { unit: 'min', less: 'less cooking', more: 'more cooking', same: 'No change in cooking time' };

/** Days whose value changed by at least half a unit, so rounding never shows "+0 g". */
export function changedDays(deltaByDay: readonly number[]): number[] {
  const out: number[] = [];
  deltaByDay.forEach((d, i) => {
    if (Math.abs(d) >= 0.5) out.push(i);
  });
  return out;
}

/** "67%" for a 0–1 rate. */
export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Packs to one decimal: "1.4", "0". */
export function packs(n: number): string {
  const r = round(n, 1);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Total cooking minutes across a plan's batches. */
export function planCookMinutes(plan: PlanResult, recipeById: ReadonlyMap<string, Recipe>): number {
  return plan.batches.reduce((sum, b) => sum + (recipeById.get(b.recipeId)?.minutes ?? 0), 0);
}

/** "Tuesday" for plan day `day`. */
export function weekdayName(startDate: string, day: number): string {
  const d = new Date(`${addDays(startDate, day)}T00:00:00Z`);
  return LONG_DAYS[d.getUTCDay()] ?? '';
}

/** "Tue 3" for plan day `day`. */
export function shortDay(startDate: string, day: number): string {
  const { weekday, date } = dayLabel(startDate, day);
  return `${weekday.charAt(0)}${weekday.slice(1).toLowerCase()} ${date}`;
}

/** "Tue 3 Nov" for an ISO date. */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = LONG_DAYS[d.getUTCDay()]?.slice(0, 3) ?? '';
  return `${wd} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()] ?? ''}`;
}
