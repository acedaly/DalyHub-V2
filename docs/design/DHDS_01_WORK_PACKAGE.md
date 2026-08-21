# DHDS-01 — DalyHub product design convergence

> **Binding inputs:** [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md) defines the
> product outcome. [`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md)
> defines current policy and departures. [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
> defines shared mechanics. If they conflict, stop and resolve the conflict in
> documentation or an ADR before changing implementation.

**Delivery status (21 August 2026):** Phases 0–5 are implemented. Phase 6's code,
interaction and documentation sweep is implemented. Phase 3's item 8 (motion,
DHDS-08), item 9 (floating surfaces and contextual choice, DHDS-09) and item 10
(inline manipulation and direct editing, DHDS-10) are implemented; current-branch screenshot recapture for the phase-6 sweep remains
pending from the DHDS-01 delivery. See
[`DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md`](DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md)
for the consumer map, final refinements, regression boundary and exact evidence
still required. The package is not marked fully done until that capture is
inspected.

## Outcome

Make DalyHub feel like one mature, distinctive product capable of competing on
daily usability and finish with Todoist, Notion, Griply, Things and comparable
personal-productivity products.

This package removes visible framework identity, consolidates the product around
DalyHub-owned semantics and brings every module into the composition established
by the approved desktop and mobile mockups.

This is not a framework replacement for its own sake. A successful result is
measured in interaction speed, hierarchy, consistency and visual quality — not
the number of token names deleted.

## Non-negotiable product outcomes

1. **Today becomes the daily command surface.** One current decision, one short
   plan, agenda context and progressive disclosure for everything else.
2. **Tasks becomes the density benchmark.** Capture and common edits are faster
   than opening a record form; list hierarchy remains legible with realistic
   data.
3. **The life spine becomes visible.** Goal, Project, Task, Habit and Area
   relationships are understandable through content and navigation, not a
   diagram users must memorise.
4. **Modules retain purpose-specific character.** Notes is a writing surface;
   Analytics is visual; People is warm; Assets is structured; Settings is quiet.
5. **Mobile is independently composed.** Today and Tasks are one-handed daily
   tools at 320–430px, not responsive leftovers.
6. **No visible framework tells.** No stock MD3 tonal slabs, shadcn dashboard
   grids, Radix-demo menus, Tailwind-template spacing or indiscriminate pills.
7. **The product survives real data.** Long titles, empty states, dense lists,
   overdue items, dark appearance and touch input remain composed.

## Architectural position

DalyHub owns the public semantic layer: product code consumes `--dh-*` tokens
and shared DalyHub primitives. Lower-level generated colour, typography,
accessibility and state machinery may remain behind that layer while it earns
its place.

The target is:

- zero direct `--md-sys-*` consumption in module styles and product components;
- no MD3 component anatomy visible in the interface;
- a reduced, documented `--dh-*` vocabulary organised around product roles;
- CI preventing new module-level dependency on machinery tokens;
- deletion of obsolete machinery only after usage reaches zero and an ADR
  confirms there is no accessibility, colour-generation or migration reason to
  retain it.

Do not spend a release renaming hundreds of tokens while leaving the same
cluttered screen behind. Visual and interaction outcomes are the purpose of the
migration.

## Scope

### Included

- visual hierarchy, composition, typography and responsive behaviour;
- semantic token consolidation and removal of direct framework leakage;
- shared Canvas, Surface, Row, Panel, Gallery item, Metric, Timeline and Editor
  patterns;
- task capture and common inline-edit interaction polish;
- module-specific desktop and mobile refinement;
- light/dark appearance and all supported colour schemes;
- realistic fixture data and screenshot-based visual acceptance;
- documentation, ADRs, CI guards and regression tests required by the change.

### Excluded

- changing canonical entity semantics or database relationships;
- duplicating mobile data models or mutation paths;
- replacing the router, persistence layer or module registry;
- unrelated behavioural defects discovered during visual work;
- autonomous AI actions;
- decorative rebranding that does not improve use.

If a faster interaction requires an API change, record a tightly scoped follow-up
with the blocked flow, expected saving and relevant `file:line` evidence.

## Governance and delivery

- `AGENTS.md` applies in full.
- Use sequential, reviewable PRs. Do not combine a token rewrite, shell rewrite
  and three module restructures in one unreviewable diff.
- Every UI PR cites the relevant `DESIGN_DIRECTION.md` section.
- Each PR includes before/after desktop and mobile screenshots using the same
  data, viewport and appearance.
- Structural changes include component tests; visual changes include screenshot
  inspection at minimum.
- No new component library is introduced without an ADR proving that it improves
  accessibility and maintenance without leaking a second visual language.
- Existing functionality is preserved unless the PR explicitly documents an
  interaction replacement and its migration path.

## Phase 0 — authority and baseline

### Deliverables

1. Commit the updated direction and this work package.
2. Update `AGENTS.md` and the documentation index so both are mandatory reading
   for user-facing work.
3. Capture a reproducible baseline with realistic seeded data:
   - desktop: 1440×1000 and 1280×900;
   - tablet/laptop boundary: 820×1180 and 900×900;
   - phone: 390×844 and 320×700;
   - light and dark for Today, Tasks, Projects, Goals, Notes and Settings;
   - light for every remaining collection and record surface.
4. Record measurable baseline observations: useful rows above the fold, header
   height, largest dead-space region, card count, permanently visible actions,
   horizontal overflow and touch-target failures.

### Checkpoint

No system implementation begins until the baseline and authority documents are
approved. This prevents a coding agent from solving a different visual problem.

## Phase 1 — DalyHub Design System specification

Produce or revise the design-system specification around the eight product
patterns below. This is a specification PR, not a global CSS rewrite.

### 1.1 Semantic tokens

Document the smallest practical public token vocabulary:

- canvas, primary surface, subtle surface, overlay and scrim;
- primary text, secondary text, disabled text and inverse text;
- border, divider, strong control boundary and focus ring;
- brand/action, link and selected state;
- success, warning, error, information and overdue;
- P1 red, P2 orange, P3 blue and P4 neutral;
- six decorative identity accents that cannot be used as status;
- compact/default/touch density values;
- spacing, three primary radius roles, type roles and rare overlay shadows;
- motion durations and reduced-motion behaviour.

For every public token, record purpose, allowed consumers and contrast
obligation. Provide a migration table for direct module consumption of
`--md-sys-*`, raw values and duplicated aliases. The table must distinguish:

- **replace** — a DalyHub semantic equivalent exists;
- **consolidate** — several old tokens become one product role;
- **internalise** — machinery remains private beneath token generation;
- **delete** — no valid consumer remains.

Add a CI rule that prevents new machinery-token consumption outside approved
foundation files. Do not require immediate deletion of private generation tokens
if doing so adds risk without changing the product.

### 1.2 Typography

Evaluate the current family, Inter and the native system stack at 12–32px in
light/dark and on macOS/iOS rendering. Select one family based on:

- title and body legibility at compact productivity density;
- distinguishable weights without synthetic bold;
- tabular numerals for dates, time, metrics and financial assets;
- punctuation and numeral quality;
- variable-font payload and offline PWA behaviour.

Define named product roles rather than importing a framework typescale:

| Role | Use |
| --- | --- |
| Display | Rare landing/empty moment; never routine collection chrome |
| Page title | One per page; compact enough to keep work above the fold |
| Section title | Now, Next, Goals, Schedule and record sections |
| Row title | Primary list content |
| Body | Descriptions and readable prose |
| Metadata | Dates, projects, relationships and support text |
| Label | Controls and compact state words |
| Metric | Goal readings and analytical values, with tabular numerals |

Include worked before/after examples showing hierarchy created with type,
alignment and space instead of nested cards.

### 1.3 Product patterns

Specify anatomy, tokens, density, interaction states, responsive behaviour,
accessibility and prohibited variants for:

1. **Canvas** — page background and content origin.
2. **Surface** — bounded grouping used only when separation is necessary.
3. **Row** — aligned productivity interaction and metadata hierarchy.
4. **Panel** — contextual detail, inspector, drawer or supporting rail.
5. **Gallery item** — recognition-led collection object.
6. **Metric** — reading, comparison, target and trend.
7. **Timeline** — time axis, event/task relationship and current state.
8. **Editor** — document canvas, toolbar and contextual metadata.

For each pattern identify current module consumers and what it replaces. People,
Assets and Tasks are the required variance test: shared rules, deliberately
different information density.

### 1.4 Identity and iconography

- The connected D remains the product mark and appears at intentional identity
  moments, not beside every heading.
- Use one coherent icon family with consistent optical size, stroke weight and
  baseline alignment.
- Entity icons communicate type or recognition. Decorative colour is assigned
  through approved identity accents and never impersonates semantic state.
- P1/P2/P3/P4 flags must be visibly red/orange/blue/neutral in closed controls,
  menus, rows, cards and mobile sheets.
- Define 16px, 20px and 24px icon roles and their matching hit targets.

### 1.5 Reference-screen specification

Document six desktop and four mobile acceptance compositions.

#### Today desktop

- shallow date/greeting header;
- optional quiet daily progress line;
- main column: Now, Next, Later;
- supporting rail: Agenda, Habits, Momentum;
- weekly reporting and secondary system maintenance below/disclosed;
- no oversized sparse hero and no equal-weight widget matrix.

#### Today mobile

- compact product/date header;
- Now task in the first useful viewport;
- Next and Later as dense bounded groups;
- Schedule inline after the active plan;
- Habits/Momentum as low-priority glance content;
- labelled bottom navigation with central Capture.

#### Tasks desktop and mobile

- stable scan axes on desktop and deliberate metadata reflow on mobile;
- title-first Quick Add;
- hover/focus-reveal actions on pointer, explicit overflow on touch;
- completion, due date, project and priority editable without a record-form trip;
- list remains primary over decorative statistics.

#### Projects desktop and mobile

- gallery identity, state, honest progress and next action;
- no fabricated percentages;
- one-column mobile cards with action hierarchy preserved.

#### Goals desktop and mobile

- current reading, target, trajectory, status and next milestone;
- linked driving Projects/Habits/Tasks visible as a causal chain;
- unmeasured Goals presented honestly.

#### Notes desktop

- comfortable writing measure, minimal editor chrome and a contextual metadata
  rail that can collapse without losing the document.

### Phase 1 checkpoint

The PR contains specification, migration inventory, reference compositions and
ADRs only. It must be approved before shared implementation begins.

## Phase 2 — foundation convergence

Implement the public semantic layer and global frame without restructuring
module content.

Order:

1. Public semantic tokens and CI boundary.
2. Typography roles.
3. Canvas, Surface and control geometry.
4. Focus, state layer and reduced motion.
5. Shell alignment, rail density, top utility bar and phone navigation.
6. Screenshot sweep to expose downstream drift.

Acceptance:

- module CSS has no new direct machinery-token use;
- no raw colours, radii, shadows or motion values where a token exists;
- all supported appearance/scheme combinations retain required contrast;
- the shell has one content origin at every width;
- touch layouts maintain the minimum hit-area floor;
- no module structure changes are hidden in this PR.

## Phase 3 — shared product patterns

Migrate patterns in blast-radius order:

1. Row and task metadata.
2. Surface and grouped lists.
3. Panel, drawer and inspector.
4. Gallery item.
5. Metric and chart framing.
6. Timeline.
7. Editor.

**Implementation record:** items 1–2 are defined and applied across Today,
Tasks, Inbox, Plan and Schedule in
[`DHDS_02_ROW_AND_GROUPED_SURFACES_2026_08.md`](DHDS_02_ROW_AND_GROUPED_SURFACES_2026_08.md).
Items 3–7, their module-consumer map and their regression boundary are recorded
in
[`DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md`](DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md).
Panel convergence remains separate from the row pass in history and evidence;
the completion record does not rewrite DHDS-02's scope.

**Item 8 — the MOTION and interaction grammar those patterns move with** — is
recorded in
[`DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md).
It converged the anatomy the earlier phases built onto one motion vocabulary and
one grammar: five semantic durations, four genuinely distinct curves, a shared
enter/exit layer that collapsed twenty-five module keyframes to three, one row
reveal contract, one disclosure transition, one task-completion sequence, and a
reduced-motion contract stated positively rather than as a global multiplier. It
extends the direction the earlier phases established; it does not replace it.

