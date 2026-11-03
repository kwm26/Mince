// The real optimizer and ingredient map, wired into the screens' contracts:
// solves run HiGHS in the worker (solverClient), previews and edits run on the
// main thread (preview.ts, < 5 ms), and the map reads the same plan and catalog.

import { useMemo } from 'react';
import { MapView } from './components/map/MapView';
import type { PlanEngine } from './engine';
import { wasteInfo } from './lib/absorbers';
import { applyEdit, previewEdit } from './lib/preview';
import type { PlanMapApi } from './screens/Plan';
import { solvePlan } from './solverClient';
import type { LensContext } from './types';

export const optimizerEngine: PlanEngine = {
  solve: (c, overrides) => solvePlan(c, overrides),
  preview: (plan, edit, c, catalog) => previewEdit(plan, edit, c, catalog),
  applyEdit: (c, plan, edit) => applyEdit(c, plan, edit),
};

/** Plan's Map view. Picking a day on the map hands the add to Steer, which previews, applies and offers Undo. */
export function PlanMap({ api }: { api: PlanMapApi }) {
  const { catalog, constraints, plan, today } = api;
  const waste = useMemo(
    () => (plan && plan.status !== 'infeasible' ? wasteInfo(plan, constraints, catalog) : undefined),
    [plan, constraints, catalog],
  );
  const ctx: LensContext = { catalog, constraints, plan, today, waste };
  return (
    <MapView
      ctx={ctx}
      onAddToPlan={plan && plan.status !== 'infeasible' ? (recipeId, day) => api.previewEdit({ kind: 'add', recipeId, day }) : undefined}
    />
  );
}
