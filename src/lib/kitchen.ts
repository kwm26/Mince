// Kitchen helpers (data-model §12). Pure: no React, no storage.

import type { Ingredient, PantryItem, Recipe } from '../types';
import { ingredientById } from './data';
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

export interface RankedRecipe {
  recipe: Recipe;
  overlap: number;                // distinct perishable pantry ingredients it uses (core or optional)
  usesIds: string[];              // those ingredient ids, soonest to turn first
  soonestDaysLeft: number | null; // among those ingredients; null when overlap is 0
}

/**
 * Recipes ranked by how many of your perishables they use (data-model §12): overlap descending,
 * then the soonest days left among those ingredients, then protein per serving descending.
 * Overlap 0 comes last. Pass the catalog's ingredient map so the user's shelf-life overrides count.
 */
export function rankByOverlap(
  recipes: readonly Recipe[],
  pantry: readonly PantryItem[],
  date: string,
  ingredients: ReadonlyMap<string, Ingredient> = ingredientById,
): RankedRecipe[] {
  const left = new Map<string, number>();
  for (const item of pantry) {
    const ingredient = ingredients.get(item.ingredientId);
    if (!ingredient || !isPerishable(ingredient)) continue;
    const d = daysLeft(item, date);
    left.set(item.ingredientId, Math.min(d, left.get(item.ingredientId) ?? Infinity));
  }

  const ranked = recipes.map((recipe) => {
    const ids = new Set<string>();
    for (const ri of recipe.ingredients) {
      if (ri.role !== 'garnish' && left.has(ri.ingredientId)) ids.add(ri.ingredientId);
    }
    const usesIds = [...ids].sort((a, b) => left.get(a)! - left.get(b)! || a.localeCompare(b));
    const first = usesIds[0];
    return { recipe, overlap: usesIds.length, usesIds, soonestDaysLeft: first === undefined ? null : left.get(first)! };
  });

  const protein = (r: Recipe) => r.macrosPerServing.protein ?? -Infinity;
  return ranked.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      (a.soonestDaysLeft ?? Infinity) - (b.soonestDaysLeft ?? Infinity) ||
      protein(b.recipe) - protein(a.recipe) ||
      a.recipe.title.localeCompare(b.recipe.title),
  );
}
