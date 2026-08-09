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
| **Typography** | `tokens.css` | One family (Roboto Flex, `wght` axis). **Emphasis is weight, not size** |
| **Shape** | `tokens.css` | Five semantic rungs — hero, entity-card, card, supporting, control. Nesting always steps *down* |
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
record shows the **whole thing** (hero figure, pace, trend, history, stages).

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
| Projects · Areas | Gallery | Compact rows, same DOM |
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
| A2 | **A quieter selected navigation destination.** The filled pill is the specification's answer and reads as the most Material object in the product | The pairing is asserted by name in `contrast.test.ts`; softening it needs a generated strength and a rewritten assertion, not a colour swap |
| A3 | **A larger, calmer type scale for page and section titles** | A scale change touches every module's first viewport and must be re-QA'd at all ten widths in both appearances |
| A4 | **The writing surfaces (Notes, Diary) drop their box.** Content-first, contextual toolbar, generous measure | The editor has its own geometry suite (`editor-geometry`, `doc-editor-responsive`); the change is safe only alongside those |
| A5 | **A common chart language** — line, sparkline, ring, horizontal progress, milestone track — over the existing series tokens | Analytics is the surface that needs it, and the seeded workspace holds no Reviews, so it cannot be reviewed by eye yet |
| A6 | **Component consolidation** across buttons, chips, tabs, toolbars and empty states | Requires an inventory pass first; consolidating without one trades duplication for churn |
| A7 | **Calmer identity marks in DARK.** A container role is a pale tone-90 in light and a saturated tone-30 in dark, so a gallery of nine Project marks reads as a rainbow of colourful rounded rectangles in dark and as a soft palette in light | The fix is the one this system already uses for every other appearance-dependent amount — a generated strength mixing the container toward the card — but it changes the identity mark everywhere at once and needs a contrast pass over all six ramps and both `on-` pairs |
| A8 | **The segmented control's outlined capsule.** The M3 segmented button, with its 1px container and inter-segment dividers, is one of the more component-demo objects left | Replacing it with a quiet sunken track and a soft selected chip is a shared-component change that reaches Tasks, Projects, Goals, Notes, Areas, Assets and Reviews at once |

---

*Amending this document is legitimate and expected. Amend it in the change that
makes the amendment true — never ahead of it.*
