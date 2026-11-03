import { beforeAll, describe, expect, it } from 'vitest';
import type { Edit, PlanResult } from '../types';
import { weeks, weekToConstraints } from './data';
import { realCatalog, START } from './fixtures';
import { checkPlan } from './model';
import { applyEdit, previewEdit } from './preview';
import { solve } from './solve';
import { metrics } from './waste';

const c = weekToConstraints(weeks.find((w) => w.id === 'standard')!, START);
let plan: PlanResult;

beforeAll(async () => {
  plan = await solve(c, realCatalog);
}, 30_000);

const mainIndex = () => plan.batches.findIndex((b) => realCatalog.recipeById.get(b.recipeId)!.mealType === 'main');

describe('previewEdit (§7)', () => {
  it('Δ equals metrics after − metrics before, for every kind of edit', () => {
    const k = mainIndex();
    const day = plan.batches[k]!.day;
    const edits: Edit[] = [
      { kind: 'move', batchIndex: k, toDay: day + 1 },
      { kind: 'swap', batchIndex: k, recipeId: 'm03-lemon-garlic-baked-cod' },
      { kind: 'remove', batchIndex: k },
      { kind: 'add', recipeId: 'a05-chicken-zucchini-skillet', day },
    ];
    for (const edit of edits) {
      const p = previewEdit(plan, edit, c, realCatalog);
      const before = metrics(plan.batches, c, realCatalog);
      const after = metrics(p.plan.batches, c, realCatalog);
      expect(p.before).toEqual(before);
      expect(p.after).toEqual(after);
      expect(p.delta.wastePacks).toBeCloseTo(after.wastePacks - before.wastePacks, 12);
      expect(p.delta.proteinByDay).toEqual(after.proteinByDay.map((x, d) => x - before.proteinByDay[d]!));
      const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
      expect(p.delta.cookMinutes).toBe(sum(after.cookMinutesByDay) - sum(before.cookMinutesByDay));
    }
  });

  it('runs in under 5 ms', () => {
    const k = mainIndex();
    const edit: Edit = { kind: 'swap', batchIndex: k, recipeId: 'm03-lemon-garlic-baked-cod' };
    previewEdit(plan, edit, c, realCatalog);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      previewEdit(plan, edit, c, realCatalog);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[10]!).toBeLessThan(5);
  });

  it('pins the edited batch and keeps the plan valid for a feasible swap', () => {
    const k = mainIndex();
    const p = previewEdit(plan, { kind: 'swap', batchIndex: k, recipeId: 'm03-lemon-garlic-baked-cod' }, c, realCatalog);
    expect(p.feasible).toBe(true);
    expect(p.reason).toBeUndefined();
    expect(p.plan.batches.find((b) => b.recipeId === 'm03-lemon-garlic-baked-cod' && b.day === plan.batches[k]!.day)!.pinned).toBe(true);
    expect(checkPlan(p.plan.batches, c, realCatalog)).toBeNull();
    for (const b of p.plan.batches) expect(b.reason!.length).toBeGreaterThan(0);
  });

  it('explains an infeasible move', () => {
    const k = mainIndex();
    const p = previewEdit(plan, { kind: 'move', batchIndex: k, toDay: 6 }, c, realCatalog);
    expect(p.feasible).toBe(false);
    expect(p.reason).toBeTruthy();
  });

  it('treats remove as feasible: the re-solve fills the gap', () => {
    const p = previewEdit(plan, { kind: 'remove', batchIndex: 0 }, c, realCatalog);
    expect(p.feasible).toBe(true);
    expect(p.plan.batches).toHaveLength(plan.batches.length - 1);
    expect(p.delta.cookMinutes).toBe(-realCatalog.recipeById.get(plan.batches[0]!.recipeId)!.minutes);
  });

  it('adds by swapping into an unpinned batch of the same meal type that day, or says why not', () => {
    const k = mainIndex();
    const day = plan.batches[k]!.day;
    const p = previewEdit(plan, { kind: 'add', recipeId: 'a05-chicken-zucchini-skillet', day }, c, realCatalog);
    expect(p.plan.batches).toHaveLength(plan.batches.length);
    expect(p.plan.batches.some((b) => b.recipeId === 'a05-chicken-zucchini-skillet' && b.day === day)).toBe(true);
    const empty = [0, 1, 2, 3, 4, 5, 6].find((d) => !plan.batches.some((b) => b.day === d && realCatalog.recipeById.get(b.recipeId)!.mealType === 'main'))!;
    const none = previewEdit(plan, { kind: 'add', recipeId: 'a05-chicken-zucchini-skillet', day: empty }, c, realCatalog);
    expect(none.feasible).toBe(false);
    expect(none.reason).toMatch(/^No unpinned main on \w{3} to swap chicken and zucchini skillet into$/);
  });
});

describe('applyEdit (§7)', () => {
  it('pins moved, swapped and added batches and drops the old pin', () => {
    const k = mainIndex();
    const b = plan.batches[k]!;
    const pinned = { ...c, pins: [{ recipeId: b.recipeId, day: b.day }] };
    expect(applyEdit(pinned, plan, { kind: 'move', batchIndex: k, toDay: b.day + 1 }).pins).toEqual([{ recipeId: b.recipeId, day: b.day + 1 }]);
    expect(applyEdit(pinned, plan, { kind: 'swap', batchIndex: k, recipeId: 'm03-lemon-garlic-baked-cod' }).pins).toEqual([
      { recipeId: 'm03-lemon-garlic-baked-cod', day: b.day },
    ]);
    expect(applyEdit(c, plan, { kind: 'add', recipeId: 'm03-lemon-garlic-baked-cod', day: 4 }).pins).toEqual([{ recipeId: 'm03-lemon-garlic-baked-cod', day: 4 }]);
  });

  it('keeps unrelated pins', () => {
    const other = { recipeId: 'b02-protein-pancakes-yogurt-berries', day: 6 };
    const next = applyEdit({ ...c, pins: [other] }, plan, { kind: 'add', recipeId: 'm03-lemon-garlic-baked-cod', day: 4 });
    expect(next.pins).toContainEqual(other);
  });

  it('turns remove into an excluded slot and drops its pin', () => {
    const b = plan.batches[0]!;
    const next = applyEdit({ ...c, pins: [{ recipeId: b.recipeId, day: b.day }] }, plan, { kind: 'remove', batchIndex: 0 });
    expect(next.excludedSlots).toEqual([{ recipeId: b.recipeId, day: b.day }]);
    expect(next.pins).toEqual([]);
  });

  it('re-solves to a plan without the removed slot', async () => {
    const b = plan.batches[0]!;
    const next = await solve(applyEdit(c, plan, { kind: 'remove', batchIndex: 0 }), realCatalog);
    expect(next.status).not.toBe('infeasible');
    expect(next.batches.some((x) => x.recipeId === b.recipeId && x.day === b.day)).toBe(false);
  }, 30_000);
});
