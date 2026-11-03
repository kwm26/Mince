// Static force layout for the ingredient map (data-model §11 "Layout").
// d3-force runs for exactly 300 ticks from id-hash seeds with a seeded random
// source, so the same graph always gives the same picture. Pure: d3-force has
// no DOM dependency; no React here.

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { degree, type Graph } from './graph';

export const LAYOUT_TICKS = 300;

/** Base radii from design-spec §5. Lens sizes scale these with transform: scale(). */
export const BASE_RADIUS = { recipe: 17, shared: 10, single: 8 } as const;
/** Lens size range (design-spec §11). */
export const MIN_RADIUS = 8;
export const MAX_RADIUS = 22;

export interface Point { x: number; y: number; }

export interface Layout {
  width: number;
  height: number;
  positions: Record<string, Point>;
}

export interface LayoutOptions {
  width?: number;                       // default 360: about 1 map unit per CSS px on a 375px phone
  height?: number;                      // default 480
}

/** Linear radius in [8, 22] for a value in [min, max]; the midpoint when min = max. */
export function scaleRadius(value: number, min: number, max: number): number {
  if (max <= min) return (MIN_RADIUS + MAX_RADIUS) / 2;
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

/** FNV-1a, 32-bit: a stable hash of a node id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded linear congruential generator in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;                            // collision radius: the largest a lens can draw it, plus a gap
}

/**
 * Positions for every node of `graph`. Recipes and shared ingredients go through
 * the simulation; single-use ingredients (when the graph includes them) are then
 * placed beside their one recipe, so showing them never moves anything else.
 */
export function computeLayout(graph: Graph, options: LayoutOptions = {}): Layout {
  const width = options.width ?? 360;
  const height = options.height ?? 480;
  const cx = width / 2;
  const cy = height / 2;

  const isLeaf = (id: string, kind: string) => kind === 'ingredient' && degree(graph, id) < 2;
  const core = graph.nodes.filter((n) => !isLeaf(n.id, n.kind));
  const leaves = graph.nodes.filter((n) => isLeaf(n.id, n.kind));

  const degrees = core.filter((n) => n.kind === 'ingredient').map((n) => degree(graph, n.id));
  const minDeg = Math.min(...degrees, 2);
  const maxDeg = Math.max(...degrees, 2);

  const seedRadius = Math.min(width, height) * 0.4;
  const nodes: SimNode[] = core.map((n) => {
    const h = hashId(n.id);
    const angle = ((h & 0xffff) / 0x10000) * 2 * Math.PI;
    const dist = Math.sqrt((h >>> 16) / 0x10000) * seedRadius;
    const r = n.kind === 'recipe' ? MAX_RADIUS : scaleRadius(degree(graph, n.id), minDeg, maxDeg);
    return { id: n.id, r: r + 5, x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  });
  const coreIds = new Set(nodes.map((n) => n.id));
  const links: SimulationLinkDatum<SimNode>[] = graph.edges
    .filter((e) => coreIds.has(e.recipeId) && coreIds.has(e.ingredientId))
    .map((e) => ({ source: e.recipeId, target: e.ingredientId }));

  const margin = { x: 6, top: 26, bottom: 22 };          // room for hull and node labels
  const clamp = (n: SimNode) => {
    n.x = Math.min(width - margin.x - n.r, Math.max(margin.x + n.r, n.x ?? cx));
    n.y = Math.min(height - margin.bottom - n.r, Math.max(margin.top + n.r, n.y ?? cy));
  };

  const sim = forceSimulation<SimNode>(nodes)
    .randomSource(lcg(0x5eed))
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(46).strength(0.25))
    .force('charge', forceManyBody<SimNode>().strength(-90).distanceMax(220))
    .force('x', forceX<SimNode>(cx).strength(0.07))
    .force('y', forceY<SimNode>(cy).strength(0.05))
    .force('collide', forceCollide<SimNode>((d) => d.r).iterations(2))
    .stop();
  for (let i = 0; i < LAYOUT_TICKS; i++) {
    sim.tick();
    nodes.forEach(clamp);
  }

  const positions: Record<string, Point> = {};
  for (const n of nodes) positions[n.id] = { x: round(n.x ?? cx), y: round(n.y ?? cy) };

  // Single-use ingredients: the free spot beside their recipe, tried at 16 angles.
  const placed = nodes.map((n) => ({ x: n.x ?? cx, y: n.y ?? cy, r: n.r }));
  for (const leaf of leaves) {
    const parentId = graph.ingredientRecipes.get(leaf.id)?.[0];
    const parent = parentId ? positions[parentId] : undefined;
    if (!parent) continue;
    const start = ((hashId(leaf.id) & 0xffff) / 0x10000) * 2 * Math.PI;
    let best: Point = parent;
    let bestClearance = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = start + (k * Math.PI) / 8;
      const p = {
        x: Math.min(width - margin.x - 10, Math.max(margin.x + 10, parent.x + Math.cos(a) * 36)),
        y: Math.min(height - margin.bottom - 10, Math.max(margin.top + 10, parent.y + Math.sin(a) * 36)),
      };
      let clearance = Infinity;
      for (const q of placed) clearance = Math.min(clearance, Math.hypot(p.x - q.x, p.y - q.y) - q.r);
      if (clearance > bestClearance + 1e-9) {
        best = p;
        bestClearance = clearance;
      }
    }
    positions[leaf.id] = { x: round(best.x), y: round(best.y) };
    placed.push({ x: best.x, y: best.y, r: BASE_RADIUS.single + 4 });
  }

  return { width, height, positions };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Family hulls ──

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeated end point. */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** A hull around circles of radius `pad` at each point, as an SVG path, plus its top-centre for the label. */
export function paddedHull(points: readonly Point[], pad: number): { path: string; top: Point } | null {
  if (points.length === 0) return null;
  const ring: Point[] = [];
  for (const p of points) {
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      ring.push({ x: p.x + Math.cos(a) * pad, y: p.y + Math.sin(a) * pad });
    }
  }
  const hull = convexHull(ring);
  const path = hull.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join('') + 'Z';
  let top = hull[0]!;
  for (const p of hull) if (p.y < top.y) top = p;
  return { path, top: { x: round(top.x), y: round(top.y) } };
}
