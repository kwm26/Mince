// Shared-ingredient graph and families (data-model §11). Pure: no React, no d3.
//
// Nodes are recipes and non-staple ingredients; an edge recipe → ingredient
// exists for every core or optional use (garnish is never counted, §3).

import type { Catalog, Recipe } from '../types';
import { isPerishable } from './kitchen';

export type NodeKind = 'recipe' | 'ingredient';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
}

export interface GraphEdge {
  recipeId: string;
  ingredientId: string;
  weight: number;                       // qty / packSize: the fraction of a pack the recipe uses
}

export interface Graph {
  nodes: GraphNode[];                   // recipes first (id order), then ingredients (id order)
  edges: GraphEdge[];                   // only between nodes in `nodes`
  /** Every non-staple core/optional ingredient of each recipe, including single-use ones. */
  recipeIngredients: ReadonlyMap<string, readonly string[]>;
  /** Every recipe using each non-staple ingredient (core/optional), even when the node is omitted. */
  ingredientRecipes: ReadonlyMap<string, readonly string[]>;
  adjacency: ReadonlyMap<string, readonly string[]>;
}

export interface GraphOptions {
  includeSingleUse?: boolean;           // default false
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Non-staple core/optional uses of a recipe, merged per ingredient (qty summed). */
function uses(recipe: Recipe, catalog: Catalog): Map<string, number> {
  const out = new Map<string, number>();
  for (const ri of recipe.ingredients) {
    if (ri.role === 'garnish') continue;
    const ing = catalog.ingredientById.get(ri.ingredientId);
    if (!ing || ing.staple) continue;
    out.set(ing.id, (out.get(ing.id) ?? 0) + ri.qty);
  }
  return out;
}

export function buildGraph(catalog: Catalog, options: GraphOptions = {}): Graph {
  const includeSingleUse = options.includeSingleUse ?? false;
  const recipes = [...catalog.recipes].sort((a, b) => byId(a.id, b.id));

  const recipeIngredients = new Map<string, string[]>();
  const ingredientRecipes = new Map<string, string[]>();
  const qtyByPair: { recipeId: string; ingredientId: string; qty: number }[] = [];

  for (const r of recipes) {
    const u = uses(r, catalog);
    const ids = [...u.keys()].sort(byId);
    recipeIngredients.set(r.id, ids);
    for (const id of ids) {
      const list = ingredientRecipes.get(id) ?? [];
      list.push(r.id);
      ingredientRecipes.set(id, list);
      qtyByPair.push({ recipeId: r.id, ingredientId: id, qty: u.get(id) ?? 0 });
    }
  }

  const keptIngredients = [...ingredientRecipes.entries()]
    .filter(([, rs]) => includeSingleUse || rs.length >= 2)
    .map(([id]) => id)
    .sort(byId);
  const kept = new Set(keptIngredients);

  const nodes: GraphNode[] = [
    ...recipes.map((r) => ({ id: r.id, kind: 'recipe' as const, name: r.title })),
    ...keptIngredients.map((id) => ({
      id,
      kind: 'ingredient' as const,
      name: catalog.ingredientById.get(id)?.name ?? id,
    })),
  ];

  const edges: GraphEdge[] = qtyByPair
    .filter((p) => kept.has(p.ingredientId))
    .map((p) => {
      const packSize = catalog.ingredientById.get(p.ingredientId)?.packSize ?? 1;
      return { recipeId: p.recipeId, ingredientId: p.ingredientId, weight: packSize > 0 ? p.qty / packSize : 0 };
    });

  const adjacency = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adjacency.get(e.recipeId)?.push(e.ingredientId);
    adjacency.get(e.ingredientId)?.push(e.recipeId);
  }
  for (const list of adjacency.values()) list.sort(byId);

  return { nodes, edges, recipeIngredients, ingredientRecipes, adjacency };
}

