import type { Recipe } from '../types';
import { AddButton } from './Button';
import { ClockIcon, EggIcon, LeafIcon, SoupIcon, UtensilsIcon } from './icons';

const PIPS = 5;

/** Decorative thumbnail: a tint and an icon. We have no food photos and never invent image URLs. */
export function RecipeThumb({ recipe, index }: { recipe: Recipe; index: number }) {
  const vegetarian = recipe.ingredients.some((i) => i.ingredientId.startsWith('tofu') || i.ingredientId.includes('lentil'));
  const icon =
    recipe.mealType === 'breakfast' ? <EggIcon size={26} /> : vegetarian ? <LeafIcon size={26} /> : index % 2 === 0 ? <UtensilsIcon size={26} /> : <SoupIcon size={26} />;
  return (
    <span className={`thumb thumb-${(index % 3) + 1}`} aria-hidden="true">
      {icon}
    </span>
  );
}

/** Five square pips plus the words, so the count never relies on colour. */
export function OverlapPips({ overlap }: { overlap: number }) {
  return (
    <span className="overlap">
      <span className="pips" aria-hidden="true">
        {Array.from({ length: PIPS }, (_, i) => (
          <i key={i} data-on={i < overlap} />
        ))}
      </span>
      {overlap === 0 ? 'Uses none of yours' : `Uses ${overlap} of yours`}
    </span>
  );
}

export function proteinText(recipe: Recipe): string {
  const p = recipe.macrosPerServing.protein;
  return p === null ? 'macros not published' : `${Math.round(p)} g protein`;
}

interface Props {
  recipe: Recipe;
  index: number;
  overlap: number;
  pinnedDays: string[];          // e.g. ["Tue"]; non-empty = added
  onOpen: () => void;
  onAdd: () => void;
}

/** Recipe row (design-spec §5): 1px rule on top, no box; the title opens the recipe, + pins it. */
export function RecipeRow({ recipe, index, overlap, pinnedDays, onOpen, onAdd }: Props) {
  const added = pinnedDays.length > 0;
  return (
    <li className="recipe-row">
      <RecipeThumb recipe={recipe} index={index} />
      <div className="recipe-body">
        <h3 className="recipe-title">
          <button type="button" className="row-link" onClick={onOpen}>
            {recipe.title}
          </button>
        </h3>
        <p className="recipe-meta">
          <ClockIcon size={14} />
          <span>
            {recipe.minutes} min · {recipe.difficulty} · {proteinText(recipe)}
            {recipe.dataFlags && recipe.dataFlags.length > 0 && ' · data note'}
          </span>
        </p>
        <OverlapPips overlap={overlap} />
        {added && <p className="recipe-pinned">Pinned {pinnedDays.join(', ')}</p>}
      </div>
      <AddButton
        added={added}
        addLabel={`Pin ${recipe.title} on a day`}
        addedLabel={`${recipe.title} is pinned on ${pinnedDays.join(', ')}. Change days`}
        onClick={onAdd}
      />
    </li>
  );
}
