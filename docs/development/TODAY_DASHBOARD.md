# Today Dashboard (TODAY-01)

The first genuinely useful DalyHub screen: the calm place the owner lands
every morning. It is **not** a reporting dashboard — it is Linear/Things/Craft
calm, focused and minimal, and it is composed **entirely** from the shared
design system (PX-02 frame + DS-01…04/07). There is no new visual language, no
new shared pattern, no new dependency and no migration; TODAY-01 is the first
product *consumer* of the frame the earlier items built.

Governed by [`AGENTS.md`](../../AGENTS.md), the pattern contracts in
[`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) and the composition/feel contract
in [`PRODUCT_EXPERIENCE.md`](../design/PRODUCT_EXPERIENCE.md).

## Where it lives

```text
app/modules/today/
  module.ts            — the module manifest (id "today", order 5, routes,
                         no entity type — Today is a view, not an entity)
  routes.manifest.ts   — the declarative /today route + the TODAY-02 task
                         resource routes (no nav entry)
  routes/index.tsx      — the route: loader (real focus tasks + date) + DrawerProvider
  routes/task-detail.tsx     — TODAY-02/03: the task loader + mutation action
                               (update/complete/link + waiting intents)
  routes/task-activity.tsx   — TODAY-02: the task's DS-05 Timeline page
  routes/task-link-targets.tsx — TODAY-02: the "related records" target search
  routes/task-waiting-targets.tsx — TODAY-03: the waiting-target entity search
  routes/waiting.tsx         — TODAY-03: the /today/waiting collection view
  routes/plan.tsx            — TODAY-04: the bulk/quick planning endpoint (action)
  TodayDashboard.tsx   — the pure composition of the sections (planning + Waiting +
                         fixtures, the planning summary, multi-select bulk bar)
  task/planning-view.ts      — TODAY-04: the pure planning view-model (buckets,
                               summary, date arithmetic, target dates)
  task/TaskPlanningSection.tsx — TODAY-04: the Task Drawer Planning section
  TodayDrawer.tsx      — maps a drawer key → a record (task → TaskDrawerContent)
  task/                — TODAY-02/03: the task record composition (view-model,
                         TaskDrawerContent, Details/Links/Activity tabs,
                         TaskWaitingSection, waiting-view)
  fixtures.ts          — demo data for the non-task sections (+ the focus seed shape)
app/styles/today.css       — TODAY-01 layout/rhythm, every value a DS-01 token
app/styles/task-drawer.css — TODAY-02 task-record layout, every value a DS-01 token
```

## Composition

The surface is a pure function of typed data. The route's loader formats the
current date and reads the in-memory fixtures; `TodayDashboard` receives them as
props and owns only optimistic, in-memory UI state (which focus tasks are ticked,
the quick-capture draft).

- **Frame.** The PX-02 [`CollectionLayout`](../../app/shared/collection-layout)
  owns the sticky **Pane Header** (title `Today`, subtitle = the date, one accent
  primary action **Quick capture**) and the pane's scroll + state precedence.
- **Date.** The subtitle is the owner's *calendar* date, formatted in the owner's
  timezone (`Australia/Sydney`, `en-AU`) by [`date.ts`](../../app/modules/today/date.ts)
  — not the UTC Worker runtime, which would show the previous day during the
  Australian morning. This becomes a user/workspace timezone setting at SET-01.
- **Never blank.** This is a multi-section surface, not a single filtered
  collection, so it does **not** gate itself behind the CollectionLayout empty
  slot (that would unmount Quick Capture when every data section is empty and
  strand a first-time owner). Each section renders its own gentle empty note, so
  nothing is ever blank, and Quick Capture is always mounted and usable.
- **Sections.** Six vertical `section`s, each a labelled region with a quiet
  `xs`-muted section label:

  | # | Section | Shared parts | Notes |
  |---|---|---|---|
  | 1 | Today's focus | DS-04 Card (list, compact) | optimistic complete/reopen quick action |
  | 2 | Upcoming | DS-04 Card (list) | meetings/reminders/deadlines, sorted by `sortKey` |
  | 3 | Continue working | DS-04 Card (grid) | area badge · status badge · rolled-up progress · **PROJ-02 health cue (only when attention is needed)** |
  | 4 | Recent notes | DS-04 Card (list) | title · snippet (subtitle) · last-edited (date) |
  | 5 | Daily timeline | token-only list | a simple day schedule (see below) |
  | 6 | Quick capture | native field + button | structure only — nothing is saved |

- **Records open in place.** Every card provides both a shareable drawer deep
  link (`href`) and an in-app open (`onOpen`), so activating a card opens the
  **DS-03 Drawer** hosting a read-only **DS-02 Record Layout** — the canonical
  `Card → drawer key → renderDrawer → RecordLayout` chain. The Card never owns
  drawer state; `TodayDrawer.ts` maps `<kind>:<id>` keys to fixtures and returns
  `null` for an unknown/stale key (the Drawer's graceful not-found panel).

### Project health on "Continue working" (PROJ-02)

Since PROJ-02, the "Continue working" cards carry the **same** derived project-health
model as `/projects` (`app/shared/project-health`, [ADR-035](../decisions/ARCHITECTURE_DECISIONS.md#adr-035-project-health--a-derived-non-persisted-signal-over-the-spine-tasks-and-activity))
— never a Today-only calculation. To keep the calm dashboard uncluttered, the health
pill is shown **only when a project needs attention** (`at_risk`/`blocked`/`stale`);
on-track projects show nothing extra. The loader gathers the facts for those bounded
projects in the same N+1-free read and evaluates with the owner-calendar clock; no
other Today section is changed.

## The Task Drawer (TODAY-02)

TODAY-02 makes a task a **complete, editable, persistent record** opened in the
shared DS-03 Drawer on `/today`, composed entirely from the shared layer (ADR-028):

- **Persistence.** The FND-07 spine stays authoritative (identity, title,
  completion, parentage). One additive `task_details` table (migration `0006`) and
  a workspace-bound `TaskRepository` (`app/kernel/tasks` + the D1 adapter, exposed
  on `WorkspaceScope.tasks`) own the additive fields — workflow `status`
  (`todo`/`in_progress`; "done" is derived from spine completion), `priority`,
  `due`/`scheduled` dates and a Markdown `description` — and read the whole task
  back as one `TaskView` with **derived, real** project/goal/area relationships.
  `updateTask` is one atomic batch with a `changes()`-guarded `entity.updated`
  event (the shared Activity model — no second history table). Completion stays
  `spine.complete`/`reopen`.
- **The Drawer body** is the DS-02 Record Layout: Header (title, derived status
  pill, task identity) · Summary (completion control + due/scheduled/priority +
  project/goal/area) · tabs **Details** (DS-06 `useForm` edit: title, status,
  priority, dates, Markdown description; explicit Save/Cancel; server-authoritative
  validation; `UnsavedChangesGuard` wired to the Drawer key) · **Links**
  (relationships + the DS-06 entity-link picker for `task.relates_to`) · **Activity**
  (the DS-05 `Timeline` over `activity.listForEntity`) — Activity last.
- **Data flow.** `TodayDrawer.tsx` maps a `task:<id>` key to `TaskDrawerContent`,
  which loads/mutates the task through three module-owned resource routes
  (`/today/task/:id` loader+action, `/activity`, `/link-targets`) using the trusted
  `resolveAuthenticatedWorkspaceScope` boundary; a successful mutation revalidates
  the `/today` loader so Today and the Drawer stay consistent with no hard reload.
- **Today focus is now real.** The `/today` loader reads open+completed tasks via
  `tasks.listTasks`; a focus-card completion writes through the same task action.
  The other five sections remain fixture-backed (the preserved seam).

## Waiting (TODAY-03)

TODAY-03 makes **"waiting for"** a real, persistent workflow — a task blocked on
someone or something else — composed entirely from the shared layer and composing
the TODAY-02 task slice (ADR-029). It adds no second store, Drawer, form, timeline
or link system.

- **Storage.** Migration `0007` adds two additive nullable columns to
  `task_details`: `waiting_since` (an ISO timestamp — the single authority for "is
  waiting" and since-when; NULL = not waiting) and `waiting_note` (a free-text
  subject). An entity-backed subject is a **reserved `task.waiting_on` EntityLink**
  (Person/Project/Goal/Area/Task), resolved live to its current title like the
  structural parent — never a copied label. The subject is EXACTLY ONE of a note
  XOR an entity link. A partial unique index enforces one active `task.waiting_on`
  per task; a partial index backs the collection query.
- **Authority.** The `TaskRepository` owns waiting atomically — `setWaiting`,
  `clearWaiting`, `listWaitingTasks` — each writing the state, replacing/clearing
  the link and appending exactly one guarded Activity event in ONE
  `D1Database.batch()`, exactly as the SpineRepository writes structural links.
  `task.waiting_on` is reserved (`RESERVED_TASK_LINK_TYPES`) so the generic
  EntityLink repository refuses it and the TaskRepository stays the sole writer.
- **Semantics.** One active waiting state and one primary subject; changing the
  subject preserves the original `since`. Completing a task **clears** waiting;
  reopening does NOT restore it. A deleted/unlinked target degrades to an
  unresolved subject. Cross-workspace targets, non-task anchors, the self-target
  and disallowed types are rejected server-side; no-op and rejected mutations
  append no Activity.
- **Completion is atomic.** Completing a task AND clearing its active waiting
  state is ONE task-domain operation, `TaskRepository.completeTask(taskId)`: a
  single `D1Database.batch()` writes the spine completion, clears
  `waiting_since`/`waiting_note`, soft-deletes the active `task.waiting_on` link,
  and appends `task.completed` plus — only when the task was waiting — one
  `task.waiting_cleared` event. Either everything commits or nothing does, so a
  task can never be left completed-but-still-waiting (ADR-029 §29.4a). The FND-07
  spine stays the completion authority (the completion write is the shared spine
  statement builder); the route calls this ONE operation, never
  `spine.complete()` + `tasks.clearWaiting()` as two transactions.
- **Display.** Waiting is a derived first-class state — precedence
  completion → waiting → open-state status — so `status` (`todo`/`in_progress`)
  and completion can never visibly contradict.
- **Task Drawer.** A **waiting control** lives in the DS-02 Summary beside
  completion ([`TaskWaitingSection.tsx`](../../app/modules/today/task/TaskWaitingSection.tsx)):
  a calm read-only state ("Waiting for X · Since 18 Jul 2026 · 3 days") and an
  explicit-save editor with two modes — a DS-06 async `SelectField` picker over the
  waiting-target search, or a free-text `TextField` — with server-authoritative
  validation. It posts `set_waiting`/`clear_waiting` intents to the existing
  `/today/task/:id` action.
- **The Waiting view.** [`/today/waiting`](../../app/modules/today/routes/waiting.tsx)
  is a real registry route under Today (no separate sidebar module). It composes the
  PX-02 CollectionLayout + DS-04 Cards and opens tasks in the SAME DS-03 Drawer, so
  opening a waiting task keeps the owner on `/today/waiting`. Ordering is
  deterministic: **overdue → longest-waiting → due date → id.** Bounded query.
- **Today integration.** A quiet **Waiting summary** section (count + a small
  preview + a link to `/today/waiting`) appears only when something is waiting;
  waiting tasks are **excluded from the focus** list (blocked work is not ordinary
  active focus). An "Open Waiting" navigation command is registered.
- **Activity.** Three new types (`task.waiting_started`, `task.waiting_changed`,
  `task.waiting_cleared`) are registered on the **tasks** module manifest with DS-05
  Timeline descriptors. Payloads are structured and safe; free-text content is never
  logged.

## Planning (TODAY-04)

TODAY-04 turns Today into a deliberate **planning workspace** — the owner decides
what to do today, what can wait, and what moves to another day — composed entirely
from the shared layer and composing the TODAY-02/03 task slice (ADR-030). It adds no
migration, no second store and no second planning model.

- **The model.** Planning EXTENDS the existing `task_details.scheduled_date`
  (ADR-028): the scheduled date IS the owner's commitment ("I intend to work on this
  today"), kept strictly distinct from the due date ("must be finished by").
  Planning never touches the due date, the waiting state or completion.
- **Authority & atomicity.** The `TaskRepository` owns planning atomically:
  `planTask`/`clearPlan` (single) and `planTasks`/`clearPlans` (bulk). Each writes
  ONLY `scheduled_date` in ONE `D1Database.batch()` and appends exactly one guarded
  Activity event — `task.planned` (was unplanned), `task.rescheduled` (moved) or
  `task.plan_cleared`. No-ops append nothing. **Bulk is atomic:** every id is
  resolved first and any missing/cross-workspace id rejects the WHOLE operation, so
  nothing is partially applied; tasks already on the date count as `unchanged`.
- **Sections.** A pure, tested view-model
  ([`planning-view.ts`](../../app/modules/today/task/planning-view.ts)) buckets tasks
  by their scheduled date relative to the owner's calendar day into **Overdue**
  (slipped plans), **Today** (the day's commitment), **Upcoming**, **Anytime** (the
  unscheduled backlog to plan from) and a collapsed **Completed today**. Waiting
  tasks are excluded (blocked work is not planned work); a task completed on a prior
  day appears in no section.
- **Summary.** A calm planning summary (planned · overdue · waiting · completed
  today) gives operational awareness — no charts, no analytics.
- **Plan actions.** Each DS-04 card carries contextual plan quick actions (Plan
  today / Tomorrow / Clear). Multi-select drives a **bulk action bar** in the PX-02
  CollectionLayout selection slot (Plan today / Tomorrow / Next week / Clear plan /
  inline custom date). The DS-02 Task Drawer gains a **Planning section**
  ([`TaskPlanningSection.tsx`](../../app/modules/today/task/TaskPlanningSection.tsx))
  showing Scheduled + Due and the full quick actions with an inline DS-06 date
  control — no modal-in-modal.
- **Routes.** Single-task planning posts `plan`/`clear_plan` intents to the existing
  `/today/task/:taskId` action; bulk + per-card planning posts to the new action-only
  [`/today/plan`](../../app/modules/today/routes/plan.tsx) resource route.
- **Keyboard.** Planning is exposed as shared contextual commands while a task's
  Drawer is open — "Plan for Today" (`P`), "Move to Tomorrow" (`Shift+P`), "Clear
  plan" — with shortcut metadata, driving the same mutation path as the cards and
  bulk bar. The full palette + global dispatch remain TODAY-05's (architecturally
  ready here).
- **Activity.** Three new `task.planned`/`task.rescheduled`/`task.plan_cleared`
  types are registered on the **tasks** module with DS-05 Timeline descriptors.
  Payloads carry only the non-sensitive calendar dates; no free text, no second
  history model.
- **Rules (regression-tested).** Planning never changes due dates; planning never
  restores waiting; planning never affects completion; bulk planning is atomic;
  cross-workspace ids are rejected.

## Keyboard workflow (TODAY-05)

TODAY-05 makes Today fully operable without a mouse, composed entirely from the
DS-09 command system, the shared Drawer/Feedback machinery and the TODAY-02/03/04
task routes (ADR-031). It adds no second command registry, no second palette, no
Today-only keyboard engine and no scattered document listeners.

- **One dispatcher.** The single shared shortcut dispatcher (`useCommandShortcuts`,
  installed once by `CommandShortcutLayer`) now also dispatches **contextual `run`**
  shortcuts globally — the DS-09 deferral that DS-10's Feedback platform unblocked.
  So `P` / `Shift+P` / `C` fire against the focused task and the palette advertises
  those hints. The editable-control boundary (`input`/`textarea`/`select`/
  `contenteditable`/form controls) and the modifier-exact matching are the
  dispatcher's existing contracts, reused — TODAY-05 adds no key listeners of its own.
- **Roving focus** ([`keyboard/roving-model.ts`](../../app/modules/today/keyboard/roving-model.ts),
  [`useTodayRovingFocus.ts`](../../app/modules/today/keyboard/useTodayRovingFocus.ts)).
  The open planning sections (Overdue/Today/Upcoming/Anytime) are wrapped in ONE plain
  container that behaves as a single composite widget with **exactly one tab stop**:
  Tab enters once and lands on the current task, Arrow keys move between tasks, and
  Tab/Shift+Tab leave/re-enter — the owner never Tabs through every card's controls.
  Arrow Up/Down cross section boundaries and clamp at the ends (no wrap), Home/End move
  within the current section, Enter opens, Space selects. The DS-04 Card `rovingTabIndex`
  prop is applied to **only each card's primary open control**; the card's secondary
  controls (checkbox, quick/overflow actions) are taken out of the tab order and stay
  operable by Space (select) and the shared shortcuts / Command Palette (every action
  has a keyboard equivalent) — the accessible roving pattern RecordTabs/reorder use
  (not a `listbox` over interactive cards). The collapsed "Completed today" section
  keeps natural tabbing.
- **Command ownership + shortcut scope.** A pure
  [`keyboard/today-commands.ts`](../../app/modules/today/keyboard/today-commands.ts)
  builds the per-task `AppAction`s (Open/Close · Complete/Reopen `C` · Plan today `P`
  / tomorrow `Shift+P` / next week · Clear plan) and the global commands (Focus task
  list · Go to <section> · Select all open tasks · Clear selection · Keyboard
  shortcuts). **When a task's Drawer is open, `TaskDrawerContent` registers that
  task's commands** — it has the live state AND the refresh path, so a keyboard plan
  keeps the Drawer's Planning display consistent — plus a state-dependent **Clear
  waiting**. **The dashboard registers the roving task's commands ONLY when no
  Drawer/overlay is open AND focus is within the task collection.** The roving
  controller tracks `focusWithin` (via `focusin`/`focusout`) and exposes `activeId`
  (the focused task ONLY while focus is inside) distinct from the retained tab-stop
  `focusedId` — so `C`/`P`/`Shift+P` can never complete or replan a stale task from
  behind the keyboard-help / a project/note Drawer, or after Tab leaves the list to
  Quick Capture. `focusedId` is still retained for focus restoration (Shift+Tab).
  Availability is by omission (completed → only Reopen; unplanned → no Clear plan;
  waiting → Clear waiting), while the server route stays the correctness boundary.
  **A lower task drawer owns its shortcuts only while it is the interactive top:**
  `TaskDrawerContent` takes `isTop` (from `DrawerEntry.isTop`) and registers its task
  commands only when top — so stacking the keyboard-help (or another record) drawer
  above a task drawer keeps the lower drawer's state but drops its `C`/`P`/`Shift+P`
  ownership; they return when it becomes top again.
- **Section navigation.** "Go to <section>" / "Focus task list" are NAVIGATE commands
  whose target is built by [`keyboard/nav-target.ts`](../../app/modules/today/keyboard/nav-target.ts):
  it starts from the current params with the **entire Drawer stack removed** (via the
  shared `withAllDrawersRemoved` helper — never by hand-parsing `drawer` keys), preserves
  every other param, and sets a bounded `today-nav` value (`/today?…&today-nav=<list|bucket>`).
  Stripping the whole stack means a section command run from **inside an open drawer**
  (or a stack of them) navigates the drawers away cleanly in one push, without touching
  the Drawer provider's own history entry / push token — so the browser Back button
  reopens the previous drawer and Forward returns to Today with it closed. Navigating
  closes the palette AND the drawer stack naturally, and a post-navigation effect (fired
  once per navigation, like the Focus-Quick-Capture effect) moves focus to the section's
  first task after the modal surfaces have unmounted, scrolls its heading into view, then
  cleans the param via a `replace`. The `today-nav` value is validated by a bounded type
  guard (`isTodayNavValue`) so an arbitrary query value can never become a section
  identifier. Because the effect runs after the palette closed and restored focus, the
  target wins deterministically — no timing hacks — and Arrow/Home/End then continue from
  that section.
- **Global navigation commands** stay registered on the module manifest (Open Today,
  Focus Quick Capture, Open Waiting) — nothing Today-specific is hard-coded in the
  palette component.
- **Keyboard help** ([`keyboard/KeyboardHelp.tsx`](../../app/modules/today/keyboard/KeyboardHelp.tsx)).
  The `?` shortcut and the "Keyboard shortcuts" command open a reference hosted by the
  SAME DS-03 Drawer (`help:shortcuts` key) — no bespoke modal, no second focus trap.
- **Multi-select.** Space selects the focused task; "Select all open tasks" fills the
  selection; the existing TODAY-04 bulk action bar (atomic `/today/plan`) — which lives
  in the CollectionLayout selection slot OUTSIDE the roving container, so it is reached
  by an ordinary Tab — plans them, and bulk **commands** ("Plan selected for
  Today/Tomorrow/Next Week", "Clear plan for selected") drive the same atomic path from
  the palette; Escape (or "Clear selection") clears it. No partial application.
- **Command coverage (explicit).** Navigate/open/close/complete/reopen/plan/clear-plan/
  clear-waiting/select-all/clear-selection/bulk-plan/help/open-Waiting are commands or
  shortcuts. Mark-waiting, change-waiting-subject, choose-custom-date and open-Task-Activity
  are reachable through their keyboard-accessible visible controls (the waiting editor,
  date fields, and the RecordTabs tablist) rather than a dedicated command — a documented
  boundary, tracked in [`PRODUCT_DEBT` DEBT-18](../product/PRODUCT_DEBT.md); none is
  missing from the keyboard, only from the palette.
- **Quick Capture** reuses the existing focus command; it still does not persist
  (TODAY-01's disclosed fixture boundary is unchanged).

## Mobile (TODAY-06)

Today is comfortable and dependable on a phone by touch, composed ENTIRELY from the
shared layer (no mobile card, no parallel mobile tree) and accepted via
[ADR-032](../decisions/ARCHITECTURE_DECISIONS.md#adr-032-mobile-today--touch-swipe-quick-actions-as-an-additive-shared-card-accelerator-and-the-touch-target-corrections).

- **Swipe quick actions.** On a touch-first device a task Card is swiped horizontally
  to reveal an action tray. It is an **accelerator** over the always-visible quick
  actions: the tray renders the SAME `CardAction`s Today already builds
  (`planQuickActions`) — Complete/Reopen, Plan today, Tomorrow, Clear/Remove — so a
  tray action drives the SAME trusted routes (`/today/plan`, `/today/task/:id`) as the
  visible buttons, the Drawer, the bulk bar and the keyboard commands. Availability is
  state-dependent by omission (completed → only Reopen; unplanned → no Clear plan;
  waiting is excluded from planning sections). The tray is `aria-hidden` (a visual
  duplicate), so there is **no gesture-only functionality**. The shared capability is
  the DS-04 Card `swipeActions` prop + a pure `swipe-model` + the `useCardSwipe` hook
  (`app/shared/card/`). `touch-action: pan-y` + a clear-horizontal-intent threshold
  keep vertical page scrolling natural; a minor drag never reveals the tray; a handled
  swipe never opens the Card; one tray is open at a time and closes on outside
  interaction, a Drawer opening, or a completed action; the snap honours reduced
  motion. Desktop mouse/keyboard is untouched (the gate is `(hover: none) and (pointer:
  coarse)`), so the TODAY-05 keyboard workflow is preserved.
- **Adapted composition.** The task Cards, planning sections, planning summary,
  selection + bulk bar and Waiting summary are the shared components at compact
  density; long titles/metadata wrap; there is no horizontal page overflow from 320px
  up. The sticky pane header clears a device notch via `env(safe-area-inset-top)`.
- **Mobile Drawer.** The task Drawer is the unchanged DS-03 full-height sheet — safe
  areas, tabs, and the Details/Planning/Waiting controls are reachable on a narrow
  screen; deep-link + Back/Forward + focus restoration are preserved.
- **Mobile selection + bulk planning.** TODAY-04 selection works on a phone: the Card
  selection control is a 44px touch target (a `label` cell sized to the token), the
  bulk bar shows the count and stays within the safe area, and Cancel exits selection;
  planning stays the atomic `/today/plan` route.
- **Touch-target + landmark corrections (shared layer).** The first real phone
  axe-scan surfaced two latent DS-11 gaps, fixed at the source: the shared Card
  selection meets 44px on touch, and the app-shell mobile bar is a `header` so its
  brand + menu toggle are in the `banner` landmark on mobile.

## Deliberately NOT built

TODAY-02 adds the **smallest honest** task slice: it does NOT build the full Tasks
module (creation UI, board, planning), a richer workflow status,
search-over-real-tasks (the DS-08 provider stays fixture-backed —
[DEBT-17](../product/PRODUCT_DEBT.md)), AI, or any second Drawer/Record
Layout/form/Activity/EntityLinks system. The non-task Today sections remain
fixture-only: no Notes, Meetings, reminders or Diary implementation. TODAY-03 adds
Waiting (above) but no multi-target waiting, delegation workflow beyond the waiting
subject, reminders or notifications.

- **Quick capture** is not connected. Submitting a non-empty draft **keeps** the
  text (nothing is stored, so clearing would silently discard it) and a polite
  live region states plainly *"Quick Capture is not connected yet. Your draft has
  not been saved."* — it never claims the content was captured, saved or stored.
  Editing the field clears that notice. The header's Quick capture action focuses
  and scrolls to the field. It does not persist, parse or call AI.
- **Complete/reopen** is optimistic, in-memory only.
- The **Daily timeline** is the day's fixture schedule rendered as a simple
  chronological list. The shared Activity **Timeline** (rendering the FND-05
  Activity model) is [DS-05](../roadmap/ROADMAP_V2.md#-ds-05--shared-timeline--activity-feed);
  this section is not it and does not invent an event source.

## Built for replacement

All demo data lives in [`fixtures.ts`](../../app/modules/today/fixtures.ts) with
typed shapes and stable ids. When Tasks, Notes, Meetings and the Diary connect,
only the data source (the loader and the fixtures) is swapped for
workspace-scoped repository reads — the `TodayDashboard` composition does not
change.

## Two disclosed deviations

1. **Execution list.** The reorderable/inline-completable *task execution list*
   in TODAY-01's original "Execution Workspace" outcome is folded into the later
   TODAY items. TODAY-04 delivers the planning half — the real tasks are now bucketed
   into planning sections with per-card plan/complete actions and multi-select bulk
   planning — and TODAY-05 (Keyboard) will complete the full keyboard-driven
   execution flow. (Reordering WITHIN a bucket is still deferred to TODAY-05.)
2. **Search provider (added by DS-08).** The Today module now registers a real,
   registry-discovered, **fixture-backed** search provider
   ([`app/modules/today/search.ts`](../../app/modules/today/search.ts)) over the
   TODAY-01 fixtures (focus tasks, upcoming meetings/reminders/deadlines, projects,
   notes). It returns the existing Today Drawer keys (`task:<id>`, `upcoming:<id>`,
   `project:<id>`, `note:<id>`) with `canonicalPath: "/today"`, so a Shared Search
   result opens the current DS-03 Record Layout in the Drawer. It duplicates no
   fixtures and adds no persistence; when Today swaps to real product repositories,
   **only the executor changes** — the shared provider contract does not. See
   [`SHARED_SEARCH.md`](SHARED_SEARCH.md) and [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation).
3. **Commands (DS-09).** Today now registers two honest, registry-discovered
   NAVIGATION commands ([`app/modules/today/commands.ts`](../../app/modules/today/commands.ts)):
   **Go to Today** (opens `/today`) and **Focus Quick Capture** (opens
   `/today?capture=1`; Today reads the bounded `capture` param, focuses the existing
   textarea, and cleans the param without a Back-button trap, without clearing the
   draft and without claiming a save). Because they are declarative navigations they
   need no `run` handler and persist nothing. Today registers no EXECUTABLE
   (server-mutating) command — it remains fixture-only. In addition, the Pane-Header
   Quick Capture button and the palette command share ONE `AppAction`, and the
   fixture-backed Complete/Reopen quick action is adapted through the shared action
   so the Card action, the keyboard path and (while a task's Drawer is open) the
   palette contextual action share one execution path — it stays an **in-memory**
   demonstration and says so; nothing is persisted. See
   [`COMMAND_PALETTE.md`](COMMAND_PALETTE.md) and
   [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action).

## Tests

- **Component** — [`test/unit/today/TodayDashboard.test.tsx`](../../test/unit/today/TodayDashboard.test.tsx):
  the six sections, chronological ordering, optimistic completion, inert-but-structured
  capture, and a card opening the Drawer.
- **Navigation** — [`test/unit/modules/today-navigation.test.ts`](../../test/unit/modules/today-navigation.test.ts):
  the manifest → registry → navigation flow (Today first, generic glyph).
- **End-to-end** — [`e2e/today.spec.ts`](../../e2e/today.spec.ts): sidebar
  reachability, sections, completion, capture, drawer, and no horizontal overflow
  at desktop and 320px.
- **Swipe (unit + component)** — [`test/unit/card/swipe-model.test.ts`](../../test/unit/card/swipe-model.test.ts)
  (pure intent/threshold/boundary/snap + the one-open-tray registry) and
  [`test/unit/card/CardSwipe.test.tsx`](../../test/unit/card/CardSwipe.test.tsx)
  (reveal/cancel, minor-drag no-op, vertical-not-captured, no-open-after-swipe, tray
  close, disabled action, nested-control safety, non-touch inert). Today swipe wiring
  (state-appropriate tray actions, same mutation path) in
  [`test/unit/today/TodayDashboard.test.tsx`](../../test/unit/today/TodayDashboard.test.tsx).
- **Mobile end-to-end (TODAY-06)** — [`e2e/today-mobile.spec.ts`](../../e2e/today-mobile.spec.ts):
  a real-D1 phone journey (touch emulation) — touch-first precondition, no horizontal
  overflow, swipe a task to reveal the tray → plan it → persisted after revalidation,
  the task Drawer as a full-height sheet + Back/Forward, mobile selection + bulk bar,
  the Waiting view, and axe-clean with the swipe tray open.
