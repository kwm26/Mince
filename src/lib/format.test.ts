import { describe, expect, it } from 'vitest';
import type { PlanResult } from '../types';
import { recipeById } from './data';
import {
  average,
  changedDays,
  COOK_WORDS,
  deltaPhrase,
  longDate,
  packs,
  percent,
  planCookMinutes,
  plural,
  PROTEIN_WORDS,
  sentence,
  shortDay,
  signed,
  WASTE_WORDS,
  weekdayName,
} from './format';
import { DEFAULT_WEIGHTS, levelWeight, levelWord, weightLevel } from './priorities';

describe('signed deltas', () => {
  it('always shows a sign and uses a true minus', () => {
    expect(signed(6)).toBe('+6');
    expect(signed(-0.44, 1)).toBe('−0.4');
    expect(signed(0.04, 1)).toBe('0');
    expect(signed(-0.0001, 1)).toBe('0');
  });

  it('says the direction in words, never colour alone', () => {
    expect(deltaPhrase(-0.4, WASTE_WORDS)).toBe('−0.4 packs, less waste');
    expect(deltaPhrase(0.6, WASTE_WORDS)).toBe('+0.6 packs, more waste');
    expect(deltaPhrase(0.01, WASTE_WORDS)).toBe('No change in waste');
    expect(deltaPhrase(51, PROTEIN_WORDS)).toBe('+51 g, more protein');
    expect(deltaPhrase(-8, COOK_WORDS)).toBe('−8 min, less cooking');
  });

  it('ends solver messages as sentences', () => {
    expect(sentence('Wed: pinned meals need 45 min, limit is 20')).toBe('Wed: pinned meals need 45 min, limit is 20.');
    expect(sentence('Already ends.')).toBe('Already ends.');
    expect(sentence('  ')).toBe('');
  });

  it('lists only days that changed by at least half a unit', () => {
    expect(changedDays([0, 51, -0.2, -51, 0.5])).toEqual([1, 3, 4]);
  });
});

describe('numbers', () => {
  it('formats rates, packs and counts', () => {
    expect(percent(0.666)).toBe('67%');
    expect(packs(1.44)).toBe('1.4');
    expect(packs(2)).toBe('2');
    expect(plural(1, 'pack')).toBe('1 pack');
    expect(plural(3, 'portion')).toBe('3 portions');
    expect(average([140, 160])).toBe(150);
    expect(average([])).toBe(0);
  });

  it('totals cooking minutes from the recipe data', () => {
    const plan = {
      batches: [
        { recipeId: 'a12-steak-fajita-bowls', day: 0, pinned: true, frozenPortions: 0 },
        { recipeId: 'b01-greek-yogurt-parfait-bowl', day: 1, pinned: false, frozenPortions: 0 },
      ],
    } as PlanResult;
    expect(planCookMinutes(plan, recipeById)).toBe(45 + 5);
  });
});

describe('day names', () => {
  it('names plan days from the start date', () => {
    expect(weekdayName('2026-11-03', 0)).toBe('Tuesday');
    expect(weekdayName('2026-11-03', 6)).toBe('Monday');
    expect(shortDay('2026-11-03', 1)).toBe('Wed 4');
    expect(longDate('2026-11-03')).toBe('Tue 3 Nov');
  });
});

describe('priorities', () => {
  it('maps Medium to the data-model defaults', () => {
    expect(levelWeight('waste', 1)).toBe(DEFAULT_WEIGHTS.waste);
    expect(levelWeight('protein', 1)).toBe(DEFAULT_WEIGHTS.protein);
    expect(levelWeight('cookTime', 1)).toBe(DEFAULT_WEIGHTS.cookTime);
  });

  it('round-trips every level and labels it in words', () => {
    for (const key of ['waste', 'protein', 'cookTime'] as const) {
      for (const level of [0, 1, 2] as const) expect(weightLevel(key, levelWeight(key, level))).toBe(level);
    }
    expect(levelWord(0)).toBe('Low');
    expect(levelWord(2)).toBe('High');
  });

  it('snaps odd stored weights to the nearest level', () => {
    expect(weightLevel('waste', 0)).toBe(0);
    expect(weightLevel('waste', 100)).toBe(2);
    expect(weightLevel('protein', 2.5)).toBe(1);
  });
});
