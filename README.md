# Mince

**Plan a week of high-protein meals around shared ingredients, so perishables get used before they expire.**

Recipes come one at a time, but ingredients come in packs, and each pack has an expiry date. Cook a new recipe and the half bag of spinach, the leftover cilantro and the rest of the Greek yogurt go bad. Mince treats the week as an optimization problem: choose meals and cook days so every pack gets used, while hitting a daily protein target. The solver explains itself, and you can overrule it.

**Live demo:** https://kwm26.github.io/Mince/

## How it works: Pin → Solve → Steer

1. **Pin** the meals you want on specific days, and set your limits: a daily protein target, cooking minutes per day (busy days), and what's already in your fridge.
2. **Solve.** A mixed-integer program picks and schedules the rest of the week to minimize wasted packs while hitting protein. Every meal says why it's there ("shares chicken breast and lemon with Tue's one-pan roasted chicken", "uses broccoli before it expires Sun").
3. **Steer.** Move, swap or remove a meal and see the cost first: Δ waste, Δ protein on the affected days, Δ cooking time. Apply re-plans the rest of the week and shows the final result, with Undo. Priority sliders (waste, protein, cooking time) re-weight the solve.

When the plan can't work, Mince says so in plain words instead of guessing:
- **Infeasible:** a pin conflict, e.g. "Tue: pinned meals need 45 min, limit is 20".
- **Protein-short:** a valid plan that can't reach the target, e.g. "18 g/day short of 150 g". Protein counts only portions actually eaten that week; with this recipe set the best possible day is 137 g, and the app shows that honestly rather than inflating it.

## Screens

- **Kitchen:** what's on hand, with use-soon tags; recipes ranked by how many of your perishables they use, soonest-expiring first. Shelf lives and pack sizes are estimates you can edit.
- **Plan:** Pin → Solve → Steer as day rows with stats (protein per day, packs wasted, reuse rate), a shopping list with freeze flags, and a **Week / Map** toggle.
- **Map:** the data as one graph (recipes and ingredients as nodes, "uses" as links), read through six lenses: *This week*, *Hubs*, *Freshness*, *Waste*, *Protein* and *Families*. Each lens leads with a one-line insight, and everything it shows is also listed as text. Ingredients are coloured by category, and the map has a **2D / 3D** toggle.
- **Cook:** focus mode with one step at a time, step timers and the screen kept awake.

## The optimizer

- **Solver:** [HiGHS](https://highs.dev) compiled to WebAssembly, running in a Web Worker so the UI never blocks. The default week solves in about a second in the browser, with a 2 s limit and a greedy fallback.
- **Model:** binary cook decisions per recipe and day, integer packs to buy, and continuous portions eaten per day. Constraints cover pins, cooking time, meals covered every day, cooked food eaten within 3 days, ingredient expiry (raw meat and fish can be frozen on shopping day), pantry stock, a variety limit, and a soft protein target. The full model is in [`docs/data-model.md`](docs/data-model.md).
- **Baseline:** a greedy planner, used for comparison and as the fallback when the solver can't finish.
- **Explanations** are generated from the model, not an LLM.

## Data

24 real recipes (4 breakfasts, 20 mains) from dietitian, fitness and recipe sites, with macros as published and sources linked. Shelf lives and pack sizes are estimates and are flagged as such. See [`docs/recipes-research.md`](docs/recipes-research.md). Example fridges and weeks for demos live in `data/fridges.json` and `data/weeks.json`.

## Run it locally

Requires Node 20 or later.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run demo       # production build served at http://localhost:4173
npm test           # Vitest
npm run build      # type-check and build
```

## Stack

Vite, React 18, TypeScript (strict), plain CSS with design tokens (light and dark themes), HiGHS (WebAssembly) for optimization, d3-force for the 2D map layout, three.js for the 3D view (loaded only when used), and Vitest. Data stays in your browser (`localStorage`); there's no backend and no account.

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Docs

- [`docs/brief.md`](docs/brief.md): the product brief
- [`docs/data-model.md`](docs/data-model.md): types, the optimization model, metrics and tests
- [`docs/design-spec.md`](docs/design-spec.md): visual design, components and tokens
- [`docs/recipes-research.md`](docs/recipes-research.md): where the recipe data comes from
