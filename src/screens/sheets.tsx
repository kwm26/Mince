// Sheets shared by the Kitchen and Plan screens: pin a recipe on days, the
// example fridges and weeks (data-model §13), and a recipe's details.

import { useMemo, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Button, ExternalLink, TextLink } from '../components/Button';
import { AlertIcon, ClockIcon, SearchIcon } from '../components/icons';
import { OverlapPips, proteinText, RecipeThumb } from '../components/RecipeRow';
import { fridges, weeks } from '../lib/data';
import { shortName } from '../lib/cook';
import { formatAmount, isPerishable } from '../lib/kitchen';
import { plural, shortDay } from '../lib/format';
import { useStore } from '../state';
import type { Recipe } from '../types';

// ── Pin a recipe on days ──

interface PinSheetProps {
  open: boolean;
  recipeId: string | null;        // null: choose a recipe first
  onClose: () => void;
}

/** Pin a recipe on one or more days. Pins are constraints: the next Plan keeps them. */
export function PinSheet({ open, recipeId, onClose }: PinSheetProps) {
  return (
    <BottomSheet open={open} title={recipeId ? 'Pin on which days?' : 'Pin a meal'} eyebrow="Pin" onClose={onClose}>
      <PinSheetBody initialRecipeId={recipeId} onClose={onClose} />
    </BottomSheet>
  );
}

