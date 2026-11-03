// Typed access to data/*.json, Constraints defaults (data-model §2) and example
// seed loading (§13). Pure: no React, no storage.

import recipesJson from '../../data/recipes.json';
import ingredientsJson from '../../data/ingredients.json';
import fridgesJson from '../../data/fridges.json';
import weeksJson from '../../data/weeks.json';
import type { Constraints, FridgeSeed, Ingredient, PantryItem, Recipe, WeekSeed } from '../types';

export const recipes = recipesJson as Recipe[];
export const ingredients = ingredientsJson as Ingredient[];
export const fridges = fridgesJson as FridgeSeed[];
export const weeks = weeksJson as WeekSeed[];

export const ingredientById: ReadonlyMap<string, Ingredient> = new Map(ingredients.map((i) => [i.id, i]));
export const recipeById: ReadonlyMap<string, Recipe> = new Map(recipes.map((r) => [r.id, r]));

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function defaultConstraints(startDate: string): Constraints {
  const days = 7;
  return {
    startDate,
    days,
    proteinPerDay: 150,
    mealsPerDay: { breakfast: 1, main: 2 },
    maxCookMinutes: Array<number>(days).fill(60),
    cookedFoodLifeDays: 3,
    frozenLifeDays: 30,
    maxRepeatsPerRecipe: 2,
    pins: [],
    excluded: [],
    excludedSlots: [],
    pantry: [],
    weights: { waste: 1.0, protein: 2.0, cookTime: 0.3 },
  };
}

/** A seed fridge as pantry items added today (§13), so the demo never goes stale. */
export function fridgeToPantry(fridge: FridgeSeed, today: string): PantryItem[] {
  return fridge.items.map((item) => ({
    ingredientId: item.ingredientId,
    amount: item.amount,
    addedOn: today,
    daysLeftAtAdd: item.daysLeft,
  }));
}

/** A seed week merged over the defaults, starting today, with its fridge as the pantry. */
export function weekToConstraints(week: WeekSeed, today: string): Constraints {
  const fridge = week.fridgeId === null ? undefined : fridges.find((f) => f.id === week.fridgeId);
  if (week.fridgeId !== null && !fridge) {
    throw new Error(`Week "${week.id}" uses unknown fridge "${week.fridgeId}"`);
  }
  return {
    ...defaultConstraints(today),
    proteinPerDay: week.proteinPerDay,
    maxCookMinutes: [...week.maxCookMinutes],
    pins: week.pins.map((p) => ({ ...p })),
    pantry: fridge ? fridgeToPantry(fridge, today) : [],
  };
}
