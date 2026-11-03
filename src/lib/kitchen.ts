// Kitchen helpers (data-model §12). Pure: no React, no storage.

import type { Ingredient, PantryItem } from '../types';
import { daysBetween } from './dates';

/** Perishable per data-model §3–4: not a staple, and lasts 14 days or less. */
export function isPerishable(ingredient: Ingredient): boolean {
  return !ingredient.staple && ingredient.shelfLifeDays <= 14;
}

/** Days of life left on `date`, from when the item was added; never below 0. */
export function daysLeft(item: PantryItem, date: string): number {
  return Math.max(0, item.daysLeftAtAdd - daysBetween(item.addedOn, date));
}

/** Use-soon tag threshold from data-model §12. */
export function isUseSoon(days: number): boolean {
  return days <= 2;
}

/** "Today", "1 day", "5 days". The tag always says how long is left (design-spec §2). */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Today';
  return days === 1 ? '1 day' : `${days} days`;
}

const COUNT_UNITS = new Set(['cup', 'clove', 'can', 'handful']);

/** An amount in its pack unit, e.g. "2 cups", "0.5 cup", "8 oz", "×3" for whole items. */
export function formatAmount(amount: number, unit: string): string {
  const n = Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
  if (unit === 'each') return `×${n}`;
  if (unit === 'inch') return `${n} ${amount === 1 ? 'inch' : 'inches'}`;
  if (COUNT_UNITS.has(unit) && amount > 1) return `${n} ${unit}s`;
  return `${n} ${unit}`;
}
