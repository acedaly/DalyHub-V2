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
scoped, opens the canonical Drawer). The fixture-backed Today task search was
retired so there is ONE trustworthy task search. Navigation commands: New Task ·
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
(AGENTS.md §15). Styling is token-only (`app/styles/task-signals.css`). Rendering the
signals inside global **Search** results (which requires extending the shared
`SearchResultItem` contract + surface and a bounded task-search projection) is a
sanctioned follow-up (ROADMAP TASKS-02), deferred to keep this change coherent —
Search itself is unchanged and continues to open the canonical Drawer.

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

**Current status.** [TASKS-01](../roadmap/ROADMAP_V2.md#-tasks-01--first-class-tasks-module) is **☑ Done** — reconciled from ◐ by this audit after verifying its acceptance criteria individually against `main` at `b1a2f65`. [TASKS-02](../roadmap/ROADMAP_V2.md#-tasks-02--shared-task-signal-presentation) is ☑; [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search) remains ☐.

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
- **Search results carry no priority or urgency signal.** The shared `SearchResultItem` renders icon/title/subtitle only. Split out as [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search).
- Task removal is a Drawer status `<select>` (cancel), not the shared lifecycle pattern other modules use — [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28).
- A few Today task actions are reachable only through their visible controls, not a dedicated palette command — [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3). This is a discoverability gap, not an accessibility one.

**Deferred work.** Task signals in global Search ([TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search)); delegation to a real Person EntityLink (the `delegate_to` column is plain text today, deliberately EntityLink-ready); recurrence; time tracking.

**Relevant roadmap items.** [TASKS-01](../roadmap/ROADMAP_V2.md#-tasks-01--first-class-tasks-module) ☑ · [TASKS-02](../roadmap/ROADMAP_V2.md#-tasks-02--shared-task-signal-presentation) ☑ · [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search) ☐ · [TODAY-07](../roadmap/ROADMAP_V2.md#-today-07--quick-capture-wiring) ☐.

**Relevant product-debt items.** [DEBT-16](../product/PRODUCT_DEBT.md#-debt-16--minimal-task-detail-model-richer-workflow-status-deferred--p3) ☑ (closed by TASKS-01) · [DEBT-27](../product/PRODUCT_DEBT.md#-debt-27--task-overdue-urgency-is-signalled-by-colour-alone--p1) ☑ · [DEBT-28](../product/PRODUCT_DEBT.md#-debt-28--task-priority-is-invisible-where-triage-happens-and-status-resolves-three-different-ways--p2) ☑ · [DEBT-37](../product/PRODUCT_DEBT.md#-debt-37--on-hold-tasks-appear-on-today-but-are-excluded-from-tasks-active-planning-views--p2) ☐ · [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3) ☐ · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) ☐.
