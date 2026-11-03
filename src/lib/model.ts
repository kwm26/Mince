// The optimization model (data-model §3): the feasibility mask, the optional-ingredient
// drop, pin checks, plan checks (constraints 2–6) and the MILP in CPLEX LP format for
// HiGHS. Pure: no React, no storage, no solver.

import type { Batch, Catalog, Constraints, Ingredient, MealType, Recipe, RecipeIngredient } from '../types';
import { daysLeft, isPerishable } from './kitchen';
import { ingredientLabel, plural, recipeLabel, weekday } from './labels';

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'main'];

/** Life used by the mask: `frozenLifeDays` for freezable items, else `shelfLifeDays` (good through). */
export function effectiveLife(ingredient: Ingredient, constraints: Constraints): number {
  return ingredient.freezable ? constraints.frozenLifeDays : ingredient.shelfLifeDays;
}

/**
 * qty_{r,i,d}: what one batch cooked on `day` needs of this ingredient. Garnish and staples
 * never count; an optional ingredient past its effective life is dropped (0).
 */
export function usedQty(ri: RecipeIngredient, ingredient: Ingredient, day: number, constraints: Constraints): number {
  if (ingredient.staple || ri.role === 'garnish') return 0;
  if (ri.role === 'optional' && effectiveLife(ingredient, constraints) < day) return 0;
  return ri.qty;
}

export interface Use { ingredient: Ingredient; qty: number; role: 'core' | 'optional'; }

/** Non-staple core and unexpired optional uses of a batch cooked on `day`, with qty > 0. */
export function recipeUses(recipe: Recipe, day: number, constraints: Constraints, catalog: Catalog): Use[] {
  const uses: Use[] = [];
  for (const ri of recipe.ingredients) {
    const ingredient = catalog.ingredientById.get(ri.ingredientId);
    if (!ingredient || ri.role === 'garnish') continue;
    const qty = usedQty(ri, ingredient, day, constraints);
    if (qty > 0) uses.push({ ingredient, qty, role: ri.role });
  }
  return uses;
}

/** Optional ingredients left out of a batch on `day` because they expire first. */
export function droppedOptionals(recipe: Recipe, day: number, constraints: Constraints, catalog: Catalog): Ingredient[] {
  const out: Ingredient[] = [];
  for (const ri of recipe.ingredients) {
    const ingredient = catalog.ingredientById.get(ri.ingredientId);
    if (!ingredient || ingredient.staple || ri.role !== 'optional' || ri.qty <= 0) continue;
    if (effectiveLife(ingredient, constraints) < day) out.push(ingredient);
  }
  return out;
}

/** The first core, non-staple ingredient that is no longer good on `day`, if any. */
function expiredCore(recipe: Recipe, day: number, constraints: Constraints, catalog: Catalog): Ingredient | undefined {
  for (const ri of recipe.ingredients) {
    const ingredient = catalog.ingredientById.get(ri.ingredientId);
    if (!ingredient || ingredient.staple || ri.role !== 'core') continue;
    if (effectiveLife(ingredient, constraints) < day) return ingredient;
  }
  return undefined;
}

function isExcludedSlot(recipeId: string, day: number, constraints: Constraints): boolean {
  return constraints.excludedSlots.some((s) => s.recipeId === recipeId && s.day === day);
}

/**
 * The §3 mask: `recipe` may be cooked on `day` only if every core, non-staple ingredient
 * is still good on that day (effective life ≥ day) and (recipe, day) isn't an excluded slot.
 */
export function isFeasibleSlot(recipe: Recipe, day: number, constraints: Constraints, catalog: Catalog): boolean {
  return maskReason(recipe, day, constraints, catalog) === null;
}

