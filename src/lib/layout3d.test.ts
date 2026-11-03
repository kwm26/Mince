import { describe, expect, it } from 'vitest';
import { catalog } from './data';
import { buildGraph } from './graph';
import { computeLayout } from './layout';
import { computeLayout3D } from './layout3d';
import { mapData } from './lenses';

describe('computeLayout3D', () => {
  const graph = buildGraph(catalog, { includeSingleUse: true });
  const { families } = mapData(catalog);
  const layout = computeLayout(graph, { groups: families.byRecipe });
  const opts = { groups: families.byRecipe, categoryOf: (id: string) => catalog.ingredientById.get(id)?.category };
  const l3 = computeLayout3D(graph, layout, opts);

  it('is deterministic: same data, same picture', () => {
    const again = computeLayout3D(buildGraph(catalog, { includeSingleUse: true }), computeLayout(graph, { groups: families.byRecipe }), opts);
    expect(again).toEqual(l3);
  });

  it('places every node at a finite point and frames them all', () => {
    expect(Object.keys(l3.positions).sort()).toEqual(Object.keys(layout.positions).sort());
    for (const p of Object.values(l3.positions)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(Math.hypot(p.x, p.y, p.z)).toBeLessThanOrEqual(l3.radius + 1e-9);
    }
  });

  it('keeps x/y from the 2D layout, centred with y up', () => {
    const [id, p] = Object.entries(layout.positions)[0]!;
    expect(l3.positions[id]!.x).toBeCloseTo(p.x - layout.width / 2);
    expect(l3.positions[id]!.y).toBeCloseTo(layout.height / 2 - p.y);
  });

  it('clusters each family in depth: members sit closer to each other than to other families', () => {
    const real = families.families.filter((f) => f.recipes.length >= 2);
    expect(real.length).toBeGreaterThan(1);
    const meanZ = (ids: string[]) => ids.reduce((a, r) => a + l3.positions[r]!.z, 0) / ids.length;
    const centres = real.map((f) => meanZ(f.recipes));
    for (let i = 0; i < real.length; i++) {
      const spread = Math.max(...real[i]!.recipes.map((r) => Math.abs(l3.positions[r]!.z - centres[i]!)));
      const nearest = Math.min(...centres.filter((_, j) => j !== i).map((c) => Math.abs(c - centres[i]!)));
      expect(spread).toBeLessThan(nearest / 2);
    }
  });
});
