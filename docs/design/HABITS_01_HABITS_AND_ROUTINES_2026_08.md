# HABITS-01 — Habits and routines (V2.3, August 2026)

> The full record of the third V2.3 item. The accepted decision is
> [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks);
> the module's day-to-day behaviour is [`HABITS_MODULE.md`](../development/HABITS_MODULE.md).
> Evidence: [`assets/v2-3-habits-01/`](assets/v2-3-habits-01/).

---

## 1. Why a Habit is not a recurring Task

DalyHub already stores structured Task recurrence, so the cheap answer to "add
habits" was a flag on a Task and a saved view over it. The roadmap rejects that
answer in one line, and it is right:

> A recurring TASK is a routine you must not forget.
> A HABIT is a behaviour you are trying to build.

Stated as properties, rather than as a feeling:

| | recurring Task | Habit |
|---|---|---|
| what it is | an obligation | a behaviour |
| when | a due date | a cadence |
| late? | yes — it goes overdue | **never** |
| a missed day | a debt carried forward | a day |
| belongs to | a Project or an Area | an Area, and it may *support* a Goal |
| counts towards | that Project's progress, Task statistics, the planning queue | **nothing** |
| what it measures | completion | consistency |
| next occurrence | a ROW, because forgetting it has a cost | **no row at all** |

Every row of that table would have become false if a Habit were a Task. The
schema is what makes them true instead: there is no Task, no occurrence and
nothing generated, so a missed Habit cannot become an overdue Task, cannot
appear in a Task count and cannot move a Project's progress — structurally,
rather than by a filter somewhere remembering to exclude it.

## 2. The data model

Three additive tables (migration `0044`), plus the `entities` row every DalyHub
record has. A Habit is NOT a spine record and adds no `spine_records` row: it
sits ADJACENT to Area → Goal → Project → Task, exactly as a Person does.

```
entities            id, type='habit', title, timestamps, deleted_at
habit_details       notes, archived_at, archived_on, timestamps
habit_schedules     kind, weekdays, target_count, effective_from, effective_to   [chain]
habit_completions   (workspace_id, habit_id, completed_on) PRIMARY KEY, recorded_at
entity_links        habit.supports_goal · habit.belongs_to_area
```

Two of those lines carry the whole design:

- **`habit_completions`'s primary key IS the invariant.** "At most once per
  owner-local calendar date" is a property of the database, not of a control's
  disabled state. Two taps that race produce one completion because the loser's
  `INSERT OR IGNORE` writes nothing — the database arbitrates, and application
  code never has to.
- **`habit_schedules` is a CHAIN, not a row.** See §4.

## 3. The schedule vocabulary

Three kinds, and staying small is the decision:

| kind | means | example |
|---|---|---|
| `daily` | every day | Take medication |
| `weekdays` | a selected set of weekdays | Mon / Wed / Fri; Weekdays; Weekends |
| `weekly_count` | N times in the owner's calendar week, on any days | Strength training 3× |

Deliberately absent: monthly cadences, nth-weekday-of-month, every-X-days, end
conditions, times of day, reminders, multiple completions per day, quantities.
Each of them turns *how often do I want to do this?* into a rule language, and
none is needed to answer the question the surface exists for. Advanced TASK
recurrence (TASKS-12) is a different model for a different object and is not
shared.

**A count-based Habit is never "due" on a day.** `isScheduledOn` answers `false`
for every date, and that is the point rather than a gap: a Habit that asks for
three sessions a week is not failing on Tuesday, and pretending otherwise would
be an obligation the owner never expressed. Its expectation is a property of the
WEEK.

## 4. How historical truth is preserved

Changing Monday/Wednesday/Friday to Tuesday/Thursday must not rewrite what
DalyHub says the owner was supposed to do last month. If the current schedule
were the only stored fact, every historical figure would be recomputed from it
and the past would change every time the owner changed their mind — which is
the one thing a consistency measure must never do.

The smallest architecture that prevents it is a contiguous, non-overlapping
chain of effective-dated versions per Habit:

```
v1  weekdays [1,3,5]     2026-08-01 → 2026-08-18
v2  weekdays [2,4]       2026-08-19 → (open)
```

