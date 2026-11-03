// Steer preview (data-model §7): the cost of an edit before it's applied, without
// re-solving, and the constraints that apply it. Pure: no React, no storage.

import type { Batch, Catalog, Constraints, Edit, Metrics, Pin, PlanResult, Preview } from '../types';
import { explainPlan } from './explain';
import { recipeLabel, weekday } from './labels';
import { checkPlan, minFrozenPortions, sortBatches } from './model';
import { schedule } from './schedule';
import { metrics, planFromBatches } from './waste';

interface Edited { batches: Batch[]; reason?: string; }

function nothing(plan: PlanResult, reason: string): Edited {
  return { batches: plan.batches, reason };
}

function swapAt(plan: PlanResult, index: number, recipeId: string, constraints: Constraints, catalog: Catalog): Edited {
  const old = plan.batches[index];
  if (!old) return nothing(plan, 'That meal is no longer in the plan');
  const recipe = catalog.recipeById.get(recipeId);
  if (!recipe) return nothing(plan, `Recipe "${recipeId}" isn't in the recipe list`);
  const others = plan.batches.filter((_, k) => k !== index);
  const batch: Batch = { recipeId, day: old.day, pinned: true, frozenPortions: 0 };
  batch.frozenPortions = minFrozenPortions(batch, others, constraints, catalog);
  return { batches: sortBatches([...others, batch], catalog) };
}

/** The batches after `edit`, unsolved. `reason` is set when the edit can't even be built. */
function editBatches(plan: PlanResult, edit: Edit, constraints: Constraints, catalog: Catalog): Edited {
  switch (edit.kind) {
    case 'move': {
      const old = plan.batches[edit.batchIndex];
      if (!old) return nothing(plan, 'That meal is no longer in the plan');
      const others = plan.batches.filter((_, k) => k !== edit.batchIndex);
      const batch: Batch = { recipeId: old.recipeId, day: edit.toDay, pinned: true, frozenPortions: 0 };
      batch.frozenPortions = minFrozenPortions(batch, others, constraints, catalog);
      return { batches: sortBatches([...others, batch], catalog) };
    }
    case 'swap':
      return swapAt(plan, edit.batchIndex, edit.recipeId, constraints, catalog);
    case 'remove': {
      if (!plan.batches[edit.batchIndex]) return nothing(plan, 'That meal is no longer in the plan');
      return { batches: plan.batches.filter((_, k) => k !== edit.batchIndex) };
    }
    case 'add': {
      const recipe = catalog.recipeById.get(edit.recipeId);
      if (!recipe) return nothing(plan, `Recipe "${edit.recipeId}" isn't in the recipe list`);
      const targets = plan.batches
        .map((b, k) => ({ b, k }))
        .filter(({ b }) => !b.pinned && b.day === edit.day && catalog.recipeById.get(b.recipeId)?.mealType === recipe.mealType);
      if (targets.length === 0) {
        return nothing(plan, `No unpinned ${recipe.mealType} on ${weekday(constraints.startDate, edit.day)} to swap ${recipeLabel(recipe, true)} into`);
      }
      // Of the batches it could replace, prefer a feasible swap that wastes least.
      let best: { edited: Edited; feasible: boolean; waste: number } | null = null;
      for (const { k } of targets) {
        const edited = swapAt(plan, k, recipe.id, constraints, catalog);
        const feasible = checkPlan(edited.batches, constraints, catalog) === null;
        const waste = metrics(edited.batches, constraints, catalog).wastePacks;
        if (!best || (feasible && !best.feasible) || (feasible === best.feasible && waste < best.waste)) best = { edited, feasible, waste };
      }
      return best!.edited;
    }
  }
}

