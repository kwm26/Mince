// Absorbers (data-model §11): swaps that use up a leftover ingredient. Replace a planned,
// unpinned batch with a same-meal-type recipe on the same day that uses the ingredient;
// keep only swaps that hold constraints 2–6; rank by Δ wastePacks, most negative first.
// Pure: no React, no storage.

import type { Absorber, Catalog, Constraints, PlanResult, WasteInfo } from '../types';
import { recipeUses } from './model';
import { previewWith } from './preview';
import { leftoverPacks, metrics } from './waste';

const EPS = 1e-9;

export function absorbers(ingredientId: string, plan: PlanResult, constraints: Constraints, catalog: Catalog): Absorber[] {
  const before = metrics(plan.batches, constraints, catalog);
  return absorbersWith(ingredientId, plan, constraints, catalog, before);
}

function absorbersWith(
  ingredientId: string,
  plan: PlanResult,
  constraints: Constraints,
  catalog: Catalog,
  before: ReturnType<typeof metrics>,
): Absorber[] {
  const out: Absorber[] = [];
  plan.batches.forEach((batch, k) => {
    if (batch.pinned) return;
    const current = catalog.recipeById.get(batch.recipeId);
    if (!current) return;
    for (const recipe of catalog.recipes) {
      if (recipe.id === batch.recipeId || recipe.mealType !== current.mealType) continue;
      if (constraints.excluded.includes(recipe.id)) continue;
      if (!recipeUses(recipe, batch.day, constraints, catalog).some((u) => u.ingredient.id === ingredientId)) continue;
      const p = previewWith(plan, { kind: 'swap', batchIndex: k, recipeId: recipe.id }, constraints, catalog, { before, explain: false });
      if (!p.feasible) continue;
      out.push({ ingredientId, recipeId: recipe.id, day: batch.day, replacesBatchIndex: k, deltaWastePacks: p.delta.wastePacks });
    }
  });
  return out.sort((a, b) => a.deltaWastePacks - b.deltaWastePacks || a.day - b.day || a.recipeId.localeCompare(b.recipeId));
}

/** Leftover perishables (in packs) and the single best absorber across them, if it lowers waste. */
export function wasteInfo(plan: PlanResult, constraints: Constraints, catalog: Catalog): WasteInfo {
  const left = leftoverPacks(plan.batches, constraints, catalog);
  const before = metrics(plan.batches, constraints, catalog);
  let best: Absorber | undefined;
  for (const id of Object.keys(left)) {
    const top = absorbersWith(id, plan, constraints, catalog, before)[0];
    if (top && top.deltaWastePacks < -EPS && (!best || top.deltaWastePacks < best.deltaWastePacks)) best = top;
  }
  const info: WasteInfo = { leftoverPacks: left };
  if (best) info.best = best;
  return info;
}
