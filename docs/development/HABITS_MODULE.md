# HABITS_MODULE.md — The Habits module (HABITS-01)

**A Habit is a BEHAVIOUR the owner is practising on a cadence.** It is not a
recurring Task, and everything below follows from that: a Habit has no due date,
cannot be overdue, generates no Task, enters no Task statistic and moves no
Project's progress. What it measures is CONSISTENCY.

Accepted via
[ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks).
Full programme record:
[`HABITS_01_HABITS_AND_ROUTINES_2026_08.md`](../design/HABITS_01_HABITS_AND_ROUTINES_2026_08.md).

## Where a Habit sits

Habits are **adjacent to** the Area → Goal → Project → Task spine (AGENTS.md §4),
not a rung inside it — exactly as People, Notes and Assets are. A Habit is an
ordinary `entities` row of type `habit` plus its own detail slice; it adds no
`spine_records` row, and it attaches across the spine through EntityLinks.

## Data ownership

| Concern | Authority |
| --- | --- |
| Habit identity, title, soft-delete, restore | the generic `EntityRepository` (`habit` is RESERVED for creation) |
| Creation, notes, archive/restore | `HabitRepository` over `habit_details` |
| The cadence, and its history | `HabitRepository` over `habit_schedules` (an effective-dated CHAIN) |
| Check-ins | `HabitRepository.checkIn` / `undoCheckIn` over `habit_completions` — the ONE authority |
| Goal and Area relationships | FND-04 EntityLinks (`habit.supports_goal`, `habit.belongs_to_area`) |
| Event history (create/update/schedule/archive/restore) | the shared Activity stream |
| Check-in history | `habit_completions` — deliberately NOT the Activity stream |
| What any of it MEANS | the pure evaluator in `app/kernel/habits/habit-progress.ts` |

`HabitRepository` (`app/kernel/habits` plus the D1 adapter
[`d1-habit-repository.ts`](../../app/platform/storage/d1/d1-habit-repository.ts))
is storage-independent at the contract boundary and workspace-bound: no method
takes a `workspaceId`, and the trusted Activity actor is bound at construction.

## Schema

Migration [`0044_create_habits.sql`](../../migrations/0044_create_habits.sql) adds
three tables. All are workspace-scoped with `ON DELETE RESTRICT` foreign keys.

```sql
habit_details      (workspace_id, entity_id) PK
                   notes, archived_at, archived_on, created_at, updated_at

habit_schedules    id PK
                   habit_id, kind, weekdays, target_count,
                   effective_from, effective_to, created_at
                   UNIQUE (workspace_id, habit_id, effective_from)

habit_completions  (workspace_id, habit_id, completed_on) PK
                   recorded_at
```

Two of those lines carry the design:

- **`habit_completions`'s primary key IS the "once per day" rule.** It is a
  property of the database, not of a control's disabled state, so two racing taps
  produce one completion without any application-code arbitration.
- **`habit_schedules` is a CHAIN.** Exactly one version has `effective_to IS
  NULL`; every earlier version ends the day before the next begins. That is what
  makes a historical figure describe the cadence that was actually in force.

`archived_on` is stored rather than derived: it bounds what the Habit was
expected to do, and a calendar boundary must not move when a timezone preference
does.

## The schedule vocabulary

Three kinds, and staying small is the decision (ADR-102 §2):

| kind | means |
| --- | --- |
| `daily` | every day |
| `weekdays` | a selected set of weekdays (Sunday = 0), sorted and de-duplicated |
| `weekly_count` | N times (1–7) in the owner's calendar week, on any days |

`isScheduledOn` answers **false** for every date under `weekly_count`: a habit
that asks for three sessions a week is not "due Tuesday". Its expectation is a
property of the WEEK.

The vocabulary is enforced at the ONE validation boundary
(`validateHabitSchedule`), not by a database CHECK — the reason migrations 0032
and 0038 both give: a CHECK over a domain that may grow turns "add a kind" into
"rebuild a production table". An unrecognised stored kind reads as "no
expectation" rather than throwing.

## The owner's calendar

Every date is a wall-calendar `YYYY-MM-DD` stepped as an integer number of days.
The week comes from `planningWeekStart` in `~/kernel/planning` — PLAN-01's own
authority, reused verbatim — so Weekly Planning, a weekly Review and a Habit's
week are the same seven days, resolved from the same `firstDayOfWeek`.

