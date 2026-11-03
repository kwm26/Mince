// Insight lenses over the ingredient map (data-model §11, brief "lens table").
// Each lens answers one question with a key sentence, node emphasis for the map,
// and a text list that carries everything the map shows. Pure: no React, no d3.

import type { Catalog, LensContext, LensName, LensNode, LensResult, PlanResult } from '../types';
import { dayLabel, daysBetween } from './dates';
import {
  buildGraph,
  degree,
  families,
  scaleRadius,
  shortIngredientName,
  shortTitle,
  type Families,
  type Graph,
} from './graph';
import { daysLeft, daysLeftLabel, isPerishable, isUseSoon } from './kitchen';

export interface LensInfo {
  name: LensName;
  label: string;                        // chip text
  question: string;                     // what the lens answers
  howToRead: string;                    // how to read the map under this lens, in plain words
}

export const LENSES: readonly LensInfo[] = [
  {
    name: 'week',
    label: 'This week',
    question: 'How does my plan connect?',
    howToRead: 'Solid: the recipes in your plan and what they use. Faded: everything else.',
  },
  {
    name: 'hubs',
    label: 'Hubs',
    question: 'What’s safe to buy?',
    howToRead: 'A bigger ingredient is used by more recipes. Fresh hubs get used up, so they rarely go to waste.',
  },
  {
    name: 'freshness',
    label: 'Freshness',
    question: 'What’s about to turn?',
    howToRead: 'Tags show days left. Solid: ingredients with 2 days or less, and the recipes that can use them.',
  },
  {
    name: 'waste',
    label: 'Waste',
    question: 'Where does my leftover go?',
    howToRead: 'Tags show packs left over after this plan. The dashed line is the swap that uses up the most.',
  },
  {
    name: 'protein',
    label: 'Protein',
    question: 'What feeds my goal?',
    howToRead: 'A bigger recipe has more protein per serving. Faded: under 30 g, or not published.',
  },
  {
    name: 'families',
    label: 'Families',
    question: 'What should I cook together?',
    howToRead: 'Shaded groups are recipes that share perishables. Cooking inside one family wastes least.',
  },
];

// ── Shared, cached per catalog ──

interface MapData {
  graph: Graph;                         // shared ingredients only (the map's default)
  families: Families;
}

const cache = new WeakMap<Catalog, MapData>();

export function mapData(catalog: Catalog): MapData {
  let d = cache.get(catalog);
  if (!d) {
    const graph = buildGraph(catalog);
    d = { graph, families: families(graph, catalog) };
    cache.set(catalog, d);
  }
  return d;
}

/** The name every lens list uses for a node: full recipe title, or the short ingredient name. */
export function displayName(catalog: Catalog, id: string): string {
  const r = catalog.recipeById.get(id);
  if (r) return r.title;
  const i = catalog.ingredientById.get(id);
  return i ? capitalize(shortIngredientName(i.name)) : id;
}

/** An ingredient's name for use mid-sentence ("baby spinach", "Greek yogurt"); recipes keep their title. */
export function phrase(catalog: Catalog, id: string): string {
  const i = catalog.ingredientById.get(id);
  return i && !catalog.recipeById.has(id) ? shortIngredientName(i.name) : displayName(catalog, id);
}

/** The short label drawn on the map. */
export function mapLabel(catalog: Catalog, id: string): string {
  const r = catalog.recipeById.get(id);
  return r ? shortTitle(r.title) : displayName(catalog, id);
}

export function lens(name: LensName, ctx: LensContext): LensResult {
  switch (name) {
    case 'week':
      return weekLens(ctx);
    case 'hubs':
      return hubsLens(ctx);
    case 'freshness':
      return freshnessLens(ctx);
    case 'waste':
      return wasteLens(ctx);
    case 'protein':
      return proteinLens(ctx);
    case 'families':
      return familiesLens(ctx);
  }
}

// ── Formatting ──

