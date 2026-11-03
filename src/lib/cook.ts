// Cook mode helpers: find the ingredients a step mentions, list what a batch is
// cooked without, and format timers. Pure: no React, no storage.

import type { Ingredient, PlanResult, Recipe, RecipeIngredient, Role } from '../types';
import { daysBetween } from './dates';

export interface StepSegment {
  text: string;
  ingredientId?: string;   // set when this piece of the step names an ingredient
}

interface Term { pattern: string; ingredientId: string; role: Role; staple: boolean; length: number; }

// A trailing word like "breast" names the cut, not the food; the first word ("chicken") is the food.
const CUT_WORDS = new Set(['breast', 'thighs', 'thigh', 'fillet', 'fillets', 'florets', 'tenderloin']);
const ROLE_RANK: Record<Role, number> = { core: 0, optional: 1, garnish: 2 };

/** The part of an ingredient name a recipe step would use: "Chicken breast, boneless skinless" → "chicken breast". */
export function shortName(name: string): string {
  return (name.split(/[,(]/)[0] ?? name).trim();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex source for a word that also matches its singular or plural ("tomato" ↔ "tomatoes"). */
function wordPattern(word: string): string {
  if (word.endsWith('ies')) return `${escape(word.slice(0, -3))}(?:y|ies)`;
  if (word.endsWith('y')) return `${escape(word.slice(0, -1))}(?:y|ies)`;
  if (word.endsWith('oes')) return `${escape(word.slice(0, -2))}(?:es)?`;
  if (word.endsWith('s') && !word.endsWith('ss')) return `${escape(word.slice(0, -1))}s?`;
  return `${escape(word)}(?:s|es)?`;
}

function phrasePattern(words: string[]): string {
  const last = words[words.length - 1] ?? '';
  return [...words.slice(0, -1).map(escape), wordPattern(last)].join('\\s+');
}

/** Words a step might use for one ingredient: the full short name, its head noun, and the food before a cut word. */
function termsFor(ingredient: Ingredient): { pattern: string; length: number; single: string | null }[] {
  const head = shortName(ingredient.name).toLowerCase();
  const out: { pattern: string; length: number; single: string | null }[] = [];
  // "Pico de gallo / salsa" and "Soy sauce / tamari" are alternatives; "Cherry/grape tomatoes" is not split.
  const phrases = head.includes(' / ') ? head.split(' / ') : [head];
  for (const phrase of phrases) {
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (!phrase.includes('/')) out.push({ pattern: phrasePattern(words), length: phrase.length, single: words.length === 1 ? words[0]! : null });
    if (words.length > 1) {
      const last = words[words.length - 1]!;
      const lastWord = last.split('/').pop()!;
      out.push({ pattern: wordPattern(lastWord), length: lastWord.length, single: lastWord });
      if (CUT_WORDS.has(lastWord)) {
        const first = words[0]!;
        out.push({ pattern: wordPattern(first), length: first.length, single: first });
      }
    }
  }
  return out;
}

/**
 * Split a step into plain text and ingredient mentions. Longer names win ("green onion" over "onion");
 * a single word shared by two of the recipe's ingredients goes to the more important role, and is left
 * plain when that's still a tie ("pepper" with both bell pepper and black pepper).
 */
export function highlightStep(text: string, recipe: Recipe, ingredientById: ReadonlyMap<string, Ingredient>): StepSegment[] {
  const bySingle = new Map<string, Term[]>();
  const terms: Term[] = [];
  for (const ri of recipe.ingredients) {
    const ingredient = ingredientById.get(ri.ingredientId);
    if (!ingredient) continue;
    for (const t of termsFor(ingredient)) {
      const term: Term = { pattern: t.pattern, ingredientId: ri.ingredientId, role: ri.role, staple: !!ingredient.staple, length: t.length };
      if (t.single) {
        const list = bySingle.get(t.single) ?? [];
        if (!list.some((x) => x.ingredientId === term.ingredientId)) list.push(term);
        bySingle.set(t.single, list);
      } else {
        terms.push(term);
      }
    }
  }
  for (const list of bySingle.values()) {
    const best = [...list].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || Number(a.staple) - Number(b.staple));
    const [first, second] = best;
    if (!first) continue;
    if (second && ROLE_RANK[second.role] === ROLE_RANK[first.role] && second.staple === first.staple) continue; // ambiguous
    terms.push(first);
  }
  terms.sort((a, b) => b.length - a.length);

  // Claim character ranges, longest terms first, never overlapping.
  const claimed: { start: number; end: number; ingredientId: string }[] = [];
  for (const term of terms) {
    const re = new RegExp(`\\b${term.pattern}\\b`, 'gi');
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (claimed.some((c) => start < c.end && end > c.start)) continue;
      claimed.push({ start, end, ingredientId: term.ingredientId });
    }
  }
  claimed.sort((a, b) => a.start - b.start);

  const segments: StepSegment[] = [];
  let at = 0;
  for (const c of claimed) {
    if (c.start > at) segments.push({ text: text.slice(at, c.start) });
    segments.push({ text: text.slice(c.start, c.end), ingredientId: c.ingredientId });
    at = c.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}

/** The recipe ingredients a step mentions, in the order they first appear. */
export function stepIngredients(text: string, recipe: Recipe, ingredientById: ReadonlyMap<string, Ingredient>): RecipeIngredient[] {
  const seen = new Set<string>();
  const out: RecipeIngredient[] = [];
  for (const seg of highlightStep(text, recipe, ingredientById)) {
    if (!seg.ingredientId || seen.has(seg.ingredientId)) continue;
    seen.add(seg.ingredientId);
    const ri = recipe.ingredients.find((x) => x.ingredientId === seg.ingredientId);
    if (ri) out.push(ri);
  }
  return out;
}

/**
 * Optional ingredients a batch cooked on `day` goes without because they're past their life
 * (data-model §3: effective life = frozenLifeDays if freezable, else shelfLifeDays; good *through* that day).
 */
export function droppedOptionals(
  recipe: Recipe,
  day: number,
  ingredientById: ReadonlyMap<string, Ingredient>,
  frozenLifeDays: number,
): Ingredient[] {
  const out: Ingredient[] = [];
  for (const ri of recipe.ingredients) {
    if (ri.role !== 'optional') continue;
    const ingredient = ingredientById.get(ri.ingredientId);
    if (!ingredient || ingredient.staple) continue;
    const life = ingredient.freezable ? frozenLifeDays : ingredient.shelfLifeDays;
    if (life < day) out.push(ingredient);
  }
  return out;
}

/** Garnish is never bought or counted; Cook mode lists it as "if you have it". */
export function garnishes(recipe: Recipe): RecipeIngredient[] {
  return recipe.ingredients.filter((ri) => ri.role === 'garnish');
}

/** Indexes of the plan's batches cooked on `today` (by the plan's start date). */
export function batchesCookedOn(plan: PlanResult | null, startDate: string, today: string): number[] {
  if (!plan || plan.status === 'infeasible') return [];
  const day = daysBetween(startDate, today);
  const out: number[] = [];
  plan.batches.forEach((b, i) => {
    if (b.day === day) out.push(i);
  });
  return out;
}

/** "4:05", "25:00", "1:00:00". Rounds partial seconds up so a running timer never shows 0:00 early. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "30 min", "1 hr 30 min", "45 s" for a step's timer label. */
export function timerLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}