/** Why the mask rejects (recipe, day), in the infeasible-reason style; null when it passes. */
export function maskReason(recipe: Recipe, day: number, constraints: Constraints, catalog: Catalog): string | null {
  const name = recipeLabel(recipe);
  if (!Number.isInteger(day) || day < 0 || day >= constraints.days) return `${name}: day ${day} is outside the plan`;
  const expired = expiredCore(recipe, day, constraints, catalog);
  if (expired) {
    const life = effectiveLife(expired, constraints);
    return `${name} on ${weekday(constraints.startDate, day)}: ${ingredientLabel(expired)} is only good through ${weekday(constraints.startDate, life)}`;
  }
  if (isExcludedSlot(recipe.id, day, constraints)) return `${name} on ${weekday(constraints.startDate, day)}: you removed it from this day`;
  return null;
}

function timeReason(day: number, need: number, constraints: Constraints, pinned: boolean): string {
  const limit = constraints.maxCookMinutes[day] ?? 0;
  const what = pinned ? 'pinned meals need' : 'meals need';
  const tail = limit === 0 ? 'no cooking that day' : `limit is ${limit}`;
  return `${weekday(constraints.startDate, day)}: ${what} ${need} min, ${tail}`;
}

function portionsReason(recipe: Recipe, constraints: Constraints): string | null {
  const n = constraints.mealsPerDay[recipe.mealType];
  if (n <= 0) return `${recipeLabel(recipe)}: the plan has no ${recipe.mealType} slots`;
  const fresh = n * constraints.cookedFoodLifeDays;
  if (!recipe.freezesWell && recipe.servings > fresh) {
    return `${recipeLabel(recipe)} makes ${recipe.servings} portions; ${fresh} can be eaten fresh and it doesn't freeze well`;
  }
  const maxTotal = n * (constraints.days - 1 + constraints.cookedFoodLifeDays);
  if (recipe.servings > maxTotal) return `${recipeLabel(recipe)} makes ${recipe.servings} portions; the plan has room for ${maxTotal}`;
  return null;
}

/**
 * Checks each pin on its own (§3 "Infeasible reasons") and returns the first failure:
 * mask, cooking time, fresh portions (constraint 4), variety. Null when every pin passes.
 */
export function checkPins(constraints: Constraints, catalog: Catalog): string | null {
  const seen = new Set<string>();
  for (const pin of constraints.pins) {
    const recipe = catalog.recipeById.get(pin.recipeId);
    if (!recipe) return `Pinned recipe "${pin.recipeId}" isn't in the recipe list`;
    if (constraints.excluded.includes(recipe.id)) return `${recipeLabel(recipe)} is pinned but excluded`;
    const mask = maskReason(recipe, pin.day, constraints, catalog);
    if (mask) return mask;
    const key = `${pin.recipeId}@${pin.day}`;
    if (seen.has(key)) return `${recipeLabel(recipe)} is pinned twice on ${weekday(constraints.startDate, pin.day)}`;
    seen.add(key);
    const minutes = constraints.pins
      .filter((p) => p.day === pin.day)
      .reduce((sum, p) => sum + (catalog.recipeById.get(p.recipeId)?.minutes ?? 0), 0);
    if (minutes > (constraints.maxCookMinutes[pin.day] ?? 0)) return timeReason(pin.day, minutes, constraints, true);
    const portions = portionsReason(recipe, constraints);
    if (portions) return portions;
    const times = constraints.pins.filter((p) => p.recipeId === pin.recipeId).length;
    if (times > constraints.maxRepeatsPerRecipe) {
      return `${recipeLabel(recipe)}: pinned ${times} times; the limit is ${constraints.maxRepeatsPerRecipe}`;
    }
  }
  return null;
}

/**
 * Checks a set of batches against the mask and constraints 2–6 (5 always holds: anything
 * can be bought). Returns the first problem as a short sentence, or null.
 * `skipCover` leaves out constraint 3 (used for partial plans and "remove" previews).
 */
