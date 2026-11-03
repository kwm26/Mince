// Plan: Pin → Solve → Steer (brief, data-model §3–§8). The optimizer is
// injected as a PlanEngine; this screen never computes plan numbers itself.

import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, IconButton, TextLink } from '../components/Button';
import { DayRow } from '../components/DayRow';
import { EmptyState } from '../components/EmptyState';
import { AlertIcon, CalendarIcon, ChevronRightIcon, ClockIcon, InfoIcon, PlusIcon, XIcon } from '../components/icons';
import { Accent, Dock, ScreenHeader, Segmented } from '../components/Layout';
import { Meter } from '../components/Meter';
import { PrioritySlider } from '../components/PrioritySlider';
import { Stat } from '../components/Stat';
import { Stepper } from '../components/Stepper';
import { ThemeToggle } from '../components/ThemeToggle';
import { UseSoonTag } from '../components/UseSoonTag';
import type { PlanEngine } from '../engine';
import { shortName } from '../lib/cook';
import { dayLabel, daysBetween } from '../lib/dates';
import { average, longDate, packs, percent, plural, shortDay, weekdayName } from '../lib/format';
import { formatAmount, isPerishable } from '../lib/kitchen';
import { levelWeight, levelWord, weightLevel, type Level } from '../lib/priorities';
import { inputsKey, PROTEIN_MAX, PROTEIN_MIN, useStore } from '../state';
import type { Catalog, Constraints, Edit, IngredientOverride, MealType, PlanResult, Weights } from '../types';
import { ExampleWeekSheet, PinSheet } from './sheets';
import { errorText, SteerSheet, type SolveOutcome, type SteerRequest } from './Steer';

export type PlanView = 'week' | 'map';

/** What a map rendered in the Map view can read and do. */
export interface PlanMapApi {
  constraints: Constraints;
  plan: PlanResult | null;
  overrides: Record<string, IngredientOverride>;
  catalog: Catalog;
  today: string;
  focusId: string | null;               // node to focus, from Kitchen's "See on map"
  previewEdit: (edit: Edit) => void;    // opens the Steer preview sheet (e.g. add a recipe from the map)
}

export interface PlanProps {
  engine: PlanEngine;
  mapSlot?: ReactNode | ((api: PlanMapApi) => ReactNode);
  view?: PlanView;                      // controlled Week / Map toggle (optional)
  onViewChange?: (view: PlanView) => void;
  mapFocus?: string | null;
}

let solveSeq = 0;

/** Run the engine and store the result; a newer solve wins over an older one. */
function useSolve(engine: PlanEngine) {
  const { state, dispatch } = useStore();
  const overrides = state.overrides;
  return useCallback(
    async (c: Constraints): Promise<SolveOutcome> => {
      const id = ++solveSeq;
      dispatch({ type: 'solve/start' });
      try {
        const plan = await engine.solve(c, overrides);
        if (id === solveSeq) dispatch({ type: 'solve/done', plan, key: inputsKey(c, overrides) });
        return { ok: true, plan };
      } catch (e) {
        const message = errorText(e);
        if (id === solveSeq) dispatch({ type: 'solve/error', message });
        return { ok: false, message };
      }
    },
    [engine, dispatch, overrides],
  );
}

const LIMITS = [0, 15, 20, 30, 45, 60, 90, 120];

