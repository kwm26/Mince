// Greedy baseline (data-model §6): start from the pins, then repeatedly cover the first
// uncovered day with the feasible (recipe, day) that adds the least waste (ties: more
// protein per serving, then less time). The comparison baseline for the optimizer and
// its fallback. Pure: no React, no storage.
//
// One addition to §6: a choice that leaves some later day impossible to cover (e.g. late
// breakfasts after the variety limit is used up) is skipped by a cheap look-ahead, and if
// the greedy order still hits a dead end it backtracks to the next-best choice, within a
// fixed budget. Without a dead end the result is plain greedy.

import type { Batch, Catalog, Constraints, MealType, PlanResult, Recipe } from '../types';
import { explainPlan } from './explain';
import { weekday } from './labels';
import { checkPins, checkPlan, isFeasibleSlot, MEAL_TYPES, minFrozenPortions, sortBatches } from './model';
import { emptyPlan, planFromBatches, wastePacks } from './waste';

const EPS = 1e-9;
const NODE_BUDGET = 400;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

type Gap = { day: number; mealType: MealType };

/** The first (day, meal type) whose cumulative portions fall short (constraint 3), or null. */
function firstUncovered(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): Gap | null {
  for (let t = 0; t < constraints.days; t++) {
    for (const m of MEAL_TYPES) {
      let cum = 0;
      for (const b of batches) {
        const r = catalog.recipeById.get(b.recipeId);
        if (r?.mealType === m && b.day <= t) cum += r.servings;
      }
      if (cum < constraints.mealsPerDay[m] * (t + 1)) return { day: t, mealType: m };
    }
  }
  return null;
}

interface Candidate { batch: Batch; delta: number; recipe: Recipe; }

/** Lower Δ waste, then higher protein per serving, then shorter time, then the later (fresher) day. */
function compare(a: Candidate, b: Candidate): number {
  if (Math.abs(a.delta - b.delta) > EPS) return a.delta - b.delta;
  const pa = a.recipe.macrosPerServing.protein ?? 0;
  const pb = b.recipe.macrosPerServing.protein ?? 0;
  if (pa !== pb) return pb - pa;
  if (a.recipe.minutes !== b.recipe.minutes) return a.recipe.minutes - b.recipe.minutes;
  return b.batch.day - a.batch.day;
}

/**
 * Look-ahead used to skip dead ends: without frozen portions, constraints 3 and 4 together
 * need at least n_m portions cooked in every window of L days ending on day t. Checks that
 * each window can still get them from recipes with variety, mask and cooking time left.
 */
function canStillCover(batches: readonly Batch[], eligible: Recipe[], constraints: Constraints, catalog: Catalog): boolean {
  const D = constraints.days;
  const L = constraints.cookedFoodLifeDays;
  const minutes = Array<number>(D).fill(0);
  const count = new Map<string, number>();
  for (const b of batches) {
    const r = catalog.recipeById.get(b.recipeId);
    if (!r) continue;
    minutes[b.day] = (minutes[b.day] ?? 0) + r.minutes;
    count.set(r.id, (count.get(r.id) ?? 0) + 1);
  }
  for (const m of MEAL_TYPES) {
    const n = constraints.mealsPerDay[m];
    if (n <= 0) continue;
    const ofType = eligible.filter((r) => r.mealType === m);
    if (ofType.some((r) => r.freezesWell)) continue;
    for (let t = 0; t < D; t++) {
      const from = Math.max(0, t - L + 1);
      let have = 0;
      for (const b of batches) {
        const r = catalog.recipeById.get(b.recipeId);
        if (r?.mealType === m && b.day >= from && b.day <= t) have += r.servings;
      }
      for (const r of ofType) {
        if (have >= n) break;
        const left = constraints.maxRepeatsPerRecipe - (count.get(r.id) ?? 0);
        let slots = 0;
        for (let d = from; d <= t && slots < left; d++) {
          if (batches.some((b) => b.recipeId === r.id && b.day === d)) continue;
          if ((minutes[d] ?? 0) + r.minutes > (constraints.maxCookMinutes[d] ?? 0)) continue;
          if (isFeasibleSlot(r, d, constraints, catalog)) slots++;
        }
        have += slots * r.servings;
      }
      if (have < n) return false;
    }
  }
  return true;
}

