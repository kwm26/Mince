// Cook: pick today's batch (or any recipe), then a focus mode with big steps,
// highlighted ingredients, timers and a screen wake lock (design-spec §5).

import { Fragment, useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ClockIcon, PauseIcon, PlayIcon, ResetIcon, TimerIcon, XIcon } from '../components/icons';
import { Accent, Dock, ScreenHeader } from '../components/Layout';
import { proteinText, RecipeThumb } from '../components/RecipeRow';
import { ThemeToggle } from '../components/ThemeToggle';
import { batchesCookedOn, droppedOptionals, formatTimer, garnishes, highlightStep, shortName, stepIngredients, timerLabel } from '../lib/cook';
import { longDate, plural, weekdayName } from '../lib/format';
import { formatAmount } from '../lib/kitchen';
import { useStore } from '../state';
import type { Ingredient, Recipe, RecipeIngredient } from '../types';

export interface CookSession {
  recipeId: string;
  day: number | null;      // plan day of the batch, or null for "any recipe"
  step: number;
}

interface Props {
  session: CookSession | null;
  onSession: (session: CookSession | null) => void;
}

export function Cook({ session, onSession }: Props) {
  const { catalog } = useStore();
  const recipe = session ? catalog.recipeById.get(session.recipeId) : undefined;
  if (session && recipe) {
    return <CookMode recipe={recipe} session={session} onStep={(step) => onSession({ ...session, step })} onExit={() => onSession(null)} />;
  }
  return <CookChooser onStart={(recipeId, day) => onSession({ recipeId, day, step: 0 })} />;
}

// ── Choose what to cook ──

function CookChooser({ onStart }: { onStart: (recipeId: string, day: number | null) => void }) {
  const { state, today, catalog } = useStore();
  const c = state.constraints;
  const todays = batchesCookedOn(state.plan, c.startDate, today)
    .map((i) => state.plan!.batches[i]!)
    .filter((b) => catalog.recipeById.has(b.recipeId));
  const first = todays[0];
  const weekday = weekdayName(today, 0);

  return (
    <main className="screen" id="main">
      <ScreenHeader eyebrow={longDate(today)} title={<>Time to <Accent>cook</Accent></>} actions={<ThemeToggle />} />

      <section className="section" aria-labelledby="today-heading">
        <h2 id="today-heading">Today</h2>
        {todays.length === 0 ? (
          <EmptyState title="Nothing to cook today" level={3}>
            {state.plan
              ? `Your plan has no batch on ${weekday}. Pick any recipe below to cook it step by step.`
              : "There's no plan yet. Pick any recipe below to cook it step by step."}
          </EmptyState>
        ) : (
          <ul className="recipe-list">
            {todays.map((b, i) => {
              const r = catalog.recipeById.get(b.recipeId)!;
              return <CookRow key={`${b.recipeId}-${i}`} recipe={r} index={i} note={`From your plan · ${plural(r.servings, 'portion')}`} onStart={() => onStart(r.id, b.day)} />;
            })}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="any-heading">
        <h2 id="any-heading">Cook something else</h2>
        <ul className="recipe-list">
          {catalog.recipes.map((r, i) => (
            <CookRow key={r.id} recipe={r} index={i + 1} onStart={() => onStart(r.id, null)} />
          ))}
        </ul>
      </section>

      {first && (
        <Dock>
          <Button block icon={<PlayIcon size={20} />} onClick={() => onStart(first.recipeId, first.day)}>
            Start cooking
          </Button>
        </Dock>
      )}
    </main>
  );
}

function CookRow({ recipe, index, note, onStart }: { recipe: Recipe; index: number; note?: string; onStart: () => void }) {
  return (
    <li className="recipe-row">
      <RecipeThumb recipe={recipe} index={index} />
      <div className="recipe-body">
        <h3 className="recipe-title">{recipe.title}</h3>
        <p className="recipe-meta">
          <ClockIcon size={14} />
          <span>
            {recipe.minutes} min · {plural(recipe.steps.length, 'step')} · {proteinText(recipe)}
          </span>
        </p>
        {note && <p className="recipe-pinned">{note}</p>}
      </div>
      <IconButton label={`Cook ${recipe.title}`} onClick={onStart}>
        <PlayIcon size={20} />
      </IconButton>
    </li>
  );
}

// ── Focus mode ──

/** Keep the screen on while cooking. Fails silently; the pill shows only when it's granted. */
function useWakeLock(): boolean {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        const s = await navigator.wakeLock.request('screen');
        if (!active) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        setAwake(true);
        s.addEventListener('release', () => {
          if (active) setAwake(false);
        });
      } catch {
        if (active) setAwake(false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!sentinel || sentinel.released) void request();
      } else if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => undefined);
      }
    };
    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };
  }, []);
  return awake;
}

interface CookModeProps {
  recipe: Recipe;
  session: CookSession;
  onStep: (step: number) => void;
  onExit: () => void;
}

