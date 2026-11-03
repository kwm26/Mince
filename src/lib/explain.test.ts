import { describe, expect, it } from 'vitest';
import type { Batch } from '../types';
import { explainBatch, explainPlan } from './explain';
import { constraints, ing, makeCatalog, mini, rec, START } from './fixtures';
import { planFromBatches } from './waste';

const b = (recipeId: string, day: number, pinned = false): Batch => ({ recipeId, day, pinned, frozenPortions: 0 });
const mainsOnly = constraints({ mealsPerDay: { breakfast: 0, main: 2 } });
const planOf = (batches: Batch[], c = mainsOnly, cat = mini) => planFromBatches(batches, c, cat, { status: 'optimal', solveMs: 0 });

describe('explanations (§8)', () => {
  it('names shared ingredients with weekday names, the soonest expiry and protein', () => {
    const plan = planOf([b('alpha', 0), b('beta', 2)]);
    expect(explainBatch(0, plan, mainsOnly, mini)).toEqual([
      "shares spinach and tomato with Wed's beta",
      'uses spinach before it expires Sat',
      '+40 g protein per serving',
    ]);
  });

  it('puts "you pinned this" first and keeps protein', () => {
    const plan = planOf([b('alpha', 0, true), b('beta', 2)]);
    expect(explainBatch(0, plan, mainsOnly, mini)).toEqual(['you pinned this', "shares spinach and tomato with Wed's beta", '+40 g protein per serving']);
  });

  it('says when an optional ingredient is left out', () => {
    const plan = planOf([b('delta', 5)]);
    expect(explainBatch(0, plan, mainsOnly, mini)[0]).toBe('cooked without avocado (only good through Fri)');
  });

  it('mentions a tight cooking limit', () => {
    const c = constraints({ mealsPerDay: { breakfast: 0, main: 2 }, maxCookMinutes: [60, 60, 20, 60, 60, 60, 60] });
    const plan = planOf([b('gamma', 2)], c);
    expect(explainBatch(0, plan, c, mini)).toContain('fits your 20-min limit on Wed');
  });

  it('prefers stock from the pantry that is about to turn', () => {
    const c = constraints({
      mealsPerDay: { breakfast: 0, main: 2 },
      pantry: [{ ingredientId: 'tomato', amount: 2, addedOn: START, daysLeftAtAdd: 1 }],
    });
    const plan = planOf([b('beta', 1)], c);
    expect(explainBatch(0, plan, c, mini)).toContain('uses your tomato before it expires Tue');
  });

  it('never cites a garnish', () => {
    const cat = makeCatalog(
      [rec('one', 'main', 4, 30, 20, [['herb', 1, 'garnish'], ['kale', 1]]), rec('two', 'main', 4, 30, 20, [['herb', 1, 'garnish'], ['leek', 1]])],
      [ing('herb', 3, 1), ing('kale', 30, 1), ing('leek', 30, 1)],
    );
    const plan = planOf([b('one', 0), b('two', 2)], mainsOnly, cat);
    for (const k of [0, 1]) for (const r of explainBatch(k, plan, mainsOnly, cat)) expect(r).not.toMatch(/herb/);
  });

  it('gives every batch between one and three reasons', () => {
    const plan = explainPlan(planOf([b('alpha', 0, true), b('beta', 2), b('delta', 5)]), mainsOnly, mini);
    for (const batch of plan.batches) {
      expect(batch.reason!.length).toBeGreaterThan(0);
      expect(batch.reason!.length).toBeLessThanOrEqual(3);
    }
  });
});
