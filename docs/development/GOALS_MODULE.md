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
[ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039--goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)
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
reads**, mirroring [ADR-038 §38.7](../decisions/ARCHITECTURE_DECISIONS.md)'s corrected Area
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
  `contribution.total`, never the supplied page's array length. A bounded first
  page (50) with a real interactive **"Load more"** (DEBT-22, resolved) —
  [`GoalProjectsTab`](../../app/modules/goals/GoalProjectsTab.tsx) accumulates
  keyset pages via `useFetcher().load('/goals/:goalId/projects?cursor=…')` WITHOUT
  navigating (so `?tab=`/`?drawer=` state, scroll and focus are undisturbed),
  de-duplicates by id (a Project on a page boundary appears once), reconciles from
  the fresh first page on a mutation revalidation, and reuses the existing
  scope-bound, versioned `goal-cursor.ts`. It follows the exact
  `ProjectTasksTab`/`/projects/:projectId/tasks` pattern — the same shared
  `LoadMore` primitive, no forked control. The empty state means the COMPLETE
  result is empty, never merely the current page.
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

**The collection (DEBT-23, globally ordered).** The Alignment order is
established WORKSPACE-WIDE, in the repository, BEFORE pagination.
`GoalRepository.listGoalsByAlignment` computes each Goal's display rank in ONE
workspace-scoped SQL statement: two grouped CTEs gather the complete
Project-contribution facts (total/archived) and the most-recent qualifying
two-hop Task activity (the SAME structural links, `MEANINGFUL_HEALTH_ACTIVITY_TYPES`
vocabulary and `recentWindowStartIso` bound the pure evaluator's facts reads
use), and a `CASE` assigns the exact `GOAL_ALIGNMENT_DISPLAY_RANK` — the ONE
source of truth (`app/kernel/alignment/goal-alignment.ts`) from which the pure
display comparator also derives, so the SQL order can never drift from
`evaluateGoalAlignment` (proven by a parity test). It then keyset-paginates over
`(displayRank, createdAt, id)` — ending in the immutable id — via a dedicated
versioned cursor (`goal-alignment-cursor.ts`) bound to workspace + sort semantics
(`alignment`); a creation-order (`goal-list-cursor.ts`) or cross-workspace cursor
is rejected calmly and reset to the first page. So a neglected Goal is never
stranded on a later page behind an active one. The read is bounded per page and
scans only the workspace's own Goals (no cross-workspace scan), N+1-free.
Alignment stays DERIVED — no persisted score, no cached classification column, no
second algorithm. The `/goals` route composes the ordered page with the batched
contribution and alignment-facts reads and evaluates each Goal for its reasons;
the client renders the authoritative server order and does NOT re-sort. A calm
summary line reports plain counts ("2 of 5 open Goals have had recent action") —
never a percentage or score. (The creation-order `listGoals` remains for other
composition needs.)

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

Deliberate deferrals: Goal deletion, archival and restoration (no accepted
contract requires them); numeric Goal targets/categories/tags. AREA-03
additionally defers/discloses: the Goal record's contributing-Task evidence is a
bounded top-5 with an honest "+more" note, never the complete list; no alignment
HISTORY is stored, so "how has this Goal's alignment trended over time" is out of
scope (a possible future `REVIEW-03` concern — tracked as `DEBT-24`). **Resolved
since:** the Goal record's Projects tab now has an interactive "Load more"
(DEBT-22), and Alignment ordering now spans the whole workspace before pagination
(DEBT-23) — see `PRODUCT_DEBT.md`.

## Related documents

