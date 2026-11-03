// Week-level helpers on Constraints. Pure: no React, no storage.

import type { Constraints, Recipe } from '../types';

/** Minutes of pinned cooking on each day of the horizon. */
export function pinnedMinutesByDay(constraints: Constraints, recipeById: ReadonlyMap<string, Recipe>): number[] {
  const minutes = Array<number>(constraints.days).fill(0);
  for (const pin of constraints.pins) {
    const recipe = recipeById.get(pin.recipeId);
    if (!recipe) throw new Error(`Pin uses unknown recipe "${pin.recipeId}"`);
    minutes[pin.day] = (minutes[pin.day] ?? 0) + recipe.minutes;
  }
  return minutes;
}
