import { describe, expect, it } from 'vitest';
import { catalog } from './data';
import { buildGraph, scaleRadius } from './graph';
import { computeLayout, convexHull, hashId, paddedHull } from './layout';

describe('computeLayout', () => {
  const graph = buildGraph(catalog, { includeSingleUse: true });

  it('is deterministic: same graph, same positions', () => {
    expect(computeLayout(graph)).toEqual(computeLayout(buildGraph(catalog, { includeSingleUse: true })));
  });

  it('positions every node inside the view box', () => {
    const layout = computeLayout(graph);
    for (const n of graph.nodes) {
      const p = layout.positions[n.id];
      expect(p, n.id).toBeDefined();
      expect(p!.x).toBeGreaterThanOrEqual(0);
      expect(p!.x).toBeLessThanOrEqual(layout.width);
      expect(p!.y).toBeGreaterThanOrEqual(0);
      expect(p!.y).toBeLessThanOrEqual(layout.height);
    }
  });

  it('places shared nodes the same whether or not single-use ingredients are included', () => {
    const withLeaves = computeLayout(graph).positions;
    const without = computeLayout(buildGraph(catalog)).positions;
    for (const [id, p] of Object.entries(without)) expect(withLeaves[id]).toEqual(p);
  });

  it('keeps recipe nodes from overlapping', () => {
    const layout = computeLayout(graph);
    const recipes = graph.nodes.filter((n) => n.kind === 'recipe').map((n) => layout.positions[n.id]!);
    for (let i = 0; i < recipes.length; i++)
      for (let j = i + 1; j < recipes.length; j++)
        expect(Math.hypot(recipes[i]!.x - recipes[j]!.x, recipes[i]!.y - recipes[j]!.y)).toBeGreaterThan(2 * 17);
  });
});

describe('helpers', () => {
  it('hashId is stable', () => {
    expect(hashId('garlic')).toBe(hashId('garlic'));
    expect(hashId('garlic')).not.toBe(hashId('lemon'));
  });

  it('scaleRadius maps into 8–22', () => {
    expect(scaleRadius(2, 2, 15)).toBe(8);
    expect(scaleRadius(15, 2, 15)).toBe(22);
    expect(scaleRadius(5, 5, 5)).toBe(15);
  });

  it('convexHull drops interior points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 1, y: 1 });
    expect(paddedHull([{ x: 10, y: 10 }], 5)?.top.y).toBeCloseTo(5);
  });
});