export function checkPlan(
  batches: readonly Batch[],
  constraints: Constraints,
  catalog: Catalog,
  opts: { skipCover?: boolean } = {},
): string | null {
  const D = constraints.days;
  const L = constraints.cookedFoodLifeDays;
  const minutes = Array<number>(D).fill(0);
  const counts = new Map<string, number>();
  const slots = new Set<string>();
  for (const b of batches) {
    const recipe = catalog.recipeById.get(b.recipeId);
    if (!recipe) return `Recipe "${b.recipeId}" isn't in the recipe list`;
    if (!b.pinned && constraints.excluded.includes(recipe.id)) return `${recipeLabel(recipe)} is excluded`;
    const mask = maskReason(recipe, b.day, constraints, catalog);
    if (mask) return mask;
    const key = `${b.recipeId}@${b.day}`;
    if (slots.has(key)) return `${recipeLabel(recipe)} is already cooked on ${weekday(constraints.startDate, b.day)}`;
    slots.add(key);
    if (b.frozenPortions < 0 || b.frozenPortions > recipe.servings) return `${recipeLabel(recipe)}: can't freeze ${b.frozenPortions} portions`;
    if (b.frozenPortions > 0 && !recipe.freezesWell) return `${recipeLabel(recipe)} doesn't freeze well`;
    minutes[b.day] = (minutes[b.day] ?? 0) + recipe.minutes;
    counts.set(recipe.id, (counts.get(recipe.id) ?? 0) + 1);
  }
  // 2. Cooking time
  for (let d = 0; d < D; d++) {
    if ((minutes[d] ?? 0) > (constraints.maxCookMinutes[d] ?? 0)) return timeReason(d, minutes[d] ?? 0, constraints, false);
  }
  // 3, 4, 4b per meal type
  for (const m of MEAL_TYPES) {
    const n = constraints.mealsPerDay[m];
    const cooked = Array<number>(D).fill(0);
    const fresh = Array<number>(D).fill(0);
    for (const b of batches) {
      const recipe = catalog.recipeById.get(b.recipeId)!;
      if (recipe.mealType !== m) continue;
      cooked[b.day] = (cooked[b.day] ?? 0) + recipe.servings;
      fresh[b.day] = (fresh[b.day] ?? 0) + recipe.servings - b.frozenPortions;
    }
    let cumCooked = 0;
    let cumFresh = 0;
    for (let t = 0; t < D; t++) {
      cumCooked += cooked[t] ?? 0;
      cumFresh += fresh[t] ?? 0;
      if (!opts.skipCover && cumCooked < n * (t + 1)) {
        return `${weekday(constraints.startDate, t)}: ${plural(n * (t + 1) - cumCooked, m)} short`;
      }
      if (cumFresh > n * (t + L)) {
        return `${weekday(constraints.startDate, t)}: ${plural(cumFresh - n * (t + L), `${m} portion`)} would spoil before they're eaten`;
      }
    }
    const room = n * (D - 1 + L);
    if (cumCooked > room) return `Too much cooked for ${m}: ${cumCooked} portions for ${room} meals`;
  }
  // 6. Variety
  for (const [id, times] of counts) {
    if (times > constraints.maxRepeatsPerRecipe) {
      return `${recipeLabel(catalog.recipeById.get(id)!)}: ${times} batches; the limit is ${constraints.maxRepeatsPerRecipe}`;
    }
  }
  return null;
}

// ── MILP ──────────────────────────────────────────────────────────────────

export type ModelVar =
  | { kind: 'y'; recipeId: string; day: number }
  | { kind: 'f'; recipeId: string; day: number }
  | { kind: 'x'; recipeId: string; day: number; eatDay: number; frozen: boolean }
  | { kind: 'b'; ingredientId: string }
  | { kind: 'u'; ingredientId: string; pantryIndex: number }
  | { kind: 's' };

export interface BuiltModel {
  /** CPLEX LP text for HiGHS. */
  lp: string;
  /** Column name → what it means, to decode the solution. */
  vars: Record<string, ModelVar>;
  /** A row with no variables is violated (e.g. no recipe can be cooked by day 0): infeasible without solving. */
  trivialInfeasible: boolean;
}