### The phases after DHDS-08, and their boundaries

These are distinct pieces of work and **must not be implemented through bespoke
one-offs** in the meantime. A module that grows its own floating surface, its own
inline editor or its own drag preview is the divergence this sequence exists to
end.

| Phase | Scope | Status |
| --- | --- | --- |
| **DHDS-08** | Motion and interaction grammar | shipped |
| **DHDS-09** | Floating surfaces and contextual choice architecture | shipped |
| **DHDS-10** | Inline manipulation and direct editing | shipped |
| **DHDS-11** | Drag, reorder and object continuity | shipped |

DHDS-08 established the motion grammar DHDS-09's surfaces must use and gave
DHDS-10's inline editors the shared reveal rung, without restructuring either.
It defined DHDS-11's drag grammar and corrected existing drag feedback to it
without building a drag-and-drop architecture; row departure on completion
belonged to DHDS-11, which has since taken it.

**Item 9 — the FLOATING SURFACES those patterns are chosen through** — is
recorded in
[`DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md`](DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md).
It named the six things that may float above the canvas and what each is for,
collapsed six privately-decided panel appearances into one surface with two
rungs and five option-row anatomies into one, retired the product's second
placement solver and its three bare `z-index` numbers, gave the layer scale a
product vocabulary (`--dh-layer-*`), and made the eight independently-built
priority option lists one. It then adopted that system where it changes the
product: the Task row's date, priority and parent; Quick Capture's metadata line;
the form select, entity-link and date controls; the filter and collection
controls; the saved-view switcher; and three collection sorts that were three
different native `<select>`s.

