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
- **Plan:** Pin → Solve → Steer; **Week / Map** toggle (week day rows + stats, or the ingredient map with lenses).
- **Cook:** focus mode with steps, timers, wake lock.

## Ingredient map & lenses (the insight layer)
One node map of my data: **recipes** and **ingredients** as nodes, "uses" as edges. Instead of separate charts, every insight is a **lens**: the same map, recoloured and resized to answer one question, with a one-line key sentence.

| Lens | Question | Key sentence example |
|---|---|---|
| This week | How does my plan connect? | "Your 6 batches share 9 ingredients" |
| Hubs | What's safe to buy? | "Garlic, lemon and broccoli link 6+ recipes" |
| Freshness | What's about to turn? | "Spinach expires in 2 days; 3 recipes can use it" |
| Waste | Where does my leftover go? | "Add the frittata Thu → −0.6 packs" |
| Protein | What feeds my goal? | "14 recipes hit ≥ 30 g per serving" |
| Families | What should I cook together? | "Cilantro–lime family: plan inside it to waste least" |

Interactions: tap a node to focus it and its neighbours (facts in a bottom sheet); tap two recipes to see what they share; add a recipe to the plan from the map with the same Δ preview as Steer. Every lens's findings are also listed as text below the map, so the graph is never the only way to get the information.

**Where it lives:** the Plan tab has a **Week / Map** toggle; Kitchen links into the map ("See on map").

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
3. Ingredient map with **This week, Hubs and Waste** lenses ← core insight layer
4. Remaining lenses: Freshness, Protein, Families
5. Cook mode timers
6. Greedy-vs-optimal comparison view
7. Dark mode polish
