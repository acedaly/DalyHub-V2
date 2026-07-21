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
  TodayDashboard.tsx   — the pure composition of the sections (+ Waiting summary)
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
  | 3 | Continue working | DS-04 Card (grid) | area badge · status badge · rolled-up progress |
  | 4 | Recent notes | DS-04 Card (list) | title · snippet (subtitle) · last-edited (date) |
  | 5 | Daily timeline | token-only list | a simple day schedule (see below) |
  | 6 | Quick capture | native field + button | structure only — nothing is saved |

- **Records open in place.** Every card provides both a shareable drawer deep
  link (`href`) and an in-app open (`onOpen`), so activating a card opens the
  **DS-03 Drawer** hosting a read-only **DS-02 Record Layout** — the canonical
  `Card → drawer key → renderDrawer → RecordLayout` chain. The Card never owns
  drawer state; `TodayDrawer.ts` maps `<kind>:<id>` keys to fixtures and returns
  `null` for an unknown/stale key (the Drawer's graceful not-found panel).

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
   TODAY items (TODAY-04 Planning / TODAY-05 Keyboard). TODAY-01 ships the calm
   morning dashboard the brief specifies and demonstrates completion optimistically
   on focus tasks.
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