export function Plan({ engine, mapSlot, view: viewProp, onViewChange, mapFocus = null }: PlanProps) {
  const { state, dispatch, today, catalog, stale } = useStore();
  const c = state.constraints;
  const plan = state.plan;
  const loading = state.solve.status === 'loading';
  const solve = useSolve(engine);

  const [ownView, setOwnView] = useState<PlanView>('week');
  const view = viewProp ?? ownView;
  const setView = (v: PlanView) => {
    setOwnView(v);
    onViewChange?.(v);
  };
  const [steer, setSteer] = useState<SteerRequest | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [weeksOpen, setWeeksOpen] = useState(false);
  const pinsHeading = useRef<HTMLHeadingElement>(null);

  const runSolve = () => void solve(c);
  const editPins = () => {
    setView('week');
    requestAnimationFrame(() => {
      pinsHeading.current?.scrollIntoView({ block: 'start' });
      pinsHeading.current?.focus({ preventScroll: true });
    });
  };

  const valid = plan !== null && plan.status !== 'infeasible';
  const startedDaysAgo = daysBetween(c.startDate, today);

  const api: PlanMapApi = {
    constraints: c,
    plan,
    overrides: state.overrides,
    catalog,
    today,
    focusId: mapFocus,
    previewEdit: (edit) => setSteer({ kind: 'edit', edit }),
  };

  return (
    <main className="screen" id="main" aria-busy={loading || undefined}>
      <ScreenHeader eyebrow={`Week of ${longDate(c.startDate)}`} title={<>Your <Accent>week</Accent></>} actions={<ThemeToggle />} />

      <Segmented
        label="Show the plan as"
        options={[
          { id: 'week', label: 'Week' },
          { id: 'map', label: 'Map' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'map' ? (
        mapSlot ? (
          <div className="map-slot">{typeof mapSlot === 'function' ? mapSlot(api) : mapSlot}</div>
        ) : (
          <EmptyState title="No map yet" action={<Button onClick={() => setView('week')}>Back to the week</Button>}>
            The ingredient map shows which recipes share what. It isn't connected in this build.
          </EmptyState>
        )
      ) : (
        <>
          {plan && startedDaysAgo > 0 && (
            <p className="notice">
              <CalendarIcon size={18} />
              <span>
                This plan started {weekdayName(c.startDate, 0)}.{' '}
                <TextLink onClick={() => dispatch({ type: 'week/startToday', today })}>Start a new week today</TextLink>
              </span>
            </p>
          )}

          <PlanStatus
            loading={loading}
            plan={plan}
            error={state.solve.status === 'error' ? state.solve.message : null}
            onRetry={runSolve}
            onEditPins={editPins}
            onPin={() => setPinOpen(true)}
            onExamples={() => setWeeksOpen(true)}
          />

          {valid && plan && (
            <>
              {stale && !loading && (
                <p className="notice">
                  <InfoIcon size={18} />
                  <span>You've changed pins, limits or your kitchen since this plan. Plan again to update it.</span>
                </p>
              )}
              <PlanStats plan={plan} c={c} />
            </>
          )}

          <Priorities
            weights={c.weights}
            disabled={loading}
            onCommit={(weights) => {
              dispatch({ type: 'weights/set', weights });
              if (plan) void solve({ ...c, weights });
            }}
          />

          {valid && plan && <WeekDays plan={plan} c={c} catalog={catalog} onSteer={setSteer} busy={loading} />}
          {valid && plan && <Shopping plan={plan} c={c} catalog={catalog} />}

          <PinsAndLimits headingRef={pinsHeading} onPin={() => setPinOpen(true)} onExamples={() => setWeeksOpen(true)} />
        </>
      )}

      <Dock>
        <Button block loading={loading} loadingLabel="Planning…" onClick={runSolve}>
          {plan ? 'Plan again' : 'Plan my week'}
        </Button>
      </Dock>

      <SteerSheet request={steer} engine={engine} solve={solve} onClose={() => setSteer(null)} />
      <PinSheet open={pinOpen} recipeId={null} onClose={() => setPinOpen(false)} />
      <ExampleWeekSheet open={weeksOpen} onClose={() => setWeeksOpen(false)} />
    </main>
  );
}

// ── States ──

interface StatusProps {
  loading: boolean;
  plan: PlanResult | null;
  error: string | null;
  onRetry: () => void;
  onEditPins: () => void;
  onPin: () => void;
  onExamples: () => void;
}

/** Loading, error, infeasible and empty states (CLAUDE.md, design-spec §5). */
function PlanStatus({ loading, plan, error, onRetry, onEditPins, onPin, onExamples }: StatusProps) {
  if (loading && !plan) {
    return (
      <div className="empty-state" role="status">
        <h2>Planning your week…</h2>
        <p className="muted">Choosing meals that share ingredients, inside your pins and cooking limits.</p>
      </div>
    );
  }
  if (error && !loading) {
    return (
      <EmptyState title="Couldn't plan the week" tone="error" action={<Button onClick={onRetry}>Retry</Button>}>
        {`${error}. Your pins, limits and kitchen are saved.`}
      </EmptyState>
    );
  }
  if (plan?.status === 'infeasible') {
    return (
      <EmptyState title="These pins don't fit" action={<Button onClick={onEditPins}>Edit pins</Button>}>
        {`${plan.infeasibleReason ?? 'These pins leave no way to cover every meal.'} Unpin a meal, move it to a longer day, or raise that day's cooking limit.`}
      </EmptyState>
    );
  }
  if (!plan && !loading) {
    return (
      <EmptyState
        title="No meals planned"
        action={
          <Button icon={<PlusIcon size={20} />} onClick={onPin}>
            Pin a meal
          </Button>
        }
        extra={<TextLink onClick={onExamples}>Load an example week →</TextLink>}
      >
        Pin the meals you want, set your limits, then plan. Mince fills the rest of the week around shared ingredients.
      </EmptyState>
    );
  }
  return null;
}

// ── Stats ──

function PlanStats({ plan, c }: { plan: PlanResult; c: Constraints }) {
  const avg = average(plan.proteinByDay);
  const hitDays = plan.proteinByDay.filter((p) => p >= c.proteinPerDay - 0.5).length;
  const short = Math.round(plan.proteinShortfall);
  return (
    <section className="section" aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="visually-hidden">
        This week at a glance
      </h2>
      <div className="plan-stats">
        <Stat label="Protein per day" value={Math.round(avg)} unit={`g avg, target ${c.proteinPerDay} g`} className="stat-wide">
          <Meter value={avg} max={c.proteinPerDay} label="Average protein per day against your target" valueText={`${Math.round(avg)} of ${c.proteinPerDay} g`} />
          <span className="stat-note">
            {short > 0 && <UseSoonTag>{`${short} g/day short`}</UseSoonTag>}
            <span className="muted">
              Target hit on {hitDays} of {plan.proteinByDay.length} days
            </span>
          </span>
        </Stat>
        <Stat label="Packs wasted" value={packs(plan.wastePacks)} unit={plan.wastePacks === 1 ? 'pack' : 'packs'} />
        <Stat label="Reuse rate" value={percent(plan.reuseRate)}>
          <span className="muted">of perishables go into 2+ recipes</span>
        </Stat>
      </div>
      {short > 0 && (
        <p className="muted">
          A valid plan, but {short} g/day short of {c.proteinPerDay} g: the recipes can't reach it inside these pins and limits. Raise the Protein
          priority, or unpin a low-protein meal.
        </p>
      )}
      <p className="meta">
        {plan.status === 'optimal' ? `Optimal plan · solved in ${Math.round(plan.solveMs)} ms` : 'Best plan found within the 2-second limit'}
      </p>
    </section>
  );
}

// ── Priorities ──

const PRIORITIES: { key: keyof Weights; label: string; hint: string }[] = [
  { key: 'waste', label: 'Waste', hint: 'High: use up every pack, even if meals repeat.' },
  { key: 'protein', label: 'Protein', hint: 'High: reach your target before anything else.' },
  { key: 'cookTime', label: 'Cooking time', hint: 'High: shorter cooks, even if a little more goes to waste.' },
];

function Priorities({ weights, disabled, onCommit }: { weights: Weights; disabled: boolean; onCommit: (w: Weights) => void }) {
  const [open, setOpen] = useState(false);
  const summary = PRIORITIES.map((p) => `${p.label} ${levelWord(weightLevel(p.key, weights[p.key])).toLowerCase()}`).join(' · ');
  return (
    <section className="section priorities" aria-labelledby="priorities-heading">
      <h2 id="priorities-heading">
        <button type="button" className="disclosure" aria-expanded={open} aria-controls="priorities-body" onClick={() => setOpen(!open)}>
          <span className="disclosure-text">
            <span>Priorities</span>
            <span className="disclosure-summary">{summary}</span>
          </span>
          <ChevronRightIcon size={22} />
        </button>
      </h2>
      {open && (
        <div id="priorities-body" className="priorities-body">
          <p className="muted">What matters most this week. Releasing a slider plans again.</p>
          {PRIORITIES.map((p) => (
            <PrioritySlider
              key={p.key}
              label={p.label}
              hint={p.hint}
              level={weightLevel(p.key, weights[p.key])}
              disabled={disabled}
              onCommit={(level: Level) => onCommit({ ...weights, [p.key]: levelWeight(p.key, level) })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Day rows ──

interface WeekDaysProps {
  plan: PlanResult;
  c: Constraints;
  catalog: Catalog;
  onSteer: (r: SteerRequest) => void;
  busy: boolean;
}

function WeekDays({ plan, c, catalog, onSteer, busy }: WeekDaysProps) {
  // Perishables used by two or more different recipes in this plan: the shared ones.
  const shared = useMemo(() => {
    const users = new Map<string, Set<string>>();
    for (const b of plan.batches) {
      const r = catalog.recipeById.get(b.recipeId);
      for (const ri of r?.ingredients ?? []) {
        if (ri.role === 'garnish') continue;
        const set = users.get(ri.ingredientId) ?? new Set<string>();
        set.add(b.recipeId);
        users.set(ri.ingredientId, set);
      }
    }
    return new Set(
      [...users].filter(([id, set]) => {
        const ing = catalog.ingredientById.get(id);
        return set.size >= 2 && ing !== undefined && isPerishable(ing);
      }).map(([id]) => id),
    );
  }, [plan, catalog]);

  return (
    <section className="section" aria-labelledby="days-heading">
      <h2 id="days-heading">Day by day</h2>
      <ul className="day-list">
        {Array.from({ length: c.days }, (_, day) => {
          const { weekday, date } = dayLabel(c.startDate, day);
          const batches = plan.batches.map((b, i) => ({ b, i })).filter(({ b }) => b.day === day);
          const notes = plan.notes.filter((n) => n.day === day);
          const protein = plan.proteinByDay[day] ?? 0;
          const limit = c.maxCookMinutes[day] ?? 0;
          return (
            <DayRow key={day} weekday={weekday} date={date}>
              {day === 0 && <span className="eyebrow">Shopping day</span>}
              <p className="day-summary">
                <strong>{Math.round(protein)} g protein</strong>
                {protein < c.proteinPerDay - 0.5 && <span> · {Math.round(c.proteinPerDay - protein)} g under target</span>}
                <span> · {limit === 0 ? 'no cooking' : `up to ${limit} min cooking`}</span>
              </p>
              {batches.map(({ i }) => (
                <BatchBlock key={i} index={i} plan={plan} c={c} catalog={catalog} shared={shared} onSteer={onSteer} busy={busy} />
              ))}
              <EatList plan={plan} day={day} catalog={catalog} />
              {notes.map((n) => (
                <p key={n.text} className="day-note">
                  <ClockIcon size={16} />
                  {n.text}
                </p>
              ))}
            </DayRow>
          );
        })}
      </ul>
    </section>
  );
}

function BatchBlock({ index, plan, c, catalog, shared, onSteer, busy }: { index: number; plan: PlanResult; c: Constraints; catalog: Catalog; shared: Set<string>; onSteer: (r: SteerRequest) => void; busy: boolean }) {
  const b = plan.batches[index]!;
  const r = catalog.recipeById.get(b.recipeId);
  if (!r) return null;
  const eatenDays = [...new Set(plan.meals.filter((m) => m.batchIndex === index && !m.frozen).map((m) => m.day))].sort((x, y) => x - y);
  const ingredients = r.ingredients
    .filter((ri) => ri.role !== 'garnish' && !catalog.ingredientById.get(ri.ingredientId)?.staple)
    .map((ri) => ({ id: ri.ingredientId, name: shortName(catalog.ingredientById.get(ri.ingredientId)?.name ?? ri.ingredientId), shared: shared.has(ri.ingredientId) }));
  const sharedChips = ingredients.filter((x) => x.shared);
  const others = ingredients.length - sharedChips.length;
  const eaten = eatenDays.map((d) => dayLabel(c.startDate, d).weekday.slice(0, 1) + dayLabel(c.startDate, d).weekday.slice(1, 3).toLowerCase());
  return (
    <article className="batch" aria-labelledby={`batch-${index}`}>
      <h3 id={`batch-${index}`}>{r.title}</h3>
      <p className="batch-meta">
        Cook {r.minutes} min · {plural(r.servings, 'portion')}
        {eaten.length > 0 && ` · eaten ${eaten.join(', ')}`}
        {b.frozenPortions > 0 && ` · freeze ${b.frozenPortions}`}
        {b.pinned && ' · '}
        {b.pinned && <span className="pinned-tag">Pinned</span>}
      </p>
      {ingredients.length > 0 && (
        <ul className="mini-chips" aria-label="Shared ingredients">
          {sharedChips.map((x) => (
            <li key={x.id} className="mini-chip" data-shared="true">
              {x.name}
            </li>
          ))}
          {others > 0 && <li className="mini-chip">{sharedChips.length === 0 ? plural(others, 'ingredient') : `+${others} more`}</li>}
        </ul>
      )}
      {b.reason && b.reason.length > 0 && (
        <div className="reasons">
          <p className="reasons-label">Why it's here</p>
          <ul>
            {b.reason.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="steer-links" role="group" aria-label={`Change ${r.title}`}>
        <TextLink disabled={busy} onClick={() => onSteer({ kind: 'move', batchIndex: index })}>
          Move
        </TextLink>
        <TextLink disabled={busy} onClick={() => onSteer({ kind: 'swap', batchIndex: index })}>
          Swap
        </TextLink>
        <TextLink disabled={busy} onClick={() => onSteer({ kind: 'remove', batchIndex: index })}>
          Remove
        </TextLink>
      </div>
    </article>
  );
}

const MEAL_WORDS: Record<MealType, string> = { breakfast: 'Breakfast', main: 'Main' };

function EatList({ plan, day, catalog }: { plan: PlanResult; day: number; catalog: Catalog }) {
  const groups = new Map<string, { mealType: MealType; title: string; count: number; frozen: number }>();
  for (const m of plan.meals) {
    if (m.day !== day) continue;
    const b = plan.batches[m.batchIndex];
    const key = `${m.mealType}:${m.batchIndex}`;
    const g = groups.get(key) ?? { mealType: m.mealType, title: catalog.recipeById.get(b?.recipeId ?? '')?.title ?? 'Unknown', count: 0, frozen: 0 };
    g.count += 1;
    if (m.frozen) g.frozen += 1;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => (a.mealType === b.mealType ? 0 : a.mealType === 'breakfast' ? -1 : 1));
  if (list.length === 0) return <p className="muted">Nothing to eat from the plan.</p>;
  return (
    <div className="eat">
      <p className="reasons-label">Eat</p>
      <ul className="eat-list">
        {list.map((g) => (
          <li key={`${g.mealType}-${g.title}`}>
            <span className="eat-type">{MEAL_WORDS[g.mealType]}</span> {g.title}
            {g.count > 1 && ` ×${g.count}`}
            {g.frozen > 0 && <span className="muted"> · {g.frozen === g.count ? 'from the freezer' : `${g.frozen} from the freezer`}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Shopping ──

function Shopping({ plan, c, catalog }: { plan: PlanResult; c: Constraints; catalog: Catalog }) {
  const rows = plan.shopping
    .map((s) => ({ ...s, ing: catalog.ingredientById.get(s.ingredientId) }))
    .filter((s) => s.packs > 0)
    .sort((a, b) => (a.ing?.name ?? '').localeCompare(b.ing?.name ?? ''));
  return (
    <section className="section" aria-labelledby="shop-heading">
      <h2 id="shop-heading">Shopping list</h2>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to buy" level={3}>
          Everything this week comes from your kitchen.
        </EmptyState>
      ) : (
        <>
          <p className="muted">Buy on {weekdayName(c.startDate, 0)}, the shopping day.</p>
          <ul className="pantry-list">
            {rows.map((s) => (
              <li key={s.ingredientId} className="shop-row">
                <span className="pantry-name">{s.ing ? shortName(s.ing.name) : s.ingredientId}</span>
                <span className="pantry-amount">
                  {s.packs} × {s.ing ? formatAmount(s.ing.packSize, s.ing.packUnit) : 'pack'}
                </span>
                {s.freeze && <span className="mini-chip shop-freeze">Freeze on shopping day</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ── Pins & limits ──

function PinsAndLimits({ headingRef, onPin, onExamples }: { headingRef: RefObject<HTMLHeadingElement>; onPin: () => void; onExamples: () => void }) {
  const { state, dispatch, catalog } = useStore();
  const c = state.constraints;
  const pins = [...c.pins].sort((a, b) => a.day - b.day);
  const pinnedMinutes = Array<number>(c.days).fill(0);
  for (const p of c.pins) pinnedMinutes[p.day] = (pinnedMinutes[p.day] ?? 0) + (catalog.recipeById.get(p.recipeId)?.minutes ?? 0);
  const conflicts = pinnedMinutes
    .map((m, d) => ({ d, m, limit: c.maxCookMinutes[d] ?? 0 }))
    .filter((x) => x.m > x.limit);

  return (
    <section className="section" aria-labelledby="pins-heading">
      <h2 id="pins-heading" ref={headingRef} tabIndex={-1}>
        Pins & limits
      </h2>
      <Stepper
        label="Protein target per day"
        value={c.proteinPerDay}
        unit="g"
        min={PROTEIN_MIN}
        max={PROTEIN_MAX}
        step={5}
        onChange={(grams) => dispatch({ type: 'protein/set', grams })}
      />

      <div className="subsection">
        <h3>Pinned meals</h3>
        {pins.length === 0 ? (
          <p className="muted">No pins. Mince picks every meal; pin the ones you want for sure.</p>
        ) : (
          <ul className="pin-list">
            {pins.map((p) => {
              const r = catalog.recipeById.get(p.recipeId);
              const title = r?.title ?? p.recipeId;
              return (
                <li key={`${p.recipeId}-${p.day}`} className="pin-row">
                  <span className="pin-text">
                    <strong>{title}</strong>
                    <span className="muted">
                      {shortDay(c.startDate, p.day)} · {r?.minutes ?? '?'} min
                    </span>
                  </span>
                  <IconButton label={`Unpin ${title} from ${shortDay(c.startDate, p.day)}`} onClick={() => dispatch({ type: 'pin/remove', pin: p })}>
                    <XIcon size={20} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
        {conflicts.map((x) => (
          <p key={x.d} className="warn-line">
            <AlertIcon size={18} />
            {shortDay(c.startDate, x.d)}: pinned meals need {x.m} min, {x.limit === 0 ? 'and it is a no-cooking day' : `the limit is ${x.limit}`}.
          </p>
        ))}
        <Button variant="secondary" icon={<PlusIcon size={20} />} onClick={onPin}>
          Pin a meal
        </Button>
      </div>

      <div className="subsection">
        <h3>Cooking time</h3>
        <p className="muted">The most you'll cook each day. Busy days get quick recipes, or none.</p>
        <ul className="limit-list">
          {Array.from({ length: c.days }, (_, day) => {
            const value = c.maxCookMinutes[day] ?? 0;
            const options = LIMITS.includes(value) ? LIMITS : [...LIMITS, value].sort((a, b) => a - b);
            const id = `limit-${day}`;
            return (
              <li key={day} className="limit-row">
                <label htmlFor={id} className="limit-day">
                  {shortDay(c.startDate, day)}
                  {day === 0 && <span className="muted"> · shopping</span>}
                </label>
                <select id={id} className="field-input field-select" value={value} onChange={(e) => dispatch({ type: 'cookMinutes/set', day, minutes: Number(e.target.value) })}>
                  {options.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? 'No cooking' : `Up to ${m} min`}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      </div>

      {c.excludedSlots.length > 0 && (
        <p className="muted">
          {plural(c.excludedSlots.length, 'removed meal')} stay off {c.excludedSlots.length === 1 ? 'its day' : 'their days'}.{' '}
          <TextLink onClick={() => dispatch({ type: 'constraints/replace', constraints: { ...c, excludedSlots: [] } })}>Allow again</TextLink>
        </p>
      )}

      <div className="link-row">
        <TextLink onClick={onExamples}>Load an example week →</TextLink>
      </div>
    </section>
  );
}
