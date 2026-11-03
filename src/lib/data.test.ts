import { describe, expect, it } from 'vitest';
import type { Ingredient, Recipe } from '../types';
import {
  defaultConstraints,
  fridges,
  fridgeToPantry,
  ingredientById,
  ingredients,
  recipeById,
  recipes,
  weekToConstraints,
  weeks,
} from './data';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORIES = ['protein', 'produce', 'herb', 'dairy', 'grain', 'pantry', 'spice', 'fruit', 'other'];
const TODAY = '2026-11-03';

function ingredient(id: string): Ingredient {
  const i = ingredientById.get(id);
  if (!i) throw new Error(`unknown ingredient ${id}`);
  return i;
}

function recipe(id: string): Recipe {
  const r = recipeById.get(id);
  if (!r) throw new Error(`unknown recipe ${id}`);
  return r;
}

// Mask rule from data-model §3 (core, non-staple ingredients, "good through").
// Replace with the mask from model.ts once it exists.
function passesMask(r: Recipe, day: number, frozenLifeDays: number): boolean {
  return r.ingredients.every((ri) => {
    const i = ingredient(ri.ingredientId);
    if (ri.role !== 'core' || i.staple) return true;
    return (i.freezable ? frozenLifeDays : i.shelfLifeDays) >= day;
  });
}

describe('ingredients.json', () => {
  it('has unique kebab-case ids', () => {
    const ids = ingredients.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(KEBAB);
  });

  it('has a valid category, shelf life and pack for every ingredient', () => {
    for (const i of ingredients) {
      expect(CATEGORIES, i.id).toContain(i.category);
      expect(Number.isInteger(i.shelfLifeDays) && i.shelfLifeDays > 0, i.id).toBe(true);
      expect(i.packSize, i.id).toBeGreaterThan(0);
      expect(i.packUnit, i.id).not.toBe('');
    }
  });
});

describe('recipes.json', () => {
  it('has the 24 recipes from the brief: 4 breakfasts, 20 mains', () => {
    expect(recipes).toHaveLength(24);
    expect(recipes.filter((r) => r.mealType === 'breakfast')).toHaveLength(4);
    expect(recipes.filter((r) => r.mealType === 'main')).toHaveLength(20);
  });

  it('has unique kebab-case ids', () => {
    const ids = recipes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(KEBAB);
  });

  it('links every recipe to a real source', () => {
    for (const r of recipes) {
      expect(r.source.name, r.id).not.toBe('');
      expect(r.source.url, r.id).toMatch(/^https:\/\//);
    }
  });

  it('has positive servings and minutes, and at least one step', () => {
    for (const r of recipes) {
      expect(r.servings, r.id).toBeGreaterThan(0);
      expect(r.minutes, r.id).toBeGreaterThan(0);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
    }
  });

  it('has protein per serving as a number or null, never anything else', () => {
    for (const r of recipes) {
      const p = r.macrosPerServing.protein;
      expect(p === null || (typeof p === 'number' && p >= 0), r.id).toBe(true);
    }
  });

  it('only uses ingredients that exist', () => {
    for (const r of recipes) {
      for (const ri of r.ingredients) expect(ingredientById.has(ri.ingredientId), `${r.id}: ${ri.ingredientId}`).toBe(true);
    }
  });

  it('gives staples qty 0 and every other core or optional use a positive qty', () => {
    for (const r of recipes) {
      for (const ri of r.ingredients) {
        const label = `${r.id}: ${ri.ingredientId}`;
        if (ingredient(ri.ingredientId).staple) expect(ri.qty, label).toBe(0);
        else if (ri.role !== 'garnish') expect(ri.qty, label).toBeGreaterThan(0);
      }
    }
  });
});

describe('example fridges (data-model §13)', () => {
  it('has unique ids', () => {
    const ids = fridges.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only holds real, non-staple ingredients, each once', () => {
    for (const f of fridges) {
      const ids = f.items.map((x) => x.ingredientId);
      expect(new Set(ids).size, f.id).toBe(ids.length);
      for (const id of ids) expect(ingredient(id).staple ?? false, `${f.id}: ${id}`).toBe(false);
    }
  });

  it('keeps every amount positive and 1 ≤ daysLeft ≤ shelfLifeDays', () => {
    for (const f of fridges) {
      for (const x of f.items) {
        const label = `${f.id}: ${x.ingredientId}`;
        expect(x.amount, label).toBeGreaterThan(0);
        expect(Number.isInteger(x.daysLeft), label).toBe(true);
        expect(x.daysLeft, label).toBeGreaterThanOrEqual(1);
        expect(x.daysLeft, label).toBeLessThanOrEqual(ingredient(x.ingredientId).shelfLifeDays);
      }
    }
  });
});

describe('example weeks (data-model §13)', () => {
  const defaults = defaultConstraints(TODAY);

  it('has unique ids and resolves every fridge', () => {
    const ids = weeks.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of weeks) {
      if (w.fridgeId !== null) expect(fridges.some((f) => f.id === w.fridgeId), w.id).toBe(true);
    }
  });

  it('gives one cooking limit per day and a positive protein target', () => {
    for (const w of weeks) {
      expect(w.maxCookMinutes, w.id).toHaveLength(defaults.days);
      for (const m of w.maxCookMinutes) expect(m, w.id).toBeGreaterThanOrEqual(0);
      expect(w.proteinPerDay, w.id).toBeGreaterThan(0);
    }
  });

  it('pins real recipes on days inside the horizon', () => {
    for (const w of weeks) {
      for (const p of w.pins) {
        expect(recipeById.has(p.recipeId), `${w.id}: ${p.recipeId}`).toBe(true);
        expect(p.day, w.id).toBeGreaterThanOrEqual(0);
        expect(p.day, w.id).toBeLessThan(defaults.days);
      }
    }
  });

  it('keeps every pin within the mask and cooking limit, except in pin-conflict', () => {
    for (const w of weeks.filter((w) => w.id !== 'pin-conflict')) {
      const minutes = Array<number>(defaults.days).fill(0);
      for (const p of w.pins) {
        const r = recipe(p.recipeId);
        expect(passesMask(r, p.day, defaults.frozenLifeDays), `${w.id}: ${r.id} on day ${p.day}`).toBe(true);
        minutes[p.day] = (minutes[p.day] ?? 0) + r.minutes;
      }
      minutes.forEach((m, d) => expect(m, `${w.id}: day ${d}`).toBeLessThanOrEqual(w.maxCookMinutes[d] ?? 0));
    }
  });

  it('makes pin-conflict break the cooking limit on purpose', () => {
    const w = weeks.find((w) => w.id === 'pin-conflict');
    expect(w).toBeDefined();
    const over = w!.pins.some((p) => recipe(p.recipeId).minutes > (w!.maxCookMinutes[p.day] ?? 0));
    expect(over).toBe(true);
  });

  it('includes the standard validation week: defaults and an empty fridge', () => {
    const w = weeks.find((w) => w.id === 'standard');
    expect(w).toBeDefined();
    const c = weekToConstraints(w!, TODAY);
    expect(c).toEqual(defaults);
  });
});

