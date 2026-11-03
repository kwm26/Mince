// Metrics (data-model §4): need, pantry, packs, leftovers, wastePacks, reuseRate, the
// shopping list, and a PlanResult assembled from batches. Pure; also used by previews.

import type { Batch, Catalog, Constraints, Metrics, PlanResult } from '../types';
import { isPerishable } from './kitchen';
import { pantryItems, recipeUses } from './model';
import { schedule, type Schedule } from './schedule';

const EPS = 1e-9;

/** need(i) = Σ qty_{r,i,d} over the plan's batches: core and unexpired optional, never garnish or staples. */
export function needs(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of batches) {
    const recipe = catalog.recipeById.get(b.recipeId);
    if (!recipe) continue;
    for (const { ingredient, qty } of recipeUses(recipe, b.day, constraints, catalog)) {
      out.set(ingredient.id, (out.get(ingredient.id) ?? 0) + qty);
    }
  }
  return out;
}

export interface IngredientLedger {
  ingredientId: string;
  need: number;
  pantry: number;          // pantryAmount_i
  usablePantry: number;    // pantry that feeds batches cooked on or before its daysLeft
  packs: number;           // packs to buy
  leftover: number;        // packs·packSize + pantry − need (perishables only, else 0)
  perishable: boolean;
}

/**
 * Per-ingredient §4 accounting for every non-staple ingredient that is needed or in the pantry.
 * usablePantry(i) = min(pantry_i, Σ qty over batches with d ≤ daysLeft_i); with several
 * pantry items of one ingredient, the soonest-expiring is used first.
 */
export function ledger(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): Map<string, IngredientLedger> {
  const need = needs(batches, constraints, catalog);
  // Need by cook day, per ingredient, for the pantry window.
  const byDay = new Map<string, number[]>();
  for (const b of batches) {
    const recipe = catalog.recipeById.get(b.recipeId);
    if (!recipe) continue;
    for (const { ingredient, qty } of recipeUses(recipe, b.day, constraints, catalog)) {
      const arr = byDay.get(ingredient.id) ?? Array<number>(constraints.days).fill(0);
      arr[b.day] = (arr[b.day] ?? 0) + qty;
      byDay.set(ingredient.id, arr);
    }
  }
  const pantry = pantryItems(constraints, catalog);
  const ids = new Set([...need.keys(), ...pantry.keys()]);
  const out = new Map<string, IngredientLedger>();
  for (const id of ids) {
    const ingredient = catalog.ingredientById.get(id);
    if (!ingredient || ingredient.staple) continue;
    const n = need.get(id) ?? 0;
    const items = pantry.get(id) ?? [];
    const days = byDay.get(id) ?? [];
    let usable = 0;
    for (const item of items) {
      let window = 0;
      for (let d = 0; d <= Math.min(item.daysLeft, days.length - 1); d++) window += days[d] ?? 0;
      usable += Math.max(0, Math.min(item.amount, window - usable));
    }
    const pantryAmount = items.reduce((s, x) => s + x.amount, 0);
    const toBuy = Math.max(0, n - usable);
    const packs = toBuy <= EPS ? 0 : Math.ceil(toBuy / ingredient.packSize - EPS);
    const perishable = isPerishable(ingredient);
    const rawLeft = packs * ingredient.packSize + pantryAmount - n;
    out.set(id, {
      ingredientId: id,
      need: n,
      pantry: pantryAmount,
      usablePantry: usable,
      packs,
      leftover: perishable && rawLeft > EPS ? rawLeft : 0,
      perishable,
    });
  }
  return out;
}

/** usablePantry(i) for one ingredient. */
export function usablePantry(ingredientId: string, batches: readonly Batch[], constraints: Constraints, catalog: Catalog): number {
  return ledger(batches, constraints, catalog).get(ingredientId)?.usablePantry ?? 0;
}

/** packs(i) = ceil(max(0, need − usablePantry) / packSize). */
export function packs(ingredientId: string, batches: readonly Batch[], constraints: Constraints, catalog: Catalog): number {
  return ledger(batches, constraints, catalog).get(ingredientId)?.packs ?? 0;
}

/** Leftover perishables in packs (> 0 only): ingredientId → leftover / packSize. */
export function leftoverPacks(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): Record<string, number> {
  return leftoverFromLedger(ledger(batches, constraints, catalog), catalog);
}

function leftoverFromLedger(l: Map<string, IngredientLedger>, catalog: Catalog): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of l.values()) {
    if (e.leftover > EPS) out[e.ingredientId] = e.leftover / catalog.ingredientById.get(e.ingredientId)!.packSize;
  }
  return out;
}

/** wastePacks = Σ leftover(i) / packSize_i over perishables. */
export function wastePacks(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): number {
  return sumWaste(ledger(batches, constraints, catalog), catalog);
}

function sumWaste(l: Map<string, IngredientLedger>, catalog: Catalog): number {
  let total = 0;
  for (const e of l.values()) total += e.leftover / catalog.ingredientById.get(e.ingredientId)!.packSize;
  return total;
}

