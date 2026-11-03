import { beforeAll, describe, expect, it } from 'vitest';
import type { MealType, PlanResult } from '../types';
import { weeks, weekToConstraints } from './data';
import { constraints, realCatalog, START, withIngredient, withRecipe } from './fixtures';
import { greedyPlan } from './greedy';
import { checkPlan, MEAL_TYPES } from './model';
import { solve } from './solve';

const T = 30_000;
const week = (id: string) => weekToConstraints(weeks.find((w) => w.id === id)!, START);

let standard: PlanResult;
let warmMs: number;

beforeAll(async () => {
  await solve(week('standard'), realCatalog); // loads the wasm once
  const t = performance.now();
  standard = await solve(week('standard'), realCatalog);
  warmMs = performance.now() - t;
}, T);

/** Every slot filled exactly; fresh portions inside their life; frozen ones only where no fresh one was eaten. */
function expectSoundSchedule(plan: PlanResult, c = week('standard')) {
  for (let d = 0; d < c.days; d++) {
    for (const m of MEAL_TYPES) {
      const count = plan.meals.filter((x) => x.day === d && x.mealType === m).length;
      expect(count, `day ${d} ${m}`).toBe(c.mealsPerDay[m as MealType]);
    }
  }
  for (const meal of plan.meals) {
    const batch = plan.batches[meal.batchIndex]!;
    if (meal.frozen) expect(meal.day).toBeGreaterThan(batch.day);
    else {
      expect(meal.day).toBeGreaterThanOrEqual(batch.day);
      expect(meal.day).toBeLessThanOrEqual(batch.day + c.cookedFoodLifeDays - 1);
    }
  }
}