The only zoned step is resolving the owner's TODAY, through
`WorkspaceScope.ownerTimeZone` (AUDIT-14). Consequently a DST transition cannot
move a completion onto another day: nothing is ever converted back from an
instant.

## Changing a cadence

`changeSchedule` applies **from today**:

- if the current version already begins today, it is AMENDED in place (the owner
  is correcting a cadence they set this morning);
- otherwise the current version is closed at yesterday and a new one is opened
  today;
- requesting the schedule already in force does nothing at all.

Every day before today keeps the schedule it actually had. The record's Schedule
tab says so above the control, and the Activity event is worded "Changed the
schedule, from today".

## Progress, in words

The pure evaluator produces three readings, and the ONE serialised shape
(`~/shared/habits/habit-view.ts`) turns them into the ONE set of words every
surface prints:

```
Today        "Done today" · "Not yet today" · "Not scheduled today" · "Any day this week"
This week    "2 of 3 this week"  →  "Done this week" once met  →  null when nothing was expected
Recently     "9 of 12 expected check-ins"   (a bounded four-week window)
```

**There is no streak and no score anywhere**, and two sentences are unsayable by
construction: an unscheduled day is never a miss, and a future day is never
incomplete. `test/unit/habits/habit-view.test.ts` asserts both.

### The one percentage (UX-02)

