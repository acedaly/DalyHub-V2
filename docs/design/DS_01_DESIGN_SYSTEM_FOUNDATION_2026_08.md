# DS-01 — The DalyHub Design System Foundation

> **The decision this stage records:** Material Design 3 stops being DalyHub's
> governing design specification and becomes its implementation machinery. The
> DalyHub design system becomes the authority.
>
> **What this stage deliberately did not do:** redesign a screen, restyle a
> component, delete a Material token, or add a dependency. DS-01 is foundations.
> The visual diff is one line of CSS.
>
> Decision: [ADR-092](../decisions/ARCHITECTURE_DECISIONS.md#adr-092-the-dalyhub-design-system-becomes-the-governing-design-language--a-product-owned-semantic-layer-an-explicit-density-model-and-md3-demoted-to-machinery).
> Philosophy and rules: [`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md).
> Mechanics: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
>
> **Which DS-01 this is.** `DS-01`…`DS-17` are also item ids in the **closed**
> [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md), where DS-01 was "Design tokens &
> theming" — the original bespoke `--dh-*` system that M3-01/ADR-074 retired.
> This is the **2026-08 design-system programme**, and it is the series in force.
> The coincidence is worth noticing rather than resolving: the earlier DS-01
> built the token layer this one is, in a sense, rebuilding — pointing the other
> way, and with the ownership question settled first.

---

## 1. What was found

The audit read `AGENTS.md`, both design-system documents, ADR-061/068/069/070/
074/075/077/087/089, the token layer, every shared component directory, the
module stylesheets and the design-system test suites, and searched the tree for
`--md-sys-`, `--md-app-`, `--app-`, `Material`, `M3`, `MD3`, `Expressive`,
`theme`, `tokens`, `radius`, `spacing`, `elevation`, `surface` and `density`.

Six findings shaped everything below.

**Finding 1 — the MD3 problem is a vocabulary problem, not a values problem.**
There is no `@material/web`, no CSS framework and no runtime UI dependency.
`@material/material-color-utilities` is a dev dependency that runs in a
generator script. What DalyHub actually inherited from Material is the set of
*names* a component reaches for. So the question "what colour is a DalyHub
surface?" has, today, only a Material answer — which is what makes MD3 feel
authoritative even though 32 numbered departures say it is not.

**Finding 2 — much of DS-01's conceptual work was already done, and is good.**
UIX-06 already corrected `AGENTS.md` §6 to say DalyHub is not a Material
application; `DALYHUB_DESIGN_SYSTEM.md` already records the departures, the
three-level hierarchy model, the six record-surface families, the expression
budget and the responsive compositions. DS-01 does not re-decide any of it. It
gives it a token layer and a density model, and moves the authority statement
from a caveat inside a Material document to the top of a DalyHub one.

**Finding 3 — there is no density system at all.** ADR-074 Decision 6 retired
DS-14's two `data-density` presets on the reasoning that "density is now a
typescale choice per surface, which is a decision a designer can make per
component rather than a mode a region wrapper has to declare." That reasoning
optimised for the wrong thing: it made density a per-call-site decision, which
is exactly the shape §9.8 rules out for a design value. The 141 occurrences of
the word "density" under `app/` are prose in comments, not a system. A desktop
task list gets its density from `tasks.css`; a menu gets it from
`overflow-menu.css`; they agree because their authors read the same document.

**Finding 4 — there is no shared `Button` component.** `.dh-btn` is a class
string applied as a literal at 76+ call sites across `app/`. The state layer was
consolidated into `base.css` by M3-INT precisely because five hand-rolled copies
had drifted, and `base.css` now names sixteen host classes in five repeated
selector lists. That is the correct fix for a class-based control and it is also
the clearest possible statement that the control wants to be a component.

**Finding 5 — the hard interaction behaviours are already built, tested and
better than a naive library adoption would be.** Focus management, background
inertness, scroll locking, drawer stacking, URL-driven overlay state, anchored
placement with collision handling, a combobox model, a phone-sheet fallback for
anchored surfaces (ADR-087), and a `<select>` that is repainted rather than
replaced (D31) so the platform picker, the free keyboard behaviour and the
no-JS form submit all survive. These are the behaviours a primitive library is
usually adopted *for*.

**Finding 6 — generic and product components are mixed by directory.**
`ConfirmationDialog` and `DangerousAction` — both entirely generic — live in
`app/shared/settings/`. `Pill` (generic) and `Absence` (a product rule about how
an unset value reads) share `app/shared/pill/`. `app/shared/card/` holds
`Card` and `MetricTile` (generic) beside `ProjectCard`, `GoalCard`, `AssetCard`,
`ReviewCard`, `PersonRow` (product). Nothing is broken; the boundary is simply
unstated, so nothing stops a product rule landing in a generic component.

---

## 2. The token architecture

Four layers. The top one is new; the three below it are unchanged.

```
--dh-*        THE DALYHUB DESIGN SYSTEM        ← what a component reaches for
                colour · space · radius · borders · elevation · focus ·
                typography · motion · density

--app-*       structural values M3 does not own
                spacing scale · sizing · shell anatomy · z-index · breakpoints

--md-app-*    the application surface ramp (generated)
--md-sys-*    Material's machinery (generated colour, typescale, shape,
                elevation, state layers, motion)
```

### 2.1 Why the layer aliases rather than duplicates

Every `--dh-*` declaration is a `var()` onto an existing token. Nothing is
copied, and **no colour is authored** — a hex in this layer would be a second
source of truth beside the generator, invisible to `scheme:check` and covered by
no contrast test. Asserted by `dalyhub-tokens.test.ts`.

The consequence is that adopting a DalyHub token is provably a no-op today, and
that is the property DS-01 was built around. `--dh-control-height` resolves to
`--app-control-height-lg`; `--dh-color-surface` resolves to
`--md-app-color-surface-card`. A component that migrates changes vocabulary, not
pixels.

### 2.2 The direction of ownership, and why this is not the retired alias layer

ADR-074 Decision 8 built an alias layer under the *same* `--dh-` prefix and
deleted it on schedule, and `tokens.test.ts` guarded the zero. Reintroducing the
prefix therefore needs an explicit answer, and it is this:

| | ADR-074's layer | This layer |
|---|---|---|
| Maps | DalyHub's **old** names → M3 values | DalyHub's **own** names → M3 values |
| Destination | M3 owns the names | **DalyHub owns both** |
| Deleting it means | the migration **completed** | the migration **failed** |

Same prefix, inverted direction. The old guard could not survive that, so it was
**replaced rather than removed**, by a stronger one: every `--dh-*` name defined
anywhere must be published in `app/shared/tokens/dalyhub.ts`, and may be defined
only in `tokens.css`. The zero permitted any name once the prefix returned; this
permits only an agreed one.

Three names are deliberately reused from the retired layer — `--dh-color-text`,
`--dh-color-text-muted`, `--dh-color-surface-raised`. They were good semantic
names for the same jobs before the overhaul and are good ones after it. What
ADR-074 refused was keeping the old *vocabulary* (`accent-hover`, `surface-nav`,
`density-comfortable`) while destroying its meanings; reusing three well-chosen
job names is not that.

### 2.3 What is deliberately not in the layer

- **Chart series, priority ramps and identity accents.** These are *data*
  vocabularies, not surface vocabularies. Flattening `chart-3` and
  `accent-teal` into "accent" would lose the distinction D21 and D22 spent two
  milestones establishing. A surface drawing data reads the generated role.
- **Breakpoints.** `--app-breakpoint-*` already exists, is mirrored in
  `tokens.ts` for media queries, and is kept in sync by a test. A second
  breakpoint scale would be the "parallel design system" §23 forbids.
- **Z-index.** Structural, already correct, and nothing about it is a design
  language decision.
- **Shell anatomy.** The 216px drawer and the 66px navigation bar are D12/D15
  decisions with their own justifications; they are measurements of a specific
  frame, not vocabulary.

---

## 3. The density model

Three densities, selected by `data-dh-density` on any ancestor.

| | `compact` | `default` | `touch` |
|---|---|---|---|
| For | dense desktop productivity — task lists, tables, filter bars, the command palette | standard desktop and tablet | comfortable, for a finger |
| Control height | 36 | 45 | 45 |
| Menu item height | 36 | 45 | 45 |
| Row height | 45 | 56 | 64 |
| Inline inset | 12 | 16 | 16 |
| Block inset | 8 | 12 | 16 |
| Surface padding | 16 | 20 | 20 |
| Control gap | 4 | 8 | 12 |
| Icon size | 18 | 20 | 20 |

Eight tokens, and **every preset defines exactly those eight** — no more (a
token only some presets define is a token only some components can rely on) and
no fewer (a preset that omits one silently inherits, which is a preset that is
not one). Asserted.

**Density holds nothing but density.** No preset may set a colour, a radius, a
type role or a duration. Those mean the same thing at every density, and a
system where they do not is a second design system wearing one word. Asserted.

**Density is a preference, not a viewport.** A 27-inch monitor driven by a
trackpad is not automatically compact and a 1024px tablet is not automatically
default, so the selector is an attribute. The responsive rule is a *default* for
a document that has not chosen — `:root:not([data-dh-density])` under
`(pointer: coarse)` — which leaves the door open for a Settings control without
that control having to fight a media query. `(pointer: coarse)` rather than a
width query for the same reason the anti-zoom floor uses `(hover: none)`: what
makes a comfortable target necessary is the input mechanism, not the window.

**Density may never cost a touch target.** `compact` is the one preset that
shrinks a hit area, and on a coarse pointer every target it touches is floored
back to `--app-touch-target-min` unconditionally. A compact region on a touch
device is compact in its padding, its glyph and its type, and never in its
targets. WCAG 2.2 target size is not a density setting. Asserted.

**Nothing consumes it yet except the control baseline.** `base.css` reads
`--dh-control-height` on the rule that decides how tall every native
`input`/`select`/`textarea` is — value-identical today, and the point at which
DS-02 can give a dense toolbar its 36px controls by declaring `data-dh-density`
on the region rather than by writing a height somewhere.

---

## 4. Typography

Seven roles, named for the job rather than for a rung of a scale, over the
existing M3 typescale.

| Role | Resolves to | For |
|---|---|---|
| `page-title` | `headline-small` @ 600 | a route's own title. One per page |
| `record-title` | `title-large` @ 600 | a record's title, a dominant surface's headline |
| `section-title` | `title-medium` @ 600 | a section heading, a card or widget title |
| `body` | `body-large` | prose, descriptions, anything read continuously |
| `row` | `body-medium` | a list row's line — the densest text asked to be *scanned* |
| `meta` | `body-small` | a date, a count, a supporting fact |
| `label` | `label-large` | a button, a tab, a menu item, a field label |

What this adds over the typescale is the answer to "what size is a list row's
title?" — which `body-medium` is not, because `body-medium` is a size and three
different things in the product are it for three different reasons.

The scale is compact deliberately: the largest role on an ordinary productivity
surface is 24px and there is no display rung. **Emphasis is weight, not size** —
the M3X `-emphasized` weights are what a title spends, which is what stops a
laptop-width collection title wrapping. Every size is inherited in rem, so OS
text scaling still reaches all of them.

`--dh-font-numeric: tabular-nums` is the numeric-readability request in one
place, so a surface opts in by name instead of every author remembering the CSS.

---

## 5. The component inventory

Classification: **KEEP** (sound, and correct as it is) · **KEEP + RESTYLE**
(sound; its values move to DalyHub tokens) · **REFACTOR** (behaviour is right,
structure is not) · **REPLACE LATER** · **REMOVE LATER**.

The rule applied throughout: a component is not replaced because it has MD3
styling. It is judged on its implementation.

### 5.1 Generic UI

| Component | Where | Verdict | Reasoning |
|---|---|---|---|
| **Button** | `.dh-btn` class, 76+ literal call sites | **REFACTOR** (DS-02) | No component exists. `base.css` names it in five repeated state-layer selector lists, and D13's "a pill is the one primary or destructive action" is a rule enforced by convention at every call site. The single highest-value item in DS-02 |
| **Input / Textarea** | `forms/TextField.tsx` + the `base.css` control baseline | **KEEP + RESTYLE** | UIX-06 already unified the rung and the shape, and the anti-zoom floor lives in the token rather than in a class list. Sound |
| **Select** | `forms/SelectField.tsx` | **KEEP** | D31: repainted, never replaced. Keeps the platform picker, the keyboard behaviour, the AT semantics and the no-JS submit. Do not touch this |
| **Checkbox / Radio** | native, styled in `forms.css`; `Switch.tsx` | **KEEP + RESTYLE** | D7 separates completion (circle) from selection (square) deliberately. One switch since M3-INT |
| **Date control** | `forms/DateField.tsx`, `LocalDateTimeField.tsx`, `inline-edit/InlineDateField.tsx` | **KEEP** | Native `<input type=date>` with timezone-safe conversion in `forms/dates.ts`. A bespoke calendar would be a large surface for no gain |
| **Badge / Chip** | `pill/Pill.tsx` | **KEEP + RESTYLE** | The chip vocabulary is one file. A6's remaining half is *consolidating* chips, not rebuilding one |
| **Card** | `card/Card.tsx` | **KEEP + RESTYLE** | D1's no-border-no-shadow contract holds product-wide since UIX-06 |
| **Menu** | `overflow-menu/OverflowMenu.tsx` (531 lines) | **KEEP** | Roving focus, typeahead, collision-aware placement, a phone sheet below `md`, escape/outside-click. Larger than a library's menu because it does more |
| **Popover** | `anchored/AnchoredSurface.tsx` + `anchored-placement.ts` | **KEEP** | ADR-087: one overlay layer, its own z-rung above modal so a drawer's editor is not painted behind the drawer, sheet on a phone. Portable and tested |
| **Dialog** | `settings/ConfirmationDialog.tsx` | **KEEP + MOVE** (DS-02) | The implementation is sound — typed confirmation, DS-03 modal machinery. It is generic and lives in a domain folder |
| **Drawer** | `drawer/` (13 files) | **KEEP** | URL-driven, stackable, focus-managed, inert background, scroll-locked. The most valuable single asset in the shared layer |
| **Sheet** | `sheet/Sheet.tsx` | **KEEP** | The phone half of every adaptive pattern. D20's header primary action is a real product decision |
| **Tabs** | `view-switcher/ViewTabs.tsx`, `record-layout/RecordTabs.tsx` | **KEEP** | UIX-02 already took tabs out of A6. `RecordTabs` overflows into a menu using the shared compact signal |
| **Tooltip** | `tooltip/Tooltip.tsx` | **KEEP + RESTYLE** | Hover intent, focus, escape, touch suppression, shortcut notation |
| **Empty state** | `empty-state/EmptyState.tsx` | **KEEP** | UIX-06 made it one card obeying D1 and took it out of A6 |
| **Segmented control** | `segmented-filter/SegmentedFilter.tsx` | **KEEP + RESTYLE** | D14: a sunken track with a raised chip. A shipped departure, not drift |
| **Toolbar / filter bar** | `collection-layout/CollectionControls.tsx` and module copies | **REFACTOR** (DS-03) | A6's other remaining half. The first genuine consumer of `compact` density |
| **Combobox** | `forms/use-combobox.ts` + `EntityLinkPicker` | **KEEP** | A headless model with a tested option-search hook |
| **Inline edit** | `inline-edit/` (4 components + a state machine) | **KEEP** | ADR-076/078: one state machine, canonical routes, server-authoritative. Do not reimplement |

### 5.2 Product components

| Component | Where | Verdict |
|---|---|---|
| **TaskRow** | `modules/tasks` + `tasks.css` | **KEEP + RESTYLE** (DS-04). D18/D32 define it; it should read `compact` density rather than its own measurements |
| **ProjectCard / GoalCard / AreaRow / PersonRow / AssetCard / ReviewCard** | `card/` | **KEEP + RESTYLE** (DS-05). §5b's six families are the product's strongest recognition device |
| **GoalProgress / Sparkline / TrendLine / TrendBars / ComparisonBars** | `goal-progress/`, `charts/` | **KEEP**. A5's components all exist; what is outstanding is one legend/empty-state/summary contract across them |
| **TodayWidget / stat row** | `card/StatCard.tsx`, `today.css` | **KEEP + RESTYLE** (DS-06). D11: Today has no hero, and that stays |
| **QuickCapture** | `capture/` | **KEEP**. ADR-088's capture contract is behaviour, not styling |
| **RecordLayout** | `record-layout/` (8 components) | **KEEP**. One layout to learn (AGENTS.md §6) |

### 5.3 Nothing is classified REPLACE LATER or REMOVE LATER

Every audited primitive is either sound as it stands or wants a restyle onto
DalyHub tokens. That is the honest result and it is also the most important one
in this document: **the MD3 work was good engineering.** The problem it left is
a vocabulary and a missing density model, both of which DS-01 fixes without
touching a single component's behaviour.

---

## 6. Generic and product component boundaries

Stated as a rule, because DS-02 needs it before it starts moving files.

- A **generic** component knows about interaction, layout and tokens. It knows
  nothing about Areas, Goals, Projects, Tasks, People, priorities, overdue
  dates, health evaluation or capture.
- A **product** component knows the domain and composes generic ones. It never
  reimplements a generic component's behaviour.
- **A product rule may not live in a generic component.** `Pill` may take a
  tone; it may not know that overdue tasks are coral.
- **A generic component may not import from a module.** The reverse is expected.
- Directory placement follows the boundary, not history. Anything generic living
  in a domain folder is debt with a name, and §5.1 names the two.

---

## 7. The primitive-library decision

**No new primitive dependency is introduced, in DS-01 or DS-02.** Reconsider
only if a *specific, named* component defeats the existing machinery.

Evaluated against `OPEN_SOURCE_POLICY.md`'s checklist:

| Option | Assessment |
|---|---|
| **Radix UI** | Licence and health are fine. The overlap is near-total with code that already exists and is tested — and three DalyHub behaviours would regress: D31's repainted native `<select>` (Radix Select replaces the element, costing the platform picker, the free keyboard behaviour and the no-JS submit), ADR-087's anchored-above-modal z-rung, and the drawer's URL-driven stack. Adopting it would mean writing adapters to restore behaviour we already have |
| **React Aria** | The strongest accessibility story of the three, and the largest surface. Its value is greatest where a product has *no* keyboard/focus infrastructure; DalyHub's is built and asserted by e2e and axe |
| **Base UI** | Youngest of the three, and adopting the least mature option to replace working code is the worst risk/benefit ratio available |
| **shadcn** | Not a dependency but a copy-in generator over Radix and Tailwind. DalyHub has no Tailwind and would not add it (ADR-074 rejected utility frameworks: they move design decisions into markup, which is the opposite of a token layer). A bulk install is explicitly ruled out |
| **Native HTML + existing DalyHub primitives** | **Chosen.** `<select>`, `<input type=date>`, `<details>`, `<dialog>` semantics and native form submission are already load-bearing, and the hard parts are built |

The decisive argument is not "we already have it." It is that **the existing
implementations encode product decisions a library cannot know** — D7, D18,
D20, D31, ADR-087's layer ordering, ADR-076's server-authoritative inline
editing. A library adoption would either lose them or bury them in adapters.

What DS-02 needs is not a primitive library. It is a `Button`.

---

## 8. Accessibility

DS-01 adds no new accessibility surface and regresses none. Three things are
now *enforced* rather than assumed:

1. **Density can never reduce a touch target.** `compact` floors to
   `--app-touch-target-min` on a coarse pointer, unconditionally, asserted.
2. **The focus indicator is three tokens, not a per-component decision** —
   `--dh-focus-width` / `-offset` / `-color`. It still follows each component's
   own radius, so there is nothing to keep in sync.
3. **Border semantics are named by the WCAG distinction.**
   `--dh-color-border` separates (a divider, a card edge, no contrast
   requirement of its own); `--dh-color-border-strong` identifies a control
   (1.4.11, 3:1). Using the first where the second belongs is now a nameable
   defect rather than an invisible one.

Unchanged and still enforced: contrast asserted over the generated scheme in
both appearances across all five colour schemes, `prefers-reduced-motion`,
keyboard completeness, colour never the only signal.

---

## 9. The migration map

Each stage is independently shippable and leaves the application working.

| Stage | Scope | Depends on | Risk |
|---|---|---|---|
| **DS-01** | This document, ADR-092, the `--dh-*` layer, the density model, the audit | — | **Low.** One CSS line changes; every default is value-identical, asserted |
| **DS-02** | Generic UI primitives: a real `Button` over `.dh-btn`; move `ConfirmationDialog`/`DangerousAction` out of `settings/`; split `Pill`/`Absence`; migrate the generic layer's CSS to `--dh-*` | DS-01 | **Medium.** 76+ Button call sites. Mechanical, and the state-layer host list shrinks as it goes |
| **DS-03** | Shell and navigation: drawer, top bar, phone bar, command palette, toolbars/filter bars. First real `compact` adopter | DS-02 | **Medium.** The shell is on every route; D12/D15 measurements must survive |
| **DS-04** | Tasks: TaskRow onto `compact`, list/table density, bulk bar, inline edit | DS-02, DS-03 | **Medium–high.** The most-used surface, and D18/D32 are load-bearing |
| **DS-05** | Projects, Areas, Goals: the six card families onto DalyHub tokens | DS-02 | **Medium.** §5b's shape distinctions must not be flattened |
| **DS-06** | Today: stat row, schedule, focus panel | DS-02, DS-05 | **Medium.** D11 (no hero) stays |
| **DS-07** | Adaptive and mobile audit, and the density preference if it earns one | DS-03…DS-06 | **Medium.** Re-drive the 320…2560 matrix in both appearances |
| **DS-08** | Cleanup: retire `--md-*`/`--app-*` names with no consumers; move the source of truth for each into `--dh-*`; decide what stays generated | all | **Low–medium**, and only if the earlier stages actually finished |

Two things are true across the whole sequence:

- **A file that speaks both vocabularies is expected, not debt.** That is what a
  gradual migration looks like, and it is the opposite of ADR-074's one-commit
  switch — which was right for its problem (a token layer with no working
  intermediate state) and wrong for this one (a component layer that works fine
  at every step).
- **No stage may be a big-bang MD3 deletion.** DS-08 removes what has no
  consumers. If a name still has one, the stage that owns it has not finished.

---

## 10. What DS-01 deliberately did not do

Recorded so none is mistaken for an oversight.

- **Rename or delete any `--md-*` or `--app-*` token.** §6 of the brief rules
  out a destructive rename, and the generator, `scheme:check` and 259 token
  assertions depend on the current names.
- **Restyle anything.** One line of `base.css` changed, to a value-identical
  token, so the layer is load-bearing rather than hypothetical.
- **Redesign a screen.** Today, Tasks, Projects, Goals, Areas, Notes, Calendar
  and Analytics are untouched.
- **Add a dependency.** §7 says why, per candidate.
- **Shrink the application.** The `compact` preset exists and nothing adopts it.
  DS-04 is where a task list gets denser, deliberately and with screenshots.
- **Touch business logic, routes, the schema or a migration.** Nothing under
  `app/kernel`, `app/modules/*/…-repository.ts`, `migrations/` or `workers/` is
  modified.
- **Introduce optimistic behaviour.** ADR-076's "no optimistic write is invented
  to make editing look faster than it is" is untouched.

---

## 11. Remaining design-system debt

| # | Debt | Where it lands |
|---|---|---|
| 1 | `.dh-btn` is a class string at 76+ call sites, and `base.css` names it in five repeated selector lists | DS-02 |
| 2 | `ConfirmationDialog` and `DangerousAction` are generic components in `shared/settings/` | DS-02 |
| 3 | A6's remaining half — chips and toolbars — is still unconsolidated | DS-02 (chips), DS-03 (toolbars) |
| 4 | A5's remaining half — one legend anatomy, one empty state, one summary contract across the five chart primitives | DS-05 |
| 5 | Nothing consumes `compact` yet, so the preset is proven by test rather than by a screen | DS-03 |
| 6 | Module stylesheets still speak `--md-*`/`--app-*` throughout | DS-02…DS-06 |
| 7 | `COMPACT_VIEWPORT_QUERY` mirrors `--app-breakpoint-md` as a string literal (media queries cannot read custom properties) — a known, documented and tested pattern, not new debt, but it is the one place the breakpoint scale is duplicated | DS-07 |
| 8 | There is no density preference control, and no decision on whether the owner should have one | DS-07 |

---

## 12. Validation

| Check | Result |
|---|---|
| `pnpm run typecheck` | pass |
| `pnpm run lint` | pass |
| `pnpm run format:check` | pass |
| `pnpm run scheme:check` | pass — the generated blocks are untouched |
| `pnpm run test:unit` | pass |
| `pnpm run test:kernel` | pass |
| `pnpm run build` | pass |

Visual verification was scoped to what changed: the DalyHub layer authors no
value of its own, every default resolves to the token the application already
painted (asserted), and the single CSS line altered is value-identical at the
default density. E2E shards were not run — no route, component, DOM or
interaction changed, and repository guidance is not to run expensive shards
without a change that justifies them.

---

*This document records DS-01. Amend it in the change that makes the amendment
true — never ahead of it.*