- [`ROADMAP_V2.md` AREA-02](../roadmap/ROADMAP_V2.md#-area-02--goals) /
  [AREA-03](../roadmap/ROADMAP_V2.md#-area-03--alignment-view)
- [`SPINE_MODEL.md`](./SPINE_MODEL.md)
- [`AREAS_MODULE.md`](./AREAS_MODULE.md)
- [`PROJECTS_MODULE.md`](./PROJECTS_MODULE.md)
- [`ACTIVITY_TIMELINE.md`](./ACTIVITY_TIMELINE.md)
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)
- [`ARCHITECTURE_DECISIONS.md` ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039--goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)
  / [ADR-040](../decisions/ARCHITECTURE_DECISIONS.md#adr-040--alignment-a-derived-non-persisted-goaltask-activity-signal-hosted-on-the-real-goals-collection)

## Global Search (X-01)

Goals register `goals.search`, backed by `GoalRepository.searchGoals`. It searches
Goal titles through one bounded workspace-scoped D1 projection and returns
canonical `/goals/:id` route targets. The preview is limited to parent Area,
open/completed state, target date and contributing-Project completion counts.

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**A Goal can finally be removed.** Goals had no removal UI at all, though the spine has
supported soft-delete since FND-07. `POST /goals/:goalId/mutate` now accepts `delete` and
`restore`, anchored with `includeDeleted: true` (exactly as Notes are, ADR-042) so Undo can
restore an already-deleted Goal and a repeated call stays the idempotent no-op the repository
already guarantees — never a spurious 404. **No migration and no new kernel capability**: the
child guard is the spine's own, so a Goal that still owns active Projects is refused with an
explanatory message and nothing is cascaded or orphaned.

The record's overflow (⋯) carries `Delete Goal` — one click, a real server soft-delete, a redirect
to `/goals` and a DS-10 **Undo** toast, all through the shared `useReversibleDelete`. The durable
second path back is `/goals?state=deleted`: an honest Deleted view with a one-click Restore,
served by the **generic** entity list (a spine record IS an entity, so it needed no new query).

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).


---

## Goals in the guided weekly Review (REVIEW-02, 2026-08-05)

The Review's alignment step is a **reader** of AREA-03, not a second model. It calls
`listGoalsByAlignment` for the workspace-wide ranking, `listGoalProjectContributions` and
`listGoalAlignmentFacts` for the facts, `evaluateGoalAlignment` for the rules, and renders
the shared `AlignmentIndicator`. Nothing is scored, cached or persisted, and the bounded
page costs a fixed number of grouped queries regardless of how many Goals exist.

It shows Goals with their alignment state and how many of their contributing Projects are
active, plus how many active Projects have no Goal linked. Wording stays calm and factual —
"No active Project currently contributes to this Goal" — with no scores, streaks,
gamification or moral language. Trend and history remain
[REVIEW-03](../roadmap/ROADMAP_V2_1.md#-review-03--insights--alignment) /
[DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3--resolved-2026-08-08-review-03).

---

## EDIT-02 — editing moved onto the shared inline system (August 2026)

A Goal now edits three values on the record itself: the **name** (shared
`InlineTextField` on the heading), the **target date** (`InlineDateField` in the
Summary) and the **definition of done** (`InlineTextField multiline` — plain text,
not Markdown, because that is what the column stores). Each posts its OWN focused
intent — `rename`, `set_target_date`, `set_definition_of_done` — so changing one
can never overwrite the other. `RenameGoalForm.tsx`, `GoalDetailsForm.tsx` and
both Drawer entries are deleted; `update_details` remains for a caller that
genuinely wants to write both detail fields at once.

The full classification of every editable field in the product, and the reasons
for what was **not** moved, is in
[`EDITING_CONSISTENCY_AUDIT_2026_08.md`](../product/EDITING_CONSISTENCY_AUDIT_2026_08.md).
Passages above that describe a `Rename` action, an `Edit details` panel or a
per-module long-form control describe the surface as it was before that change;
the mutation contracts they document are unchanged.

## Record-screen anatomy (RECORD-01, #131)

The Goal record follows the canonical
[record-screen anatomy](../design/DESIGN_SYSTEM.md#the-record-contract), and is
the one record whose summary genuinely earns a card — a definition of done is
prose. It therefore uses the shared `RecordSummaryBar`'s `description` slot, so
the prose and the derived state share ONE region instead of stacking two.

- **The target date is stated once**, in the header's context line, and what is
  shown IS the editable control. It used to render twice: as read-only text in
  the header and again as the inline date field in the summary list.
- **"Explicit completion" is gone** rather than demoted — it restated the header
  status pill in different words, and a duplicate is removed, not relocated.
- Alignment's state is the band's chip beside the contribution meter it
  explains, and its reasons are the band's signal line. `GoalAlignmentPanel`
  keeps the half the band cannot carry — the evidence — and renders only when
  there is any.
- **Complete** is low-emphasis, like a Project's and a Review's.
- Created and Updated are the band's trailing quiet line. A Goal has no Settings
  tab to demote them into; see **RECORD-02** in
  [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md).

---

# GOAL-02 — measurable Goals

The change that made a Goal answer *am I actually getting there?* Before it, a
Goal could state a target DATE and a definition of done; progress was only ever
the proportion of contributing Projects completed, which answers "how much work
is finished" and not "am I closer to 70 kg".

The product principle it encodes:

> **Goals describe measurable outcomes. Projects and Tasks are the work used to
> achieve them.**

## The measurement model

Four strategies, one shape. Every one reduces to a **baseline**, a **current
value**, a **target** and a **direction**, which is what lets a single pure
evaluator serve all four without a branch per type.

| Type | What it means | Baseline | Current | Target |
|---|---|---|---|---|
| `target_value` | Move from a starting value to a numeric target (85 kg → 70 kg) | the owner's | latest reading | the owner's |
| `accumulation` | Work towards a total (24 books) | `0` | latest reading | the owner's |
| `milestone` | Complete defined stages | `0` | completed weight | total weight |
| `manual` | The owner states a percentage | `0` | latest reading | `100` |

`measurementType = null` means **not measured** — the state every Goal created
before GOAL-02 is in, and a first-class one. It is never rendered as 0%.

**Direction is inferred, never chosen.** 85 → 70 decreases; 5,000 → 20,000
increases (`inferGoalMeasurementDirection`). The owner is never asked about
"ascending"; the inference is stated back in words in the setup sheet.

**`manual` is a fallback, not a default.** It is offered last, and its own copy
says that anything countable is worth counting instead. DalyHub has never stored
a manually-entered Goal percentage, so there was no legacy data to migrate into
it — see [Migration](#migration-safety) below.

## Where each piece lives

| Concern | Home |
|---|---|
| Domain, enums, units, validators | `app/kernel/goals/goal-measurement.ts` |
| The progress evaluator (pure) | `app/kernel/goals/goal-progress-evaluator.ts` |
| Configuration storage | `goal_details` (five additive columns) |
| Readings + stages storage | `goal_measurements`, `goal_milestones` |
| Repository contract | `app/kernel/goals/goal-measurement-repository.ts` |
| D1 adapter | `app/platform/storage/d1/d1-goal-measurement-repository.ts` |
| Shared vocabulary + components | `app/shared/goal-progress` |
| Chart primitives | `app/shared/charts` (`TrendLine`, `ComparisonBars`) |
| Record section | `app/modules/goals/GoalMeasurementPanel.tsx` |
| Write endpoints | `POST /goals/:goalId/mutate` (`set_measurement`), `POST /goals/:goalId/measurements` |

The measurement CONFIGURATION is Goal-owned detail state in exactly the sense
the target date already is, so it joined `goal_details` rather than acquiring a
second per-Goal table every read would have to join alongside the first. The
READINGS are their own records with their own lifecycle, so they are their own
table and their own repository: "correct last Tuesday's weigh-in" and "change
the target to 68 kg" must not be the same operation.

## History is the model

A Goal's current value is **the latest row of `goal_measurements`**, never a
column that gets overwritten. That is what makes a trend possible at all, and
what makes correcting a mistyped reading a normal edit rather than a lost
history.

`measured_on` is an **owner-calendar date** (`YYYY-MM-DD`), never an instant: a
weigh-in belongs to a day the way a Task's due date does, and a timestamp would
land the same reading on a different day for a traveller. `created_at` breaks
ties when two readings share a day, so "the latest measurement" is a total
order.

## The arithmetic, and what it refuses to compute

One formula, for every type and both directions:

```
progress = (current - baseline) / (target - baseline)
```

For 85 → 79 → 70 that is `(79 - 85) / (70 - 85)` = **0.4**. Direction never
appears in the arithmetic — it decides wording, and how "achieved" reads.

The evaluator returns `null` rather than a plausible number whenever the data
cannot support one, and every surface turns that into an honest sentence:

| Situation | What it returns |
|---|---|
| No measurement configuration | `measured: false`, status `not_measured` |
| Nothing recorded | `current: null` — **not** the baseline, so no 0% bar |
| No target | no fraction, no remaining; the value and movement still shown |
| Baseline equals target | no fraction (a journey with no distance) |
| One reading | no trend |
| Two readings less than 7 days apart | no trend, no projection |
| Pace pointing away from the target | no projection |
| Projection beyond 5 years | no projection |
| Target date already passed | no required pace |

Nothing it returns can be `NaN` or `Infinity`. `progressPercent` is clamped to
0–100 for indicators; `progressFraction` keeps the true value, so exceeding a
target reads as "Target achieved" instead of breaking a bar.

### Trend and pace

Deliberately the simplest defensible calculation — the gradient between the
first and last reading of a window — rather than a regression, because two
points and a span is something an owner can check by hand.

- **Window:** 28 days, measured back from the LATEST reading (not from today), so
  a Goal that has not been updated for a fortnight reports the pace it had
  rather than one diluted by silence. `daysSinceLastMeasurement` is reported
  separately, so the silence is never hidden.
- **Minimum span:** 7 days. Below that the evaluator says it does not know —
  this is the guard against two readings a day apart implying a yearly
  projection.
- **Basis:** `recent` when the window supported the pace, `overall` when the
  whole history had to be used. Surfaces word these differently ("Recent pace"
  vs "Average pace") so a figure never claims to be more current than it is.
- **Required pace:** `(target - current) / days remaining × 7`, from today.
- **Projection:** only when the pace moves towards the target and lands inside
  five years.

### Status

Nine states, in a fixed precedence, each either a fact or a defensible
comparison: `achieved` → `not_started` → `overdue` → `stale` → backwards
movement → `in_progress` (no target date) → the schedule comparison
(`ahead` / `on_track` / `needs_attention`).

"On track" compares the fraction achieved against the fraction of the SCHEDULE
elapsed — the straight line from the first reading (or the Goal's creation) to
the target date — with a wide ±10-point margin so ordinary lumpy progress does
not flip the word on every check-in.

The language is calm by rule: **"Needs attention", never "Failing"; "No recent
update", never "Abandoned"** (AGENTS.md §2). Only `needs_attention` and
`overdue` are tinted, and both are facts the owner can act on.

## Performance

The record page is the only surface that reads a Goal's full history. Every
collection reads the bounded summary instead:

- `listMeasurementSummaries(ids, …)` — latest, earliest, the comparison reading
  and a count for a WHOLE page of Goals, in two grouped statements per chunk of
  50 ids (window functions, no N+1);
- `listMilestoneSummaries(ids)` — completed/total weight, one grouped statement;
- `goalDetails.listMany(ids)` — the configurations, one statement per chunk;
- **`listMeasurementSeries(ids, { perGoalLimit })` (UIX-03)** — the recent run of
  readings per Goal. One statement per chunk, with the per-Goal cap applied
  INSIDE a `ROW_NUMBER()` partition rather than by discarding rows after
  transferring them, so a workspace with a year of daily weigh-ins on ten Goals
  moves a few hundred rows and not a few thousand. **No collection calls it any
  more**: it drew the gallery card's sparkline, REDESIGN-04 deleted the card and
  STEER-01 removed the read ([DEBT-207](../product/PRODUCT_DEBT.md)). It remains
  the bounded series read for a caller that genuinely plots one.

`evaluateGoalFromSummary` hands the summary's three readings to the SAME kernel
evaluator the record uses, so a card can never disagree with a record about the
same Goal.

**The series is used ONLY to draw.** Every figure on a card still comes from the
summary-based evaluation; the sparkline is the shape and the numbers beside it
are the evaluation, which is what guarantees the picture cannot imply a
different value from the one printed next to it. That is also why the summary
was not simply replaced by the series: the summary picks three readings chosen
for arithmetic (first, comparison, latest), and drawing those three as a line
would assert a smooth path through a history that may have wandered.

Today's 7-day workload trend is two bounded aggregate statements for the whole
week (a `SUM(CASE …)` column per day), with the owner-calendar day boundaries
computed by the caller and passed as UTC instant ranges — so the SQL carries no
timezone assumption. Migration 0038 adds the `spine_records` completion index
that read relies on.

## Activity

| Event | When |
|---|---|
| `goal.measurement_logged` | a reading was recorded |
| `goal.measurement_corrected` | an existing reading was edited |
| `goal.measurement_removed` | a reading was deleted |
| `goal.target_reached` | a reading reached the target **for the first time** |
| `goal.milestone_completed` / `goal.milestone_reopened` | a stage's completion changed |

What is deliberately **absent**: there is no event for a recalculated
percentage, and none for adding, renaming or reweighting a milestone. A
derivation changing is not a change to the record, and editing the definition of
a measurement is configuration rather than progress — recording either would be
the Activity flooding this feature is explicitly told to avoid.

`goal.target_reached` is a companion event written in the SAME transaction as
the measurement that caused it (`recordAtomicMutation`'s `companions`), guarded
on the primary event having been appended.

## Migration safety

`0038_goal_measurement.sql` is purely additive: five nullable columns on
`goal_details`, two new tables with their indexes, and one index on
`spine_records`. **No backfill, no reinterpretation.**

- Every existing Goal keeps working: `measurement_type IS NULL` means "not
  measured", which is exactly what was true of every Goal before it.
- DalyHub has never stored a manually-entered Goal progress percentage (see
  `0009_create_goal_details.sql` — the columns are `target_date` and
  `definition_of_done` only), so there was no legacy percentage to map. `manual`
  exists as a first-class CHOICE, not as a migration target.
- Nothing is inferred from free text.
- There is deliberately **no CHECK naming the measurement types** — the same
  reasoning `0032` gave for icon keys, and the lesson `0031` had to rebuild a
  table to learn. The controlled enum lives in `goal-measurement.ts`, and an
  unrecognised stored value degrades to "not measured" rather than throwing.
- Export and restore carry the new state: `goalDetails` gained its five fields
  and two collections were added, both listed in
  `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, so an archive written before GOAL-02
  still validates and still restores.

## Accessibility

- Every progress bar carries the SAME sentence it prints
  (`goalProgressSummaryText`) as `aria-valuetext` — "79 kg · 40% complete · 9 kg
  remaining".
- Both charts are `role="img"` with a generated summary naming every value; the
  line chart also renders its sentence visibly, and the comparison chart prints
  every number under its bars instead (a caption would be the same data three
  times).
- Status is always a WORD; only two states are tinted, and never colour alone.
- The check-in's numeric field uses `inputMode="decimal"` (not `type="number"`,
  which discards a partially-typed `-` or `79.`), and the sheet's Save lives in
  the keyboard-safe sticky footer via the shared `Form`'s `id`.
- The progress section carries a real (visually hidden) `<h2>`, so its `<h3>`
  sub-headings do not break the record's heading order, and (UIX-03) the section
  is a named `feature` landmark ("Progress") a screen-reader user can jump to.
- **UIX-03 — the chart's references and its readout.** The target and the
  baseline are distinguished by DASH PATTERN and by a text tag pinned to each
  line, never by hue; both are also named in the caption. The plot is ONE tab
  stop with arrow-key stepping and a `role="status"` readout, rather than a
  focus target per reading — a year of weigh-ins would otherwise put fifty tab
  stops between the chart and the next control, and every value it can reveal is
  already listed in the history below.
- **UIX-03 — the sparkline is `aria-hidden`**, and it is the only chart in
  DalyHub that is. It sits beside its card's reading, target and percentage as
  ordinary text, so a summary would be a fourth reading of announced facts. A
  chart that is the ONLY statement of its data is `TrendLine`, which is
  `role="img"` with a required summary.

## The Goals presentation contract (UIX-03, August 2026 — rewritten by STEER-01)

> **The gallery card is gone, and so is its rule about identity
> (DEBT-211, items 1–2, closed by STEER-01, 2026-08-28).**
> REDESIGN-04 replaced the gallery card (`.dh-gcard`) with the `/goals`
> master–detail workspace — a `ProgressRow` list and a detail pane; the card and
> its sparkline no longer ship, and STEER-01 removed the sparkline's READ as
> well. IDENTITY-01 (migration `0042`) gave a Goal its **own** optional
> `icon_key`/`colour_slot`, so **a Goal's own identity wins and its Area's is
> the fallback** — resolved by one projection, `goalIdentitySource`, in every
> Goal surface. The two subsections below are corrected in place; what remains
> authoritative and unchanged is the measurement model, the shared vocabulary in
> `~/shared/goal-progress`, and the per-surface density rules (Today at a
> glance, the record in full). What the collection ORDERS by, and what a number
> beside a lens means, are STEER-01's and are documented in
> [its own section](#steer-01--what-goals-answers-v25-2026-08-28).

GOAL-02 built the measurement model; UIX-03 is the pass that got it onto the
screen. **No domain rule, measurement type, formula or table changed.** What
changed is what each surface says and how it says it, and this section is the
authority on that.

### Which surface says what

| Surface | Leads with | Visualisation | Density |
|---|---|---|---|
| **Today** | title, reading, target, one state word | the bar | glance — no remainder, no chart |
| **`/goals` row** (`ProgressRow`) | the mark, the name, the Area, and the Goal's own honest value at the line's end (`60.0 / 70 kg`) | a thin bar | scan — one line per Goal, no chart |
| **`/goals` pane** | identity, the derived status, movement and the owner's condition | the full `TrendLine`, target on the scale | the selected Goal in full |
| **Record** (`feature` region) | the **Start · Now · Target · Remaining** strip | the full `TrendLine`, target on the scale | everything — pace, chart, history, stages |

### Identity

A Goal has its **own** optional icon and colour (IDENTITY-01, migration `0042`),
and **inherits its Area's** when it has chosen neither. Colour and glyph walk
that ladder independently, so a Goal that chose a heart but no colour keeps the
heart and takes its Area's hue. The Area's own rank is `ROW_NUMBER()` over Area
creation order — the identical expression `d1-project-repository.ts` uses, so
two repositories cannot disagree about which colour an Area is.

**One projection states what a Goal feeds into that ladder**
(`goalIdentitySource` / `resolveGoalIdentity`, `goal-view.ts`), and every Goal
surface consumes it: the `/goals` row, the pane and the record. Before STEER-01
the row resolved the Goal's own identity while the pane resolved only the
Area's, so one record wore two marks side by side (DEBT-208).

Do not parse Goal titles for colour, and do not add a Goals-only ramp.

### The vocabulary, and where it lives

All of it is in `~/shared/goal-progress/goal-progress-view.ts`, React-free, so
Today and the Goals module cannot describe one Goal differently:

| Function | Says | Refuses |
|---|---|---|
| `goalJourneyLabel` | `from 85 kg → 70 kg`; `of 12 books` | `null` for milestone/manual (their "target" is a scale, not a choice) and when no target is set |
| `goalRemainingLabel` | `9.3 kg to go` | `null` once achieved — "0 kg to go" is true and useless |
| `goalOverTargetLabel` | `113% of target`, from the UNCLAMPED fraction | `null` at or below the target |
| `goalAbsenceNote` | `Not measured` / `No measurement recorded yet` / `No stages yet` | `null` when there IS a reading — three different absences, worded as three |
| `goalMatchesCollectionView` | the All / On track / Needs attention / Completed partition | inventing a status; `completed` is the SPINE's explicit completion, never derived "achieved" |

### The bar shows achievement; the chart shows direction

A decreasing Goal's **progress bar fills left to right** as the owner approaches
the target — it is a measure of how far along the journey they are, not of which
way the number moved. The **chart** draws the raw values, so a weight Goal's line
falls. Both are correct, and they are answering different questions.

### The chart's vertical domain includes the target

`TrendLine` scales to the readings AND the target (`scaleToTarget`, default
`true`). A Goal a third of the way there therefore draws its line across the top
third of the plot, and the empty space below it is the distance still to cover.

This was the single most consequential presentation bug UIX-03 fixed: the old
reading-only domain dropped the target line entirely whenever it fell outside the
readings, which for a weight Goal is *always*, until the very end.

### Legacy and qualitative Goals

A Goal with no measurement is **not 0% done**. Its row says `Not measured`
where the status word goes, draws no bar and prints no value — `goalRowValue`
returns `null` and the row renders no track — and its story is carried by the
signals that CAN speak for it: FOLLOW-02's movement sentence on the row, and
ADR-040's alignment in the row's accessible name and on the pane. A bare `0%`
next to the words "Not measured" would read as a claim about the Goal.

*(This paragraph described the deleted gallery card, including a definition of
done the row has no room for; STEER-01 removed that read as well — see
[DEBT-207](../product/PRODUCT_DEBT.md).)*


---

# FOLLOW-02 — Goal MOVEMENT (2026-08-27)

> *Did this Goal move inside a named period?* — the third derived answer a Goal
> carries, and the first one that works for a Goal with no number.
> Full record: [`V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md`](../product/V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md).
> Governing decision: [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal).

## Three questions, and they are not the same question

A Goal now carries three derived answers. Keeping them apart is the whole design;
none of them is allowed to overwrite another.

| Question | Authority | Window | Answers |
| --- | --- | --- | --- |
| Does it have a reachable structure that has had attention? | `evaluateGoalAlignment` (ADR-040) | unbounded "most recent", judged against 14 days | `completed` / `no_structure` / `unreachable` / `active` / `neglected` |
| Where does the number stand against the target and the date? | `evaluateGoalProgress` (GOAL-02) | the measurement history | the nine `GoalProgressStatus` values, plus the trio, pace and projection |
| **Did an outcome happen inside a named period?** | **`evaluateGoalMovement` (FOLLOW-02)** | **the owner's current calendar week, half-open in instants** | **moved / not moved, with counts** |

All four cross-combinations are legitimate and must stay expressible — aligned
but unmoved, poorly aligned but moved, on track but unmoved, unmeasured and
clearly moving. A surface that implies one of them is impossible is wrong.

## Where each piece lives

| Piece | File |
| --- | --- |
| The rules (pure, clock-free, storage-free) | [`app/kernel/alignment/goal-movement.ts`](../../app/kernel/alignment/goal-movement.ts) |
| The words | [`app/kernel/alignment/goal-movement-words.ts`](../../app/kernel/alignment/goal-movement-words.ts) |
| The one import path for consumers | [`app/shared/alignment/index.ts`](../../app/shared/alignment/index.ts) |
| The one component that draws it | [`app/shared/alignment/GoalMovementLine.tsx`](../../app/shared/alignment/GoalMovementLine.tsx) |
| The bounded read | `ActivityWindowRepository.readGoalMovementFacts` + [`d1-activity-window-repository.ts`](../../app/platform/storage/d1/d1-activity-window-repository.ts) |
| The window and the server read | [`app/platform/activity-window/goal-movement.server.ts`](../../app/platform/activity-window/goal-movement.server.ts) |

**`~/shared/alignment` is where ADR-110 decision 6 and DEBT-78 both said to put
it.** A surface that needs a new movement figure adds it to the evaluator and
tests it there; it does not compute one of its own. This is GOAL-02's existing
rule, restated for the new facts.

## What counts, and what deliberately does not

Accepted (`GOAL_MOVEMENT_KINDS`): `task.completed` on a Task under a contributing
Project, `project.completed` on a contributing Project, `goal.measurement_logged`,
`goal.milestone_completed`, `goal.completed`.

Rejected, each for a stated reason: `entity.updated` (**renaming a Project is
activity, not the Goal moving**), `entity.created` (intent, not outcome), the
whole planning vocabulary (FOLLOW-01's question), the `task.waiting_*` trio,
every `*.reopened` (an outcome UNDONE is not forward movement),
`goal.measurement_corrected` / `_removed`, `goal.target_reached` (the same atomic
write as the reading that caused it — counting both counts one act twice),
`goal.details_updated`, and `entity_link.created` for `project.advances_goal`
(linking changes what contributes, not what happened).

Contribution is the ONE indirect path `SPINE_MODEL.md` allows —
`Task → task.belongs_to_project → Project → project.advances_goal → Goal` — plus
events on the Goal itself, resolved from the **current** links. That last is a
stated approximation, the same one `D1AlignmentRepository` makes, and it is the
reason a link is not itself movement.

## What the surfaces show

**All three render the same component from the same value**, so they cannot
disagree. `data-goal-movement` (the key), `-events` and `-projects` are the
stable machine facts a test reads instead of comparing three sentences.

- **Today** — the Goal panel now includes UNMEASURED Goals, which it never did.
  An unmeasured Goal gets no `GoalProgressReadout`, no bar and no `progressbar`
  role: *"no numeric target" is not "0%"*. Its ranking bucket is movement (see
  `goalSummaryRank`), and an unmeasured Goal with nothing to report sorts below
  every measured one.
- **`/goals`** — a `signal` slot on the shared `ProgressRow`, and the same value
  again on the detail pane. The row's accessible name carries BOTH alignment and
  movement, because they are different questions and may disagree.
  **The collection's ORDER did not change** — see DEBT-120 for the decision.
- **The Goal record** — leads the summary band, and is the one surface with room
  to print the window's actual days.

## The wording rules

- Every statement **names its window** (*"this week"*).
- The **phase** decides the tense, structurally: a `future` window says *"This
  week has not started"* and is never described as stalled; a `running` one says
  *"yet"*; a `closed` one does not.
- **"Stalled" is not in the vocabulary**, and neither are *failing*, *poor*,
  *bad* or *neglected* — the last is ADR-040's own answer and stays there. Seven
  days without an outcome is an absence of evidence inside a window, and that is
  what the words say.
- **No percentage, no score, no streak, no grade** — asserted over rendered
  output.
- **No badge.** Movement is a sentence; a two-colour chip would turn a bounded
  observation into a verdict.

## What it costs

**Two D1 statements** for a page of up to 50 Goals, flat in the number of Goals
*and* in the number of events (the aggregation happens in SQL), never one per
Goal, and `N + 1` / `N + 10` bound parameters against D1's ceiling of 100. All
asserted in [`test/kernel/goal-movement.test.ts`](../../test/kernel/goal-movement.test.ts).

**Nothing is stored** — no table, no column, no index, no migration.

---

# STEER-01 — what `/goals` answers (V2.5, 2026-08-28)

> *"How are my outcomes going — and which need my decision first?"*
> — `GOAL_OUTCOME_QUESTION`, `app/kernel/goals/goal-outcome.ts`.
> Governing decision: [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question)
> decision 5.

## The recorded question, and the order that answers it

`/goals` is the **outcomes workspace**. It was ordered by ADR-040's *alignment*
rank — neglected Goals first — beneath UIX-03's *measurement* lenses, so it
answered *"which Goal have I been neglecting?"* on a screen whose lenses ask
about outcomes ([DEBT-120](../product/PRODUCT_DEBT.md)). The order is now the
answer to the question the screen actually asks.

**The precedence**, lower first, and the argument for it:

| Rank | Status | Why here |
|---:|---|---|
| 0 | `overdue` | The owner's own date has passed. |
| 1 | `needs_attention` | Behind the line the owner set, or moving backwards. |
| 2 | `stale` | A measured Goal whose readings went quiet a month ago — it cannot answer the outcome question until a reading arrives, which is itself a steering fact. |
| 3–5 | `on_track`, `ahead`, `in_progress` | Outcomes under way. |
| 6 | `achieved` | The target is reached; only the owner's explicit completion remains. Good news, and one action. |
| 7 | `not_started` | Configured, nothing recorded. |
| 8 | `not_measured` | Never given a measurement; alignment tells its story. |
| 9 | *(explicitly complete)* | The spine's `completedAt`, whatever the readings say. A closed chapter is read after the open ones. |

Within a rank the tiebreak is `(createdAt, id)` ascending. FOLLOW-02's finding
is the input to the tail of the table: **a Goal with a reading to lead with
outranks one with only absence to report**, which is DEBT-120's exemplar defect
inverted — an unmeasured Goal can no longer sit above a measured Goal that is
behind its own target date.

Two things the rank deliberately does **not** read. **Movement**: FOLLOW-02's
recorded rule stands, movement is an attention signal and never an outcome
metric. **The owner's condition** (STEER-02): a set-aside Goal keeps exactly
the place its outcome earns, because the collection is where the owner
deliberately looks rather than a surface asking for their attention.

## Where it is computed, and how it cannot drift

| Piece | File |
| --- | --- |
| The rank, the question and the lenses | [`app/kernel/goals/goal-outcome.ts`](../../app/kernel/goals/goal-outcome.ts) |
| The scope-bound cursor | [`app/kernel/goals/goal-outcome-cursor.ts`](../../app/kernel/goals/goal-outcome-cursor.ts) |
| The SQL read and the counts | `GoalRepository.listGoalsByOutcome` / `countGoalsByOutcomeLens` ([`d1-goal-repository.ts`](../../app/platform/storage/d1/d1-goal-repository.ts)) |
| The parity, pagination and count proofs | [`test/kernel/goal-outcome.test.ts`](../../test/kernel/goal-outcome.test.ts) |

`GOAL_OUTCOME_DISPLAY_RANK` is the ONE authority. The repository mirrors GOAL-02's
status precedence as a layered SQL derivation over the same stored facts the
summary-based evaluation reads — the configuration on `goal_details`, the
latest and earliest reading per Goal (identical `(measured_on, created_at)`
tiebreaks to `listMeasurementSummaries`), the milestone weights, the target
date, the owner's day and each Goal's schedule origin — and a **parity test**
drives the SQL and the pure comparator over the same seeded fact matrix, the
`GOAL_ALIGNMENT_DISPLAY_RANK` precedent DEBT-120 asks for. Nothing is
persisted: no rank column, no status column (ADR-111 decision 5).

**The schedule origin is why there are two statements rather than one.** "On
track" is measured from the Goal's creation day *in the owner's calendar*, and
SQLite cannot perform IANA time-zone conversion — so one bounded preliminary
statement reads every Goal's `(id, created_at)`, the caller converts, and the
map returns as a single JSON parameter for `json_each`. An approximate UTC date
would break exact parity with the evaluator, which is the one thing this design
may not trade away.

**The cursor is bound to every state that materially affects the result**:
workspace, owner day, time zone and lens. A cursor from yesterday's ranking, a
different zone, another lens or the alignment ordering is rejected
(`InvalidSpineCursorError`) and the route resets calmly to page one.

`listGoalsByAlignment` is **kept**, unchanged, for every consumer that still
asks the alignment question — the guided Review, the insights read, Today's
attention facts and Analytics. Alignment is still *stated* on `/goals`, as the
pane's indicator and in each row's accessible name: a derived signal beside the
others rather than the order.

## The lenses filter the workspace, and their counts are true

The lenses are `All · On track · Needs attention · Set aside · Completed`
(plus the Deleted scope). They now filter in the **collection read**, and every
count beside a lens is a workspace figure from `countGoalsByOutcomeLens` —
[DEBT-121](../product/PRODUCT_DEBT.md)'s closing sentence, satisfied
structurally: *"a count that describes the page must not remain beside a label
that reads as the workspace."* Where the workspace figure is unavailable (the
Deleted scope, a failed read) **no lens shows a number at all**; there is no
page-derived fallback anywhere on the surface.

One SQL predicate per lens is used verbatim by the filtered page read AND the
counts aggregate, so a lens's result set and its number cannot disagree. The
status lenses are deliberately **condition-blind**: a set-aside Goal whose
readings say "needs attention" still appears under Needs attention, because the
lens filters derived truth and the condition never suppresses it.

Both reads cost **two statements**, flat in Goals, measurements, milestones and
events, asserted with a counting database.

## The route reads nothing it does not render

[DEBT-207](../product/PRODUCT_DEBT.md), closed. Three reads REDESIGN-04 left
behind are gone with their plumbing:

- the **sparkline series** (`listMeasurementSeries`, twelve readings per Goal on
  every page and every revalidation) — the gallery card that drew it was
  deleted; the record and the pane plot the full history from their own read;
- the **definition of done** on the collection item — the row has no place for
  prose;
- the workspace pane's five **alignment-evidence** rows — the pane renders the
  alignment *indicator*; the evidence panel lives on the canonical record, which
  makes that read there.

`test/kernel/goals-outcome-route.test.ts` asserts the loader's returned shape
field by field, so a field added without a renderer fails a test rather than an
audit.

**Query budget.** The `/goals` composition makes **eight grouped reads per
page**, and made eight before: the ordered page itself, then six reads over that
page's ids (contributions, alignment facts, measurement summaries, milestone
summaries, details, movement) and one workspace-wide read. What changed is
*which* eight — the sparkline series read was removed (DEBT-207) and the
workspace lens counts added in its place (DEBT-121) — plus the selected Goal's
detail, which is one read lighter now that the pane no longer fetches alignment
evidence it does not draw.

In *statements* the shape is slightly different, and it is worth stating rather
than rounding: the page read costs **two** (a bounded preliminary resolving each
Goal's schedule origin in the owner's calendar, because SQLite cannot convert an
IANA zone, and then the ranked page), the lens counts cost **two**, and movement
costs **two**. `test/kernel/goal-outcome.test.ts` asserts the first two against a
counting database and proves both are flat in the number of Goals: ten Goals cost
what two cost. Every read is grouped over the page's ids or over the whole
workspace; none is per Goal.

## One Goal identity rule

[DEBT-208](../product/PRODUCT_DEBT.md), closed. `goalIdentitySource` /
`resolveGoalIdentity` in [`goal-view.ts`](../../app/modules/goals/goal-view.ts)
state what a Goal feeds into the shared `resolveIdentity` ladder — its own
choice first, its Area's otherwise, colour and glyph walked independently — and
the row, the pane and the record all consume it. The pane used to resolve only
the *Area's* identity, so a Goal that had chosen its own glyph wore two
different marks on one screen. The deliberate fallback is unchanged; it is
simply expressed once instead of three times.

## One measurement composition

[DEBT-192](../product/PRODUCT_DEBT.md), closed. `routes/detail.tsx` mounts
`GoalMeasurementSection` and declares **no** measurement or milestone callback
of its own: the panel, both sheets, their `opener` handling, the four posts and
the revalidation exist once, shared with the workspace pane. GOAL-02's
arithmetic, the chart's behaviour, the target/domain semantics, the progress
wording, and movement and alignment as separate signals are all unchanged — no
new measurement model, and no second authority.

---

# STEER-02 — the owner's hand (V2.5, 2026-08-28)

> Governing decision: [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question)
> decisions 1–3.

## The condition: a small, closed, owner-set vocabulary

A Goal carries **three derived answers** — alignment, measurable progress,
movement — and, since STEER-02, **one stored one**: the owner's condition.

| Value | Stored | Means |
| --- | --- | --- |
| **Pursuing** | `NULL` | The default, and the state every Goal has been in since the model existed. |
| **Set aside** | `'set_aside'` | The owner has deliberately put this Goal down for now. |

**Why the vocabulary is this small.** ADR-111 decision 2 constrains the space:
members answer *"am I currently pursuing this?"* — never *"is it going well?"*,
which is GOAL-02's question, answered with evidence. That leaves exactly two
honest answers, and only one of them needs storing. Deliberately **not**
members: `on_track` / `off_track` / `healthy` / `at_risk` / `stalled` /
`failing` (verdicts a derivation already computes — an owner-set "on track"
beside GOAL-02's computed *On track* would be two authorities for one word);
`paused` / `archived` (lifecycle, which the spine owns); and any free text.
Widening the vocabulary is an ADR-111 amendment, not a field addition.

**Pursuing stores nothing, and that is what makes the column additive.** An
archive written before this field, a row the migration has not touched, and a
Goal the owner has never spoken about all mean the same thing.

## The rule that makes it safe

> **Owner judgement is stored; derived signals are derived; neither ever
> produces the other.**

- **Nothing derives the condition.** Exactly one route intent writes it —
  `POST /goals/:goalId/mutate` with `intent=set_condition` — through
  `GoalDetailsRepository`, the one mutation path for Goal-owned fields. No
  background process, activity derivation, measurement, movement, alignment, AI
  or heuristic sets or clears it.
- **No derivation reads it.** `evaluateGoalProgress`, `evaluateGoalAlignment`
  and `evaluateGoalMovement` keep signatures that cannot see it. This is
  guarded by a **source-level** assertion
  ([`test/unit/goals/goal-condition-boundary.test.ts`](../../test/unit/goals/goal-condition-boundary.test.ts)),
  because a value-level test can only prove the condition does not change an
  answer *today* — and the falsification pass proved exactly that gap: an edit
  that threaded `condition` into `GoalProgressFacts` and returned the unmeasured
  shape for a set-aside Goal passed every value-level test untouched.
- **Scope may change; truth may not.** A set-aside Goal leaves the surfaces that
  ask for the owner's attention and keeps every derived fact it had.

## What "set aside" changes, and what it does not

| Surface | A set-aside Goal |
| --- | --- |
| Today's Goal panel | **Leaves it.** Excluded in SQL, before the scan limit, so a workspace of rested Goals still surfaces the pursued ones. |
| `/plan`'s unsupported-Goal signals | **Leaves them.** *"No planned supporting action this week"* is true and unwelcome about a Goal the owner has deliberately put down. Filtered before the three-signal cap, so it never costs a pursued Goal its place. |
| `/goals` and its pane | **Stays**, in the place its outcome earns, with alignment, movement and measurement reading exactly as they would otherwise, plus the condition stated beside them. |
| The Goal record | **Unchanged**, plus the condition control. |
| The status lenses | **Still holds them**: a set-aside Goal that is behind its own date is still under "Needs attention", and still counted there. |

The attention exclusion is opt-in at the repository
(`listGoalsByAlignment({ omitSetAside: true })`), so the guided Review, the
insights read and Analytics see the set they always saw — their question is a
different one and their selection must not silently change.

## The control, the event and the storage

- **One shared control** — `GoalConditionField`, mounted by the Goal record and
  the `/goals` workspace pane, an ordinary `InlineSelectField` (DEBT-183's own
  desired state). "Pursuing" is the field's unset state and its way back, so the
  offered vocabulary and the stored one are identical.
- **Its own Activity verb** — `goal.condition_changed`, whose payload carries
  `{ condition, previous }`: both members of the closed vocabulary or `null`,
  never free text, so history can be read in both directions (ADR-110's
  FOLLOW-01 lesson — a payload recording only the new value is a payload
  history cannot reverse). Untoned deliberately: setting a Goal aside is a
  decision, not a success or a failure.
- **Migration `0048_goal_condition.sql`** — one additive nullable `TEXT` column
  on `goal_details`, no default, no CHECK naming the members (the 0038/0032
  rule: a CHECK over a domain that may grow turns "widen the vocabulary" into
  "rebuild a production table"). An unrecognised stored value degrades to
  "pursuing" on read rather than throwing.
- **Export and restore carry it**, verbatim, like GOAL-02's five columns and
  IDENTITY-01's identity. An archive written before this field validates,
  restores, and lands those Goals as pursuing — asserted end to end, including
  a real ZIP with the key removed and its checksums recomputed.

## Moving a Goal between Areas

[DEBT-184](../product/PRODUCT_DEBT.md), closed. A Goal filed under the wrong
Area used to stay there: the only remedy was to recreate it and re-link its
Projects, which destroyed its Activity and its measurement history.

- **The spine owns parentage.** `POST /goals/:goalId/mutate` with `intent=move`
  delegates to `SpineRepository.move` — the same authority, the same guards and
  the same two link events a Project's move has (`entity_link.unlinked` then
  `entity_link.created` or `entity_link.restored`). There is no `goal.moved`
  verb and no second audit mechanism.
- **The Goal is the same record.** Its id, its creation instant, its Activity,
  its measurements, its milestones, its links and its contributing Projects all
  survive, because one structural link is mutated rather than a record being
  recreated. The Projects travel by construction: they parent to the *Goal*, not
  to the Area — and their Tasks with them.
- **Both Areas' rollups agree afterwards**, including the subtree: the old Area
  loses the Goal, its Projects and their Tasks; the new one gains them.
- **The identity follows the file.** A Goal with no colour of its own inherits
  the new Area's — a real consequence of the move rather than a defect.
- **The candidates are server-resolved.** `GET /goals/area-options?q=` returns
  active, non-archived Areas through the shared bounded target search — the
  `/projects/parent-options` pattern, not a second parent-picker model — and the
  move itself re-verifies the destination. A missing, deleted, wrong-kind,
  archived or cross-workspace target fails closed with one calm outcome.
- **The control** is the shared `InlinePickerField` on the Goal record's context
  line, the pattern `ProjectsTable`'s Area cell established. Nothing is fetched
  until the picker opens. This is not a drag-and-drop hierarchy editor and does
  not introduce one.

## Testing (STEER-01 / STEER-02)

- **Kernel / D1** — [`goal-outcome.test.ts`](../../test/kernel/goal-outcome.test.ts)
  (SQL↔kernel parity across the whole status matrix, order before pagination
  over four pages, cursor scope, workspace-true lens counts walked page by page,
  flatness); [`goal-condition-and-move.test.ts`](../../test/kernel/goal-condition-and-move.test.ts)
  (the vocabulary, the Activity payload both ways, unknown-value degradation,
  the move's identity/history/rollup preservation, fail-closed targets,
  workspace isolation); [`goals-outcome-route.test.ts`](../../test/kernel/goals-outcome-route.test.ts)
  (the loader's shape, the counts, one identity rule);
  [`plan-goal-signals.test.ts`](../../test/kernel/plan-goal-signals.test.ts)
  (the `/plan` signal, which had no coverage at all, and its set-aside
  exclusion); `goal-movement.test.ts` (a set-aside Goal leaves Today's panel
  with its movement value byte-identical).
- **Unit** — [`goal-condition-boundary.test.ts`](../../test/unit/goals/goal-condition-boundary.test.ts)
  (the source-level derivation boundary); `GoalsCollection.test.tsx` (the lens
  rail's counts, and that the client renders the server's page verbatim);
  `GoalOverview.test.tsx` (the condition's option set, its saves, and the
  derived sentences unchanged under each value).
- **E2E** — [`steer-goals.spec.ts`](../../e2e/steer-goals.spec.ts): two tests
  over four page loads, with the widths as resizes in place and one axe scan per
  appearance.

**Falsified, then restored.** A page-local lens count, a sort after pagination,
the condition fed into a derived evaluator, a move implemented as
recreate-and-delete, and the condition dropped from the export read. Two of the
five survived their first falsification and are the reason two guards are
stronger than they were: the derivation boundary became a source-level
assertion, and the shared workspace fixture now seeds a `goal_details` row —
without one, the restore suite's equality assertion over that collection was
vacuous.