Changing a cadence closes the current version at **yesterday** and opens a new
one **today**. Amending a cadence set earlier the same day updates today's
version in place, so the chain never accumulates zero-length entries — and the
unique index on `(workspace, habit, effective_from)` refuses one anyway.

Two rules follow, and both are asserted:

- a DAY-based expectation is read from the version covering THAT DAY, so a week
  straddling a change reads half under each cadence — which is what happened;
- a WEEK's target (for `weekly_count`) is read from the version in effect on the
  last day of that week that has actually happened, i.e. `min(weekEnd, today)`.
  A past week's last day is in the past, so lowering a target today cannot make
  an earlier miss into a success; the current week's last elapsed day is today,
  so an edit made this morning applies to this week immediately, which is what
  the owner who just made it expects.

**Nothing else in DalyHub becomes temporal.** A Habit's title and notes are not
versioned, because renaming a Habit does not change what was expected of it.
There is no generic versioning framework and no temporal-table machinery.

## 5. Check-ins

A check-in is a durable fact: a Habit, an owner-local calendar DATE, and the
instant it was recorded. The date is the identity; the instant is provenance.

- **The date is stored, never re-derived.** Deriving it later would mean reading
  an instant through whatever timezone preference was current then — so moving
  countries would silently re-date the owner's history, and a DST transition
  would move a completion onto a different day.
- **The date is the OWNER's.** It is resolved once, through the one
  owner-timezone authority AUDIT-14 established. A client in another zone cannot
  move a completion onto tomorrow: the server checks the submitted date against
  the owner's today, and a future date is refused with an honest message.
- **Idempotent, and concurrent-safe.** A second check-in for the same day writes
  nothing and reports `already_recorded`; two racing writes produce one row.
- **Archived Habits cannot acquire completions.** The guard is in the statement
  (`AND d.archived_at IS NULL`), not in the UI, and the refusal reaches the
  caller as `HabitArchivedError` rather than as a silent success.
- **Unchecking removes exactly that day**, and removing a day that holds nothing
  is an honest no-op.

There is **one** check-in authority: `POST /habits/:id/check-in`. Today, the
`/habits` collection and the Habit record all post to it, all render the ONE
shared `HabitRow` over the ONE serialised shape, and therefore agree by
construction rather than by convention.

## 6. Goals and Areas

Two EntityLinks, both directed habit → target, in the relationship primitive the
product already has rather than a second join model:

```
habit.supports_goal      →  goal
habit.belongs_to_area    →  area
```

A Goal record shows a compact **Supporting habits** section, and the section says
what it is in words: *"They are evidence of the work, not part of the measured
progress."* Completing "Strength training" is evidence of the behaviour behind
"Reach 70 kg"; it is not a weight measurement. **The Goal's own measured progress
(GOAL-02) is untouched** — no check-in is a term in it, and there is no aggregate
habit score anywhere.

An Area record shows the same section, worded for an Area, and likewise counts
nothing into the Area's roll-up.

Both are read for a whole page of anchors at once (`readSupportingHabits`), so a
Goal gallery never becomes a query per card.

## 7. What Today gained

A compact routine band, BELOW the day's work and its schedule:

```
Habits                                              All habits
○ Strength training   3× weekly · Health   Any day this week · 1 of 3 this week
✓ Read                Every day · Health   Done today         · 2 of 7 this week
✓ Take medication     Every day · Health   Done today         · 2 of 7 this week
```

- It shows only the Habits today is actually asking about: a day-based Habit on
  the days it asks for, a count-based one while its week is unmet (or once it is
  done today, so the tick can be undone). A Habit that is not relevant today is
  simply absent.
- One-tap check-in and undo, through the one authority.
- **MEASURED**, because TODAY-TASK-01 spent a whole pass protecting the first
  task's position. The first task's Y, with and without the band:

| viewport | with habits | without habits |
|---|---|---|
| 1440 | **233px** | 233px |
| 393 | **263px** | 263px |
| 320 | **292px** | 292px |

  Identical, because nothing was inserted above it.

## 8. Weekly Planning and the Weekly Review

