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

interface Portion {
  batchIndex: number;
  cookDay: number;
  frozen: boolean;
  from: number;      // first day it can be eaten (frozen: the day after cooking)
  to: number;        // last day in the plan it can be eaten
  mustEat: boolean;  // fresh, and its life ends inside the plan: uneaten means spoiled
  protein: number;
}

/** Eating order on a day: soonest to spoil first, fresh before frozen, oldest batch first. */
function urgency(a: Portion, b: Portion): number {
  return a.to - b.to || Number(a.frozen) - Number(b.frozen) || a.cookDay - b.cookDay || a.batchIndex - b.batchIndex;
}

/**
 * Earliest-deadline-first matching of portions to n slots a day (Glover's rule): a maximum
 * matching for these interval constraints. Returns each day's portions and the matched set.
 */
function assign(portions: readonly Portion[], n: number, D: number): { byDay: Portion[][]; matched: Set<Portion> } {
  const byDay: Portion[][] = Array.from({ length: D }, () => []);
  const matched = new Set<Portion>();
  const sorted = [...portions].sort(urgency);
  for (let t = 0; t < D; t++) {
    for (const p of sorted) {
      if (byDay[t]!.length >= n) break;
      if (matched.has(p) || p.from > t || p.to < t) continue;
      matched.add(p);
      byDay[t]!.push(p);
    }
  }
  return { byDay, matched };
}

/**
 * Which portions are eaten inside the plan: every must-eat portion, then the portions that
 * may also be eaten after the last day (fresh from the last days, frozen) by protein, highest
 * first, as long as the set still fits the slots. Feasible sets form a matroid, so this
 * greedy gives the most protein eaten: the same quantity the model maximizes with x[r,d,t].
 */
function choosePortions(portions: readonly Portion[], n: number, D: number): Portion[] {
  const chosen = portions.filter((p) => p.mustEat);
  const base = assign(chosen, n, D).matched.size;
  const optional = portions
    .filter((p) => !p.mustEat)
    .sort((a, b) => b.protein - a.protein || Number(a.frozen) - Number(b.frozen) || a.cookDay - b.cookDay || a.batchIndex - b.batchIndex);
  let added = 0;
  for (const p of optional) {
    if (base + added >= n * D) break;
    if (assign([...chosen, p], n, D).matched.size === base + added + 1) {
      chosen.push(p);
      added++;
    }
  }
  return chosen;
}

/**
 * Assigns portions to meal slots per meal type. Portions whose life ends inside the plan are
 * always eaten; of the rest (which can also be eaten after the last day), the plan eats the
 * ones with the most protein. Each day eats the portions closest to spoiling first, fresh
 * before frozen, oldest batch first. Uneaten fresh portions carry over past the last day.
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
    // One entry per cooked portion: the days it can be eaten in the plan.
    const portions: Portion[] = [];
    batches.forEach((b, k) => {
      const recipe = catalog.recipeById.get(b.recipeId);
      if (recipe?.mealType !== m) return;
      const protein = recipe.macrosPerServing.protein ?? 0;
      const lastFresh = b.day + L - 1;
      for (let p = 0; p < recipe.servings - b.frozenPortions; p++) {
        portions.push({ batchIndex: k, cookDay: b.day, frozen: false, from: b.day, to: Math.min(lastFresh, D - 1), mustEat: lastFresh <= D - 1, protein });
      }
      for (let p = 0; p < b.frozenPortions; p++) {
        portions.push({ batchIndex: k, cookDay: b.day, frozen: true, from: b.day + 1, to: D - 1, mustEat: false, protein });
      }
    });
    const eaten = choosePortions(portions, n, D);
    const assigned = assign(eaten, n, D);
    for (const [t, list] of assigned.byDay.entries()) {
      for (const p of list) {
        meals.push({ day: t, mealType: m, batchIndex: p.batchIndex, frozen: p.frozen });
        if (p.frozen) {
          const key = `${t - 1}|${p.batchIndex}`;
          thaw.set(key, (thaw.get(key) ?? 0) + 1);
        }
      }
      for (let s = list.length; s < n; s++) short.push({ day: t, mealType: m });
    }
    for (const p of portions) {
      if (p.mustEat && !assigned.matched.has(p)) spoiled.push({ batchIndex: p.batchIndex, day: p.to + 1 });
    }
    const frozenLeft = new Map<number, number>();
    for (const p of portions) if (p.frozen && !assigned.matched.has(p)) frozenLeft.set(p.batchIndex, (frozenLeft.get(p.batchIndex) ?? 0) + 1);
    for (const [batchIndex, left] of [...frozenLeft].sort((a, b) => a[0] - b[0])) inFreezer.push({ batchIndex, portions: left });
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
