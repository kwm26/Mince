import { describe, expect, it } from 'vitest';
import { weeks, weekToConstraints } from './data';
import { constraints, ing, makeCatalog, mini, realCatalog, rec, START, withIngredient } from './fixtures';
import { buildModel, checkPins, checkPlan, effectiveLife, isFeasibleSlot, maskReason, recipeUses, usedQty } from './model';

const recipe = (id: string, cat = realCatalog) => {
  const r = cat.recipeById.get(id);
  if (!r) throw new Error(id);
  return r;
};

describe('mask (§3)', () => {
  it('never places a recipe whose core perishable lasts 2 days on day ≥ 3, but allows day 2 (good through)', () => {
    const cat = makeCatalog([rec('fish', 'main', 4, 40, 20, [['fresh-fish', 1]])], [ing('fresh-fish', 2, 1)]);
    const c = constraints();
    expect(isFeasibleSlot(recipe('fish', cat), 2, c, cat)).toBe(true);
    for (let d = 3; d < 7; d++) expect(isFeasibleSlot(recipe('fish', cat), d, c, cat)).toBe(false);
  });

  it('lets a chicken recipe go on day 5 only when chicken is freezable', () => {
    const c = constraints();
    const a03 = recipe('a03-sheet-pan-chicken-broccoli-sweet-potato');
    expect(realCatalog.ingredientById.get('chicken-breast')!.freezable).toBe(true);
    expect(isFeasibleSlot(a03, 5, c, realCatalog)).toBe(true);
    const fresh = withIngredient(realCatalog, 'chicken-breast', { freezable: false });
    expect(isFeasibleSlot(a03, 5, c, fresh)).toBe(false);
    expect(isFeasibleSlot(a03, 2, c, fresh)).toBe(true);
    expect(maskReason(a03, 5, c, fresh)).toBe('One-pan roasted chicken on Sat: chicken breast is only good through Wed');
  });

  it('explains the fajita bowls mask in plain words (guacamole lasts 3 days)', () => {
    const c = constraints();
    const a12 = recipe('a12-steak-fajita-bowls');
    expect(isFeasibleSlot(a12, 3, c, realCatalog)).toBe(true);
    expect(maskReason(a12, 5, c, realCatalog)).toBe('Steak fajita bowls on Sat: guacamole is only good through Thu');
  });

  it('ignores optional, garnish and staple ingredients', () => {
    const c = constraints();
    // delta: optional avocado (4 d) and garnish basil (5 d) never block the slot.
    expect(isFeasibleSlot(recipe('delta', mini), 5, c, mini)).toBe(true);
    // a04's optional spinach (5 d) doesn't block day 6 — but its core mushrooms do.
    expect(maskReason(recipe('a04-italian-skillet-chicken-tomato-mushroom'), 6, c, realCatalog)).toMatch(/mushrooms is only good through Sat/);
  });

  it('rejects excluded slots', () => {
    const c = constraints({ excludedSlots: [{ recipeId: 'beta', day: 2 }] });
    expect(isFeasibleSlot(recipe('beta', mini), 2, c, mini)).toBe(false);
    expect(isFeasibleSlot(recipe('beta', mini), 3, c, mini)).toBe(true);
  });

  it('uses frozenLifeDays as the effective life of freezable items', () => {
    const c = constraints();
    expect(effectiveLife(realCatalog.ingredientById.get('salmon')!, c)).toBe(30);
    expect(effectiveLife(realCatalog.ingredientById.get('spinach')!, c)).toBe(5);
  });
});

describe('qty_{r,i,d} (§3)', () => {
  it('drops an optional ingredient once it has expired, and never counts garnish or staples', () => {
    const c = constraints();
    const delta = recipe('delta', mini);
    const [tomato, avocado, basil] = delta.ingredients;
    expect(usedQty(avocado!, mini.ingredientById.get('avocado')!, 4, c)).toBe(1);
    expect(usedQty(avocado!, mini.ingredientById.get('avocado')!, 5, c)).toBe(0);
    expect(usedQty(basil!, mini.ingredientById.get('basil')!, 0, c)).toBe(0);
    expect(usedQty(tomato!, mini.ingredientById.get('tomato')!, 5, c)).toBe(1);
    expect(recipeUses(recipe('alpha', mini), 0, c, mini).map((u) => u.ingredient.id)).toEqual(['spinach', 'tomato', 'lemon', 'rice']);
  });
});

