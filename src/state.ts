// App state: the user's constraints, ingredient overrides and the current plan,
// in one reducer behind a React context, persisted to localStorage under a
// versioned key. Missing or corrupt storage falls back to the defaults.

import { createContext, createElement, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { defaultConstraints, fridges, fridgeToPantry, ingredientById, recipeById, weekToConstraints, weeks, withOverrides } from './lib/data';
import { daysBetween } from './lib/dates';
import { readJson, STATE_KEY, writeJson } from './storage';
import type { Catalog, Constraints, IngredientOverride, PantryItem, Pin, PlanResult, Weights } from './types';

export type SolveStatus = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string };

export interface AppState {
  constraints: Constraints;
  overrides: Record<string, IngredientOverride>;
  plan: PlanResult | null;
  planKey: string | null;        // inputsKey() the plan was solved for; differs once inputs change
  solve: SolveStatus;            // not persisted
}

export type Action =
  | { type: 'pantry/upsert'; item: PantryItem }
  | { type: 'pantry/remove'; ingredientId: string }
  | { type: 'example/fridge'; fridgeId: string; today: string }
  | { type: 'example/week'; weekId: string; today: string }
  | { type: 'pin/add'; pin: Pin }
  | { type: 'pin/remove'; pin: Pin }
  | { type: 'cookMinutes/set'; day: number; minutes: number }
  | { type: 'protein/set'; grams: number }
  | { type: 'weights/set'; weights: Weights }
  | { type: 'override/set'; ingredientId: string; override: IngredientOverride | null }
  | { type: 'constraints/replace'; constraints: Constraints }
  | { type: 'week/startToday'; today: string }
  | { type: 'solve/start' }
  | { type: 'solve/done'; plan: PlanResult; key: string }
  | { type: 'solve/error'; message: string };

export const PROTEIN_MIN = 60;
export const PROTEIN_MAX = 300;

const samePin = (a: Pin, b: Pin) => a.recipeId === b.recipeId && a.day === b.day;

function withConstraints(state: AppState, constraints: Constraints): AppState {
  return { ...state, constraints };
}

export function reducer(state: AppState, action: Action): AppState {
  const c = state.constraints;
  switch (action.type) {
    case 'pantry/upsert': {
      const rest = c.pantry.filter((p) => p.ingredientId !== action.item.ingredientId);
      return withConstraints(state, { ...c, pantry: [...rest, action.item] });
    }
    case 'pantry/remove':
      return withConstraints(state, { ...c, pantry: c.pantry.filter((p) => p.ingredientId !== action.ingredientId) });
    case 'example/fridge': {
      const fridge = fridges.find((f) => f.id === action.fridgeId);
      if (!fridge) return state;
      return withConstraints(state, { ...c, pantry: fridgeToPantry(fridge, action.today) });
    }
    case 'example/week': {
      const week = weeks.find((w) => w.id === action.weekId);
      if (!week) return state;
      // A new week: its own pins, limits and fridge; the user's priorities carry over.
      return { ...state, constraints: { ...weekToConstraints(week, action.today), weights: { ...c.weights } }, plan: null, planKey: null, solve: { status: 'idle' } };
    }
    case 'pin/add': {
      if (!recipeById.has(action.pin.recipeId) || action.pin.day < 0 || action.pin.day >= c.days) return state;
      if (c.pins.some((p) => samePin(p, action.pin))) return state;
      return withConstraints(state, {
        ...c,
        pins: [...c.pins, { ...action.pin }],
        excludedSlots: c.excludedSlots.filter((s) => !samePin(s, action.pin)),
      });
    }
    case 'pin/remove':
      return withConstraints(state, { ...c, pins: c.pins.filter((p) => !samePin(p, action.pin)) });
    case 'cookMinutes/set': {
      if (action.day < 0 || action.day >= c.days) return state;
      const maxCookMinutes = [...c.maxCookMinutes];
      maxCookMinutes[action.day] = Math.max(0, Math.round(action.minutes));
      return withConstraints(state, { ...c, maxCookMinutes });
    }
    case 'protein/set': {
      const grams = Math.min(PROTEIN_MAX, Math.max(PROTEIN_MIN, Math.round(action.grams)));
      return withConstraints(state, { ...c, proteinPerDay: grams });
    }
    case 'weights/set':
      return withConstraints(state, { ...c, weights: { ...action.weights } });
    case 'override/set': {
      const overrides = { ...state.overrides };
      if (action.override === null || (action.override.shelfLifeDays === undefined && action.override.packSize === undefined)) {
        delete overrides[action.ingredientId];
      } else {
        overrides[action.ingredientId] = { ...action.override };
      }
      return { ...state, overrides };
    }
    case 'constraints/replace':
      return withConstraints(state, action.constraints);
    case 'week/startToday':
      return {
        ...state,
        constraints: { ...c, startDate: action.today, excludedSlots: [] },
        plan: null,
        planKey: null,
        solve: { status: 'idle' },
      };
    case 'solve/start':
      return { ...state, solve: { status: 'loading' } };
    case 'solve/done':
      return { ...state, plan: action.plan, planKey: action.key, solve: { status: 'idle' } };
    case 'solve/error':
      return { ...state, solve: { status: 'error', message: action.message } };
  }
}

