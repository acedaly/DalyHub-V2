# The Today module

Today is the surface the owner lands on every morning, and the one they work
from. Its whole job is to answer *what am I doing today?* and to let the owner
act on the answer without leaving the page.

Governed by [`AGENTS.md`](../../AGENTS.md), the layout and conditional-rendering
contract in [`DESIGN_SYSTEM.md` → The Today screen](../design/DESIGN_SYSTEM.md#the-today-screen),
and the composition/feel contract in
[`PRODUCT_EXPERIENCE.md`](../design/PRODUCT_EXPERIENCE.md). This document is the
IMPLEMENTATION note; the design system owns the contract.

> **2026-08 — the screen was replaced.** Today had grown into a metrics dashboard
> *about* work: a full-width search hero, six stat tiles mostly rendering zeros, a
> Task Summary donut restating three of those counts a third time, a "Customise"
> toolbar over a fourteen-widget catalogue, and the day's actual tasks below the
> fold. The widget system, the personalisation model, the hero stat rail, the
> Insights/Productivity/Notes/Diary/Areas/Goals/Assets/Recent-activity panels and
> the roving multi-select task collection are all gone. What replaced them is
> below. The Task record, Waiting and the planning storage model are UNCHANGED and
> are documented further down.

## Where it lives

```text
app/modules/today/
  module.ts                  — the module manifest (id "today", navOrder 5, routes;
                               no entity type — Today is a view, not an entity)
  routes.manifest.ts         — the declarative route descriptors
  routes/index.tsx           — the /today route: loader → TodayDayData, plus the
                               ONE DS-03 DrawerProvider the screen opens records in
  routes/waiting.tsx         — TODAY-03: the /today/waiting collection view
  routes/plan.tsx            — TODAY-04: the bulk planning endpoint (see DEBT-104)
  routes/activity.tsx        — the workspace-wide Activity feed endpoint (DEBT-103)
  day/day-view.ts            — the PURE day model: what is overdue, what is on
                               today, progress, chips, the greeting, the overdue cap
  day/attention-view.ts      — the PURE rail model: inclusion rules, caps, priority,
                               and the activity-recency ranking
  day/load.ts                — the workspace reads, assembled into TodayDayData
  day/schedule-load.ts       — CAL-01: the ONE schedule read behind Today,
                               Tomorrow and Next 7 Days
  schedule/                  — CAL-01: ScheduleList, EventDetail (in the Drawer),
                               DayNav, and the shared drawer resolver
  routes/tomorrow.tsx        — CAL-02: /today/tomorrow
  routes/upcoming.tsx        — CAL-02: /today/upcoming (next 7 days)
  routes/schedule.tsx        — CAL-03: the ONE write, an event → a canonical Meeting
  day/TodayScreen.tsx        — the composition
  TodayDrawer.tsx            — drawer key → panel (the Task record, and the
                               keyboard reference)
  task/                      — the task record composition (TaskDrawerContent, the
                               per-task command builder, waiting-view, WaitingTaskCard)
  keyboard/KeyboardHelp.tsx  — the shared shortcut reference, hosted in the Drawer
app/styles/today.css         — the Today screen; every value a DS-01 token
app/styles/schedule.css      — CAL-01: the agenda rows, day rail, Next 7 Days
                               groups and event detail; composes today.css
app/styles/tasks.css         — the /tasks workspace (extracted from today.css)
app/styles/task-drawer.css   — the task record layout
```

## The screen

Four things, in this order: a header block on the page canvas, a conditional chip
row, and two tonal columns — the day, and the attention rail. The full layout
contract, the conditional-rendering table and the rail inclusion rules are in
[`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#the-today-screen) and are not
restated here. What this document adds is how it is built.

- **Pure model, thin component.** Everything decidable is decided in
  [`day-view.ts`](../../app/modules/today/day/day-view.ts) and
  [`attention-view.ts`](../../app/modules/today/day/attention-view.ts) — React-free,
  clock-free, storage-free, and therefore unit-testable directly. `TodayScreen`
  renders what they return; it makes no judgements of its own.
- **The day is re-bucketed on the client, from the same pure function.** Ticking a
  row writes an optimistic override, and the screen re-runs `bucketDay` over the
  overridden state rather than patching arrays. That is what keeps a completed row
  in place (dimmed, at the end), keeps the progress denominator stable while the
  row moves, and makes it impossible for the bar and the rows to disagree.
- **One completion path.** A checkbox posts `intent=complete|reopen` to
  `/tasks/:id` — the SAME action the Tasks collection and the Task Drawer use.
  Today owns no completion logic; the ensuing revalidation reconciles the override.
- **Server-resolved time.** The owner's calendar date, the long date line and the
  owner-local hour behind the greeting are all resolved in the owner's timezone in
  the loader (SET-01 `appPreferences.timezone`, default `Australia/Sydney`), so the
  first byte is correct and there is no hydration drift. Stored date-only values
  stay `YYYY-MM-DD`; the timezone changes interpretation, never storage.
- **Degrade, never blank.** Each section read in
  [`load.ts`](../../app/modules/today/day/load.ts) is wrapped so a failing module
  empties its own section only; a scope failure falls back to `emptyDay`, which
  still renders the greeting and the date. Today is never a 500 and never blank.
- **No new derivations.** The rail consumes `evaluateProjectHealth` and
  `evaluateGoalAlignment` — the same evaluators `/projects` and `/goals` use —
  and the Assets Today deduplication rule. Today therefore cannot disagree with a
  Project record about whether it is at risk, a Goal record about alignment, or
  Assets about whether an obligation is already represented by an open Task.
  "Continue working" ranks on `ProjectHealthSummary.lastActivityIso`, which comes
  from the shared Activity stream.

### Why "on today" is the union of two dates

A DalyHub task carries `dueDate` (the deadline) and `scheduledDate` (the owner's
commitment, ADR-030), and never a time. The old Today read the scheduled date
ALONE, which is why a task due today but never planned was filed under "Anytime",
and a task a week past its deadline made the surface report "0 overdue". The rule
is now the union of both fields, and it is deliberately the same rule the
canonical `/tasks` `today` and `overdue` system views apply — which is what makes
the "+n more overdue" row land on a list of exactly the size it promised.

A row's trailing label names WHICH date slipped ("Due 3 days ago" / "Planned
yesterday"), because those are different facts and printing one when the other is
true would be an invented claim.

## The Focus contract (TODAY-10, 2026-08-12)

TODAY-09 made the union truthful. TODAY-10 made it **legible**: the set of Tasks
Focus holds is unchanged, and the panel now says why each one is there. This
section is the authoritative statement of the contract; the pure model is
[`day-view.ts`](../../app/modules/today/day/day-view.ts).

### Inclusion, exclusion and the bands

One classifier, `focusBand(task, todayIso)`, decides everything. It reads DATES
only, so completion changes how a row is drawn and never where it sits:

| Band | A Task is in it when |
|---|---|
| **Overdue** | `dueDate < today` **OR** `scheduledDate < today` |
| **Due today** | not slipped, and `dueDate = today` |
| **Planned today** | not slipped, not due today, and `scheduledDate = today` |
| *(absent)* | none of the above, **or** completed on an earlier day |

Excluded before the model ever sees them, by the planning read: Cancelled,
Someday/Maybe, **Waiting** (blocked on someone else — it has its own view and one
attention row) and **On hold** (deliberately paused). Excluded *here*, because
the read does return them: future-dated work, undated work, and anything
completed on an earlier day. Existing is not a reason to appear.

Three properties follow **by construction** rather than by careful rendering:

- **A Task appears exactly once.** The bands are branches of one `if`, so "due
  today AND planned today", "overdue AND high priority" and "on today AND an
  attention signal" cannot draw two rows.
- **A deadline outranks an intention.** When both dates land today the Task is
  *Due today*; when both have passed the overdue label names the DUE date.
- **Completion never moves a row.** Before TODAY-10 it did: ticking an overdue
  row removed it from the overdue band and re-drew it at the foot of "For today",
  and the overdue cap pulled a hidden row up into the gap.

### Ordering

Stated in one sentence, because a rule that cannot be stated cannot be trusted:

> **Overdue first (oldest slip first); then Due today; then Planned today — and
> inside each band, priority, then the nearest deadline, then the title.**

`id` is the final tie-break, so the sort is total and identical on the server and
in the browser. Every input is a stored field the row itself can show. There is
no composite importance metric, no hidden score, and priority never groups or
tints the panel — the Matrix is not coming back (TASKS-05).

The row draws the shared `PriorityIndicator` (P1–P4), which renders **nothing**
for an untriaged Task, so the ordinary row is unchanged. It is present so the
order can be read off the screen; below the 48rem breakpoint it is not drawn (see
[Mobile](#mobile-320430px)).

### Display bounds

| Band | Bound | What is said instead |
|---|---|---|
| Overdue | 3 rows (`OVERDUE_SHOWN`) | `+n more overdue` → `/tasks?system=overdue` |
| Due today + Planned today | 8 rows together (`FOCUS_TODAY_SHOWN`) | `View all N tasks for today` → `/tasks?system=today` |

`N` is the **canonical** count — `tasksForTodayCount`, the size of the
`/tasks?system=today` set — not the number hidden and not the number drawn, so
following the link lands on a list of exactly the size it promised. It is the
same figure the "Tasks for today" card above the panel shows.

**Both bounds count OPEN rows, and neither ever hides a completion.** That is
one rule serving two requirements that pull against each other:

- the remainder has to be true of the view it links to, and that view holds only
  open work — counting today's completions towards "+n more overdue" would
  promise a list of a size `/tasks?system=overdue` does not have;
- and a row the owner has just ticked must not vanish. Completing a row moves it
  to the end of its band, so a bound covering completions could carry it past
  the slice — gone from the panel, and excluded from the canonical view as
  completed, with nowhere left to see it.

Completions are self-limiting — they appear only as the owner works — so drawing
all of them cannot recreate the unbounded list the bound exists to prevent.

Deadlines take the larger share of the eight, but never all of it: when both
bands have work, "Planned today" keeps up to `FOCUS_BAND_MIN` (3) rows. Losing
rows inside a band is a bound; losing a whole band would tell the owner they had
planned nothing.

Eight, because the typical day (five open plus three completed) must never be
truncated — a bound that fires on an ordinary Wednesday is one the owner learns
to distrust. This is a deliberate, documented exception to the Bounded-section
preview rule's "today's tasks are never truncated" clause; see
[`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#bounded-section-preview-polish-02).

### Focus and Needs attention — the boundary

Focus holds **Tasks**: the work deliberately relevant today, and what has slipped.
Needs attention holds **everything else that is exceptional** — the Inbox count,
the Waiting count and age, Asset obligations not already represented by an open
Task, Projects the shared health evaluator flags, Goals the shared alignment
evaluator flags. Overdue Tasks are BANNED from the rail (`attention-view.ts`), so
no Task is ever a row in both places.

One overlap is deliberate and is a COUNT, not a second row: an unfiled Task dated
today is a Focus row and is also one of the "2 unfiled tasks" the Inbox attention
row counts. The Inbox row is about a state of the collection, not about that Task.

### Empty states

| The day holds | Focus says |
|---|---|
| nothing at all | "Nothing planned today. Capture anything new with the **+** button." |
| slipped work but nothing on today | the Overdue band, then "Nothing else planned today." |
| work on today | the bands; no empty line |

A failed read never becomes a confident claim: `load.ts` degrades each section
independently to an empty one, and an empty Focus prints the calm line above
rather than "You have no overdue Tasks" or "Everything is on track"
(UIX-05/HARDEN-02 truthfulness).

### Today ↔ Tasks `today`

The equivalence is the contract, and TODAY-10 closed the one gap in it. Today's
Focus composition (all three bands) holds every Task in `/tasks?system=today`,
plus outright-overdue work, which is banded as such. The one divergence that
existed — `on_hold` — was resolved in the CANONICAL view rather than on Today:
the three date-driven system views now exclude parked work (waiting **and** on
hold) exactly as the planning read has since TASKS-04 resolved
[DEBT-37](../product/PRODUCT_DEBT.md). `inbox` is untouched: it is about filing,
not dating.

Proven, not asserted: [`test/kernel/today-route.test.ts`](../../test/kernel/today-route.test.ts)
runs the real loader and the real workspace read model over real D1 and compares
the two sets, and [`e2e/today-focus.spec.ts`](../../e2e/today-focus.spec.ts) does
the same in a browser after a completion.

### Mobile (320–430px)

The row composition is the desktop one minus the priority tag, not a shrunken
desktop: `[✓] title … project`. Measured on the `focus` fixture at 320/375/390/430
(and 768/1024/1280/1440/1920), every row is a single 45px line, the title is the
widest element on every row, and no width overflows horizontally. The priority tag
would cost 43px of a 200px content line at 320px and made the project name wider
than the title, so it is drawn only above the 48rem breakpoint; the ORDER it
explains is the same at every width, and priority is one tap away on the record.

The one exception is an overdue row's age phrase ("Planned 2 days ago"), which is
`flex: none` by the UIX-01 one-line rule and can exceed a very short title at
320px. It is one unit of meaning and predates this work.

### Performance

No new server reads, and no new queries. Priority comes from the same
`listPlanningTasks` row every other field on the day comes from; the bands, the
order, the bound and the canonical count are all pure derivations of that one
result. Query count is unchanged from TODAY-09.

### Retained evidence

Five captures of the PANEL (not the page), in
[`docs/design/assets/today-10-2026-08/`](../design/assets/today-10-2026-08), over
the `focus` fixture unless noted — deliberately bounded, per the repository's
screenshot-cleanup rule:

| File | Shows |
|---|---|
| `focus-390-light.png` / `focus-390-dark.png` | the three bands on a phone, in both appearances, with the priority tag correctly absent |
| `focus-1440-light.png` / `focus-1440-dark.png` | the same day on a laptop, with the priority tag drawn |
| `bounded-day-1440-light.png` | the `heavy` fixture: both bounds firing at once — "+2 more overdue" and "View all 12 tasks for today" |

### Bounds

The day is read through the existing `listPlanningTasks` query, whose three bands
are bounded independently (200 scheduled / 100 backlog / 100 recent completions).
The scheduled band is ordered scheduled-date ascending and the backlog due-date
ascending, so the day's own tasks — today's and everything already slipped — are
at the FRONT of both bands and can never be the rows a bound drops. Waiting is
read to 50, meetings to 12 each side of now, projects to 12 before ranking.

The Inbox count deliberately does **not** come from that bounded planning read. It
uses the canonical Tasks `inbox` system view grouped by parent, so Today,
`/tasks?system=inbox` and Review Inbox share one definition: active Tasks with no
structural parent. A large Inbox may be visually bounded elsewhere, but Today's
count is not.

### Assets on Today (ASSET-02)

Restored by TODAY-09 (2026-08-09).

Today carries Asset obligations as a single **Needs attention** rail row, not as a
dashboard widget. The row appears only when `AssetHistoryRepository.listAttention`
finds obligations within the Assets attention horizon and the kernel
`dedupeAttention` rule says at least one is **not** already represented by an open
linked Task.

An open linked Task wins. If "Book mower service" is open and linked to the mower
service obligation, the Task is the thing the owner acts on; Today does not show a
second obligation row for the same job. If another obligation remains visible, the
row states the suppressed count in words, such as "1 tracked as a task". If every
due Asset obligation is already represented by an open Task, Assets does not add a
rail row.

The Assets repository owns the bounded read and the obligation evaluator owns the
state text. Today only decides how to fit the already-deduplicated result into the
rail's five-row cap.

### "Continue working" is Active-only (PROJ-05 Slice 4, ADR-037 §37.7)

The loader's `scope.projects.listProjects` call for this section is:

```ts
scope.projects.listProjects({
  state: "open",
  workflowStatus: "active",
  orderBy: "recent",
  limit: RECENT_PROJECTS_COUNT,
});
```

`state: "open"` (incomplete, non-archived) and `workflowStatus: "active"` are
**independent** filters, both applied AT the database — never a larger page
re-filtered or re-sorted in React, and never a second Today-owned Project
repository or status-label mapping:

- **Why Planned and On hold are excluded.** A Project defaults to `"planned"` on
  creation (AGENTS.md §4/the spine never auto-activates a new Project); the owner
  deliberately moves it to `"active"` from the Project Settings tab (PROJ-05 Slice
  3) when they start real work on it. Continue working is deliberately a list of
  work the owner has chosen to be actively working, not everything that merely
  exists — an On-hold Project is a Project the owner has just as deliberately
  paused, so it is equally absent until reactivated.
- **Why Completed and Archived are excluded independently of workflow status.**
  `state: "open"` alone already excludes both, regardless of what `project_details
  .status` says — so a Completed or Archived Project whose PRESERVED workflow
  status happens to be `"active"` still never appears. Reopening a Completed
  Project preserves its existing documented workflow status (never resets to
  Planned), so it can reappear in Today immediately if that preserved status is
  Active; restoring an Archived Project likewise preserves its workflow status
  (ADR-037 §37.1/§37.5), so no second manual status change is ever needed after a
  restore, while a restored Planned or On-hold project correctly stays absent.
  - **Corrected 2026-08-11 (HARDEN-02).** This last clause used to say that an
    Active project that was archived "reappears in Today after restore", and that
    state is unreachable: archiving is REFUSED while any unfinished task remains
    directly under the project, and this rail requires `openCount > 0`. So a
    project that can be archived at all has no open work, and restoring it
    returns its Active STATUS without returning it to this rail — it comes back
    when it has work to continue, which is the rail's whole claim. Both journeys
    are asserted in `e2e/project-settings.spec.ts`, over two fixtures, because one
    project cannot satisfy both rules.
- **Bounded recent ordering is unchanged.** `orderBy: "recent"` and
  `RECENT_PROJECTS_COUNT` behave exactly as before Slice 4 — the ordering keyset
  is the ADR-037 §37.2 effective `updatedAt` (`MAX(entities.updated_at,
  project_details.updated_at)`), so a settings-only transition (a status change,
  archive or restore) affects "recent" ordering exactly like a rename does.
- **Shared health behaviour is unaffected.** Health visibility still uses the SAME
  `isHealthVisible` rule every Project-health consumer shares
  (`status === "active" && completedAt === null && archivedAt === null`) — since
  every item this query now returns already satisfies that condition by
  construction, the health pill's own `at_risk`/`blocked`/`stale`-only visibility
  rule is the only remaining gate on whether a card shows a health cue.
- **Card presentation.** Each card's status pill reads the shared
  `projectWorkflowStatusLabel("active")` ("Active") — the SAME vocabulary the
  Project Settings tab and collection use — never the old generic "Open" label,
  and never a status this section could otherwise show (a Planned/On-hold/
  Completed/Archived card never reaches it, so there is no `completed` branch to
  render). The Today-specific `RecentProjectItem` display shape therefore carries
  no `completed`/`status`/`archivedAt` field.
- **Accurate empty state.** When no Project is Active, the section reads **"No
  active projects to continue."** with a quiet supporting sentence explaining that
  a Project appears here once its workflow status is set to Active in Settings —
  replacing the earlier "No recent projects to continue." copy, which implied
  every open Project was eligible and was accurate only under the pre-Slice-4
  `state: "open"`-only filter.

Proven end to end by a real Workers/D1 route integration test
([`test/kernel/today-route.test.ts`](../../test/kernel/today-route.test.ts)) that
drives the ACTUAL loader (not just the repository predicate
`test/kernel/projects.test.ts` already covers), and a real-D1 Playwright journey
([`e2e/project-settings.spec.ts`](../../e2e/project-settings.spec.ts), `PROJ-05
Slice 4 — Today integration` describe block) exercising the complete
Planned → Active → On hold → Active → Archive → Restore round trip live against
Today, plus a separate proof that a restored Planned project stays absent.

## The Schedule region (CAL-01/CAL-02, 2026-08-12)

Today's third region now holds the owner's REAL day. The contract is in
[`DESIGN_SYSTEM.md → The Schedule region`](../design/DESIGN_SYSTEM.md#the-schedule-region-cal-01);
the product and security document is
[`CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md`](../product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md).
What this note adds is how it is built and what it did NOT change.

### What did not change

TODAY-10's Focus contract is untouched: the same three bands, the same
classifier, the same ordering, the same bounds, the same empty states, the same
stat row. Today's query count is unchanged.

### The one read

`day/schedule-load.ts` is the ONE workspace read behind Today's Schedule,
Tomorrow and Next 7 Days. It issues one projection read (the occurrences in the
window, with their source name, source rank and linked Meeting id already joined)
and two bounded Meeting reads, whatever the range's size — so Next 7 Days costs
the same number of queries as Today.

**No feed is fetched in a page request.** Today reads the local projection, so the
page renders at the same speed whether Outlook is up, down or slow, and a calendar
outage empties the section rather than failing the page (the same degrade-never-
blank rule every other section follows).

### Why Meetings moved into it

Today already had a Schedule panel and it held Meetings. Putting external events
in a second list beside it would have given the owner two chronologies of one day
— and a Meeting created FROM an event would have appeared in both. So the panel
holds one list: external occurrences, plus the Meetings no occurrence represents.

The **"Meetings today" figure** still counts DalyHub Meetings, and it is DERIVED
from that same read rather than from a second pair of Meeting queries — so the
figure and the panel cannot disagree. Since **V2.7 RECALL-04** it is a stated
fact on the panel's own heading rather than a chip with no consumer; see
[The day states its meetings](#the-day-states-its-meetings-v27-recall-04-2026-09-01)
below, which also records why the `dayChips` model it used to live in was removed.

`MeetingRow` is gone from `TodayScreen`, and with it a pre-existing defect: it
linked to `/meetings/:id` when the Meeting RECORD route is `/meeting/:id`
(singular), so every meeting row on Today led to "page not found". `ScheduleList`
draws that link once, correctly, for every surface.

### The shared classifier

Tomorrow needs "due tomorrow" and "planned tomorrow" to mean exactly what Today's
"Due today" and "Planned today" mean. Rather than reimplement them, `focusBand`
was split: its DUE/PLANNED half is now `dateBand(task, dateIso)`, and `focusBand`
is the overdue check followed by a call to it. Tomorrow calls `dateBand`; Next 7
Days calls `openTaskCountForDate`, which is built on it.

The OVERDUE branch is deliberately absent from `dateBand`, and that is not an
omission: nothing can have slipped relative to a date in the future, and Today
remains the product's one overdue attention surface.

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
  which loads and mutates the task through the task resource routes — re-homed to
  the Tasks module by PROJ-01/ADR-033 (`/tasks/:taskId` loader+action, plus its
  `/activity` and `/link-targets` children) — using the trusted
  `resolveAuthenticatedWorkspaceScope` boundary; a successful mutation revalidates
  the `/today` loader so Today and the Drawer stay consistent with no hard reload.
  Ticking a checkbox on the Today screen posts to that SAME action, so the timeline
  and the Drawer can never disagree about whether a task is done.

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
  completion ([`TaskWaitingSection.tsx`](../../app/shared/task-record/TaskWaitingSection.tsx)):
  a calm read-only state ("Waiting for X · Since 18 Jul 2026 · 3 days") and an
  explicit-save editor with two modes — a DS-06 async `SelectField` picker over the
  waiting-target search, or a free-text `TextField` — with server-authoritative
  validation. It posts `set_waiting`/`clear_waiting` intents to the re-homed
  `/tasks/:taskId` action (PROJ-01 / ADR-033).
- **The Waiting view.** [`/today/waiting`](../../app/modules/today/routes/waiting.tsx)
  is a real registry route under Today (no separate sidebar module). It composes the
  PX-02 CollectionLayout + DS-04 Cards and opens tasks in the SAME DS-03 Drawer, so
  opening a waiting task keeps the owner on `/today/waiting`. Ordering is
  deterministic: **overdue → longest-waiting → due date → id.**
- **It PAGES, and it states what it is showing (V2.7 RECALL-03).** It read
  `LIMIT 100` with no cursor and rendered "`${count} tasks are waiting…`", so at
  150 waiting Tasks the surface whose entire job is "what am I waiting on" said
  *100* and row 101 was unreachable
  ([DEBT-232](../product/PRODUCT_DEBT.md)). It now issues the standard
  scope-bound keyset cursor (`task-waiting-cursor.ts`, the same shape
  `/tasks` uses) and accumulates pages behind the shared `useKeysetPagination` +
  `LoadMore`, so the whole collection is reachable without navigating. The
  subtitle counts what is LOADED and says so while more remain — "Showing the
  first 50 waiting tasks — load more to see the rest." — and states a total only
  once the collection is exhausted, so it can never present a bound as a
  population again. The four-part order is projected into ONE comparable key so
  the resume predicate and the ORDER BY are the same rule by construction.
  The deliberate **no-nav-entry** decision is unchanged: Waiting is reached from
  the attention rail and the palette.
- **It takes the follow-up filter (V2.7 RECALL-03).** `?followUp=` names a state
  from the ONE declarative Task vocabulary
  ([`TASKS_MODULE.md` → Filters](TASKS_MODULE.md#filters)), resolved by the same
  repository predicate `/tasks?followUp=` resolves. It is the destination the
  attention rail's follow-up count links to, which is what makes the stated
  number and the list beneath it one population rather than two that agree.
- **Today integration.** The attention rail carries ONE waiting row when anything is
  waiting — the count and the AGE of the oldest item, linking to `/today/waiting`.
  Since V2.7 RECALL-03 that same row carries the one additional fact that makes
  waiting actionable *today*: **"N follow-ups due"**, a labelled segment with its
  own destination (`/today/waiting?followUp=due`). Two facts, two links, one row
  — no new card and no new band. It is absent when nothing is due, exactly as the
  rail has no "0 waiting" row. Waiting tasks are **excluded from the day**
  (blocked work is not today's work). "Open Waiting" and "Open follow-ups due"
  navigation commands are registered.
- **One definition, three surfaces.** The follow-up count is
  `WaitingFacts.followUpDue` in the SHARED attention-facts layer
  (`attention-facts.server.ts`), read from `countWaitingTasks` — ONE bounded,
  workspace-scoped aggregate, never a bounded page counted in JavaScript.
  Today's rail and the daily digest both render THAT field, so the screen and
  the notification cannot state different numbers on one morning; the parity is
  asserted by comparing machine values in
  `test/kernel/recall-03-commitments-due.test.ts`, and pointing the digest line
  at the generic `waiting.count` reddens a named test. Today's pinned statement
  budget moved **21 → 22** for this one read, deliberately (see below).
- **The waiting TOTAL comes from the same statement, and that matters.** It used
  to be `page.items.length`, bounded by `WAITING_LIMIT` (50) — survivable while
  it was the only number on the row, and not survivable the moment a follow-up
  count stood beside it: an unbounded subset beside a page-length total prints
  *"50 waiting items · 100 follow-ups due"*, which is not merely wrong but
  impossible, and contradicts the subset relationship the fact is documented to
  have. Found by a review of the RECALL-03 branch (Codex, P2). `countWaitingTasks`
  therefore returns `{ total, followUpDue }` counted over the SAME rows of ONE
  statement, so the relationship is a property of the SQL rather than a
  convention two reads have to remember — and the rail's waiting count became
  authoritative as a side effect. The 60-waiting-Task regression asserts it;
  restoring `page.items.length` reddens it with the exact 50-vs-60 symptom.
  `oldestDays` is still read from the bounded page, unchanged: it is an age
  rather than a count, so it cannot contradict a count.
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
- **Where the sections went (2026-08).** The Overdue / Today / Upcoming / Anytime /
  Completed-today buckets and their pure view-model were a TODAY-SCREEN presentation
  of this model, and the redesign replaced them: Today now shows the DAY (overdue,
  meetings, on-today) from the union of the due and scheduled dates, and the full
  planning bands live in the `/tasks` collection, which is what a planning workspace
  should be. The STORAGE model, the atomicity rules and the Activity events below
  are unchanged.
- **Plan actions.** The DS-02 Task Drawer carries the **Planning section**
  ([`TaskPlanningSection.tsx`](../../app/shared/task-record/TaskPlanningSection.tsx)),
  showing Scheduled + Due with the quick actions and an inline DS-06 date control —
  no modal-in-modal. Bulk planning lives in the Tasks module.
- **Routes.** Single-task planning posts `plan`/`clear_plan` intents to the
  `/tasks/:taskId` action. Bulk planning is the Tasks module's
  [`/tasks/bulk`](../../app/modules/tasks/routes/bulk.tsx) route, and it is the
  only one. The action-only `/today/plan` route this section used to describe
  was **deleted on 2026-08-25** — the Today redesign had left it without a
  caller, and a tested, discoverable, unreachable endpoint is something the next
  author builds against ([DEBT-104](../product/PRODUCT_DEBT.md), resolved).
- **Keyboard.** Planning is exposed as shared contextual commands while a task's
  Drawer is open — "Plan for Today" (`P`), "Move to Tomorrow" (`Shift+P`), "Clear
  plan" — with shortcut metadata, driving the same mutation path the visible
  controls use.
- **Activity.** Three new `task.planned`/`task.rescheduled`/`task.plan_cleared`
  types are registered on the **tasks** module with DS-05 Timeline descriptors.
  Payloads carry only the non-sensitive calendar dates; no free text, no second
  history model.
- **Rules (regression-tested).** Planning never changes due dates; planning never
  restores waiting; planning never affects completion; bulk planning is atomic;
  cross-workspace ids are rejected.

## Keyboard

Today has no keyboard model of its own any more. The roving multi-select
collection (arrow keys across planning sections, Space to select, a bulk bar) went
with the widget system: the screen is now plain rows, so the native tab order and
the browser's own checkbox and link semantics are the whole story.

What survives, and where it lives:

- **The global shortcuts** — `⌘/Ctrl K` (palette), `/` (search), `?` (this
  reference), `Esc` — are the shell's, dispatched once by `CommandShortcutLayer`.
- **The per-task shortcuts** — `C` (complete/reopen), `P` (plan today),
  `Shift+P` (tomorrow) — belong to an OPEN task record. `TaskDrawerContent`
  registers them from
  [`task/task-commands.ts`](../../app/modules/today/task/task-commands.ts) while its
  record is the top drawer, and they reach the same `/tasks/:id` action the visible
  controls use — one identity, one execution path (ADR-024 §24.14). The shared
  reference lists them under "With a task open", scoped `global`, because that
  Drawer opens from Today, Tasks, a Project and Search alike.
- **The reference itself** is hosted in Today's Drawer
  ([`keyboard/KeyboardHelp.tsx`](../../app/modules/today/keyboard/KeyboardHelp.tsx))
  so a task drawer beneath it correctly stops owning the task shortcuts. Converging
  that host with the shell's `?` sheet remains DEBT-18.

## What the redesign removed, and where the function went

| Removed | Where the function lives now |
|---|---|
| Full-width search hero | An icon in the desktop top app bar, same accessible name, same `/` shortcut. Search itself is untouched. |
| "Customise" + the widget catalogue (`landing/layout.ts`, `useTodayLayout`, `TodayWidget`) | Nowhere. An arrangement the owner must maintain is a second product to keep coherent. |
| The "Brief" widget wrapper | The greeting is page content and the screen's `h1`. |
| Task Summary donut, legend and filter pills | `/tasks` — the Tasks nav item is the route to task management. |
| Insights + Productivity score panels | Nowhere. Both were derived from facts the day already states. |
| Notes / Diary / Areas / Goals / Assets widgets | Their own modules, all in the sidebar. |
| Recent activity widget | Nowhere yet — the endpoint is kept and the gap is logged as [DEBT-103](../product/PRODUCT_DEBT.md). |
| Quick Capture widget + the "Focus Quick Capture" command | The global `+`. Every module still contributes its own "New …" command to the palette. |
| Multi-select + the bulk planning bar | The Tasks module's bulk actions (`/tasks/bulk`). `/today/plan` was left without a caller and has since been deleted — [DEBT-104](../product/PRODUCT_DEBT.md), resolved 2026-08-25. |
| The roving keyboard collection | Native tab order over plain rows. |

## Tests

- **Pure model** — [`test/unit/today/day-view.test.ts`](../../test/unit/today/day-view.test.ts):
  what counts as overdue and as on-today (including that due-today is NOT overdue,
  and that a completed task is never overdue), which date the overdue label names,
  bucket ordering and the completed-at-the-end placement, progress suppression
  before the first completion, every chip's condition and destination, the overdue
  cap, and the greeting boundaries at 11:59/12:00 and 16:59/17:00. TODAY-10 adds
  the band classifier (due / planned / both / slipped / future / no dates /
  completed-earlier), duplicate prevention over the whole composition, that
  completion does not move a row between bands, the execution order and its
  totality, the canonical today count, and every case of the display bound.
- **Focus in the browser** — [`e2e/today-focus.spec.ts`](../../e2e/today-focus.spec.ts):
  the TODAY-10 acceptance journey over Tasks it creates itself through the real
  create action — banding and single-appearance, the parked-work agreement with
  `/tasks?system=today`, complete-from-Today → the canonical set follows → return
  and the state holds, the bound and its truthful total, the 320–430px row
  measurements, axe in both appearances, and the `h2 → h3` heading outline.
- **Rail model** — [`test/unit/today/attention-view.test.ts`](../../test/unit/today/attention-view.test.ts):
  each item type's inclusion rule, the waiting row's age, the caps (2 projects, 2
  goals, 5 overall) and the priority order, and that "Continue working" ranks by
  activity recency with unknown-activity projects last and no-open-work projects
  absent.
- **Screen** — [`test/unit/today/TodayScreen.test.tsx`](../../test/unit/today/TodayScreen.test.tsx):
  conditional rendering end to end (no chip row on a quiet day, no progress before
  the first completion, no Meetings section without meetings), overdue appearing in
  the timeline and NOT in the rail, the cap and the "+n more" link, completion from
  a row updating both the task and the progress figure optimistically, the rail's
  quiet "All clear" never appearing beside an item, and the absence of the search
  field, the Customise control and any second capture affordance. A structural
  guard asserts the day's first actionable row still sits directly under the
  header block and the chip row.
- **Per-task commands** — [`test/unit/today/task-commands.test.ts`](../../test/unit/today/task-commands.test.ts).
- **Route/Workers/D1** — [`test/kernel/today-route.test.ts`](../../test/kernel/today-route.test.ts):
  the ACTUAL `/today` loader over real D1 — "Continue working" is Active-only
  through every documented status/archive/restore transition, is capped, ranks by
  activity rather than by a settings-only touch, and excludes a project with no
  open work; plus the day itself, proving a task due today lands on the day with no
  plan set, a task past its due date lands in the timeline and never in the rail,
  and an unfiled task is counted as the inbox.
- **Navigation** — [`test/unit/modules/today-navigation.test.ts`](../../test/unit/modules/today-navigation.test.ts).
- **End-to-end** — [`e2e/today.spec.ts`](../../e2e/today.spec.ts) and
  [`e2e/today-mobile.spec.ts`](../../e2e/today-mobile.spec.ts).
- **Day fixtures** — [`e2e/today-fixtures.mjs`](../../e2e/today-fixtures.mjs) seeds a
  whole reproducible DAY (typical / morning / heavy / **focus** / empty) into the
  local D1, parking the shared dev seed reversibly so a scenario is exactly what it
  says it is. [`e2e/today-shots.mjs`](../../e2e/today-shots.mjs) captures the
  evidence set. TODAY-10 added `focus`: one Task of every kind the panel must
  classify — overdue, due today, planned today, both, future, completed, waiting,
  on hold, Inbox, several priorities, two Projects and an Area, a measurable Goal
  and an Asset obligation — because neither `typical` nor `heavy` held a Task that
  is planned for today without also being due today, or a parked one.

## The redesigned day (UIX-01, 2026-08-09)

Today was **visually** redesigned against a supplied reference design. Every
derivation in this document still holds — what "on today" means, what the rail
may and may not carry, the honesty rules about zeros and fabricated metrics —
and no loader, no route and no measurement changed. The composition did.

- **The glance row** is the same `dayChips` model, drawn as four washed tonal
  cards, each led by a tile in a column of its own — violet tasks, blue
  meetings, coral overdue, green daily progress — with the label, the figure and
  the supporting line stacked beside it. The conditional rules are untouched — a
  zero never paints, and progress appears only once something is done. On a
  phone, where the cards are two to a row, the tile steps down to the compact
  size, the label may wrap rather than truncate, and the progress RING is not
  drawn: it is the one part of the card that repeats what the figure beside it
  already states.
- **Every row is one line.** Focus, Schedule, Needs attention and Continue
  working all take an ellipsis on the title rather than wrapping, and keep the
  trailing fact on the row at every width. A list read down its left edge cannot
  have rows of three different heights.
- **The body is three regions** — Focus · Schedule · Needs attention — where it
  was one column and a 21rem rail. `data-columns` on the body states how many
  actually rendered, so a day with no meetings is two regions rather than three
  with a hole. The DOM order is still the phone composition and still the
  reading order; nothing is moved by CSS `order`.
- **Goal progress and This week** moved out of the day's column to a full-width
  row beneath the body. Goal progress is a ROW of compact measures and now gets
  the page's width — four across at 1280 instead of two.
- **Identity marks.** A rail row leads with a tonal tile for its subject kind; a
  "Continue working" row leads with the project's own persisted `AccentIcon`,
  the same mark the Projects gallery and the Project record draw. The
  per-project completion bar went with the redesign: the rail answers "which
  project needs a look?", which the open count and the health word already
  answer.
- **Overdue** lost its tinted panel and kept its leading rule. Every overdue row
  still says "Due 3 days ago" in words.
- **The completion circle** is now the shared `.dh-check-circle`, which the
  Tasks collection's rows also draw — one control, one meaning, one drawing.

Full pass, including the design-language decision and the deliberate departures
from the reference:
[`docs/design/UIX_01_PRODUCT_REDESIGN_2026_08.md`](../design/UIX_01_PRODUCT_REDESIGN_2026_08.md).


---

## The day states its meetings (V2.7 RECALL-04, 2026-09-01)

[DEBT-233](../product/PRODUCT_DEBT.md#-debt-233--today-never-states-the-meetings-today-fact-daychips-computes-it-with-no-consumer--p3--resolved-2026-09-01):
Today held the day's Meeting data and stopped being able to STATE it. `nextUp`
falls through to tasks the moment the last meeting starts; the Schedule panel's
rows survive the day, but a row is not a fact, and no count or statement existed
anywhere on the screen — while the morning digest stated exactly this with times.
The screen the owner opens said less than the notification.

**One fact, in the panel's existing note slot.** `meetingsTodayFact`
(`day/day-view.ts`) is a pure helper over the day's Meetings; `SchedulePanel`
renders it beside the "Schedule" heading, in `.dh-today__panel-note` — the same
quiet trailing fact the plan panel draws its "8 tasks" in. **No new card, and no
new height**: the fact shares the head's existing line, grouped with the title by
`.dh-today__panel-heading` so the head's `space-between` still pushes "View full
schedule" to the right edge.

**It is about the owner's TODAY, whichever day the strip has selected**, which is
why the sentence carries the word "today". The strip changes which timeline is
drawn; it does not change what day it is, and a fact that quietly re-based itself
on the selection would be the same class of untruth as a "Now" badge on next
Thursday.

**It counts the day's meetings, not the ones still ahead.** A fact derived from
`upcoming` would evaporate at exactly the moment the owner wants it. The
regression seeds three Meetings that have all already started.

**Zero new reads, and one machine value.** The count is the length of a list the
loader already returned (`data.meetings`), derived from the same
`loadScheduleWindow` → `scheduleForDate` projection `readDigestFacts` renders the
digest's day line from. `test/kernel/recall-04-day-week-truth.test.ts` reads four
values — `schedule.count`, `day.meetings.length`, `meetingsTodayFact(…).count`
and `digestFacts.events.length` — and compares them as values, and a counting
test proves the statement count does not move with one meeting or three. (The
digest states EVENTS, every entry on the day; this states MEETINGS. On a
workspace with no external calendar they are the same number, and the parity
fixture is exactly that workspace.)

**`dayChips` and `dayProgress` were REMOVED, not revived.** RECALL-04 was told to
decide and record, and this is the decision. They were three figures and a ratio
with no consumer since REDESIGN-03 removed the hero they were drawn in — and only
ONE of the four had no home elsewhere. The day's task count is already the plan
panel's note (the canonical `/tasks?system=today` figure); overdue is already a
NAMED band with its own honest "+n more overdue" row; `dayProgress` is a ratio
REDESIGN-03 §4 removed on purpose, and reviving it would have re-opened a settled
question rather than closing this one. So the meetings chip survives as
`meetingsTodayFact`, narrowed to the question it answers, and the rest left with
their tests. **The UIX-01 glance-row description above is a historical record of
a composition that no longer exists** — it is kept as the account of what was
built, not as a description of the current screen.

## Today's Goal figures state their bound (V2.7 RECALL-04, 2026-09-01)

The Goal panel is a bounded, attention-first sample: `loadGoalSummaries` scans
twelve and shows at most four, ranked so that the Goals needing attention lead.
Both figures drawn from it — the stat card's "Goals on track" and the panel's own
"1 of 4 on track" — read as claims about the workspace, which is ADR-111 decision
5's rule broken in the one place it is easiest to break
([DEBT-234](../product/PRODUCT_DEBT.md#-debt-234--on-track-and-moving-carry-four-different-predicates-across-surfaces-and-a-project-with-no-health-facts-defaults-to-on-track-inside-snapshots--p2--resolved-2026-09-01)).

`loadGoalSummaries` now returns `{ items, bounded }`, `TodayDayData` carries
`goalsBounded`, and when the read did not see every open Goal the card reads *"of
the 4 measurable goals **shown here**"* and the note *"1 of 4 **shown here** on
track"* — the honest-bound pattern Analytics already ships for its own Goal tile.
`/goals`, one tap away through both surfaces' own links, answers the workspace
question with a workspace-true count.

**The bound costs nothing.** It is a property of a page the loader already read:
no count statement, no per-Goal read, and a counting test pins that growing the
Goal population past the cap does not move Today's statement count.

**And the predicate behind the figure is no longer Today's own.**
`goalIsOnTrack` is now a re-export of the kernel's
`GOAL_MEASUREMENT_ON_TRACK_STATUSES` — `{on_track, ahead, achieved}` — which the
`/goals` lens, its SQL and its counts all derive from, so the two surfaces cannot
state different fractions over one workspace. See
[`GOALS_MODULE.md`](GOALS_MODULE.md) for the `achieved` decision.

## The Goal panel after FOLLOW-02 (2026-08-27)

Today's Goal panel used to render **measurable Goals only**. A workspace with
Goals and no numeric targets was told *"No measurable Goals yet"* every morning,
and the top two levels of the spine contributed nothing to the surface the owner
opens daily. [FOLLOW-02](../product/V2_4_FOLLOW_02_GOAL_MOVEMENT_2026_08.md)
changed that, and the changes are worth stating precisely because several of them
are refusals.

**One inclusion rule: a Goal earns its place by having something TRUE to say.**
Before FOLLOW-02 the only thing a Goal could say here was a READING, so a Goal
without one — measured-but-unstarted, or unmeasured — was excluded. Movement is
a second thing it can say, and it is available to both. So a Goal appears when
it has a reading **or** when the caller asked for movement.

That single rule is what makes the empty state honest. Today always asks for
movement, so an empty panel there means the workspace has no open Goals — which
is what the empty line says. (The first cut kept two rules and got this wrong: a
workspace whose Goals were all measurable-but-unstarted saw an empty panel and
was told to add a Goal, when what it needed was to record a first measurement.
A review caught it; `test/kernel/goal-movement.test.ts` now fails against the
old rule.)

**An unmeasured Goal gets WORDS rather than a number.** It renders no
`GoalProgressReadout`, no bar and no `progressbar` role, because *"no numeric
target" is not "0%"* — a 0% bar for visual parity would be the fabricated
precision `PRODUCT_PRINCIPLES` forbids. What it gets instead is the shared
movement statement (*"Moved this week." / "No movement yet this week."*), which is
the identical sentence `/goals` and the Goal record show for the same Goal. An
unstarted MEASURABLE Goal keeps GOAL-02's own designed absence where the reading
would be, and carries the same movement sentence beneath it.

**A measurable Goal is unchanged**, and gains the movement line beneath its
existing readout. GOAL-02's arithmetic, wording and check-in control are
untouched. The check-in button is hidden for an unmeasured Goal, which has no
measurement to record against.

**Two facts, each with its own denominator.** The panel's note now reads e.g.
`1 of 2 on track · 4 of 4 moved this week`. "On track" is GOAL-02's question and
can only be asked of a measurable Goal, so its denominator is the measured
subset; "moved" can be asked of every Goal on the panel, so its denominator is
the whole set. The `Goals on track` stat card in the summary strip was narrowed
the same way — it said *"of N measurable goals"* about a set that now contains
unmeasured ones, which would have named measurable Goals that do not exist.

**The ranking** (`goalSummaryRank`) gained two buckets and reordered nothing
existing. The split is **whether the Goal has a READING to lead with**, not
whether it is configured: a Goal with a reading keeps exactly the four predicates
and the order it had; a Goal with NO reading that MOVED sits at bucket 2, and one
with no reading and no movement sits at bucket 5 — **below every Goal with a
reading**, deliberately, because a Goal with nothing recorded and nothing to
report this week is the least useful thing a daily surface can show.

**The empty state stopped lying.** *"No measurable Goals yet"* is now *"No open
Goals yet."*, which is the state it always claimed to be.

**The window is the owner's own week**, resolved through `goalMovementWindow`
from `firstDayOfWeek` and the owner's timezone — the same seven days `/plan`, the
weekly Review and the Goals surfaces mean. The read is passed into
`loadGoalSummaries` as a function rather than imported by it, because that module
is reached from the client bundle and `readGoalMovement` is server-only.

**Cost:** one grouped read (two D1 statements) beside the three the Goal summary
already made. Never one per Goal.

---

## "Continue working" names a next action (STEER-04, 2026-08-28)

[DEBT-77](../product/PRODUCT_DEBT.md#-debt-77--a-project-card-cannot-say-what-the-next-action-is--p3),
closed on its own words: *"on a surface whose whole purpose is 'what should I do
now?', that is one click more than it should be."* Each card carried health, an
open-task count and a progress meter, and could not say what to actually do —
because nothing in the read model held the identity of a Task.

Each card now names its **next action** as one quiet line beneath its existing
signals. The Project's title stays the card's subject and its link; the next
action is smaller, lighter, and opens the canonical Task in the Drawer Today
already hosts (`task:<id>`, the DS-03 URL contract). It mutates nothing — there
is no checkbox and no inline edit on that row.

**It is the product's ONE next-action rule**, not Today's:
`TaskRepository.listProjectNextActions` evaluates
[`~/kernel/tasks/next-action`](../../app/kernel/tasks/next-action.ts) at the
database, from the same `active` scope and the same `smart` ordering `/tasks`
uses — so Today and `/tasks` cannot disagree about which Task is next. A Task
that is completed, cancelled, on hold, Someday/Maybe, waiting or
dependency-blocked is never called "next".

**Where there is nothing eligible, the card renders LESS.** No row, no sentence.
On a three-card list on the busiest screen in the product, a line saying "No next
action visible here" on every card would cost more than it says — and the card
already states its open count and its health. A Goal's *record* states the
absence in words instead, because there the owner asked about that one thing.

**What it costs: exactly one bounded statement**, read after the parallel block
because it takes the RANKED cards' ids, and flat in the number of cards —
`rankContinueProjects` caps them, and six candidates cost what two do, asserted
against a counting database. It is its own failure domain: an unreadable next
action leaves the cards exactly as they were before the feature.

Full detail and the parity proofs:
[`GOALS_MODULE.md` → STEER-04](GOALS_MODULE.md#steer-04--from-signal-to-step-v25-2026-08-28).


## The week's door (STEER-05, 2026-08-28)

[DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2--resolved-2026-08-28-v25-steer-05)'s
last open half, in its own words: *"the weekly Review has no entry point on the
screen the owner opens every day, so starting one is something they must
remember rather than something the product offers."*

Today's foot now carries a band, **This week's Review**, in one of three states:

| The owner's week | The band says | Where it goes |
|---|---|---|
| has no Review | *Close the week: what moved, what held, and what next week is for.* → **Start this week's Review** | `/reviews/new` |
| has one underway | *Your Review for this week is underway.* → **Continue this week's Review** | `/reviews/:id/guide` |
| has a completed one | *This week's Review is done.* → **Read this week's Review** | `/reviews/:id` |

The period is named in every state — in the panel head's note slot, where the
plan already states "8 tasks", and inside the control's accessible name, so a
screen reader's link list reads *"Start this week's Review, 24 Aug 2026–30 Aug
2026"* rather than one of several identical "Start" links.

### Today links; it does not mutate

All three destinations are the Reviews module's. Today holds no Review creation
path, no resume bookmark and no step vocabulary — the same rule that makes Task
completion post to `/tasks/:id` rather than to a Today endpoint. "Start" lands on
`/reviews/new`, whose form already opens on THIS week because it reads the same
`currentReviewPeriod` with the same preference; the owner confirms there.
"Continue" lands on `/reviews/:id/guide`, which resolves the owner's own resume
step and redirects to it (REVIEW-02's semantics, untouched).

### One period authority, one import path

Which week it is comes from `currentReviewPeriod` in `~/kernel/reviews` — the
same function `NewReviewForm` calls — with the owner's `firstDayOfWeek`. Today
does **not** re-derive the week from `planningWeekStart`, from the Schedule
panel's own week strip, or from anything else on this page that happens to know
what a week is. That is asserted structurally rather than by two values agreeing
([`review-door-authority.test.ts`](../../test/unit/today/review-door-authority.test.ts)):
one declaration, one published import path, no deep imports, and no week
arithmetic inside the door at all. It is DEBT-152 / DEBT-154's lesson applied in
advance — four derivations of one week agreed, which is exactly why the drift
was invisible.

The label is `reviewPeriodLabel`, which moved into the same kernel module in
this pass (see [`REVIEWS_MODULE.md`](REVIEWS_MODULE.md#the-period-label-and-the-period-lookup-steer-05-2026-08-28)),
so the door and the Reviews collection cannot print two names for one week.

### What it costs: ONE statement, and the clause it could not meet

DEBT-34's closing condition asked for Today's query count to be **unchanged**.
It could not be: nothing Today already reads touches `review_details`, so there
was no existing statement for the existence read to ride on. The honest answer,
recorded rather than absorbed (ADR-110 decision 7's posture):

**MEASURED on an empty workspace: 20 → 21.** One bounded statement, in the
existing parallel block, identical in all three door states. Both figures are
pinned by a counting database in
[`today-review-door.test.ts`](../../test/kernel/today-review-door.test.ts), so a
second Reviews read — or one that varies with the door's state — fails the suite.

**MEASURED again at 22 (V2.7 RECALL-03).** The attention rail's waiting row
learned ONE additional fact — how many waiting Tasks have a follow-up due — and
it costs exactly one bounded aggregate (`countWaitingTasks`, which carries both
the waiting total and the follow-ups due), read in parallel beside the waiting
page inside `readWaiting`. The roadmap budgeted "at most one
bounded count read" and required the pinned figure to be updated *deliberately,
never quietly*; this paragraph and the comment above the constant are that
update.

It could not ride an existing statement, for the same reason the door could not:
the waiting PAGE is bounded at `WAITING_LIMIT` (50), so counting follow-ups over
its rows would understate the fact on any workspace holding more waiting work
than that — the same class of quiet untruth RECALL-03 removes from the Waiting
subtitle. A count the database answers for the whole workspace is worth one
statement. The figure stays ABSOLUTE and pinned: a second follow-up read, a
per-Task count, or a digest read leaking into Today's loader fails the suite.

The read is `ReviewRepository.findPeriodEntry`, which is creation's own
idempotency lookup exposed on the contract and sharing one predicate with it. It
answers with a small `ReviewPeriodEntry` rather than a `Review` precisely so it
costs one statement and not two.

It degrades like every other section: a Reviews read that fails leaves the "start
one" offer standing rather than removing the door, because which week it is is
arithmetic over a preference rather than a read.

### The composition, and why it is a band

DEBT-34 framed the open half as a question about space — *which of the day's
finite surfaces gives up space for a once-a-week prompt?* The measured answer is
**none of them**. The band takes the full twelve tracks at the very foot, below
the day's work, its schedule, its routine, its Goals and its reflection.

The six-column alternative (a second doorway paired with `Daily reflection`) was
built first and rejected on a measurement: at 1440 the foot row already holds
`Continue working` (x 264, w 560) and `Daily reflection` (x 840, w 560), so a
third six-column cell wrapped and left 560px of empty grid beside it — and
because `Continue working` is data-conditional, whether it did so depended on
whether the owner had a project with open work. A band is deterministic at every
width and in every data state. It is the `HabitsPanel` rule for the mirror-image
reason: that band is full width because a list of one-line rows would leave half
a row empty, and this one is because three short lines would.

**Nothing above the first task moved.** MEASURED at 1440 / 820 / 393 / 320: the
day's first actionable row is at 461 / 497 / 597 / 646 px with and without the
band, because it is appended at the end of the grid. TODAY-TASK-01's standing
constraint holds.

### The completed state is a statement, never a reward

The decision the item had to take and record: a quiet completed state, not
nothing until the next period. Two reasons — a door that disappears the moment it
is used sends the owner back to memory for the rest of the week, which is
DEBT-34's own defect on a shorter clock; and a section that vanishes four days
out of seven reads as a panel that failed to load, which is the grid's own
recorded objection to conditional cells.

**The calm rules, asserted.** No badge, no count, no urgency colour, no
notification, and no streak of completed Reviews. A week the owner never reviews
is never called overdue, missed or late — a vocabulary guard over the rendered
band checks it in all three states
([`steer-week-door.spec.ts`](../../e2e/steer-week-door.spec.ts)). ADR-110
decision 5's spirit, applied to a ritual instead of to a figure.

### One thing this pass fixed that it did not add

`.dh-next-action__open` — STEER-04's next-action link, above — floored its
pointer target only inside `@media (pointer: coarse)`, and WCAG 2.2 AA SC 2.5.8's
24×24 minimum is not conditional on the pointer.
[DEBT-214](../product/PRODUCT_DEBT.md#-debt-214--todays-small-row-links-met-no-target-size-floor-on-a-fine-pointer--p2--raised-and-resolved-2026-08-28-v25-steer-05)
carries the measurement (75.7 × **16.9** px, 18.8px of safe clickable space) and
the fix: a new `--app-pointer-target-min` token holding the standard's 24px,
beside — not instead of — the product's 45px touch target. It was found because
this item's own criterion is an axe-clean Today, and `today-focus.spec.ts`'s
existing scan was already failing on it on `main`.

## The week account stays where the ritual is (V2.7 RECALL-04, 2026-09-01)

RECALL-04's fourth part was a decision, not a feature, and it is recorded here so
it cannot be mistaken for unfinished work.

**The question.** Should Today surface an additional account of the completed
week at the week boundary — "you finished 24 of the 31 things you planned"?

**The answer: no. The door is enough.**

The evidence, all of it already in the repository:

- **STEER-05 made Today's week-boundary surface strictly a door, by recorded
  design.** It states no facts. Three links, one period label, no count, no
  badge, no urgency colour, no streak (see [The week's door](#the-weeks-door-steer-05-2026-08-28)
  above). That was a decision, not an omission.
- **`/plan` already holds the completed week's account**, at its foot, and its
  own header records why `/plan` is not to become another dashboard.
- **The Review holds the ritual**, and the account is part of it — the period's
  own evidence surface, beside the owner's own words.
- **Today already links the owner into that ritual**, from the door.

A fourth statement of one account is a fourth thing to keep in step and a fourth
place for it to disagree with the other three. So: **no week-summary card on
Today, no duplicate account, and zero reads.** Today remains the door.

**How it is held.** Not by a brittle "this component must never exist"
assertion — the repository does not use that style — but by asserting the
intended composition: the door is present, complete, and points at the ritual,
and Today's payload carries no week-account field
(`test/kernel/recall-04-day-week-truth.test.ts`). A future pass that wants this
surface is reopening a recorded decision, which is legitimate — and has to say
so.
