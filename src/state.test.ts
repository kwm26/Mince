import { describe, expect, it } from 'vitest';
import { defaultConstraints } from './lib/data';
import { inputsKey, parseStored, reducer, type AppState } from './state';
import type { PlanResult } from './types';

const TODAY = '2026-11-03';
const fresh = (): AppState => ({ constraints: defaultConstraints(TODAY), overrides: {}, plan: null, planKey: null, solve: { status: 'idle' } });
const FAJITA = 'a12-steak-fajita-bowls';

const plan: PlanResult = {
  batches: [{ recipeId: FAJITA, day: 0, pinned: true, frozenPortions: 0, reason: ['you pinned this'] }],
  meals: [{ day: 0, mealType: 'main', batchIndex: 0, frozen: false }],
  shopping: [{ ingredientId: 'flank-steak', packs: 1, freeze: false }],
  notes: [],
  wastePacks: 0.4,
  reuseRate: 0.5,
  proteinByDay: [33, 0, 0, 0, 0, 0, 0],
  proteinShortfall: 0,
  status: 'optimal',
  solveMs: 12,
};

describe('reducer', () => {
  it('adds pins once, removes them, and clears a matching excluded slot', () => {
    let s = fresh();
    s = { ...s, constraints: { ...s.constraints, excludedSlots: [{ recipeId: FAJITA, day: 2 }] } };
    s = reducer(s, { type: 'pin/add', pin: { recipeId: FAJITA, day: 2 } });
    s = reducer(s, { type: 'pin/add', pin: { recipeId: FAJITA, day: 2 } });
    expect(s.constraints.pins).toEqual([{ recipeId: FAJITA, day: 2 }]);
    expect(s.constraints.excludedSlots).toEqual([]);
    s = reducer(s, { type: 'pin/remove', pin: { recipeId: FAJITA, day: 2 } });
    expect(s.constraints.pins).toEqual([]);
  });

  it('ignores pins for unknown recipes or days outside the week', () => {
    const s = fresh();
    expect(reducer(s, { type: 'pin/add', pin: { recipeId: 'nope', day: 0 } })).toBe(s);
    expect(reducer(s, { type: 'pin/add', pin: { recipeId: FAJITA, day: 7 } })).toBe(s);
  });

  it('upserts and removes pantry items by ingredient', () => {
    let s = fresh();
    s = reducer(s, { type: 'pantry/upsert', item: { ingredientId: 'spinach', amount: 2, addedOn: TODAY, daysLeftAtAdd: 3 } });
    s = reducer(s, { type: 'pantry/upsert', item: { ingredientId: 'spinach', amount: 4, addedOn: TODAY, daysLeftAtAdd: 5 } });
    expect(s.constraints.pantry).toEqual([{ ingredientId: 'spinach', amount: 4, addedOn: TODAY, daysLeftAtAdd: 5 }]);
    s = reducer(s, { type: 'pantry/remove', ingredientId: 'spinach' });
    expect(s.constraints.pantry).toEqual([]);
  });

  it('loads an example fridge and an example week', () => {
    let s = reducer(fresh(), { type: 'example/fridge', fridgeId: 'end-of-week', today: TODAY });
    expect(s.constraints.pantry.length).toBeGreaterThan(0);
    s = { ...s, plan, planKey: 'x', constraints: { ...s.constraints, weights: { waste: 3, protein: 2, cookTime: 0.3 } } };
    s = reducer(s, { type: 'example/week', weekId: 'busy-weekdays', today: TODAY });
    expect(s.constraints.maxCookMinutes).toEqual([90, 30, 30, 60, 30, 0, 60]);
    expect(s.constraints.weights.waste).toBe(3);
    expect(s.plan).toBeNull();
  });

  it('sets limits, clamps the protein target, and stores overrides', () => {
    let s = reducer(fresh(), { type: 'cookMinutes/set', day: 5, minutes: 0 });
    expect(s.constraints.maxCookMinutes[5]).toBe(0);
    s = reducer(s, { type: 'protein/set', grams: 9000 });
    expect(s.constraints.proteinPerDay).toBe(300);
    s = reducer(s, { type: 'override/set', ingredientId: 'spinach', override: { shelfLifeDays: 4 } });
    expect(s.overrides).toEqual({ spinach: { shelfLifeDays: 4 } });
    s = reducer(s, { type: 'override/set', ingredientId: 'spinach', override: null });
    expect(s.overrides).toEqual({});
  });

  it('tracks the solve lifecycle', () => {
    let s = reducer(fresh(), { type: 'solve/start' });
    expect(s.solve.status).toBe('loading');
    s = reducer(s, { type: 'solve/error', message: 'boom' });
    expect(s.solve).toEqual({ status: 'error', message: 'boom' });
    s = reducer(s, { type: 'solve/done', plan, key: 'k' });
    expect(s.solve.status).toBe('idle');
    expect(s.plan).toBe(plan);
    expect(s.planKey).toBe('k');
  });
});

describe('inputsKey', () => {
  it('changes when an input changes and ignores override key order', () => {
    const c = defaultConstraints(TODAY);
    expect(inputsKey(c, {})).toBe(inputsKey(defaultConstraints(TODAY), {}));
    expect(inputsKey(c, {})).not.toBe(inputsKey({ ...c, proteinPerDay: 160 }, {}));
    expect(inputsKey(c, { a: { packSize: 1 }, b: { packSize: 2 } })).toBe(inputsKey(c, { b: { packSize: 2 }, a: { packSize: 1 } }));
  });
});

describe('parseStored', () => {
  const saved = (over: Record<string, unknown> = {}) => ({
    version: 1,
    constraints: defaultConstraints(TODAY),
    overrides: { spinach: { shelfLifeDays: 4 }, nope: { packSize: 1 } },
    plan,
    planKey: 'k',
    ...over,
  });

  it('falls back to defaults for missing, corrupt or other-version data', () => {
    for (const raw of [null, 'junk', 42, { version: 2 }, saved({ constraints: { days: 7 } }), saved({ constraints: { ...defaultConstraints(TODAY), maxCookMinutes: [60] } })]) {
      const s = parseStored(raw, TODAY);
      expect(s.constraints).toEqual(defaultConstraints(TODAY));
      expect(s.plan).toBeNull();
    }
  });

  it('restores valid data and drops unknown ids', () => {
    const c = { ...defaultConstraints(TODAY), pins: [{ recipeId: FAJITA, day: 0 }, { recipeId: 'gone', day: 1 }] };
    const s = parseStored(saved({ constraints: c }), TODAY);
    expect(s.constraints.pins).toEqual([{ recipeId: FAJITA, day: 0 }]);
    expect(s.overrides).toEqual({ spinach: { shelfLifeDays: 4 } });
    expect(s.plan).toEqual(plan);
    expect(s.planKey).toBe('k');
  });

  it('drops a plan that refers to unknown recipes', () => {
    const bad = { ...plan, batches: [{ ...plan.batches[0], recipeId: 'gone' }] };
    expect(parseStored(saved({ plan: bad }), TODAY).plan).toBeNull();
  });

  it('moves an unplanned week that started in the past to today, but keeps a planned one', () => {
    const old = defaultConstraints('2026-10-27');
    expect(parseStored(saved({ constraints: old, plan: null }), TODAY).constraints.startDate).toBe(TODAY);
    expect(parseStored(saved({ constraints: old }), TODAY).constraints.startDate).toBe('2026-10-27');
  });
});
