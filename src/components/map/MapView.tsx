import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LensContext, LensName, Preview } from '../../types';
import { BASE_RADIUS, buildGraph, degree, neighbours, shared } from '../../lib/graph';
import { computeLayout, paddedHull, placeLabels, type LabelRequest } from '../../lib/layout';
import { LENSES, displayName, lens, mapData, mapLabel } from '../../lib/lenses';
import { ChoiceChips } from '../ChoiceChips';
import { EmptyState } from '../EmptyState';
import { BADGE_H, HULL_CHAR_W, MapCanvas, textWidth, type CanvasEdge, type CanvasGhost, type CanvasHull, type CanvasNode, type Emphasis, type NodeKind } from './MapCanvas';
import { MapLegend, type LegendFlags } from './MapLegend';
import { NodeSheet } from './NodeSheet';
import { useViewBox } from './useViewBox';
import '../../styles/map.css';

export interface MapViewProps {
  ctx: LensContext;
  /** Steer preview for adding a recipe on a day (resolved as a swap, data-model §7). Hides "Add to plan" when absent. */
  previewAdd?: (recipeId: string, day: number) => Preview | null;
  onAddToPlan?: (recipeId: string, day: number) => void;
}

const RANK: Record<Emphasis, number> = { dim: 0, normal: 1, high: 2 };

const BADGE_MEANING: Partial<Record<LensName, string>> = {
  freshness: 'Days left',
  waste: 'Packs left over after this plan',
  protein: 'n/a: protein not published',
};

const SIZE_MEANING: Partial<Record<LensName, string>> = {
  hubs: 'Bigger: used by more recipes',
  protein: 'Bigger: more protein per serving',
};

/**
 * The ingredient map: recipes and ingredients as one graph, read through six
 * lenses (data-model §11, design-spec §11). The key sentence is the insight,
 * the map is the evidence, the text list below is the complete equivalent.
 */
