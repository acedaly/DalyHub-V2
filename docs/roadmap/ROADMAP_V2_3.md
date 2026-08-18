# ROADMAP_V2_3.md — V2.3, Planning & Routines

> The first V2.3 product programme. V2.2 made DalyHub a dependable daily driver —
> capture, Tasks, Today, Projects, Goals, Calendar, Reviews, Notifications. V2.3
> moves it from *a system that stores and organises my work* towards *a system
> that helps me decide what I am actually going to do.*
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds V2.1 and
> [`ROADMAP_V2_2.md`](ROADMAP_V2_2.md) holds V2.2. **This file is V2.3, and it is
> where new work goes.**
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

---

## NEXT

The rest of the theme. Each is a separate item with its own decision — none of
them was started by the programmes above, and none should be inferred from them.

### ☐ TASKS-13 — Checklists

Bounded, ordered sub-items inside one Task, for the case that is genuinely one
piece of work with steps. Explicitly NOT subtasks: a second level of the spine
would make every count, rollup, filter and view answer a new question. The
decision to make is where a checklist lives (`task_details`, its own table, or
the Markdown description already there) and what a partially-complete checklist
means to a Project's progress.

### ☐ PROJECT-02 — Project templates

Start a Project from a shape that already worked, without copying and renaming
last time's. Needs a decision on what a template captures (structure, Tasks,
relative dates, none of the above) and on whether it is a first-class record or a
Project marked as one.

### ☐ TASKS-12 — Advanced recurrence

The rules TASKS-07 deliberately deferred: nth-weekday-of-month ("the last Friday"),
multi-weekday patterns, end conditions (after N occurrences, until a date), and
skip-weekends. The recurrence model is already structured DATA rather than a cron
string ([ADR-062](../decisions/ARCHITECTURE_DECISIONS.md), [ADR-085](../decisions/ARCHITECTURE_DECISIONS.md)),
so this widens a closed vocabulary rather than introducing an expression language.

---

## What PLAN-01 + SMART-01 deliberately did NOT add

(Habits were on this list and are now delivered by HABITS-01 above; everything
else stands.)

Recorded so they are not mistaken for oversights. Each is a separate product
decision, and several are the NEXT items above:

Task checklists and subtasks · advanced recurrence · Project templates ·
AI automatic weekly planning · automatic time blocking · calendar write-back ·
dependencies and Gantt charts · resource capacity planning · estimates and time
tracking · shared or team planning · public or shared smart lists · a smart-list
marketplace or template gallery · a new calendar module · a month grid or a
week timetable · drag-and-drop (no dependency was added for it) · a second Task
authority · a second filter engine.

---

## Related documents

- [`PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`](../design/PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md) — the PLAN-01 + SMART-01 record
- [`HABITS_01_HABITS_AND_ROUTINES_2026_08.md`](../design/HABITS_01_HABITS_AND_ROUTINES_2026_08.md) — the HABITS-01 record
- [`HABITS_MODULE.md`](../development/HABITS_MODULE.md) — the Habits module's full behaviour
- [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks) — a Habit is a behaviour, not a recurring Task
- [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers) — the accepted decision
- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) — the Tasks module's full behaviour
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the shared patterns this used and added
