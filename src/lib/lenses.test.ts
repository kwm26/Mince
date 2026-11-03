import { describe, expect, it } from 'vitest';
import type { LensContext, LensName, Pin, PlanResult, WasteInfo } from '../types';
import { catalog, defaultConstraints, fridges, fridgeToPantry } from './data';
import { displayName, formatPacks, LENSES, lens, mapData, signedPacks } from './lenses';

const START = '2026-11-02'; // a Monday, so plan day 3 is Thu

function planOf(pins: Pin[], status: PlanResult['status'] = 'optimal'): PlanResult {
  return {
    batches: pins.map((p) => ({ ...p, pinned: false, frozenPortions: 0 })),
    meals: [],
    shopping: [],
    notes: [],
    wastePacks: 0,
    reuseRate: 0,
    proteinByDay: [],
    proteinShortfall: 0,
    status,
    solveMs: 1,
  };
}

const plan = planOf([
  { recipeId: 'b01-greek-yogurt-parfait-bowl', day: 0 },
  { recipeId: 'a01-greek-chicken-protein-bowl', day: 0 },
  { recipeId: 'm04-cilantro-lime-salmon-bake', day: 1 },
  { recipeId: 'a07-greek-turkey-meatballs-tzatziki', day: 3 },
  { recipeId: 'm06-shrimp-vegetable-skillet', day: 4 },
]);

const waste: WasteInfo = {
  leftoverPacks: { cilantro: 0.6, lime: 0.25, cucumber: 0 },
  best: { ingredientId: 'cilantro', recipeId: 'a12-steak-fajita-bowls', day: 3, replacesBatchIndex: 3, deltaWastePacks: -0.6 },
};

function ctx(over: Partial<LensContext> = {}): LensContext {
  return { catalog, constraints: defaultConstraints(START), plan, today: START, waste, ...over };
}

const names = LENSES.map((l) => l.name);
const contexts: [string, LensContext][] = [
  ['with a plan', ctx()],
  ['before a plan', ctx({ plan: null, waste: undefined })],
  ['infeasible', ctx({ plan: planOf([], 'infeasible'), waste: undefined })],
  ['with a fridge', ctx({ constraints: { ...defaultConstraints(START), pantry: fridgeToPantry(fridges.find((f) => f.id === 'end-of-week')!, START) } })],
];

describe('every lens', () => {
  for (const [label, c] of contexts) {
    for (const name of names) {
      it(`${name} (${label}) has a sentence and a list that mentions every high node`, () => {
        const r = lens(name, c);
        expect(r.sentence.length).toBeGreaterThan(0);
        expect(r.list.length).toBeGreaterThan(0);
        const text = r.list.join('\n').toLowerCase();
        for (const [id, node] of Object.entries(r.nodes)) {
          if (node.emphasis === 'high') expect(text, `${name}: ${id}`).toContain(displayName(catalog, id).toLowerCase());
        }
      });
    }
  }

  it('covers every node of the map', () => {
    const { graph } = mapData(catalog);
    for (const name of names) {
      const r = lens(name, ctx());
      for (const n of graph.nodes) expect(r.nodes[n.id], `${name}: ${n.id}`).toBeDefined();
    }
  });

  it('has a chip label, question and reading guide for all six lenses', () => {
    const all: LensName[] = ['week', 'hubs', 'freshness', 'waste', 'protein', 'families'];
    expect(names).toEqual(all);
    for (const l of LENSES) expect(l.howToRead.length).toBeGreaterThan(20);
  });
});

describe('week', () => {
  it('shows everything normal before a plan exists', () => {
    const r = lens('week', ctx({ plan: null }));
    expect(r.sentence).toBe('No plan yet: solve a week to see how it connects.');
    expect(Object.values(r.nodes).every((n) => n.emphasis === 'normal')).toBe(true);
  });

  it('makes planned recipes and their ingredients high, and the rest dim', () => {
    const r = lens('week', ctx());
    expect(r.nodes['a01-greek-chicken-protein-bowl']?.emphasis).toBe('high');
    expect(r.nodes.lemon?.emphasis).toBe('high');
    expect(r.nodes['a12-steak-fajita-bowls']?.emphasis).toBe('dim');
    expect(r.nodes.mushrooms?.emphasis).toBe('dim');
    expect(r.sentence).toMatch(/^Your 5 batches share \d+ ingredients$/);
  });
});

describe('hubs', () => {
  it('sizes ingredients by degree and labels the top 5 perishables', () => {
    const r = lens('hubs', ctx());
    const labelled = Object.entries(r.nodes).filter(([, n]) => n.label);
    expect(labelled).toHaveLength(5);
    expect(labelled.map(([id]) => id)).toContain('lemon');
    expect(labelled.map(([id]) => id)).not.toContain('garlic'); // keeps 30 days: not perishable
    expect(r.nodes.garlic?.size).toBe(22);
    expect(r.nodes['a01-greek-chicken-protein-bowl']?.emphasis).toBe('normal');
    expect(r.sentence).toBe('Lemon, broccoli florets and cherry tomatoes link 6+ recipes each');
  });
});