function candidates(batches: Batch[], gap: Gap, eligible: Recipe[], constraints: Constraints, catalog: Catalog): Candidate[] {
  const base = wastePacks(batches, constraints, catalog);
  const out: Candidate[] = [];
  for (const recipe of eligible) {
    if (recipe.mealType !== gap.mealType) continue;
    for (let d = 0; d <= gap.day; d++) {
      if (batches.some((b) => b.recipeId === recipe.id && b.day === d)) continue;
      if (!isFeasibleSlot(recipe, d, constraints, catalog)) continue;
      const batch: Batch = { recipeId: recipe.id, day: d, pinned: false, frozenPortions: 0 };
      batch.frozenPortions = minFrozenPortions(batch, batches, constraints, catalog);
      const next = [...batches, batch];
      if (checkPlan(next, constraints, catalog, { skipCover: true })) continue;
      if (!canStillCover(next, eligible, constraints, catalog)) continue;
      out.push({ batch, delta: wastePacks(next, constraints, catalog) - base, recipe });
    }
  }
  return out.sort(compare);
}

/** Greedy plan with reasons. Status 'timeout-best' (valid, not proven optimal) or 'infeasible'. */
export function greedyPlan(constraints: Constraints, catalog: Catalog): PlanResult {
  const t0 = now();
  const pinReason = checkPins(constraints, catalog);
  if (pinReason) return emptyPlan(constraints, pinReason, now() - t0);

  const pins: Batch[] = [];
  for (const pin of constraints.pins) {
    const batch: Batch = { recipeId: pin.recipeId, day: pin.day, pinned: true, frozenPortions: 0 };
    batch.frozenPortions = minFrozenPortions(batch, pins, constraints, catalog);
    pins.push(batch);
  }
  if (checkPlan(pins, constraints, catalog, { skipCover: true })) {
    return emptyPlan(constraints, 'These pins leave no way to cover every meal.', now() - t0);
  }

  const excluded = new Set(constraints.excluded);
  const eligible = catalog.recipes.filter((r) => !excluded.has(r.id) && r.macrosPerServing.protein !== null);
  let budget = NODE_BUDGET;
  let deepest: Gap | null = null;

  // Depth-first in greedy order. With `jump`, a dead end in one meal type skips straight
  // back to the last choice of that type (meal types only interact through cooking time).
  type Outcome = { plan: Batch[] } | { failed: MealType };
  const extend = (batches: Batch[], jump: boolean): Outcome => {
    const gap = firstUncovered(batches, constraints, catalog);
    if (!gap) return { plan: batches };
    if (!deepest || gap.day > deepest.day) deepest = gap;
    if (budget-- <= 0) return { failed: gap.mealType };
    let failed: MealType = gap.mealType;
    for (const c of candidates(batches, gap, eligible, constraints, catalog)) {
      const out = extend([...batches, c.batch], jump);
      if ('plan' in out) return out;
      if (budget <= 0) return out;
      failed = out.failed;
      if (jump && out.failed !== c.recipe.mealType) return out;
    }
    return { failed };
  };

  let found = extend(pins, true);
  if (!('plan' in found) && budget > 0) found = extend(pins, false);
  const batches = 'plan' in found ? found.plan : null;
  if (!batches) {
    const gap = deepest as Gap | null;
    const where = gap ? `${weekday(constraints.startDate, gap.day)}'s ${gap.mealType}` : 'every meal';
    return emptyPlan(constraints, `No combination of recipes covers ${where} within these limits.`, now() - t0);
  }
  const plan = planFromBatches(sortBatches(batches, catalog), constraints, catalog, { status: 'timeout-best', solveMs: 0 });
  const explained = explainPlan(plan, constraints, catalog);
  explained.solveMs = now() - t0;
  return explained;
}
