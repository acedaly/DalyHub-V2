# V2.4 FOLLOW-01 — the week you planned, and the week you had

> **Implements:** [ROADMAP_V2_4 → FOLLOW-01](../roadmap/ROADMAP_V2_4.md#-follow-01--did-the-week-hold--delivered-2026-08-26)
> **Governed by:** [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)
> **Delivered:** 2026-08-26

---

## 1. The user problem

DalyHub asks the owner to commit to a week and then never mentions it again.

A Task can be planned for a day and completed on that day; planned and completed
later; rescheduled once or four times; taken off the plan; planned and never
finished; or completed without ever having been planned. Before this item every
one of those collapsed into "completed" or "not completed" — and three of them
were not visible at all.

That is not follow-through. The owner should be able to look back at a named week
and understand, truthfully and without a score:

> **What did I say I would do, and what actually happened?**

---

## 2. Starting state, reproduced

A week whose events are **known** was written into the local development database
— the same nine cases the E2E fixture now seeds — and `/plan?week=-1` was read on
`main` at `d87315c`, before any change.

The page said:

```
17–23 August 2026 · Last week
7 planned    15 still to place    15 overdue
```

Against a week that had actually held **eight** committed Tasks, plus one
completed without a plan:

| The week's history | What `/plan` said on `main` |
| --- | --- |
| Planned Monday, **done Monday** | On Monday, "Completed" |
| Planned Monday, **done Thursday** | On Monday, "Completed" — *indistinguishable from the row above* |
| Planned Monday → Wednesday → **Friday**, never done | On Friday, as though it had always been there |
| Planned Tuesday, **taken off the plan** Wednesday | **Absent** |
| Planned Wednesday, **still open** | On Wednesday |
| **Moved into** the week on Tuesday | On Thursday, as though it had always been there |
| **Moved out** of the week on Wednesday | **Absent** |
| **Completed without a plan** | **Absent** |
| Planned Friday, **withdrawn the following Monday** | **Absent** |

Four of nine outcomes were invisible, two more were indistinguishable from each
other, and the headline figure — "7 planned" — was a count of what the Tasks
carry *now*, not of what the week held. A week that quietly failed looked exactly
like one that worked.

The weekly Review said less still: its evidence surface reported completions,
contribution, health movement and carry-over, and **nothing at all** about the
plan. It was also silent about routines ([DEBT-156](PRODUCT_DEBT.md)).

---

## 3. The domain derivation

`app/kernel/activity-window/` is the new authority. It is pure — storage-free,
clock-free, React-free — and it answers one question: **what became of the work a
named period's plan held?**

### The vocabulary

Eight outcomes, each a different thing to have happened rather than a different
shade of failure:

| Outcome | Owner-facing words | Meaning |
| --- | --- | --- |
| `kept` | Done on the day planned | Completed inside the period, on the day the plan pointed at |
| `completed_late` | Done later than planned | Completed inside the period, after that day |
| `completed_early` | Done ahead of the day planned | Completed inside the period, before it |
| `carried` | Still open / Left unfinished / **Still to come** | Still owed at the close, still planned inside the period |
| `moved_out` | Moved out of the week | Still owed; the plan now points outside the period |
| `cleared` | Taken off the plan | Still owed; the plan was removed |
| `dropped` | No longer being done | Cancelled or parked since |
| `unplanned` | Done without being planned | Completed inside the period, which the plan never held |

Beside every entry, and never folded into the outcome:

- **`reschedules`** — how many times the plan moved from one day to another
  *inside* the period. Never a boolean: "moved once" and "moved four times"
  describe different weeks.
- **`movedIn` / `addedDuring`** — whether the work entered the period's plan from
  another day, or was placed with no plan at all.
- **`plannedDays`** — every day inside the period the plan pointed at, in order.
- **`planStillAhead`** — for a period still running, whether the planned day has
  arrived.

### Two questions, kept orthogonal

*Did it land on the day I said?* and *did the plan move?* are separate. A Task
moved on Tuesday and finished on its new Thursday is **`kept` with
`reschedules: 1`** — the roadmap's own criterion 2, and the words say both.

### Causality, not coincidence

`completed_late` means the plan pointed at an earlier day **at the moment the
work was completed**, reconstructed forwards from the events. It never means "the
Task carries an old date", which is a statement about now.

That distinction is falsifiable and is falsified in the test suite: a Task
planned Monday, completed Monday, and moved to Friday afterwards reads `kept`.
An implementation that judged completion against the Task's current
`scheduled_date` calls the same Task *four days early*
([§9](#9-test-falsification)).

---

## 4. Period and timezone semantics

One window type — `ActivityWindow` — with one convention, stated once:

- **inclusive in wall-calendar days**, `periodStart … periodEnd`;
- **half-open in instants**, `[startInstantIso, endInstantIso)`, where the lower
  bound is the owner's local midnight that starts `periodStart` and the upper
  bound is the owner's local midnight that starts the day *after* `periodEnd`.

So a Task completed at 23:59 on the period's last day is inside it and one
completed a minute later is not — **in the owner's own calendar**, which for a
Sydney owner is fourteen hours away from the naive UTC reading.

REVIEW-03's `ReviewPeriodWindow` is now an alias of this type and
`reviewPeriodWindow` a one-line call of the shared builder. Two things improved
with the move: there is one implementation for three consumers (Planning, the
Review, and FOLLOW-02's Goal movement), and local midnight now resolves through
`ownerDayStartInstant`, which walks forward to the first hour that **exists** in a
zone whose DST transition skips midnight rather than degrading to UTC.

Every derived figure states the window it covers, and:

- **a day that has not happened is never a miss.** A running period counts
  `carriedAhead` separately from `carried`, so "still to come" can never be
  printed as "left unfinished".
- **a period still running is never described as having failed work it has not
  reached.** The phase (`future` / `running` / `closed`) decides the tense.

These are HABITS-01's two unsayable sentences, promoted to a product-wide rule by
ADR-110 decision 5 and made structural here rather than editorial.

---

## 5. Why the result is DERIVED, not stored

ADR-110 decided this before the first line was written, and the implementation
did not need to argue with it: **every fact was already in the Activity stream.**

`task.planned` carries `scheduledDate`. `task.rescheduled` and
`task.plan_cleared` carry `previous` as well. `task.completed` carries its
instant. That is a complete account of a plan's history, and the plan at any past
moment is reconstructible from it *without* reading what the Task carries now.

The one place the Task's current `scheduled_date` is used is the **initial
condition** — and only where no event speaks at all:

1. the last plan event **before** the window, which states the plan it left in
   force;
2. otherwise the first plan event **inside** the window, whose `previous` is the
   same statement read from the other side;
3. otherwise the first plan event **after** the window, likewise;
4. and only then the Task's own `scheduled_date`.

(4) is not "inferring history from current state where Activity is the
authority" — it is the value the events record deltas *from*. A Task created with
a planned day emits `entity.created` and no planning event, so for a Task nothing
has ever re-planned, the day it carries now is the day it has carried since it
existed. Wherever an event exists, the event wins. Asserted directly.

**Nothing was added to storage.** No `plan_weeks` table, no `plan_snapshots`, no
per-Task adherence column, no cached aggregate, no index and no migration.
REVIEW-03's versioned insight snapshot remains the only stored period artefact,
and the plan account is deliberately **not** in it — asserted by a test that reads
the stored row's text and fails if an outcome or a Task id appears in it.

### The information gap that WAS found, and the smallest correction

The three planning events are not the only writer of a planned day. TASKS-07's
series **move** and **skip** also shift an occurrence's dates — and recorded only
the *anchor*. For a repeating Task whose rule anchors on the DUE date and which
also carries a planned day, the planned day moved with **nothing in the Activity
stream saying it had**.

That is a genuine payload insufficiency rather than a preference, and it was
corrected at the cause. `#writeOccurrenceDates` now merges the pair it was missing
into the event it already writes, under the `changes.<field>.{before,after}` shape
`entity.updated` has always used:

```ts
changes: { scheduledDate: { before: previousScheduled, after: scheduledDate } }
```

No new event type, no new payload vocabulary, no schema change, no second
planning authority. The window read treats **any** event carrying
`changes.scheduledDate` as a plan movement, which is also what makes
`updateTask`'s and the scheduled-anchored series move's existing records readable.

Falsified: reverting the correction makes the D1 test report a moved occurrence's
planned days as `['2026-05-06']` instead of `['2026-05-04', '2026-05-06']` — the
Monday it was actually planned for, lost.

**One limit, stated rather than hidden.** The "withdrawn after the period" arm of
the candidate read matches the three planning event types only. A plan moved off
an in-window day *after* the period closed, by a series move rather than by
`planTask`, is not recovered by that arm. It is a narrow case (the Task must also
have acquired its in-window day without a planning event) and widening the arm
would mean scanning every `entity.updated` in the workspace forward from the
period's close, which is the unbounded read this design exists to avoid.

---

## 6. Two consumers, one authority

```
                     ┌──────────────────────────────────────┐
  activities ───────►│  ActivityWindowRepository            │  2 statements
  task_details ─────►│  readTaskPlanWindow(window)          │  bounded, flat
  spine_records ────►└───────────────┬──────────────────────┘
                                     │  subjects + normalised events
                     ┌───────────────▼──────────────────────┐
                     │  derivePeriodPlanAccount()           │  pure kernel
                     │  planAccountStatement() / entryReason│  the words
                     └───────┬──────────────────┬───────────┘
                             │                  │
                   /plan (the week you    the weekly Review
                    committed to)         (the week you had)
```

- **`readPeriodPlanAccount`** (`app/platform/activity-window/plan-account.server.ts`)
  is the one server-side read. Both loaders call it; neither reads a repository
  for it. It resolves the window from the owner's timezone once, and fails soft:
  a read that throws produces `available: false`, and the surfaces then *say* the
  history could not be read. "Nothing was planned" and "DalyHub could not read
  your history" are different sentences.
- **The words are the kernel's.** `planAccountStatement`, `planAccountFacts` and
  `entryReason` are the same functions on both surfaces, so the two cannot
  describe one week differently. `/plan` passes `periodNoun: "week"`; the Review
  passes `"period"`, because a Review's period may be a month.

### `/plan` — the week you committed to

**One statement at rest**, on its own row of the existing "Week at a glance" bar:

> This week's plan held 8 Tasks: 2 done (1 on the day planned), 4 left
> unfinished, 1 moved out and 1 taken off the plan. 1 Task was completed without
> being planned for it. *3 Tasks moved to another day 4 times between them and 1
> Task came into the week from another day.*

Behind it, the **same disclosure grammar** the Review-focus button beside it
already uses — `aria-expanded` onto a `hidden` panel — revealing the outcome
lines and every accounted Task with the dates its outcome was read from, each
linked to its record. The panel stays in the DOM; only the attribute changes,
because V2.4-GATE-01 root-caused a whole class of E2E failure to assertions
resolving against rows filed inside a collapsed disclosure.

GATE-02's invariants are untouched: the account adds **no control to a Task row**,
no selection state, no mutation path, and no second Task authority. `/plan` still
writes nothing.

### The Review — the week you had

A new section, **"The week you planned"**, at the head of REVIEW-03's existing
evidence surface: the same sentence, the same outcome lines, and up to four named
Tasks **per line** (rather than per section, so a week with eleven kept Tasks and
one cleared one still names the cleared one). Absence renders less: a period whose
plan held nothing renders no section at all.

---

## 7. Habit consistency in the Review (DEBT-156)

DEBT-156's stated risk was the denominator: *"a Review's period is an arbitrary
range … so a correct denominator means summing expectations across a
schedule-VERSION chain over that range."*

**That read already existed.** `evaluateHabitConsistency` has always taken
`fromIso`/`toIso` and has always summed a version chain — a day-based week
contributes one expectation per scheduled day *under the version in force on that
day*, and a count-based week contributes its target only once the week is whole
and elapsed. What was missing was a caller. Inventing a second Habit metric would
have been the duplicate the architecture forbids.

So FOLLOW-01 adds one bounded server read (`readHabitPeriodConsistency`,
HABITS-01's own two-statement shape) and one calm sentence:

> **Routines** — 2 of 3 scheduled check-ins
> Across 1 routine. 1 scheduled day passed without one — days a routine did not
> ask for are not counted.

Two integers and the window they cover. **No percentage**, even though the figure
would support one: `/habits` prints a proportion beside both integers because that
surface is about the Habits themselves, and a Review is the one surface where a
ratio is one careless sentence away from becoming a grade (ADR-102 §8). A period
that asked nothing of any Habit renders **nothing** — "0 of 0" is not a reading.

### The other correction found in review: a total that is a floor

`readHabitPeriodConsistency` is the first caller to hand `evaluateHabitConsistency`
a window the **owner** chose. Every HABITS-01 caller before it asked for four
weeks, so the evaluator's `for (index < 60)` was only ever a loop guard — but a
custom Review period is whatever two dates the owner picked, and past sixty
owner-calendar weeks the loop simply stopped. Walking forward from `fromIso`, what
it stopped *before* was the most recent weeks: the ones the Review is most about.
Meanwhile the reading still said `available: true`, `bounded` still meant only
"more Habits than we read", and the sentence still called the total exact. A
fourteen-month Review would have reported a confident, wrong number with nothing
on the surface to suggest it.

Two small changes, no new metric and no new storage:

- the guard is now `MAX_HABIT_CONSISTENCY_WEEKS`, exported, and the **caller**
  clamps its window forward from the period's end rather than letting the
  evaluator drop the tail silently. `HabitPeriodConsistency.fromIso` reports where
  the count really starts, so the truncation is in the data rather than absent
  from it;
- `bounded` now means *"this reading does not cover everything it was asked
  for"* — more active Habits than the read's bound, **or** a period longer than one
  reading walks. The Review's measure stops claiming `exact` and the sentence says
  so: *"Read under a limit and counted from 2025-06-02, so this is at least that
  many, not necessarily all of them."*

The test is an eighty-week custom Review whose only check-in falls in its **last**
week: before the change the reading reported `0 of 3` and swore to it; after it,
the check-in is counted, `bounded` is true, and the window is named.

---

## 8. Accessibility and mobile evidence

MEASURED from the live DOM, not inspected:

| Claim | How it was proved |
| --- | --- |
| No horizontal overflow at 393px (iPhone 15) with the account open | `expectNoHorizontalOverflow` — `documentElement.scrollWidth <= clientWidth + 1` |
| No horizontal overflow at 320px (the narrowest supported width) | same, after a resize |
| No horizontal overflow at 1440px in the **dark** appearance | same, with the appearance driven by `emulateMedia({ colorScheme: "dark" })` — the media query, not the appearance cookie (DHDS-13 §9's method note) |
| Every drill-down is a real touch target | `expectMinTouchTarget` — 44px under a coarse pointer |
| `axe` WCAG 2.2 AA clean, **with the account open** | `expectNoAxeViolations`, no rule disabled, on `/plan` at 393 and at 1440-dark, and on the Review's Progress tab |
| The Review's account survives the phone tier | resize to 393, headline visible, one fact re-read |

The account is a definition list at metadata weight under a sentence — no tile, no
gauge, no ring, no progress bar. Tokens only; `pnpm run dhds:check` reports 0
direct machinery references.

---

## 9. Test falsification

Four levels, and each one was **deliberately broken** to prove it fails for the
expected reason.

### Kernel — the history matrix (42 tests)

`test/unit/activity-window/task-plan-history.test.ts` is table-driven over a
Monday-to-Sunday week for an owner **ten hours ahead of UTC**, with every instant
written in owner-local time. It covers every case the roadmap named plus the ones
the implementation raised:

planned Monday → done Monday · planned Monday → done Tuesday · planned Friday →
done Tuesday (early is not late) · planned Monday → moved Wednesday → done
Wednesday · planned Monday → moved Wednesday → moved Friday · planned → cleared ·
moved into the week · placed during the week · moved out of the week · planned →
incomplete · completed but never planned · **completion outside the window** ·
completed then reopened · **multiple plan events in one day** · **withdrawn after
the week** · cancelled since · already finished before the week opened · **the
plan moved after completion** · and four owner-local **midnight boundaries** (last
minute in, first minute out, at both ends).

| Falsifier | Result |
| --- | --- |
| Judge completion against the Task's current `scheduled_date` | **1 failed** — *"the plan moved AFTER completion"* |
| Make the window's upper bound inclusive | **3 failed** — the Sunday-night boundary and both window-shape tests |
| Ignore `abandonedNow` | **1 failed** — *"cancelled since"* |
| Make `reschedules` a boolean (`= 1` rather than `+= 1`) | **3 failed** — both multi-move rows and the move-count wording test |

Restored: **42 passed**.

### Kernel — against real D1 (21 tests)

`test/kernel/activity-window.test.ts` writes every fixture through the
**canonical** repository (`createTask`, `planTask`, `clearPlan`, `completeTask`,
`moveTaskOccurrence`) at controlled instants, so nothing is asserted against
hand-written Activity rows.

| Falsifier | Result |
| --- | --- |
| Revert the occurrence-move payload correction | **1 failed** — *"reads a SERIES move's carried planned day"*: `['2026-05-06']` instead of `['2026-05-04', '2026-05-06']` |
| Drop the withdrawn-after-the-period arm | **1 failed** — *"finds work whose plan was WITHDRAWN after the week closed"* |
| Match the post-period reach on `before` only (as first written) | **3 failed** — the three hindsight cases below |

It also asserts workspace isolation both ways, and the budget:

- **exactly 2 statements** per window read;
- **flat**: a fifteen-Task week costs what a three-Task week does, and the larger
  week really is larger (15 subjects);
- **exactly 18 and 20 bound parameters**, both well inside D1's ceiling of 100 —
  the id set never crosses the process boundary, because it is a common table
  expression inside both statements. The numbers are asserted, not asserted about;
- `bounded` reported rather than silent truncation.

### The correction found in review: reaching PAST the period in one direction only

The post-period reach was written to mirror arm 3 exactly — a plan movement after
the period whose **`before`** day is inside it. That is right for work *withdrawn*
from a closed week, and blind to its mirror.

If a plan is moved **into** a period that has already closed — the owner backdates
a Task onto a Wednesday the week already spent — then `task_details.scheduled_date`
reads as a day inside the period, arm 1 holds the Task as a candidate, and the
statement fetched no event at all. With no event to read, `resolvePlanAtWindowOpen`
fell through to its third rule and took the current date as the plan at the
period's open: the closed week was credited with work committed to it in
hindsight. That is precisely the inference [ADR-110] forbids, arrived at not by
trusting `scheduled_date` deliberately but by failing to fetch the event that
would have contradicted it.

The correction is in SQL and nowhere else: the post-period branch now matches a
movement whose `before` **or** whose `after` lands in the period, in either
recorded shape (the three domain planning types and TASKS-07's
`changes.scheduledDate` pair alike — the arm had been matching only the former,
so a series move away from a closed week could make an occurrence vanish out of
the week it was genuinely spent in). With the movement in hand the plan at the
open resolves to what it replaced, and the Task falls out of the account.

Three tests were written first and observed to fail:

| Case | Before | After |
| --- | --- | --- |
| Planned for June; after the week closed, moved onto the week's Wednesday | `carried`, `plannedDayAtOpen` = the Wednesday | not in the account; `counts.planned` = 0 |
| Same, then moved on to July — passing *through* the closed week in hindsight | `carried` via the withdrawal arm reading the last move's `before` | not in the account; `counts.movedOut` = 0 |
| A due-anchored series occurrence genuinely planned inside the week, moved away by a series move after it closed | absent from the account entirely | `carried`, judged on its real planned day |

Nothing about a **running** period changed: for an open period there is nothing
after it yet, so both directions of the reach are empty by construction.

### Product projections

- `test/unit/plan/plan-query-bounds.test.ts` — the account is read **once**, for
  the whole week, inside the existing concurrent fan-out, under a named constant,
  and its ceiling is below the week's own planned-Task read.
- `test/kernel/review-insights.test.ts` — the Review's account matches the
  planner's derivation; a period whose plan held nothing renders no section; the
  account is **not** in the stored snapshot; routine consistency states its
  denominator and no percentage; a period that asked nothing of any Habit says
  nothing.
- Query budget: `REVIEW_INSIGHTS_QUERY_BUDGET` 14 → **17**, and
  `REVIEW_INSIGHTS_QUERY_BUDGET_WITH_HABITS` = **19**, both asserted. The guided
  Review's overview step moved 15 → 18.

### E2E (4 tests, 43.2 s)

`e2e/follow-01-week-account.spec.ts` drives the fixture week through the real
product: the exact outcome and reason of all nine Tasks, the drill-down links, the
"no score, no grade, no percentage" assertion over the rendered text, a **reload**,
a week with no plan, the phone and desktop widths with `axe`, and — the claim of
the whole item — that **every fact key the Review reports equals the one `/plan`
reports for the same week**, read from the same machine keys on both surfaces.

The fixture owns its isolation explicitly: everything is prefixed `fw-`, and
`afterAll` removes every row dependents-first. It adds no leaker to the 217
PR #227 measured.

---

## 10. Debt dispositions

| Entry | Disposition |
| --- | --- |
| **DEBT-156** — the Weekly Review says nothing about habit consistency | **CLOSED.** Its closing condition, clause by clause: a weekly Review's evidence states a habit figure; the denominator is provably the historical expectation (`evaluateHabitConsistency` sums the version chain, and the kernel test drives a Mon/Wed/Fri schedule effective from before the period); the step's query budget is unchanged **in shape** (bounded, page-wide, never per-Habit) and its new number is stated and asserted; and the wording assertion is extended — the Review's own tests now assert the sentence and that it carries no `%`. |
| **DEBT-34** — Reviews period context and Today integration are bounded first cuts | **ADVANCED, still open.** The Review half named by its V2.4 disposition is delivered: the period account is the last thing REVIEW-03's evidence was missing. The **Today** half is untouched and remains the entry's closing condition — Today still offers no "Start/Continue this week's Review". |
| **DEBT-173** — E2E specs assert against accumulated workspace state | **UNCHANGED, and deliberately not widened.** This item adds no leaker: the new fixture cleans up after itself. It also *met* the problem: the committed seed's fixed `scheduled_date` values mean which seeded Tasks fall in "last week" depends on the day the suite runs, so the journey asserts the five figures only this fixture can produce, plus internal consistency between the sentence, the lines and the rows. Recorded on the entry. It then **removed one existing leaker**, because the repartition collided with it: see §11.1. |
| **DEBT-194 / DEBT-164 / DEBT-197** — GATE-02's row invariants | **PRESERVED, not reopened.** The account adds no control to a Task row, no selection state and no date rendering; `/plan` gains one sentence and one disclosure, both outside the rows. |

**Raised.** [DEBT-205](PRODUCT_DEBT.md) — 536 seconds of E2E gate capacity is
stranded by `responsive.spec.ts`'s exclusive shards, with the measurement and both
candidate fixes ([§11](#11-e2e-budget-impact)).

No unrelated P2/P3 debt was opportunistically cleared.

---

## 11. E2E budget impact

V2.4-GATE-02 left the suite at 191.3 min against a 16.73 min per-partition
ceiling and wrote down, in `e2e/partitions.json`, that the next item adding E2E
coverage would have to confront the split rather than shave seconds. This is that
item.

**The new coverage was sized first.** The journey was consolidated from 6 tests
over 11 page loads to **4 over 8** — what was removed is redundant page LOADS (a
second navigation to re-open the same account at another width, and a separate
visit for the Review's phone tier, both now resizes in place), never an assertion.
MEASURED: **43.2 s**.

**Then the arithmetic, over the committed durations plus that file:**

| Partitions | Heaviest partition | Against the 16.73 min ceiling |
| --- | --- | --- |
| 12 | 1007.7 s = **16.80 min** | **OVER** |
| 13 | 918.7 s = **15.31 min** | 68% of `globalTimeout` |

Twelve does not fail by a rounding error a cheaper spec could absorb: the **mean**
of the ten non-sliced partitions is already 1005.0 s, so no packing of any
43-second file fits, and reaching 1004 s would mean deleting about a third of the
new coverage.

**`PARTITION_COUNT` moved 12 → 13.** It is the lever the derivation exposes for
exactly this case; the ceiling was **not** raised, which is the one answer
HARDEN-04 removed from the table. The cost is stated: ~2.3 min more runner time on
setup that buys no coverage, and one job past a pool figure interpolated from run
31445526789 — which measured **eighteen** shards queueing, not thirteen, while run
32333645709 measured twelve starting within one second of each other with none
queued. If that interpolation is right, the failure mode is already written down:
a queued job costs wall clock and nothing else, because a job that has not started
spends none of its `globalTimeout`.

**The better fix, measured and deliberately not taken.** `responsive.spec.ts` is
1471.6 s in one generated matrix file, and `--shard` is the only way to divide it,
so it takes two **exclusive** partitions of 735.8 s apiece against a 1004 s
ceiling — **536 s, 8.9 minutes, of gate capacity that no partition can use.** That
is why twelve looked exhausted. Recovering it needs either a redesign of
`derivePartitions` (both shards of a sliced group must carry an identical spec
list, or tests are lost and duplicated) or a near-50/50 split of that file into two
real spec files. Both change what every partition holds, and neither is a change to
make inside a feature PR whose own coverage is four tests. Raised as DEBT-205 with
these numbers.

No test was skipped, quarantined, weakened or deleted, and no timeout was raised.

---

### 11.1 What the repartition exposed: one leaked fixture

Moving spec files between partitions changes which specs share a workspace, and
this one surfaced a **pre-existing** cross-spec leak that had never had a
neighbour able to see it.

`e2e/audit-13-conversion-atomicity.spec.ts` converts Meeting action items into
real Tasks, then cleans up in `afterEach` via `cleanupMeetingByTitle(title)`. That
helper swept Tasks and Meetings by the SAME pattern — `title LIKE '<the exact
meeting title>'` — but a follow-up Task's title is not the Meeting's. It is the
action item's body, which these suites write as `` `${title} — do the thing` ``.
So the Meeting was removed and the Task it spawned was left behind, alive for the
rest of the partition under a title nothing else would think to look for. (The
suite-level sweep already used a prefix wildcard, which is why a *crashed* run
cleaned up correctly and a passing one did not.)

On `main` that was invisible: `audit-13` shared a partition with nothing that
reads Task rows by substring. The new split put it in **p01** alongside
`tasks-dependencies.spec.ts`, which asserts on a row matching *"Book the venue"*.
A leaked *"Meetings e2e idempotent-…-2 — book the venue"* made that locator
resolve to two rows, and Playwright's strict mode failed it — in CI first, then
reproduced locally under p01's exact spec order on a freshly seeded database.

MEASURED before the fix, after a full p01 run: two orphaned Tasks and **zero**
Meetings, which is the diagnosis stated as data. After it: zero of both, and
`tasks-dependencies.spec.ts:590` passes with every assertion unchanged.

The fix is one character class — `cleanupSql(`${title}%`)` — and it is the
fixture that was wrong, not the assertion. Nothing was skipped, no locator was
loosened and no timeout was raised to reach it. This is one leaker removed, not
[DEBT-173](PRODUCT_DEBT.md) solved: that entry stays open on its own terms.

---

### 11.2 What the repartition cost, measured

Raising `PARTITION_COUNT` was forced, not chosen. The committed 12-way split was
packed to within **0.1 s** of the ceiling — every whole partition between 992.5 s
and 1003.9 s against `MAX_PARTITION_SECONDS` of 1004 — so its emptiest bin had
**11.5 s** of headroom and the new journey needs 43.2 s. Twelve cannot hold it.

What was *not* forced is how much the split moves when the count changes.
`derivePartitions` is a greedy longest-processing-time bin-pack, so a change of
count re-derives every assignment from scratch. MEASURED against the merge base:

| 13-way split | heaviest partition | specs whose neighbour set changed |
| --- | --- | --- |
| Greedy LPT (committed) | 1003.9 s | **117 of 117** |
| Churn-minimal (simulated) | 1003.9 s | **0 of 117** |

Identical makespan, because the ceiling is what binds and the heaviest partition
is unchanged either way. In a suite that asserts against accumulated workspace
state ([DEBT-173](PRODUCT_DEBT.md)) a spec's NEIGHBOURS are part of its inputs,
so reshuffling the manifest is a semantic change to every spec in it, not only a
scheduling one — and §11.1 is what that cost, once, concretely.

**The derivation was deliberately NOT changed.** `manifestProblems` re-derives the
split and refuses a manifest that is not what the committed durations produce,
which is the guard that stops the manifest being hand-edited. A derivation that
remembered the previous grouping would have to take the committed manifest as an
input, making that guard validate the manifest against itself. Trading a real
guard for a scheduling nicety is not a trade this item is entitled to make inside
a feature PR, and the reshuffle is transitional in any case: the derivation is a
pure function, so the split is stable again from this commit until the next time
the count moves. The measurement is recorded against DEBT-173 as evidence for
whoever does decide to make churn an objective.

### 11.3 The two failures that did NOT reproduce

Three CI partitions went red across the runs of this branch. One was real and is
§11.1. The other two are recorded here rather than quietly re-run, because
"flake" is not a root cause:

| Failure | What happened next |
| --- | --- |
| `p05` — `project-settings.spec.ts:234`, the Today rail's "Continue working" | Passed on the **next** CI run with no relevant change. Its own comment already documents the fragility: the rail shows three projects ranked on `lastMeaningfulActivityAt`, so "a seven-candidate workspace crowds it out". Not reproduced; nothing changed for it. |
| `p10` — `inline-editor-overlay.spec.ts:230`, the priority journey | Did not reproduce locally in p10's own composition and order from a freshly seeded database — it passed in **10.1 s**. But the CI error was two errors stapled together, the cleanup poll's `Received: 1` beside `Test timeout of 30000ms exceeded`, and that pointed at something real: `clearProbes` polls for 30 s and is called twice per journey, inside a test inheriting Playwright's 30 s default. The helper's stated budget was never reachable. Fixed by giving those three journeys 90 s — the measured 10 s journey plus the two sweeps it is allowed to spend. |

Neither fix skips, quarantines or loosens anything, and neither re-ran a job to
turn a red result green.

---

## 12. Deliberately deferred to FOLLOW-02

FOLLOW-02 asks a **different** question over the **same** window — *did the Goals
move?* — and this item built the machinery for it rather than a surface with a
derivation hidden inside:

- **`ActivityWindow` and `ownerPeriodWindow`** are the period definition, already
  shared by three consumers. FOLLOW-02 resolves no boundary of its own.
- **`ActivityWindowRepository`** is where a bounded Activity query over a named
  window belongs. FOLLOW-02's read — a bounded query over a Goal's contributing
  Project ids inside the window, which
  [DEBT-78](PRODUCT_DEBT.md) already prescribes — is a method
  on it, not a second repository and not a Goals-module query.
- **The phase rule** (`future` / `running` / `closed`) and the two unsayable
  sentences apply unchanged: a Goal is never described as having failed to move in
  a period that has not happened.
- **The word discipline** — counts with printed denominators, absence rendering
  less, no percentage — is enforced by tests that read rendered text, and the same
  assertions extend to a Goal movement statement.

What this item did **not** do, on purpose: no Goal movement statement, no change
to `evaluateGoalProgress`, no Today Goal-panel change, no Goals-collection
ordering change, and no adherence figure of any kind.

---

## 13. Files

**New**

- `app/kernel/activity-window/` — `activity-window.ts`, `task-plan-history.ts`,
  `plan-account-words.ts`, `activity-window-repository.ts`, `index.ts`
- `app/platform/storage/d1/d1-activity-window-repository.ts`
- `app/platform/activity-window/plan-account.server.ts`
- `test/unit/activity-window/task-plan-history.test.ts`
- `test/kernel/activity-window.test.ts`
- `e2e/follow-01-fixtures.ts`, `e2e/follow-01-week-account.spec.ts`

**Changed**

- `app/kernel/review-insights/` — facts gain `planAccount` and `habits`; the
  window type becomes an alias; the evaluator gains two sections
- `app/kernel/habits/habit-progress.ts` — `HabitPeriodConsistency`
- `app/platform/habits/habit-facts.server.ts` — `readHabitPeriodConsistency`
- `app/platform/storage/d1/d1-task-repository.ts` — the occurrence-move payload
- `app/modules/plan/` — the loader's account read, the contract, the surface
- `app/modules/reviews/` — the insight context, the panel, the guided step budget
- `app/styles/plan.css`, `app/styles/insights.css`
- `scripts/e2e-partitions.mjs`, `e2e/partitions.json`, `.github/workflows/ci.yml`
- `test/unit/deploy/production-backup-encryption.test.ts` — the AUDIT-11 suite's
  eight forking tests carried Vitest's default 5 s while spawning a Node process,
  `gpg` and (twice) `sqlite3`. They crossed it on a shared CI runner. The budget
  is now a stated `FORKS_MS = 30_000` with the measurement that chose it recorded
  in the file. No assertion changed; nothing is skipped; a real regression still
  fails in under two seconds. Not FOLLOW-01's code, but FOLLOW-01's added test
  volume is what put the pool under enough pressure to expose it, so it is fixed
  here rather than left red.

---

## 14. Related

- [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) — the decision this item is built on
- [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers) · [ADR-030](../decisions/ARCHITECTURE_DECISIONS.md) — the plan IS the Task's `scheduled_date`
- [ADR-005](../decisions/ARCHITECTURE_DECISIONS.md#adr-005-shared-activity-model) · [ADR-012](../decisions/ARCHITECTURE_DECISIONS.md) — the Activity stream as the historical record
- [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md#adr-102-a-habit-is-a-behaviour-not-a-recurring-task--a-distinct-domain-with-effective-dated-schedules-owner-local-check-ins-and-no-manufactured-streaks) · [ADR-104](../decisions/ARCHITECTURE_DECISIONS.md) — no manufactured streaks, and the one proportion the product allows
- [`REVIEWS_MODULE.md`](../development/REVIEWS_MODULE.md) · [`HABITS_MODULE.md`](../development/HABITS_MODULE.md) · [`ACTIVITY_TIMELINE.md`](../development/ACTIVITY_TIMELINE.md)
- [`V2_4_GATE_02_HONEST_TASK_SIGNALS_2026_08.md`](V2_4_GATE_02_HONEST_TASK_SIGNALS_2026_08.md) — the queue this item leans on
