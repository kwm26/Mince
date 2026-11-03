# Brief: Mince

> One page. The product's source of truth. When this disagrees with a mockup, this wins on *what* to build; `docs/design-spec.md` wins on *how it looks*.

## Problem
I train and want to eat high-protein, whole-food meals. When I cook new recipes, I buy ingredients for one dish. The perishables I don't finish (spinach, cilantro, Greek yogurt, chicken) go bad. That wastes money and makes me give up on meal prep, and then I miss my protein targets.

## Evidence (fill in during Phase 1)
- Fridge photo: `docs/media/fridge.jpg`
- Recently wasted: _…_, _…_, _…_
- Daily protein target: _… g_ · Meals I cook per week now: _…_

## Who it's for
Me: someone who lifts, cooks for one, and is still learning to cook. Pack sizes are built for families; my plans aren't.

## Insight
Recipes come one at a time, but ingredients come in packs, and each pack has an expiry date. Planning a week is an **optimization problem**: choose meals and cook days so every pack gets used before it expires, while still hitting macro targets. People do this badly in their heads; a solver does it well, *if* it explains itself and lets you overrule it.

## Core workflow: Pin → Solve → Steer (lives on the Plan tab)
1. **Pin:** pin meals you want on specific days, and set constraints: a daily protein target, busy days (max cooking minutes), and what's already in the kitchen.
2. **Solve:** Mince picks and schedules the remaining batches to minimize waste while hitting protein. Results show as day rows, plus stats: protein per day, packs wasted, reuse rate.
3. **Steer:** move, swap or remove a meal and see the cost (Δ waste, Δ protein) **before** committing. Every meal shows *why* it was chosen.

## Screens (match the design spec's tab bar)
- **Kitchen:** what I have, with use-soon tags; recipes ranked by overlap with my kitchen.
- **Plan:** Pin → Solve → Steer; week day rows; stats; shared-ingredient graph.
- **Cook:** focus mode with steps, timers, wake lock.

## Success metric
**Ingredient reuse rate:** share of purchased perishables used in ≥ 2 planned batches. Supporting metrics: packs wasted per week, and days the protein target is hit.
**Demo proof:** the optimal plan vs. the greedy baseline vs. "pick 3 recipes yourself" on the same week.

## Data
24 real recipes (4 breakfasts, 20 mains) from dietitian, fitness and recipe sites, with macros as published and sources linked. See `docs/recipes-research.md`. Shelf lives and pack sizes are **estimates** (flagged in the data).

## Non-goals (v1)
Accounts, sync, a backend, prices or cost optimization, recipe import or scraping in-app, photo recognition, multi-person households, technique videos.

## Cut list (cut from the bottom first if behind)
1. Optimizer + explanations ← never cut
2. Steer preview (Δ before commit) ← never cut
3. Cook mode timers
4. Greedy-vs-optimal comparison view
5. Shared-ingredient graph (day rows already list shared items)
6. Dark mode polish