const MINUS = '−';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function num(x: number): string {
  return String(Number(x.toFixed(1)));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "0.6 packs", "1 pack", "<0.1 packs". */
export function formatPacks(x: number): string {
  const r = Math.round(x * 10) / 10;
  if (r === 0) return '<0.1 packs';
  return `${num(r)} ${r === 1 ? 'pack' : 'packs'}`;
}

/** "+0.6 packs" or "−0.6 packs", with a true minus sign. */
export function signedPacks(delta: number): string {
  return `${delta < 0 ? MINUS : '+'}${formatPacks(Math.abs(delta))}`;
}

/** "Thu" for plan day `day`. */
export function weekday(startDate: string, day: number): string {
  const w = dayLabel(startDate, day).weekday;
  return w.charAt(0) + w.slice(1).toLowerCase();
}

// ── Helpers ──

function allNodes(graph: Graph, emphasis: LensNode['emphasis']): Record<string, LensNode> {
  const out: Record<string, LensNode> = {};
  for (const n of graph.nodes) out[n.id] = { emphasis };
  return out;
}

function plannedRecipes(plan: PlanResult): string[] {
  return [...new Set(plan.batches.map((b) => b.recipeId))];
}

/** The plan when there is a week to show: solved, not infeasible, with batches. */
function solved(plan: PlanResult | null): PlanResult | null {
  return plan !== null && plan.status !== 'infeasible' && plan.batches.length > 0 ? plan : null;
}

/** Every non-staple ingredient a recipe uses (core or optional), including single-use ones. */
function ingredientsOf(ctx: LensContext, recipeId: string): string[] {
  const all = new Set<string>();
  const r = ctx.catalog.recipeById.get(recipeId);
  for (const ri of r?.ingredients ?? []) {
    if (ri.role === 'garnish') continue;
    const i = ctx.catalog.ingredientById.get(ri.ingredientId);
    if (i && !i.staple) all.add(i.id);
  }
  return [...all];
}

function recipesUsing(ctx: LensContext, ingredientId: string): string[] {
  return ctx.catalog.recipes.filter((r) => ingredientsOf(ctx, r.id).includes(ingredientId)).map((r) => r.id);
}

// ── This week ──

function weekLens(ctx: LensContext): LensResult {
  const { graph } = mapData(ctx.catalog);
  if (!ctx.plan) {
    return {
      nodes: allNodes(graph, 'normal'),
      sentence: 'No plan yet: solve a week to see how it connects.',
      list: ['No plan yet. Once a week is solved, this lens shows the recipes it cooks and the ingredients they share.'],
    };
  }
  const plan = solved(ctx.plan);
  if (!plan) {
    const infeasible = ctx.plan.status === 'infeasible';
    return {
      nodes: allNodes(graph, 'normal'),
      sentence: infeasible ? 'These pins don’t fit, so there’s no week to show yet.' : 'No batches planned yet.',
      list: [infeasible ? ctx.plan.infeasibleReason ?? 'The solver found no plan for these settings.' : 'The plan has no batches yet.'],
    };
  }

  const nodes = allNodes(graph, 'dim');
  const recipes = plannedRecipes(plan);
  const usedBy = new Map<string, string[]>();
  for (const r of recipes) {
    nodes[r] = { emphasis: 'high' };
    for (const i of ingredientsOf(ctx, r)) {
      usedBy.set(i, [...(usedBy.get(i) ?? []), r]);
      if (nodes[i]) nodes[i] = { emphasis: 'high' };
    }
  }

  const sharedInPlan = [...usedBy.entries()]
    .filter(([, rs]) => rs.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || displayName(ctx.catalog, a[0]).localeCompare(displayName(ctx.catalog, b[0])));
  for (const [id] of sharedInPlan.slice(0, 5)) {
    const node = nodes[id];
    if (node) node.label = mapLabel(ctx.catalog, id);
  }

  const n = plan.batches.length;
  let sentence: string;
  if (recipes.length < 2) {
    sentence = `Your ${plural(n, 'batch', 'batches')} ${n === 1 ? 'uses' : 'use'} ${plural(usedBy.size, 'ingredient')}, none shared`;
  } else if (sharedInPlan.length === 0) {
    sentence = `Your ${plural(n, 'batch', 'batches')} don’t share any ingredients`;
  } else {
    sentence = `Your ${plural(n, 'batch', 'batches')} share ${plural(sharedInPlan.length, 'ingredient')}`;
  }

  const list = [...plan.batches]
    .sort((a, b) => a.day - b.day)
    .map((b) => {
      const title = displayName(ctx.catalog, b.recipeId);
      const uses = ingredientsOf(ctx, b.recipeId).map((i) => phrase(ctx.catalog, i));
      return `${weekday(ctx.constraints.startDate, b.day)}: ${title}${b.pinned ? ' (pinned)' : ''}. Uses ${joinAnd(uses) || 'staples only'}.`;
    });
  list.push(
    sharedInPlan.length > 0
      ? `Shared by 2 or more recipes: ${sharedInPlan.map(([id, rs]) => `${phrase(ctx.catalog, id)} (${rs.length})`).join(', ')}.`
      : 'No ingredient is shared between two different recipes.',
  );
  return { nodes, sentence, list };
}

// ── Hubs ──

function hubsLens(ctx: LensContext): LensResult {
  const { graph } = mapData(ctx.catalog);
  const nodes = allNodes(graph, 'normal');
  const ingredients = graph.nodes.filter((n) => n.kind === 'ingredient').map((n) => n.id);
  const degs = ingredients.map((id) => degree(graph, id));
  const minDeg = Math.min(...degs);
  const maxDeg = Math.max(...degs);

  const byDegree = [...ingredients].sort(
    (a, b) => degree(graph, b) - degree(graph, a) || displayName(ctx.catalog, a).localeCompare(displayName(ctx.catalog, b)),
  );
  const perishable = (id: string) => {
    const i = ctx.catalog.ingredientById.get(id);
    return i !== undefined && isPerishable(i);
  };
  const hubs = byDegree.filter(perishable).slice(0, 5);

  for (const id of ingredients) {
    nodes[id] = { emphasis: 'normal', size: scaleRadius(degree(graph, id), minDeg, maxDeg) };
  }
  for (const id of hubs) {
    nodes[id] = { ...nodes[id], emphasis: 'high', label: mapLabel(ctx.catalog, id) };
  }

  const top = hubs.slice(0, 3);
  const sentence =
    top.length === 0
      ? 'No fresh ingredient links two recipes'
      : `${capitalize(joinAnd(top.map((id) => phrase(ctx.catalog, id))))} link ${Math.min(...top.map((id) => degree(graph, id)))}+ recipes each`;

  const hubSet = new Set(hubs);
  const list = [
    'Hubs are the 5 fresh ingredients (keep 14 days or less) that the most recipes use.',
    ...byDegree.map((id) => {
      const i = ctx.catalog.ingredientById.get(id);
      const keeps = i ? `keeps ${plural(i.shelfLifeDays, 'day')}` : '';
      return `${displayName(ctx.catalog, id)}: in ${plural(degree(graph, id), 'recipe')}, ${keeps}${hubSet.has(id) ? '. Hub' : ''}.`;
    }),
  ];
  return { nodes, sentence, list };
}

// ── Freshness ──

function freshnessLens(ctx: LensContext): LensResult {
  const { graph } = mapData(ctx.catalog);
  const nodes = allNodes(graph, 'normal');
  const elapsed = daysBetween(ctx.constraints.startDate, ctx.today);

  const fromPantry = new Map<string, number>();
  for (const item of ctx.constraints.pantry) {
    const i = ctx.catalog.ingredientById.get(item.ingredientId);
    if (!i || i.staple) continue;
    const d = daysLeft(item, ctx.today);
    fromPantry.set(i.id, Math.min(d, fromPantry.get(i.id) ?? Infinity));
  }
  const daysFor = (id: string): number => {
    const p = fromPantry.get(id);
    if (p !== undefined) return p;
    const i = ctx.catalog.ingredientById.get(id);
    return Math.max(0, (i?.shelfLifeDays ?? 0) - elapsed);
  };

  // Raw meat and fish not yet bought can be frozen on shopping day (data-model §3),
  // so a 2-day shelf life is a reminder, not something about to turn.
  const freezesOnShopping = (id: string) => !fromPantry.has(id) && ctx.catalog.ingredientById.get(id)?.freezable === true;
  const turnsSoon = (id: string) => isUseSoon(daysFor(id)) && !freezesOnShopping(id);

  // Shared ingredients, plus anything in the fridge (it may be single-use).
  const ids = new Set(graph.nodes.filter((n) => n.kind === 'ingredient').map((n) => n.id));
  for (const id of fromPantry.keys()) ids.add(id);
  const ingredients = [...ids].sort(
    (a, b) =>
      daysFor(a) - daysFor(b) ||
      Number(fromPantry.has(b)) - Number(fromPantry.has(a)) ||
      degree(graph, b) - degree(graph, a) ||
      displayName(ctx.catalog, a).localeCompare(displayName(ctx.catalog, b)),
  );
  const soon = ingredients.filter(turnsSoon);

  for (const id of ingredients) {
    if (!nodes[id] && !turnsSoon(id)) continue; // a fridge item that keeps and isn't on the map
    nodes[id] = { emphasis: 'normal', badge: daysLeftLabel(daysFor(id)) };
  }

  const usingSoon = new Set<string>();
  for (const id of soon) for (const r of recipesUsing(ctx, id)) usingSoon.add(r);

  if (soon.length > 0) {
    for (const node of Object.values(nodes)) node.emphasis = 'dim';
    for (const id of soon) {
      const node = nodes[id];
      if (node) node.emphasis = 'high';
    }
    for (const r of usingSoon) nodes[r] = { emphasis: 'high' };
    for (const id of soon.slice(0, 5)) {
      const node = nodes[id];
      if (node) node.label = mapLabel(ctx.catalog, id);
    }
  }

  const name = (id: string) => displayName(ctx.catalog, id);
  const expires = (d: number) => (d <= 0 ? 'expires today' : `expires in ${plural(d, 'day')}`);
  let sentence: string;
  const first = soon[0];
  if (first === undefined) {
    const next = ingredients.find((id) => !freezesOnShopping(id));
    sentence =
      next === undefined
        ? 'Nothing on the map is about to turn'
        : `Nothing turns within 2 days; ${phrase(ctx.catalog, next)} goes first, in ${plural(daysFor(next), 'day')}`;
  } else if (soon.length === 1) {
    sentence = `${name(first)} ${expires(daysFor(first))}; ${plural(usingSoon.size, 'recipe')} can use it`;
  } else {
    sentence = `${name(first)} and ${soon.length - 1} more turn within 2 days; ${plural(usingSoon.size, 'recipe')} can use them`;
  }

  const left = (id: string) => {
    const d = daysFor(id);
    return d <= 0 ? 'use today' : `${plural(d, 'day')} left`;
  };
  const where = (id: string) => {
    if (fromPantry.has(id)) return 'in your fridge';
    return freezesOnShopping(id) ? 'once bought; freeze it on shopping day to keep it' : 'once bought';
  };
  const list = [
    ...soon.map((id) => `${name(id)}: ${left(id)} ${where(id)}. Use it in ${recipesUsing(ctx, id).map(name).join('; ')}.`),
    ...ingredients.filter((id) => nodes[id] && !turnsSoon(id)).map((id) => `${name(id)}: ${left(id)} ${where(id)}.`),
  ];
  return { nodes, sentence, list };
}

// ── Waste ──

function wasteLens(ctx: LensContext): LensResult {
  const { graph } = mapData(ctx.catalog);
  const waste = ctx.waste;
  const plan = solved(ctx.plan);
  if (!waste || !plan) {
    return {
      nodes: allNodes(graph, 'normal'),
      sentence: 'Solve a week to see leftovers.',
      list: ['Leftovers show here once a week is solved, each with the swap that uses most of it up.'],
    };
  }
  const leftovers = Object.entries(waste.leftoverPacks)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (leftovers.length === 0) {
    return {
      nodes: allNodes(graph, 'normal'),
      sentence: 'Nothing left over: every pack gets used',
      list: ['This plan uses up every fresh pack it buys.'],
    };
  }

  const nodes = allNodes(graph, 'dim');
  const planned = new Set(plannedRecipes(plan));
  for (const [id, v] of leftovers) {
    nodes[id] = { emphasis: 'high', badge: `+${formatPacks(v)}`, label: mapLabel(ctx.catalog, id) };
    for (const r of recipesUsing(ctx, id)) if (planned.has(r) && nodes[r]?.emphasis === 'dim') nodes[r] = { emphasis: 'normal' };
  }

  const name = (id: string) => displayName(ctx.catalog, id);
  const total = leftovers.reduce((s, [, v]) => s + v, 0);
  const list = leftovers.map(([id, v]) => `${name(id)}: +${formatPacks(v)} left over.`);
  list.push(`Total: ${formatPacks(total)} left over.`);

  const best = waste.best;
  if (!best) {
    return {
      nodes,
      sentence: `${capitalize(formatPacks(total))} left over, and no swap uses ${total === 1 ? 'it' : 'them'} up`,
      list: [...list, 'No swap of an unpinned batch uses these up without breaking a limit.'],
    };
  }

  const day = weekday(ctx.constraints.startDate, best.day);
  const delta = signedPacks(best.deltaWastePacks);
  nodes[best.recipeId] = { emphasis: 'high', label: mapLabel(ctx.catalog, best.recipeId) };
  if (nodes[best.ingredientId]?.emphasis !== 'high') {
    nodes[best.ingredientId] = { emphasis: 'high', label: mapLabel(ctx.catalog, best.ingredientId) };
  }
  const replaced = plan.batches[best.replacesBatchIndex];
  list.push(
    `Swap in ${name(best.recipeId)} on ${day}${replaced ? ` instead of ${name(replaced.recipeId)}` : ''}: it uses up ${phrase(ctx.catalog, best.ingredientId)}, ${delta} of waste.`,
  );
  return {
    nodes,
    ghostEdges: [{ from: best.recipeId, to: best.ingredientId, label: delta }],
    sentence: `Swap in ${mapLabel(ctx.catalog, best.recipeId)} ${day} → ${delta}`,
    list,
  };
}

// ── Protein ──

function proteinLens(ctx: LensContext): LensResult {
  const { graph } = mapData(ctx.catalog);
  const nodes = allNodes(graph, 'dim');
  const recipes = ctx.catalog.recipes;
  const values = recipes.map((r) => r.macrosPerServing.protein).filter((p): p is number => p !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const sorted = [...recipes].sort(
    (a, b) => (b.macrosPerServing.protein ?? -1) - (a.macrosPerServing.protein ?? -1) || a.title.localeCompare(b.title),
  );
  for (const r of sorted) {
    const p = r.macrosPerServing.protein;
    if (p === null) nodes[r.id] = { emphasis: 'dim', badge: 'n/a' };
    else nodes[r.id] = { emphasis: p >= 30 ? 'high' : 'dim', size: scaleRadius(p, min, max) };
  }
  for (const r of sorted.filter((r) => (r.macrosPerServing.protein ?? 0) >= 30).slice(0, 5)) {
    const node = nodes[r.id];
    if (node) node.label = mapLabel(ctx.catalog, r.id);
  }

  const hit = recipes.filter((r) => (r.macrosPerServing.protein ?? 0) >= 30).length;
  const list = [
    'Protein per serving, as published. 30 g or more is solid on the map.',
    ...sorted.map((r) => {
      const p = r.macrosPerServing.protein;
      if (p === null) return `${r.title}: macros not published.`;
      return `${r.title}: ${num(p)} g per serving${p < 30 ? ' (under 30 g)' : ''}.`;
    }),
  ];
  return { nodes, sentence: `${hit} of ${recipes.length} recipes hit ≥ 30 g per serving`, list };
}

// ── Families ──

function familiesLens(ctx: LensContext): LensResult {
  const { graph, families: fam } = mapData(ctx.catalog);
  const nodes = allNodes(graph, 'normal');
  for (const r of ctx.catalog.recipes) nodes[r.id] = { emphasis: 'normal', family: fam.byRecipe[r.id] ?? 'standalone' };

  const real = fam.families.filter((f) => f.name !== 'standalone');
  const loose = fam.families.filter((f) => f.name === 'standalone').flatMap((f) => f.recipes);
  const name = (id: string) => displayName(ctx.catalog, id);
  const familyTitle = (n: string) => `${capitalize(n)} family`;

  const counts = new Map<string, number>();
  const plan = solved(ctx.plan);
  if (plan) for (const b of plan.batches) {
    const f = fam.byRecipe[b.recipeId];
    if (f && f !== 'standalone') counts.set(f, (counts.get(f) ?? 0) + 1);
  }

  let target = real[0];
  let sentence: string;
  if (real.length === 0) {
    sentence = 'No recipes share perishables, so there are no families';
  } else if (plan) {
    const ranked = [...real].sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || b.recipes.length - a.recipes.length);
    target = ranked[0];
    const c = target ? counts.get(target.name) ?? 0 : 0;
    sentence =
      target && c > 0
        ? `Your plan sits mostly in the ${target.name} family (${c} of ${plural(plan.batches.length, 'batch', 'batches')})`
        : 'Your plan’s recipes don’t share a family';
    if (c === 0) target = undefined;
  } else {
    sentence = `${familyTitle(real[0]!.name)}: plan inside it to waste least`;
  }

  if (target) for (const r of target.recipes) {
    const node = nodes[r];
    if (node) node.emphasis = 'high';
  }

  const list = real.map((f) => {
    const inPlan = counts.get(f.name);
    const shares = f.perishables.slice(0, 3).map((i) => phrase(ctx.catalog, i));
    return `${familyTitle(f.name)}${inPlan ? ` (${plural(inPlan, 'batch', 'batches')} in your plan)` : ''}: shares ${joinAnd(shares)}. ${f.recipes.map(name).join('; ')}.`;
  });
  if (loose.length > 0) list.push(`Standalone (shares no perishables with a family): ${loose.map(name).join('; ')}.`);
  if (list.length === 0) list.push('Every recipe stands alone.');
  return { nodes, sentence, list };
}