describe('loading', () => {
  it('uses the data-model §2 defaults', () => {
    const c = defaultConstraints(TODAY);
    expect(c.startDate).toBe(TODAY);
    expect(c.days).toBe(7);
    expect(c.proteinPerDay).toBe(150);
    expect(c.mealsPerDay).toEqual({ breakfast: 1, main: 2 });
    expect(c.maxCookMinutes).toEqual([60, 60, 60, 60, 60, 60, 60]);
    expect(c.cookedFoodLifeDays).toBe(3);
    expect(c.frozenLifeDays).toBe(30);
    expect(c.maxRepeatsPerRecipe).toBe(2);
    expect(c.weights).toEqual({ waste: 1.0, protein: 2.0, cookTime: 0.3 });
  });

  it('turns a seed fridge into pantry items added today', () => {
    const fridge = fridges.find((f) => f.id === 'end-of-week');
    expect(fridge).toBeDefined();
    const pantry = fridgeToPantry(fridge!, TODAY);
    expect(pantry).toHaveLength(fridge!.items.length);
    pantry.forEach((item, k) => {
      expect(item.addedOn).toBe(TODAY);
      expect(item.daysLeftAtAdd).toBe(fridge!.items[k]!.daysLeft);
      expect(item.amount).toBe(fridge!.items[k]!.amount);
    });
  });

  it('merges a seed week over the defaults with its fridge as the pantry', () => {
    const w = weeks.find((w) => w.id === 'busy-weekdays');
    expect(w).toBeDefined();
    const c = weekToConstraints(w!, TODAY);
    expect(c.maxCookMinutes).toEqual(w!.maxCookMinutes);
    expect(c.maxCookMinutes).not.toBe(w!.maxCookMinutes);
    expect(c.pantry.map((p) => p.ingredientId)).toEqual(fridges.find((f) => f.id === 'fresh-shop')!.items.map((x) => x.ingredientId));
    expect(c.cookedFoodLifeDays).toBe(3);
  });

  it('rejects a week with an unknown fridge', () => {
    expect(() => weekToConstraints({ ...weeks[0]!, fridgeId: 'nope' }, TODAY)).toThrow(/unknown fridge/);
  });
});