/** A short, stable fingerprint of the solver inputs, to tell when a plan is out of date. */
export function inputsKey(constraints: Constraints, overrides: Record<string, IngredientOverride>): string {
  const text = JSON.stringify([constraints, Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b))]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${text.length.toString(36)}-${h.toString(36)}`;
}

// ── Persistence ──

interface Persisted {
  version: 1;
  constraints: Constraints;
  overrides: Record<string, IngredientOverride>;
  plan: PlanResult | null;
  planKey: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDay = (v: unknown, days: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < days;

function parsePins(v: unknown, days: number): Pin[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((p): p is Pin => isObj(p) && typeof p.recipeId === 'string' && recipeById.has(p.recipeId) && isDay(p.day, days)).map((p) => ({ recipeId: p.recipeId, day: p.day }));
}

function parseConstraints(v: unknown): Constraints | null {
  if (!isObj(v)) return null;
  const base = defaultConstraints(typeof v.startDate === 'string' && ISO.test(v.startDate) ? v.startDate : '');
  if (!base.startDate) return null;
  if (v.days !== base.days) return null;
  const max = v.maxCookMinutes;
  if (!Array.isArray(max) || max.length !== base.days || !max.every((m) => isNum(m) && m >= 0)) return null;
  const pins = parsePins(v.pins, base.days);
  const excludedSlots = parsePins(v.excludedSlots, base.days);
  if (!pins || !excludedSlots) return null;
  if (!Array.isArray(v.pantry) || !Array.isArray(v.excluded)) return null;
  const pantry = v.pantry.filter(
    (p): p is PantryItem =>
      isObj(p) &&
      typeof p.ingredientId === 'string' &&
      ingredientById.has(p.ingredientId) &&
      isNum(p.amount) &&
      typeof p.addedOn === 'string' &&
      ISO.test(p.addedOn) &&
      isNum(p.daysLeftAtAdd),
  );
  const w = v.weights;
  if (!isObj(w) || !isNum(w.waste) || !isNum(w.protein) || !isNum(w.cookTime)) return null;
  if (!isNum(v.proteinPerDay)) return null;
  return {
    ...base,
    proteinPerDay: Math.min(PROTEIN_MAX, Math.max(PROTEIN_MIN, v.proteinPerDay)),
    maxCookMinutes: [...(max as number[])],
    pins,
    excluded: v.excluded.filter((id): id is string => typeof id === 'string' && recipeById.has(id)),
    excludedSlots,
    pantry: pantry.map((p) => ({ ingredientId: p.ingredientId, amount: p.amount, addedOn: p.addedOn, daysLeftAtAdd: p.daysLeftAtAdd })),
    weights: { waste: w.waste, protein: w.protein, cookTime: w.cookTime },
  };
}

function parseOverrides(v: unknown): Record<string, IngredientOverride> {
  if (!isObj(v)) return {};
  const out: Record<string, IngredientOverride> = {};
  for (const [id, o] of Object.entries(v)) {
    if (!ingredientById.has(id) || !isObj(o)) continue;
    const entry: IngredientOverride = {};
    if (isNum(o.shelfLifeDays) && o.shelfLifeDays > 0) entry.shelfLifeDays = o.shelfLifeDays;
    if (isNum(o.packSize) && o.packSize > 0) entry.packSize = o.packSize;
    if (entry.shelfLifeDays !== undefined || entry.packSize !== undefined) out[id] = entry;
  }
  return out;
}

function parsePlan(v: unknown, days: number): PlanResult | null {
  if (!isObj(v)) return null;
  if (v.status !== 'optimal' && v.status !== 'timeout-best' && v.status !== 'infeasible') return null;
  if (!Array.isArray(v.batches) || !Array.isArray(v.meals) || !Array.isArray(v.shopping) || !Array.isArray(v.notes)) return null;
  if (!Array.isArray(v.proteinByDay) || !isNum(v.wastePacks) || !isNum(v.reuseRate) || !isNum(v.proteinShortfall)) return null;
  const batchCount = v.batches.length;
  const batchesOk = v.batches.every((b) => isObj(b) && typeof b.recipeId === 'string' && recipeById.has(b.recipeId) && isDay(b.day, days));
  const mealsOk = v.meals.every((m) => isObj(m) && isDay(m.day, days) && Number.isInteger(m.batchIndex) && (m.batchIndex as number) < batchCount);
  const shoppingOk = v.shopping.every((s) => isObj(s) && typeof s.ingredientId === 'string' && ingredientById.has(s.ingredientId) && isNum(s.packs));
  if (!batchesOk || !mealsOk || !shoppingOk) return null;
  return v as unknown as PlanResult;
}

/** Restore saved state, or the defaults for `today` when it's missing, corrupt or another version. */
export function parseStored(raw: unknown, today: string): Omit<AppState, 'solve'> {
  const fresh = { constraints: defaultConstraints(today), overrides: {}, plan: null, planKey: null };
  if (!isObj(raw) || raw.version !== 1) return fresh;
  const constraints = parseConstraints(raw.constraints);
  if (!constraints) return fresh;
  const overrides = parseOverrides(raw.overrides);
  const plan = parsePlan(raw.plan, constraints.days);
  const planKey = plan && typeof raw.planKey === 'string' ? raw.planKey : null;
  // An unplanned week that started in the past simply starts today.
  if (!plan && daysBetween(constraints.startDate, today) > 0) {
    return { constraints: { ...constraints, startDate: today }, overrides, plan: null, planKey: null };
  }
  return { constraints, overrides, plan, planKey };
}

function toPersisted(state: AppState): Persisted {
  return { version: 1, constraints: state.constraints, overrides: state.overrides, plan: state.plan, planKey: state.planKey };
}

// ── React context ──

interface Store {
  state: AppState;
  dispatch: Dispatch<Action>;
  today: string;
  catalog: Catalog;              // recipe data with the user's overrides
  stale: boolean;                // the plan was solved for different inputs
}

const StoreContext = createContext<Store | null>(null);

export function StateProvider({ today, children }: { today: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, today, (t: string): AppState => ({ ...parseStored(readJson(STATE_KEY), t), solve: { status: 'idle' } }));

  // Persist only what's saved; solve status changes don't trigger a write.
  const { constraints, overrides, plan, planKey } = state;
  useEffect(() => {
    writeJson(STATE_KEY, toPersisted({ constraints, overrides, plan, planKey, solve: { status: 'idle' } }));
  }, [constraints, overrides, plan, planKey]);

  const catalog = useMemo(() => withOverrides(state.overrides), [state.overrides]);
  const key = useMemo(() => inputsKey(state.constraints, state.overrides), [state.constraints, state.overrides]);
  const store = useMemo<Store>(
    () => ({ state, dispatch, today, catalog, stale: state.plan !== null && state.planKey !== key }),
    [state, today, catalog, key],
  );
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StateProvider>');
  return store;
}
