import { describe, expect, it } from 'vitest';
import type { Batch } from '../types';
import { constraints, ing, makeCatalog, realCatalog, rec } from './fixtures';
import { schedule } from './schedule';

// Breakfast only: a 6-portion bake that freezes well, a 2-portion one that doesn't.
const cat = makeCatalog(
  [
    rec('big-bake', 'breakfast', 6, 25, 35, [['eggs', 8]], { freezesWell: true }),
    rec('small-bake', 'breakfast', 2, 20, 10, [['eggs', 2]]),
    rec('no-freeze-bake', 'breakfast', 6, 25, 35, [['eggs', 8]]),
  ],
  [ing('eggs', 28, 12, { packUnit: 'each' })],
);
const c = constraints({ mealsPerDay: { breakfast: 1, main: 0 } });
const b = (recipeId: string, day: number, frozenPortions = 0): Batch => ({ recipeId, day, pinned: false, frozenPortions });

describe('schedule (§5)', () => {
  it('eats fresh portions first and fills only the gaps with frozen ones', () => {
    // big-bake Mon: 3 fresh (Mon–Wed) + 3 frozen; small-bake Sat: 2 fresh (Sat, Sun).
    const s = schedule([b('big-bake', 0, 3), b('small-bake', 5)], c, cat);
    expect(s.meals.map((m) => `${m.day}:${m.batchIndex}${m.frozen ? 'F' : ''}`)).toEqual(['0:0', '1:0', '2:0', '3:0F', '4:0F', '5:1', '6:1']);
    expect(s.short).toEqual([]);
    expect(s.spoiled).toEqual([]);
    expect(s.inFreezer).toEqual([{ batchIndex: 0, portions: 1 }]);
    expect(s.proteinByDay).toEqual([25, 25, 25, 25, 25, 20, 20]);
    expect(s.notes).toEqual([
      { day: 0, text: 'Freeze 3 portions of big bake' },
      { day: 2, text: 'Move 1 portion of big bake to the fridge tonight' },
      { day: 3, text: 'Move 1 portion of big bake to the fridge tonight' },
      { day: 6, text: '1 portion of big bake stays in the freezer' },
    ]);
  });

  it('never eats a frozen portion on a day a fresh one is available', () => {
    // Fresh: big-bake Mon–Wed, small-bake Thu–Fri; frozen big-bake fills Sat and Sun.
    const s = schedule([b('big-bake', 0, 3), b('small-bake', 3)], c, cat);
    const freshDays = new Set(s.meals.filter((m) => !m.frozen).map((m) => m.day));
    for (const m of s.meals.filter((x) => x.frozen)) expect(freshDays.has(m.day)).toBe(false);
    expect(s.meals.filter((m) => m.frozen).map((m) => m.day)).toEqual([5, 6]);
  });

  it('flags a fresh portion eaten after its life (constraint 4 should prevent it)', () => {
    const s = schedule([b('no-freeze-bake', 0)], c, cat);
    expect(s.spoiled.map((x) => x.day)).toEqual([3, 4, 5]);
    expect(s.short.map((x) => x.day)).toEqual([6]);
  });

  it('notes when to move raw chicken from the freezer', () => {
    const a03 = 'a03-sheet-pan-chicken-broccoli-sweet-potato';
    const s = schedule([b(a03, 0), b(a03, 4)], constraints(), realCatalog);
    expect(s.freezeOnShoppingDay).toEqual(new Set(['chicken-breast']));
    expect(s.notes).toContainEqual({ day: 3, text: 'Move the chicken breast from the freezer to the fridge tonight' });
    expect(s.notes.filter((n) => n.text.includes('chicken'))).toHaveLength(1);
  });
});
