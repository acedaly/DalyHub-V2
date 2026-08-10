# The DalyHub Design System

> **DalyHub is not "a Material Design 3 application."** It is a personal
> productivity design system, grounded in Material 3 Expressive and selectively
> informed by Apple's restraint and by the interaction quality of the best
> task software.
>
> **MD3 is the foundation. DalyHub is the identity.**
>
> This document is the *why* and the *policy*. The mechanics — every token, every
> component's anatomy, every pattern's accessibility contract — live in
> [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), which this sits above and does not
> replace.

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
| **Material 3 Expressive** | Semantic colour roles, state layers, typography scale, shape scale, motion tokens, component states, touch-target guidance, the accessibility contract | Its *look*. A tonal surface for every container, a pill for every control, elevation as decoration, a coloured chip wherever a role exists |
| **Apple HIG** | Restraint, whitespace, content-first layouts, progressive disclosure, quality of transitions, removal of interface chrome | Its components. DalyHub is a web application, not an iOS imitation |
| **Things · Todoist** | Capture speed, inline editing, keyboard efficiency, information density without clutter, the separation of planning from doing | Their information architecture. DalyHub's spine is Area → Goal → Project → Task |

**The rule that resolves conflicts between them:** Material tells us *what a
thing is and how it must behave*; Apple and the productivity references tell us
*how much of it to draw*.

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
| **Colour** | `scripts/generate-m3-scheme.mjs` → `tokens.css` + `scheme.ts` | Generated from one violet seed, never authored. `scheme:check` fails the build on a hand-edited hex |
| **Decorative identity** | `tokens.css` → `.dh-tone[data-tone]` | Six named widget accents (coral · blue · violet · green · amber · teal), published as `--app-tone*`. A surface declares WHICH identity it has; it never names a colour. Never status (D21) |
| **Typography** | `tokens.css` | One family (Roboto Flex, `wght` axis). **Emphasis is weight, not size** |
| **Shape** | `tokens.css` | Six semantic rungs — hero, entity-card, card, metric, supporting, control (20 · 16 · 16 · 12 · 12 · 8). Nesting always steps *down* |
| **Spacing / sizing** | `tokens.css` (`--app-*`) | Structural values M3 does not own |
| **Elevation** | `tokens.css` | Two names: `resting` (none) and `raised`. Separation is surface *value*; depth is for things that genuinely float |
| **Motion** | `tokens.css` | M3 duration and easing tokens. Nothing animates on load |

Application code — CSS and components alike — never hard-codes a raw hex, pixel,
radius, shadow or duration where a token exists. Adding a colour means changing
the generator; adding anything else means adding the token first.

## 5. Documented departures from stock Material

Each of these is a place where DalyHub deliberately does something the
specification does not, because the specification's answer was worse *here*.

| # | Departure | Why |
| --- | --- | --- |
| D1 | **A card draws no border and no resting shadow.** Separation is the surface step alone | Spending a hairline *and* a shadow *and* a radius on every box left nothing to escalate with when a surface genuinely mattered. The canvas moved to tone 97 to pay for it |
| D2 | **Blue is semantic, not the brand.** Chart series 1, Area accent 1, the Project entity and priority P3 keep blue under a violet seed | A violet series collides with the purple series after harmonisation and breaks the 25° legend rule; a Project badge must not be the colour the product spends on action; the priority ramp reads as a temperature |
| D3 | **Overdue work is `state-overdue`, never `error`** | A slipped task is a state of a record, not an application fault |
| D4 | **Tinted surfaces mix by a *generated* strength, per appearance** | A container role is a pale tone in light and a saturated tone-30 in dark. One percentage cannot serve both — the same mix that warms a light card paints a slab on a dark one |
| D5 | **An entity card's progress bar is 8px, not the product's 6px** | The one surface whose entire job is a proportion. At gallery width a 6px rule reads as a divider |
| D6 | **An entity card's bar takes the *record's* identity accent, not `primary`** | Twelve identical violet bars give the eye nothing to track down a grid |
| D7 | **Today's completion control is a circle; a collection's selection control stays a square** | DalyHub genuinely has both acts. Completing and selecting now look different |
| D8 | **Below `md`, a mouse gets the touch layout** for the row action rail | `(hover: hover)` describes a pointer, not a window. A narrow window with a mouse got a 192px reserve out of a 263px run |
| D9 | **An optional select is EMPTY, never "No priority"** | An absence is not a decision. It also stops the unset state taking the first slot in a menu, where the eye and the keyboard both start |
| D10 | **No theme feature.** One light/dark pair, chosen by `prefers-color-scheme` or the owner's three-value appearance preference | A component styled once is correct in both. Nothing in the cascade branches on a theme |
| D11 | **Today has no hero.** Its figures are a row of quiet cards on the canvas | A hero spends the page's largest type on a headline and leaves the numbers at label size beside it — on the one screen whose entire question is the numbers. The row spends it on the figures, and tints nothing |
| D12 | **The permanent navigation drawer is 216px**, outside M3's 232–248 band, and a destination is **44px of visual row** — the touch floor itself | 240 is the specification's figure for a drawer a user *opens*; DalyHub's is permanent, holds fourteen destinations and is on screen for the whole session. A painted row larger than the target it serves is mass without reach |
| D13 | **A pill is reserved for a primary or destructive action.** Every other button takes `--app-shape-control` | `corner-full` on all five variants made shape say nothing about emphasis. A stadium means "this is the action" only when most things are not one |
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
| Collections | Persistent controls | Sheets and scrolling rails |

