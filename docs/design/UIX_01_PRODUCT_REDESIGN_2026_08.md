# UIX-01 — the product redesign, August 2026

> A deliberate **product redesign** of the DalyHub shell, Today and Tasks
> against two supplied reference designs, plus the dark appearance and the phone
> composition of all three. Not a polish pass: the information architecture, the
> routes, the data model and the measurable-Goal semantics are unchanged, but
> the visual composition of the surfaces named above is substantially different
> from what it replaced, on purpose.

Evidence: `docs/design/assets/uix-01-2026-08/`, captured by
`e2e/uix-01-screenshots.spec.ts`. The same spec writes both halves of every
comparison (`SHOT_PREFIX=before-` and no prefix) against the same seeded day, so
nothing between a `before-` and its pair differs except the product.

The reference designs are the two PNGs in the repository root:

| File | What it specifies |
| --- | --- |
| `ChatGPT Image Aug 9, 2026 at 09_23_54 PM.png` | The shell, Today (desktop, phone) and the dark appearance |
| `ChatGPT Image Aug 9, 2026 at 09_24_00 PM.png` | Tasks (desktop, phone), the dark appearance, and the phone new-task sheet |

Both are unchanged by this work and must stay that way — they are the
specification, not an asset the product ships.

---

## 1. The design-language decision

**DalyHub is a bespoke personal-productivity design language built on Material
Design 3 foundations.** That is not a new answer — `DALYHUB_DESIGN_SYSTEM.md`
has opened with it since DS-14 — but UIX-01 is the pass that makes it visibly
true rather than merely written down, and it is worth being exact about which
half is which.

**What is still Material 3, and load-bearing:**

- **Colour is generated, never authored.** Every value in both appearances comes
  out of the M3 tonal-palette algorithm applied to one violet seed, including
  the six accents this pass added. `scheme:check` fails the build on a
  hand-edited hex.
- **The semantic role architecture.** `primary` / `on-primary` /
  `*-container` / `on-*-container` quartets, and the contrast guarantees that
  come with the tone assignments. Every new colour in UIX-01 is a quartet.
- **State.** One state layer, one set of opacities, one focus treatment. The
  redesign added two hosts to that list and no sixth hand-rolled hover fill.
- **Motion.** M3 duration and easing tokens; `prefers-reduced-motion` zeroes
  them globally.
- **Accessibility.** Target sizes, `aria-current`, live regions, focus
  restoration, forced-colours fallbacks — all unchanged and all extended to the
  new controls.
- **The type and shape scales**, as ladders with names.

**What is bespoke DalyHub, and now unmistakably so:**

- A task row that is one 45px line with a leading completion circle and two
  aligned trailing columns. M3 has no component for this; every reference
  productivity application has one, and the specification's nearest offer (a
  two-line list item with a trailing icon button) is what the redesign removed.
- No floating action button anywhere in the product.
- Glance widgets: a washed card with a tonal tile, at a strength generated per
  appearance.
- A destination rail of text tabs with a 2px indicator, not a segmented control.
- A capture sheet whose primary action is in its header opposite a worded
  Cancel.
- Six decorative identity accents that are deliberately NOT semantic roles.

**What comes from Apple-like restraint:** how much is drawn rather than what is
drawn — the quiet shell, the absence of permanent row controls, the grouped-list
sheet, the macro whitespace against micro density, and the rule that a control
appears when it has something to say.

**What comes from Things/Todoist:** the completion circle leading the row,
title-first scanning, date bands as the default grouping, relative dates in
words, and capture that is type-and-Enter with everything else optional.

The label to use, from the brief's own list, is **B — a bespoke DalyHub design
language built on MD3 foundations.**

---

## 2. What changed, by surface

### Foundations

| Change | Where |
| --- | --- |
| Six generated **widget accent** ramps — coral, blue, violet, green, amber, teal — as decorative identity, never status | `scripts/generate-m3-scheme.mjs` |
| A generated **`wash`** tint strength (light 40%, dark 8%) for pale tonal surfaces | same |
| `.dh-tone[data-tone]` publishes `--app-tone`, `--app-tone-container`, `--app-tone-on-container`, `--app-tone-wash` | `tokens.css` |
| `ToneIcon` — the tonal icon tile, at the same geometry and strength as the entity identity mark | `app/shared/icons/ToneIcon.tsx`, `icons.css` |
| Three new glyphs: `TrendingUpIcon`, `FilterIcon`, `FlagIcon` | `app/shared/icons/icons.tsx` |
| The completion **circle** extracted from Today into one shared control | `task-signals.css` (`.dh-check-circle`) |
| The figure-row track dropped 15rem → 14rem so four glance cards fit at 1280 | `tokens.css` |

### Shell

- The desktop top bar gained the product's one prominent action: a filled violet
  **New** button opening the shared capture surface.
- **The floating action button is gone**, from every width. The phone already
  had a labelled Capture slot in its navigation bar; the desktop now has New.
