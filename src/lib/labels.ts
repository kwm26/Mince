// Short, plain-word names for reasons, notes and infeasible messages.
// Presentation only: never changes data. Pure: no React, no storage.

import type { Ingredient, Recipe } from '../types';
import { dayLabel } from './dates';

const PROPER = new Set(['Greek', 'Italian', 'Italian-Style', 'Kalamata', 'Puy', 'Roma', 'Buddha']);
const FILLER = new Set(['Viral', 'Easiest', 'Healthy', 'High-Protein']);

function sentenceCase(text: string, lowerFirst: boolean): string {
  return text
    .split(' ')
    .map((word, k) => {
      if (PROPER.has(word)) return word;
      if (k === 0 && !lowerFirst) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      return word.toLowerCase();
    })
    .join(' ');
}

/**
 * "Steak Fajita Bowls" → "Steak fajita bowls"; drops "(…)", " with …" and filler
 * words ("Viral", "Healthy"…). `lower` starts with a lowercase letter, for mid-sentence use.
 */
export function recipeLabel(recipe: Recipe, lower = false): string {
  let t = recipe.title.replace(/\s*\([^)]*\)/g, '');
  t = t.replace(/\s+with\s+.*$/i, '').split(',')[0]!;
  const words = t.split(/\s+/).filter((w) => w !== '');
  while (words.length > 1 && FILLER.has(words[0]!)) words.shift();
  return sentenceCase(words.join(' '), lower);
}

/**
 * "Chicken breast, boneless skinless" → "chicken breast"; "Cherry/grape tomatoes" →
 * "cherry tomatoes"; "Baby spinach" → "spinach"; "Broccoli florets" → "broccoli".
 */
export function ingredientLabel(ingredient: Ingredient): string {
  let n = ingredient.name.split(',')[0]!.replace(/\s*\([^)]*\)/g, '');
  n = n.split(' / ')[0]!.replace(/\/[^\s]+/g, '').trim();
  const words = n.split(/\s+/);
  if (words.length > 1 && /^(baby|fresh)$/i.test(words[0]!)) words.shift();
  if (words.length > 1 && /^florets$/i.test(words[words.length - 1]!)) words.pop();
  return sentenceCase(words.join(' '), true);
}

/** Plan day → "Mon". */
export function weekday(startDate: string, day: number): string {
  const w = dayLabel(startDate, day).weekday;
  return w.charAt(0) + w.slice(1).toLowerCase();
}

/** Consecutive days → "Thu–Sat"; otherwise "Thu, Sat". */
export function dayRange(startDate: string, days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (sorted.length === 1) return weekday(startDate, first);
  if (last - first === sorted.length - 1) return `${weekday(startDate, first)}–${weekday(startDate, last)}`;
  return sorted.map((d) => weekday(startDate, d)).join(', ');
}

/** "a", "a and b", "a, b and 2 more". */
export function listNames(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
