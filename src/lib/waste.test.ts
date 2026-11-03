import { describe, expect, it } from 'vitest';
import type { Batch } from '../types';
import { constraints, mini, realCatalog, START } from './fixtures';
import { leftoverPacks, ledger, metrics, needs, packs, reuseRate, shoppingList, usablePantry, wastePacks } from './waste';

const batch = (recipeId: string, day: number, pinned = false): Batch => ({ recipeId, day, pinned, frozenPortions: 0 });
const c = constraints();

describe('wastePacks (§4)', () => {
  it('matches a hand-computed 2-recipe example exactly', () => {
    // alpha (Mon): spinach 2, tomato 3, lemon 0.5, rice 1, salt (staple), basil (garnish)
    // beta  (Tue): spinach 2, tomato 2
    // spinach: need 4 cups → 1 pack of 5 → leftover 1 cup   = 1/5   = 0.20 pack
    // tomato:  need 5 cups → 2 packs of 4 → leftover 3 cups  = 3/4   = 0.75 pack
    // lemon:   need 0.5    → 1 pack of 1 → leftover 0.5      = 0.5/1 = 0.50 pack
    // rice lasts 365 days (not perishable), salt is a staple, basil is garnish: none count.
    // wastePacks = 0.20 + 0.75 + 0.50 = 1.45
    const plan = [batch('alpha', 0), batch('beta', 1)];
    expect(wastePacks(plan, c, mini)).toBeCloseTo(1.45, 12);
    expect(leftoverPacks(plan, c, mini)).toEqual({ spinach: expect.closeTo(0.2, 12), tomato: 0.75, lemon: 0.5 });
    expect(shoppingList(plan, c, mini)).toEqual([
      { ingredientId: 'spinach', packs: 1, freeze: false },
      { ingredientId: 'tomato', packs: 2, freeze: false },
      { ingredientId: 'lemon', packs: 1, freeze: false },
      { ingredientId: 'rice', packs: 1, freeze: false },
    ]);
  });

  it('drops when a recipe that reuses a leftover perishable is added', () => {
    // gamma uses the 1 cup of spinach alpha + beta leave over (and only a staple besides).
    const before = wastePacks([batch('alpha', 0), batch('beta', 1)], c, mini);
    const after = wastePacks([batch('alpha', 0), batch('beta', 1), batch('gamma', 2)], c, mini);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeCloseTo(0.2, 12);
  });
});

describe('roles (§3, §4)', () => {
  it('leaves an expired optional ingredient out of need and shopping; never garnish', () => {
    // delta: tomato 1 (core), avocado 1 (optional, good through day 4), basil 1 (garnish)
    const early = [batch('delta', 4)];
    const late = [batch('delta', 5)];
    expect(needs(early, c, mini).get('avocado')).toBe(1);
    expect(needs(late, c, mini).has('avocado')).toBe(false);
    expect(shoppingList(late, c, mini).map((s) => s.ingredientId)).toEqual(['tomato']);
    for (const plan of [early, late]) {
      expect(needs(plan, c, mini).has('basil')).toBe(false);
      expect(shoppingList(plan, c, mini).some((s) => s.ingredientId === 'basil')).toBe(false);
    }
  });
});

describe('pantry (§4)', () => {
  // 3 cups of spinach at home with 1 day left (good through Tue).
  const withPantry = constraints({ pantry: [{ ingredientId: 'spinach', amount: 3, addedOn: START, daysLeftAtAdd: 1 }] });

  it('reduces packs only for batches cooked on or before its daysLeft', () => {
    expect(usablePantry('spinach', [batch('beta', 1)], withPantry, mini)).toBe(2);
    expect(packs('spinach', [batch('beta', 1)], withPantry, mini)).toBe(0);
    expect(usablePantry('spinach', [batch('beta', 2)], withPantry, mini)).toBe(0);
    expect(packs('spinach', [batch('beta', 2)], withPantry, mini)).toBe(1);
    // Two batches, one inside the window: 2 cups from the pantry, 2 bought (1 pack).
    expect(packs('spinach', [batch('beta', 0), batch('alpha', 3)], withPantry, mini)).toBe(1);
  });

  it('counts unused pantry stock as leftover', () => {
    // beta on Wed can't use the spinach: 5 bought − 2 + 3 at home = 6 cups left = 1.2 packs.
    const l = ledger([batch('beta', 2)], withPantry, mini).get('spinach')!;
    expect(l.leftover).toBeCloseTo(6, 12);
    expect(leftoverPacks([batch('beta', 2)], withPantry, mini).spinach).toBeCloseTo(1.2, 12);
  });

  it('counts days left from the start date, not today', () => {
    const added = constraints({ pantry: [{ ingredientId: 'spinach', amount: 3, addedOn: '2026-10-31', daysLeftAtAdd: 3 }] });
    // 3 days left on Sat 31 Oct → 1 day left on Mon 2 Nov.
    expect(usablePantry('spinach', [batch('beta', 1)], added, mini)).toBe(2);
    expect(usablePantry('spinach', [batch('beta', 2)], added, mini)).toBe(0);
  });
});

describe('reuseRate (§4)', () => {
  it("doesn't count two batches of the same recipe as reuse", () => {
    expect(reuseRate([batch('beta', 0), batch('beta', 2)], c, mini)).toBe(0);
    // alpha + beta share spinach and tomato; lemon is alpha's alone; rice isn't perishable.
    expect(reuseRate([batch('alpha', 0), batch('beta', 1)], c, mini)).toBeCloseTo(2 / 3, 12);
  });
});

describe('shopping freeze flag (§5)', () => {
  it('freezes raw chicken on shopping day only when it is used after its shelf life', () => {
    const a03 = 'a03-sheet-pan-chicken-broccoli-sweet-potato';
    const flag = (day: number) => shoppingList([batch(a03, day)], c, realCatalog).find((s) => s.ingredientId === 'chicken-breast')!.freeze;
    expect(flag(2)).toBe(false); // good through day 2
    expect(flag(3)).toBe(true);
  });
});

describe('metrics', () => {
  it('reports cooking minutes per day and protein from the schedule', () => {
    const m = metrics([batch('alpha', 0), batch('beta', 1)], constraints({ mealsPerDay: { breakfast: 0, main: 2 } }), mini);
    expect(m.cookMinutesByDay).toEqual([30, 20, 0, 0, 0, 0, 0]);
    // Mon: 2 × alpha (40 g); Tue: 2 × alpha; Wed: 2 × beta (35 g); Thu: 2 × beta.
    expect(m.proteinByDay).toEqual([80, 80, 70, 70, 0, 0, 0]);
  });
});