**Planning gained read-only context; Review gained nothing, deliberately.**

`/plan` shows a small **Routines this week** band in its aids column: names and
cadences, with the current week's progress beside them, and no control on any of
it. The band states its own boundary — *"Habits aren't placed on days and don't
become tasks."* A Habit cannot be given a day, cannot enter the "Still to place"
queue, cannot consume its bulk selection and never writes a `scheduled_date`.
PLAN-01's mutation authority is untouched, the queue's composition is unchanged,
and at 393 the band lands after the queue rather than between the week and the
work.

The **Weekly Review is deferred**, and the reason is specific rather than
squeamish. A truthful "habits: 8 of 10 scheduled check-ins" over a Review's
arbitrary period means summing expectations across a schedule-version chain for
a range that is neither a week nor a fixed number of days — a second aggregation
path threaded through REVIEW-02's guided workflow and its own bounded reads.
Done carelessly it would put a guilt figure in the one surface whose entire
design is calm. Recorded as **DEBT-156** rather than shipped half-considered.

## 9. How "calm over urgent" shaped the progress design

AGENTS.md §2 forbids manufactured streaks by name, and a habit tracker is the
single easiest place in a product to manufacture urgency. So:

**There is no streak. No flame, no "day 17", no chain, no score, no percentage,
no confetti, no red anything.** `test/unit/habits/habit-view.test.ts` asserts
that no string the product can produce about a habit matches
`/streak|chain|missed|failed|broken|don.t break|perfect|score|%/`.

What it shows instead is three factual readings:

```
Today        Done today · Not yet today · Not scheduled today · Any day this week
This week    2 of 3 this week   →   "Done this week" once met
Recently     9 of 12 expected check-ins        (a bounded four-week window)
```

Two sentences are made **unsayable**, and each has its own test:

- **an unscheduled day is never a miss.** A Monday/Wednesday/Friday habit on a
  Tuesday reads "Not scheduled today", offers no control at all, and its history
  square is drawn as almost nothing;
- **a future day is never incomplete.** Every window ends at the owner's today,
  and a partial week is excluded from the consistency figure rather than
  pro-rated — half a week's target is a number nobody chose.

The one place a count could read oddly — a seven-session week against a target of
three — is capped, so a big week can never hide a missed week in a summed figure,
and the week's own line says "Done this week" rather than a ratio.

## 10. The surfaces

**`/habits`** is a flat list, not a gallery: DESIGN_SYSTEM's card-vs-list rule
puts repeated homogeneous content in a list, and a Habit is a short title, a
cadence, a context and two counts. Hairline-separated rows on the flat ground,
an Active/Archived view switcher, the shared search field, the shared create
action.

**The Habit record** answers the four questions a record exists to answer, in
order: what am I trying to do (title, notes), how often (the header's cadence in
words), what does it support (Area and Goal in the header context), and how have
I been going (today, this week, and four weeks of history). The history is a real
`<table>` with row and column headers and a full sentence per cell — *"Wednesday
2026-08-12: done"* — so nothing is carried by colour, and it is four weeks rather
than a year because a contribution heatmap is a different product.

**Creating** asks for the least that can work: a name and a cadence. The
cadence's second half (which days? how many times?) is revealed by the choice
above it, so a weekday picker is never shown to someone who chose "every day".

## 11. The measurements

Every figure below is from
[`assets/v2-3-habits-01/measurements.json`](assets/v2-3-habits-01/measurements.json),
captured by `e2e/habits-screenshots.spec.ts`.

**No horizontal overflow anywhere.** `document.scrollWidth === clientWidth` at
320, 375, 393, 430, 820, 1280 and 1440, on the collection, the record, the create
page, the schedule editor, Today, `/plan`, the Goal record and the Area record.

**Touch targets.** The check control is the shared `.dh-check-circle-target`:
**45 × 45** on a phone, and 45 × 28 on a fine pointer at ≥ 48rem — the same
bargain every task row already strikes, and still comfortably above WCAG 2.2
SC 2.5.8's 24 × 24. The weekday toggles are **45 × 48** at every width, because
a small closed vocabulary should not shrink.

**Row anatomy.**

