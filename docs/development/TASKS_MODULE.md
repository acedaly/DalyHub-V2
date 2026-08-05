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
- A few Today task actions are reachable only through their visible controls, not a dedicated palette command — [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3--the--half-resolved-2026-08-01). This is a discoverability gap, not an accessibility one.

**Deferred work.** Delegation to a real Person EntityLink (the `delegate_to` column is plain text today, deliberately EntityLink-ready); recurrence; time tracking.

**Relevant roadmap items.** [TASKS-01](../roadmap/ROADMAP_V2.md#-tasks-01--first-class-tasks-module) ☑ · [TASKS-02](../roadmap/ROADMAP_V2.md#-tasks-02--shared-task-signal-presentation) ☑ · [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search) ☑ · [TODAY-07](../roadmap/ROADMAP_V2.md#-today-07--quick-capture-wiring) ☐.

**Relevant product-debt items.** [DEBT-16](../product/PRODUCT_DEBT.md#-debt-16--minimal-task-detail-model-richer-workflow-status-deferred--p3) ☑ (closed by TASKS-01) · [DEBT-27](../product/PRODUCT_DEBT.md#-debt-27--task-overdue-urgency-is-signalled-by-colour-alone--p1) ☑ · [DEBT-28](../product/PRODUCT_DEBT.md#-debt-28--task-priority-is-invisible-where-triage-happens-and-status-resolves-three-different-ways--p2) ☑ · [DEBT-37](../product/PRODUCT_DEBT.md#-debt-37--on-hold-tasks-appear-on-today-but-are-excluded-from-tasks-active-planning-views--p2) ☐ · [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3--the--half-resolved-2026-08-01) ☐ · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) ☐.

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

---

## The daily driver (TASKS-04, 2026-07-31)

TASKS-04 is the usability pass that turns the structurally complete Tasks module
into something usable every day: an honest Inbox, fast capture that keeps its
promises, quick edits from the ordinary list, predictable basic recurrence and a
focused triage flow. **No Task authority changed** — the spine still owns identity,
completion and parentage, `task_details` the additive fields, the shared Task Drawer
the canonical record, Activity the one audit stream — and every mutation reachable
from any new surface posts to a canonical route.

### Vocabulary: four different things, four different words

The words below are NOT synonyms. Before TASKS-04 three of them collapsed into
"Inbox", which is why a captured task could be "in Inbox" for three unrelated
reasons and leave the Inbox by accident.

| Word | Means | Stored as |
|---|---|---|
| **Inbox** | An **active** Task with **no structural parent** | derived: no active `task.belongs_to_*` link |
| **Unassigned** | The **parent value** shown for an Inbox Task | derived: `parent === null` |
| **No sector** | No **Time Sector** | `task_details.time_sector IS NULL` |
| **Unscheduled** | No **scheduled date** | `task_details.scheduled_date IS NULL` |

Consequences, each proven by test:

- a Task with a P1 priority, a Time Sector, a scheduled date AND a due date is
  **still in Inbox** if it has no parent;
- a Task filed under a Project with no sector and no dates is **not** in Inbox;
- the Time Sectors presentation's no-sector bucket is labelled **"No sector"**, not
  "Inbox" — the two are genuinely different states.

### Optional Task parentage

A Task MAY have no structural parent. This is the one deliberate exception to the
FND-07 rule that a spine child has exactly one parent, and it is confined to Tasks:
capture has to be faster than deciding, and a system that forces a filing decision at
capture time is a system people stop capturing into.

An Unassigned Task is a **valid spine record with no structural EntityLink** — not a
child of a hidden parent. There is no "Inbox" Project, no "Inbox" Area and no
artificial parent link anywhere. `createTask` writes the entity, the spine record,
`entity.created` and the optional `task_details` slice; with a parent it also writes
the structural link and `entity_link.created`, in the same batch as before.

### Default destination precedence

Capture resolves its destination in exactly this order, on every surface:

1. a **fixed context** from the current screen (a Project's "New task", the
   ADR-060 capture context) — the user is already standing somewhere;
2. an **explicit parent** the user chose in this capture;
3. the owner's **saved default destination**, and ONLY when that preference is
   explicitly `chosen_parent`;
4. **Inbox**.

Migration `0024` adds `owner_app_preferences.default_task_destination`
(`'inbox' | 'chosen_parent'`, default `'inbox'`). It exists so a legacy saved parent
cannot silently keep filing ahead of Inbox: the column makes the owner's intent
explicit rather than inferring it from the presence of an old id. Setting a parent in
Settings sets `chosen_parent`; "Use Inbox" clears both.

Every capture surface **states where the task will be filed** — "Filing under
&lt;Project&gt;" or "Filing under Inbox". Silence is not an option for an inbox.

### Canonical parent mutation

`TaskRepository.setTaskParent(id, parent | null)` is the ONE way a Task's parent
changes. It validates the destination inside the authenticated workspace (rejecting
missing, deleted, archived, wrong-kind and cross-workspace parents), preserves every
other field (title, description, priority, dates, status, waiting, delegation,
recurrence, completion), is atomic and idempotent, never leaves two active parent
links, RESTORES a previously-used link row rather than duplicating it, and appends
`entity_link.unlinked` / `entity_link.created` / `entity_link.restored` Activity.

It is reachable from the ordinary list (row overflow → **Move to Project or Area…**
opens the shared quick-edit panel in the Drawer, or **Move to Inbox** for the one-tap
case), from Review Inbox, and through `POST /tasks/:taskId` with `intent=set_parent`.

### Quick editing from the list

The row keeps its two visible actions (Complete, Plan today) and its ONE shared
overflow menu; the long tail did not become a spreadsheet. From the overflow:

- **Rename** — inline title editing. The editor replaces the title **only while that
  row is being renamed**; every other row (and that row, the moment the edit ends)
  keeps the Card's ordinary open link. Inline editing must never cost the user the
  way into the record, and a regression test asserts the link is still there after a
  rename.
- **Move to Project or Area… / Move to Inbox** — the canonical parent mutation.
- **Dates, sector and repeat…** — the shared
  [`TaskQuickEditPanel`](../../app/shared/task-record/TaskQuickEditPanel.tsx) in the
  Drawer: parent, priority, scheduled date, due date, Time Sector, Someday/Maybe and
  repeat, in one calm column.
- priority, due today, clear due, clear plan, Someday/Maybe — unchanged from TASKS-03.

`TaskQuickEditPanel` is **shared, not Tasks-only**: Review Inbox uses the same
component, so there is one editor to learn and one place a control can be wrong.
Every control posts to a canonical route (`/tasks/:taskId` for parent, plan and
repeat; `/tasks/bulk` with a single id for priority, sector, due date and
commitment) and the host revalidates, so a row always reflects the server.

### Quick-capture grammar (deliberately bounded)

The parser is deterministic and closed — never natural-language understanding, never
AI. Every recognised token appears in the preview and can be removed before saving,
and removing one restores the user's words exactly as typed.

| Grammar | Examples |
|---|---|
| Priority | `p1` `p2` `p3` `p4` |
| Time Sector | `this week`, `next month`, `long term`, `routines` |
| Commitment | `someday`, `maybe` |
| Flags | `waiting`, `delegate` |
| Relative days | `today`, `tonight`, `tomorrow` |
| Weekdays | `friday`, `next monday` |
| Explicit markers | `due tomorrow`, `on friday`, `due 15/11` |
| ISO dates | `2026-09-15` |
| Australian dates | `14/8`, `14/08/2026` (day-first; a bare day/month rolls forward a year when it has passed) |
| Recurrence | `every day`, `every weekday`, `every Monday`, `every week`, `every month`, `every year`, and **any `every N weeks/months/years` with N between 2 and 99** (`every 3 weeks`, `every 6 months`) |

Two rules keep it trustworthy:

- an **unmarked** calendar word is a date only when it **trails** the line ("Review the
  notes today"), never mid-sentence ("Review the today show notes"). A date anywhere
  else needs `due …` or `on …`;
- recurrence phrases are consumed **before** the date pass, so "Water the plants
  tomorrow every week" reads as a date AND a repeat rather than as prose.

**The parser's vocabulary is wider than the quick-edit panel's option list, and
that is deliberate (V2.0.1).** The recurrence MODEL accepts any interval 1–99
over five frequencies plus weekday-pinned weekly rules; the panel's `Repeat`
select offers the seven common choices. A rule outside that list is now
presented as **its own option, labelled by the shared `taskRecurrenceLabel`** —
so "every 3 weeks" reads as *Every 3 weeks* and a Monday rule reads as *Every
Monday* — and re-selecting it is a guaranteed no-op, so opening the panel can
never flatten a rule it cannot re-encode. Before V2.0.1 the panel showed the raw
`week:3` token with a false "no longer available" note, and displayed a
weekday-pinned rule as plain "Every week" while any interaction silently
rewrote it. Replacing the rule with a predefined option and removing it entirely
both still work. Authoring a custom interval outside quick capture remains
unbuilt and is recorded as
[DEBT-66](../product/PRODUCT_DEBT.md); the recurrence model was **not** narrowed
to the option list.

Dates resolve against the **owner's calendar day**, passed from the server (ADR-022) —
never the browser's local date and never the CI runner's timezone.

A recognised repeat is **applied, not merely previewed**: the shared
`applyRecurrenceFields` helper puts it on the same `POST /tasks/new` submission, and
the repository writes the rule in the same atomic create as the dates it repeats
from. A phrase with no anchor date is dropped rather than given an invented one.

### Recurrence storage

Recurrence is structured DATA, never prose. Migration `0024` adds
`task_recurrence_rules`: one row per occurrence, keyed `(workspace_id, entity_id)`,
carrying `date_kind` (`scheduled`|`due`), `frequency`
(`day`|`weekday`|`week`|`month`|`year`), `interval` (1–99), an optional selected
`weekdays` list, the ORIGINALLY REQUESTED `anchor_day`/`anchor_month`, and the series
identity `(series_id, sequence)` with a UNIQUE constraint on
`(workspace_id, series_id, sequence)`.

`anchor_day` is why a monthly rule that had to be clamped in February returns to the
31st in March instead of drifting to the 28th.

Rules are validated through the kernel against the Task's own anchor date: a
`scheduled` rule requires a scheduled date, a `due` rule a due date. A rule that could
never compute a successor is refused at the boundary, not stored and discovered later.
A rule is readable on every Task view (the record's summary says "Repeats: Every
week"), editable and removable, is preserved when a Task moves between parents, and
travels with the Task through archive, restore and soft delete.

### Successor creation

Completing an open recurring occurrence creates **exactly one** successor, in the
**same transaction** as the completion:

- the next date is computed after the LATER of the current anchor and the OWNER's
  completion day, so a long-missed daily task resumes tomorrow rather than replaying
  every skipped day;
- the non-anchor date keeps its distance from the anchor (scheduled Monday, due
  Friday → still a four-day window);
- every successor statement is gated on the completion having been written in THIS
  batch, and the UNIQUE `(workspace, series, sequence)` index is the second,
  database-level boundary — a retry or a concurrent completion cannot produce two;
- the completed occurrence REMAINS as history, with its rule intact;
- one `task.recurrence_occurrence_created` Activity event links the two.

**Field-copy contract.** Copied: title, description, structural parent, priority,
Time Sector, commitment state, the recurrence rule and the series identity (sequence
+ 1). NOT copied: completion, waiting, delegation, and workflow status (which resets
to `todo` — an `on_hold` successor would silently vanish from Today).

Bulk completion creates successors the same way, so `/tasks` and Today can never
disagree about whether a repeating task continued.

### Ending a series (and what that means for archiving a Project)

A repeating Task always leaves exactly one OPEN occurrence — that is the point of it.
A Project cannot be archived while it holds unfinished work (PROJ-05 / ADR-037), so a
repeating Task inside a Project keeps that Project open until the SERIES is ended:
remove the repeat from the current occurrence, then complete it. That is deliberate
and honest — silently dropping a live repeat when a Project is archived would lose the
user's intent — and it is asserted by test. Reopening a completed occurrence inside an
already-archived Project is refused, with the archived-Project guard folded into the
guarded UPDATE as well as checked before it, so a Project archived between the read and
the write cannot have work reopened inside it.

### Safe undo

Undoing a completion (`reopenTask`) is atomic with the withdrawal of the successor
that completion created, and decides from PERSISTED identity — series + sequence —
never a guess:

- if the successor is still exactly as completion made it (open, `updated_at` still
  equals `created_at`, no relationships beyond its structural parent link), it is
  soft-deleted in the same transaction and reported as `removed`;
- otherwise it is **retained** and the user is told: "The next occurrence had already
  changed, so it was kept." Undo never destroys real work.

The withdrawal statement re-checks the same conditions inside the batch, so a
successor edited between the safety read and the write still survives.

**A withdrawn occurrence also gives up its place in the series** (AUDIT-FIX-01). A
recurrence row RESERVES a `(series_id, sequence)` slot under a UNIQUE index, so the
same batch deletes the withdrawn successor's row, gated on that successor carrying
*this batch's* `deleted_at`. A retained successor keeps both its task and its row.
Without the release, the emptied sequence stayed reserved and re-completing the
reopened occurrence collided with the index and rolled the completion back — the
occurrence became permanently un-completable in-product.

### Undoing and then re-completing

Completion is repeatable: undo it and tick it again and the series continues. Which
of the two things the next slot means is decided in SQL, inside the completion batch:

- a **live** task already holds it — a successor retained through an undo, or one a
  concurrent completion created — and the successor group declines ENTIRELY. The
  group cascades off the entity insert, so declining writes no entity, spine record,
  detail row, recurrence row or Activity; completion then REPORTS that occurrence,
  read back by series identity, rather than minting a second one;
- a **stale** row holds it — its task is soft-deleted, because an undo withdrew it or
  the owner trashed it — and the row is released first so the fresh successor can take
  the slot.

The two conditions are exact complements, so the UNIQUE index stays the backstop it
was designed to be (ADR-062 §1) rather than an error to be caught. A trashed
occurrence later restored returns as an ordinary non-recurring Task: PX-04 restores
the record, not a claim on a series position another task now owns.

### Review Inbox

`/tasks/review` walks the built-in Inbox query one Task at a time. It uses the SAME
`scope.tasks` projection `/tasks?system=inbox` renders — there is no Inbox-specific
Task model and no second query definition — and loads ONE bounded page (25) with a
cursor, so a large Inbox never becomes a large payload.

For each Task the reviewer gets the shared quick-edit panel (parent, priority,
scheduled date, due date, Time Sector, Someday/Maybe, repeat) plus Complete, Skip and
Previous. Progress through the current set is always visible ("Reviewing task 3 of
25"), `j`/`k` (and the arrow keys) walk the queue, `c` completes, and the shortcuts
stand down while the user is typing. A Task leaves the queue when the SERVER says it
is no longer unassigned-and-active: the loader is revalidated after each mutation, and
the queue is the loader's Inbox page. The empty state teaches the next action.

### Today consistency (DEBT-37)

`listPlanningTasks` now excludes `on_hold` alongside Someday/Maybe and cancelled, so a
paused Task is not "today's work" on one surface and "parked" on another. A focused
kernel suite asserts the treatment of active, in-progress, waiting, on-hold,
Someday/Maybe, cancelled and completed Tasks, AND that a recurring successor appears
on Today as ordinary active work.

### Storage, migration and bundle (TASKS-04, measured)

Migration `0024_tasks04_daily_driver.sql` is **purely additive**: one `ALTER TABLE`
adding `owner_app_preferences.default_task_destination` with a `NOT NULL DEFAULT
'inbox'` and a CHECK, and one `CREATE TABLE task_recurrence_rules` plus two indexes.

- **Fresh database** — applies in sequence with everything else.
- **Existing development / production database** — the new column takes its default on
  every existing preferences row, so a stored `default_task_capture_parent_id` from
  UX-01 becomes inert until the owner explicitly chooses `chosen_parent`. That is the
  intended behaviour: a legacy saved parent must not keep filing ahead of Inbox.
- **Existing assigned Tasks are not touched.** No Task is rewritten, no parent link is
  created or removed, and no "Inbox" Project or Area is invented.
- **Rollback** is by application deployment (D1 migrations are forward-only). The
  previous application ignores both additions: the column has a default, and nothing
  older reads `task_recurrence_rules`.
- **Foreign keys.** `task_recurrence_rules` references `entities (workspace_id, id,
  type) ON DELETE RESTRICT`, matching every other detail table. It cannot obstruct the
  Task lifecycle: Tasks are only ever SOFT-deleted (`entities.deleted_at`), so the
  RESTRICT never fires. Recurrence rows are per-occurrence configuration — removing a
  rule deletes the row, and a completed occurrence keeps its row so the series stays
  resolvable for undo.
- **Aliasing.** The recurrence columns are selected through ONE shared
  `TASK_DETAIL_COLUMNS` fragment and joined through ONE shared
  `TASK_RECURRENCE_JOIN`, declared beside each other in
  [`task-database.ts`](../../app/platform/storage/d1/task-database.ts), so a query
  cannot select the columns without the join that supplies them. One deserialiser
  (`rowToTaskDetails`) turns them into the domain rule + series on every read path.

**Bundle, measured against the TASKS-03 baseline** (`pnpm run build`, byte sizes of
`build/client/assets`):

| | TASKS-03 | TASKS-04 | Δ |
|---|---|---|---|
| **`entry.client` (the initial bundle)** | 182,473 | 182,473 | **0** |
| All client assets | 1,987,399 | 2,006,916 | +19,517 (+0.98%) |

The **initial bundle is byte-identical**. Everything TASKS-04 adds lands in the
lazily-loaded `/tasks` and `/tasks/review` route chunks, the shared task-record chunk
and token-only CSS. Nothing was added to the app shell.

---

## Tasks and Asset obligations (ASSET-02)

An Asset obligation — "renew the registration", "service every 10,000 km" — can
carry a **linked Task**, so asset upkeep appears in Tasks and on Today alongside
everything else the owner has committed to. The authority split is deliberate and
documented in [ADR-063](../decisions/ARCHITECTURE_DECISIONS.md#adr-063-asset-ownership-history--canonical-facts-recorded-events-and-future-obligations-as-three-separate-things) §8.

| Field | Authoritative record |
| --- | --- |
| Due date, recurrence, meter threshold, maintenance meaning | **Asset Obligation** |
| Whether the work is on the owner's plate today | **Task** |
| Proof that the work happened | **Asset Event** |

What this means for anyone working on Tasks:

- **Completing a Task never completes an obligation.** Ticking off "book the
  service" is not proof the car was serviced. The Assets record surfaces "record
  what actually happened" instead. Do NOT add an inference in the other direction.
- **Assets never writes a Task directly.** Completion and rescheduling route
  through the canonical `TaskRepository` via a narrow `ObligationTaskGateway`
  injected at the composition root, so Task recurrence, project rollup and Task
  Activity all still happen exactly once, in the place that owns them.
- **A Task created from an obligation is an ordinary Task** — same repository, same
  spine, same Activity, same EntityLink (`asset.linked_task`) to the Asset. It has
  no special type, flag or table.
- **Deleting the Task is safe.** The obligation survives and clears its pointer on
  reconciliation, so the owner can create a fresh one.
- **Today shows it once.** An obligation with an open linked Task is represented by
  its Task in My day and suppressed from the Assets section — see
  [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md#assets-on-today-asset-02).
