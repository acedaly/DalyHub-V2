# TASKS-12 — Advanced recurrence + dependencies

> **Delivered 2026-08-19.** The implementation record for the V2.3 roadmap item
> [TASKS-12](../roadmap/ROADMAP_V2_3.md). Accepted as
> [ADR-106](../decisions/ARCHITECTURE_DECISIONS.md#adr-106-a-task-dependency-is-a-directed-entitylink-not-a-second-join-model--derived-blocked-state-and-cycle--bound-enforcement-inside-the-write)
> and
> [ADR-107](../decisions/ARCHITECTURE_DECISIONS.md#adr-107-advanced-recurrence-widens-a-closed-vocabulary-and-dependencies-are-occurrence-local--one-successor-authority-a-remembered-grid-and-no-relationship-cloning).
> Module behaviour: [`TASKS_MODULE.md`](../development/TASKS_MODULE.md#advanced-recurrence-and-dependencies-tasks-12).
> Evidence: [`assets/v2-3-tasks-12/`](assets/v2-3-tasks-12/).

---

## 1. The governing distinction

Two capabilities ship together because owners meet them together, and they are
kept apart internally because they answer different questions:

> **Recurrence decides WHEN a Task occurrence exists.
> A dependency decides WHETHER an existing Task can proceed.**

Nothing in the dependency model mentions a date. Nothing in the recurrence model
mentions another Task. The one place they meet is §7, and the decision there
follows from the distinction rather than from convenience.

## 2. Advanced recurrence — what was added

TASKS-04 made recurrence structured DATA; TASKS-07 gave it two scheduling modes
and a series grid. TASKS-12 widens that closed vocabulary by four fields on the
same rule. There is still no cron string, no expression language, no RRULE
parser and no scripting.

### 2.1 Nth weekday of the month

```
Monthly on
  ○ The same day of the month
  ● A named weekday      [ Last  ▾ ] [ Friday ▾ ]
```

Stored as `ordinal` (`first` · `second` · `third` · `fourth` · `last`) plus the
one weekday in the existing `weekdays` column. The two monthly SHAPES are
mutually exclusive: "the 15th" is `anchorDay: 15, ordinal: null`, "the last
Friday" is `ordinal: "last", weekdays: [5]`.

**There is deliberately no "fifth".** A fifth Monday exists in roughly four
months a year, so a rule naming one is a rule the owner cannot predict — and
every product that offers it has to invent a silent fallback ("use the fourth",
"skip that month") nobody remembers choosing. `last` is the position people
actually mean, it exists in every month of every year, and it is the one that
stays true in a 28-day February.

`last` is computed BACKWARDS from the final day of the month, which is what makes
it correct in a 28-day February, a 29-day leap February and a 31-day January
without a special case for any of them.

### 2.2 Multiple weekdays

The kernel has accepted a weekday SET since TASKS-04 and the editor has offered
it since TASKS-07; TASKS-12's contribution is the guarantee, asserted rather than
assumed: **Mon/Wed/Fri is ONE recurrence and ONE series, not three.** A sixty-step
walk of a Mon/Wed/Fri rule produces sixty strictly-increasing dates, every one of
them a Monday, Wednesday or Friday, with no duplicate and one `series_id`
throughout.

### 2.3 End conditions

```
Ends
  ● Never
  ○ After a number of times   [ 12 ]   Counts this occurrence. 1 to 999.
  ○ On a date                 [ 30 Sep 2026 ]   An occurrence on this date still happens.
```

Two columns, mutually exclusive (both set is refused at the boundary).

**The current occurrence COUNTS.** `series.sequence` is 0-based, so the
occurrence in hand is number `sequence + 1` and the successor would be
`sequence + 2`; it is created only while that is `<= endsAfterCount`. "Ends after
1" therefore means this one and no more. The wording is on the control itself,
not only in this document.

**`endsOnDate` is INCLUSIVE**, and it is compared against the date the occurrence
actually falls on — after the weekend rule — because that is the date the owner
sees and the one they were choosing between.

### 2.4 The weekend rule

There is **no checkbox called "skip weekends" anywhere in DalyHub**, and that is
the decision rather than an omission: the phrase names three different behaviours
in three different products, and a checkbox cannot say which one it means. The
control offers four complete sentences about what will happen:

```
If it falls on a weekend
  Leave it on the weekend        (allow — the default, and every pre-TASKS-12 rule)
  Move it to the Friday before   (before — Saturday −1, Sunday −2)
  Move it to the Monday after    (after  — Saturday +2, Sunday +1)
  Skip that occurrence           (skip   — it does not exist; the schedule advances)
```

Offered only for weekly, monthly and yearly rules. A daily rule that avoids
weekends is already spelled "Every weekday", and `before`/`after` on a daily rule
would map Friday, Saturday and Sunday onto the same date.

**A moved occurrence never re-anchors the routine.** The successor stores the
unadjusted schedule date in `series_anchor_date` — the SAME field TASKS-07 added
for "change this occurrence" — and the step after it is computed from the grid.
Without that, "the 1st of every month, moved to the Friday before" walks a day or
two earlier every month until it is a completely different routine. Measured in
`task-recurrence-advanced-storage.test.ts`: 1 Jul → 31 Jul (Saturday moved back)
→ **1 Sep**, not 31 Aug.

Two rules are refused at the boundary because they would produce no occurrences
at all: a weekly rule falling only at weekends under `skip`, whether the weekend
days are named explicitly or implied by the Task's own anchor date.

### 2.5 One successor authority, widened not bypassed

`planNextTaskOccurrence(rule, series, gridAnchor, ownerDay)` is the ONE function
that decides whether a series continues and where. It applies the end conditions
and the weekend rule together and returns `null` when the series has ended — an
ordinary outcome, not an error. Completion in `D1TaskRepository` is its only
caller. Today, Planning, the Tasks list, the dependency code and every UI
component compute nothing.

## 2.6 Timezone and date semantics — audited, not assumed

Every function in the recurrence module is PURE and CALENDAR-ONLY: it takes and
returns `YYYY-MM-DD` strings and steps them through `Date.UTC` midnights. There
is no local `Date`, no clock and no timezone anywhere in the path. The owner's
day arrives as a string that the ONE timezone authority (`ownerCalendarIso`,
ADR-022) already resolved from their stored preference, server-side.

That is what makes the following true rather than hoped for, and each is
asserted:

| Boundary | Behaviour |
|---|---|
| **DST end** (Sydney, 5 Apr 2026) | A weekly rule steps 29 Mar → 5 Apr → 12 Apr. A daily rule steps 4 → 5 → 6 Apr. Whole days, both directions |
| **DST start** (Sydney, 4 Oct 2026) | The same, across the hour going the other way |
| **A transition day that is also an occurrence** | It is an ordinary date. Both 2026 transitions fall on a Sunday, so the weekend rule applies — and moves the occurrence by whole DAYS, never by an hour |
| **Month end** | 31 Jan → 28 Feb, and the ORIGINALLY REQUESTED day returns in March (TASKS-04's `anchorDay`, unchanged) |
| **February** | The fourth Thursday of Feb 2026 IS the last one (28 days), and both ordinals resolve to 26 Feb |
| **A leap year** | The last Tuesday of Feb 2028 is the 29th — the day a non-leap year does not have |
| **Year end** | The last Friday of Dec 2026 → the last Friday of Jan 2027; a Mon/Wed/Fri rule steps 30 Dec → 1 Jan → 4 Jan |
| **29 February, yearly** | Clamps to 28 Feb 2029 and RETURNS to 29 Feb in 2032 |

No browser-local recurrence authority exists: the recurrence editor takes the
owner's day from the record's loader (`todayIso`) for its end-date picker, and
computes no date of its own. Nothing in the dependency model touches a date at
all.

## 3. Dependencies — the representation

**One directed EntityLink, `blocker --task.blocks--> blocked`. No new table.**

### 3.1 Why EntityLinks

A dependency is a typed, directed, workspace-isolated relationship between two
entities, which is the definition of the kernel primitive DalyHub already has
(ADR-002/ADR-011). Migration 0003 supplies, for free and at the DATABASE level:

| What | Where it comes from |
|---|---|
| A cross-workspace edge is impossible | composite endpoint FKs `(workspace_id, entity_id)` |
| `A blocks A` cannot be stored | `entity_links_no_self_link CHECK (source <> target)` |
| A duplicate edge is impossible | `entity_links_identity_idx UNIQUE (workspace, source, target, type)` |
| One stable identity across remove/re-add | the same index spans soft-deleted rows |
| The blocker read's access path | `entity_links_active_target_type_idx` |
| The cycle walk's access path | `entity_links_active_source_type_idx` |

A dedicated `task_dependencies` table would have re-earned all of that and left
Tasks with two relationship systems. What EntityLinks does NOT know is dependency
SEMANTICS — that is §3.3.

### 3.2 One canonical direction

The row is stored ONCE. "B is blocked by A" is not a second record; it is the
same row read from the other end. Storing both directions would create two
mutable truths that could disagree, with no way to say which was right.

The record edits the relationship from the BLOCKED end ("this Task waits on that
one"), because that is the end the owner is looking at when they hit the
obstacle. The **Blocks** list is read-only there and editable on its own record —
one control per fact.

```
Dependencies
Blocked by
  Done      Prepare the draft                          [ Remove ]
  Waiting   Get director approval                      [ Remove ]
  [ Add blocker ]
Blocks
  Waiting   Send the report to the board
```

Three cells per row: a state WORD, a title that opens that Task, and — on the
editable direction only — a Remove control. No card per row, no chip, no arrow
glyph, no drag handle and no second level.

There is deliberately **no "Blocked by Get director approval" sentence at the top
of the section**. The record's HEADER already says *Blocked*, through the one
display-state evaluator, and the list already names what by; a third rendering of
one fact on one screen is exactly what §5's "one blocked label" rule exists to
prevent. It was drafted, drawn and cut on the evidence
([`dependencies-1440-light.png`](assets/v2-3-tasks-12/dependencies-1440-light.png)).
The ROW keeps the sentence, because a row has no header to carry the state.

### 3.3 The invariants, and where they live

`task.blocks` is a RESERVED task link type: the generic EntityLink repository
refuses it, exactly as it refuses `task.waiting_on`, so every dependency in the
workspace passed through `TaskRepository` and every check below.

Each check is a PREDICATE INSIDE THE WRITE, never a read-then-decide:

1. both endpoints are live, non-deleted TASKS in the bound workspace;
2. neither id is the other;
3. the blocked Task has fewer than 20 blockers, and the blocker blocks fewer than
   20 Tasks — counted in the same statement that inserts;
4. the blocker is not already reachable FROM the blocked Task by following
   `task.blocks` edges.

SQLite serialises writers and a D1 batch is one transaction, so a statement whose
`WHERE` carries the check re-evaluates it against committed state. Two concurrent
adds cannot both see nineteen blockers; two concurrent edges cannot close a cycle
between them. Both are asserted under real concurrency, not argued.

### 3.4 Cycle prevention

A bounded recursive CTE, evaluated inside the same statement as the row it gates:

```sql
WITH RECURSIVE downstream(id, depth) AS (
  SELECT ?blockedId, 0
  UNION
  SELECT dep.target_entity_id, downstream.depth + 1
  FROM entity_links dep JOIN downstream ON dep.source_entity_id = downstream.id
  WHERE dep.workspace_id = ? AND dep.type = 'task.blocks'
    AND dep.deleted_at IS NULL AND downstream.depth < 64
)
SELECT 1 FROM downstream WHERE id = ?blockerId
```

Starting the walk at the BLOCKED Task and looking for the BLOCKER covers the
self-edge (depth 0), the two-node pair (depth 1) and any longer chain with ONE
rule rather than three special cases that could disagree.

It is bounded on both axes: **depth** by the explicit `depth < 64` in the
recursive term, **breadth** by the fan-out limit the same predicate enforces. It
terminates even on a graph that somehow already contained a cycle — a restored
archive, a future defect — because `UNION` (not `UNION ALL`) never expands a
visited Task twice.

Tested: self, two-node, three-node, an eight-node chain, a valid diamond
(accepted), and two concurrent cycle-forming edges.

### 3.5 Bounds

**20 direct blockers and 20 Tasks blocked, per Task.** Chosen against what the
relationship is FOR: a dependency answers "what has to happen before I can start
this?", and a Task with more than twenty distinct answers is not a Task — it is a
Project, and DalyHub already has one of those. The bound also keeps every
dependency read provably small.

The edge being RESTORED is excluded from its own count, so re-adding a removed
dependency at the bound is judged on the other nineteen.

### 3.6 Blocked is DERIVED, never stored

There is no `is_blocked` column and no `blocked` status anywhere. A Task is
blocked iff at least one active `task.blocks` edge points at it from a Task that
is alive and not complete. Three consequences follow with no machinery at all:

- completing the last blocker unblocks the Task on the very next read;
- **reopening** that blocker blocks it again — no reconciliation job, no cache to
  invalidate, no stale flag;
- a soft-deleted blocker stops blocking, and restoring it starts again.

## 4. Deletion semantics

| Blocker's state | Does it block? | Does the edge survive? |
|---|---|---|
| Open | **Yes** | yes |
| Complete | no | yes — history is not rewritten |
| Soft-deleted (trash) | no | **yes** — restoring it restores the dependency |
| Permanently destroyed | n/a | impossible: the endpoint FK is `ON DELETE RESTRICT` |

A Task in the trash is not holding anything up, and it is not being held up
either — so it is excluded from the aggregate, from the record's lists and from
the `blocked` filter, in one predicate each. The EDGE is kept, because PX-04's
reversible delete restores the record and everything that belonged to it; losing
a relationship the owner created would make the trash lossy.

## 5. Blocked-state semantics on the surfaces

`blocked` joins the ONE display-state precedence evaluator (ADR-043 §6), between
Waiting and On hold:

```
Deleted → Completed → Cancelled → Waiting → BLOCKED → On hold → Someday → In progress → Planned → Unscheduled
```

- **Below Waiting**, because waiting is a statement the OWNER made about this Task
  and a statement the owner made outranks one derived from another record.
- **Above On hold / Someday / In progress**, because those describe how the owner
  is treating the work while blocked describes whether it can be done at all — and
  a Task reading "In progress" when it cannot start is the more misleading of the
  two.

It takes the **waiting tone**. Blocked and waiting are the same family ("this
cannot proceed"), and a new colour for a second flavour of one fact is
status-pill inflation. There is no red, no banner and no priority colour: blocked
is a workflow state, not an error.

### The row draws ONE blocked label, and it says why

```
Publish the report          Blocked by Get director approval
```

The sentence REPLACES the status pill rather than joining it. "Blocked" alone is
the least useful half of the fact — the owner already knows the Task has not
moved, and what they need is the name of the thing to chase — so the row states
the whole sentence and the status column stays empty. A pill reading "Blocked"
beside a line reading "Blocked by …" is the duplicated label the row cannot
afford.

One blocker is NAMED; more than one is COUNTED ("Blocked by 2 tasks"), because a
row cannot carry three titles and naming only the first is a half-truth. The
named blocker is `MIN(title)` from the server's aggregate, so two clients cannot
disagree about which one.

Unlike TASKS-13's checklist figure, the blocked line is drawn at EVERY width
including the phone: "2 of 5" is a detail the owner can go and find, but "this
cannot start" is the reason the row has not moved, and a phone is exactly where
that needs saying. It is free at desktop widths and costs one line on a phone;
the measured numbers, and why that trade is the opposite of TASKS-13's, are in
§12.

### Per surface

| Surface | Behaviour |
|---|---|
| `/tasks` | The blocked line on the shared row; a `blocked` filter in the shared control sheet (`?blocked=1` / `?blocked=0`) |
| Today | The blocked Task STAYS where it was planned, and says why. It is never hidden |
| `/plan` | The same. Planning is intent, not proof of executability — nothing is auto-removed or auto-rescheduled |
| Projects | The same state through the same evaluator, as a metadata line. Project progress is unchanged: a blocked Task is an open Task, and there is no dependency-weighted progress |
| Search | Unchanged. A dependency is not a searchable record and has no route |

## 6. Dependencies never move the owner's plan

Adding a dependency changes **no** date, priority, status or completion on either
Task. The test that proves it deliberately sets up the situation a "helpful"
scheduler would silently repair — a blocked Task due BEFORE its blocker — and
asserts that both Tasks are byte-for-byte unchanged.

Nor does blocked state PREVENT anything: a blocked Task can be completed. Blocked
describes what should happen first, not what the owner is permitted to do.
DalyHub proposes; the owner disposes.

## 7. Where recurrence and dependencies meet

**Dependencies are OCCURRENCE-LOCAL and are never copied to a successor.**

A dependency is a fact about two pieces of work that EXIST. An occurrence that
has not been created is not work — it is a prediction — so an edge pointing at
one would be a relationship to something that may never happen: a series can end,
a rule can be removed, an occurrence can be deleted.

Cloning edges would also require, for two independent series, guessing which
future occurrence of A corresponds to which future occurrence of B. The only
available answers are "by date" (wrong the moment either series is completed
late) and "by sequence" (wrong the moment either is skipped). Both would put a
wrong relationship into the record silently.

So a successor arrives with NO dependencies, exactly as it arrives with no
waiting state and no delegation, and the owner attaches one if this occurrence
genuinely needs it.

| Case | Behaviour |
|---|---|
| A — a recurring blocker blocks a one-off Task | The edge stays on the completed occurrence; the successor has none, so the dependent is UNBLOCKED — the specific work it waited for is done |
| B — a one-off Task blocks a recurring Task | This occurrence is blocked; the successor arrives free |
| C — both recurring | ONE edge, still between the two occurrences that existed when the owner created it. Neither successor inherits anything |
| A series that ENDS | No successor, so no edge to one. No phantom dependency record is ever created |

This is asserted in all four shapes, so a future generic relationship-copier
cannot change it quietly.

## 8. Activity

Two events, `task.dependency_added` and `task.dependency_removed`, each carrying
the blocked Task (`subject`) and the blocker (`blocker`) as its two subjects, so
the entry reads as the relationship it is and appears on both timelines. The
payload carries the two ids and nothing else — never a title, never free text.

**There is no `task.blocked` and no `task.unblocked`.** Blocked state is derived,
so a Task becoming unblocked is not an event that happened to it — it is a
consequence of `task.completed` on another Task, which the timeline already
records. Logging the consequence as well would put two entries in history for one
act, and would leave DalyHub with derived facts written into an append-only log
that could then disagree with the data they were derived from.

## 9. Notifications — deliberately none

No "Task is now unblocked", no "your blocker is overdue", no dependency
reminders. NOTIFY-01's ledger would make each of them easy to add, which is
exactly why the decision is worth recording: a dependency notification programme
is a separate product decision about the owner's attention, and DalyHub's first
principle about attention is that it is spent carefully. Deferred, not forgotten.

## 10. Offline

| Act | Offline |
|---|---|
| READING blocked state | Works. The offline snapshot CARRIES it, derived server-side in one bounded read, as an optional field per task |
| Completing a blocker | Already queues (PWA-12), unchanged |
| Adding / removing a dependency | **Requires a connection** |
| Editing a recurrence rule | **Requires a connection** |

A dependency mutation has no offline verb, deliberately. Its outcome is a
property of the GRAPH at the moment of the write — only the server knows whether
an edge closes a cycle or meets a bound — so a queued dependency would be an
intent the device cannot evaluate and might have to withdraw hours later. The
same reasoning applies to a recurrence rule, whose validity depends on the Task's
own anchor date.

The device is TOLD what the server believes; it never works blocked state out
itself. That is what keeps the one authority singular, and it is why there is a
temporary state, documented rather than engineered around: completing a blocker offline means the DEVICE knows the
blocker is done while the SERVER does not, so the dependent Task may still read
as blocked until the queued completion replays. That is server truth arriving
late, not a wrong answer, and inventing a local dependency engine to paper over
it would be a second authority for the one thing this programme exists to keep
singular.

## 11. Query bounds

| Read | Cost |
|---|---|
| One Task's dependencies, BOTH directions, with titles and completion | ONE statement |
| A page of Tasks' blocked state | ONE statement per chunk of 80 ids — `ceil(pageSize / 80)`, a function of the caller's PAGE, never of the workspace |
| The `blocked` filter | A correlated `EXISTS` in the page's own single statement; no extra join |
| An empty id list | ZERO statements |

80 ids per chunk, not 100: D1 accepts at most 100 bound parameters and this
aggregate binds the workspace id AND the link type first, so a chunk of 100 would
be 102 and would fail on a page nobody would think to test. (The checklist
aggregate learned that the expensive way; this one inherited the lesson.)

`task-dependency-query-bounds.test.ts` asserts, in the SOURCE, that no loader
reads the aggregate inside a loop, that the shared serialiser takes blocked state
as an argument and can never fetch it, and that the write guard is one SQL
expression rather than a read-then-decide.

## 12. Mobile — measured

Captured at 1440, 1280, 820, 393 and 320; numbers in
[`assets/v2-3-tasks-12/measurements.json`](assets/v2-3-tasks-12/measurements.json).

- **The blocked line is free on a desktop and costs one line on a phone.**

  MEASURED (`assets/v2-3-tasks-12/measurements.json`), a blocked row against an
  unblocked one on the same page:
  
  | Width | Tasks collection | Today | Weekly Planning |
  |---|---|---|---|
  | 1440 | 44px vs 44px (**+0**) | 44px vs 44px (**+0**) | 125px vs 125px (**+0**) |
  | 1280 | 44px vs 44px (**+0**) | — | — |
  | 820  | 44px vs 44px (**+0**) | — | — |
  | 393  | 100px vs 81px (**+19**) | 99px vs 81px (**+18**) | 84px vs 84px (**+0**) |
  | 320  | 100px vs 81px (**+19**) | 99px vs 100px (**−1**) | 97px vs 84px (**+13**) |
  
  **On a desktop the line is free**, because the title's row has spare width beside
  it. **On a phone it costs one line**, because there the row is already two
  stacked lines and the title has the narrowest measure it ever gets.
  
  That cost is ACCEPTED here and was refused for TASKS-13's checklist figure, and
  the difference is the point: "2 of 5" is a detail the owner can go and find, so
  paying nineteen pixels a row for it on the surface where density matters most was
  not worth it. "This cannot start" is the REASON the row has not moved — the
  answer to the question a phone is most often opened to ask — so on a phone the
  line is not decoration, it is the content.

- **No horizontal overflow at ANY captured width** — 1440, 1280, 820, 393 and
  320 — on the Tasks collection, on Today, on Weekly Planning, on the Task
  record or with the recurrence editor's longest form open. Every one of the
  eighteen captures records `horizontalOverflow: false`.
- **A dependency row WRAPS rather than truncating.** Measured 45px at 1440 and
  393, where the state word, the title and the Remove control share one line;
  72px at 320, where the control takes a line of its own and the blocker's title
  keeps its full 208px measure
  ([`dependencies-320-light.png`](assets/v2-3-tasks-12/dependencies-320-light.png)).
- **Every dependency control is a 44px target**, at every width — MEASURED 45px,
  the smallest control in the section AND in the recurrence editor, at 1440, 393
  and 320 alike. The floor is applied to
  this composition rather than to the shared ghost button, because it is a
  property of the relationship control (WCAG 2.2 AA target size), and a fine
  pointer loses nothing by a control being comfortable. The shared button is 36px:
  the E2E phone journey caught it, which is why the number is a measurement rather
  than an intention.
- **The recurrence editor stays a short form on a phone.** The monthly shape is a
  radio pair whose chosen option reveals ONE field and whose other reveals none;
  the end condition reveals exactly one field or none. MEASURED at its WORST
  case — the named-weekday monthly shape, a weekend rule and an "after N times"
  end condition all open at once — the Custom form is 893px at 1440 and 1017px at
  393, with no horizontal overflow at either
  ([`recurrence-393-light.png`](assets/v2-3-tasks-12/recurrence-393-light.png)).
  The ordinary monthly rule is three lines, not eight.

## 13. Accessibility

- Every control reachable and operable by keyboard, with focus RESTORED to the
  "Add blocker" control after a removal (proved end to end).
- The blocker's state is a WORD ("Done" / "Waiting"), never colour alone; the
  completed strike-through is a second reading rather than the only one.
- Adding and removing announce through a polite live region, because both change
  the list without moving focus.
- The weekday and ordinal selects carry full weekday names, never abbreviations.
- Axe clean on the record in light and dark.

## 14. Migrations and storage

Migration `0047_task_recurrence_advanced.sql`: four additive columns on
`task_recurrence_rules` (`ordinal`, `weekend_rule`, `ends_after_count`,
`ends_on_date`) and one partial index. **No dependency table.** Every default
reproduces the pre-TASKS-12 rule exactly, so running the migration changes no
existing series' behaviour.

SQLite cannot add a CHECK to an existing table, so the closed sets and the
mutual exclusion of the two end conditions are enforced where every other
cross-field task invariant is: the kernel validator and the workspace-bound
repository, exactly as migrations 0007 and 0037 did.

## 15. Snapshot, export and restore

Both new capabilities survive a round trip, and the fixture every export/restore
proof shares now carries an advanced rule AND a dependency — so a snapshot reader
that drops either fails the round trip instead of comparing two empty sets.

**A pre-existing defect was fixed on the way**: `mode` and `series_anchor_date`
(TASKS-07's own two columns, migration 0037) were MISSING from the snapshot
shape, so an `after_completion` routine came back from a restore as a fixed
schedule and a moved occurrence lost its grid. Both are now exported and
restored, with TASKS-12's four beside them.

After a restore, asserted directly rather than inferred from row equality: the
advanced rule produces the correct next occurrence with its end condition intact,
the dependency names the two restored Tasks, blocked state derives from it, and
no dependency edge names an entity outside its workspace.

Dependencies also appear in the Markdown vault export as ordinary relationship
lines (`→ [Task] — task.blocks`), which is already truthful; no special-casing
was added.

## 16. What TASKS-12 deliberately did NOT add

Gantt charts · dependency timeline visualisation · automatic date shifting ·
critical path · resource capacity · estimates · time tracking · team assignments ·
shared Tasks · a dependency notification programme · automatic scheduling ·
AI planning · an arbitrary recurrence expression language · cron · calendar
write-back · nested Task trees · Jira-style subtasks · a second Task engine · a
second relationship model for Tasks.

Checklists remain the ONE supported level of steps inside a Task.

## 17. Deferred

- **Corresponding-occurrence dependency inheritance.** §7 records why the simple
  rule shipped. If a future programme wants it, the honest mapping is series
  identity plus sequence, and it needs a product answer for two series of
  different cadences before it needs an implementation.
- **Dependency notifications** (§9).
- **Offline dependency mutation** (§10).
- **A recurrence PREVIEW** ("the next three dates"). The label states the rule in
  words, which is the claim the product can make without projecting a calendar it
  does not store.
