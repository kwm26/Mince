import { describe, expect, it } from 'vitest';
import type { PlanResult } from '../types';
import { ingredientById, recipeById } from './data';
import {
  batchesCookedOn,
  droppedOptionals,
  formatTimer,
  garnishes,
  highlightStep,
  shortName,
  stepIngredients,
  timerLabel,
} from './cook';

const recipe = (id: string) => recipeById.get(id)!;
const marked = (text: string, id: string) =>
  highlightStep(text, recipe(id), ingredientById)
    .filter((s) => s.ingredientId)
    .map((s) => `${s.text}=${s.ingredientId}`);

describe('shortName', () => {
  it('drops the description after a comma or bracket', () => {
    expect(shortName('Chicken breast, boneless skinless')).toBe('Chicken breast');
    expect(shortName('Mushrooms (baby bella/white)')).toBe('Mushrooms');
    expect(shortName('Lemon')).toBe('Lemon');
  });
});

describe('highlightStep', () => {
  it('keeps every character of the step, in order', () => {
    const text = 'Marinate steak in lime, oil and garlic.';
    const segments = highlightStep(text, recipe('a12-steak-fajita-bowls'), ingredientById);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('finds ingredients by their short name, head noun and plural', () => {
    expect(marked('Marinate steak in lime, oil and garlic.', 'a12-steak-fajita-bowls')).toEqual([
      'steak=flank-steak',
      'lime=lime',
      'oil=olive-oil',
      'garlic=garlic',
    ]);
    expect(marked('Slice peppers and onion; toss with spices.', 'a12-steak-fajita-bowls')).toEqual([
      'peppers=bell-pepper',
      'onion=red-onion',
    ]);
  });

  it('uses the food word before a cut ("chicken" for chicken breast)', () => {
    expect(marked('Air-fry chicken at 380°F to 165°F, flipping halfway.', 'a01-greek-chicken-protein-bowl')).toEqual([
      'chicken=chicken-breast',
    ]);
  });

  it('prefers the longest name, and leaves an ambiguous word plain', () => {
    // a02 has yellow onion (core) and green onion (garnish): "green onion" is exact, plain "onion" goes to core.
    expect(marked('Return everything with green onion and soy sauce; toss hot.', 'a02-chicken-fried-rice')).toEqual([
      'green onion=green-onion',
      'soy sauce=soy-sauce',
    ]);
    expect(marked('Soften onion, garlic and ginger in butter.', 'a02-chicken-fried-rice')).toEqual([
      'onion=yellow-onion',
      'garlic=garlic',
      'ginger=ginger',
      'butter=butter',
    ]);
    // a12 has bell pepper (produce) and black pepper (staple): "pepper" goes to the non-staple.
    expect(marked('Sauté peppers and onion; microwave corn.', 'a12-steak-fajita-bowls')).toEqual([
      'peppers=bell-pepper',
      'onion=red-onion',
      'corn=frozen-corn',
    ]);
  });

  it('matches whole words only', () => {
    expect(marked('Simmer rice, covered.', 'a12-steak-fajita-bowls')).toEqual(['rice=rice']);
    expect(marked('Season generously.', 'a12-steak-fajita-bowls')).toEqual([]);
  });
});

describe('stepIngredients', () => {
  it('lists each mentioned ingredient once, in order of first mention', () => {
    const ids = stepIngredients('Sear steak, rest, slice steak against the grain.', recipe('a12-steak-fajita-bowls'), ingredientById).map(
      (ri) => ri.ingredientId,
    );
    expect(ids).toEqual(['flank-steak']);
  });
});

describe('garnish and dropped optionals', () => {
  it('lists garnish separately', () => {
    expect(garnishes(recipe('a12-steak-fajita-bowls')).map((g) => g.ingredientId)).toEqual(['cilantro']);
  });

  it('drops an optional ingredient only after it expires (good through its shelf life)', () => {
    const r = recipe('a12-steak-fajita-bowls'); // sour cream is optional, 14 days
    expect(droppedOptionals(r, 14, ingredientById, 30)).toEqual([]);
    expect(droppedOptionals(r, 15, ingredientById, 30).map((i) => i.id)).toEqual(['sour-cream']);
    const spinachDish = recipe('a04-italian-skillet-chicken-tomato-mushroom'); // spinach optional, 5 days
    expect(droppedOptionals(spinachDish, 5, ingredientById, 30)).toEqual([]);
    expect(droppedOptionals(spinachDish, 6, ingredientById, 30).map((i) => i.id)).toEqual(['spinach']);
  });
});

describe('batchesCookedOn', () => {
  const plan = {
    batches: [
      { recipeId: 'a12-steak-fajita-bowls', day: 0, pinned: true, frozenPortions: 0 },
      { recipeId: 'b01-greek-yogurt-parfait-bowl', day: 2, pinned: false, frozenPortions: 0 },
    ],
    status: 'optimal',
  } as PlanResult;

  it('finds the batches for today by the start date', () => {
    expect(batchesCookedOn(plan, '2026-11-03', '2026-11-03')).toEqual([0]);
    expect(batchesCookedOn(plan, '2026-11-01', '2026-11-03')).toEqual([1]);
    expect(batchesCookedOn(plan, '2026-11-03', '2026-11-04')).toEqual([]);
  });

  it('has nothing to cook without a plan or from an infeasible one', () => {
    expect(batchesCookedOn(null, '2026-11-03', '2026-11-03')).toEqual([]);
    expect(batchesCookedOn({ ...plan, status: 'infeasible' }, '2026-11-03', '2026-11-03')).toEqual([]);
  });
});

describe('timers', () => {
  it('formats a countdown', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(245)).toBe('4:05');
    expect(formatTimer(1500)).toBe('25:00');
    expect(formatTimer(3600)).toBe('1:00:00');
    expect(formatTimer(0.2)).toBe('0:01');
    expect(formatTimer(-5)).toBe('0:00');
  });

  it('labels a step timer in words', () => {
    expect(timerLabel(30)).toBe('30 s');
    expect(timerLabel(1800)).toBe('30 min');
    expect(timerLabel(3600)).toBe('1 hr');
    expect(timerLabel(5400)).toBe('1 hr 30 min');
  });
});
