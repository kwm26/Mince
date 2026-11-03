import { describe, expect, it } from 'vitest';
import { weeks, weekToConstraints } from './data';
import { constraints, mini, realCatalog, START } from './fixtures';
import { greedyPlan } from './greedy';
import { checkPlan } from './model';

describe('greedy baseline (§6)', () => {
  it('returns a valid plan for every feasible seed week, keeping the pins', () => {
    for (const w of weeks.filter((x) => x.id !== 'pin-conflict')) {
      const c = weekToConstraints(w, START);
      const plan = greedyPlan(c, realCatalog);
      expect(plan.status, w.id).toBe('timeout-best');
      expect(checkPlan(plan.batches, c, realCatalog), w.id).toBeNull();
      for (const pin of c.pins) expect(plan.batches.some((b) => b.pinned && b.recipeId === pin.recipeId && b.day === pin.day)).toBe(true);
      expect(plan.solveMs, w.id).toBeLessThan(500);
    }
  });

  it('reports pin conflicts like the solver', () => {
    const plan = greedyPlan(weekToConstraints(weeks.find((w) => w.id === 'pin-conflict')!, START), realCatalog);
    expect(plan.status).toBe('infeasible');
    expect(plan.infeasibleReason).toBe('Tue: pinned meals need 45 min, limit is 20');
  });

  it('picks the least added waste first', () => {
    // Mains only, 2 a day, 3 days. Added waste for the Mon batch, in packs:
    //   alpha: spinach 3/5 + tomato 1/4 + lemon 0.5/1 = 0.60 + 0.25 + 0.50 = 1.35
    //   beta:  spinach 3/5 + tomato 2/4               = 0.60 + 0.50        = 1.10
    //   gamma: spinach 4/5                            = 0.80
    //   delta: tomato 3/4, avocado (1 of 1) used up   = 0.75   ← least
    const c = constraints({ days: 3, mealsPerDay: { breakfast: 0, main: 2 }, maxCookMinutes: [60, 60, 60] });
    const plan = greedyPlan(c, mini);
    expect(plan.batches[0]).toMatchObject({ recipeId: 'delta', day: 0 });
  });

  it('says which meal it cannot cover', () => {
    const c = constraints({ maxCookMinutes: [60, 60, 60, 60, 60, 0, 0], mealsPerDay: { breakfast: 0, main: 2 } });
    const plan = greedyPlan(c, mini);
    expect(plan.status).toBe('infeasible');
    expect(plan.infeasibleReason).toMatch(/^No combination of recipes covers (Sat|Sun)'s main within these limits\.$/);
  });
});
