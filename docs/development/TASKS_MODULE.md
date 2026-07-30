# TASKS_MODULE.md — The first-class Tasks module (TASKS-01)

> The workspace-wide task-management and planning system at `/tasks`. Turns the
> Task foundation Today and Projects already use into a complete capture, planning
> and execution surface — **without a second Task model**. See
> [ADR-043](../decisions/ARCHITECTURE_DECISIONS.md#adr-043--the-first-class-tasks-module-the-four-question-planning-model-time-sectors-somedaymaybe-and-derived-display-state)
> for the accepted decision and [ROADMAP_V2 → TASKS-01](../roadmap/ROADMAP_V2.md).

## Authority boundaries (unchanged)

Tasks compose the existing kernel; nothing here is a new authority:

- **Spine** owns Task identity, completion/reopening and Area/Project parentage.
- **`task_details`** owns the additive detail fields (status, priority, due/
  scheduled dates, Markdown description) and — new in TASKS-01 — the Time Sector,
  commitment state and delegation fields.
- The **accepted Waiting model** (ADR-029) stays authoritative for Waiting.
- **EntityLinks** stay the one relationship model; **Activity** the one audit stream.
- The **shared Task Drawer** (`app/shared/task-record/TaskRecordDrawer.tsx`) stays
  the canonical detail/edit surface, opened identically from Today, Projects and
  `/tasks`.
- A new **read-only** workspace projection (`TaskRepository.listWorkspaceTasks`)
  provides presentation/query ownership only — never a second mutation authority.

## The four separate questions (never one overloaded status)

1. **Why does it deserve attention?** Eisenhower **priority P1–P4**
   (`task_details.priority`, widened from the legacy `low/medium/high` set):
   `p1`·Do, `p2`·Defer, `p3`·Delegate, `p4`·Delete/Review. `null` = untriaged.
2. **What should I do with it?** The Matrix's Do/Defer/Delegate/Delete actions — a
   presentation over priority + lifecycle, not a stored field.
3. **When do I intend to work on it?** **Time Sector** (`task_details.time_sector`:
   `this_week`…`routines`, or null = derived **Inbox**) — distinct from the
   **scheduled date** (a specific owner-calendar day) and the **due date** (a
   deadline). The three never silently overwrite one another.
4. **Am I committed?** **Commitment state** (`task_details.commitment_state`:
   `active` | `someday`). Someday/Maybe is first-class: excluded from active counts,
   Today, Upcoming, overdue and normal execution views; retains the full record.

## Display-state precedence (ADR-043 §6)

One shared pure evaluator, `taskDisplayState(...)` in
`app/shared/task-record/task-view.ts`, consumed by Tasks, Today and Projects — **no
duplicated status logic**. Highest first:

**Deleted → Completed → Cancelled → Waiting → On hold → Someday/Maybe → In progress
→ Planned → Inbox.**

"Planned" is derived (an active task with a sector or scheduled date); "Inbox" is
derived (active, no sector, no schedule). Completed is spine-derived; Waiting is
waiting-model-derived; Someday is commitment-derived; Cancelled is a workflow status
distinct from the reversible soft-delete. State is always carried by a label, never
colour alone.

## Views (`/tasks`)

- **Focus** (built-in default landing → This Week): the practical execution
  view; waiting tasks are shown in a separate section.
- **Matrix**: a true 2×2 Eisenhower matrix on desktop, four stacked labelled
  sections on mobile; moving a task between quadrants updates its priority.
- **Time Sectors**: a planning board/list (Inbox · This Week · Next Week · This
  Month · Next Month · Long Term · Routines); moving a task changes only planning
  intent.
- **All Tasks**: the complete bounded collection with deterministic sorting and
  cursor pagination.

**Matrix and Sectors scope to ACTIVE work only** (ADR-043 decision 11): the `active`
system view excludes completed, cancelled, Someday/Maybe AND the parked/blocked
states **waiting** and **on_hold**, so only actionable-now work enters a quadrant or
sector bucket. Parked/terminal records stay reachable via All Tasks and the
dedicated system views. `on_hold` is a real retained state ("On hold" on every
surface) but is shown only through All / the status filter, never in active planning.

**Matrix/Sectors grouping and counts are server-authoritative** (ADR-043 decision
12): `TaskRepository.listWorkspaceTaskGroups(dimension)` returns, in ONE bounded
window-function query, each bucket's authoritative total count (over the whole active
scope, independent of paging) plus a bounded, smart-sorted slice and a `hasMore`
flag. Quadrant/sector counts and empty states are correct before any records load; an
overflowing bucket exposes a **"View all N"** link to the equivalent filtered All view
(which paginates that one bucket on its own cursor). Mobile and desktop render the
same grouping.

