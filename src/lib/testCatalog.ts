// Small hand-built catalogs for graph and lens tests. Not recipe data: the
// values here only exercise the rules; the app never reads this file.

import type { Catalog, Ingredient, MealType, Recipe, RecipeIngredient } from '../types';

export function ing(id: string, shelfLifeDays: number, extra: Partial<Ingredient> = {}): Ingredient {
  return { id, name: id, category: 'produce', shelfLifeDays, packUnit: 'each', packSize: 1, ...extra };
}

export function rec(
  id: string,
  uses: (string | [string, RecipeIngredient['role']])[],
  extra: Partial<Recipe> & { mealType?: MealType } = {},
): Recipe {
  return {
    id,
    title: id,
    mealType: 'main',
    minutes: 30,
    difficulty: 'easy',
    servings: 4,
    tags: [],
    macrosPerServing: { kcal: 400, protein: 35, carbs: 30, fat: 10 },
    source: { name: 'fixture', url: '' },
    ingredients: uses.map((u) => {
      const [ingredientId, role] = typeof u === 'string' ? [u, 'core' as const] : u;
      return { ingredientId, qty: 0.5, role };
    }),
    steps: [],
    ...extra,
  };
}

export function makeCatalog(recipes: Recipe[], ingredients: Ingredient[]): Catalog {
  return {
    recipes,
    ingredients,
    recipeById: new Map(recipes.map((r) => [r.id, r])),
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
  };
}