describe('checkPins (§3 infeasible reasons)', () => {
  it('passes every seed week but pin-conflict, which fails on time with weekday names', () => {
    for (const w of weeks) {
      const reason = checkPins(weekToConstraints(w, START), realCatalog);
      if (w.id === 'pin-conflict') expect(reason).toBe('Tue: pinned meals need 45 min, limit is 20');
      else expect(reason, w.id).toBeNull();
    }
  });

  it('adds up pinned minutes per day', () => {
    const c = constraints({
      pins: [
        { recipeId: 'a01-greek-chicken-protein-bowl', day: 0 },
        { recipeId: 'a03-sheet-pan-chicken-broccoli-sweet-potato', day: 0 },
      ],
    });
    expect(checkPins(c, realCatalog)).toBe('Mon: pinned meals need 75 min, limit is 60');
  });

  it('reports the mask', () => {
    const c = constraints({ pins: [{ recipeId: 'a12-steak-fajita-bowls', day: 5 }] });
    expect(checkPins(c, realCatalog)).toBe('Steak fajita bowls on Sat: guacamole is only good through Thu');
  });

  it("rejects the frittata at 1 breakfast a day: it doesn't freeze well (constraint 4)", () => {
    const c = constraints({ pins: [{ recipeId: 'b04-cottage-cheese-frittata', day: 0 }] });
    expect(checkPins(c, realCatalog)).toBe("Ham & cottage cheese frittata makes 6 portions; 3 can be eaten fresh and it doesn't freeze well");
  });

  it('reports the variety rule', () => {
    const id = 'b02-protein-pancakes-yogurt-berries';
    const c = constraints({ pins: [0, 2, 4].map((day) => ({ recipeId: id, day })) });
    expect(checkPins(c, realCatalog)).toBe('Protein pancakes: pinned 3 times; the limit is 2');
  });
});

describe('checkPlan (constraints 2–6)', () => {
  const c = constraints({ mealsPerDay: { breakfast: 0, main: 2 }, maxCookMinutes: [60, 60, 60, 60, 60, 60, 60] });

  it('accepts a plan that covers every main and spoils nothing', () => {
    const plan: [string, number][] = [['alpha', 0], ['beta', 2], ['gamma', 4], ['delta', 5]];
    const batches = plan.map(([recipeId, day]) => ({ recipeId, day, pinned: false, frozenPortions: 0 }));
    expect(checkPlan(batches, c, mini)).toBeNull();
  });

  it('names the first short day and the first spoiling day', () => {
    expect(checkPlan([{ recipeId: 'alpha', day: 0, pinned: false, frozenPortions: 0 }], c, mini)).toBe('Wed: 2 mains short');
    const twoOnMonday = ['alpha', 'beta'].map((recipeId) => ({ recipeId, day: 0, pinned: false, frozenPortions: 0 }));
    expect(checkPlan(twoOnMonday, c, mini, { skipCover: true })).toBe("Mon: 2 main portions would spoil before they're eaten");
  });
});

describe('buildModel', () => {
  it('writes CPLEX LP with pins fixed and masked slots left out', () => {
    const c = constraints({ pins: [{ recipeId: 'a12-steak-fajita-bowls', day: 1 }] });
    const m = buildModel(c, realCatalog);
    expect(m.trivialInfeasible).toBe(false);
    for (const section of ['Minimize', 'Subject To', 'Bounds', 'General', 'Binary', 'End']) expect(m.lp).toContain(section);
    const a12 = realCatalog.recipes.findIndex((r) => r.id === 'a12-steak-fajita-bowls');
    expect(m.lp).toContain(` y_${a12}_1 = 1`);
    expect(m.vars[`y_${a12}_3`]).toEqual({ kind: 'y', recipeId: 'a12-steak-fajita-bowls', day: 3 });
    expect(m.vars[`y_${a12}_4`]).toBeUndefined(); // guacamole is gone by day 4
  });

  it('is trivially infeasible when nothing can be cooked on day 0', () => {
    const c = constraints({ maxCookMinutes: [0, 60, 60, 60, 60, 60, 60] });
    expect(buildModel(c, realCatalog).trivialInfeasible).toBe(true);
  });
});