/** Preview with optional precomputed "before" metrics and without reasons (for absorbers). */
export function previewWith(
  plan: PlanResult,
  edit: Edit,
  constraints: Constraints,
  catalog: Catalog,
  opts: { before?: Metrics; explain?: boolean } = {},
): Preview {
  const before = opts.before ?? metrics(plan.batches, constraints, catalog);
  const edited = editBatches(plan, edit, constraints, catalog);
  if (edited.reason) {
    return {
      edit,
      feasible: false,
      reason: edited.reason,
      before,
      after: before,
      delta: { wastePacks: 0, proteinByDay: before.proteinByDay.map(() => 0), cookMinutes: 0 },
      plan,
    };
  }
  // Removing leaves a gap the re-solve fills, so cover (constraint 3) isn't checked for it.
  const reason = checkPlan(edited.batches, constraints, catalog, { skipCover: edit.kind === 'remove' });
  const sched = schedule(edited.batches, constraints, catalog);
  let next = planFromBatches(edited.batches, constraints, catalog, { status: plan.status, solveMs: 0, schedule: sched });
  if (opts.explain !== false) next = explainPlan(next, constraints, catalog);
  const after: Metrics = {
    wastePacks: next.wastePacks,
    reuseRate: next.reuseRate,
    proteinByDay: next.proteinByDay,
    cookMinutesByDay: edited.batches.reduce((acc, b) => {
      const r = catalog.recipeById.get(b.recipeId);
      if (r) acc[b.day] = (acc[b.day] ?? 0) + r.minutes;
      return acc;
    }, Array<number>(constraints.days).fill(0)),
  };
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const preview: Preview = {
    edit,
    feasible: reason === null,
    before,
    after,
    delta: {
      wastePacks: after.wastePacks - before.wastePacks,
      proteinByDay: after.proteinByDay.map((p, d) => p - (before.proteinByDay[d] ?? 0)),
      cookMinutes: sum(after.cookMinutesByDay) - sum(before.cookMinutesByDay),
    },
    plan: next,
  };
  if (reason !== null) preview.reason = reason;
  return preview;
}

/**
 * The cost of `edit` (move, swap, remove, add) before committing: §4 and §5 on the edited
 * plan, no re-solve. `feasible` is false when the mask or constraints 2–6 break; `add`
 * swaps the recipe into an unpinned batch of the same meal type on that day.
 */
export function previewEdit(plan: PlanResult, edit: Edit, constraints: Constraints, catalog: Catalog): Preview {
  return previewWith(plan, edit, constraints, catalog);
}

const same = (a: Pin, b: Pin) => a.recipeId === b.recipeId && a.day === b.day;

function withPin(constraints: Constraints, pin: Pin, drop?: Pin): Constraints {
  const pins = constraints.pins.filter((p) => !(drop && same(p, drop)) && !same(p, pin));
  return {
    ...constraints,
    pins: [...pins, pin],
    excludedSlots: constraints.excludedSlots.filter((s) => !same(s, pin)),
  };
}

/**
 * Constraints that apply `edit`, ready to re-solve: move, swap and add pin the edited batch
 * (existing pins stay; the moved or swapped-out slot's own pin is dropped); remove adds the
 * slot to `excludedSlots` and drops its pin.
 */
export function applyEdit(constraints: Constraints, plan: PlanResult, edit: Edit): Constraints {
  switch (edit.kind) {
    case 'move': {
      const old = plan.batches[edit.batchIndex];
      if (!old) return constraints;
      return withPin(constraints, { recipeId: old.recipeId, day: edit.toDay }, { recipeId: old.recipeId, day: old.day });
    }
    case 'swap': {
      const old = plan.batches[edit.batchIndex];
      if (!old) return constraints;
      return withPin(constraints, { recipeId: edit.recipeId, day: old.day }, { recipeId: old.recipeId, day: old.day });
    }
    case 'add':
      return withPin(constraints, { recipeId: edit.recipeId, day: edit.day });
    case 'remove': {
      const old = plan.batches[edit.batchIndex];
      if (!old) return constraints;
      const slot = { recipeId: old.recipeId, day: old.day };
      return {
        ...constraints,
        pins: constraints.pins.filter((p) => !same(p, slot)),
        excludedSlots: constraints.excludedSlots.some((s) => same(s, slot)) ? constraints.excludedSlots : [...constraints.excludedSlots, slot],
      };
    }
  }
}
