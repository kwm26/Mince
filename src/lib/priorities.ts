// The Steer priority sliders (design-spec §5, data-model §7): three levels per
// weight, labelled in words. Medium is the data-model default. Pure.

import type { Weights } from '../types';

export type Level = 0 | 1 | 2;
export const LEVEL_WORDS = ['Low', 'Medium', 'High'] as const;

/** The data-model §3 defaults; Low and High scale them by a third and by three. */
export const DEFAULT_WEIGHTS: Weights = { waste: 1.0, protein: 2.0, cookTime: 0.3 };
const SCALE = [1 / 3, 1, 3] as const;

export function levelWeight(key: keyof Weights, level: Level): number {
  return Number((DEFAULT_WEIGHTS[key] * SCALE[level]).toFixed(3));
}

/** The level nearest to a stored weight (on a log scale, so ×3 and ÷3 are equally far). */
export function weightLevel(key: keyof Weights, weight: number): Level {
  if (!(weight > 0)) return 0;
  const ratio = Math.log(weight / DEFAULT_WEIGHTS[key]) / Math.log(3);
  return Math.max(0, Math.min(2, Math.round(ratio) + 1)) as Level;
}

export function levelWord(level: Level): string {
  return LEVEL_WORDS[level];
}
