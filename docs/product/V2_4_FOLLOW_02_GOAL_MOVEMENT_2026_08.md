# V2.4 FOLLOW-02 — Did the goals move?

> **Implementation record.** Roadmap item:
> [`ROADMAP_V2_4.md` → FOLLOW-02](../roadmap/ROADMAP_V2_4.md#-follow-02--did-the-goals-move--delivered-2026-08-27).
> Governing decision: [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal).
> Delivered 2026-08-27.

---

## 1. The user problem

The Goal is the level at which DalyHub claims to show whether daily action
serves stated intention. For most Goals it showed nothing.

A Goal reading *"40% of Projects complete"* read the same whether two
contributing Projects advanced this week or nothing had happened since March,
and a Goal with no numeric target had no reading at all — Today's Goal panel
rendered **measurable Goals only**, so a workspace with Goals and no targets was
told *"No measurable Goals yet"* every morning. The top two levels of the
Area → Goal → Project → Task spine contributed nothing to the surface the owner
opens daily.

[DEBT-78](PRODUCT_DEBT.md) has carried the sentence since 2026-08-09:

> *"40% complete reads the same on a goal that gained two projects this month
> and one that has not moved since March — and* is it moving? *is the question a
> Goal exists to answer."*

FOLLOW-02 answers it, for **every** Goal, inside a **named window**.

---

## 2. Starting-state evidence

Reproduced on `main` at `e1ba3e4`, against a fixture whose events are known
(`e2e/follow-02-fixtures.ts`), driving the real application through the real
dev server. Owner timezone `Australia/Sydney`; the owner's week resolved to
**2026-08-24 … 2026-08-30**, with today 2026-08-27.

The fixture seeds six Goals, ten Projects and nine Tasks:

| Goal | Shape | What actually happened |
| --- | --- | --- |
| FM: Learn to sail | unmeasured, 1 Project | a Task completed **inside** the week, and another completed the day **before** it opened |
| FM: Restore the shed | unmeasured, 1 Project | its only completion was four days **before** the week opened |
| FM: Reach 70 kg | measurable | a reading recorded inside the week; no Project moved |
| FM: Read 24 books | measurable | no reading for forty days; a contributing Project **completed** inside the week |
| FM: Run the house well | unmeasured, 3 Projects | two of the three produced a completion inside the week |
| FM: Keep the records straight | unmeasured, 1 Project | its Project was **renamed** inside the week, and nothing else |

Plus a Project advancing **no** Goal, whose Task was completed inside the week.

### What `main` said

**Today's Goal panel.** Two Goals, both measurable, and the note *"1 of 2 on
track"*. **Four of the six Goals were absent entirely** — including the two that
had genuinely moved this week and the two that had not. A workspace with only
unmeasured Goals sees the empty line instead: *"No measurable Goals yet. Add a
target to a Goal and your progress shows up here."*

**`/goals`.** Twelve rows, nine of which read `Area · No measurement` and
nothing else. `FM: Learn to sail` — which moved this week — and
`FM: Restore the shed` — which last moved four days before the week opened —
were drawn **identically**:

```
ROW: FM: Learn to sail   |  | DalyHub V2 · No measurement
ROW: FM: Restore the shed |  | DalyHub V2 · No measurement
```

That is DEBT-78's sentence, reproduced.

**The Goal record** (`FM: Learn to sail`). *"Not measured yet"*, and under
*Recent contribution*:

```
FM: Book the course      FM: Sailing course · 24 Aug 2026 (3 days ago)
FM: Read the handbook    FM: Sailing course · 23 Aug 2026 (4 days ago)
Recently active
Contributing Task activity was recorded 3 days ago.
2 Tasks have contributed in the last 14 days.
```

Every word of that is true and none of it answers the question. The two
evidence rows straddle the week boundary — 24 August is inside it, 23 August is
outside — and nothing on the page distinguishes them, because ADR-040's
alignment window is an unbounded "most recent" against a fortnight rather than a
named period. **The starting state is not that a field is missing; it is that
the surfaces answer a different question and the owner cannot tell.**

### What it says now

```
Today          1 of 2 on track · 4 of 4 moved this week
               FM: Learn to sail          Moved this week.
                                          1 Project contributed · 1 Task completed
               FM: Run the house well     Moved this week.
                                          2 of 3 Projects contributed · 2 Tasks completed
               FM: Read 24 books  25% · No recent update
                                          Moved this week.
                                          1 Project contributed · 1 Project completed
               FM: Reach 70 kg    53% · Ahead
                                          Moved this week.
                                          1 measurement recorded

/goals         FM: Learn to sail          Moved this week. · 1 Project contributed · 1 Task completed
               FM: Restore the shed       No movement yet this week.
               FM: Keep the records …     No movement yet this week.
               FM: Run the house well     Moved this week. · 2 of 3 Projects contributed · 2 Tasks completed

Goal record    Movement
               Moved this week.
               1 Project contributed · 1 Task completed
               24 Aug 2026 – 30 Aug 2026
```

The same sentence, from the same value, on all three.

---

## 3. What "Goal movement" means, exactly

> **A Goal MOVED inside a named window when the append-only Activity stream
> records at least one OUTCOME event, inside that window, on the Goal itself or
> on work that structurally contributes to it.**

Three properties do the work, and each of them is a refusal:

1. **Outcome, not activity.** Something *happening* near a Goal is not the Goal
   moving. The accepted set is five events that each record a thing being
   *finished* or *measured*, and nothing else.
2. **Bounded, and the bound is named.** Every statement carries its window in
   its own sentence (*"this week"*), and the Goal record prints the window's
   actual days. There is no unbounded "Moving" state whose meaning depends on
   query history.
3. **Structural, not incidental.** Contribution is the ONE indirect path
   `SPINE_MODEL.md` allows — `Task → task.belongs_to_project → Project →
   project.advances_goal → Goal` — plus events on the Goal itself. A Project
   that advances no Goal reaches none.

---

## 4. Events ACCEPTED as movement

`GOAL_MOVEMENT_KINDS`, in the order a statement lists them:

| Kind | Stored event | Why it is movement |
| --- | --- | --- |
| `task_completed` | `task.completed` on a Task under a contributing Project | the ordinary case: work that serves the Goal got finished |
| `project_completed` | `project.completed` on a contributing Project | a whole body of work finished is unambiguously the Goal advancing |
| `measurement_logged` | `goal.measurement_logged` | GOAL-02's own *"meaningful progress event"*, named as such where it is defined |
| `milestone_completed` | `goal.milestone_completed` | the milestone equivalent of a reading |
| `goal_completed` | `goal.completed` | the largest movement a Goal can make; the week it happened in must not read "no movement" |

---

## 5. Events deliberately REJECTED

Each with the reason, because "we only count these five" is only defensible if
the refusals are.

| Not counted | Reason |
| --- | --- |
| `entity.updated` on a Project or Task | **Changing a Project title is activity; it is not the Goal moving.** Metadata is not progress. This is the single most important refusal in the feature and it has its own real-D1 test. |
| `entity.created` | Adding work is *intent*, not outcome. A Goal that gained five Tasks and finished none has not moved. |
| `task.planned` / `task.rescheduled` / `task.plan_cleared` | FOLLOW-01's question, not this one. Planning is a commitment; movement is what became of it. |
| `task.waiting_started` / `_changed` / `_cleared` | Workflow state. |
| `task.reopened` / `project.reopened` / `goal.reopened` | An outcome being **undone** is not forward movement. Counting a reopen would let a Goal "move" by going backwards. |
| `goal.measurement_corrected` / `goal.measurement_removed` | Repairing the record of the past is not new movement. |
| `goal.target_reached` | Appended by the **same atomic write** as the reading that caused it. Counting both would count one act twice. |
| `goal.details_updated` | Configuration — changing how a Goal is measured is not measuring it. |
| `entity_link.created` for `project.advances_goal` | Linking an existing Project to a Goal changes what *contributes*, not what *happened*. Counting it would credit a window with work finished outside it — and if the newly-linked Project then does something, that shows up as movement in its own right. |
| `entity.deleted` / `entity.restored` | Tidying. |
| anything in another workspace | Structural: the repository is workspace-bound (ADR-010) and every arm binds the workspace id. |
| anything outside the window | Structural: half-open instant bounds, `[start, end)`. |

**One documented approximation.** Contribution is resolved from the **current**
`project.advances_goal` links, so a Project linked to a Goal after a Task under
it completed still contributes that completion. This is the same approximation
`D1AlignmentRepository` and FOLLOW-01's ancestry resolution both make and both
state; reconstructing historical link membership would need every link event to
carry a reversible before/after pair, which they do not. It is recorded here
rather than hidden, and it is the reason a link is not itself movement.

---

## 6. Period semantics

The window is **the owner's current calendar week**, resolved by
`goalMovementWindow()` from `planningWeekStart(todayIso, firstDayOfWeek)` and
`ownerPeriodWindow(...)` — FOLLOW-01's machinery, reused rather than rebuilt.
There is **no Goals-specific date helper and no second period abstraction**.

- A week rather than a day, because a Goal is an outcome and outcomes rarely
  move daily. *"No movement today"* would be true of almost every Goal on almost
  every day, which is a statement with no information in it.
- The week is the period the product already agrees on: `firstDayOfWeek` plus
  the owner's timezone is what `/plan`, the weekly Review and FOLLOW-01's
  account all use.
- Boundaries are **inclusive of both wall-calendar days** and **half-open in
  instants**: `[startInstantIso, endInstantIso)`. A completion at 23:59 owner-local
  on Sunday is inside; one a minute later is not.
- The window carries a **phase** (`future` / `running` / `closed`) and the phase
  decides the wording, structurally rather than editorially:

| Phase | Moved | Says |
| --- | --- | --- |
| `future` | — | *"This week has not started."* — never "no movement" |
| `running` | yes | *"Moved this week."* |
| `running` | no | *"No movement yet this week."* |
| `closed` | yes | *"Moved this week."* |
| `closed` | no | *"No movement recorded this week."* |
| any | unreadable | *"Movement could not be read."* — never "no movement" |

**"Stalled" is not in the vocabulary.** Seven days without a qualifying outcome
does not prove a Goal has stalled; it proves this window holds no evidence of
movement, which is a smaller and truer thing. The words say exactly that, and
name the window while doing it. Neither *failing*, *poor*, *bad* nor *neglected*
appears — the last of those is ADR-040's own alignment answer and stays there.

---

## 7. Relation to alignment (AREA-03 / ADR-040)

They are **different questions with different windows**, and they compose.

| | Alignment | Movement |
| --- | --- | --- |
| Question | does the Goal have a reachable structure that has had attention? | did an outcome happen inside seven named days? |
| Window | unbounded "most recent", judged against a 14-day boundary | one named period, half-open |
| Vocabulary | `entity.created`, `entity.updated`, completions, reopens, planning, waiting | five outcome events |
| Answer | `completed` / `no_structure` / `unreachable` / `active` / `neglected` | moved / not moved, with counts |

All four cross-combinations are legitimate and asserted:

- **aligned but not moved this week** — a Goal whose Projects were edited on
  Tuesday and finished nothing;
- **poorly aligned but moved** — every contributing Project archived, and one of
  them completed inside the window before it was;
- **numerically on track with no movement this week** — GOAL-02 says *Ahead*,
  FOLLOW-02 says nothing happened;
- **unmeasured and clearly moving** — the case the product could not express at
  all.

The UI never implies these are impossible: the Goal record states alignment (the
summary band's chip and signal lines) and movement (its own block) separately,
and the `/goals` row's accessible name carries **both**.

---

## 8. Relation to GOAL-02's measurable status

`evaluateGoalProgress` remains the **one** place any Goal figure is computed.
FOLLOW-02 changed **nothing** in it: not the formula, not the trio, not the
chart, not the pace, not the projected date, not its refusals to fake a number.
GOAL-02's own unit set passes unmodified.

The guarantee is structural rather than promised: `GoalMovement` carries **no
status, no percentage, no fraction, no target, no trend and no pace**, so no
surface can read a measurable answer off it. A unit test enumerates the result's
keys and fails if any of those names appears.

Where a Goal is measurable, movement sits **beside** GOAL-02's answer, never
over it. `FM: Read 24 books` in the fixture is the case that proves the point:
its measurement status is *"No recent update"* (forty days without a reading)
and its movement is *"Moved this week."* (a contributing Project completed).
Both are true; neither is the other.

**"Did it move?" and "is it on track?" are different questions, and the product
keeps them separate.**

---

## 9. The shared query and derivation

```
Activity stream  ─┐
contributing      ├─►  ActivityWindowRepository.readGoalMovementFacts()   ← 2 statements
Project ids      ─┘         │
                            ▼
                    evaluateGoalMovement()   ← one pure derivation (~/kernel/alignment)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
      Today          Goals collection       Goal record
                     (row + pane)
```

| Piece | File | What it owns |
| --- | --- | --- |
| The window | `app/platform/activity-window/goal-movement.server.ts` | resolves the owner's week; reuses `ownerPeriodWindow` |
| The read | `app/kernel/activity-window/activity-window-repository.ts` + `app/platform/storage/d1/d1-activity-window-repository.ts` | one bounded, grouped read over the Activity stream |
| The rules | `app/kernel/alignment/goal-movement.ts` | `evaluateGoalMovement` — pure, clock-free, storage-free |
| The words | `app/kernel/alignment/goal-movement-words.ts` | `goalMovementStatement`, `goalMovementRecap` |
| The drawing | `app/shared/alignment/GoalMovementLine.tsx` | the one component all three surfaces render |

[ADR-110] decision 6 and DEBT-78 both name `~/shared/alignment` as the home;
the rules live in `~/kernel/alignment` and the barrel re-exports them, which is
exactly the arrangement alignment itself already has.

**The read returns AGGREGATES, not events.** Everything the product says about
movement is a count, a distinct-Project count or the most recent day, so the
aggregation happens in SQL. That is what makes the read bounded *by
construction*: a Goal with four thousand completed Tasks costs what one with two
costs, and there is no event ceiling that could silently drop a Goal's only
piece of evidence the way a row limit would.

**Nothing is stored.** No `goal_snapshots`, no trend column, no cached movement
flag, no migration. A real-D1 test reads the workspace's Activity count before
and after two movement reads and fails if it changes, and a second asserts the
answer flips the instant history changes with no reconciliation step.

---

## 10. Consumer 1 — Today

The change with the largest user-visible consequence.

- **`loadGoalSummaries` no longer excludes unmeasured Goals.** It used to
  `continue` past every Goal with no measurement configuration; an unmeasured
  Goal now arrives with a truthful movement statement instead of a blank.
- **No fabricated percentage.** An unmeasured Goal renders **no**
  `GoalProgressReadout`, no bar and no `progressbar` role. *"No numeric target"
  is not "0%"*, and giving it visual parity with a measured Goal would be the
  fabricated precision `PRODUCT_PRINCIPLES` forbids. The E2E journey asserts
  the absence.
- **A measurable Goal is untouched** and gains a restrained movement line under
  its existing readout.
- **The empty state stopped lying.** *"No measurable Goals yet"* was shown to a
  workspace holding six Goals. It now reads *"No open Goals yet. Add a Goal and
  whether it is moving shows up here."* — the empty state it always claimed to be.
- **Two facts, each with its own denominator.** The panel's note is
  `1 of 2 on track · 4 of 4 moved this week`. "On track" is GOAL-02's question
  and can only be asked of a measurable Goal, so its denominator is the measured
  subset; "moved" can be asked of every Goal on the panel, so its denominator is
  the whole set. The `Goals on track` stat card was narrowed the same way — it
  said *"of N measurable goals"* about a set that now contains unmeasured ones.
- **The ranking gained two buckets and reordered nothing existing.** Measured
  Goals keep exactly the four predicates and the order they had:

  ```
  0  measured · behind its own schedule or past its own date
  1  measured · target date inside a month
  2  UNMEASURED · moved inside the window
  3  measured · not checked in for a week
  4  measured · everything else
  5  UNMEASURED · no movement inside the window
  ```

  Bucket 5 is deliberately below every measured Goal: a Goal with no target and
  nothing to report this week is the least useful thing a daily surface can
  show, and letting it displace a measured Goal that is moving would make the
  panel worse than before. This was found by measurement, not by reasoning —
  the first cut put unmeasured-and-silent Goals at rank 4 and knocked
  `FM: Reach 70 kg` off Today entirely.
- **The Projects page's compact Goal rail is byte-for-byte unchanged.** It is a
  measurement rail and does not ask for movement, and an unmeasured Goal is
  included only when the caller asked for movement — because movement is the
  only thing it has to say.

---

## 11. Consumer 2 — the Goals collection

- Every row carries the movement statement in a new shared `signal` slot on
  `ProgressRow` (a sentence wraps; the row's `context` line does not, so the
  Goal's **name** keeps priority at every width).
- The pane beside the list renders the **same object**, looked up rather than
  re-read — selecting a Goal costs nothing. Only a `?goal=` naming a Goal that
  is not on the page pays for a second read, which is the case REDESIGN-04
  already accepts a whole detail read for.
- The row's accessible name carries **both** derived answers the drawing keeps
  quiet: ADR-040's alignment state and FOLLOW-02's movement.
- The read respects the pagination boundary by construction: the ids are this
  page's ids, so a second page costs a second read of the same shape rather than
  a read of the workspace's whole history.

### DEBT-120 — the ordering decision, taken and recorded

The collection's order is the workspace-wide **alignment** rank, established in
SQL before pagination with the keyset cursor bound to it (DEBT-23). DEBT-120
asks whether that is still the right order now that UIX-03 turned the surface
into an outcomes gallery, and FOLLOW-02 was told to decide from evidence rather
than to close it automatically.

**Decision: Option A — the ordering does not change, and DEBT-120 stays open.**

What FOLLOW-02 settles: **movement is an attention signal, not an outcome
metric.** *"Did work that serves this Goal produce an outcome in the last seven
days?"* is a question about the owner's engagement, in the same family as *"has
this Goal had recent contributing activity?"*. Adding movement therefore
*strengthens* the alignment reading of `/goals` rather than converting it, and
re-ranking the collection on it would produce almost the order it already has.

What FOLLOW-02 does **not** settle, and why the entry stays open: the surface
still carries UIX-03's **measurement** lenses (All / On track / Needs attention /
Completed), and whether GOAL-02's *status* should govern the order is the
unresolved half. Answering it needs a second ranking expression, a second cursor
scope, and a status the database can compute — while the status is a kernel
derivation over measurements, dates and the owner's calendar. That is a
disproportionate architecture change for a movement item, and forcing a closure
on the half FOLLOW-02 happens to answer would leave the other half undocumented.

**Truth beats a tick.** The entry is narrowed with the decision recorded.

---

## 12. Consumer 3 — the Goal record

- The movement block leads the record's summary, above the definition of done,
  separated by a hairline rather than wrapped in a second container (the summary
  band is already a card; UIX-03 spent a pass removing nested containers from
  this record).
- It is the **one surface with room to state the window's actual days**, so it
  does: `24 Aug 2026 – 30 Aug 2026` under the sentence. The headline already
  names the period; this names its boundaries.
- The Goals workspace pane states it in the same place relative to
  `Current status`, so the two Goal surfaces read the same.
- Alignment's *Recent contribution* panel is untouched and sits below it — the
  two answers are adjacent and distinct, which is the composition §7 describes.

### DEBT-192 — campsite rule applied, and it does not bite

DEBT-192 records that the Goal record and the workspace pane each declare their
own `toggleMilestone` / `addMilestone` / `deleteMilestone` / `reorderMilestones`
callbacks, and closes if a change *"mounts the record on `GoalMeasurementSection`
while it is there"*.

**Not taken, and DEBT-192 stays open.** FOLLOW-02 adds no measurement callback
to either surface. What it adds is a *different* component — `GoalMovementLine`
— which is shared by all three surfaces from the outset, so it creates no third
divergence and the campsite rule has nothing to clean. Migrating the record onto
`GoalMeasurementSection` would mean moving its check-in and configuration
sheets, their `opener` handling and their focus restoration: a Goals refactor
inside a movement item, which is exactly the bundling DEBT-192 itself records
DHDS-11 declining to do.

---

## 13. Query budget

**TWO D1 statements** for a page of up to `GOAL_MOVEMENT_CHUNK_SIZE` (50) Goals
— which is `DEFAULT_SPINE_PAGE_SIZE`, i.e. the largest ordinary Goals page.

| Property | Value | Asserted by |
| --- | --- | --- |
| Statements per page | exactly **2** | `test/kernel/goal-movement.test.ts` → *"costs exactly two statements for a whole page"* |
| Flat in Goals | six Goals cost what two do | *"is FLAT in the number of GOALS"* |
| Flat in events | twelve completions cost what one does | *"is FLAT in the number of EVENTS"* |
| Per-Goal query | **none** | the two assertions above |
| Bound parameters | `N + 1` and `N + 10` → **51** and **60** at N = 50 | *"stays inside D1's 100-bound-parameter ceiling for a full page"* |
| Empty page | **0** statements | *"costs NOTHING for an empty page"* |

The id list is bound **once per statement**, through a `VALUES` common table
expression both movement arms join, rather than three times through three `IN
(…)` lists — which is the difference between 60 bound parameters and 160, and
D1 refuses past 100.

**Route costs.** Today's loader gains one grouped read beside the three it
already made (configuration, measurement summaries, milestone weights). The
Goals collection gains one beside the six it already made, plus a preference
read (its own failure domain, falling back to the product default). The Goal
record gains one beside the eight it already made. None of them is per-Goal.

---

## 14. Mobile and accessibility

Measured from the live DOM, not eyeballed.

| Check | Where | Result |
| --- | --- | --- |
| No document horizontal overflow | `/today` at 393 and 320; `/goals` at 320, 393 and 1440 | clean at every width |
| Goal name keeps priority | `/today` at 393 | title's `scrollWidth ≤ clientWidth` — painted at full content width, not ellipsised to make room for the sentence |
| Movement wording wraps intentionally | `/goals` at 320 | the longest statement the feature produces (*"2 of 3 Projects contributed · 2 Tasks completed"*) wraps inside its row; `overflow-wrap: anywhere` on both lines |
| axe WCAG 2.2 AA | `/today` at 320 (light), `/goals` at 1440 (dark) | clean, **no rule disabled** |
| Dark appearance | driven by `emulateMedia({ colorScheme: "dark" })` | not the appearance cookie — DHDS-13 §9's method note |
| Meaning without colour | everywhere | the statement is a **sentence**; there is no badge, no tone and no dot. `data-goal-movement` drives weight and text colour together, and neither is the only carrier |
| Keyboard | — | **no new interactive control was added**, so there is nothing new to reach. The movement block is static text inside surfaces whose focus order is unchanged |

**There is deliberately no badge whose only distinction is green/red.** Movement
is an observation about a bounded window, and a two-colour chip would turn it
into a verdict — the grade [ADR-110] decision 4 refuses.

---

## 15. Testing, and the falsifiers

| Suite | Count |
| --- | --- |
| `test/unit/alignment/goal-movement.test.ts` (the rules matrix) | **34** |
| `test/kernel/goal-movement.test.ts` (real D1) | **29** |
| `e2e/follow-02-goal-movement.spec.ts` | **2** |
| Full unit suite | 6591 passed / 462 files |
| Full kernel suite | 2945 passed / 185 files |

**Falsification — six rules broken deliberately, each observed to fail for the
intended reason and then restored.**

| # | Break | What failed |
| --- | --- | --- |
| 1 | count `entity.updated` on a Project as movement | *"does not count a metadata-only Project edit"* |
| 2 | count `entity.created` and `task.reopened` as movement | *"does not count a Task CREATED under a contributing Project"* **and** *"does not count REOPENING a completed Task as forward movement"* |
| 3 | change the window's upper bound from `<` to `<=` | *"does NOT count the same completion AFTER the window"* **and** *"excludes the EXACT exclusive upper bound"* |
| 4 | let `moved` ignore the window's phase | *"refuses to call a FUTURE window moved even if facts claim events"* |
| 5 | drop the `movedProjectCount` denominator from the wording | *"sums several kinds into ONE result with the evidence intact"* |
| 6 | resolve the latest movement day in UTC instead of the owner's calendar | *"reports the OWNER-calendar day of the most recent qualifying event"* |

Falsifier 6 is worth naming: the **first** version of that test did not catch
the break, because it used 23:30 owner-local in a UTC+10 zone — which is still
the same UTC date. The test was wrong, not the implementation, and it was
corrected to 08:00 (where owner-local and UTC dates genuinely differ, in both
directions) before it was trusted. **A falsifier that passes is a test that
proves nothing.**

**Which rule is tested where, and why not both.** The unit matrix owns the
RULES over synthetic facts; the D1 file owns WHICH stored event becomes which
kind. A rule enforced in one place cannot be double-asserted honestly, so the
unit matrix says so in its own header rather than mocking a repository.

**Product-level parity.** The E2E journey reads a stable machine key
(`data-goal-movement`, `-events`, `-projects`) from all three surfaces and
asserts they are **equal objects** — not three sentences that happen to match
today. The words are asserted once, where they are read.

---

## 16. Debt dispositions

| Entry | Disposition |
| --- | --- |
| **DEBT-78** — Goals can state completion but not trend | **CLOSED.** Its closing condition, verbatim: *"A goal's direction is stated in the same words on Today and on its record, derived once, with no new table and no per-goal query on the Today route."* All four met and asserted. Its prescribed path was followed exactly — a bounded Activity query over the contributing Project ids inside a named window, derived once in `~/shared/alignment`, no snapshot table. |
| **DEBT-120** — the Goals gallery is ordered by alignment, not by outcome | **NARROWED, still open.** The decision FOLLOW-02 could take is recorded (§11): movement is an attention signal, so it does not convert the surface, and the alignment order stands. The half it cannot take — whether GOAL-02's measurement status should govern the order — still needs the second ranking expression and cursor scope the entry names. |
| **DEBT-192** — a Goal's measurement callbacks are declared twice | **NOT TAKEN, still open.** FOLLOW-02 adds no measurement callback to either Goal surface, so the campsite rule has nothing to clean (§12). |
| **DEBT-183** — a Goal has no status vocabulary | **EXPLICITLY NOT TAKEN.** Re-read and confirmed still real and still correctly deferred. No Goal status column, enum, filter, picker, Activity verb or mutation was added. A movement statement is derived historical evidence; an owner-set condition is a different domain decision. |
| **DEBT-184** — a Goal's Area cannot be changed after creation | **EXPLICITLY NOT TAKEN.** Re-read and confirmed still real. No Goal re-parenting work, no `move` intent, no spine change. |
| **DEBT-173** — E2E specs assert against accumulated shared state | **PRESERVED, no new leaker.** `follow-02-fixtures.ts` owns every row it writes under an `fm-` prefix, cleans up dependents-first in `afterAll`, and is idempotent at both ends. It asserts **per-Goal** facts, never a workspace-wide count, so another spec completing its own Task cannot move a Goal it does not contribute to — which this file also proves as a product rule. No concrete new leaker was encountered, so nothing was fixed against the entry. |
| **DEBT-205** — 536 s of E2E gate capacity stranded | **PRESERVED, deliberately not taken.** FOLLOW-02's coverage fits under the current gate: `PARTITION_COUNT` is unchanged at 13 and the heaviest partition is 15.3 min against the 16.7 min ceiling (61% of `globalTimeout`). The stranded capacity is still stranded and still measured; the correct fix edits machinery every job depends on and belongs to a pass that takes it deliberately (§17). |

**No new debt was raised.** Everything FOLLOW-02 found was already in the
register.

---

## 17. The E2E budget

`follow-02-goal-movement.spec.ts` is **18.7 s over 2 tests**, measured locally
from a green run of the file with `--as local/v2.4-follow-02`. Thirteen
partitions then derive a heaviest of **15.3 min** against the 16.7 min
`MAX_PARTITION_SECONDS`, and `worst/mean` is 1.04.

**`PARTITION_COUNT` was not moved and the ceiling was not touched.** FOLLOW-01
warned that *"the next item that adds E2E coverage will have to answer that
question rather than shave seconds"*. The answer is that it did not have to:
the coverage was sized to fit rather than the gate resized to hold it.

- **2 tests over 5 page loads** — Today, `/goals` with a selection, the Goal
  record, then Today and `/goals` again for the width and appearance matrix.
- **Every other width and appearance is a resize or an `emulateMedia` in place**,
  because both re-evaluate without a fetch and the state under test is already
  on screen.
- **One axe scan per appearance** on the meaningful new state, not one per width.

DEBT-205 is therefore left alone: 536 s of capacity is still stranded in the two
exclusive `responsive.spec.ts` shards, FOLLOW-02 did not need it, and recovering
it means editing `derivePartitions` — machinery every job depends on, whose only
honest validation is a full gate run.

---

## 18. Explicit non-goals — held

- **No Goal snapshot table**, no trend cache, no stored movement flag, no
  migration, no schema or API change of any kind.
- **No fake percentage for an unmeasured Goal.** No ring that empties, no 0%,
  no figure without a denominator.
- **No new Goal status model** ([DEBT-183](PRODUCT_DEBT.md)).
- **No Goal → Area move** ([DEBT-184](PRODUCT_DEBT.md)).
- **No momentum score, adherence score, streak, chain, grade or ranking of
  Goals against one another.** No percentage appears in any movement statement,
  asserted over rendered output.
- **No forecast** beyond the pace GOAL-02 already computes and already refuses
  to fake.
- **No AI**, no goal coaching, no automatic interventions, no notification rules.
- **No new Analytics module and no new charting dependency.** No new dependency
  at all — `package.json` and `pnpm-lock.yaml` are untouched.
- **No broad Goals redesign.** `evaluateGoalProgress` unchanged;
  `~/shared/alignment` unchanged apart from an addition; `GoalRepository` still
  read-only; `GoalDetailsRepository` still the only mutation path for the
  Goal-owned fields; Project contribution still derived and never cached.
- **No second period machinery.** FOLLOW-01's `ActivityWindow`,
  `ownerPeriodWindow`, `ActivityWindowRepository` and phase semantics are
  consumed, not reimplemented.

---

## 19. What remains after V2.4

With FOLLOW-02 delivered, the **planned V2.4 product sequence is complete**
apart from the owner-blocked halves of V2.4-GATE-01 (a scheduled backup that
completes, and a production release verified with credentials) — both of which
need secrets the repository cannot supply.

Carried forward, each with a home already recorded rather than as an oversight:

- **DEBT-120** — whether `/goals` orders by measurement status, and the second
  ranking expression and cursor scope that would need.
- **DEBT-192** — the Goal record adopting `GoalMeasurementSection`.
- **DEBT-183 / DEBT-184** — the two Goal domain capabilities, each its own
  decision.
- **DEBT-205** — the stranded gate capacity, and the `derivePartitions` change
  or spec split that recovers it.
- **DEBT-34** — Today still offers no *"Start this week's Review"*.
- The **LATER** table in `ROADMAP_V2_4.md`: search recency, tags and capture
  grammar, a first-run experience, the offline slice, Plan's board proportions.

**What V2.5 should be is a decision, not a continuation, and it is deliberately
not started here.**

---

## Related documents

- [`ROADMAP_V2_4.md`](../roadmap/ROADMAP_V2_4.md) — the programme.
- [`V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md`](V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md) — the window machinery this reuses.
- [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) — derived, never stored.
- [ADR-040](../decisions/ARCHITECTURE_DECISIONS.md) — Goal alignment, the answer movement composes with.
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-78, DEBT-120, DEBT-192, DEBT-183, DEBT-184, DEBT-173, DEBT-205.