It did **not** widen what is inline-editable, change any mutation path, or add a
tag or Person data model — those are DHDS-10's and the domain's respectively.

**Item 10 — WHICH VALUES are changed where they are shown** — is recorded in
[`DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md`](DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md).
It named the three classes of edit (immediate toggle, contextual choice, inline
text), added the one field DHDS-09's machinery was missing — a searchable
RELATIONSHIP choice over a server save (`InlinePickerField`) — and added the
`presentation="meta"` axis that keeps a run of editable values reading as
information at rest, which is the rule that stops direct manipulation turning a
list into a spreadsheet. It then adopted the grammar where it changes the
product: inline renaming on Today and Plan rather than only `/tasks`; the Task
project field's escape hatch opening a picker instead of the Task's record; the
repeat becoming pressable on the record; a Project's workflow status and a
Project's parent; a Goal's target date on the surface Goals are read from; and
an Asset's status, location and Area on the record that previously printed them
under an "Edit details" link.

It did **not** add drag, reordering or spatial reparenting; it invented no
status vocabulary, no tag model and no Task field; and it changed no mutation
path. Its deferred domain gaps are listed in its own §13.

**Item 11 — WHICH OBJECTS may be moved through space** — is recorded in
[`DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md`](DHDS_11_DRAG_REORDER_AND_OBJECT_CONTINUITY_2026_08.md).
It built the product's ONE drag session (`~/shared/drag`, pointer and keyboard
over Pointer Events, no drag-and-drop dependency), published the six-question
gate a collection must pass before anything in it may be dragged, and REMOVED
DS-04's parallel reorder collection — the second drag system, used by one design
fixture and by nothing in the product.

