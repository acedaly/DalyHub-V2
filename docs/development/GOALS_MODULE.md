# GOALS_MODULE.md — The Goals module (AREA-02)

The first real **Goals** module: canonical Goal records with a target date and a
definition of done, and exact progress derived from every Project structurally
advancing the Goal. Composed **entirely** from the shared design system and the
FND-07 spine, plus one small additive detail table — no second Goal identity
model.

Accepted via
[ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039-goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary).

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
| `GET /goals` | page | Unchanged FND-09 module placeholder — AREA-02 does not add a global Goals dashboard (none is evidenced as required). |
| `POST /goals/new` | resource | Create a Goal via `spine.createGoal`, after verifying the given Area is active in the trusted workspace. Title only — see "Goal creation" below. |
| `GET /goals/:goalId` | page | Canonical Goal record: Summary, Projects, Activity. |
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
space: pre-wrap` preserves line breaks).

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

## Migration, deployment and deferrals

`migrations/0009_create_goal_details.sql` is additive and forward-only: existing
data remains valid untouched, and a Goal without a `goal_details` row renders
safely with `null` defaults — the Worker never requires backfilling every
existing Goal before it can read. Apply after `0008` in the existing sequential
migration order; no seed or fixture creates production user data.

Deliberate deferrals: an interactive cursor-based "Load more" on the Goal
record's Projects tab (tracked in `PRODUCT_DEBT.md`); AREA-03's alignment
analysis / neglected-Goal detection; AREA-04's mobile-specific refinements; Goal
deletion, archival and restoration (no accepted contract requires them); numeric
Goal targets/categories/tags; a global Goals dashboard.

## Related documents

- [`ROADMAP_V2.md` AREA-02](../roadmap/ROADMAP_V2.md#-area-02--goals)
- [`SPINE_MODEL.md`](./SPINE_MODEL.md)
- [`AREAS_MODULE.md`](./AREAS_MODULE.md)
- [`PROJECTS_MODULE.md`](./PROJECTS_MODULE.md)
- [`ACTIVITY_TIMELINE.md`](./ACTIVITY_TIMELINE.md)
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)
- [`ARCHITECTURE_DECISIONS.md` ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039-goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)
