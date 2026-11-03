// Post-solve schedule (data-model §5): which portion is eaten when, protein per day,
// freezer notes and the spoilage flag. Pure: no React, no storage.

import type { Batch, Catalog, Constraints, Meal, MealType } from '../types';
import { ingredientLabel, plural, recipeLabel } from './labels';
import { MEAL_TYPES, recipeUses } from './model';

export interface Schedule {
  meals: Meal[];
  proteinByDay: number[];
  notes: { day: number; text: string }[];
  /** Ingredients to freeze on shopping day: freezable and used after their shelf life. */
  freezeOnShoppingDay: Set<string>;
  /** Fresh portions eaten after day + L − 1. Constraint 4 should keep this empty; it catches bugs. */
  spoiled: { batchIndex: number; day: number }[];
  /** Meal slots nothing could fill (an incomplete plan, e.g. a "remove" preview). */
  short: { day: number; mealType: MealType }[];
  /** Cooked portions still frozen after the last day: food, not waste. */
  inFreezer: { batchIndex: number; portions: number }[];
}

/** Freezable ingredients used on a day after their shelf life, with those cook days. */
export function rawFreezeDays(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const b of batches) {
    const recipe = catalog.recipeById.get(b.recipeId);
    if (!recipe) continue;
    for (const { ingredient } of recipeUses(recipe, b.day, constraints, catalog)) {
      if (!ingredient.freezable || b.day <= ingredient.shelfLifeDays) continue;
      const days = out.get(ingredient.id) ?? [];
      if (!days.includes(b.day)) days.push(b.day);
      out.set(ingredient.id, days);
    }
  }
  return out;
}

/**
 * Assigns portions to meal slots per meal type: fresh portions first, oldest batch first;
 * frozen portions fill the slots fresh portions can't.
 */
export function schedule(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): Schedule {
  const D = constraints.days;
  const L = constraints.cookedFoodLifeDays;
  const meals: Meal[] = [];
  const spoiled: Schedule['spoiled'] = [];
  const short: Schedule['short'] = [];
  const inFreezer: Schedule['inFreezer'] = [];
  const proteinByDay = Array<number>(D).fill(0);
  const notes: { day: number; text: string }[] = [];
  const thaw = new Map<string, number>(); // `${day}|${batchIndex}` → portions moved to the fridge

  for (const m of MEAL_TYPES) {
    const n = constraints.mealsPerDay[m];
    const order = batches
      .map((b, k) => ({ b, k }))
      .filter(({ b }) => catalog.recipeById.get(b.recipeId)?.mealType === m)
      .sort((x, y) => x.b.day - y.b.day || x.k - y.k);
    const fresh = new Map(order.map(({ b, k }) => [k, catalog.recipeById.get(b.recipeId)!.servings - b.frozenPortions]));
    const frozen = new Map(order.map(({ b, k }) => [k, b.frozenPortions]));
    for (let t = 0; t < D; t++) {
      for (let slot = 0; slot < n; slot++) {
        const f = order.find(({ b, k }) => b.day <= t && (fresh.get(k) ?? 0) > 0);
        if (f) {
          fresh.set(f.k, (fresh.get(f.k) ?? 0) - 1);
          meals.push({ day: t, mealType: m, batchIndex: f.k, frozen: false });
          if (t > f.b.day + L - 1) spoiled.push({ batchIndex: f.k, day: t });
          continue;
        }
        const z = order.find(({ b, k }) => b.day < t && (frozen.get(k) ?? 0) > 0);
        if (z) {
          frozen.set(z.k, (frozen.get(z.k) ?? 0) - 1);
          meals.push({ day: t, mealType: m, batchIndex: z.k, frozen: true });
          const key = `${t - 1}|${z.k}`;
          thaw.set(key, (thaw.get(key) ?? 0) + 1);
          continue;
        }
        short.push({ day: t, mealType: m });
      }
    }
    for (const { k } of order) {
      const left = frozen.get(k) ?? 0;
      if (left > 0) inFreezer.push({ batchIndex: k, portions: left });
    }
  }

  meals.sort((a, b) => a.day - b.day || (a.mealType === b.mealType ? 0 : a.mealType === 'breakfast' ? -1 : 1));
  for (const meal of meals) {
    const recipe = catalog.recipeById.get(batches[meal.batchIndex]!.recipeId)!;
    proteinByDay[meal.day] = (proteinByDay[meal.day] ?? 0) + (recipe.macrosPerServing.protein ?? 0);
  }

  // Raw items frozen on shopping day: move to the fridge the night before cooking.
  const freezeDays = rawFreezeDays(batches, constraints, catalog);
  for (const [id, days] of freezeDays) {
    const name = ingredientLabel(catalog.ingredientById.get(id)!);
    for (const day of days) notes.push({ day: day - 1, text: `Move the ${name} from the freezer to the fridge tonight` });
  }
  // Frozen cooked portions.
  batches.forEach((b) => {
    if (b.frozenPortions <= 0) return;
    const recipe = catalog.recipeById.get(b.recipeId)!;
    notes.push({ day: b.day, text: `Freeze ${plural(b.frozenPortions, 'portion')} of ${recipeLabel(recipe, true)}` });
  });
  for (const [key, count] of thaw) {
    const [day, k] = key.split('|').map(Number) as [number, number];
    const recipe = catalog.recipeById.get(batches[k]!.recipeId)!;
    notes.push({ day, text: `Move ${plural(count, 'portion')} of ${recipeLabel(recipe, true)} to the fridge tonight` });
  }
  for (const { batchIndex, portions } of inFreezer) {
    const recipe = catalog.recipeById.get(batches[batchIndex]!.recipeId)!;
    notes.push({ day: D - 1, text: `${plural(portions, 'portion')} of ${recipeLabel(recipe, true)} ${portions === 1 ? 'stays' : 'stay'} in the freezer` });
  }
  notes.sort((a, b) => a.day - b.day);

  return { meals, proteinByDay, notes, freezeOnShoppingDay: new Set(freezeDays.keys()), spoiled, short, inFreezer };
}
