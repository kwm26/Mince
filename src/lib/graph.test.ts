import { describe, expect, it } from 'vitest';
import { catalog } from './data';
import { buildGraph, degree, families, neighbours, shared, shortIngredientName, shortTitle } from './graph';
import { ing, makeCatalog, rec } from './testCatalog';

// A small fixture: garlic (staple-free here, long life) in 3 recipes, lemon in 2,
// salt is a staple, parsley is a garnish in one recipe and core in none.
const fixture = makeCatalog(
  [
    rec('r1', ['garlic', 'lemon', 'salt', 'spinach', ['parsley', 'garnish']]),
    rec('r2', ['garlic', 'lemon', 'kale']),
    rec('r3', ['garlic', ['spinach', 'optional']]),
    rec('r4', ['tofu']),
  ],
  [
    ing('garlic', 30, { packSize: 10, packUnit: 'clove' }),
    ing('lemon', 14),
    ing('salt', 365, { staple: true }),
    ing('spinach', 5, { packSize: 5, packUnit: 'cup' }),
    ing('kale', 5),
    ing('parsley', 7),
    ing('tofu', 5),
  ],
);

describe('buildGraph', () => {
  it('never includes staples, and single-use ingredients only with includeSingleUse', () => {
    const g = buildGraph(fixture);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).not.toContain('salt');
    expect(ids).not.toContain('kale');
    expect(ids).not.toContain('tofu');
    expect(ids).toEqual(['r1', 'r2', 'r3', 'r4', 'garlic', 'lemon', 'spinach']);

    const all = buildGraph(fixture, { includeSingleUse: true }).nodes.map((n) => n.id);
    expect(all).toContain('kale');
    expect(all).toContain('tofu');
    expect(all).not.toContain('salt');
  });

  it('never counts garnish', () => {
    const all = buildGraph(fixture, { includeSingleUse: true });
    expect(all.nodes.map((n) => n.id)).not.toContain('parsley');
    expect(degree(all, 'parsley')).toBe(0);
  });

  it('weights each edge by the fraction of a pack used', () => {
    const g = buildGraph(fixture);
    expect(g.edges.find((e) => e.recipeId === 'r1' && e.ingredientId === 'garlic')?.weight).toBeCloseTo(0.05);
    expect(g.edges.find((e) => e.recipeId === 'r3' && e.ingredientId === 'spinach')?.weight).toBeCloseTo(0.1);
  });

  it('staples never appear as nodes in the real data', () => {
    const g = buildGraph(catalog, { includeSingleUse: true });
    for (const n of g.nodes) {
      if (n.kind === 'ingredient') expect(catalog.ingredientById.get(n.id)?.staple).not.toBe(true);
    }
  });
});

describe('degree', () => {
  it('matches a hand count in the fixture', () => {
    const g = buildGraph(fixture);
    expect(degree(g, 'garlic')).toBe(3);
    expect(degree(g, 'lemon')).toBe(2);
  });

  it('matches a hand count for garlic and lemon in the real data', () => {
    // Counted by hand from data/recipes.json: core or optional uses, garnish excluded.
    const g = buildGraph(catalog);
    expect(degree(g, 'garlic')).toBe(15);
    expect(degree(g, 'lemon')).toBe(8);
  });
});

describe('neighbours and shared', () => {
  it('lists directly connected nodes', () => {
    const g = buildGraph(fixture);
    expect(neighbours(g, 'garlic')).toEqual(['r1', 'r2', 'r3']);
    expect(neighbours(g, 'r1')).toEqual(['garlic', 'lemon', 'spinach']);
  });

  it('shared(a, b) is symmetric', () => {
    const g = buildGraph(catalog);
    const ids = catalog.recipes.map((r) => r.id);
    for (const a of ids) for (const b of ids) expect(shared(g, a, b)).toEqual(shared(g, b, a));
    expect(shared(buildGraph(fixture), 'r1', 'r2')).toEqual(['garlic', 'lemon']);
  });
});

describe('families', () => {
  it('is deterministic: same input, same families, twice', () => {
    const a = families(buildGraph(catalog), catalog);
    const b = families(buildGraph(catalog), catalog);
    expect(a).toEqual(b);
  });

  it('keeps recipes that share perishables in one family (3-recipe fixture)', () => {
    const three = makeCatalog(
      [rec('a', ['cilantro', 'lime']), rec('b', ['cilantro', 'lime', 'rice']), rec('c', ['lime', 'tofu'])],
      [ing('cilantro', 5), ing('lime', 14), ing('rice', 365), ing('tofu', 5)],
    );
    const f = families(buildGraph(three), three);
    expect(new Set(Object.values(f.byRecipe)).size).toBe(1);
    expect(f.byRecipe.a).toBe('lime–cilantro');
  });

  it('labels families of size 1 "standalone" and names the rest by their top 2 perishables', () => {
    const f = families(buildGraph(fixture), fixture);
    expect(f.byRecipe.r4).toBe('standalone');
    expect(f.byRecipe.r1).toBe(f.byRecipe.r2);
    expect(f.byRecipe.r1).toBe('lemon–spinach');
  });

  it('splits the real data into more than one family', () => {
    const f = families(buildGraph(catalog), catalog);
    expect(f.families.filter((x) => x.recipes.length > 1).length).toBeGreaterThan(1);
    expect(Object.keys(f.byRecipe)).toHaveLength(catalog.recipes.length);
  });
});

describe('names', () => {
  it('shortens titles and ingredient names for labels', () => {
    expect(shortTitle('Greek Turkey Meatballs with Tzatziki')).toBe('Greek Turkey Meatballs');
    expect(shortTitle('High-Protein Breakfast Burrito (Tofu Scramble)')).toBe('High-Protein Breakfast Burrito');
    expect(shortTitle('Steak Fajita Bowls')).toBe('Steak Fajita Bowls');
    expect(shortIngredientName('Cherry/grape tomatoes')).toBe('cherry tomatoes');
    expect(shortIngredientName('Chicken breast, boneless skinless')).toBe('chicken breast');
    expect(shortIngredientName('Mushrooms (baby bella/white)')).toBe('mushrooms');
  });
});