export function MapView({ ctx, previewAdd, onAddToPlan }: MapViewProps) {
  const hasPlan = ctx.plan !== null;
  const [lensName, setLensName] = useState<LensName>(hasPlan ? 'week' : 'hubs');
  const userChose = useRef(false);
  useEffect(() => {
    if (!userChose.current) setLensName(hasPlan ? 'week' : 'hubs');
  }, [hasPlan]);

  const [selection, setSelection] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const headingId = useId();

  const { catalog } = ctx;
  const full = useMemo(() => buildGraph(catalog, { includeSingleUse: true }), [catalog]);
  const { graph: sharedGraph, families } = mapData(catalog);
  const layout = useMemo(() => computeLayout(full, { groups: families.byRecipe }), [full, families]);
  const result = useMemo(
    () => lens(lensName, ctx),
    // Only the parts of ctx a lens reads, so a new ctx object with the same data reuses the result.
    [lensName, ctx.catalog, ctx.constraints, ctx.plan, ctx.today, ctx.waste],
  );
  const info = LENSES.find((l) => l.name === lensName) ?? LENSES[0]!;
  const zoom = useViewBox(layout.width, layout.height);

  // What is on the map: shared nodes, whatever the lens adds, and a selected recipe's own ingredients.
  const visible = useMemo(() => {
    const ids = new Set(sharedGraph.nodes.map((n) => n.id));
    for (const id of Object.keys(result.nodes)) if (layout.positions[id]) ids.add(id);
    for (const g of result.ghostEdges ?? []) {
      ids.add(g.from);
      ids.add(g.to);
    }
    for (const id of selection) {
      ids.add(id);
      for (const i of full.recipeIngredients.get(id) ?? []) ids.add(i);
    }
    return ids;
  }, [sharedGraph, result, layout, selection, full]);

  const focus = useMemo(() => {
    const [a, b] = selection;
    if (!a) return null;
    if (b) return new Set([a, b, ...shared(full, a, b)]);
    return new Set([a, ...neighbours(full, a).filter((n) => visible.has(n))]);
  }, [selection, full, visible]);

  const canvas = useMemo(() => {
    const emphasisOf = (id: string): Emphasis => (focus ? (focus.has(id) ? 'high' : 'dim') : result.nodes[id]?.emphasis ?? 'normal');
    const nodes: CanvasNode[] = [];
    const labelText = new Map<string, string>();
    for (const id of visible) {
      const p = layout.positions[id];
      if (!p) continue;
      const isRecipe = catalog.recipeById.has(id);
      const kind: NodeKind = isRecipe ? 'recipe' : degree(full, id) >= 2 ? 'shared' : 'single';
      const base = kind === 'recipe' ? BASE_RADIUS.recipe : kind === 'shared' ? BASE_RADIUS.shared : BASE_RADIUS.single;
      const ln = result.nodes[id];
      const emphasis = emphasisOf(id);
      const radius = ln?.size ?? base;
      const text = emphasis === 'dim' ? undefined : focus ? (focus.has(id) ? mapLabel(catalog, id) : undefined) : ln?.label;
      if (text) labelText.set(id, text);
      let badge: CanvasNode['badge'];
      if (emphasis !== 'dim' && ln?.badge) {
        const w = textWidth(ln.badge) + 12;
        badge = {
          text: ln.badge,
          w,
          x: Math.min(layout.width - w - 1, p.x + radius * 0.6),
          y: Math.max(1, p.y - radius * 0.6 - BADGE_H),
        };
      }
      nodes.push({ id, kind, x: p.x, y: p.y, base, radius, emphasis, selected: selection.includes(id), badge });
    }
    nodes.sort((a, b) => RANK[a.emphasis] - RANK[b.emphasis] || Number(a.selected) - Number(b.selected));

    const hulls: CanvasHull[] =
      lensName !== 'families'
        ? []
        : families.families.flatMap((f) => {
            if (f.recipes.length < 2) return [];
            const pts = f.recipes.flatMap((r) => (layout.positions[r] ? [layout.positions[r]!] : []));
            const hull = paddedHull(pts, BASE_RADIUS.recipe + 8);
            if (!hull) return [];
            const highlighted = f.recipes.some((r) => emphasisOf(r) === 'high');
            return [{ name: f.name, path: hull.path, top: hull.top, highlighted }];
          });

    // Labels: family names first, then the selected node (always shown), then high, then normal.
    // A label that would collide is dropped; the text list still carries it.
    const hullRequests: LabelRequest[] = hulls.map((h) => ({
      id: `hull:${h.name}`,
      x: h.top.x,
      y: h.top.y,
      r: 0,
      text: h.name,
      charW: HULL_CHAR_W,
      sides: ['above', 'below'],
    }));
    const nodeRequests: LabelRequest[] = [...nodes]
      .filter((n) => labelText.has(n.id))
      .sort((a, b) => Number(b.selected) - Number(a.selected) || RANK[b.emphasis] - RANK[a.emphasis] || b.radius - a.radius)
      .map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.radius, text: labelText.get(n.id) ?? '', force: n.selected }));
    const badgeBoxes = nodes.flatMap((n) => (n.badge ? [{ x: n.badge.x, y: n.badge.y, w: n.badge.w, h: BADGE_H }] : []));
    const placed = new Map(
      placeLabels([...hullRequests, ...nodeRequests], layout.width, layout.height, badgeBoxes).map((l) => [l.id, l]),
    );
    for (const n of nodes) {
      const l = placed.get(n.id);
      if (l) n.label = { text: labelText.get(n.id) ?? '', x: l.x, y: l.y, anchor: l.anchor };
    }
    for (const h of hulls) {
      const l = placed.get(`hull:${h.name}`);
      if (l) h.label = { x: l.x, y: l.y };
    }

    const em = new Map(nodes.map((n) => [n.id, n.emphasis]));
    const edges: CanvasEdge[] = [];
    for (const e of full.edges) {
      const a = em.get(e.recipeId);
      const b = em.get(e.ingredientId);
      if (!a || !b) continue;
      const p = layout.positions[e.recipeId]!;
      const q = layout.positions[e.ingredientId]!;
      const emphasis: Emphasis = a === 'dim' || b === 'dim' ? 'dim' : a === 'high' && b === 'high' ? 'high' : 'normal';
      edges.push({
        id: `${e.recipeId}>${e.ingredientId}`,
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        toSingle: degree(full, e.ingredientId) < 2,
        emphasis,
      });
    }
    edges.sort((x, y) => RANK[x.emphasis] - RANK[y.emphasis]);

    const ghosts: CanvasGhost[] = (focus ? [] : result.ghostEdges ?? []).flatMap((g) => {
      const p = layout.positions[g.from];
      const q = layout.positions[g.to];
      return p && q ? [{ id: `${g.from}~${g.to}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y, label: g.label }] : [];
    });

    return { nodes, edges, ghosts, hulls };
  }, [visible, layout, catalog, full, result, focus, selection, lensName, families]);

  const legend: LegendFlags = {
    single: canvas.nodes.some((n) => n.kind === 'single'),
    dim: canvas.nodes.some((n) => n.emphasis === 'dim'),
    badge: canvas.nodes.some((n) => n.badge) ? BADGE_MEANING[lensName] : undefined,
    sizeMeaning: focus ? undefined : SIZE_MEANING[lensName],
    ghost: canvas.ghosts.length > 0,
    families: canvas.hulls.length > 0,
  };

  const chooseLens = (id: string) => {
    userChose.current = true;
    setLensName(id as LensName);
    setSelection([]);
    setSheetOpen(false);
  };

  const onNodeTap = (id: string) => {
    if (zoom.takeSuppressedClick()) return;
    setSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const [first] = prev;
      if (prev.length === 1 && first && catalog.recipeById.has(first) && catalog.recipeById.has(id)) return [first, id];
      return [id];
    });
    setSheetOpen(true);
  };

  const onBackgroundTap = () => {
    if (zoom.takeSuppressedClick()) return;
    setSelection([]);
    setSheetOpen(false);
  };

  const showRecipesUsing = (ingredientId: string) => {
    const ids = [ingredientId, ...neighbours(full, ingredientId)];
    const pts = ids.flatMap((id) => (layout.positions[id] ? [layout.positions[id]!] : []));
    if (pts.length > 0) {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      zoom.focusBox({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
    }
    setSelection([ingredientId]);
    setSheetOpen(false);
    const svg = zoom.svgRef.current;
    if (svg && typeof svg.scrollIntoView === 'function') svg.scrollIntoView({ block: 'nearest' });
  };

  const clearFocus = () => {
    setSelection([]);
    setSheetOpen(false);
  };

  if (catalog.recipes.length === 0) {
    return <EmptyState title="Nothing to map yet">Recipes appear here once the recipe data loads.</EmptyState>;
  }

  const focusText = (() => {
    const [a, b] = selection;
    if (!a) return '';
    if (b) return `Comparing ${mapLabel(catalog, a)} and ${mapLabel(catalog, b)}`;
    const n = (focus?.size ?? 1) - 1;
    const what = catalog.recipeById.has(a) ? 'ingredient' : 'recipe';
    return `${displayName(catalog, a)} and ${n === 1 ? `1 ${what}` : `${n} ${what}s`}`;
  })();

  return (
    <section className="map-view" aria-labelledby={headingId}>
      <ChoiceChips label="Map lens" options={LENSES.map((l) => ({ id: l.name, label: l.label }))} value={lensName} onChange={chooseLens} />

      <div className="map-key">
        <p className="eyebrow">{info.question}</p>
        <h2 id={headingId} className="map-sentence" aria-live="polite">
          {result.sentence}
        </h2>
        <p className="map-how">{info.howToRead}</p>
      </div>

      {selection.length > 0 && (
        <div className="map-focus">
          <p>
            <span className="eyebrow">Focus</span> {focusText}
          </p>
          <button type="button" className="map-btn map-btn--secondary map-btn--small" onClick={clearFocus}>
            Clear
          </button>
        </div>
      )}

      <div className="map-frame">
        <MapCanvas
          width={layout.width}
          height={layout.height}
          sentence={result.sentence}
          nodes={canvas.nodes}
          edges={canvas.edges}
          hulls={canvas.hulls}
          ghosts={canvas.ghosts}
          viewBox={zoom.viewBox}
          svgRef={zoom.svgRef}
          zoomed={zoom.zoomed}
          handlers={zoom.handlers}
          onNodeTap={onNodeTap}
          onBackgroundTap={onBackgroundTap}
        />
        {zoom.zoomed && (
          <button type="button" className="map-btn map-btn--secondary map-btn--small map-reset" onClick={zoom.reset}>
            Reset zoom
          </button>
        )}
      </div>
      <p className="muted">Tap a dot for details, or two recipes to compare. Pinch to zoom; double-tap to reset.</p>

      <MapLegend flags={legend} />

      <div className="map-words">
        <h3>In words</h3>
        {result.list.length === 0 ? (
          <EmptyState title="Nothing to list">This lens has nothing to show yet.</EmptyState>
        ) : (
          <ul className="map-list">
            {result.list.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        )}
      </div>

      {sheetOpen && selection.length > 0 && (
        <NodeSheet
          ctx={ctx}
          graph={full}
          selection={selection}
          onClose={() => setSheetOpen(false)}
          onFocus={showRecipesUsing}
          previewAdd={previewAdd}
          onAddToPlan={onAddToPlan}
        />
      )}
    </section>
  );
}