Validated at 320 · 375 · 390 · 430 · 768 · 1024 · 1280 · 1440 · 1920 · 2560.
The laptop widths get the most attention, because that is where a title wraps or
a gallery loses a column. **A title that wraps unnecessarily at a normal laptop
width is a defect**, not a nuance.

## 9. Accessibility

WCAG 2.2 AA, verified rather than assumed. Contrast is asserted over the
*generated* scheme in both appearances, including the composed expressive
surfaces and every identity progress fill. Touch floors are unconditional except
where a rule positively detects a genuine mouse. Colour is never the only
signal — every accent, tint and state has a word beside it.

---

# Part 2 — The agreed direction, not yet implemented

Recorded so the next pass starts from a decision rather than from a re-reading.
**None of this is current behaviour.**

| # | Decision | Why it is still outstanding |
| --- | --- | --- |
| A5 | **A common chart language** — line, sparkline, ring, horizontal progress, milestone track — over the existing series tokens | Analytics is the surface that needs it, and the seeded workspace holds no Reviews, so it cannot be reviewed by eye yet. VIS-01 quietened the two charts a Goal draws; UIX-03 added the **sparkline** to `~/shared/charts` and gave `TrendLine` its grid, references and readout, so four of the five now exist as shared primitives — what is outstanding is the unifying pass across them, not the components |
| A6 | **Component consolidation** across buttons, chips, toolbars and empty states | Requires an inventory pass first; consolidating without one trades duplication for churn. UIX-02 took the **tabs** out of this list: the view rail is now one shared `.dh-viewtabs`, drawn once and consumed by both the saved-view switcher and `ViewTabs` |
| A9 | **A Goal trend on Today.** A target-value Goal's card shows a bar where its shape would say more | UIX-03 built the read a sparkline needs (`listMeasurementSeries`, one grouped statement for a page) and used it on the **gallery** card, but deliberately NOT on Today: Today's row already carries a bar, and a second drawing of the same Goal would be the two-visuals-per-card rule broken on the one surface that must stay a glance. Today gained the Area accent instead. Revisit only if the bar goes |

**Delivered since this section was written.** A1 (measurable Goals) shipped in
GOAL-02 and is described in [§6](#6-measurable-goals--the-visual-language).
VIS-01 delivered A2 (D12 — a soft wash and a rounded row, at a generated
strength), A4 (D16), A7 (D17) and A8 (D14), and answered A3 by going the other
way: the *hero* headline came DOWN a rung so it stops tying with the page title,
rather than the page title going up. Hierarchy is size, space, tone and only
then weight. UIX-02 delivered the **tabs** half of A6, and consolidated the two
overlapping identity ramps into one (D22). UIX-03 delivered the Goal card
family, Goal identity, and the sparkline half of A5 — see
[§6.1](#61-the-goal-card-uix-03) onward.

---

*Amending this document is legitimate and expected. Amend it in the change that
makes the amendment true — never ahead of it.*
