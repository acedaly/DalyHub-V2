# ROADMAP_V2_3.md — V2.3, Planning & Routines

> The first V2.3 product programme. V2.2 made DalyHub a dependable daily driver —
> capture, Tasks, Today, Projects, Goals, Calendar, Reviews, Notifications. V2.3
> moves it from *a system that stores and organises my work* towards *a system
> that helps me decide what I am actually going to do.*
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1 and
> [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md) holds V2.2. **This file is V2.3, and V2.3
> is CLOSED.**
>
> **New work now goes in [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md)** — V2.4,
> "Follow-through", which moves DalyHub from *a system that records what you
> intended* to *a system that tells you what became of it*: two bounded gates
> (a recoverable, green, released product; honest signals on a task row) and two
> features (FOLLOW-01, the week you committed to against the week you had;
> FOLLOW-02, whether every Goal moved — not only the ones carrying a number).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

---

## The theme: PLANNING & ROUTINES

V2.2's loop ends at execution. What it never had is the step between reflecting
and doing:

```
REVIEW  →  PLAN  →  TODAY  →  EXECUTE
```

The Weekly Review already does a great deal of retrospective work — period
insights, Inbox triage, Project review, Goal and Area alignment, reflection, a
written next-period focus, completion. It states its own limit in as many words:

> *"Nothing is scheduled or changed for you."*

That is correct for a Review. It is not correct for the week. **PLAN-01 adds the
next phase**, and **SMART-01** gives it — and the Tasks collection — reusable,
persistent scopes instead of a filter rebuilt from scratch every time.
**HABITS-01** adds the ROUTINES half of the theme: a different kind of
commitment, which is a behaviour rather than an obligation.

Four surfaces, four questions, and keeping them apart is the design:

| Surface | Question | Changes |
|---|---|---|
| **Review** | What happened, and what needs attention? | nothing |
| **Weekly Planning** | What am I committing to this week, and on which days? | the PLAN (a Task's `scheduled_date`) |
| **Today** | What do I do now? | the day's work |
| **Habits** | What behaviours am I trying to practise consistently? | a check-in — never a Task |

---

## NOW

### ☑ PLAN-01 — Weekly Planning — **DELIVERED 2026-08-17**

**A first-class planning workspace at `/plan`: the week ahead, what is already on
it, and the work that still needs a day.**

Delivered together with SMART-01 and accepted as
[ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers).
Full record:
[`PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`](../design/PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md).

- **It stores nothing.** There is no `PlanningTask`, no week record and no
  migration. The Task's canonical `scheduled_date` IS the plan
  ([ADR-030](../decisions/ARCHITECTURE_DECISIONS.md)), so the planner is a
  PROJECTION of Tasks, calendar occurrences, PROJ-02 Project health and one
  completed Review's own written focus.
- **No second Task authority.** Every mutation leaves through the canonical
  client posters to `POST /tasks/:id` and `POST /tasks/bulk` — the same routes
  `/tasks`, Today, a Project and the Task drawer post to — hosted by the shared
  `useTaskSurfaceActions`, which PLAN-01 promoted out of the Today module
  unchanged. `/plan` has no action of its own.
- **The week is the OWNER's calendar week**, resolved from their timezone and
  their `firstDayOfWeek` preference — the same authority a weekly Review's period
  uses, because REVIEW → PLAN is the whole premise. The rolling `due_this_week`
  window in Tasks is untouched: it answers a different question, and both
  definitions are now stated together in one place.
- **The week is an AGENDA, not seven columns.** Measured: at 1440 a seven-column
  board leaves ~100px per day, which is narrower than a task title. The agenda
  gives every title 254px and nothing truncates.
- **Placement needs no drag-and-drop.** Select rows, choose a day: seven ordinary
  buttons committing ONE atomic bulk mutation, each naming its day in words. The
  row's overflow offers the same days one at a time. No drag-and-drop dependency
  was added, so there is nothing a keyboard or screen-reader user is excluded from.
- **Planned date ≠ due date, visibly.** Placing a Task on Wednesday never moves a
  deadline, the row keeps drawing both, and the announcement says so.
- **"Still to place" is a named-BAND queue, not a score.** Overdue → plan lapsed →
  due this week → high priority → unfiled, in that order, one band per Task, and
  the band is printed as the group's heading. Bounded at fifteen, with the
  truncation reported and the way to narrow it named.
- **Calendar is CONTEXT.** The existing schedule projection, read ONCE for the
  whole week. Occurrences are drawn as text with their times; they are never
  converted into Tasks, never writable, and DalyHub still writes to no calendar.
- **Blocked work is shown as blocked.** A new `open` system view keeps the parked
  states, so a Task planned for Wednesday and waiting on someone still appears on
  Wednesday, with its state in words.
- **Phone-first, not phone-compatible.** A horizontal day rail, one day's agenda,
  then the queue. Seven desktop columns are never squeezed into 390px.
- **Bounded by construction.** A fixed number of queries whatever the week holds,
  asserted by `test/unit/plan/plan-query-bounds.test.ts`.

### ☑ SMART-01 — Saved smart lists — **DELIVERED 2026-08-17**

**One Task filter vocabulary, two consumers: the Tasks collection and the
planning queue.**

- **It converges rather than rebuilds.** DalyHub already had exactly the right
  thing — TASKS-03's declarative view configuration, persisted through X-02's one
  saved-view table and repository
  ([ADR-059](../decisions/ARCHITECTURE_DECISIONS.md), [ADR-082](../decisions/ARCHITECTURE_DECISIONS.md)) — and the honest
  reading of "build saved smart lists" was to give it the capabilities it was
  missing and a second consumer, not a parallel system. **No new table, no new
  migration and no second filter DSL.**
- **The vocabulary the product speaks stays "saved view".** "Smart list" is not
  introduced as a synonym: AGENTS.md §7 forbids exactly that drift, and the
  concept the roadmap item names already exists under a name the whole product
  and its documentation use.
- **New filter capabilities**, all in the same declarative, closed-set,
  server-translated model: a multi-value **priority set** ("P1 and P2"), explicit
  **due** and **planned date windows**, and a **repeats** filter in both
  directions.
- **The shared control model learned multi-select**, so one dimension can hold
  more than one value with one parameter, one link and one chip per value —
  and no operator, no nesting and nothing new to persist.
- **A saved view is a planning scope.** Weekly Planning's queue offers
  "Suggested" plus every saved view, and runs the chosen one through the SAME
  `listWorkspaceTasks` path with the SAME `toWorkspaceFilters` translation.
  Planning duplicates no filter logic; the equivalence is asserted end to end.
- **`?priority=p1` still means Priority 1.** The parameter kept its name and the
  parse canonicalises a single stored or linked value into a one-member set, so
  every saved view and every shared link written before this item is unchanged.

### ☑ HABITS-01 — Habits and routines — **DELIVERED 2026-08-18**

**A distinct first-class domain for the behaviours you are practising — not a
recurring Task with a flag on it.**

Accepted as
[ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks).
Full record:
[`HABITS_01_HABITS_AND_ROUTINES_2026_08.md`](../design/HABITS_01_HABITS_AND_ROUTINES_2026_08.md);
module behaviour: [`HABITS_MODULE.md`](../development/HABITS_MODULE.md).

- **The distinction is structural, not a filter.** A Habit is its own domain
  (`habit` entity + `habit_details` + `habit_schedules` + `habit_completions`),
  ADJACENT to Area → Goal → Project → Task. **No Task is ever generated for an
  occurrence**, so a missed Habit cannot become overdue, cannot enter a Task
  statistic and cannot move a Project's progress — because the Task it would
  have to become does not exist.
- **Three cadences, and staying small is the decision.** Every day · selected
  weekdays · N times a week. No monthly rules, no nth-weekday, no end
  conditions, no times of day, no quantities. Advanced TASK recurrence
  (TASKS-12) is a different model for a different object and is not shared.
- **The schedule is EFFECTIVE-DATED, so history stays true.** Changing
  Mon/Wed/Fri to Tue/Thu closes the current version at yesterday and opens a new
  one today; lowering a weekly target cannot retroactively turn an earlier miss
  into a success. Nothing else in DalyHub became temporal.
- **A check-in is identified by the OWNER-LOCAL DATE**, and
  `(workspace, habit, date)` is the primary key — so "at most once a day" is a
  property of the database and two racing taps produce one completion. A future
  date is refused; an archived Habit refuses new completions; a DST transition
  cannot move a completion onto another day.
- **ONE check-in authority.** `/habits/:id/check-in`, posted to by Today, the
  collection and the record, all drawing the ONE shared `HabitRow`. Consistency
  between surfaces is structural.
- **NO manufactured streaks.** No flame, no day count, no chain, no score, no
  percentage. Today (done / not yet), this week ("2 of 3") and a bounded recent
  window ("9 of 12 expected check-ins"). An unscheduled day is never described
  as a miss and a future day is never described as incomplete — both asserted.
- **Habits support Goals without changing Goal mathematics.** Two EntityLinks
  (`habit.supports_goal`, `habit.belongs_to_area`) rather than a second join
  model. A Goal shows its supporting Habits as EVIDENCE; its measured progress
  is untouched.
- **Today gained a compact band, and the first task did not move.** MEASURED:
  233px at 1440, 263px at 393, 292px at 320 — identical with and without it.
- **Planning gained read-only context; Review deliberately gained nothing.**
  `/plan` shows "Routines this week" with no control on it; a truthful Review
  figure needs an expectation sum across a version chain and is deferred as
  DEBT-156 rather than shipped half-considered.
- **Bounded by construction.** A page of Habits costs two statements whatever it
  holds, asserted by `test/unit/habits/habit-query-bounds.test.ts` and counted
  for real in `test/kernel/habits.test.ts`.

### ☑ V2.3-GATE-01 — A trustworthy V2.3 baseline — **DELIVERED 2026-08-18**

**Not a feature. The pass that makes `main` mean something again after PLAN-01 /
SMART-01 and HABITS-01, so TASKS-13 is built on a green gate rather than beside a
red one.**

Five E2E partitions were red on `main` @ bcdba66 (run 32107056970). Every one was
reproduced and classified before anything was changed, and the classification is
the point: **one was a real product defect, four were tests that had stopped
describing the product.** Nothing was skipped, no timeout was raised, no
assertion was loosened, and no product behaviour was changed to satisfy a stale
test.

- **The Tasks filter defect was real, and it was a lost update.** Choosing
  Priority 1 and then Due Overdue wrote `?due=overdue` alone. The desktop popover
  LIVE-APPLIES (CONTROL-01) and composes each write over what the collection
  reports as APPLIED — which for Tasks is the canonical configuration derived from
  the loader, so it does not advance until the loader answers. A second choice
  made inside that window was composed over a base that had never heard of the
  first. MEASURED with the revalidation held for 1.5 s: the first write carried
  `priority=p1`, the second did not. Fixed at the one authority
  (`use-applied-params.ts`): every write leaves through ONE function that records
  what it wrote, and the badge, the chips, the popover's checkmarks and the next
  write all read the same answer. No second filter model, and the committed state
  is authoritative again the moment the router settles — so a value the server
  canonicalises away still disappears.
- **Quick Capture's assertion was stale, and Habit stays.** A test named "all four
  types" was checking five and failing on the sixth. It now names each type with
  its own test id AND its own visible label, exact in both directions, so a type
  quietly dropped fails and so does one added without a decision.
- **The Projects assertion was testing an obsolete anatomy.** `getByRole("article")`
  looked for the gallery on a scope that [ADR-100](../decisions/ARCHITECTURE_DECISIONS.md)
  correctly draws as a TABLE — the default `state=all` holds 83 Projects, above
  the forty-record threshold. It now asserts the product-wide record contract
  ("every Project is a link named `Open <title>`"), which holds in both drawings,
  and a new journey opens a Project from whichever presentation the size rule
  actually chooses.
- **The Review counts were contaminated, and the fixture is now bounded.** The
  insight counts every Task completed in the workspace during the period — which
  is correct — while the fixture's period ran up to and including today, and the
  spec files that run before it in partition p02 complete real Tasks. "3 Tasks
  completed" became 4, 5 or 6 depending on what had already run. The fixture's
  week now ENDS TWO DAYS AGO, so the only completions that can fall inside it are
  the ones it writes: nothing else in the suite can complete a Task in the past.
  The assertions stayed exact, and a new test stamps a completion at NOW and
  proves the Review does not move.
- **SQLITE_BUSY is understood, and the last five bypasses are closed.** It is
  local Miniflare contention, already diagnosed and already handled: the suite
  drives one dev server against one SQLite file while a fixture opens it from a
  second process, and `e2e/d1.ts` retries exactly that. What was left was that
  five specs could not use it — it had no file mode — so each had grown a private
  `execFileSync` with **no retry at all**. They now all go through the one helper.
  No retry was added around any product D1 operation.
- **The Habits partial first week is settled and tested.** An X-times-per-week
  Habit created on the Sunday was charged the full weekly target: unreachable in
  the day remaining, and — because the recent window sums elapsed weeks —
  carried forward permanently as three expectations against a week the owner
  never had a chance in. A count-based week is now held to its target only if the
  Habit was active for EVERY day of it, which is the rule the module already
  applied to day-based weeks and to unfinished ones. Not pro-rated, symmetric at
  the archiving end, and recorded in [`HABITS_MODULE.md`](../development/HABITS_MODULE.md#the-partial-first-week-v23-gate-01).
- **What it deliberately did NOT do.** It did not redesign the E2E split. The
  imbalance is real and measured — p08 ran 21.1 min against a 25-minute ceiling
  while the two `responsive.spec.ts` slices ran ~12 — but no failure was a
  timeout, and the mechanism that would rebalance it cannot be fed because a
  GREEN partition uploads no `results.json`. That is recorded as DEBT-157 with
  its evidence rather than fixed by mixing local timings into a manifest whose
  authority is that its numbers were measured in CI. DEBT-158 (a Goal measurement
  journey that has never once run) and DEBT-159 (the same in-flight race, still
  reachable through two chip removals) are recorded for the same reason.

---

### ☑ TASKS-13 — Checklists — **DELIVERED 2026-08-18**

**Bounded, ordered steps inside ONE Task — a row apiece, and never a Task.**

Accepted as
[ADR-103](../decisions/ARCHITECTURE_DECISIONS.md#adr-103-a-checklist-item-is-not-a-task--one-durable-level-of-ordered-steps-inside-one-task-with-dense-integer-order-no-activity-and-no-automatic-completion-in-either-direction).
Full record:
[`TASKS_13_CHECKLISTS_2026_08.md`](../design/TASKS_13_CHECKLISTS_2026_08.md);
module behaviour: [`TASKS_MODULE.md`](../development/TASKS_MODULE.md#checklists-tasks-13).

- **The two questions this item asked are both answered, and the first answers
  the second.** A checklist lives in its OWN table (`task_checklist_items`,
  migration 0045) — not in `task_details`, not in the Markdown description, and
  not as child Tasks. And a partially-complete checklist means NOTHING to a
  Project's progress: an item is not a Task, so it is not in the count the
  progress is computed from. A Project holding one Task with ten steps reports
  one open Task.
- **A checklist item is not a record, structurally.** No `entities` row, no spine
  record, no EntityLinks, no Activity of its own, no route. It cannot be opened,
  planned, delegated, filed, filtered, counted or completed as a Task, because
  the machinery that would let it does not exist — asserted at the storage layer,
  not in the interface.
- **ONE level, enforced by an absent column.** There is no `parent_item_id` and
  there will not be one. No nesting, no Task trees, no Jira subtasks.
- **Completion does not propagate, in either direction.** Ticking every step does
  NOT complete the Task (and the record says so in words when the last box is
  ticked); completing the Task does NOT tick, clear or hide a single step.
  Completing a Task with unfinished steps is allowed with no confirmation —
  DalyHub prefers undo over dialogs, and the record already shows the state.
- **A recurring Task's successor inherits the STRUCTURE and none of the ticks.**
  Written inside the existing completion batch at the one recurrence authority,
  with fresh row ids and `completed` hard-coded to 0 — so the successor arrives
  with its steps or does not arrive at all, and last month's occurrence keeps its
  own history.
- **Ordering is a dense integer and deliberately NOT unique**, because SQLite
  checks a unique index row by row and a reorder legitimately passes through a
  duplicate. A stale reorder is REFUSED with the current list rather than half
  applied. Reorder is two ordinary menu commands — no drag-and-drop dependency
  was added, and a command works the same for a mouse, a keyboard and a thumb.
- **No Activity, by decision.** A tick is state, not history; ten steps would put
  ten rows into a timeline that describes commitments. Every mutation still bumps
  the parent Task's `updated_at`.
- **Bounded by construction, and it found a real defect.** Progress is ONE
  indexed aggregate per bounded chunk of ids — a page of fifty Tasks costs the
  same one statement a page of one does. The chunk is 80 rather than 100 because
  **D1 accepts at most 100 bound parameters per query** and the workspace id is
  one of them; at 100 the statement failed, and because Today degrades a failed
  section the symptom was a day reporting "Nothing planned today" against
  thirty-seven planned Tasks.
- **The row figure is desktop-only, and the numbers decided it.** MEASURED: at
  1440 and 1280 a row with "2 of 5" is 44px and one without is 44px. On a phone
  the same five characters wrapped the title, at nineteen pixels a row — so the
  figure stops below `md` and the record, one tap away, carries it.
- **Offline covers the TICK.** `set_checklist_completed` rides PWA-12's existing
  queue, receipts and conflict rule, with a new `targetId` so two ticks on two
  different steps of one Task are two changes rather than one field edited twice.
  The other four operations are online-only and say so (DEBT-160).
- **`axe` is green in both appearances with no rule disabled**, which found a
  real `target-size` violation: the shared check control's negative inline
  margins put the rename trigger 2px inside the checkbox. Fixed by the row
  occupying its full 44px target.

---

### ☑ UX-02 — Weekly Planning and Habits, rebuilt to the visual references — **DELIVERED 2026-08-19**

**Two screens rebuilt to `Mockup 7.png` and `Mockup 8.png` — and two recorded
decisions re-taken, one because its measurement had stopped being true and one
because the principle behind it did not forbid what the reference asked for.**

Accepted as
[ADR-104](../decisions/ARCHITECTURE_DECISIONS.md#adr-104-the-planning-week-is-a-board-and-a-habit-may-state-one-proportion--two-decisions-re-taken-on-fresh-measurements-superseding-adr-101-10-and-adr-102-8).
Full record: [`UX_02_PLAN_HABITS_2026_08.md`](../design/UX_02_PLAN_HABITS_2026_08.md).

- **`/plan` is a week BOARD, and the decision is a re-measurement.** ADR-101 §10
  rejected a column board because "at 1440 a seven-column board leaves ~100px per
  day". MEASURED on `main` @ 3d8d0d6: the planning content column is **856px**, not
  the 1096 that figure was derived from. Six columns (Saturday and Sunday share
  one), the rail giving up 2rem, and the shared Task row in a new CARD presentation
  make it **147px per day with a 73px three-line title** at 1440. At 1280 six
  columns would be 108px, so the board FOLDS to three columns over two rows —
  recompose, never squeeze. The phone composition is unchanged.
- **`/habits` is a four-column table with a glance row and a rail.** The stat row is
  the shared `StatCard` (shared since UIX-01 with no consumer until now); the table
  is the ONE `HabitRow` in a new `columns` layout inside a `HabitList` that declares
  the grid once — DS-04's device, applied to a second domain; the rail carries what
  today asks for, which Goals these behaviours support, and the week in three
  figures.
- **ONE percentage now exists, and the ban it narrows was read precisely.** ADR-102
  §8 forbade percentages to prevent three things: a figure with no denominator, a
  figure over an unbounded history, and a figure that treats an unscheduled or
  future day as a miss. "78% recent consistency" has none of them — it is drawn
  beside "111 of 142 expected check-ins", over the existing 28-day window, and a
  window that expected nothing has no percentage at all. No streak, no flame, no
  chain, no ring that empties, and both unsayable sentences still asserted.
- **A day that has not happened is still not drawn.** The collection's new week
  strip stops at today: Thursday is empty ground with an accessible "not yet", never
  a hollow circle that reads as a miss.
- **The board's "Plan a task" ARMS a day; it creates nothing.** It names the day the
  queue's existing bulk placement commits to and moves focus there. `/plan` still
  has no mutation authority, no create path and no drag-and-drop.
- **The weekend column keeps TWO days inside it**, which is the one thing on Mockup
  7 the rebuild did not copy: a planner exists to say WHICH day, and a Saturday task
  in a band that also holds Sunday's is a task whose day the screen stopped stating.
  The pairing follows the owner's `firstDayOfWeek` rather than assuming Monday.
- **`/plan` gained no query.** The week's four figures are pure arithmetic over the
  days and the queue it had already read (`planningWeekTotals`, unit-tested).
  `/habits` gained ONE bounded read of two statements — capped at 60 Habits because
  **D1 accepts at most 100 bound parameters per query**, the ceiling TASKS-13 found
  the hard way — and the per-row week strip costs nothing at all, because the
  current week's completions were already being read.
- **No document scrolls sideways at 1440, 1280, 820, 393 or 320, in either
  appearance**, and every figure quoted above is reproducible with
  `node scripts/ux-02-shot.mjs --measure 1`.
- **Three pieces of debt raised rather than hidden**: the six-column board needs a
  1440 viewport (DEBT-162), a Sunday-start week wraps a seventh column (DEBT-163),
  and a queue row still carries two checkboxes (DEBT-164).

### ☑ PROJECT-02 — Project templates — **DELIVERED 2026-08-19**

**Start a Project from a shape that already worked, without copying and renaming
last time's.**

Accepted as
[ADR-105](../decisions/ARCHITECTURE_DECISIONS.md#adr-105-a-project-template-is-an-entity-that-is-not-a-spine-record--a-reusable-shape-whose-tasks-are-rows-instantiated-atomically-and-never-synchronised).
Full record:
[`PROJECT_02_PROJECT_TEMPLATES_2026_08.md`](../design/PROJECT_02_PROJECT_TEMPLATES_2026_08.md).

Both questions this item left open are now answered on the record:

- **A template is an ENTITY that is not a spine record.** An ordinary `entities`
  row of type `project_template`, with no `spine_records` row — the HABITS-01
  precedent applied a second time. So it cannot appear in a Project count, a
  rollup, Goal progress, Project health, Today, Weekly Planning or Review:
  not filtered out of them, *structurally absent*, because the row those
  surfaces read does not exist. A flag on a Project would have needed an
  exclusion predicate in every one of those queries, forever.
- **A template TASK is a ROW, not a Task.** The TASKS-13 argument one level down.
  No entity id, no spine record, no EntityLink, no Activity, no route — so it
  cannot reach the Tasks collection, the Inbox count, an overdue figure, a
  notification or a recurrence series.
- **It captures structure and intentional defaults, never execution history.**
  Titles, descriptions, priorities, order, and checklist STRUCTURE. Not
  completion, status, dates, sector, waiting, delegation, recurrence, ticks,
  Activity or any historical timestamp — and the enforcement is the ABSENCE of
  those columns, so a future change cannot carry one through by accident.
- **No dates at all, absolute or relative.** DalyHub already has three date
  authorities and a relative offset would be a fourth. PLAN-01 built the surface
  where a fresh Project gets its days; the create flow says so in words. Recorded
  as debt.
- **Instantiation is ONE atomic batch** — the Project, its link, every Task, every
  detail row, every checklist item and the Activity event — with a fresh id for
  every row and every relationship remapped onto the new ones. A half-created
  Project is impossible, and an unavailable Area/Goal creates nothing at all.
- **Bounds are enforced by the WRITE, not by a read-then-decide** (40 tasks, 20
  steps per task, 120 steps per template), asserted at each statement's own
  commit and proved under a concurrent race. A maximal template is instantiated
  against real D1, so the numbers are a measurement.
- **A template is a SNAPSHOT.** Editing one never changes a Project made from it;
  editing that Project never changes the template; deleting it leaves its
  Projects and their work untouched. Provenance is ONE Activity event, never a
  column — so there is nothing to synchronise and nothing to dangle.
- **Project creation is not harder.** A workspace with no templates sees exactly
  the header and the form it saw before, asserted end to end. With templates, one
  "Start from" field appears above the title, defaulting to *Blank project*.
- **Phone-first, and measured.** One list at every width, because a template is
  chosen by reading it; no overflow at 320; 44px targets under a coarse pointer.

### ☑ TASKS-12 — Advanced recurrence + dependencies — **DELIVERED 2026-08-19**

**Extend the existing structured recurrence model with nth-weekday, multi-weekday,
end conditions and weekend handling; add bounded Task-to-Task "blocks / blocked
by" relationships with cycle prevention and derived blocked state.**

*Recurrence controls WHEN work exists. Dependencies control WHETHER existing work
can proceed. Dependencies never silently reschedule Tasks.*

Accepted as
[ADR-106](../decisions/ARCHITECTURE_DECISIONS.md#adr-106-a-task-dependency-is-a-directed-entitylink-not-a-second-join-model--derived-blocked-state-and-cycle--bound-enforcement-inside-the-write)
and
[ADR-107](../decisions/ARCHITECTURE_DECISIONS.md#adr-107-advanced-recurrence-widens-a-closed-vocabulary-and-dependencies-are-occurrence-local--one-successor-authority-a-remembered-grid-and-no-relationship-cloning).
Full record:
[`TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md`](../design/TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md);
module behaviour: [`TASKS_MODULE.md`](../development/TASKS_MODULE.md#advanced-recurrence-and-dependencies-tasks-12).

- **The vocabulary WIDENED; the kind of thing it is did not.** Four additive
  columns on the same structured rule (migration 0047) — a monthly `ordinal`, a
  `weekend_rule`, and the two mutually-exclusive end conditions. Still no cron, no
  expression language, no RRULE parser and no scripting.
- **There is no "fifth Monday" and no "skip weekends" checkbox.** A fifth weekday
  exists in only some months, so a rule naming one needs a silent fallback nobody
  chose; and "skip weekends" names three different behaviours in three different
  products. The editor offers `last` and four complete SENTENCES about what will
  happen to a weekend occurrence — leave it, the Friday before, the Monday after,
  or skip it entirely.
- **A moved occurrence never re-anchors the routine.** The successor records the
  UNADJUSTED grid date in TASKS-07's `series_anchor_date`, so "the 1st of every
  month, moved to the Friday before" returns to the 1st instead of walking
  backwards. No second mechanism was invented for it.
- **The current occurrence COUNTS toward "ends after N"**, and "ends on" is
  INCLUSIVE and compared against the date the occurrence actually falls on. Both
  are stated on the controls, not only in a document.
- **ONE successor authority, widened rather than bypassed.**
  `planNextTaskOccurrence` decides whether a series continues AND where, and
  returns null when it has ended. Completion is its only caller.
- **A dependency is one directed EntityLink — NO new table.** Migration 0003
  already makes a cross-workspace edge impossible, a self-edge unstorable, a
  duplicate impossible and a removed dependency's identity stable, and its two
  partial indexes are exactly the access paths a blocker read and a cycle walk
  need. A second join model would have re-earned all of it.
- **Cycles and both bounds are enforced INSIDE the write** — one SQL expression
  AND-ed into the statement that inserts the row, including a bounded recursive
  CTE (`depth < 64`, `UNION`). Two concurrent adds cannot both see nineteen
  blockers; two concurrent edges cannot close a cycle. Proved under real
  concurrency, not argued.
- **Blocked is DERIVED, never stored.** Completing the last blocker unblocks;
  REOPENING it blocks again; a soft-deleted blocker stops blocking. No
  reconciliation job, no cache, no flag to go stale.
- **A dependency moves nothing.** No date, priority, status or completion changes
  on either Task — including the blocked-Task-due-before-its-blocker case a
  "helpful" scheduler would silently repair — and a blocked Task can still be
  completed.
- **Dependencies are OCCURRENCE-LOCAL and are never cloned onto a successor**, in
  all three interaction cases. An occurrence that does not exist yet is a
  prediction, and the only mappings between two series are wrong the moment one is
  completed late or skipped. Asserted in each case, so a future generic
  relationship-copier cannot change it quietly.
- **ONE blocked label per row, and it says why.** "Blocked by Get director
  approval" replaces the status pill rather than joining it, costs the row no
  height, and is drawn at every width including the phone. `blocked` joins the one
  display-state evaluator (waiting tone, no new colour) and becomes a FILTER on
  the existing declarative vocabulary — never a new view.
- **A pre-existing data-loss defect was fixed on the way**: TASKS-07's `mode` and
  `series_anchor_date` were missing from the workspace snapshot, so an
  `after_completion` routine came back from a restore as a fixed schedule. Both
  are exported and restored now, with TASKS-12's four beside them and regression
  coverage on the shared fixture.

---

## NEXT

**Nothing here.** TASKS-12 was the last item of the V2.3 theme, and it is
delivered above. The list below records what this theme deliberately did NOT add;
a new item belongs in a new roadmap document with its own decision, not appended
here — **and one now exists: [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md)**, the
Follow-through programme, accepted as
[ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal).
It carries forward the standing non-goals below unchanged.

**Two hardening passes have landed on top of the closed theme, and neither is a
V2.3 item.** They are recorded here only so the next reader knows the state
V2.3 actually shipped in:

- [HARDEN-06A](../product/HARDEN_06A_FINISHING_E2E_GATE_2026_08.md) (2026-08-20) —
  the E2E gate finishes again. Twelve partitions, every spec file measured, F-03
  and F-11 closed.
- [HARDEN-06B…06E](../product/DALYHUB_WHOLE_APP_REPAIR_2026_08.md) (2026-08-20) —
  the repair pass for the
  [whole-application audit](../product/DALYHUB_WHOLE_APP_BUG_AUDIT_2026_08.md).
  One P0 (a Meeting's notes could be silently destroyed by a second writer), one
  P1 (Restore refused every archive older than two days) and eleven more, plus
  [ADR-108](../decisions/ARCHITECTURE_DECISIONS.md) — the three product-wide rules
  the audit found were per-module conventions. No migration and no persisted-model
  change.

---

## What PLAN-01 + SMART-01 deliberately did NOT add

(Habits were on this list and are now delivered by HABITS-01 above; everything
else stands.)

Recorded so they are not mistaken for oversights. Each is a separate product
decision:

(Task checklists were on this list and are now delivered by TASKS-13 above;
Project templates are now delivered by PROJECT-02; advanced recurrence and Task
dependencies are now delivered by TASKS-12 — **the Gantt charts, automatic date
shifting, critical path and dependency notifications that were listed beside them
are NOT, and remain deliberate non-goals**.)

Subtasks ·
AI automatic weekly planning · automatic time blocking · calendar write-back ·
Gantt charts and dependency timeline visualisation · automatic date shifting ·
critical path · a dependency notification programme · resource capacity planning ·
estimates and time tracking · shared or team planning · public or shared smart
lists · a smart-list marketplace or template gallery · a new calendar module · a
month grid or a week timetable · drag-and-drop (no dependency was added for it) ·
a second Task authority · a second filter engine · a second Task relationship
model.

---

## Related documents

- [`TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md`](../design/TASKS_12_ADVANCED_RECURRENCE_DEPENDENCIES_2026_08.md) — the TASKS-12 record
- [`PROJECT_02_PROJECT_TEMPLATES_2026_08.md`](../design/PROJECT_02_PROJECT_TEMPLATES_2026_08.md) — the PROJECT-02 record
- [`UX_02_PLAN_HABITS_2026_08.md`](../design/UX_02_PLAN_HABITS_2026_08.md) — the UX-02 record
- [`PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`](../design/PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md) — the PLAN-01 + SMART-01 record
- [`TASKS_13_CHECKLISTS_2026_08.md`](../design/TASKS_13_CHECKLISTS_2026_08.md) — the TASKS-13 record
- [`HABITS_01_HABITS_AND_ROUTINES_2026_08.md`](../design/HABITS_01_HABITS_AND_ROUTINES_2026_08.md) — the HABITS-01 record
- [`HABITS_MODULE.md`](../development/HABITS_MODULE.md) — the Habits module's full behaviour
- [ADR-107](../decisions/ARCHITECTURE_DECISIONS.md#adr-107-advanced-recurrence-widens-a-closed-vocabulary-and-dependencies-are-occurrence-local--one-successor-authority-a-remembered-grid-and-no-relationship-cloning) — advanced recurrence widens a closed vocabulary, and dependencies are occurrence-local
- [ADR-106](../decisions/ARCHITECTURE_DECISIONS.md#adr-106-a-task-dependency-is-a-directed-entitylink-not-a-second-join-model--derived-blocked-state-and-cycle--bound-enforcement-inside-the-write) — a Task dependency is a directed EntityLink
- [ADR-104](../decisions/ARCHITECTURE_DECISIONS.md#adr-104-the-planning-week-is-a-board-and-a-habit-may-state-one-proportion--two-decisions-re-taken-on-fresh-measurements-superseding-adr-101-10-and-adr-102-8) — the planning week is a board, and one proportion is allowed
- [ADR-103](../decisions/ARCHITECTURE_DECISIONS.md#adr-103-a-checklist-item-is-not-a-task--one-durable-level-of-ordered-steps-inside-one-task-with-dense-integer-order-no-activity-and-no-automatic-completion-in-either-direction) — a checklist item is not a Task
- [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks) — a Habit is a behaviour, not a recurring Task
- [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers) — the accepted decision
- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) — the Tasks module's full behaviour
- [`DALYHUB_WHOLE_APP_REPAIR_2026_08.md`](../product/DALYHUB_WHOLE_APP_REPAIR_2026_08.md) — the hardening pass that repaired the whole-application audit on top of this closed theme
- [ADR-108](../decisions/ARCHITECTURE_DECISIONS.md#adr-108-three-product-wide-rules-the-whole-application-audit-found-were-per-module-conventions--a-base-version-on-every-whole-document-write-an-owner-day-that-never-travels-without-its-zone-and-maintenance-that-is-not-contact) — the three rules that pass turned from per-module conventions into rules
- [`ROADMAP_V2_4.md`](ROADMAP_V2_4.md) — the successor programme, where new work goes
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the shared patterns this used and added