- The phone navigation bar's Capture slot is a filled violet **circle** at the
  centre of the bar (40px, inside the bar's own row, not floating). The bar grew
  6px to 66px to carry it.
- The current phone destination is marked by `primary` colour + a weight step
  over a quiet tint, replacing M3's filled `secondary-container` indicator.
- The sidebar is unchanged. VIS-01 had already taken it to the reference's
  width, row height, glyph size and selection strength.

### Today

- The glance row is four **washed tonal cards** — violet tasks, blue meetings,
  coral overdue, green progress — each with a tonal tile beside its label. The
  ring moved into its own column, so a card with one is no taller than a card
  without: ~137px became ~114px.
- The body is **three balanced regions** (Focus · Schedule · Needs attention)
  instead of one column and a 21rem rail, with **Goal progress across the full
  width** beneath them.
- Goal cards are washed in a tone derived deterministically from the Goal's id,
  with a leading mark.
- Rail rows lead with a tonal tile (attention) or the project's own persisted
  `AccentIcon` (Continue working); the per-project completion bar is gone.
- Overdue work on Today lost its tinted panel and kept its leading rule.

### Tasks

- **Date-state grouping is the default** for All active, Inbox and Upcoming, with
  short scannable headings (`OVERDUE 2`, `TODAY 6`, `THIS WEEK`, `LATER`,
  `NO DATE`).
- A **tab rail** of the five everyday built-in views sits under the title; every
  other view stays in the same panel it was always in.
- The header's long tail — Select tasks, Review Inbox, the layout switcher —
  moved into the one shared overflow menu, and a **New task** primary action
  came back, opening the capture surface already on its Task panel.
- The row: leading completion circle · dominant title · Project mark and name ·
  right-aligned relative date. One line, ~45px, no permanent action buttons, no
  urgency chip, no routine status pill, no priority capsule.
- Dates read **Yesterday / Today / Tomorrow / Thu, 12 Jun**, and take the state
  colour when they have slipped.
- The bulk-selection checkbox appears in selection **mode**.
- Quick add is a borderless list row with a leading `+`.
- On a phone: pill tabs, one band of chrome, and rows reduced to circle · title ·
  date.

### The phone capture sheet

`Cancel · New task · Save` in the header, a large borderless title field, and a
grouped list of three metadata rows (Due date, Priority, Project) that read
value-first. Title-only capture is untouched: type and press Enter.

### Dark

The wash strength is generated per appearance and is 8% in dark, because the
dark reference barely tints these cards at all — the coloured tile carries the
identity there. Every accent's `on-surface` text on its wash, and every tile
glyph on its tile, is asserted in `contrast.test.ts` in both appearances.

---

## 3. Deliberate differences from the references

| The reference shows | DalyHub does | Why |
| --- | --- | --- |
| A **search field** in the Tasks toolbar | Nothing there; the shell's search capsule sits ~40px above it | DalyHub has ONE search implementation (DS-08) and the Tasks module is a provider in it. A page-level field would be a second search to keep in step, and it would search the same records the one above it already does |
| A **notification bell** in the top bar | Nothing | DalyHub has no notification system. A bell that never rings is a decorative control (this is the clearest case in the pass where the product's truth has to win over the picture) |
| **Focus time** and an **events/calendar engine** on Today | Meetings, which DalyHub actually has | The product has no focus-time tracking and no calendar integration. The composition adapts; the data is not invented |
| A **Favorites** group and an **Inbox count** in the sidebar | Neither | There is no favourites feature, and Inbox is a Tasks view rather than a navigation destination. Adding either is an information-architecture change, not a visual one |
| Group headings **inside** one card | Headings on the canvas, one card per group | Equally clean, and it lets a group's own "View all N" link belong to the group |
| A **TOMORROW** band | `TODAY`, `THIS WEEK`, `LATER` | These are the kernel's own due-state buckets. Inventing a fourth band would be a data-model change made for a heading |
| Task rows ~31px | ~45px | 44px is the WCAG 2.2 target floor and the completion control is the row's leading control. The brief is explicit that a control must not be shrunk to match the picture |

---

## 4. What is enforced

- `test/unit/tokens/contrast.test.ts` — the six accent quartets, the washed
  surface under ordinary text, and every tile glyph on its tile, in both
  appearances.
- `test/unit/tokens/state-layer.test.ts` — no new hand-rolled hover fills.
- `test/unit/tokens/tokens.test.ts` — every `--app-tone*` is a real token.
- `pnpm run scheme:check` — the generated colour blocks match the generator.
- `e2e/uix-01-screenshots.spec.ts` — the before/after matrix.
- The TASKS-10 journeys (`tasks-daily-driver`, `tasks-v22-daily-driver`,
  `tasks-journey`, `tasks-optimistic`, `tasks-collection`) exercise every
  behaviour the redesign moved: completion through the circle, selection through
  the mode, Review Inbox and the layout through the overflow, recurrence and
  priority through the row's quick-edit.
