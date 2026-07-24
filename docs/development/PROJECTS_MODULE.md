# PROJECTS_MODULE.md — The Projects module (PROJ-01/02/04/05/06)

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
| `GET /projects` | page | The collection: `projects.listProjects({state,cursor})` (state: `open` / `completed` / **`archived`** / `all` — PROJ-05) + first-page Area/Goal seed options for the create form. Also serves keyset pages for the collection's "Load more" (via `useFetcher().load`). |
| `POST /projects/new` | resource | Create a project via `spine.createProject` (parent kind resolved server-side). |
| `GET /projects/:projectId` | page | The overview: `getProjectOverview` + `spine.getRollup` + `listProjectTasks` + `project.relates_to` links. It does **not** fetch a parent (Area/Goal) catalogue — the Settings tab's organisation picker seeds only from the project's CURRENT parent and searches `/projects/parent-options` on demand (PROJ-05 Slice 4 documentation correction). |
| `POST /projects/:projectId/mutate` | resource | `rename` / `complete` / `reopen` / `create_task` / `link` / `unlink` / **`set_status`** / **`move`** / **`archive`** / **`restore`** (PROJ-05, verified project id). Any intent OTHER than `archive`/`restore` is rejected against an archived project with a calm `"archived_rejected"` outcome — never a partial mutation. |
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
  All/Open/Completed/**Archived**, PROJ-05), the shared `EmptyState` (empty vs filtered-empty vs error), and
  the shared [`LoadMore`](../../app/shared/load-more) affordance. A card opens the
  overview through **normal client navigation** (a real `<a href="/projects/:id">` + SPA
  open) — never a `div onClick`. "Load more" accumulates keyset pages with
  `useFetcher().load('/projects?state=…&cursor=…')` (no navigation): pages are appended,
  de-duplicated by id, and the accumulation resets only when the state filter (or
  first-page cursor) changes — so opening the new-project Drawer keeps the loaded pages.
  The subtitle reads "N projects loaded" while more remain (never a false total).
- **Overview** — [`ProjectOverview.tsx`](../../app/modules/projects/ProjectOverview.tsx):
  the DS-02 Record Layout (header: identity, Archived/Completed/workflow-status pill,
  Area/Goal context, Complete/Reopen + Rename — both HIDDEN while archived; summary:
  parent Area, optional Goal, state, task totals, completed count, roll-up progress,
  created/updated; tabs: **Tasks**, **Key links**, **Activity**, **Settings** — Settings
  is now the final tab (PROJ-05 Slice 3), per the shared tab vocabulary's "Activity and
  Settings always sit last").
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

## Settings, archival and the Archived collection (PROJ-05 Slice 3)

The project record's **Settings tab** — the final tab (Tasks · Key links · Activity ·
**Settings**) — and the `/projects?state=archived` collection view, composed ENTIRELY
from the shared DS-10b Settings system (`~/shared/settings`) and DS-06 controls. No
bespoke settings screen, form engine, confirmation dialog or notification system;
the module supplies only typed values, the async apply/confirm callbacks (posting to
the ALREADY-EXISTING, trusted `/projects/:projectId/mutate` action — Slices 1–2 built
`set_status`/`move`/`archive`/`restore` and every repository invariant they need) and
the copy. No new route, no new migration.

- **Composition** ([`ProjectSettingsTab.tsx`](../../app/modules/projects/ProjectSettingsTab.tsx)):
  `SettingsLayout` (a visually-hidden `h2 "Settings"` above it keeps the record's
  heading outline non-skipping, matching the Activity tab's DEBT-21 precedent) with
  three groups when the project is NOT archived, or two when it is:
  - **Organisation** — an IMMEDIATE `SelectField` (`useImmediateSetting`) for the
    project's Area/Goal, server-backed and searchable via the SAME
    `/projects/parent-options` endpoint the New-Project form uses (extracted into the
    shared [`use-parent-options-search.ts`](../../app/modules/projects/use-parent-options-search.ts)
    hook so neither picker duplicates the search/abort/known-option logic). Submits
    the existing `move` intent; the route resolves the parent's KIND server-side —
    the client never asserts it. Reselecting the CURRENT parent is skipped client-side
    (no request, no toast) as well as being a server-side no-op (no Activity). A
    rejected move reverts the control to the last-committed value and shows the
    server's message (DS-10b's declared revert-on-failure for immediate settings).
  - **Workflow** — an IMMEDIATE native `<select>` (Planned/Active/On hold) submitted
    via `set_status`, with the SAME optimistic-apply/revert-on-failure coordinator.
    Never conflated with completion/archival; precedence stays Archived → Completed →
    the workflow status (`project-view.ts#projectStateLabel`), and health remains
    visible only for `status === "active"`, incomplete, non-archived Projects
    (`isHealthVisible`, unchanged from Slice 2).
  - **Archive** (`tone="danger"`) — a `DangerousAction` submitting `archive`. The
    confirmation explains: it moves the project out of normal views, the project AND
    its tasks become read-only, it can be restored at any time, and unfinished direct
    Tasks must be completed or moved first. Reversible, so NO typed confirmation
    phrase is required (DS-10b's declared friction level for a reversible dangerous
    action). A blocked archive surfaces the typed `ProjectArchiveBlockedError`
    message INLINE in the still-open dialog (retryable) — it never claims success,
    never mutates `project_details`, and never appends Activity (Slice 2's race-proof
    guard already guarantees this; the UI only surfaces it calmly).
  - **Archived (read-only)** — when `archivedAt !== null`: an ordinary/restorative
    "Restore project…" action (a plain button + a `ConfirmationDialog` with
    `tone="default"`, deliberately NOT `DangerousAction` — restoring is not
    destructive) submitting `restore`, plus the preserved Area/Goal and workflow
    status rendered as plain read-only text (no editable control).
- **Archived is enforced read-only in the UI, not just the repository.** Mutating
  controls that would only ever fail against an archived project are HIDDEN, never
  merely disabled: `ProjectOverview` omits the Complete/Reopen primary action and the
  Rename secondary action entirely; `ProjectTasksTab` omits "Add task"; `ProjectLinksTab`
  passes `readOnly` to the shared `EntityLinkPicker`, hiding its add/remove controls
  (existing links stay visible); the Drawer resolver refuses to render the "New task"
  or "Rename" forms even for a stale/hand-edited `?drawer=` deep link, showing a calm
  read-only notice instead. This is a calm reflection of the Slice 2 repository/route
  guard, not a substitute for it — every one of these mutations is still rejected
  server-side regardless of what the client renders. A child Task opened from an
  archived project keeps using the SAME shared Task record/Drawer (no second Task UI);
  its own mutation attempts are rejected by the existing PR #38 guards and surface the
  existing calm failure messaging — audited, not rebuilt.
- **The record shows the archived state prominently.** The header status pill already
  reads "Archived" (unchanged precedence: Archived → Completed → workflow status); the
  Summary adds a calm banner ("This project is archived and read-only. Open Settings
  to restore it.") — text-carried, never colour-only.
- **The Archived collection** ([`ProjectsCollection.tsx`](../../app/modules/projects/ProjectsCollection.tsx)):
  the existing `SegmentedFilter` gains a fourth, dedicated **Archived** option
  alongside All/Open/Completed — reusing the SAME `CollectionLayout`, `Card`,
  `LoadMore` and keyset-pagination machinery as every other state. `"all"` keeps its
  exact existing meaning (every non-archived project); an archived Project never
  leaks into Open/Completed/All, and the reverse never happens either — this is
  enforced by the ALREADY-BUILT (Slice 1) `D1ProjectRepository.listProjects` SQL, not
  new UI logic. Archived cards show no active-work health metadata (`healthVisible`
  is already `false` for an archived Project — the same shared `isHealthVisible` rule
  every other surface uses) and are real links to the canonical record. The Archived
  empty state is distinct ("No archived projects" / "Projects you archive appear
  here, and can be restored at any time.") and deliberately omits a second "New
  project" CTA (creating a project doesn't address "nothing is archived").
- **Project creation discoverability** ([`NewProjectForm.tsx`](../../app/modules/projects/NewProjectForm.tsx)):
  when the workspace's parent-option query has genuinely succeeded and found NEITHER
  an Area nor a Goal at all, the form shows an honest confirmed-empty explanation
  instead of a silently-unusable picker. **AREA-01 update:** because `/areas` and the
  New Area Drawer now exist, that confirmed-empty state links to
  `/areas?drawer=new-area` ("Create an Area"). It still does NOT link to Goals (Goal
  records/creation are AREA-02), auto-create an Area, seed fixture data, or make
  Project parentage optional.
  A SEPARATE state — the parent-option query itself failing (a storage/network
  error) — shows a calm, retryable "Couldn't load Areas and Goals" / "Try again"
  message; the two states are never conflated, so a query failure is never
  mis-reported as "no Areas or Goals exist". Neither state auto-creates an
  Area/Goal, and neither makes parentage optional (that would need its own ADR —
  AGENTS.md §4); the picker stays fully usable once at least one eligible parent
  exists.
- **No new route, no new migration.** Every mutation goes through the intents Slices
  1–2 already built and tested at the repository/route boundary; this slice adds only
  the UI that calls them. The Project Settings tab's organisation picker seeds from
  the project's CURRENT parent only (never a first-page catalogue like the
  collection/create-form seed) — the record loader does not fetch a parent catalogue
  at all; every alternative parent is found via the same server-backed
  `/projects/parent-options` search the New-Project form uses.

## Today integration (PROJ-05 Slice 4)

The Today "Continue working" section reads the **real**, bounded, database-filtered
read model: `scope.projects.listProjects({ state: "open", workflowStatus: "active",
orderBy: "recent", limit: RECENT_PROJECTS_COUNT })`. `state: "open"` excludes
Completed and Archived projects; `workflowStatus: "active"` INDEPENDENTLY restricts
the section to Projects the owner has deliberately moved into active work via the
Project Settings tab — Planned and On hold projects are absent, and archiving an
Active project (or completing it) removes it even though its preserved workflow
status remains "active". Both filters and the "recent" ordering/bound are applied AT
the database — never a larger page re-filtered or re-sorted in React, and never a
second status-label mapping (the Card's status pill reuses the same
`projectWorkflowStatusLabel` vocabulary the Settings tab and collection use, so it
always reads "Active", never the old generic "Open"). A project opened from Today
lands on the **same** canonical `/projects/:id` record, and no Today-owned Project
repository, cache or drawer rendering of Projects React components exists. Other
Today fixture sections and the DS-08 search seam are undisturbed. Since PROJ-02,
those cards show the **same** derived health model (never a Today-only calculation),
but only when a project needs attention (`at_risk`/`blocked`/`stale`) so the calm
dashboard stays uncluttered.

**Effect of every workflow transition on Today** — proven by a real Workers/D1 route
integration test ([`test/kernel/today-route.test.ts`](../../test/kernel/today-route.test.ts))
and a real-D1 Playwright journey
([`e2e/project-settings.spec.ts`](../../e2e/project-settings.spec.ts)):

- Planned → Active (via Settings `set_status`): the Project appears in Continue
  working, reading Active; a settings-only transition still bumps the ADR-037 §37.2
  effective `updatedAt`, so "recent" ordering stays honest.
- Active → On hold / Active → Planned: the Project disappears from Continue working
  immediately; it remains visible in the ordinary Projects collection and its
  canonical record, and nothing about completion or archival changes.
- Active → Archived: the Project disappears from Today and appears in the Archived
  collection; the existing archive-eligibility guard (no active unfinished direct
  Task) still applies — Today never substitutes client-only filtering for that
  repository rule.
- Archived → Restored: restore preserves the workflow status exactly as it was
  before archiving (ADR-037 §37.1/§37.5); an Active project therefore reappears in
  Today after restore + revalidation with no second manual status change, while a
  restored Planned or On-hold project stays correctly absent.
- Completed (any workflow status, including a preserved "active" one): still
  excluded by `state: "open"` independently of `workflowStatus`; reopening a
  Completed project preserves its existing documented workflow status and it may
  reappear in Today if that preserved status is Active.

**"Continue working"'s empty state** now reads "No active projects to continue.",
with a quiet supporting sentence explaining that a project appears once its workflow
status is set to Active — replacing the earlier "No recent projects to continue."
copy, which was accurate only while the section was `state: "open"`-only.

## Testing

- **Unit / pure** ([`test/unit/projects`](../../test/unit/projects)): presentation
  mapping, empty-progress (never 100%), serialisation, `isProjectArchived` (PROJ-05);
  DS-06 create-form validation + submit + server errors, incl. the **creation
  discoverability** guidance when no Area/Goal exists and its recovery once one does
  ([`create-forms.test.tsx`](../../test/unit/projects/create-forms.test.tsx)); collection
  + overview component behaviour (incl. **Settings is the final tab**, the Archived
  segmented-filter option, and archived cards/records rendering with no active-work
  health and their mutating controls HIDDEN — `ProjectOverview.test.tsx`,
  `ProjectsCollection.test.tsx`, `ProjectTasksTab.test.tsx`, `ProjectLinksTab.test.tsx`);
  the **project Activity descriptors**
  ([`project-activity-descriptors.test.ts`](../../test/unit/projects/project-activity-descriptors.test.ts):
  `project.completed`/`project.reopened` render clearly, kernel defaults still apply,
  unknown types use the safe fallback, no raw JSON); the **`ProjectActivityTab`**
  ([`ProjectActivityTab.test.tsx`](../../test/unit/projects/ProjectActivityTab.test.tsx):
  renders the shared `role="feed"` Timeline, appends + de-duplicates pages, retries a
  failed load, opens a referenced task through the shared Drawer, re-reads page one when
  the reload key changes, and shows the empty state); and the **`ProjectSettingsTab`**
  ([`ProjectSettingsTab.test.tsx`](../../test/unit/projects/ProjectSettingsTab.test.tsx)
  — PROJ-05 Slice 3): current Area/Goal/status/archive state render (Goal preferred
  over its derived Area as the structural parent); the searchable Area/Goal picker;
  status change success/no-op/failure+revert; move success/failure+revert; the archive
  confirmation (consequence copy, success, the typed blocked message shown inline and
  retryable, duplicate-submit prevention); archived read-only rendering (no
  Organisation/Workflow/second-Archive controls); and restore success with ordinary
  (non-danger) dialog styling.
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
  search (Areas/Goals only, filtered by query, kinds resolved server-side). **PROJ-05
  Slice 3 settings intents** (same file, `PROJ-05 settings intents` describe block):
  `set_status` change + no-op + invalid value; `move` Area→Goal, Goal→Area, Area→Area,
  the live-through-Goal Area resolution, current-parent no-op, wrong-kind/missing/
  deleted/cross-workspace parent rejection; `archive` success (and its effect on the
  archived/open/all collection states), blocked-by-unfinished-Task (settings/Activity
  left unchanged), unblocked once the Task is completed, repeated archive as a no-op,
  and a wrong-kind/cross-workspace project id 404; `restore` success, preserved
  workflow status across archive→restore, repeated/never-archived restore as a no-op;
  and EVERY non-restore intent (rename/complete/create_task/set_status/move/unlink)
  rejected against an archived project with the calm `"archived_rejected"` outcome,
  mutating nothing. **The Archived collection state** (same file, `project loaders`
  describe block): Open/Completed/Archived/All separation (an archived project never
  leaks into "all"), keyset pagination reaching every archived project with a
  scope-bound cursor (an Open-state cursor rejected against the Archived query), and
  no wrong-kind/deleted/cross-workspace project ever surfacing. The
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
- **E2E — Settings + Archived collection** ([`e2e/project-settings.spec.ts`](../../e2e/project-settings.spec.ts),
  PROJ-05 Slice 3): the smallest focused real-D1 journey proving the shared surface is
  actually wired — open a project, open Settings, change workflow status, move it to a
  Goal via the searchable picker, archive it (confirmation + consequence copy),
  confirm the record shows Archived with Rename/Complete hidden and Restore offered,
  reach it again via `/projects?state=archived`, restore it (keyboard-operated:
  focus + Enter, dialog focus trap), confirm normal controls return with the
  preserved workflow status, and no 320px horizontal overflow with the Settings tab
  and a confirmation dialog open. Full PROJ-05 accessibility/responsive/Today-integration
  E2E closure is Slice 4 — this journey is deliberately narrow, not exhaustive.
- **E2E — Today integration closure** (same file, `PROJ-05 Slice 4 — Today
  integration` describe block, over the dedicated seeded `pr-today`/
  `pr-today-planned` projects, isolated from `pr-settings`): the complete
  Planned → Active (appears in Today, reads Active) → On hold (disappears) →
  Active → Archive (disappears from Today, appears in Archived) → Restore
  (reappears in Today because Active was preserved) journey, driven entirely
  through the real Settings tab UI and Today's real loader — no client-only
  filtering ever substitutes for repository state, and every reconciliation is a
  revalidation, never a hard reload; Back/Forward and a copied URL are proven
  mid-journey; a SEPARATE test proves a restored Planned project stays absent
  from Continue working. **Accessibility/responsive closure**
  ([`e2e/accessibility.spec.ts`](../../e2e/accessibility.spec.ts),
  [`e2e/responsive.spec.ts`](../../e2e/responsive.spec.ts)): the Settings tab
  (light/dark, 320–2560px), the Archived collection (with a real permanently-archived
  seeded card), a bare archived record, the archive confirmation dialog, the restore
  confirmation dialog, and a blocked archive's inline alert are all axe-clean and
  overflow-free across the full breakpoint matrix — extending the existing
  `PRODUCT_ROUTES`/viewport sweeps rather than a second scan mechanism. Today's own
  resting-state scan (`/today`, already in `PRODUCT_ROUTES`) now exercises a real
  Active "Continue working" card, since the showcase project `pr-website` carries a
  permanent Active `project_details` row.
- **Focus-restoration fix + regression tests** (`app/shared/settings/SettingsLayout.tsx`,
  [`test/unit/settings/SettingsLayout.test.tsx`](../../test/unit/settings/SettingsLayout.test.tsx),
  plus real assertions added to
  [`e2e/project-settings.spec.ts`](../../e2e/project-settings.spec.ts)): a genuine
  accessibility gap the Slice 4 audit found and fixed at the shared DS-10b layer
  (not duplicated per consumer) — Project Settings replaces its whole "Archive"
  group (a `DangerousAction` + its own `ConfirmationDialog`) with a "Restore" group
  once archiving succeeds, and the reverse after restoring; the trigger and the
  dialog that confirmed it unmount TOGETHER in that same commit, so a browser
  resets focus to `<body>` and nothing reclaims it. The fix lives in
  `SettingsLayout` — the stable ANCESTOR that survives every such conditional
  group swap — which watches for focus orphaned to `<body>` after a mutation
  inside it and reclaims it to the page's main region, benefiting every settings
  surface's dangerous actions, not just Project archive/restore. **This was
  corrected after a PR review**: the first attempt placed the same watcher inside
  `ConfirmationDialog` itself, which a reviewer correctly identified could never
  fire against the real conditional swap, since the dialog's own watcher effect
  unmounts in the same commit as its trigger — proven wrong by a real Playwright
  assertion (`document.activeElement` after archive and after restore) that
  failed against that first attempt and passes against the corrected one.
- **Unit — Today's "Continue working" is Active-only**
  ([`test/unit/today/TodayDashboard.test.tsx`](../../test/unit/today/TodayDashboard.test.tsx)):
  the section's count reflects only the Active projects the loader supplied; every
  card's status pill reads "Active" (never the old generic "Open", and never
  Planned/On hold/Completed/Archived); a card is a real link to the canonical
  `/projects/:id` route; and the empty state reads "No active projects to
  continue." with the quiet supporting sentence — never the stale "No recent
  projects to continue." copy.
- **Workers/D1 — the Today loader itself**
  ([`test/kernel/today-route.test.ts`](../../test/kernel/today-route.test.ts), new
  in Slice 4): drives the ACTUAL `/today` route loader (not just the repository
  predicate `test/kernel/projects.test.ts` already proves) — includes an Active,
  incomplete, non-archived project; excludes Planned, On hold, a Completed project
  even with a preserved Active status, and an Archived project even with a
  preserved Active status; preserves workspace isolation; stays bounded by
  `RECENT_PROJECTS_COUNT`; orders by the effective "recent" `updatedAt`; reflects a
  settings-only transition to Active; removes a project after Active → On hold and
  after archive; includes a project again after restore; excludes a restored
  Planned or On-hold project; and returns the calm empty shape when nothing is
  Active. Deterministic `FakeClock` + `sequentialIds`, following the existing
  `test/kernel/support.ts` conventions — no wall-clock races.
- **PROJ-05 settings + archival (slices 1–2 foundation, hardened at the repository
  boundary) — real Workers/D1**
  ([`test/kernel/project-settings.test.ts`](../../test/kernel/project-settings.test.ts)):
  normal status transition, status no-op, two simultaneous identical status
  requests (exactly one transition), conflicting simultaneous status requests
  (causally-honest `oldStatus`/`newStatus` event chain, never fabricated),
  normal/repeated archive, blocked archive (active task) appending no Activity,
  soft-deleted/cross-workspace/cross-project tasks never blocking archive,
  concurrent task creation racing archive, normal/repeated restore, an
  Activity-insert failure rolling the domain write back, and a genuine no-op
  never reaching an armed fault. **Cross-module archived-project guard**
  ([`test/kernel/project-archive-guard.test.ts`](../../test/kernel/project-archive-guard.test.ts)):
  every Task-detail mutation (update/waiting/planning single+bulk/completion)
  and every spine mutation (create/reopen/move, both move directions) rejected
  against an archived Project, a floating Area-parented Task unaffected, and
  everything working again after restore. **Migration**
  ([`test/kernel/migration-0008.test.ts`](../../test/kernel/migration-0008.test.ts)):
  the actual sequential `0007` → `0008` migration over pre-existing open/completed/
  soft-deleted Projects and a non-Project Task, STRICT + indexes, the composite
  FK rejecting a non-Project entity and a cross-workspace mismatch, the status
  CHECK constraint, the documented backfill and no-row default, and upsert
  idempotency. **Query/timestamp semantics** (added to
  [`test/kernel/projects.test.ts`](../../test/kernel/projects.test.ts)): the
  `"archived"` state, the `workflowStatus` filter, and a settings-only
  transition affecting `"recent"` ordering via the effective `updatedAt`.

## Mobile (PROJ-06)

PROJ-06 is complete as one PR. The audit found that Projects already inherited the
right architecture and most responsive behaviour from shared components; the
remaining risk was not missing routes or a second mobile layout, but narrow-phone
ergonomics and proof across the whole journey.

- **Problems found.** Narrow project/task segmented filters could become cramped;
  the Project Tasks toolbar did not give the filter and "Add task" enough width at
  320px; Activity event timestamps competed with long event copy in the final
  column; several shared touch controls still used the 36px medium control height
  on phone surfaces; confirmation actions were reachable but too compact on short
  phones; and Projects had no focused real-D1 mobile journey. During verification,
  the production build also exposed a shared search case-collision (`highlight.ts`
  vs `Highlight.tsx`), fixed by moving the React renderer to
  `HighlightText.tsx` while keeping the exported component name `Highlight`.
- **What changed.** Projects-specific CSS now only composes shared patterns:
  segmented filters become a two-column full-width control below 30rem; the Tasks
  toolbar and empty-parent actions stack cleanly; long segment labels wrap safely.
  Shared CSS corrections make Activity timestamps collapse under event content in
  narrow Timeline containers, make Record Layout header actions touch-sized on
  coarse pointers, make DS-06 inputs/link-picker controls touch-sized, and make
  DS-10b confirmation/settings controls reach the touch target with safe-area
  padding respected. The DS token touch floor now guards against sub-pixel mobile
  rounding. No project-specific Card, Drawer, form, Timeline, Settings, focus trap,
  scroll lock or route was added.
- **Shared contracts reused.** Collection Layout, Card, Drawer/sheet, Record
  Layout, Tabs, DS-06 forms and EntityLinkPicker, shared Timeline, shared Settings,
  Feedback, `LoadMore`, and the shared `TaskRecordDrawer`. The New Project and
  Project Settings Area/Goal pickers stay server-backed; Project tasks still use
  `/projects/:id/tasks` and the shared `/tasks/:taskId*` record surface; archive,
  restore, status and move still post to `/projects/:id/mutate`.
- **Mobile behaviour.** The owner can enter Projects from the mobile app shell,
  use All/Open/Completed/Archived, load additional project pages, open/close the
  New Project sheet, search/select a real Area/Goal, create a Project, land on its
  canonical record, use Tasks/Key links/Activity/Settings tabs, create/open/mutate
  tasks through the shared Drawer, link/unlink related records, change workflow
  status, and reach archive confirmation/blocked-archive recovery without
  horizontal document scrolling. Archived records remain honestly read-only.
- **Swipe decision.** No Project swipe accelerator was added. The audit found no
  clear frequent, low-risk Project action that justified a gesture; archive is
  explicitly dangerous/reversible-with-friction and remains behind the visible
  Settings confirmation path.
- **Evidence.** `e2e/projects-mobile.spec.ts` drives a real phone workflow at
  390x844, a 320x720 pagination/filter/sheet path, and a 320x568 short-height
  sheet/confirmation path with axe, touch-target and no-horizontal-overflow
  assertions. `e2e/responsive.spec.ts` now sweeps `/projects`, the default Project
  record, all-task state, Key links, Activity, Settings, Archived collection,
  archived record, New Project sheet and Project task Drawer across the canonical
  320/375/390/768/1024/1440/2560 matrix. `e2e/accessibility.spec.ts` now includes
  the Projects record tabs and real Projects overlays. Unit coverage includes the
  Projects no-swipe/honest-link card contract.
- **Migration/deployment.** No migration, no environment variable, no Wrangler
  configuration change and no new dependency. Deployment implication is CSS/route
  code only; the existing dry-run path remains authoritative.

## What remains for PROJ-03

PROJ-03 (notes/knowledge, blocked on NOTES-01B) is **not started**. PROJ-01
overview, PROJ-02 health, PROJ-04 Activity, PROJ-05 settings/archival/Today
integration, and PROJ-06 mobile are complete. Deferred refinements are tracked in
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md).

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

### PROJ-05 foundation (slice 1) + corrective hardening (slice 2)
Migration `0008_create_project_details.sql` adds the Projects-owned, workspace-scoped `project_details` table. It owns only the open-work workflow status (`planned`, `active`, `on_hold`) and reversible `archived_at` state; missing rows resolve to `planned` (both pre-existing OPEN and pre-existing COMPLETED Projects were intentionally backfilled `active` at migration time — completed Projects carry no visible status until reopened, but reopening should not surprise the owner with a reset-to-Planned project). Identity/title, parentage, completion, links and roll-ups remain authoritative in the spine.

`ProjectSettingsRepository` is workspace-bound and records real status/archive/restore transitions atomically in shared Activity (`project.status_changed`, `project.archived`, `project.restored`) — accepted and detailed in [ADR-037](../decisions/ARCHITECTURE_DECISIONS.md#adr-037-project-operational-details-remain-module-owned):

- **Atomic, race-proof transitions.** Every transition folds its precondition (the observed prior status, "not archived", or "no active unfinished direct Task") directly into the domain statement itself — never a separate precondition read — so a concurrent Task creation/reopening or a competing transition is evaluated at the write's own commit. The domain write and its Activity append share ONE `D1Database.batch()` via the same `recordAtomicMutation` seam the Entity/EntityLink repositories use. A no-op appends no Activity; a guard miss re-reads the fresh state rather than assuming success; an Activity-insert failure rolls the domain write back too.
- **Archive is blocked (and stays race-proof) while any active incomplete direct Task exists** — the check is a `NOT EXISTS` folded into the SAME write, closing the TOCTOU the initial slice had.
- **An archived Project is read-only until restored, enforced at the repository boundary — not duplicated per mutation.** `D1SpineRepository` rejects creating a Task under an archived Project, reopening a Task whose Project is archived, and moving a Task into or out of an archived Project (reusing the existing `SpineParentUnavailableError` — spine stays unaware of PROJ-05's TypeScript contracts by design, only its SQL adapter references `project_details`). `D1TaskRepository` folds the SAME "parent Project not archived" guard directly into the domain SQL statement (not just a preceding read) for `updateTask`, `setWaiting`, `clearWaiting`, `planTask` and `clearPlan` (single + bulk), so a concurrent archive racing one of these writes is resolved at the statement's own atomic commit, exactly like the archive guard itself; `completeTask` deliberately keeps a read-based-only guard, because completing a task can never itself recreate unfinished work under any interleaving with `archive`, so no SQL fold is needed there. Generic `task.relates_to` link/unlink is guarded TWICE, deliberately: the Task-detail route pre-checks via `scope.projectSettings.get(task.project.id)` for a fast, friendly rejection with no wasted mutation attempt, and `D1EntityLinkRepository`'s own `create`/`unlink`/`restore` SQL additionally folds the same "either endpoint is a Task under an archived Project" predicate into its `NOT EXISTS` clauses — so ANY caller of the generic link repository is covered, not just this route, and a concurrent archive can never race a link mutation to completion (a blocked attempt throws `EntityLinkEndpointArchivedError`, mapped to the same calm message).
- **One authoritative presentation timestamp (ADR-037 §37.2).** `ProjectListItem.updatedAt`/`ProjectOverview.updatedAt` are the LATER of the spine entity's and the settings row's `updated_at`, computed at read time (never copied into a second column) — so a status change, archive or restore affects "recent" collection ordering and the Project Activity tab's in-place reload key exactly like a rename does.
- **Health visibility is one shared rule.** `isHealthVisible` (in `project-view.ts`) — true only for an open, incomplete, non-archived, `"active"`-status Project — is the SAME function the Project cards, BOTH the Project overview header pill and its detailed `ProjectHealthPanel`, and Today's cards all consult; a Planned or On-hold Project never shows a stalled/at-risk warning, and a Completed or Archived Project never shows an active-work warning anywhere it's rendered.
- **Today's "Continue working" is Active-only (ADR-037 §37.7/§37.8, PROJ-05 Slice 4 — done).** Slice 3 shipped the Settings UI that lets an owner move a Project to `"active"`; Slice 4 wired Today's loader to `workflowStatus: "active"` (alongside the existing `state: "open"`) and closed the accessibility/responsive/E2E gaps across the whole PROJ-05 surface. See the ["Today integration (PROJ-05 Slice 4)"](#today-integration-proj-05-slice-4) section above for the full behaviour and tests.

Slice 3 (see the "Settings, archival and the Archived collection" section above) wires the shared Settings UI and the `/projects?state=archived` collection UI onto exactly these repository/route contracts — no new migration, no new route, no repository change. Slice 4 (Today integration + full accessibility/responsive/E2E closure) is now done — see [ROADMAP_V2 PROJ-05](../roadmap/ROADMAP_V2.md#-proj-05--settings). **PROJ-05 (all four slices) is complete.**
