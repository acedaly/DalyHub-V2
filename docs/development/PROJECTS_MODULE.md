# PROJECTS_MODULE.md — The Projects module (PROJ-01)

The first real **Projects** module: browse real projects, open a project and
understand what it is, which Area it belongs to, which Goal it advances (when
applicable), its tasks, how many are complete, its roll-up progress, its important
linked records, and whether it is open or completed. Composed **entirely** from the
shared design system and the FND-07 spine — no second project model, no migration.

Accepted via
[ADR-034](../decisions/ARCHITECTURE_DECISIONS.md#adr-034-the-projects-module--a-read-only-projection-over-the-spine-no-second-project-model)
(the module + read projection) and
[ADR-033](../decisions/ARCHITECTURE_DECISIONS.md#adr-033-re-homing-the-task-record-surface-to-a-shared-module-boundary)
(the shared task record surface).

## Data ownership

Projects are **first-class spine records** (FND-07 / ADR-014). PROJ-01 adds **no
persisted state and no migration**:

| Concern | Authority |
| --- | --- |
| Project identity, title, completion, parentage | `SpineRepository` (the only mutation path) |
| Displayed roll-up progress | `SpineRepository.getRollup(projectId)` — derived, never cached |
| Collection cards' Area/Goal + task counts | `ProjectRepository` — a **read-only** projection (`WorkspaceScope.projects`) |
| A project's child tasks | `TaskRepository.listProjectTasks` — bounded, workspace-scoped |
| Non-structural relationships | the generic FND-04 EntityLink (`project.relates_to`), via the shared policy service |
| Event history | the shared Activity stream, from the existing spine mutations |

The `ProjectRepository` ([`app/kernel/projects`](../../app/kernel/projects) + the D1
adapter [`d1-project-repository.ts`](../../app/platform/storage/d1/d1-project-repository.ts))
resolves each project's Area (directly or **through its Goal**) and its active
direct-task counts in **one bounded, N+1-free query**; its count definition matches
the spine project rollup (active direct child tasks), computed live. It performs **no
mutations**. `TaskRepository.listProjectTasks(projectId, {state,limit,cursor})` extends
the authoritative Task contract (ADR-028) with the bounded, keyset-paginated child-task
query.

**Pagination — every record reachable (ADR-034 §34.1a/§34.3/§34.6).** Both
`listProjects` and `listProjectTasks` are **keyset-paginated** with opaque, versioned
cursors mirroring the spine/EntityLink pattern
([`project-cursor.ts`](../../app/kernel/projects/project-cursor.ts) bound to
workspace + state + ordering;
[`task-project-cursor.ts`](../../app/kernel/tasks/task-project-cursor.ts) bound to
workspace + project id + state). Each fetches `limit + 1` to detect a further page and
returns `nextCursor` (null when exhausted); ordering is a stable keyset with `id` as the
deterministic tiebreaker (`(created_at, id)`, or `(updated_at, id)` for the collection's
`recent` order). A cursor issued for a different scope is rejected
(`InvalidSpineCursorError`), never reinterpreted. No unbounded "load everything" query is
ever issued, and the record's roll-up total stays `SpineRepository.getRollup` —
authoritative even while only some task pages are loaded.

**Never copied:** Area/Goal titles are resolved live through the hierarchy; a Goal
parent derives its Area (never stored twice); progress is derived; link records live
in `entity_links`, not a project table.

## Routes

Registry-discovered ([`routes.manifest.ts`](../../app/modules/projects/routes.manifest.ts)),
composed by the shell — never in a central switch.

| Route | Kind | Responsibility |
| --- | --- | --- |
| `GET /projects` | page | The collection: `projects.listProjects({state,cursor})` + first-page Area/Goal seed options for the create form. Also serves keyset pages for the collection's "Load more" (via `useFetcher().load`). |
| `POST /projects/new` | resource | Create a project via `spine.createProject` (parent kind resolved server-side). |
| `GET /projects/:projectId` | page | The overview: `getProjectOverview` + `spine.getRollup` + `listProjectTasks` + `project.relates_to` links. |
| `POST /projects/:projectId/mutate` | resource | `rename` / `complete` / `reopen` / `create_task` / `link` / `unlink` (verified project id). |
| `GET /projects/:projectId/link-targets` | resource | The Key links picker's target search (verified project anchor). |
| `GET /projects/:projectId/tasks` | resource | One keyset page of the project's tasks (`state`, `cursor`) for the Tasks tab's "Load more" — fetched WITHOUT navigating, so `?drawer=` state is untouched. Returns `400` for a tampered/cross-scope cursor. |
| `GET /projects/:projectId/activity` | resource | **(PROJ-04)** One bounded page of the project's DS-05 Timeline, mapped server-side from `activity.listForEntity(projectId)`. Verified active-project anchor (missing/deleted/wrong-kind/cross-workspace → calm `404`); tampered/cross-scope cursor → calm `400`; cursor internals opaque; batched entity resolution (no N+1). |
| `GET /projects/parent-options` | resource | Server-backed, workspace-scoped, bounded search of active Areas/Goals (`q`) for the New-Project parent picker (kinds resolved server-side). |

`/projects/new` is a static segment, so it ranks above the dynamic
`/projects/:projectId` and never shadows a real (UUID) project id. Resource routes
return **real JSON Responses**, so the DS-06 forms post with a plain `fetch` and a
page-loader **revalidation** reconciles the roll-up + task list after a mutation (the
same pattern the shared task record surface uses).

## Composition

- **Collection** — [`ProjectsCollection.tsx`](../../app/modules/projects/ProjectsCollection.tsx):
  PX-02 `CollectionLayout`, the one DS-04 `Card`, a restrained URL-reflected state
  segment ([`SegmentedFilter`](../../app/modules/projects/SegmentedFilter.tsx):
  Open/Completed/All), the shared `EmptyState` (empty vs filtered-empty vs error), and
  the shared [`LoadMore`](../../app/shared/load-more) affordance. A card opens the
  overview through **normal client navigation** (a real `<a href="/projects/:id">` + SPA
  open) — never a `div onClick`. "Load more" accumulates keyset pages with
  `useFetcher().load('/projects?state=…&cursor=…')` (no navigation): pages are appended,
  de-duplicated by id, and the accumulation resets only when the state filter (or
  first-page cursor) changes — so opening the new-project Drawer keeps the loaded pages.
  The subtitle reads "N projects loaded" while more remain (never a false total).
- **Overview** — [`ProjectOverview.tsx`](../../app/modules/projects/ProjectOverview.tsx):
  the DS-02 Record Layout (header: identity, open/completed pill, Area/Goal context,
  Complete/Reopen + Rename; summary: parent Area, optional Goal, state, task totals,
  completed count, roll-up progress, created/updated; tabs: **Tasks**, **Key links**,
  **Activity** — Activity LAST per the shared tab vocabulary).
- **Tasks tab** — [`ProjectTasksTab.tsx`](../../app/modules/projects/ProjectTasksTab.tsx):
  the project's real child tasks as DS-04 Cards with the shared task semantics
  (completion = the spine's `completedAt`; waiting = the TODAY-03 state; scheduled ≠
  due), an Open/Completed/All filter, "Add task" and the shared `LoadMore` affordance. A
  task opens the **shared `TaskRecordDrawer`** (ADR-033) over the project
  (`?drawer=task:<id>`). "Load more" fetches the dedicated `/projects/:id/tasks` endpoint
  with `useFetcher().load` so the `?drawer=` param, scroll and focus are **never**
  disturbed by loading more rows; pages are appended and de-duplicated. The
  accumulation is **reconciled** — dropped back to the fresh first page — when the task
  set may have changed underneath it: a `?tasks=` filter change, OR a **mutation
  revalidation** (a task completed / edited / created via the Drawer or the create form,
  whose action revalidates this record loader with the URL unchanged). It is NOT reset
  when only the `?drawer=` param changes (opening/closing the Drawer), so a completed or
  edited task never lingers as a stale row while pagination and drawer state stay fully
  independent.
- **Key links tab** — [`ProjectLinksTab.tsx`](../../app/modules/projects/ProjectLinksTab.tsx):
  the structural Area/Goal relationships + the DS-06 `EntityLinkPicker` over
  `project.relates_to`.
- **Create / rename** — DS-06 forms
  ([`NewProjectForm`](../../app/modules/projects/NewProjectForm.tsx),
  [`NewTaskForm`](../../app/modules/projects/NewTaskForm.tsx),
  [`RenameProjectForm`](../../app/modules/projects/RenameProjectForm.tsx)) hosted in
  the DS-03 Drawer, with duplicate-submit prevention and server-authoritative errors.
  `NewProjectForm`'s "Area or Goal" field is **server-backed and searchable** —
  `SelectField.onSearch` queries `/projects/parent-options?q=` (reusing the shared
  `searchLinkTargets`), so every eligible Area/Goal is selectable however many there are;
  the create action re-verifies the chosen parent's kind + ownership server-side.

The pure view-model
([`project-view.ts`](../../app/modules/projects/project-view.ts)) owns serialisation
and the display derivations (state pill, progress — **an empty project is 0% / "No
tasks yet", never 100%** — Area/Goal labels), kept out of React so it is unit-tested
directly.

## Task record reuse (ADR-033)

A task opened from a Project uses the **same** record, forms, actions, completion path
and Drawer as Today. The reusable surface lives in
[`app/shared/task-record`](../../app/shared/task-record) (`TaskRecordDrawer`, tabs,
sections, `task-view`, `plan-targets`, `contract`); the task resource routes live in
the **Tasks** module at `/tasks/:taskId*`; owner-calendar helpers live in
[`~/shared/datetime`](../../app/shared/datetime). Today keeps a thin wrapper that adds
only its TODAY-05 keyboard commands. There is **no** Projects-only task Drawer, second
task edit form, second task action route or second completion path.

## Health (PROJ-02, ADR-035)

Project **health** is a **derived, non-persisted** signal — no migration, no cached
column — accepted via
[ADR-035](../decisions/ARCHITECTURE_DECISIONS.md#adr-035-project-health--a-derived-non-persisted-signal-over-the-spine-tasks-and-activity).
A pure, React-free evaluator maps live facts to a calm state and transparent reasons,
recomputed every read so it can never drift from tasks, Activity or the rollup.

- **Model** ([`app/kernel/project-health`](../../app/kernel/project-health)):
  `evaluateProjectHealth(facts, clock)` → `{ state, label, tone, reasons[], summary,
  evaluatedAtIso }`. States: `on_track` · `stale` · `blocked` · `at_risk` ·
  `completed` (health-only vocabulary — never colliding with open/completed or task
  status). **Precedence** completed → at_risk → blocked → stale → on_track, with every
  applicable reason preserved (primary first).
- **Signals.** Progress uses the authoritative rollup (empty = "No tasks yet", never
  100%). **Staleness** uses the latest MEANINGFUL activity across the project AND its
  child tasks (`MEANINGFUL_HEALTH_ACTIVITY_TYPES`; `project.updated_at` alone is not
  meaningful; structural/link plumbing and deletes are excluded) against
  `STALE_AFTER_DAYS = 14`. **Blockers** distinguish "some waiting with other
  actionable work" from "all remaining open work waiting" (`blocked`), with
  `LONG_WAIT_AFTER_DAYS = 14`. **Due (deadline)** and **scheduled (commitment)** dates
  are kept distinct via the owner-calendar/date-only utilities; overdue/slipped drive
  `at_risk`, upcoming (`UPCOMING_WITHIN_DAYS = 7`) is calm context. Completed tasks
  never trigger open-work warnings; a completed project shows no active warning.
- **Data** ([`app/kernel/project-health/project-health-repository.ts`](../../app/kernel/project-health/project-health-repository.ts),
  [D1 adapter](../../app/platform/storage/d1/d1-project-health-repository.ts)):
  `ProjectHealthRepository` on `WorkspaceScope.projectHealth` gathers
  `ProjectHealthFacts` for a whole bounded page in a fixed number of grouped,
  workspace-scoped, parameterised queries (base + child-task aggregate + latest
  meaningful activity), chunked at 40 to respect D1's variable limit — **no N+1**.
  Soft-deleted tasks / unlinked links never contribute; wrong-kind/missing/cross-workspace
  ids are calm. The evaluator runs server-side in the loader with the owner-calendar
  clock; health crosses to the browser as JSON. **Sensitive free-text waiting subjects
  are never exposed** in facts, payloads or telemetry.
- **UI** ([`app/shared/project-health`](../../app/shared/project-health)): a restrained
  `HealthIndicator` pill + primary reason in the Card `metadata` slot on `/projects`
  (distinct from the open/completed `status` pill), and a `ProjectHealthPanel`
  explaining all reasons + supporting facts in the DS-02 record Summary. Health
  refreshes through the existing mutation revalidation — no cached column to invalidate.

## Activity (PROJ-04, ADR-036)

The project record's **Activity tab** is the ONE shared DS-05 `Timeline` over the ONE
FND-05 Activity stream — no second event store, no `project_activity` table, no
Projects-only timeline, no migration — accepted via
[ADR-036](../decisions/ARCHITECTURE_DECISIONS.md#adr-036-the-project-activity-tab--the-shared-timeline-over-the-project-subject-events).
It mirrors the task record's `/tasks/:taskId/activity` precedent
([ADR-028](../decisions/ARCHITECTURE_DECISIONS.md#adr-028-task-drawer-persistence-and-composition--the-additive-task-detail-slice)/[ADR-033](../decisions/ARCHITECTURE_DECISIONS.md#adr-033-re-homing-the-task-record-surface-to-a-shared-module-boundary)).

- **Route** ([`routes/activity.tsx`](../../app/modules/projects/routes/activity.tsx)):
  `GET /projects/:projectId/activity` — a loader-only resource route. It authenticates,
  resolves the workspace **server-side** (never a client value), verifies the anchor is
  an ACTIVE project via `projects.getProjectOverview` (missing / soft-deleted /
  wrong-kind / cross-workspace → the SAME calm `404 {error:"not_found"}`, no
  disclosure), reads **`activity.listForEntity(projectId, {limit: 30, cursor})`** — the
  sole authority — maps records through the DS-05 view-model with the project
  descriptors and a **batched** entity resolver (one `entities.getById` per UNIQUE
  referenced id — no N+1), and returns one JSON page. A tampered/cross-scope cursor is
  caught as a calm `400 {error:"invalid_cursor"}` (internals opaque); non-GET is the
  framework's 405 for a loader-only route. The page size is the module constant
  `PROJECT_ACTIVITY_PAGE_SIZE`.
- **Tab** ([`ProjectActivityTab.tsx`](../../app/modules/projects/ProjectActivityTab.tsx)):
  a thin client that gives the shared `<Timeline>` a `loadPage` fetching that route and
  re-hydrating `occurredAt`. It is the **final** tab (Tasks · Key links · **Activity**,
  per the shared Activity-last vocabulary) and preserves the other tabs, the `?drawer=`
  state and health. A visually-hidden section `h2 "Activity"` sits above the feed and
  the Timeline's day headings are `h3`, so the bare record keeps a non-skipping heading
  outline (see [DEBT-21](../product/PRODUCT_DEBT.md), fixed here).
- **Descriptors** ([`project-activity.ts`](../../app/modules/projects/project-activity.ts)):
  the module registers descriptors ONLY for `project.completed` and `project.reopened`,
  layered over `DEFAULT_ACTIVITY_DESCRIPTORS` via `createActivityDescriptorMap`. Every
  other type — `entity.created`, `entity.updated`, the `entity_link.*` events — uses the
  shared kernel defaults; unknown registered types use the shared safe generic fallback
  (never a raw JSON dump). No new switch statement, no duplicated registry.
- **What the project Timeline includes.** Exactly the events for which the PROJECT is an
  authorised Activity subject (the ADR-012 subject model, see
  [`SPINE_MODEL.md`](./SPINE_MODEL.md) → Activity events): `entity.created` (project
  created), `entity.updated` (rename/update), the `entity_link.*` events for its
  structural Area/Goal link and its `project.relates_to` Key links (project as
  `source`), a child task's `task.belongs_to_project` link (project as `target`, so
  **creating** a task beneath the project appears), a re-parent move, and
  `project.completed`/`project.reopened`. It is **not** a hard-coded allowlist — any
  future registered type naming the project renders naturally.
- **How child-task events are treated (the audited decision).** A child task's own
  LIFECYCLE events — `task.completed`, `task.reopened`, `task.planned`/`task.rescheduled`/
  `task.plan_cleared`, `task.waiting.*`, and the task's own `entity.updated` — name the
  TASK as their only subject and belong to the **task's** Timeline, not the project's.
  The project Timeline therefore represents **events directly associated with the
  project** (which already includes task *creation* via the link event). We do NOT
  scrape or merge descendant task histories in React, do NOT duplicate task events to
  make the Timeline look busier, and do NOT change task-mutation subject recording.
  Broader descendant aggregation, if ever wanted, is a separate accepted architecture
  decision — and is distinct from PROJ-02's derived "meaningful activity" health union
  (which is a health signal, not the canonical event Timeline).
- **Entity navigation.** A referenced **task** resolves to the shared Task Drawer
  (`?drawer=task:<id>`) opened on top of the record (Activity tab, project context,
  Back/Forward and focus preserved); the project itself and its Area/Goal render as calm
  non-link text; a missing/deleted/inaccessible subject degrades to "an unavailable
  item" (no broken link, no ID leak). No Projects-only Drawer or resolver.
- **Revalidation.** The tab passes the project's `updatedAt` as the Timeline reload key.
  A rename/complete/reopen bumps `updatedAt`, so revalidation re-reads the first page —
  the new event appears at the top with **no hard reload and no duplicate rows** (the
  DS-05 stream merges/dedupes by id). A drawer-only navigation leaves `updatedAt`
  unchanged, so loaded Activity pages are preserved. Inactive record tab panels are
  unmounted (DS-02), so switching to Activity always loads a fresh first page and task
  pagination is never corrupted.
- **Filters.** The project Activity tab surfaces **no DS-07 filter bar**, matching the
  sibling task Activity tab; filters remain available in the shared `ActivityStream` and
  can be added later without diverging from the precedent. A product-wide Activity Feed
  is out of scope.
- **No migration, read-only, workspace-scoped.** FND-05 stays the only event store;
  Activity is append-only and this tab is read-only (no Activity mutations added). Every
  query is workspace-scoped and parameter-bound; cursors are scope-bound and opaque;
  soft-deleted anchors are calm not-found; unknown event types never crash; payload
  presentation is bounded (no sensitive free-text waiting content surfaced).

## Today integration

The Today "Continue working" fixture seam is replaced with the **real** bounded read
model (open projects, most-recently-updated first), mapped to a plain Today display
shape (no cross-module import, no separate Today project store). A project opened from
Today lands on the **same** canonical `/projects/:id` record. Other Today fixture
sections and the DS-08 search seam are undisturbed. Since PROJ-02, those cards show the
**same** derived health model (never a Today-only calculation), but only when a project
needs attention (`at_risk`/`blocked`/`stale`) so the calm dashboard stays uncluttered.

## Testing

- **Unit / pure** ([`test/unit/projects`](../../test/unit/projects)): presentation
  mapping, empty-progress (never 100%), serialisation; DS-06 create-form validation +
  submit + server errors; collection + overview component behaviour (incl. **Activity is
  the final tab**); the **project Activity descriptors**
  ([`project-activity-descriptors.test.ts`](../../test/unit/projects/project-activity-descriptors.test.ts):
  `project.completed`/`project.reopened` render clearly, kernel defaults still apply,
  unknown types use the safe fallback, no raw JSON); and the **`ProjectActivityTab`**
  ([`ProjectActivityTab.test.tsx`](../../test/unit/projects/ProjectActivityTab.test.tsx):
  renders the shared `role="feed"` Timeline, appends + de-duplicates pages, retries a
  failed load, opens a referenced task through the shared Drawer, re-reads page one when
  the reload key changes, and shows the empty state).
- **Workers/D1 integration** ([`test/kernel/projects.test.ts`](../../test/kernel/projects.test.ts)):
  `listProjects` (Area/Goal resolution incl. via-Goal, counts matching the rollup,
  state filters, workspace isolation, bounds, order), `getProjectOverview`
  (found/missing/wrong-kind/soft-deleted/cross-workspace), `listProjectTasks`
  (waiting representation, state, wrong-kind/cross-workspace, roll-up reflection), and
  **keyset pagination** for both — >50 records reachable across pages with the exact
  same order as the unpaginated walk (no gap, no duplicate at boundaries), `nextCursor`
  null exactly at the last page, and cursor rejection across state / ordering / project /
  workspace and for a malformed cursor.
- **Route integration** ([`test/kernel/projects-route.test.ts`](../../test/kernel/projects-route.test.ts)):
  the ACTUAL loaders/actions — create/rename/complete/reopen, method guards,
  parent-substitution rejection, wrong-kind/cross-workspace 404s, revalidation, the
  collection loader's cursor walk reaching every project, the `/projects/:id/tasks`
  endpoint (keyset walk + `400` on a tampered cursor), and the `/projects/parent-options`
  search (Areas/Goals only, filtered by query, kinds resolved server-side). The
  **project Activity route** ([`test/kernel/project-activity-route.test.ts`](../../test/kernel/project-activity-route.test.ts)):
  newest-first with the `(occurredAt,id)` tie-break, multi-page reachability with no
  gaps/duplicates and `nextCursor`→null at exhaustion, tampered/cross-project cursor
  `400`, missing/wrong-kind/deleted/cross-workspace `404`, rename/complete/reopen visible
  after revalidation, the audited child-task semantics (task *creation* link appears; a
  child task's own `task.completed` does NOT), and N+1-free resolution bounded by unique
  ids.
- **Activity E2E** ([`e2e/project-activity.spec.ts`](../../e2e/project-activity.spec.ts)):
  a real-D1 journey over a seeded project with >one page of events — open → Activity →
  seeded history → second page (no duplicates) → live reopen/complete without a hard
  reload → open a referenced task in the shared Drawer + Escape → reload → empty state →
  keyboard → bare-record + Activity-tab axe (light + dark) → responsive 320–2560 with no
  overflow → 44px touch target → Tasks/Key links/health intact.
- **E2E** ([`e2e/projects.spec.ts`](../../e2e/projects.spec.ts)): a real-D1 journey
  (browse → open → verify Area/Goal → create task → open in the shared Drawer →
  complete → progress updates → Back/Forward/Escape + focus restoration → reload →
  complete + reopen the project → Today's Continue working → axe → responsive 320–2560),
  plus **pagination journeys** over a >50-row seed: the collection "Load more" reaches a
  second-page project (no false total, no duplicate, affordance retires when exhausted),
  the Tasks tab "Load more" reaches a second-page task while the roll-up total stays
  authoritative, an appended page-2 task opens the shared Task Drawer without disturbing
  state, and the New-Project parent picker searches the server for an Area.

## What remains for PROJ-03, 05, 06

PROJ-03 (notes/knowledge, blocked on NOTES-01), PROJ-05 (settings: area/goal
reassignment, status models, archival), PROJ-06 (mobile-specific enhancements) are
**not started**. (PROJ-02 health and PROJ-04 the Activity tab are done.) Deferred
refinements are tracked in [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md).

## Health testing (PROJ-02)

- **Pure evaluator** ([`test/unit/project-health/evaluate.test.ts`](../../test/unit/project-health/evaluate.test.ts)):
  the exhaustive matrix — empty/on-track/all-complete/completed, inactivity before/at/after
  the threshold, some/all waiting, long wait, overdue/slipped/upcoming, precedence with
  multiple simultaneous signals + preserved secondary reasons, open tasks under a
  completed project, calendar-day boundaries, deterministic injected clock, no
  display-string parsing.
- **Presentation** ([`test/unit/project-health/presentation.test.tsx`](../../test/unit/project-health/presentation.test.tsx)):
  `HealthIndicator`/`ProjectHealthPanel` render state + reasons as text (never
  colour-only), no duplicate reasons, calm on-track/empty states.
- **Workers/D1 integration** ([`test/kernel/project-health.test.ts`](../../test/kernel/project-health.test.ts)):
  health from ALL tasks (45–60 > any page size), meaningful vs irrelevant activity,
  waiting/due/scheduled correctness, soft-delete/cross-workspace exclusion, calm
  wrong-kind/missing, N+1-free chunking, completion/reopen changes.
- **Route + E2E**: the collection & record loaders surface health and refresh after a
  mutation ([`projects-route.test.ts`](../../test/kernel/projects-route.test.ts)); a
  real-D1 journey with seeded wall-clock-independent dates + axe + responsive matrix
  ([`e2e/project-health.spec.ts`](../../e2e/project-health.spec.ts)).

## Related documents

- [ADR-035](../decisions/ARCHITECTURE_DECISIONS.md#adr-035-project-health--a-derived-non-persisted-signal-over-the-spine-tasks-and-activity) · [ADR-034](../decisions/ARCHITECTURE_DECISIONS.md#adr-034-the-projects-module--a-read-only-projection-over-the-spine-no-second-project-model) · [ADR-033](../decisions/ARCHITECTURE_DECISIONS.md#adr-033-re-homing-the-task-record-surface-to-a-shared-module-boundary)
- [`SPINE_MODEL.md`](SPINE_MODEL.md) — the Area → Goal → Project → Task spine.
- [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md) — the task record surface and the Today integration.
- [`ROADMAP_V2.md` PROJ-01](../roadmap/ROADMAP_V2.md#-proj-01--overview) · [`docs/README.md`](../README.md).

### PROJ-05 foundation (slice 1)
Migration `0008_create_project_details.sql` adds the Projects-owned, workspace-scoped `project_details` table. It owns only the open-work workflow status (`planned`, `active`, `on_hold`) and reversible `archived_at` state; missing rows resolve to `planned`, while existing active Projects are backfilled as `active`. Identity/title, parentage, completion, links and roll-ups remain authoritative in the spine. `ProjectSettingsRepository` is workspace-bound and records real status/archive/restore transitions atomically in shared Activity (`project.status_changed`, `project.archived`, `project.restored`). Archive rejects a Project with any active incomplete direct Task. This slice deliberately does not yet wire Settings UI, collection/Today filtering, or archived mutation guards.
