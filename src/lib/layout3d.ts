// Deterministic 3D layout for the ingredient map's 3D view (design-spec §11 "2D / 3D").
// Reuses the 2D force layout for x/y, so both views tell the same story, and adds
// depth by family: each family of 2+ recipes gets its own z plane, ingredients sit
// at the mean depth of the recipes that use them, nudged by category. Pure: no
// React, no three, no randomness beyond id hashes. Same data → same picture.

import type { Category } from '../types';
import type { Graph } from './graph';
import { hashId, type Layout } from './layout';
import { CATEGORIES } from './labels';

export interface Point3 { x: number; y: number; z: number; }

export interface Layout3D {
  /** Centred on the origin; y points up. */
  positions: Record<string, Point3>;
  /** Largest distance of any node from the origin, for framing the camera. */
  radius: number;
}

export interface Layout3DOptions {
  /** Recipe id → family name ('standalone' or absent = no family). */
  groups?: Readonly<Record<string, string>>;
  /** Ingredient id → category, for the small per-category depth offset. */
  categoryOf?: (ingredientId: string) => Category | undefined;
  /** Distance between family planes, in map units (default 70). */
  spacing?: number;
}

/** Stable value in [-1, 1) from an id. */
function jitter(id: string, salt: number): number {
  return ((hashId(`${salt}:${id}`) % 2000) / 1000) - 1;
}

export function computeLayout3D(graph: Graph, layout: Layout, options: Layout3DOptions = {}): Layout3D {
  const groups = options.groups ?? {};
  const spacing = options.spacing ?? 70;
  const cx = layout.width / 2;
  const cy = layout.height / 2;

  const names = [...new Set(Object.values(groups).filter((g) => g && g !== 'standalone'))].sort();
  const planeOf = new Map(names.map((n, i) => [n, (i - (names.length - 1) / 2) * spacing]));

  const z = new Map<string, number>();
  for (const n of graph.nodes) {
    if (n.kind !== 'recipe') continue;
    const fam = groups[n.id];
    const plane = fam !== undefined ? planeOf.get(fam) : undefined;
    // Family members share a plane (± a little so spheres don't stack); standalones float near the middle.
    z.set(n.id, plane !== undefined ? plane + jitter(n.id, 1) * spacing * 0.12 : jitter(n.id, 2) * spacing * 0.6);
  }
  for (const n of graph.nodes) {
    if (n.kind === 'recipe') continue;
    const users = graph.ingredientRecipes.get(n.id) ?? [];
    const zs = users.flatMap((r) => (z.has(r) ? [z.get(r)!] : []));
    const mean = zs.length > 0 ? zs.reduce((a, b) => a + b, 0) / zs.length : 0;
    const cat = options.categoryOf?.(n.id);
    const ci = cat ? CATEGORIES.indexOf(cat) : -1;
    const catOffset = ci >= 0 ? (ci - (CATEGORIES.length - 1) / 2) * spacing * 0.04 : 0;
    z.set(n.id, mean + catOffset + jitter(n.id, 3) * spacing * 0.08);
  }

  const positions: Record<string, Point3> = {};
  let radius = 1;
  for (const [id, p] of Object.entries(layout.positions)) {
    const q = { x: p.x - cx, y: cy - p.y, z: z.get(id) ?? 0 };
    positions[id] = q;
    radius = Math.max(radius, Math.hypot(q.x, q.y, q.z));
  }
  return { positions, radius };
}
