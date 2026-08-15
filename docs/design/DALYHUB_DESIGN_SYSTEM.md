# The DalyHub Design System

> **This document is the specification.** DalyHub has its own product design
> system, and it is the authority for what the application looks like, how dense
> it is, how it behaves on a desktop and how it adapts to a phone.
>
> **Material Design 3 is machinery and historical inspiration — not the
> specification.** Its algorithms and scales are still in use and still earning
> their place: colour generated from one seed, the typescale, the shape and
> elevation scales, the state layer, the motion tokens, the accessibility
> contract. None of them settles a design question. Where DalyHub and the
> specification disagree, DalyHub wins and the reason is written down as a
> numbered departure — [§5](#5-documented-departures-from-stock-material) holds
> thirty-two of them, which is why this document, and not that specification, is
> the one to read.
>
> That authority change is DS-01 and is recorded in
> [ADR-092](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery).
> It did not invent a new visual language: everything in Part 1 below was already
> true and already shipped. What it added is a token layer with DalyHub's name on
> it, an explicit density model, and a sentence at the top of the right page.
>
> This document is the *why* and the *policy*. The mechanics — every token, every
> component's anatomy, every pattern's accessibility contract — live in
> [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), which this sits above and does not
> replace. The DS-01 audit, the component inventory, the primitive-library
> decision and the stage-by-stage migration map are in
> [`DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md`](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md).

---

## Status of this document

It has two parts, and the split is deliberate, because a design document that
describes what someone hopes is true is worse than none at all.

- **[Part 1 — What holds today](#part-1--what-holds-today)** describes the
  system as shipped. Every claim in it is enforced somewhere: a generated token,
  a unit test, an e2e assertion, or a `verify` gate.
- **[Part 2 — The agreed direction](#part-2--the-agreed-direction-not-yet-implemented)**
  records decisions taken but **not yet implemented**, with the reason each is
  still outstanding. Nothing in Part 2 may be cited as current behaviour.

---

# Part 1 — What holds today

## 1. The philosophy

**Calm workspace. Expressive moments.**

Roughly 75% restrained, 25% expressive. Expression is a *budget*: a page spends
most of it in one place, and the rest of the product is quieter because that one
place is louder.

Three influences, and what each is actually for:

| Source | What DalyHub takes | What it does **not** take |
| --- | --- | --- |
| **Material 3 Expressive** | Generated colour, state layers, typography scale, shape scale, motion tokens, component states, touch-target guidance, the accessibility contract | Its *look*, and its *authority*. A tonal surface for every container, a pill for every control, elevation as decoration, a coloured chip wherever a role exists |
| **Apple HIG** | Restraint, whitespace, content-first layouts, progressive disclosure, quality of transitions, removal of interface chrome | Its components. DalyHub is a web application, not an iOS imitation |
| **Things · Todoist** | Capture speed, inline editing, keyboard efficiency, information density without clutter, the separation of planning from doing | Their information architecture. DalyHub's spine is Area → Goal → Project → Task |
| **Griply and the goal-tracking references** | That a Goal is worth *drawing* — a reading, a shape and a distance rather than a percentage on a bar | Their gamification. No streaks, no scores, no manufactured urgency ([AGENTS.md §2](../../AGENTS.md#2-product-philosophy)) |

**The rule that resolves conflicts between them:** Material supplies *values and
machinery*; Apple and the productivity references inform *how much of it to
draw*; **DalyHub decides.** Before DS-01 the first clause read "Material tells us
what a thing is and how it must behave", and thirty-two departures had already
stopped that from being true.

The four principles that follow from it, and which every stage after DS-01 is
measured against:

1. **Productivity first.** The application optimises for finishing work, not for
   showing components. An ordinary control disappears into the interface; the
   content dominates.
2. **Restraint.** No excessive cardification, no huge tonal containers, no pill
   on every rectangle, no decorative surface, no giant button where a compact
   one does the job. A page is not a collection of floating cards. §5's D1, D13,
   D18 and D24 are this principle with measurements attached.
3. **Expression is selective, and it is a budget.** A page spends it in one
   place — see §3.
4. **Desktop is desktop; mobile is adaptive.** Neither is the other one resized.
   §8 and §12 are the specifics.

## 2. The decision rule

When two options are both defensible, in this order:

1. Does it make the user's task easier?
2. Does it improve clarity?
3. Does it work on an iPhone?
4. Does it stay accessible?
5. Does it fit the DalyHub visual language?
6. Is it more attractive?

Usability is never sacrificed to satisfy a design-system rule — **including the
rules in this document**.

## 3. The hierarchy model

Every surface in the product is exactly one of three levels. The full table,
with the token for each rung, is in
[`DESIGN_SYSTEM.md` → the hierarchy model](DESIGN_SYSTEM.md#the-hierarchy-model-m3x-02).

| Level | What it is | How many per page |
| --- | --- | --- |
| **1 — Dominant** | The surface answering the question the page exists to answer | One, at most — **zero is a legitimate answer**, and Today's is zero |
| **2 — Supporting expressive** | Identity, progress, a focus, a next action | Two or three — not a gallery |
| **3 — Quiet interface** | Everything the owner works *in* | The rest |

Levels are separated on **every** axis at once — shape, padding, surface, depth,
text colour, and what each is allowed to carry. A level separated on one axis is
a coincidence, not a hierarchy.

## 4. Foundations, in one place each

| Foundation | Where it lives | The rule |
| --- | --- | --- |
| **The vocabulary** | `tokens.css` → the DS-01 DalyHub layer; published in `app/shared/tokens/dalyhub.ts` | `--dh-*` is what a component reaches for. Everything below it is machinery. See [§10](#10-token-architecture-ds-01) |
| **Density** | `tokens.css` → `[data-dh-density]` | Three presets over eight tokens, and nothing but those eight. See [§11](#11-density-ds-01) |
| **Colour** | `scripts/generate-m3-scheme.mjs` → `tokens.css` + `scheme.ts` | Generated from one violet seed, never authored. `scheme:check` fails the build on a hand-edited hex |
| **Decorative identity** | `tokens.css` → `.dh-tone[data-tone]` | Six named widget accents (coral · blue · violet · green · amber · teal), published as `--app-tone*`. A surface declares WHICH identity it has; it never names a colour. Never status (D21) |
| **Typography** | `tokens.css` | One family (Roboto Flex, `wght` axis). **Emphasis is weight, not size** |
| **Shape** | `tokens.css` | Six semantic rungs — hero, entity-card, card, metric, supporting, control (20 · 16 · 16 · 12 · 12 · 8). Nesting always steps *down* |
| **Spacing / sizing** | `tokens.css` (`--app-*`) | Structural values M3 does not own |
| **Elevation** | `tokens.css` | Two names: `resting` (none) and `raised`. Separation is surface *value*; depth is for things that genuinely float. Since UIX-06 every card family obeys D1, including the three that predate it |
| **Controls** | `base.css` — the control baseline | One rung for every native `input`/`select`/`textarea` and for `.dh-btn`: `--app-control-height-lg` on `--app-shape-control`. A module never restates it (UIX-06) |
| **Motion** | `tokens.css` | M3 duration and easing tokens. Nothing animates on load |

Application code — CSS and components alike — never hard-codes a raw hex, pixel,
radius, shadow or duration where a token exists. Adding a colour means changing
the generator; adding anything else means adding the token first.

## 5. Documented departures from stock Material

Each of these is a place where DalyHub deliberately does something the
specification does not, because the specification's answer was worse *here*.

| # | Departure | Why |
| --- | --- | --- |
| D1 | ~~A card draws no border and no resting shadow.~~ **AMENDED by D44 (DS-05).** The original reasoning — that spending a hairline *and* a shadow *and* a radius on every box left nothing to escalate with — still holds, and D44 spends only ONE of the three | The premise that failed is "the surface step is enough". It is, at seven surfaces; it is not at the twelve-to-twenty a gallery renders, where the eye reads a field of slightly-different-white rectangles. DS-02 had already conceded this for `.dh-dcard`; DS-05 finished the argument for the record cards |
| D2 | **Blue is semantic, not the brand.** Chart series 1, Area accent 1, the Project entity and priority P3 keep blue under a violet seed | A violet series collides with the purple series after harmonisation and breaks the 25° legend rule; a Project badge must not be the colour the product spends on action; the priority ramp reads as a temperature |
| D3 | **Overdue work is `state-overdue`, never `error`** | A slipped task is a state of a record, not an application fault |
| D4 | **Tinted surfaces mix by a *generated* strength, per appearance** | A container role is a pale tone in light and a saturated tone-30 in dark. One percentage cannot serve both — the same mix that warms a light card paints a slab on a dark one |
| D5 | **An entity card's progress bar is 8px, not the product's 6px** | The one surface whose entire job is a proportion. At gallery width a 6px rule reads as a divider |
| D6 | **An entity card's bar takes the *record's* identity accent, not `primary`** | Twelve identical violet bars give the eye nothing to track down a grid |
| D7 | **Today's completion control is a circle; a collection's selection control stays a square** | DalyHub genuinely has both acts. Completing and selecting now look different |
| D8 | **Below `md`, a mouse gets the touch layout** for the row action rail | `(hover: hover)` describes a pointer, not a window. A narrow window with a mouse got a 192px reserve out of a 263px run |
| D9 | **An optional select is EMPTY, never "No priority"** | An absence is not a decision. It also stops the unset state taking the first slot in a menu, where the eye and the keyboard both start |
| D10 | **Five generated colour SCHEMES, and still no theme feature.** Each is a token map over the one design system — light and dark, both first-class — selected by `<html data-color-scheme>` alongside the independent appearance preference (THEME-01, [ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-089-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance)) | A component styled once is correct in all ten combinations, because nothing outside `tokens.css` may branch on a scheme — asserted by test. A scheme changes colour personality; typography, spacing, shape, layout and motion are identical in all five |
| D11 | **Today has no hero.** Its figures are a row of quiet cards on the canvas | A hero spends the page's largest type on a headline and leaves the numbers at label size beside it — on the one screen whose entire question is the numbers. The row spends it on the figures, and tints nothing |
| D12 | **The permanent navigation drawer is 216px**, outside M3's 232–248 band, and a destination is **36px of visual row on a fine pointer** — floored to the 45px target on a coarse one (amended by DS-03) | 240 is the specification's figure for a drawer a user *opens*; DalyHub's is permanent, holds fourteen destinations and is on screen for the whole session. VIS-01's 44px came from "a painted row should not be larger than the target it serves", which is a rule about a TOUCH target — and the rail is the one navigation surface a finger never touches, since it is hidden below `md` and the phone bar (D15) is what a thumb gets. Fourteen destinations at 36 is 504px of column rather than 616, which is what fits the rail and its account block on a 900px laptop viewport. The floor is unconditional under `(pointer: coarse)`, so the tablet rail and the phone's navigation sheet keep a full target |
| D13 | ~~**A pill is reserved for a primary or destructive action.**~~ **Superseded by D33** (DS-02). It was the right correction to `corner-full` on all five variants — but the answer turned out to be no stadium at all, not a smaller number of them | `corner-full` on all five variants made shape say nothing about emphasis. A stadium means "this is the action" only when most things are not one |
| D14 | **The segmented control is a sunken track with a soft raised chip**, not M3's outlined capsule with inter-segment dividers | Three pieces of chrome to say "one of these is chosen", in seven collection headers. The track and the lifted chip draw the same boundary the border and the dividers did |
| D15 | **The phone navigation bar is 60px** with a 40×26 indicator, not M3's 80px with a 64×32 capsule | The extra 20px exists to make room for the capsule, and the capsule was the most painted chrome on the phone's most permanent surface. Every destination is still a full-height target well over 44px |
| D16 | **The writing surfaces have no box.** No outline, no fill, no corners — one hairline under the toolbar | A note is not a form field. The page is the paper; the toolbar is the only chrome the surface keeps besides its focus ring |
| D17 | **The identity mark mixes its container toward the card by a generated strength** | D4 applied to identity: a gallery of nine tone-30 containers is a rainbow of coloured rectangles in dark and a soft palette in light. The mix is contrast-safe in both directions by construction, and asserted over all six ramps |
| D18 | **A task list row is ONE line, ~45px, and carries no permanent action buttons** (UIX-01) | M3 has no opinion about a task row, and the row this replaced had eight facts at near-equal weight over two lines with "Complete" and "Today" under every title. The completion circle leads, the title is dominant, the Project mark and the date form two aligned trailing columns, and everything else is on hover, in the overflow, or on the record |
| D19 | **The floating action button is gone** (UIX-01) | M3 gives an application one FAB for its most frequent creative act. DalyHub's was capture, and CAPTURE-02 had already removed it from the phone because the navigation bar carried the same action with a label on it. That left a 56px elevated circle floating over a calm desktop canvas, diagonally opposite the utilities it belongs with. Create is now the top app bar's one violet control |
| D20 | **The sheet's primary action can live in its HEADER**, opposite a worded Cancel (UIX-01) | Every native platform draws a task-capture sheet as `Cancel · Title · Save`, and a sticky footer under a phone keyboard is a second bar competing with the one the OS already put there. `<button form="…">` submits a form it is not inside, so this is a slot rather than a second submit path |
| D21 | **Decorative identity has its own colour ramp** (`accent-*`), separate from every semantic one (UIX-01) | A coral glance widget is "tasks due today", not a warning; an amber Goal mark is not "at risk". Painting decoration with `state-overdue` or `success` makes it impossible to change the semantic role later without repainting the decoration |
| D22 | **A record's identity ramp is the WIDGET accent ramp, not the chart ramp** (UIX-02) | `area-accent-*` was `chart-*` reused, and chart hues are chosen so a LEGEND stays separable — 25° of asserted HCT separation over six swatches the eye compares side by side. That is the wrong optimisation for a colour drawn under a title: it put an olive, a magenta and a crimson on Project progress bars, and the crimson read as a STATE purely because of where its Area sorted |
| D23 | **The sixth identity slot is a cyan where the widget ramp's is a coral** (UIX-02) | The one place the two lists differ, and it is about where each is drawn. Harmonisation rotates every design hue up to 15° toward the seed, so any warm-red source lands at HCT hue ~20 against `state-overdue`'s 8.5. As a pale WASH under a worded label that is fine; as a full-strength fill on a progress bar, one line under an attention line drawn in the real overdue colour, it is a Project claiming to be in trouble. Cyan is the one hue with genuinely empty space around it — 26° from teal, 57° from blue, clear of every semantic role |
| D24 | **A Project card states its condition ONCE, as a line rather than a chip** (UIX-02) | The gallery carried a filled status pill beside the title *and* the health reason explaining it three rows below: one fact, two objects, and the pill was the loudest thing on a card whose job is to be recognised by its mark. A dot and the words say it once, and the compact wording is built from the evaluator's own structured count |
| D25 | **An Area is drawn as a ROW; only a Project gets a gallery card** (UIX-02) | They shared one component, so the two most different records in the spine were the same object with different words in it — and an Area has no description, no completion, no due date and no progress, so most of each card was empty. The difference is now structural, which is what makes them distinguishable with the labels hidden |
| D26 | **A Person's identity mark is a CIRCLE; every other record's is a rounded square** (UIX-05) | The square is a container, and every record it holds — an Area, a Project, a Goal, an Asset — is one. A person is not a container, and the circular avatar is the one identity mark in the product that is a photograph as often as it is a glyph. It is also the strongest single recognition device on any collection surface: a face is found faster than a name |
| D27 | **An ASSET card spends its colour on STATE, not on identity** (UIX-05) | Every other record family paints its mark with the owner's own classification — a Project's Area, a Person's circle. An Asset's classification is its TYPE, and thirteen types over a six-accent ramp collide two times in three, so the tint would be a coincidence rather than a signal. The type glyph is far stronger (a car and a shield are told apart instantly), so the mark stays neutral and the colour goes to the one thing that screen exists to answer: what is overdue. This does not breach D21 — the identity mark is still never repainted by state; the mark and the due block are separate objects, and the state always carries its own words |
| D28 | **A completed Review draws NO progress bar** (UIX-05) | "An absence is not a zero" pointed the other way: a settled fact is not a live measure. Once a Review is closed, "how much is written?" has stopped being interesting, and a full bar on every past Review turns the gallery into a wall of identical green with nothing to scan. It states when it closed instead — the fact that matters afterwards |
| D29 | **Analytics states a comparison as a SENTENCE, never a percentage or a coloured arrow** (UIX-05) | "6 more than the previous period (18)" is checkable; "+33%" hides its base, and from a base of zero it is not a figure at all — so the evaluator refuses that case in words rather than inventing one. Nor is the direction painted: a week with fewer completed Tasks may be a week of one large Project, and green-for-up/red-for-down would make the product an opinion rather than a record |
| D30 | **A COLLECTION header draws no glyph beside its title; a RECORD header does** (UIX-06) | The badge was decoration — the same glyph the sidebar is already showing, highlighted, for the same route — and it made three page origins impossible to reconcile, because Today and Analytics have no entity type to badge and so started 40px to the left of every collection. A record's mark is not decoration: it carries the Area's identity accent (D22/§6.2), which is the only thing that groups a gallery visually without a heading |
| D31 | **A `<select>` is REPAINTED, never replaced** (UIX-06) | Four collection headers shipped the user-agent chevron beside a designed control. Replacing the element with a bespoke listbox costs the platform picker on touch, the free keyboard behaviour, the assistive-technology semantics and the no-JS form submit — for a visual problem `appearance: none` solves outright, since it changes only how the CLOSED control is painted. The chevron is a gradient pair rather than an asset, so it takes `currentColor` and is correct in both appearances and in forced colours by construction |
| D32 | **A task row draws its LOW tier nowhere** (UIX-06) | D18 already put the sector, the delegate and the waiting note "on hover, in the overflow, or on the record"; the row drew all three permanently anyway, which is what made its two "aligned trailing columns" impossible to align — the marks spread over 200px, and `Sector: This Week` wrapped to a second line inside a 45px row. Squaring the columns up only made the cost visible: the facts compressed to "Se… De…", and a fact that ellipsises to two letters has stopped carrying information |
| D33 | **No button is a stadium.** Every variant — primary and destructive included — takes `--dh-radius-control`, and so does every field, select and icon button beside it (DS-02) | D13 kept the pill for the one primary action and that is still a real distinction; it is just not one that shape should carry. At DS-02's control height a stadium is a lozenge, and a header holding a filled "New task" pill, an outlined "Filter & sort" pill and an 8px-cornered search field read as two design systems sharing a row. Emphasis is fill, border and content colour — three axes, all of which survive being the same shape — and the shape rung is then shared with the control beside it, which is what makes a toolbar read as one control set. The stadium survives where it is a *drawing* rather than a control's corner: a status dot, a spinner, an avatar |
| D34 | **A generic card may draw a hairline** — amending D1's scope for the plain bounded surface only (DS-02) | D1 said separation is the surface step alone, and on a canvas holding a few large tonal cards that is right and still holds for the six record families. At the count a dense productivity surface actually renders — Today draws seven titled panels — the tonal step stops being a boundary and the eye reads a field of slightly-different-white rectangles. The card still spends only ONE device: a hairline and no shadow, on a corner one rung smaller than a record card's. `raised` exists for a surface that has genuinely left the canvas, never for emphasis || D35 | **The navigation rail is TWO TONES UNDER ITS OWN CANVAS in both appearances** — near-white under a white page in light, near-black under a dark page in dark, with its own foreground, border, selection and focus names (DS-03, **amended by FINAL-UI**) | DS-03 made this rail near-BLACK in both appearances, reading the two exploratory references as drawing DalyHub that way. The three approved product concepts draw the opposite in every image and at every width, so the value follows the appearance again and what the departure now names is the RELATIONSHIP — the rail is recessed relative to the page it frames, which is what makes it the same object in both appearances now that it is no longer the same hex. It remains a separate colour family from `surface-navigation` rather than a re-toning of it: a navigation object drawn ON the page — the phone bar, the modal navigation sheet — sits ABOVE it and must stay bright over a bright page a thumb is holding. The foregrounds are still named for the rail and travel with it, because they are chosen against ITS surface rather than the appearance's. See [ADR-096](../decisions/ARCHITECTURE_DECISIONS.md) |
| D39 | **TWO hairlines: a card BOUNDARY and a row DIVIDER** — `--dh-color-border` at tone 87 and `--dh-color-divider` at 94 (REFINE) | The approved concepts draw a card's edge at ~1.36:1 against its canvas and a row rule inside it at ~1.03. One token cannot be both, and the single value DalyHub had was tuned for neither: the card edge read as a suggestion while every list carried a visible grid. Neither owes contrast — `--dh-color-border-strong` remains the boundary that IDENTIFIES a control and owes 3:1. See [ADR-096](../decisions/ARCHITECTURE_DECISIONS.md) decision 7 |
| D36 | **The selected destination's accent is a different ROLE per appearance** — `primary` in light, `primary-container` in dark (DS-03) | M3's own construction rather than a DalyHub preference: `primary` is a saturated mid-tone in light and a pale tone-80 in dark, because in dark it must be legible AS TEXT on a dark surface. Mixed into a near-black rail it therefore lightens rather than saturates, and the first build of D35 shipped a pale lavender pill. `primary-container` is the mirror image. Each appearance takes the role that is the saturated violet in it, emitted by the generator — the only place a value may differ by appearance. **FINAL-UI** keeps both assignments and adds `on-rail-selected` beside them: a light rail's current row is a 12% lavender tint whose label must be `primary`, and a dark rail's is an 80% block whose label must be the rail's own light foreground, because violet-on-violet is the least legible pairing on a dark rail |
| D37 | **The rail draws its own focus ring**, in its own text colour rather than the product's one `primary` indicator (DS-03) | Not a style choice — a WCAG 1.4.11 fix. `primary` over the rail measures 2.40–2.42:1 in all five schemes, so the most-traversed keyboard region in the product would have shipped with a failing indicator, invisible to a light-only review because every other light surface passes. Only `outline-color` changes; the width and offset stay the DS-01 tokens |
| D38 | **The rail collapses to glyphs on a TABLET, and there is no collapse preference** (DS-03) | 216px of labelled rail on a 900px window is 24% of the screen spent on navigation on the device class with the least to spare — and it was the absence of a decision rather than one, because the shell's only breakpoint was "is this a phone". A media query is correct on the first byte, costs no state, and cannot disagree with itself between the server and the browser; a toggle would need a persisted preference, a server read to avoid a first-paint flash, and an action. Labels are hidden VISUALLY, never removed, so every destination keeps its accessible name at every width |
| D39 | **A dense list is a COLUMN GRID and a product component, not the generic Card** (DS-04) | The Card lays metadata out as a wrapping flex run, and a date column only reads as a column because every date in it starts at the same x. This is the ONE licensed exception to "no per-module card": it is licensed by the LAYOUT being inexpressible, never by a module wanting different styling. The row owns no authority — every edit is a shared control posting a canonical intent |
| D40 | **A list's responsive authority is the LIST's width, not the window's** (DS-04) | The Board and Time Sectors presentations render the same list inside ~380px columns, so a window query handed a narrow column a grid whose fixed tracks alone are 480px — a horizontal overflow of the document. It also fixes the quieter case: at 1024px the rail takes 216px and the list has ~740px, less than a 768px phone gets with no rail. A container query cannot style its own container, so a template consumed by rows is re-declared on the ROWS inside each query |
| D41 | **A flat list is drawn on a WHITE workspace; a card dashboard keeps the sunken one** (DS-04) | Both concept references make the distinction explicitly. A hairline-separated list on a tinted ground has neither the cards' separation nor the white page's calm — it reads as "cards, without the cards" |
| D42 | **A record DRAWER is a raised neutral surface, never a tinted one** (DS-04) | `surface-container-low` is a generated tonal step that resolves to a lavender wash in the violet scheme, so every record in the product opened onto a purple panel — which is exactly what reserving the accent for action, selection and focus exists to prevent. The elevation and the radius already say the panel floats |
| D43 | **An affordance may be invisible until hover; it may never be smaller than 24×24** (DS-04) | Learned expensively: making the row's inline triggers read as plain text produced 16×18px targets on four adjacent editors — `target-size` serious under WCAG 2.2, on every task, invisible to the eye and caught by the axe pass. Quiet is a property of the PAINT |
| D44 | **ONE card boundary for the whole product: a hairline, a 12px corner, no shadow** (DS-05) | Amends D1. Measured on the whole-app baseline: the record families (`.dh-pcard`, `.dh-gcard`, `.dh-acard`, `.dh-ecard`) still painted a shadow, no border and a 16px corner while `.dh-dcard` had moved to a hairline and 12px in DS-02 — so a gallery read as a different product from the panel beside it. Both concepts draw one card. Hover is a border change rather than a lift, so the grid never moves |
| D45 | **A Goal's reading is TEXT ON THE CARD; identity is drawn at the mark and the bar, never as a field** (DS-05) | The tinted reading block was the Goal card's signature from UIX-01 and the largest, loudest object on it — ~110px of saturated mint, peach or pale blue, on every card, so a gallery of ten read as a colour swatch page. The same wash was on Today's goal tiles. A hue at 40px (the mark) and 6px (the fill) is a signal; a hue at 110px is a field |
| D46 | **A SELECTION is a tint, never a tonal slab — including in Settings** (DS-08) | `secondary-container` at full strength filled 70px rows in the appearance list, the colour-scheme list, the settings section nav, the notes rail and the Diary type rail. `--dh-color-surface-selected` is what the navigation rail and every menu already paint, and the tint version keeps every non-colour signal (a real radio, a check glyph, `aria-current`, a weight step, an accent edge). It also removes a contrast trap: `on-secondary-container` clears 4.5:1 against its own container exactly, so any transparency over it fails |
| D47 | **A collection's COUNT sits beside its title; its create action is `+ New <thing>` in sentence case** (DS-08) | Both were established by DS-04 for Tasks alone, and the whole-app baseline found one collection header in the product and seven of another. The count moved from `.dh-collection--tasks` to `.dh-pane-header--compact`, which is the collection band itself. The record band (`--identity`) is untouched: a record's supporting line is a sentence, and a sentence belongs under the title |

## 5a. Projects and Areas — related, and deliberately not alike

Shipped in UIX-02. The spine's two middle rungs answer different questions, so
they are drawn as different objects:

| | **Project** | **Area** |
| --- | --- | --- |
| The question | How is this going, and does it need me? | What part of my life is this, and what is happening there? |
| The surface | A gallery card (`ProjectCard`) | A row in one list (`EntityRow` / `EntityRowList`) |
| Leads with | The mark, then the measure | The mark, then the relationships |
| Carries a proportion | **Yes** — an 8px bar in the record's own accent, with its percentage | **Never.** An Area does not complete (§4), so there is nothing to express as one |
| Condition | ONE attention line, from the health evaluator | Its **momentum**, on the record only, in the evaluator's own words |
| Density | 3 columns at 1280, 4 at 1440 | One row each, at one height |

Three rules hold across both:

1. **Identity is never status.** The mark and the bar take the record's stable
   rank (ADR-068 §5); the attention line takes the health tone. A Project with a
   violet identity that is running late stays violet and says "3 overdue" beside
   it — the two never repaint each other.
2. **An absence is not a zero.** A Project with no tasks draws no bar and no
   percentage; it says "No tasks yet" once, in the space the bar would have
   taken. An Area with nothing in it says "Ready for its first Project" — but an
   Area holding only loose tasks is *being used*, and says nothing at all,
   because the figure beside it already does.
3. **No Area health is invented.** There is no score, no traffic light and no
   percentage. The Areas index states what is IN each Area; the Area record
   states the momentum the kernel actually evaluates, and nothing more.

## 5b. The record surface families — six, and none a variant of another

Completed in UIX-05. The product's collections are read by SHAPE before a word of
them is read, so two records that answer different questions are drawn as
different objects. The test is §41's: distinguishable with the labels hidden.

| | Leads with | Its measure | Colour carries | Surface |
| --- | --- | --- | --- | --- |
| **Project** `.dh-pcard` | mark, then the measure | a proportion — 8px bar + % | the Area's identity | gallery card, bottom-heavy |
| **Goal** `.dh-gcard` | mark, then the reading | a reading and its shape | the Area's identity | gallery card, middle-heavy |
| **Area** `.dh-erow` | mark, then relationships | **none** — an Area never completes | its own identity | one row list |
| **Person** `.dh-prow` | a **face** (D26) | **none** — a rhythm, in words | the circle's identity | one row list, four columns |
| **Asset** `.dh-acard` | a type **glyph** | **time** to the next commitment | the commitment's **state** (D27) | gallery card, bottom-heavy |
| **Review** `.dh-rcard` | a **period** | the reflection, as a fraction | the state, as one dot | gallery card, top-heavy |

Three rules hold across all six:

1. **Identity is never status.** The mark takes the record's stable classification
   (ADR-068 §5); the state line takes the state's own tone. The one family that
   spends colour on state does so on a *separate object*, and D27 says why.
2. **An absence is not a zero.** No bar for a Project with no tasks, no percentage
   for a Goal with no target, no circle for a Person with no relationship
   recorded, "Nothing scheduled" for an Asset with no commitment — each stated
   once, in the space the figure would have taken.
3. **A gallery is for records with enough to fill one.** A Person and an Area have
   four facts each, so both are rows; a Project, a Goal, an Asset and a Review each
   carry a measure worth comparing across a grid, so all four are cards.

## 5c. People — the circle

Shipped in UIX-05. People has thirteen relationship values, which is the right
vocabulary for a record and the wrong one for a collection: thirteen tabs is not a
view rail, and a thirteen-value select is a filter nobody opens.

A **circle** is that vocabulary at collection altitude — Personal, Work, Services
— and it is a **pure derivation** of the relationship the owner already chose, so
there is no second vocabulary to keep in step and no migration. It is the People
collection's one view rail, and it supplies the avatar's identity accent under the
same rule a Goal follows for its Area (D21/D22).

`other` maps to **no circle**. It is a real choice meaning "none of these", so
putting it in one would invent the classification the owner declined to make;
those People appear under All and nowhere else.

## 5d. Analytics — what a figure has to earn

Shipped in UIX-05. Analytics is the product's first surface whose subject is not a
record, and every rule it follows is about what it will not say:

| Rule | What it rules out |
| --- | --- |
| **Every figure is exact and comes from an existing read** | No estimate, no sampled aggregate, and no second source of truth for a count another surface already produces |
| **Every figure links to the records behind it** | A number the owner cannot check is a number they have to trust |
| **No metric the product does not record** | No focus time, no "daily progress" percentage — DalyHub tracks no time and computes no percentage of a life |
| **No score, index or grade** | REVIEW-03's own refusal: one number mixing tasks, Goals and Areas would look precise and mean nothing |
| **Comparisons are sentences** (D29) | No percentage change, no coloured arrow, and no comparison at all against a period with nothing in it |
| **Fixed spans, not a free date picker** | An arbitrary window has no honest previous period to compare against |

## 6. Measurable Goals — the visual language

Shipped in GOAL-02. A Goal carries a **measurement**, and its representation is
chosen from the measurement TYPE rather than reduced to a percentage:

| Type | What the surface leads with | The visualisation |
| --- | --- | --- |
| **Target value** | the current value against the target — `79.3 kg`, `Target 70 kg` | the dated trend, with the target as a quiet reference line |
| **Count** | `5 of 12 books` | a proportion bar |
| **Milestones** | `2 of 4 stages` | the stage list; completion is the measure |
| **Manual** | the owner's own percentage | a proportion bar, because a percentage is what was stated |
| **Not measured** | "Not measured yet", and how to fix it | none — a Goal DalyHub has not been told how to measure is **not 0% done** |

Three rules hold across every surface that draws one:

1. **Progress is the OUTCOME, not the work.** Where a Goal has a measurement,
   the measurement is its progress. A Goal's contributing Projects are still
   shown — they are how the outcome is being pursued — but they are no longer
   the progress figure, and they never overrule a recorded reading.
2. **A reading is a fact, a percentage is a derivation.** The value is drawn
   larger than the percentage everywhere, and the percentage is never drawn
   without the value that produced it.
3. **An absence is never drawn as a state.** No empty bar, no `0%`, no chip
   announcing that something has not been configured.

Density is by surface, and it is a ladder rather than one component at three
sizes: Today shows a **glance** (title, value, one visualisation, one state);
the gallery card shows a **choice** (identity, title, value, bar, one fact); the
record shows the **whole thing** (metric strip, pace, trend, history, stages).

### 6.1 The Goal card (UIX-03)

A Goal is an OUTCOME being moved toward; a Project is work being moved forward.
UIX-02 gave Projects `.dh-pcard` for that reason and left Goals on the generic
entity card, so the gallery answered a Project's question on the Goals screen.
`.dh-gcard` is the third family in the one shared grid:

```
┌────────────────────────────────────────┐
│ [mark]  Reach 70 kg                 ⋯  │
│         Health & Fitness               │
│                                        │
│ 79.3 kg                    ╲╱╲___      │  ← the outcome, and its shape
│ from 85 kg  →  70 kg                   │  ← the journey, in words
│                                        │
│ ███████░░░░░░░░░░░░░░░░  38%           │
│ On track · 9.3 kg to go · 10 Dec 2026  │  ← state, distance, deadline
└────────────────────────────────────────┘
```

| Rule | Why |
| --- | --- |
| **The reading leads, not the percentage** | "79.3 kg" is what the owner set out to change; "38%" is a derivation of it. The Project card inverts this because a Project's own unit — a task — is not what its owner counts |
| **The journey is stated** (`from 85 kg → 70 kg`) | A percentage is only checkable if the reader knows where it started. This is the one fact neither the reading nor the target carries |
| **One visual, chosen by the data** | A sparkline where history supports one; the bar alone where it does not. Never a flat line drawn from a single reading, and never two drawings of one number |
| **An absence is drawn as an absence** | No bar for a Goal with no measurement — its definition of done takes the space the reading would have had |

### 6.2 Goal identity is the AREA's

A Goal has no accent of its own. It inherits its Area's rank and glyph — the
same rule a Project follows (D21/D22) — resolved server-side on every Goal read
and applied ONCE per card: the mark, the wash behind the reading, the bar and
the sparkline all take it. A grid of Goals therefore groups visually by the part
of life each serves without needing a heading.

Before UIX-03 every Goal in the gallery drew the same neutral grey flag, and
Today derived a tone from a hash of the Goal's id — stable, and stable is not
the same as meaningful: one Goal was green on Today and grey in the gallery, and
neither colour said anything.

### 6.3 The trend chart shows the target

`TrendLine` scales its vertical domain to include the **target**, not only the
readings. The consequence is deliberate: a Goal a third of the way there draws
its line across the top third of the plot, and the distance still to cover is
the empty space between the line and the dashed reference.

That empty space is the information. The previous behaviour — scale to the
readings, draw the target only if it happened to land inside them — meant the
product's own acceptance Goal (85 kg → 79.3 kg, target 70 kg) never showed its
target at all: the chart answered "have I moved?" and silently refused "am I
getting there?".

Supporting rules: three quiet gridlines and no numeric axis (the range is real
text beneath the plot, which wraps and scales); the target and the baseline are
told apart by **dash pattern** and by a pinned text tag, never by hue; and the
plot is ONE tab stop with arrow-key stepping rather than one focus target per
reading, because a year of weigh-ins would otherwise put fifty tab stops between
the chart and the next control.

### 6.4 Sparkline vs. TrendLine

| | `Sparkline` | `TrendLine` |
| --- | --- | --- |
| Where | gallery card | Goal record |
| Axes, grid, labels | none | range + dates as text, three gridlines |
| Accessibility | `aria-hidden` — every fact it shows is printed beside it | `role="img"` with a required summary, rendered visibly too |
| Minimum data | two readings | two readings |

The accessibility split is the important line. A sparkline sits beside its
card's reading, target and percentage, so a summary would be a fourth reading of
announced facts. A `TrendLine` is the only statement of its series, so it is
never decorative.

### 6.5 The record is a workspace, not a summary

A measurable Goal's progress is the reason its record exists, so it is a
top-level region (`RecordLayout`'s `feature` slot) **above** the summary band —
not, as before UIX-03, the band's `description`, which put a chart inside a
summary card inside the record. The band keeps what RECORD-01 designed it for:
the Project contribution and the alignment state, which describe the WORK.

The region opens with a labelled metric strip — **Start · Now · Target ·
Remaining** — with `Now` a rung larger than its neighbours, because start and
target are fixed facts the owner chose and the current value is the one that
moved. Once the target is passed, the fourth column switches from `Remaining` to
`Achieved · 113% of target`: "0 kg to go" is true and useless.

## 7. Interaction principles

- **Inline editing is the default.** Where a value can be safely changed in
  place, it is — a title, a priority, a date, a parent. Opening a form to change
  one field is a failure of this principle. Every inline save posts to the
  canonical route and reports the **server's** answer; a refusal keeps the
  previous value with the message beside it. No optimistic write is invented to
  make editing look faster than it is.
- **Replacing a selection never requires clearing it first.** Open, choose,
  done. Audited across every select, combobox and picker.
- **Capture is one gesture.** The global `+` at every width, `c` from the
  keyboard, one-line quick add in Tasks. A module does not add a second "New"
  button where global capture already creates the same record.
- **Progressive disclosure.** Routine creation asks for very few fields;
  advanced metadata appears when asked for.
- **Keyboard-complete.** Everything reachable by pointer is reachable by
  keyboard, with a visible ring and a logical order.
- **Composition is DOM order, never `order`.** A responsive grid may place a
  surface in a different column; it may not move it past its neighbours,
  because `order` moves pixels and leaves the reading order and the tab order
  behind.

## 8. Responsive behaviour

Desktop and phone are allowed genuinely different **compositions** of the same
data, the same routes and the same components. That is the design, not a
divergence to reconcile.

| | Desktop | Phone |
| --- | --- | --- |
| Today | Three unequal regions | One priority stream |
| Projects | Gallery | Compact rows, same DOM |
| Areas | One row list | The same rows, tighter |
| Notes | Gallery + persistent compact filters | Clean list + a disclosure |
| People | Four columns: face · identity · reach · rhythm | Two lines: name + state, then the last shared moment |
| Analytics | Metric row, then trend beside distribution | The metric row two-by-two, then the panels stacked |
| Settings | Grouped rail beside the section | **Two screens** — the section list, then one section |
| Collections | Persistent controls | Sheets and scrolling rails |

Validated at 320 · 375 · 390 · 430 · 768 · 1024 · 1280 · 1440 · 1920 · 2560.
The laptop widths get the most attention, because that is where a title wraps or
a gallery loses a column. **A title that wraps unnecessarily at a normal laptop
width is a defect**, not a nuance.

**The FRAME has three compositions, not two** (DS-03). Desktop and phone were the
only two the shell distinguished, so a tablet got the desktop rail at full width:

| | ≥ `lg` (1024) | `md`–`lg` (768–1023) | < `md` |
| --- | --- | --- | --- |
| Navigation | 216px labelled rail | **68px glyph rail**, tooltipped | bottom bar + More sheet |
| Top chrome | 56px bar, search field at the gutter | 56px bar, search as a glyph | 52px title bar |
| Identity | brand top of rail, account bottom | mark and avatar only | in the More sheet |

The middle column is a media query rather than a preference — see D38. The page
frame itself does not change between them: one origin (rail → gutter →
everything), one content measure, one page-header anatomy at every width.

## 9. Accessibility

WCAG 2.2 AA, verified rather than assumed. Contrast is asserted over the
*generated* scheme in both appearances, including the composed expressive
surfaces and every identity progress fill. Touch floors are unconditional except
where a rule positively detects a genuine mouse. Colour is never the only
signal — every accent, tint and state has a word beside it.

Three things DS-01 made *enforced* rather than assumed:

- **Density can never reduce a touch target.** See [§11](#11-density-ds-01).
- **The focus indicator is three tokens, not a per-component decision** —
  `--dh-focus-width` / `-offset` / `-color`. It still follows each component's
  own corner radius, so there is nothing to keep in sync.
- **Border semantics are named by the WCAG distinction.**
  `--dh-color-border` *separates* — a divider, a card edge — and carries no
  contrast requirement of its own. `--dh-color-border-strong` *identifies a
  control* (1.4.11, 3:1) — an input's edge, a checkbox's box. Using the first
  where the second belongs is now a nameable defect.

## 10. Token architecture (DS-01)

Four layers. **A component reaches for the top one.**

```
--dh-*        THE DALYHUB DESIGN SYSTEM
                colour · space · radius · borders · elevation · focus ·
                typography · motion · density

--app-*       structural values M3 does not own
                spacing scale · sizing · shell anatomy · z-index · breakpoints

--md-app-*    the generated application surface ramp
--md-sys-*    Material's machinery — generated colour, typescale, shape,
                elevation, state layers, motion
```

Four rules, each asserted by `test/unit/tokens/dalyhub-tokens.test.ts`:

1. **No authored values.** Every `--dh-*` declaration is `var()` onto an
   existing token. A hex here would be a second source of truth beside the
   generator, invisible to `scheme:check` and covered by no contrast test.
2. **Published or absent.** Every `--dh-*` name defined anywhere must appear in
   `app/shared/tokens/dalyhub.ts`, and may be defined only in `tokens.css`.
3. **Product-owned naming.** Nothing is named after Material, Fluent, shadcn,
   Tailwind or Cupertino.
4. **The default is today's value.** Adopting a DalyHub token is a no-op; the
   migration changes vocabulary, not pixels.

**Deliberately not in the layer.** *Chart series, priority ramps and identity
accents* — those are data vocabularies, and flattening `chart-3` and
`accent-teal` into "accent" would lose the distinction D21 and D22 established.
*Breakpoints, z-index and shell anatomy* — they already exist, are tested, and
are measurements rather than vocabulary.

**On the `--dh-` prefix.** It was the pre-M3 namespace, retired by
[ADR-074](../decisions/ARCHITECTURE_DECISIONS.md#adr-074-material-design-3-as-the-design-language--one-generated-scheme-no-theme-feature-and-an-alias-layer-as-the-migration-mechanism)
decision 8. This is not that layer returning. That one mapped DalyHub's *old*
names onto M3 values, heading for M3 owning the names — deleting it was the
migration completing. This one maps DalyHub's *own* names onto M3 values,
heading for DalyHub owning both — deleting it would be the migration failing.
The prefix is reused because `.dh-` is already the CSS class namespace, so a
component's class and its tokens speak one name.

**The type roles.** Nine, named for the job rather than for a rung: page-title,
record-title, section-title, **card-title**, **metric**, body, row, meta, label.
What this adds over the typescale is the answer to "what size is a list row's
title?" — which `body-medium` is not, because `body-medium` is a size and three
different things are it for three different reasons. The scale is compact
deliberately: the largest role on an ordinary surface is 24px and there is no
display rung. **Emphasis is weight, not size.** `--dh-font-numeric` is the
tabular-figures request, in one place, so a column of readings lines up without
every author remembering the CSS.

REDESIGN-03 added the last two, and their absence is *why* the record card
families were still reading Material's typescale directly — both are real jobs in
this product and neither had a DalyHub role to reach for:

| Role | Value | The job, and what it replaced |
| --- | --- | --- |
| `card-title` | 15px / 1.3 / 600 | A record CARD's own name. Was `title-medium` (16px), and that pixel is what wrapped longer Project names onto a second line at gallery widths, leaving every card in a row as tall as its worst neighbour. |
| `metric` | 24px / 1.1 / 600 | A figure meant to be READ AS A FIGURE. Replaced a mix of `title-large` (22px) and `headline-small` (24px) that varied by which surface drew the number rather than by what the number meant. Pairs with `--dh-font-numeric`. |

**A figure is never a display rung.** The Goal record led with `display-small`
(36px) against 18px siblings, which stopped the current value being the lead
number of Start / Now / Target / Remaining and made it a banner with three
captions underneath. `metric` at 24px still reads as the lead at a glance and
lets the four be read as one reading, which is the point of the row: the
relationship between them is the measurement.

**Colour primitives are GENERATED, not authored.** Rule 1 above is not advice.
The Part B primitives — `--canvas`, `--surface*`, `--ink*`, `--border*`,
`--accent*`, the feedback, priority and category ramps — were authored as literal
values on a bare `:root`, and because every `--dh-color-*` name resolves onto
them and `base.css` paints the document from `--dh-color-bg`, that pinned the
whole product to the light appearance: choosing Dark repainted only the fragments
still reading a generated role. They now come from the generator as a light/dark
pair inside the generated markers, which is the only region `scheme:check`
compares. See
[ADR-097](../decisions/ARCHITECTURE_DECISIONS.md#adr-097-the-dalyhub-colour-primitives-are-generated-not-authored--the-appearance-pair-the-redesign-foundation-never-shipped).

## 11. Density (DS-01)

Three presets, selected by `data-dh-density` on any ancestor. The attribute is
namespaced because plain `data-density` is already taken twice, with unrelated
meanings — the Markdown editor's chrome level and the record summary's
description presence.

| | `compact` | `default` | `touch` |
| --- | --- | --- | --- |
| For | dense desktop productivity — task lists, tables, filter bars, the palette | standard desktop and tablet | comfortable, for a finger |
| Control / menu-item height | 36 | 45 | 45 |
| Row height | 45 | 56 | 64 |
| Inline · block inset | 12 · 8 | 16 · 12 | 16 · 16 |
| Surface padding | 16 | 20 | 20 |
| Control gap | 4 | 8 | 12 |
| Icon size | 18 | 20 | 20 |

Four rules:

1. **Every preset defines exactly those eight tokens.** No more — a token only
   some presets define is a token only some components can rely on. No fewer — a
   preset that omits one silently inherits, which is a preset that is not one.
2. **A preset holds nothing but density.** No colour, radius, type role or
   duration: those mean the same thing at every density, and a system where they
   do not is a second design system wearing one word.
3. **Density is a preference, not a viewport.** A 27-inch monitor driven by a
   trackpad is not compact and a 1024px tablet is not default, so the selector is
   an attribute. The responsive rule is a *default* for a document that has not
   chosen — `:root:not([data-dh-density])` under `(pointer: coarse)` — which leaves
   room for a Settings control that does not have to fight a media query.
4. **Density may never cost a touch target.** On a coarse pointer, `compact`'s
   hit areas are floored back to `--app-touch-target-min`, unconditionally.
   Compact stays compact in padding, glyph and type. WCAG 2.2 target size is not
   a density setting.

Nothing consumes `compact` yet: the control baseline in `base.css` reads
`--dh-control-height`, which is value-identical at the default density. DS-03 is
the first adopter.

## 12. Adaptive behaviour, as design intent

[§8](#8-responsive-behaviour) lists the shipped compositions. This is the rule
behind them, so a new surface does not have to be reverse-engineered from the
table.

**Desktop is a pointer and a keyboard, and it is allowed to say so.** Hover
affordances, focus, right-click where it genuinely helps, inline editing,
compact menus, dense lists, contextual actions, persistent navigation and the
command palette. A mobile interaction convention is not adopted merely because a
specification defines it — D8 already makes the narrow-window-with-a-mouse case
explicitly.

**Mobile is a different composition, never a narrower desktop.** The
substitutions, as intent:

```
desktop popover      -> mobile drawer / sheet        (ADR-087)
desktop sidebar      -> mobile bottom navigation     (D15)
desktop dense list   -> mobile stacked row           (D18 drops its middle)
hover action         -> explicit, swipe or long-press action
desktop multi-column -> mobile single column         (§8)
```

Touch targets stay at the floor throughout. A hover-only affordance is a defect
on every device, not just a touch one.

## 13. Component ownership (DS-01)

- A **generic** component knows interaction, layout and tokens. It knows nothing
  about Areas, Goals, Projects, Tasks, People, priorities, overdue dates, health
  evaluation or capture. `Button`, `Input`, `Select`, `Checkbox`, `Badge`,
  `Menu`, `Popover`, `Dialog`, `Drawer`, `Sheet`, `Tabs`, `Tooltip`, `Card`.
- A **product** component knows the domain and composes generic ones.
  `TaskRow`, `ProjectCard`, `AreaRow`, `GoalCard`, `GoalProgress`,
  `TodayWidget`, `QuickCapture`, `RecordLayout`.
- **A product rule may not live in a generic component.** `Pill` may take a
  tone; it may not know that overdue tasks are coral.
- **A generic component may not import from a module.** The reverse is expected.
- Directory placement follows the boundary rather than history. **DS-02 gave the
  boundary an address: [`app/shared/ui/`](../../app/shared/ui/index.ts).** It is
  the one clear generic path for each common interaction, and it is what a call
  site imports — `Button`, `IconButton`, `Input`, `Textarea`, `Select`,
  `Checkbox`, `Badge`, `Card` are implemented there; `Menu`, `Popover`,
  `Dialog`, `Sheet`, `Tabs`, `Tooltip` and `Switch` are re-exported from the
  tested implementations DS-01 classified KEEP.
- Of DS-01's two named breaches, one moved and one did not. `ConfirmationDialog`
  is generic and now lives in `shared/ui`. `DangerousAction` renders a
  `SettingsRow` — its whole job is "a destructive action, laid out as a settings
  row" — so it is a composition of the settings layout primitives and it stayed.
  A component is judged on its implementation, which is DS-01's own rule.

## 14. External primitive libraries

**No primitive-library dependency. DS-02 built the layer and added none** —
the question was re-asked component by component while implementing thirteen
primitives, and nothing in the brief named a behaviour the existing machinery
lacks. Radix, React Aria, Base UI and shadcn were each evaluated and declined;
the per-candidate reasoning is in
[`DS_01…` §7](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md#7-the-primitive-library-decision)
and the decision is [ADR-092 decision 5](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery).

The short version: the decisive argument is not that the code already exists. It
is that DalyHub's implementations **encode product decisions a library cannot
know** — D31's repainted native `<select>`, ADR-087's anchored-above-modal
layer, ADR-076's server-authoritative inline editing — so adopting one would
mean writing adapters to restore behaviour we have.

**Reconsider only when a specific, named component defeats the existing
machinery**, and name that component in the PR. Adding a dependency because an
example used one is the failure mode this section exists to prevent.

---

# Part 2 — The agreed direction, not yet implemented

Recorded so the next pass starts from a decision rather than from a re-reading.
**None of this is current behaviour.**

| # | Decision | Why it is still outstanding |
| --- | --- | --- |
| A5 | **A common chart language** — line, sparkline, ring, horizontal progress, milestone track — over the existing series tokens | VIS-01 quietened the two charts a Goal draws; UIX-03 added the **sparkline** and gave `TrendLine` its grid, references and readout; UIX-05 built **Analytics** on those same primitives and added the horizontal proportion split, choosing bars over the reference's donut precisely because this list is the agreed language (see [§5d](#5d-analytics--what-a-figure-has-to-earn)). All five now exist as shared primitives. What is outstanding is the unifying pass ACROSS them — one legend anatomy, one empty-state, one summary contract — not the components |
| A6 | **Component consolidation** across chips and toolbars | Requires an inventory pass first; consolidating without one trades duplication for churn. UIX-02 took the **tabs** out of this list (one shared `.dh-viewtabs`). UIX-06 took the **controls** and the **empty state** out of it: every native `input`/`select`/`textarea` now reads one control baseline in `base.css` (three module-local copies deleted), the empty state is one card obeying D1, and one shared `collectionCountLabel` replaced nine hand-rolled subtitles. What remains is chips and toolbars |
| A9 | **A Goal trend on Today.** A target-value Goal's card shows a bar where its shape would say more | UIX-03 built the read a sparkline needs (`listMeasurementSeries`, one grouped statement for a page) and used it on the **gallery** card, but deliberately NOT on Today: Today's row already carries a bar, and a second drawing of the same Goal would be the two-visuals-per-card rule broken on the one surface that must stay a glance. Today gained the Area accent instead. Revisit only if the bar goes |

**Delivered since this section was written.** UIX-05 closed the **components**
half of A5 (all five chart primitives now exist and Analytics is built on them),
and answered A9 the way UIX-03 predicted it would have to be answered — Today
still carries no Goal sparkline, because a second drawing of a Goal already
carrying a bar breaks the one-visual rule on the one surface that must stay a
glance; the shape an owner wanted from it is now on Analytics, at a scale where it
is a chart rather than a decoration. A1 (measurable Goals) shipped in
GOAL-02 and is described in [§6](#6-measurable-goals--the-visual-language).
VIS-01 delivered A2 (D12 — a soft wash and a rounded row, at a generated
strength), A4 (D16), A7 (D17) and A8 (D14), and answered A3 by going the other
way: the *hero* headline came DOWN a rung so it stops tying with the page title,
rather than the page title going up. Hierarchy is size, space, tone and only
then weight. UIX-02 delivered the **tabs** half of A6, and consolidated the two
overlapping identity ramps into one (D22). UIX-03 delivered the Goal card
family, Goal identity, and the sparkline half of A5 — see
[§6.1](#61-the-goal-card-uix-03) onward. UIX-05 delivered the remaining three
record families (Person, Asset, Review), the People circle, the Analytics surface
and Settings' phone composition — see
[§5b](#5b-the-record-surface-families--six-and-none-a-variant-of-another) onward
and `UIX_05_REMAINING_MODULES_2026_08.md`.

---

---

# The migration, stage by stage (DS-01)

DS-01 is the foundation. Each stage after it is independently shippable, leaves
the application working, and moves one component family onto the DalyHub layer.
The full table — dependencies, risk, and what each stage must not break — is in
[`DS_01…` §9](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md#9-the-migration-map).

```
DS-01  design-system foundation
DS-02  generic UI primitives          (a real Button; the boundary breaches)
DS-03  shell and navigation           (the rail; the frame's one origin)
DS-04  Tasks
DS-05  Projects · Areas · Goals
DS-06  Today
DS-07  adaptive / mobile audit
DS-08  cleanup of obsolete MD3 remnants
```

Two rules hold across all of them:

1. **A file speaking both vocabularies is expected, not debt.** This migration
   is deliberately the opposite shape from ADR-074's one-commit switch, and the
   difference is the subject: a *token layer* has no working intermediate state;
   a *component layer* works fine at every step.
2. **No stage is a big-bang MD3 deletion.** DS-08 removes what has no
   consumers. A name that still has one means the stage that owns it has not
   finished.

---

# The DalyHub design language, in one paragraph

*Canonical as of DS-01. UIX-06 wrote this paragraph and DS-01 changed one clause
in it — the first — because "built on Material 3 foundations" described a
product whose specification was elsewhere, and this one's is here.*

DalyHub is a bespoke personal-productivity design system that **owns its own
specification**, uses Material 3 as generated machinery beneath it, and is edited
down by Apple-like restraint. **What is bespoke** is
everything the owner recognises a screen by: a 216px permanent navigation rail
that sits two tones under its own canvas in both appearances, six record surface
families that are told apart by SHAPE before a word of them is read, a decorative
identity ramp that is never a semantic one, a 66px phone navigation bar, a
one-line 36px task row (45px wherever a finger reaches it) with two aligned
trailing columns, writing surfaces with no box at all, and the thirty-nine
documented departures that record each of those decisions. **What remains MD3-derived** is the
machinery rather than the look: the colour roles — generated from one violet
seed, never authored — the typescale, the shape and elevation scales, the state
layer, the motion tokens and the whole accessibility contract; DS-01 put a
product-owned vocabulary (`--dh-*`) and an explicit three-rung density model on
top of all of it, so a component now names a DalyHub concept and the machinery
is what that concept currently resolves to. **Apple-like
restraint** means the specification's answer is the floor, not the target: one
card draws no border and no resting shadow, a pill is reserved for the one
primary or destructive action on a surface, tone is spent on a mark rather than a
container, and a level of hierarchy is separated on every axis at once or not
claimed at all. **Mobile is a different composition of the same data, routes and
components** — not a narrower desktop: Today becomes one priority stream,
Settings becomes two screens, a collection's persistent controls become one
sheet, and the task row drops its middle rather than wrapping. **Colour carries
identity, state and series, and nothing else** — a record's accent is its Area's
and never repaints for status, a slipped Task is `state-overdue` rather than
`error`, and every accent, tint and state has a word beside it, so nothing in the
product is legible only in colour.

---

*Amending this document is legitimate and expected. Amend it in the change that
makes the amendment true — never ahead of it.*
