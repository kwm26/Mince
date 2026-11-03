import { fridges, ingredients, recipes } from './lib/data';

// Placeholder shell until the Kitchen, Plan and Cook screens land.
export function App() {
  return (
    <main className="screen">
      <p className="eyebrow">Mince</p>
      <h1>
        Plan the <em className="accent">week</em>
      </h1>
      <p className="muted">
        {recipes.length} recipes · {ingredients.length} ingredients · {fridges.length} example fridges
      </p>
    </main>
  );
}
