# DESIGN_SYSTEM.md — The DalyHub Shared Interaction Language

> The catalogue of shared patterns every module reuses. DalyHub's coherence comes from the fact that a task, a project, a person, and a note all *behave the same way*. This document is that contract.
>
> **Rule:** Before building any UI, find the pattern here. If it exists, reuse it. If it should exist but doesn't, build it *as a shared pattern* and document it here — in the same PR. A bespoke duplicate is [Product Debt](../product/PRODUCT_DEBT.md) the moment it merges. (See [`AGENTS.md §9.8`](../../AGENTS.md#98-shared-over-bespoke-and-one-authoritative-token-layer).)
>
> Companion docs: product intent in [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md); UX/interaction philosophy in [`AGENTS.md §6–7`](../../AGENTS.md#6-ux-philosophy); build order in [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md).

---

## Foundations — the DalyHub design system, over Material 3 machinery

DalyHub's design language is **DalyHub's own**, specified in [`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md) ([ADR-092](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery)). **Material Design 3 is the machinery beneath it** ([ADR-074](../decisions/ARCHITECTURE_DECISIONS.md#adr-074-material-design-3-as-the-design-language--one-generated-scheme-no-theme-feature-and-an-alias-layer-as-the-migration-mechanism)): hand-rolled in plain CSS over DalyHub's own components, with no `@material/web`, no CSS framework and **no runtime dependency**. What we take from M3 is its *values and algorithms* — a generated tonal palette, a typescale, a shape ladder, a state layer, motion curves. The markup, the behaviour, the accessibility contract and now the **vocabulary** stay ours.

The layering, top-down. A component reaches for the top layer; the rest is what that layer currently resolves to.

| Token family | What it carries | Layer |
| --- | --- | --- |
| `--dh-*` | **The DalyHub design system**: colour, space, radius, borders, elevation, focus, the seven type roles, motion, density | **reach for this** |
| `--app-*` | Structural values M3 does not own: spacing, sizing, z-index, breakpoints, the shell's own measurements | machinery |
| `--md-app-color-*` | The application surfaces, from a near-neutral palette of their own | machinery |
| `--md-sys-color-*` | Every colour role, **generated** per colour scheme | machinery |
| `--md-ref-typeface-*` | The two reference typefaces | machinery |
| `--md-sys-typescale-*` | The fifteen type styles | machinery |
| `--md-sys-shape-*` | The corner scale | machinery |
| `--md-sys-elevation-*` | The five shadow levels | machinery |
| `--md-sys-state-*` | The state-layer opacities and the disabled pattern | machinery |
| `--md-sys-motion-*` | Durations and easing curves | machinery |

**Density.** Three presets — `compact` · `default` · `touch` — selected by `data-dh-density` on any ancestor, controlling eight tokens and nothing else. Density is a preference rather than a viewport, and it may never cost a touch target. The rules are in [`DALYHUB_DESIGN_SYSTEM.md` §11](DALYHUB_DESIGN_SYSTEM.md#11-density-ds-01); the values are in `tokens.css`.

**Authoritative source:** [`app/styles/tokens.css`](../../app/styles/tokens.css). A typed, greppable registry over the same names lives in [`app/shared/tokens`](../../app/shared/tokens), with the DalyHub layer published in [`dalyhub.ts`](../../app/shared/tokens/dalyhub.ts). Application code — CSS and components — consumes tokens and never hard-codes a raw hex, pixel or duration where a token exists ([AGENTS.md §9.8](../../AGENTS.md#98-shared-over-bespoke-and-one-authoritative-token-layer)).

**Migration status.** DS-01 established the DalyHub layer; DS-02…DS-08 move consumers onto it, one component family per stage ([map](DS_01_DESIGN_SYSTEM_FOUNDATION_2026_08.md#9-the-migration-map)). Until then most of this document's mechanics are still written in `--md-*`/`--app-*` names, which is expected: the values are identical, and a stage rewrites the names it owns as it goes.

---

## DalyHub Material 3 Expressive Direction

> The philosophy this section implements — the relationship to Material, the
> Apple and productivity-software influences, the decision rule, and the full
> list of deliberate departures from stock Material guidance — is
> [`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md). This section is the
> mechanics.

> The M3X pass (2026-08). Everything below is an extension of the Material Design 3
> foundation above, never a second design language beside it. Before-and-after
> evidence: [`assets/m3x-2026-08/`](assets/m3x-2026-08/); the findings it answers:
> [`M3_EXPRESSIVE_AUDIT_2026_08.md`](M3_EXPRESSIVE_AUDIT_2026_08.md).

### The principle

**Calm workspace. Expressive moments.**

Roughly 75% restrained M3, 25% M3 Expressive. Expression is a budget, not a
style: a page spends most of it in one place, and everything else in the product
is quieter *because* that one place is louder. A product where every surface is
expressive has emphasised nothing — which is precisely the state the first audit
found, with a hairline, a shadow, a 16px radius and 20px of padding on every box
in the application at once.

### The hierarchy model (M3X-02)

The M3X pass wrote the rule as **one expressive surface per page**. That was too
strict, and the second pass replaces it:

> **One dominant expressive surface per page. Supporting expressive elements are
> permitted where they strengthen hierarchy, identity, progress or action.
> Supporting expression must remain visually subordinate to the dominant
> surface.**

Three levels, and every surface in the product is exactly one of them.

| Level | What it is | Component | How many |
| --- | --- | --- | --- |
| **1 — Dominant** | The one surface answering the question the page exists to answer | `ExpressiveSummary` | **One** per page, at most — and **zero** is a legitimate answer |
| **2 — Supporting expressive** | A short surface carrying identity, progress, a focus or a next action | `SupportingSurface`, the entity card's identity mark and progress | **A few** — two or three, not a gallery |
| **3 — Quiet interface** | Everything the owner works *in* | panels, collection rows, forms, filters, navigation | The rest of the page |

The levels are separated on **every** axis at once, because a level separated on
one axis is a coincidence:

| | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| Shape | `--app-shape-hero` (28) | `--app-shape-entity-card` (20) | `--app-shape-card` (16) |
| Padding | `--app-card-padding-hero` | `--app-card-padding` | `--app-card-padding` |
| Surface | `surface-expressive` + the radial wash | `surface-supporting` / `surface-card-subtle` | `surface-card` |
| Depth at rest | `--app-elevation-raised` | none | none |
| Text colour | `on-surface-expressive` | the ordinary ramp | the ordinary ramp |
| May carry | a ring, a stat row, the page's primary action | one metric, one bar, one action | rows and controls |

Two things this does **not** license. It is not a second hero: a page with two
tinted, ringed, elevated surfaces has emphasised neither. And it is not colour
for its own sake — a supporting surface earns its level by *saying something the
page needs* (what is next, how far along, which record), never by being the next
card along in a grid.

### What earns Level 1

One of these, per page, at most — and a page is allowed **none**. Today has
none: its figures are a row of quiet `StatCard`s on the canvas, because a hero
spends the page's largest type on a *headline* and leaves the numbers at label
size beside it, on the one screen whose entire question is the numbers. Restraint
is a design decision, not an omission.

| Surface | Why it earns it |
| --- | --- |
| Goals' summary | Momentum across open Goals, from real counts |
| Success and completion | A moment worth marking, once |
| Quick capture | The interaction the product most wants to be easy |
| Major empty states | The one place a page has nothing else to say |

### What earns Level 2

| Element | Why it earns it |
| --- | --- |
| Current focus | The record the owner was last actually working in |
| Next up | The one thing ahead — a meeting with a time, or the next task |
| Progress | The answer to "how is this going?" on a Project, a Goal, a day |
| Project, Area and Goal identity | Recognition before reading — the icon container, at the large rung on a gallery card |
| A selected high-value datum | The one figure a surface is really about |
| A meaningful attention state | Overdue work, a stalled Project — through the `state-*` roles |

### Level 3 — the quiet interface

Restrained M3, always. No tint, no hero shape, no extra depth:

forms · settings · the editor · every list and collection row · administration ·
repeated data entry · navigation · filters · metadata

Most of the product is Level 3, and that is the point. The levels above are
legible *because* this one is the default.

### Shape hierarchy

Five semantic names over the M3 corner scale, in `tokens.css`. A surface picks
the name that matches its **weight in the page**; nesting always steps *down*, so
an inner surface is never rounder than the one holding it.

| Token | Value | Used by |
| --- | --- | --- |
| `--app-shape-hero` | `corner-extra-large` (28) | The page's one summary surface |
| `--app-shape-entity-card` | `corner-large-increased` (20) | Project · Area · Goal · Asset cards, and every Level 2 supporting surface |
| `--app-shape-card` | `corner-large` (16) | Ordinary cards, panels, collection groups |
| `--app-shape-supporting` | `corner-medium` (12) | A tinted run or inset list *inside* a card |
| `--app-shape-control` | `corner-small` (8) | Chips, segments, small tiles |

`corner-large-increased` and `corner-extra-large-increased` are **M3 Expressive's
own rungs**, added to the scale rather than invented. Buttons, the FAB, the
search bar, text fields, menus, dialogs and sheets keep the component assignments
in [Shape, elevation, state and motion](#shape-elevation-state-and-motion) —
nothing became a pill that was not one.

### Typography hierarchy

The correction M3X makes is: **emphasis is weight, not size.** M3 Expressive pairs
each style with an `-emphasized` weight variant, and `tokens.css` carries them for
the eight styles that genuinely have two voices. Roboto Flex is instanced to the
`wght` axis, so these are real weights on the shipped font.

| Surface | Style |
| --- | --- |
| Hero headline | `headline-medium` **emphasized** |
| Hero figure / ring centre | `headline-small` **emphasized**, tabular |
| Hero eyebrow, hero stat label | `label-large` / `body-small` |
| Page title (collections) | `headline-small` |
| Today's greeting | `headline-small` **emphasized** |
| Entity card title | `title-medium` **emphasized**, clamped at 3 lines |
| Entity card metric | `headline-small` **emphasized**, tabular |
| Collection row title | `body-large` at the emphasized label weight |
| Progress percentage | `label-large` **emphasized**, on-surface |
| Card and widget titles | `title-medium` |
| Metadata, supporting text | `body-small` |

Two hard rules. **A page title fits one line at 1280.** And **nothing is made
important by being made bigger** — if a heading needs more presence, it takes the
emphasized weight.

### Colour usage

The seed is **violet `#6D4AE6`**. Colour is still generated and never authored
(see [Colour is generated, never authored](#colour-is-generated-never-authored));
the identity is restrained by *how little of the page it covers*, not by
desaturating it.

- **Violet is spent on action and on the expressive surfaces.** Filled
  buttons, the FAB, the capture affordance, the hero tint. **Not progress
  fills** — see the meter rule below.
- **Identity says what a record IS; status says how it is GOING, and a METER
  answers the second question.** A progress fill takes the semantic status the
  surface already derived (`~/shared/progress/meter-status`), never the record's
  identity hue and never the brand. `neutral` is a real answer for a bar with
  nothing to judge — an unmeasured Goal, a Project with no tasks, a bar counting
  volume — and is what a meter shows rather than guessing. The identity ramp
  keeps the glyph tile, the identity dot, the mark, the chart line, the pills
  and the Analytics legends, which is everything it was for.
- **Selection is `secondary-container`** — the soft lilac in light, the muted
  plum in dark — in the sidebar, the phone navigation bar, the settings rail and
  the segmented control alike. M3X retired the old `primary-container`
  navigation deviation: under a violet seed that role is a maximum-chroma tone-30
  violet in dark, and a permanent navigation row is the last place that belongs.
- **Blue is now semantic, not the brand**: chart series 1, Area accent 1, the
  Project entity and priority P3. See `BLUE_HEX` in the generator for why each
  one could not simply follow the seed.
- **Status keeps the `state-*` roles.** Overdue work is `state-overdue`, never
  `error` — a slipped task is a state of a record, not an application fault.
- **Tinted surfaces mix by a generated STRENGTH, not by a fixed percentage.**
  `--app-tint-strength-expressive`, `--app-tint-strength-supporting` and
  `--app-tint-strength-state` are all weaker in dark, because a container role
  that is a pale tone in light is a saturated tone-30 in dark and the same mix
  produces a slab. This is the only thing in the expressive layer that differs by
  appearance, and it is generated for that reason.
- **Intensity is a ladder, and each rung is a level.** Level 1 takes the full
  expressive tint, the radial wash and the container's own text colour; Level 2
  takes the supporting tint (or a neutral surface step, when the entity's own
  accent is already on the surface) and the ordinary text ramp; Level 3 takes
  the card surface and no tint at all. Status keeps the `state-*` roles at every
  level. **No card in this product has a saturated full-bleed background.**

### Card vs list

| Use a **card** for | Use a **list** for |
| --- | --- |
| Projects, Areas, Goals, Assets — things with identity | Tasks |
| Notes — a document whose excerpt is worth reading | Meeting and diary directories |
| A page summary | Activity and timeline feeds |
| Focused grouped information | Any repeated homogeneous content |

**Notes moved** (M3X-02). A note is a document, and a directory of documents is a
gallery: the excerpt is the reason to open one, and an excerpt wants a column
rather than a line. It was the module using its width worst — a full-bleed filter
band over a single 200px column, with the rest of a 1,440px screen empty. It
collapses to one column below `md`, where the phone gets the clean list it wants.

**In a collection, the GROUP is the card and the row is a row** — that contract is
unchanged. What M3X changed is that a card no longer draws a border *and* a
shadow *and* a radius: separation is the surface step (the page canvas moved down
to tone 97 to pay for it), and depth is reserved for the hero, for a hovered
interactive card, and for things that genuinely float. A hairline inside a card,
separating two kinds of content, is still correct — that is what a rule is for.

**DS-05 amended the middle of that** ([D44](DALYHUB_DESIGN_SYSTEM.md#5-documented-departures-from-stock-material)).
The "one device, not three" rule stands and this still spends only one; what
failed is the premise that the surface step alone is enough. It is, at the seven
surfaces a record screen draws — it is not at the twelve to twenty a GALLERY does,
where the eye stops seeing edges and starts seeing a field of
slightly-different-white rectangles. DS-02 had already conceded this for
`.dh-dcard`, which left the product with two card boundaries. There is now one,
everywhere:

```
a card:   1px --dh-color-border · --dh-radius-md (12) · no shadow
hover:    the border darkens to --dh-color-border-strong. Nothing moves.
```

It covers `.dh-pcard`, `.dh-gcard`, `.dh-acard`, `.dh-ecard`, `.dh-dcard`,
`.dh-stat`, `.dh-today__panel`, `.dh-settings-group` and `.dh-empty-state`. What it
does NOT flatten is ANATOMY: a Project card still pins its bar to its floor, a
Goal card still leads with its reading, an Area row is still content-height.
[§5b](DALYHUB_DESIGN_SYSTEM.md)'s shape distinctions are compositional, and they
survive losing 4px of corner radius.

**Hover is a border change, not a lift.** The 1px translate plus a shadow was the
gallery's whole motion budget and it was spent on the wrong thing: a card that
rises is a card that floats, and these no longer do.

### The collection header, and the create action

Two rules, both established by DS-04 for Tasks alone and generalised by DS-08
([D47](DALYHUB_DESIGN_SYSTEM.md#5-documented-departures-from-stock-material)) once
the whole-app baseline found one collection header in the product and seven of
another:

- **The count sits BESIDE the title**, not on a band of its own. One fact, six
  characters, given a whole row of the calmest band on the page, pushed the first
  row 154px down a 950px viewport. Lives on `.dh-pane-header--compact`; the RECORD
  band (`--identity`) is deliberately untouched, because a record's supporting line
  is a sentence and a sentence belongs under the title.
- **The create action is `+ New <thing>`** — a leading plus, sentence case, via the
  shared `CreateActionLabel`. It is a label rather than a button, because the call
  sites are variously a `DrawerTrigger`, a router `Link` and a plain `button`, and
  a component that wrapped all three would have to know about drawers, routing and
  click handlers at once.

Never card-inside-card. `.dh-card-collection--list` already stands its container
down when it is nested, and Today's panels forbid it outright.

### Dense row and grouped-list contract (DHDS-02)

Dense operational rows share a reading grammar even when their domain anatomy
differs. The flexible primary content comes first; metadata follows in decision
order; exceptional state is explicit; one secondary action cluster trails. For
Tasks the canonical sequence is **when → where → importance → exceptional
state** in both the DOM and the visual grid. A responsive composition may wrap
those facts onto a second line but may not reorder them only with CSS.

Secondary row actions opt into the shared contextual-action contract: hidden at
rest on a hover-capable pointer, revealed by row hover or keyboard focus, and
always visible on touch and in forced colours. Opacity preserves layout and
accessibility; disabled pointer events prevent an invisible control intercepting
a click. Module CSS may position the control, but `base.css` alone owns its
visibility states.

For grouped Tasks, `TaskGroup` owns disclosure, heading, authoritative count and
optional “View all”. The parent owns layout; the child `TaskList` owns density
and responsive row composition. Tasks and Weekly Planning consume this same
contract. Do not copy the anatomy into module-local heading/count markup.

See [`DHDS_02_ROW_AND_GROUPED_SURFACES_2026_08.md`](DHDS_02_ROW_AND_GROUPED_SURFACES_2026_08.md)
for the implemented anatomy, responsive rules, consumers and acceptance checks.

### Desktop composition rules

- **The sidebar does not compete.** Monochrome glyphs, a `secondary-container`
  selection pill, and no entity colour down the rail.
- **At most one DOMINANT surface, and often none.** Where it sits is a
  composition decision, not a rule: a collection's hero is a band above the grid,
  because there is no second column to balance it against. Today has no hero at
  all — a `StatCard` row on the canvas, then two unequal columns.
- **Supporting expressive surfaces sit where the hierarchy needs them**, and are
  subordinate on every axis (see [the hierarchy model](#the-hierarchy-model-m3x-02)).
- **Surfaces are not all the same size.** Today is a hero band over an asymmetric
  two-column body; a gallery is an `auto-fill` grid whose column count is a
  consequence of one token, not a breakpoint table.
- **Gallery rows share a height** (`align-items: stretch`) and card footers align
  to the bottom, so a row reads as a row.
- **One control row, not two.** A collection with persistent controls merges its
  module filter slot and the shared control row onto one line from `md` up.
- Collections keep the `--app-width-wide` measure; Today keeps the dashboard
  measure. A wide monitor gets more columns, not longer lines.

### Mobile composition rules

- **A phone layout is composed, not collapsed.** The desktop dashboard is not
  reproduced vertically, and an entity GALLERY is not one column of gallery
  cards: below `md` the entity card re-composes into a row — mark in its own
  column, title and state on the first line, progress and one supporting fact
  indented beneath — from the same DOM, with nothing hidden and nothing
  reordered.
- **Desktop and phone differ by DESIGN, and the list is deliberate:** Projects
  and Areas are a gallery against a rich list; Notes are a gallery against a
  clean list; Today is a three-region composition against a single priority
  stream; a collection's persistent filters are a compact row against a
  disclosure. These are not inconsistencies to reconcile.
- **Composition is DOM order, never `order`.** A responsive grid may place a
  surface in a different column; it may not move it past its neighbours, because
  `order` moves pixels and leaves the reading order and the tab order behind.
  Where the phone needs a different sequence, the markup is written in the phone
  sequence and the desktop grid places it.
- **The first viewport answers the page's question.** On Today that is the
  summary — counts, overdue, progress — above the fold, with the greeting
  compact above it.
- The hero drops to card padding and moves its figures to their own band under
  the headline rather than competing for a 358px line.
- Rows keep every fact (nothing is hidden by width); low-priority detail is
  de-emphasised into the supporting run.
- **Touch floors are touch floors.** The 44/45px minimum is unconditional except
  where a rule positively detects `(hover: hover) and (pointer: fine)` — a genuine
  mouse — in which case an inline-edit trigger falls back to 28px, which still
  clears WCAG 2.2 §2.5.8's 24px with the run's spacing on top. A hybrid, a
  stylus, a touch laptop and any browser that cannot answer all keep the floor.

**A small control keeps its size and grows its TARGET.** The floor is a property
of the hit area, never of the paint, and a row never grows to satisfy it. Two
shapes do all of the work in the product, and a third one is a trap:

- a wrapping `label` sized to the floor around a small input, pulling its own
  padding back out with a negative margin (`.dh-check-circle-target` — the 20px
  completion circle in every task list, and on Today's Focus rows since
  MOBILE-01's iPhone pass);
- symmetric block **padding** up to the floor, given back as negative margin, for
  a one-line text control inside a taller row (a row's "open" link);
- **not** an absolutely positioned `::after` overlay, whenever the control sits
  inside an ancestor with `overflow: hidden` — which is usually the very thing
  drawing its ellipsis. Hit testing respects that clip, so the overlay looks
  right and does nothing.

### Safe areas

Load-bearing on every fixed or bottom-anchored control, alongside
`--app-keyboard-inset` from the one Visual Viewport observer,
`--app-bottomnav-height` reserved by every scrolling surface, and `dvh` where the
visible viewport matters. **No compensating pixel offsets, anywhere, and no
device-model breakpoints.**

**The insets are TOKENS, not `env()` calls** (MOBILE-01, iPhone daily driver):

```css
--app-safe-area-top     --app-safe-area-right
--app-safe-area-bottom  --app-safe-area-left
```

A rule consumes those and never writes `env(safe-area-inset-*)` itself. They were
53 declarations across 11 stylesheets before this rule existed, and the drift that
mattered was not stylistic: some wrote `env(safe-area-inset-bottom, 0px)`
and some the bare form, which resolves to *nothing* rather than to zero inside
`calc()` on a browser without the variable — voiding the whole expression. The
tokens state the `0px` fallback once, so they are always a length and always safe
to compose.

### The current surface

```css
--app-surface-current   /* what a sticky child paints over */
```

Anything sticky has to **occlude** the content scrolling under it, so it needs an
opaque background — and which one is correct depends on where it was mounted,
which a shared rule cannot ask. Enumerating ancestors in the sticky rule is the
shape [AGENTS.md §9.8](../../AGENTS.md#98-shared-over-bespoke-and-one-authoritative-token-layer)
rules out: the list is right until the next surface is written, and then it is
silently wrong.

So the **surface declares itself**. `:root` is the page; a container that paints a
different one re-declares this token beside its own `background` (the Card, the
Drawer body and the Inspector body do), and anything sticky inside it consumes the
token. A surface that forgets falls back to the page colour — a wrong colour rather
than a transparent bar with text scrolling through it. Current consumers: the
phone commitment row (`FormActions`) and the record tab strip's scroll-shadow
covers.

### The global create control, and bottom navigation

**There is no FAB.** UIX-01 retired it: on a phone the navigation bar's Capture
slot had owned the action since CAPTURE-02, which left a 56px elevated circle
floating over the desktop canvas, diagonally opposite the utilities it belongs
with. Create is now the top app bar's one violet **New** button above `md` and
the navigation bar's central violet circle below it.

The rule the FAB section existed to state is unchanged, and is why this section
is still here: there is ONE global capture affordance per viewport, and a module
does not add its own "New" button where global Quick Capture already creates the
same record. A page-level create is legitimate only when it opens capture
already ON its own type — Tasks' "New task" does, which is what distinguishes it
from the generic duplicate a previous pass removed.

### Motion

**DHDS-08 is the authority.** The vocabulary lives in `tokens.css`, the grammar
in [`app/styles/motion.css`](../../app/styles/motion.css), and the full
specification — the hierarchy, the reduced-motion contract, what is deliberately
static and why — is
[`DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md).

> Motion explains what changed, where something came from, where it went, or
> what has focus. It is never decoration.

**Four levels.** Level 0 no motion (text updates, autosave, background refresh —
not everything deserves animation). Level 1 interaction feedback,
`--dh-motion-instant` (90ms). Level 2 contextual reveal, `--dh-motion-fast`
(150ms) / `--dh-motion-base` (200ms). Level 3 meaningful structural transition,
`--dh-motion-deliberate` (260ms) — the ceiling.

**Five duration rungs, two loop periods, four curves**, named for what they are
FOR. Leaving is faster than arriving everywhere: `--dh-motion-exit` is 140ms on
`--dh-ease-exit`. No curve overshoots; there is no spring, no bounce and no
pressed transform in the product.

**A surface names a motion; it does not author one.** `.dh-motion-scrim`,
`.dh-motion-reveal` (anchored menus, popovers, tooltips), `.dh-motion-lift`
(centred modals), `.dh-motion-edge-inline` / `-block` (panels and sheets),
`.dh-action-reveal` (the row affordance contract), `.dh-disclosure` (+ its
marker), `.dh-complete-strike` / `-recede` (task completion), `.dh-motion-succeed`
(Today's Now succession). A duration, a curve, a distance or an entrance written
into a module stylesheet is a bug, and four tests refuse one.

Nothing animates on load. There are no route transitions, no staggered row
entrances, no parallax, no animated background, no decorative bounce and still no
ripple. **No animation dependency**, asserted by test.

Reduced motion is a positive contract, not a global multiplier: structural travel
is *removed* rather than accelerated, opacity is kept so a surface still reads as
arriving, and every state a motion communicated is still communicated — completion
still completes, panels still open, disclosures still show their state.

### Responsive behaviour

Validated at 320 · 375 · 390–430 · **820 · 900 · 1100** · 1024 · 1280 · 1440 ·
1920. The laptop widths get the most attention, because that is where a title
wraps, a gallery collapses a column early, or a control row doubles. Desktop and
mobile are allowed genuinely different compositions — a split view against a
dedicated screen, persistent filters against a sheet, a grid against a rich list
— and that is the design, not a divergence to reconcile.

The three emphasised widths were added by POLISH-01. The canonical matrix ran
320 → 430 → 768 → 1024 → 1280, and a page-level horizontal scrollbar lived on
`/tasks` between roughly 820 and 1100px for as long as it took an audit driving
a real browser to find it — every width it existed at fell in a gap in the list.
`e2e/responsive.spec.ts` sweeps them over the densest grids in the product.

### Horizontally-constrained strips

Any rail that scrolls sideways — collection lifecycle tabs, the saved-view band,
record tabs, the capture type selector — carries **`.dh-scroll-strip`**
([`app/styles/scroll-strip.css`](../../app/styles/scroll-strip.css)). It brings
the overflow, the hidden scrollbar and one shared "there is more this way" cue:
cover layers travel with the content, shadow layers stay pinned, so the cue
appears only on the side that genuinely has more and disappears when the strip
fits. Nothing has to know how many tabs there are.

Two rules it is easy to get wrong:

- **one scroll container per strip.** Two nested `overflow-x: auto` boxes means
  the outer never overflows, so an affordance painted on it is permanently
  invisible. Put the class on the element the items are actually in.
- **the cover colour must be the surface behind the strip.** It defaults to
  `--app-surface-current`; a band painted differently from its container sets
  `--scroll-strip-cover`. A cover in the wrong colour is a visible block at the
  edge of the tabs rather than a cover.

### One control, two presentations

A behaviour that genuinely differs by DEVICE — not by width — is chosen by
`useCompactViewport`, and the two presentations share their model, their options
and their state. There is never a second implementation.

| Control | Pointer | Touch |
| --- | --- | --- |
| Collection filters | anchored popover, live-applying | the shared sheet, draft + Apply |
| Inline select | anchored menu | the shared sheet |
| Date picker | anchored popover | the shared sheet |

The filter pair is the one with a deliberate BEHAVIOURAL difference: the sheet
edits a draft because it covers the list, and the popover live-applies because
it sits beside it. Both write through the same `applyDraft`.

---

## Colour is generated, never authored

Every colour in the product comes out of [`scripts/generate-m3-scheme.mjs`](../../scripts/generate-m3-scheme.mjs), which runs the M3 tonal-palette algorithm over a small, documented set of source colours — one per colour scheme:

| Scheme | Key | Seed | Character |
| --- | --- | --- | --- |
| **Daly Violet** *(default)* | `violet` | `#6D4AE6` | DalyHub's own violet — personal, warm, expressive without being loud |
| **Electric** | `electric` | `#2764ff` | Cobalt primary, violet secondary, magenta tertiary, over a deep blue-black shell |
| **Pulse** | `pulse` | `#d31dbc` | Magenta primary, plum secondary, a disciplined lime tertiary, on charcoal |
| **Ocean** | `ocean` | `#0067a8` | Royal blue, teal and cyan on cool slate — no violet identity at all |
| **Graphite** | `graphite` | `#41474f` | Charcoal brand, full-colour semantics — the quiet option, never greyscale |

The script writes **both** the colour blocks in `tokens.css` and the typed mirror `app/shared/tokens/scheme.ts`, so the stylesheet and the tests cannot disagree. `pnpm run scheme:check` regenerates both in memory and byte-compares them; it runs inside `pnpm run verify`, so a hand-edited hex fails the build rather than surviving review.

**To change a scheme's colour, change its palettes in the generator.** Nothing about colour is authored in a stylesheet, in any scheme.

---

## Appearance, colour scheme, design system

Three things are deliberately separate, and confusing them is the most expensive mistake available here ([ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-089-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance)):

| | What it decides | Where it lives | Values |
| --- | --- | --- | --- |
| **Design system** | components, layout, typography, shape, motion | this document | one, always |
| **Colour scheme** | which palette the design system is painted in | `<html data-color-scheme>` | Daly Violet · Electric · Pulse · Ocean · Graphite |
| **Appearance** | which half of that palette paints | `<html data-appearance>` | System · Light · Dark |

The last two are **independent by construction**. Every scheme has a first-class light *and* dark pair — neither derived from the other — so "Electric, Light" and "Electric, Dark" are both real states, and changing one setting never disturbs the other.

### It is a "colour scheme", not a "theme"

In the owner-facing product, and in new code, the word is **colour scheme**. "Theme" invites the reader to expect different typography, spacing, component shapes, layout or animation — none of which a scheme touches, and all of which are explicit non-goals. Existing code whose name predates this may keep it where renaming would be churn; new names may not.

### What a scheme changes, and what it must not

A scheme is **token substitution**. Its identity comes from where colour is *spent*:

- primary actions, links, focus, selection and active navigation
- tonal containers, progress, expressive surfaces, chart series
- the navigation shell, which may legitimately carry a stronger tonal expression than a working surface (Electric's dark navigation is a deep navy *below* its canvas rather than above it)

It must **not** come from painting the application. Working surfaces stay on the near-neutral `--md-app-color-*` ramp in every scheme — light surfaces are held under HCT chroma 6, dark under 14 (there is no white to tint at tone 10, which is why the ceiling is per appearance) — and both ceilings are asserted for all five schemes. A productivity application is read for hours; the scheme is the personality, not the paint.

### The rule for module code

> **Module CSS must never branch on a named colour scheme to make a module look better.**
> If a module needs a new colour role, add a semantic token. Do not check whether the scheme is Violet or Electric.

`[data-color-scheme="electric"] .projects-card { … }` is forbidden, and a test in `test/unit/tokens/appearance-cascade.test.ts` fails the build if any stylesheet outside `tokens.css` mentions the attribute at all. 95%+ of every scheme's behaviour is token substitution; the remainder is the Settings picker, below.

The one sanctioned exception is the **preview swatch**, because a picker has to show four schemes that are *not* painting and no semantic token can express that. The generator emits `--md-app-color-preview-<scheme>-{primary,secondary,tertiary}` into every appearance block, and `.dh-scheme-tone[data-scheme]` in `tokens.css` resolves a scheme *name* to them — the same shape as `.dh-tone[data-tone]`. It selects on the row's **offer**, never on the document's **state**.

### Semantic colour does not belong to the scheme

Error, warning, success, the four task priorities, the five record states, entity identity and the decorative accent ramp use the **same sources in every scheme**, harmonised toward each seed by at most 15° so they still belong to it. A status means the same thing whichever scheme the owner has chosen. Asserted, for all five schemes in both appearances, in `test/unit/tokens/color-schemes.test.ts`:

- the brand stays ≥25° of hue from `error`, `state-overdue` and `priority-p1` — so "the brand" and "something is wrong" are never the same statement
- `success`, `warning` and `error` stay ≥25° from one another
- the P1→P4 ramp cannot collapse, and P4 stays neutral
- no two entity identities share a colour
- every semantic role stays within ~30° of its default-scheme value

**Pulse's lime tertiary is the colour most easily abused.** It is a tertiary and stays one: an accent, a positive figure, a chart series, a small expressive detail. It is never a container background, a navigation fill, a card surface or body text — a structural test asserts no surface in Pulse resolves to a lime.

**Graphite is restrained in its BRAND, not in its information.** Its semantic ramps carry exactly as much colour as every other scheme's; only the primary is a charcoal. A "greyscale mode" would be a different, worse feature.

### Charts

The chart palette is **bounded at six series in every scheme**, and no two may sit within 25° of hue — a legend is the one place in this product where colour genuinely *is* the signal. A scheme may substitute a hue when its seed makes the shared ramp collide (Pulse does, once, for exactly that reason), but it may not change the palette's size or drop the separation rule. Series are also distinguished by label and by position; colour is never the only signal.

### Adding a future scheme

1. Add an entry to `COLOR_SCHEMES` in `scripts/generate-m3-scheme.mjs` — a key, a seed, five palettes, an app-neutral hue/chroma (per appearance if it needs one), and any surface-ladder or tint override.
2. Add the same key to `COLOR_SCHEMES` in `app/kernel/preferences/color-scheme.ts`.
3. Add a descriptor (name + one sentence) to `COLOR_SCHEME_OPTIONS` in `app/shared/shell/color-scheme.ts`.
4. Add a `.dh-scheme-tone[data-scheme="<key>"]` block to `tokens.css` republishing its three preview roles.
5. Widen the `CHECK` constraint with a new additive migration.
6. Run `pnpm run scheme:generate`, then `pnpm run test:unit`.

Step 6 is the acceptance test: every contrast, ladder, chart-separation, semantic-distinctness and role-coverage assertion runs against the new scheme automatically, in both appearances, and names the combination that fails. **A scheme that does not pass them does not ship**, and the passing bar is the whole system — not "its primary button clears 4.5:1".

### How both preferences are stored and applied

Identical architecture, twice ([ADR-075](../decisions/ARCHITECTURE_DECISIONS.md#adr-075-the-appearance-preference-and-one-authority-for-routine-creation) for the appearance, [ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-089-five-generated-colour-schemes-over-one-design-system--a-second-root-attribute-orthogonal-to-appearance) for the scheme):

| | Appearance | Colour scheme |
| --- | --- | --- |
| Column | `owner_app_preferences.appearance` (migration `0033`) | `owner_app_preferences.color_scheme` (migration `0039`) |
| Default | `system` | `violet` |
| First-paint cookie | `dh_appearance` | `dh_color_scheme` |
| Action | `POST /preferences/appearance` | `POST /preferences/color-scheme` |
| Attribute | `<html data-appearance>` | `<html data-color-scheme>` |
| Control | account menu **and** Settings → Appearance | Settings → Colour scheme only |

- Both are **owner-scoped** on the preference record, so a choice follows the owner between devices. The record is the authority; each cookie is a first-paint mirror, HttpOnly, `SameSite=Lax`, bounded to a year and re-validated on write, and the app-shell loader reconciles either one from the record when they disagree.
- Both are written **server-side into the attribute** during SSR. There is no bootstrapping script: nothing to exempt from the CSP, nothing to run before paint, and no hydration mismatch, because the server and the client render from the same loader data.
- Changing either is a `useFetcher` POST, not a navigation, and the control repaints the document **optimistically** by writing its one attribute — so a scheme applies the instant it is tapped, and a rejected write reverts it. No reload, no logout, nothing to restart.
- Reads **coerce** (a bad cookie or stale row lands on the default); writes **reject** (a malformed submission is a 400 that stores nothing, rather than silently replacing an explicit choice with the default).
- The scheme picker is deliberately **not** in the account menu. An appearance is flipped often; a scheme is chosen and then lived in, and five preview rows in a dropdown would make the menu a theme gallery.

### Accessibility

WCAG 2.2 AA is the bar for **every** scheme in **both** appearances, and it is asserted rather than reviewed: every `on-*` pair on its own colour and container, the text ramp and the outline on all fifteen surfaces, the focus ring on every application surface, the selected-navigation pairing, progress against its track, every identity mark on its composed tile, and every washed widget surface. Colour is never the only signal anywhere — selection carries a shape, a weight step and `aria-current`; priority carries a P1–P4 label; state carries a glyph and a word.

Under **forced colours** the platform's decisions outrank DalyHub's branding entirely. Nothing in the scheme system fights them, and the Settings preview swatches — which carry no information the row does not already state in words — are removed rather than left as five identical circles.

### The application surfaces

`--md-app-color-surface-{page,navigation,app-bar,card,card-subtle,raised,sunken}` and `--md-app-color-outline-hairline` come from an **app-neutral palette of their own** — a near-neutral tonal palette at a hue and chroma each scheme names — not from the system container ramp.

They exist because one requirement — **a card is lighter than the page it sits on, in both appearances** — cannot be expressed by a single system alias: light lifts the card toward white while dark lifts it away from black. Naming the rungs the application actually paints with means every card in the product agrees by definition.

They are also what makes five schemes possible without five colour washes: `SchemeVibrant` builds its neutral ramp at chroma 10, and at the near-white tones an application uses that is a visible tint over the entire product (the PR #120 defect). Each scheme's surfaces are held under chroma 6 in light and 14 in dark, and the ladder's ORDER is asserted for every scheme in both appearances — card above page, sunken recessed, card-subtle below card, navigation and the app bar tonally distinct from the page, raised lifting clearly off the card in dark.

Navigation is where a scheme is allowed to be strongest: Electric's dark navigation sits *below* its canvas (tone 8 against 11) so the shell reads as a deep blue-black frame, while Daly Violet's sits above it. The ladder rule is about DISTINCTNESS, not direction.

### Custom colours

Feedback, priority, record state, chart series, Area identity and entity identity are M3 **custom colours**: a source hue harmonised toward the seed (a rotation of at most 15°) and then run through the same tonal machinery as the system roles. Each emits a full quartet — `<name>`, `on-<name>`, `<name>-container`, `on-<name>-container` — in both schemes, so any of them can be a filled badge as readily as a dot.

| Group | Tokens |
| --- | --- |
| Feedback | `success`, `warning`, `info` |
| Priority | `priority-p1` … `priority-p4` |
| Record state | `state-overdue`, `state-due-soon`, `state-completed`, `state-waiting`, `state-on-hold` |
| Chart series | `chart-1` … `chart-6` |
| Area identity | `area-accent-1` … `area-accent-6` (the chart ramp reused — an Area badge and a chart series never share a surface) |
| Entity identity | one per entity type, table below |
| Widget accent (UIX-01) | `accent-coral`, `accent-blue`, `accent-violet`, `accent-green`, `accent-amber`, `accent-teal` |

**Widget accents are IDENTITY and never STATUS.** They exist for surfaces that
have no Area to inherit from — a glance widget, a Goal card, a tonal tile — and
they are a separate ramp from every semantic role on purpose: a coral glance
widget is "tasks due today", not a warning, and an amber Goal mark is not "at
risk". `state-overdue`, `warning` and `error` remain the only way to say
something has gone wrong, and nothing decorative may be painted with them.

A surface never names one of these tokens. It carries `.dh-tone` with a
`data-tone` of `coral | blue | violet | green | amber | teal`, which publishes
`--app-tone`, `--app-tone-container`, `--app-tone-on-container` and
`--app-tone-wash` (the very pale surface, mixed at a generated per-appearance
strength). `ToneIcon` draws the tile. Where a record HAS stored identity — an
Area's colour rank — `AccentIcon` is still the answer and this is not.

**Chart series carry a hard rule:** a legend is the one place in this product where colour genuinely *is* the signal, so no two series may sit within **25° of hue**. Two of the obvious source hues could not hold that after harmonisation and were replaced; a test asserts the separation so the collision cannot come back.

### Entity identity

Each entity type has one colour, and no two share one — an activity feed routinely shows several kinds at once. Each also carries its own glyph and its own label: **colour is never the only signal** ([AGENTS.md §15](../../AGENTS.md#15-accessibility-requirements)).

| Entity | Source hue | Glyph (Material Symbols) |
| --- | --- | --- |
| Area | teal `#00897B` | `layers` |
| Goal | purple `#8E24AA` | `flag` |
| Project | blue `#2563EB` (no longer the seed — see `BLUE_HEX`) | `folder` |
| Task | green `#1B873F` | `check_circle` |
| Note | amber `#B26A00` | `description` |
| Meeting | magenta `#C2185B` | `groups` |
| Person | cyan `#00ACC1` | `person` |
| Asset | neutral `#5F6368` | `inventory_2` |
| Diary | violet `#6750A4` | `menu_book` |
| Review | olive `#827717` | `event_repeat` |

The consumed token is `--md-sys-color-entity-<type>`, resolved through [`app/shared/entity`](../../app/shared/entity) — never hand-picked at a call site.

---

## Typography

One family: **Roboto Flex**, self-hosted, instanced to the `wght` axis (400–700) and subset to Latin (23,160 B — 33% of the per-family byte ceiling). Mono keeps the system stack and ships no file. **There is no serif and no prose family**: DS-14's Reading region is retired, and prose renders the plain typeface at `body-large` on a 65ch measure.

The fifteen M3 type styles are defined as `--md-sys-typescale-<style>-{size,line-height,weight,tracking}`, authored in rem so OS text scaling applies to all of them.

**Usage map — this is the contract:**

| Surface | Style |
| --- | --- |
| Page headings | `headline-small` |
| Dashboard hero figures | `headline-medium` |
| Record titles, top app bar | `title-large` |
| Card and widget titles | `title-medium` |
| Section labels | `title-small` |
| Body prose | `body-large` |
| Collection rows, menu items | `body-large` / `body-medium` |
| Metadata, supporting text | `body-small` |
| Buttons, chips, navigation items, tabs | `label-large` |
| Navigation bar labels, dense metadata | `label-medium` |

Three sizes moved when the old ramp snapped onto M3's — body 15→16px, small text 13→12px, small headings 18→16px at weight 500. Those shifts **are** the move to the M3 scale, not rounding accidents; they are recorded in ADR-074 decision 9 so nobody restores them.

There are no density presets. Density is a typescale choice per surface, made where the surface is built.

---

## Shape, elevation, state and motion

**Shape.** `--md-sys-shape-corner-{none,extra-small,small,medium,large,large-increased,extra-large,extra-large-increased,full}` = 0 / 4 / 8 / 12 / 16 / 20 / 28 / 32 / 9999px. The two `-increased` rungs are M3 Expressive's, added by M3X; the five SEMANTIC names assigned over the scale are in [DalyHub Material 3 Expressive Direction](#dalyhub-material-3-expressive-direction).

| Component | Corner |
| --- | --- |
| Cards | `large` |
| Chips | `small` |
| Buttons, extended FAB, search bar, active navigation pill | `full` |
| Standard FAB | `large` |
| Text fields, menus | `extra-small` |
| Dialogs and sheets | `extra-large` (a sheet rounds its top corners only; a side drawer its leading edge only) |

**Elevation.** Five levels, each an M3 umbra/penumbra pair. Dark leans primarily on the container ramp rather than on shadow, so the *same* tokens are used in both appearances — they read faintly on a dark surface, which is correct rather than a defect.

**State layers.** An interactive M3 component does not swap its container colour on hover; it grows a translucent layer of its own *content* colour on top. Hover 8%, focus 10%, pressed 10%, dragged 16%.

It is implemented **once**, in [`base.css`](../../app/styles/base.css), and a component becomes a host in one of two ways:

- it **carries `.md-state-layer`** — for a component that renders its own class list (the shell's navigation rows, the FAB, the entity icon picker); or
- it is **named in the host list** beside the implementation — for a class applied as a literal string at dozens of call sites (`.dh-btn`) or owned by a shared stylesheet rather than by one component.

Both routes reach the same declarations. This is deliberately stricter than it was: until M3-INT the class was documented as the one implementation and hand-rolled about five times beside it (`.dh-btn` carried a verbatim copy; the overflow menu, the segmented control, the editor toolbar, the card actions, the record actions and the inline-edit trigger each grew their own `color-mix(… 8% …)` fill). They agreed because their authors read the same rule, not because anything made them — and the *pressed* state was missing almost everywhere as a result, because a copied `:hover` rule rarely grows an `:active` sibling. [`test/unit/tokens/state-layer.test.ts`](../../test/unit/tokens/state-layer.test.ts) now refuses a **new** hand-rolled layer and holds the remaining module-level ones as a shrinking baseline.

**Selected is not an opacity.** A selected navigation row, a selected segment, an active toolbar control and a checked menu item take `secondary-container` — a real container change that survives forced colours and is legible without a pointer. The state layer composes on top of it.

**No ripple, deliberately.** M3's ripple is an *expression* of the state layer, not the state layer itself. DalyHub implements hover, focus and pressed as state layers and does **not** implement an animated, origin-anchored ripple. Two reasons, and neither is effort: the product's motion principle is "restrained; motion communicates causality, never decoration" ([AGENTS.md §6](../../AGENTS.md)), and a ripple here would communicate nothing the pressed layer does not already communicate instantly. It would also need JavaScript per control, a `prefers-reduced-motion` path and its own test surface — machinery bought for decoration. `ripple` is 0 occurrences in `app/` and that is the intended state, not an omission. Recorded so this stops being re-raised by every audit ([ADR-077](../decisions/ARCHITECTURE_DECISIONS.md#adr-077-interaction-consistency--one-state-layer-no-ripple-one-selection-control-one-switch-and-the-two-shared-layouts-that-were-wasting-the-laptop) decision 3).

**Disabled.** One pattern everywhere: the container is the content colour at 12%, the content at 38%. A disabled filled button and a disabled text button therefore look like the same *state* rather than like faded versions of two different things.

**Motion.** `--md-sys-motion-duration-{short1..4, medium1..4, long1..4}` and the six M3 easing curves. `prefers-reduced-motion` zeroes transitions against `--md-sys-motion-duration-none`.

**Focus.** `outline: 2px solid var(--md-sys-color-primary); outline-offset: 2px` on `:focus-visible`. An outline follows the element's own corner radius, so a fully-rounded button gets a fully-rounded ring and a text field gets a 4px one, with nothing to keep in sync. `primary` clears 3:1 against every surface the ring is drawn over, in both appearances — asserted, not assumed.

---

## Iconography

**Material Symbols Outlined**, weight 400, exposed through the one shared primitive in [`app/shared/icons`](../../app/shared/icons). Component names, props and accessibility behaviour are unchanged from the in-house set they replace — the *set* was always documented as swappable while the entity-identity mapping was the durable contract.

- Icons are **decorative by default** (`aria-hidden`), because DalyHub never conveys meaning by icon alone. Pass `title` on the rare surface where an icon must carry its own name.
- Size follows the surrounding text (`1em`) unless given explicitly, so an icon scales with its label and honours OS text scaling.
- Symbols are **filled paths**, so `BASE_PROPS` is `fill="currentColor"` with no stroke.
- Upstream authors them at 960 units with a flipped origin; `createIcon` maps that into the 24×24 viewBox with one transform, so the committed path data stays byte-identical to its Apache-2.0 source and a re-copy is a diff rather than a rewrite.
- `BrandMark` is the one exception: it is the product identity, painted in the fixed brand gradient rather than in `currentColor`.

---

## M3 component anatomy, as shipped

| Component | Anatomy |
| --- | --- |
| **Buttons** | 40px visual height on a 44px target, `corner-full`, `label-large`, 24px inline (16px with a leading glyph), built-in state layer. Filled (`--primary`, one per surface), tonal (`--secondary`), outlined (`--outlined`), text (`--ghost`), error-filled (`--danger`). |
| **Chips** | 32px, `corner-small`, `label-large`, on the role's container pair. The neutral absence chip keeps an outline. |
| **Text fields** | M3 outlined: 56px, `corner-extra-small`, 1px `outline` → 2px `primary` focused, 2px `error` invalid, `body-small` supporting text. The label sits **above** the field rather than notched into the outline — a deliberate deviation, for accessible-name stability across ~100 instances. |
| **Cards** | `--md-app-color-surface-card`, `--app-shape-card`, **no border and no resting shadow** (M3X — separation is the surface step), 16/24px padding. Interactive cards lift to `--app-elevation-raised` on hover. An entity card takes `--app-shape-entity-card`; a page summary takes `--app-shape-hero` with the tinted expressive surface. |
| **Lists** | 56px one-line, 16px inline padding, `outline-variant` hairline between rows only. |
| **Menus** | `surface-container-high`, `corner-extra-small`, elevation 2, 48px `body-large` items. |
| **Navigation drawer** | `surface`, no edge border, 12px inline padding; 56px `corner-full` items with a 24px glyph, 12px gap, `label-large` and a `secondary-container` active-indicator fill (M3X returned this to the M3 default — see `shell.css`). |
| **Top app bar** | Small variant: 64px, `surface`, no rule, `title-large`. |
| **Search bar** | 56px, `corner-full`, `surface-container-high`, leading glyph. |
| **Navigation bar** | 80px, `surface-container`, a 64×32 `secondary-container` active-indicator pill behind the glyph, `label-medium` labels always visible. |
| **FAB** | 56px, `corner-large`, `primary-container` pair, elevation 3, bottom-right, clearing the navigation bar, the home indicator and the keyboard. Shown only where the navigation **bar** is not — below `md` the bar's Capture slot is the single global affordance. Every page reserves `--app-fab-band` at the END of its scroll so nothing is ever *trapped* beneath it; it may float over content while scrolling, and it never takes inline width from the page to avoid that (which would cost the entity galleries a grid column — see `shell.css`). |
| **Segmented buttons** | One 40px outlined container, `corner-full` ends, 1px dividers, `secondary-container` selected segment with a leading check glyph. |
| **Snackbar** | `inverse-surface` pair, `corner-extra-small`, elevation 3, action text in `inverse-primary`. |
| **Tooltip** | Plain variant: `inverse-surface` pair, `corner-extra-small`, elevation 2, `body-small`, 8px from its trigger and clamped to the viewport. Shown on hover **and** `:focus-visible`. |
| **Progress** | Linear: `--app-progress-bar-height` (6px since M3X) `corner-full`, `primary` on `secondary-container`. Circular: the shared `ProgressRing` in [`app/shared/charts`](../../app/shared/charts), same tokens; a hero ring passes a thicker stroke. |
| **Bottom sheet** | Top corners `extra-large`, `surface-container-low`, `--dh-elevation-modal`, 32×4 drag handle at `on-surface-variant` 40%. Above tablet width the same component is a centred dialog and keeps the modal elevation — **DHDS-13** corrected it from `--dh-elevation-raised`, which is `none` by construction, so the global Capture surface had been shipping with a 6%-alpha hairline and no shadow. |
| **Side drawer** | Neutral raised surface, one quiet leading-edge hairline, overlay elevation and a 32% scrim. It never paints the whole editing surface in the brand tint. |
| **Scrim** | `--dh-color-scrim`, painted **as authored** — 32% in light, 58% in dark. It is a finished value, not a base colour to mix down: **DHDS-13** found all eight consumers re-applying M3's "scrim at 32%" on top of a token that already carried it, so every modal in the product was dimming its page to 10.3% (light) / 18.6% (dark). A surface that wants a lighter wash than a modal mixes it down explicitly and says why. |

---

## What it looks like

Screenshots of the shipped surfaces in **both appearances**, captured by
[`e2e/m3-screenshots.spec.ts`](../../e2e/m3-screenshots.spec.ts):
[`docs/design/assets/m3-2026-08/`](assets/m3-2026-08/).

The pass is opt-in, like every other screenshot pass, so the ordinary gate
neither slows down nor writes into the repository:

```sh
CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/m3-screenshots.spec.ts
```

Appearance is **emulated** rather than stored, because that is where the choice
lives now — there is no preference to set.

---

## The Today screen

Today is not a dashboard. It is the surface the owner **works from**, and every
rule below serves one question: *what am I doing today?*

It used to be a metrics dashboard about work: a full-width search hero, six stat
tiles mostly rendering zeros, a Task Summary donut restating three of those
counts a third time, a customisation toolbar, fourteen collapsible widgets — and
the day's actual tasks below the fold. Every number on it was real; that was the
problem. The surface counted the same day three ways and pushed the day itself
out of sight.

### Layout contract

Top to bottom, on the page canvas (`surface-page`). Rebuilt to `MOCKUP 5.png` by
[TODAY-11](TODAY_11_COMMAND_CENTRE_2026_08.md), which is the fuller record:

```
Good morning, Aidan                                          [ + Add task ]
Saturday 8 August 2026
Today   Tomorrow   Next 7 days

┌ Tasks completed ┐┌ Tasks captured ┐┌ Goals on track ┐
│ 24   ╱‾╲╱‾      ││ 30   ╱╲__╱‾    ││ 3    ▓▓▓░░     │
└─────────────────┘└────────────────┘└────────────────┘

┌─ Today's plan            8 tasks ─┐  ┌─ Schedule   View full schedule ─┐
│ Overdue                           │  │ August 2026                     │
│ ☐ Send the quarterly summary Due2d│  │ MON TUE WED THU FRI SAT SUN     │
│ Due today                         │  │  10  11  12  13  14  15 (16)    │
│ ☐ Draft the release notes  Proj P1│  │              ·          ·       │
│ + Add task                        │  │ 09:30 ● Design review    Studio │
└───────────────────────────────────┘  └─────────────────────────────────┘

┌─ Goal progress ──┐ ┌─ Insights ─────┐ ┌─ Quick capture ────────────────┐
│ (G) Read 24 books│ │  ◜80%◝  24 / 30│ │ [ Capture a task, note or idea]│
│     Personal  12 │ │  View analytics│ │ [Task][Note][Diary][Meeting]   │
└──────────────────┘ └────────────────┘ ├─ Daily reflection ─────────────┤
                                        │ What went well today?          │
                                        └────────────────────────────────┘

┌─ Needs attention ─────────────────┐  ┌─ Continue working ──────────────┐
```

1. **Header block** — page content, no card. Greeting (`--dh-text-page-title-*`,
   and the screen's `h1`) · date line · one primary action, `+ Add task`, opening
   the shared capture sheet on the Task panel. Morning until 12:00, afternoon
   until 17:00, evening after, resolved from the OWNER's local hour server-side.
   **No search control**: the shell carries search one rank above, on the same
   gutter line.
2. **Day rail** — Today · Tomorrow · Next 7 days, the shared `ViewTabs`.
3. **Stat rank** — at most three cards, each omitted when its source is silent.
   Shallow by contract: a label, a figure and a ≤32px chart. **Exactly three
   blocks may precede the day's work** (header, rail, measures); a fourth is the
   dashboard creep FINAL-UI §45 was protecting against, and
   `TodayScreen.test.tsx` fails on one.
4. **Four ranks** — measures, work (plan ~⅗ beside schedule), context (goals ·
   insights · the capture/reflection stack) and support (attention · continue).
   Each collapses to one column below `34rem` of the pane. Nothing is moved by
   CSS `order`: the DOM order is the phone order, the reading order and the tab
   order.

### Conditional rendering — zeros never paint

Every element states its own condition. This is the rule the whole design rests
on, so it is a table rather than prose.

| Element | Renders when |
|---|---|
| Stat rank | at least one measure has a real reading |
| Tasks completed · Tasks captured | the 14-day activity trend is not `null` |
| Their sparklines | the series has **two or more** points — one reading has no direction |
| Goals on track | at least one MEASURABLE Goal (never "0 of 0") |
| Plan heading count | the canonical today count > 0 |
| Overdue band | any overdue task. **Named** since TODAY-10 — see below |
| `+{n} more overdue` | more than 3 overdue |
| Due today band | any task whose DUE date is today |
| Planned today band | any task planned for today that is not also due today |
| `View all {N} tasks for today` | the day's own rows exceed the 8-row bound |
| Plan empty line | nothing overdue and nothing on today |
| Schedule panel | **always** (TODAY-11) — the week strip is a real control over real data; the *timeline* says "Nothing scheduled", and says something different again when no calendar source is connected |
| Week-strip dot | that day holds at least one schedule item |
| Insights panel | the activity trend is not `null` |
| Insights percentage | something was captured in the window (no division by zero) |
| Quick capture · `+ Add task` · reflection invitation | a `CaptureProvider` is mounted — the control renders NOTHING rather than one that cannot complete |
| Reflection excerpt | today holds a Diary entry with a body |
| Needs attention | the attention read produced rows — the whole panel, not a placeholder |
| Continue working | at least one active project has open work |
| "All clear." | the page's LAST line, when the day is empty and nothing needs attention — never beside a real item |

### What "on today" and "overdue" mean

A task carries **dates, never times** — `dueDate` (the deadline) and
`scheduledDate` (the owner's "I intend to work on this that day" commitment,
ADR-030). A meeting carries an instant. So the timeline prints a time beside a
meeting and never beside a task, and there is **no Morning/Afternoon grouping**:
it would be honest only for the timed minority, and there are too few of those
to justify it.

- **Overdue** — `dueDate < today` OR `scheduledDate < today`.
- **On today** — not overdue, and `dueDate = today` OR `scheduledDate = today`.

Both are deliberately the rule the canonical `/tasks` system views already use,
so the "+n more overdue" row lands on a list of exactly the size it promised.

**TODAY-10 split "on today" into two named bands inside the one Focus panel**,
because it was one list holding two different commitments and naming neither: a
task DUE today is a deadline, and a task PLANNED for today may not be due for
weeks. The set is unchanged; only its legibility is.

- **Overdue** · **Due today** · **Planned today**, in that order, each drawn only
  when it holds work. A task that is both due and planned today is a *Due today*
  task and appears once — a deadline outranks an intention, the same precedence
  the overdue label already applied when both dates had passed.
- The distinction is carried by the **band**, not by the row: the row's one
  trailing slot is the Project, and at 320px a row cannot hold a title, a date
  phrase and a project without the title losing. A band states the fact once for
  every row under it and costs no width.
- **Overdue is now named.** It was headless on the reasoning that "the tint is the
  signal"; with two labelled siblings beneath it an unnamed run reads as an
  unexplained preamble, and it would be the one band whose meaning depended on
  colour. The label is the same quiet uppercase divider, so naming it makes it no
  louder.
- **Order:** slipped work oldest-first, then Due today, then Planned today; inside
  each band **priority, then the nearest deadline, then the title**, with the id as
  a total tie-break. Every input is a stored field the row can show. No composite
  score, and priority never groups or tints the panel.
- **Completion never moves a row between bands** — a finished task stays where it
  was, dimmed, at the end of its own band.

The full contract, including bounds, the Needs-attention boundary and the phone
composition, is in [`TODAY_DASHBOARD.md` → The Focus contract](../development/TODAY_DASHBOARD.md#the-focus-contract-today-10-2026-08-12).
An overdue row's trailing label names WHICH date slipped ("Due 3 days ago" /
"Planned yesterday") because those are different facts about the same task.

A task completed earlier today stays in the day's list, **dimmed and struck at
the end** — not omitted. The progress denominator counts it, and a denominator
whose parts you cannot see is a number the owner has to take on trust.

### The Schedule region (CAL-01)

Today's third region answers *what is happening today?*, beside Focus's *what
needs my attention today?*. It holds **one chronology**: every occurrence from
every enabled external calendar source, plus the DalyHub Meetings that no
occurrence already represents. Two lists would give the owner two chronologies of
one day to reconcile — and a Meeting created FROM an event would appear in both.

**CAL-01 added a region; it did not redesign Today.** The Focus contract above is
untouched, the stat row is untouched, and the region, its heading and its position
are the ones the Meetings panel already occupied.

**The row.** A leading two-line time block (start over end) in tabular figures in a
fixed slot, a source accent mark exactly where a Task's completion circle stands,
then the title with one quiet supporting line (source · location) beneath it. The
day therefore reads as ONE column of events with several kinds in it, sharing one
left edge with Focus.

| Rule | Why |
|---|---|
| All-day items sit in their own labelled band **above** the timed run, with no time slot at all | an all-day item has no time, and drawing it at 00:00 would be an invented claim |
| Times are formatted in the **owner's** timezone | a merged chronology showing each row in its source's local time would put 09:00 below 17:00 |
| **Now** / **Next** are WORDS, not colours, awarded to at most one row each, and only on the owner's actual today | never colour alone (§Accessibility); "Now" on Thursday's page would be false |
| Now/Next are resolved ONCE on the server against the request instant | no countdown, nothing re-rendering on an interval, no notification |
| **Next** skips a cancelled event | pointing at a cancelled 10:00 is worse than pointing at nothing |
| A cancelled event is struck through **and** labelled "Cancelled" | it is kept, because "the 10:00 is cancelled" is what the owner needs on the day |
| The row's only inline action is **Open notes**, and only once a Meeting exists | most rows are not meetings; "Create meeting notes" lives in the event's detail sheet, one tap away |
| Source colour comes from the shared **Area accent ramp** by stable creation rank | never a colour from the feed: those are chosen against another product's surfaces and are unaudited here |
| The source's **name** is beside the mark and in the row's accessible name | the mark is decorative |
| Freshness is stated only when it is NOT fine | a line saying "everything synced" on every visit is noise; a day built from a failed refresh that says nothing is a lie |

**Ordering:** all-day first; then timed by start instant; then, for identical
starts, the shorter item first; then title, then id — so the sort is total and
identical on the server and in the browser.

**Phone (320–430px).** The supporting line takes the full width under the title
rather than competing with it, and the time slot narrows to 2.875rem. Nothing is
hidden: the source, the location and the meeting affordance are all still there.

### The day rail: Today · Tomorrow · Next 7 days (CAL-02)

Three destinations, drawn with the shared `ViewTabs` rail directly under the
page's heading block — where every collection in DalyHub puts its principal-mode
rail. `ViewTabs` gained an optional per-tab `to` path for this: these are three
routes rather than three values of one search param, and the object is otherwise
identical (text, indicator, `aria-current="page"`, native link keyboard
behaviour). Not a segmented control — that is for a bounded toggle over one view
of the same data — and deliberately not a date picker, which is the first step
towards a month grid.

**Tomorrow** reuses the same schedule read and the same Task date classifier as
Today (TODAY-10's `focusBand` was split so its due/planned half is shared rather
than copied), and deliberately carries no overdue band, no attention rail and no
progress: nothing can have slipped relative to a future date, and Today remains
the one overdue attention surface.

**Next 7 days** is seven day groups, each with the day's schedule and one
restrained line ("3 planned tasks") — a COUNT, not a list. Two columns from the
tablet boundary up; deliberately not a seven-column grid, which is a week
timetable.

### Rail inclusion rules

The rail holds **what the timeline does not show**. That is its definition, and
it is why overdue tasks are banned from it however loudly they would read there:
they are already actionable rows a few hundred pixels to the left.

| Row | Condition | What it states |
|---|---|---|
| Inbox | unfiled open tasks exist | `{n} unfiled tasks` (see PRODUCT_DEBT DEBT-102) |
| Waiting | any waiting item | `{n} waiting items · oldest {age}` — the AGE is the point, a bare count is noise |
| Asset | Asset obligations needing attention that are not already represented by an open linked Task | the first obligation's Asset/title signal, with any suppressed linked-Task count stated in words |
| Project | the EXISTING derived health says it needs a look | its health label |
| Goal | the EXISTING alignment evaluation flags it | its alignment label |

Caps: 2 projects, 2 goals, **5 rows overall**. Priority order: inbox, waiting,
asset, projects, goals. Every row navigates to its subject. No new health,
obligation or risk logic is introduced here — the rail consumes
`evaluateProjectHealth`, `evaluateGoalAlignment` and the Assets Today
deduplication rule, so Today can never disagree with the owning module about
whether a Project, Goal or Asset obligation needs attention.

**Continue working** ranks by *real activity recency*
(`ProjectHealthSummary.lastActivityIso`, derived from the shared Activity
stream) — never `updated_at`, which a rename or a settings toggle moves without
any work having happened.

### Colour, and the rest of the visual contract

- Page `surface-page`; each column ONE `surface-card` at `corner-large` with
  **no outline** — separation is the DalyHub surface ramp, not a border.
- Overdue rows sit on `error-container`; the due label takes
  `on-error-container`; the task title stays `on-surface`. Nothing else on the
  page is tinted.
- "Plan day" is a tonal button (`secondary-container`); "All projects" is a text
  button on `primary`. Both are real controls, not hyperlinks.
- Times, counts and percentages are tabular figures; meeting times sit in a
  fixed-width slot so the day lines up on one axis.
- Progress uses the shared [`ProgressTrack`](../../app/shared/progress/ProgressTrack.tsx) —
  one linear indicator implementation, `primary` on `secondary-container`.

### What is deliberately absent

No search field (search is an icon in the top app bar, with the `/` shortcut) ·
no "Customise" or widget system · no collapsible sections · no Task Summary
donut, Insights panel or productivity score · no second capture control — the
global `+` is the only one · no charts, no analytics.

The dashboard rules the old surface was built on still hold wherever a figure IS
shown, and they are the reason most of them are not:

- **Every figure is derived from a real read**, never approximated by a related one.
- **Every figure is stated in text beside its shape** — a progress bar always has
  its value in words next to it.
- **No manufactured achievement.** No streaks, no percentiles, no comparisons.
  DalyHub has one user and nobody to be measured against.
- **A figure with nothing to say is not drawn.** `0` is not a fact worth a row.

Charts are hand-rolled SVG in [`app/shared/charts`](../../app/shared/charts) — no charting dependency. They take typed data arrays, paint only with chart tokens, and carry `role="img"` plus a generated text summary.

## The pattern catalogue

Each pattern below has: **Purpose**, **Anatomy**, **Behaviour**, and **Rules**. Patterns compose — the [Record Layout](#record-header) is built from many of the others.

### Record Header
**Purpose.** The consistent top of every record (task, project, person, note, …) so the user always knows *what am I looking at and what can I do with it*.
**Anatomy.** Entity icon + type label · title (inline-editable) · key status/metadata chips · primary action · overflow (⋯) menu · breadcrumb to parent in the [Area hierarchy](../../AGENTS.md#4-the-area--goal--project--task-model).
**Behaviour.** Title edits inline and saves optimistically. Breadcrumb navigates up. Primary action is the single most likely next step for that entity.
**Rules.** Every entity uses this header — no bespoke headers. Exactly one primary action; everything else lives in the overflow or [Quick Actions](#quick-actions).

- **The title gets width before anything else does.** A short record title must not wrap while there is room beside it. `Opo 1 2026` rendering as `Opo 1` / `2026` on a laptop is the defect this rule exists to prevent, and the cause was an intrinsic-sizing one rather than a flex one: a percentage `inline-size` on the inline heading editor's trigger cannot be resolved while the ancestor it refers to is being measured, so the heading's max-content contribution collapsed to its longest word and the flex item took that as its base size. Never fix a wrapping title with `white-space: nowrap`, a smaller heading, truncation, or a per-module width. A **genuinely** long title still wraps, and never breaks ordinary words.
- **The rule holds while the title is being EDITED.** The same intrinsic-sizing family reappeared one state deeper (UIQ-003): in edit state the heading's max-content contribution is the editor frame's, which resolves to the browser's ~20ch `<input>` default — so renaming collapsed a full-width heading to a ~300px box clipping the very name being edited. While the heading variant is editing, the title flex item **grows** (`flex-grow` distributes free space after layout, so it can never feed back into the intrinsic measurement the way a percentage did). Read-state layout — the chip beside a short title — is untouched, because the rule binds to `data-editing`.
- **Status chips and actions yield before the name does.** The chip may wrap below the title and the action cluster may wrap to its own row; the record's identity is not squeezed to keep either of them in place.
- **One primary, one secondary, then the overflow.** `RecordHeader` shows the first secondary action a module declares and folds every later one into the shared overflow, above the lifecycle group. Modules declare actions in priority order; the header decides how many compete with the name. Nothing is removed and nothing becomes unreachable — a low-frequency action (Rename where inline editing exists, Archive, Delete, Export, Tags) is one press away rather than permanently occupying header width.

### Summary Panel
**Purpose.** The at-a-glance essence of a record: the fields that matter most, shown without a click.
**Anatomy.** A compact, scannable set of key fields (status, dates, links to parent Goal/Project, assignee/People, progress).
**Behaviour.** Fields are inline-editable where sensible. Rolls up child state (e.g. a Project's summary shows task progress). Empty fields invite completion, they don't shout.
**Rules.** Summary shows *essentials only*; depth belongs in [Tabs](#tabs) or the [Inspector](#inspector). Same field → same control everywhere.

- **A container is earned, not automatic.** A summary carrying real prose (a Goal's definition of done, a Project's description) is a substantial region and takes the card surface. A summary that is only a few key/value pairs renders as a plain metadata row on the page canvas. Three equally-weighted cards down one record is what makes a single record read as several unrelated ones; M3's order is spacing and typography first, another surface only when they are not enough.
- **Absence is quiet.** Missing data is stated in the owner's words as supporting text (`AbsenceText`), never as a chip. "No tags", "No tasks yet" and "No Projects contributing yet" are the absence of a concept; a chip is what the product spends on concepts that are there. Genuine lifecycle states — Planned, Waiting, Completed, On hold, Overdue — stay chips.

### Drawer
**Purpose.** Open a record *without leaving your place*. The workhorse of DalyHub navigation — click a task in Today and it slides in over context.
**Anatomy.** A side sheet containing the full [Record Layout](#record-header) (header, summary, tabs, timeline, activity).
**Behaviour.** Opens over the current view; the underlying context stays visible and is restored on close. Deep-linkable and stackable (a drawer can open another). `Esc` closes; browser/back respects the stack.
**Rules.** The Drawer is the default way to open any record. It must never lose the user's place. Full-page record views exist only where genuinely warranted (e.g. long-form Note editing).
**Realised by** the [Shared Drawer (DS-03)](#shared-drawer-ds-03) — the single, entity-agnostic implementation.

### Contextual panel anatomy (DHDS-03)

Drawer, Inspector and Sheet keep their distinct behaviour, but no longer carry
three versions of the same chrome. They compose one `PanelHeading` and the
shared `.dh-panel-*` anatomy:

1. one visible `h2`, which is also the surface's accessible name;
2. at most one supporting line, wired through `aria-describedby`;
3. contextual header actions only when they earn permanent placement;
4. one explicit close control — `IconButton` for glyph-only close, or an
   equally placed worded Cancel where the Sheet action grammar calls for it;
5. one scrolling body; and
6. one optional pinned commitment region, separated by a single hairline.

The host still owns the behaviour that makes it the right surface: Drawer owns
URL history and stacking; Inspector owns docked resize and content reflow; Sheet
owns transient modal presentation and keyboard-safe mobile geometry. Shared
anatomy must not become a universal overlay component with modality flags.

On desktop, secondary record actions size to their words. A 420px drawer must
not contain two 420px secondary buttons. On mobile, the one primary commitment
may use the pinned region because reachability above the keyboard matters more
than pointer density. A centred desktop Sheet hides the decorative drag handle;
it must not advertise a touch gesture it does not implement.

### Tabs
**Purpose.** Organise a record's depth into predictable sections without overwhelming the summary.
**Anatomy.** A consistent tab strip within a record (e.g. Overview · Tasks · Notes · Activity · Settings).
**Behaviour.** Selected tab is preserved per record and deep-linkable. Lazy-loads tab content.
**Rules.** Tab names are drawn from a shared vocabulary and ordered consistently across modules — "Activity" and "Settings" always sit last, in that order.

- **The strip and the panel it controls are ONE surface.** The tab strip's rule *is* the working surface's top edge: no gap between them, no second top border, no second set of top corners. A gap plus a fully-rounded card underneath reads as "a tab bar, and separately, a card" — the same segmented look the editor's toolbar and writing surface already avoid by sharing one outline.

### Cards
**Purpose.** The shared unit for representing an entity in a list, board, or grid.
**Anatomy.** Entity icon/accent · title · a few meaningful metadata chips · optional progress · quick-action affordances on hover/focus.
**Behaviour.** Clicking opens the [Drawer](#drawer). Cards support selection, drag (with keyboard equivalent), and inline quick actions. Density is configurable (comfortable/compact).
**Rules.** **One shared card family, not one mega-component and not one private
card per module.** `EntityCardGrid` owns gallery collection semantics and
responsive tracks. `EntityCard` owns the common recognition-led anatomy.
`ProjectCard` and `AssetCard` are shared product specialisations where the
domain genuinely changes the layout — a Project pins delivery progress to its
floor; an Asset leads with obligation and risk. They live in `~/shared/card`,
consume the same tokens and interaction contracts, and are reusable wherever
that entity appears. A module-local copy made only to change styling is debt.

**A finished record is struck through — `completed` (TASKS-09).** The opt-in `completed` prop draws a line-through and a quieter title colour, which is exactly the treatment `RecordRow` has drawn since TODAY-02 rather than a second one. Two rules come with it: it is **never colour alone** (the decoration and the colour together), and it is **never the only statement of the fact** — a consumer that sets it also says so in words, through a status pill and an action that reads "Reopen". It is deliberately not derived by the Card from a status value: completion means different things in different modules, and the caller is the one that knows.

**A row may lead the server, but a live region may not (TASKS-09).** Where a collection paints an optimistic change, it patches the record it renders FROM and lets the existing derivations run, so an in-flight row and a reconciled row cannot look different for reasons other than their data. Announcements, activity and any claim of success wait for the server. See [ADR-086](../decisions/ARCHITECTURE_DECISIONS.md#adr-086-optimistic-presentation-on-task-lists-with-server-authoritative-reconciliation-and-announcement).

### Entity card and its grid (DS-14 Gate D)
**Purpose.** A record you recognise before you read it — a Project, Goal,
Asset, or an Area when its optional Grid presentation is selected — in a
responsive grid. It replaces private gallery implementations; it does not force
every identity-bearing collection to default to cards.
**Anatomy.** `EntityCard` in `EntityCardGrid`. Identity container · title · subtitle (the parent context, or a one-line work state) · one status chip · one primary metric · a thin progress bar with its percentage · one wrapping metadata row · an optional footer and overflow menu.
**Behaviour.** The whole card is one destination: the title is a router `Link` whose `::after` covers the card. The grid is **`auto-fill`** over one token (`--app-entity-card-min-width`) — roughly four columns at ordinary desktop widths, five on a wide monitor, degrading to three, two and one as the width falls — and it is a labelled `<ul>`/`<li>`, so a collection announces how many items it holds. Cards are content-height (`align-items: start`), not stretched to the tallest in the row.
**Rules.**
- **The identity container is the point.** 40px, rounded, tinted with a *generated* accent, holding the record's chosen glyph via `RecordIcon`. Use the shared `AccentIcon`; the accent is always **inherited** (an Area's own rank, a Project's Area's rank) and never invented, and a record with no Area takes the neutral container rather than a colour that means nothing.
- **One status treatment.** Never a lifecycle chip beside a health chip, a status glyph and a repeated metadata line. Pick the single most decision-relevant fact; let a secondary signal *replace* the primary one rather than sit next to it, and keep its explanation as supporting text rather than a second copy of the state.
- **Only interactive things sit above the card link.** A status chip is not a control. Raising static content makes that part of the card a dead zone — a real defect this component shipped with. Footer actions and overflow menus are raised; chips, metrics, bars and metadata are not.
- **Never state a value the loader cannot support.** A count is exact or it says it is loaded; a zero-denominator progress shows no bar at all, because an empty bar at 0% reads as "nothing done" when the truth is "nothing planned".
- **Progress states its value twice, from one source.** `CardProgress.label` is drawn beside the bar, `valueText` is announced; both derive from the same completed/total pair, so the visible text and `aria-valuenow` cannot disagree.
- **`auto-fill`, never `auto-fit` (DS-16).** The difference only shows when the collection has fewer cards than a row can hold, and there it is decisive: `auto-fit` collapses the empty tracks and stretches the survivors, so two Areas render as two 700px cards on a wide monitor. `auto-fill` keeps the tracks, so a card is the same size whether it has one neighbour or eleven. The column count is a consequence of the available width and that one token — never a breakpoint table.
- **Metadata is a compact fact GROUP, not a label ladder (DS-16).** Use `CardMetaFact` — glyph, number, noun — instead of `Goals: 2 · Projects: 4 · Tasks: 11`. The glyph is decorative and the noun is beside it, so nothing is carried by an icon alone. A count of **zero is omitted**, never rendered as "0 Projects": an absent dimension is not a fact worth a row on every card. A description or summary line uses `.dh-ecard__summary`, clamped to two lines, so one verbose record cannot make its card twice the height of its neighbours.
- **Lifecycle lives on the card (DS-16).** Areas and Projects pass the shared [record lifecycle](#record-lifecycle) actions into the card's `overflow` slot, so archiving is reachable from the gallery and not only from inside the record's Settings tab. The overflow is raised above the whole-card link, so opening the menu never navigates.
- **Recognition-led collections share ONE gallery system (DHDS-04).** Goals
  render `EntityCard`; Projects render the shared `ProjectCard`; Assets render
  the shared `AssetCard`; every one sits in `EntityCardGrid`. Areas defaults to
  `EntityRowList`, but its optional Grid view also uses `EntityCardGrid` and
  `EntityCard` rather than a private tile. Gallery consumers share
  collection semantics, boundary, identity resolution, whole-card destination,
  overflow placement and responsive tracks. Their anatomy differs only where
  the owner's question differs. There is no module-local grid or column rule —
  a change to `--app-entity-card-min-width` reaches them together. Lifecycle
  views keep the same gallery family so changing a filter never feels like
  changing products.

### Inline title editing on a Card (TASKS-04)
**Purpose.** Rename a record from a list without opening it, for collections where renaming is a routine daily act (Tasks).
**Anatomy.** The shared Card's optional `titleEditor` slot. When supplied, it replaces the title cell; when absent, the Card renders its ordinary open control (the link or button whose accessible name is `openAriaLabel`).
**Behaviour.** The host owns the editing state and supplies `titleEditor` **only while that one row is being renamed** — reached from the row's shared overflow menu, so nothing is hover-only and the row keeps its two visible quick actions. Enter saves through the canonical rename mutation and revalidates; Escape abandons; a rejected save keeps the typed text, announces the reason and returns focus to the field.
**Rules.** **Inline editing must never cost the user the way into the record.** A permanent replacement of the title control removes the record's primary open target from every row — the regression TASKS-04 found and fixed, and the reason this is a *conditional* slot rather than a title override. One row is editable at a time. The editor is a shared-token control, never a bespoke input.

### Shared writing surface (EDIT-01)
**Purpose.** ONE long-form editor for every surface that holds real prose — Notes, the Diary body and capture, Meeting agenda and notes, Reviews and a Task's description. It should feel like Gmail or Docs: compact, embedded, familiar — not like a form panel bolted onto a page. It is the **only** long-form control: `~/shared/forms` deliberately exports none ([ADR-084](../decisions/ARCHITECTURE_DECISIONS.md#adr-084-long-form-markdown-is-edited-on-a-permanent-shared-writing-surface--there-is-no-read-then-activate-variant)).
**Anatomy.** [`app/shared/markdown-editor`](../../app/shared/markdown-editor), in layers: the pure Markdown-source `markdown-transforms` · the `formatting-actions` catalogue (id, accessible name, glyph, group, shortcut) · the pure `formatting-state` active-format derivation · `editor-setup` (the CodeMirror extension set) · `EditorToolbar` · `LiveMarkdownEditor` (the writing surface, its SSR/no-JS `<textarea>` fallback, and the Read mode that renders through the ONE FND-08 pipeline) · `MarkdownEditorField`, the DS-06-shaped wrapper that lets an explicit-save FORM host the same surface with a real label row, help and error slot.
**Behaviour.** The editor's document **is** the Markdown source, byte for byte — there is no rich-text document model and no second parser or sanitiser. The toolbar is a compact icon row **attached** to the writing surface (they share one outline), grouped by hairline separators, with `aria-pressed` derived from the source at the selection and real enabled state on undo/redo. When actions continue beyond a phone's trailing edge, a measured fade signals that the row scrolls; it disappears at the end and never intercepts input. `density="compact"` trims the chrome for an editor embedded in a record body; `comfortable` is the editor-first workspace.
**Rules.**
- **The canonical format decides what the toolbar may offer.** Every control must round-trip through the stored Markdown and the sanitising renderer. Strikethrough is offered because `remark-gfm`'s `delete` node survives sanitisation; **underline is not**, because CommonMark and GFM have no underline node and the only way to produce one is raw `<u>`, which the renderer strips. A control that silently does nothing is worse than an absent one.
- **Icons carry the drawing; `aria-label` carries the word.** Nothing is icon-only to assistive tech, every control composes the [shared tooltip](#tooltip-m3-tip) — which names what it does and shows its shortcut on hover *and* on keyboard focus — and active state is `aria-pressed` **plus** a filled container, never a tint alone. This toolbar is the tooltip primitive's reference adoption; no control here carries a browser `title`.
- **Undo/redo appear only where they can be both performed and reported.** The no-JS fallback has the browser's own unqueryable undo stack, so the buttons are omitted there rather than shown permanently enabled.
- **Enter is never an unconditional save** in a multiline surface. Enter is a PARAGRAPH — a long-form editor that saves on Enter cannot be used to write anything longer than a sentence, and the owner discovers that by losing one. Commit is an explicit control or **⌘/Ctrl+Enter**, which the surface itself binds (DOC-EDITOR-01) on the live editor *and* on the no-JS fallback, so keyboard save never depends on enhancement having happened. It binds before Markdown's list continuation and before CodeMirror's default `Mod-Enter`, so nothing can claim the chord underneath it. An AUTOSAVING surface passes no commit handler at all: a shortcut that appears to do something and does not is worse than an absent one.
- **Long-form is EDITOR-FIRST: there is no read-then-activate variant (DOC-EDITOR-01).** A Note, a Meeting's notes, a Diary entry, a Review section and a Task's description are surfaces you open in order to WRITE, so the writing surface is permanent and reading is its own Read toggle (or the host's rendered view). A record body that shows rendered text until you activate it is a smaller idea than a document, and it is what "one surface, not a read-only card that becomes an unrelated form" rules out. The DS-16 field built for the other model was never adopted and is deleted rather than kept dormant — see [ADR-084](../decisions/ARCHITECTURE_DECISIONS.md#adr-084-long-form-markdown-is-edited-on-a-permanent-shared-writing-surface--there-is-no-read-then-activate-variant).
- **The boundary is test-enforced, not documented.** `test/unit/markdown-editor/one-writing-surface.test.ts` fails if CodeMirror is imported outside this package, if a second toolbar or formatting catalogue appears, if a superseded long-form control is redeclared, if `~/shared/forms` exports anything Markdown, or if a rich-text document model enters the application.
- **Presentation converges; persistence does not (EDIT-02).** A module adopting this surface keeps its own save semantics — the Diary panel keeps its explicit **Save changes** and its dirty guard, a Note keeps autosave, a Meeting keeps autosave-on-blur. `MarkdownEditorField` exists precisely so that unifying how writing LOOKS never forces a module onto a different persistence strategy. It lives in `~/shared/markdown-editor`, not in `~/shared/forms`, so a route that only renders a text input does not pull the writing surface into its bundle.
- **Disabled is a state of this control, not a read view.** `disabled` reconfigures the live view through a CodeMirror `Compartment` rather than re-creating it, so a form that disables its controls during a submit does not cost the author their undo history or their caret. The toolbar keeps its shape and greys out; it never disappears and shifts the page.
- **The editor is a DOCUMENT COLUMN, and every band shares it (UIX-04).** The measure is `--app-width-editor` (**72ch**) and it is applied to the editor's own CHILDREN — the toolbar, the writing surface, the read view, the message slot — so the strip's first icon sits above the first character and the whole thing reads as one sheet. It is 72ch, not EDIT-02's 90ch: that value was argued from "Markdown source is not prose", which stopped being true when the live editor started styling the document as it is typed. 90ch produced ~95-character lines *and* left a quarter of the canvas empty — too wide to read and too narrow to fill the page. Where the slack is worth spending, the module spends it (the Notes rail, a Meeting's dense tabs) rather than leaving it blank. **There is no single global max-width**: reading and writing take this measure, collection rows take `--app-width-content`, metadata takes the column it belongs to.
- **Never cap or centre `.cm-content` itself.** `margin-inline: auto` on `.cm-content` does not merely centre a capped column: `.cm-scroller` is a flex container, so auto margins cancel `flex-grow` and centre the item's own max-content box — which on an *empty* document is a few pixels wide. That is how a Note's caret and `Start writing…` placeholder came to open near the middle of a 1044px surface. The column lives one level up, on ordinary block children of a column flex container, so `.cm-content` simply fills what it is given and there is nothing left for the flex layout to misinterpret.
- **Read and Write are ONE column (UIX-04).** They used to be 65ch and 90ch respectively, sharing only a left edge. Write mode already shows the rendered document, so reflowing every line on the way to Read was a jump with nothing behind it: both modes now take the writing measure and the text does not move when the toggle is pressed. Read differs from Write in what it renders, not in where it sits.
- **The document heading ladder is `--app-writing-h1…h4` (28/22/18/16), not the chrome typescale.** The M3 scale is built for an application's chrome, where `title-medium` is 16px — identical to `body-large` — so mapping `h2`/`h3` onto it made a structured note render as a wall with no outline. The four sizes are consumed by BOTH `.markdown-content` and the live editor's decorations, so Read and Write cannot drift. Paragraph rhythm is `--app-writing-paragraph-gap`, in `em`, shared by both for the same reason.
- **Not every formatting control is permanently visible (UIX-04).** Thirteen 44px controls do not fit a 72ch column, and the row's own horizontal scroll hid the overflow — a control that has scrolled out of a strip nobody knows scrolls is simply gone. Seven stay: bold, italic, heading, bulleted list, numbered list, link, remove formatting, plus undo/redo, the record-link command and *More*. Strikethrough and Checklist live behind *More* and keep their shortcut, tooltip, `aria-pressed` state and place in the single roving tab stop.
- **The toolbar sticks to the top of the writing surface (UIX-04).** A note long enough to scroll used to scroll its controls off the page, so formatting a paragraph three screens down meant scrolling back for a button. It carries the page colour only while stuck, so a document that fits shows no band at all.
- **44px targets, on every pointer.** DalyHub holds that bar everywhere and it is stricter than WCAG 2.2 AA's 24px; an earlier draft of this work shrank the control to 36px on fine pointers for compactness, which traded an accessibility contract for a visual one. The compactness comes from the GLYPH instead: thirteen 44px squares are narrower than eleven word-buttons, and they do not wrap. The row scrolls horizontally inside its own box, so the toolbar never produces page-level overflow at 320px.

### Writing-module composition (UIX-04)
**Purpose.** The three modules that hold real prose — Notes, Diary, Meetings —
share the [writing surface](#shared-writing-surface-edit-01) and differ in
COMPOSITION. Sharing primitives without sharing the whole experience is the point:
capturing information, recording a day and running a conversation are three
different jobs, and a module that is the same screen with a different heading is
the failure this pattern exists to prevent.

**Anatomy.** [`app/styles/writing.css`](../../app/styles/writing.css) (the shared
document column, its title and its one context line) · the module compositions in
`notes.css`, `diary.css` and `meetings.css` · the four `--app-writing-*` tokens in
`tokens.css`.

**Rules.**
- **One context LINE, not a metadata band.** A writing surface states, above the
  text, only what the writer cannot see by looking at it: when it was last
  touched, and whatever context the module genuinely has (tags for a Note, a time
  for a Diary entry, when/where/who for a Meeting). Everything else the record
  knows lives in the overflow or a tab. Where a record's header would otherwise
  render labelled `Field: value` pairs, the module passes `label: ""` and supplies
  the whole line — the shared header's documented "this context reads as a phrase"
  escape.
- **The record header aligns to the document column.** Otherwise the title sits a
  hundred and fifty pixels to the left of the first character it names, which is
  the "awkward centring" defect arrived at from the other direction. Breadcrumb,
  title, context, tab strip and prose are one column.
- **A module's identity is its LIST, not its editor.** Notes is a directory of
  documents (title-dominant rows, one-line preview, a right-hand date column, a
  rail beside the open note); Diary is a chronology (a week strip, day groups,
  two-line previews); Meetings is a schedule (day headings, a leading time column,
  status only when it contradicts the view). None of the three uses the shared
  Card: a card is how you present things you choose between by LOOKING, and all
  three of these are found by their title or their date.
- **A phone gets a different composition, never a squeezed desktop one.** The
  Notes rail is not rendered below `lg` (list screen → note screen); the Diary's
  week strip scrolls inside its own track so its controls stay reachable; the
  Meetings row moves its time above the title rather than stealing width from it.
  On a document, the phone drops chrome the top bar already carries — the
  breadcrumb, the entity glyph — so the words start near the top of the screen.
- **Structured sections are the ones the schema owns.** A Meeting's notebook runs
  Agenda → Notes → Decisions → Outcomes → Actions because those are the two
  Markdown bodies on `meeting_details` plus the four `meeting_items.kind` values.
  A module does not invent a section a reader could not fill.

### Inline editing (DS-16, DHDS-10)
**Purpose.** Change a commonly-edited value where it is shown, instead of routing every small correction through a modal, a drawer or a dedicated edit page.
**The grammar (DHDS-10).** Every editable property is one of exactly three things, and deciding which *is* the design work: an **immediate toggle** (binary and reversible — a completion, a check-in, a milestone: tap, optimistic, Undo where reversal has value, and never a menu for a binary decision); a **contextual choice** (a small enumeration or one record out of many — a [DHDS-09 surface](#floating-surfaces-dhds-09), never a record editor); or an **inline text edit** (a short textual property, entered deliberately). The full grammar, the per-surface adoption tables and the deliberate exceptions are in [`DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md`](DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md).
**Anatomy.** [`app/shared/inline-edit`](../../app/shared/inline-edit): one pure state machine (`inline-edit-model`) · one hook (`useInlineEdit`, which owns the async submission, the superseded-reply guard and focus) · one read affordance and editing frame (`InlineEditShell`) · the shared [anchored overlay](#anchored-overlay-edit-03) for anything that floats (`~/shared/anchored`) · four typed fields — `InlineTextField` (single-line, or `multiline` for plain text whose line breaks matter), `InlineSelectField` (a WAI-ARIA menu button over a CLOSED set), `InlinePickerField` (DHDS-10 — one record out of many, over the [shared `Picker`](#floating-surfaces-dhds-09) and a server save) and `InlineDateField` (an anchored `dialog` around the DalyHub date picker — the product's presets, `CalendarGrid`, and a No date command; **not** a native `<input type="date">`, which put a browser-drawn `dd/mm/yyyy` skeleton inside a popover styled to the pixel. The shared form `DateField` keeps the native input: a long form of dates is where the platform control is still right). There is deliberately **no** inline Markdown field: long-form is editor-first (see [shared writing surface](#shared-writing-surface-edit-01)), so inline editing covers short values and closed vocabularies only.
**Behaviour.** A simple text field: activate the value, Enter saves, Escape cancels, blur saves. A multiline plain-text field: explicit **Save**/**Cancel** plus ⌘/Ctrl+Enter, blur does **not** save, and Escape cancels *only* while the draft is untouched. A select, picker or date: a compact anchored surface with the canonical keyboard pattern, Escape-to-close and focus returned to the trigger.

**Loudness at rest — `presentation` (DHDS-10).** `default` draws the value, its caret and its empty invitation: a record's own summary is a handful of facts the owner came to look at. **`meta`** is for a field in a RUN of values being scanned — a collection row, a record's context line, a card's meta line: the VALUE stays and the affordances become [DHDS-08 reveal](#motion) elements, so a fifty-row list carries no chevrons and no column of "Not set" at rest. It is the rule that keeps direct manipulation from turning a list into a spreadsheet, it is declared **once** (`inline-edit.css`, not per surface), and it never narrows the touch target below the product floor on a coarse pointer — a surface that cannot afford 44px of *ink* extends the hit area instead (the Task row's pseudo-element).

**Adoption (EDIT-02).** Every canonical record edits its title this way — Areas, Projects, Goals, Notes, People, Assets, Meetings and Tasks — and the dedicated `Rename` action, its Drawer form and its Settings-tab twin are gone from all of them. A Goal's target date and definition of done, and a Task's priority, scheduled date and due date, are edited on the record too. What deliberately did **not** move: multi-field configuration with real interdependencies (a Meeting's start/end/timezone, a Task's delegation and recurrence, a Project's Settings tab), multi-value controls (a Note's tags) and every destructive workflow.

**Adoption on a COLLECTION ROW (TASKS-05).** The same four fields now edit in place on an ordinary `/tasks` row — priority, due date, planned date and the structural Project/Area — by putting the inline field in the [Card's `metadata` slot](#shared-cards-ds-04). This is the pattern to copy when a collection's whole point is throughput, and it comes with three obligations:

- **the read state must be what the row already showed.** If adopting inline editing makes a row visually noisier, it has been adopted wrongly;
- **whatever the row can now do, the row's overflow menu must stop doing.** TASKS-05 removed nine menu entries that had become duplicates. A menu item six pixels from the control it duplicates is not a second affordance, it is a second place to keep in step;
- **one seam to the server, shared.** DS-16 wants a promise-returning `onSave` and a router fetcher is fire-and-forget, so a module needs one small adapter (Tasks: `task-inline-edit.ts`) that POSTs to its canonical routes and returns the SERVER's answer. One adapter per module, never one per surface.

A **multi-field composition** still does not belong inline. A Task's recurrence is the worked example: the unit, the interval, the weekdays and the scheduling mode only mean anything together, so they compose in the shared `TaskRecurrenceEditor` and the row shows a read-only signal instead.

**Common choice inline, complex configuration deeper (DHDS-10).** The half of that rule the recurrence example left out: the ORDINARY answers should still be one press away. A choice may end with an `escapeAction` — a `menuitem` among `menuitemradio`s, so a screen reader is never told the field is "set to Custom…" — which hands off either to the searchable picker (the set is bounded and the rest is elsewhere: "Search all Projects and Areas…") or to the real editor (the set is complete for the common case: "Custom…"). Nothing is written by the hand-off, so cancelling there leaves the value exactly as it was.
**Rules.**
- **Never silently lose an attempted edit.** A refused save keeps the editor open holding exactly what was typed, with the server's message beside it. This is the reason the module exists; it is not optional per field.
- **No optimistic application on a refusal.** Where rollback cannot be made reliable, show a subtle pending state and apply the confirmed value after success — never a value the server has not accepted.
- **The FIELD is the affordance, not a pencil.** The value is a real `<button>`; pointer hover and keyboard `:focus-visible` get the *same* restrained container, so the affordance is never hover-only. An empty value states its invitation. A **read-only** value renders as plain text with no container and no tab stop — a value that cannot be changed must not look like one that can.
- **One explicit `Edit <field>` control, for a `variant="block"` value.** Rendered block content carries its own links; nesting them in a `<button>` is invalid HTML and produces exactly the nested-interactive defect this pattern exists to remove. So `variant="block"` renders content plainly with one small, permanently visible, field-named Edit control. (No inline field uses it for Markdown any more — long-form is editor-first — but the variant and the rule stay, because the invalid-nesting problem belongs to block content generally.)
- **Server integrity is untouched.** `onSave` posts to the module's own trusted action. Authentication, workspace scoping, domain validation, relationship constraints and Activity all stay server-side; nothing here writes a column. Prefer a **focused** intent (`rename`, `set_status`, `set_target_date`) over resubmitting a whole record, so an inline edit can never overwrite a concurrent change to an unrelated field.
- **A form that keeps a field the record now edits is a bug (EDIT-02).** Once a value is editable in place, the whole-record form beside it must stop carrying that key, and its handler must treat an absent key as *unchanged* rather than filling in a default. Otherwise pressing **Save changes** silently reverts whatever was edited inline while the form was open — which is the same defect as an unfocused intent, arriving from the other direction.
- **An OPTIONAL select starts empty; it does not preselect "No …" (EDIT-02).** `options` carries real values only. An unset field renders `emptyLabel` in the shell's quiet empty style, and clearing — where the model permits it — is one command, separated by a hairline, at the END of the same menu, present only when there is something to clear. `Current value → New value` is always open-choose-done: no field may require clearing before a different value can be chosen. Selection is carried by `aria-checked` **and** the M3 selected container, never by the fill alone.
- **An anchored surface lives in the OVERLAY LAYER, never inside the field (EDIT-03).** The select menu and the date popover are portalled and placed by [`~/shared/anchored`](#anchored-overlay-edit-03). An inline field is most valuable exactly where its container clips — a list row — so a `position: absolute` popover inside it is a control that can be opened and not used. No inline surface may produce a page-level horizontal scrollbar at 320px, and no inline surface may be sized by the column it happens to sit in.
- **Below `md`, a select and a date editor are SHEETS (EDIT-03).** A 28px menu item anchored to a 28px trigger is a desktop idea, and a phone has no hover to reveal it with. `InlineSelectField` and `InlineDateField` render the shared [phone sheet](#mobile-platform-mobile-01) instead — the same primitive the compact `SelectField`, Quick Capture and the collection's sort/density choices use — with the same vocabulary, the same ordering and the same separated clear command as the desktop menu. One field, two presentations; never two controls.
- **A date editor offers the product's one-press dates, and never invents them.** `shortcuts` is supplied by the caller, from the single place that derives them (`taskDateShortcuts` → Today / Tomorrow / Next week). The owner's calendar day is a server fact ([ADR-022](../decisions/ARCHITECTURE_DECISIONS.md)); a surface that cannot name one shows the picker and the commands alone rather than a "Today" guessed from the browser clock.
- **A field that SAVES keeps its surface open until the server answers (DHDS-10).** `useInlineEdit.submit` is only legal while the field is open, so a menu or picker that closed on the click would drop the pending state and — the part that matters — the refusal, leaving the owner with a surface that shut and a change that never happened. `InlineSelectField` opts its value rows into `keepOpen`; `InlinePickerField` passes `keepOpenOnSelect`. The field closes when the server says yes and stays open with the server's message when it says no.
- **A picker opens its request, not its render (DHDS-10).** A collection of forty rows must cost zero requests until an owner opens one of them: mount the search hook inside the surface, or ask for the first page from `onOpen`. A per-row fetch on render is the performance defect this pattern is most likely to introduce.
- **Short/simple text inline; long-form on the writing surface.** A three-word description does not get a 256px editor and a formatting toolbar for syntax the column cannot hold. Use `InlineTextField` for plain values (`multiline` when the line breaks are significant, as in a Goal's definition of done); a genuinely Markdown-backed field belongs on the [shared writing surface](#shared-writing-surface-edit-01), which is where the owner writes it rather than a place they activate.

### Health signal (PROJ-02)
**Purpose.** A restrained, reusable presentation of a **derived** record health state (PROJ-02, [ADR-035](../decisions/ARCHITECTURE_DECISIONS.md#adr-035-project-health--a-derived-non-persisted-signal-over-the-spine-tasks-and-activity)) — calm, honest, explained.
**Anatomy.** A toned **pill** (`HealthIndicator`: a decorative dot + state label + optional primary reason) for the Card `metadata` slot and record header; a **`ProjectHealthPanel`** (state pill + a de-duplicated reason list + a supporting-facts `dl`) for the record Summary. Tones are a strict subset of the shared vocabulary (`neutral`/`success`/`info`/`warning`/`danger`).
**Behaviour.** Health is evaluated server-side and rendered as text — it refreshes through the normal loader revalidation, never a cached column. Stronger tones (`danger`/`warning`) are reserved for genuinely overdue or blocked work; ordinary inactivity is calm (`info`), never an aggressive red.
**Rules.** Meaning is **always** text + tone, never colour alone. Reuse the shared components — do **not** add a second project-card component or invent status vocabulary that competes with open/completed or task status. Free-text waiting subjects are never surfaced.

### Stay-in-touch signal (PEOPLE-03)
**Purpose.** A restrained, reusable presentation of a **derived** relationship state (PEOPLE-03, [ADR-056](../decisions/ARCHITECTURE_DECISIONS.md#adr-056-relationship-intelligence--a-derived-non-persisted-projection-over-links-and-the-one-activity-stream)) — calm, honest, explained, and never a nudge.
**Anatomy.** A toned **pill** (`StayInTouchIndicator`: a decorative dot + state label + optional primary reason) for the Card `metadata` slot and the Record header; a **`StayInTouchPanel`** (state pill + reason list + a cadence-facts `dl`) for the record Summary. The vocabulary is `No shared history yet` · `Recently connected` · `In touch` · `Due for follow-up` · `It’s been a while`.
**Behaviour.** Evaluated server-side and rendered as text; it refreshes through ordinary loader revalidation, never a cached column. The tone set is deliberately narrower than [Health](#health-signal-proj-02)'s — `neutral`/`success`/`info` only. There is **no `warning` and no `danger`**: a relationship is never an error state.
**Rules.** *Care, not a CRM* ([AGENTS.md §5](../../AGENTS.md#5-relationship-philosophy)): no scores, streaks, badges or percentages; a long silence is stated once, with its date, never as a failure. Meaning is **always** text + tone, never colour alone. Reuse the shared components — a collection card and a record must never grow two different pills. Do not add notifications to this pattern; it exposes the calculated state only.

### Task signals (TASKS-02)
**Purpose.** A shared, calm presentation of a task's **priority** and **urgency** on every task-bearing surface (Today, Projects, Tasks, the Drawer), kept as separable slots from the display-state pill so a card never becomes a wall of coloured badges (TASKS-02, [DEBT-27](../product/PRODUCT_DEBT.md)/[DEBT-28](../product/PRODUCT_DEBT.md)).
**Anatomy.** A `PriorityIndicator` (the short "P1"–"P4" tag + a coloured dot; the full Eisenhower action word — "Do"…"Delete / Review" — is carried for assistive tech) and an `UrgencyChip` (**Overdue** / **Due today** / **Scheduled today** / a future Due or Scheduled date — icon + word). Both live in the Card `metadata` slot; the display-state stays the Card `status` pill. Driven by the canonical `taskPriorityTag`/`taskUrgency` derivations — one vocabulary everywhere.
**Behaviour.** Priority ≠ urgency ≠ display-state — three separable slots. Colour and icon are **reinforcement only**; the tag/word always carries the meaning. Untriaged priority renders nothing in lists (opt-in "No priority" in the Drawer); no due/scheduled date renders no chip. Overdue is resolved against the owner's server-derived calendar day (ADR-022), never browser-local time.
**Rules.** Meaning is **always** text, never colour alone — "Overdue" is a word, not a red date; "due today" is distinguishable from a future due date. Use `taskDisplayState` (the single evaluator) for state — the legacy `taskDisplayStatus` was retired. Never invent a second priority/urgency vocabulary or a `TaskCard`; render these shared components in the one Card.

### Habit rhythm (HABITS-01)
**Purpose.** Show where a recurring behaviour stands **right now** and **lately**, without inventing a score, a streak or a scolding (HABITS-01, [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks)).
**Anatomy.** A `HabitRow` — a leading one-tap check control (the shared `.dh-check-circle-target`, a real checkbox, or a quiet resting dot on a day the Habit is not asked for), the title, a meta line (`schedule · Area or Goal`), and a state column carrying **today** ("Done", "Not yet", "Not scheduled") and **this week** ("2 of 3 this week"). A `HabitHistoryStrip` for the record: a real `<table>` of the recent window with row and column headers, one cell per day, each cell carrying a hidden sentence ("Tuesday 11 August — completed"), plus a printed key.
**Behaviour.** Three measurements only — *today*, *this week*, *recent consistency* ("9 of 12 weeks") — every one of them a fraction of what the schedule **actually asked for** on the days it asked. A day the Habit is not scheduled is never a miss; a day still in the future is never incomplete; a week the owner had not yet started the Habit is not in the denominator. Check-in is idempotent and reversible, and the row's state re-reads from the server after the mutation rather than trusting the tap.
**Rules.** **No manufactured streaks**: no flame, no consecutive-day count, no broken-streak warning, no confetti, no loss-aversion language, no "you failed". Restraint is the point — a Habit is a row, not a dashboard card, and it never grows a progress ring. The history strip is a **calendar the owner can read**, not a contribution graph: it stays a table, every cell has a textual equivalent, and colour never carries the meaning alone. A Habit measurement never contributes to Task counts, Project progress or a Goal's percentage.

### Timeline
**Purpose.** Show an entity's history in chronological order — the "what happened, when" of any record.
**Anatomy.** A vertical, time-ordered stream of events rendered from the [shared Activity model](../../AGENTS.md#96-shared-activity-model).
**Behaviour.** Grouped by day; virtualised for length; filterable by event type. Events link to the entities they reference.
**Rules.** Timeline renders the *shared Activity model* — it never invents its own event source. Same event → same rendering everywhere.

### Activity Feed
**Purpose.** The cross-entity, system-wide stream — "what's been happening across everything," versus the [Timeline](#timeline)'s single-record view.
**Anatomy.** Same event rendering as Timeline, aggregated across a workspace or a scope (a Project's activity, the whole workspace's activity).
**Behaviour.** Filterable, groupable, virtualised. Respects [workspace isolation](../../AGENTS.md#94-workspace-isolation).
**Rules.** Timeline (one record) and Activity Feed (many records) are the same component at different scopes — do not fork them.

### Inspector
**Purpose.** Edit the full detail of a record or a selection — the "properties panel" for power editing. Built as DS-10 ([`app/shared/inspector`](../../app/shared/inspector)); see [Global Interaction Layer](#global-interaction-layer-ds-10).
**Anatomy.** A structured panel of all editable fields, grouped, using shared [Form](#forms) controls. URL-driven (`?inspector=<key>`, deep-linkable); a surface supplies `renderInspector(entry)` — the [Drawer](#drawer)'s `renderDrawer` contract — so **no module builds its own edit drawer**.
**Behaviour.** A **non-modal, resizable** right-side panel on desktop (content reflows so it is never covered; the page stays interactive for bulk/multi-select) and a **modal sheet** on mobile, reusing the DS-03 focus/inert/scroll-lock hooks (no second focus-trap). Saves optimistically field-by-field via DS-06 autosave.
**Rules.** The Inspector is for *depth*; the [Summary Panel](#summary-panel) is for *essentials*. Never duplicate field controls between them — share the control. See [ADR-025](../decisions/ARCHITECTURE_DECISIONS.md#adr-025-the-global-interaction-layer--feedback-platform-notifications-undo-background-operations-and-the-shared-inspector).

### Settings
**Purpose.** A consistent surface for configuration, at every scope (app, workspace, module, single record).
**Anatomy.** Grouped sections · label + description + control per setting · immediate or explicitly-saved changes with clear feedback.
**Behaviour.** Same layout whether you're configuring the app or one Project. Dangerous settings are visually separated and confirmed.
**Rules.** Settings is always the last [Tab](#tabs)/section. Same setting type → same control. No bespoke settings screens.
**Realised by** the [Settings layout (DS-10b)](#settings-layout-ds-10b) — the single, entity-agnostic implementation.

### Filters
**Purpose.** Narrow any collection (tasks, cards, activity) using a consistent control.
**Anatomy.** A filter bar: add-filter control · active filter chips · clear-all · optional saved views.
**Behaviour.** Filters compose (AND/OR where meaningful), reflect in the URL (shareable/restorable), and persist as saved views. Filtering is instant.
**Rules.** **One filter system** across the product — Today, Projects, Search, and every list use it. Inconsistent per-module filters are known [debt](../product/PRODUCT_DEBT.md).

### Search
**Purpose.** Find anything, from anywhere, fast.
**Anatomy.** A unified search surface ([`app/shared/search`](../../app/shared/search)) — a WAI-ARIA combobox controlling a grouped `listbox`, with entity icon/accent, title, safe subtitle/preview, optional compact signals, `<mark>` highlighting, a result count, and idle/loading/empty/partial/error+retry states. Empty-query Search may show a device-local **Recent** group (max eight, clearable, privacy-stripped). Opened by the PX-02 sidebar Search affordance and the `/` shortcut; mounted once at the app-shell boundary and lazy-loaded.
**Behaviour.** Fuzzy, incremental, keyboard-navigable (↑/↓ wrap, Home/End, Enter, Escape). Scoped by [workspace](../../AGENTS.md#94-workspace-isolation) server-side. Results **group primarily by entity type** (module fallback otherwise) and **open in the [Drawer](#drawer)** over their home surface, preserving unrelated URL state. Incremental search debounces and **immediately** invalidates the in-flight request when the query changes (a generation guard, so a stale response can never overwrite newer input); each provider runs under a bounded deadline with a cancellation signal, so a hung provider never stalls healthy results; a partial provider failure still shows healthy results; a total failure is a calm retryable state; and the browser validates the endpoint's response before rendering it. Local matches return under the [performance budget](../../AGENTS.md#16-performance-expectations).
**Contract.** A module contributes a **search provider** through the [module registry](../../AGENTS.md#92-module-registry) (`ModuleRegistry.listSearchProviders()`) — search is never re-implemented per module. A result declares **how it opens** via a validated `SearchResultTarget` (`{ kind: "drawer"; drawerKey; canonicalPath? } | { kind: "route"; to }`), so the shared surface never parses product routes or ids and unsafe targets are rejected at the boundary. Optional `signals` are generic serialisable facts (no React nodes); the surface may render known signals through existing shared presentation, e.g. Task priority via `PriorityIndicator` and urgency via `UrgencyChip`. Ranking is deterministic and tiered (exact → prefix → token → subtitle → fuzzy; provider score only as a normalised tie-breaker). Highlighting uses text segments + `<mark>` — never raw HTML. Search is **not** the [Command Palette](#command-palette) (DS-09): it runs no commands, never claims `⌘K`, and stores no remote search history. See [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation) and [`SHARED_SEARCH.md`](../development/SHARED_SEARCH.md).

### Command Palette
**Purpose.** The keyboard shell of the OS — do anything by typing (`⌘K` / `Ctrl+K`).
**Anatomy.** A modal command surface ([`app/shared/commands`](../../app/shared/commands)) — a WAI-ARIA combobox controlling a grouped `listbox` that merges, without confusing them, contextual actions, registered navigation/executable commands and DS-08 record [Search](#search) results, with title `<mark>` highlighting, right-aligned shortcut hints (decorative), a live status region, and idle / pending / inline-success / inline-failure+retry / empty / catalogue-error states. Opened by the PX-02 sidebar Command Palette affordance and the global `Mod+K`; mounted once at the app-shell boundary and lazy-loaded; reuses the DS-03 focus/inert/scroll-lock hooks (no second focus-trap) and sits above the Drawer.
**Behaviour.** Context-aware (contextual actions from the current surface/Drawer rank first; a command on the current module ranks higher), fully keyboard-driven (↑/↓ wrap, Home/End, Enter, Escape), fuzzy-matched, with a restrained suggested/recent set on an empty query (recents are session-only, never persisted). Search and the palette are mutually exclusive.
**Contract.** A module contributes a **command** through the [module registry](../../AGENTS.md#92-module-registry): a `navigate` command (a declarative, validated target) or an `execute` command (a server handler). Navigation runs on the client; an executable command runs once through the authenticated `POST /commands/:commandId` boundary and returns a typed, safe outcome — the browser receives serialisable metadata only, never a handler. Modules register commands from day one; they may add but never reassign the reserved keyboard vocabulary (`Mod+K`, `/`, …). See [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action) and [`COMMAND_PALETTE.md`](../development/COMMAND_PALETTE.md). This is the backbone of the [keyboard-first](../../AGENTS.md#7-interaction-philosophy) product.

### Keyboard reference (UX-01)
**Purpose.** One answer to "what can I press here?", reachable from the keyboard on every screen.
**Anatomy.** ONE catalogue ([`app/shared/commands/shortcut-reference.ts`](../../app/shared/commands/shortcut-reference.ts)) rendered by ONE component (`KeyboardShortcutsReference`) — grouped `<kbd>` keys beside a text description, so no meaning is carried by an unlabelled glyph or by colour. Each group declares its `scope` (`global` or a surface), so a host presents only what genuinely applies where the owner is.
**Behaviour.** `?` opens it anywhere. The app shell registers that binding through the SAME one shared dispatcher as a **fallback** — a new lowest-precedence tier appended after contextual and registered bindings — so a surface that hosts its own reference keeps ownership of the key. Today does: there the reference belongs inside the Drawer *stack*, which is what makes a task drawer beneath it stop owning the task shortcuts. Everywhere else the shell opens it in the shared [Sheet](#shared-drawer-ds-03). Like every ordinary character shortcut it is suppressed while the owner is typing.
**Rules.** Never write a second copy of the shortcut list, and never state a shortcut in the reference that does not work where the reference is being shown. A **read-only** Sheet must set `bodyFocusable` so its scroll container is keyboard-reachable (WCAG 2.1.1) — sheets with focusable content do not need it.

### Quick Actions
**Purpose.** The two or three most frequent actions on an entity, available without opening it.
**Anatomy.** Inline affordances on [Cards](#cards) and [Record Headers](#record-header) (complete, reschedule, link, assign) plus contextual keyboard shortcuts, projected from ONE shared `AppAction` ([`app/shared/commands/action.ts`](../../app/shared/commands/action.ts)) so the same action instance appears as a Card action, a Record Header action, a Command Palette command and a keyboard action.
**Behaviour.** Optimistic and reversible (prefer [undo](#success-feedback) over confirm dialogs). One identity, one execution path: pointer and keyboard call the same handler; pending blocks a duplicate activation; disabled and unavailable stay distinct; every action has a text-based accessible name.
**Contract.** A curated few live on the surface; the long tail lives in the [Command Palette](#command-palette). Persistent mutations still go through an authorised server action — the client context is never treated as authority. See [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action).

### Overflow menu
**Purpose.** The conventional, single home for a record's **secondary and destructive** actions, so "where do I archive or delete this?" has one answer everywhere.
**Anatomy.** A ⋯ menu button on the [Record Header](#record-header) (always last in the action row) and on the [Card](#cards) (in its action group), opening one list of labelled items with optional leading glyphs, a decorative group separator, and a `danger` tone for destructive items.
**Behaviour.** A WAI-ARIA menu button, not a modal: `aria-haspopup="menu"` + `aria-expanded`, arrow/Home/End navigation with roving focus, Escape closing only the menu and restoring focus, Tab and outside-pointer dismissal. A blocked action stays **visible and disabled with an explanation** rather than disappearing.
**Rules.** Exactly one primary action stays in the header; everything else belongs here or in the [Command Palette](#command-palette). Meaning is always the item's wording — tone and glyph are reinforcement. Never build a second menu.
**Order.** module actions · move/organise · duplicate/share · Archive **or** Restore · Delete. Separators sparingly; Delete is distinguished by its label's colour, never by a filled red row.
**Realised by** the [Shared overflow menu (DS-12)](#shared-overflow-menu-ds-12), which since DHDS-09 is a TRIGGER over the shared [`Menu`](#floating-surfaces-dhds-09) — one WAI-ARIA menu-button implementation in the product, portalled so nothing can clip it.

### Tooltip (M3-TIP)
**Purpose.** ONE way to explain a control whose meaning is carried by a glyph — and, where the control has one, to show its keyboard shortcut to the person most likely to want it.
**Anatomy.** [`app/shared/tooltip`](../../app/shared/tooltip): a `Tooltip` render-prop component (no wrapper element — it attaches to the trigger by ref, so adopting it changes no layout) rendering a portalled `role="tooltip"` with the supporting text and an optional `<kbd>` shortcut chip, formatted by the ONE shared shortcut formatter (`~/shared/commands/shortcut`).
**Behaviour.** Opens on pointer hover after a short intent delay and on `:focus-visible`; closes on pointer leave, blur, pointer press and Escape. Associated with its trigger by `aria-describedby` while shown. Never focusable, never a Tab stop, never a focus trap, `pointer-events: none` so it cannot intercept a click. Positioned `fixed` from the trigger's measured rect, flipped and clamped to the viewport so an edge control never produces horizontal overflow. Motion honours `prefers-reduced-motion`; forced colours get a real border rather than the fill.
**Rules.**
- **A tooltip describes; it never NAMES.** Every adopter keeps its own `aria-label` or visually-hidden text. A description is not announced by every assistive technology, so a control named only by its tooltip is a control with no name.
- **It replaces `title` on controls that need explaining, and only those.** A control with visible text does not get a tooltip to raise a migration count; `title` remains legitimate for genuinely supplementary detail beside a labelled control.
- **It does not open on a touch tap.** Touch has no hover state, and a tooltip over the surface a tap just opened is in the way.
- **Escape yields to the layer above it.** Propagation is stopped only when the trigger itself holds focus, so a stale hover tooltip can never swallow the Escape that closes a Drawer.
**Adopted by** the [shared writing surface](#shared-writing-surface-edit-01)'s toolbar (the reference adoption), the [overflow menu](#overflow-menu)'s ⋯ trigger, the shell's top-bar icon controls, the account menu's compact trigger, the phone bar's Back/Search, the capture FAB and icon-only [card](#cards) actions. Deliberately **not** the account menu's full trigger, which already shows the name in text.
**Not** the [Hover Card](#linked-items--hover-card) — that is a rich, asynchronously loaded summary of a linked record, and it stays its own component.

### Anchored overlay (EDIT-03)
**Purpose.** ONE way to float a surface beside the control that opened it — a menu, a listbox, a small popover — so that no parent's layout can decide whether the owner gets to see their choices.
**Anatomy.** [`app/shared/anchored`](../../app/shared/anchored): `AnchoredSurface` (a portal onto `<body>` holding one `position: fixed` box, measured from the trigger) and `anchored-placement` (the pure geometry — block side, height clamp and inline slide — with no React and no DOM in it).
**Behaviour.** Prefers the space below the trigger; flips above when that side cannot hold the surface whole; clamps its height and scrolls internally when neither side can; slides along the inline axis to stay inside an 8px viewport margin; re-measures on scroll and resize. It carries **no** role, no ARIA and no keyboard handling — a menu, a listbox and a dialog need different ones and the host supplies them. What it does own is dismissal on an outside pointer press, where "inside" correctly includes the trigger.
**Rules.**
- **A surface that must escape its parents belongs in the overlay layer, not in the row.** `position: absolute` is still clipped by an ancestor's `overflow`, and `position: fixed` is still trapped by an ancestor's `transform`. A DalyHub task row has both — it hides its overflow so the swipe tray can slide underneath, and the swipe surface is translated — and both are load-bearing. This is the whole reason the layer exists: the inline editors were painting a 45px sliver of a 305px menu, showing the owner the value they already had and none of the alternatives.
- **It sits ABOVE the modal rung** (`--dh-layer-anchored`, 1350). These surfaces are opened from inside other layers — the Task record Drawer edits its priority with one — so a dropdown-rung popover portalled to `<body>` would render behind the surface that opened it. Toasts and tooltips still outrank it.
- **Hidden-until-placed is `opacity`, never `visibility`.** A `visibility: hidden` subtree is not focusable, and a menu moves focus onto its current item in the effect after the commit the guard applies in — so the paint guard silently turned a keyboard-complete control into a mouse-only one.
- **Below `md`, prefer the [phone sheet](#mobile-platform-mobile-01).** A 28px menu item anchored to a 28px trigger is a desktop idea. The layer will happily place one on a phone; that does not make it the right presentation.
**Adopted by** every floating surface in the product. DHDS-09 retired the last exception: the DS-12 [overflow menu](#overflow-menu) had kept its own absolute anchoring and its own copy of the block geometry, which is why a card had to be un-clipped *and* raised to the dropdown layer for as long as one of its menus was open. Both workarounds are gone with it.
**Appearance is NOT here.** This layer answers "where does the box go and when does it go away"; what the box looks like is [Floating surfaces (DHDS-09)](#floating-surfaces-dhds-09).

### Floating surfaces (DHDS-09)
**Purpose.** ONE answer to "what kind of thing floats above the canvas here, and what does it look like" — so that a menu, a popover, a picker, a sheet and a dialog are recognisably the same product without being the same interaction.
**Anatomy.** [`app/shared/floating`](../../app/shared/floating): `Menu`, `Popover`, `Picker`, `OptionContent` and the shared typeahead, over [`app/styles/floating.css`](../../app/styles/floating.css) — `.dh-floating` (the surface, in two rungs) and `.dh-option` (the row). Placement is the [anchored overlay](#anchored-overlay-edit-03); motion is [DHDS-08](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md); layering is the `--dh-layer-*` vocabulary.

**The taxonomy.** Six surfaces, separated by BEHAVIOUR rather than by size:

| Surface | It exists to… | Semantics |
|---|---|---|
| **Tooltip** | explain an unlabelled control, in a few words | `role="tooltip"` |
| **Menu** | choose a COMMAND from a small closed set | `role="menu"` / `menuitem` · `menuitemradio` |
| **Popover** | make a short contextual choice that is not a list | non-modal `role="dialog"` |
| **Picker** | choose a VALUE from a potentially large set | `dialog` holding `combobox` + `listbox` |
| **Sheet** | be all of the above, on a phone | modal `role="dialog"` |
| **Inspector / Drawer** | inspect or edit a record without losing the collection | modal `role="dialog"` |
| **Dialog** | INTERRUPT, when interruption is justified | modal `role="dialog"` |

**Rules.**
- **A tooltip contains no workflow** — no buttons, no forms, no destructive actions — and it is never an accessible name.
- **A menu is command-oriented.** It is not a mini settings panel, and anything needing a search field is a [Picker](#floating-surfaces-dhds-09), not a menu.
- **An Inspector is not the mechanism for changing one piece of metadata.** Reaching for it to set a priority is the friction DHDS-09 removed.
- **A dialog interrupts.** Reserved for destructive confirmation, an irreversible operation, a conflict, or a decision needing explicit commitment. Ordinary metadata editing never opens one.
- **One appearance, two rungs.** `.dh-floating` is a hairline, a raised surface tone and the overlay shadow; `.dh-floating--modal` steps up one radius rung and one elevation rung because a centred surface has no trigger beside it saying where it came from. No glow, no glass, no backdrop blur, no third rung — asserted by test.
- **One option row.** `[mark] Label / supporting label … shortcut ✓`, with hover, focused, keyboard-active, selected, disabled and destructive states. SELECTED takes a different container from hover, because when both were `--surface-muted` the current choice was indistinguishable from the one under the pointer. It is a row, never a pill.
- **`presentation="auto"` is the whole of the phone adaptation.** The SAME items, order, ids, roles and keyboard behaviour, in the shared bottom [sheet](#mobile-platform-mobile-01) below `md`. Only the container changes, and a domain action is never implemented twice.
- **Name a layer, never a number.** `--dh-layer-sticky` · `-scrim` · `-drawer` · `-modal` · `-anchored` · `-toast` · `-tooltip`.
- **Dismissal is uniform.** A menu closes after a command; a single-choice picker after a choice; a multi-select on explicit completion. Escape closes the topmost layer and stops there. An outside press does not pull focus back; Escape and a committed choice do.
- **No floating surface pushes a history entry.** A priority picker is not navigation.
- **Contextual editing uses the CANONICAL mutation**, or none at all. A capture surface's controls report a value; the host's own submit creates the record.
**Domain adapters.** `TASK_PRIORITY_OPTIONS` (the one priority vocabulary), `DateChoice` (presets, month grid, commands), `SortMenu`, and `TaskMetaControls` (a Task's date, priority and parent over a value rather than a save).
**Realised by** the [overflow menu](#overflow-menu), [inline editing](#inline-editing-ds-16), the [forms](#forms) select and entity-link pickers, [filters](#filters), the collection controls, the saved-view switcher, Quick Capture and the three collection sorts.

### Record lifecycle
**Purpose.** One vocabulary and one interaction for Archive / Restore / Delete, on every entity.
**Anatomy.** Lifecycle items in the Record Header [overflow](#overflow-menu), in a fixed order (module actions · Archive **or** Restore · Delete), plus — where a module has more to explain — the same actions in its final **Settings** tab.
**Behaviour.** Friction scales with reversibility: a reversible soft-delete is one click with an [Undo](#success-feedback) toast and a durable "Deleted" collection view; an irreversible permanent delete requires a typed confirmation of the record's exact name. A blocked delete explains its precondition and offers no bypass. Nothing ever cascades.
**Rules.** Labels are **derived**, never written per module. Settings-tab controls may exist, but must never be the *only* entry point.
**Realised by** the [Shared record lifecycle (PX-04)](#shared-record-lifecycle-px-04).

### Forms
**Purpose.** Create and edit entities consistently and forgivingly.
**Anatomy.** Shared field controls (text, markdown, date, select, entity-link picker, tags) · inline labels + help · inline validation · clear submit/cancel.
**Behaviour.** Validate on blur and submit with specific, recoverable messages. Autosave where it fits; explicit save where commitment matters. Never lose entered data on error or navigation.
**Boolean controls — checkbox or switch, chosen by MEANING.** A **switch** ([`~/shared/forms/Switch`](../../app/shared/forms/Switch.tsx)) turns a setting on or off and takes effect immediately; a **checkbox** selects an item within a set, and a set of them is usually committed by a Save or acted on by a bulk action. DalyHub's preference toggles are switches; its selection, bulk-action, acknowledgement and multi-select controls are checkboxes and stay checkboxes. There is ONE switch: it is a real `<input type="checkbox">` with `role="switch"` on top — never a `div` with `aria-checked`, which re-implements (badly) the checked state, Space, the label association, form participation, `:disabled` and forced colours. Its state is never colour alone: the thumb moves *and* the selected thumb carries a check.

**Rules.** **One control per field type**, product-wide. The entity-link picker is the shared way to create [EntityLinks](../../AGENTS.md#95-entitylinks). Multiple save patterns are known [debt](../product/PRODUCT_DEBT.md) — converge on this.

**Selection controls (DS-16).** Four rules, audited product-wide in [`SELECTION_CONTROL_AUDIT_2026_08.md`](../product/SELECTION_CONTROL_AUDIT_2026_08.md):
- **An optional field defaults to genuinely empty** — the empty string, rendering as the placeholder and submitting as absent. Never a pre-selected first option, never a sentinel.
- **A placeholder is an attribute, never an option.** `{ value: "", label: "Choose a type…" }` in an options list is arrowable, announced as an option, and "selects" a non-value that validation then has to reject. `SelectField` renders a real `placeholder`; put the prompt there, where it cannot be picked.
- **An existing selection is replaceable directly.** A single-select reflects its chosen label into the input; that text is a *reflection*, not a query, until the user actually types. Reopening a field that has a value offers the WHOLE list — requiring a clear first is a step no user discovers.
- **One select presentation, product-wide.** Every application-style select — a Settings row, a record's Settings tab, a create form — is the shared `SelectField` combobox. A **native `<select>` is retained only in FILTER BARS** (Notes, Diary, Reviews, Assets, Tasks), which is a deliberate exception with a real reason: a filter row is a dense strip of several controls that must stay operable on a phone with no JavaScript, and the native control is more robust and better on mobile there. That is the whole list of exceptions; anywhere else, a native select in an application surface is the divergence the August 2026 audit recorded as finding 6.
- **One control, two presentations (ASSET-03).** A single-select with a long vocabulary may opt in to `SelectField sheetOnCompact`: below `md` the field renders a 44px trigger that opens the shared [phone `Sheet`](#the-shared-sheet) of large option rows, and above it stays the combobox. This is not a second select — same value, options, label, help, error and `controlRef` — and it is **opt-in**, so a field that is fine as a combobox on a phone stays exactly as it is. Reach for it when an anchored 16rem listbox under an open keyboard is the wrong way to ask the question (the Asset type's thirteen categories are the first case). An option's `group` is PRESENTATION: it draws headings in that sheet, and is never stored, submitted or validated.
- **The error summary is a POST-SUBMIT affordance.** `FormErrorSummary` names everything that went wrong and jumps to it; it belongs after a failed submit, not after the first blur of a field the owner never touched. Rendering it on blur inserts a block ABOVE the fields, which on a phone slides the control being tapped out from under the thumb between finger-down and finger-up. Gate it on `form.submit.status === "error"`; the field's own inline error still appears on blur, beside the field, where it moves nothing being aimed at. The New Asset form does this today and other forms have yet to converge.
- **A short, familiar, multiple-choice set is a TOGGLE GROUP, not a multi-select (HABITS-01).** [`ToggleGroupField`](../../app/shared/forms/ToggleGroupField.tsx) renders a labelled `role="group"` of real `<input type="checkbox">` controls styled as wrapping pill toggles — the whole vocabulary visible, no tap to open, no list to scroll, and it wraps rather than scrolls on a phone. Reach for it when the set is **small and already known** (the seven days of the week are the first case); reach for `SelectField multiple` when it is long or unfamiliar. Every toggle is a genuine checkbox, so Space, the label association, form participation, `:disabled` and forced colours all come from the platform — never a `div` with `aria-pressed`. Each toggle carries an `accessibleLabel` so an abbreviated face ("Mon") is announced in full ("Monday"), the target floor is 44px on a coarse pointer, and selection is a border + tone + the checkbox's own state, never colour alone. **Do not hand-build a row of small letter circles** — that is the pattern this control exists to prevent.
- **"None" that is a domain STATE keeps its own words.** "No priority", "No sector", "Does not repeat" and "Not set" are decisions the system reasons about, not absences. They stay in the list, and they are never relabelled to a prompt or collapsed into the placeholder. The audit lists every one.

### Success Feedback
**Purpose.** Confirm an action landed, quietly. Built as the DS-10 [Feedback platform](#global-interaction-layer-ds-10) ([`app/shared/feedback`](../../app/shared/feedback)) — modules call `useFeedback().notifySuccess(...)`/`notifyUndo(...)`, never render a toast themselves.
**Anatomy.** A brief toast/inline confirmation, ideally carrying an **Undo**.
**Behaviour.** Non-blocking, auto-dismissing (success/info linger briefly, warnings longer, errors are sticky), coalescing (repeats with a `dedupeKey` merge — no spam), pause on focus or on hovering a toast's controls, announced to assistive tech via ARIA live regions. Optimistic — the UI already reflects the change; the toast confirms and offers reversal. **Non-blocking is literal:** the notification region is transparent to the pointer everywhere except its own controls, so a toast can never absorb a click meant for the page beneath it (see [Feedback](#feedback-platform)).
**Rules.** Prefer undo over up-front confirmation. Don't celebrate the mundane — feedback is calm, not confetti (see [product feelings](../product/PRODUCT_PRINCIPLES.md#how-users-should-feel)). One implementation for the whole app; no module owns a notification implementation.

### Error Feedback
**Purpose.** Explain what went wrong and how to recover — never dead-end the user.
**Anatomy.** Inline (field-level) for validation; toast/banner for operation failures; a full-page state only for whole-view failures — always with a retry/next step.
**Behaviour.** Specific and human ("Couldn't save — you're offline. We'll retry."), never a raw code. Preserves the user's input. Announced to assistive tech.
**Rules.** Every error names a recovery. No silent failures; no blame; no jargon.

### Loading
**Purpose.** Communicate progress without blocking or flashing.
**Anatomy.** Skeletons that mirror the final layout for content; inline spinners only for small in-place waits; optimistic UI for user-initiated changes.
**Behaviour.** Content streams in progressively (see [performance](../../AGENTS.md#16-performance-expectations)). Avoid layout shift; avoid spinner-blocked blank screens.
**Rules.** Prefer skeletons over spinners; prefer optimistic over loading. Never block the whole screen for partial data.

### Collection pagination (UX-01)
**Purpose.** Reach the rest of a collection without losing your place.
**Anatomy.** ONE hook ([`useKeysetPagination`](../../app/shared/load-more/useKeysetPagination.ts)) plus the shared `LoadMore` button. A collection supplies its first page, its cursor, the path the next page is fetched from, and how to read the page out of that route's loader data.
**Behaviour.** Pages **accumulate in place** — never a navigation that replaces the list, and never automatic infinite scroll as the only path. A record straddling a page boundary appears once. A scope change (filter, view, lifecycle segment) restarts the accumulation, and **a page is consumed only if it was asked for since the current scope began**, so a revalidated response from a scope the owner has left can never be appended on top of a fresh first page. A failed page is a retryable state that does **not** advance the cursor.
**Rules.** Never write a second paginator. The path a later page is requested from must carry the same scope the cursor was issued for. The label says what the control does: a control that navigates is not a "Load more".

### Empty States
**Purpose.** Turn "nothing here yet" into "here's the next action."
**Anatomy.** A short, warm explanation of what belongs here · the primary action to create the first one · optional example/illustration.
**Behaviour.** Distinguishes *empty* (no data yet — teach + invite) from *filtered-empty* (no matches — offer to clear filters). Contextual to the module.
**Rules.** No dead-end empty states. Every one teaches the next step (see [UX philosophy](../../AGENTS.md#6-ux-philosophy)).

### Two-column working surface (Today)

**Purpose.** Put the thing the owner acts on beside the thing they need to know about, without either becoming a widget system.
**Anatomy.** Two containers — a PRIMARY column carrying the work (~62%) and a RAIL carrying what needs attention (~360px at 1440) — each ONE tonal surface holding plain rows. No cards inside them, no nesting, no per-widget chrome.
**Behaviour.** The columns are a container-query grid, so they respond to the PANE's width rather than the viewport's. Below the threshold the rail stacks under the primary column in DOM order, so the narrow layout is the wide one unwrapped rather than a second arrangement to keep in step. A section with nothing to show renders nothing at all — never an empty container holding a gap open.
**Rules.** The rail holds only what the primary column does NOT show; anything appearing in both is one fact painted twice. There is no personalisation, no reordering and no hide/show — an arrangement the owner has to maintain is a second product to keep coherent. This pattern replaced the POLISH-02 hero/primary/secondary REGION model and its fourteen-widget catalogue, together with the at-a-glance stat rail those regions carried: a fixed track of six tiles is a good component and was the wrong answer, because on an ordinary day four of the six read `0`. See [The Today screen](#the-today-screen).

### Bounded section preview (POLISH-02)
**Purpose.** Let a landing surface show a band of a large collection without becoming that collection.
**Anatomy.** A section heading carrying the **true** total, a bounded slice of rows, and one "View all *N*" link in the heading row pointing at the same records in their canonical collection view.
**Behaviour.** Only *discretionary* bands are previewed. Anything the owner has committed to — today's tasks, overdue work — is never truncated *below a bound generous enough that an ordinary day never meets it*: a commitment you can only see by following a link is one the product has hidden, but a dashboard that draws fifty rows has stopped being a dashboard. Today is the one surface that carries such a bound, and it states both halves — 3 overdue rows plus "+n more overdue", and 8 of the day's own rows plus "View all N tasks for today", where N is the true size of the view the link goes to. Any keyboard/roving model over the section is built from the **rendered** slice, so an arrow key can never travel to a row that is not on the page.
**Rules.** The heading count is the total, not the slice. The link goes in the heading row, not after the rows — inside a roving collection a control placed after the last card sits between the owner and the exit from a long list. Never truncate silently.

### Guided step flow (REVIEW-02)

An ordered, resumable pass over ONE record: a canonical step registry, the step in the URL, a desktop rail, a phone stepper, and progress stated as a position. See [Guided step flow](#guided-step-flow-review-02--review-04).

---

## Shared Record Layout (DS-02)

The [Record Header](#record-header), [Summary Panel](#summary-panel) and [Tabs](#tabs) patterns above are realised by ONE reusable, entity-agnostic scaffold: the **Shared Record Layout** ([DS-02](../roadmap/ROADMAP_V2.md#-ds-02--shared-record-layout-header--summary--tabs)), in [`app/shared/record-layout`](../../app/shared/record-layout). Every record view (Area, Goal, Project, Task, Person, Note, …) composes it — there are no bespoke record scaffolds. It builds entirely on [DS-01 tokens](#design-tokens-ds-01); it owns structure and accessibility, not values.

### Anatomy

**This is the canonical record-screen anatomy (RECORD-01, PR #131).** Every
first-class record — Area, Goal, Project, Note, Meeting, Person, Asset, Review
and the Task record in its Drawer — is built to it. Module-specific *content*
stays module-specific; the order, the tiers and the weights do not.

```
<article aria-labelledby=title>          ← labelled landmark, titled by its heading
  RecordHeader
    ├ breadcrumb            where this record lives
    ├ identity (ONE row)    entity glyph · title · status pill · actions · ⋯
    └ context line          1–3 current-state facts, tight under the identity
  RecordSummaryBar   (optional)  ← the compact derived-state band: meter · state
  · signals · facts                 chip · signal line · quiet context line
  — or —
  RecordSummary      (optional)  ← the DS-02 card, for a summary that is PROSE
  RecordTabs         (optional)  ← tablist + panels; the active panel IS the content
    └ RecordContent            ← predictable padding/width + loading/empty/error
```

A record declares **one** summary region. `summaryBar` is what most records
want, because most records' summaries are derived state; `summary` is the card,
for the minority carrying real prose. Supplying both renders the band — two
summary regions above one tab strip is the stacked-containers problem M3-INT set
out to remove. A band that itself carries prose (`description`) takes the card
surface, following the same "a container is earned" rule.

When no tabs are supplied, the content region is the layout's `children` wrapped in a padded container. `RecordContent` is independently reusable and can appear inside any tab panel.

### The record contract

**Headers.** Title dominant, status adjacent, no empty band between the title
and the tabs. Drop the entity-type label wherever the breadcrumb already carries
it; keep a genuinely informative **subtype** (an Asset's "Vehicle"), which
renders as the first entry of the context line. The entity glyph stays on every
record and keeps its `record-type__icon` hook, which is where a record's chosen
identity colour lives.

**Metadata tiers.** A fact appears in exactly one of them:

| Tier | Where | Example |
| --- | --- | --- |
| Current state | context line / summary band | health, next obligation, progress, target date |
| Secondary context | context line, quiet | Area, Goal, organisation and role |
| Administrative | **Settings → Record details** | Created, Updated, raw State, template ids |

Nothing is deleted — demoted metadata lands in a `RecordDetails` list inside the
record's Settings tab. A record with no Settings tab puts it later in the record
(the Goal's is the band's trailing `facts` line); adding a Settings tab purely
to host timestamps is an information-architecture change, not a layout one.

**Working content — the fold anchor.** At **1280×800**, with the header and tabs
rendered, the first row of a record's working content is visible without
scrolling. Notes show the editor with at least three lines; Meetings keep
meeting content readable with the capture strip present. Guarded by
[`e2e/record-anatomy.spec.ts`](../../e2e/record-anatomy.spec.ts).

**Surfaces.** The tab panel is one surface. Sections inside it separate with
spacing and typography, not a second outline. A tab whose content already brings
its own single surface declares `surface: "plain"` so the record never draws a
frame inside a frame — the Note's writing surface is the case this exists for.

**Tabs and filters.** Tabs are `RecordTabs` everywhere: one typography, one
indicator, one focus behaviour, and no wrapping at laptop widths. Filters are
**visually subordinate** — `~/shared/segmented-filter` renders the shared
segmented control at a reduced weight for exactly this reason. Tab = *where am
I*; filter = *which subset*; the louder control answers the bigger question.

**Empty states.** A record-level absence is `EmptyState size="inline"`: one calm
line, left-aligned, no icon and no card. The icon + headline + description +
button treatment is the **collection** state, where it teaches a first-time
owner something they do not know.

**Actions.** Ending a record (Complete, Archive) is a lifecycle action, not the
surface's most likely next step, so it takes the low-emphasis treatment. A
control is rendered only where the data behind it exists — a disabled "Call" on
a person with no number is a control that can never do anything, and belongs
absent rather than greyed out.

**Local creation vs the global +.** A local create action survives only where
context materially matters *and* it beats the global +. Contextual defaults are
implemented only where they amount to passing an existing route param or prop
through the existing capture architecture; anything needing more is skipped and
recorded in [PRODUCT_DEBT](../product/PRODUCT_DEBT.md). Never two mechanisms for
one outcome.

**The shared tab toolbar.** `.dh-record-toolbar` is the row at the top of a tab
panel: the subordinate filter on the leading edge, the tab's own local action
(and its overflow) on the trailing edge. One class, so a record's toolbar sits
at the same height and the same edges whichever record it is.

### Supported configuration

- **Header:** `title` (required) · `titleId`/`headingLevel` · `typeLabel` · `icon` · `status {label, tone}` · `breadcrumb[]` · `metadata[]` · `primaryAction` · `secondaryActions[]`. Every region is optional except the title and is omitted entirely when absent.
- **Actions** (`RecordAction`): `label` (also the accessible name unless `ariaLabel` overrides) · `href` (renders a link) or `onSelect` (renders a button) · `variant` (`primary`/`secondary`) · `disabled`.
- **Summary band** (`RecordSummaryBarProps`): `description` (prose; earns the card surface) · `progress` · `state` · `signals[]` · `facts[]` · `note` · `label`. Hard budget: one meter, one state chip, one signal line, one context line — anything more belongs in a tab.
- **Summary card** (`RecordSummaryProps`): `description` · `metadata[]` · `emptyLabel`. Requested-but-empty shows a calm empty state.
- **Record details** (`RecordDetails`): the Settings-tab home for demoted administrative metadata. `recordTimestampItems(createdAt, updatedAt)` formats the pair every record has, and omits an absent one rather than rendering an em dash.
- **Tabs** (`RecordTab`): `id` · `label` · `content` · `disabled` (visible, not selectable) · `hidden` (omitted) · `badge` (decorative) · `surface` (`panel` default, or `plain` for content that brings its own). Controlled (`activeTabId` + `onTabChange`) or uncontrolled (`defaultTabId`); wire `onTabChange` to a URL param for deep-linking.

**Mobile/touch contract.** Header actions wrap onto additional rows rather than
disappearing or forcing width, and on coarse-pointer/touch devices every
`RecordAction` uses the shared 44px touch-target floor. Long action labels wrap the
header region, not the document. Each breadcrumb crumb is plain inline flow (not
`inline-flex`): a long parent label (e.g. an Area title above a Goal) wraps across
several lines on a narrow phone with its "/" separator staying attached to the
first line, rather than a flex layout centring the separator against the whole
wrapped block (fixed by AREA-04, see
[`AREAS_MODULE.md`](../development/AREAS_MODULE.md#mobile-area-04)).
- **Content** (`RecordContentProps`): `isLoading` · `isEmpty` · `error` · `loadingSlot`/`emptySlot`/`errorSlot` overrides · `label`. Precedence: error → loading → empty → children.

### Responsive behaviour

The layout is a **container-query context** (`container-type: inline-size`), so it adapts to the width of its container — the main region today, a [Drawer](#drawer) in DS-03 tomorrow — not the viewport. With `min-width: 0`, wrapping metadata, `overflow-wrap: anywhere` on titles/descriptions and a horizontally-scrollable tab strip, there is **no horizontal page overflow from 320px up**. On a narrow container, header actions take the full width beneath the title and grow to a comfortable target rather than disappearing.

### Surface & boundaries

A canonical record reads as ONE contained workspace, clearly bounded from the
application canvas — never content dissolving into the page. The boundary is owned
by the shared layout (`app/styles/record-layout.css`), on DS-01 tokens only, so
every consumer (Area, Goal, Project, Note, Task) gets it identically:

- The record has deliberate **spacing from the global left navigation** and the top
  of the pane (`.record-layout` padding, `--app-space-6`/`--app-gutter`), suppressed
  inside a Drawer where the drawer body already provides its own padding.
- The **summary** and the **active tab panel / no-tabs content region** share ONE
  contained surface treatment: `--md-app-color-surface-card` fill,
  `--md-sys-shape-corner-large` and elevation 1 — so the tab content no longer
  blends into the canvas, in both appearances, in every colour scheme.
- **No doubled / stacked-card borders.** Cards inside a tab sit on
  `--md-app-color-surface-raised` (one shade above the panel), so nested cards stay
  distinct without a second concentric border; a state slot that carries its own
  border (empty/error) drops it when nested directly inside the contained surface.
  The result is a bounded record, not a stack of rounded cards inside rounded cards.
- Existing container-query behaviour is unchanged; the record remains uncluttered
  and free of horizontal overflow at 320px, and mobile is not "boxed in".

### Record content sections (PX-06)

Inside a tab panel, sections share ONE vertical rhythm (`app/styles/record-layout.css`), so a Task, a Project, a Meeting and a Review breathe identically:

- **`.dh-record-stack`** — the stack of sections inside a panel.
- **`.dh-record-section`** — one section within it.
- **`.dh-record-section__label`** — a restrained uppercase eyebrow (never the record heading).
- **`.dh-record-muted`** — calm supporting/absent-state prose.

These replaced four private copies at three different gaps (the Task Drawer's `__links`/`__section`, which the Project links tab borrowed *by class name*, plus `dh-meeting-section` and `dh-review-tab-stack`). A module adds only what is genuinely its own on top.

### Accessibility

- **Landmarks & outline:** the record is an `article` labelled by its heading; the heading level is configurable so the surrounding page keeps a correct outline.
- **Tabs:** the WAI-ARIA Tabs pattern — `role="tablist"`/`tab`/`tabpanel`, roving `tabindex`, `ArrowLeft/Right`/`Home`/`End` navigation that skips disabled tabs, and panels linked with `aria-labelledby`. The active tab is signalled by `aria-selected` **and** weight + an underline bar — **never colour alone**.
- **Actions** always carry an accessible name; icon/terse labels use `ariaLabel`. **Focus** is visible on every control via the DS-01 focus ring. The loading region sets `aria-busy`; the error slot is a `role="alert"`. Motion (the skeleton shimmer) honours reduced-motion.

### Correct vs incorrect usage

- ✅ Compose a record from `RecordLayout`, passing plain typed data; put depth in `tabs`, essentials in `summary`.
- ✅ Convey status with a `tone` **and** its label; give every action a real name.
- ❌ Build a bespoke header/tab strip for a module, or restyle the layout with one-off CSS instead of extending tokens.
- ❌ Encode meaning in colour alone (a red pill with no label), or use `RecordContent` error text without a recovery.
- ❌ Bake entity-specific logic into the layout — it stays entity-agnostic; entity behaviour lives in the module.

---

## Shared Drawer (DS-03)

The [Drawer](#drawer) pattern above is realised by ONE reusable, entity-agnostic overlay: the **Shared Drawer** ([DS-03](../roadmap/ROADMAP_V2.md#-ds-03--shared-drawer)), in [`app/shared/drawer`](../../app/shared/drawer). It opens any record over the current page without losing the user's place, is deep-linkable and stackable, and **hosts the [DS-02 Record Layout](#shared-record-layout-ds-02)** rather than inventing a second record presentation. It knows nothing about any entity, D1, workspaces or module routes — callers pass an opaque key and a render function. It builds entirely on [DS-01 tokens](#design-tokens-ds-01) (z-index, elevation, motion, colour, spacing) and is accepted in [ADR-018](../decisions/ARCHITECTURE_DECISIONS.md#adr-018-the-shared-drawer--url-driven-history-stacked-focus-isolated).

Its visible chrome follows the [DHDS-03 contextual panel anatomy](#contextual-panel-anatomy-dhds-03): the same heading, title/supporting-line hierarchy, close treatment, scrolling-body contract and optional pinned commitment region as Inspector and Sheet. Behaviour remains surface-specific; chrome does not.

### Purpose

Open a record *in context* — click a task in Today and it slides in over the page, which stays visible and keeps its state. The Drawer is the **default** way to open any record; full-page record views exist only where genuinely warranted (e.g. long-form Note editing). It must never lose the user's place.

### Public anatomy

```
DrawerProvider (mount once, wraps the page)   ← owns the URL stack, focus, inertness, scroll lock
  ├ renderDrawer(entry) → { title, description?, children, size?, preventClose?, initialFocusRef? } | null
  ├ <the page>                                 ← rendered inert while a drawer is open
  └ DrawerStack (only while open)              ← viewport-fixed sibling; scrim + one panel per level
       └ Drawer (per level)                    ← role=dialog, aria-modal on top only
            ├ header: title (accessible name) + optional description + always-present Close
            └ body: children  ← a DS-02 RecordLayout (scrolls independently)

useDrawer() → { entries, depth, isOpen, topKey, openDrawer, replaceDrawer, closeDrawer, closeAll }
DrawerTrigger drawerKey=…   ← a link that opens a key (shareable href + SPA open)
DrawerClose                 ← an in-content close control
```

Internal panel/stack/focus-trap/scroll-lock/inert machinery is **not** exported — callers never manage focus traps, portals, history entries or z-index.

### URL & deep-link model

The open stack lives entirely in the URL as a repeated `drawer` search parameter, backmost first:

```
/projects?status=active&drawer=project%3Aalpha&drawer=goal%3Anorth-star
```

The rendered stack is a **pure function of the URL**, so refresh, a copied link and Back/Forward all restore the same state — Drawer state is never held in ephemeral location state that a refresh would drop. Keys are opaque, URL-safe tokens; the `<kind>:<id>` shape is a *consumer* convention, never parsed by the Drawer. Every transform preserves unrelated query parameters. A **direct deep link** to a drawer URL renders server-side and coherently even with no background-location state; an unknown key yields a built-in, accessible not-found panel rather than a blank overlay.

### Stack model

- Opening pushes **one** history entry; re-opening the current top is a no-op (never a duplicate level).
- Each nested drawer gets its own history entry; levels are keyed by **stack depth _and_ record key**, so opening a higher drawer **never remounts** the ones beneath it (their selected tab, scroll position and local state survive), while **replacing** the record at a depth (same depth, new key) **does** remount that level — so record-local state and mount-only initial focus never leak from a replaced record into its replacement.
- Only the **top** drawer is interactive; lower levels are `inert`. Stack order maps to z-index via DS-01 tokens.
- A generous depth cap replaces further pushes with a top-replace to bound pathological loops without limiting normal use.

### Desktop & mobile presentation

- **Desktop/laptop:** a calm side sheet entering from the right; the underlying page stays visible behind a restrained scrim; width fits a full Record Layout (`default`, or `wide`); the top drawer is visually distinct from prior levels; the panel never forces the document wider.
- **Narrow/mobile:** a full-height, (near-)full-width sheet that respects safe-area insets, is usable at 320px, and introduces no horizontal page overflow. The DS-02 actions and tab strip stay reachable.
- **Motion:** quick, restrained enter using DS-01 duration/easing tokens; instant under `prefers-reduced-motion`. No animation is required to understand the Drawer.

### Focus, background inertness & scroll

- **Focus:** on open, focus moves into the drawer — an explicit `initialFocusRef`, else the close button, else the first control. Tab/Shift+Tab are trapped and wrap. On close, focus returns to the opener when it still exists, else a safe fallback (never lost to `<body>`).
- **Background inertness:** while a modal drawer is open, everything outside the top panel — the underlying page *and* the app shell — is `inert`, so it is unreachable by keyboard or assistive tech. Nested drawers never expose the level beneath. The top drawer is a `role="dialog"` with `aria-modal`, an accessible name (its title) and an optional `aria-describedby` description; the close control always has an accessible name.
- **Escape & history:** Escape and the close button close **only the top** level (unless `preventClose` is set). Closing is *provenance-aware* (ADR-018 §18.2): a level the Drawer itself opened closes with browser **Back** (so Forward restores it); a directly deep-linked, copied-link or refreshed level instead has **only its top drawer parameter removed in place**, preserving the pathname, hash and unrelated query parameters — so closing a shared drawer link never navigates you to a different page. Browser Back closes the top; Forward restores an opener-pushed level; navigating to another page exits the stack. Closing is **idempotent per history entry**: because a Back-based close does not land synchronously, a second close request arriving before it does (Escape pressed twice quickly, Escape racing the close button) is ignored rather than popping a second time — so a repeated Escape closes the drawer and stops, never carrying the user off the record they were on. The guard is released as soon as the browser leaves that entry, including when **Forward restores it** (which re-enters the original entry under its original key), so a restored level is always closable again.
- **Body scroll:** page scrolling is locked while open (the drawer body scrolls independently, with the header/close always reachable); the underlying scroll **position** is preserved by path-keyed `ScrollRestoration` (ADR-018 §18.6), so a drawer never moves the page.
- State is never communicated by colour alone; focus uses the DS-01 focus ring; behaviour holds at 200% zoom.

### Integrating a RecordLayout

```tsx
<DrawerProvider
  renderDrawer={(entry) => {
    const record = lookup(entry.key);          // caller maps key → data (or null)
    if (!record) return null;                  // → graceful not-found panel
    return {
      title: record.title,                     // the dialog's accessible name
      description: `${record.type} record`,
      size: record.type === "note" ? "wide" : "default",
      children: (
        <RecordLayout title={record.title} headingLevel={3} typeLabel={record.type} …>
          {/* related records open a stacked drawer */}
          <DrawerTrigger drawerKey={`goal:${record.goalId}`}>Open goal</DrawerTrigger>
        </RecordLayout>
      ),
    };
  }}
>
  <Page />
</DrawerProvider>

// Anywhere inside the provider:
const { openDrawer } = useDrawer();
openDrawer(`task:${id}`);   // or <DrawerTrigger drawerKey={`task:${id}`}>…</DrawerTrigger>
```

### Correct vs incorrect usage

- ✅ Mount **one** `DrawerProvider` per surface; open records by key with `useDrawer`/`DrawerTrigger`; host a `RecordLayout` as the drawer body.
- ✅ Let the Drawer own focus, inertness, scroll-lock and history; return `null` from `renderDrawer` for unknown keys.
- ✅ Use `size="wide"` only when a record genuinely needs it; use `preventClose` for unsaved-state guarding of the in-app affordances.
- ❌ Build a bespoke modal/overlay, add a drawer/modal dependency, or duplicate the record scaffold inside a drawer.
- ❌ Hold drawer state in component booleans or ephemeral location state (breaks refresh/deep links), or parse entity meaning out of the key.
- ❌ Manage focus traps, portals, z-index or history entries by hand, or convey state by colour alone.

### Extension rules

Add a `size` variant, a stack-metadata field or a presentation option to the shared Drawer only when a real record needs it, and document it here — never fork the Drawer per module. Real product record routes (replacing the fixture's `<kind>:<id>` keys) arrive when a module first adopts the Drawer; DS-03 ships the mechanism and a development fixture only.

---

## Shared Cards (DS-04)

The [Cards](#cards) pattern above is realised by ONE reusable, entity-agnostic component: the **Shared Card** ([DS-04](../roadmap/ROADMAP_V2.md#-ds-04--shared-cards)), in [`app/shared/card`](../../app/shared/card). Every entity type — Area, Goal, Project, Task, Person, Note, … — renders through this one Card configured with data. There is **no** `TaskCard`/`ProjectCard`/`GoalCard`/`PersonCard`/`NoteCard`; a bespoke per-module card is [Product Debt](../product/PRODUCT_DEBT.md) the moment it merges. **The one documented exception is the task ROW** ([below](#the-task-row-ds-04-2026-08)), which is not a card and does not try to be: it is a column grid, and the rule it establishes is that a product component is legitimate when the generic one cannot express the LAYOUT — never when it merely wants different styling. The Card builds entirely on [DS-01 tokens](#design-tokens-ds-01) (card.css) and opens records through the [DS-03 Drawer](#shared-drawer-ds-03); it is accepted in [ADR-019](../decisions/ARCHITECTURE_DECISIONS.md#adr-019-shared-card-identity--reorder-and-the-filter-expression--url-contract).

**Purpose.** The shared unit for representing an entity in a list, board or grid, with selection, quick actions, density and an accessible primary open action — configured, never forked.

**Entity-agnostic rule.** The Card knows nothing about D1, repositories, workspaces, the Area hierarchy, Project/Task rules, real routes, module loaders or Cloudflare bindings. It accepts generic presentation concepts only (a `typeLabel`, an `icon`, a `tone`), so entity-specific business rules stay in the future modules that configure it.

**Anatomy.**

```
<article aria-labelledby=title>                 ← labelled, NON-interactive card landmark
  [reorderHandle]  (from ReorderableCardCollection)
  [selection]      ← native checkbox; never opens the record
  body
    ├ type row: entity icon (decorative) + type label · status pill (tone + label)
    ├ title      ← the PRIMARY OPEN TARGET: a real link and/or button
    ├ subtitle / context (parent label) / due-or-date label
    ├ progress   ← role=progressbar with an accessible text equivalent
    └ metadata[] ← a small, wrapping, typed collection
  actions        ← quick actions + optional overflow; reveal on hover/focus, always
                   reachable by keyboard and on touch; each stops propagation
```

**Typed public contract.** `CardProps` (see [`app/shared/card/types.ts`](../../app/shared/card/types.ts)): stable `id` · `title` (required) · `typeLabel`/`icon`/`accent` · `subtitle` · `status {label, tone}` · `metadata[]` · `progress {value, max?, label?}` · `context {label, href?}` · `dateLabel {label, tone?}` · `selection {selected, onSelectedChange, disabled?, label?}` · `quickActions[]` · `overflowAction` · `onLongPress` · `href` and/or `onOpen` + `openAriaLabel` · `density` · `presentation` · `rovingTabIndex` · `reorderHandle`.

**Editable values in the metadata slot (TASKS-05).** A `metadata[]` entry's `value` is a `ReactNode`, so a module may put a [DS-16 inline field](#inline-editing-ds-16) there and make the value itself the control — which is how a Task row edits its priority, its two dates and its parent without opening the record. Two rules make this safe to copy: the READ state must be exactly what the row would have shown anyway (no new chrome, no pencil beside every value), and the empty state must be a short, quiet invitation that names the field ("No due date", "Unassigned") rather than a zero-height target. Do **not** put an inline field in `title` — the title is the card's primary open control, and replacing it permanently would take the record away; use `titleEditor` for a transient rename instead.

**Range selection (`onSelectedChange(selected, modifiers)`).** The Card REPORTS whether Shift was held; it never interprets it. Only the collection knows what order its rows are in, and a range is "everything between these two rows" in DISPLAY order. A consumer that ignores the second argument behaves exactly as before.

**Touch long press (`onLongPress`, TASKS-08).** An optional hold-to-select gesture, gated on the same touch-first media query as the swipe tray, armed only on the card surface (never a nested control), cancelled by any drift, and suppressing the click the hold would otherwise also produce. It is inert unless supplied and inert on a pointer device. It is an **accelerator**: a consumer that wires it MUST also expose an ordinary labelled selection control — the Card's own checkbox, plus a visible selection toggle on the collection — because a gesture has no keyboard or assistive-technology equivalent.

**Primary open action & Drawer integration.** Activating the title opens the record in the [DS-03 Drawer](#shared-drawer-ds-03) — but the Card does **not** own Drawer state or parse drawer keys. Provide `href` (a shareable link, e.g. a drawer deep link), `onOpen` (an SPA callback), or **both**: an unmodified click opens via `onOpen`; a modified/middle click follows the `href` (open in a new tab). Mouse and keyboard both open; the target always has an accessible name; there is no inaccessible `div onClick` and no nested-interactive violation (the card root is a plain `article`). Opening a Drawer from a filtered collection preserves the active filter query parameters (they live in different URL parameters — [DS-07](#shared-filters-ds-07) `f`/`fmode`/`fv` vs DS-03 `drawer`).

**Selection.** Controlled and native: a real checkbox with an accessible name, a change callback, keyboard operation, and a selected state conveyed by the checked checkbox **and** a border/surface cue — never colour alone. Selection never opens the record, remains visible in both densities, and does not depend on hover (reachable on touch). Bulk mutations/Inspector are out of scope (later items).

**Quick actions.** A curated two or three per card (the long tail lives in the overflow or [Command Palette](#command-palette)). Each is a button or link with a stable id, a visible label or explicit `ariaLabel`, optional icon, disabled and generic `pending` states, and optional shortcut/description metadata. Actions reveal on hover/focus for pointer/keyboard and are always reachable on touch; they stop propagation so they never open the card; disabled/pending actions cannot fire; meaning is never icon- or colour-only. The Card implements **no** optimistic mutation or Undo (DS-10) and hard-codes **no** Task-specific action.

Two rules the August 2026 UI quality audit made explicit (UIQ-001/UIQ-002), because their absence produced the audit's two worst desktop defects:

- **Concealed actions are absent to the pointer, present to the keyboard.** On a hover-capable fine pointer the revealed rail **overlays** the list row's trailing edge on the row's own surface colour — it is never an in-flow sibling whose invisible reserved width squeezes the title and metadata (that reservation cost Today a third of every row). While concealed it is `pointer-events: none`, so nothing invisible is ever hit-testable — and deliberately **not** `visibility: hidden`, which would also make the buttons unfocusable and drop them from the accessibility tree; Tab reaching a concealed action is itself what reveals the rail (`:focus-within`). Geometry is stable because nothing is reserved and nothing reflows. On touch the rail stays in flow and always visible — there the space is genuinely used.
- **The surface over the swipe tray stays opaque.** Row hover/selected states mix their tint over `--md-app-color-surface-card`, never over `transparent`: the tray behind the surface relies on the surface covering it, and a translucent state uncovered it on every desktop hover.

**Progress & metadata.** Progress takes a bounded `value` against `max` (default 1), normalises invalid/NaN/negative/over-max input safely, and exposes `role="progressbar"` with `aria-valuetext` plus visible text — understandable without colour, correct at zero and complete. Metadata is a small typed collection that wraps safely, stays readable in compact mode, handles long unbroken strings (`overflow-wrap: anywhere`), and never turns the card into a miniature record page.

**Density, list/board/grid.** `density` is `comfortable` or `compact`; `presentation` is `list`, `board` or `grid` — the **same** component in all three. Presentation changes spacing/placement but never removes essential information or actions. At 320px there is no horizontal document overflow, title/metadata wrap, selection and quick actions stay reachable, touch targets meet the 44px token, and the open action stays obvious.

**Roving-focus membership (`rovingTabIndex`).** For a keyboard-navigable collection (a surface where Arrow keys move a single focus across many cards — e.g. the Today task list, TODAY-05), the optional `rovingTabIndex` prop is applied to **only the card's primary open control** (`0` for the active card, `-1` for the rest), so the collection is a single composite widget with **exactly one tab stop**: Tab enters once and lands on the current card, Arrow keys move between cards, Tab/Shift+Tab leave/re-enter. The card's SECONDARY controls (selection checkbox, quick/overflow actions) are always removed from the tab order (`tabindex="-1"`) while roving is active — Tab never stops on them — yet stay operable by pointer and by keyboard through the collection's own model (Space selects the focused card) and the shared contextual commands / Command Palette (every action has a keyboard equivalent). Undefined (the default) leaves natural tab behaviour unchanged, so every existing consumer is untouched. This is the accessible roving-`tabindex` composite (like RecordTabs) rather than a `listbox`/`aria-activedescendant` widget — correct here because a card legitimately contains interactive children, which a listbox option may not.

**Reorder model & keyboard equivalent (DHDS-11, 2026-08).** DESIGN_SYSTEM requires drag with a keyboard equivalent, and there is now exactly ONE implementation of both: [`~/shared/drag`](#drag-reorder-and-object-continuity-dhds-11-2026-08). A card in a manually ordered collection is rendered inside `SortableList` and places the shared `SortableHandle` in its `reorderHandle` slot. Pointer users grab the grip and drag; keyboard users focus it, press Enter/Space to pick up, Arrow Up/Down to move, Enter/Space to drop, Escape to cancel. The grip has an accessible name in the product's words; every move is announced through one live region; reordering **emits intent** (`onReorder(nextIds, detail)`) and never mutates business data. The **permutation guarantee** is enforced by capturing the collection when the drag begins and cancelling cleanly if it stops being a permutation of that — and again, authoritatively, by the repository inside the write. `CardCollection` is the plain (non-reorderable) container for list/board/grid; grid and board layouts use it and do **not** offer drag, because pointer targeting is one-dimensional.

DHDS-11 **removed** DS-04's own `ReorderableCardCollection`, `CardReorderHandle` and `reorder.ts`. They were a second, parallel drag system — a second grip, a second announcement vocabulary and a second order model — used by one design fixture and by nothing in the product. Their pinned-card concept went with them: no DHDS-11 collection has a notion of a card that stays put while its neighbours move.

**Accessibility.** Semantic card structure (`article` + heading); accessible primary open action with visible focus; native, labelled selection; keyboard-accessible quick actions that are never hover-only; status/date as text (not colour alone); labelled/valued progress; a keyboard-operable, announced reorder handle; logical tab order; no nested-button/link violations. The title heading level is configurable via **`headingLevel`** (2 | 3 | 4, default 3) so cards nest correctly under the surrounding heading — a Collection pane header at `h1` renders its cards at `h2`, a card under an `h2` section at `h3` — keeping the document's heading outline valid with no skipped levels (DS-11).

**Correct vs incorrect usage.**

- ✅ Configure ONE `Card` with plain typed data for any entity; give the title an `href`/`onOpen` that opens the DS-03 Drawer; keep quick actions a curated few.
- ✅ Use `SortableList` (`~/shared/drag`) for accessible reorder and let it emit intent; treat progress/status/date as text-bearing. Reach for it only when the collection's order is genuinely the owner's and is stored — see the six questions in `DHDS_11_…` §2.
- ❌ Build a `TaskCard`/`ProjectCard`/… or bake entity/business logic into the Card; make the whole card a single click target (`div onClick`) or nest interactive controls; convey selection/status by colour alone; hide quick actions from touch; mutate data inside a reorder.

**Extension rules.** Add an affordance to the **one** shared Card (and document it here) only when a real entity needs it; never fork per module. Real product card usages arrive when a module first adopts DS-04 — this ships the component plus a development fixture only.

---

## The task ROW (DS-04, 2026-08)

The `/tasks` workspace does not render tasks as [Cards](#shared-cards-ds-04). It renders a **row** — `TaskRow` / `TaskList` / `TaskGroup` in [`app/shared/task-record/`](../../app/shared/task-record/) — accepted in [ADR-095](../decisions/ARCHITECTURE_DECISIONS.md#adr-095-the-task-row--a-product-component-over-the-generic-card-one-column-grid-and-container-queries-as-the-responsive-authority-for-a-list) and specified in [`DS_04_TASKS_REDESIGN_2026_08.md`](DS_04_TASKS_REDESIGN_2026_08.md).

**Why this is not a forked card.** The Card lays its metadata out as a wrapping flex RUN. A task list is a COLUMN GRID: a date column only reads as a column because every date in it starts at the same x, and no amount of styling makes a flex run do that. The distinction is structural, which is what makes the exception a rule rather than a precedent for "my module wants different padding".

**Anatomy.**

```
<div class="dh-tasklist" data-dh-density="compact|default">  ← the owner's density; declares --taskrow-columns; a query CONTAINER
  <div class="dh-tasklist__columns" aria-hidden>        ← Task · Project · Due · Priority · Status
  <ul class="dh-tasklist__rows" aria-label>             ← real list semantics
    <li class="dh-taskrow">                             ← no surface: a hairline, a hover wash
      lead     [select?] [completion circle]
      main     <h2|h3> title link · repeat/sync signals
      meta     project · due · priority · status        ← display:contents on desktop, flex on a phone
      actions  overflow menu (hover/focus; always on touch)
```

**The rules a task-bearing surface inherits.**

1. **The title is the only flexible column.** `minmax(0, 1fr)`, so it truncates inside its track. Metadata yields before the title does — status first, then priority, then project.
2. **Hierarchy is the metadata being quieter, never the title being louder.** The title takes `--dh-text-row-*` at the ROW weight; cells take `--dh-text-meta-*` in the muted role.
3. **One bounded coloured container per row**, and only where the fact appears nowhere else. Project is a dot; a date is text; priority is a dot and a tag.
4. **The row's height is the completion control's target.** No block padding on top of it.
5. **Breakpoints are the LIST's width.** `container-type: inline-size`, and the template is re-declared on `.dh-tasklist__columns, .dh-taskrow` inside each query — a container query can never style its own container.
6. **Quiet is a property of the paint.** An affordance may be invisible until hover; it may never be smaller than 24×24.
7. **The row owns no authority.** Every edit is a shared control posting a canonical intent.

**Adoption.** DS-04 wired it into `/tasks` only. [TODAY-TASK-01](TODAY_TASK_01_ONE_TASK_ROW_2026_08.md) added **Today's plan** as its second caller and closed [DEBT-143](../product/PRODUCT_DEBT.md) with it — Today's private row is deleted, and the module declares no `.dh-today .dh-taskrow` structural override. Projects and search still render Cards ([DEBT-128](../product/PRODUCT_DEBT.md)).

**What a second caller supplies, and what it must NOT.** The row asks for data plus callbacks and nothing else. A new caller supplies:

| It supplies | From |
|---|---|
| `task` | `toTaskRowProjection(item)` — the SHARED display projection ([`task-view.ts`](../../app/shared/task-record/task-view.ts)). Never a hand-rolled derivation of the display state, the completion flag or the waiting flag. |
| `parents` | ONE bounded `searchTaskParents({ limit })` in its loader. Never a query per row, never the whole workspace. |
| `overflowActions` | `buildTaskRowActions(task, handlers, { readOnly })` ([`task-row-actions.tsx`](../../app/shared/task-record/task-row-actions.tsx)) — the shared SET. A caller omits an item by passing no handler for it, and states why; it never assembles a menu of its own. |
| the callbacks | Its own host, posting the canonical intents through [`task-inline-edit.ts`](../../app/shared/task-record/task-inline-edit.ts) to `POST /tasks/:id` and `POST /tasks/bulk`. **A surface never gets a mutation endpoint of its own.** |

It must not add a Today-shaped (or Projects-shaped) column, a per-surface stylesheet override of the grid, or a second optimistic applier — `applyTaskListItemPatch` is shared and generic over the record type for exactly that reason.

**Two-caller rule for the ladder.** The responsive template is the LIST's, and both callers run it at different widths — `/tasks` at ~56rem+, Today's plan at ~38–44rem, both at ~21rem on a phone. A width that only one caller reaches is still a shared rung: TODAY-TASK-01 found the ≤56rem and ≤44rem rungs carrying track widths from before FINAL-UI swapped the date and project columns, which was a wide gap on `/tasks` and a one-letter project name on Today. Fix the rung, never the caller.

## Shared overflow menu (DS-12)

The [Overflow menu](#overflow-menu) pattern is realised by ONE reusable, entity-agnostic component: the **Shared overflow menu** ([DS-12](../roadmap/ROADMAP_V2.md#-ds-12--record-header-overflow-menu--card-overflow-action)), in [`app/shared/overflow-menu`](../../app/shared/overflow-menu). The [DS-02 Record Header](#shared-record-layout-ds-02) and the [DS-04 Card](#shared-cards-ds-04) render the SAME component with the SAME item model, so a secondary or destructive action looks, reads and behaves identically wherever it appears. Accepted in [ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).

**Purpose.** Give the product one conventional home for the long tail of record actions — above all Archive / Restore / Delete — instead of a per-module invention (a header button here, a Settings sub-tab there, nothing at all somewhere else).

**Item model.** `OverflowMenuItem` ([`types.ts`](../../app/shared/overflow-menu/types.ts)) is the `RecordAction`/`CardAction` shape plus the two things a menu needs and a button row does not: a `tone` (`default` | `danger`) and a `separatorBefore` group break. Fields: `id` · `label` · `ariaLabel` · `icon` · `description` · `href` **or** `onSelect` · `disabled` · `pending` · `tone` · `separatorBefore`.

**Anatomy.**

```
<div class=dh-overflow-menu>
  <button aria-haspopup="menu" aria-expanded aria-controls aria-label="More actions for <record>">⋯</button>
  <div role="menu" aria-labelledby=trigger>            ← only while open
    <button|a role="menuitem">  icon? · label · description?
```

**Behaviour.** A WAI-ARIA **menu button**, deliberately **non-modal**: it adds no second focus-trap, makes nothing inert and locks no scroll (so it composes inside a Drawer, an Inspector or a Card without fighting them). Click/Enter/Space/ArrowDown open with the first item focused; ArrowUp opens with the last. Arrow keys wrap; Home/End jump. **Escape closes only this menu** (the event is stopped, so an enclosing Drawer never also closes) and restores focus to the trigger; Tab leaves naturally; an outside pointer press dismisses. A disabled or `pending` item cannot fire.

**Two presentations, one implementation (MOBILE-01, iPhone daily driver).** Above `md` the panel is the anchored, measured surface described above. Below `md` the SAME items — same order, same ids, same `role="menu"` / `role="menuitem"` semantics, same roving tabindex, same keyboard contract — render inside the [shared Sheet](#the-shared-sheet), and the panel carries `data-presentation="sheet"`. The trigger's `aria-haspopup` follows the presentation (`dialog` on a phone, `menu` otherwise); a `menu` inside a `dialog` is valid ARIA, and keeping it is what lets one component serve both surfaces rather than forking into two item lists. Only the two behaviours that belong to the anchored presentation are switched off in sheet mode: the measured flip/clamp placement, and outside-pointer dismissal — the latter *must* be, because the sheet is portalled to `<body>`, so a tap on one of its own items is "outside the trigger's container".

Why: the anchored panel measured **208px wide at a 390px viewport**, with three of six actions wrapping onto two and three lines, which is the "tiny popover inside a 320–430px layout" the [shared Sheet](#the-shared-sheet) rules forbid. Do **not** answer a narrow-viewport menu with a module-specific overlay; this is where the phone answer lives.

**Activation order is load-bearing.** Choosing a button item **closes the menu and focuses the persistent ⋯ trigger FIRST, then runs the handler** — so a handler that opens a dialog (every lifecycle action does) sees a live `document.activeElement` to return focus to when that dialog closes. Running the handler first would hand the dialog the menu item that is about to unmount, and cancelling would drop the keyboard user at the top of the page. A link item is exempt: it is about to navigate, so pulling focus back would fight the navigation.

**Accessibility.** The trigger always names the record it acts on (`More actions for <title>`) so several card menus on one page stay distinguishable. An item's `description` is rendered inside the item but referenced via `aria-describedby` and kept out of the accessible *name*. Destructive items carry `tone="danger"` **and** the word "Delete" — never colour alone. Touch targets meet the 44px token.

**Card integration.** `CardProps.overflowActions` is the contract; the legacy single `overflowAction` is normalised into the same one-item menu, so there is exactly ONE overflow rendering. A swipe-enabled card un-clips itself only while its menu is open, so the panel is never cut off.

**Correct vs incorrect usage.**

- ✅ Pass `overflowActions` to `RecordLayout` (or a `Card`) and let the shared menu render it; keep exactly one primary action in the header.
- ✅ Keep a blocked action visible and disabled with a `description` explaining the precondition.
- ❌ Build a second menu/popover; put a destructive action only in a Settings sub-tab; convey "destructive" with colour alone; hide an action the user is allowed to learn about.

**Viewport placement (UIQ-021).** The panel is placed WITHIN the viewport, using the same philosophy the shared [Tooltip](#tooltip-m3-tip) already uses — measure the trigger's viewport rect, flip, clamp against a small edge margin — applied to a surface that has real height. It used to be `top: 100%` and nothing else, so a long menu (a Tasks row carries about twelve items ≈ 713px) opened low on the screen simply ran off the bottom and the page had to be scrolled to reach its last item.

The decision is a pure function ([`menu-placement.ts`](../../app/shared/overflow-menu/menu-placement.ts), no React, no DOM — the `swipe-model` precedent), so it is unit-testable as plain numbers:

1. prefer the ordinary below-trigger placement when the whole menu fits;
2. flip above when the whole menu fits there instead;
3. when neither side can contain it, take the larger side and CLAMP the height to it — the panel then scrolls its own items, rather than the page scrolling around it;
4. keep an 8px margin from every viewport edge, and shift inline so a menu near the leading or trailing edge stays fully readable;
5. never clamp below a usable height — on a very short viewport the margin yields instead, because a menu clamped to nothing is a menu nobody can use.

`data-side` and the clamp are **presentation only**. Flipping and clamping change no keyboard semantics, no item order and no focus behaviour: a menu that opens upward is navigated exactly like one that opens down, Home/End still reach the ends, and the scroll container brings the focused item into view. There is no positioning dependency — the panel stays absolutely positioned against its trigger and only switches which edge it anchors to. The measurement re-runs on scroll and resize, because the menu is deliberately non-modal and the page behind it still moves.

**Extension rules.** Add an affordance to the one shared menu (and document it here) only when a real record needs it. Never fork per module.

---

## Shared record lifecycle (PX-04)

The [Record lifecycle](#record-lifecycle) pattern is realised by ONE hook and ONE vocabulary ([PX-04](../roadmap/ROADMAP_V2.md#-px-04--lifecycle--destructive-action-consistency)), in [`app/shared/record-lifecycle`](../../app/shared/record-lifecycle). Every record composes it, so "how do I remove this?" has the same answer, in the same place, in the same words, on every entity. Accepted in [ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).

### One vocabulary

`lifecycle-copy.ts` derives every label from ONE input — the entity type — through the PX-02 [`ENTITY_IDENTITY`](#entity-identity-px-02) map. A module never writes a lifecycle label:

| Act | Menu label | Confirmation | Recovery |
|---|---|---|---|
| **Archive** | `Archive <Entity>` | a plain confirm naming the consequence | Restore, any time |
| **Restore** | `Restore <Entity>` | a plain confirm | — |
| **Delete** (reversible) | `Delete <Entity>` | **none** — friction would be noise | an **Undo** toast, plus a durable "Deleted" collection view |
| **Delete permanently** | `Delete <Entity> permanently` | a **typed confirmation** of the record's exact title | none — and it says so |

Success messages (`<Entity> archived` / `restored` / `deleted`) come from the same module, so the Settings tab and the header overflow can never drift apart.

### The hook

`useRecordLifecycle({ entityType, title, archived?, onArchive?, onRestore?, onDelete?, deleteMode?, deleteBlockedReason?, pending?, leadingItems?, notifyOnSuccess? })` returns `{ overflowActions, dialogs }`:

- `overflowActions` goes straight to `RecordLayout`'s `overflowActions` (or a Card's), always ordered **module items → Archive/Restore → Delete**, with one decorative separator before the lifecycle group.
- `dialogs` is rendered inside the record; it hosts the DS-10b [`ConfirmationDialog`](#settings-layout-ds-10b) — no second focus-trap, no second confirmation modal.
- The hook owns **presentation only**. A module supplies async callbacks that post to its own trusted route; the server stays the authority. A **rejected callback keeps the dialog open with an inline error and a retry** — a lifecycle action never closes as though it worked. On the reversible path (which fires without awaiting) a rejection is caught rather than left unhandled.
- `deleteBlockedReason` renders Delete **visible but disabled** with the precondition spelled out (e.g. "Move or remove everything inside this Area first"), so a capability is never silently hidden.

### Reversible removal, shared

`useReversibleDelete` is the Notes pattern ([ADR-042](../decisions/ARCHITECTURE_DECISIONS.md#adr-042--notes-autosave-adaptation-and-the-first-generic-record-lifecycle-soft-deleterestore-ui-pattern)) generalised: one deliberate click → a REAL server soft-delete → a redirect back to the collection → an **Undo** toast whose handler calls the mirror `restore` intent. `useCollectionRestore` is the other half — the one-click restore, with in-flight bookkeeping, that a "Deleted" collection view needs. Notes, Goals and Diary all run on these; no module re-implements them.

Two rules the hook enforces so removal stays trustworthy when the network does not:

- **A rejected request always clears its pending state** (a `finally`, not a happy path). Otherwise a fetch fault or a non-JSON response would leave the record's Delete action disabled until a page reload.
- **The route's own recovery message wins.** `post` may return a bare `boolean` or `{ ok, error }`; when the route already explained what to do first ("This Goal still has active Projects…"), that sentence reaches the user instead of a generic "try again" they cannot act on.

**A "Deleted" view paginates.** It is the durable path back, so it must not become a dead end of its own: the view carries `state=deleted` through every page rather than borrowing the active collection's paginator, whose cursor belongs to a different scope.

### Where the actions live

The **Record Header overflow is the primary entry point on every record**. A module may *also* keep a Settings tab (where there is genuinely more to explain — dependency counts, workflow status, blocked-delete detail), but Settings is never the only way in. The two surfaces share the same handlers and the same wording.

**Current coverage.** Area (archive/restore + permanent delete, gated by the spine dependency guard) · Goal (reversible delete + Undo + a Deleted view) · Project (archive/restore) · Note (reversible delete + Undo + a Deleted view) · Diary entry (reversible delete + Undo) · Person, Asset, Review (archive/restore + permanent delete) · Meeting (archive/restore). **Task is deliberately excluded**: a Task's removal semantic is **Cancel** (a first-class display state), and a Task lives inside its Project's lifecycle — adding a second removal concept would muddy rather than unify. That exclusion is a decision, not an omission.

---

## Shared Filters (DS-07)

The [Filters](#filters) pattern above is realised by ONE reusable, entity-agnostic system: the **Shared Filters** ([DS-07](../roadmap/ROADMAP_V2.md#-ds-07--shared-filters)), in [`app/shared/filters`](../../app/shared/filters). One filter system drives **every** collection — Today, Projects, Search and all lists — never a per-module filter bar. Its **pure model** (definitions, expressions, operators, evaluator, URL codec, saved-view data, display formatting) imports no React and is re-exported from a dedicated entry [`app/shared/filters/model`](../../app/shared/filters/model.ts), so a server-backed module can translate a filter expression into its own query layer without resolving any React or UI code (an import guard test enforces this). The React UI is exported separately from `~/shared/filters`. It builds on [DS-01 tokens](#design-tokens-ds-01) and its URL contract composes cleanly with the [DS-03 Drawer](#shared-drawer-ds-03); it is accepted in [ADR-019](../decisions/ARCHITECTURE_DECISIONS.md#adr-019-shared-card-identity--reorder-and-the-filter-expression--url-contract).

**Purpose.** Narrow any collection with a consistent, URL-backed control — the reusable "collection language" a module consumes by registering typed fields and supplying records.

> **Which filter model does a new collection use? (X-02, one sentence, no qualification.)**
> A collection that filters records **in the browser** — over supplied records, a fixture set, or a page it already holds — uses DS-07's `FilterExpression`, described below.
> A collection whose filters are executed **by a repository**, and *any* collection with **saved views**, uses the declarative view configuration in [`app/kernel/views`](../../app/kernel/views) ([ADR-082](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract), [`VIEWS_MODULE.md`](../development/VIEWS_MODULE.md)).
>
> The distinction is not stylistic. A `FilterExpression` names a FIELD and an OPERATOR, which is exactly right for a client-side evaluator and exactly wrong to persist — a stored view able to name a repository field is a persisted injection surface. The view configuration names DIMENSIONS from closed sets and lets the repository choose the predicate, which is what makes it safe to store and to restore from an untrusted URL. Today DS-07 drives the Activity feed and the design fixtures; Tasks and the cross-module `/views` surface use the view configuration. This is the whole of what [DEBT-49](../product/PRODUCT_DEBT.md#-debt-49--two-filter-models-coexist-ds-07-expressions-and-the-tasks-declarative-configuration--p3--resolved-2026-08-08-x-02) asked for, and there is no third model.

**Filter-definition contract.** A module registers `FilterFieldDefinition[]` ([`app/shared/filters/types.ts`](../../app/shared/filters/types.ts)): field `id` · `label` · `type` (value type) · optional `operators` override · `options` (enum/reference/multi-enum) · `allowMultipleClauses` · a client-side `accessor` (for local/fixture evaluation) · optional `formatValue` (chip display). Nothing here is business logic, and nothing here is React — the field definition stays framework-free. Custom value-control rendering (the seam DS-06 shared form controls plug into) is a **UI-only** concern: a consumer supplies a `FilterValueControls` registry (field id → renderer, from [`app/shared/filters/value-controls.ts`](../../app/shared/filters/value-controls.ts)) to the `FilterBar`, keeping React out of the model.

**Expression model.** A bounded, non-recursive `FilterExpression = { mode: "and" | "or"; clauses: FilterClause[] }`; each `FilterClause` is `{ id, field, operator, value? }`. It is serialisable, comparable (`expressionsEqual`, ignoring clause ids) and validated against the registered definitions — deliberately **not** a general query language or a recursive builder. Clause `id` is stable identity for React keys/focus/editing and is **not** part of the serialised URL.

**Generic value types & operators.** Value types: `text`, `boolean`, `enum`, `number`, `date`, `reference`, `multi-enum`. Operators are value-type appropriate (`OPERATORS_BY_TYPE`), so nonsensical combinations cannot be built:

| Type | Operators |
|---|---|
| text | contains · does not contain · equals · is empty · is not empty |
| enum / reference | is · is not · is any of · is none of · is empty · is not empty |
| multi-enum | is any of · is none of · is empty · is not empty |
| number / progress | equals · greater than · less than · between · is empty · is not empty |
| date | on · before · after · between · is empty · is not empty |
| boolean | is true · is false |

Each operator declares a value **arity** (`none`/`scalar`/`list`/`range`), so no-value operators show no value control and an invalid clause cannot be applied. The client-side evaluator (`matchesExpression`/`filterRecords`) is pure and deterministic: it handles missing/null values, compares dates by UTC calendar day (stable across timezone/UTC boundaries), leaves source data unmodified, and drops invalid clauses rather than throwing.

**Type-appropriate validation.** Validation enforces the field's declared value **type**, not just operator arity, so a clause restored from an untrusted URL cannot slip through with an inappropriate value: text requires a non-empty string; number requires a finite number (rejecting `NaN`/`±Infinity`, empty strings and arbitrary text; ranges require two finite numeric strings); date requires strict `YYYY-MM-DD` calendar dates (rejecting impossible dates, timestamps, booleans and numbers; ranges require two valid dates); enum/reference require string scalars and non-empty string lists; multi-enum membership requires non-empty string arrays; boolean uses no-value `is_true`/`is_false`. For enum/reference/multi-enum, **unknown option values are retained** for forward compatibility (a field's `options` may be partial or lazily loaded, and a saved view must not break when the option list changes) — only the value *type* is enforced. A field's `operators` override may only **narrow** the type's default set; a widening override is a field-definition bug that throws in development and is clamped to the safe intersection in production.

**AND/OR rules.** A single `mode` composes all clauses with AND (default) or OR (offered when it is meaningful — more than one clause). AND requires every clause; OR requires at least one; an empty expression matches everything. AND/OR is presented as a labelled radio group — understandable without colour.

**URL contract.** Filters live in the URL, never only in component state (`useFilterUrlState`). The encoding is **repeated, versioned and safely encoded** — not one opaque JSON blob:

```
/tasks?status=active&fv=1&f=status%3Ais%3A%22open%22&f=title%3Acontains%3A%22hi%22&fmode=or
```

- `fv` — a format version (forward-compatible; an unknown version is ignored wholesale).
- `f` — one per clause: `field:operator` for no-value operators, else `field:operator:<json-value>` (a small per-clause JSON scalar/array/range — correct for punctuation, spaces, Unicode and URL-reserved characters, and deterministic for our fixed value shapes).
- `fmode` — present only for `or` (AND adds no state).

Active filters survive refresh and copied links; Back/Forward restores prior states; unrelated parameters — including DS-03's repeated `drawer` parameters — are preserved, and opening/closing a Drawer preserves filters; filter changes don't reset scroll unnecessarily; empty filters remove all URL residue; equivalent states produce deterministic URLs; duplicate/single-valued fields have defined behaviour; clause count and encoded size are bounded.

**Malformed / deep-link behaviour.** Decoding is total and defensive: there is **no `eval`, no `Function`, no unsafe deserialisation** — only bounded `JSON.parse` in a `try/catch`. Malformed values, unknown fields/operators, oversized clauses and excess clauses are dropped safely (`sanitiseExpression`); an unknown version yields an empty expression; a hostile or huge URL is rejected/truncated rather than trusted.

**Filter Bar anatomy.** One reusable `FilterBar`: Add-filter (a focus-managed popover), active chips (edit + labelled remove), Clear-all, an AND/OR mode control (when meaningful), an optional result count (announced via a polite live region), and an optional saved-view selector with a modified indicator; it wraps/scrolls responsively and stays usable at 320px.

**Chips.** Each chip shows readable field/operator/value text (option labels for enums, not raw values), is its own edit trigger, and carries a separately-labelled remove control; state is never colour-only.

**Add/edit flow.** Choose field → choose a valid operator → enter/choose a value where required → apply; then edit or remove the chip. Changing the field resets incompatible operator/value state; no-value operators show no value control; invalid clauses can't be applied (with a clear message); cancelling leaves the filter unchanged; editing preserves the clause's stable identity; no entered value is silently discarded. Controls are restrained native elements until DS-06 replaces them behind the same contract.

**Saved-view adapter contract.** Storage-agnostic (`SavedViewAdapter`): `views` · `activeViewId` · `onSelect`/`onSaveRequested`/`onUpdateRequested`/`onDeleteRequested`. A `SavedView` is `{ id, name, expression, description?, createdAt?, updatedAt? }`. The Filter Bar exposes exactly these interactions — select, save-as, update and delete; it advertises **no** rename callback because it has no rename interaction yet (a saved-view *management* surface, incl. rename, arrives with X-02), keeping the contract honest. DS-07 **does not persist** saved views (no D1, no migration); a consumer supplies them (a fixture may hold them in memory). `isViewModified` compares the current expression to the active view; a view referencing an obsolete field fails gracefully (the obsolete clause sanitises away).

**Filtered-empty behaviour.** `FilterEmptyState` distinguishes *filtered-empty* (active filters match nothing → a clear-filters recovery, never a dead end) from *genuinely empty* (no records → teach the next action).

**Responsive & accessibility.** Every control has an accessible name; the menu/editor is keyboard-complete with correct focus management; Escape dismisses only the current editor; chips expose readable names and accessible removal; result-count changes are announced without excessive chatter; filtered-empty offers recovery; AND/OR reads without colour; touch targets meet the token; the bar works at 320px and 200% zoom, and long values wrap without page overflow.

**Correct vs incorrect usage.**

- ✅ Register typed field definitions and supply records; bind the expression to the URL with `useFilterUrlState`; render filtered records through the one DS-04 Card; use `FilterEmptyState` for the two empty states.
- ✅ Keep the model pure (evaluate/serialise without React); rely on the versioned repeated-parameter URL encoding.
- ❌ Build a per-module filter bar or hard-code Task/Project/Goal logic in the model; hold filter state only in component state; encode the whole state as one opaque JSON blob; expose nonsensical operator/value combinations; persist saved views to D1 here.

**Extension rules.** Add a value type/operator or a bar affordance to the **one** shared system (and document it here), never a per-module fork. Real product filter usages and server-side/saved-view persistence arrive with later items (Today, Projects, X-02) — this ships the system plus a development fixture only.

**Relationship to the TASKS-03 Tasks configuration (read this before adding a saved-view store).** DS-07's `FilterExpression` is a CLIENT-side clause builder and evaluator: an arbitrary field/operator/value expression, evaluated in the browser over supplied records. That is exactly right for a local collection, and exactly wrong to persist — a stored expression can name a repository field, so persisting one is persisting an injection surface. Tasks therefore stores a different thing: a **declarative configuration** that names filter DIMENSIONS from closed sets and no operators at all, which the repository maps to its own trusted predicates ([ADR-059](../decisions/ARCHITECTURE_DECISIONS.md#adr-059-the-tasks-collection-contract--one-declarative-view-configuration-server-side-filtering-and-grouping-and-saved-views-as-validated-configuration)). Both are legitimate; they answer different questions. Having two is honest but not free, and generalising the declarative contract to the other collections is recorded as [DEBT-49](../product/PRODUCT_DEBT.md#-debt-49--two-filter-models-coexist-ds-07-expressions-and-the-tasks-declarative-configuration--p3) rather than pretended away.

---

## Shared Timeline & Activity Feed (DS-05)

The [Timeline](#timeline) and [Activity Feed](#activity-feed) patterns above are realised by ONE reusable, entity-agnostic system: the **Shared Timeline & Activity Feed** ([DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed)), in [`app/shared/activity-feed`](../../app/shared/activity-feed). A record-scoped Timeline and a workspace/scope Activity Feed are **two configurations of the same component**, never forked. It renders the [shared Activity model](../../AGENTS.md#96-shared-activity-model) (FND-05) and invents no event source. It builds on [DS-01 tokens](#design-tokens-ds-01), reuses the [DS-03 Drawer](#shared-drawer-ds-03) for opening entities, the [DS-07 Filters](#shared-filters-ds-07) for filtering, and the PX-02 [EmptyState](#empty-state-px-02)/[Skeleton](#loading-states-px-02)/[Entity Identity](#entity-identity-px-02); it is accepted in [ADR-021](../decisions/ARCHITECTURE_DECISIONS.md#adr-021-the-shared-timeline--activity-feed--one-renderer-one-presentation-view-model-in-house-virtualisation).

**Purpose.** Show "what happened, when" — for one record (Timeline, suitable for the Activity tab of the [DS-02 Record Layout](#shared-record-layout-ds-02)) and across a workspace or scope (Activity Feed) — as calm, dense, chronological, filterable, virtualised history.

**One renderer, two configurations.** `ActivityStream` is the single renderer; `Timeline` (`scope="timeline"`) and `ActivityFeed` (`scope="feed"`) are thin presets. They differ only in the `loadPage` they receive (a Timeline's loader calls `activity.listForEntity(entityId, …)` — or, for a record whose history IS its relationships, `activity.listForEntities(anchorIds, …)`, still one Timeline over one stream; a Feed's calls `activity.listForWorkspace(…)`) and their accessible label. Grouping, the event item, filtering, pagination and virtualisation are shared by construction — there is **no** separate Timeline/Feed item or list.

**Public contract (entity-agnostic).** The component API exposes **no** D1, Cloudflare bindings, repository internals, cursor internals or workspace-selection controls. `ActivityStream` takes an opaque `loadPage(cursor) → { items, nextCursor, hasMore }` loader, an `ariaLabel`, an optional `formatter`, optional DS-07 `filterFields`/`filterExpression`/`onClearFilters`, an optional `renderEntityLink`, and virtualisation/height knobs. The route owns the `resolveWorkspaceScope(env).activity` call and the record→item mapping behind the loader; the **trusted workspace boundary is fixed server-side** and is never selected or overridden by client input through the component.

**One presentation view-model.** `toActivityItem(record, options)` (React-free, re-exported from [`~/shared/activity-feed/model`](../../app/shared/activity-feed/model.ts)) is the single boundary mapping a kernel `ActivityRecord` → a renderable `ActivityItem`. It **preserves** the branded `ActivityType`, the open validated-string actor/subject fields, the UTC `occurredAt` and the validated `payload` unchanged (no `any`), attaches each subject's resolved entity identity (resolved in **one batch** by the caller — the UI never fetches per item, so no N+1), and selects a primary subject deterministically (the Timeline anchor first). It preserves activity id (the dedup/merge key), activity type, timestamp, trusted actor, subjects and their roles, payload, and referenced-entity identity where available.

**Actor presentation (IDENT-01).** One shared `ActivityActorName` renders "who did this" on **every** activity surface — the workspace feed, every record Timeline, Diary, People, compact widgets and mobile — so the treatment never drifts. It shows the resolved display name with a small initials chip; the chip is `aria-hidden` (it duplicates the adjacent name) and is omitted for non-person actors, so `System` and `Unknown user` never read as someone. The name itself comes from the ONE canonical rule in `~/kernel/identity`: linked Person/profile name → workspace-member name → provider display name → verified email → `System` for genuine automated activity → `Unknown user` where an identity genuinely cannot be recovered. There is **no** anonymous placeholder — "Someone" does not exist in the product and a test fails the build if it reappears. The presentation view-model carries the label, initials and actor kind but **never** the actor's id: it is an authentication subject, and the item is serialised to the browser. See [`IDENTITY_AND_ACTORS.md`](../development/IDENTITY_AND_ACTORS.md).

**Event fallback rules.** A per-type `ActivityTypeDescriptor` is the only place a specific event gets a specialised rendering; the seven kernel-reserved lifecycle types (`entity.created/updated/deleted/restored`, `entity_link.created/unlinked/restored`) ship defaults, and modules register their own via `createActivityDescriptorMap`. There is **no** large product switch over Tasks/Projects/Goals/Areas/People/Notes/Diary. A **cross-module** surface must build its map with `buildWorkspaceActivityDescriptors` — kernel defaults → every module manifest's declared labels (FND-06) → the shared curated cross-module set — rather than a partial hand-maintained list, which is what previously made fully-registered events read as unrecognised; a test fails if any registered or kernel-persistable type loses its renderer. An unregistered or newly-invented type uses a conservative generic fallback that: stays readable; shows the humanised event type safely (the RAW dotted type is a development-only diagnostic, never production UI); shows the actor, the time and available subjects; **never crashes on an unfamiliar payload**; and **never dumps raw unbounded JSON** — the payload summariser emits only a bounded set of primitive top-level fields and skips nested objects/arrays entirely.

**Event item.** One shared `ActivityEventItem` renders every event: an entity marker (the [Entity Identity](#entity-identity-px-02) icon/accent where the event has an entity type, else a tone dot), an actor + action description with inline entity links, a semantic `<time datetime>` (short time-of-day, full timestamp as the title), optional restrained metadata and a safe payload-derived summary. It is calm and dense with **no heavy card border around every event**, long names/descriptions wrap (`overflow-wrap: anywhere`), meaning is **never colour-only** (every event has a text description and a time), and it is memoised so one item changing does not rerender the list.

**Grouping & ordering.** Events are totally ordered **newest-first by `(occurredAt, id)`** with `id`-descending tie-breaking (matching the kernel's `ORDER BY occurred_at DESC, id DESC`), grouped by **UTC calendar day** (stable buckets regardless of viewer timezone), and flattened to heading+item rows so one windowed list keeps day headings correctly associated. All day/time formatting flows through ONE `ActivityDateFormatter` (the central date seam) that formats **manually against UTC getters** with fixed month/weekday tables — **not `Intl`** — so server and client render byte-identical text (hydration-safe); relative "Today"/"Yesterday" are opt-in via a caller-threaded reference instant. Day headings are sticky, real `h2`/`h3`/`h4` headings that stay in the accessibility tree (correct outline, labelled day group); timestamps are semantic `<time>`.

**Filtering (reuses DS-07).** DS-05 builds no timeline-only filter UI. `createActivityFilterFields` produces DS-07 `FilterFieldDefinition`s over the `ActivityItem` view-model — at minimum **event type**, plus **actor type**, **referenced entity type** and **date** — handed to the shared [`FilterBar`](#shared-filters-ds-07). A module may also register its OWN DS-07 field over the same view-model when a coarser, more human control fits its surface better (the Person Timeline's relationship categories, [PEOPLE-02](../roadmap/ROADMAP_V2.md#-people-02--relationship-timeline)) — that is ordinary DS-07 adoption, not a DS-05 fork, provided the accessor stays pure and adds no operator. The DS-07 evaluator matches over loaded items, and filter state follows the DS-07 URL contract, preserving unrelated params **including the DS-03 `drawer` params**. It adds no product-specific operator and does not expand DS-07.

**Entity destinations (reuses DS-03 and the shared destination map).** A referenced entity opens **wherever that record type actually opens**, resolved by the ONE shared `entityDestination` helper ([Entity Identity](#entity-identity-px-02)): a Task through the [DS-03 Drawer](#shared-drawer-ds-03) over the current context, every other routable record through its canonical record route. A loader may still supply an explicit `drawerKey` and it wins. **No bespoke modal, no second drawer**, filters and page context preserved, keyboard-accessible. An entity that is deleted, inaccessible or has no implemented destination degrades to calm non-link text and discloses nothing (no cross-workspace leakage). *(Before PEOPLE-03 only an explicit `drawerKey` produced a link, so every timeline could open Tasks and nothing else — a Person's relationship history named the meeting or note an event came from but gave no way to open it.)*

**Pagination.** The stream integrates cursor-based paging: initial load, next cursor, load another page, end-of-feed, retry after failure, **deduplication by stable activity id** and deterministic page merging. Retrieval uses an accessible **Load more** control (not automatic infinite scroll as the only path); there are no unbounded "load everything" queries.

**Virtualisation.** Long streams are virtualised by a small **in-house** pure `computeWindow` core plus a measurement hook inside a **bounded scroll region** — **no data-grid dependency**. Only rows near the viewport render, positioned by measured offsets with top/bottom spacers that keep total scroll height stable, so variable-height content does not overlap or jump, day headings stay associated, and **loading more never resets the user's position** (new items append below). Mapping/grouping/filtering are memoised so they do not rerun unnecessarily, and no N+1 entity lookup is introduced.

**States.** Reusing the shared components: initial loading (Skeleton), genuinely-empty (EmptyState), filtered-empty (DS-07 `FilterEmptyState` with a clear-filters recovery), loading-more, page-load failure with retry (the `role="alert"` convention), end-of-feed, unknown-event-type (the safe fallback) and unresolved-subject.

**Accessibility.** WCAG 2.2 AA: a `role="feed"` region with an accessible name and `aria-busy`; articles with `aria-posinset`/`aria-setsize`; accessible day-group headings (real `h3` in the a11y tree); a logical heading hierarchy; semantic `<time>`; visible focus on keyboard-accessible entity links and controls; a polite live-region announcement of newly-loaded events; non-colour event meaning; adequate touch targets; correct behaviour at 320px and 200% zoom; and reduced-motion compliance. Virtualisation preserves keyboard and screen-reader usability.

**Responsive behaviour.** Calm and dense on desktop, no horizontal overflow from 320px up (metadata wraps, long tokens break), touch targets meet the 44px token, and light/dark parity comes from the semantic token maps. In narrow containers, the event timestamp collapses below the event body so long activity copy and time labels never compete for a third column or widen the page.

**Correct vs incorrect usage.**

- ✅ Drop a `Timeline` into a DS-02 Activity tab, or an `ActivityFeed` into a workspace surface, by supplying one `loadPage` and (optionally) descriptors + a batch entity resolver; register your module's event descriptors; filter via DS-07 fields; open entities via DS-03.
- ✅ Keep the mapping/model pure; let the route own the repository call and trusted scope behind the loader.
- ❌ Fork a separate Timeline and Feed; pass a repository/D1/binding into the component; build a product switch over entity/event types; dump raw payload JSON; add a virtualisation or drawer/modal dependency; select the workspace from client input; convey event meaning by colour alone.

**Extension rules.** A new module renders its event types by **registering descriptors** (and, if needed, adding filter options) — never by editing DS-05. Add a value type/affordance to the shared system only when a real surface needs it, and document it here; never fork per module. Real product Timelines/Feeds arrive when a module adopts DS-05 (e.g. [PROJ-04](../roadmap/ROADMAP_V2.md#-proj-04--activity)); DS-05 ships the system plus a development fixture only. See [`ACTIVITY_TIMELINE.md`](../development/ACTIVITY_TIMELINE.md).

---

## Shared summary cards (DS-13)

The at-a-glance aggregates a record's [Summary Panel](#summary-panel) shows are realised by ONE reusable, entity-agnostic grid: **Shared summary cards** ([DS-13](../roadmap/ROADMAP_V2.md#-ds-13--shared-summary-cards)), in [`app/shared/summary-cards`](../../app/shared/summary-cards). Introduced by [PEOPLE-03](../roadmap/ROADMAP_V2.md#-people-03--stay-in-touch-signals), which needed "one fact per tile" for a Person's relationship summary and found three near-identical hand-rolled versions already in the product (Projects, Assets, Today's widgets) — the shape [DEBT-01](../product/PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p2) warns about.

**Purpose.** Present a small set of already-derived facts — a label, a value, an optional supporting detail — so a record answers its headline questions without a click, and so **no aggregate dead-ends on a number**.

**Anatomy.** A responsive grid (`auto-fill` + `minmax`, reflowing to a single column) of tiles. Each tile carries: an uppercase **label** (what the value is), the **value**, an optional **detail** line, an optional decorative icon, and an optional `tone` (`neutral`/`success`/`info`) that tints the value only.

**Navigation.** A tile with an `href` becomes **ONE link for the whole card** — never a card wrapping a separate link, which would give one target two tab stops. Its accessible name defaults to `"<label>: <value>"`, so a screen-reader user hears what they are following before they follow it.

**Semantics.** The grid is a `<ul>` of `<li>`s with an accessible name (`label`, or `labelledBy` pointing at a visible heading), so assistive tech announces "list, N items". The label always states the meaning; colour never carries it. Every tile clears the shared 44px touch target (`--app-control-height-lg`) at every width, and the grid never produces horizontal overflow from 320px up (DS-11).

**Boundaries.** DS-13 lays out; it does **not** fetch, derive, format or decide. Callers pass already-derived, already-formatted strings — a loader evaluates the model server-side (see [Health](#health-signal-proj-02) and [Stay-in-touch](#stay-in-touch-signal-people-03)) and a pure module view-model maps it to `SummaryCardItem[]`.

**Correct vs incorrect usage.**

- ✅ Compose a Summary region as a heading + `SummaryCards` with `labelledBy` pointing at it; give each aggregate a destination in the surface that opens the records behind it.
- ✅ Omit a card whose count is zero when the absence reads better as an invitation than as a scoreboard entry — but always keep the cards whose absence IS the answer.
- ❌ Fork a module-specific stat grid; compute or format inside the component; nest an extra link inside a linked tile; convey meaning by tone alone; render a `0` for every empty aggregate.

**Extension rules.** Add a slot to the shared component when a real surface needs it, and document it here — never a per-module variant. The tone vocabulary stays a strict subset of the shared one.

---

## Shared Forms & field controls (DS-06)

The [Forms](#forms) pattern above is realised by ONE reusable, **entity-agnostic** forms system (the **Shared Forms** system, [DS-06](../roadmap/ROADMAP_V2.md#-ds-06--shared-forms--field-controls), in [`app/shared/forms`](../../app/shared/forms)). There is no `TaskForm`/`ProjectForm`/`NoteForm`: consumers supply typed values, field definitions, validation and persistence callbacks and compose the shared controls, the form host and the declared save model. The shared UI knows nothing of Tasks/Projects/Goals/Areas/People/Notes, D1/SQL, workspace selection, routes, product modules or a central entity-type switch — server loaders/actions keep the trusted workspace scope and data access. It builds entirely on [DS-01 tokens](#design-tokens-ds-01), renders Markdown through the [FND-08 pipeline](../development/MARKDOWN_PIPELINE.md), creates relationships through the [FND-04 EntityLink kernel](../../AGENTS.md#95-entitylinks), and is accepted in [ADR-022](../decisions/ARCHITECTURE_DECISIONS.md#adr-022-shared-forms--field-controls--declared-save-model-validation-boundary-and-the-entity-link-picker).

**The control baseline (UIX-06).** Height, padding, surface, border, corner and — for a `<select>` — the disclosure chevron are stated ONCE, at the element, in [`base.css`](../../app/styles/base.css), for every native `input`/`select`/`textarea` whether or not a module reached for a shared field. The rung is `--app-control-height-lg` on `--app-shape-control`, which is the rung `.dh-btn` takes, so a field and the button beside it in a filter row are the same object. A module never restates it: three local copies existed before UIX-06 and all three had drifted.

A `<select>` is **repainted, never replaced** (D31): `appearance: none` changes only how the closed control is painted, so the platform picker on touch, the native keyboard behaviour, the assistive-technology semantics and the no-JS form submit are all preserved. The chevron is a gradient pair rather than an asset, so it takes `currentColor` and is correct in both appearances and in forced colours by construction. **A class that sets the `background` SHORTHAND on a select clears it** — set `background-color`.

**Public anatomy.** A small, typed surface (`app/shared/forms/index.ts`), plus a **React-free model** entry ([`~/shared/forms/model`](../../app/shared/forms/model.ts)) imported by non-UI code:

```text
Form            <form> wrapper (owns nothing but layout + aria-busy)
  FormErrorSummary   assertive summary; links/focuses each invalid field
  FormSection / FieldGroup   grouped fields (fieldset/legend semantics)
  Field         shared anatomy: label · required/optional cue · help · error
    <control>   TextField · DateField · SelectField ·
                ToggleGroupField · TagsField · BooleanField ·
                EntityLinkPicker
  FormActions   explicit Save / Cancel (FormButton: pending + disabled)
  SaveStatusIndicator   calm autosave status (Unsaved/Saving/Saved/Couldn't save)
```

**Field contract.** Every control accepts the same anatomy + binding props (`label`, `value`, `onChange`, `onBlur`, `error`, `help`, `required`, `disabled`, `readOnly`, `id`, `controlRef`), so a control is usable standalone or bound to a form host (`<TextField {...form.field("title")} />`). `Field` builds a consistent, accessible layout: a stable control id and derived description ids, a **visible** label, an explicit **required/optional** cue (words, never colour), optional help, the current validation message, correct `aria-describedby`/`aria-invalid`/`aria-errormessage`, full-width narrow-container-safe layout, and semantically distinct **disabled vs read-only**. User input is never trimmed or mutated unless the field contract asks for it.

**Controls (one per field type).** **Text** (single/multi-line, optional length readout, real `maxLength`, correct `autocomplete`). **Markdown source** (edits FND-08 source, preserved verbatim; a safe preview through the ONE `MarkdownContent` sink — no second parser, no new HTML sink; not the Notes editor). **Date** (unambiguous date-only + UTC datetime; see below). **Select** (single or multi; accessible editable combobox/listbox; client filter or async `onSearch`/`loading`; a stale/unavailable value is shown and labelled, never a crash). **Toggle group** (HABITS-01 — a small, already-familiar closed set, several of which may be on at once: real checkboxes in a labelled `role="group"`, painted as wrapping pill toggles, each with its own `accessibleLabel` so an abbreviated face is announced in full; the whole vocabulary is visible with nothing to open, and it wraps rather than scrolls on a phone. `SelectField multiple` remains the answer for a long or unfamiliar set — see [Selection controls](#forms)). **Tags** (controlled string collection; keyboard add/remove; normalisation, duplicate prevention, configurable limits; no tags database). **Boolean** (native checkbox or switch; clickable label; never colour-only). **Entity-link picker** (below).

**Validation.** Predictable and layered: synchronous field validators (first failure wins), optional async/server validation, validation **on blur** and **on explicit submit**, form-level and field-level errors with specific, recovery-oriented messages. A submit is **blocked while any value is invalid**; the first invalid field is **focused** after a failed submit; **every entered value is preserved** when validation or persistence fails; stale async responses are ignored; the **server is authoritative** (server field/form errors are shown even when client validation passed). Raw exceptions, database errors, stack traces and opaque codes are never surfaced. The error summary is an assertive live region that links/focuses the relevant field.

**Explicit save.** `useForm` for surfaces where commitment matters: clear **Save**/**Cancel**, dirty-state tracking (honouring per-field `isEqual`), disabled/pending behaviour that **prevents duplicate submits**, keyboard submission, server errors that preserve the complete draft, and a Cancel that restores the last committed value. A submission commits its own **immutable snapshot** as the new baseline, so an edit made while the save is in flight stays dirty and is never silently discarded; a reset or unmount cleanly abandons an in-flight submission.

**Autosave.** `useAutosaveField` for field-by-field editing: a **documented, deterministic trigger** (a restrained debounce and/or a valid blur), calm and visible `Unsaved`/`Saving`/`Saved`/`Couldn’t save` states (announced politely, no per-keystroke toast), stale responses that cannot overwrite newer edits, overlapping saves that are **sequenced/coalesced to the latest** value, failed saves that keep the user's latest input with an explicit **Retry**, and no save while invalid. The user can always predict when a value is committed.

**Navigation safety.** While an explicit form is dirty, both in-app navigation (via `UnsavedChangesGuard` → an accessible modal confirm) and full-page unload (the browser prompt) are intercepted, so a draft is never silently discarded. Because a DS-03 [Drawer](#shared-drawer-ds-03) close/replace is a same-pathname, `drawer`-search-param navigation, a form hosted in a drawer passes its `drawerKey`: the guard then blocks any navigation that removes that drawer level (close, Escape, Back, `closeDrawer`, `replaceDrawer`, param removal, replacing the top record) while allowing harmless changes (a deeper drawer pushed on top, an unrelated filter). The confirm is a real modal: `inert` background, Tab/Shift+Tab trapped, initial focus on Stay, Escape chooses Stay, focus restored to the initiating control on Stay.

**Markdown.** DS-06 has **no** Markdown control of its own, and `~/shared/forms` exports none (DOC-EDITOR-01 / [ADR-084](../decisions/ARCHITECTURE_DECISIONS.md#adr-084-long-form-markdown-is-edited-on-a-permanent-shared-writing-surface--there-is-no-read-then-activate-variant)). A form that needs a Markdown field uses `MarkdownEditorField` from [`~/shared/markdown-editor`](#shared-writing-surface-edit-01) — the shared writing surface wearing this field anatomy. It lives outside the forms barrel on purpose: that barrel is imported by nearly every route, and a route rendering one text input should not pull the editor into its bundle. The control this replaced (a source textarea plus a "Show preview" disclosure) had no product consumer left and is deleted; "short Markdown" is still Markdown, and the surface's `compact` density is that case.

**Writing editor (live Markdown).** `~/shared/markdown-editor`'s `LiveMarkdownEditor` ([NOTES-05](../roadmap/ROADMAP_V2.md#-notes-05--writing-first-markdown-editor), [ADR-044](../decisions/ARCHITECTURE_DECISIONS.md#adr-044-the-writing-first-live-markdown-editor--adopting-codemirror-6-as-an-authoring-surface-over-the-unchanged-fnd-08-source-and-render-pipeline)) is the ONE writing-first editor for long-form Markdown records (Notes now; the Diary body is the intended second consumer). It styles the Markdown **source as it is typed** (Obsidian-style Live Preview — headings grow, emphasis/code style, task items become checkboxes, thematic breaks and tables render), revealing the raw source the instant the caret enters a construct (Live Preview, **not** WYSIWYG). Load-bearing rules a consumer must not break: the editor's document IS the Markdown source, byte-for-byte (`onChange` emits exactly that); it renders **no** HTML itself and adds **no** second parser/sanitiser/HTML sink — the FND-08 `MarkdownContent` stays the only sink, and the unobtrusive **Read** toggle renders through it; there is **no** persistent Source/Split/Preview and **no** rich-text/proprietary document model. It composes DS-06 autosave (`useAutosaveField`, `SaveStatusIndicator`, `UnsavedChangesGuard`) rather than a second save engine, exposes the shared roving-tabindex formatting `EditorToolbar` and editor-scoped keyboard shortcuts (never rebinding the reserved global `⌘K`/`/`), is styled only through DS-01 tokens, and degrades to an accessible controlled `<textarea>` on the server / without JavaScript.

**Button sizes.** `FormButton` renders one shared `.dh-btn` in the M3 variants — filled (`--primary`), tonal (`--secondary`), outlined (`--outlined`), text (`--ghost`) and error-filled (`--danger`). ASSET-02 added ONE size modifier, **`.dh-btn--sm`**, for dense action rows — an Asset obligation's Complete / Edit / Create task / Hold / Dismiss group, a history entry's Edit / Remove. It reduces the horizontal padding and the type size **only**: `min-block-size` stays at `--app-control-height-lg`, so a "small" button is still a 44px touch target. **Compact must never mean unreachable on a phone** (AGENTS.md §15, WCAG 2.2 §2.5.8). There is no `--lg`, no `--xs`, and no per-module button size.

**Numeric keypads.** `TextField` accepts `inputMode="decimal"` alongside `numeric`, so a money field offers a decimal-point keypad on a phone while a meter reading offers a whole-number one. The attribute is a keyboard hint, never a validation: the boundary is still the authority.

**Dates.** A date-only value is the literal ISO `YYYY-MM-DD` string, validated and compared as integers and **never routed through `Date`**, so it cannot shift by timezone. A datetime value is an ISO-8601 UTC instant; the control edits the UTC wall-clock explicitly (labelled). A zone-less wall-clock time is deliberately not a field type.

**Entity-link picker.** ONE entity-agnostic picker for creating and managing [FND-04 EntityLinks](../../AGENTS.md#95-entitylinks). It takes typed configuration (anchor entity, permitted target types, link-type descriptors, direction, single/multiple, an async workspace-scoped `searchTargets` loader, existing links, and `onLink`/`onUnlink` callbacks) and **never imports D1, bindings or repositories**. That client configuration is **presentation only**: the AUTHORITY is a server-supplied `EntityLinkPickerPolicy` enforced by `createLinkWithPolicy` in the server service ([`app/platform/entity-links`](../../app/platform/entity-links)), which validates the untrusted `targetId`/`linkType`/`direction` (allowed direction, permitted link type, allowed target entity type, no self-link, anchor/target accessible, single-selection limit) before delegating to the existing FND-04 repository (workspace scope + Activity actor stay server-side, reserved spine types refused) and returns a typed, safe outcome — never a raw repository error. No second relationship model, no migration. The picker excludes the anchor from its own results, prevents duplicate active links, de-duplicates, bounds result sizes, serialises its create/remove actions, handles deleted/stale/inaccessible targets calmly, keeps kernel identifiers while showing user-language labels, and never leaks an inaccessible entity's title. Its `searchTargets` contract lets [DS-08](../roadmap/ROADMAP_V2.md#-ds-08--shared-search) supply real search later without replacing the picker.

**Accessibility.** WCAG 2.2 AA: every field has an accessible name; errors and save-status changes are announced via live regions; all controls are keyboard-complete (including the combobox/listbox and tag add/remove); logical focus order and visible focus; first-invalid-field focus on failed submit; 44px touch targets; no colour-only state; disabled and read-only are semantically distinguishable. On touch/coarse-pointer devices, text inputs, comboboxes, clear/remove buttons, link-picker controls and retry buttons lift to the shared touch-target floor.

**Responsive behaviour.** Controls are full-width and safe from 320px up (no horizontal overflow), usable at 200% zoom, and correct in light and dark; motion honours `prefers-reduced-motion`.

**Correct vs incorrect usage.**
- ✅ Compose shared controls + `useForm` (explicit) or `useAutosaveField` (autosave), passing validators and a persistence callback; declare the save mode explicitly; relate records with `EntityLinkPicker` wired to a loader/action over the picker service; validate again at the server boundary.
- ❌ Build a bespoke per-entity form or a one-off field control; infer the save mode; import D1/a repository into a shared control; render Markdown through a second parser or a new HTML sink; round-trip a calendar date through `Date`; convey required/invalid/saved state by colour alone; leak a raw server error to the user.

**Extension rules.** Add a field type or affordance to the **one** shared system (and document it here) only when an existing repository requirement makes it clearly necessary — never fork per module, never add a second control for a field type. Keep the public API small; do not export internal state-machine/timing/focus machinery. Real product forms adopt DS-06 as-is; long-form Markdown records use the [Writing editor](#shared-forms--field-controls-ds-06) (`~/shared/markdown-editor`), which composes DS-06 autosave rather than forking it. DS-06 ships the system plus a development fixture only. See [`SHARED_FORMS.md`](../development/SHARED_FORMS.md).

---

## Linked Items & Hover Card

The **Universal Relationship System** realises "everything is connected"
([`AGENTS.md §2`](../../AGENTS.md#2-product-philosophy)) as ONE reusable surface,
in [`app/shared/linked-items`](../../app/shared/linked-items) — there is no
`ProjectLinksTab`/`PersonLinkedTab`/bespoke-per-module linked list; a hand-rolled
one is [Product Debt](../product/PRODUCT_DEBT.md) the moment it merges. Accepted in
[ADR-047](../decisions/ARCHITECTURE_DECISIONS.md#adr-047-the-universal-relationship-system--one-shared-linked-items-surface-a-generic-links-endpoint-wiki-links-and-linked-boosting); full guide: [`RELATIONSHIPS.md`](../development/RELATIONSHIPS.md).

**Linked Items section.** Every record's detail page mounts `LinkedItemsTab`
(anchor id + type). It renders the record's related items grouped by kind — each a
navigable [EntityLink](#cards) wrapped in a **Hover Card** — with a Remove control
for the generic links the user owns, and the shared DS-06 [EntityLinkPicker](#shared-forms--field-controls-ds-06)
as the **search-to-add** affordance. It builds on the FND-04 EntityLink kernel and
the DS-06 policy service through the one shared `/links` endpoint; it never adds a
second relationship model or a per-module link route. Add/remove are **optimistic**
with a DS-10 **Undo** toast, **offline-aware**, and keyboard-complete; structural
spine links are shown by the hierarchy, not here.

**References — reading the graph directionally (NOTES-02).** Linked Items answers
*what is this related to?* as one editable list. A knowledge record needs a second
question answered: **who points at me, and who do I point at.** That is
[`app/shared/references`](../../app/shared/references) — a separate, isolated
shared contract that READS the same FND-04 graph; it never creates or removes a
relationship, and Linked Items stays the one place relationships are edited. Use
it whenever a record's own detail page should distinguish the two directions.

- **Backlinks and Outgoing links are separate surfaces, never one merged list.**
  Merging them produces an ambiguous "related" pile that answers neither question.
- **A backlink is an explicit typed relationship or a supported entity reference
  — never a text coincidence.** Writing a record's title in prose creates nothing.
  Say so in the surface, not only in the docs.
- **`ReferenceList` is the one row treatment**: the counterpart's identity glyph
  (decorative), its **type in words**, the **relationship name in words**, an
  optional bounded **context** line, the linked date, and the title as the shared
  navigable `EntityLink`. Archive state is a **word**, never colour or a glyph
  alone. Grouping by counterpart type is opt-in, in first-seen order.
- **Context is bounded, deterministic and safe**: block-scoped, syntax-free,
  truncated with an explicit ellipsis, and absent rather than guessed when the
  source type cannot supply it.

**Command Palette.** Mounting the tab registers a `⌘K` **navigate** action ("Link a
record to this …") that opens the Linked tab — a navigation action, never a
focus-moving `run` ([`COMMAND_PALETTE.md`](../development/COMMAND_PALETTE.md)).

**Hover Card.** `HoverCard` shows a linked record's summary on pointer hover **and**
keyboard focus (never hover-only). It is a non-interactive `role="tooltip"`
associated with its trigger via `aria-describedby`, opens after a short intent
delay, closes on blur/pointer-leave/Escape, lazily fetches its summary once, and
respects `prefers-reduced-motion`. Summaries carry only non-sensitive structural
metadata — safe for People and Diary.

**Wiki links.** Markdown supports inline `[[Title]]` / `[[Title|Alias]]`, rendered
through the ONE FND-08 pipeline (a pure transform → an internal resolver link — no
second parser or HTML sink) and resolved to a record at navigation time. See
[`RELATIONSHIPS.md`](../development/RELATIONSHIPS.md).

**Extension rules.** Add an affordance to the one shared system (and document it
here) only when a real record needs it; never fork the section, hover card, or link
endpoint per module. Linked meetings/notes/etc. become navigable by extending the
shared `entityDestination`, never a per-module route `switch`.

---

## Global Interaction Layer (DS-10)

The product-wide interaction layer every module inherits: **notifications, undo, background operations** (one Feedback platform) and the shared **Inspector**. There is **one implementation for the entire application** — no module renders a toast or builds its own edit drawer. Accepted via [ADR-025](../decisions/ARCHITECTURE_DECISIONS.md#adr-025-the-global-interaction-layer--feedback-platform-notifications-undo-background-operations-and-the-shared-inspector). Full guide: [`FEEDBACK_AND_INSPECTOR.md`](../development/FEEDBACK_AND_INSPECTOR.md).

### Feedback platform

- **The hidden API.** Modules call `useFeedback()` ([`app/shared/feedback`](../../app/shared/feedback)) — `notifySuccess/notifyInfo/notifyWarning/notifyError`, `notifyUndo`, `runOperation`, `dismiss`. The queue, timers, live regions and operation tray are completely hidden. `FeedbackProvider` is mounted once at the AppShell boundary.
- **Calm notifications.** Four tones (icon + text, never colour alone). Repeats with a `dedupeKey` **coalesce** (count bumps) instead of stacking — no toast spam. Auto-dismiss is per-tone (success/info brief, warnings longer, **errors sticky**); the stack is bounded (oldest auto-dismissing entry retired first, never a sticky error); **focus, or hovering a toast's controls, pauses** dismissal.
- **Never intercepts a click.** The region is `position: fixed` over the bottom-right of the page — exactly where record lifecycle actions live — so **nothing in it takes pointer input except its own controls** (dismiss-all, a toast's action, a toast's close). Toasts stay visible and their controls stay operable; every other pixel passes the click through. A shared surface that overlays the page must never make the page unusable beneath it.
- **Undo is a platform capability.** `notifyUndo(title, { onUndo, onExpire? })` raises a success toast with a time-boxed Undo. Choosing Undo runs the reverse handler; letting it expire OR dismissing early runs the commit handler (dismissing an optimistic action commits it). Every reversible action (delete/archive/complete/move/close/dismiss) uses this — never per-module undo.
- **One background-operation lifecycle.** `runOperation({ label, run, cancellable?, retryable?, successMessage? })` drives pending → running → success | failure with **retry** and **cancellation** (a real `AbortSignal` passed to `run`) — for AI, imports, exports, sync and future integrations.
- **Accessibility.** Two visually-hidden ARIA live regions (polite for success/info, assertive for warning/error) announce feedback, using bare `aria-live` so they never shadow other `status`/`alert` regions. A caller may pass `announce: false` only when it has already written the same committed outcome to a module live region that remains mounted; the visible notification still renders. 44px targets, keyboard-operable actions, reduced-motion honoured, anchored so it never covers primary UI (bottom-right desktop, bottom safe-area mobile).

### Inspector

- **The standard depth-editing surface.** [`app/shared/inspector`](../../app/shared/inspector). A surface mounts `InspectorProvider` and supplies `renderInspector(entry)` (the DS-03 `renderDrawer` contract); open state lives in the URL (`?inspector=<key>`, deep-linkable). No module builds its own edit drawer.
- **Two presentations.** Desktop: a **non-modal, resizable** right-side `complementary` panel (keyboard + pointer resize, persisted width; content reflows so it is never covered; the page stays interactive for bulk/multi-select). Mobile: a **modal sheet** — focus-trapped, inert background, scroll-locked — **reusing the DS-03 focus/inert/scroll-lock hooks** (no second focus-trap). Focus moves in on open and restores on close in both.
- **Edits via DS-06.** The Inspector body is built from shared form controls with optimistic field-by-field autosave. Depth here; essentials in the Summary/Drawer — never duplicate the control.
- **Chrome via DHDS-03.** The Inspector consumes the same `PanelHeading`, body
  and footer grammar as Drawer and Sheet. Docking and resizing do not justify a
  second title scale, close button or section rhythm.

**Extension rules.** Use `useFeedback()` for any feedback — never a bespoke toast/banner or a second overlay system. Use the Inspector (not a new drawer) for any record editing. Keep the public API small; do not export internal timing/queue/focus machinery.

---

## Settings layout (DS-10b)

ONE entity-agnostic Settings surface every module composes for **application,
workspace, module and record-level** settings, and for the final **Settings**
tab/section of a record Inspector or Drawer ([`app/shared/settings`](../../app/shared/settings)). There is **no bespoke settings screen**. Accepted via [ADR-026](../decisions/ARCHITECTURE_DECISIONS.md#adr-026-shared-settings-layout--composition-primitives-declared-change-behaviour-and-the-dangerous-action-contract). Full guide: [`SETTINGS_LAYOUT.md`](../development/SETTINGS_LAYOUT.md).

### Structure

- **`SettingsLayout`** — the surface root: an accessible `region`, an optional
  heading + description (omit it when the host supplies the title — a Drawer,
  the Inspector, or a record tab), and calm rhythm between groups. It is a
  **container-query** surface: it adapts to its own width, so the same layout is
  correct in a full route and in a 320px Drawer.
- **`SettingsGroup`** — a labelled section. `tone="danger"` renders the
  visually-separated dangerous region (bordered/tinted card + warning glyph);
  the differentiation is carried by heading text, icon **and** border — never
  colour alone.
- **Mobile confirmations.** Confirmation dialogs respect safe-area insets, scroll
  internally on short phones, and stack their actions into full-width touch targets
  below 30rem. Dangerous actions keep the same confirmation friction on mobile;
  they are never hidden behind a gesture-only shortcut.
- **`SettingsRow`** — one setting: label · supporting description · control area ·
  optional status/help line, side-by-side when there is room and stacked when
  narrow (no horizontal overflow, no clipped text). It accepts any accessible
  control — a bare native switch/select (named by the row via
  `aria-labelledby`/`aria-describedby` through a render-prop), a DS-06 field, a
  button, or a custom module control — with no double-labelling.

### Change behaviour (declared, not invented)

- **Immediate** (apply on change): `useImmediateSetting` — optimistic value,
  single-flight with coalesce-to-latest, stale-response rejection,
  **revert-on-failure**, success/error through the DS-10 Feedback platform. For a
  toggle/select that applies at once.
- **Autosave** (quiet, keep-the-draft): DS-06 `useAutosaveField` + inline
  `SaveStatusIndicator`.
- **Explicit-save** (dirty draft + Save/Cancel): DS-06 `useForm` — pristine ·
  dirty · validating · saving · saved · save-failed · retry · reset/revert, with
  duplicate-submit prevention and first-invalid focus.

DS-10b adds **no** second form engine, validation system, autosave hook,
dirty-state model, toast system, overlay or focus-trap, and no settings registry.

### Dangerous actions

`DangerousAction` (and the reusable `ConfirmationDialog`) provide the destructive
pattern: visual separation, clear consequence text, a deliberate confirmation with
optional **typed confirmation** (an exact phrase, e.g. `DELETE`), disabled/loading
states, an inline `alert` on failure with **retry**, duplicate-submission
prevention, cancellation, and shared Feedback for success. The dialog is a WAI-ARIA
modal **reusing the DS-03 focus/inert/scroll-lock hooks** (no second focus-trap);
initial focus goes to the typed input or the safe Cancel button (never the
destructive one), and focus is restored to the trigger on close. It is the
presentation/interaction contract only — it encodes no product deletion/archive
rule.

**Extension rules.** Compose these primitives for any settings surface at any
scope — never a bespoke settings screen. Reuse DS-06 for save behaviour and the
DS-10 Feedback platform for confirmation; never build a second confirmation modal
or toast. Keep product rules (what a setting persists, what a destructive action
does) in the adopting module.

---

## Application Frame (PX-02)

The shared patterns above are composed by ONE application frame ([PX-02](../roadmap/ROADMAP_V2.md#-px-02--product-frame), [`app/shared/shell`](../../app/shared/shell)), accepted in [ADR-020](../decisions/ARCHITECTURE_DECISIONS.md#adr-020-the-application-frame--sidebar-shell-pane-collection-layout-and-entity-identity). It replaces FND-09's website-like top bar with a premium application silhouette and is the frame **every future module inherits** — it must feel like Linear/Craft/Raycast/Things, not a website. The frame implements the composition contract in [`PRODUCT_EXPERIENCE.md`](PRODUCT_EXPERIENCE.md) (which governs feel; this document governs each part's anatomy). It builds entirely on [DS-01 tokens](#design-tokens-ds-01), reuses DS-02…04/DS-07 unchanged, and adds **no runtime dependency**.

### The frame

```
╔══════════════╤═══════════════════════════════════════════════╗
║ ◆ DalyHub    │ [ ⌕ Search DalyHub    / ]      ⌘  ?   [ + New ]║  56px bar
║ ░░░░░░░░░░░░ ├───────────────────────────────────────────────┤
║ ▪ Today      │  Page title · count            [view] [ + ]   │  ← one origin:
║ ⬢ Areas      │  FilterBar (sticky, when a collection)        │    rail + gutter
║ ◎ Goals      ├───────────────────────────────────────────────┤
║ ▚ Projects   │                                               │
║ ⦿ Tasks      │   pane content (the document scrolls)         │
║              │                                               │
║ ▤ Notes      │                                               │
║ … (spacer)   │                                               │
║ ──────────── │                                               │
║ (A) Owner  ▾ │                                               │
╚══════════════╧═══════════════════════════════════════════════╝
  ↑ THE RAIL — dark in BOTH appearances (D35), 216px, 36px rows.
    ░ = the current destination: a violet block + weight + foreground
    step + aria-current. Never colour alone.
  Rail: --dh-color-rail / --dh-color-rail-text.  Pane: --dh-color-bg.
  Grid: var(--dh-shell-rail-width) 1fr.
```

- **Layout.** `AppShell` is a grid `grid-template-columns: var(--dh-shell-rail-width) 1fr`. The **document** is the scroll container and the sidebar is `position: sticky` — this preserves the [Drawer](#shared-drawer-ds-03)'s body-scroll-lock and `ScrollRestoration` (which act on the window) while sticky Pane Headers and FilterBars still pin to the viewport (ADR-020 §20.2). There is exactly one frame; no surface builds its own.
- **Three compositions, not two (DS-03).** ≥`lg` the labelled rail; `md`–`lg` a 68px glyph rail; below `md` the phone bar. See the [page frame](#the-page-frame-ds-03) for the measurements and [D38](DALYHUB_DESIGN_SYSTEM.md#5-documented-departures-from-stock-material) for why the middle one is a media query rather than a preference.
- **Landmarks.** The TOP BAR is the desktop `banner` and `MobileTopBar` is the phone's — exactly one per viewport. Primary navigation is a labelled `navigation`, and it contains the brand block and the account block, so both are inside a landmark without claiming to be one. The pane is `main` (the skip-link target); the Pane Header is a plain container (not a second banner). Keyboard-complete, skip link preserved, focus never lost.

### Sidebar

**Purpose.** The one element that never changes between surfaces — product identity, primary navigation, and the owner's account.

**It sits TWO TONES UNDER ITS OWN CANVAS, in both appearances (DS-03, amended by FINAL-UI).** DS-03 made the rail near-black in light as well as in dark; the three approved product concepts draw a near-WHITE rail under a white page, so the value follows the appearance again and what stays fixed is the relationship — the rail is recessed relative to the page it frames, in light (96 under 98) and in dark (8 under 10) alike. That is what keeps it one object across the two now that it is no longer one hex.

It still has its own colour family (`--dh-color-rail`, `-text`, `-text-muted`, `-text-selected`, `-border`, `-selected`, `-focus`), and the reason survives the reversal: its foregrounds are chosen against ITS surface rather than against the appearance's, so a component painting on the rail asks for "the rail's text" by name and is correct in both without knowing which it is in. That naming is what let the re-tone be four numbers in the generator rather than a rewrite. See [D35–D38](DALYHUB_DESIGN_SYSTEM.md#5-documented-departures-from-stock-material), [ADR-094](../decisions/ARCHITECTURE_DECISIONS.md#adr-094-the-dark-navigation-rail--a-region-that-does-not-follow-the-appearance-a-responsive-tablet-collapse-and-one-origin-for-the-frame) and [ADR-096](../decisions/ARCHITECTURE_DECISIONS.md).

**Anatomy.** Brand (mark + **DalyHub**, with a differently-named workspace beneath it as secondary context — BRAND-01) · primary navigation (icon + label rows, never text-only) · spacer · one hairline · [User Menu](#user-menu-px-02). The mobile OVERLAY additionally carries the Search entry (`/`) and the Command Palette entry (`⌘K`), because a phone has no top app bar of that kind. Built to absorb future **badge counts, favourites and workspaces** without a redesign.

**Anatomy, in numbers.** Rail 216px (D12) · destination 36px on a fine pointer, floored to 45 on a coarse one · `--dh-radius-control` corners · 20px glyph · groups separated by space, never a rule · exactly ONE hairline in the column, above the account block. Everything is a published token (`--dh-shell-rail-width`, `--dh-shell-nav-row-height`); nothing in `shell.css` states a measurement of its own.

**The rail does not scroll — its destination LIST does.** The brand and the account are fixed furniture at the two ends of the column; only the destinations between them can ever be too long, so they are the only part that scrolls. This is a correctness rule, not a preference: `overflow` on the rail makes it a CLIPPING ancestor, and the account panel is wider than the rail (measured at 240px cut to 68 on a tablet, taking Settings and Sign out with it). Anything that opens FROM the rail — the account panel today, a workspace switcher tomorrow — depends on the rail staying `overflow: visible`.

**Selected state.** A violet BLOCK — `--dh-color-rail-selected`, which is the appearance's saturated violet mixed toward the rail rather than raw accent, so a louder colour scheme does not become louder here. Four signals, never colour alone: `aria-current="page"`, the block's shape (restored as the system `Highlight` under forced colours), a weight step, and a foreground step from `-text-muted` to `-text`. The glyph does **not** take `primary` on the rail — a violet glyph on a violet block is the least legible thing in the column — it steps up with the label.

**Account (DS-03).** The owner's avatar, name and menu sit at the bottom of the same column the brand opens, which is where both concept references put them. Search is an ACTION and lives in the top bar; the account is an IDENTITY and lives with the other identity in the frame. Its trigger is named `Account — <name>` in every variant, so it says what it is as well as who.

**Tablet (DS-03).** Between `md` and `lg` the rail collapses to a **68px glyph column**: labels and the wordmark are hidden VISUALLY (never `display: none`, so every accessible name survives), the shared tooltip supplies the name to a pointer and a sighted keyboard user, and the current destination is still marked. It is a media query, not a preference — see [D38](DALYHUB_DESIGN_SYSTEM.md#5-documented-departures-from-stock-material).

**Every collapsed control gets the tooltip, including the account trigger.** The rule is the control's, not the navigation list's: if the collapse hides a label, the shared tooltip supplies it. Both consumers read one `useCollapsedRail()` so they cannot disagree about when a label is readable. The tooltip is always the DESCRIPTION — the accessible NAME survives the collapse independently, so a user whose assistive technology skips descriptions loses nothing.
**Brand (BRAND-01).** The rail states the PRODUCT name, always. It used to render only the workspace name, so renaming the workspace renamed DalyHub in the frame; the workspace is now a quieter second line and is omitted entirely when it is simply called "DalyHub". The mark is `BrandMark` — the white "D" and its connected three-node network, in the fixed brand gradient, generated from the same canonical geometry as the app icon (`scripts/icons/geometry.mjs`) so the two are one drawing. It is `aria-hidden`, because the product name sits beside it as real text. The tagline *"Your life. Connected."* belongs to the full lockup (`~/shared/brand` → `BrandLockup`, used on About), never to the rail.
**Behaviour.** Navigation is registry-driven (no central list); each row's icon is the module's [entity identity](#entity-identity-px-02) glyph, derived from the module's own `entityTypes` manifest — a module that declares no entity type (Today, AI, Settings, Help) falls back to a generic glyph rather than a hand-picked icon. Active state is `aria-current` + weight + an accent-surface tint. The Search/Command entries are real, labelled, keyboard-reachable affordances; their surfaces are wired by DS-08/DS-09.
**Grouping (PX-03).** A route's `meta.navGroup` (declared by the owning module, e.g. `"capture"`) clusters its row with sibling rows sharing the same group; `PrimaryNavigation` renders a plain, decorative `<hr>` divider (`aria-hidden`) at each group transition — rhythm only, no group label, no redesign. A navigation model where no module declares a group renders exactly as a flat list (the original PX-02 shape), so grouping is additive. The current groups, in order: ungrouped (Today/Areas/Goals/Projects/Tasks) · `capture` (Notes/Diary/Meetings/People/Assets) · `insight` (Reviews/AI) · `system` (Settings/Help).
**Mobile.** Below `md` the rail collapses to an **animated overlay sheet** that reuses the DS-03 Drawer's focus-trap, background-inertness and scroll-lock machinery (no second focus-trap): slide-in + scrim, Escape/outside-click close, focus restored to the toggle, safe-area aware, no content jump.

### The page frame (DS-03)

**One origin: rail → gutter → everything.** The top bar's search field, the page title and the first row of content start on the same vertical line at every width, from 768 to 2560. The page header **start-aligns**; it does not centre. It carried `margin-inline: auto`, which is a no-op below the content measure and a real divergence above it — measured at 1920, the title started at x=347 and the list it titles at x=256. `CollectionLayout` had already written the argument for its own content: the rail is on the left, so a centred column drifts away from it as the viewport grows and leaves the navigation pointing at nothing.

**The measurements**, all published tokens, all consumed rather than restated:

| | Token | Value |
| --- | --- | --- |
| Rail | `--dh-shell-rail-width` | 216px (68px collapsed) |
| Top bar | `--dh-shell-bar-height` | 56px |
| Phone top bar | `--dh-shell-mobile-bar-height` | 52px + the safe-area inset |
| Gutter | `--dh-shell-gutter` | 40 desktop · 24 tablet · 16 phone |
| Content measure | `--dh-shell-content-max-width` | 1320px (a collection opts into 1440 + gutters; a dashboard wider still) |
| Safe areas | `--dh-safe-top/right/bottom/left` | the ONE definition — no rule anywhere may write a raw `env(safe-area-inset-*)` |

### Pane Header

**Purpose.** The header that belongs to the current screen, not the frame.
**Anatomy.** Page title (a real heading, configurable level) · optional eyebrow · optional subtitle/count · optional status · optional metadata row · optional view-switcher slot · secondary actions · one primary-action slot. Optionally an entity-identity glyph beside the title (a RECORD's; a collection passes none — D30).
**Typography.** The title consumes `--dh-text-page-title-*` rather than naming a typescale rung, so "how big is a page title?" is asked once, in the token layer, for every page in the product. Two densities, one anatomy: `compact` is the collection band (a title, a count and its actions, tight enough that the filter row and the first record are both above the fold); `identity` is the record band, which has room for the icon, the eyebrow and a metadata line.
**Rules.** It **never** contains an email address or logout (those live in the User Menu). Exactly one primary action per pane. It pins (sticky) when hosted by a [Collection Layout](#collection-layout-px-02). Its collection use is governed by the [collection-header anatomy](#the-collection-header-anatomy-uiq-013uiq-014) below.

### The collection-header anatomy (UIQ-013/UIQ-014)

**Purpose.** One shape for the top of every collection, so "where do I change the view, and where do I create one?" has the same answer on Tasks, Projects, Areas, Goals, Notes, People, Meetings, Assets, Reviews and Diary. The August 2026 audit found four different view-switcher presentations and a create action that moved between modules; this is the contract that replaced them.

**Anatomy.** Two bands, rendered by [`CollectionLayout`](#collection-layout-px-02) and pinned together:

```
Collection title      [ search ]   [ view switcher ]  [ secondary ]  [ PRIMARY ]
count / supporting context
───────────────────────────────────────────────────────────────────────────────
mode rail (lifecycle tabs)                            [ presentation toggle ]
filters (selects · tags · chips)
```

**The title LEADS — a collection header draws no glyph beside it** (UIX-06, D30). The band briefly resolved a generic entity badge from an `entityType` prop; that gave the product three different page origins, because Today, Analytics and Settings have no entity type to badge and started 40px to the left of every collection, and it repeated the glyph the sidebar was already showing, highlighted, for the same route. `PaneHeader` still accepts an `icon` — a RECORD header passes one, because a record's mark carries its Area's identity accent (D22, §6.2) rather than restating its type.

**The count line is `collectionCountLabel`** (`~/shared/collection-layout`), not per-module wording. Nine collections hand-rolled the same subtitle in five conventions before UIX-06, one showed the current view's NAME rather than a count, and two produced "1 notes loaded". The noun is capitalised (the product's own nouns, AGENTS.md §7); a bounded page says "loaded"; a scope qualifies the noun without replacing the count ("3 current Reviews").

**Semantic ownership is the contract, not the pixels.** Which slot a control lives in is fixed product-wide and does not vary by module:

| Slot | Holds | Never holds |
| --- | --- | --- |
| title / subtitle | the collection's name and its count or one line of context | a status the filters already state |
| `viewSwitcher` | the ONE [view switcher](#the-view-switcher-uiq-013) — presentation, or principal mode | anything that narrows the record set |
| `secondaryActions` | one or two supporting actions (Tasks' Review Inbox) | a third and fourth — that is what the overflow is for |
| `primaryAction` | exactly one create, at the trailing end, on every collection | a promoted secondary action when a module has no create |
| `search` | the ONE [`CollectionSearchField`](../../app/shared/collection-layout/CollectionSearchField.tsx), and nothing else | any other narrowing control |
| `filterBar` | the mode rail, selects, tags, the DS-07 bar, the MOBILE-01 controls | a second search field |

**Search is the ONE narrowing control that lives in the header band, and this is why** (REDESIGN-04, `mockup3.png`). Every other filter belongs in the band beneath, and that rule is unchanged. Search is different in use rather than in kind: it is the control an owner reaches for *without having decided to filter* — how you find a known record, not how you narrow an unknown set — which puts it closer to the pane's title than to its filter row. Five modules had already reached that conclusion privately (Assets keeps its search "visible at every width" while everything else goes in the sheet), each with its own markup; that is the shape of a missing slot, not five local decisions. It takes [`CollectionSearchField`](../../app/shared/collection-layout/CollectionSearchField.tsx) and its controller [`useCollectionSearch`](../../app/shared/collection-layout/use-collection-search.ts), which own the draft, the debounce, the `replace`d URL write and the cursor reset — so a collection never hand-rolls that behaviour again. **On a phone it collapses to an icon beside the primary action and expands to its own row**, which is what the handset frame draws; both nodes are always in the DOM and the swap is pure CSS, so the first server byte is correct.

**The control row is the band beneath, and it has two ends** (REDESIGN-04). [`CollectionControlRow`](../../app/shared/collection-layout/CollectionControlRow.tsx) puts the lifecycle/mode rail at the leading edge and a **presentation toggle** at the trailing one. The toggle is still the ONE view switcher and UIQ-013's semantics are untouched — it changes how records are drawn, never which are included. It sits a band lower than the `viewSwitcher` slot only where the title row is already carrying search and the primary action, which at 1280 is where three control clusters on one line break. A collection with a sparse header keeps the switcher in the header slot.

**The presentation vocabulary is THREE words and they are not synonyms** (FINISH-01, closing the audit's "Grid / Table vs Grid / List" finding). The words live in [`presentation.ts`](../../app/shared/collection-layout/presentation.ts) and each names a genuinely different drawing:

| `?present=` | What it draws | Who draws it |
| --- | --- | --- |
| `grid` | cards in a wrapping gallery | Projects, Goals, Assets and optional Areas |
| `table` | a real `<table>` with `<th scope="col">` columns and row headers | Projects |
| `list` | full-width rows separated by hairlines, one identity mark per row | Areas |

The 16 August 2026 audit read Projects' "Table" beside Areas' "List" as one control saying two words, and asked for one word product-wide. **It is the opposite**: two controls, correctly named, for two different presentations. Projects' second view is a real table — columns with headers, which is what makes it scannable and what `ProjectsTable` documents as its reason for being a `<table>` rather than divs. Areas' is a row list with no columns at all. Renaming either would make a label describe something the page does not draw, which §7 ("speak in the user's nouns") forbids more strongly than it asks for uniformity.

What IS uniform, and must stay so: the control (`ViewSwitcher`), the param
(`?present=`), the slot (the control row's trailing edge), and the
accessible-name pattern ("Project layout", "Area layout"). The first allowed
option is that module's declared default: Projects opens on Grid; Areas opens on
List. **A fourth word needs a fourth drawing**, and belongs in the table above
before it appears in a module.

**A large collection may DEFAULT to a different presentation** ([ADR-100](../decisions/ARCHITECTURE_DECISIONS.md#adr-100-a-collections-default-presentation-follows-its-size--the-table-at-forty-projects-and-an-explicit-choice-that-is-never-overridden)). `resolveCollectionPresentation` is the one rule: above `COLLECTION_TABLE_DEFAULT_THRESHOLD` records in the CURRENT scope, the collection opens in its "large" presentation instead of its default — and an explicit `?present=` always wins, at every size. Projects opts in at forty. A collection that wants this passes its own `allowed` and `large`; it never re-derives the arithmetic.

**One list container: BARE ROWS on the page background** (FINISH-01, closing CONVERGE-01 §3). A collection that draws rows rather than cards draws them directly on the canvas, separated by hairlines that the LIST owns — not by a card around each row, and not by one card around the whole run.

```
Row one                                         ← nothing above the first row
────────────────────────────────────────────────
Row two
────────────────────────────────────────────────
Row three                                       ← nothing below the last
```

The rule is what the product's row lists already do — Notes (`.dh-notes-list`), Tasks (`.dh-tasklist`) and Areas' list presentation (`.dh-erow-list`) — and People (`.dh-prow-list`) was the one outlier, drawing a white card with a resting shadow around its rows until this pass. The reasoning is the one `notes.css` already recorded for itself: *rows this close together do not need containers to be told apart; a rule is enough, and it keeps the page reading as one list rather than as a stack of cards.* A surface says "what is inside me is a thing", and a directory is not a thing — it is a run of records.

Two consequences a new list must carry with it: the hairline goes on `li + li` (so the first and last edges are the page's own and two adjacent rows cannot disagree about the line between them), and under `forced-colors` that hairline is restated in `CanvasText` — never a box around the run, which would draw a container the list does not have.

**The one recorded exception is a record's TAB PANEL, and it is not this rule's business.** A Project's task list sits inside `.record-tabs__panel`, which looks like a bordered card around a list and is not one: it is the record layout's own surface, drawn identically behind Overview, Links, Activity and Settings on every record in the product, and joined to the tab strip above it (M3-INT, `record-layout.css`). Taking it away for one tab of one record would make that tab the odd one out among its own siblings — a larger inconsistency than the one it would fix. RECORD-01 already defines the deliberate opt-out, `data-surface="plain"`, and states its condition precisely: *a panel whose content already IS a surface does not draw a second* (the Note editor, which draws its own outline). A task list is not already a surface, so it does not meet that condition and keeps the panel.

**A module shows only what it needs.** Consistency here is placement and
hierarchy, not content: Meetings and Tasks deliberately have no page-level
create and pass nothing rather than filling the slot. Areas exposes List/Grid
because both are intentional drawings of the same records; it does not invent a
Table merely to match Projects.

**Responsive composition changes on purpose.** Above `md` the header is one row whose title block GROWS (`flex: 1 1 auto` with `min-inline-size: 0`) and whose controls do not — the fix for headers that wrapped while hundreds of pixels of laptop width sat unused. Below `md` it becomes a two-row grid rather than a wrapping flex row, because wrapping lets whatever happens to fit decide the composition:

```
Title / count                                                            [ New ]
[ View | Switcher ]
```

The primary action stays on the first line beside the title at 320px. It is never moved into an overflow menu to save space — a create action nobody can find is worse than a tight header.

### The view switcher (UIQ-013)

**Purpose.** ONE control for "change what this collection shows", in [`app/shared/view-switcher`](../../app/shared/view-switcher), rendered into the header's `viewSwitcher` slot.

**A VIEW is not a FILTER, and this is the distinction to apply:**

- A **view** changes the PRESENTATION (`List | Board | Sectors`, `List | Gallery`, `Grid | Table`) or the PRINCIPAL MODE — mutually-exclusive scopes of which exactly one is always active (`Active | Deleted`, `Open | Completed | Archived`, `Upcoming | Recent | Archived`). It belongs in the header's view slot.
- A **filter** changes WHICH RECORDS are included, composes with its siblings, and can be off entirely (a search string, a Type select, a tag). It belongs in the filter row.

The test is whether the control can be *unset*. "Which Area?" can be Any — a filter. "Which view?" cannot be none — a view. A bounded state toggle inside a record tab (a Project's Open/All tasks) stays a filter and keeps the thin [`SegmentedFilter`](../../app/shared/segmented-filter) wrapper, which renders the same control through the same implementation.

**Anatomy.** M3 segmented buttons: one outlined container, fully-rounded ends, hairline dividers, `label-large`, a `secondary-container` selected segment carrying the M3 check glyph. Two option modes — URL-backed `Link`s marked with `aria-current` (deep-linkable, shareable, Back/Forward-correct, working with no JavaScript), or client-state `button`s marked with `aria-pressed` where the state deliberately does not live in the URL.

**Rules.**
- **Selection is a shape, not only a tone.** The check glyph rides beside the fill, so the selected view survives forced colours and a colour-blind reading.
- **The check's box is RESERVED in every segment.** It used to be inserted only on the selected one, which moved every label in the control each time the view changed. Reserving costs one glyph width per segment and buys geometry that is identical whichever view is active.
- **44px, on every pointer.** Three of the four retired presentations sat below it.
- **The control SCROLLS, it never wraps.** A wrapped segmented control is a broken drawing — rounded ends land mid-row and the dividers stop lining up. Too little width scrolls horizontally inside the control's own box (the editor toolbar's answer to the same problem), so it can never produce page-level overflow at 320px either.
- **Hover, focus and pressed are the ONE shared state layer.** `.dh-segmented__option` is a named host in `base.css`; the segment states only its selected container for itself.
- **Icons are opt-in and decorative.** Use one only where it genuinely aids recognition (List/Gallery); an `iconOnly` switcher keeps a visually-hidden label as its accessible NAME and composes the shared [Tooltip](#tooltip-m3-tip) to describe it on hover *and* keyboard focus. On a selected icon-only segment the check REPLACES the icon in the same box, per M3 — so selection stays a shape and geometry still does not move.
- **Keyboard is the native one.** Links and buttons behave exactly as they announce themselves; no roving model is invented for a control that does not need one.

**Adopted by** Tasks (layout), Projects, Areas (List/Grid), Goals, Notes
(lifecycle mode), People (scope + an icon-only List/Gallery), Meetings, Assets,
Reviews (scope) and Diary (Day/Timeline).

### User Menu (PX-02)

**Purpose.** Keep settings furniture off the desk.
**Anatomy.** An avatar/initials trigger opening a small panel: name · email · Settings · Sign out. There is no theme control: appearance follows the operating system (ADR-074).
**Behaviour.** An accessible disclosure (not a modal): `aria-expanded`/`aria-haspopup`, Escape closes and restores focus to the trigger, outside-click closes.

### Entity Identity (PX-02)

**Purpose.** One icon and one accent per entity type, recognisable at a glance everywhere (Foundations requirement).
**Anatomy.** [`app/shared/entity`](../../app/shared/entity) exposes a frozen `ENTITY_IDENTITY` map (`type → { label, pluralLabel, Icon, accentVar }`), `getEntityIdentity`, and an `EntityIcon` component; icons come from the in-house set in [`app/shared/icons`](../../app/shared/icons).

| Entity | Icon (idiom) | Accent token |
|---|---|---|
| Area | `layers` | `--md-sys-color-entity-area` |
| Goal | `flag` | `--md-sys-color-entity-goal` |
| Project | `folder` | `--md-sys-color-entity-project` |
| Task | `check_circle` | `--md-sys-color-entity-task` |
| Note | `description` | `--md-sys-color-entity-note` |
| Meeting | `groups` | `--md-sys-color-entity-meeting` |
| Person | `person` | `--md-sys-color-entity-person` |
| Asset | `inventory_2` | `--md-sys-color-entity-asset` |
| Diary | `menu_book` | `--md-sys-color-entity-diary` |
| Review | `event_repeat` | `--md-sys-color-entity-review` |

**Rules.** Every accent has a light **and** dark value (parity + ≥3:1 contrast, both tested). Accents are used at **identity sites only** (icon, card edge, chip) — never as text colour ([PRODUCT_EXPERIENCE Part III §5](PRODUCT_EXPERIENCE.md)). Icons are decorative (`aria-hidden`); a text label always names the entity. Cards, Record Headers, the sidebar, empty states and (later) Search/Command Palette all consume this one map — never a hand-picked icon at a call site.

**Identity colour, shared by Areas and Projects (#130).** Two layers again, and they are separate attributes: the entity type's own accent (the table above, one colour per TYPE) and a per-RECORD identity colour, for the entity types whose records are things you recognise individually.

The per-record colour is a **stable rank**, never a stored colour and never a render-order index: a record's 0-based position in its workspace's `(created_at, id)` ordering over every row of its type, folded into the six shared `area-accent-*` tokens by `areaAccentForRank` and painted by [`AccentIcon`](#entity-card-and-its-grid-ds-14-gate-d). Areas established it (ADR-068 decision 5); Projects joined it rather than growing a parallel system.

| Property | How the rank delivers it |
| --- | --- |
| **Assigned automatically** | A new record's rank falls out of its creation; nothing to choose, no default to repeat. |
| **Neighbours differ** | Consecutively-created records take consecutive ranks, so they take adjacent, distinct ramp entries. |
| **Persistent** | It is a function of immutable creation facts, so refresh, navigation, restart, deployment, rename, description edits, task changes, re-sorting and filtering cannot move it. |
| **Lifecycle-independent** | Ranked over EVERY row, not the active set, so archiving or soft-deleting one record never recolours the ones created after it. Only a permanent delete shifts a rank, and that is already a typed-confirmation destructive act. |
| **Existing records** | Deterministic from data that already exists — no migration, no backfill, no column, no index. |
| **Icon and colour are independent** | The glyph is `iconKey`, the colour is the rank. Changing either never changes the other. |

**A Project wears its OWN colour, not its Area's (#130).** It used to inherit the Area's rank, which made a grid group visually by Area — but it also meant several Projects in one Area were indistinguishable, and a Project with no Area got the neutral container, which is no identity at all. The Area is still named in the card's context line, which is where it was always legible as text rather than as a colour the owner had to learn. `areaColourRank` is still carried beside `colourRank`, because "which Area" and "which Project" are two different facts.

**It is an accent, never a fill.** The colour lives in the 40px identity container behind the glyph. A card is never a large saturated tile, and the colour never carries meaning on its own — the record's name is always beside it.

**Subtype icons (PX-05).** A module whose entity has meaningful *sub-kinds* registers one stable icon **per subtype** with the SHARED subtype-icon registry ([`app/shared/entity/subtype-icons.tsx`](../../app/shared/entity/subtype-icons.tsx)) — `registerSubtypeIcons(entityType, map)` at module load, `getSubtypeIcon(entityType, subtype)` or the `<SubtypeIcon>` component to resolve, with a safe fallback to the entity glyph. Diary entry types and Asset types are its two consumers; each previously kept a private map, which is how a Diary "meeting" **subtype** ended up wearing the Meeting **entity** glyph.

Two layers, never merged:

- **Entity identity** — one icon + one accent per entity TYPE, from the frozen `ENTITY_IDENTITY`. Used at identity sites. Never re-picked at a call site.
- **Module subtype** — one glyph per sub-kind, subordinate to the entity icon, owned by the module that defines the vocabulary, resolved through the one registry.

A subtype **must never be given another entity's glyph** — the shared icon set carries dedicated subtype glyphs (chat, calendar, idea, decision, travel, observation, reflection, …) for exactly this reason, and a test enforces it. Subtype icons keep the same rules: `currentColor` (design tokens, light/dark parity), decorative, always paired with text, consistent in the collection, record, filter chips, search and Linked Items.

### Collection Layout (PX-02)

**Purpose.** The product's commonest screen — "a filtered collection of Cards with a Filter bar, opening records in a Drawer" — as a named, entity-agnostic scaffold. This is to screens what the [Record Layout](#shared-record-layout-ds-02) is to records.
**Anatomy.** [`app/shared/collection-layout`](../../app/shared/collection-layout) composes a [Pane Header](#pane-header) · a [FilterBar](#shared-filters-ds-07) slot · a content slot (a [Card](#shared-cards-ds-04) collection) · a selection/bulk slot · and built-in **Loading** ([Skeleton](#loading-states-px-02)), **Empty**, **Filtered-empty** and **Error** states.
**Behaviour.** State precedence is error → loading → filtered-empty → empty → children, so a surface can **never** render a blank region ([PRODUCT_EXPERIENCE Part IV §5](PRODUCT_EXPERIENCE.md)). The header + filter bar pin (sticky) while the content scrolls; the selection bar is bottom-anchored.
**Loading (PX-06).** `useCollectionLoading()` ([`app/shared/collection-layout`](../../app/shared/collection-layout)) is the ONE loading signal, derived from the router: true while a **same-route** navigation is in flight — a filter, a view or a page change on the collection the user is already looking at — and deliberately false for a navigation *away* (that page owns its own state; swapping the list for a skeleton on the way out would be a flash, not feedback). Every filtered collection passes it to `isLoading`, so the shared `CollectionSkeleton` and `aria-busy` appear consistently instead of the previous list sitting there with no indication that a new one is coming.

**Rules.** No business logic, no repositories, no entity assumptions — every collection surface (Today, Projects, Areas, Goals, Notes, People) is configuration. Filters bind to the URL via DS-07; cards open the DS-03 Drawer.

#### The selection / bulk slot (TASKS-06)

The bottom-anchored `selection` slot is where a collection puts its multi-select surface. Tasks is the reference implementation; five rules generalise from it and any collection adopting bulk actions should follow them.

- **Selection MODE is separate from having a selection.** A collection needs a state where the checkboxes are offered and nothing is chosen — otherwise the only way in on touch is a gesture, and the only way out is deselecting one row at a time. That state renders an instruction ("Choose tasks to act on them together") plus **Select all N** and **Done**, never an empty toolbar of disabled buttons.
- **Three ways in, one of them ordinary.** A row checkbox, a touch long press, and a visible labelled toggle in the header carrying `aria-pressed`. The gesture and the checkbox are both fine; neither is discoverable, so the toggle is not optional.
- **A range is the collection's job.** The Card reports the Shift modifier; the collection resolves it against its own DISPLAY order. Hold the state in a pure reducer so the four hard rules — range anchor, reset on query change, prune to visible, mode-vs-selection — are testable without rendering anything.
- **A mixed selection must SAY it is mixed.** A bulk field control whose selection holds three different values reads **Mixed** and applies the chosen value to all. It must never present one member's value as the set's. An agreed absence ("No priority" for three untriaged records) is a real shared value, not a mixture.
- **A destructive bulk action is reversible, and the confirmation explains the consequence rather than merely counting.** "Delete 18 tasks? They move to the Deleted view… nothing is permanently destroyed." Permanent destruction is never reachable from a bulk toolbar; it stays the record-level, deliberately separate operation ([PX-04](#shared-record-lifecycle-px-04)). On a phone the bar collapses to the M3 bottom action row — the four or five commonest actions visible, the rest behind **More** — and the confirmation stacks rather than scrolling sideways, so the consequence is read before either button is reachable.

### Empty State (PX-02)

The [Empty States](#empty-states) pattern is realised by ONE `EmptyState` ([`app/shared/empty-state`](../../app/shared/empty-state)): icon (usually an entity glyph) · title · one-sentence body · primary/secondary actions · illustration slot. It replaces the previously-forked record/filter empty renderings; the *filtered-empty* variant is just this component with a "clear filters" recovery. Calm and centred in its content region — never full-screen theatre.

`size="compact"` (PX-06) is the SAME component and the same anatomy at a widget's scale, for a small region such as a Today section — so a quiet dashboard still teaches the next action instead of degrading to a bare paragraph (or becoming a page of full-height empty blocks). Today was the last surface in the product rendering its own empty states; it no longer does.

### Loading States (PX-02)

The [Loading](#loading) pattern gains a shared **Skeleton** system ([`app/shared/skeleton`](../../app/shared/skeleton)): a `Skeleton` primitive plus `CardSkeleton` (density-aware), `CollectionSkeleton` and `PaneSkeleton` that **mirror the final layout**. Skeletons are decorative (`aria-hidden`); the loading region owns `aria-busy`. The shimmer honours reduced motion — it collapses to a static tint with no information lost.

### Module Coming Soon (PX-03)

**Purpose.** Every ROADMAP_V2 module gets a real, reachable route the moment it's registered — never a 404 — while its product experience is still a later phase. This is the honest, content-only placeholder every such route renders (`app/shared/shell/ModuleComingSoon`). It superseded an earlier plain `ModulePlaceholder`, which this document used to describe as "still used by `/tasks`" — it was not, and AUDIT-16 deleted it.
**Anatomy.** The SAME [Pane Header](#pane-header) (title + entity glyph, when the module owns one) every real module uses, then a lead paragraph naming where the module fits in DalyHub's model, then a labelled "Coming Soon" section: a sentence naming the module's real ROADMAP_V2 phase (or, honestly, that it has none yet), and a list of capabilities copied from that phase's roadmap items — never invented.
**Rules.** No new visual language: it reuses `.dh-pane-body` typography unchanged. No lorem ipsum, no fabricated feature claims. A future roadmap item replaces the route's body with the real module; this component is never reused by the real thing.

### Copy convention (PX-06)

One voice across every surface. Collection headers used to read "New Area" beside "New project"; empty states "No tasks here" beside "No projects yet"; Diary alone said "New entry" and used a different apostrophe. The convention is now **executable** rather than merely written down — the recurring labels are derived from the one identity map ([`app/shared/entity/copy.ts`](../../app/shared/entity/copy.ts)), so a module cannot drift and a new entity inherits the product's voice for free.

| Rule | Correct | Incorrect |
|---|---|---|
| **Sentence case**, with the product's **entity nouns capitalised** (they are proper concepts in the model — AGENTS.md §7) | `New Project`, `Archive Area`, `Rename` | `New project`, `New Area Record`, `ARCHIVE` |
| **One create verb**, product-wide: `newRecordLabel(type)` | `New Note`, `New Person`, `New Diary entry` | `Add note`, `Quick capture`, `New entry` |
| **Genuinely-empty vs filtered-empty are different sentences**: `emptyCollectionTitle` / `filteredEmptyTitle` | `No Projects yet` · `No matching Projects` | `No projects yet` for both |
| **Counts** use the identity map's own plural: `countLabel(type, n)` | `1 Person`, `2 People` | `2 Persons` |
| **Tab names** come from the shared vocabulary, with **Activity and Settings last, in that order** | `Summary · Linked · Activity · Settings` | `Key links`, `Links`, `Timeline` for the same thing |
| **Typographic apostrophe** (’) in all user-facing copy | `We couldn’t load your Notes` | `couldn't`, `&apos;`, `&rsquo;` |
| **Errors name a recovery**; nothing dead-ends | `Move or remove everything inside this Area first.` | `Delete failed` |

Only reach for a literal where the derived label genuinely does not fit (Diary creates an *entry*, not a *Diary*, so it reads `New Diary entry`) — and say why at the call site.

### Correct vs incorrect usage

- ✅ A new module ships: a registry-driven sidebar row (its entity icon derived from its manifest) + a `CollectionLayout` pane + `Card`s opening the Drawer + a URL-bound `FilterBar` + wired empty/loading/error slots — and **no new visual language**.
- ✅ Identity and sign-out live in the User Menu; the Pane Header carries only the title, one primary action and view controls.
- ✅ A not-yet-built module gets a real route rendering `ModuleComingSoon` with roadmap-sourced copy — never a 404, never invented feature claims.
- ❌ A module page with its own header bar, its own shell/provider, a bespoke empty/loading state, or a hand-picked icon instead of the entity-identity map.
- ❌ A placeholder page with lorem ipsum, or "coming soon" copy claiming a feature no ROADMAP_V2 item actually plans.
- ❌ An email address or logout in a Pane Header; a second focus-trap for the mobile nav; an internal pane scroll that breaks the Drawer's scroll contract.

---

## Responsive behaviour

DalyHub is one product across a wide desktop workspace and a phone. Same model, same vocabulary, adapted layout.

- **Desktop-first, mobile-complete.** The dense, keyboard-driven experience is the design centre; mobile is a first-class adaptation, not an afterthought. Every module's roadmap includes an explicit **Mobile** item (see [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md)).
- **The Drawer adapts.** On desktop the [Drawer](#drawer) is a side sheet; on mobile it becomes a full-height sheet. The [Record Layout](#record-header) inside is identical.
- **Navigation collapses predictably.** Multi-pane on desktop → stacked/tabbed on mobile, with state preserved across the transition.
- **Touch targets & gestures.** Minimum 44px targets on touch; swipe maps to the same [Quick Actions](#quick-actions) available by keyboard on desktop. No action is touch-only or keyboard-only.
- **Breakpoints are tokens**, defined once and shared.

### Swipe quick actions (TODAY-06)

On a touch-first device (`(hover: none) and (pointer: coarse)`), a [Card](#cards) that is given `swipeActions` can be **swiped horizontally to reveal an action tray** — the shared, additive mobile accelerator for a card's quick actions. First delivered for Today ([ADR-032](../decisions/ARCHITECTURE_DECISIONS.md#adr-032-mobile-today--touch-swipe-quick-actions-as-an-additive-shared-card-accelerator-and-the-touch-target-corrections)); reusable by every module's Mobile item.

Contract:

- **One shared Card, additive.** `swipeActions` is an optional prop on the ONE Card ([DS-04](#shared-cards-ds-04)); there is no mobile-specific card. The wrapper renders whenever the prop is present (SSR-safe) but only responds to pointers on a touch-first device, so desktop mouse/keyboard behaviour is unchanged. **The tray does not paint on a hover-capable fine pointer at all** (`display: none`): the gesture cannot fire there, and an invisible tray behind the surface is one translucent state away from showing through — which is exactly how it leaked onto every desktop row's hover (UIQ-001).
- **Maps to existing actions — one identity, one execution path.** The tray renders the SAME `CardAction`s the card exposes as visible `quickActions`, which drive the same [`AppAction`](#quick-actions) handlers and the same trusted server routes. Swipe never adds a new handler or new business logic, and never mutates on the client as the authority.
- **Accelerator, never gesture-only.** Every action in the tray is also a visible, keyboard- and AT-reachable control (and available in the [Drawer](#drawer)). The tray is therefore `aria-hidden` and out of the tab order — a visual duplicate. The swipe gesture itself need not be exposed to assistive tech, but every action it reveals must have an ordinary accessible control and keyboard path.
- **State-dependent availability.** Only valid actions appear (by omission), matching the visible actions and keyboard commands — never an invalid action just because the tray has room.
- **Deliberate, cancellable, scroll-safe.** A clear horizontal intent past a movement threshold is required; a minor drag never reveals the tray; `touch-action: pan-y` + the intent guard preserve natural vertical page scrolling; a handled swipe never also opens the card; the gesture supports cancellation.
- **One tray at a time.** Only one revealed tray exists; it closes on outside interaction, navigation, a Drawer opening, or a completed action.
- **Tokens + reduced motion.** Distance, timing, surfaces and feedback use DS-01 tokens; the snap honours `prefers-reduced-motion` (instant); action meaning is icon + label, never colour alone.

The gesture DECISION logic (intent, thresholds, offset clamping, the open/closed snap, and the single-open registry) lives in a pure, React-free `swipe-model` unit-tested independently of React and the DOM; the `useCardSwipe` hook only wires pointer input.

---

## Mobile platform (MOBILE-01)

DS-11 established the responsive/accessibility **baseline** — nothing overflows, everything is reachable, every target is 44px. MOBILE-01 is the layer above it: the shared surfaces that make a phone genuinely *quick*, rather than merely fitting. They live in the shared layer, so a module inherits them by composing the same components it already composes.

**One product, not two.** There is no mobile component tree, no mobile data model, no mobile route and no mobile mutation. Every surface below is the SAME component, the SAME repository and the SAME URL state adapting its presentation.

### Phone bottom navigation

At phone widths the sidebar rail is replaced by a persistent bottom bar within thumb reach:

```
Today · Tasks · Capture · Diary · More
```

Contract:

- **Registry-derived, never a second list.** A route earns a slot by declaring `meta.mobilePrimaryOrder` in its own `routes.manifest.ts` — a validated `RouteMeta` capability. The shell reads it through the same navigation model the desktop rail renders and keeps at most `MOBILE_PRIMARY_DESTINATION_LIMIT` (3), so the bar can never exceed its five-control budget. A module hidden by the SET-01 navigation preference disappears from the bar for free. See [ADR-058](../decisions/ARCHITECTURE_DECISIONS.md#adr-058-registry-driven-phone-navigation-and-quick-capture-as-a-shared-shell-framework).
- **More is the complete navigation.** It opens the SAME registry-driven sheet the hamburger opened, so every module — including any future one — is one tap away and nothing appears in two competing lists.
- **Active state is never colour alone.** `aria-current="page"` plus an indicator bar, a filled icon treatment and a semibold label. Exactly one destination is active for any path (longest match wins); a route that is not a destination marks none.
- **Its own landmark.** Labelled `Quick navigation`, distinct from the sidebar's `Primary`, because both are in the DOM at once.
- **Out of the way when it must be.** It clears the home indicator (`env(safe-area-inset-bottom)`) and translates off-screen while the keyboard is up (`--app-keyboard-inset`), so it can never cover a focused field or an error. Scrolling surfaces reserve `--app-bottomnav-height`.
- **`display: none` from `md` up.** Desktop is untouched.

A compact top bar keeps the **route title** (not the workspace name — content before chrome), a contextual Back, Search and the route's overflow actions. Routes publish their title through `useSetMobileTopBar`. **DS-03 took it to 52px** (from M3's 64) at the record-title role: it holds one line of title and one 44px target, and 64 was 20px of padding on the most valuable row of the display. The safe-area inset is added ON TOP of the height, so a notched device clears its cutout and an un-notched one is genuinely 52px.

**DS-03 changed nothing structural about the bottom bar, and that is the finding.** It already met every requirement above — registry-derived, permanently labelled, `aria-current` plus shape plus weight, its own landmark, 44px targets at 320px, safe-area and keyboard-inset aware, complete via More. It took the app-bar surface so that both ends of the phone frame are one colour, and the navigation sheet's two 56px `corner-full` search entries (DS-02's debt #3 — the loudest piece of the old design language left in the product) became the same object as the desktop search field.

### Shared Quick Capture

ONE capture surface for **Task, Diary entry, Meeting, Note and Asset**, opened from the bottom bar, Today, the Command Palette or any module's empty state via `useCapture()`.

- **Canonical authorities only.** Each panel posts to the module's own creation route (`/tasks/new`, `/diary/new`, `/meetings/create`, `/notes/new`, `/assets/create`). There is no capture-only store, validator or create path.
- **A panel may BE the module's canonical form (ASSET-03).** Assets' panel renders `NewAssetForm` itself rather than a thinner copy, because that form already asks only for a name and a type and reveals the rest progressively. Such a type declares no full-form hand-off (`fullFormRoute` returns `null`) — a link to the fields you are already looking at is not an option. A panel that is a module's own component lives in the module and is reached by a **lazy** import, so the shell never statically depends on a module.
- **Least information that can work.** A Task is a title; a valid default capture parent (UX-01) makes *title + Enter* the whole interaction. Optional classification is one-tap chips, never a collapsed form section.
- **The same three next steps** after every capture: Done · Open *record* · Add another. "Add another" clears the form and refocuses the first field, so repeated capture needs no navigation.
- **Text survives a recoverable failure** (the DS-06 `useForm` contract), and saves are announced through a live region.
- **Session-remembered type**, with "Change type" always one tap away, so remembering never makes another type harder to reach.
- **Lazy-loaded.** The sheet and every panel load on first open; the shell carries only a context and a lazy boundary.
- **Context-aware when intentionally supplied (ADR-060).** A record surface may open
  capture with one `CaptureContextContract`; global Quick Capture remains
  context-free. The sheet shows a compact chip near the top using the entity icon
  and words ("Related to Jane Smith", "In DalyHub Development", "Follow-up from
  Weekly Planning"), never raw ids or link types. Suggested/removable context has
  a 44px Remove control with an accessible name; fixed context is labelled as fixed
  and is not presented as editable. Switching capture type preserves the context
  when the matrix still has defined semantics, and unsupported combinations omit
  the relationship rather than fabricating one. Every create route revalidates the
  source context server-side before writing any relationship.

`GET /capture/context` is the shell-owned endpoint serving the owner timezone, today's calendar date and the re-verified default capture parent — so the bottom bar costs no workspace read.

### The shared Sheet

Every phone-scale overlay MOBILE-01 introduces (Quick Capture, the collection sheet, the More navigation) is one `Sheet`. It composes the **DS-03 modal hooks** (`useDrawerFocus`, `useInertBackground`, `useBodyScrollLock`) — there is never a second focus trap. Its body is the only scroll container (`overscroll-behavior: contain`), its footer is sticky and keyboard-safe, and its height subtracts `--app-keyboard-inset`. **`Escape` closes exactly one surface — the topmost.** Sheets nest (ASSET-03's type picker opens from inside Quick Capture), and because every sheet listens on `document` in the capture phase, `stopPropagation` alone did not stop a sibling listener on that same node: one Escape closed both. The open sheets are kept in a small stack and only the last one registered acts, so a surface below keeps its half-written state and a Drawer beneath still never sees the event. On tablet and desktop the same component renders as a centred dialog.

### Full-screen phone Drawer

The [Drawer](#drawer) becomes the record's whole screen below `md` — the same implementation, preserving URL state, the history stack, nested opening, focus trapping and restoration, the unsaved-change guard and the canonical Task Drawer content. Additions:

- `stickyActions` — a keyboard-safe region pinned outside the scrolling body for the record's PRIMARY commitment. Not a second toolbar: secondary and destructive actions stay in the overflow menu (PX-04).
- `headerActions` — contextual actions in the Drawer's own compact header, so a phone record needs only one row of chrome.
- `titleInHeaderOnly` — collapses the record's repeated title when the Drawer header already carries it.

### Mobile Record tabs

Above `md` every tab renders inline, exactly as before. Below it, a record with more than `MAX_INLINE_TABS` (4) shows its most important tabs inline and moves the rest into a labelled **More sections** menu (the shared DS-12 menu, outside the `tablist`). The ACTIVE tab always swaps into the inline strip; nothing is hidden permanently; every deep link and selected-tab URL state is preserved; selecting from the menu moves focus onto the now-visible tab. The gate is the shared `useCompactViewport`, which is desktop-first on the server, so a JavaScript-free render gets the complete strip.

MOBILE-01 (iPhone daily driver) added two things to the phone strip. A tab takes the target floor on the **inline** axis (`min-inline-size: var(--app-touch-target-min)`), so a two-character label such as "AI" is a target rather than a 27px sliver, while a long label is untouched. And the strip's scroll is *said*: the classic pure-CSS scroll shadow — two cover layers travelling with the content (`background-attachment: local`), two shadow layers pinned to the box (`scroll`) — shows a soft edge only on the side that has more to show, and none when the strip fits. Before it, the Meeting record read `Notebook Details Follow-up AI Activity S ⋯`, which looks like a broken label rather than an invitation to scroll.

### Mobile collection controls

A phone collection shows ONE row of chrome: a **Filter** button carrying its active count, plus a visible summary of what is applied. Filters, sort, grouping, display density and saved views move into one shared `CollectionControls` sheet consumed by every collection module.

- Every control is **URL-backed**, so state stays shareable, restorable and Back/Forward-correct — the sheet is a different way to reach the same state, not a second store.
- The sheet edits a **draft**: tapping options fires no navigation and closing without applying discards nothing committed.
- **Apply writes the URL exactly once** and clears pagination. **Reset** is explicit and complete.
- The badge counts only controls that genuinely narrow the collection — sorting differently does not make a list filtered.
- Large data pickers stay **server-backed**; the sheet never loads a collection to filter it locally.

**TASKS-03 extended this into the ONE collection-control surface, at every width.** A collection whose control surface is genuinely rich — Tasks carries sixteen filter dimensions, eight sorts, eight groupings and saved views — should not fork into a desktop control bar and a phone sheet: that is two things to learn, two things to keep in step and two places for a filter to hide. Three shared additions make one surface serve both:

- **`CollectionLayout persistentControls`** keeps the shared control row visible at every width instead of only on a phone. A collection that does not opt in behaves exactly as before.
- **A control group may accept MORE THAN ONE value (`multiple`, SMART-01).** One optional flag on `CollectionControlGroup`, and the whole capability: the selected values are comma-joined **in the group's own option order** into ONE parameter (`?priority=p1,p2`), so two equivalent selections always produce the same link; options announce themselves as `menuitemcheckbox` rather than `menuitemradio` (the sheet's `SheetOption` already used `aria-pressed`, which is toggle semantics, so it needed nothing); the group's "any" option clears the whole selection; and `CollectionFilterChips` draws **one chip per value**, each removing only itself and leaving the rest applied. It is deliberately NOT an expression builder — no operator, no nesting, no second dimension — so nothing about the persisted, declarative filter contract changes. Every existing group is single-select and untouched. Use it when one dimension genuinely takes a set ("Priority 1 and 2"); do not use it to approximate an OR across dimensions.
- **`CollectionFilterChips`** renders every applied filter as a labelled, removable chip plus one explicit **Reset filters**, driven by the SAME `CollectionControlGroup[]` declaration as the sheet. `CollectionControls` renders it **for every collection**, replacing the read-only summary sentence: it answers the same question ("why does this list look short?") and answers the obvious follow-up too, without reopening the sheet. Each chip states its DIMENSION and its VALUE in words ("Priority: P1 · Urgent"), each remove control has its own accessible name saying what it removes, and the row is a labelled list — so filter state is never carried by colour, position or a badge alone, and a user never has to reopen a control surface to learn why a list looks short. Chips are ordinary links: the URL is the state, so they are keyboard-operable and Back/Forward-correct.
- **`CollectionControls params`** lets a collection that VALIDATES its URL state hand the controls the canonical parameters. Without it, a value the query rejected — a stale saved view's removed dimension, a hand-typed nonsense filter — would still count on the badge and still survive an Apply, so the controls would describe a narrower collection than the one on screen.

The model additions are pure and shared: `activeControls` (the applied controls, resolved for display), `withoutControl` and `withoutControls` (remove one, or reset a kind). Resetting FILTERS deliberately does not clear the sort, the layout or the grouping the user chose.

### Compact phone Cards

The phone Card preset prioritises the leading state/completion control, the title, one line of context, the high-value signals and the overflow. Two rules are absolute: **the title wraps, never truncates** (it is what the user is scanning for), and **nothing is removed at any width**. `CardMetaItem.priority` (`high` | `low`) lets the MODULE declare what its record leads with — low-priority detail is de-emphasised into a supporting run, still readable and still in the accessibility tree. This replaces hiding data through CSS selectors keyed to entity types.

### Keyboard & safe-area rules

- **`--app-keyboard-inset`** is published by the ONE Visual Viewport observer in the product (`app/shared/viewport`, mounted once by the AppShell). Surfaces consume it in **CSS**; no form ever adds its own resize listener. A noise threshold ignores a collapsing URL bar, so sticky controls never jitter while scrolling.
- **`--app-bottomnav-height`** is the space the phone bar occupies (`0px` elsewhere), reserved by scrolling surfaces and bottom-anchored controls.
- Touch text inputs are raised to **16px**, because a smaller focused field makes a mobile browser zoom the page and leave it zoomed. The desktop type scale is unchanged. The floor lives in the **value**, not in a selector list: `--app-field-font-size` (the standard rung) and `--app-field-font-size-compact` (the dense rung, e.g. a filter bar) resolve to their design size on a pointer device and to at least `1rem` under `@media (hover: none)`. The shared native-control baseline in `base.css` consumes the compact token, so every `input`, `select` and `textarea` in the product inherits the floor — **a module control cannot be written that misses it**. It was an enumerated list of three shared classes until MOBILE-01, and every module control written after that list fell outside it (measured at 14px on the Notes, People and Reviews filter bars).
- **`FormActions` is keyboard-safe on a phone by default.** `sticky` is `boolean | "phone"` and defaults to `"phone"`: sticky below `md`, static above it, pinned above the keyboard, the safe area and the bottom bar using tokens rather than measurement. `sticky` (true) is the always-on opt-in; `sticky={false}` opts out, and is correct for a row already inside something bottom-anchored (a `Sheet` footer). The default moved in MOBILE-01 because three of twenty-nine call sites had opted in and the other twenty-six put Save past the end of a scrolling column on a phone — "Save remains reachable" is a baseline, not something a form opts into.

### Meeting capture bar

While the Meeting workspace is open, a sticky bar captures **Note · Action · Decision · Outcome** without switching tabs or opening a drawer: choose a type, type, submit, stay put with the input cleared and focused. Actions, decisions and outcomes save through the canonical `add_item`; a note is appended to the meeting's canonical `notesMarkdown` through the same authority the Notes editor autosaves through.

---

## Guided step flow (REVIEW-02 / REVIEW-04)

A **guided step flow** is an ordered, resumable pass over ONE existing record — not a
wizard that creates a second record, and not a form split across pages. Reviews is the
first consumer; any future multi-step pass over a record (an onboarding review, a
quarterly planning pass) composes the same shape rather than inventing one.

The pattern's rules, all load-bearing:

- **One canonical step registry, outside React.** Ids, order, owner-facing labels, compact
  phone labels, descriptions, required-ness, the record fields each step presents, its
  completion rule and its accessible label are declared once in a typed module. The
  desktop rail, the phone stepper, the progress indicator, the route validation, the
  resume logic and the tests all read it. No component restates step order.
- **The step lives in the URL.** The bare path resolves the current step and redirects to
  it, so the canonical URL always names a real step and Back/Forward, refresh, deep
  linking and automated testing all work. An unknown step recovers to the current one by
  redirect — never a 404. Navigation is POST → redirect → GET, so a refresh never
  re-submits.
- **Derive state; persist only a bookmark and explicit decisions.** Anything a live fact
  can answer stays derived. What is stored is where the owner deliberately stopped, plus
  the decisions ("I have reviewed this", "continue without recording one") that no
  calculation can reproduce. Live counts must never move the owner backwards.
- **Continuing is not completing.** Moving to the next step never marks the one behind it
  done; acknowledgement is always a separate, explicit control with its own wording.
- **Three states, always in words.** Done · Current step · Not started, rendered beside the
  visual treatment and in each control's accessible name. `aria-current="step"` marks the
  one being shown. Progress is a **position** — "Step 3 of 7" — never a percentage or a
  score, on an `aria-label`led progressbar.
- **Focus moves to the new step heading after a deliberate move**, and never on first
  paint; a blocked commitment moves focus to the reason.
- **Desktop is not a large phone wizard.** A persistent step rail beside the step's
  content, the record's status always visible, and a writing surface kept to a reading
  measure. Not three equally dense columns.
- **Phone is not a squeezed rail.** Below `md` the rail is **removed**, one step shows at a
  time under a compact progress header, a step sheet (the shared MOBILE-01 `Sheet`) offers
  direct navigation, and Back/Continue sit in a sticky footer using
  `--app-keyboard-inset`, `--app-bottomnav-height` and `env(safe-area-inset-bottom)`. No
  destructive action sits beside Continue.
- **No nested scrolling trap.** A step's primary editor grows with its content rather than
  scrolling inside its own capped box; the page is the scroll container.

Reference implementation: [`app/kernel/reviews/weekly-review-steps.ts`](../../app/kernel/reviews/weekly-review-steps.ts)
(the registry), [`app/modules/reviews/guided/`](../../app/modules/reviews/guided/) (the
surface), [`app/styles/review-guide.css`](../../app/styles/review-guide.css) (tokens only).
Decision: [ADR-072](../decisions/ARCHITECTURE_DECISIONS.md#adr-072-the-guided-weekly-review--one-review-two-presentations-a-canonical-step-model-and-the-smallest-possible-persisted-workflow-state).

---

## Insight list and bounded trend (REVIEW-03)

An **insight list** is how DalyHub presents derived evidence about the owner's own
records: a short list of claims, each with the reason that produced it and a way to
check it. Reviews is the first consumer; anything that later wants to say something
derived about a period composes this rather than inventing a metrics layout.

**It is deliberately not a dashboard.** No metric tiles, no gauges, no KPI row, no
nested cards, no grid of boxes. One insight is a paragraph with a quiet tone rule
beside it, because a card inside whatever surface hosts the list would stack a border
inside a border — the thing the M3 audit already ruled out.

The rules:

- **A claim, a reason, and a way to check it.** The claim is the sentence
  ("3 Tasks completed", "At risk → On track"); the reason states the counts that
  produced it; the links reach the records behind it. **A classification is never shown
  without its reason** — an unexplained label asks the owner to trust a rule they
  cannot see.
- **Existing destinations only.** Drill-down is ordinary links to the canonical record
  routes and system views. An insight surface never builds a parallel record browser.
- **Tone never carries meaning alone.** `neutral` / `success` / `info` / `warning`,
  reusing the same token triples as the Project-health and Goal-alignment pills — one
  status vocabulary, three consumers. `danger` is deliberately excluded: derived
  evidence about someone's week is not an emergency.
- **Absence renders less.** A section with nothing to say is not rendered. A surface
  with nothing at all shows ONE sentence explaining why, never a row of zeros. A read
  that failed says "not available", never nought.
- **Bounded numbers say so.** Every measure carries its exactness (`exact` / `bounded` /
  `unavailable`), and a bounded number renders as `12+`. A bounded number is never
  presented as an exact one.
- **A reason names a few, then counts.** Past four records a reason names the first four
  and says how many more; the links beneath still reach them. Nine titles in one
  sentence is not a calm surface.
- **No score.** No percentage, index, grade, streak or weighted composite. Completion,
  contribution, health, trend, inactivity, overdue work and alignment are kept separate,
  because a single number mixing them looks precise and embeds subjective weights.

### The bounded trend

`TrendBars` (`~/shared/charts`) is the shared primitive for **a handful of periods, one
value each** — the only chart shape this pattern has. Hand-rolled SVG, no charting
dependency: a bar chart of six points is a `map` over rectangles, and painting it with
the generated tokens makes it correct in both appearances by construction.

- **The chart is never the only way to read it.** A `summary` sentence stating every
  value is required; it is the SVG's `role="img"` accessible name *and* is rendered
  visibly beneath the bars. Each bar also carries its value and short period label as
  real text, so the numbers survive a printed page, a narrow phone and a screen reader.
- **Two points minimum.** One point is a number with decoration.
- **It grows with the number of periods, then stops.** The plot's width is set from the
  point count, so a two-period trend is a small chart rather than a full-bleed slab
  across a desktop — and it always yields to its container, so a phone gets narrower
  bars and never a horizontal scrollbar. The summary sentence is not width-constrained:
  prose keeps the full measure.
- **Deliberately not interactive.** No tooltips, no hover readouts, no focus targets:
  every value is already printed, so an interaction would only reveal a second copy of
  what is on the page while costing a keyboard user a tab stop.
- **Forced colours.** Fills collapse in forced-colours mode, so the bars carry an
  explicit stroke and stay legible as shapes.

Reference implementation:
[`app/kernel/review-insights/`](../../app/kernel/review-insights/) (the rules — pure,
no React), [`app/modules/reviews/insights/ReviewInsightsPanel.tsx`](../../app/modules/reviews/insights/ReviewInsightsPanel.tsx)
(the surface — renders a decided model and computes nothing),
[`app/shared/charts/TrendBars.tsx`](../../app/shared/charts/TrendBars.tsx) and
[`app/styles/insights.css`](../../app/styles/insights.css) (tokens only).
Decision: [ADR-079](../decisions/ARCHITECTURE_DECISIONS.md#adr-079-review-insights--three-kinds-of-truth-one-persisted-snapshot-and-no-score).

---

## Measurable progress (GOAL-02)

The pattern for a record that carries a NUMBER moving towards a target — today
that is a Goal, and the pieces are shared so the next one does not fork them.

### The progress readout

`GoalProgressReadout` (`~/shared/goal-progress`) is the one block that states
where something measurable stands: the current value, the target beside it, the
shared `ProgressTrack`, the percentage, what remains, and the status in words. It
comes in two sizes — `compact` for a card or a Today row, `hero` for the record,
where the current value is the page's largest number.

- **It computes nothing.** Every figure is derived once, in the kernel, and
  handed to it — the same deliberate limit `ProgressMeter` sets. One evaluator
  means a card can never disagree with the record it links to.
- **The bar announces the sentence the page prints.** `aria-valuetext` is the
  same string ("79 kg · 40% complete · 9 kg remaining"), so what a screen reader
  hears is what a sighted reader sees.
- **Absence is a designed state, not a zero.** Nothing recorded renders "No
  measurement yet" and NO bar. An empty 0% bar claims a journey has started.
- **Status is a word.** Only the two states an owner can act on are tinted, and
  the tint is never the only signal.

### The check-in

`GoalCheckInSheet` — three fields (value, date, optional note) in the shared
[Sheet](#the-shared-sheet), which is a bottom sheet on a phone and a centred
dialog above 768px.

- The numeric field is `inputMode="decimal"` on a TEXT input, never
  `type="number"`: it summons the decimal keypad while keeping a partially-typed
  `-` or `79.` intact, and negative values stay legitimate.
- The date defaults to the owner's calendar today, resolved server-side.
- Save lives in the sheet's sticky footer — outside the form in the DOM, bound to
  it with `form="<id>"` (the shared `Form` accepts an `id` for exactly this), so
  the primary action stays above the phone keyboard.
- Correcting an existing reading opens the SAME sheet with a different title. A
  correction is the same three fields.

### The line trend

`TrendLine` (`~/shared/charts`) is the shared primitive for **a dated series**,
beside `TrendBars`' "a handful of periods". Same rules as every DalyHub chart —
hand-rolled SVG, design tokens, `role="img"` with a generated summary, no
interactivity — plus two of its own:

- **It stays crisp at any width.** The plot stretches a 100×100 space to its
  container, and every stroke carries `vector-effect: non-scaling-stroke`; each
  reading is drawn as a ZERO-LENGTH round-capped segment, which renders as a true
  circle in screen space however the box is squashed.
- **Two readings minimum, and the target is a quiet reference.** One reading is a
  value, not a trend — the caller renders "More measurements needed" instead of a
  flat line. The target is a dashed line only when it falls inside the plotted
  range, and it is always named in text.

### The two-series comparison

`ComparisonBars` — paired bars for a handful of periods with two figures each
(Today's created-versus-completed week). At 320px two overlapping lines are two
scribbles; paired bars keep the series physically separate and print BOTH numbers
under each period, which is why this one carries no visible caption: the values
are already there, and a caption would be the same data three times.

Reference implementation: [`app/kernel/goals/goal-progress-evaluator.ts`](../../app/kernel/goals/goal-progress-evaluator.ts)
(the rules — pure, no React), [`app/shared/goal-progress/`](../../app/shared/goal-progress/)
(the vocabulary and the components), [`app/shared/charts/`](../../app/shared/charts/)
and [`app/styles/charts.css`](../../app/styles/charts.css) (tokens only).
Decision: [ADR-044](../decisions/ARCHITECTURE_DECISIONS.md#adr-044--measurable-goals-a-four-strategy-measurement-model-append-only-measurement-history-and-one-pure-progress-evaluator).

---

## Motion & feedback timing

- **Fast and few.** Transitions ~120–200ms, easing that feels natural. Motion shows causality (this became that, this came from there), never decoration.
- **Reduced motion.** Under `prefers-reduced-motion`, transitions become instant/opacity-only. Meaning is never carried by motion alone.
- **Perceived performance.** Optimistic updates + skeletons keep the product feeling instant even when the network isn't (see [performance budgets](../../AGENTS.md#16-performance-expectations)).

---

## Accessibility

Accessibility is a **requirement** of every pattern above, not a separate track. Target **WCAG 2.2 AA** (see [`AGENTS.md §15`](../../AGENTS.md#15-accessibility-requirements)).

- **Keyboard-complete & focus-visible.** Every pattern is fully operable by keyboard with a visible focus ring and logical order. The [Command Palette](#command-palette) and [Drawer](#drawer) manage focus correctly (trap within modal, restore on close).
- **Semantics first.** Native elements and roles before ARIA. Every control has an accessible name; icon-only actions are labelled.
- **Contrast & non-colour cues.** All token pairs meet AA; state is never conveyed by colour alone (pair with icon/text).
- **Announce change.** [Success](#success-feedback)/[Error](#error-feedback) feedback and async [Loading](#loading) completion use live regions.
- **Respect the user.** Honour reduced-motion, colour-scheme, and text scaling; layouts reflow without loss to 200% zoom.

Accessibility acceptance is part of the [Definition of Done](../../AGENTS.md#18-definition-of-done) for any UI work.

### Progressive form sections

Long create/edit forms should expose the minimum viable creation fields first and
place optional planning or operational fields in a native, keyboard-accessible
`details` disclosure labelled `More details` or `Edit details`. UX-01 applies this
to Task capture, Meeting creation, Meeting detail editing and Meeting follow-up
Task creation. Disclosures must preserve entered values on validation/network
failure, remain usable at 320px, and must not hide required fields unless another
trusted context has already resolved them.

### Owner-local date/time inputs

When a `datetime-local` control represents an owner-local wall-clock time rather
than an already-stored UTC instant, use the shared `LocalDateTimeField` anatomy and
convert with `~/shared/datetime` on the trusted server/action path. The accepted
timezone is the owner/workspace IANA timezone from Application preferences, not
the browser timezone.

---

## Accessibility & Responsive Baseline (DS-11)

[DS-11](../roadmap/ROADMAP_V2.md#-ds-11--accessibility--responsive-baseline) makes the WCAG 2.2 AA + responsive baseline **permanent and automatically inherited**: it audits every shared surface, hardens the few real gaps, and adds the automated regression gate every future module passes through. It builds no product feature and forks no component — the baseline lives in the shared components, the shell and the tokens, so composing them is enough. Full reference: [`ACCESSIBILITY_RESPONSIVE.md`](../development/ACCESSIBILITY_RESPONSIVE.md); decision: [ADR-027](../decisions/ARCHITECTURE_DECISIONS.md#adr-027-accessibility--responsive-baseline--automated-enforcement-and-the-inherited-platform).

**Keyboard conventions (product-wide).**

| Key | Behaviour |
| --- | --- |
| `Tab` / `Shift+Tab` | Logical focus order; the **skip link** is the first stop and jumps to `main`. |
| `/` · `Mod+K` | Focus **Search** · toggle the **Command Palette**. |
| `Escape` | Close the topmost modal (Drawer/Search/Palette/Inspector sheet/confirmation), then restore focus to its opener. Top layer only. |
| `Enter` · `Space` | Activate the focused control / open a focused Card · toggle the focused control. |
| `Arrow` · `Home`/`End` | Move within a composite widget (tabs, listboxes, Card reorder); jump to first/last where it applies. |

Every interactive control is keyboard-reachable with a visible focus ring — no trap, no unreachable control, no lost or hidden focus, no duplicated tab stop. Any new modal **reuses the DS-03 focus/scroll-lock/inert hooks** (never a second focus-trap).

**Responsive rules.** No horizontal overflow from **320px through ultra-wide** (proven at 320/375/390/768/1024/1440/2560); breakpoints are [tokens](#design-tokens-ds-01); component-internal layout prefers **container queries** so a component is correct in a full route and a narrow Drawer/Inspector alike; touch targets meet 44px; **safe-area insets are honoured** (`viewport-fit=cover` + `env(safe-area-inset-*)`); portrait/landscape/desktop/large-monitor/Retina and touch/mouse/keyboard are all first-class.

**Accessibility standards.** Semantic landmarks (`banner`/`search`/`navigation`/`main`) with all content inside a landmark; one non-skipping heading outline (Pane Header `h1` → section `h2` → [Card](#cards) titles via `headingLevel`); accessible names and described-by; live-region announcements; a visible focus ring re-pinned to the system colour under forced-colors; state never by colour alone; reduced-motion, `prefers-color-scheme`, 200% zoom and `prefers-contrast`/forced-colors all respected; and accessible loading/empty/error/busy/disabled states.

**Testing strategy (three layers).** `eslint-plugin-jsx-a11y` (lint) · role-based component tests + the DS-01 token contrast/parity tests · and the DS-11 Playwright gate run by `pnpm test:e2e` in CI: an **axe-core** WCAG 2.2 AA scan of every surface (light/dark, overlays open), a **no-horizontal-overflow** sweep across the viewport matrix, a **platform keyboard audit** (skip link, landmarks, focus trap + restoration), and a **44px touch-target** check on shared controls. Shared helpers live in [`e2e/helpers.ts`](../../e2e/helpers.ts).

**Every future module** inherits this by composing the shell + shared components (Pane Header `h1`, `Card` with the right `headingLevel`, DS-03 hooks for any overlay), uses tokens only, and **adds its `/design/*` fixture or route to `e2e/accessibility.spec.ts` and `e2e/responsive.spec.ts`** so its surface is held to the baseline. See [`ACCESSIBILITY_RESPONSIVE.md → future-module requirements`](../development/ACCESSIBILITY_RESPONSIVE.md#requirements-for-every-future-module).

---

## Using this system

1. **Composing a new screen?** Assemble it from the patterns above. Most screens are: a filtered collection of [Cards](#cards) with a [Filter](#filters) bar, opening records in a [Drawer](#drawer) that uses the [Record Layout](#record-header).
2. **Need something not here?** Build it *as shared*, put it in the right kernel/shared location, and document it in this file in the same PR.
3. **Tempted to make a one-off?** Don't. Log the need, extend the shared pattern, and keep the product coherent.

## Related documents

- [`PRODUCT_EXPERIENCE.md`](PRODUCT_EXPERIENCE.md) — the product-wide experience contract these patterns compose into (screen shapes, hierarchy rules, keyboard vocabulary, reference layouts).
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — why these patterns feel the way they do.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the Shared Design System and each shared pattern are early roadmap items.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — products whose interaction patterns inform these.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — where today's UI diverges from this system.
- [`AGENTS.md`](../../AGENTS.md) — the governing constitution.


## AI proposal and citation patterns (AI-01, 2026-08-05)

Two genuinely reusable patterns entered the system with AI-01. Both live in
`app/shared/ai/` and are used by Meetings, Notes, the guided Review and Ask
DalyHub, so all four behave identically.

**The citation card.** Module/type, title, date, a short excerpt and a link to the
canonical record. It renders only ids DalyHub itself supplied, so a fabricated
citation cannot appear. Classification (`From your records` / `AI inference`) is
carried in **words**, never colour alone.

**The proposal review surface.** Nothing is pre-selected; every field is editable
before acceptance; individual items can be removed; the whole proposal can be
rejected; and there is no route that accepts everything without per-item choice.
Progress uses `role="status"` (a running request is not an alert); `role="alert"`
is reserved for a blocking failure. Provider, model and cost sit in a secondary
`<details>` disclosure. Every layout is single-column and fluid, so 320px is the
design width rather than a squeeze, and no proposal region scrolls inside another.

---

## The notification bell and inbox (NOTIFY-01, 2026-08-16)

One counted control in the frame, and one log inside the shared Sheet. Both live
in `app/shared/notifications/`.

**Naming, stated once so nobody trips on it.** `app/shared/feedback/` owns the
transient TOAST layer, and its component is called `NotificationCenter`. This is
the ledger-backed EVENT log, and it is called the **inbox**. They share a word and
nothing else — no type, no table, no surface. New code says INBOX for the durable
log and FEEDBACK for the toast.

**The bell.** A shared `IconButton` with a count drawn inside its own box. Three
rules:

- **The count is in the accessible NAME** — "Notifications, 3 unread" — because a
  number in a corner is invisible to a screen reader, and colour-plus-position is
  not information. The visible number is `aria-hidden`.
- **It is the product's accent, not alarm red.** DalyHub's philosophy rules out
  "red badges competing for attention"; `--dh-color-danger` stays reserved for a
  genuine fault (D3), and an unread digest is not one.
- **It is absent at zero, and the control is not.** No "0" badge, and no control
  that appears and disappears — a bell that comes and goes moves everything beside
  it, and "nothing has happened" is a thing the owner should be able to check
  rather than infer from empty space. The badge is `pointer-events: none`, so the
  number can never take a tap meant for the glyph.

**The inbox.** The shared `Sheet`, so the focus trap, background inerting, scroll
lock and focus restoration are the DS-03 ones and there is no second modal
machinery. Newest first, flat rows divided by `--dh-color-divider` — **not cards**:
D44's card boundary marks "this is one object", and a log is a sequence of equal
things.

- **One row, one action.** Opening it goes where the event pointed and marks it
  read on the way. No per-notification actions, no snooze, no grouping, no filters
  and no priority — every one of those would make the log a second attention
  model, and Today's rail is that (see
  [ADR-099](../decisions/ARCHITECTURE_DECISIONS.md#adr-099-notifications-are-events-in-a-ledger-not-a-second-attention-model--insert-before-send-a-channel-contract-and-secrets-in-the-settings-store)).
- **Unread is carried three ways**: a heavier title, a small leading accent dot,
  and a visually-hidden "Unread." in the row's own text. Never colour alone, and
  never weight alone — weight is not information a screen reader receives.
- **A failed external delivery is stated on its row**, in DalyHub's own words from
  a closed vocabulary. The row exists whatever the channel did, because the ledger
  insert commits before any send — so "I never got a push" has an answer inside
  the application.
- **Read state is painted optimistically.** It is a claim about what the owner has
  looked at rather than about their data, so it cannot be wrong in a way that
  matters; waiting would leave the row bold as the page navigates out from under
  it. The COUNT stays server-resolved and refreshes through the shell's loader.

**The empty state teaches the next action** and is honest about why it is empty —
notifications are off by default, so "nothing yet" alone would mislead most owners
reading it.

---

## The checklist row (TASKS-13, 2026-08-18)

The lightest repeating row in the product, for the ordered steps inside one
record. Introduced for the Task record's checklist; the pattern is shared because
anything that is *a short list of one-line steps* should look and behave like it.

### Anatomy

```
[check]  Item title ................................................ [⋯]
```

Three grid cells, one flexible:

  - **the check** — the SHARED `.dh-check-circle` inside `.dh-check-circle-target`,
    the same mark completion has everywhere in DalyHub. In this row it keeps a
    full **44 × 44** target on every viewport and **does not** inherit the Task
    row's fine-pointer reduction to 28px: a dense collection buys that height
    back from fifty rows, a record panel has it to spare;
  - **the title** — the only `1fr` track, edited in place through the shared
    DS-16 `InlineTextField`. It wraps; it is never truncated;
  - **the overflow** — the shared DS-12 menu, holding the row's long tail.

No card per item, no border box, no tonal fill, no chip, no status, no date and
no icon run. Separation is whitespace and the alignment of the check column. A
step is deliberately simpler than the record it lives in, and the anatomy is the
argument.

### Two rules the anatomy depends on

**The row must occupy its target, not pull itself out of the grid.** The shared
check target carries a negative inline margin so a Task ROW aligns to the 20px
mark rather than the 44px hit area. In a checklist that margin puts the next
interactive thing 2px inside the checkbox, and axe reports a serious
`target-size` violation on every row. MEASURED: safe clickable space 20px against
the WCAG 2.2 minimum of 24px. The checklist sets `margin-inline: 0`.

**The title cell carries no padding of its own.** The inline editor inside it
already holds the product's 44px control floor and centres its own value, so a
top padding stacks on top of that. MEASURED: 57px a row with it, 45px without —
thirteen pixels a step, which on a list of eight is a hundred pixels of a 420px
panel.

### Interaction

  - one **Add …** affordance opens an inline input in place; a list with no items
    costs one subtle button, never an empty-state card;
  - **Enter** saves and immediately opens the next blank input, so a list is
    typed in one flow;
  - **⌘/Ctrl+Enter** finishes — the product's existing "commit and leave", not a
    new shortcut;
  - **Escape** closes a BLANK input and never discards typed words;
  - **blur saves**, like every other inline field;
  - **reorder is a DRAG and two ordinary menu commands** — *Move up* and *Move
    down*, disabled at the ends. TASKS-13 shipped the commands alone, and the
    reason still holds: a command works identically for a mouse, a keyboard and
    a thumb. DHDS-11 added the spatial path beside them, because a checklist's
    order is the owner's and is stored (`task_checklist_items.position`) — which
    is the condition a DalyHub collection must meet before it may be dragged.
    Both write the SAME `checklist_reorder` intent, so the two can never
    disagree about what an order is;
  - focus after a delete lands on the row that took the deleted one's place;
    closing the composer returns focus to the control that opened it;
  - a **polite live region** speaks an add, a move and a delete — the three
    changes a reader who cannot see the list would otherwise miss. A TICK is not
    announced: the checkbox announces its own state, and a second sentence beside
    it makes the row's most frequent act speak twice.

### One more rule the anatomy depends on

**The Add control is the size of the composer it opens.** A `sm` Button is 32px
and the composer carries the shared inline editor's 45px floor, so the section
grew thirteen pixels the moment the caret arrived. Its floor is therefore
unconditional rather than scoped to `hover: none` the way `card.css` scopes its
touch floors: it is both the thumb target and the slot.

### Progress

Two NUMBERS, in words: **"3 of 5 complete"**. Never a ring, never a percentage,
never a score, never confetti. When everything is done the line says so — and, if
finishing the list does not finish the record, it says that too, because the
reader will otherwise wonder.

`checklistProgressLabel()` is the one place the wording lives, so a row, a record
and a test cannot disagree about it.

### Where a progress figure may go on a collection row

A compact `2 of 5` may sit in the shared row's title cell beside its other
signals — on a DESKTOP row. Below `md` it must not: the row is two stacked lines
and the title has its narrowest measure, so five characters beside it take width
off the title and wrap it. MEASURED on the Tasks collection with and without a
checklist: 44px vs 44px at 1440 and 1280, 100px vs 81px at 393 and 320. The
figure stops below `md`; the record carries it.

---

## The Task card, and the day-column board (UX-02, 2026-08-19)

The narrow presentation of the ONE shared Task row, and the board it exists for.
Introduced for Weekly Planning's week board; the pattern is shared because
**anything with a column narrower than 12rem needs it**, and the alternative is a
second Task row.

### It is a variant, not a second row

`dh-tasklist--cards` on the shared `TaskList` (`app/styles/task-list.css`).
`TaskRow.tsx` is not forked and gains no prop: same markup, same controls, same
canonical intents. Only the grid and the surface change.

```
┌──────────────────────┐
│ ☐  SAF moving from   │     "lead main"
│    CI to GI level    │     "meta meta"
│    qualification     │
│  ⚑P2 ● Work — NSW    │
└──────────────────────┘
```

### The three departures, and what each one buys

| Departure from DS-04 | Why it is right HERE |
|---|---|
| the row takes a **surface** | on a board, a card is what makes a task read as PLACED ON a day rather than as text near a date |
| the title **wraps to three lines** | at a 147px column there is no metadata left to yield, so §10's "metadata yields before the title" is satisfied vacuously |
| the completion target narrows to **28×28** | the same bargain `task-signals.css` already strikes for the row's block size: precise pointer AND desktop frame. WCAG 2.2 SC 2.5.8's 24×24 (AA) fits with room on both axes; every pixel of SC 2.5.5's 44px is kept on a coarse pointer and below `md` |

Two smaller rules the anatomy depends on:

- **The due date is the only cell that yields.** In a day column the column IS the
  date. The cell stays in the DOM and in the accessible reading; only the drawing
  yields.
- **The overflow menu is POSITIONED, not tracked.** `position: absolute`, so the
  card's geometry is identical with it and without it — the device the row's swipe
  tray uses — revealed on hover AND on `:focus-within`, and always visible where
  hover does not exist.

### The gotcha, MEASURED

`--taskrow-columns` is declared on the LIST and inherited — except that the narrow
container-query tiers redeclare it on `.dh-taskrow` itself, and **a value set on
the element beats one it inherits, however specific the list's selector.** A
variant that sets the template on the list alone silently gets the narrow tier's
tracks: measured before it moved onto the row, the card's computed template was
`36px 47.3px 0px` with the title squeezed to 47px.

### Before adopting it: measure the column

The board's numbers are 147px per day at 1440 and a 73px three-line title, and
they are the numbers this variant was tuned against. A surface with a different
column should measure its own and record it, exactly as
[`UX_02_PLAN_HABITS_2026_08.md`](UX_02_PLAN_HABITS_2026_08.md) §3 does — a card is
not a licence to make a column arbitrarily narrow.

---

## The Habit table row and the week strip (UX-02, 2026-08-19)

The four-column presentation of the ONE shared `HabitRow`, and the seven-dot week
inside it.

### The list owns the columns

`HabitList` declares the grid template once and the header and every row inherit
it — DS-04's device for the Tasks list, applied to a second domain for the same
reason: a cell cannot line up with its neighbours if each row decides its own
tracks. `HabitRow` gained a `layout` (`row` | `columns`) rather than a sibling
component, because "ONE Habit row" is what keeps `/habits` and Today from
disagreeing about the same record.

```
[check] [▧]  Strength training   3× weekly       1 of 3 this week   M T W T F S S  ›
             ● Health & Fitness  Mon · Wed · Fri ▓▓▓░░░░            ● ● ○ · · · ·
```

- **The tiers are container queries on the LIST, never media queries on the
  window.** This is a correctness requirement, not a refinement: the component is
  drawn full-width AND inside a 21rem rail, and a window query hands the rail the
  seven-track desktop grid. The strip yields first (the week is already stated in
  words beside it), then below 34rem the row returns to the flat two-line form.
- **The header row is `aria-hidden`.** Every cell carries its own accessible name,
  so a screen reader never needed it and reading it would announce each fact's
  category twice — FINAL-UI's rule for the Tasks list, applied here.
- **Identity is inherited, never invented.** The tile is the shared `AccentIcon`
  at its compact rung, resolved through the ONE `resolveIdentity` from the Area's
  (or supporting Goal's) stored slot and icon key. A record filed nowhere draws
  the neutral container.

### The week strip

Seven dots under seven weekday letters, as a `<table>` with real column headers
where every cell carries the full sentence (`habitHistoryDayLabel`). The rules are
the record's four-week grid's, unchanged — plus one this pass added:

**A day that has not happened is not drawn at all.** The strip receives only the
days up to and including today; every remaining column is empty ground whose
accessible cell says "not yet". A future day is never a hollow circle, because a
hollow circle in a row of filled ones reads as a miss and Thursday cannot be
incomplete on Wednesday.

Four states, and only one of them is a filled dot: `completed` (filled),
`expected` (a ring — the fact is "no check-in", and a verdict is not the product's
to add), `unscheduled` (a whisper), `inactive` (nothing).

### One proportion is allowed, and only under three conditions

A percentage may be drawn only if it is (1) beside the two integers it comes from,
(2) over a bounded window, and (3) computed so that an unscheduled or future day
is not a miss — with no percentage at all when the window expected nothing. See
[ADR-104](../decisions/ARCHITECTURE_DECISIONS.md#adr-104-the-planning-week-is-a-board-and-a-habit-may-state-one-proportion--two-decisions-re-taken-on-fresh-measurements-superseding-adr-101-10-and-adr-102-8).
Streaks, flames, chains, day counts and rings that empty remain forbidden
everywhere.

---

## The dependency row and the blocked line (TASKS-12, 2026-08-19)

Two small patterns, added because TASKS-12 needed to show a RELATIONSHIP between
two Tasks and a derived STATE on a row. Neither introduces a container, a colour
or a glyph the system did not already have.

### The dependency row

```
Blocked by
  Done      Prepare draft                                   [ Remove ]
  Waiting   Get director approval                           [ Remove ]
  [ Add blocker ]
```

The section states no summary sentence of its own. Where a record HEADER already
carries the state, a section that repeats it is a third rendering of one fact —
the record's header says *Blocked*, this list says by what, and that is the whole
of it.

Three cells: a state WORD in a fixed measure, a title that opens that record
through the shared `EntityLink`, and — on the editable direction only — a Remove
control. No card per row, no chip, no arrow glyph, no drag handle and no second
level. Separation comes from whitespace and from the alignment of the state
column, exactly as it does for the [checklist row](#the-checklist-row-tasks-13-2026-08-18).

Three rules the pattern carries:

- **The state is a WORD, never a colour and never a glyph alone.** "Done" /
  "Waiting", so the row survives a monochrome display, a screen reader and a
  colour-blind reader identically. A completed row's strike-through is a SECOND
  reading, never the only one.
- **The row WRAPS rather than truncating.** At 320 the title takes a full line of
  its own and the control follows it; a relationship control pushed off the edge
  is a relationship that cannot be removed.
- **Every control is a 44px target at every width.** The floor is applied to the
  composition rather than to the shared ghost button, because it is a property of
  a relationship control (WCAG 2.2 AA target size) — and a fine pointer loses
  nothing by a control being comfortable.

Only ONE direction of a relationship is editable on a record. The other end is
the same row seen from the other side and is editable on its own record: one
control per fact, so there is never a question of which one won.

### The blocked line on the shared Task row

```
Publish the report          Blocked by Get director approval
```

**It REPLACES the status pill rather than joining it.** "Blocked" on its own is
the least useful half of the fact — the owner already knows the Task has not
moved, and what they need is the name of the thing to chase — so the row states
the whole sentence and the status column stays empty. A pill reading "Blocked"
beside a line reading "Blocked by …" is a duplicated label, which is the thing a
row at 320px can least afford.

- It sits on the TITLE's own line, beside the checklist figure, so it costs the
  row **no grid track**. Measured: **no height at all** at 1440, 1280 and 820,
  and **one extra line** at 393 and 320 (+19px on the Tasks collection), because
  there the row is already two stacked lines.
- One blocker is NAMED; more than one is COUNTED ("Blocked by 2 tasks"), because
  a row cannot carry three titles and naming only the first is a half-truth.
- Unlike the checklist figure — which stops below `md` rather than pay those
  nineteen pixels — it is drawn at **every** width including the phone. That is
  the same trade decided the other way, on purpose: "2 of 5" is a detail the
  owner can go and find; "this cannot start" is the reason the row has not moved,
  which on a phone is the content rather than decoration.

`blocked` joins the ONE display-state precedence evaluator between Waiting and On
hold and takes the **waiting tone**. Blocked and waiting are the same family
("this cannot proceed"), and a second colour for a second flavour of one fact is
status-pill inflation. There is no red, no banner and no border: blocked is a
workflow state, not an error.

### Progressive disclosure in the recurrence editor

TASKS-12 tripled what a recurrence rule can express without lengthening the
common path. The pattern, reusable wherever a closed choice reveals a field:

- the ordinary case is still ONE select (**Repeat**), saved immediately;
- **Custom…** opens the composition, and inside it each further choice reveals
  **exactly one field or none** — the monthly shape is a radio pair (`the same
  day of the month` reveals nothing, `a named weekday` reveals two short
  selects), and the end condition reveals one number, one date, or nothing;
- the RESULT is stated as a sentence before it is saved, through the same
  formatter every read-only surface uses.

**A behavioural choice is offered as OUTCOMES, never as a flag.** There is no
checkbox called "skip weekends" anywhere in DalyHub: the phrase names three
different behaviours in three different products, so the control offers four
complete sentences about what will happen instead. Where a flag would need a
tooltip to say what it does, it should have been a choice.

---

## Drag, reorder and object continuity (DHDS-11, 2026-08)

The full record is
[`DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md`](DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md).
What a component author needs is here.

### The gate — six questions, all of which must answer yes

Before making anything draggable:

1. the object has a real spatial destination or a real, STORED order;
2. the domain mutation the drop performs can be named in one sentence, with no
   conditional;
3. the destination is visible on the screen the drag starts from;
4. a non-drag path exists and is at least as complete;
5. persistence is truthful — the server accepts it and a reload proves it;
6. dragging is faster or clearer than choosing from a menu.

If any answer is no, the object is **not** draggable and the
[DHDS-10](DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md) control is
the whole answer. Two collections in the product pass: a Task's checklist steps
and a Goal's stages. A Task's position in a list does **not** — `task_details`
has no ranking column, and DHDS-11 did not invent one.

### The one implementation

`~/shared/drag`, mounted once by the `AppShell`:

| Export | For |
|---|---|
| `SortableList` + `SortableHandle` | a collection whose order is stored |
| `useDropTarget` | a container that IS a value of a field |
| `useDragHandle` + `DragHandle` | a source that is not in an ordered collection |
| `useDrag` | the live session, for a surface that draws its own state |

It owns **no mutation**. `onDrop` hands the payload back and the surface posts
its own canonical intent — the same one the contextual control beside it posts.
There is no drag mutation path, no drag endpoint and no drag history in DalyHub.
`app/styles/drag.css` declares every state a drag paints, and nowhere else does.

### The five things a drag draws

1. **the grip** — a real `<button>`, named in words, revealed with the row's
   other DHDS-08 affordances on a fine pointer and simply drawn on a coarse one.
   `touch-action: none` is scoped to the grip alone, so every other pixel still
   scrolls;
2. **the preview** — the OBJECT, at its own size, under the pointer. Elevation
   and an edge, and nothing else: no rotation, no tilt, no glow, no scale, and
   no transition while it tracks;
3. **the source** — its row KEEPS its place, drawn quiet. It never collapses, the
   list never jumps, and the scroll position never moves;
4. **the slot** — in a sortable list, that quiet row travels to the insertion
   position as the pointer crosses each neighbour's centre. The gap IS the
   insertion indicator; there is no line and no dashed rectangle;
5. **the destination** — a *candidate* gains a dotted edge and nothing else; the
   *active* one gains the accent, a tint and a solid edge. Exactly one region on
   screen looks like the answer. A container that would refuse the drop
   registers nothing and is drawn nothing.

### Keyboard, and the equivalence rule

`Enter`/`Space` picks up and drops, `↑`/`↓` move, `Escape` cancels — and the
arrows are captured only while the handle is holding something, so nothing a row
already binds is taken away. Every move is announced through one polite live
region, with the instructions spoken **once**, on pick-up.

A handle with no ordered collection behind it (a Task row) offers pointer drag
only; its keyboard equivalent is the DHDS-10 control beside it, which changes the
same field by choosing. **Nothing in DalyHub is reachable only by drag**, and a
test asserts it.

### On a phone

Deliberate, not copied. A short ordered list inside a record keeps its grip at
the 44px floor; a Task row in a scrolling collection has **no** grip, and the
move is its overflow command. Effective manipulation, not identical gestures.

### Object continuity

- a row that the owner's own act removed **collapses** and hands focus to the row
  that takes its place — never to `<body>`. A surface that keeps completed work
  is visibly unaffected, because a departure is derived from the row actually
  having left (closes DEBT-177);
- every movable collection is keyed by its record's canonical id. An index key is
  a functional defect here, not a React nit: it remounts every sibling on every
  move;
- a move changes one field, revalidates only the dimensions the current
  configuration is sensitive to, and leaves the URL, the filters, the sort, the
  scroll and every untouched bucket exactly as they were.
