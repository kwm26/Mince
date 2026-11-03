// Test fixtures only: tiny in-memory catalogs and edits of the real one. Never written
// to data/*.json; never used by the app. Pure: no React, no storage.

import type { Catalog, Constraints, Ingredient, MealType, Recipe, Role } from '../types';
import { catalog as realCatalog, defaultConstraints } from './data';

/** A Monday, so day 0 = Mon … day 6 = Sun. Tests never depend on today's date. */
export const START = '2026-11-02';

export function makeCatalog(recipes: Recipe[], ingredients: Ingredient[]): Catalog {
  return {
    recipes,
    ingredients,
    recipeById: new Map(recipes.map((r) => [r.id, r])),
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
  };
}

export function ing(id: string, shelfLifeDays: number, packSize: number, extra: Partial<Ingredient> = {}): Ingredient {
  return { id, name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '), category: 'produce', shelfLifeDays, packUnit: 'cup', packSize, ...extra };
}

export function rec(
  id: string,
  mealType: MealType,
  servings: number,
  protein: number | null,
  minutes: number,
  uses: [ingredientId: string, qty: number, role?: Role][],
  extra: Partial<Recipe> = {},
): Recipe {
  return {
    id,
    title: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
    mealType,
    minutes,
    difficulty: 'easy',
    servings,
    tags: [],
    macrosPerServing: { kcal: null, protein, carbs: null, fat: null },
    source: { name: 'fixture', url: 'https://example.com/fixture' },
    ingredients: uses.map(([ingredientId, qty, role]) => ({ ingredientId, qty, role: role ?? 'core' })),
    steps: [{ text: 'Cook.' }],
    ...extra,
  };
}

/** The real catalog with one ingredient changed (in memory only). */
export function withIngredient(base: Catalog, id: string, patch: Partial<Ingredient>): Catalog {
  return makeCatalog(base.recipes, base.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

/** The real catalog with one recipe changed (in memory only). */
export function withRecipe(base: Catalog, id: string, patch: Partial<Recipe>): Catalog {
  return makeCatalog(base.recipes.map((r) => (r.id === id ? { ...r, ...patch } : r)), base.ingredients);
}

export function constraints(patch: Partial<Constraints> = {}): Constraints {
  return { ...defaultConstraints(START), ...patch };
}

export { realCatalog };

/**
 * Hand-checkable catalog for the §4 metrics:
 * spinach 5 d / 5-cup pack, tomato 5 d / 4-cup pack, lemon 14 d / 1, rice 365 d (not
 * perishable), avocado 4 d, salt (staple), basil (garnish only).
 */
export const mini = makeCatalog(
  [
    rec('alpha', 'main', 4, 40, 30, [['spinach', 2], ['tomato', 3], ['lemon', 0.5], ['rice', 1], ['salt', 0], ['basil', 0.25, 'garnish']]),
    rec('beta', 'main', 4, 35, 20, [['spinach', 2], ['tomato', 2]]),
    rec('gamma', 'main', 4, 30, 15, [['spinach', 1], ['salt', 0]]),
    rec('delta', 'main', 4, 30, 15, [['tomato', 1], ['avocado', 1, 'optional'], ['basil', 1, 'garnish']]),
  ],
  [
    ing('spinach', 5, 5),
    ing('tomato', 5, 4),
    ing('lemon', 14, 1, { packUnit: 'each' }),
    ing('rice', 365, 10),
    ing('avocado', 4, 1, { packUnit: 'each' }),
    ing('salt', 365, 1, { staple: true }),
    ing('basil', 5, 1),
  ],
);
