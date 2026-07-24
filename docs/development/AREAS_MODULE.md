# AREAS_MODULE.md — The Areas module (AREA-01)

The first real **Areas** module: browse the owner's permanent life domains, create
an Area, open the canonical Area record, understand its live hierarchy and
momentum, rename it, and review direct Area Activity. It is composed from the
shared design system and the FND-07 spine — no second Area model, no migration.

Accepted via
[ADR-038](../decisions/ARCHITECTURE_DECISIONS.md#adr-038-area-overview--read-only-spine-projection-and-derived-momentum).

## Data ownership

Areas are first-class spine records. AREA-01 adds **no persisted state**:

| Concern | Authority |
| --- | --- |
| Area identity, title and lifecycle | `SpineRepository` |
| Area parentage | none; Areas have no structural parent |
| Displayed Area roll-ups | live derived spine counts |
| Collection and record presentation | `AreaRepository` read-only projection |
| Project workflow and project health facts | existing Project projections / Project health model |
| Event history | the shared Activity stream |

`AreaRepository` (`app/kernel/areas` plus the D1 adapter) is storage-independent at
the contract boundary and read-only. It performs bounded, deterministic,
workspace-scoped, parameterised reads through `WorkspaceScope.areas`; React routes do
not query D1 directly. It resolves an Area's Goals, direct Area Projects,
Goal-backed Projects, and descendant roll-up facts without copying titles,
hierarchy or roll-up counts into another table.

Area creation and rename are mutations and therefore go only through
`WorkspaceScope.spine`: `createArea({ title })` and `rename(areaId, title)`. Area
creation requires a title and no parent. AREA-01 does not implement Area completion,
deletion, archival, restoration or Goal creation.

## Routes

Registry-discovered (`app/modules/areas/routes.manifest.ts`), composed by the shell:

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /areas` | page | Areas collection, plus keyset "Load more" pages. |
| `POST /areas/new` | resource | Create an Area via `spine.createArea`; returns a typed JSON outcome. |
| `GET /areas/:areaId` | page | Canonical Area record: Summary, Goals, Projects, Activity. |
| `POST /areas/:areaId/mutate` | resource | Rename the verified active Area via `spine.rename`. |
| `GET /areas/:areaId/activity` | resource | One bounded DS-05 Timeline page over `activity.listForEntity(areaId)`. |

The static `/areas/new` segment is registered before `/areas/:areaId`. Missing,
deleted, wrong-kind and cross-workspace Area ids fail closed with the same calm
not-found outcome. Resource routes resolve the trusted workspace and actor on the
server; no client-supplied workspace or actor is accepted.

## Composition

- **Collection** (`AreasCollection.tsx`) uses PX-02 `CollectionLayout`, DS-04
  `Card`, shared `EmptyState`, shared `LoadMore`, and a DS-03 Drawer trigger for
  New Area (`?drawer=new-area`). Cards are real links to `/areas/:areaId` and the
  subtitle reports loaded rows honestly when more pages exist.
- **New Area** (`NewAreaForm.tsx`) uses DS-06 forms and validation. Failed server
  outcomes preserve the draft; duplicate submit is prevented by the shared form
  state; success navigates to the canonical record.
- **Record** (`AreaOverview.tsx`) uses DS-02 `RecordLayout`: Summary, Goals,
  Projects and Activity. It does not include placeholder tabs or Settings.
- **Rename** (`RenameAreaForm.tsx`) is the single Area rename path, exposed from
  the record header in a Drawer and posted to `/areas/:areaId/mutate`.
- **Activity** (`AreaActivityTab.tsx`) reuses the DS-05 `Timeline`, the shared
  descriptor fallback, cursor pagination, retry/empty states and batched entity
  resolution. It shows Area-subject events only; descendant task/project event
  aggregation is deliberately not part of AREA-01.

## Momentum semantics

Area momentum is derived, not stored. The pure evaluator (`app/kernel/areas/area-momentum.ts`)
accepts authoritative facts and an injected clock, returns accessible labels, a
summary and transparent reasons, and has no React or persistence imports.

**Corrected post-merge (see [ADR-038's dated amendment](../decisions/ARCHITECTURE_DECISIONS.md#adr-038-area-overview--read-only-spine-projection-and-derived-momentum)).**
The original AREA-01 merge derived momentum from the same bounded first Project
page the record displays (`AREA_CHILD_PAGE_SIZE = 50`) and from TOTAL rather than
UNFINISHED counts. Both are corrected:

- **The momentum boundary is COMPLETE, independent of the displayed card page.**
  `AreaRepository.getAreaMomentumFacts(areaId)` reads every Project aligned to the
  Area (direct or Goal-backed) with NO `LIMIT` — a fixed, small number (two) of
  workspace-scoped, parameterised aggregate queries, never one query per Project
  and never an arbitrary cap that would silently drop a Project from the aggregate.
  The Area route loader then fetches Project health facts only for the VISIBLE
  ACTIVE subset (`isProjectHealthVisible`) through the existing batched, N+1-free
  `ProjectHealthRepository.listProjectHealthFacts`, chunked at its own 100-id
  bounded-page ceiling so an Area with more than 100 active Projects still reads
  every one of them (never one health query per Project). Batches are read
  SEQUENTIALLY, not concurrently, so total in-flight D1 work stays bounded to one
  batch's own internal fan-out regardless of how many active Projects an Area has —
  an Area with hundreds of active Projects issues more round trips, never unbounded
  simultaneous D1 work. A visible active Project already present on the displayed
  card page reuses the facts fetched for that page instead of being queried twice.
  The displayed card page (`listAreaProjects`, still bounded at 50 for the UI) and
  the momentum boundary are two independent reads; changing one never changes the
  other.
- **Unfinished, not total, drives every "is there active work" decision.** Goal and
  direct-Task counts are OPEN/unfinished versus completed, not raw totals — an
  Area containing only completed Goals, only completed direct Tasks, or a completed
  Project whose Tasks are also complete is `empty`, never `steady`.
- **Direct Area Tasks are read from a dedicated query, never inferred from the
  combined Area task roll-up** (`rollup.tasks`, which also includes Tasks under
  aligned Projects). `AreaRepository.getAreaMomentumFacts` returns
  `directTasks: { unfinishedTotal, completedTotal }` from a `task.belongs_to_area`-only
  read, so a Project Task can never be mislabelled as sitting directly in the Area.
- **Only genuinely `active`-workflow Projects count as active momentum.** Planned
  and On-hold Projects are classified separately (`planned_projects`/`on_hold_projects`
  reason codes) and are never described as active momentum.
- **Archived takes precedence over Completed when classifying a Project.** A
  Project that is both completed and later archived is bucketed `archived` (never
  `completed`), matching the same precedence the Area Project card presentation
  (`projectStateLabel` in `area-view.ts`) already gives Archived over Completed.

Revised precedence:

1. Any visible at-risk active Project -> `needs_attention` ("Needs attention").
2. Otherwise, any visible blocked active Project -> `needs_attention` ("Blocked work").
3. Otherwise, any visible stale active Project -> `watch` ("Worth a look").
4. Otherwise, On-hold Projects with NO `active`-workflow Project, NO unfinished
   direct Area Task and NO open Goal -> `watch` ("Mostly paused"). This guard is
   deliberately the full "no genuinely active work" condition — an On-hold Project
   must never suppress a genuinely unfinished direct Task or open Goal.
5. Otherwise, one or more `active`-workflow Projects -> `steady` ("Momentum visible"),
   describing only the true active Project count.
6. Otherwise, one or more unfinished direct Area Tasks -> `steady` ("Momentum visible"),
   explicitly described as direct Area Tasks.
7. Otherwise, one or more open Goals -> `watch` ("Direction set") — honest, calm
   wording that never calls a Goal an active Project or a direct Task.
8. Otherwise, one or more Planned Projects -> `watch` ("Work planned") — never
   described as active momentum.
9. Otherwise -> `empty` ("No active work").

Completed and archived Projects are always explanatory context
(`completed_projects_ignored`/`archived_projects_ignored`) appended after the
primary reason — they never create an active warning at any precedence step. No
reason ever reports a zero count; a fact with zero positive instances simply does
not produce a reason. The evaluator does not average project percentages into an
Area score and does not label an empty Area as healthy. Sensitive task free text,
waiting notes and raw payloads are never exposed in aggregate reasons.

## Tab totals

The Goals and Projects Record-Layout tab badges use the exact authoritative
`rollup.goals.total` / `rollup.projects.total` — never `goals.length` /
`projects.length` (the bounded first-page array). The bounded-page note under each
tab's card list still says only the first page is displayed; it never fabricates a
loaded-versus-total distinction.

## Goals and Projects

AREA-01 showed active Goals belonging to the Area as informative, non-linked
cards. **AREA-02 upgrades this**: each Goal card is a real link to the canonical
`/goals/:goalId` record ([`GOALS_MODULE.md`](./GOALS_MODULE.md)), shows its
target date when set (batched via a `LEFT JOIN` against `goal_details` in the
SAME existing `listAreaGoals` query — genuinely zero additional queries, never a
per-Goal fetch), and the Goals tab gains a "New Goal" action opening the shared
`app/shared/goal-creation/NewGoalForm` in a Drawer. The exact roll-up totals
(`rollup.goals.total`) and bounded-card-page honesty AREA-01 established are
unchanged; Area momentum never depends on target dates or definition-of-done
text.

Projects are grouped by structural context:

- **Direct Area Projects** — `project.belongs_to_area`.
- **Goal-backed Projects** — `project.advances_goal`, with the Goal title shown as
  context.

Project cards link to the existing canonical `/projects/:projectId` records and
reuse the existing workflow vocabulary plus the shared Project health visibility
rule. There is no Area-owned Project card model, Project mutation route or health
evaluator.

## Project creation dependency

Projects still require an Area or Goal parent. Once AREA-01 exists, the New
Project confirmed-empty state links to `/areas?drawer=new-area` so an empty
workspace has a real route to create the first Area. It does not auto-create an
Area, seed fixture data, or make Project parentage optional. A Goal created
through AREA-02 is a valid Project parent through the existing
`/projects/new`/`/projects/parent-options` server-backed search — no
Areas-owned or Goals-owned second parent-selection model.

## Accessibility and responsive behaviour

The module inherits DS-11. The collection, record, drawers, forms, tabs, Timeline
and project links are keyboard-operable, labelled, focus-restoring, axe-scanned and
overflow-checked. Long Area, Goal and Project titles wrap inside cards, metrics,
tabs and form sheets. AREA-04 still owns mobile-complete Areas/Goals refinements;
AREA-01 ships the shared responsive baseline only and adds no swipe/mobile-only
workflow.

## Testing

- **Unit / pure** (`test/unit/areas`): view-model mapping, roll-up presentation,
  grouping, deterministic ordering, long content, form states, component states
  (including that the Goals/Projects tab badges use the exact roll-up totals, not
  the first-page array length; AREA-02: Goal cards link to `/goals/:goalId` and
  open it; a Goal's target date shows only when set, never overcrowding the
  card; the "New Goal" action is exposed on the Goals tab), the React-free
  momentum import guard, and the full
  momentum precedence/edge-case matrix (empty; completed-only Goals/direct
  Tasks/Project Tasks; a lone open Goal; a lone unfinished direct Task; Planned-only;
  On-hold-only; active/at-risk/blocked/stale; precedence when they coexist;
  completed/archived Projects ignored even with warning facts; mixed active +
  Planned + On-hold; no zero-count reason; deterministic injected clock; an
  On-hold Project never suppressing a genuinely unfinished direct Task or open
  Goal; On-hold-only wording winning over Planned-only when both coexist with no
  active work; and a Project that is both completed and archived classifying as
  archived, matching card presentation.
- **Workers/D1 integration** (`test/kernel/areas*.test.ts`): list/create/get/rename,
  roll-up accuracy across Goals, direct Projects, Goal-backed Projects, direct
  Tasks and Project Tasks, soft-delete/move effects, workspace isolation,
  wrong-kind/missing ids, cursor behaviour, Activity, and route outcomes. Also
  covers the corrected momentum boundary specifically: `getAreaMomentumFacts`
  returns every aligned Project (55+) while `listAreaProjects` stays bounded at 50;
  a deterministically-seeded at-risk Project placed past the first displayed page
  still drives `needs_attention` at the route layer; a second deterministic route
  test seeds 151 ACTIVE Projects — enough that, after the loader reuses health
  facts already fetched for the 50 displayed Projects, the remaining 101 ids
  themselves span two of the route's own sequential `HEALTH_FACTS_BATCH_SIZE =
  100` batches (100 then 1) — with the at-risk Project placed in that SECOND
  additional batch, proving the loader's own sequential batching loop (not just
  its first iteration) reaches it; direct-versus-Project Task counts; completed/
  archived Projects excluded from active warnings; moved/soft-deleted/cross-
  workspace descendants; wrong-kind/missing/cross-workspace Area ids fail closed
  (empty facts, no throw); and a `countingDb`-instrumented test proving
  `getAreaMomentumFacts` issues a fixed, small number of queries regardless of
  aligned-Project count (no N+1).
- **E2E** (`e2e/areas.spec.ts`): real navigation from app chrome, seeded hierarchy,
  New Area validation/create, landing on the canonical record, rename, Goals and
  Projects tabs, project navigation with Back/Forward, empty Area states, Activity,
  focus restoration, axe and no-horizontal-overflow checks.
- Existing accessibility/responsive sweeps include `/areas`, `/areas/:areaId`,
  Activity and overlay states rather than creating a second scan framework.

## Migration, deployment and deferrals

AREA-01 itself required no migration. AREA-02 adds
`migrations/0009_create_goal_details.sql` (see [`GOALS_MODULE.md`](./GOALS_MODULE.md))
— additive and forward-only; the Areas module's `listAreaGoals` query composes
with it (a `LEFT JOIN`) but requires no backfill or deploy-time data change.
Production must still have the spine, project-detail and goal-detail migrations
applied before this Worker code runs, because Areas reads compose with Projects,
Project health and Goal details.

Deliberate deferrals: mobile-specific Areas/Goals workflows (AREA-04), Area
deletion/restore, Area settings, and descendant-aggregated Activity. Full Goal
records and Goal-specific fields are delivered by AREA-02 — see
[`GOALS_MODULE.md`](./GOALS_MODULE.md). Alignment/intention reporting is now
delivered by AREA-03 as the real `/goals` collection, not an Area-record
surface — see [`GOALS_MODULE.md` § Alignment](./GOALS_MODULE.md#alignment-area-03).
The Area record's own Goals tab is unchanged by AREA-03: it stays the calm,
structural "Goals in this Area" list (no alignment pill), since Alignment is
inherently cross-Area and belongs on the workspace-wide collection instead.

## Related documents

- [`ROADMAP_V2.md` AREA-01](../roadmap/ROADMAP_V2.md#-area-01--area-overview)
- [`GOALS_MODULE.md`](./GOALS_MODULE.md) — the AREA-02 canonical Goal record and
  the AREA-03 Alignment view.
- [`SPINE_MODEL.md`](./SPINE_MODEL.md)
- [`PROJECTS_MODULE.md`](./PROJECTS_MODULE.md)
- [`ACTIVITY_TIMELINE.md`](./ACTIVITY_TIMELINE.md)
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md)
- [`ARCHITECTURE_DECISIONS.md` ADR-038](../decisions/ARCHITECTURE_DECISIONS.md#adr-038-area-overview--read-only-spine-projection-and-derived-momentum)
- [`ARCHITECTURE_DECISIONS.md` ADR-039](../decisions/ARCHITECTURE_DECISIONS.md#adr-039-goal-records-an-additive-goal_details-slice-an-owner-calendar-target-date-and-an-exact-derived-project-contribution-boundary)
