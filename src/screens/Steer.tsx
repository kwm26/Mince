// Steer: move, swap or remove a batch (or add one from the map) and see its
// cost before committing (data-model §7). Apply pins the edit, re-solves the
// rest of the week, then shows the final Δ against the plan before the edit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { AlertIcon } from '../components/icons';
import { proteinText } from '../components/RecipeRow';
import type { PlanEngine } from '../engine';
import {
  changedDays,
  COOK_WORDS,
  deltaPhrase,
  planCookMinutes,
  PROTEIN_WORDS,
  sentence,
  shortDay,
  signed,
  WASTE_WORDS,
  weekdayName,
} from '../lib/format';
import { inputsKey, useStore } from '../state';
import type { Catalog, Constraints, Edit, PlanResult, Preview } from '../types';

export type SteerRequest = { kind: 'move' | 'swap' | 'remove'; batchIndex: number } | { kind: 'edit'; edit: Edit };

export type SolveOutcome = { ok: true; plan: PlanResult } | { ok: false; message: string };

interface Props {
  request: SteerRequest | null;
  engine: PlanEngine;
  solve: (c: Constraints) => Promise<SolveOutcome>;
  onClose: () => void;
}

const TITLES = { move: 'Move a meal', swap: 'Swap a meal', remove: 'Remove a meal', add: 'Add a meal' } as const;

