// Static force layout for the ingredient map (data-model §11 "Layout").
// d3-force runs for exactly 300 ticks from id-hash seeds with a seeded random
// source, so the same graph always gives the same picture. Pure: d3-force has
// no DOM dependency; no React here.

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { BASE_RADIUS, MAX_RADIUS, degree, scaleRadius, type Graph } from './graph';

export const LAYOUT_TICKS = 300;

export interface Point { x: number; y: number; }

export interface Layout {
  width: number;
  height: number;
  positions: Record<string, Point>;
}

export interface LayoutOptions {
  width?: number;                       // default 360: about 1 map unit per CSS px on a 375px phone
  height?: number;                      // default 480
  /** Recipe id → family name. Each family of 2+ gets an anchor its recipes drift toward, so families read as clusters. */
  groups?: Readonly<Record<string, string>>;
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

  // Family anchors on an ellipse, largest family first, starting at the top.
  const groups = options.groups ?? {};
  const sizes = new Map<string, number>();
  for (const n of core) {
    const g = groups[n.id];
    if (g && g !== 'standalone') sizes.set(g, (sizes.get(g) ?? 0) + 1);
  }
  const names = [...sizes.entries()]
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([g]) => g);
  const anchors = new Map<string, Point>();
  names.forEach((g, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / names.length;
    const k = names.length > 1 ? 1 : 0;
    anchors.set(g, { x: cx + Math.cos(a) * width * 0.24 * k, y: cy + Math.sin(a) * height * 0.26 * k });
  });
  const anchorOf = (id: string) => {
    const g = groups[id];
    return g ? anchors.get(g) : undefined;
  };

  const seedRadius = Math.min(width, height) * 0.4;
  const nodes: SimNode[] = core.map((n) => {
    const h = hashId(n.id);
    const angle = ((h & 0xffff) / 0x10000) * 2 * Math.PI;
    const anchor = anchorOf(n.id);
    const dist = Math.sqrt((h >>> 16) / 0x10000) * (anchor ? seedRadius / 3 : seedRadius);
    const origin = anchor ?? { x: cx, y: cy };
    const r = n.kind === 'recipe' ? MAX_RADIUS : scaleRadius(degree(graph, n.id), minDeg, maxDeg);
    return { id: n.id, r: r + 5, x: origin.x + Math.cos(angle) * dist, y: origin.y + Math.sin(angle) * dist };
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
    .force('charge', forceManyBody<SimNode>().strength(-150).distanceMax(260))
    .force('x', forceX<SimNode>((d) => anchorOf(d.id)?.x ?? cx).strength((d) => (anchorOf(d.id) ? 0.14 : 0.05)))
    .force('y', forceY<SimNode>((d) => anchorOf(d.id)?.y ?? cy).strength((d) => (anchorOf(d.id) ? 0.12 : 0.03)))
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

// ── Labels ──

export interface Box { x: number; y: number; w: number; h: number; }

export interface LabelRequest {
  id: string;
  x: number;                            // node centre
  y: number;
  r: number;                            // drawn radius
  text: string;
  force?: boolean;                      // always place (the selected node), even over another label
  charW?: number;                       // glyph advance; default fits 12px bold sans
  sides?: ('below' | 'above' | 'right' | 'left')[];  // tried in this order; default below, above, right, left
}

export interface PlacedLabel { id: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; }

const LABEL_CHAR_W = 6.6;               // approximate advance of a 12px bold sans character
const LABEL_H = 14;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Greedy label placement in request order: below, above, right, then left of
 * the node, skipping a label that would overlap one already placed (or an
 * obstacle such as a badge). Skipped labels stay in the text list.
 */
export function placeLabels(requests: readonly LabelRequest[], width: number, height: number, obstacles: readonly Box[] = []): PlacedLabel[] {
  const taken: Box[] = [...obstacles];
  const out: PlacedLabel[] = [];
  for (const q of requests) {
    const w = q.text.length * (q.charW ?? LABEL_CHAR_W);
    const midX = Math.min(width - w / 2 - 2, Math.max(w / 2 + 2, q.x));
    const at: Record<'below' | 'above' | 'right' | 'left', PlacedLabel> = {
      below: { id: q.id, x: midX, y: q.y + q.r + 13, anchor: 'middle' },
      above: { id: q.id, x: midX, y: q.y - q.r - 5, anchor: 'middle' },
      right: { id: q.id, x: q.x + q.r + 4, y: q.y + 4, anchor: 'start' },
      left: { id: q.id, x: q.x - q.r - 4, y: q.y + 4, anchor: 'end' },
    };
    const candidates = (q.sides ?? ['below', 'above', 'right', 'left']).map((s) => at[s]);
    const boxOf = (c: PlacedLabel): Box => ({
      x: c.anchor === 'middle' ? c.x - w / 2 : c.anchor === 'start' ? c.x : c.x - w,
      y: c.y - LABEL_H + 3,
      w,
      h: LABEL_H,
    });
    const inside = (b: Box) => b.x >= 0 && b.x + b.w <= width && b.y >= 0 && b.y + b.h <= height;
    const fit = candidates.find((c) => {
      const b = boxOf(c);
      return inside(b) && !taken.some((t) => overlaps(b, t));
    });
    const chosen = fit ?? (q.force ? candidates[0] : undefined);
    if (!chosen) continue;
    taken.push(boxOf(chosen));
    out.push(chosen);
  }
  return out;
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
