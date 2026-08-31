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
  **Removed in V2.2 — see [The Matrix was removed](#the-matrix-was-removed).** The
  passage is kept because it describes what TASKS-01 shipped.
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

**The follow-up date is READ since V2.7 RECALL-03.** `follow_up_on` was stored,
validated, edited, exported and restored from migration `0012` onward with no
query predicate anywhere reading it, so a "chase this on Friday" only ever
returned if the owner remembered to look — the sharpest remember-for-me failure
in the product ([DEBT-231](../product/PRODUCT_DEBT.md)). It is now one filter
dimension (`followUp`, [above](#filters)), one fact on Today's existing waiting
attention row, and one line in the daily digest. Deliberately nothing else: no
new Task status, no snooze, no per-Task reminder and **no new notification
kind** — the meeting lead-notice question was asked and answered NO with its
reversal condition recorded
([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine)
decision 5). Reopening a Task leaves the chase date untouched: it dates a chase,
not a completion, and is never derived from `completed_at`.

## Search & commands

The Tasks module registers a **real, repository-backed** search provider
(`app/modules/tasks/search.ts`) over active `task` entities (bounded, workspace-
scoped, opens the canonical Drawer). The projection returns parent context,
priority, due/scheduled dates and completion/workflow fields in one query, so
global Search can render the shared `PriorityIndicator` and `UrgencyChip` without
per-result `getTask()` calls. The fixture-backed Today task search was retired so
there is ONE trustworthy task search. Navigation commands: New Task ·
Open Tasks · Open This Week · Open Tasks by priority · Open Time Sectors ·
Open Someday/Maybe. (V2.2 replaced *Open Matrix* with *Open Tasks by priority* — the
grouped list — keeping the `matrix`/`eisenhower` keywords so an owner who learned that
word still finds something.)

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

**Delivered capabilities at the TASKS-01/TASKS-02 baseline.** This section records
the original shipped baseline; the later [daily-driver section](#the-daily-driver-v22--tasks-05060708)
is the current `main` state for the Matrix removal, row-first editing, bulk
management, recurrence and mobile behaviour.

- The original primary `/tasks` views — Focus, Eisenhower Matrix, Time Sectors and
  All — plus the kernel system views, with **server-authoritative** quadrant and
  sector grouping (accurate per-bucket counts, never a client re-sort of one page).
  V2.2 later removed the Matrix deliberately and retained priority as a filter,
  sort, grouping and row signal.
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

**Deferred work.** Delegation to a real Person EntityLink (the `delegate_to` column
is plain text today, deliberately EntityLink-ready); time tracking. Recurrence is
no longer deferred: V2.2 delivered custom rules, fixed schedule vs after-completion
mode, skip and stop-repeating behaviour. The remaining recurrence limitation is
ordinal monthly patterns, recorded as [DEBT-109](../product/PRODUCT_DEBT.md#-debt-109--ordinal-monthly-recurrence-first-monday-of-every-month-is-not-expressible--p3).

**Relevant roadmap items.** [TASKS-01](../roadmap/ROADMAP_V2.md#-tasks-01--first-class-tasks-module) ☑ · [TASKS-02](../roadmap/ROADMAP_V2.md#-tasks-02--shared-task-signal-presentation) ☑ · [TASKS-02b](../roadmap/ROADMAP_V2.md#-tasks-02b--task-signals-in-global-search) ☑ · [TODAY-07](../roadmap/ROADMAP_V2.md#-today-07--quick-capture-wiring) ☐.

**Relevant product-debt items.** [DEBT-16](../product/PRODUCT_DEBT.md#-debt-16--minimal-task-detail-model-richer-workflow-status-deferred--p3) ☑ (closed by TASKS-01) · [DEBT-27](../product/PRODUCT_DEBT.md#-debt-27--task-overdue-urgency-is-signalled-by-colour-alone--p1) ☑ · [DEBT-28](../product/PRODUCT_DEBT.md#-debt-28--task-priority-is-invisible-where-triage-happens-and-status-resolves-three-different-ways--p2) ☑ · [DEBT-37](../product/PRODUCT_DEBT.md#-debt-37--on-hold-tasks-appear-on-today-but-are-excluded-from-tasks-active-planning-views--p2) ☑ (closed by TASKS-04) · [DEBT-18](../product/PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3--the--half-resolved-2026-08-01) ◐ · [DEBT-29](../product/PRODUCT_DEBT.md#-debt-29--record-removal-is-inconsistent-and-undiscoverable-no-shared-overflow-menu-exists--p1--resolved-2026-07-28) ☑.

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

**The 2026-08 iPhone daily-driver pass** (same identifier, the polish pass ON this
platform — see
[`MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md`](../design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md))
changed three things here, and again no query, view model, mutation or URL:

- **The phone row drops the `waiting-for` fact**, joining priority and repeat in the
  narrow tier's drop list. It is authored as the `high` tier, so it survived a list
  that only dropped `low` and `quiet` — and because the run is `flex: none` at that
  width (deliberately: the title, not the date, must absorb the shrink), a long
  waiting subject could not compress. Measured on the Project record: the run
  reached 287px inside a 320px viewport and took the whole DOCUMENT 79px wide. The
  run now also carries a ceiling, so no future high-tier field can repeat it. The
  subject is unchanged on the Task record and in the row's overflow sheet.
- **The row's "open" link is a full-height target.** It was a 22px strip inside a
  45px row; it now takes symmetric block padding up to the target floor and gives
  it back as negative margin, so no row grew. Padding rather than an overlay
  because the link sits inside the `overflow: hidden` that draws its ellipsis.
- **The quick-add placeholder drops "— press Enter" on a phone**, where it was cut
  mid-word and, at 320 with a real Project name, cost the destination as well.
  There is no Enter key to teach on a phone and the visible **Add** button says how
  to commit; the field's accessible name is unchanged at every width.

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
| Completed recency | `completedWithin` | The SAME closed windows, over `spine_records.completed_at` (V2.7 RECALL-02). |
| Completed range | `completedFrom` · `completedTo` | Owner-calendar `YYYY-MM-DD`, both bounds INCLUSIVE (V2.7 RECALL-02). |
| Follow-up state | `followUp` | Derived over the delegation group's chase date: due to chase · due to chase today · overdue to chase · chase later · no follow-up date (V2.7 RECALL-03). |
| Follow-up range | `followUpFrom` · `followUpTo` | Owner-calendar `YYYY-MM-DD`, both bounds INCLUSIVE (V2.7 RECALL-03). |

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

**The follow-up dimension** (V2.7 RECALL-03, closing
[DEBT-231](../product/PRODUCT_DEBT.md)) is the same shape again, over
`task_details.follow_up_on` — the chase date on a Task's **delegation** group
("ask them again on Friday"). It had been validated, edited, exported and
restored since migration `0012` with **no query predicate anywhere reading it**;
this is the one vocabulary that makes it askable.

| Member | Means |
| --- | --- |
| `due` | Recorded, and on or before the owner's calendar day. The actionable question — and the ONE definition Today's attention fact and the daily digest both read. |
| `due_today` | Recorded, and exactly the owner's calendar day. |
| `overdue` | Recorded, and strictly before it. |
| `upcoming` | Recorded, and strictly after it — written down, not yet due. |
| `none` | No follow-up date recorded at all. |

Four rules keep it one dimension rather than a second system:

- **It is a FILTER, never a status.** There is no `follow_up` Task status and no
  "waiting due" lifecycle position. A Task with a chase due is an ordinary Task
  that is usually also waiting; a date does not fork the lifecycle
  ([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine)
  decision 5).
- **`due` is the union of `overdue` and `due_today`,** and is therefore the only
  non-exclusive member; the other four partition the workspace.
- **A SPECIFIC window is `followUpFrom`/`followUpTo`,** the same explicit pair
  the due and planned ranges model — there is no third date grammar. A Task with
  no chase date is inside no window, exactly as an undated Task is outside every
  due range.
- **The owner's day decides.** `follow_up_on` is a wall-calendar `YYYY-MM-DD`
  compared against `cal.today_iso` — the owner's calendar day (ADR-022), already
  CROSS JOINed once per query for the due and planned states, so the derived
  state costs **no additional bind** and the explicit window costs exactly two.
  There is no naïve UTC comparison and no second timezone authority anywhere in
  it.

The predicate itself is written **once** (`followUpStatePredicate` in
`d1-task-repository.ts`) and consumed by the collection query, the Waiting list
and the Waiting count — which is what makes Today's fact, the digest's line, the
`/tasks` filter and the `/today/waiting` page comparable as machine values
rather than as three implementations that happen to agree.

`/today/waiting` takes the SAME dimension under the SAME parameter name
(`?followUp=due`), resolved by the same predicate, so the number Today states
and the list it opens are one population by construction. See
[`TODAY_DASHBOARD.md` → Waiting](TODAY_DASHBOARD.md#waiting-today-03).

**Tags** are ONE dimension, added by V2.6 FIND-03 and adopted whole from the
workspace's one vocabulary ([ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates)):
`?tag=` takes canonical tag keys, its options come from the bounded workspace
vocabulary, and it is resolved as an `EXISTS` **semi-join** so a Task carrying
two of the named tags appears exactly once — a `JOIN` would duplicate it and
corrupt the page, the count beside the filter and the keyset cursor. It is a
dimension in the same declarative configuration every other filter uses, so it is
expressible in a saved view for free; it is deliberately **not** an input to the
smart sort or to the STEER-04 next-action rule
([DEBT-48](../product/PRODUCT_DEBT.md#-debt-48--tasks-have-no-tags-so-the-collection-offers-no-tag-filter--p3--resolved-2026-08-29-v26-find-03),
closed). A Task's own tags are edited through the shared `TagsField` on the
record Drawer's Details tab — the same interaction People, Assets and Notes use.

All filtering is server-side, URL-backed, bookmarkable, Back/Forward-safe,
workspace-scoped, bounded, and bound into the pagination cursor. Nothing loads the
collection into the browser to filter it.

### Sorting and grouping

Sorts: `smart` · due date · planned date · priority · created · updated ·
**completed** · title · **parent**. `?dir=asc|desc` reverses where reversing is
meaningful; `smart` deliberately ignores a reversal, because "least relevant
first" is not a useful order. Unparented tasks sort last under BOTH directions of
the parent sort, and a never-completed Task sorts last under both directions of
the completed sort for the same reason. Order is total — `(sort value,
created_at, id)` — so it is stable across reloads and pages.

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

> **X-02 (2026-08-08): the same table, the same repository, the same switcher.**
> Tasks saved views did not change — not their rows, their names, their configs,
> their versions, their timestamps, their errors or their route. What changed is
> that they are no longer the ONLY kind. The record and the repository moved to
> `~/kernel/views` as `SavedView<TConfig>` / `SavedViewRepository<TConfig>` and
> `~/kernel/task-views` became a thin façade over them, so `TaskSavedView`,
> `TaskViewRepository` and `TaskViewValidationError` are literally those types and
> classes under their original names. Migration `0036` adds one `kind` column with
> the default `'tasks'`, so every existing row was classified without being touched,
> and names are now unique per owner **per kind**. The switcher itself was extracted
> to `~/shared/saved-views` and is now shared with the cross-module `/views` surface
> — same markup, same class names, same test ids, driven by props. See
> [`VIEWS_MODULE.md`](VIEWS_MODULE.md) and
> [ADR-082](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract).

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
| Recurrence (fixed schedule) | `every day`, `every weekday`, `every Monday`, `every week`, `every month`, `every year`, and **any `every N days/weeks/months/years` with N between 1 and 99** (`every 3 weeks`, `every 14 days`, `every 6 months`) |
| Recurrence (after completion) — TASKS-11 | any counted or bare unit phrase above, followed by one of six suffixes: `after completion`, `after completed`, `after completing`, `after finishing`, `after I complete it`, `after I finish it` (`every 6 months after completion`). An optional `repeat` / `repeats` may lead the phrase. |
| Tags — V2.6 FIND-04 | `#home`, `#deep-work`, `#ERRAND` (the workspace's own spelling is what the preview shows) |

**`#tag`, and what is deliberately NOT a tag (V2.6 FIND-04).** A `#` word is a tag
only when it begins with a letter or digit, contains only letters, digits, `-`
and `_`, and carries at least one **letter**. That last clause is the one that
matters: it is what keeps `the #1 priority`, `Fix #42 before Friday` and
`Row #1-2` as the ordinary text they are. A bare `#`, a pasted Markdown heading
(`# Heading`, `## Subheading`), a body starting with punctuation (`#-x`,
`#_private`), punctuation attached to the word (`#home.`, `#home,`, `#home!`)
and a `#` that does not start the word (`end.#home`, `a/#home`) are all ordinary
text too. Resolution is the one canonicalisation rule
([ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates)),
so `#ERRAND` is the `Errand` the workspace already holds and reads back in that
spelling.

A tag the workspace does **not** hold yet depends on whether the surface can show
it. On the full create form, which renders the token preview, it is **offered** —
the chip says *"New tag: …"* rather than *"Tag: …"* and the owner can remove it,
and it is created only when the capture is saved. On a surface with **no**
preview — the in-list quick-add row, the capture sheet, and every external
transport — there is nowhere to offer it, so it is **not created**: the word
simply stays in the title. An existing tag still resolves everywhere, because
resolving a word the owner already has is not creating vocabulary. One rule, one
option (`unknownTags`), and never a tag the owner could not see arriving. One
line carries at most ten tags; beyond that the extra words stay text.

Three rules keep it trustworthy:

- an **unmarked** calendar word is a date only when it **trails** the line ("Review the
  notes today"), never mid-sentence ("Review the today show notes"). A date anywhere
  else needs `due …` or `on …`;
- recurrence phrases are consumed **before** the date pass, so "Water the plants
  tomorrow every week" reads as a date AND a repeat rather than as prose;
- a recurrence phrase is read **whole or not at all**. If any part of it fails — an
  interval outside the canonical 1–99, a unit the model does not count (`every 3
  weekdays`), an after-completion suffix on a shape the kernel refuses (`every Monday
  after completion`), or a near-miss the closed list does not contain (`after
  completions`) — the ENTIRE phrase stays as ordinary words. Half-reading a rule is
  how a title gets damaged, so it is not a state the parser has.

**The scheduling MODE is never inferred (TASKS-11).** `Pay rent every month` is a
fixed schedule; `Service water filter every 3 months after completion` is an
after-completion interval; nothing about the frequency, the wording of the title or
the kind of work moves a capture from one to the other. The only thing that selects
`after_completion` is one of the six suffixes above, in so many words.

Because an after-completion interval measures from the day the work is finished, its
FIRST occurrence needs a start. That anchor is resolved at **submission**, not while
parsing, by the shared `resolveCapturedRecurrenceAnchor`, which sees the parser's
reading *and* whatever dates the surface supplies through its own controls. The order
is fixed and every real date beats the implied one:

1. an explicit `due …` in the text — the date the phrase attached to;
2. a scheduled date, from the text or from the surface;
3. a due date from the surface;
4. **only** for an `after_completion` rule with no date anywhere, the owner's today.

So typing `Service Hilux every 6 months after completion` into `/tasks/new` *and*
picking a due date gives a rule that advances that due date, with no scheduled date
invented on top of it. A FIXED repeat never reaches step 4 — `Pay rent every month`
with no date carries `needsDate` and the rule is dropped rather than pinned to an
arbitrary day of the month.

Parsing itself invents nothing: `parseQuickCapture` reports what the SENTENCE said, so
the same function is still the whole answer to "what does this text mean?".

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
both still work. Authoring a custom interval outside quick capture was
[DEBT-66](../product/PRODUCT_DEBT.md), closed by TASKS-07's shared
[`TaskRecurrenceEditor`](../../app/shared/task-record/TaskRecurrenceEditor.tsx); the
recurrence model was **not** narrowed to the option list.

The preview chip's wording comes from the SAME `taskRecurrenceLabel` the editor's
summary, the task row and the record use — there is one recurrence formatter, so a
captured rule reads identically wherever it is next seen (*Every 2 weeks*, *6 months
after completion*).

Dates resolve against the **owner's calendar day**, passed from the server (ADR-022) —
never the browser's local date and never the CI runner's timezone.

A recognised repeat is **applied, not merely previewed**: the shared
`applyRecurrenceFields` helper puts it — frequency, interval, date kind, selected
weekdays AND the scheduling mode — on the same `POST /tasks/new` submission, and the
repository writes the rule in the same atomic create as the dates it repeats from. A
phrase with no anchor date is dropped rather than given an invented one. Every value
the parser produces goes through the same kernel validation manual authoring does;
the parser has no constants of its own and can create no rule the editor could not.

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

`follow_up_on` is part of the DELEGATION group, so it is reset with it: the
successor inherits **no** chase date, and the finished occurrence keeps its own.
V2.7 RECALL-03 did not change this rule — it **measured and pinned** it
(`test/kernel/recall-03-commitments-due.test.ts`), so the successor answers the
`followUp: "none"` filter and the predecessor answers `overdue`, and a later item
cannot move the rule without reddening a named test. The reasoning is the one
already stated above: a chase date is the transient state of the occurrence that
was just finished, and a successor carrying it would tell the owner to chase
something nobody has yet been asked to do.

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


---

## Inbox in the guided weekly Review (REVIEW-02, 2026-08-05)

The guided weekly Review processes the Inbox **inside the Review**, and does so over the
existing Tasks contracts rather than a second one:

- **One Inbox definition.** It reads the canonical `inbox` system view — active Tasks with
  no structural parent ([ADR-062](../decisions/ARCHITECTURE_DECISIONS.md#adr-062-intentional-unassigned-tasks-inbox-semantics-and-calendar-recurrence)) — exactly as `/tasks?system=inbox`
  and `/tasks/review` do. There is no Review-only Inbox query.
- **One Task editor.** The step renders the shared
  [`TaskQuickEditPanel`](../../app/shared/task-record/TaskQuickEditPanel.tsx), the same panel
  a `/tasks` row and Review Inbox open. Every mutation posts to the canonical Task routes
  (`/tasks/:taskId`, `/tasks/bulk`), so a Task filed inside a Review is indistinguishable
  from one filed anywhere else, and its Activity is the ordinary Task Activity.
- **The count is authoritative.** The remaining Inbox total comes from
  `listWorkspaceTaskGroups` (which returns each bucket's count over the whole active scope),
  not from the length of the loaded page. The triage queue itself is ONE bounded page and
  offers the rest through `/tasks/review`.
- **The server decides membership.** After every mutation the Review's loader revalidates;
  a Task leaves the queue because the server says it is no longer unassigned-and-active,
  never because the client guessed.
- **A Task never has to have a Project.** Leaving Inbox items deliberately is supported and
  recorded as a decision: the Review distinguishes "Inbox cleared" (derived) from "Inbox
  step reviewed" (an explicit acknowledgement), and Inbox zero never blocks completing a
  Review. No fake categorisation is offered or required.

Full behaviour: [`REVIEWS_MODULE.md → Inbox integration`](REVIEWS_MODULE.md#inbox-integration).


## Tasks created from an AI proposal (AI-01, 2026-08-05)

A Task accepted from an AI proposal is an **ordinary Task**. It is created through
`tasks.createTask`, with the same validation, lifecycle guards, workspace scoping
and `entity.created` Activity as any other Task — and the Activity actor is the
**owner**, because they reviewed and approved it. Nothing marks it as
AI-originated, and nothing about it behaves differently afterwards.

The proposal path is the only difference, and it is upstream: the owner selects
and edits each Task before it exists. Dates are re-validated at acceptance, and a
suggested Project is re-read through `getTaskParentCandidate`, so a Project
archived or deleted between the proposal and the acceptance is refused rather than
written to. See [`AI_PLATFORM.md`](AI_PLATFORM.md).

### Which authority creates it depends on the SOURCE (AI-02, 2026-08-05)

"Ordinary Task" stayed true; "created through `tasks.createTask` directly" did
not survive contact with Meetings. The acceptance path now resolves the
proposal's source record **server-side** (from its id — the browser never names a
type) and routes accordingly:

| Source | Authority | Result |
|---|---|---|
| **Meeting** | MEET-02's conversion authority (`~/platform/meetings`) | The Meeting's action item is created or reused, converted, and the `meeting_item_tasks` mapping written — so the Task shows in the **Follow-up tab as converted** ([`MEETINGS_MODULE.md`](MEETINGS_MODULE.md)). This closed DEBT-90. |
| **Note** | `tasks.createTask`, plus a `task.relates_to` link back to the Note | The source relationship is visible from the Note's Linked surface ([`NOTES_MODULE.md`](NOTES_MODULE.md)). Never routed through the Meeting authority — a Note has no `meeting_items`. |
| **None resolvable** | `tasks.createTask` | Ordinary Task creation, exactly as before. Reached when the proposal named no source, or named one since deleted. |

In every branch the Task itself is canonical, the actor is the owner, and the
owner's reviewed title, description, due date, scheduled date and Project — or
**Inbox**, which is preserved everywhere — are what is written.

---

## EDIT-02 — editing moved onto the shared inline system (August 2026)

The Task record Drawer edits four values in place: the **title** (heading,
focused `rename`), the **priority** (`InlineSelectField` with real priorities only
and a separated `Clear priority`), and the **scheduled** and **due** dates
(`InlineDateField` in the Planning section, alongside the existing
Today/Tomorrow/Next week quick actions). Those four left the Details form, and
`handleUpdate` now treats an absent key as *unchanged* — without that, pressing
**Save changes** could revert an inline edit made while the form was open. Status,
Time Sector, Commitment, delegation and the description stay in the form; the
description now renders on the shared writing surface.

The full classification of every editable field in the product, and the reasons
for what was **not** moved, is in
[`EDITING_CONSISTENCY_AUDIT_2026_08.md`](../product/EDITING_CONSISTENCY_AUDIT_2026_08.md).
Passages above that describe a `Rename` action, an `Edit details` panel or a
per-module long-form control describe the surface as it was before that change;
the mutation contracts they document are unchanged.

---

## The daily driver (V2.2) — TASKS-05/06/07/08

V2.2 is the programme that made Tasks the fastest surface in DalyHub. Its target
interaction is **see Task → act on Task**, not *see Task → open record → find Edit →
modify field → save → close record*. It is accepted as
[ADR-085](../decisions/ARCHITECTURE_DECISIONS.md#adr-085-the-tasks-daily-driver--the-matrix-removed-editing-moved-onto-the-row-bulk-made-structural-and-recurrence-given-a-second-scheduling-mode)
and recorded in [`ROADMAP_V2_2.md`](../roadmap/ROADMAP_V2_2.md).

**No Task authority changed.** The spine still owns identity, completion and
parentage; `task_details` the additive fields; the shared Task Drawer the canonical
record; EntityLinks the one relationship model; Activity the one audit stream. Today
and Projects remain projections of the same Tasks. Every mutation reachable from a row
or a bulk bar posts to a canonical route.

### The Matrix was removed

The Eisenhower Matrix was **intentionally removed in V2.2**. It was not deprecated by
accident, and it is not hidden behind a menu.

The reasoning: the Matrix was a 2×2 over the single stored `task_details.priority`
field. It carried its own grouping dimension (`quadrant`), its own label vocabulary
(Do / Defer / Delegate / Delete), its own empty-bucket rule and its own CSS grid — and
everything it showed was also available as an ordinary grouped list. Priority already
captures the signal; saved views and filters organise work more flexibly than four
fixed cells.

What was removed:

| Removed | Note |
| --- | --- |
| The `matrix` presentation | `TASK_PRESENTATIONS` is now `list · board · sectors` |
| The `quadrant` server grouping dimension | It bucketed by `td.priority`, exactly as `priority` does |
| `priorityQuadrant`, `quadrantActionLabel`, `EisenhowerQuadrant` | The Eisenhower ACTION vocabulary |
| The quadrant headings and subtitles | `QUADRANT_LABELS`, `matrixSubtitle` |
| The `Do`/`Delegate` half of the priority filter labels | The filter now reads `P1 · Urgent`, one vocabulary |
| `dh-tasks-matrix*` CSS | Including the 2×2 grid and the untriaged spanning cell |
| The `Open Matrix` palette command | Replaced by **Open Tasks by priority** (grouped list), which keeps the `matrix`/`eisenhower` keywords so the word still finds something |
| `matrix` as a `defaultTasksView` value | `TASK_DEFAULT_VIEWS` is now `focus · sectors · all` |

**What was NOT removed.** The priority DATA. P1–P4 are unchanged in storage, and they
remain a filter dimension, a sort, a grouping dimension and a row signal
(`PriorityIndicator`). The shared server grouping INFRASTRUCTURE is untouched — the one
window-function query, the authoritative `COUNT(*) OVER` per bucket and
`resolveGroupedSections` still serve Time Sectors and every grouped List or Board.

**Compatibility.** `/tasks?view=matrix` **redirects once** to
`/tasks?view=list&group=priority`: the same records, banded by the same signal, in the
primary workspace. It is a redirect rather than a silent reinterpretation, so the
address bar states what is applied; an explicit `group=` already in the URL is the
owner's and wins. A saved view or a hand-typed URL carrying `presentation: "matrix"`
degrades to `list` through the config parser's ordinary lenient rule.

**The preference needs no migration.** `defaultTasksView` is validated against
`TASK_DEFAULT_VIEWS` on read and falls back to the documented default, so a stored
`"matrix"` resolves to the primary list on the next read and the row is rewritten the
next time the owner chooses a default. Nobody lands on a broken route.

**Time Sectors was assessed, not removed as collateral.** Unlike the Matrix it is a
DISTINCT stored field (`task_details.time_sector`) with its own filter, grouping,
quick-capture grammar, quick-edit control and bulk action, and it answers a question no
date answers: *which window do I intend this in*, as distinct from *which day*
(scheduled) and *by when* (due). It stays a secondary planning presentation.

### Editing happens on the row

Priority, due date, planned date and the structural parent are now DS-16 inline fields
in the Card's metadata slot
([`TaskRowFields.tsx`](../../app/shared/task-record/TaskRowFields.tsx)). The READ state
is the value the row already showed — a `PriorityIndicator`, a formatted date, the
parent's name — and the EDIT state is the shared anchored menu or date popover. Nothing
new appears on the row: an untriaged task reads a quiet "No priority", and that quiet
word is the target (see `InlineEditShell`'s discoverability rule).

They are SHARED components rather than Tasks-only ones, for the same reason
`TaskQuickEditPanel` is: `/tasks`, a Project's task list and Today all show task rows,
and "change the priority here" must not mean three different things.

**Nine entries left the row's overflow menu** — `Set P1`…`Set P4`, `Due today`,
`Clear due date`, `Clear planned date` and `Move to Inbox` — because a menu item six
pixels from the control it duplicates is not a second affordance, it is a second place
to keep in step. What remains is what genuinely does not fit on a row:

| Overflow entry | Why it is still there |
| --- | --- |
| Rename | Replaces the title in place; needs the row's own slot |
| Move to Project or Area… | The SEARCHABLE picker over the whole collection (the inline menu offers the bounded option set) |
| Move to Someday / Maybe | A commitment change, not a field edit |
| Skip this occurrence · Stop repeating | Recurrence-series operations, shown only on a repeating Task |
| Repeat, sector and dates… | The composed quick-edit panel |
| Open task record | Delegation, waiting and removal |

**One seam, one authority.** `task-inline-edit.ts` is the ONE place a DS-16 field meets
a canonical Task route (DS-16 wants a promise-returning `onSave`; a fetcher is
fire-and-forget). It is not an authority: it POSTs to `/tasks/:id` and `/tasks/bulk`,
returns the SERVER's answer, and never applies anything optimistically. A single-id
`/tasks/bulk` call is the canonical path for a field edit *anywhere* — the row, the
quick-edit panel, the Drawer and the bulk bar — so one task and fourteen tasks travel
one code path.

**Row density.** The row leads with the completion control, the title, the priority,
the urgency chip and the recurrence signal; the two dates, the parent, the sector, the
delegate and the waiting subject are `low` metadata. The urgency chip is rendered only
for **Overdue**, **Due today** and **Scheduled today** — the three states a raw date
cannot express — because the inline date field beside it already says "Due 12 Aug", and
showing both would be the same fact twice.

### Bulk management

Selection is a pure reducer
([`task-selection.ts`](../../app/modules/tasks/task-selection.ts)) with four rules:

1. a **range** extends from the last toggled row in DISPLAY order. Only the collection
   knows that order, so the shared Card REPORTS the Shift modifier
   (`CardSelection.onSelectedChange(selected, { shift })`) rather than interpreting it;
2. selection **resets** on any configuration change — a filter, a saved view, a sort, a
   grouping — because the rows the owner was pointing at are gone;
3. selection is **pruned** to what is still on screen after every re-query, so a task
   whose own mutation moved it out of the view stops counting;
4. selection **MODE** is distinct from having a selection, so a long press or the
   "Select tasks" toggle can open it with nothing chosen yet.

The bulk bar shows Complete · Reopen · Date · Priority · Move · More. Each field
control states the MIXED state rather than inventing a current value — with P1s, P2s
and untriaged tasks selected, Priority reads *Mixed*, and choosing P2 sets all of them
to P2. An agreed ABSENCE is a real shared value ("No priority"), not a mixture.
**Reopen appears only when the selection actually contains completed work**, because a
control that cannot apply to anything selected is worse than a missing one.

**The bulk bound is stated, not discovered.** Every bulk mutation is validated against
`MAX_PLAN_BATCH_SIZE` (100) server-side, deliberately: one bulk change is one bounded
atomic transaction. `/tasks` pages at 50, so two presses of *Load more* put more rows on
screen than one mutation may touch. The rule that keeps that honest is pure and lives
beside the reducer (`boundBulkSelection` / `bulkSelectionOverBy`):

- **"Select all" is capped at the bound** and labelled with what it will actually take
  ("Select all 100"), with a line beside it saying how many are loaded and why the
  offer stops where it does. It never builds a selection whose every action is
  guaranteed to be refused.
- **A selection past the bound** — reachable only by Shift-ranging across more than one
  loaded page — replaces the toolbar with the bound and the remedy ("Deselect 37 to
  continue") rather than offering eleven controls that each end in the same typed
  validation error.

`/tasks/bulk` gained four intents, all on the existing contract — validate the id list
and the destination, resolve EVERY id, then ONE `D1Database.batch()`:

| Intent | Repository | Notes |
| --- | --- | --- |
| `reopen` | `reopenTasks` | The SAME safe successor withdrawal per task: untouched → withdrawn and its series slot released; edited → retained |
| `set_parent` | `setParentMany` | The bulk form of `setTaskParent`: one active link, a previously-used link row RESTORED not duplicated, same `entity_link.*` Activity. An empty id is Inbox |
| `delete` | `deleteTasks` | REVERSIBLE soft delete |
| `restore` | `restoreTasks` | Re-checks the retained parent |

**Bulk delete is reversible, and nothing is destroyed.** `deleteTasks` sets
`entities.deleted_at` — the same transition the spine's `softDelete` performs — keeping
the record, its details, its links, its Activity and its recurrence row. The
confirmation names the count and states the consequence:

> **Delete 18 tasks?** They move to the **Deleted** view, keeping their dates, links and
> history, and can be restored from there. Nothing is permanently destroyed.

A new built-in **Deleted** system view (`?system=deleted`) is where they are found and
restored from — a real view rather than a hidden route, because *"where did those 18
tasks go?"* must have an answer the owner can reach without being told about it in
advance. Permanent destruction is not reachable from a bulk toolbar at all.

That required ONE lifecycle predicate in the workspace read
(`#taskLifecycleWhere`), so the flat list and the grouped query can never disagree about
which Tasks exist. **`all` still means all LIVE tasks** — "all" has never meant
"including the trash".

Restore re-checks the retained structural parent, so deleted work is never silently
re-filed into a Project that has since been archived; the whole operation is refused
instead. A Task that never had a parent returns to the Inbox it came from (AUDIT-15).

### Recurrence 2.0

**Two scheduling modes**, stored as structured data and never inferred from title text:

| Mode | Means | Example |
| --- | --- | --- |
| `fixed` (default) | A SCHEDULE. The next date follows the series grid, so finishing late does not move the routine. | Weekly planning, due Monday, finished Wednesday → next Monday |
| `after_completion` | An INTERVAL that restarts on the completion day. | Clean CPAP equipment, due 1 Aug, finished the 6th, every 14 days → 20 Aug |

`fixed` is byte-for-byte what `nextTaskOccurrenceDate` did before V2.2, which is why
migration `0037`'s `DEFAULT 'fixed'` reproduces every existing series exactly.
`test/kernel/task-recurrence-modes.test.ts` writes a recurrence row the OLD way (no
`mode` column in the insert) and completes it five days late to prove the equivalence
rather than trusting the default.

`after_completion` applies the same arithmetic with the completion day as both the
anchor and the threshold, and takes a monthly/yearly rule's day-of-month FROM that day
— "three months after I did it" is the point, so clamping back to a date the owner has
moved on from would be wrong. It is **refused** for `weekday` and for weekday-pinned
weekly rules at the boundary: "every weekday, three days after I finish it" is not a
thing anyone means.

**Custom rules are authorable** through the shared
[`TaskRecurrenceEditor`](../../app/shared/task-record/TaskRecurrenceEditor.tsx), which
replaces the seven-option `Repeat` select in `TaskQuickEditPanel` (so `/tasks` rows,
Review Inbox and the guided Review all get it). This closes
[DEBT-66](../product/PRODUCT_DEBT.md).

- Presets: **Does not repeat · Daily · Every weekday · Weekly · Monthly · Yearly**,
  each one choice, saved immediately;
- **Custom…** opens the composition: a number (1–99), a unit (days/weeks/months/years),
  the weekdays for a weekly schedule, the scheduling mode, and — only when the Task has
  both dates — which date the rule advances;
- no implementation vocabulary reaches the owner: no frequency enum, no field labelled
  "interval", no `anchor_day`, no "date kind";
- the **result is stated as a sentence before it is saved**, through the SAME
  `taskRecurrenceLabel` every read-only surface uses — *"Every 2 weeks on Monday and
  Thursday"*, *"14 days after completion"*.

`recurrence-authoring.ts` holds the pure translation. `presetOf` is the STRICT inverse
of `ruleForPreset`: a custom interval, a weekday-pinned rule and an after-completion
rule are all reported as **Custom**, never coerced to the nearest preset — which is
exactly how a pinned Monday used to get dropped (V2.0.1).

Monthly and yearly clamping is unchanged: `anchor_day` is why a rule anchored on the
31st that had to clamp to 28 February returns to the 31st in March.

### The series-edit contract

DalyHub materialises recurrence incrementally (ADR-062): exactly one occurrence is ever
open, and the next is COPIED from it at completion. That has a direct consequence which
is stated here rather than left implied.

| Change | Scope | Why |
| --- | --- | --- |
| Title, priority, parent, Time Sector, commitment, description | **This and future, by construction** | The successor is copied from this occurrence, so the change carries forward. Past occurrences are never touched. |
| The recurrence RULE | **This and future** | `setTaskRecurrence` edits the current occurrence's rule; the successor inherits it. Completed occurrences keep the rule they had. |
| The recurrence ANCHOR DATE | **Explicitly scoped** | The one genuinely ambiguous case — see below. |
| Completed occurrences | **Never** | History is not rewritten because the future changed. |

`moveTaskOccurrence(id, { date, scope })` implements the scoped case with one additive
nullable column, `task_recurrence_rules.series_anchor_date`:

- **`scope: "occurrence"`** — move THIS occurrence and REMEMBER the routine's grid, so
  the next occurrence returns to schedule. ("Weekly on Mondays; this week only, do it
  Wednesday.")
- **`scope: "series"`** — move this occurrence AND re-anchor the schedule here, so every
  future occurrence follows from the new date.

The scope is REQUIRED, never defaulted: guessing between "this one" and "the whole
routine" is the mistake the scope exists to prevent. `series_anchor_date` is `NULL` for
every row written before V2.2 and for every ordinary occurrence, in which case the
occurrence's own date IS the grid — the original behaviour. A successor always returns
to the grid and stores `NULL`.

**Deferred, honestly:** ordinal monthly patterns ("first Monday of every month") are
NOT implemented. They need a second monthly representation beside the anchor-day one,
and every consumer — validator, successor planner, label, editor and parser — would
have to carry both. Recorded as [DEBT-109](../product/PRODUCT_DEBT.md) rather than
half-built.

### Skip, and stopping a repeat

**Skip this occurrence** (`skipTaskOccurrence`) advances the occurrence one step along
the series and leaves it **OPEN**. No successor is created, no sequence is consumed, no
completion is written. It appends `task.recurrence_occurrence_skipped` — deliberately
its own event type, because marking work "done" that was not done corrupts the one
record the owner relies on, and a bare reschedule would not say the series advanced.
The non-anchor date travels with it, so a Monday/Friday window stays four days wide.

**Stop repeating** is `setTaskRecurrence(id, null)` on the current occurrence: the
future ends and every completed occurrence keeps its record and its rule. Historical
occurrences are never deleted because a recurrence was stopped.

### Bulk completion and recurrence

Unchanged and still asserted: a bulk selection containing ordinary Tasks and several
recurring series completes all of them and generates **exactly one** successor per
series, each following its OWN scheduling mode. Bulk completion runs the same successor
logic per task — there is no bulk special case that bypasses recurrence.

### The phone (TASKS-08)

- **Long press → selection mode**, with the held row selected, via the shared
  `useCardLongPress`. It is gated on the same touch-first media query the swipe layer
  uses, armed only on the card surface (never a nested control), cancelled by any
  drift, and it suppresses the click that would otherwise ALSO open the record.
  It is an **accelerator**: the Card checkbox and the "Select tasks" toggle are the
  ordinary, labelled, keyboard-and-screen-reader path.
- The bulk bar collapses to the M3 bottom action row the shell already uses — Complete ·
  Date · Priority · Move · More — scrolling horizontally rather than stacking, and
  clearing the bottom navigation. No new overlay primitive was created.
- The **delete confirmation** stacks rather than scrolling sideways, so the consequence
  is read before either button is reachable.
- The **recurrence editor is phone-first**: single-column at every width, seven 44px
  weekday targets that WRAP rather than shrink (so 320px becomes two lines rather than
  seven unhittable squares), `inputMode="numeric"` on the interval so a phone offers the
  number pad, and the plain-language result immediately above Save.
- The existing swipe tray is unchanged and still mirrors the row's visible actions.

### Accessibility

- Selection state is a native checkbox plus the bar's "N selected" count — never colour
  alone. The "Select tasks" toggle carries `aria-pressed`.
- Every inline field is the DS-16 shared control: a real `<button>` whose accessible
  name is `"<field>: <value>"`, keyboard-activatable, with focus restored to it on
  Escape.
- The recurrence editor's mode choices are a real radio group with a legend; the weekday
  toggles are real checkboxes whose accessible name is the FULL weekday name (the single
  visible letter is `aria-hidden` reinforcement); the composed result is a polite live
  region so a screen-reader user hears it change.
- The long press has no keyboard equivalent BY DESIGN and therefore is never the only
  way to do anything.

### Storage and migration

Migration `0037_task_recurrence_modes.sql` is purely additive: two columns on
`task_recurrence_rules` (`mode TEXT NOT NULL DEFAULT 'fixed'`, `series_anchor_date TEXT`)
and one index. No existing row is rewritten and no rule is reinterpreted.

- **Matrix removal, bulk selection, list grouping and filter presentation have NO
  migration**, deliberately — they are presentation concerns.
- **Bulk delete needs no schema.** It uses `entities.deleted_at`, which every entity
  already has.
- SQLite cannot add a CHECK to an existing table, and rebuilding `task_recurrence_rules`
  would rewrite every stored rule for a presentation-neutral addition. The closed sets
  are enforced where every other cross-field task invariant is — in the workspace-bound
  `TaskRepository` and `validateTaskRecurrenceRule` — exactly as migration 0007 did for
  waiting.
- **Rollback** is by application deployment (D1 migrations are forward-only). The
  previous application ignores both columns: `mode` has a default and nothing older
  selects either name.

### Status (2026-08-08, V2.2 reconciliation)

**Current status.**
[TASKS-05](../roadmap/ROADMAP_V2_2.md#-tasks-05--daily-driver-workspace--delivered-2026-08-08) ·
[TASKS-06](../roadmap/ROADMAP_V2_2.md#-tasks-06--bulk-management--delivered-2026-08-08) ·
[TASKS-07](../roadmap/ROADMAP_V2_2.md#-tasks-07--recurrence-20--delivered-2026-08-08) ·
[TASKS-08](../roadmap/ROADMAP_V2_2.md#-tasks-08--mobile-daily-driver--delivered-2026-08-08)
are **☑ Done**, on top of TASKS-01…04.

**The before-state audit that started the programme**, kept so the reasoning is
reviewable rather than re-derived:

| Capability | State on `main` before V2.2 | Outcome |
| --- | --- | --- |
| Inbox | First-class, derived (active + no parent), built-in view + `/tasks/review` | **Keep** — unchanged |
| Quick add | In-workspace row, deterministic parser, session defaults | **Keep** — unchanged |
| Inline title editing | Present, via the row's overflow → Rename | **Keep** |
| Priority editing | Four overflow menu items | **Improve** → inline on the row |
| Due date | Overflow: *Due today* / *Clear due date* | **Improve** → inline date field |
| Scheduled date | Row quick action *Today*; overflow clear | **Improve** → inline date field (quick action kept) |
| Project / Area | Overflow → Drawer → picker; `setTaskParent` canonical | **Improve** → inline, one selection replaces |
| Status | Drawer form + `set_status` bulk | **Keep** (moved behind bulk **More**) |
| Saved views | Complete, shared with `/views` since X-02 | **Keep** — unchanged |
| Bulk backend | Atomic field mutations on `/tasks/bulk` | **Extend** → reopen, move, delete, restore |
| Bulk UI | Ten buttons + two selects; no select-all, no range, no mixed state, no delete | **Rebuild** |
| Recurrence model | Structured, five frequencies, interval 1–99, weekday-pinned, series identity | **Extend** → scheduling `mode` |
| Recurrence UI | Seven-option select; custom rules unauthorable (DEBT-66) | **Build** → shared custom editor |
| Matrix | A presentation + its own grouping dimension + its own vocabulary | **Remove** |
| Time Sectors | A distinct stored field with filter, grouping, grammar and bulk action | **Keep** (assessed) |
| Mobile selection | Card checkbox only; bulk bar not phone-shaped | **Improve** → long press + M3 bottom bar |

**Known limitations, stated rather than implied.**

- **Ordinal monthly recurrence** ("first Monday of every month") is not expressible —
  [DEBT-109](../product/PRODUCT_DEBT.md). Deferred deliberately; the reasoning is in
  ADR-085 decision 11.
- **The bulk bound is 100 tasks, and the surface now says so before the action** —
  [DEBT-110](../product/PRODUCT_DEBT.md). See *The bulk bound is stated, not
  discovered* above. TASKS-10 added the browser journey that accumulates more than
  one page and proves the capped selection and over-bound remedy.
- **Series scope applies to the DATE only.** Every other field is "this and future" by
  construction, because the successor is copied from the current occurrence. That is
  the contract, documented above and tested — not an oversight.
- **`task.recurrence_occurrence_skipped` has no dedicated Timeline treatment beyond its
  label and tone.** It reads correctly in the Task Timeline and the workspace feed.

**Relevant product-debt items.**
[DEBT-66](../product/PRODUCT_DEBT.md) ☑ (closed by TASKS-07) ·
[DEBT-109](../product/PRODUCT_DEBT.md) ☐ (raised by TASKS-07) ·
[DEBT-110](../product/PRODUCT_DEBT.md) ☑ (closed by TASKS-10) ·
[DEBT-56](../product/PRODUCT_DEBT.md) ☐ (unchanged: an axe `label-title-only`
false positive on one shared SelectField in the Tasks Drawer).

**Test coverage added by V2.2.**

| Layer | File | Covers |
| --- | --- | --- |
| Unit | `test/unit/tasks/recurrence-authoring.test.ts` | The preset ⇄ rule round trip, custom intervals, weekday sets, mode validation, the wire form, and that the pre-save sentence is the shared formatter's |
| Unit | `test/unit/tasks/task-recurrence.test.ts` | The two modes' arithmetic: fixed keeps the grid, after-completion re-anchors, monthly/yearly clamping under both, and the two agree when the work is on time |
| Unit | `test/unit/tasks/task-selection.test.ts` | Range in display order, reset, prune, mode-vs-selection, and the mixed-value summaries |
| Unit | `test/unit/tasks/tasks-view-model.test.ts` | The `?view=matrix` compatibility redirect, and the grouped-list presentation after the Matrix |
| Unit | `test/unit/tasks/TaskQuickEditPanel.test.tsx` | The preset path, the custom composition, and that opening Custom posts nothing |
| Kernel/D1 | `test/kernel/task-recurrence-modes.test.ts` | A pre-TASKS-07 row (no `mode` in the insert) completed late; both modes; bulk completion honouring each series' own mode; skip; the two series scopes; stopping a repeat |
| Kernel/D1 | `test/kernel/task-bulk-operations.test.ts` | Bulk move (including link restore and Inbox), bulk reopen with successor withdrawal/retention, reversible delete + restore, the archived-parent refusal, workspace isolation and the batch bound |
| E2E | `e2e/tasks-v22-daily-driver.spec.ts` | Scenarios B–F: direct edit, bulk cleanup with a reversible delete, custom recurrence in both modes, skip/stop, the phone at 390px, and the width matrix including the Deleted view |

### Keyboard, and Today, after V2.2

**No new global shortcut was introduced, and that is a decision rather than an
omission.** The reserved cross-app vocabulary was audited first (DS-09: `⌘K` for the
palette, `/` for search, `c` for capture, `j`/`k` and the arrows inside a queue, `Esc`
to dismiss), and every V2.2 capability already had a keyboard path through it:

| Action | Keyboard path |
| --- | --- |
| Create a task | `c` (global capture), or Tab to the quick-add row and press Enter |
| Open the selected task | Tab to the row's title control and press Enter |
| Complete a task | Tab to the row's Complete action, or the palette |
| Edit priority / a date / the parent | Tab to the inline field and press Enter or Space — it is a real control, not a hover affordance |
| Enter and leave selection | The header's **Select tasks** toggle; Space on a row's checkbox; **Done** to leave |
| Extend a range | Shift-click, with the checkbox reachable by keyboard for individual selection |
| Every bulk action | The bulk bar is an ordinary labelled control group in the tab order |

Adding, say, `p` for priority or `x` for select would collide with typing in the
quick-add field — which is always on screen — and would need a modal "task focus" mode
the collection does not have. The one genuine gap remains discoverability rather than
reachability, which is [DEBT-18](../product/PRODUCT_DEBT.md)'s existing subject.

**Today was re-audited after the recurrence changes and needed no change.** It cannot
show a phantom future occurrence, because the model materialises exactly one successor
and only on completion (ADR-062); it cannot duplicate a series for the same reason; it
already excludes `on_hold` alongside Someday/Maybe and cancelled (TASKS-04 closed
DEBT-37); and it reads the canonical scheduled date, so due and scheduled cannot be
confused. A skipped occurrence simply moves to its next date and Today follows, because
Today reads the same field. The existing kernel suite asserting that a recurring
successor appears on Today as ordinary active work still passes unchanged.

### Concurrency and performance (V2.2, measured)

**Concurrency.** Every V2.2 mutation reuses the existing guarded-write contract rather
than inventing one:

- the **series operations** (`moveTaskOccurrence`, `skipTaskOccurrence`) anchor on the
  guarded OPEN-task bump, so a completion, a delete or a Project archived between the
  read and the write causes the whole group to no-op and the caller is told;
- **bulk reopen** gates each spine clear on the exact `completed_at` it observed, so a
  concurrent reopen loses cleanly rather than double-writing;
- **bulk delete and restore** gate on the current lifecycle state (`deleted_at IS NULL`
  / `IS NOT NULL`), and restore additionally re-checks the retained parent INSIDE the
  UPDATE — so a Project archived mid-flight cannot receive restored work;
- **two tabs editing one recurrence rule** cannot produce an incoherent series: the rule
  lives on the occurrence, `setTaskRecurrence` writes it in one batch behind the guarded
  bump, and the series identity is never re-parented by an edit.

**A committed bulk outcome is announced from the WORKSPACE's live region, not the
bulk bar's.** This is not a stylistic choice about where a `role="status"` lives. A
successful bulk action clears the selection, and clearing the selection unmounts the
bar — in the same React commit that would have written the message. A live region
inside the bar is therefore destroyed before any assistive technology can read it, so
an action on eighteen records confirms itself with silence. `BulkActionBar` takes an
`onAnnounce` callback and reports success through the same announce-and-revalidate
channel the row's inline fields use; the region outlives the selection. A REFUSAL is
the opposite case and stays in the bar: a refusal keeps the selection, so the bar is
still mounted and the message belongs beside the controls the owner will retry with.
The message also names the action — the four lifecycle intents report "deleted",
"restored", "completed" and "reopened" rather than the generic "updated", which is
true of a priority change and misleading of a deletion.

**Reads are unchanged in shape.** No V2.2 surface added a query. The row's inline
parent menu is drawn from the loader's EXISTING bounded parent option set, so opening it
costs nothing and there is no per-row Project lookup. The bulk bar's summaries are
computed from the already-loaded rows. Bulk mutations do a bounded validation read per
selected id (the established pattern for `setPriorityMany` and friends, capped at 100)
and then exactly ONE `D1Database.batch()` — never one request per task.

**Bundle, measured against `main` at `808a9b6`** (`pnpm run build`, byte sizes of
`build/client/assets`):

| | Baseline | V2.2 | Δ |
|---|---|---|---|
| **`entry.client` (the initial bundle)** | 182,542 | 182,542 | **0** |
| All client assets | 2,534,255 | 2,555,588 | +21,333 (+0.84%) |

The **initial bundle is byte-identical**: everything V2.2 adds lands in the lazily
loaded `/tasks` route chunk, the shared task-record chunk and token-only CSS. Nothing
was added to the app shell. (The shared `useCardLongPress` hook does reach the Card,
which the shell does load — its cost is a media-query listener and a timer, and it is
inert unless a consumer supplies `onLongPress`.)

---

## The latency contract (V2.2) — TASKS-09

The V2.2 items above made Tasks correct and direct. This one is why it stops feeling
slow while it is. The decision is
[ADR-086](../decisions/ARCHITECTURE_DECISIONS.md#adr-086-optimistic-presentation-on-task-lists-with-server-authoritative-reconciliation-and-announcement),
and it revises exactly one sentence of ADR-085 §3 for the list surface.

### The rule, in one line

> **Presentation may lead the server. Announcements, Activity and any claim of
> success may not.**

The old rule — *"the loader is revalidated after each change so a row reflects the
server rather than an optimistic guess"* — conflated two questions and paid the
expensive answer for both. What the client SHOWS while a write is in flight, and what
the client CLAIMS happened, are different things; only the second needs the server.

### What did NOT change

Every write still goes where it went. Completion posts `intent=complete`/`reopen` to
`POST /tasks/:taskId`; field changes go to `/tasks/bulk` with a single id; creation to
`/tasks/new`; saved views to `/tasks/views`. There is no list-only mutation path, no
new endpoint, and no client-side task cache. Validation, workspace scoping, atomicity
and Activity are exactly where they were.

### The patch, and why it patches the record

`TaskListItemPatch` (`~/shared/task-record/task-view.ts`) is a narrow partial of
`SerializedTaskListItem` — the fields a row can actually change. `task-optimistic.ts`
holds a map of them keyed by task id and applies them to the loader's own records
**before** `toTaskCardData` runs.

That ordering is the whole design. The strike-through, the state pill, its tone and
the urgency chip are all re-derived by the same pure functions that read the server's
answer, so there is no display value an optimistic row can have and a reconciled one
cannot, and no second derivation to keep in step.

A patch is dropped when fresh loader data arrives, and reverted the instant a write is
refused. **A server grouping's per-bucket count is never patched** — a count is the
server's claim about records the client has never seen.

### The revalidation predicate

`task-revalidation.ts` answers one question from the `TaskViewConfig` alone: *could
this change move the row out of — or reorder it inside — the configuration on screen?*

| Where the sensitivity comes from | Mirrors |
|---|---|
| System view membership | `D1TaskRepository#appendViewClause` |
| Filters | `toWorkspaceFilters` |
| Grouping | `groupDimensionFor` |
| Sort | `D1TaskRepository#workspaceSortSpec` |

`TASK_MUTATION_EFFECTS` maps each canonical intent to what it changes, so a new row
mutation declares its effects in one place. Three deliberate asymmetries:

- **a delete, a restore and every recurrence-series operation always revalidate**,
  because their consequences reach records the client has never seen;
- **an unrecognised intent always revalidates.** Guessing "nothing moved" about a
  write nobody has described is the one wrong direction to guess in;
- **an `updated` sort or an `updatedWithin` filter makes everything revalidate**,
  because every write moves `entities.updated_at`.

A priority change on an unsorted, unfiltered list now revalidates nothing. A
completion under a filter that excludes completed work still does, and
`e2e/tasks-optimistic.spec.ts` asserts the row leaves the view.

**Bulk keeps its unconditional revalidation** — a bulk change is a deliberate
operation over a whole selection whose counts are the server's, and the same commit
clears the selection, so there is no row left for a patch to belong to.

### One request per write

A router fetcher carries one in-flight request per hook instance, and a second
submission supersedes the first. That was invisible while the surface blocked behind
every write and is a lost write the moment it does not — so row mutations go through
`task-inline-edit.ts` (extended with `postTaskBulkAction`) as independent `fetch`
calls. The blanket `disabled` those controls carried while *any* mutation was in
flight is gone with it.

### Confirmation and undo are one affordance

Completion and reopen raise `notifyUndo` **from the server's reply**, and its Undo
posts the inverse canonical intent. The undo window is the notification's own DS-10
timer (paused on hover and focus); no second timer exists. The Undo's own write is not
itself undoable, so there is no chain. A refusal raises `notifyError` with the
server's own wording — the same shape `useCompletionFailureFeedback` uses on Today —
and reverts the row.

Every live-region announcement that existed still exists and still fires on the
server's answer, including the recurrence consequence appended to a completion. The
visible Undo notification remains, but Tasks opts it out of the shared feedback
live-region write because the workspace has already announced the committed outcome.
That closes [DEBT-115](../product/PRODUCT_DEBT.md) without making the Undo less
discoverable.

### "Load more" survives the work done on it

`useTaskPagination` used to reset on the identity of the loader's first page — fresh
JSON on every revalidation — so any mutation collapsed three accumulated pages back to
one. `task-pagination.ts` is now a pure reducer that resets on the **configuration**
alone and merges a refreshed first page into the accumulator **by id**, first
appearance winning.

`initialCursor` seeds the accumulation and deliberately does not reset it: a keyset
cursor is derived from page one's tail, so under any recency-ordered list it moves
whenever a task is captured or completed. Keying the reset on it reintroduced the
defect in a quieter form — 92 accumulated rows fell back to 50 after one capture, in
the browser — before the rule was changed.

### Evidence

- `test/unit/tasks/task-revalidation.test.ts` — what may be skipped, and the longer
  list of what may never be;
- `test/unit/tasks/task-pagination.test.ts` — three loaded pages survive a
  revalidation, and a moved first-page cursor is not a reset;
- `test/unit/tasks/task-optimistic.test.ts` — display state is re-derived from the
  patched record, and a bucket count is not patched;
- `e2e/tasks-optimistic.spec.ts` — the completion POST is held open and the row is
  already struck through with nothing yet announced; Undo restores it; a forced
  refusal reverts and says why; a completion the view excludes still leaves it; and
  accumulated pages survive a real revalidation.

## The redesigned workspace (UIX-01, 2026-08-09)

The `/tasks` surface was **visually** redesigned against a supplied reference
design. No route, no loader contract, no mutation and no view semantic changed;
what changed is the composition, and the changes are recorded here because
several of them moved where an existing command is reached from.

The full pass — including the shell and Today, the design-language decision, the
deliberate departures from the reference, and the before/after evidence — is
[`docs/design/UIX_01_PRODUCT_REDESIGN_2026_08.md`](../design/UIX_01_PRODUCT_REDESIGN_2026_08.md).

### Grouping by due state is the DEFAULT

`default` (All active), `inbox` and `upcoming` now carry `groupBy: "due_state"`
in their built-in definitions, and a bare `/tasks` resolves to the `default`
view's configuration rather than to the kernel's neutral floor — so the address
bar, the tab rail and the list always agree about which view is applied.

`today`, `overdue`, `waiting`, `someday`, `completed` and `deleted` stay FLAT:
each is already one due state, one lifecycle state, or ordered by when it
finished, so banding them by due state produces a single group under a redundant
heading. A saved view stores its own grouping and is unaffected, and
`?group=none` still returns the flat list.

Group headings use `DUE_STATE_GROUP_HEADINGS` — the same buckets and the same
keys as the filter vocabulary, worded for a heading (`TODAY`, not "Due today").

### Where each command moved

Nothing was removed. Several things are reached differently, and any spec or
future surface driving them needs to know which:

| Command | Was | Is |
| --- | --- | --- |
| Complete / reopen a task | a "Complete"/"Reopen" **button** in the row's trailing action rail | the row's leading completion **checkbox**, same accessible name (`e2e/helpers.ts` → `completeTaskRow`/`reopenTaskRow`) |
| Plan for today | a "Today" button in the same rail | the row's overflow menu, and the touch swipe tray |
| Select tasks | a filled button in the pane header | the header's overflow menu (`e2e/helpers.ts` → `enterTaskSelection`) |
| Review Inbox | a filled link in the pane header | the header's overflow menu |
| List / Board / Sectors | a segmented switcher in the pane header | the header's overflow menu (same `?view=` parameter) |
| A row's bulk-selection checkbox | on every row, always | on every row **in selection mode** |
| Priority, planned date, sector, repeat | inline on the row, plus the quick-edit panel | unchanged inline, plus the panel — now labelled "Priority, dates and repeat…" |

### What a row draws, and what it does not

A row is one line: completion circle · title · Project mark and name · due date.

The Project and the date each have a **fixed track**, so both columns start at
the same x on every row whatever the words in them are — without one, a row
reading "2 days ago" pushed the Project mark above it 25px to the left, and a
context column that moves is not a column. Below ~26rem of LIST the tracks go
and the trailing run is pinned to its content width instead, so the title is the
only part that gives way: the date is `nowrap`, so squeezing its box does not
truncate it, it runs over the row's overflow button.

Four things stopped being drawn on every row, and each is the same fact stated
somewhere else on the same row:

- the **urgency chip** — the due date now reads "Yesterday"/"Today"/"Tomorrow"
  in words and takes the state colour when it has slipped
  (`relativeCalendarDate`, `task-view.ts`);
- the **`Planned`/`Unscheduled` status pill** — the presence or absence of the
  planned date beside it. Completed, Cancelled, Waiting, On hold, Someday /
  Maybe and In progress still paint, because for those the pill is the only
  place the fact appears;
- the **planned date when it equals the due date**;
- the **entity glyph** before the title, which said "this is a task" on a page
  of nothing but tasks, next to a check-shaped control that means something.

Three editors follow the absence rule and are revealed on hover or focus (and
are always visible on touch, which has no hover): priority with no priority, a
due date with no due date, a parent with no parent.

### The phone composition

Two bands of chrome above the list, not four:

1. the task count, the header's overflow menu, and "Filter & sort";
2. the view rail, edge to edge, as pill tabs that scroll sideways.

The rail owns its band outright. It shared one with "Filter & sort" first, and
because a scroll port clips at its own edge that sliced the CURRENT tab in half
against the button beside it ("All a…") — the one tab a phone owner must be able
to read. Inside the scroller the rail is also `flex: none`: a shrinkable rail is
sized to what is LEFT after the other-views trigger, stops clipping, and paints
its pills straight over that trigger, which axe reports as an obscured target
and a thumb finds as a mis-tap.

When filters ARE applied the control band takes a full row of its own BELOW the
rail, because a wrapping list of removable chips is not a trailing control — and
because it describes the list, so it belongs against it.

### Evidence

- `e2e/uix-01-screenshots.spec.ts` — the before/after matrix at 1280, 1440 and
  390, in both appearances.
- The TASKS-10 journeys are unchanged in intent and updated only where they
  drove a control that moved.

---

## Offline Task mutation (PWA-12, 2026-08-11)

Tasks is the first — and, for now, the only — module in which a record can be
CHANGED without a connection. The full contract, including storage, ordering,
idempotency and conflict rules, lives in
[`PWA_AND_OFFLINE.md` §15](PWA_AND_OFFLINE.md#15-pwa-12--the-offline-task-mutation-slice);
what follows is what a Tasks implementer needs to know.

### What is offline-capable, and how a control becomes so

Six operations: complete, reopen, rename, priority, due date, planned date. They
are reached through the **ordinary inline controls** — `InlineTaskPriority`,
`InlineTaskDate`, the row's completion checkbox, the row's Rename — because there
is no separate offline editor and no mode to enter.

A control becomes offline-capable by passing an `offline` descriptor to
`saveTaskRecordField` / `saveTaskBulkField`, or by calling
`postTaskRecordActionOffline`:

```ts
await saveTaskBulkField(
  taskId,
  { intent: "set_priority", priority: next },
  { offline: { operation: "set_priority", value: next, baseValue: priority } },
);
```

**Absence is meaningful.** A Task mutation with no `offline` descriptor is not in
the slice: a transport failure on it is reported as an ordinary refusal, exactly as
it was before PWA-12. That is how the slice stays bounded — a Task operation
becomes offline-capable by being described, never by sitting next to one that is.

`baseValue` is the value the surface was showing when the owner acted. It is the
whole of the conflict contract, so a control that omits it makes its own edit
un-arbitrable; the row fields pass their current value.

### Attempt-then-queue, not check-then-decide

`task-inline-edit.ts` always sends the request first and queues only when the
transport fails. Two reasons: the request outcome is the only trustworthy evidence
of reachability (`navigator.onLine` is a hint, never an answer — see
`offline-connection.ts`), and it keeps the ONLINE path exactly the request it always
was, with no probe, no storage read and no queue bookkeeping before the fetch.

An `AbortError` is deliberately not treated as a transport failure: an aborted
request was cancelled by DalyHub itself, and queueing a change the owner may not
have finished making would be inventing intent.

### The online endpoints are unchanged; only replay is redirected

A row's priority still posts to `/tasks/bulk` online — the same atomic authority
the bulk bar uses. Only the OFFLINE REPLAY of that same edit travels through
`/tasks/:taskId`, because a queued intent addresses exactly one Task and the record
route is where one Task's conflict can be arbitrated field by field. Both endpoints
reach the same Task domain; neither is a second authority.

The planned date is the one operation whose replay carries two intents (`plan` and
`clear_plan`) rather than a field write, because `planTask`/`clearPlan` is its
domain authority and is kept strictly separate from the due date (ADR-043 §3).

### Presentation

`pendingTaskStates()` (in `~/shared/task-record/task-pending.ts`) turns the queue
into a `TaskListItemPatch` per Task plus one line of text. The patch is merged into
the SAME map an in-flight online change uses and applied UNDER it — an edit made
since the queue was read is newer than anything in it — so a pending offline row and
a pending online row are painted by the same `applyTaskPatch`, and there is no
display state that only an offline row can have (ADR-086 is unchanged).

The row shows a `task-row-sync` metadata item **only** when something is
outstanding. A Task with nothing queued carries no sync chrome at all.

### Recurrence

The row never computes a successor. Completing a repeating Task offline queues the
completion intent and paints the occurrence as completed-and-pending; the
authoritative TASKS-07 engine runs when the intent replays, and
`useReplayRevalidation()` re-reads the list so the one successor the server created
appears. The client asks; it does not guess.

### What is NOT offline-capable, and why

`set_parent` (Project / Area reassignment) was assessed and deferred: it is the one
supported-looking Task field whose TARGET can cease to exist while the device is
offline — an archived Project, a deleted Area — so its conflict story is different
from "this field moved". Description, delegation, waiting, the recurrence RULE, the
series operations (skip, stop repeating), bulk actions and delete/restore are all
online-only, and each of them says so by simply refusing when the request fails.

Opening a Task's Drawer needs a connection: it reads the full record and its links.
It no longer takes the page down when it cannot — `/tasks`, the app shell and the
root each decline to revalidate for a navigation that only moves the `drawer`
parameter **while the device is offline**, so offline a Drawer open makes no
request at all and the Drawer's own load failure is handled where it happens.
Online the skip does not apply and every navigation revalidates exactly as it did
before; see [`PWA_AND_OFFLINE.md` §15.15](PWA_AND_OFFLINE.md#1515-the-offline-failure-experience)
for the two regressions that scoped it.

---

## Deterministic capture v2 (TASKS-11, 2026-08-11)

TASKS-11 taught the existing parser one new idea — an explicit **after-completion**
recurrence phrase — and closed two arbitrary gaps in the counted-interval grammar. It
added no parser, no recurrence model, no capture backend and no AI. The whole change
is in
[`quick-capture.ts`](../../app/shared/task-record/quick-capture.ts) plus one bound
field on the create route.

### What the grammar gained

| Phrase family | Example | Result |
|---|---|---|
| After-completion interval | `Service Hilux every 6 months after completion` | `month` / `6` / `after_completion` |
| …with the other five suffixes | `… after completed`, `… after completing`, `… after finishing`, `… after I complete it`, `… after I finish it` | the same rule |
| …with a lead-in | `Deep clean the oven repeat every 3 months after completion` | the same rule |
| Counted DAYS | `Water plants every 7 days after completion` | `day` / `7` |
| An interval of one | `Flush the tank every 1 month after completion` | `month` / `1` |

The counted-unit set is exactly the kernel's four countable frequencies
(days · weeks · months · years) and the interval bound is exactly the kernel's 1–99.
There are no parser-specific limits to keep in step with the model.

### Where a phrase is refused

Refusal means the WHOLE phrase stays as ordinary words — never a partially applied
rule, and never a damaged title:

| Input | Why | Title |
|---|---|---|
| `every 999999 months after completion` | outside the canonical 1–99 interval | unchanged |
| `every 3 weekdays after completion` | `weekday` is not a counted frequency | unchanged |
| `every weekday after completion` | the kernel refuses that combination | unchanged |
| `every Monday after completion` | an after-completion rule cannot be weekday-pinned | unchanged |
| `every 6 months after completions` | not one of the six suffixes (the fixed `every 6 months` IS still read) | `… after completions` |

### Ambiguity fails safe

Language DalyHub cannot read with confidence produces an ordinary Task and nothing
else — no invented date, no invented recurrence, and no guessed Project, Area or
Goal. `Regularly check the camper`, `Service Hilux when needed`, `Do this every so
often` and `Do this sometime next month` all create Tasks that keep every word the
owner typed. That is CAPTURE-01's Inbox philosophy applied to grammar: the safe
destination for something we do not understand is the owner's own words.

False positives are the expensive failure, so the parser stays literal. `Discuss
monthly report format`, `Research six month service intervals`, `Write notes about
recurring tasks` and `Review tomorrow's agenda` are untouched: `monthly`, `six` and
`tomorrow's` are not the vocabulary, and a word only leaves the title when it took
part in a complete recognised phrase.

### One parser, every surface

There is one deterministic contract and one place it lives. The Tasks quick-add row,
the global capture panel, `/tasks/new`'s full form, the phone capture sheet, the
CAPTURE-01 HTTP endpoint (and therefore the Apple Shortcut, Siri and the Share
Sheet) and inbound email all call `parseQuickCapture` and, where they submit a rule,
the shared `applyRecurrenceFields`. TASKS-11 therefore improved all of them at once,
and no surface has syntax of its own. `POST /api/capture` gained no recurrence field:
its contract is natural-language capture through the shared parser, so the sentence
is the whole input.

### Authoring the existing model, not another one

The parser produces a `TaskRecurrenceInput` and nothing else. It performs no
recurrence arithmetic, stores no prose, and never re-reads the original sentence
later — successor dates come from `nextTaskOccurrenceDate` exactly as they do for a
rule built in the editor. `test/kernel/task-capture-language.test.ts` proves this
literally: a captured rule and an editor-authored rule are read back from
`task_recurrence_rules` and compared column for column.

There is likewise ONE anchor decision. `resolveCapturedRecurrenceAnchor` decides which
date a recognised rule advances, `applyRecurrenceFields` is a thin FormData writer over
it, and the CAPTURE-01 service calls the same function rather than keeping the copy of
that logic it used to have. A surface therefore cannot disagree with another about what
a captured rule repeats from.

### Evidence

- `test/unit/tasks/quick-capture.test.ts` — the pre-existing grammar, unchanged.
- `test/unit/tasks/quick-capture-after-completion.test.ts` — the TASKS-11 table:
  positive families, the six suffixes and their near-misses, fixed-schedule
  regression, composition with priority and dates, the interval bounds, and the
  negative/ambiguous cases.
- `test/unit/tasks/TasksQuickAdd.test.tsx` — the surface posts `recurrenceMode`.
- `test/kernel/task-capture-language.test.ts` — persistence, structural equivalence
  with the editor, successor computation in both modes, the dropped anchorless fixed
  rule, and the same sentence through `POST /api/capture` in the owner's timezone.
- `e2e/tasks-capture-language.spec.ts` — the browser journey: capture, read the rule
  on the row and the record, complete, and find the successor six months from the
  completion day; plus the fixed-schedule and untouched-sentence regressions.

### Deliberately not added

Ordinal monthly patterns (`first Monday of every month`) are TASKS-12 and were not
given a phrase, because the recurrence model has no ordinal rule for one to author.
Nothing here uses AI, and nothing here proposes: capture creates the Task the owner
described, or it keeps their words.

## The Tasks list after DS-04 (2026-08-14)

DS-04 replaced the generic `Card` on `/tasks` with a product-level task row, and
recomposed the screen around it. Nothing about AUTHORITY changed: the loader, the
single `scope.tasks` query path, the server-authoritative grouping, cursor
pagination and every canonical mutation intent are exactly what TASKS-03/04/09
left. What changed is the anatomy the owner reads.

The design record — the concept comparison, the ten measured differences it was
driven by, and the before/after screenshot set — is
[`docs/design/DS_04_TASKS_REDESIGN_2026_08.md`](../design/DS_04_TASKS_REDESIGN_2026_08.md).

### The components

| Component | Lives in | Owns |
|---|---|---|
| `TaskRow` | `app/shared/task-record/TaskRow.tsx` | one task, as a row: its columns, its completion control, its inline editors, its overflow |
| `TaskList` | `app/shared/task-record/TaskList.tsx` | the shared column grid, the list semantics, the column header |
| `TaskListColumns` | same | the column header on its own, for a grouped view that needs it once |
| `TaskGroup` | same | a server-authoritative bucket: a heading, a count, a rule |

They are SHARED (Today and a Project's task list show the same object and will
adopt them) but DS-04 wires them into `/tasks` alone, so the module being
redesigned is the only one whose rows moved. Today, Projects and search still
render the generic `Card` and are unaffected.

### Row anatomy

```
[✓] Title …………………………………………  ● Project      Due       ● P1     Status   ⋯
```

The order is the concept's, and the priority order is deliberate:

1. **completion** — the leading circle, the frequent act, at the row's start;
2. **title** — the only flexible column (`minmax(0, 1fr)`), so a long title
   truncates inside its track rather than pushing the date column off the edge;
3. **project** — an identity DOT and the name. Never a bordered tile;
4. **date** — ordinary text, in the bounded vocabulary Today already uses
   (`Today`, `Yesterday`, `20 days ago`, `3 months ago`, `Over a year ago`,
   `Thu, 12 Jun`), taking the overdue colour — and no weight step — when it has
   actually slipped. The cell shows the DUE date, or the planned date in italic
   when there is no due date;
5. **priority** — the priority's own coloured dot plus `P1`…`P4`. No container;
6. **status** — the ONE surviving pill, drawn only for the six display states
   nothing else on the row expresses (Completed, Cancelled, Waiting, On hold,
   Someday / Maybe, In progress). `planned` and `inbox` draw nothing, because
   both restate the planned date beside them;
7. **overflow** — one trailing control, revealed on hover or focus, always drawn
   on touch, never removed from the accessibility tree.

### Metadata hierarchy

The title is `--dh-text-row-*` at the ROW weight, not a heading weight. Hierarchy
comes from everything else being quieter — `--dh-text-meta-*` in the muted role —
rather than from the title being louder. That is the rule the pre-DS-04 row broke:
600-weight titles competing with equally saturated pills.

### The pill audit

An ordinary pre-DS-04 row could draw a status pill, a bordered project tile, a
bordered priority box and a recurrence chip. It now draws at most one bounded
coloured container — the status pill — and only when the state is not derivable
from the rest of the row. Recurrence became an icon with its words in the
accessibility tree.

### Inline vs Drawer

**Frequent planning changes inline; deeper record work in the Drawer.**

| Inline, from the row | In the Drawer |
|---|---|
| completion | long description |
| title (Rename, from the overflow) | relationships and links |
| priority | Activity |
| project / Area (and Inbox) | complex recurrence authoring |
| due date | delegation and waiting detail |
| | low-frequency record fields |

Every inline edit posts a canonical intent through `task-inline-edit.ts` and
reports the SERVER's answer. There is no second editor and no list-only mutation.

### Selector interaction

- one selection REPLACES the previous value; there is no clear-then-choose step;
- clearing is a separated command at the foot of the menu ("Move to Inbox",
  "Clear priority"), so an untriaged task never reads as "set to No priority";
- the current value carries a visible tick as well as `aria-checked`;
- options are ONE line at the menu-item rung, so a fifty-candidate project menu
  shows ~14 at a time instead of ~5 and no label wraps;
- the project menu ends with **Search all Projects and Areas…**, which hands off
  to the shared searchable picker over the whole workspace — the bounded option
  set is a fast path, not a claim to be complete;
- placement, viewport collision, the height clamp and the internal scroll are
  `AnchoredSurface`'s, unchanged;
- below `md` every selector is the shared `Sheet`, with 44px rows.

### Mobile adaptation

The row is RECOMPOSED, never squeezed:

```
○  Complete SAF19 issues paper
   ● Work · Today                                    P1
```

The switch is a CONTAINER query on the list's own width, not a window media
query — which is what makes the Board and Time Sectors presentations correct,
since their columns are ~380px inside a 1280px window. Carets are not drawn where
there is no hover to reveal them; the value itself is the target, at the 44px
floor.

### Density

The list declares its density on its own region, from the owner's `?density=`
choice: **Compact** resolves to DS-01's `compact` preset — the rung DS-01 defines
by this exact case — and **Comfortable** to `default`. The default is `compact`.

That plumbing is not cosmetic. The list's first form declared `compact`
unconditionally, which left the still-shipped Comfortable option changing the URL
and the control while every row stayed exactly where it was; a preference that is
visibly inert is worse than one that does not exist.

The row's height is the completion control's 44px target and nothing else, at
either preset; the coarse-pointer floor in `tokens.css` returns every touch
target on a phone, unconditionally.

### What was deliberately dropped

The generic Card's **swipe tray** went with the Card. Nothing became unreachable:
completion is the leading circle, and "Plan for today" is in the row's overflow,
which is reachable by pointer, keyboard and screen reader on every device. A
gesture was always an accelerator over affordances that exist elsewhere.

---

## Checklists (TASKS-13)

> Delivered 2026-08-18. Accepted as
> [ADR-103](../decisions/ARCHITECTURE_DECISIONS.md#adr-103-a-checklist-item-is-not-a-task--one-durable-level-of-ordered-steps-inside-one-task-with-dense-integer-order-no-activity-and-no-automatic-completion-in-either-direction).
> Full record: [`TASKS_13_CHECKLISTS_2026_08.md`](../design/TASKS_13_CHECKLISTS_2026_08.md).

A checklist is the ordered steps inside ONE Task. **A checklist item is not a
Task**, and everything below follows from that.

### The model

`task_checklist_items` (migration 0045): `id`, `workspace_id`, `task_id`
(+`task_type`, so the composite FK asserts the parent really is a Task), `title`,
`position`, `completed`, `created_at`, `updated_at`.

It has no `entities` row, no spine record, no EntityLinks, no Activity of its own
and no route — so it cannot be opened, planned, delegated, filed, filtered,
counted, searched to or completed as a Task. There is no `parent_item_id`: one
level, enforced by the absence of the column.

Bounds: **100 items** per Task (`MAX_CHECKLIST_ITEMS`), **500 characters** per
title (`CHECKLIST_TITLE_MAX_LENGTH`, control characters stripped and internal
whitespace collapsed, because a step is one line).

### Ordering

Read order is `(position, created_at, id)` — total, so the list is deterministic
even if two rows ever shared a position. Positions are dense `0..n-1` after every
mutation; a delete closes the gap in the same transaction.

`position` is deliberately NOT unique: SQLite checks a unique index row by row
rather than at commit, so a constraint would reject the legitimate intermediate
state a reorder passes through.

A reorder submits the WHOLE order and must name exactly the Task's current items.
Anything else is refused with `TaskChecklistItemNotFoundError` and the current
list, so a stale device re-reads rather than half-applying an order nobody chose.

### The five mutations

All on the Task's own route, `POST /tasks/:taskId`:

| intent | fields | notes |
|---|---|---|
| `checklist_add` | `title` | appends at `MAX(position)+1`, resolved inside the insert |
| `checklist_rename` | `itemId`, `title` | writes `title` only |
| `checklist_set_completed` | `itemId`, `completed` (`1` / empty) | writes `completed` only; idempotent |
| `checklist_delete` | `itemId` | removes and closes the gap; already-gone is a no-op |
| `checklist_reorder` | repeated `itemId` | whole order, atomically |

Every mutation proves the item's workspace, its parent Task's workspace and the
authenticated workspace agree, and refuses inside an archived Project. Every
answer carries the WHOLE checklist as the server holds it, so a surface
reconciles rather than accumulating a second opinion. The one client seam is
`app/shared/task-record/use-task-checklist.ts`.

### Completion semantics

- **Ticking every step does NOT complete the Task.** The record says so in words
  when the last box is ticked.
- **Completing the Task does NOT change one item.** No tidying, no hiding.
- **Completing a Task with unfinished steps is allowed, with no confirmation.**
  Reopening restores the Task and touches nothing.

### Recurrence

A recurring Task's successor inherits the checklist STRUCTURE with completion
RESET. It is written inside the existing completion batch at the one recurrence
authority (`#planSuccessor` reads it, `#buildSuccessorGroup` writes it), with
fresh row ids and `completed` hard-coded to `0`, gated on the successor entity
existing. The completed occurrence's checklist is never shared or rewritten, and
undoing the completion withdraws the successor with its clone.

### Project templates (PROJECT-02)

The SECOND consumer of the cloning semantics above, and it obeys them exactly —
migration 0045's own comment already named it as one.

- **Capturing** a Project into a template reads only `title` and the order from
  `task_checklist_items`. The projection does not name `completed` at all, so a
  tick is not merely dropped, it is never read.
- **Instantiating** a template writes `completed` as a SQL LITERAL `0`, so the
  reset is a property of the statement rather than of a value some future caller
  could route through it. Each cloned row gets a fresh id from the repository's
  generator.
- **No shared clone helper was extracted.** The two paths do not share a row
  shape — one reads `task_checklist_items`, the other
  `project_template_checklist_items` — and the only thing a helper would carry is
  a two-line map. What is shared is the SEMANTICS, and they are stated in both
  places and asserted in both suites.
- A template's own checklist rows are NOT `task_checklist_items` and never
  become them: they are copies at instantiation, not the same rows. See
  [ADR-105](../decisions/ARCHITECTURE_DECISIONS.md) and
  [`PROJECT_02_PROJECT_TEMPLATES_2026_08.md`](../design/PROJECT_02_PROJECT_TEMPLATES_2026_08.md).

### Activity

**None.** A checklist tick is state, not history; ten steps would put ten rows
into a timeline that describes commitments. Every mutation bumps the parent
Task's `updated_at`, so "recently updated" stays honest.

### Progress, and its bounds

`TaskRepository.listChecklistProgress(ids)` is the ONLY way a row surface obtains
progress: one indexed, workspace-scoped aggregate per bounded chunk of ids. A
page of fifty Tasks costs the same one statement a page of one does; an empty
page costs none.

**The chunk is 80 because D1 accepts at most 100 bound parameters per query and
the workspace id is one of them.** At 100 the statement failed, and because Today
degrades a failed section the symptom was a day reporting "Nothing planned today"
against thirty-seven planned Tasks. Each surface's progress read is additionally
guarded on its own, so a figure that cannot be read costs the figure and never
the page.

Which surfaces project it: `/tasks` (list and grouped), Today, `/plan`. Which
deliberately do not: the Review Inbox and the guided Review — both are triage
flows whose question is "where does this belong".

### The Task row

One compact value, `2 of 5`, in the shared `TaskRow`'s title cell beside the
repeat mark — a shared capability, so `/tasks`, Today and `/plan` all show the
same figure and none forks the row. Item TITLES are never drawn in a collection,
and an item never gets a selection checkbox.

**The figure stops below `md`.** MEASURED on the same page with and without a
checklist: 44px vs 44px at 1440 and 1280 (it costs nothing), but 100px vs 81px at
393 and 320 before the rule — on a phone the row is two stacked lines and five
characters beside the title wrap it. The record is one tap away.

### Search

`searchTasks` also matches a Task whose CHECKLIST text contains the query, as one
`EXISTS` in the statement it already makes, ranked below every title match. The
result is always the TASK; a checklist item is never a search result.

### Offline

**Ticking and unticking is offline-capable. Adding, renaming, deleting and
reordering are not** (DEBT-160).

The tick is PWA-12's `set_checklist_completed`: the queued record carries
`targetId` (the ITEM), so two ticks on two different steps of one Task are two
changes rather than one field edited twice; the receipt is filed under the item,
so one step's receipt cannot satisfy another's request; and a server change to a
DIFFERENT step merges rather than conflicting. An item deleted elsewhere is
terminal and says which thing went. The other four operations each need a
server-assigned identity or the list's whole current order, neither of which is a
single comparable field.

### Tests

- `test/unit/tasks/task-checklist.test.ts` — the pure rules.
- `test/unit/tasks/task-checklist-query-bounds.test.ts` — the source-level N+1
  and bound-parameter guards.
- `test/unit/tasks/TaskChecklistSection.test.tsx` — the interaction, focus and
  keyboard contract.
- `test/kernel/task-checklist.test.ts` — the storage guarantees against real D1.
- `test/kernel/task-checklist-route.test.ts` — the route and the offline replay.
- `e2e/tasks-checklist.spec.ts` — the journeys, phone, keyboard, axe and offline.

---

## Advanced recurrence and dependencies (TASKS-12)

> Delivered 2026-08-19. Accepted as
> [ADR-106](../decisions/ARCHITECTURE_DECISIONS.md#adr-106-a-task-dependency-is-a-directed-entitylink-not-a-second-join-model--derived-blocked-state-and-cycle--bound-enforcement-inside-the-write)
> (dependencies) and
> [ADR-107](../decisions/ARCHITECTURE_DECISIONS.md#adr-107-advanced-recurrence-widens-a-closed-vocabulary-and-dependencies-are-occurrence-local--one-successor-authority-a-remembered-grid-and-no-relationship-cloning)
> (recurrence, and how the two meet). Full record:
> [`TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md`](../design/TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md).

**Recurrence decides WHEN a Task occurrence exists. A dependency decides WHETHER
an existing Task can proceed.** The two are separate domain concerns and share no
code: nothing in the dependency model mentions a date, nothing in the recurrence
model mentions another Task.

### The advanced recurrence rules

Four additive fields on the SAME structured rule (migration `0047`). Still no
cron, no expression language and no RRULE parser.

| Field | Values | Absent means |
| --- | --- | --- |
| `ordinal` | `first` · `second` · `third` · `fourth` · `last` | an ordinary day-of-month monthly rule (`anchor_day` decides) |
| `weekendRule` | `allow` · `before` · `after` · `skip` | `allow` — every pre-TASKS-12 rule |
| `endsAfterCount` | 1–999 | the series never ends |
| `endsOnDate` | an owner-calendar date, INCLUSIVE | the series never ends |

- **Nth weekday.** `ordinal` plus the single weekday in `weekdays`. There is
  deliberately **no "fifth"**: it exists in only some months, so a rule naming one
  needs a silent fallback nobody chose. `last` is computed backwards from the
  month's final day, which is what makes it right in a 28-day February, a 29-day
  leap February and a 31-day January with no special case. `anchor_day` stays
  populated (migration 0024's CHECK requires it) and is ignored by the arithmetic.
- **Multiple weekdays.** Mon/Wed/Fri is ONE rule and ONE series — never three.
- **End conditions** are mutually exclusive, and the **current occurrence
  counts**: occurrence number is `sequence + 1`, so a successor exists only while
  `sequence + 2 <= endsAfterCount`. "Ends after 1" means this one and no more.
  `endsOnDate` is inclusive and is compared against the date the occurrence
  actually falls on, after the weekend rule.
- **The weekend rule** is four OUTCOMES, never a `skip weekends` flag — the phrase
  means three different things in three different products. Offered only for
  weekly, monthly and yearly rules. A moved occurrence records its UNADJUSTED grid
  date in `series_anchor_date` (TASKS-07's field), so the routine cannot drift.
  Two rules are refused at the boundary because they would produce nothing at all:
  a weekly rule falling only at weekends under `skip`, named explicitly or implied
  by the Task's own anchor date.

**One authority.** `planNextTaskOccurrence(rule, series, gridAnchor, ownerDay)`
decides whether the series continues AND where, and returns `null` when it has
ended — an ordinary outcome. Completion is its only caller. Today, Planning, the
Tasks list, the dependency code and every UI component compute nothing.

**Skipping** an occurrence honours the weekend rule and is REFUSED when it would
step past `endsOnDate`; it consumes no sequence, so a count condition is
unaffected.

### Dependencies

**One directed EntityLink, `blocker --task.blocks--> blocked`. No new table.**
The type is RESERVED to the `TaskRepository`, exactly as `task.waiting_on` is, so
the generic link picker cannot create one.

| Invariant | Enforced by |
| --- | --- |
| No cross-workspace edge | the composite endpoint foreign keys (migration 0003) |
| No self-dependency | the schema CHECK **and** the kernel validator |
| No duplicate edge | the UNIQUE identity index, which also gives one stable id across remove/re-add |
| Task-only endpoints | a predicate inside the write |
| At most 20 blockers, 20 blocked | counts inside the write |
| No cycles, at any depth | a bounded recursive CTE inside the write |

Every check is a PREDICATE INSIDE THE WRITE, never a read-then-decide, so two
concurrent adds cannot both pass a bound and two concurrent edges cannot close a
cycle. The cycle walk carries an explicit `depth < 64` and uses `UNION`, so it
terminates even on a graph that already contained one.

Two requests adding the SAME edge at once is the one race a predicate cannot see:
both read "no row" and the second meets the UNIQUE identity index. It is
RECONCILED to an idempotent no-op — one row, one Activity entry, exactly one
request reporting a change — rather than surfaced as a storage error.

**Blocked is DERIVED on every read** from the edges plus each blocker's own
completion. There is no `is_blocked` column: completing the last blocker unblocks,
**reopening** it blocks again, and a soft-deleted blocker stops blocking — with no
reconciliation job and nothing to go stale.

**A dependency never moves the owner's plan.** No date, priority, status or
completion changes on either Task — including a blocked Task due before its
blocker, which is exactly what a "helpful" scheduler would silently repair. Nor
does it prevent completion: blocked says what should happen first, not what the
owner may do.

### Deleted blockers

| Blocker | Blocks? | Edge survives? |
| --- | --- | --- |
| Open | **yes** | yes |
| Complete | no | yes (history is not rewritten) |
| Soft-deleted | no | **yes** — restoring the Task restores the dependency |
| Permanently destroyed | n/a | impossible (`ON DELETE RESTRICT`) |

### Where recurrence and dependencies meet

**Dependencies are OCCURRENCE-LOCAL and are never copied to a successor** — in
all three cases (recurring blocker, recurring dependent, both recurring). An
occurrence that does not exist yet is a prediction, not work, and the only
available mappings between two independent series are "by date" (wrong when
either is completed late) and "by sequence" (wrong when either is skipped). A
successor arrives with no dependencies, exactly as it arrives with no waiting
state and no delegation. A series that ENDS creates no successor and therefore no
edge to one.

TASKS-13's checklist contract is preserved under every new rule: a successor
inherits titles and order with fresh ids and completion reset, and a completion
that creates NO successor writes no checklist rows either.

### Blocked on the surfaces

`blocked` joins the ONE display-state precedence evaluator (ADR-043 §6) between
Waiting and On hold, taking the WAITING tone — no new colour, because blocked is
a workflow state, not an error.

The shared Task row draws ONE blocked label and it says why: **"Blocked by Get
director approval"**, or **"Blocked by 2 tasks"** when naming one would be a
half-truth. It REPLACES the status pill rather than joining it, sits on the
title's own line (measured: no extra height at 1440/1280/820, one line at
393/320), and — unlike the checklist figure, which stops below `md` — is drawn at
every width including the phone.

| Surface | Behaviour |
| --- | --- |
| `/tasks` | The blocked line, plus a `blocked` filter (`?blocked=1` / `?blocked=0`) on the existing declarative vocabulary — not a new view |
| Today | A blocked Task planned for today STAYS there and says why. Never hidden |
| `/plan` | The same. Planning is intent, not proof of executability; nothing is auto-rescheduled |
| Projects | The same state through the same evaluator. Project progress is unchanged — a blocked Task is an open Task, and there is no dependency-weighted progress |
| Search | Unchanged. A dependency is not a record and has no route |

### Activity

`task.dependency_added` and `task.dependency_removed`, each naming the blocked
Task (`subject`) and the blocker (`blocker`). There is **no `task.blocked` and no
`task.unblocked`**: a Task becoming unblocked is a consequence of
`task.completed` on another Task, which the timeline already records, and writing
derived facts into an append-only log leaves history able to disagree with the
data it came from.

### Notifications

None. No "now unblocked", no "blocker overdue", no dependency reminders —
deliberately deferred as a separate product decision about the owner's attention.

### Offline

**Blocked state is carried by the offline snapshot, derived server-side. Adding
or removing a dependency, and editing a recurrence rule, require a connection**
(DEBT-170).

A dependency's outcome is a property of the GRAPH at the moment of the write —
only the server knows whether an edge closes a cycle or meets a bound — so a
queued dependency would be an intent the device cannot evaluate and might have to
withdraw. Completing a blocker offline still queues (PWA-12), which leaves a
documented temporary state: the device knows the blocker is done while the server
does not, so the dependent may still read as blocked until the completion
replays. That is server truth arriving late, not a wrong answer.

### Query bounds

| Read | Cost |
| --- | --- |
| One Task's dependencies, BOTH directions, with titles and completion | ONE statement |
| A page's blocked state | ONE statement per chunk of 80 ids |
| The `blocked` filter | a correlated `EXISTS` in the page's own statement |
| An empty id list | ZERO statements |

80 rather than 100 because this aggregate binds the workspace id AND the link
type before the ids, and D1 accepts at most 100 bound parameters.

### Tests

- `test/unit/tasks/task-recurrence-advanced.test.ts` — the calendar arithmetic.
- `test/unit/tasks/task-dependency-query-bounds.test.ts` — the source-level N+1,
  bound-parameter, bounded-walk and in-write-guard assertions.
- `test/kernel/task-recurrence-advanced-storage.test.ts` — the rules through real
  D1, including the end conditions under concurrent completion.
- `test/kernel/task-dependencies.test.ts` — the graph guarantees against real D1.
- `test/kernel/task-dependencies-recurrence.test.ts` — the interaction, in all
  three cases.
- `test/kernel/task-dependency-route.test.ts` — the route, its refusals and the
  advanced recurrence fields at the trusted boundary.
- `e2e/tasks-dependencies.spec.ts` — the journeys, every surface, phone, keyboard
  and axe.

---

## History answers by completion time (V2.7 RECALL-02, 2026-08-31)

**"What did I complete yesterday?" is a control, not an archaeology dig.**

[DEBT-230](../product/PRODUCT_DEBT.md) recorded two halves of one gap: no
completed-date sort or window existed anywhere, and the Completed system view
promised "most recent first" while sorting `updated` — edit time — so a Task
completed last week and retitled today led the list. Both halves are closed here.

### The one completion-time authority

**`spine_records.completed_at`, and nothing else**
([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine)
decision 4). It already carries the product's completion semantics, and those
semantics are exactly what makes it the honest answer:

- a recurring occurrence keeps **its own** `completed_at` while its successor is a
  new, incomplete record — so the occurrence is in the window and the successor is
  not;
- reopening a Task **clears** it (and withdraws an untouched successor) — so a
  reopened Task honestly stops counting as completed, with nothing to reconcile.

The Activity `task.completed` event remains the **audit trail** and is never a
query authority for this question. It survives a reopen, so counting from it would
report work the owner has explicitly un-finished. There is no second completion
timestamp, no backfill column and no duplicated completion state anywhere in this
capability.

### The vocabulary

One sort and three filter dimensions, all in the ONE declarative
`TaskViewConfig` — nothing here is a private route state, a second date-filter
system or a repository field name:

| Name | Shape | Reads |
| --- | --- | --- |
| `sort=completed` | A `TaskSort` member | `COALESCE(sr.completed_at, <sentinel>)`, naturally DESC |
| `completedWithin` | The existing `TaskRecencyWindow` grammar (`1d`/`7d`/`30d`/`90d`) | `sr.completed_at >= <instant>` |
| `completedFrom` | Owner-calendar `YYYY-MM-DD` | `sr.completed_at >= <instant>` |
| `completedTo` | Owner-calendar `YYYY-MM-DD`, INCLUSIVE | `sr.completed_at < <instant of the next day>` |

The window grammar is `createdWithin`/`updatedWithin`'s, reused verbatim; the
from/to pair is `dueFrom`/`dueTo`'s, reused verbatim. `completed` (the VISIBILITY
dimension) keeps its own meaning and its own parameter name beside them — it
decides whether finished work is *shown*, these decide *when* it was finished —
which is why the window parameter is `completedWithin` rather than an overload.

Every one of them is server-side, URL-backed, bound into the pagination cursor
(`kw` / `kf` / `kt` in the filter signature) and expressible in a saved view by
construction, exactly like every dimension before it.

**The never-completed sentinel flips with the direction.** An empty string sorts
below every ISO timestamp and `￿` above every one, so a Task with no
completion is last under both `asc` and `desc` — the same rule the `parent` sort
uses for unparented Tasks, and for the same reason: reversing an order must never
promote "not finished" to the head of a list of finished work.

### Owner-day boundaries

`completed_at` is a **UTC instant** in storage; "yesterday" and "this week" are
the **owner's**. So every bound is an owner-calendar day converted ONCE, outside
SQL, by `ownerDayStartInstant` — the same HARDEN-06C helper the created/updated
windows use. There is no second timezone helper and no UTC-day assumption:

- `completedFrom` binds the instant the owner's *from* day begins;
- `completedTo` binds the instant the owner's day AFTER *to* begins, compared with
  `<`, so a completion at 23:50 owner-local on the closing day is inside the
  window;
- `completedWithin` binds the start of `recencyWindowStart(todayIso, window)`.

"This week" additionally uses the owner's **first day of the week**, through
`planningWeekStart` — the product's one answer to where a week begins
(DEBT-152/DEBT-154). A Sunday-start owner and a Monday-start owner asking on a
Sunday are asking about two different weeks, and both are right.

### The entry points

"What did I complete yesterday?" is answerable in **no more than two
interactions from anywhere**:

1. **Palette → "Completed yesterday"** (or "Completed this week"). A command
   contribution is a static route string and "yesterday" is not a static date, so
   the target is `/tasks/completed/:window` — a route that owns no query and no
   component, resolves the owner's day and week start server-side, and
   **redirects** into `/tasks?system=completed&sort=completed&completedFrom=…&completedTo=…`.
   The address bar therefore ends up holding an ordinary configuration: shareable,
   saveable as a view, and adjustable with the ordinary controls. (A *rewrite*,
   the `/inbox` and `/upcoming` pattern, would have kept the resolved window
   hidden; those routes are sidebar PLACES, this is a question.)
2. **Tasks → Completed → the "Completed" window control**, which offers the same
   closed recency vocabulary Created and Updated offer.

The explicit `completedFrom`/`completedTo` pair has no control of its own, for
the reason `dueFrom`/`dueTo` has none: it is a specific window rather than a
closed option set, and it travels in the URL, in a saved view and from the
palette.

### The Completed system view

Its config is now `{ systemView: "completed", sort: "completed" }` and its
sentence reads **"Finished work, most recently completed first."** — the word
"recent" was the ambiguity, so the view says which recent it means. Filtering and
ordering agree because both read the one authority; reopening removes a Task from
the window on the very next query; a recurring successor never appears merely
because its predecessor completed.

No productivity score, no streak, no weekly grade and no completion heat-map: the
same refusal [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md) makes, unchanged.

### Analytics parity

The completed-trend panel's "Tasks completed" metric used to link to a bare
`/tasks?system=completed` — the whole of the workspace's finished work, ordered by
EDIT time, under a figure describing one period. Two questions, one link. It now
carries the range's own span as the completion window plus the completion sort,
built by `completedRangeTasksHref` in `~/kernel/task-views` — the one place a
surface outside the Tasks module is handed a completion-window destination, and
asserted equal to `paramsFromConfig`'s own output so the two layers cannot drift.

**And the FIGURE converged with it, not only the link.** The metric used to be
counted from the Activity stream (`countPeriodCompletions`), which counts
`task.completed` EVENTS — and an event outlives the state it recorded. A Task
completed inside the period and later reopened still counted; so did one that was
completed and then deleted (HARDEN-06C F-07 removed that read's liveness
predicate deliberately). So a card saying "6 Tasks completed" opened a list
holding four, in two entirely ordinary lifecycle cases. The figure's own contract
on this surface is that *"each figure links to the records behind it so a doubted
number can be checked"*, and a number whose evidence is shorter than itself
breaks it.

`TaskRepository.countCompletedTasksInWindows` is the read that fixes it: **one
statement**, one `SUM(CASE …)` column per window over
`spine_records.completed_at`, under exactly the predicate the Completed
collection applies (this workspace, `kind = task`, a live entity). Analytics uses
it for the "Tasks completed" figure, its previous-period comparison and the trend
line beneath it — so the card, the chart and the linked list are one population,
and reopening or deleting a Task moves all three together.

**Projects and Goals keep `countPeriodCompletions`, and the Review is
untouched.** Both reads are correct; they answer different questions. "How many
completion events happened that week" is immutable history and is the right
answer for a Review's stored snapshot facts — HARDEN-06C's reasoning stands where
it was made. "How much am I currently recorded as having finished in that period"
is the question a live, linkable figure asks, and only that one has a list
standing behind it as evidence. Converging the Review's own period facts onto the
completed window is [RECALL-04](../roadmap/ROADMAP_V2_7.md)'s, not this item's.

Parity is asserted as **machine values**: the count Analytics states for a period
equals the number of records the linked Tasks view returns for that same period,
compared as numbers rather than sentences — over a fixture that deliberately
contains a reopened Task and a soft-deleted completed one. The divergence is
asserted too: the same fixture read through `countPeriodCompletions` returns
`expected + 2`, which is what makes the choice of authority a test rather than a
preference (`test/kernel/recall-02-completed-time.test.ts`).

No new metric was added and the page's query budget is unchanged — eight grouped
statements, every time. RECALL-02 changed *which authority* the completion read
consults, never how many reads there are: Projects and Goals no longer need a
per-bucket call, because the trend draws Tasks alone.

### Performance, and the index decision

The sort is **one more `ORDER BY` arm** over the collection's existing statement —
`spine_records` is already joined (the `smart` order reads `sr.completed_at`), so
nothing new is joined, selected or counted. Measured over real D1
(`test/kernel/recall-02-completed-time.test.ts`):

| Query | Statements | Binds |
| --- | --- | --- |
| `sort=updated`, no window (the baseline) | 1 | *n* |
| `sort=completed`, no window | 1 | *n* |
| `sort=completed` + `completedFrom`/`completedTo` | 1 | *n* + 2 |
| `sort=completed` + `completedWithin` | 1 | *n* + 1 |

**No index was added, and the measurement is why.** `EXPLAIN QUERY PLAN` over the
real generated SQL (40 Tasks, half completed, local D1, 2026-08-31):

- `sort=completed` with no window plans **identically to the `updated`
  baseline** — driven from `entities_active_workspace_type_created_idx`, with
  `spine_records` reached by its primary key and a temp B-tree for the ORDER BY.
  No regression to answer.
- `sort=completed` **with** the window flips the planner to
  `SEARCH sr USING INDEX spine_records_workspace_kind_completed_idx (ANY(workspace_id) AND ANY(kind) AND completed_at>? AND completed_at<?)`
  — a bounded index range, with `entities` then joined by
  `entities_workspace_id_type_key`. The index migration **0038** already added
  (`spine_records (workspace_id, kind, completed_at)`) serves this read, exactly as
  its own comment predicted it would: *"it serves any future 'what was completed
  between these instants' read as well."*

So the roadmap's candidate `spine_records(workspace_id, completed_at)` is a
near-duplicate of an index that already exists and is already chosen. At
single-owner scale the leading `ANY(workspace_id)` skip-scan degenerates to a
direct range over the one workspace, and a second index would cost write
amplification on every completion for no measured read. **Decision: ship no
migration.** The falsifier is written down rather than left implicit: if a plan on
a real workspace ever shows this read falling back to a scan of `entities`, the
decision reopens with that evidence.

### Tests

- `test/unit/tasks/completed-time-vocabulary.test.ts` — the sort and the three
  dimensions in the one vocabulary, the Completed view's sentence, the URL round
  trip, the hostile-URL degradation, the named windows' owner-day/owner-week
  arithmetic, and the Analytics link's equality with the Tasks URL codec.
- `test/kernel/recall-02-completed-time.test.ts` — over real D1: the
  completed-then-edited order truth (with the `sort: "updated"` inversion asserted
  beside it), the 23:50 owner-local boundary and the same instant under another
  zone, the owner's week, reopen, recurrence, keyset pagination past one page with
  tied `completed_at` values, workspace isolation, the saved-view round trip,
  Analytics machine-value parity, and the statement/bind budget.
- `e2e/recall-02-completed-time.spec.ts` — two interactions from anywhere at
  desktop and 393 px, the ordinary round-trippable URL, the Completed view's order,
  the window control in the ordinary sheet, and axe.