/** Share of used perishables used by ≥ 2 distinct recipes. Two batches of one recipe aren't reuse. */
export function reuseRate(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): number {
  const recipesUsing = new Map<string, Set<string>>();
  for (const b of batches) {
    const recipe = catalog.recipeById.get(b.recipeId);
    if (!recipe) continue;
    for (const { ingredient } of recipeUses(recipe, b.day, constraints, catalog)) {
      if (!isPerishable(ingredient)) continue;
      const set = recipesUsing.get(ingredient.id) ?? new Set<string>();
      set.add(recipe.id);
      recipesUsing.set(ingredient.id, set);
    }
  }
  if (recipesUsing.size === 0) return 0;
  let shared = 0;
  for (const set of recipesUsing.values()) if (set.size >= 2) shared++;
  return shared / recipesUsing.size;
}

/** What to buy on day 0, in catalog order. `freeze` = freeze on shopping day (§5). */
export function shoppingList(batches: readonly Batch[], constraints: Constraints, catalog: Catalog, freezeIds?: ReadonlySet<string>): PlanResult['shopping'] {
  const freeze = freezeIds ?? schedule(batches, constraints, catalog).freezeOnShoppingDay;
  return shoppingFromLedger(ledger(batches, constraints, catalog), catalog, freeze);
}

function shoppingFromLedger(l: Map<string, IngredientLedger>, catalog: Catalog, freeze: ReadonlySet<string>): PlanResult['shopping'] {
  return catalog.ingredients
    .filter((i) => (l.get(i.id)?.packs ?? 0) > 0)
    .map((i) => ({ ingredientId: i.id, packs: l.get(i.id)!.packs, freeze: freeze.has(i.id) }));
}

/** Σ minutes of the batches cooked each day. */
export function cookMinutesByDay(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): number[] {
  const out = Array<number>(constraints.days).fill(0);
  for (const b of batches) {
    const r = catalog.recipeById.get(b.recipeId);
    if (r && b.day >= 0 && b.day < constraints.days) out[b.day] = (out[b.day] ?? 0) + r.minutes;
  }
  return out;
}

/**
 * Average g/day below target in the model's weekly form (constraint 7):
 * max(0, proteinPerDay − Σ servings·protein / D). Recipes without published protein count 0.
 */
export function proteinShortfall(batches: readonly Batch[], constraints: Constraints, catalog: Catalog): number {
  let total = 0;
  for (const b of batches) {
    const r = catalog.recipeById.get(b.recipeId);
    if (r) total += r.servings * (r.macrosPerServing.protein ?? 0);
  }
  const s = constraints.proteinPerDay - total / constraints.days;
  return s > 1e-6 ? s : 0;
}

/** §4 metrics plus cooking time. proteinByDay comes from the §5 schedule (portions eaten). */
export function metrics(batches: Batch[], constraints: Constraints, catalog: Catalog): Metrics {
  const l = ledger(batches, constraints, catalog);
  return {
    wastePacks: sumWaste(l, catalog),
    reuseRate: reuseRate(batches, constraints, catalog),
    proteinByDay: schedule(batches, constraints, catalog).proteinByDay,
    cookMinutesByDay: cookMinutesByDay(batches, constraints, catalog),
  };
}

export interface PlanExtras {
  status: PlanResult['status'];
  solveMs: number;
  infeasibleReason?: string;
  /** Precomputed schedule, to avoid doing it twice. */
  schedule?: Schedule;
}

/** A PlanResult for these batches: schedule (§5), shopping, metrics (§4) and the weekly shortfall. No reasons. */
export function planFromBatches(batches: Batch[], constraints: Constraints, catalog: Catalog, extras: PlanExtras): PlanResult {
  const sched = extras.schedule ?? schedule(batches, constraints, catalog);
  const l = ledger(batches, constraints, catalog);
  const plan: PlanResult = {
    batches,
    meals: sched.meals,
    shopping: shoppingFromLedger(l, catalog, sched.freezeOnShoppingDay),
    notes: sched.notes,
    wastePacks: sumWaste(l, catalog),
    reuseRate: reuseRate(batches, constraints, catalog),
    proteinByDay: sched.proteinByDay,
    proteinShortfall: proteinShortfall(batches, constraints, catalog),
    status: extras.status,
    solveMs: extras.solveMs,
  };
  if (extras.infeasibleReason !== undefined) plan.infeasibleReason = extras.infeasibleReason;
  return plan;
}

/** An empty plan for the infeasible state. */
export function emptyPlan(constraints: Constraints, reason: string, solveMs: number): PlanResult {
  return {
    batches: [],
    meals: [],
    shopping: [],
    notes: [],
    wastePacks: 0,
    reuseRate: 0,
    proteinByDay: Array<number>(constraints.days).fill(0),
    proteinShortfall: 0,
    status: 'infeasible',
    infeasibleReason: reason,
    solveMs,
  };
}
