// The optimizer as the Plan screen sees it. The real engine (HiGHS in a worker,
// preview.ts) is injected by App; until it is wired, the placeholder below
// fails honestly so the screen shows its real error state. It never fabricates
// plan numbers.

import type { Constraints, Edit, IngredientOverride, PlanResult, Preview } from './types';

export interface PlanEngine {
  solve(c: Constraints, overrides: Record<string, IngredientOverride>): Promise<PlanResult>;
  preview(plan: PlanResult, edit: Edit, c: Constraints): Preview;
  applyEdit(c: Constraints, plan: PlanResult, edit: Edit): Constraints;
}

const NOT_CONNECTED = "The optimizer isn't connected yet";

export const disconnectedEngine: PlanEngine = {
  solve: () => Promise.reject(new Error(NOT_CONNECTED)),
  preview: () => {
    throw new Error(NOT_CONNECTED);
  },
  applyEdit: () => {
    throw new Error(NOT_CONNECTED);
  },
};