describe('freshness', () => {
  it('counts shelf life from the start date when nothing is in the fridge', () => {
    const r = lens('freshness', ctx({ today: '2026-11-05' }));
    expect(r.nodes.spinach).toMatchObject({ emphasis: 'high', badge: '2 days' });
    expect(r.nodes.lemon?.badge).toBe('11 days');
    expect(r.nodes['a04-italian-skillet-chicken-tomato-mushroom']?.emphasis).toBe('high');
    expect(r.sentence).toMatch(/turn within 2 days; \d+ recipes can use them$/);
  });

  it('does not flag raw meat that can still be frozen on shopping day', () => {
    const r = lens('freshness', ctx());
    expect(r.nodes['chicken-breast']?.badge).toBe('2 days');
    expect(r.nodes['chicken-breast']?.emphasis).not.toBe('high');
    expect(r.sentence).toBe('Nothing turns within 2 days; avocado goes first, in 4 days');
  });

  it('uses daysLeft for fridge items', () => {
    const c = ctx({
      constraints: { ...defaultConstraints(START), pantry: [{ ingredientId: 'lemon', amount: 2, addedOn: START, daysLeftAtAdd: 2 }] },
    });
    const r = lens('freshness', c);
    expect(r.nodes.lemon?.badge).toBe('2 days');
    expect(r.nodes.lemon?.emphasis).toBe('high');
  });
});

describe('waste', () => {
  it('asks for a solve when there is no waste info', () => {
    expect(lens('waste', ctx({ waste: undefined })).sentence).toBe('Solve a week to see leftovers.');
  });

  it('badges leftovers and draws one ghost edge from the best absorber', () => {
    const r = lens('waste', ctx());
    expect(r.nodes.cilantro).toMatchObject({ emphasis: 'high', badge: '+0.6 packs' });
    expect(r.nodes.lime).toMatchObject({ emphasis: 'high', badge: '+0.3 packs' });
    expect(r.nodes.cucumber?.emphasis).not.toBe('high');
    expect(r.ghostEdges).toEqual([{ from: 'a12-steak-fajita-bowls', to: 'cilantro', label: '−0.6 packs' }]);
    expect(r.sentence).toBe('Swap in Steak Fajita Bowls Thu → −0.6 packs');
  });

  it('says so when nothing is left over', () => {
    expect(lens('waste', ctx({ waste: { leftoverPacks: {} } })).sentence).toBe('Nothing left over: every pack gets used');
  });
});

describe('protein', () => {
  it('sizes recipes by protein and dims those under 30 g', () => {
    const r = lens('protein', ctx());
    expect(r.nodes['b03-tofu-breakfast-burrito']?.emphasis).toBe('dim'); // 25 g
    expect(r.nodes['a03-sheet-pan-chicken-broccoli-sweet-potato']).toMatchObject({ emphasis: 'high', size: 22 }); // 53 g, the most
    expect(r.sentence).toBe('22 of 24 recipes hit ≥ 30 g per serving');
  });

  it('marks a recipe without published protein n/a', () => {
    const recipes = catalog.recipes.map((rc) =>
      rc.id === 'm07-lentil-mushroom-ragu' ? { ...rc, macrosPerServing: { ...rc.macrosPerServing, protein: null } } : rc,
    );
    const c = { ...catalog, recipes, recipeById: new Map(recipes.map((rc) => [rc.id, rc])) };
    expect(lens('protein', ctx({ catalog: c })).nodes['m07-lentil-mushroom-ragu']).toEqual({ emphasis: 'dim', badge: 'n/a' });
  });
});

describe('families', () => {
  it('sets a family on every recipe and names the one the plan sits in', () => {
    const r = lens('families', ctx());
    for (const rc of catalog.recipes) expect(r.nodes[rc.id]?.family).toBeTruthy();
    expect(r.sentence).toMatch(/^Your plan sits mostly in the .+ family \(\d of 5 batches\)$/);
  });

  it('suggests the largest family before a plan exists', () => {
    expect(lens('families', ctx({ plan: null })).sentence).toMatch(/family: plan inside it to waste least$/);
  });
});

describe('formatting', () => {
  it('formats packs with a sign and a true minus', () => {
    expect(formatPacks(1)).toBe('1 pack');
    expect(formatPacks(0.04)).toBe('<0.1 packs');
    expect(signedPacks(-0.6)).toBe('−0.6 packs');
    expect(signedPacks(1.25)).toBe('+1.3 packs');
  });
});
