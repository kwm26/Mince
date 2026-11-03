import { describe, expect, it } from 'vitest';
import type { PantryItem } from '../types';
import { ingredientById } from './data';
import { daysLeft, daysLeftLabel, formatAmount, isPerishable, isUseSoon } from './kitchen';

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