System views (`?system=`): Inbox · Today · This Week · Next Week · This Month ·
Next Month · Long Term · Someday/Maybe · Waiting · Routines · Overdue · Completed ·
Cancelled · All. View/sort/filter/selected-task state is URL-reflected and
Back/Forward-correct.

Since SET-01, the owner/workspace preference `defaultTasksView` is used only when
`/tasks` has no explicit valid `?view=`. The preference can choose among these
existing primary views; it does not invent a new Tasks view or change any system
view semantics. A URL value remains the authority for deep links and Back/Forward.

## Data model & migration

Migration `0012_extend_task_planning.sql` is a data-preserving STRICT rebuild of
`task_details` that: widens the `priority` CHECK to `p1..p4` (remapping
`high→p1`, `medium→p2`, `low→p3`), widens the `status` CHECK to add `on_hold` and
`cancelled`, and adds `time_sector`, `commitment_state`, `delegate_to`,
`delegated_on`, `follow_up_on`, `delegate_note` — each CHECK-constrained. New partial
indexes back the sector, someday and scheduled query paths. Cross-field invariants
(delegation, Someday exclusion, display precedence) are enforced by the
workspace-bound `TaskRepository` and tests, as migration 0007 did for waiting.

## Creation (atomic)

`TaskRepository.createTask(NewTaskInput)` creates a task AND its initial planning
fields in ONE `D1Database.batch()` (ADR-043 decision 15): the `entities` row (gated
on an active, non-archived Area/Project parent), the `spine_records` row, the
structural parent link, the `entity.created` + `entity_link.created` events and the
`task_details` slice (only when a planning field is given) — either all commit or
none do, so a task is never created-without-its-planning or orphaned. The
identity/parentage SQL is the SHARED spine create builders (`spine-database.ts`,
reused by the SpineRepository), so the spine stays the identity authority. The
quick-capture form posts to the dedicated **`/tasks/new` resource route** (no
component) so it receives the action's JSON — mirroring `/projects/new`, `/notes/new`.

With ADR-060, `/tasks/new` also accepts a shared capture context. Project and Area
contexts are interpreted as the Task's structural parent before the default capture
parent is considered. Person context creates a normal `task.relates_to` link after
creation and is never silently treated as delegation. Meeting, Note, Diary and Goal
contexts likewise create a `task.relates_to` link with user-facing wording such as
"Follow-up from" or "Supports"; retries are idempotent.

## Parent search

The create parent selector calls `TaskRepository.searchTaskParents(query)` — a
bounded, indexed, parameterised `LIKE` over the WHOLE workspace collection restricted
to active Areas + non-archived Projects, ordered deterministically and capped (ADR-043
decision 13). It is never a fixed-prefix scan, so a newer Area/Project in a long-lived
workspace is always found; the create action re-verifies the chosen parent.

## Pagination & sort

