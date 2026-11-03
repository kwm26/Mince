import { beforeAll, describe, expect, it } from 'vitest';
import type { PlanResult } from '../types';
import { absorbers, wasteInfo } from './absorbers';
import { weeks, weekToConstraints } from './data';
import { realCatalog, START } from './fixtures';
import { checkPlan } from './model';
import { previewEdit } from './preview';
import { solve } from './solve';

// use-it-up: last week's leftovers, so there is waste to absorb.
const c = weekToConstraints(weeks.find((w) => w.id === 'use-it-up')!, START);
let plan: PlanResult;

beforeAll(async () => {
  plan = await solve(c, realCatalog);
}, 30_000);

describe('absorbers (§11)', () => {
  it('are swaps only: an unpinned batch, same meal type, same day, constraints 2–6 kept', () => {
    const info = wasteInfo(plan, c, realCatalog);
    const ids = Object.keys(info.leftoverPacks);
    expect(ids.length).toBeGreaterThan(0);
    let seen = 0;
    for (const id of ids) {
      for (const a of absorbers(id, plan, c, realCatalog)) {
        seen++;
        const replaced = plan.batches[a.replacesBatchIndex]!;
        expect(replaced.pinned).toBe(false);
        expect(a.day).toBe(replaced.day);
        expect(realCatalog.recipeById.get(a.recipeId)!.mealType).toBe(realCatalog.recipeById.get(replaced.recipeId)!.mealType);
        expect(realCatalog.recipeById.get(a.recipeId)!.ingredients.some((ri) => ri.ingredientId === id && ri.role !== 'garnish')).toBe(true);
        const p = previewEdit(plan, { kind: 'swap', batchIndex: a.replacesBatchIndex, recipeId: a.recipeId }, c, realCatalog);
        expect(checkPlan(p.plan.batches, c, realCatalog)).toBeNull();
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('are ranked by Δ wastePacks from preview.ts, most negative first', () => {
    for (const id of Object.keys(wasteInfo(plan, c, realCatalog).leftoverPacks)) {
      const list = absorbers(id, plan, c, realCatalog);
      for (let k = 1; k < list.length; k++) expect(list[k]!.deltaWastePacks).toBeGreaterThanOrEqual(list[k - 1]!.deltaWastePacks);
      for (const a of list) {
        const p = previewEdit(plan, { kind: 'swap', batchIndex: a.replacesBatchIndex, recipeId: a.recipeId }, c, realCatalog);
        expect(a.deltaWastePacks).toBeCloseTo(p.delta.wastePacks, 12);
      }
    }
  });

  it('never replace a pinned batch', () => {
    const pinnedPlan = { ...plan, batches: plan.batches.map((b) => ({ ...b, pinned: true })) };
    for (const id of Object.keys(wasteInfo(plan, c, realCatalog).leftoverPacks)) expect(absorbers(id, pinnedPlan, c, realCatalog)).toEqual([]);
  });
});

describe('wasteInfo', () => {
  it('lists leftovers in packs and the single best absorber across them', () => {
    const info = wasteInfo(plan, c, realCatalog);
    for (const v of Object.values(info.leftoverPacks)) expect(v).toBeGreaterThan(0);
    const all = Object.keys(info.leftoverPacks).flatMap((id) => absorbers(id, plan, c, realCatalog));
    const min = Math.min(...all.map((a) => a.deltaWastePacks));
    if (min < 0) {
      expect(info.best).toBeDefined();
      expect(info.best!.deltaWastePacks).toBeCloseTo(min, 12);
    } else expect(info.best).toBeUndefined();
  });

  it('is fast enough for the Waste lens', () => {
    const t = performance.now();
    wasteInfo(plan, c, realCatalog);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
