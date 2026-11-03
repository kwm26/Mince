# Mince Design Spec

**Direction:** Cookbook × Market Stall, with the warm palette from Cookbook × Clay.
**Tokens:** [`src/styles/tokens.css`](../src/styles/tokens.css)
**Visual reference:** [`design/mockups/style-explorations.html#cookstall`](../design/mockups/style-explorations.html) (tab 6). The reference is HTML only: rebuild it as React components and never paste it in.

Sources: style, font and palette choices came from the ui-ux-pro-max skill's data (Minimalism & Swiss Style, Neubrutalism, the "Classic Elegant" and "Neubrutalist Bold" font pairings, and the "Recipe & Cooking App" palette). Then they were blended and checked against the rules in `CLAUDE.md`.

---

## 1. The idea in one line

**The page reads like a calm cookbook. Anything you can tap, or need to notice, looks like a hand-painted market sign.**

Two layers, and they never mix:

| Layer | What's in it | How it looks |
|---|---|---|
| **Reading** | Titles, recipe text, metadata, section structure | Serif display, paper background, 1px ink rules, no boxes, no shadows |
| **Signal** | Buttons, icon buttons, active tab, shared-ingredient tags, use-soon tags, progress | 2–3px ink outline, hard offset shadow, filled with a role colour |

If something isn't interactive and isn't a shared or use-soon signal, it doesn't get an outline or a shadow. Loud elements must stay rare. If every card gets a border, the design collapses into full brutalism.

---

## 2. Colour

All values are tokens in `tokens.css`. Components never use raw hex values.

### Roles

| Token | Light | Dark | Use for | Never use for |
|---|---|---|---|---|
| `--color-bg` | `#FAF6EF` paper | `#17120F` | Screen background, and the fill of secondary/icon buttons | — |
| `--color-surface-2` | `#F4ECE2` | `#2D231D` | Quiet fills (e.g. the "screen stays on" pill) | Cards (cards have no fill) |
| `--color-text` | `#1F1A17` ink | `#F5EDE4` | Body and headings, completed progress segments | — |
| `--color-text-muted` | `#5E564F` | `#C3B5A8` | Metadata, labels, captions | Anything the user must read to act |
| `--color-primary` | `#9A3412` terracotta | `#FDBA74` | Primary buttons, active tab, add-to-plan, the italic accent word in titles, the current step highlight | Shared ingredients |
| `--color-accent` | `#047857` green | `#34D399` | **Shared ingredients only**: shared chips, graph nodes, meter fill, overlap pips, "added" state | Buttons, decoration |
| `--color-warn-bg` / `-text` | `#FFEDD5` / `#7C2D12` | `#4A2512` / `#FED7AA` | Use-soon tags ("2 days"), leftover badge, stickers | Errors (use text + icon) |
| `--color-ink` | `#1F1A17` | `#F5EDE4` | Control outlines and hard shadows | — |
| `--color-rule` | `#1F1A17` | `#F5EDE4` | 1px section rules | — |
| `--color-ring` | `#9A3412` | `#FDBA74` | Focus ring | — |

Always pair a fill with its `on-` token: `--color-on-primary` on primary and `--color-on-accent` on accent. Never hardcode black or white text on a role colour, because the pairs flip between themes.

### Contrast (WCAG 2.1, measured)

| Pair | Light | Dark |
|---|---|---|
| text on bg | 16.0 | 16.0 |
| muted on bg | 6.7 | 9.3 |
| muted on surface-2 | 6.1 | 7.7 |
| on-primary on primary | 7.3 | 10.3 |
| primary on bg (accent word, links) | 6.8 | 11.0 |
| on-accent on accent | 5.5 | 9.8 |
| accent on bg | 5.1 | 9.7 |
| warn-text on warn-bg | 8.2 | 9.9 |

Every pair passes AA for normal text (≥ 4.5:1). Re-measure any new pair before you use it.

### Never rely on colour alone

Terracotta (action) and green (shared) are close in visual weight. Every coloured signal also carries a word or a shape:
- Shared chips show the ingredient name, and the graph legend labels its colours.
- Overlap pips come with "Uses 4 of yours".
- Use-soon tags say "2 days", not just a colour.
- The added state switches its icon from + to ✓ and updates `aria-label`.

---

## 3. Typography

