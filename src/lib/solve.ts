// Runs the §3 model with HiGHS: pin checks, build, solve (2 s limit), decode, schedule,
// metrics and reasons. Works in Node (tests) and in the worker (solve.worker.ts passes
// `locateFile` for the wasm URL). Pure apart from the cached solver instance.

import highsLoader from 'highs';
import type { Catalog, Constraints, PlanResult } from '../types';
import { explainPlan } from './explain';
import { greedyPlan } from './greedy';
import { buildModel, checkPins, checkPlan, decodeSolution } from './model';
import { emptyPlan, planFromBatches } from './waste';

export interface SolveOptions {
  /** Where the browser finds highs.wasm; omit in Node. */
  locateFile?: (file: string) => string;
  /** Seconds; default 2 (data-model §3). */
  timeLimitSec?: number;
}

type Highs = Awaited<ReturnType<typeof highsLoader>>;
let highsPromise: Promise<Highs> | null = null;

function loadHighs(opts?: SolveOptions): Promise<Highs> {
  if (!highsPromise) {
    const locateFile = opts?.locateFile;
    highsPromise = highsLoader(locateFile ? { locateFile } : undefined);
    highsPromise.catch(() => { highsPromise = null; });
  }
  return highsPromise;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const NO_COVER_PINS = 'These pins leave no way to cover every meal.';
const NO_COVER_LIMITS = 'These cooking limits leave no way to cover every meal.';

/**
 * Solves the week. 'infeasible' only for pin or limit conflicts (with a reason); a protein
 * shortfall is a warning in `proteinShortfall`. On timeout returns the best plan found
 * ('timeout-best'), or the greedy plan when HiGHS found none. `solveMs` excludes the
 * one-time wasm load.
 */
export async function solve(constraints: Constraints, catalog: Catalog, opts?: SolveOptions): Promise<PlanResult> {
  const highs = await loadHighs(opts);
  const t0 = now();

  const pinReason = checkPins(constraints, catalog);
  if (pinReason) return emptyPlan(constraints, pinReason, now() - t0);

  const model = buildModel(constraints, catalog);
  const conflict = constraints.pins.length > 0 ? NO_COVER_PINS : NO_COVER_LIMITS;
  if (model.trivialInfeasible) return emptyPlan(constraints, conflict, now() - t0);

  const fallback = (): PlanResult => {
    const g = greedyPlan(constraints, catalog);
    return { ...g, solveMs: now() - t0 };
  };

  let result: ReturnType<Highs['solve']>;
  try {
    result = highs.solve(model.lp, { time_limit: opts?.timeLimitSec ?? 2, output_flag: false });
  } catch {
    return fallback();
  }

  if (result.Status === 'Infeasible') return emptyPlan(constraints, conflict, now() - t0);
  if (result.Status !== 'Optimal' && result.Status !== 'Time limit reached') return fallback();

  const batches = decodeSolution(model, result.Columns, constraints, catalog);
  if (batches.length === 0 || checkPlan(batches, constraints, catalog) !== null) return fallback();

  const status = result.Status === 'Optimal' ? 'optimal' : 'timeout-best';
  const plan = explainPlan(planFromBatches(batches, constraints, catalog, { status, solveMs: 0 }), constraints, catalog);
  plan.solveMs = now() - t0;
  return plan;
}
