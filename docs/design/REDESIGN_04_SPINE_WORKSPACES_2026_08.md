# REDESIGN-04 — The Spine Workspaces

> Projects, Areas and Goals brought to the `mockup3.png` standard, in light and
> dark, without losing capability, correctness, accessibility, query discipline
> or data safety.

**Base SHA:** `6e13e4a` — *"design: converge Today and the core spine on the
visual north star (#183)"*, the tip of `origin/main` when this pass started.
**Branch:** `claude/redesign-04-spine-workspaces-fbiytq`.
**Predecessor:** [`REDESIGN_03_CORE_SPINE_CONVERGENCE_2026_08.md`](REDESIGN_03_CORE_SPINE_CONVERGENCE_2026_08.md).
**Specification:** `mockup3.png` (this scope); `mockup2.png` / `mockup4.png` for
the shared language.

---

## 1. Baseline

Every gate was run against the base SHA **before** any code changed, so nothing
in §11 rests on a claim about what "was already broken".

| Gate | At `6e13e4a` |
| --- | --- |
| `format:check` | pass |
| `lint` | pass |
| `typecheck` | pass |
| `scheme:check` | pass |
| `icons:check` | pass |
| `test:unit` | pass — 400 files, 5,590 tests |
| `test:kernel` | pass — 162 files, 2,531 tests |
| `build` | pass |

**There were no pre-existing failures.** The baseline-failure rule in §11 of the
brief therefore never had to be invoked: every gate was green before, and every
gate is green after (§9).

---

## 2. The fixture, and why it was extended

`scripts/ds-final-seed.mjs` is the design fixture, and §10.2 is right that an
empty module cannot be redesigned. It was missing four states this pass exists
to draw, so it gained them — additively, still `dsf-`-prefixed, still
`--clear`-able, and still local-only:

| Added | Why |
| --- | --- |
| Two **archived** Projects (`CRM migration`, `Loft insulation`) | The count line's "N archived" and the Archived lifecycle tab had no rows to describe. The fixture now yields exactly **8 active · 2 archived** — the reference's own figures. |
| A Goal with **one reading** (`Sleep seven hours a night`) | `GoalMeasurementPanel`'s honesty rule — "one reading is a value, not a trend" — was unreviewable because nothing in the fixture was in that state. |
| A Goal with **no measurement configuration** (`Mentor two junior engineers`) | Same reason, for the "invitation instead of a fabricated 0%" path. |
| An `unmeasured` flag on the seed's goal shape | So the above is a real `NULL measurement_type`, not a goal that merely has no readings. |

An Area with no Goals already existed (`Home & Property`), and a Project with a
long description does not exist for the reason §5 records below.

---

## 3. The pre-code audit — main against `mockup3.png`

Captured at 1440 / 1280 / 820 / 390 / 320, light and dark, into
`docs/design/assets/redesign-04/before/` (78 frames).

### 3.1 Projects collection

| The mockup draws | Main did | Verdict |
| --- | --- | --- |
| `Projects` + `8 active · 2 archived` | `Projects` + `50 Projects loaded` | Gap — the line described the loaded page, not the workspace |
| An inline search field in the header band | Nothing | Gap |
| `Active / All / Archived` tabs | `All / Open / Completed / Archived` | Partial — right control, different words and order |
| A `Grid / Table` toggle | Nothing | Gap |
| Tile top-left, overflow top-right, title beneath | Tile and title on ONE row | Gap — and the cause of clamped titles |
| A two-line description | No such field in the data model | **Not buildable** — see §4.7 |
| Bar with the percentage at its right end | Already correct | Keep |
| `14 tasks · 4 due this week` | `● 3 overdue` … `3 open` | Gap — an attention sentence where the reference has volume and urgency |
| A neutral archived card | Muted variant, no neutral tile | Partial |
| Per-project accent bars, hairline boundary, no resting shadow, 15px title | Already correct (REDESIGN-03) | Keep, untouched |

### 3.2 Goals

| The mockup draws | Main did | Verdict |
| --- | --- | --- |
| A master–detail workspace | A gallery of `GoalCard`s | Gap — the largest single one in this pass |
| A list row: tile · name · area · bar · honest value | A card with a reading, a journey line, a sparkline, an alignment line and a contribution count | Gap |
| `Overview / Tasks / Habits / Notes / History` | `Projects / Links / Activity` on the record only | Partial — see §4.2 |
| Identity row, then a **stat trio** | A four-figure strip with an enlarged lead value | Gap |
| A chart with a **dotted projection** to a marked target point | A chart with the target as a dashed reference rule | Gap |
| A `Linked projects` chip row + `+ Link project` | A Projects **tab** of full cards | Gap |
| `+ Add goal` closing the list | No creation entry point at all — it was Area-owned | Gap — see §4.1 |

### 3.3 Areas

No mockup frame. Audited against §6.3 and found **already right**: `EntityRow`
in one bordered surface, the icon-tile identity on the Area's own
`iconKey`/`colourRank`, the shared header composition (title, count, one primary
action), no progress, no percentage, no invented health. See §7.3.

### 3.4 Friction and sediment found

* **Five hand-rolled search fields** (Assets, Meetings, Notes, People, Reviews),
  each with its own wrapper class, placeholder grammar and reset behaviour, and
  each re-implementing the same draft/debounce/URL-write/cursor-reset dance.
* **`ProjectCard`'s title track** was the card width minus a 40px tile minus the
  corner the overflow reserves.
* **A "Load more" cursor that did not know about search**, because search did
  not exist yet — a latent correctness problem the moment it did.

---

## 4. The §5 decisions, as taken

### 4.1 `+ Add goal` vs "creation stays owned by the Area record" (§5.1)

**The mockup won the entry point; the architecture won the shape.**

`+ Add goal` now closes the Goals workspace list, and the empty state creates
rather than redirecting to Areas. Both open a Drawer hosting the **same**
`NewGoalForm` the Area record uses, posting the **same** body to the **same**
trusted `/goals/new` endpoint.

The one difference is that this door does not already know the Area, so the form
**requires choosing one** — a new `areaOptions` prop renders a required Area
select, validated on the client and re-verified server-side by the endpoint,
which already checked that the id names an active Area in the caller's
workspace. No second creation system, no kernel change, no orphan Goals.

*Evidence:* `app/shared/goal-creation/NewGoalForm.tsx`,
`app/modules/goals/GoalsCollection.tsx` (`NewGoalFormHost`),
`app/modules/goals/routes/new.tsx` (unchanged).

The workspace with **no Areas at all** is the one state where creation genuinely
cannot proceed. It says so plainly and links to Areas, rather than opening a
form whose required field has no options.

### 4.2 The `Habits` tab (§5.2), and what the rail is actually made of

The reference draws `Overview / Tasks / Habits / Notes / History`. Three of the
five do not describe this product. **EntityLinks reality was checked before
deciding**, and the rail is:

**`Overview / Projects / Links / History`**

| Reference tab | Decision | Why |
| --- | --- | --- |
| **Habits** | **Omitted** | No Habits module exists, and §5.2 forbids building one to fill a tab. |
| **Tasks** | **Omitted** | A Goal owns no tasks. The spine's rule is that a Task belongs to a Project or floats in an Area (AGENTS.md §4). What a Goal has is *contributing* tasks, which the Overview already shows as alignment evidence, each opening in the shared Task drawer. A tab called "Tasks" over a list a Goal does not own would assert a relationship the model does not have. |
| **Notes** | **Present, as `Links`** | Goals do link to Notes — through EntityLinks, the one relationship model, surfaced by the shared `LinkedItemsTab`. A Goal's linked records are not only Notes, so naming the tab after one of the types it can hold would be *narrower than the truth*. |
| **History** | **Present, as `History`** | The Activity stream, under the reference's word. |
| — | **`Projects` added** | The Goal's own structural children (`project.advances_goal`) — the thing the Overview summarises as chips. Not in the reference at all; it simply had no room. |

The three deeper tabs navigate to the canonical `/goals/:goalId` record rather
than re-rendering its content in the pane, so there is exactly one
implementation of each.

### 4.3 The goals panel's placement (§5.3) — both halves shipped

**`/goals` is the master–detail workspace.** List left, detail right,
URL-addressable selection (`?goal=<id>`), keyboard-navigable (the rows are
ordinary links). On a phone the list and the detail are two screens, swapped by
CSS with both in the DOM — so the first server byte is correct and there is no
hydration mismatch — and the pane carries an `← All Goals` control so a selected
Goal is never a screen with no exit.

**The Projects index gained the compact Goals section** — and it cost no new
read. `loadTodayGoals` (a bounded page of Goals, then **three grouped reads** for
configuration, measurement summaries and milestone weights — no history, no
per-Goal query) was promoted out of the Today module into
`~/shared/goal-progress` as `loadGoalSummaries`. Today calls it under its old
name; Projects calls it directly. The brief anticipated exactly this: *"Today
already renders a Goal-progress rail, so a summary read likely exists — reuse
it."*

The section is its own failure domain and is hidden while the gallery is
narrowed or on a non-default lifecycle tab — an owner searching for a Project is
not asking about Goals, and a rail that ignores the tab above it reads as broken.

### 4.4 `Grid / Table` (§5.4)

Shipped. `?present=table`, a real `<table>` with `<th scope="col">` and
`<th scope="row">`, the same records in the same order from the same loader.

* **Persistence:** the URL, which is where every other view state in this
  product already lives (`?state=`, `?view=`, `?tab=`, the drawer stack). §5.4
  forbids inventing a new persistence system for one toggle, and this invents
  none: the choice is shareable, bookmarkable, Back/Forward-correct and correct
  on the first server byte.
* **Sorting: none, deliberately.** §5.4 permits it "only if sorting already
  exists in the loader's vocabulary". `ListProjectsInput.orderBy` has exactly two
  values — `created` and `recent` — and neither corresponds to a drawn column. A
  clickable header would have to either sort the loaded page client-side (a lie
  about a paginated collection) or add repository orderings, cursor scopes and
  indexes. Recorded rather than faked.
* **The control:** the shared `ViewSwitcher`, unforked. `mockup3.png` draws the
  toggle with the lifted-white-chip selection that FINAL-UI deliberately replaced
  with the near-black filled chip, on seven collections at once. **The product's
  own selected-segment treatment wins** — forking it here would leave two
  selection languages in one product to satisfy one frame. *(Deviation,
  recorded.)*
* **Where it sits:** the control row, not the header's `viewSwitcher` slot. At
  1280 the title row already carries search and the primary action, and a third
  cluster is where it breaks. UIQ-013's semantics are untouched — it is still the
  one switcher control, changing presentation and never which records are
  included.

### 4.5 `4 due this week` and the header counts (§5.5) — the query-cost account

**Both are true, and both are cheap.**

| Figure | Source | Cost |
| --- | --- | --- |
| `14 tasks` | `ProjectListItem.taskTotal` — the rollup the bar above it is already drawn from | **Free.** The same number, stated in words instead of as a proportion. |
| `4 due this week` | `health.summary.upcomingDueOpen`, from `listProjectHealthFacts`, which the collection loader **already** gathers for the whole page in one read in order to evaluate health at all | **Free.** The window is the evaluator's own `UPCOMING_WITHIN_DAYS` (7, today inclusive), which is what makes "this week" a true description rather than a rounded one. |
| `8 active · 2 archived` | New `countProjectsByLifecycle()` | **One grouped statement** — three conditional sums over the same two lifecycle columns the list query filters on, no join to tasks, no per-project read, served by the same partial index. Exactly the "one grouped count query, not per-card reads" §5.5 permits. |
| The Goals section's figures | `loadGoalSummaries` | **A bounded page + three grouped reads**, and not a new read: the one Today already makes. |

**Nothing is per-card, and nothing is an N+1.** Every figure also refuses to lie:
a Project with nothing due says nothing rather than "0 due this week"; a Project
with no tasks says "No tasks yet" instead of a proportion; a failed count read
drops the line back to the loaded-row wording rather than printing a number it
cannot stand behind; and a *narrowed* collection counts what the search matched,
because "8 active" beside three search results answers a question nobody asked.

### 4.6 The attention line vs the meta line (§5.6)

**The mockup's anatomy won the card; attention survived as signal, not sentence.**

`projectAttention` is **not deleted** — it is re-expressed. The state dot moved
to the head of the meta line, carrying the evaluator's tone; the evaluator's own
**full sentence** rides along for assistive tech (which is *more* than the
compact wording it replaces — that was derived, this is the evaluator's own);
and the due-this-week fragment is tinted when the same evaluator reports overdue
work. Small, tokenised, colour **plus** text, never colour alone. The shared
`healthVisible` rule still gates the tint, so a Planned or On-hold Project is
never given a problem it does not have.

The trailing `N open` fact went with it: `63% · 14 tasks · 4 due this week · 3
open` is four numbers about the same eight tasks, and the reference draws two.

### 4.7 The deviation the data model forced: **Projects have no description**

`mockup3.png` draws a two-line description on every project card, and §6.1
assumes one exists. **It does not.** The spine's `entities` table stores
identity and lifecycle; `project_details` stores workflow status, archival and an
icon key. There is no description column for Projects, and none for Areas.

§12 is unambiguous — *"no migrations for design convenience — real data-model
gaps go to `PRODUCT_DEBT.md`"* — so:

* `ProjectCard` **has** the slot (`description`, clamped to two lines, absent
  when null), because the anatomy is right and a caller with real descriptive
  text should have somewhere honest to put it;
* the Projects gallery **passes nothing**, because inventing placeholder prose
  is the one thing worse than an empty region;
* the gap is recorded in `PRODUCT_DEBT.md` as a product decision to take, not a
  migration to sneak in.

This is the single largest visible difference between the after-shots and the
reference, and it is a data decision rather than a design one.

### 4.8 Two smaller recorded deviations

* **A fourth lifecycle tab.** The reference draws `Active / All / Archived`. The
  product also has `Completed`, which is a real, separately-reachable collection
  of Projects; §12 forbids buying simplicity by deleting capability, so it stays
  as a fourth tab in the reference's order. The **label** follows the reference
  (`Open` → `Active`); the **value** does not change, so every `?state=open`
  link, bookmark and test still resolves and the documented
  `ProjectStateFilter` semantics are untouched.
* **Areas get no search field.** §6.3 asks for a "search affordance sized to the
  module's weight". Areas are permanent and few — the whole collection fits on
  one screen — so the honest size is *none*. Adding one would be scope creep
  against the same section's closing rule.

---

## 5. Per-module changes

### 5.1 Projects

**The collection** is §2.1: a compact title with the workspace-wide count line
beneath, an inline search field, one primary button; lifecycle tabs at the
leading edge of a control row with the Grid/Table toggle at its trailing edge;
the full card anatomy; a table view.

**The card** was recomposed to the reference: the tile leads its own row with
the overflow opposite it and the title beneath — which gives the title the
card's **full width** instead of the width left over beside a 40px tile, the
defect that was clamping realistic Project names at four columns. Then the bar
with its percentage at the right end, then the meta line. The foot stays pinned,
so every card in a row still lands its bar on the same baseline.

**Search** is the shared field and the shared controller: a local draft so
typing is instant, a 250 ms debounce so a keystroke is not a navigation, a
`replace`d URL write so Back leaves the collection rather than walking every
character, and a cursor reset because the cursor's scope now includes the term.

**The record** was left alone. §6.1 says to converge its skin and not rebuild its
information architecture, and its skin already came through REDESIGN-03; the one
change that reaches it is the stat trio, which it shares with the workspace.

### 5.2 Goals

**The workspace** is §2.2. The left list is `ProgressRow`; the right pane is
identity → stat trio → chart (with the dotted path to the target) → linked
project chips, over a tab rail composed from what the record really has.

**It is recomposition, not recomputation.** Every figure comes from the kernel
evaluator's output, loaded once by `loadGoalWorkspaceDetail` — extracted so the
canonical record and the workspace make the *same* reads through the *same*
evaluator and can never drift into two pictures of one Goal.

**The measurement panel's honesty rules are intact and now visible in the
fixture:** a Goal with one reading has no chart and says why; no target date, no
required pace; no measurement configuration, an invitation instead of a
fabricated 0%.

**The stat trio** replaced the quartet, and **nothing was deleted**: START is the
chart's baseline reference rule, labelled where it is drawn; REMAINING moved to
the state line beside the status word, where it reads as progress rather than as
a fourth measurement; TARGET DATE took the freed column, which is the fact the
strip was missing now that the chart draws a path towards it. A column whose
*concept* does not apply (a manual Goal's target) is **omitted**; one that
applies but is unset shows a dash with a real word behind it.

**The chart's projection** is drawn **only** when a target value, a target date,
and a target date still ahead of the last reading all exist. It is the
**required** path — the same fact the pace band prints as "required pace" —
never an extrapolation of recent pace, because §6.2 is explicit that an
undefined pace means an absent projection rather than an invented one. It is
dotted (distinguishable from the dashed target rule and the finely-dotted
baseline by *pattern*, not hue), ends in a **ring** rather than a filled dot
(a filled dot is what a recorded reading looks like, and the target has not been
reached), extends the time axis so the target has a real x position, and is
stated in a sentence beneath the plot.

**Linked projects** are the existing `GoalProjectsTab` data as the Overview's
chip row, costing no read. `+ Link project` searches through a new bounded
resource route and creates the link through the **Project's own** trusted `move`
intent — because `project.advances_goal` is the Project's link to own (one
active structural parent per child), and the endpoint re-verifies the parent's
kind and workspace itself. No goal-side link mutation was invented.

**The sparkline did not survive, and that is a decision.** Its job was "which way
is this going?" on a ~260px card. On a row the bar and the value answer "how far
along?" in the same glance, and a 100px sketch between them would be a third
measure at a size that can carry no scale. The trend is not lost — selecting the
row draws the *full* chart beside it, which is the whole point of a
master–detail. `listMeasurementSeries` stays in the loader because it is still
what the record plots.

**Alignment survives as a quiet state** (§6.2): the pane's `AlignmentIndicator`
and the row's accessible name, never a second bar and never a loud badge.

### 5.3 Areas

**Language convergence only — which turned out to be nothing.** Areas already
used the shared header composition, the shared row family and the icon-tile
identity, and already refused progress, percentages and invented health.
Preserving a surface that is already right is a result. The only change reaching
Areas is inherited: the token and card-family edits below.

---

## 6. Shared-primitive changes

Everything new is in `shared/`, and the three modules converge on it. No
per-module forks.

| Primitive | What it is |
| --- | --- |
| `CollectionSearchField` | The one search control: leading magnifier, real hidden label, a Clear that returns focus, Escape-to-clear, a phone composition that collapses to an icon and expands to its own row. Sized from `--dh-control-height`, never `--button-height-md`. |
| `useCollectionSearch` | The draft/debounce/`replace`/cursor-reset behaviour, once. Replaces five hand-rolled copies. |
| `CollectionControlRow` | The row that holds a mode rail at one end and a presentation toggle at the other. |
| `CollectionPresentation` | `?present=grid\|table`, parsed from untrusted URL text. |
| `PaneHeader.search` | A new header slot, and the one documented exception to "filters are not header slots" — with the reasoning written into the component. |
| `ProgressRow` / `ProgressRowList` (`.dh-mrow`) | The measured row: tile · name · context · bar · honest value, with first-class selection (`aria-current`, not tint alone). Used by the Goals workspace **and** the Projects page's Goals section. |
| `GoalStatTrio` | Three equal figures under quiet labels, with absence rendered as absence. |
| `TrendLine.projection` | The dotted path to a marked target point, extending the time axis. |
| `loadGoalSummaries` | Today's bounded Goal-summary read, promoted so Projects can reuse it rather than adding a second. |
| `GoalMeasurementSection` | The measurement panel **and its sheets and fetches**, so the record and the workspace share one implementation of "record a measurement". |
| `loadGoalWorkspaceDetail` | The one Goal-detail read, shared by the record route and the workspace. |

### Kernel and repository

* `ListProjectsInput.search` — one predicate on the query that already exists,
  with an explicit `ESCAPE` so a `%` an owner types is a literal.
* `PROJECT_CURSOR_VERSION` **3 → 4**, binding the search term into the cursor's
  scope. The bump is the point: a v3 cursor encodes no term, so accepting one
  under a narrowed collection would resume an unfiltered ordering inside a
  filtered result set — skipping and duplicating rows. Old cursors are rejected,
  and both callers reset calmly to the first page.
* `countProjectsByLifecycle()` — one grouped statement (§4.5).

---

## 7. Dark mode

Built **on** REDESIGN-03's generator, never beside it. **No new
`prefers-color-scheme` fork exists in any component CSS**; every new surface —
the search field, the control row, the measured row and its selection rail, the
table, the chips, the stat trio, the chart's projection — resolves through the
appearance-aware token pipeline, and `scheme:check` still passes untouched.

Every changed screen was captured in dark explicitly at every width, not
sampled: `docs/design/assets/redesign-04/after/*-dark.png`.

Two deliberate choices carry dark:

* the progress tracks on the **new** surfaces use `--dh-color-border` rather
  than `--dh-color-bg-sunken`, so an empty track reads as a rule rather than as
  a filled container in both appearances — which is also REDESIGN-03 debt item 5
  honoured rather than propagated (§13: no sunken wells on new surfaces);
* the chart's projection and its target ring switch to `CanvasText` under
  `forced-colors`, as do the measured row's fill and its selection outline.

---

## 8. Responsive, accessibility and MD3

### Responsive (§7)

* **Projects at 390:** header with the search **icon** and the add button, tabs
  and the toggle on one row (the rail scrolls, the toggle never leaves), stacked
  cards, then the Goals section.
* **Goals at 390:** list → detail as two screens, both in the DOM, swapped by
  CSS, with `← All Goals` on the pane.
* **The trio stays a trio** at 390 (`max-content` columns, a closing gutter) and
  stacks only below 22.5rem.
* **320 survives** on all three collections — the table scrolls inside its own
  container rather than the document.

### Accessibility

* The table is a real `<table>` with column and row headers, so row/column
  navigation works without a hand-built grid role.
* Selection in the master–detail is `aria-current="page"` **and** a tint **and**
  an accent rail — never a tone alone.
* The chart's projection is a sentence as well as a line; its key repeats the
  dot pattern so the sentence and the plot are recognisably one object.
* Absent values are an em dash **plus** a real word for assistive tech, never an
  empty cell.
* No new control inherits REDESIGN-03 debt item 6: every one added here sizes
  from `--dh-control-height`, which `@media (pointer: coarse)` raises to 44px.
  The product-wide `.dh-btn` fix remains out of scope, and was not made worse.
* `autoFocus` was replaced with the shared Sheet's own `initialFocusRef`, so
  focus stays inside the Sheet's management.

### MD3 reduction (`docs/md3-inventory.md`)

Continued honestly within touched surfaces. No new tonal-container badge was
introduced: the linked-project chips take the card family's hairline boundary
rather than a `secondary-container` fill. The product-wide badge pass was **not**
started, per §13.

---

## 9. Components and CSS removed

`GoalCard` and its ~19,000 characters of `.dh-gcard` CSS (including its phone
rungs) are **gone**, verified repo-wide before deletion. It had exactly one
caller — the Goals gallery — and `mockup3.png` replaced that gallery.

**Every rule it held now lives somewhere still on screen, and none was dropped:**

| The card guaranteed | Where it lives now |
| --- | --- |
| The reading, the journey and the bar | The workspace row's value and bar; the pane's stat trio |
| "No bar, and no zero, for a Goal nothing advances" | `goalRowValue` returns `null`; the row draws no track |
| A measured Goal deliberately not showing alignment as a measure | Still not a measure — the pane's quiet indicator and the row's accessible name |
| The sparkline | The pane's full chart |

Also removed: `GoalEntityCard`, `goalCardFacts`, `alignmentPillTone`, the
`.dh-pcard__attention*` selectors the meta line replaced, and the doc-comment
references to `.dh-gcard` across five files.

---

## 10. Test results

| Gate | Base `6e13e4a` | This branch |
| --- | --- | --- |
| `format:check` | pass | pass |
| `lint` | pass | pass |
| `typecheck` | pass | pass |
| `scheme:check` | pass | pass |
| `icons:check` | pass | pass |
| `test:unit` | pass — 400 files / 5,590 | **pass — 402 files / 5,602** |
| `test:kernel` | pass — 162 files / 2,531 | pass — 162 files / 2,531 |
| `build` | pass | pass |

**Nothing was cheated green.** No test was skipped, `fixme`'d, given a blanket
timeout, retry-inflated, `continue-on-error`'d, or had an axe rule excluded. Two
new unit files were added (`project-card-meta`, `goal-row-value`) covering the
new derivations and — more importantly — their **refusals**: no fabricated zero,
no fabricated target, no count from a failed read.

Where an assertion changed, it changed because the thing it asserted genuinely
moved, and the replacement is **at least as strong**:

* `.dh-pcard__attention` → `.dh-pcard__meta`, and the assertion moved from the
  *compact derived wording* to the **evaluator's own sentence** — a stronger
  check, not a weaker one.
* The Goals gallery tests became workspace-row tests asserting the same honesty
  rules on the element that now carries them.

### What the E2E sweep caught, and what it proved

Two things worth recording, because both are the point of running it:

**A real defect, found and fixed.** On a phone, `/goals` opened on the workspace's
*defaulted* selection — which is right on a desktop, where both panes are on
screen, but on a phone meant the collection URL never showed the collection. The
loader now reports whether the selection was **asked for** (`?goal=` present) or
merely defaulted, and the phone shows the list unless a Goal was genuinely
named. The axe sweep also caught an **invalid heading order** — the workspace's
`h3` rows had no `h2` above them — now a visually-hidden heading on the list
panel.

**Four failures that were already failing at the base SHA, proven.** The
`UIQ-021` overflow-menu tests in `e2e/collection-header.spec.ts` open a row menu
via `openRowMenuNear`, whose premise is `page.locator("article.dh-card")` on
`/tasks`. At `6e13e4a`, `/tasks` renders `.dh-taskrow` (`TaskRow`), and
`TasksWorkspace.tsx` does not import `~/shared/card` at all — so the locator
matched nothing before this pass and matches nothing after it. This branch's
entire diff against that code path is **one doc comment** in
`app/shared/ui/Card.tsx` (`git diff 6e13e4a -- app/modules/tasks
app/shared/task-record app/shared/ui e2e/collection-header.spec.ts` → 1 file, 1
insertion, 1 deletion, all comment). Left unfixed deliberately: it is a Tasks
concern, outside this scope, and the honest repair is to the helper rather than
to anything here.

**One trap worth naming for the next pass:** the design fixture and the E2E seed
share one local D1. Running `scripts/ds-final-seed.mjs` before the suite makes
several specs fail on ambiguity — two Areas matching "Health", extra Projects on
a paginated page — and none of those failures is real. A clean run means
`rm -rf .wrangler/state && node ./e2e/setup-local-db.mjs` first.

E2E: `e2e/spine-workspaces.spec.ts` covers Projects search → open → Back
preserving the narrowed view, the no-match state and its way out, Grid↔Table
showing the same records, the lifecycle tabs' labels and values, the goal list →
detail selection as URL state, a linked project opened and returned from,
recording a measurement and watching the trio change, the `+ Add goal`
Area-choosing flow, the deleted/restore path, Areas' refusal of progress, and
axe + overflow sweeps at 1280 / 390 / 320.

---

## 10b. The identity palette — why the spine looked like Material, and what fixed it

Added after review. The first pass rebuilt every anatomy in this scope correctly
and left the COLOUR alone, and the colour was the thing making the result read as
Material rather than as `mockup3.png`. Three separate causes, all in the
generator.

### The three causes

**1. The ramp was the wrong six colours.** UIX-02 moved record identity off the
chart ramp and onto UIX-01's widget accents — the right direction, the wrong
destination. That ramp is green, blue, amber, violet, **teal** and **cyan**: two
of the six are blue-greens, and none is a red. The reference draws violet,
green, red, orange, blue and amber.

**2. The tile was a tonal container.** M3's custom-colour tones give a container
at **tone 90** and an on-container at **tone 10** — a mid-saturation pastel
carrying a near-black glyph. That is Material's identity chip, and it is exactly
what "looks very like MD3" describes. The reference's tile is a near-white
**tint** (tone 96 at capped chroma) carrying the **saturated hue** as its glyph.

**3. `Blend.harmonize` was rewriting the hues.** It rotates every source up to
15° toward the scheme's seed. Measured under Daly Violet, the reference's red
`#E53E3F` arrived as `#DC3166` — a magenta — and its orange `#E05700` arrived as
`#D54334` — a red. The ramp's own documentation already said an identity colour
is *"GLOBAL across schemes… because a record whose colour changed with the scheme
would make identity meaningless"*; harmonisation had been quietly contradicting
it. The identity ramp is now **unharmonised**, which makes that sentence true.

### What was measured, and what moved

The six hues were **sampled from `mockup3.png`** rather than guessed — a blob
scan over the gallery region, reading each tile's glyph stroke and each progress
bar's fill. Five of the six bar colours are the reference's own hex, unchanged.
Everything that moved, moved for a stated reason:

| Slot | Reference | Shipped | Why it moved |
| --- | --- | --- | --- |
| 1 violet | `#4527D6` | `#4527d6` | — |
| 2 green | `#12972D` | `#008a25` | Its own darkest tone is 4.0:1 under it and white is 3.8:1 — a mid-tone fill with **no honest `on-` colour**. Darkened until one exists. |
| 3 red | `#E53E3F` | `#d93538` | Same. |
| 4 orange | `#E05700` | `#c84d00` | Same. |
| 5 blue | `#0F55DB` | `#0f55db` | — |
| 6 amber | `#F0A020` | `#008392` **(teal)** | See below. |

**Slot 6 is the one substitution, and it is a real trade.** The reference uses
two warm hues — a deep orange and a bright gold — and they read apart in the
picture because the gold is bright. It cannot stay bright: at 2.0:1 on the sunken
track it fails the 3:1 a progress bar owes, and darkening it along its own hue
lands on an ochre a shade from slot 4's burnt orange. Drawing eight cards is not
the same problem as rotating six slots: a ramp whose members are not mutually
distinguishable has stopped doing the one job it exists for. Teal is the nearest
hue the reference does not use, stays clean at every tone, and sits far from both
the green and the blue.

**A red identity is now allowed, and D21 still holds.** UIX-02 kept warm reds out
of this ramp because a red mark could be mistaken for the overdue state. The
reference draws one, and REDESIGN-03 §2.4 had already confirmed the reference's
red bar is deliberate. The separation that matters is structural, not chromatic:
identity paints the tile and the bar; state paints a dot with its own tone **and**
its own words. Nothing on the card is carried by colour alone.

### The contrast promises, kept rather than relaxed

Not one assertion was weakened. `identityTones` derives each slot under four
constraints, checked across **all five schemes and both appearances**:

| Promise | Worst measured |
| --- | --- |
| Bar ≥ 3:1 on the sunken track, the card and the page | 3.08:1 |
| Glyph ≥ 4.5:1 on the composed tile | 4.67:1 |
| Dark bar ≥ 3:1 on its surfaces | 7.67:1 |
| Dark glyph ≥ 4.5:1 on the composed dark mark | 8.96:1 |

The `on-area-accent-N` role is now **derived** rather than hardcoded to white:
each slot takes whichever of white or its own darkest tone genuinely clears AA on
its fill. Nothing in the product currently draws a label on a filled identity
swatch; the reason to make the role truthful rather than exempt it from the
blanket assertion is that the assertion is what stops one being added carelessly.

### What this also removes

Six `-container` / `on-container` pairs stop being Material tonal containers and
become a DalyHub tint-and-hue pair. That is REDESIGN-03 debt item 1 progress on
the surfaces this pass owns, achieved by deletion rather than by re-skinning.

---

## 11. Before / after

* `docs/design/assets/redesign-04/before/` — 78 frames at the base SHA
* `docs/design/assets/redesign-04/after/` — the same matrix, comparable filenames
* `scripts/redesign-04-shot.mjs` — the shooter, extended from
  `redesign-03-shot.mjs` for this scope (every lifecycle tab, both
  presentations, a rich and two sparse Goal records, the workspace with a
  selection, and 320)

Appearance is forced through the product's own `data-appearance` switch, for the
reason REDESIGN-03 documented: a "dark" capture taken with Playwright's
`colorScheme` alone is evidence of nothing.

---

## 12. Remaining debt — honest, and deliberately not fixed here

1. **Projects and Areas have no description field.** The reference draws one on
   every project card. `ProjectCard` has the slot and renders nothing. Recorded
   in `PRODUCT_DEBT.md`; it is a product decision, not a migration to sneak in.
2. **The Projects table does not sort.** §5.4's condition was not met — see
   §4.4. Real sorting needs repository orderings, cursor scopes and indexes.
3. **`ViewSwitcher`'s selected segment is a near-black tonal chip**, not the
   reference's lifted white one. Left unforked on purpose (§4.4); changing it is
   a product-wide control decision with its own verification pass.
4. **REDESIGN-03 debt item 6 (`.dh-btn` at 36px on coarse pointers) is
   untouched.** No control added here inherits it, and none was made worse.
5. **The tonal-container badge family** (REDESIGN-03 debt item 1) is untouched.
   `AlignmentIndicator` still renders one on the Goal pane; nothing new joined
   it.
6. **`--dh-color-bg-sunken`** still dresses `.dh-pcard__track`. New surfaces
   avoid it; converting the existing one is part of the same sweep as item 5.
7. **`e2e/collection-header.spec.ts`'s four `UIQ-021` tests fail on `main` and
   still fail here**, for the reason proved in §10: their helper looks for
   `article.dh-card` on `/tasks`, which that surface has never rendered.
8. **The Goals workspace's status rail counts what is loaded**, not the
   workspace — unchanged from UIX-03, and the subtitle still says so.
9. **`?goal=` and the record route both render a Goal's Overview.** They share
   the read (`loadGoalWorkspaceDetail`) and the measurement section, but the
   record's `GoalOverview` still composes its own header. Folding the record
   onto `GoalWorkspacePane` is a follow-up worth doing and larger than this
   pass's scope allows.

---

## 13. Definition of done — self-assessment

| Criterion (§16) | State |
| --- | --- |
| Would a stranger say Projects is the screen in the picture? | **Yes**, with one recorded exception: the card carries no description, because Projects have none (§4.7). |
| Would a stranger say Goals is the master–detail in the picture? | **Yes** — list, pane, tab rail, identity, trio, chart with the dotted path, linked chips, `+ Add goal`. |
| Is every difference a recorded decision — nothing silent? | **Yes** — §4.4, §4.7, §4.8, and the tab rail in §4.2. |
| Is every figure on screen true and cheap? | **Yes** — the account is §4.5. No per-card read, no N+1. |
| Do Areas read as the same product without pretending to be Projects? | **Yes** — no progress, no percentage, no invented health; asserted in E2E. |
| Does the phone match the handset frame, and does 320 survive? | **Yes** — §8. |
| Is dark the same design in another appearance? | **Yes** — §7, through the generator, with no component-level fork. |
| Did kernel goal honesty, lifecycle, links and query discipline survive? | **Yes** — the evaluator, EntityLinks, Activity, soft-delete/restore and mutation authority are untouched; the only kernel additions are one predicate, one grouped count and a cursor version bump. |
| Tests pass, with pre-existing failures proved against base | **Yes** — there were none (§1), and the suite is larger than it was (§10). |
