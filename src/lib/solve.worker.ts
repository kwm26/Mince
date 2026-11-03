// Thin Web Worker wrapper around solve.ts so the UI never blocks (data-model §3).
// Message in: { id, constraints, overrides }. Out: { id, result } or { id, error }.

import wasmUrl from 'highs/runtime?url';
import type { Constraints, IngredientOverride } from '../types';
import { withOverrides } from './data';
import { solve } from './solve';

export interface SolveRequest {
  id: number;
  constraints: Constraints;
  overrides?: Record<string, IngredientOverride>;
}

self.addEventListener('message', (event: MessageEvent<SolveRequest>) => {
  const { id, constraints, overrides } = event.data;
  solve(constraints, withOverrides(overrides ?? {}), { locateFile: () => wasmUrl })
    .then((result) => self.postMessage({ id, result }))
    .catch((err: unknown) => self.postMessage({ id, error: err instanceof Error ? err.message : String(err) }));
});