| Role | Font | Size / weight | Notes |
|---|---|---|---|
| Screen title (`h1`) | Playfair Display | 34px / 700 | One word may be italic in `--color-primary` ("Your *kitchen*"). One per screen at most |
| Section head (`h2`) | Playfair Display | 20px / 700 | — |
| Recipe / day title (`h3`) | Playfair Display | 17px / 700 | Minimum size for serif text |
| Cook Mode step | Playfair Display | 28px / 500, line-height 1.3 | Ingredients in the step: italic, `--color-primary` fill, `--color-on-primary` text, 4px side padding |
| Big numbers (stat, timer, step counter, day date) | Playfair Display | 40–44px, *italic* | `font-variant-numeric: tabular-nums` on the timer |
| Body | Public Sans | 16px / 400, line-height 1.5 | — |
| Buttons | Public Sans | 17px / 700 | — |
| Metadata | Public Sans | 13px / 400–600 | `--color-text-muted` |
| Labels (eyebrows, tab names, day names) | Public Sans | 12px / 700, uppercase, +0.12em tracking | Never smaller than 12px |

Rules:
- Serif is only for headings and Cook Mode steps, never below 17px. Labels and metadata always use the sans.
- Italic is for numbers and the one accent word, nothing else.
- Cook Mode body text is ≥ 17px everywhere (rule from `CLAUDE.md`). The step text is 28px.