type Terms = Map<string, number>;
interface Row { name: string; terms: Terms; sense: '>=' | '<=' | '='; rhs: number; }

function add(terms: Terms, name: string, coef: number): void {
  if (coef === 0) return;
  terms.set(name, (terms.get(name) ?? 0) + coef);
}

function num(x: number): string {
  const r = Number(x.toPrecision(12));
  return Object.is(r, -0) ? '0' : String(r);
}

function writeTerms(terms: Terms): string {
  const parts: string[] = [];
  let k = 0;
  for (const [name, coef] of terms) {
    if (coef === 0) continue;
    const sign = coef < 0 ? '-' : '+';
    const abs = Math.abs(coef);
    const term = abs === 1 ? name : `${num(abs)} ${name}`;
    parts.push(k === 0 ? (coef < 0 ? `- ${term}` : term) : `${sign} ${term}`);
    k++;
    if (k % 8 === 0) parts.push('\n   ');
  }
  return parts.join(' ');
}

/** Pantry items per ingredient with their days left on day 0 (staples ignored). */
export function pantryItems(constraints: Constraints, catalog: Catalog): Map<string, { amount: number; daysLeft: number }[]> {
  const out = new Map<string, { amount: number; daysLeft: number }[]>();
  for (const item of constraints.pantry) {
    const ingredient = catalog.ingredientById.get(item.ingredientId);
    if (!ingredient || ingredient.staple || item.amount <= 0) continue;
    const list = out.get(item.ingredientId) ?? [];
    list.push({ amount: item.amount, daysLeft: daysLeft(item, constraints.startDate) });
    out.set(item.ingredientId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.daysLeft - b.daysLeft);
  return out;
}

/** Builds the §3 MILP. Run `checkPins` first: a pin outside the mask makes it trivially infeasible. */
export function buildModel(constraints: Constraints, catalog: Catalog): BuiltModel {
  const D = constraints.days;
  const L = constraints.cookedFoodLifeDays;
  const w = constraints.weights;
  const vars: Record<string, ModelVar> = {};
  const rows: Row[] = [];
  const objective: Terms = new Map();
  const binaries: string[] = [];
  const generals: string[] = [];
  const bounds: string[] = [];
  let trivialInfeasible = false;

  const pinned = new Set(constraints.pins.map((p) => `${p.recipeId}@${p.day}`));
  const excluded = new Set(constraints.excluded);

  // y[r,d] and f[r,d]
  interface Slot { name: string; recipe: Recipe; day: number; f?: string; uses: Use[] }
  const slots: Slot[] = [];
  catalog.recipes.forEach((recipe, ri) => {
    if (excluded.has(recipe.id)) return;
    if (constraints.mealsPerDay[recipe.mealType] <= 0) return;
    for (let d = 0; d < D; d++) {
      const isPin = pinned.has(`${recipe.id}@${d}`);
      if (recipe.macrosPerServing.protein === null && !isPin) continue;
      if (!isPin && recipe.minutes > (constraints.maxCookMinutes[d] ?? 0)) continue;
      if (!isFeasibleSlot(recipe, d, constraints, catalog)) continue;
      const name = `y_${ri}_${d}`;
      vars[name] = { kind: 'y', recipeId: recipe.id, day: d };
      binaries.push(name);
      if (isPin) bounds.push(` ${name} = 1`);
      const slot: Slot = { name, recipe, day: d, uses: recipeUses(recipe, d, constraints, catalog) };
      if (recipe.freezesWell) {
        slot.f = `f_${ri}_${d}`;
        vars[slot.f] = { kind: 'f', recipeId: recipe.id, day: d };
        generals.push(slot.f);
        bounds.push(` 0 <= ${slot.f} <= ${recipe.servings}`);
      }
      slots.push(slot);
    }
  });
  for (const pin of constraints.pins) {
    const ri = catalog.recipes.findIndex((r) => r.id === pin.recipeId);
    if (!vars[`y_${ri}_${pin.day}`]) trivialInfeasible = true;
  }

  // Objective: cooking time and the leftover part of waste on y.
  for (const slot of slots) {
    add(objective, slot.name, (w.cookTime * slot.recipe.minutes) / 60);
    for (const use of slot.uses) {
      if (isPerishable(use.ingredient)) add(objective, slot.name, (-w.waste * use.qty) / use.ingredient.packSize);
    }
  }

  // 2. Cooking time
  for (let d = 0; d < D; d++) {
    const terms: Terms = new Map();
    for (const s of slots) if (s.day === d) add(terms, s.name, s.recipe.minutes);
    if (terms.size > 0) rows.push({ name: `time_${d}`, terms, sense: '<=', rhs: constraints.maxCookMinutes[d] ?? 0 });
  }

  // 3, 4, 4a, 4b per meal type, with eaten portions x[r,d,t] (continuous ≥ 0):
  //   xf: fresh portions of batch (r,d) eaten on t ∈ [d, min(d+L−1, D−1)]
  //   xz: frozen portions eaten on t ∈ [d+1, D−1] (freezesWell only)
  // 3.  Σ x over each (meal type, day) = n_m: every slot eaten exactly once.
  // 4.  Σ_t xf ≤ servings·y − f, with equality when d+L−1 ≤ D−1 (no fresh portion spoils;
  //     the rest may carry over past the last day); Σ_t xz ≤ f. The cumulative bound
  //     Σ_{d≤t}(servings·y − f) ≤ n_m(t+L) stays, so carried-over portions also keep.
  // 7.  uses Σ protein·x (portions eaten in the plan), below.
  const proteinTerms: Terms = new Map();
  for (const m of MEAL_TYPES) {
    const n = constraints.mealsPerDay[m];
    if (n <= 0) continue;
    const ofType = slots.filter((s) => s.recipe.mealType === m);
    const coverRows: Terms[] = Array.from({ length: D }, () => new Map());
    for (const s of ofType) {
      const protein = s.recipe.macrosPerServing.protein ?? 0;
      const fresh: Terms = new Map();
      const lastFresh = s.day + L - 1;
      for (let t = s.day; t <= Math.min(lastFresh, D - 1); t++) {
        const x = `xf_${s.name.slice(2)}_${t}`;
        vars[x] = { kind: 'x', recipeId: s.recipe.id, day: s.day, eatDay: t, frozen: false };
        add(fresh, x, 1);
        add(coverRows[t]!, x, 1);
        add(proteinTerms, x, protein / D);
      }
      add(fresh, s.name, -s.recipe.servings);
      if (s.f) add(fresh, s.f, 1);
      rows.push({ name: `eat_${s.name}`, terms: fresh, sense: lastFresh <= D - 1 ? '=' : '<=', rhs: 0 });
      if (s.f) {
        const frozen: Terms = new Map();
        for (let t = s.day + 1; t < D; t++) {
          const x = `xz_${s.name.slice(2)}_${t}`;
          vars[x] = { kind: 'x', recipeId: s.recipe.id, day: s.day, eatDay: t, frozen: true };
          add(frozen, x, 1);
          add(coverRows[t]!, x, 1);
          add(proteinTerms, x, protein / D);
        }
        add(frozen, s.f, -1);
        rows.push({ name: `thaw_${s.name}`, terms: frozen, sense: '<=', rhs: 0 });
      }
    }
    for (let t = 0; t < D; t++) {
      if (coverRows[t]!.size === 0) trivialInfeasible = true;
      else rows.push({ name: `cover_${m}_${t}`, terms: coverRows[t]!, sense: '=', rhs: n });
      const fresh: Terms = new Map();
      for (const s of ofType) {
        if (s.day > t) continue;
        add(fresh, s.name, s.recipe.servings);
        if (s.f) add(fresh, s.f, -1);
      }
      if (fresh.size > 0) rows.push({ name: `fresh_${m}_${t}`, terms: fresh, sense: '<=', rhs: n * (t + L) });
    }
    for (const s of ofType) {
      if (!s.f) continue;
      const terms: Terms = new Map();
      add(terms, s.f, 1);
      add(terms, s.name, -s.recipe.servings);
      rows.push({ name: `freeze_${s.f}`, terms, sense: '<=', rhs: 0 });
    }
    const total: Terms = new Map();
    for (const s of ofType) add(total, s.name, s.recipe.servings);
    if (total.size > 0) rows.push({ name: `room_${m}`, terms: total, sense: '<=', rhs: n * (D - 1 + L) });
  }

  // 5. Ingredients: packSize·b + Σu ≥ need; pantry only feeds batches cooked before it expires.
  const pantry = pantryItems(constraints, catalog);
  const usedBy = new Map<string, { ingredient: Ingredient; terms: { slot: Slot; qty: number }[] }>();
  for (const s of slots) {
    for (const use of s.uses) {
      const entry = usedBy.get(use.ingredient.id) ?? { ingredient: use.ingredient, terms: [] };
      entry.terms.push({ slot: s, qty: use.qty });
      usedBy.set(use.ingredient.id, entry);
    }
  }
  const ingIndex = new Map(catalog.ingredients.map((i, k) => [i.id, k]));
  for (const [id, { ingredient, terms: uses }] of usedBy) {
    const k = ingIndex.get(id)!;
    const b = `b_${k}`;
    vars[b] = { kind: 'b', ingredientId: id };
    generals.push(b);
    if (isPerishable(ingredient)) add(objective, b, w.waste);
    const row: Terms = new Map();
    add(row, b, ingredient.packSize);
    for (const { slot, qty } of uses) add(row, slot.name, -qty);
    const items = pantry.get(id) ?? [];
    const uNames = items.map((item, p) => {
      const u = `u_${k}_${p}`;
      vars[u] = { kind: 'u', ingredientId: id, pantryIndex: p };
      bounds.push(` 0 <= ${u} <= ${num(item.amount)}`);
      add(row, u, 1);
      return u;
    });
    rows.push({ name: `ing_${k}`, terms: row, sense: '>=', rhs: 0 });
    // Items are sorted by days left, so the prefix sums are Hall's condition for nested windows.
    const thresholds = [...new Set(items.map((x) => x.daysLeft))];
    for (const t of thresholds) {
      const terms: Terms = new Map();
      items.forEach((x, p) => { if (x.daysLeft <= t) add(terms, uNames[p]!, 1); });
      for (const { slot, qty } of uses) if (slot.day <= t) add(terms, slot.name, -qty);
      rows.push({ name: `pantry_${k}_${t}`, terms, sense: '<=', rhs: 0 });
    }
  }

  // 6. Variety
  catalog.recipes.forEach((recipe, ri) => {
    const terms: Terms = new Map();
    for (const s of slots) if (s.recipe.id === recipe.id) add(terms, s.name, 1);
    if (terms.size > constraints.maxRepeatsPerRecipe) rows.push({ name: `variety_${ri}`, terms, sense: '<=', rhs: constraints.maxRepeatsPerRecipe });
  });

  // 7. Protein (soft, weekly average of portions eaten in the plan)
  vars.s = { kind: 's' };
  add(proteinTerms, 's', 1);
  rows.push({ name: 'protein', terms: proteinTerms, sense: '>=', rhs: constraints.proteinPerDay });
  objective.set('s', (objective.get('s') ?? 0) + w.protein / 10);

  const objText = writeTerms(objective) || '0 s';
  const lines = ['Minimize', ` obj: ${objText}`, 'Subject To'];
  for (const r of rows) lines.push(` ${r.name}: ${writeTerms(r.terms)} ${r.sense} ${num(r.rhs)}`);
  lines.push('Bounds', ...bounds);
  if (generals.length) lines.push('General', ` ${generals.join(' ')}`);
  if (binaries.length) lines.push('Binary', ` ${binaries.join(' ')}`);
  lines.push('End');
  return { lp: lines.join('\n'), vars, trivialInfeasible };
}

/** Reads batches from HiGHS columns (integer primals rounded), sorted by day, breakfast first. */
export function decodeSolution(
  model: BuiltModel,
  columns: Record<string, { Primal?: number }>,
  constraints: Constraints,
  catalog: Catalog,
): Batch[] {
  const frozen = new Map<string, number>();
  for (const [name, v] of Object.entries(model.vars)) {
    if (v.kind === 'f') frozen.set(`${v.recipeId}@${v.day}`, Math.round(columns[name]?.Primal ?? 0));
  }
  const pinned = new Set(constraints.pins.map((p) => `${p.recipeId}@${p.day}`));
  const batches: Batch[] = [];
  for (const [name, v] of Object.entries(model.vars)) {
    if (v.kind !== 'y' || Math.round(columns[name]?.Primal ?? 0) !== 1) continue;
    const key = `${v.recipeId}@${v.day}`;
    batches.push({ recipeId: v.recipeId, day: v.day, pinned: pinned.has(key), frozenPortions: frozen.get(key) ?? 0 });
  }
  return fewestFrozen(sortBatches(batches, catalog), constraints, catalog);
}

/**
 * f has no cost in the objective, so the solver may freeze more than it must (even portions
 * needed fresh on the cook day). Keep the fewest frozen portions constraint 4 needs, latest
 * batch first (each covers the overflow from its day on); this never breaks constraints 3–6
 * because frozen portions only appear in constraint 4.
 */
export function fewestFrozen(batches: Batch[], constraints: Constraints, catalog: Catalog): Batch[] {
  const out = batches.map((b) => ({ ...b, frozenPortions: 0 }));
  const order = out.map((_, k) => k).sort((a, b) => out[b]!.day - out[a]!.day);
  for (const k of order) {
    if (batches[k]!.frozenPortions === 0) continue;
    out[k]!.frozenPortions = minFrozenPortions(out[k]!, out.filter((_, j) => j !== k), constraints, catalog);
  }
  return out;
}

/** Stable batch order: day, then breakfast before main, then recipe order in the catalog. */
export function sortBatches(batches: Batch[], catalog: Catalog): Batch[] {
  const order = new Map(catalog.recipes.map((r, k) => [r.id, k]));
  const typeRank = (b: Batch) => (catalog.recipeById.get(b.recipeId)?.mealType === 'breakfast' ? 0 : 1);
  return [...batches].sort((a, b) => a.day - b.day || typeRank(a) - typeRank(b) || (order.get(a.recipeId) ?? 0) - (order.get(b.recipeId) ?? 0));
}

/** Frozen cooked portions a batch needs to respect constraint 4, given the other batches (0 unless freezesWell). */
export function minFrozenPortions(batch: Batch, others: readonly Batch[], constraints: Constraints, catalog: Catalog): number {
  const recipe = catalog.recipeById.get(batch.recipeId);
  if (!recipe?.freezesWell) return 0;
  const n = constraints.mealsPerDay[recipe.mealType];
  const fresh = Array<number>(constraints.days).fill(0);
  for (const b of others) {
    const r = catalog.recipeById.get(b.recipeId);
    if (r?.mealType === recipe.mealType) fresh[b.day] = (fresh[b.day] ?? 0) + r.servings - b.frozenPortions;
  }
  fresh[batch.day] = (fresh[batch.day] ?? 0) + recipe.servings;
  let cum = 0;
  let excess = 0;
  for (let t = 0; t < constraints.days; t++) {
    cum += fresh[t] ?? 0;
    if (t >= batch.day) excess = Math.max(excess, cum - n * (t + constraints.cookedFoodLifeDays));
  }
  return Math.min(recipe.servings, Math.max(0, excess));
}