function CookMode({ recipe, session, onStep, onExit }: CookModeProps) {
  const { state, today, catalog } = useStore();
  const c = state.constraints;
  const awake = useWakeLock();
  const total = recipe.steps.length;
  const stepIndex = Math.min(Math.max(0, session.step), Math.max(0, total - 1));
  const step = recipe.steps[stepIndex];
  const last = stepIndex >= total - 1;
  const headingRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the new step so screen readers read it and keyboard users stay in place.
  const shownStep = useRef(stepIndex);
  useEffect(() => {
    if (shownStep.current === stepIndex) return;
    shownStep.current = stepIndex;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [stepIndex]);

  const dayName = session.day !== null ? weekdayName(c.startDate, session.day) : weekdayName(today, 0);
  const dropped = session.day !== null ? droppedOptionals(recipe, session.day, catalog.ingredientById, c.frozenLifeDays) : [];
  const droppedIds = new Set(dropped.map((i) => i.id));
  const segments = step ? highlightStep(step.text, recipe, catalog.ingredientById) : [];
  const chips = step ? stepIngredients(step.text, recipe, catalog.ingredientById) : [];
  const leftoverGarnish = last ? garnishes(recipe).filter((g) => !chips.some((x) => x.ingredientId === g.ingredientId)) : [];

  return (
    <main className="screen cook" id="main">
      <header className="cook-top">
        <IconButton label="Exit cook mode" onClick={onExit}>
          <XIcon size={22} />
        </IconButton>
        <div className="cook-heading">
          <p className="cook-eyebrow">Cook mode · {dayName}</p>
          <h1 className="cook-title">{recipe.title}</h1>
        </div>
      </header>

      <div className="progress" role="img" aria-label={`Step ${stepIndex + 1} of ${total}`}>
        {recipe.steps.map((_, i) => (
          <i key={i} data-state={i < stepIndex ? 'done' : i === stepIndex ? 'now' : 'todo'} />
        ))}
      </div>

      {awake && <p className="awake-pill">Screen stays on</p>}

      {dropped.length > 0 && (
        <p className="cook-note">
          Cooked without {dropped.map((i) => shortName(i.name).toLowerCase()).join(', ')}: past its best by {dayName}.
        </p>
      )}

      {step ? (
        <section className="step" aria-labelledby="step-count">
          <p id="step-count" className="step-count" ref={headingRef} tabIndex={-1}>
            <span className="step-num">Step {stepIndex + 1}</span> <span className="step-of">of {total}</span>
          </p>
          <p className="step-text">
            {segments.map((s, i) =>
              s.ingredientId ? (
                <mark key={i}>{s.text}</mark>
              ) : (
                <Fragment key={i}>{s.text}</Fragment>
              ),
            )}
          </p>
          {chips.length > 0 && (
            <ul className="cook-chips" aria-label="In this step">
              {chips.map((ri) => (
                <li key={ri.ingredientId} className="cook-chip">
                  {chipText(ri, catalog.ingredientById, droppedIds)}
                </li>
              ))}
            </ul>
          )}
          {step.timerSec && step.timerSec > 0 && <StepTimer key={`${recipe.id}-${stepIndex}`} seconds={step.timerSec} />}
          {leftoverGarnish.length > 0 && (
            <p className="cook-note">
              To finish, if you have it:{' '}
              {leftoverGarnish.map((g) => shortName(catalog.ingredientById.get(g.ingredientId)?.name ?? g.ingredientId).toLowerCase()).join(', ')}.
            </p>
          )}
        </section>
      ) : (
        <EmptyState title="No steps" level={2}>
          This recipe has no steps in the data. See the source for the method.
        </EmptyState>
      )}

      <Dock split>
        <Button variant="secondary" disabled={stepIndex === 0} onClick={() => onStep(stepIndex - 1)}>
          Back
        </Button>
        <Button onClick={() => (last ? onExit() : onStep(stepIndex + 1))}>{last ? 'Finish' : 'Next step'}</Button>
      </Dock>
    </main>
  );
}

function chipText(ri: RecipeIngredient, ingredientById: ReadonlyMap<string, Ingredient>, dropped: Set<string>): string {
  const ing = ingredientById.get(ri.ingredientId);
  const name = ing ? shortName(ing.name) : ri.ingredientId;
  if (dropped.has(ri.ingredientId)) return `${name} · skip, past its best`;
  if (ri.role === 'garnish') return `${name} · if you have it`;
  const amount = ing && !ing.staple && ri.qty > 0 ? formatAmount(ri.qty, ing.packUnit) : '';
  const optional = ri.role === 'optional' ? 'optional' : '';
  return [name, amount, optional].filter(Boolean).join(' · ');
}

// ── Timer ──

function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [endsAt, setEndsAt] = useState<number | null>(null);   // set while running
  const done = remaining <= 0;

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = (endsAt - Date.now()) / 1000;
      if (left <= 0) {
        setRemaining(0);
        setEndsAt(null);
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          // No vibration: the words say it.
        }
      } else {
        setRemaining(left);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const running = endsAt !== null;
  const start = () => setEndsAt(Date.now() + remaining * 1000);
  const pause = () => setEndsAt(null);
  const reset = () => {
    setEndsAt(null);
    setRemaining(seconds);
  };

  return (
    <div className="timer" role="group" aria-label={`Timer, ${timerLabel(seconds)}`}>
      <p className="timer-num" aria-hidden={running || undefined}>
        {formatTimer(remaining)}
      </p>
      <p className="visually-hidden" aria-live="assertive">
        {done ? "Time's up" : ''}
      </p>
      {done && <p className="timer-done">Time's up</p>}
      <div className="timer-actions">
        {!done && (
          <Button variant="secondary" icon={running ? <PauseIcon size={20} /> : remaining < seconds ? <PlayIcon size={20} /> : <TimerIcon size={20} />} onClick={running ? pause : start}>
            {running ? 'Pause' : remaining < seconds ? 'Resume' : 'Start timer'}
          </Button>
        )}
        {(running || remaining < seconds) && (
          <IconButton label="Reset timer" onClick={reset}>
            <ResetIcon size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
