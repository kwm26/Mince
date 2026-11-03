import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { LensContext, Preview } from '../../types';
import { ChoiceChips } from '../ChoiceChips';
import { XIcon } from '../icons';
import { formatAmount } from '../../lib/kitchen';
import { categoryLabel } from '../../lib/labels';
import { displayName, mapData, mapLabel, phrase, signedPacks, weekday } from '../../lib/lenses';
import { shared, type Graph } from '../../lib/graph';

interface Props {
  ctx: LensContext;
  graph: Graph;                         // with single-use ingredients
  selection: string[];                  // one node, or two recipes
  onClose: () => void;
  onFocus: (ingredientId: string) => void;
  previewAdd?: (recipeId: string, day: number) => Preview | null;
  onAddToPlan?: (recipeId: string, day: number) => void;
}

/** Reading-layer bottom sheet for the tapped node(s) (design-spec §11). Non-modal: the map stays live. */
export function NodeSheet(props: Props) {
  const { ctx, selection } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const key = selection.join('+');

  useEffect(() => {
    headingRef.current?.focus();
  }, [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  const [a, b] = selection;
  if (!a) return null;

  let body;
  if (b) body = <Compare {...props} a={a} b={b} headingRef={headingRef} />;
  else if (ctx.catalog.recipeById.has(a)) body = <RecipeFacts key={a} {...props} id={a} headingRef={headingRef} />;
  else body = <IngredientFacts {...props} id={a} headingRef={headingRef} />;

  return (
    <section className="map-sheet" role="dialog" aria-modal="false" aria-labelledby="map-sheet-title">
      <button type="button" className="map-icon-btn map-sheet-close" aria-label="Close details" onClick={props.onClose}>
        <XIcon size={20} />
      </button>
      {body}
    </section>
  );
}

type Part = Props & { headingRef: RefObject<HTMLHeadingElement> };

function RecipeFacts({ ctx, graph, id, headingRef, previewAdd, onAddToPlan, onClose }: Part & { id: string }) {
  const recipe = ctx.catalog.recipeById.get(id);
  const family = mapData(ctx.catalog).families.byRecipe[id];
  const plannedDays = (ctx.plan?.status !== 'infeasible' ? ctx.plan?.batches ?? [] : [])
    .filter((x) => x.recipeId === id)
    .map((x) => weekday(ctx.constraints.startDate, x.day));
  const others = useMemo(
    () =>
      ctx.catalog.recipes
        .filter((r) => r.id !== id)
        .map((r) => ({ id: r.id, shared: shared(graph, id, r.id) }))
        .filter((x) => x.shared.length > 0)
        .sort((x, y) => y.shared.length - x.shared.length || displayName(ctx.catalog, x.id).localeCompare(displayName(ctx.catalog, y.id)))
        .slice(0, 6),
    [ctx.catalog, graph, id],
  );
  if (!recipe) return null;
  const protein = recipe.macrosPerServing.protein;

  return (
    <>
      <p className="eyebrow">Recipe{family && family !== 'standalone' ? ` · ${family} family` : ''}</p>
      <h3 id="map-sheet-title" ref={headingRef} tabIndex={-1}>
        {recipe.title}
      </h3>
      <p className="meta">
        {recipe.minutes} min · {protein === null ? 'macros not published' : `${protein} g protein per serving`} · serves {recipe.servings}
      </p>
      {plannedDays.length > 0 && <p className="muted">In your plan on {plannedDays.join(', ')}.</p>}
      <h4 className="map-sheet-sub">Shares ingredients with</h4>
      {others.length === 0 ? (
        <p className="muted">No other recipe uses its fresh ingredients.</p>
      ) : (
        <ul className="map-rows">
          {others.map((o) => (
            <li key={o.id}>
              <span className="map-row-title">{mapLabel(ctx.catalog, o.id)}</span>
              <span className="muted">{o.shared.map((i) => phrase(ctx.catalog, i)).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Tap another recipe to see what the two share.</p>
      {onAddToPlan && (
        <AddToPlan ctx={ctx} recipeId={id} previewAdd={previewAdd} onAddToPlan={onAddToPlan} onDone={onClose} />
      )}
    </>
  );
}

function IngredientFacts({ ctx, graph, id, headingRef, onFocus }: Part & { id: string }) {
  const ing = ctx.catalog.ingredientById.get(id);
  if (!ing) return null;
  const users = graph.ingredientRecipes.get(id) ?? [];
  return (
    <>
      <p className="eyebrow">Ingredient · in {users.length === 1 ? '1 recipe' : `${users.length} recipes`}</p>
      <h3 id="map-sheet-title" ref={headingRef} tabIndex={-1}>
        {ing.name}
      </h3>
      <p className="meta">
        {categoryLabel(ing.category)} · keeps {ing.shelfLifeDays === 1 ? '1 day' : `${ing.shelfLifeDays} days`} ·{' '}
        {ing.packUnit === 'each'
          ? ing.packSize === 1
            ? 'sold singly'
            : `sold in packs of ${ing.packSize}`
          : `sold as ${formatAmount(ing.packSize, ing.packUnit)}`}
        {ing.freezable ? ' · can be frozen raw' : ''}
      </p>
      {ing.estimated && <p className="muted">Shelf life and pack size are estimates, not from a source.</p>}
      <h4 className="map-sheet-sub">Used in</h4>
      <ul className="map-rows">
        {users.map((r) => (
          <li key={r}>
            <span className="map-row-title">{displayName(ctx.catalog, r)}</span>
          </li>
        ))}
      </ul>
      <div className="map-actions">
        <button type="button" className="map-btn map-btn--primary" onClick={() => onFocus(id)}>
          Show recipes using this
        </button>
      </div>
    </>
  );
}

function Compare({ ctx, graph, a, b, headingRef }: Part & { a: string; b: string }) {
  const both = shared(graph, a, b);
  return (
    <>
      <p className="eyebrow">Compare</p>
      <h3 id="map-sheet-title" ref={headingRef} tabIndex={-1}>
        {mapLabel(ctx.catalog, a)} + {mapLabel(ctx.catalog, b)}
      </h3>
      {both.length === 0 ? (
        <p className="muted">They share no ingredients: cooking both in one week buys more packs.</p>
      ) : (
        <>
          <p className="meta">
            Share {both.length === 1 ? '1 ingredient' : `${both.length} ingredients`}, so the same packs can go into both.
          </p>
          <ul className="map-rows">
            {both.map((i) => (
              <li key={i}>
                <span className="map-row-title">{displayName(ctx.catalog, i)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted">Tap either recipe again to drop it from the comparison.</p>
    </>
  );
}

function AddToPlan({
  ctx,
  recipeId,
  previewAdd,
  onAddToPlan,
  onDone,
}: {
  ctx: LensContext;
  recipeId: string;
  previewAdd?: (recipeId: string, day: number) => Preview | null; // absent: the host previews after the hand-off
  onAddToPlan: (recipeId: string, day: number) => void;
  onDone: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const preview = useMemo(() => (day === null || !previewAdd ? undefined : previewAdd(recipeId, day)), [day, previewAdd, recipeId]);
  const days = Array.from({ length: ctx.constraints.days }, (_, d) => d);

  if (!picking) {
    return (
      <div className="map-actions">
        <button type="button" className="map-btn map-btn--primary" onClick={() => setPicking(true)}>
          Add to plan
        </button>
      </div>
    );
  }

  const dayName = day === null ? '' : weekday(ctx.constraints.startDate, day);
  return (
    <div className="map-add">
      <h4 className="map-sheet-sub">Which day?</h4>
      <ChoiceChips
        label="Day to add it"
        options={days.map((d) => ({ id: String(d), label: weekday(ctx.constraints.startDate, d) }))}
        value={day === null ? '' : String(day)}
        onChange={(id) => setDay(Number(id))}
      />
      {previewAdd && day !== null && preview === null && (
        <p className="map-warn">No preview for {dayName}: there’s no batch it can swap in for there.</p>
      )}
      {preview && <PreviewRows ctx={ctx} preview={preview} />}
      <div className="map-actions map-actions--split">
        <button
          type="button"
          className="map-btn map-btn--secondary"
          onClick={() => {
            setPicking(false);
            setDay(null);
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="map-btn map-btn--primary"
          disabled={day === null || (previewAdd !== undefined && (!preview || !preview.feasible))}
          onClick={() => {
            if (day === null) return;
            onAddToPlan(recipeId, day);
            onDone();
          }}
        >
          {day === null ? 'Pick a day' : previewAdd ? `Add to ${dayName}` : `See the cost for ${dayName}`}
        </button>
      </div>
    </div>
  );
}

/** Δ waste, Δ protein on the affected days and Δ cooking time, each with a sign and a word (design-spec §5 Steer). */
function PreviewRows({ ctx, preview }: { ctx: LensContext; preview: Preview }) {
  const { wastePacks, proteinByDay, cookMinutes } = preview.delta;
  const waste =
    Math.abs(wastePacks) < 0.05 ? 'No change' : `${signedPacks(wastePacks)}, ${wastePacks < 0 ? 'less' : 'more'} waste`;
  const proteinDays = proteinByDay
    .map((g, d) => ({ g: Math.round(g), d }))
    .filter((x) => x.g !== 0)
    .map((x) => `${x.g > 0 ? '+' : '−'}${Math.abs(x.g)} g on ${weekday(ctx.constraints.startDate, x.d)}`);
  const cook =
    Math.round(cookMinutes) === 0
      ? 'No change'
      : `${cookMinutes > 0 ? '+' : '−'}${Math.abs(Math.round(cookMinutes))} min, ${cookMinutes > 0 ? 'more' : 'less'} cooking`;

  return (
    <>
      {!preview.feasible && <p className="map-warn">{preview.reason ?? 'This breaks one of your limits.'}</p>}
      <dl className="map-preview">
        <div>
          <dt>Waste</dt>
          <dd>{waste}</dd>
        </div>
        <div>
          <dt>Protein</dt>
          <dd>{proteinDays.length === 0 ? 'No change' : proteinDays.join(', ')}</dd>
        </div>
        <div>
          <dt>Cooking time</dt>
          <dd>{cook}</dd>
        </div>
      </dl>
    </>
  );
}
