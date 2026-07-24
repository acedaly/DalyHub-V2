# GOALS_MODULE.md — The Goals module (AREA-02 + AREA-03)

The first real **Goals** module: canonical Goal records with a target date and a
definition of done, and exact progress derived from every Project structurally
advancing the Goal. Composed **entirely** from the shared design system and the
FND-07 spine, plus one small additive detail table — no second Goal identity
model. AREA-03 turns the previously-placeholder `/goals` route into the
**Alignment view** — a derived, non-persisted signal showing whether recent
Task activity has contributed to each Goal — see [Alignment
(AREA-03)](#alignment-area-03) below.

Accepted via
[ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039-goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)
(AREA-02) and
[ADR-040](../decisions/ARCHITECTURE_DECISIONS.md#adr-040--alignment-a-derived-non-persisted-goaltask-activity-signal-hosted-on-the-real-goals-collection)
(AREA-03).

## Data ownership

Goals are first-class spine records (FND-07 / ADR-014). AREA-02 adds **one**
small, additive table:

| Concern | Authority |
| --- | --- |
| Goal identity, title, completion, lifecycle | `SpineRepository` (the only mutation path) |
| Goal-to-Area structural parentage | `SpineRepository` / the `goal.belongs_to_area` link |
| Target date, definition of done | `GoalDetailsRepository` over `goal_details` |
| Exact linked-Project contribution progress | `GoalRepository.getGoalProjectContribution` — derived, never cached |
| Displayed Project cards (bounded page) | `GoalRepository.listGoalProjects` |
| Event history | the shared Activity stream |

`GoalRepository` (`app/kernel/goals` plus the D1 adapter
[`d1-goal-repository.ts`](../../app/platform/storage/d1/d1-goal-repository.ts)) is
storage-independent at the contract boundary and **read-only**. It resolves a
Goal's current Area (never copied) and the complete Project-contribution fact set
in bounded, parameterised, workspace-scoped queries — React routes never query D1
directly.

`GoalDetailsRepository` (D1 adapter
[`d1-goal-details-repository.ts`](../../app/platform/storage/d1/d1-goal-details-repository.ts))
is the Goal-owned mutation authority for the two additive fields. It never touches
identity, title or completion.

## Goal-owned detail schema

Migration `0009_create_goal_details.sql` adds `goal_details`, keyed by
`(workspace_id, entity_id)`, mirroring `0008_create_project_details.sql`'s shape:

```sql
CREATE TABLE goal_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'goal',
  target_date TEXT,               -- YYYY-MM-DD, or NULL
  definition_of_done TEXT,        -- plain text, or NULL
  updated_at TEXT NOT NULL,
  ...
) STRICT;
```

**No backfill.** An existing or newly-created Goal has no row until its first
detail write; both fields resolve to `null` at the read boundary. This is a
correct default (unset target/definition), unlike `project_details.status`, which
needed a documented backfill because every pre-existing Project needed a
meaningful workflow status.

## Target semantics

The roadmap's "target" is a **nullable owner-calendar target date**, never a
numeric measurement:

- stored as the literal `YYYY-MM-DD` string, never a `Date`, never given an
  implicit midnight timestamp;
- validated by a kernel-owned, dependency-free date-only parser
  (`validateGoalTargetDate` in `app/kernel/goals/goal-details.ts`), deliberately
  duplicating `~/kernel/tasks/task-validation.ts#validateTaskDate`'s
  integer-range/leap-year logic rather than importing the DS-06 UI package into
  the kernel;
- presented with three honest states — **unset** / **upcoming** / **overdue** —
  computed against an owner-calendar "today" the ROUTE resolves server-side
  (`ownerCalendarIso(new Date())`), never client `Date.now()`;
- **never** read as a completion trigger anywhere in the codebase. Explicit
  completion is checked only via the spine's `completedAt`.

No numeric target, unit or measurement system is introduced — no repository
evidence calls for one.

## Definition-of-done semantics

A nullable, **plain-text** (not Markdown) multiline field:

- `normalizeGoalDefinitionOfDone` trims, treats a whitespace-only value as
  `null` (matching the DB's `goal_details_definition_not_blank` CHECK), and
  enforces `GOAL_DEFINITION_OF_DONE_MAX_LENGTH = 2000` code points — bounded
  above the short free-text precedent (`WAITING_NOTE_MAX_LENGTH = 200`) and far
  below the Markdown pipeline's document-scale `MARKDOWN_SOURCE_MAX_BYTES`
  (1 MiB);
- line breaks are preserved accessibly via CSS (`white-space: pre-wrap`) in the
  one React sink (`GoalOverview`'s Summary) — no unsafe HTML, no second
  rendering pipeline;
- never parsed into machine-executable completion rules.

DalyHub's Markdown pipeline is production-ready for Task descriptions and Notes,
but is deliberately **not** claimed for this surface (see ADR-039 §39.4) — that
would be scope beyond what the roadmap and product docs evidence.

## Explicit completion vs. derived progress

`isGoalComplete`/`goalStateLabel` read **only** the spine's `completedAt`.
`goalContributionProgress`/`evaluateGoalProjectContribution` read **only** the
linked-Project fact set. Neither ever influences the other:

- there is **no** hard completion guard requiring every linked Project to be
  complete;
- there is **no** code path that auto-completes or auto-reopens a Goal from
  100% derived progress;
- a Goal can be explicitly Completed while its linked Projects are still
  incomplete, and vice versa — the UI always shows both facts, never conflated.

## Exact Project-contribution boundary

`GoalRepository.getGoalProjectContribution(goalId)` reads **every** active
`project.advances_goal` link with no `LIMIT`, as one workspace-scoped,
parameterised query. A pure, React-free evaluator
(`evaluateGoalProjectContribution` in `app/kernel/goals/goal-progress.ts`, unit-
tested directly with hand-built facts) computes:

| Field | Meaning |
| --- | --- |
| `total` | every non-deleted Project with an active `project.advances_goal` link |
| `completed` | `completedAt IS NOT NULL`, regardless of archived state — mirrors the spine's `GoalRollup.projects` exactly |
| `incomplete` | `total - completed` |
| `active` / `planned` / `onHold` | incomplete, non-archived Projects bucketed by workflow status |
| `archived` | any archived Project, regardless of completion — **Archived precedes Completed**, the same precedence AREA-01's momentum evaluator and Project-card presentation already use, so a completed-and-archived Project counts once |

The evaluator de-duplicates by Project id as defence-in-depth (the database's
partial unique index over structural links already makes a true duplicate active
link unrepresentable).

**Only Projects that actually advance the Goal contribute** — a direct Area
Project (`project.belongs_to_area`) never does. A moved, soft-deleted or
cross-workspace Project immediately stops contributing, because the query
requires an active link AND an active Project entity in the bound workspace.

**The displayed Projects tab and the contribution boundary are two independent
reads**, mirroring [ADR-038 §38.7](ARCHITECTURE_DECISIONS.md)'s corrected Area
momentum boundary precedent exactly: `listGoalProjects` stays bounded and
cursor-paginated (`GOAL_PROJECT_PAGE_SIZE = 50`); `getGoalProjectContribution`
never truncates. A Goal with more than 50 linked Projects still reports the exact
total/completed/breakdown, proven by a real-D1 test seeding 60 Projects.

When there are no linked Projects, the UI shows **"No Projects contributing
yet"** — never a misleading 0%-of-nothing progress bar.

## Routes

Registry-discovered (`app/modules/goals/routes.manifest.ts`), composed by the
shell:

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /goals` | page | **AREA-03.** The real Goals collection — the Alignment view. Every open Goal across every Area, each with its derived `GoalAlignment` state. Replaces the former FND-09 placeholder; no second nav entry was added. |
| `POST /goals/new` | resource | Create a Goal via `spine.createGoal`, after verifying the given Area is active in the trusted workspace. Title only — see "Goal creation" below. |
| `GET /goals/:goalId` | page | Canonical Goal record: Summary (now including the AREA-03 Alignment panel), Projects, Activity. |
| `POST /goals/:goalId/mutate` | resource | `rename` / `update_details` / `complete` / `reopen`, verified active-Goal anchor. |
| `GET /goals/:goalId/activity` | resource | One bounded DS-05 Timeline page over `activity.listForEntity(goalId)`. |

The static `/goals/new` segment is registered before `/goals/:goalId`. Missing,
deleted, wrong-kind and cross-workspace Goal ids fail closed with the same calm
not-found outcome. Resource routes resolve the trusted workspace and actor on
the server; no client-supplied workspace or actor is accepted.

## Goal creation

`app/shared/goal-creation/NewGoalForm.tsx` — a **shared**, not module-owned,
component. It lives outside `app/modules/goals` because its trigger (a "New
Goal" action) is composed by the **Areas** module's record page, and the
cross-module-import rule (`docs/development/MODULES.md`) forbids
`~/modules/areas` importing `~/modules/goals` internals. This mirrors the
ADR-033 precedent that re-homed the shared task record surface for the same
reason.

**Title only.** Matching `NewAreaForm`/`NewProjectForm`/`NewTaskForm`'s
established precedent, the create form collects only a title. Target date and
definition of done are a **post-creation edit** via the canonical record's "Edit
details" Drawer. This is a deliberate choice (ADR-039 §39.7), not an oversight:
it keeps creation a single, already-atomic `SpineRepository.createGoal` call
with no cross-table creation-atomicity risk, and needs no new trusted
composition boundary spanning the spine and `goal_details`.

Creation verifies the Area exists, is active and lives in the trusted workspace
before creating; a missing/deleted/wrong-kind/cross-workspace Area fails closed
with a calm field error and writes nothing.

## Canonical Goal record

`/goals/:goalId`, composed through the shared DS-02 `RecordLayout`:

- **Header** — title, "Goal" type label and icon, explicit Open/Completed
  state, an Area breadcrumb (the current record is the last, unclickable
  breadcrumb item per the shared `RecordHeader` contract), the target date when
  set, and Complete/Reopen + Rename + Edit details actions.
- **Summary** — definition of done (with an honest empty state), target date
  (unset/upcoming/overdue), the exact linked-Project contribution progress, and
  explicit completion status — kept visually distinct.
- **Projects tab** — Projects directly advancing this Goal, reusing the shared
  `Card`/`CardCollection`, the existing Project workflow vocabulary
  (`goalProjectStateLabel`, mirroring `~/modules/projects`/`~/modules/areas`'
  small per-module pure helpers rather than a cross-module import), and links to
  the canonical `/projects/:projectId` record. The tab badge is the EXACT
  `contribution.total`, never the supplied page's array length. A single
  bounded first page (50) with an honest "more Projects exist" note — matching
  AREA-01's Area Goals/Projects tabs, not the Project record's Tasks tab's
  interactive "Load more" (see Deferrals).
- **Activity tab** — the shared DS-05 Timeline over `activity.listForEntity`,
  batched entity resolution (no N+1), safe descriptors (no raw payload
  rendering).

## Goal mutations

All via `POST /goals/:goalId/mutate`, verified active-Goal anchor:

- `rename` → `spine.rename` (title stays spine-owned).
- `update_details` → `GoalDetailsRepository.update`, atomic with its own
  `goal.details_updated` Activity event (never the spine's Activity path). The
  Activity payload records only `{ hasTargetDate, hasDefinitionOfDone }`
  booleans — never the free-text content, which may be private.
- `complete` / `reopen` → `spine.complete`/`reopen`.

Every intent verifies the id resolves to an ACTIVE GOAL in the trusted workspace
before dispatch; a wrong-kind, missing, deleted or cross-workspace id gets the
same calm 404, and an unknown intent gets a typed `400`. No client-supplied
actor or workspace is ever accepted. Mutation outcomes are typed discriminated
unions (`GoalMutationResult`); success revalidates the record loader — no hard
reload.

## Area integration

The Area record's Goals tab (`app/modules/areas/AreaOverview.tsx`) upgrades
without breaking AREA-01's corrected momentum model:

- each Goal card is a real link to `/goals/:goalId`;
- a target date, when set, appears on the card via a **batched** `LEFT JOIN`
  against `goal_details` in `D1AreaRepository.listAreaGoals`'s EXISTING single
  query — genuinely zero additional queries, never a per-Goal fetch;
- a "New Goal" action opens the shared `NewGoalForm` in a Drawer;
- the exact roll-up totals (`rollup.goals.total`) and bounded-card-page honesty
  are unchanged;
- Area momentum never depends on target dates or definition-of-done text.

## Project integration

A Goal created through AREA-02 is a valid Project parent through the **existing**
structural rules — no second Goal-selection model. `POST /projects/new` and
`GET /projects/parent-options` already resolve any active Area or Goal
server-side; a newly-created Goal needs no special-casing. Project parentage
requirements are unchanged (still required, still server-verified); direct Area
Project creation is preserved.

## Accessibility and responsive behaviour

Inherits DS-11. The record, Drawers (New Goal, Rename, Edit details), forms,
tabs and Timeline are keyboard-operable, labelled, focus-restoring, axe-scanned
and overflow-checked. Progress and completion state are always carried by text,
never colour alone. Long Goal titles and long definitions of done wrap without
horizontal overflow (`overflow-wrap: anywhere` on the definition text; `white-
space: pre-wrap` preserves line breaks). AREA-04 (see
[Mobile](#mobile-area-04) below) audits and proves this baseline end to end on
a real phone.

## Testing

- **Unit / pure** (`test/unit/goals`): `goal-details.test.ts` (target-date
  parsing/serialisation including leap years and malformed input,
  definition-of-done normalisation and the length boundary); `goal-progress.test.ts`
  (the exhaustive contribution matrix — no Projects, one incomplete, one
  completed, Planned/Active/On-hold, archived-over-completed precedence,
  duplicate-fact dedup, all-complete without a completion verdict);
  `goal-view.test.ts` (contribution presentation including the exact
  zero-denominator case, target-date display states, explicit completion kept
  structurally separate from derived progress, Archived-over-Completed Project
  labelling); `goal-activity-descriptors.test.ts` (the three Goal-subject
  descriptors, kernel defaults, the safe fallback, no raw payload rendering);
  `GoalOverview.test.tsx` (empty/set definition of done, unset/upcoming/overdue
  target date, Open/Completed states, no-Projects and partial/complete
  progress, the exact tab badge with a smaller supplied first page, Rename/Edit
  details/Complete/Reopen actions, long title/definition wrapping, accessible
  progress and status language).
- **Workers/D1 integration** (`test/kernel/goals.test.ts`,
  `test/kernel/goal-details.test.ts`, `test/kernel/migration-0009.test.ts`):
  schema/FK/CHECK constraints and no-backfill; `getGoalOverview`
  found/renamed/completed/missing/deleted/wrong-kind/cross-workspace;
  `getGoalProjectContribution` exact counts across every classification,
  direct-Area-Project exclusion, moved/soft-deleted/cross-workspace exclusion,
  link-restore resilience (no double-count when a Project revisits a Goal),
  >50 Projects exact and complete independent of the displayed page, and a
  `countingDb`-instrumented fixed-query-count (no N+1) proof;
  `listGoalProjects` keyset determinism and scope-bound cursor rejection;
  `GoalDetailsRepository` get/update, title-stays-spine-owned, idempotent no-op,
  malformed-date and over-length rejection, fail-closed for
  missing/deleted/wrong-kind/cross-workspace ids, and Activity-insert-failure
  rollback (`mutationFault`) proving atomicity.
- **Route integration** (`test/kernel/goals-route.test.ts`): the ACTUAL
  loaders/actions — create (including Area-verification failure cases),
  rename, `update_details` (including a typed validation error that writes
  nothing), complete/reopen (with derived progress asserted unchanged), an
  unknown intent's typed `400`, non-POST `405`s, wrong-kind/cross-workspace
  rejection, calm `404`s, the Activity route, and the exact contribution total
  with bounded displayed Project cards for >50 Projects.
- **E2E** (`e2e/goals.spec.ts`): a real-D1 journey — navigate to an Area, create
  a Goal, land on `/goals/:goalId`, validate the required title, set target
  date and definition of done, verify persistence after navigation, verify the
  Area Goal card links back to the record, create a linked Project through the
  EXISTING `/projects/new` searchable parent picker, verify it contributes to
  progress, complete and reopen (progress unchanged), review Activity, keyboard
  focus restoration on the Edit details Drawer, axe scan, and no horizontal
  overflow at representative desktop/mobile viewports. `e2e/areas.spec.ts` was
  updated to reflect Goal cards now being real links (previously an AREA-01
  regression test explicitly asserted zero links, which is no longer correct
  behaviour).

**AREA-03 (Alignment) testing:**
- **Unit / pure** (`test/unit/alignment`): `goal-alignment.test.ts` — the
  exhaustive state matrix (no Goals is a collection-level empty state, not an
  evaluator case; completed always wins even with recent activity; no
  Projects → `no_structure`; every-Project-archived → `unreachable`, singular
  vs. plural phrasing, a completed-but-not-archived Project does NOT trigger
  it; a contribution path with no recorded activity vs. old activity →
  `neglected` with the exact day count; the inclusive 14-day boundary tested
  at 13/14/15 days and today/yesterday phrasing; multiple contributing
  Projects reflected via the composed contribution counts; no
  `warning`/`danger` tone ever; determinism; `composeGoalAlignmentFacts`'
  honest zero/null composition; `deduplicateGoalIds` as documented defence-
  in-depth for the spine's one-active-parent invariant, since "one Project
  advancing two Goals" is architecturally impossible per `SPINE_MODEL.md`).
  `alignment-view.test.ts` — the display-order sort, the accessible summary,
  the evidence date label, the owner-calendar context builder.
  `presentation.test.tsx`/`GoalsCollection.test.tsx` — `AlignmentIndicator`/
  `GoalAlignmentPanel` render text (never colour alone), evidence links
  navigate to the real Task/Project, the collection's honest empty/failure/
  loaded states and neglected-first sort, `GoalOverview.test.tsx`'s two new
  cases (the Alignment panel and its evidence-driven Task-open action).
- **Workers/D1 integration** (`test/kernel/alignment.test.ts`): workspace
  isolation; a Task's creation/completion/reopening all as qualifying
  evidence; the Task-directly-under-Area and direct-Area-Project cases
  correctly excluded (no Goal path exists); soft-deleted Task exclusion;
  exact, non-leaking attribution across multiple Goals sharing a workspace;
  proof via a Project move that "one Project, two Goals" cannot occur;
  `lastContributingActivityAt` staying unbounded while
  `recentContributingTaskCount` respects the supporting window; an archived
  Project's PAST activity still counting as historical evidence (the
  disclosed §40.8 decision); exactness for 55+ Goals with contributing Tasks
  (chunked, no truncation); a `countingDb`-instrumented fixed-query-count (no
  N+1) proof; `listGoalAlignmentEvidence`'s per-Task most-recent-event
  ranking, bounded `hasMore` truncation, and single-Goal scoping;
  `GoalRepository.listGoals`'s ordering, cursor pagination, scope-bound
  cursor rejection, soft-delete exclusion and workspace isolation;
  `listGoalProjectContributions` matching `getGoalProjectContribution`
  exactly with its own N+1 proof.
- **Route integration** (`test/kernel/goals-alignment-route.test.ts`): the
  ACTUAL `/goals` and `/goals/:goalId` loaders — an honest empty page; every
  state (`no_structure`/`completed`/`active`/`neglected`) reached through
  real spine mutations; the neglected reason grounded in real facts;
  workspace isolation; cursor pagination round-tripping; no raw Activity
  payload in the JSON response; the Goal record's `alignment`/
  `alignmentEvidence`/`alignmentEvidenceHasMore` fields, including the
  `unreachable` state driven by a real archived Project.
- **E2E** (`e2e/goals-alignment.spec.ts`): a real-D1 journey using ONE
  wall-clock-independent seeded Goal (`g-align-neglected`, its only Task
  activity anchored in 2020 — mirrors PROJ-02's `pr-stale` fixture pattern)
  to prove `neglected` with an understandable reason, plus a Goal + Project +
  Task created LIVE through the UI (genuinely recent activity) to prove
  `active` end to end: the collection shows both correctly attributed,
  keyboard-focused Enter navigation to the canonical record, the Alignment
  panel's real Task/Project links (opening the shared Task Drawer, following
  the Project link), and completing the Goal updates the panel to
  `completed` via the existing revalidator with no full browser refresh. Axe
  and no-horizontal-overflow checks throughout; `/goals` and a real Goal
  record were added to the shared `e2e/accessibility.spec.ts` and
  `e2e/responsive.spec.ts` sweeps (DS-11's "every future module adds its
  surface" requirement).

## Alignment (AREA-03)

The Alignment view answers: *what Goals have received meaningful action
recently, and which have had little or none?* It is DERIVED and
NON-PERSISTED, mirroring PROJ-02/AREA-01/AREA-02's pure-evaluator-plus-facts-
repository shape exactly (ADR-040). Nothing about it changes Goal/Project/Task
identity, completion or the spine's relationship model.

**The recent-action window.** `RECENT_ACTION_WINDOW_DAYS = 14`
(`app/kernel/alignment/goal-alignment.ts`) — the same fortnight cadence
ADR-035 already validated for Project staleness. The boundary is
owner-calendar, not a raw UTC window: the evaluator maps the single most
recent qualifying Activity instant to its owner-calendar date and compares it
against "today", exactly mirroring `evaluateProjectHealth`'s staleness
calculation (inclusive — a contribution exactly 14 days old is no longer
"recent").

**Qualifying evidence.** An Activity event whose type is in the EXISTING
`MEANINGFUL_HEALTH_ACTIVITY_TYPES` (ADR-035 §35.4 — no second classification)
AND whose subject is an active Task holding an active
`task.belongs_to_project` link to a Project holding an active
`project.advances_goal` link to the Goal — the ONLY indirect path the spine
allows (`SPINE_MODEL.md`). A Task can never link directly to a Goal; a
Project can never advance more than one Goal (the partial unique structural-
link index), so evidence is always attributed to exactly one Goal by
construction.

**Five explainable states**, precedence `completed` → `no_structure` →
`unreachable` → `active`-or-`neglected`:

| State | Meaning |
| --- | --- |
| `completed` | The Goal's own `completedAt` is set — spine authority only, never inferred from activity. Always wins. |
| `no_structure` | No Project has ever advanced this Goal (`contribution.total === 0`). Distinguished from `neglected` — this Goal was never given a path, not "acted on and then dropped". |
| `unreachable` | Projects advance the Goal, but every one is archived (`contribution.archived === contribution.total`) — the only structurally-enforced block on new Task work (an archived Project cannot receive a new Task). A completed-but-not-archived Project does NOT trigger this. |
| `active` | A reachable structure exists AND the most recent qualifying contribution is within the recent window. |
| `neglected` | A reachable structure exists AND the most recent qualifying contribution (if any) is outside the window, or none has ever been recorded. The roadmap's "neglected Goal". |

Tone is deliberately restricted to `neutral`/`info`/`success` — `warning`/
`danger` are not members of `AlignmentTone` at all, so a future change cannot
accidentally make ordinary inactivity look alarming (PRODUCT_PRINCIPLES'
anti-guilt mandate). Every result carries one or more structured reasons
(primary first, e.g. `"Projects exist, but no recent Task activity was
found."` / `"Most recent contributing Task activity was 23 days ago."`) —
never a bare zero count.

**Two independent reads per Goal — a complete classification boundary and a
separately bounded evidence page**, mirroring ADR-038 §38.7 / ADR-039 §39.6
exactly:

- `AlignmentRepository.listGoalAlignmentFacts`/`getGoalAlignmentFacts`
  (`app/kernel/alignment` + `d1-alignment-repository.ts`) read the COMPLETE
  qualifying-activity aggregate — an unbounded `recentContributingTaskCount`/
  `lastContributingActivityAt` — with no `LIMIT` on the traversal, chunked at
  a fixed, small number of grouped queries per page of Goals (no N+1).
- `GoalRepository.listGoalProjectContributions` is the SAME
  `evaluateGoalProjectContribution` boundary, now batched over a page of
  Goals (mirrors `ProjectHealthRepository.listProjectHealthFacts`'s chunked
  shape).
- `AlignmentRepository.listGoalAlignmentEvidence` is a SEPARATE, small,
  single-Goal, bounded (`ORDER BY occurred_at DESC LIMIT ?`) read used ONLY
  by the Goal record's Summary panel — never consulted for classification, so
  truncating it (an honest "+more" note) can never silently change a Goal's
  state.
- `composeGoalAlignmentFacts` (pure, `app/kernel/alignment`) merges the three
  independent authorities (spine `completedAt`, the contribution boundary,
  the activity aggregate) into the evaluator's actual input — no single
  repository owns the composed shape.

**The collection.** `GoalRepository.listGoals` is a new, small,
keyset-paginated (`GOAL_LIST_PAGE_SIZE = 50`, its own dedicated
`goal-list-cursor.ts` — deliberately separate from the existing Goal→Projects
cursor, matching this codebase's "cursors are never interchangeable across
collection surfaces" convention), workspace-wide read resolving each Goal's
title, completion and resolved Area context. The `/goals` route composes it
with the batched contribution and alignment-facts reads, evaluates each
Goal's alignment, and sorts the FETCHED PAGE (never the whole workspace) by
state precedence (`neglected` → `active` → `unreachable` → `no_structure` →
`completed`) so the Goals most worth a look lead — see Deferrals for the
disclosed cross-page-ordering limitation. A calm summary line reports plain
counts ("2 of 5 open Goals have had recent action") — never a percentage or
score.

**The Goal record.** The Summary tab gains an additive `GoalAlignmentPanel`
(`app/shared/alignment`, mirrors `ProjectHealthPanel`): the state, every
reason, and up to 5 real contributing Tasks (title, parent Project, and how
long ago), each a direct navigation link/action to the canonical Task/Project
record — never a raw Activity payload. The Area record's own Goals tab is
UNCHANGED by AREA-03 (see `AREAS_MODULE.md`).

## Mobile (AREA-04)

AREA-04 is complete as one PR, covering both Goals (this section) and Areas
(see [`AREAS_MODULE.md`](./AREAS_MODULE.md#mobile-area-04)). The audit found
that the canonical Goal record, the `/goals` Alignment collection, and every
Goal Drawer (New Goal, Rename, Edit details) already inherited the right
architecture and nearly all responsive behaviour from the shared design
system; the remaining risk was narrow-phone ergonomics and end-to-end proof,
not a second mobile layout.

- **Problems found.** The one substantive, verified gap was a **shared**
  DS-02 `RecordHeader` breadcrumb defect, not a Goals-specific one: a Goal's
  breadcrumb shows `Areas / <Area title>`, and when the Area title is long
  enough to wrap across several lines on a narrow phone, the decorative "/"
  separator floated mid-paragraph instead of staying attached to the first
  line of the wrapped label (root cause and fix described in
  [`AREAS_MODULE.md`](./AREAS_MODULE.md#mobile-area-04); fixed once, at the
  shared layer, for every module with a breadcrumb). Beyond that: the Goal
  record's header actions (Rename / Edit details / Complete-Reopen), the
  Alignment Summary panel, the Projects tab, and the Goal details Drawer
  (target date + multiline definition of done) all already wrapped, scrolled
  and met the 44px touch-target floor correctly at 320/375/390px and on a
  320×568 short viewport, including with a long definition of done and an
  overdue target date filled in.
- **What changed.** No Goals-specific CSS change was needed. `app/styles/
  goals.css` had zero `@media`/`@container` rules before this audit and still
  has none — every narrow-viewport behaviour the Goal record needs (header
  action wrapping, summary/alignment text wrapping, Drawer-as-sheet, Timeline
  timestamp collapse) already comes from the shared Record Layout, Drawer,
  Alignment and Timeline CSS, most of it hardened by DS-11/PROJ-06 already.
- **Shared contracts reused.** Collection Layout (`/goals`), Card,
  `AlignmentIndicator`/`GoalAlignmentPanel`, Drawer/sheet, Record Layout,
  Tabs, DS-06 forms, shared Timeline and the shared mobile app shell. No
  Goals-specific Card, Drawer, form, Timeline or focus trap was added. Goal
  alignment and Project-contribution progress remain exactly the same
  server-derived reads (`evaluateGoalAlignment`,
  `evaluateGoalProjectContribution`) — nothing was reimplemented in React for
  mobile.
- **Mobile behaviour.** The owner can create a Goal under an Area from the
  mobile shell, land on its canonical record, edit its target date and
  definition of done through the Edit details sheet, complete and reopen it,
  create a Project (and a Task) that advances it and see the Goal's
  Alignment update to "Recently active" with real, tappable evidence links to
  the contributing Task and Project, navigate the Goal's Projects tab, open
  the `/goals` Alignment collection and read both an active and a neglected
  Goal's honest explanation — all without horizontal document scrolling, with
  correct focus restoration on every Drawer close and working browser
  Back/Forward proven for each route-backed Drawer this workflow opens (New
  Area, New Goal, Edit details, and the Alignment evidence's Task Drawer).
- **Swipe decision.** No Goal swipe accelerator was added (see
  [`AREAS_MODULE.md`](./AREAS_MODULE.md#mobile-area-04) for the shared
  rationale) — completing/reopening a Goal is a deliberate, infrequent state
  change, not a lightweight action worth a gesture.
- **Evidence.** `e2e/areas-goals-mobile.spec.ts` (390×844 full workflow,
  320×568 short-height sheets, and a dedicated long-title breadcrumb
  regression) drives Goal creation, details editing, completion/reopening,
  Alignment evidence navigation, Back/Forward, focus restoration, keyboard
  operation, axe and touch-target checks over real seeded + live-created D1
  data — the "active" and "neglected" states are proven end to end here (per
  the roadmap's guidance to keep the real-D1 journey to representative
  states); the full five-state alignment matrix remains covered by
  `test/unit/alignment`. `e2e/responsive.spec.ts` and
  `e2e/accessibility.spec.ts` now sweep the Goal record's Activity tab, the
  New Goal sheet and the Edit details sheet at the canonical viewport matrix
  and its extremes; `e2e/touch-targets.spec.ts` covers the Goal record's
  header actions.
- **Migration/deployment.** No migration, no environment variable, no
  Wrangler configuration change and no new dependency. Deployment implication
  is CSS (the shared `record-layout.css` breadcrumb fix) and test-only code;
  the existing dry-run path remains authoritative.

## Migration, deployment and deferrals

`migrations/0009_create_goal_details.sql` is additive and forward-only: existing
data remains valid untouched, and a Goal without a `goal_details` row renders
safely with `null` defaults — the Worker never requires backfilling every
existing Goal before it can read. Apply after `0008` in the existing sequential
migration order; no seed or fixture creates production user data.

Deliberate deferrals: an interactive cursor-based "Load more" on the Goal
record's Projects tab (tracked in `PRODUCT_DEBT.md`); Goal deletion, archival
and restoration (no accepted contract
requires them); numeric Goal targets/categories/tags. AREA-03 additionally
defers/discloses: cross-page Alignment priority ordering (each page is sorted
internally by state, but a neglected Goal on page 2 is not promoted above an
active Goal on page 1 — low risk given DalyHub is single-owner and most
workspaces hold well under one page of Goals); the Goal record's contributing-
Task evidence is a bounded top-5 with an honest "+more" note, never the
complete list; no alignment HISTORY is stored, so "how has this Goal's
alignment trended over time" is out of scope (a possible future `REVIEW-03`
concern, not this item's) — see `PRODUCT_DEBT.md`.

## Related documents

- [`ROADMAP_V2.md` AREA-02](../roadmap/ROADMAP_V2.md#-area-02--goals) /
  [AREA-03](../roadmap/ROADMAP_V2.md#-area-03--alignment-view)
- [`SPINE_MODEL.md`](./SPINE_MODEL.md)
- [`AREAS_MODULE.md`](./AREAS_MODULE.md)
- [`PROJECTS_MODULE.md`](./PROJECTS_MODULE.md)
- [`ACTIVITY_TIMELINE.md`](./ACTIVITY_TIMELINE.md)
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)
- [`ARCHITECTURE_DECISIONS.md` ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039-goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)
  / [ADR-040](../decisions/ARCHITECTURE_DECISIONS.md#adr-040--alignment-a-derived-non-persisted-goaltask-activity-signal-hosted-on-the-real-goals-collection)
