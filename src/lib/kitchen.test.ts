import { describe, expect, it } from 'vitest';
import type { PantryItem, Recipe } from '../types';
import { ingredientById, recipes, withOverrides } from './data';
import { daysLeft, daysLeftLabel, formatAmount, isPerishable, isUseSoon, rankByOverlap } from './kitchen';

function fakeRecipe(id: string, ingredientIds: string[], protein: number | null, roles?: Recipe['ingredients'][number]['role'][]): Recipe {
  return {
    id,
    title: id,
    mealType: 'main',
    minutes: 20,
    difficulty: 'easy',
    servings: 4,
    tags: [],
    macrosPerServing: { kcal: null, protein, carbs: null, fat: null },
    source: { name: 'test', url: '' },
    ingredients: ingredientIds.map((ingredientId, i) => ({ ingredientId, qty: 1, role: roles?.[i] ?? 'core' })),
    steps: [],
  };
}

const TODAY = '2026-11-03';
const item = (ingredientId: string, daysLeftAtAdd: number, addedOn = TODAY): PantryItem => ({ ingredientId, amount: 1, addedOn, daysLeftAtAdd });

describe('rankByOverlap (data-model §12)', () => {
  it('puts a recipe using a 1-day-left item above one using a 4-day-left item at equal overlap', () => {
    const usesSpinach = fakeRecipe('uses-spinach', ['spinach'], 20);
    const usesBroccoli = fakeRecipe('uses-broccoli', ['broccoli'], 40);
    const ranked = rankByOverlap([usesBroccoli, usesSpinach], [item('spinach', 1), item('broccoli', 4)], TODAY);
    expect(ranked.map((r) => r.recipe.id)).toEqual(['uses-spinach', 'uses-broccoli']);
    expect(ranked[0]).toMatchObject({ overlap: 1, soonestDaysLeft: 1, usesIds: ['spinach'] });
  });

  it('sorts by overlap first, then protein, with overlap 0 last', () => {
    const two = fakeRecipe('two', ['spinach', 'broccoli'], 10);
    const none = fakeRecipe('none', ['salmon'], 60);
    const oneLow = fakeRecipe('one-low', ['broccoli'], 20);
    const oneHigh = fakeRecipe('one-high', ['broccoli'], 45);
    const ranked = rankByOverlap([none, oneLow, two, oneHigh], [item('spinach', 3), item('broccoli', 3)], TODAY);
    expect(ranked.map((r) => r.recipe.id)).toEqual(['two', 'one-high', 'one-low', 'none']);
    expect(ranked[3]).toMatchObject({ overlap: 0, soonestDaysLeft: null, usesIds: [] });
  });

  it('counts only perishables, distinct, core or optional (never garnish)', () => {
    const r = fakeRecipe('r', ['spinach', 'rice', 'salt', 'cilantro', 'lime'], 30, ['core', 'core', 'core', 'garnish', 'optional']);
    const pantry = [item('spinach', 4), item('spinach', 2), item('rice', 300), item('cilantro', 2), item('lime', 9)];
    const [ranked] = rankByOverlap([r], pantry, TODAY);
    expect(ranked).toMatchObject({ overlap: 2, usesIds: ['spinach', 'lime'], soonestDaysLeft: 2 });
  });

  it('counts days left as of the given date', () => {
    const a = fakeRecipe('a', ['spinach'], 10);
    const b = fakeRecipe('b', ['broccoli'], 10);
    // Spinach added 3 days ago with 5 left now has 2; broccoli added today with 3 left.
    const ranked = rankByOverlap([b, a], [item('spinach', 5, '2026-10-31'), item('broccoli', 3)], TODAY);
    expect(ranked.map((x) => [x.recipe.id, x.soonestDaysLeft])).toEqual([
      ['a', 2],
      ['b', 3],
    ]);
  });

  it('uses shelf-life overrides to decide what is perishable', () => {
    const r = fakeRecipe('r', ['rice'], 10);
    expect(rankByOverlap([r], [item('rice', 5)], TODAY)[0]!.overlap).toBe(0);
    const edited = withOverrides({ rice: { shelfLifeDays: 7 } });
    expect(rankByOverlap([r], [item('rice', 5)], TODAY, edited.ingredientById)[0]!.overlap).toBe(1);
  });

  it('ranks every real recipe exactly once', () => {
    const ranked = rankByOverlap(recipes, [item('spinach', 2)], TODAY);
    expect(new Set(ranked.map((r) => r.recipe.id)).size).toBe(recipes.length);
  });
});

describe('isPerishable', () => {
  it('is true up to 14 days, false after, and false for staples', () => {
    expect(isPerishable(ingredientById.get('greek-yogurt')!)).toBe(true); // 14 days
    expect(isPerishable(ingredientById.get('cheddar')!)).toBe(false); // 21 days
    const staple = [...ingredientById.values()].find((i) => i.staple)!;
    expect(isPerishable({ ...staple, shelfLifeDays: 3 })).toBe(false);
  });
});

const spinach: PantryItem = { ingredientId: 'spinach', amount: 2, addedOn: '2026-11-03', daysLeftAtAdd: 3 };

describe('daysLeft (data-model §12)', () => {
  it('counts down by one per calendar day', () => {
    expect(daysLeft(spinach, '2026-11-03')).toBe(3);
    expect(daysLeft(spinach, '2026-11-04')).toBe(2);
    expect(daysLeft(spinach, '2026-11-06')).toBe(0);
  });

  it('never goes below 0', () => {
    expect(daysLeft(spinach, '2026-11-20')).toBe(0);
  });
});

describe('labels', () => {
  it('flags 2 days or fewer as use soon', () => {
    expect(isUseSoon(2)).toBe(true);
    expect(isUseSoon(3)).toBe(false);
  });

  it('says how long is left in words', () => {
    expect(daysLeftLabel(0)).toBe('Today');
    expect(daysLeftLabel(1)).toBe('1 day');
    expect(daysLeftLabel(5)).toBe('5 days');
  });

  it('formats amounts in their pack unit', () => {
    expect(formatAmount(2, 'cup')).toBe('2 cups');
    expect(formatAmount(0.5, 'cup')).toBe('0.5 cup');
    expect(formatAmount(8, 'oz')).toBe('8 oz');
    expect(formatAmount(3, 'each')).toBe('×3');
    expect(formatAmount(4, 'inch')).toBe('4 inches');
    expect(formatAmount(1 / 3, 'cup')).toBe('0.33 cup');
  });
});