It then adopted spatial movement in the three places the domain already
supported one: a Task's checklist steps and a Goal's stages, whose order is the
owner's and is stored; and a Task moving between the buckets of a grouped Tasks
view, where a bucket is a destination exactly when its key IS a value of a
stored field. Every drop posts the SAME canonical intent the contextual control
beside it posts. It closed DEBT-177 — a completed row now collapses where it sat
and hands focus to the row that takes its place.

It did **not** add a manual ranking model for Tasks, and that is the phase's
largest decision: `task_details` carries no ordering column, so dragging a Task
up a list would have meant either a schema change or a fake. It added no
dependency, invented no domain concept, and made no surface draggable that could
not prove its change survives a reload. Its deliberate non-adoption — Today,
Plan, Projects, Goals, Habits, Notes, People, Assets, Meetings, Analytics,
Search and the navigation rail — is argued case by case in its own §11.

Each PR must demonstrate at least two module consumers. A pattern is not shared
merely because it lives in `app/shared`; it is shared when different modules can
compose it without private visual overrides.

Do not build a universal mega-component with dozens of product props. Shared
patterns own layout and interaction contracts; product components own domain
meaning.

## Phase 4 — core daily-driver modules

**Implementation status:** shipped. Today, Tasks, Projects, Areas and Goals now
consume the shared Phase 3 contracts. Current composition authorities and the
cross-module acceptance map are recorded in
[`DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md`](DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md#phase-4--core-daily-driver-modules).

### 4.1 Today

Rebuild against the reference composition. Remove duplicated action buttons,
oversized sparse cards and equal-weight supporting sections. Preserve truthful
data and canonical task actions. Measure time-to-identify-next-action and useful
content above the fold before and after.

### 4.2 Tasks

Make list view the quality benchmark. Standardise priority semantics, metadata
order, quick capture and secondary-action reveal. Test dense, long-title,
subtask, recurring, blocked and completed states at desktop and phone widths.

### 4.3 Projects and Areas

Projects use restrained Gallery items; Areas use quieter Rows. Project detail
leads with outcome, condition, progress and next action. Verify the distinction
remains obvious without relying on the page title.

### 4.4 Goals

Implement compact connected progress: reading, target, trend/status and next
milestone, followed by driving work. Do not equate missing measurement with 0%.

Every core PR includes desktop 1440/1280 and phone 390/320 captures, light and
dark for the primary state, plus empty and realistic dense data.

## Phase 5 — remaining modules

**Implementation status:** shipped by the module-family packages cited below;
the consolidated authority map is recorded in
[`DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md`](DHDS_03_07_SHARED_PATTERN_COMPLETION_2026_08.md#phase-5--remaining-modules).

Proceed one coherent module family per PR:

1. **Plan + Schedule** — capacity, commitments and placement; scan-aligned time.
2. **Habits** — one-tap check-in, visible cadence, no guilt mechanics.
3. **Notes** — document canvas and contextual metadata.
4. **Diary + Reviews** — reflective writing, guided but not form-like.
5. **Meetings** — decisions, commitments and conversion to Tasks.
6. **People** — warm recognition and relationship history.
7. **Assets** — obligations, dates and risk with structured density.
8. **Analytics** — questions, comparison, charts and narrative insight.
9. **Inbox + Views + Search** — compact operational utilities.
10. **Settings** — predictable groups, immediate safe changes and unmistakable
    destructive actions.

Each module implements its `DESIGN_DIRECTION.md` section and logs any explicit
deferral. “Existing component retained” is not a justification unless the
component meets the new acceptance criteria.

## Phase 6 — product sweep

**Implementation status:** code, interaction and documentation sweep complete;
current-branch visual evidence pending. Do not change this to complete until the
required browser audit and screenshot set in the completion record are run and
inspected.

- Capture every collection and representative record at desktop, phone, light
  and dark.
- Compare content origin, header height, row density, control geometry, card
  boundary, priority rendering and empty-state voice.
- Remove dead legacy styles and aliases only after repository-wide search proves
  no consumer remains.
- Run accessibility checks for focus order, names, contrast, reduced motion,
  forced colours, text scaling and touch targets.
- Run performance checks for route payload, font loading, layout shift and
  interaction response.
- Update design-system documentation to describe shipped truth, not intent.

## Per-PR evidence contract

Every implementation PR includes:

- direction section implemented;
- before/after screenshots with identical data and viewport;
- files and patterns changed;
- user-visible behaviour preserved or deliberately replaced;
- desktop, mobile, keyboard and touch verification;
- automated tests run;
- accessibility observations;
- measured improvement or concrete visual rationale;
- deferred requirements with reason and follow-up reference.

Silent skips fail review.

## Definition of done

- A new contributor can identify the intended composition of every module from
  repository documentation alone.
- No module visibly resembles a stock framework example.
- Today exposes the next decision before secondary reporting.
- Tasks supports rapid capture and common edits with minimal navigation.
- Goals and Projects visibly connect long-term intent to daily work.
- Desktop and mobile compositions both meet their reference specifications.
- P1 red, P2 orange, P3 blue and P4 neutral are identical everywhere.
- Module code consumes DalyHub semantic tokens and shared product patterns.
- Empty, loading, error, long-title, dense-data, light, dark, keyboard and touch
  states are verified.
- Remaining legacy machinery is private, documented and justified; dead visual
  residue is removed.
- The product passes the finished-product test: content and action are
  recognisably DalyHub, while the underlying implementation framework is not.

## Explicit prohibitions

- No card around every section.
- No card inside a card unless the inner object is independently actionable and
  needs a boundary.
- No pill for ordinary metadata that works as text.
- No decorative gradients outside approved brand assets.
- No permanent row action rail on touch layouts.
- No analytics above today's work merely to make the page look like a dashboard.
- No desktop layout squeezed into a phone.
- No raw framework token in module CSS.
- No new component library without an ADR.
- No behavioural bug-fixing hidden inside a visual convergence PR.
- No claim of completion without inspected screenshots.
