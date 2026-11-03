import { describe, expect, it } from 'vitest';
import { defaultConstraints, recipeById, weekToConstraints, weeks } from './data';
import { pinnedMinutesByDay } from './week';

const TODAY = '2026-11-03';

describe('pinnedMinutesByDay', () => {
  it('is all zeros with no pins', () => {
    expect(pinnedMinutesByDay(defaultConstraints(TODAY), recipeById)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('adds up pinned recipe minutes per day', () => {
    const c = {
      ...defaultConstraints(TODAY),
      pins: [
        { recipeId: 'b01-greek-yogurt-parfait-bowl', day: 1 },
        { recipeId: 'a05-chicken-zucchini-skillet', day: 1 },
        { recipeId: 'a02-chicken-fried-rice', day: 4 },
      ],
    };
    expect(pinnedMinutesByDay(c, recipeById)).toEqual([0, 25, 0, 0, 45, 0, 0]);
  });

  it('shows the pin-conflict week going over its limit', () => {
    const c = weekToConstraints(weeks.find((w) => w.id === 'pin-conflict')!, TODAY);
    const minutes = pinnedMinutesByDay(c, recipeById);
    expect(minutes[1]).toBeGreaterThan(c.maxCookMinutes[1]!);
  });

  it('rejects a pin on an unknown recipe', () => {
    const c = { ...defaultConstraints(TODAY), pins: [{ recipeId: 'nope', day: 0 }] };
    expect(() => pinnedMinutesByDay(c, recipeById)).toThrow(/unknown recipe/);
  });
});