/** Number of distinct recipes using the ingredient (core or optional). */
export function degree(graph: Graph, ingredientId: string): number {
  return graph.ingredientRecipes.get(ingredientId)?.length ?? 0;
}

/** Directly connected node ids, in id order. */
export function neighbours(graph: Graph, nodeId: string): string[] {
  return [...(graph.adjacency.get(nodeId) ?? [])];
}

/** Non-staple ingredient ids used (core or optional) by both recipes, in id order. */
export function shared(graph: Graph, recipeA: string, recipeB: string): string[] {
  const b = new Set(graph.recipeIngredients.get(recipeB) ?? []);
  return (graph.recipeIngredients.get(recipeA) ?? []).filter((id) => b.has(id));
}

// ── Families (label propagation) ──

export interface Family {
  id: string;                           // the label: the smallest-id seed recipe that won
  name: string;                         // "lemon–spinach", or "standalone" for size 1
  recipes: string[];                    // id order
  perishables: string[];                // shared within the family, by within-family degree (desc), then id
}

export interface Families {
  families: Family[];                   // largest first, then by name
  byRecipe: Record<string, string>;     // recipe id → family name
}

const PROPER_FIRST_WORDS = new Set(['greek', 'kalamata', 'puy']);

/**
 * Short ingredient name for use mid-sentence: "Baby spinach" → "baby spinach",
 * "Cherry/grape tomatoes" → "cherry tomatoes", "Greek yogurt, plain" → "Greek yogurt".
 */