`habitConsistencyPercent` states the RECENT WINDOW as a proportion — "78%" for 111
of 142 expected check-ins — and it is the only percentage in the module.
[ADR-104](../decisions/ARCHITECTURE_DECISIONS.md#adr-104-the-planning-week-is-a-board-and-a-habit-may-state-one-proportion--two-decisions-re-taken-on-fresh-measurements-superseding-adr-101-10-and-adr-102-8)
narrowed HABITS-01's blanket ban to the three things it was protecting against,
and this figure has none of them:

| the ban was against | this figure |
|---|---|
| a figure with no denominator | always drawn beside "111 of 142 expected check-ins" |
| a figure over unbounded history | the existing 28-day window, and no other |
| a figure that counts an unscheduled or future day as a miss | `evaluateHabitConsistency` excludes both; an empty window has NO percentage rather than 0% |

It rounds to a whole number, clamps to 0–100, and returns `null` when nothing was
expected. Streaks, flames, chains, day counts and rings that empty stay forbidden.

### This week, day by day (UX-02)

`weekHistory` is an OPTIONAL projection on the serialised shape: one entry per day
of the owner's current week, up to and including today. Absent means "the surface
did not ask for it" — deliberately different from an empty array — so Today and a
Goal's supporting section pay nothing for a strip they do not draw.

It costs no query. The current week's completions are already the second of
`readHabitPage`'s two statements; this is the same facts arranged by day. It stops
at today, so the collection's strip draws a future day as empty ground rather than
as an unfilled expectation.

### The partial first week (V2.3-GATE-01)

A **`weekly_count`** week is held to its target only when the Habit was active
for **every day of that week**. A week the Habit was created inside expects
nothing at all — `expected` is `0`, so "This week" prints nothing rather than a
target — and the first week with a target is the first whole one.

The rule is not new reasoning; it is the reasoning the module already applied
twice, extended to the case it had missed:

- a **day-based** week already counts only the scheduled days the Habit was
  active on, which is why *a Habit created on Friday did not fail Monday to
  Thursday*;
- the **recent window** already takes a count-based week only once that week is
  over, because *half a week's target is a number nobody chose, so a partial
  week is excluded rather than pro-rated*.

A week that is partial because the Habit was **created** inside it is the same
sentence with the same number nobody chose. Start "three times a week" on the
Sunday and the previous rule charged the full three: a target unreachable in the
day remaining, printed as "0 of 3 this week", and — because the recent window
sums elapsed weeks — carried forward permanently as three expectations against a
week the owner never had a chance in. That is manufactured guilt about days
before the Habit existed, which
[ADR-102](../decisions/ARCHITECTURE_DECISIONS.md) and AGENTS.md §2 forbid.

What is **not** lost: a check-in made in the partial week is still `recorded`,
still appears in the history strip, and still counts as a completion. Only the
invented denominator is absent. Nothing is pro-rated, and the rule is symmetric
at the other end by construction — archiving on a Tuesday cannot leave three
sessions owed for that week either.

Asserted by `test/unit/habits/habit-progress.test.ts` ("a count-based habit
started partway through a week") and end to end by `e2e/habits.spec.ts`.

## Surfaces

| Route | What it is |
| --- | --- |
| `/habits` | the collection, **Today** scope: every active Habit, the ones today asks for first (UX-02) |
| `/habits?scope=all` | the same collection, **All active** — paginated and searchable |
| `/habits/archived` | the same collection, archived scope |
| `/habits/new` | the ONE New Habit form (also hosted by Quick Capture) |
| `/habits/create` | the create ENDPOINT (action-only) |
| `/habits/:id` | the record — Summary, Schedule, Linked, Activity |
| `/habits/:id/mutate` | rename · update · set_schedule · archive · restore · delete |
| `/habits/:id/check-in` | the ONE check-in authority |
| `/habits/:id/activity` | one bounded page of the record's Activity |

`HabitRow` (`~/shared/habits`) is drawn by `/habits` and by Today's routine band,
and `useHabitCheckIn` is the only client-side check-in path. UX-02 gave the row a
`layout` — `columns` for the collection's four-column table (inside `HabitList`,
which declares the grid once), `row` everywhere else — rather than a second
component, because ONE row is what keeps two surfaces from disagreeing about the
same record.

The collection's **Today** scope REORDERS rather than filters: it shows every
active Habit with `habitDueToday` first, drawn from the bounded overview read the
page already makes. Nothing disappeared from the default view when UX-02 changed
it — the order changed.

Habits also appear, read-only, on:

- a **Goal** record — "Supporting habits", as EVIDENCE. A check-in is never a
  term in the Goal's measured progress;
- an **Area** record — "Habits", as context. Nothing is counted into the roll-up;
- **`/plan`** — "Routines this week". Never placeable, never in the queue.

## Query bounds

| read | statements |
| --- | --- |
| one Habit record | 2 |
| a page of Habits | 2 |
| a week of completions for a whole page | 1 |
| supporting Habits for a set of anchors | 3 |
| the collection's overview (UX-02) | 2 |

The `/habits` loader therefore costs FOUR bounded statements: the preference read,
the overview's two, and — for the `all` and `archived` scopes only — the page's
two. The `today` scope makes no page read at all.

`readHabitOverview` is capped at **60** Habits, and the number is a constraint
rather than a preference: it binds one parameter per Habit id plus the workspace
and two dates, and **D1 accepts at most 100 bound parameters per query** (the
ceiling TASKS-13 found the hard way). A workspace holding more says so rather than
printing a total that quietly is not one.

There is deliberately **no** `getCompletions(habitId)`: its absence is what makes
the N+1 unwritable. `test/unit/habits/habit-query-bounds.test.ts` asserts the
shape; `test/kernel/habits.test.ts` counts real statements against real D1.

## What Habits deliberately does NOT do

Generate Tasks · become overdue · enter a Task count, a Project's progress or an
Attention warning · send a reminder · work offline (DEBT-155) · appear in a
Review figure (DEBT-156) · record a check-in in the global Activity stream ·
show a streak, a score, a flame or a chain · accept more than one completion per day
· accept a future date · accept a check-in against an archived Habit.

---

## Testing

| Layer | File |
|---|---|
| Schedule vocabulary, the version chain, which version governs a day and a week | `test/unit/habits/habit-schedule.test.ts` |
| Today / this week / recent consistency / the history strip, and their honest denominators | `test/unit/habits/habit-progress.test.ts` |
| Validation: title, notes, weekday normalisation, the 1–7 bound, future dates, cursors | `test/unit/habits/habit-validation.test.ts` |
| The serialised view model and its wording | `test/unit/habits/habit-view.test.ts` |
| The repository contract's query shape (no per-Habit completion read) | `test/unit/habits/habit-query-bounds.test.ts` |
| The domain over real D1: isolation, archive, eligibility, timezone/DST, concurrency, undo, schedule history, Activity, statement counts | `test/kernel/habits.test.ts` |
| The routes over real D1: create, mutate, check-in, activity, and their failure modes | `test/kernel/habits-routes.test.ts` |
| The journey: create each cadence, check in from `/habits` and Today, undo, reload, Goal relationship, archive, history, schedule edit, global create, phone at 390 and 320, dark, axe, keyboard | `e2e/habits.spec.ts` |
| Evidence capture (opt-in) | `e2e/habits-screenshots.spec.ts` |