export function SteerSheet({ request, engine, solve, onClose }: Props) {
  const kind = request ? (request.kind === 'edit' ? request.edit.kind : request.kind) : 'move';
  return (
    <BottomSheet open={request !== null} title={TITLES[kind]} eyebrow="Steer" onClose={onClose}>
      {request && <SteerBody request={request} engine={engine} solve={solve} onClose={onClose} />}
    </BottomSheet>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** "Move Steak Fajita Bowls to Thu 5". */
export function editTitle(edit: Edit, plan: PlanResult, catalog: Catalog, startDate: string): string {
  const title = (id: string | undefined) => (id ? catalog.recipeById.get(id)?.title ?? id : 'this meal');
  const batch = 'batchIndex' in edit ? plan.batches[edit.batchIndex] : undefined;
  switch (edit.kind) {
    case 'move':
      return `Move ${title(batch?.recipeId)} to ${shortDay(startDate, edit.toDay)}`;
    case 'swap':
      return `Swap ${title(batch?.recipeId)} for ${title(edit.recipeId)}`;
    case 'remove':
      return `Remove ${title(batch?.recipeId)} from ${batch ? shortDay(startDate, batch.day) : 'the week'}`;
    case 'add':
      return `Add ${title(edit.recipeId)} on ${shortDay(startDate, edit.day)}`;
  }
}

type Outcome = { kind: 'plan'; plan: PlanResult } | { kind: 'error'; message: string };

function SteerBody({ request, engine, solve, onClose }: { request: SteerRequest; engine: PlanEngine; solve: Props['solve']; onClose: () => void }) {
  const { state, dispatch, catalog } = useStore();
  // Snapshot the plan and inputs the edit is made against; the re-solve replaces both.
  const before = useRef({ plan: state.plan, constraints: state.constraints, overrides: state.overrides }).current;
  const plan0 = before.plan;
  const c0 = before.constraints;

  const [edit, setEdit] = useState<Edit | null>(() =>
    request.kind === 'edit' ? request.edit : request.kind === 'remove' ? { kind: 'remove', batchIndex: request.batchIndex } : null,
  );
  const [phase, setPhase] = useState<'preview' | 'applying' | 'done'>('preview');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const preview = useMemo<{ ok: true; value: Preview } | { ok: false; message: string } | null>(() => {
    if (!edit || !plan0) return null;
    try {
      return { ok: true, value: engine.preview(plan0, edit, c0, catalog) };
    } catch (e) {
      return { ok: false, message: errorText(e) };
    }
  }, [edit, plan0, c0, engine, catalog]);

  if (!plan0) {
    return <p className="muted">There's no plan to change yet. Plan the week first.</p>;
  }

  const batchIndex = request.kind === 'edit' ? null : request.batchIndex;
  const batch = batchIndex === null ? undefined : plan0.batches[batchIndex];
  const recipe = batch ? catalog.recipeById.get(batch.recipeId) : undefined;
  const canApply = phase === 'preview' && preview?.ok === true && preview.value.feasible;

  const apply = async () => {
    if (!edit || !canApply) return;
    setPhase('applying');
    let next: Constraints;
    try {
      next = engine.applyEdit(c0, plan0, edit);
    } catch (e) {
      setOutcome({ kind: 'error', message: errorText(e) });
      setPhase('done');
      return;
    }
    dispatch({ type: 'constraints/replace', constraints: next });
    const result = await solve(next);
    setOutcome(result.ok ? { kind: 'plan', plan: result.plan } : { kind: 'error', message: result.message });
    setPhase('done');
  };

  const undo = () => {
    dispatch({ type: 'constraints/replace', constraints: c0 });
    dispatch({ type: 'solve/done', plan: plan0, key: inputsKey(c0, before.overrides) });
    onClose();
  };

  return (
    <div className="sheet-stack">
      {phase === 'preview' && request.kind === 'move' && batch && recipe && (
        <fieldset className="fieldset">
          <legend className="field-label">Cook {recipe.title} on</legend>
          <div className="choice-chips" role="group" aria-label="Day">
            {Array.from({ length: c0.days }, (_, day) =>
              day === batch.day ? null : (
                <button
                  key={day}
                  type="button"
                  className="choice-chip"
                  aria-pressed={edit?.kind === 'move' && edit.toDay === day}
                  onClick={() => setEdit({ kind: 'move', batchIndex: request.batchIndex, toDay: day })}
                >
                  {shortDay(c0.startDate, day)}
                </button>
              ),
            )}
          </div>
          <p className="muted">Now on {weekdayName(c0.startDate, batch.day)}. Pick a day to see what it costs.</p>
        </fieldset>
      )}

      {phase === 'preview' && request.kind === 'swap' && batch && recipe && (
        <fieldset className="fieldset">
          <legend className="field-label">Swap {recipe.title} for</legend>
          <ul className="picker-list swap-list">
            {catalog.recipes
              .filter((r) => r.mealType === recipe.mealType && r.id !== recipe.id && !c0.excluded.includes(r.id))
              .sort((a, b) => (b.macrosPerServing.protein ?? -1) - (a.macrosPerServing.protein ?? -1))
              .map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="picker-row"
                    aria-pressed={edit?.kind === 'swap' && edit.recipeId === r.id}
                    onClick={() => setEdit({ kind: 'swap', batchIndex: request.batchIndex, recipeId: r.id })}
                  >
                    <span className="picker-title">{r.title}</span>
                    <span className="picker-meta">
                      {r.minutes} min · {proteinText(r)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </fieldset>
      )}

      {edit && preview && (
        <section className="preview" aria-live="polite" aria-labelledby="preview-title">
          <p className="eyebrow">Before you apply</p>
          <h3 id="preview-title">{editTitle(edit, plan0, catalog, c0.startDate)}</h3>
          {!preview.ok ? (
            <p className="warn-line">
              <AlertIcon size={18} />
              Couldn't preview this change: {sentence(preview.message)}
            </p>
          ) : (
            <>
              {!preview.value.feasible && (
                <p className="warn-line">
                  <AlertIcon size={18} />
                  This doesn't fit: {sentence(preview.value.reason ?? 'it breaks a limit or a pin')} Pick another option.
                </p>
              )}
              <DeltaRows
                startDate={c0.startDate}
                waste={preview.value.delta.wastePacks}
                proteinByDay={preview.value.delta.proteinByDay}
                cookMinutes={preview.value.delta.cookMinutes}
              />
              <p className="muted">
                Estimated from this edit alone.{' '}
                {edit?.kind === 'remove'
                  ? 'Apply rules this meal out for that day and re-plans the rest of the week.'
                  : 'Apply keeps it as a pin and re-plans the rest of the week.'}
              </p>
            </>
          )}
        </section>
      )}

      {phase === 'done' && outcome && <Resolved outcome={outcome} plan0={plan0} startDate={c0.startDate} />}

      <div className="sheet-actions sheet-actions-split sticky-actions">
        {phase === 'done' ? (
          <>
            <Button variant="secondary" onClick={undo}>
              Undo
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={phase === 'applying'}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={!canApply && phase !== 'applying'} loading={phase === 'applying'} loadingLabel="Re-solving…">
              Apply
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Resolved({ outcome, plan0, startDate }: { outcome: Outcome; plan0: PlanResult; startDate: string }) {
  const { catalog } = useStore();
  const ref = useRef<HTMLElement>(null);
  // The result lands below the preview; bring it into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  if (outcome.kind === 'error') {
    return (
      <section className="resolved" role="alert" ref={ref}>
        <h3>Couldn't re-solve</h3>
        <p className="warn-line">
          <AlertIcon size={18} />
          {sentence(outcome.message)} Your change is saved; tap Plan again to retry, or Undo.
        </p>
      </section>
    );
  }
  const p = outcome.plan;
  if (p.status === 'infeasible') {
    return (
      <section className="resolved" role="alert" ref={ref}>
        <h3>Re-solved: these pins don't fit</h3>
        <p className="muted">{sentence(p.infeasibleReason ?? 'These pins leave no way to cover every meal')} Undo, or change a pin under Pins & limits.</p>
      </section>
    );
  }
  const days = Math.max(p.proteinByDay.length, plan0.proteinByDay.length);
  const proteinByDay = Array.from({ length: days }, (_, d) => (p.proteinByDay[d] ?? 0) - (plan0.proteinByDay[d] ?? 0));
  return (
    <section className="resolved" aria-live="polite" aria-labelledby="resolved-title" ref={ref}>
      <h3 id="resolved-title">Re-solved:</h3>
      <DeltaRows
        startDate={startDate}
        waste={p.wastePacks - plan0.wastePacks}
        proteinByDay={proteinByDay}
        cookMinutes={planCookMinutes(p, catalog.recipeById) - planCookMinutes(plan0, catalog.recipeById)}
      />
      <p className="muted">Against the plan before your edit. The optimizer may have moved other meals to make room.</p>
    </section>
  );
}

interface DeltaRowsProps { startDate: string; waste: number; proteinByDay: number[]; cookMinutes: number; }

/** Three Stat-style rows; each Δ has a sign and words, never colour alone (design-spec §5). */
export function DeltaRows({ startDate, waste, proteinByDay, cookMinutes }: DeltaRowsProps) {
  const changed = changedDays(proteinByDay);
  const total = proteinByDay.reduce((a, b) => a + b, 0);
  const perDay = changed.map((d) => `${shortDay(startDate, d)} ${signed(proteinByDay[d] ?? 0)} g`).join(', ');
  const proteinWords =
    changed.length === 0
      ? 'No change in protein'
      : Math.abs(total) < 0.5
        ? `Same for the week: ${perDay}`
        : `${deltaPhrase(total, PROTEIN_WORDS)}: ${perDay}`;
  return (
    <dl className="delta-rows">
      <DeltaRow label="Waste" value={signed(waste, 1)} unit="packs" words={deltaPhrase(waste, WASTE_WORDS)} />
      <DeltaRow label="Protein, affected days" value={signed(total)} unit="g" words={proteinWords} />
      <DeltaRow label="Cooking time" value={signed(cookMinutes)} unit="min" words={deltaPhrase(cookMinutes, COOK_WORDS)} />
    </dl>
  );
}

function DeltaRow({ label, value, unit, words }: { label: string; value: string; unit: string; words: string }) {
  return (
    <div className="delta-row">
      <dt className="stat-label">{label}</dt>
      <dd className="delta-value">
        <span className="stat-value">
          {value}
          <span className="stat-unit"> {unit}</span>
        </span>
        <span className="delta-words">{words}</span>
      </dd>
    </div>
  );
}