describe('default week (§9 regression, §13 standard)', () => {
  it('is feasible with 0 protein shortfall at 150 g/day', () => {
    expect(standard.status).toBe('optimal');
    expect(standard.proteinShortfall).toBe(0);
    expect(checkPlan(standard.batches, week('standard'), realCatalog)).toBeNull();
  });

  it('solves in under 2 s once the wasm is loaded (or returns timeout-best)', () => {
    if (standard.status !== 'timeout-best') expect(standard.solveMs).toBeLessThan(2000);
    expect(warmMs).toBeLessThan(2500);
    console.info(`standard week: ${standard.solveMs.toFixed(0)} ms in solve, ${warmMs.toFixed(0)} ms wall`);
  });

  it('covers every meal and eats no portion after its life', () => {
    expectSoundSchedule(standard);
  });

  it('keeps every recipe within the variety limit', () => {
    const counts = new Map<string, number>();
    for (const b of standard.batches) counts.set(b.recipeId, (counts.get(b.recipeId) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it('wastes no more than the greedy baseline', () => {
    const greedy = greedyPlan(week('standard'), realCatalog);
    expect(greedy.status).toBe('timeout-best');
    expect(standard.wastePacks).toBeLessThanOrEqual(greedy.wastePacks + 1e-9);
  });

  it('gives every batch a reason', () => {
    for (const b of standard.batches) {
      expect(b.reason!.length).toBeGreaterThan(0);
      expect(b.reason!.length).toBeLessThanOrEqual(3);
    }
  });

  it('flags chicken for the freezer when it is cooked after its shelf life', () => {
    const late = standard.batches.some((b) =>
      realCatalog.recipeById.get(b.recipeId)!.ingredients.some((ri) => ri.ingredientId === 'chicken-breast') && b.day > 2,
    );
    const entry = standard.shopping.find((s) => s.ingredientId === 'chicken-breast');
    if (entry) expect(entry.freeze).toBe(late);
  });
});

describe('pins', () => {
  it('always appear in the result, marked pinned', async () => {
    const c = week('favourites');
    const plan = await solve(c, realCatalog);
    expect(plan.status).not.toBe('infeasible');
    for (const pin of c.pins) {
      expect(plan.batches.some((b) => b.recipeId === pin.recipeId && b.day === pin.day && b.pinned)).toBe(true);
    }
    expectSoundSchedule(plan, c);
  }, T);

  it('pin-conflict returns infeasible with the time reason (§13)', async () => {
    const plan = await solve(week('pin-conflict'), realCatalog);
    expect(plan.status).toBe('infeasible');
    expect(plan.infeasibleReason).toBe('Tue: pinned meals need 45 min, limit is 20');
    expect(plan.batches).toEqual([]);
  }, T);

  it('reports pins that pass alone but not together', async () => {
    // Two 4-portion mains on Mon fit the 60 min, but 8 portions can't be eaten fresh by Wed.
    const c = constraints({
      pins: [
        { recipeId: 'a05-chicken-zucchini-skillet', day: 0 },
        { recipeId: 'a10-pork-medallions-mushroom-sauce', day: 0 },
      ],
    });
    const plan = await solve(c, realCatalog);
    expect(plan.status).toBe('infeasible');
    expect(plan.infeasibleReason).toBe('These pins leave no way to cover every meal.');
  }, T);
});

describe('mask and freezing through the solver', () => {
  it('never places a recipe whose core meat lasts 2 days after day 2 when it can’t be frozen', async () => {
    const cat = withIngredient(realCatalog, 'chicken-breast', { freezable: false });
    const c = constraints({ pins: [{ recipeId: 'a03-sheet-pan-chicken-broccoli-sweet-potato', day: 2 }] });
    const plan = await solve(c, cat);
    expect(plan.batches.some((b) => b.recipeId === 'a03-sheet-pan-chicken-broccoli-sweet-potato' && b.day === 2)).toBe(true);
    for (const b of plan.batches) {
      const usesChicken = cat.recipeById.get(b.recipeId)!.ingredients.some((ri) => ri.ingredientId === 'chicken-breast' && ri.role === 'core');
      if (usesChicken) expect(b.day).toBeLessThanOrEqual(2);
    }
  }, T);
});

describe('frozen cooked portions (§3 constraint 4)', () => {
  const pin = { recipeId: 'b04-cottage-cheese-frittata', day: 0 };

  it('plans a 6-portion breakfast that freezes well at 1 breakfast a day, frozen portions after fresh', async () => {
    // Fixture only: the real frittata has no freezesWell (its source gives no freezing guidance).
    const cat = withRecipe(realCatalog, 'b04-cottage-cheese-frittata', { freezesWell: true });
    const c = constraints({ pins: [pin] });
    const plan = await solve(c, cat);
    expect(plan.status).not.toBe('infeasible');
    const k = plan.batches.findIndex((b) => b.recipeId === pin.recipeId && b.day === 0);
    expect(plan.batches[k]!.frozenPortions).toBeGreaterThanOrEqual(3);
    const fresh = plan.meals.filter((m) => m.batchIndex === k && !m.frozen).map((m) => m.day);
    const frozen = plan.meals.filter((m) => m.batchIndex === k && m.frozen).map((m) => m.day);
    for (const d of frozen) expect(d).toBeGreaterThan(Math.max(...fresh));
    expect(plan.notes.some((n) => n.day === 0 && /^Freeze \d portions of ham & cottage cheese frittata$/.test(n.text))).toBe(true);
    expectSoundSchedule(plan, c);
  }, T);

  it("returns infeasible with the constraint-4 reason for the real frittata, which doesn't freeze well", async () => {
    const plan = await solve(constraints({ pins: [pin] }), realCatalog);
    expect(plan.status).toBe('infeasible');
    expect(plan.infeasibleReason).toBe("Ham & cottage cheese frittata makes 6 portions; 3 can be eaten fresh and it doesn't freeze well");
  }, T);
});

describe('protein', () => {
  it('warns with proteinShortfall > 0 instead of going infeasible when the target is out of reach', async () => {
    const plan = await solve(constraints({ proteinPerDay: 400 }), realCatalog);
    expect(plan.status).not.toBe('infeasible');
    expect(plan.proteinShortfall).toBeGreaterThan(0);
    expect(plan.batches.length).toBeGreaterThan(0);
  }, T);
});

describe('fallback', () => {
  it('uses the greedy plan when HiGHS finds nothing in time', async () => {
    const plan = await solve(week('standard'), realCatalog, { timeLimitSec: 1e-6 });
    expect(plan.status).toBe('timeout-best');
    expect(checkPlan(plan.batches, week('standard'), realCatalog)).toBeNull();
  }, T);
});
