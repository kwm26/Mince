import { describe, expect, it } from 'vitest';
import type { Batch } from '../types';
import { constraints, ing, makeCatalog, realCatalog, rec } from './fixtures';
import { schedule } from './schedule';

// Breakfast only: a 6-portion bake that freezes well, 2-portion bakes that don't.
const cat = makeCatalog(
  [
    rec('big-bake', 'breakfast', 6, 25, 35, [['eggs', 8]], { freezesWell: true }),
    rec('small-bake', 'breakfast', 2, 20, 10, [['eggs', 2]]),
    rec('same-bake', 'breakfast', 2, 25, 10, [['eggs', 2]]),
    rec('no-freeze-bake', 'breakfast', 6, 25, 35, [['eggs', 8]]),
  ],
  [ing('eggs', 28, 12, { packUnit: 'each' })],
);
const c = constraints({ mealsPerDay: { breakfast: 1, main: 0 } });
const b = (recipeId: string, day: number, frozenPortions = 0): Batch => ({ recipeId, day, pinned: false, frozenPortions });
const mealCodes = (s: ReturnType<typeof schedule>) => s.meals.map((m) => `${m.day}:${m.batchIndex}${m.frozen ? 'F' : ''}`);

describe('schedule (§5)', () => {
  it('eats fresh portions first and fills only the gaps with frozen ones', () => {
    // big-bake Mon: 3 fresh (Mon–Wed) + 3 frozen; same-bake Sat: 2 fresh (Sat, Sun), same protein.
    const s = schedule([b('big-bake', 0, 3), b('same-bake', 5)], c, cat);
    expect(mealCodes(s)).toEqual(['0:0', '1:0', '2:0', '3:0F', '4:0F', '5:1', '6:1']);
    expect(s.short).toEqual([]);
    expect(s.spoiled).toEqual([]);
    expect(s.inFreezer).toEqual([{ batchIndex: 0, portions: 1 }]);
    expect(s.proteinByDay).toEqual([25, 25, 25, 25, 25, 25, 25]);
    expect(s.notes).toEqual([
      { day: 0, text: 'Freeze 3 portions of big bake' },
      { day: 2, text: 'Move 1 portion of big bake to the fridge tonight' },
      { day: 3, text: 'Move 1 portion of big bake to the fridge tonight' },
      { day: 6, text: '1 portion of big bake stays in the freezer' },
    ]);
  });

  it('eats the portions with the most protein when some can wait until after Sunday', () => {
    // small-bake Sat (20 g) is good through Mon, so one portion carries over and the
    // third frozen big-bake portion (25 g) is eaten on Sun instead: the most protein eaten.
    const s = schedule([b('big-bake', 0, 3), b('small-bake', 5)], c, cat);
    expect(mealCodes(s)).toEqual(['0:0', '1:0', '2:0', '3:0F', '4:0F', '5:1', '6:0F']);
    expect(s.proteinByDay).toEqual([25, 25, 25, 25, 25, 20, 25]);
    expect(s.inFreezer).toEqual([]);
  });

  it('never eats a frozen portion on a day a fresh one is available', () => {
    // Fresh: big-bake Mon–Wed, small-bake Thu–Fri; frozen big-bake fills Sat and Sun.
    const s = schedule([b('big-bake', 0, 3), b('small-bake', 3)], c, cat);
    const freshDays = new Set(s.meals.filter((m) => !m.frozen).map((m) => m.day));
    for (const m of s.meals.filter((x) => x.frozen)) expect(freshDays.has(m.day)).toBe(false);
    expect(s.meals.filter((m) => m.frozen).map((m) => m.day)).toEqual([5, 6]);
  });

  it('never eats a portion after its life, and flags the ones that spoil (constraint 4 should prevent it)', () => {
    // 6 fresh portions good Mon–Wed at 1 breakfast a day: 3 eaten, 3 spoil on Thu.
    const s = schedule([b('no-freeze-bake', 0)], c, cat);
    expect(s.meals.map((m) => m.day)).toEqual([0, 1, 2]);
    expect(s.spoiled).toEqual([3, 3, 3].map((day) => ({ batchIndex: 0, day })));
    expect(s.short.map((x) => x.day)).toEqual([3, 4, 5, 6]);
  });

  it('counts no protein for portions left after the last day', () => {
    // same-bake on Sun: one portion eaten Sun, one carries over to Mon.
    const s = schedule([b('big-bake', 0, 3), b('same-bake', 6)], c, cat);
    expect(s.meals.filter((m) => m.batchIndex === 1)).toHaveLength(1);
    expect(s.proteinByDay.reduce((x, y) => x + y, 0)).toBe(7 * 25);
  });

  it('notes when to move raw chicken from the freezer', () => {
    const a03 = 'a03-sheet-pan-chicken-broccoli-sweet-potato';
    const s = schedule([b(a03, 0), b(a03, 4)], constraints(), realCatalog);
    expect(s.freezeOnShoppingDay).toEqual(new Set(['chicken-breast']));
    expect(s.notes).toContainEqual({ day: 3, text: 'Move the chicken breast from the freezer to the fridge tonight' });
    expect(s.notes.filter((n) => n.text.includes('chicken'))).toHaveLength(1);
  });
});
