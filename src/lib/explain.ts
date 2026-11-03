// Explanations (data-model §8): up to 3 short reasons per batch, generated from the
// model, never an LLM. Ingredient reasons cite only core or optional ingredients.
// Pure: no React, no storage.

import type { Catalog, Constraints, PlanResult } from '../types';
import { isPerishable } from './kitchen';
import { dayRange, ingredientLabel, listNames, recipeLabel, weekday } from './labels';
import { droppedOptionals, effectiveLife, pantryItems, recipeUses } from './model';

const DEFAULT_LIMIT = 60;

/** Reasons for one batch of `plan`, most telling first, at most 3. */
export function explainBatch(batchIndex: number, plan: PlanResult, constraints: Constraints, catalog: Catalog): string[] {
  const batch = plan.batches[batchIndex];
  if (!batch) return [];
  const recipe = catalog.recipeById.get(batch.recipeId);
  if (!recipe) return [];
  const start = constraints.startDate;
  const day = batch.day;
  const uses = recipeUses(recipe, day, constraints, catalog);
  const reasons: string[] = [];

  // Pinned
  if (batch.pinned) reasons.push('you pinned this');

  // Frozen
  if (batch.frozenPortions > 0) {
    const days = plan.meals.filter((m) => m.batchIndex === batchIndex && m.frozen).map((m) => m.day);
    const when = days.length > 0 ? `for ${dayRange(start, days)}` : 'for later';
    reasons.push(`${batch.frozenPortions} ${batch.frozenPortions === 1 ? 'portion' : 'portions'} frozen ${when}`);
  }

  // Dropped
  const dropped = droppedOptionals(recipe, day, constraints, catalog);
  if (dropped[0]) {
    const first = dropped[0];
    reasons.push(`cooked without ${ingredientLabel(first)} (only good through ${weekday(start, effectiveLife(first, constraints))})`);
  }

  // Time: only worth saying on a day tighter than the default.
  const limit = constraints.maxCookMinutes[day] ?? 0;
  const timeReason = limit > 0 && limit < DEFAULT_LIMIT ? `fits your ${limit}-min limit on ${weekday(start, day)}` : null;
  if (timeReason) reasons.push(timeReason);

  // Shared: the other recipe's batch sharing the most perishables with this one.
  const mine = new Map(uses.filter((u) => isPerishable(u.ingredient)).map((u) => [u.ingredient.id, u.ingredient]));
  let shared: { names: string[]; day: number; title: string } | null = null;
  for (let k = 0; k < plan.batches.length; k++) {
    const other = plan.batches[k]!;
    if (k === batchIndex || other.recipeId === batch.recipeId) continue;
    const otherRecipe = catalog.recipeById.get(other.recipeId);
    if (!otherRecipe) continue;
    const names = recipeUses(otherRecipe, other.day, constraints, catalog)
      .filter((u) => mine.has(u.ingredient.id))
      .map((u) => ingredientLabel(u.ingredient));
    if (names.length === 0) continue;
    const closer = shared !== null && names.length === shared.names.length && Math.abs(other.day - day) < Math.abs(shared.day - day);
    if (shared === null || names.length > shared.names.length || closer) {
      shared = { names, day: other.day, title: recipeLabel(otherRecipe, true) };
    }
  }
  if (shared) reasons.push(`shares ${listNames(shared.names)} with ${weekday(start, shared.day)}'s ${shared.title}`);

  // Expiry: pantry stock first, then the shortest-lived fresh ingredient that expires this week.
  const pantry = pantryItems(constraints, catalog);
  let expiry: string | null = null;
  let soonest = Infinity;
  for (const u of uses) {
    if (!isPerishable(u.ingredient)) continue;
    const item = (pantry.get(u.ingredient.id) ?? []).find((x) => x.daysLeft >= day && x.daysLeft < constraints.days);
    if (item && item.daysLeft < soonest) {
      soonest = item.daysLeft;
      expiry = `uses your ${ingredientLabel(u.ingredient)} before it expires ${weekday(start, item.daysLeft)}`;
    }
  }
  if (!expiry) {
    for (const u of uses) {
      const life = effectiveLife(u.ingredient, constraints);
      if (isPerishable(u.ingredient) && !u.ingredient.freezable && life < constraints.days && life < soonest) {
        soonest = life;
        expiry = `uses ${ingredientLabel(u.ingredient)} before it expires ${weekday(start, life)}`;
      }
    }
  }
  if (expiry) reasons.push(expiry);

  // Protein always makes the cut when the recipe publishes it.
  const protein = recipe.macrosPerServing.protein;
  const proteinReason = protein === null ? null : `+${Math.round(protein)} g protein per serving`;
  const out = reasons.slice(0, proteinReason ? 2 : 3);
  if (proteinReason) out.push(proteinReason);
  return out;
}

/** The plan with `reason` set on every batch. */
export function explainPlan(plan: PlanResult, constraints: Constraints, catalog: Catalog): PlanResult {
  return {
    ...plan,
    batches: plan.batches.map((b, k) => ({ ...b, reason: explainBatch(k, plan, constraints, catalog) })),
  };
}