**Loading.** Load both families from Google Fonts in `index.html`, with `display=swap`. This is a stylesheet link, not an npm dependency. Weights: Playfair Display 500, 700, 500 italic and 700 italic; Public Sans 400, 500 and 700.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500;1,700&family=Public+Sans:wght@400;500;700&display=swap" rel="stylesheet">
```

---

## 4. Shape, stroke and depth

**Exactly three stroke widths.** Mixing in others is what makes serif type plus chunky outlines look accidental.

| Token | Width | Used on |
|---|---|---|
| `--stroke-rule` | 1px | Section rules above cards, recipe rows and day rows; on-hand chips |
| `--stroke-tag` | 2px | Shared chips, use-soon tags, stickers, progress segments, meter, thumbnails, overlap pips, badges |
| `--stroke-control` | 3px | Buttons, icon buttons, the active tab |

**Radius:** cards and rules are 0. Tags are 4px, shared chips 6px, controls 8px. Circles are only for the leftover badge and graph nodes.

**Shadows:** hard offset only, never blurred.
- Controls: `--shadow-control` (4px 4px).
- Active tab: `--shadow-tab` (3px 3px).
- Shared chips and stickers: `--shadow-tag` (2px 2px).
- Nothing in the reading layer has a shadow.

---

## 5. Components

Each component is small and presentational, and lives in `src/components/`.

### Buttons
| Variant | Fill | Text | Outline + shadow |
|---|---|---|---|
| Primary | `--color-primary` | `--color-on-primary` | 3px ink + `--shadow-control` |
| Secondary | `--color-bg` | `--color-text` | 3px ink + `--shadow-control` |
| Icon (48×48) | `--color-bg` | `--color-text` | 3px ink + `--shadow-control` |
| Add-to-plan (48×48) | primary when off, **accent when added** | matching `on-` token | 3px ink + `--shadow-control` |
| Text link ("Use it up →") | none | `--color-text`, weight 700 | 3px underline in `--color-primary`, 4px offset |

- Height is 56px for full-width buttons. Every tap target is at least 48×48.
- **Press:** `transform: translate(var(--press-offset), var(--press-offset))` with `--shadow-control-pressed`, so the button sinks into its shadow. Duration is `--duration-fast`.
- **Focus:** a 3px `--color-ring` outline with a 2px offset. Never remove it.
- **Loading:** keep the button's width, swap the label for a spinner plus "Planning…", and set `aria-busy`.
- **Disabled:** 40% opacity, no shadow, `cursor: not-allowed`.

### Chips & tags
- **On-hand chip:** transparent, 1px ink border, radius 0, 15px / 500. Reading layer.
- **Shared chip:** accent fill, on-accent text, 2px ink border, radius 6px, `--shadow-tag`, 700.
- **Use-soon tag** (inside a chip): warn fill and text, 2px ink border, radius 4px, 12px / 700. The text says how long is left ("2 days").
- **Mini chip** (inside day rows): 1px ink border. Shared ones use the accent fill with a 2px border.
- **Sticker:** warn fill, 2px ink border, `--shadow-tag`, rotated −3°, italic. One per screen at most (e.g. the word "share" in "Recipes that share").

### Recipe row
Laid out as: 1px rule on top, no box. A 56×72 thumbnail (tint `--color-thumb-n`, 2px ink border, a decorative icon in `--color-thumb-ink`). Then the title (h3), a metadata line (clock icon, minutes, difficulty), and an overlap line: five 10px square pips (2px border, filled in accent) plus "Uses N of yours". The add-to-plan button sits on the right.

No food photos: we have no image data and we never invent URLs.

### Day row (Planner)
A 1px rule on top. A 48px date column holds the label (MON) and an italic serif date. Next to it: the recipe title and mini chips.

### Stat & meter
A muted label, the big number in italic serif, and a meter: 14px tall, 2px ink border, accent fill with a 2px ink right edge.

### Shared-ingredient graph
Drawn by `d3-force` to SVG.
- **Recipe node:** radius 17, primary fill, 2.5px ink stroke.
- **Shared ingredient node:** radius 10, accent fill, 2px ink stroke.
- **Single-use ingredient node:** radius 8, surface-2 fill, 1.5px muted stroke.
- **Edges:** to a shared ingredient, 2px in `--color-text`; to a single-use one, 2px in `--color-graph-link`.
- **Labels:** Public Sans, 11–12px / 600, in `--color-text`. This is the one exception to the 12px floor, and only because the graph is supplementary: every fact in it is also listed in the day rows.
- **Legend:** always visible, swatches with 2px ink borders.
- **Accessibility:** give the SVG `role="img"` and an `aria-label` sentence describing what is shared.

### Tab bar
Three items (Kitchen, Plan, Cook), each 56px tall, on `--color-bg` with a 1px rule on top.
- **Labels:** 12px uppercase, tracked.
- **Active tab:** primary fill, on-primary text, 3px ink border, `--shadow-tab`, radius 8, and `aria-current="page"`.

### Cook Mode
No tab bar: it's a focus mode. From top to bottom:
1. Exit icon button, eyebrow ("Cook mode · Monday") and recipe title.
2. Segmented progress: one 10px segment per step, 2px border. Done steps are filled with `--color-text`, the current step with `--color-primary`.
3. A "Screen stays on" pill, shown only once the Wake Lock is granted. Hide it if the request fails, and fail silently.
4. Step counter (italic serif), then the step text at 28px serif.
5. The step's ingredient chips (shared style).
6. Timer: italic serif 44px, with a "Start timer" secondary button.
7. Bottom bar: Back (secondary) and Next step (primary), widths 1 : 1.6, inside the thumb zone.

### Empty, loading and error states
Every list needs all three. They use the reading layer: an h2, one muted sentence, and one primary button.
- **Kitchen empty:** "Nothing on hand yet", then "Add what's in your fridge" with an Add button.
- **Planner empty:** "No meals planned", with a button to pick recipes.
- **Error:** say what failed and offer Retry. The error colour is text in `--color-warn-text` with an icon, never colour alone.

---

## 6. Layout

- Design mobile first at **375px**. Screen gutter is 20px (`--space-5`), vertical gap between sections 18–20px.
- Primary actions sit in a bottom dock (56px button) above the tab bar, reachable one-handed. The dock background fades from `--color-bg` so content scrolls underneath it.
- No horizontal scrolling at any width. Above 768px, center a 480px column; a wider layout is out of scope for v1.

## 7. Motion

| What | Duration | Easing |
|---|---|---|
| Button press | `--duration-fast` 120ms | `--ease-out` |
| Chip / add-to-plan state | `--duration-base` 180ms | `--ease-out` |
| Theme change | `--duration-theme` 250ms (background + colour only) | ease |

Animate only `transform`, `opacity` and colours, never width or height. `prefers-reduced-motion` zeroes every duration and the press offset (handled in `tokens.css`).

## 8. Icons

Use Lucide-style line icons: 24px grid, 2px stroke, round caps and joins, `stroke: currentColor`, no fill. Write them as small inline-SVG React components in `src/components/icons/`. No emoji, and no icon package (per the no-new-dependencies rule).

Decorative icons get `aria-hidden="true"`. Icon-only buttons get an `aria-label`.

Icons in use: search, plus, check, x, chevron-left, chevron-right, clock, timer, play, calendar, utensils, leaf, egg, soup.

## 9. Dark mode

Dark mode follows the OS by default. Setting `data-theme="light"` or `"dark"` on `<html>` overrides it; persist that choice in `localStorage`, wrapped in try/catch. The outlines and hard shadows invert to cream ink, and no component needs dark-specific styling beyond the tokens.

## 10. Pre-merge checklist (per screen)

- [ ] Only tokens: no raw hex values or px font sizes outside `tokens.css`
- [ ] Only the three stroke widths (1 / 2 / 3px)
- [ ] Outlines and shadows only on the signal layer
- [ ] Every tap target ≥ 48×48, and the primary action is in the bottom dock
- [ ] Focus ring visible on every interactive element
- [ ] Coloured signals also carry a word or shape
- [ ] Empty, loading and error states present
- [ ] Checked at 375px, in light and dark, and with reduced motion
- [ ] Cook Mode text ≥ 17px, step text 28px
