// Browser-side client for the solver worker. One long-lived worker; a newer call
// supersedes an older one (its promise rejects with an Error named 'Superseded').

import type { Constraints, IngredientOverride, PlanResult } from './types';

type Response = { id: number; result: PlanResult } | { id: number; error: string };

interface Pending { id: number; resolve: (plan: PlanResult) => void; reject: (err: Error) => void; }

let worker: Worker | null = null;
let pending: Pending | null = null;
let nextId = 1;

function fail(err: Error): void {
  const p = pending;
  pending = null;
  p?.reject(err);
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./lib/solve.worker.ts', import.meta.url), { type: 'module' });
  w.addEventListener('message', (event: MessageEvent<Response>) => {
    const data = event.data;
    if (!pending || data.id !== pending.id) return; // a superseded answer
    const p = pending;
    pending = null;
    if ('error' in data) p.reject(new Error(data.error));
    else p.resolve(data.result);
  });
  w.addEventListener('error', (event) => {
    event.preventDefault();
    w.terminate();
    if (worker === w) worker = null;
    fail(new Error(event.message || 'The solver stopped unexpectedly'));
  });
  worker = w;
  return w;
}

/** Solves `constraints` in the worker with the user's ingredient overrides applied. */
export function solvePlan(constraints: Constraints, overrides: Record<string, IngredientOverride> = {}): Promise<PlanResult> {
  const w = getWorker();
  if (pending) {
    const err = new Error('A newer solve replaced this one');
    err.name = 'Superseded';
    fail(err);
  }
  const id = nextId++;
  return new Promise<PlanResult>((resolve, reject) => {
    pending = { id, resolve, reject };
    w.postMessage({ id, constraints, overrides });
  });
}
