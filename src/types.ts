// Types mirroring docs/data-model.md. Keep in sync with §2, §11 and §13.

export type Category = 'protein' | 'produce' | 'herb' | 'dairy' | 'grain' | 'pantry' | 'spice' | 'fruit' | 'other';
export type Role = 'core' | 'optional' | 'garnish';
export type MealType = 'breakfast' | 'main';

export interface Ingredient {
  id: string;              // kebab-case
  name: string;
  category: Category;
  shelfLifeDays: number;   // after purchase (day 0 = shopping day); good *through* this day
  packUnit: string;        // unit it's SOLD in
  packSize: number;
  staple?: boolean;        // assumed owned; ignored for waste and shopping
  estimated?: boolean;     // shelf life / pack size are estimates, not sourced
  freezable?: boolean;     // raw item can go in the freezer on shopping day (raw meat, fish)
}

export interface RecipeIngredient {
  ingredientId: string;
  qty: number;             // in the ingredient's packUnit, for the WHOLE recipe; 0 for staples
  role: Role;
  qtyNote?: string;        // original wording when conversion was uncertain
  substitutes?: string[];
}

export interface Step { text: string; timerSec?: number; }

export interface Macros { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; }

export interface Recipe {
  id: string;
  title: string;
  mealType: MealType;
  minutes: number;
  difficulty: 'easy' | 'medium';
  servings: number;        // one cook = one batch = `servings` portions
  tags: string[];
  macrosPerServing: Macros;
  source: { name: string; url: string };
  ingredients: RecipeIngredient[];
  steps: Step[];
  dataFlags?: string[];    // known data doubts; show a subtle "data note" in the UI
  freezesWell?: boolean;   // cooked portions can be frozen; set only when the source says so
}

export interface PantryItem {
  ingredientId: string;
  amount: number;          // in packUnit
  addedOn: string;         // ISO date the item was entered
  daysLeftAtAdd: number;   // days of life left on addedOn
}

export interface Batch {
  recipeId: string;
  day: number;
  pinned: boolean;
  frozenPortions: number;  // cooked portions frozen on the cook day (0 unless freezesWell)
  reason?: string[];
}

export interface Pin { recipeId: string; day: number; }

export interface Weights { waste: number; protein: number; cookTime: number; }

export interface Constraints {
  startDate: string;                    // ISO date of day 0 (the shopping day)
  days: number;                         // horizon (day 0 = shopping day)
  proteinPerDay: number;                // grams from planned meals
  mealsPerDay: Record<MealType, number>;
  maxCookMinutes: number[];             // per day, length = days; 0 = no cooking
  cookedFoodLifeDays: number;           // a batch is eaten on days d..d+L−1
  frozenLifeDays: number;               // shelf life of a freezable item once frozen
  maxRepeatsPerRecipe: number;          // variety rule
  pins: Pin[];
  excluded: string[];                   // recipe ids, never planned
  excludedSlots: Pin[];                 // from Steer "remove": not this recipe on this day
  pantry: PantryItem[];
  weights: Weights;                     // the Steer sliders
}

export interface Meal { day: number; mealType: MealType; batchIndex: number; frozen: boolean; }

export interface PlanResult {
  batches: Batch[];
  meals: Meal[];
  shopping: { ingredientId: string; packs: number; freeze: boolean }[];
  notes: { day: number; text: string }[];
  wastePacks: number;
  reuseRate: number;
  proteinByDay: number[];
  proteinShortfall: number;             // average g/day below target; > 0 is a warning, not infeasible
  status: 'optimal' | 'timeout-best' | 'infeasible';
  infeasibleReason?: string;
  solveMs: number;
}

// §11 Ingredient map & lenses
export type LensName = 'week' | 'hubs' | 'freshness' | 'waste' | 'protein' | 'families';

export interface LensNode {
  emphasis: 'high' | 'normal' | 'dim';
  size?: number;
  label?: string;
  badge?: string;
  family?: string;
}

export interface LensResult {
  nodes: Record<string, LensNode>;
  ghostEdges?: { from: string; to: string; label: string }[];
  sentence: string;
  list: string[];
}

// §13 Example data
export interface FridgeSeedItem { ingredientId: string; amount: number; daysLeft: number; }

export interface FridgeSeed {
  id: string;
  name: string;
  description: string;
  items: FridgeSeedItem[];
}

export interface WeekSeed {
  id: string;
  name: string;
  description: string;
  fridgeId: string | null;
  proteinPerDay: number;
  maxCookMinutes: number[];
  pins: Pin[];
}