| viewport | habit row height | narrowest title |
|---|---|---|
| 1440 | 54px | 938px |
| 1280 | 54px | 778px |
| 820 | 54px | 506px |
| 430 | 83px | 341px |
| 393 | 83px | 304px |
| 320 | 83px | 231px |

The phone row is taller because the state column WRAPS below the title rather
than competing with it for a 320px line — which is why the narrowest title is
still 231px and nothing is clipped at any width.

**History grid.** 200px wide at every viewport, so four weeks fit a 320px phone
with room to spare and never scroll sideways.

**Today's first task.** Unchanged (§7).

## 12. Query bounds

Every read is a FIXED number of statements whatever it returns:

| read | statements |
|---|---|
| one Habit record | 2 (the Habit + its schedule chain) |
| a page of Habits | 2 (the page with its Goal/Area joins + every version for the page) |
| a week of completions for a page | 1 |
| supporting Habits for a set of anchors | 3 |
| Today's routine band | 2 |
| `/plan`'s routine band | 2 |

There is deliberately **no** `getCompletions(habitId)` on the repository: its
absence is what makes the N+1 unwritable rather than merely discouraged, and
`test/unit/habits/habit-query-bounds.test.ts` asserts that it stays absent.
`test/kernel/habits.test.ts` counts real statements against real D1 and proves
that twelve Habits cost exactly what one costs.

## 13. Deliberate non-goals

Habit reminders and Web Push (the data a future evaluator needs is stored;
HABITS-01 sends nothing) · offline check-ins (see DEBT-155) · a Review figure
(see DEBT-156) · an Analytics dashboard · a habit "score" · multiple completions
per day · quantities, water glasses, calories or dosages · time tracking ·
mood tracking · health integrations or wearables · social, shared or team habits
· leaderboards, badges, achievements · streak-loss mechanics · AI habit coaching
· automatically generated routines · habit-generated Tasks · calendar write-back.

## 14. Verification

**Unit (67 tests, `test/unit/habits/`).** The schedule vocabulary and its
labels; the effective-dated version chain and which version governs a given day
and a given week; today/week/consistency evaluation including the unscheduled
day, the future day and the week before the Habit existed; validation
(title, notes, weekday normalisation, the 1–7 bound, the refusal of a future
check-in date, cursor and window bounds); the serialised view model and its
wording; and the query-shape assertions that keep a per-Habit completion read
off the repository contract.

**Kernel (43 tests, `test/kernel/habits.test.ts` +
`test/kernel/habits-routes.test.ts`).** The real Workers runtime over real D1
with the committed migrations: creation and its Activity; absolute workspace
isolation on every read and write; an archived Habit refusing a completion and a
restored one accepting again; daily, weekday and N-times eligibility; the
owner's `firstDayOfWeek` and timezone deciding which week a date belongs to; a
DST boundary not moving a completion; two concurrent check-ins on the same day
producing exactly one row; undo removing exactly that row and no other; a future
date refused; a schedule change leaving prior weeks' expectations untouched;
Goal and Area relationships scoped to the workspace; the absence of a
`habit.checked_in` Activity event; and the statement counts behind every bounded
read.

**End-to-end (13 journeys, `e2e/habits.spec.ts`).** Creating each cadence and
seeing it in `/habits`; checking in and undoing from the collection and from
Today, with the two surfaces agreeing; a reload persisting the result; the Goal
relationship persisting and appearing in the Goal's supporting-habits section;
archiving removing a Habit from Today; historical completions staying visible;
a schedule edit changing the future and not the past; the global create surface
opening Habit creation; a phone journey at 390 and a no-overflow pass at 320;
dark appearance; axe in both appearances; and a keyboard-only create-and-check-in
journey. `/habits`, `/habits/archived` and `/habits/new` also join the shared
`accessibility.spec.ts` and `responsive.spec.ts` sweeps, so the module is held to
the same seven-viewport, both-appearance baseline as every other surface.

**Evidence.** `docs/design/assets/v2-3-habits-01/` — 29 captures across 320,
393, 820 and 1440 in both appearances, plus `measurements.json`, the numbers
§11 quotes.
