import { useMemo, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Button, TextLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PlusIcon, SearchIcon } from '../components/icons';
import { Accent, Dock, ScreenHeader, Sticker } from '../components/Layout';
import { PantryList, type PantryRow } from '../components/PantryList';
import { RecipeRow } from '../components/RecipeRow';
import { ThemeToggle } from '../components/ThemeToggle';
import { ingredientById as baseIngredients } from '../lib/data';
import { shortName } from '../lib/cook';
import { longDate, plural, shortDay } from '../lib/format';
import { daysLeft, daysLeftLabel, formatAmount, isUseSoon, rankByOverlap } from '../lib/kitchen';
import { useStore } from '../state';
import type { Ingredient } from '../types';
import { ExampleFridgeSheet, PinSheet, RecipeSheet } from './sheets';

interface Props {
  onSeeOnMap: (nodeId: string | null) => void;   // switches to Plan's Map view
}

type ItemTarget = { mode: 'add' } | { mode: 'edit'; ingredientId: string };

export function Kitchen({ onSeeOnMap }: Props) {
  const { state, today, catalog } = useStore();
  const pantry = state.constraints.pantry;
  const [item, setItem] = useState<ItemTarget | null>(null);
  const [examples, setExamples] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);

  const rows = useMemo<PantryRow[]>(
    () =>
      pantry
        .map((p) => {
          const ing = catalog.ingredientById.get(p.ingredientId);
          const left = daysLeft(p, today);
          return {
            id: p.ingredientId,
            name: ing ? shortName(ing.name) : p.ingredientId,
            amount: formatAmount(p.amount, ing?.packUnit ?? ''),
            daysLeft: left,
            daysLeftLabel: daysLeftLabel(left),
            useSoon: isUseSoon(left),
          };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name)),
    [pantry, catalog, today],
  );
  const ranked = useMemo(() => rankByOverlap(catalog.recipes, pantry, today, catalog.ingredientById), [catalog, pantry, today]);
  const soon = rows.filter((r) => r.useSoon).length;

  const pinnedDays = (id: string) =>
    state.constraints.pins
      .filter((p) => p.recipeId === id)
      .sort((a, b) => a.day - b.day)
      .map((p) => shortDay(state.constraints.startDate, p.day));

  return (
    <main className="screen" id="main">
      <ScreenHeader eyebrow={longDate(today)} title={<>Your <Accent>kitchen</Accent></>} actions={<ThemeToggle />}>
        {rows.length > 0 && (
          <p className="muted">
            {plural(rows.length, 'item')} on hand{soon > 0 ? `, ${soon} to use in the next two days` : ''}.
          </p>
        )}
      </ScreenHeader>

      <section className="section" aria-labelledby="onhand-heading">
        <h2 id="onhand-heading">On hand</h2>
        <PantryList
          rows={rows}
          onSelect={(id) => setItem({ mode: 'edit', ingredientId: id })}
          empty={
            <EmptyState
              title="Nothing on hand yet"
              action={
                <Button icon={<PlusIcon size={20} />} onClick={() => setItem({ mode: 'add' })}>
                  Add
                </Button>
              }
              extra={<TextLink onClick={() => setExamples(true)}>Try an example fridge →</TextLink>}
            >
              Add what's in your fridge, and Mince ranks the recipes that use it before it turns.
            </EmptyState>
          }
        />
        {rows.length > 0 && (
          <div className="link-row">
            <TextLink onClick={() => setExamples(true)}>Load an example fridge →</TextLink>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="recipes-heading">
        <div className="section-head">
          <h2 id="recipes-heading">
            Recipes that <Sticker>share</Sticker>
          </h2>
          <TextLink onClick={() => onSeeOnMap(null)}>See on map →</TextLink>
        </div>
        <p className="muted">
          {pantry.length === 0
            ? 'Add what you have to rank these by how many of your perishables they use. For now, highest protein first.'
            : 'Most of your perishables first, then whatever turns soonest, then protein.'}
        </p>
        {ranked.length === 0 ? (
          <EmptyState title="No recipes" level={3}>
            The recipe data didn't load. Reload the page to try again.
          </EmptyState>
        ) : (
          <ul className="recipe-list">
            {ranked.map((r, i) => (
              <RecipeRow
                key={r.recipe.id}
                recipe={r.recipe}
                index={i}
                overlap={r.overlap}
                pinnedDays={pinnedDays(r.recipe.id)}
                onOpen={() => setRecipeId(r.recipe.id)}
                onAdd={() => setPinFor(r.recipe.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {rows.length > 0 && (
        <Dock>
          <Button block icon={<PlusIcon size={20} />} onClick={() => setItem({ mode: 'add' })}>
            Add to kitchen
          </Button>
        </Dock>
      )}

      <ItemSheet target={item} onClose={() => setItem(null)} onSeeOnMap={(id) => onSeeOnMap(id)} />
      <ExampleFridgeSheet open={examples} onClose={() => setExamples(false)} />
      <RecipeSheet
        recipeId={recipeId}
        overlapIds={ranked.find((r) => r.recipe.id === recipeId)?.usesIds ?? []}
        onClose={() => setRecipeId(null)}
        onPin={(id) => {
          setRecipeId(null);
          setPinFor(id);
        }}
        onSeeOnMap={(id) => {
          setRecipeId(null);
          onSeeOnMap(id);
        }}
      />
      <PinSheet open={pinFor !== null} recipeId={pinFor} onClose={() => setPinFor(null)} />
    </main>
  );
}

// ── Add or edit an item, and its estimates ──

function ItemSheet({ target, onClose, onSeeOnMap }: { target: ItemTarget | null; onClose: () => void; onSeeOnMap: (id: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const ingredientId = target?.mode === 'edit' ? target.ingredientId : picked;
  const close = () => {
    setPicked(null);
    onClose();
  };
  const { catalog } = useStore();
  const ing = ingredientId ? catalog.ingredientById.get(ingredientId) : undefined;

  return (
    <BottomSheet
      open={target !== null}
      title={ing ? shortName(ing.name) : 'Add to kitchen'}
      eyebrow={target?.mode === 'edit' ? 'On hand' : 'Add'}
      onClose={close}
    >
      {ing ? (
        <ItemForm key={ing.id} ingredient={ing} editing={target?.mode === 'edit'} onDone={close} onBack={target?.mode === 'add' ? () => setPicked(null) : undefined} onSeeOnMap={() => {
          close();
          onSeeOnMap(ing.id);
        }} />
      ) : (
        <IngredientPicker onPick={setPicked} />
      )}
    </BottomSheet>
  );
}

function IngredientPicker({ onPick }: { onPick: (id: string) => void }) {
  const { state, catalog } = useStore();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const have = new Set(state.constraints.pantry.map((p) => p.ingredientId));
  const list = catalog.ingredients
    .filter((i) => !i.staple && (q === '' || i.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="sheet-stack">
      <label className="search-field">
        <SearchIcon size={20} />
        <span className="visually-hidden">Search ingredients</span>
        <input className="field-input" type="search" placeholder="Search ingredients" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      <p className="muted">Salt, oils, spices and sauces are assumed to be in the cupboard, so they aren't listed.</p>
      {list.length === 0 ? (
        <p className="muted">No ingredient matches "{query}". Recipes only use the ingredients listed here.</p>
      ) : (
        <ul className="picker-list">
          {list.map((i) => (
            <li key={i.id}>
              <button type="button" className="picker-row" onClick={() => onPick(i.id)}>
                <span className="picker-title">{shortName(i.name)}</span>
                <span className="picker-meta">
                  {have.has(i.id) ? 'on hand · ' : ''}
                  sold as {formatAmount(i.packSize, i.packUnit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ItemFormProps {
  ingredient: Ingredient;          // with the user's overrides applied
  editing: boolean;
  onDone: () => void;
  onBack?: () => void;
  onSeeOnMap: () => void;
}

function ItemForm({ ingredient, editing, onDone, onBack, onSeeOnMap }: ItemFormProps) {
  const { state, dispatch, today } = useStore();
  const base = baseIngredients.get(ingredient.id) ?? ingredient;
  const existing = state.constraints.pantry.find((p) => p.ingredientId === ingredient.id);
  const override = state.overrides[ingredient.id];

  const [amount, setAmount] = useState(String(existing?.amount ?? ingredient.packSize));
  const [left, setLeft] = useState(String(existing ? daysLeft(existing, today) : ingredient.shelfLifeDays));
  const [shelf, setShelf] = useState(String(ingredient.shelfLifeDays));
  const [pack, setPack] = useState(String(ingredient.packSize));

  const amountN = Number(amount);
  const leftN = Number(left);
  const shelfN = Number(shelf);
  const packN = Number(pack);
  const errors = {
    amount: !(amountN > 0) ? `Enter an amount above 0, in ${ingredient.packUnit}.` : null,
    left: !(Number.isInteger(leftN) && leftN >= 0) ? 'Enter whole days, 0 or more.' : null,
    shelf: !(Number.isInteger(shelfN) && shelfN > 0) ? 'Enter whole days, 1 or more.' : null,
    pack: !(packN > 0) ? `Enter a pack size above 0, in ${ingredient.packUnit}.` : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const save = () => {
    if (!valid) return;
    dispatch({ type: 'pantry/upsert', item: { ingredientId: ingredient.id, amount: amountN, addedOn: today, daysLeftAtAdd: leftN } });
    const next = {
      ...(shelfN !== base.shelfLifeDays ? { shelfLifeDays: shelfN } : {}),
      ...(packN !== base.packSize ? { packSize: packN } : {}),
    };
    dispatch({ type: 'override/set', ingredientId: ingredient.id, override: Object.keys(next).length > 0 ? next : null });
    onDone();
  };

  return (
    <form
      className="sheet-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
    >
      <div className="field-grid">
        <Field id="amount" label={`Amount (${ingredient.packUnit})`} value={amount} onChange={setAmount} error={errors.amount} inputMode="decimal" />
        <Field id="left" label="Days left" value={left} onChange={setLeft} error={errors.left} inputMode="numeric" />
      </div>

      <fieldset className="fieldset estimates">
        <legend>
          <h3>Estimates</h3>
        </legend>
        <p className="muted">
          {base.estimated
            ? 'Shelf life and pack size are estimates, not sourced facts. Change them to match your shop; every plan uses your numbers.'
            : 'Every plan uses these numbers. Change them to match your shop.'}
        </p>
        <div className="field-grid">
          <Field id="shelf" label="Shelf life (days)" value={shelf} onChange={setShelf} error={errors.shelf} inputMode="numeric" hint={`Estimate: ${base.shelfLifeDays}`} />
          <Field id="pack" label={`Pack size (${ingredient.packUnit})`} value={pack} onChange={setPack} error={errors.pack} inputMode="decimal" hint={`Estimate: ${base.packSize}`} />
        </div>
        {ingredient.freezable && <p className="muted">Raw {shortName(ingredient.name).toLowerCase()} can go in the freezer on shopping day; plans do this for you.</p>}
        {override && (
          <TextLink
            onClick={() => {
              setShelf(String(base.shelfLifeDays));
              setPack(String(base.packSize));
            }}
          >
            Reset to the estimates
          </TextLink>
        )}
      </fieldset>

      <div className="link-row">
        <TextLink onClick={onSeeOnMap}>See on map →</TextLink>
        {onBack && <TextLink onClick={onBack}>Pick a different ingredient</TextLink>}
      </div>

      <div className="sheet-actions sheet-actions-split">
        {editing && (
          <Button
            variant="secondary"
            onClick={() => {
              dispatch({ type: 'pantry/remove', ingredientId: ingredient.id });
              onDone();
            }}
          >
            Remove
          </Button>
        )}
        <Button type="submit" disabled={!valid} block={!editing}>
          {editing ? 'Save' : existing ? 'Update' : 'Add to kitchen'}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  inputMode: 'decimal' | 'numeric';
  hint?: string;
}

function Field({ id, label, value, onChange, error, inputMode, hint }: FieldProps) {
  const fid = `item-${id}`;
  return (
    <div className="field">
      <label htmlFor={fid} className="field-label">
        {label}
      </label>
      <input
        id={fid}
        className="field-input"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-help` : undefined}
      />
      {(error || hint) && (
        <p id={`${fid}-help`} className={error ? 'field-error' : 'field-hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