function PinSheetBody({ initialRecipeId, onClose }: { initialRecipeId: string | null; onClose: () => void }) {
  const { state, dispatch, catalog } = useStore();
  const c = state.constraints;
  const [recipeId, setRecipeId] = useState<string | null>(initialRecipeId);
  const recipe = recipeId ? catalog.recipeById.get(recipeId) : undefined;

  if (!recipe) return <RecipePicker onPick={setRecipeId} />;

  const pinnedDays = new Set(c.pins.filter((p) => p.recipeId === recipe.id).map((p) => p.day));
  const pinnedMinutes = (day: number) =>
    c.pins.filter((p) => p.day === day).reduce((sum, p) => sum + (catalog.recipeById.get(p.recipeId)?.minutes ?? 0), 0);
  const conflicts = [...pinnedDays]
    .sort((a, b) => a - b)
    .filter((d) => pinnedMinutes(d) > (c.maxCookMinutes[d] ?? 0))
    .map((d) => {
      const limit = c.maxCookMinutes[d] ?? 0;
      return `${shortDay(c.startDate, d)}: pinned meals need ${pinnedMinutes(d)} min, ${limit === 0 ? 'and it is a no-cooking day' : `the limit is ${limit}`}.`;
    });

  return (
    <div className="sheet-stack">
      <div className="sheet-recipe">
        <RecipeThumb recipe={recipe} index={0} />
        <div>
          <h3>{recipe.title}</h3>
          <p className="recipe-meta">
            <ClockIcon size={14} />
            <span>
              {recipe.minutes} min · {plural(recipe.servings, 'portion')} · {proteinText(recipe)}
            </span>
          </p>
        </div>
      </div>
      <fieldset className="fieldset">
        <legend className="field-label">Cook it on</legend>
        <div className="choice-chips" role="group" aria-label="Days">
          {Array.from({ length: c.days }, (_, day) => (
            <button
              key={day}
              type="button"
              className="choice-chip"
              aria-pressed={pinnedDays.has(day)}
              onClick={() => dispatch({ type: pinnedDays.has(day) ? 'pin/remove' : 'pin/add', pin: { recipeId: recipe.id, day } })}
            >
              {shortDay(c.startDate, day)}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="muted">
        {pinnedDays.size === 0
          ? `Tap a day to pin it. It makes ${plural(recipe.servings, 'portion')}, eaten over the next ${c.cookedFoodLifeDays} days.`
          : `Pinned on ${plural(pinnedDays.size, 'day')}. Plan the week to fit everything else around it.`}
      </p>
      {conflicts.map((text) => (
        <p key={text} className="warn-line">
          <AlertIcon size={18} />
          {text} Plan will say these pins don't fit.
        </p>
      ))}
      <div className="sheet-actions">
        <Button block onClick={onClose}>
          Done
        </Button>
        {!initialRecipeId && (
          <TextLink onClick={() => setRecipeId(null)}>Pick a different meal</TextLink>
        )}
      </div>
    </div>
  );
}

/** Search the recipes by title or ingredient. */
export function RecipePicker({ onPick, exclude, mealType }: { onPick: (id: string) => void; exclude?: string; mealType?: Recipe['mealType'] }) {
  const { catalog } = useStore();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = catalog.recipes.filter(
    (r) =>
      r.id !== exclude &&
      (!mealType || r.mealType === mealType) &&
      (q === '' ||
        r.title.toLowerCase().includes(q) ||
        r.ingredients.some((ri) => catalog.ingredientById.get(ri.ingredientId)?.name.toLowerCase().includes(q))),
  );
  const groups: { label: string; items: Recipe[] }[] = mealType
    ? [{ label: mealType === 'breakfast' ? 'Breakfasts' : 'Mains', items: list }]
    : [
        { label: 'Breakfasts', items: list.filter((r) => r.mealType === 'breakfast') },
        { label: 'Mains', items: list.filter((r) => r.mealType === 'main') },
      ];

  return (
    <div className="sheet-stack">
      <label className="search-field">
        <SearchIcon size={20} />
        <span className="visually-hidden">Search recipes</span>
        <input className="field-input" type="search" placeholder="Search recipes or ingredients" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {list.length === 0 && <p className="muted">No recipe matches "{query}".</p>}
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.label} className="picker-group" aria-label={g.label}>
            <p className="eyebrow">{g.label}</p>
            <ul className="picker-list">
              {g.items.map((r) => (
                <li key={r.id}>
                  <button type="button" className="picker-row" onClick={() => onPick(r.id)}>
                    <span className="picker-title">{r.title}</span>
                    <span className="picker-meta">
                      {r.minutes} min · {proteinText(r)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

// ── Example data ──

export function ExampleFridgeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, today, catalog } = useStore();
  const have = state.constraints.pantry.length;
  return (
    <BottomSheet open={open} title="Example fridges" eyebrow="Try it out" onClose={onClose}>
      <div className="sheet-stack">
        <p className="muted">
          Real ingredients from the recipe data, with days left counted from today.
          {have > 0 && ` Loading one replaces the ${plural(have, 'item')} in your kitchen.`}
        </p>
        <ul className="example-list">
          {fridges.map((f) => {
            const soon = f.items.filter((i) => i.daysLeft <= 2).length;
            const perishable = f.items.filter((i) => {
              const ing = catalog.ingredientById.get(i.ingredientId);
              return ing ? isPerishable(ing) : false;
            }).length;
            return (
              <li key={f.id} className="example-row">
                <h3>{f.name}</h3>
                <p className="muted">{f.description}</p>
                <p className="meta">
                  {plural(f.items.length, 'item')} · {perishable} perishable{soon > 0 ? ` · ${soon} to use soon` : ''}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    dispatch({ type: 'example/fridge', fridgeId: f.id, today });
                    onClose();
                  }}
                >
                  Load {f.name.toLowerCase()}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}

export function ExampleWeekSheet({ open, onClose, onLoaded }: { open: boolean; onClose: () => void; onLoaded?: () => void }) {
  const { dispatch, today, catalog } = useStore();
  return (
    <BottomSheet open={open} title="Example weeks" eyebrow="Try it out" onClose={onClose}>
      <div className="sheet-stack">
        <p className="muted">Each one sets pins, cooking limits, a protein target and a fridge. Loading one replaces yours; your priorities stay.</p>
        <ul className="example-list">
          {weeks.map((w) => {
            const fridge = w.fridgeId ? fridges.find((f) => f.id === w.fridgeId)?.name : 'Empty fridge';
            const pins = w.pins.map((p) => catalog.recipeById.get(p.recipeId)?.title).filter(Boolean);
            return (
              <li key={w.id} className="example-row">
                <h3>{w.name}</h3>
                <p className="muted">{w.description}</p>
                <p className="meta">
                  {w.proteinPerDay} g/day · {fridge}
                  {pins.length > 0 ? ` · pins ${pins.join(', ')}` : ''}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    dispatch({ type: 'example/week', weekId: w.id, today });
                    onClose();
                    onLoaded?.();
                  }}
                >
                  Load {w.name.toLowerCase()}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}

// ── Recipe details ──

interface RecipeSheetProps {
  recipeId: string | null;
  overlapIds: string[];
  onClose: () => void;
  onPin: (recipeId: string) => void;
  onSeeOnMap: (recipeId: string) => void;
}

export function RecipeSheet({ recipeId, overlapIds, onClose, onPin, onSeeOnMap }: RecipeSheetProps) {
  const { catalog } = useStore();
  const recipe = recipeId ? catalog.recipeById.get(recipeId) : undefined;
  return (
    <BottomSheet
      open={!!recipe}
      title={recipe?.title ?? ''}
      eyebrow={recipe?.mealType === 'breakfast' ? 'Breakfast' : 'Main'}
      onClose={onClose}
      footer={
        recipe && (
          <Button block onClick={() => onPin(recipe.id)}>
            Pin on a day
          </Button>
        )
      }
    >
      {recipe && <RecipeDetails recipe={recipe} overlapIds={overlapIds} onSeeOnMap={() => onSeeOnMap(recipe.id)} />}
    </BottomSheet>
  );
}

function RecipeDetails({ recipe, overlapIds, onSeeOnMap }: { recipe: Recipe; overlapIds: string[]; onSeeOnMap: () => void }) {
  const { catalog } = useStore();
  const m = recipe.macrosPerServing;
  const macro = (v: number | null, unit: string) => (v === null ? 'not published' : `${Math.round(v)} ${unit}`);
  const rows = useMemo(
    () =>
      recipe.ingredients.map((ri) => {
        const ing = catalog.ingredientById.get(ri.ingredientId);
        const name = ing ? shortName(ing.name) : ri.ingredientId;
        const amount = ing?.staple ? 'from the cupboard' : ing ? formatAmount(ri.qty, ing.packUnit) : '';
        const role = ri.role === 'optional' ? 'optional' : ri.role === 'garnish' ? 'garnish, if you have it' : '';
        return { id: ri.ingredientId, name, amount, role, note: ri.qtyNote, mine: overlapIds.includes(ri.ingredientId) };
      }),
    [recipe, catalog, overlapIds],
  );

  return (
    <div className="sheet-stack">
      <p className="recipe-meta">
        <ClockIcon size={14} />
        <span>
          {recipe.minutes} min · {recipe.difficulty} · {plural(recipe.servings, 'portion')}
        </span>
      </p>
      <OverlapPips overlap={overlapIds.length} />
      <dl className="macro-grid">
        <div>
          <dt>Protein</dt>
          <dd>{macro(m.protein, 'g')}</dd>
        </div>
        <div>
          <dt>Calories</dt>
          <dd>{macro(m.kcal, 'kcal')}</dd>
        </div>
        <div>
          <dt>Carbs</dt>
          <dd>{macro(m.carbs, 'g')}</dd>
        </div>
        <div>
          <dt>Fat</dt>
          <dd>{macro(m.fat, 'g')}</dd>
        </div>
      </dl>
      <p className="muted">Per portion, as published by the source.</p>

      <section className="sheet-section" aria-labelledby={`${recipe.id}-ing`}>
        <h3 id={`${recipe.id}-ing`}>Ingredients</h3>
        <ul className="ingredient-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span className={r.mine ? 'ingredient-name ingredient-mine' : 'ingredient-name'}>
                {r.name}
                {r.mine && <span className="visually-hidden"> (you have this)</span>}
              </span>
              <span className="muted">
                {[r.amount, r.role, r.note].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
        {overlapIds.length > 0 && <p className="muted">Highlighted: perishables you already have.</p>}
      </section>

      {recipe.dataFlags && recipe.dataFlags.length > 0 && (
        <section className="sheet-section data-note" aria-labelledby={`${recipe.id}-note`}>
          <h3 id={`${recipe.id}-note`}>Data note</h3>
          <ul className="note-list">
            {recipe.dataFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="link-row">
        <ExternalLink href={recipe.source.url}>Recipe from {recipe.source.name} →</ExternalLink>
        <TextLink onClick={onSeeOnMap}>See on map →</TextLink>
      </div>
    </div>
  );
}