export function shortIngredientName(name: string): string {
  const base = (name.split(',')[0] ?? name).replace(/\s*\(.*?\)/g, '').split(' / ')[0] ?? name;
  const lower = base.replace(/(\w+)\/\w+/g, '$1').trim().toLowerCase();
  const first = lower.split(' ')[0] ?? '';
  return PROPER_FIRST_WORDS.has(first) ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

/**
 * Deterministic label propagation on the recipe–recipe projection, where the
 * edge weight is the number of shared perishable ingredients (data-model §11).
 * Nodes are visited in id order, at most 20 passes; ties go to the smallest label.
 *
 * Deviation, pending sign-off: each candidate label's score is penalised by the
 * modularity term k_i · K_l / 2m (LPAm, Barber & Clark 2009), where k_i is the
 * node's weighted degree and K_l the total weighted degree already carrying label
 * l. Plain label propagation lets lemon and Greek yogurt chain all 24 real
 * recipes into a single family, so the lens would say nothing; with the penalty
 * the real data splits into 4 families and the small fixtures behave as before.
 */
export function families(graph: Graph, catalog: Catalog): Families {
  const recipeIds = graph.nodes.filter((n) => n.kind === 'recipe').map((n) => n.id);
  const perishablesOf = new Map<string, Set<string>>();
  for (const id of recipeIds) {
    const ps = (graph.recipeIngredients.get(id) ?? []).filter((i) => {
      const ing = catalog.ingredientById.get(i);
      return ing !== undefined && isPerishable(ing);
    });
    perishablesOf.set(id, new Set(ps));
  }

  const weights = new Map<string, Map<string, number>>();
  for (const a of recipeIds) {
    const row = new Map<string, number>();
    const pa = perishablesOf.get(a) ?? new Set<string>();
    for (const b of recipeIds) {
      if (a === b) continue;
      let w = 0;
      for (const i of perishablesOf.get(b) ?? []) if (pa.has(i)) w++;
      if (w > 0) row.set(b, w);
    }
    weights.set(a, row);
  }

  const k = new Map<string, number>();
  for (const id of recipeIds) {
    let sum = 0;
    for (const w of weights.get(id)?.values() ?? []) sum += w;
    k.set(id, sum);
  }
  let twoM = 0;
  for (const v of k.values()) twoM += v;

  const label = new Map<string, string>(recipeIds.map((id) => [id, id]));
  const labelDegree = new Map<string, number>(recipeIds.map((id) => [id, k.get(id) ?? 0]));
  for (let pass = 0; pass < 20 && twoM > 0; pass++) {
    let changed = false;
    for (const id of recipeIds) {
      const ki = k.get(id) ?? 0;
      if (ki === 0) continue;
      const current = label.get(id) ?? id;
      const links = new Map<string, number>([[current, 0]]);
      for (const [nb, w] of weights.get(id) ?? []) {
        const l = label.get(nb) ?? nb;
        links.set(l, (links.get(l) ?? 0) + w);
      }
      let best = '';
      let bestScore = -Infinity;
      for (const [l, w] of links) {
        const others = (labelDegree.get(l) ?? 0) - (l === current ? ki : 0);
        const s = w - (ki * others) / twoM;
        if (s > bestScore + 1e-9 || (Math.abs(s - bestScore) <= 1e-9 && l < best)) {
          best = l;
          bestScore = s;
        }
      }
      if (best !== current) {
        label.set(id, best);
        labelDegree.set(current, (labelDegree.get(current) ?? 0) - ki);
        labelDegree.set(best, (labelDegree.get(best) ?? 0) + ki);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const groups = new Map<string, string[]>();
  for (const id of recipeIds) {
    const l = label.get(id) ?? id;
    const g = groups.get(l) ?? [];
    g.push(id);
    groups.set(l, g);
  }

  const list: Family[] = [];
  for (const [id, members] of groups) {
    const counts = new Map<string, number>();
    for (const r of members) for (const i of perishablesOf.get(r) ?? []) counts.set(i, (counts.get(i) ?? 0) + 1);
    const perishables = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))
      .map(([i]) => i);
    let name = 'standalone';
    if (members.length >= 2) {
      const top = perishables.slice(0, 2).map((i) => shortIngredientName(catalog.ingredientById.get(i)?.name ?? i));
      name = top.length > 0 ? top.join('–') : 'standalone';
    }
    list.push({ id, name, recipes: members, perishables });
  }

  // Two families can share a top-2 name; keep names unique so hulls never merge.
  const seen = new Map<string, number>();
  list.sort((a, b) => b.recipes.length - a.recipes.length || byId(a.id, b.id));
  for (const f of list) {
    if (f.name === 'standalone') continue;
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    if (n > 1) {
      const third = f.perishables[2];
      f.name = third ? `${f.name}–${shortIngredientName(catalog.ingredientById.get(third)?.name ?? third)}` : `${f.name} ${n}`;
    }
  }

  const byRecipe: Record<string, string> = {};
  for (const f of list) for (const r of f.recipes) byRecipe[r] = f.name;
  return { families: list, byRecipe };
}

// ── Node sizes ──

/** Base radii from design-spec §5. Lens sizes scale these with transform: scale(). */
export const BASE_RADIUS = { recipe: 17, shared: 10, single: 8 } as const;
/** Lens size range (design-spec §11). */
export const MIN_RADIUS = 8;
export const MAX_RADIUS = 22;

/** Linear radius in [8, 22] for a value in [min, max]; the midpoint when min = max. */
export function scaleRadius(value: number, min: number, max: number): number {
  if (max <= min) return (MIN_RADIUS + MAX_RADIUS) / 2;
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

// ── Display names ──

/** Full display name of a node: recipe title or ingredient name. Lens lists always use this. */
export function nodeName(catalog: Catalog, id: string): string {
  return catalog.recipeById.get(id)?.title ?? catalog.ingredientById.get(id)?.name ?? id;
}

/** A shorter recipe title for map labels and sentences: drops "(…)", then anything after " with " or a comma. */
export function shortTitle(title: string): string {
  const noParens = title.replace(/\s*\(.*?\)/g, '').trim();
  const cut = (noParens.split(/\s+with\s+|,\s*/i)[0] ?? noParens).trim();
  return cut.split(/\s+/).length >= 2 ? cut : noParens;
}