Every workspace-wide read is bounded, workspace-scoped, N+1-free and
cursor-paginated. The cursor (`task-workspace-cursor.ts`) is opaque, versioned and
bound to the full query scope — workspace + view + every filter + sort + the owner's
calendar day — so a cursor that does not match the current query is rejected
calmly (`InvalidSpineCursorError`), never reinterpreted. The default **`smart` sort is
overdue-first** (ADR-043 decision 14): open-before-completed → overdue-before-not
(open tasks due strictly before the owner's calendar day; due-today is not overdue) →
priority P1→P4 (nulls last) → due date (nulls last), as one comparable keyset string.

## Delegation

Honest and additive: the delegatee is plain text now (People is not yet a module),
designed so a future Person EntityLink can coexist or replace it without a
destructive migration. Choosing Delegate from the Matrix offers to set P3, record
the delegatee, enter Waiting through the existing accepted mechanism, and set a
follow-up date — but P3 never *requires* a delegatee.

## Search & commands

The Tasks module registers a **real, repository-backed** search provider
(`app/modules/tasks/search.ts`) over active `task` entities (bounded, workspace-
scoped, opens the canonical Drawer). The projection returns parent context,
priority, due/scheduled dates and completion/workflow fields in one query, so
global Search can render the shared `PriorityIndicator` and `UrgencyChip` without
per-result `getTask()` calls. The fixture-backed Today task search was retired so
there is ONE trustworthy task search. Navigation commands: New Task ·
Open Tasks · Open This Week · Open Matrix · Open Time Sectors · Open Someday/Maybe.

## Shared signal presentation (TASKS-02)

Priority, urgency and display-state are rendered as **three separable slots** on
every task-bearing surface (Today, Projects, `/tasks`, the Drawer), so a card never
signals by colour alone and never becomes a wall of coloured pills:

- **`PriorityIndicator`** (`app/shared/task-record/PriorityIndicator.tsx`) — the
  short `P1`–`P4` tag + a coloured dot, with the full Eisenhower action word
  ("Do"…"Delete / Review") carried for assistive tech. Driven by the canonical
  `taskPriorityTag`/`priorityQuadrant`. Untriaged renders nothing in lists; the
  Drawer opts into an explicit "No priority".
- **`UrgencyChip`** (`app/shared/task-record/UrgencyChip.tsx`) — **Overdue** / **Due
  today** / **Scheduled today** / a future Due or Scheduled date, each an icon + a
  WORD. Driven by the canonical `taskUrgency(task, todayIso)` evaluator in
  `task-view.ts`; overdue is resolved against the owner's server-derived calendar day
  (ADR-022), never browser-local time. The Drawer receives `todayIso` from the
  task-detail loader (`TaskDetailData.todayIso`).

Both live in the Card `metadata` slot; the display-state stays the Card `status`
pill, resolved by the ONE `taskDisplayState` evaluator (the legacy `taskDisplayStatus`
was retired in TASKS-02, so Today, Projects and `/tasks` share one state vocabulary).
Colour and icon are reinforcement only — the tag/word always carries the meaning
(AGENTS.md §15). Styling is token-only (`app/styles/task-signals.css`). Global
Search now uses the same components through the generic Search signal slot
([TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search)).

## Meetings integration (MEET-02)

Meetings create follow-up Tasks through the SAME authority — `TaskRepository.createTask`
(and `updateTask` for a non-default status) — never a second Task model, table or
status/priority vocabulary. The searchable parent picker is the shared
`useTaskParentSearch` hook (`app/shared/task-record/use-task-parent-search.ts`, backing
the bounded `/tasks/parent-options` endpoint), extracted from `NewTaskForm` so the
`/tasks` quick-create and the meeting follow-up form share ONE implementation. A
follow-up Task links back to its meeting with a `task.relates_to` EntityLink, so the
Meeting shows in the Task Drawer's existing Linked section and the Task opens from the
Meeting's Linked Items — no Task-side change was needed. See
[`MEETINGS_MODULE.md`](MEETINGS_MODULE.md) and [ADR-048](../decisions/ARCHITECTURE_DECISIONS.md#adr-048-meeting-follow-through--task-conversion-orchestration-and-the-source-item-mapping).

## Today & Projects integration

Today and Projects remain **projections** of the same task model — not parallel
implementations. Today excludes Someday/Maybe and Cancelled from its planning bands
and Waiting list, preserves overdue/scheduled-today behaviour, and stays a focused
execution dashboard. Projects continue to show their own task subset and open the
canonical Drawer. All three surfaces read the one shared display-state evaluator.

---

## Status (2026-07-27 reconciliation)

**Current status.** [TASKS-01](../roadmap/ROADMAP_V2.md#-tasks-01--first-class-tasks-module), [TASKS-02](../roadmap/ROADMAP_V2.md#-tasks-02--shared-task-signal-presentation) and [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search) are **☑ Done**.

**Delivered capabilities.**

- Four primary `/tasks` views — Focus, Eisenhower Matrix, Time Sectors and All — plus the kernel system views, with **server-authoritative** quadrant and sector grouping (accurate per-bucket counts, never a client re-sort of one page).
- The four separate planning dimensions kept separate: P1–P4 priority, Do/Defer/Delegate/Delete actions, Time Sector vs scheduled date vs due date, and Active vs Someday/Maybe.
- The widened workflow status set (`todo` / `in_progress` / `on_hold` / `cancelled`) and delegation, all additive on `task_details` (migration `0012`) — no parallel store.
- One shared display-state evaluator, `taskDisplayState`, with the precedence Deleted → Completed → Cancelled → Waiting → On hold → Someday/Maybe → In progress → Planned → Inbox. The legacy `taskDisplayStatus` is retired.
- Atomic creation with a deterministic quick-capture parser; atomic bounded bulk mutations via `/tasks/bulk`; cursor-paginated reads over opaque, scope-bound cursors.
- Shared `PriorityIndicator` and `UrgencyChip` (Overdue / Due today / Scheduled today — icon **and word**, colour as reinforcement only) on every task-bearing Card and in the Drawer.
- A **real, repository-backed** global search provider and six commands.
- Test coverage: kernel/D1 (`task-repository`, `task-planning`, `task-workspace`, `task-detail-route`, `task-completion`, `task-waiting`), unit (`tasks-view-model`, `task-display-state`, `workspace-cursor`, `quick-capture`, `task-urgency`, `task-signals`), component, and Playwright — [`e2e/tasks.spec.ts`](../../e2e/tasks.spec.ts) and [`e2e/tasks-journey.spec.ts`](../../e2e/tasks-journey.spec.ts) cover the journeys plus axe in light and dark, no horizontal overflow 320px→desktop, and a 375px mobile Matrix.

**Known limitations.**

- **Today does not exclude or label `on_hold`.** `/tasks`'s `active` system view excludes on-hold work, but Today's `listPlanningTasks` filters only Someday and Cancelled, and its `PlanningTaskItem` projection carries no status — so a paused task appears in Today's planning buckets indistinguishable from active work. Today is the one task-bearing surface that does not run `taskDisplayState`. [DEBT-37](../product/PRODUCT_DEBT.md#-debt-37--on-hold-tasks-appear-on-today-but-are-excluded-from-tasks-active-planning-views--p2).
- Task removal is a Drawer status `<select>` (cancel), not the shared lifecycle pattern other modules use — [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28).
- A few Today task actions are reachable only through their visible controls, not a dedicated palette command — [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3). This is a discoverability gap, not an accessibility one.

**Deferred work.** Delegation to a real Person EntityLink (the `delegate_to` column is plain text today, deliberately EntityLink-ready); recurrence; time tracking.

**Relevant roadmap items.** [TASKS-01](../roadmap/ROADMAP_V2.md#-tasks-01--first-class-tasks-module) ☑ · [TASKS-02](../roadmap/ROADMAP_V2.md#-tasks-02--shared-task-signal-presentation) ☑ · [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search) ☑ · [TODAY-07](../roadmap/ROADMAP_V2.md#-today-07--quick-capture-wiring) ☐.

**Relevant product-debt items.** [DEBT-16](../product/PRODUCT_DEBT.md#-debt-16--minimal-task-detail-model-richer-workflow-status-deferred--p3) ☑ (closed by TASKS-01) · [DEBT-27](../product/PRODUCT_DEBT.md#-debt-27--task-overdue-urgency-is-signalled-by-colour-alone--p1) ☑ · [DEBT-28](../product/PRODUCT_DEBT.md#-debt-28--task-priority-is-invisible-where-triage-happens-and-status-resolves-three-different-ways--p2) ☑ · [DEBT-37](../product/PRODUCT_DEBT.md#-debt-37--on-hold-tasks-appear-on-today-but-are-excluded-from-tasks-active-planning-views--p2) ☐ · [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3) ☐ · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) ☐.

## UX-01 usability pass (2026-07-28)

The default Task capture drawer is now a fast-capture surface over the same
canonical `TaskRepository.createTask` authority. It starts with title, resolved
parent context, priority and due date; the full planning fields remain under
`More details`. Parent resolution is deterministic: a fixed Project/Area context
wins, then the owner/workspace-scoped default capture parent from Application
preferences, then the shared server-backed Project/Area picker. The preference
validates against an active Area or non-archived Project and safely falls back to
the picker when the stored entity is unavailable.

The deterministic quick-capture parser still has no AI or natural-language
guessing. Recognised tokens are applied automatically as removable chips; removing
a chip treats that token as literal title text, and token interpretation is dropped
if it would create an empty title. Priority labels on everyday surfaces are now
concise (`P1 · Urgent`, `P2 · High`, `P3 · Normal`, `P4 · Low`); the Matrix keeps
the Do/Defer/Delegate/Delete wording where it is specifically methodological.

`/tasks?system=upcoming` is a bounded, server-authoritative system view for open
non-terminal work scheduled or due after the owner-calendar day. Existing Matrix
and Time Sectors deep links remain valid.

## Phone workspace (MOBILE-01)

MOBILE-01 changes the CHROME above the list and adds one-tap edits to the rows.
It changes no query, no view model, no mutation and no URL contract.

### One row of controls, one shared sheet

At phone widths the desktop system-view rail, the view switcher and the All-view
sort select collapse into a single row — a **Filter** button carrying its active
count, plus a visible summary of what is applied — with everything else in the ONE
shared collection sheet (`CollectionControls`, see
[`DESIGN_SYSTEM.md → Mobile platform`](../design/DESIGN_SYSTEM.md#mobile-platform-mobile-01)).

The sheet's groups write the SAME URL parameters the desktop controls write:

| Group | Parameter | Kind |
| --- | --- | --- |
| View | `?system=` | `view` (the system views are the product's saved views today; X-02's user-defined ones extend this group) |
| Priority | `?priority=` | `filter` |
| Time sector | `?sector=` | `filter` |
| Layout | `?view=` | `group` |
| Sort | `?sort=` | `sort` |

So the phone sheet is a different way to reach the same state, never a second
filter model: deep links, Back/Forward and sharing behave identically. The badge
counts only the `filter` groups — changing the sort or the layout does not make a
list filtered, and a badge that claimed otherwise would be useless.

### One-tap edits from the list

A task row offers **Complete/Reopen** and **Plan today** as visible, labelled
44px quick actions, with priority changes and "Clear scheduled date" in the shared
overflow menu. Every one posts to a canonical route — completion to
`POST /tasks/:taskId` (`intent=complete|reopen`, the atomic task-domain operation
of ADR-029 that the Task Drawer's own button uses), field changes to the trusted
`/tasks/bulk` mutation with a single id. **There is no list-only mutation.** The
loader is revalidated after each change, so a row reflects the server rather than
an optimistic guess that could disagree with it.

The swipe tray (TODAY-06 / ADR-032) reveals exactly these `quickActions`, so it
remains an accelerator and nothing is gesture-only.

### Card metadata priority

Task cards declare `priority` on their metadata: the shared `PriorityIndicator`
and `UrgencyChip` are `high` (the signals a user scans for), while the time sector
and the delegate are `low` — de-emphasised on a narrow card, still readable, still
in the accessibility tree. This is the module declaring what its record leads
with, replacing any temptation to hide fields with entity-specific CSS.

### What was ALREADY correct

Recorded so it is not re-litigated: the **Matrix and Time Sectors views have been
mobile-first stacked since TASKS-01** — the 2×2 grid and the multi-column sectors
are opt-in above `md`, so a phone has never seen a compressed grid. Likewise the
**Task Drawer already surfaces** completion, waiting, scheduled and due dates,
priority, urgency, parent and sector in its Summary, so those common properties
never required opening the Details edit form. MOBILE-01 verified both rather than
rebuilding them.

## The completed collection experience (TASKS-03, 2026-07-28)

TASKS-03 finishes the main Tasks workspace: it makes the LIST the primary surface,
completes filtering, sorting and grouping, and adds persistent saved views. It is
accepted via
[ADR-059](../decisions/ARCHITECTURE_DECISIONS.md#adr-059-the-tasks-collection-contract--one-declarative-view-configuration-server-side-filtering-and-grouping-and-saved-views-as-validated-configuration).

**It changes no Task authority.** The spine still owns identity, completion and
parentage; `task_details` still owns the additive fields; the shared Task Drawer is
still the canonical detail/edit surface; Activity is still the one audit stream.
Every mutation reachable from a row goes to a canonical route.

### One declarative configuration

The workspace has exactly ONE state model: a validated
[`TaskViewConfig`](../../app/kernel/task-views/task-view-config.ts) — a
presentation, a system view, a sort + direction, a grouping, a density and a set of
filter dimensions from closed sets. That same shape IS the URL
([`tasks-url-state.ts`](../../app/modules/tasks/tasks-url-state.ts)), the loader
payload and the persisted saved view, so a saved view and a copied link can never
mean different things.

A configuration names DIMENSIONS, never fields, columns, operators or SQL. Parsing
is total and lenient — an unknown key or a value from a future build is dropped and
the rest is kept — and what is written is the canonical re-serialised result.

### Presentations, and where the specialist views now sit

| Presentation | What it is |
| --- | --- |
| **List** (default) | One calm, ordered list. Optionally grouped. |
| **Board** | The same query as grouped columns (grouped by priority unless told otherwise — a one-column board is a list with extra chrome). |
| **Matrix** | The Eisenhower 2×2. **Optional**, not the primary way to manage tasks. |
| **Sectors** | The Time Sectors planning board. **Optional**. |

TASKS-01's `?view=focus` and `?view=all` were never layouts — one was a system view
and the other the absence of a filter. They now **redirect once** into the new
vocabulary (`view=list` plus the equivalent `system=`), so an existing bookmark
lands on the same records and the address bar stays honest about what is applied.

### Filters

| Dimension | Parameter | Notes |
| --- | --- | --- |
| Status | `status` | The open-state workflow position. |
| Priority / Eisenhower quadrant | `priority` | **One axis, not two** — they are the same stored field (ADR-043 §2). The filter's labels carry both vocabularies (`P1 · Urgent — Do`). `__none` = untriaged. |
| Due state | `due` | Derived: overdue · due today · due this week · due later · no due date. |
| Planned state | `planned` | Derived over the SCHEDULED date: planned today · this week · earlier · later · unplanned. |
| Time Sector | `sector` | `__none` = the derived Inbox. |
| Parent type | `parentType` | `project` · `area` · `none` (a task whose parent link is gone). |
| Project / Area / Goal | `project` · `area` · `goal` | Real, workspace-scoped option sets; the Goal filter resolves through the Project link. |
| Delegated person | `person` | The distinct delegatees actually present, from ONE bounded aggregate. |
| Delegated / Waiting / Someday | `delegated` · `waiting` · `someday` | Flags. Someday maps to the COMMITMENT state, never a status. |
| Created / updated recency | `created` · `updated` | Closed windows: today · 7 · 30 · 90 days. |
| Completed visibility | `completed` | `hide` · `include` · `only`, applied ON TOP of the system view. |

The derived due and planned states are **mutually exclusive**, and deliberately so:
ONE SQL expression defines each of them, and both the FILTER and the GROUPING
buckets select from it. That is what guarantees "group by due state, then open
Overdue" lands on exactly the records the Overdue bucket counted — two separate
definitions drift, and an earlier draft of this work proved it by producing a
bucket whose drill-down filter matched nothing.

Exclusivity decides the wording, so the labels say what they mean:

- **Overdue** — OPEN and due strictly before the owner's calendar day. The same
  rule the `smart` sort, the `overdue` system view and the `UrgencyChip` use.
- **Was due earlier** — FINISHED with a past due date. It is not overdue (it is
  done) and it is not "due later" (that would be nonsense), so it has its own state.
- **Due today**, then **Due later this week** — the rolling window *after* today
  (`today + 1 … today + 6`), so it never overlaps "Due today" and never depends on
  a first-day-of-week preference. A shared link therefore means the same thing to
  any viewer.
- **Due later**, **No due date**.

The planned states follow the same rule over the SCHEDULED date.

**Tasks have no tag field**, so there is no tag filter. Inventing one would be a
data-model change wearing a filter's clothes — recorded as
[DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3).

All filtering is server-side, URL-backed, bookmarkable, Back/Forward-safe,
workspace-scoped, bounded, and bound into the pagination cursor. Nothing loads the
collection into the browser to filter it.

### Sorting and grouping

Sorts: `smart` · due date · planned date · priority · created · updated · title ·
**parent**. `?dir=asc|desc` reverses where reversing is meaningful; `smart`
deliberately ignores a reversal, because "least relevant first" is not a useful
order. Unparented tasks sort last under BOTH directions of the parent sort. Order
is total — `(sort value, created_at, id)` — so it is stable across reloads and
pages.

Grouping (`?group=`): priority · due state · planned date · status · parent ·
delegated person · time sector. Every grouped view — including the Matrix and the
Sectors — resolves through the ONE server grouping query and the ONE
`resolveGroupedSections`. Counts are **authoritative**: `COUNT(*) OVER (PARTITION
BY bucket)` over the whole filtered scope, never the loaded slice. A closed
dimension renders in its declared order; **empty buckets are hidden** except in the
Matrix and the Sectors, where a missing quadrant or window would itself be
misleading. "View all N" links to the flat list filtered to exactly that bucket.

Crucially, filtering and grouping share ONE resolved scope
(`#resolveWorkspaceScope`), so a grouped total can never contradict the equivalent
filtered list.

### Saved views

`task_saved_views` (migration `0022`, additive) stores a NAME plus the canonical
configuration, scoped to the workspace AND the authenticated owner. Users can save,
update, rename, duplicate, delete (with confirmation), choose a default, return to
the standard view, and copy the current configuration's link without saving.

The BUILT-IN views — Inbox · Today · Upcoming · Overdue · Waiting · Delegated ·
Someday/Maybe · Completed, plus the standard "All active" — are **derived in code**
([`task-system-views.ts`](../../app/kernel/task-views/task-system-views.ts)), not
seeded rows. They cost no storage, exist on day one, and cannot be deleted or
silently mutated. The switcher separates them under "Built-in views" and "Your
views", with the built-in group carrying an explicit note that it cannot be changed
— the distinction is carried by WORDS, never colour.

The switcher is a compact menu, deliberately **not** a permanent secondary sidebar:
a rail would take horizontal space from the task list on every ordinary screen to
show a list touched a few times a day. It names the ACTIVE view (matching by
configuration, so a bare `/tasks` reads "All active" rather than "Custom") and
marks an unsaved change with the word "Modified".

### Capture and quick editing

An in-workspace **quick add** row keeps the field available after a save, clears it,
refocuses it, and carries the session's parent and classification (a task added
while looking at "This week / P1" lands there). Entered text is never discarded
after a recoverable failure, and every outcome is announced. It posts to the
canonical `/tasks/new`; MOBILE-01's title-and-Enter Quick Capture is unchanged.

A row offers **Complete/Reopen** and **Plan today** as visible 44px actions, with
priority, **Due today / Clear due date**, Clear planned date, Someday/Maybe and
"Open task record" in the ONE shared overflow menu. Removal stays the canonical
Drawer's job (PX-04) and the menu points there rather than forking a second
lifecycle path. `setDueDateMany` is new on the repository and runs the same atomic,
guarded path as every other bulk field — the due date is a deadline and never
overwrites the planned date.

### Density

Compact and comfortable use the SHARED DS-04 collection-density contract, passed
through as a prop to `Card`, `CardCollection` and `CollectionLayout`. There is no
Tasks-only CSS density fork, and nothing is hidden at any width.

### One control model

The MOBILE-01 `CollectionControlGroup[]` declaration
([`tasks-controls.ts`](../../app/modules/tasks/tasks-controls.ts)) is the single
source for the phone sheet, the desktop chip row, the active-filter badge and the
reset. The chips and the badge read the CANONICAL parameters — the configuration
the server actually applied — so they can never describe a narrower list than the
one on screen. The sheet is visible at every width (`CollectionLayout
persistentControls`), so there is one control surface to learn rather than a
desktop bar and a phone sheet to keep in step.

### Performance and bundle (TASKS-03, measured)

Every read stays server-side, bounded and N+1-free. A page load runs a fixed
number of queries regardless of how many tasks exist: one flat page **or** one
grouped window query, plus two bounded aggregates for the delegate and parent
filter option sets, plus one bounded saved-view list. Group labels for
open-ended dimensions (parent, delegate) come from the row itself, so a grouped
view costs no per-bucket lookup. The specialist views and the capture drawer stay
lazily loaded.

**Bundle, measured against `main` at `b14aa19`** (`pnpm run build`, byte sizes of
`build/client/assets`):

| | Baseline | TASKS-03 | Δ |
|---|---|---|---|
| **`entry.client` (the initial bundle)** | 182,473 | 182,473 | **0** |
| All client assets | 1,964,952 | 1,987,399 | +22,447 (+1.14%) |

The **initial bundle is byte-identical**: everything TASKS-03 adds lands in the
lazily-loaded `/tasks` route chunk and the shared collection chunk, plus ~5 KB of
token-only CSS. Nothing was added to the app shell.

The E2E suite now runs against a seeded **80-task** collection dataset
([`e2e/seed-tasks.sql`](../../e2e/seed-tasks.sql)) spanning every priority
(including untriaged), every Time Sector (including the derived Inbox), every
workflow status, delegated and waiting work, Someday/Maybe, completed records and
a wide spread of due and planned dates — with the dimensions assigned from
independent deterministic streams, so a combined filter cannot pass for the wrong
reason.
