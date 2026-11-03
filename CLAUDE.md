# CLAUDE.md: Mince

Context for Claude Code. Read this before every task.

## What this is
Mince plans a week of **healthy, high-protein meals for bodybuilding** around **shared ingredients**, so perishables get used before they expire and nothing goes to waste. The core is an **optimizer**: the user pins what they want, Mince solves the rest of the week, and the user steers it with live trade-off feedback.

Favor clarity, polish and a working optimizer over breadth.

## Core workflow: Pin → Solve → Steer
1. **Pin:** the user pins meals they want on specific days and sets constraints (busy days / max cooking minutes, a daily protein target).
2. **Solve:** the optimizer fills the rest of the week, minimizing waste while hitting macro targets. Shown as week day rows with stats (protein per day, packs wasted, reuse rate).
3. **Steer:** dragging or swapping a meal previews its cost **before** committing (waste Δ, protein Δ, cooking-time Δ). Every chosen meal can explain why it's there.

## Source of truth
- Product: `docs/brief.md`
- Data model, objective and constraints: `docs/data-model.md` (implement exactly as written; ask before deviating)
- Visual design and tokens: `docs/design-spec.md`, `src/styles/tokens.css`, and the references in `design/mockups/`
- `design/` HTML is a **reference only**. Rebuild it as React components; never paste it in wholesale.
- Recipe data: `data/*.json` (sourced from real recipes; see `docs/recipes-research.md`)

## Stack
- Vite + React 18 + TypeScript (strict)
- Plain CSS with CSS custom properties (tokens in `src/styles/tokens.css`), no UI framework
- Optimizer: `highs` (HiGHS MILP solver compiled to WebAssembly), run in a **Web Worker** so the UI never blocks
- Baseline: a greedy planner, kept for side-by-side comparison with the optimal solution
- Shared-ingredient graph: `d3-force` rendering to SVG (per the design spec)
- Tests: Vitest for everything in `src/lib/`
- Persistence: `localStorage` only (wrapped in try/catch); no backend, no accounts
- Deploy: Vercel

## Structure
```
data/            ingredients.json, recipes.json
src/types.ts     types mirroring docs/data-model.md
src/lib/         model.ts (builds the MILP), solve.worker.ts, greedy.ts, waste.ts, schedule.ts, preview.ts, explain.ts, graph.ts, lenses.ts (+ *.test.ts)
src/screens/     Kitchen.tsx, Plan.tsx (Pin → Solve → Steer; Week / Map toggle with lenses), Cook.tsx
src/components/  small, presentational
src/styles/      tokens.css, base.css
```

## Rules
- **Explainability is a feature:** every solved meal must carry a reason generated from the model (e.g. "uses cilantro before it expires Thu; +38 g protein").
- **Preview before commit:** any edit to the plan shows its cost delta before it's applied.
- **Kitchen-first UX:** tap targets ≥ 48px, body ≥ 17px in Cook mode, primary actions in the thumb zone, screen wake lock in Cook mode (fail silently).
- Light and dark themes via tokens; WCAG AA contrast.
- Every list has an empty state; solving has loading, infeasible ("can't hit 180 g protein with these pins") and error states.
- Pure functions in `src/lib/`; no React imports there.
- Macros come only from the recipe data. Never invent nutrition values, recipes or URLs.
- No new dependencies without saying why in the commit message.
- Small commits with conventional messages (`feat:`, `fix:`, `docs:`, `chore:`).

## Done means
Type-checks, tests pass, a 7-day solve completes in < 2 s in the worker (previews < 5 ms), works at 375px wide, works in dark mode, deployed preview loads.
