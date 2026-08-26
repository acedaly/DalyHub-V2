# PLAN-01 + SMART-01 — Weekly Planning, and one filter vocabulary with two consumers

**Programme:** V2.3 "Planning & Routines", first item.
**Status:** delivered, 17 August 2026.
**Decision:** [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md#adr-101-weekly-planning-is-a-projection-not-a-record--the-owners-calendar-week-a-named-band-queue-and-one-declarative-filter-vocabulary-with-two-consumers).
**Evidence:** [`assets/v2-3-plan-smart-01/`](assets/v2-3-plan-smart-01/).

---

## 1. Review, Planning and Today are three different questions

DalyHub now has three surfaces over the same Tasks. Keeping them apart is the
whole design, and the boundary is stated once, here:

| Surface | Asks | Changes | Authority it holds |
|---|---|---|---|
| **Weekly Review** (`/reviews`) | What happened? What needs attention? What matters next? | **nothing** | the historical record and the written focus |
| **Weekly Planning** (`/plan`) | What am I committing to this week, and on which days? | the **PLAN** — a Task's `scheduled_date`, and nothing else | none of its own |
| **Today** (`/today`) | What do I do now? | the day's work | none of its own |

The Review's own words are *"Nothing is scheduled or changed for you."* That is
right for a Review and wrong for a week, and PLAN-01 is the phase that was
missing between them:

```
REVIEW  →  PLAN  →  TODAY  →  EXECUTE
```

The handoff is a LINK and nothing more. A completed Review offers **Plan next
week** from its focus step and from its completion step; following it neither
creates a Task nor modifies the Review, and completing a Review never requires
planning — "complete and leave" is still a first-class ending.

---

## 2. Planned date vs due date

The one distinction the whole surface rests on:

- a **due date** is an OBLIGATION. Something else in the world decided it.
- a **planned date** is an INTENTION. The owner decided it.

The planner moves the planned date and **never** the due date. Placing a Task on
Wednesday says "I intend to work on this on Wednesday"; it does not move a
deadline. Every row keeps drawing both, the menu item that clears a plan says
"Remove the planned date — the deadline is untouched", and the announcement after
a bulk placement says "Deadlines are unchanged". It is asserted twice end to end:
after placing a Task, the same Task is still returned by a query filtered to its
original deadline.

---

## 3. Why Tasks remain the one planning record

There is no `PlanningTask`, no `WeeklyPlan`, no week record, **no new table and no
migration**. The reasons, in order of how much they cost to get wrong:

1. **A second record has to be synchronised, and synchronisation drifts.** A week
   plan holding copies of Tasks would need a reconciliation rule for every edit
   made anywhere else in the product — and every one of those rules is a place
   the two can disagree about what the owner committed to.
2. **The field already exists and already means this.** `task_details.scheduled_date`
   IS the plan (ADR-030), written by the canonical `planTask`/`planTasks` path
   since TODAY-04, and read by Today, by `/tasks`, by the Task record and by the
   Next-7-Days agenda. A planning surface that stored its own week would be the
   only consumer that disagreed.
3. **It makes the acceptance test trivially true.** "Use the same Tasks in Today
   afterwards" is not a feature to build; it is what happens when there is one
   record.

So Weekly Planning is a **projection**: Tasks, calendar occurrences, PROJ-02
Project health, and one completed Review's own written focus.

### 3.1 One mutation authority

`/plan` has **no action route**. Every write on the surface leaves through the
canonical client posters in `~/shared/task-record/task-inline-edit` to
`POST /tasks/:id` and `POST /tasks/bulk` — the same routes `/tasks`, Today, a
Project's task list and the Task drawer post to, reaching the same Task domain
handlers, the same validation, the same atomicity and the same Activity.

The per-surface reconciliation policy (the in-flight patch map, the rollback rule,
the announcement channel, the revalidation) is the shared
`useTaskSurfaceActions`, which this item **promoted out of the Today module
without changing a line of its behaviour**. It was never Today-specific: it is the
policy for a BOUNDED task surface, and Weekly Planning is the second one.

---

## 4. The planning week

### 4.1 One definition, and the one it is not

DalyHub had two week conventions before this item, and they are not in conflict
because they answer different questions. They are now stated together in
`app/kernel/planning/planning-week.ts` so nobody has to rediscover it:

1. **The owner's calendar week.** `firstDayOfWeek` (`monday` | `sunday`, default
   `monday`) is a real, shipped preference, and `weeklyPeriod` in
   `~/kernel/reviews` already resolves a weekly Review's period from it.
2. **The rolling seven-day window.** `weekWindowEnd` in `~/kernel/tasks`
   (`today … today + 6`) backs the derived `due_this_week` / `planned_this_week`
   states. It is deliberately preference-free: "due this week" there means
   "within the next week", not "before Sunday".

**Planning uses (1)** — because it is the period a weekly Review covers, and a
planner whose "next week" started on a different day from the Review that handed
it over would be lying to the owner. (2) is untouched.

### 4.2 Dates are dates

Every value is a wall-calendar `YYYY-MM-DD`, stepped as an integer number of days
and formatted from a **noon UTC** instant (ADR-022 §22.7). The owner's calendar
day is always an argument; the module never reads a clock, and the Worker's UTC
day never reaches it. That is what makes the DST case a non-event: a week
containing Sydney's April transition still resolves to the seven dates it is
meant to, and the assertion is in `test/unit/plan/planning-week.test.ts`.

### 4.3 Bounded navigation

Previous week / this week / next week, and no further. Planning is an operational
surface for *this* week and *next*; it is not a calendar application (CAL-01 §21,
§45), and an unbounded offset turns the week header into an infinite scroller with
no reason to stop. One week back is enough to finish placing work that slipped. A
hand-typed `?week=99` lands on next week rather than a year away.

---

## 5. "Still to place" — a named-band queue, not a score

The queue is the surface's one editorial judgement, so it is stated as data and
code (`app/kernel/planning/planning-queue.ts`) and it is deliberately **not a
weighted score**. A score would be unarguable in exactly the wrong way: the owner
could see the order and never the reason, and no test could assert anything except
the arithmetic.

Five **bands**, in this priority order. The array IS the order.

| Band | Rule | Why it warrants a decision |
|---|---|---|
| `overdue` | open and past its date (the kernel's own `overdue` view) | the decision is overdue too |
| `slipped` | planned for a day BEFORE this week and still open | the commitment lapsed; re-place it |
| `due_this_week` | due inside the week and not planned inside it | a deadline in the week with no day chosen |
| `priority` | P1 or P2 with no planned day | high-priority work nowhere in the week |
| `inbox` | active and unfiled | the week is where "this needs a home" gets decided |

Rules that hold for every band:

- a Task **planned inside the shown week is never in the queue** — it is placed,
  and it is drawn on its day;
- a Task appears **at most once**, in its highest-priority band, because its band
  is its stated reason and two reasons would be two rows;
- **order inside a band is the order the query returned**, which is itself
  deterministic; nothing re-sorts, so the surface cannot disagree with the page
  boundary the query drew;
- the queue is **bounded at fifteen** and truncation is **reported**, with the way
  to narrow it named — which is exactly why SMART-01 shipped alongside.

The band is printed as the GROUP's heading, once, not on every row. (The first
form printed it per row and drew the word "Overdue" six times down a 21rem rail.)

This is **not** "every open Task". Anything in none of the five bands is real work
the owner has parked, filed and dated; putting it in a planning queue would make
the queue a second Tasks list with worse filtering.

---

## 6. Calendar as context

The existing unified schedule projection (`loadScheduleWindow`), read **once for
the whole week** — one projection read plus two bounded Meeting reads, the same
cost Today pays for one day. There is no second calendar read path.

Occurrences are drawn as a time and a title, muted, under the day heading. They
are deliberately **not interactive**: an occurrence is read on the schedule
surfaces that own it, and a planner that let you open, complete or edit a calendar
item is the beginning of the calendar application CAL-01 refuses to build. What
the planner needs from the calendar is exactly *when the day is already spoken
for*, so that is exactly what it draws.

No occurrence becomes a Task. Nothing is written to anybody's calendar. No
availability is invented: an all-day item is drawn as "All day" rather than given
a fabricated duration, and no time blocking is offered.

---

## 7. Blocked work, and the `open` scope

A planner that hides blocked work invites the owner to plan around a commitment
they cannot act on. The kernel's `active` scope excludes both parked states, which
would have made a Task planned for Wednesday and waiting on a supplier vanish from
Wednesday.

So the Tasks kernel gained one system view:

> **`open`** — still committed, not yet finished. It excludes the three states
> that are not commitments (completed, cancelled, Someday/Maybe) and **keeps**
> waiting and on-hold.

It is the widest scope that still means "work I intend to do", and it is the one
the planning week reads. Blocked work is distinguished in **words** — the shared
row's own state pill says "Waiting", and the day's line counts it — never by
hiding it and never by colour alone.

`open` is also a built-in Tasks view. That is not decoration: a scope with no view
of its own is a hazard, because a URL naming one falls back to All active's
configuration and reports itself as "Custom" — the failure UIX-01 fixed for the
other scopes.

---

## 8. Project and Goal signals

Restrained on purpose: at most five Projects and three Goals, each with **one**
stated gap and a door to the record that can close it. This is a planning aid, not
a Project dashboard and not a Goal scoreboard.

- **The health state is PROJ-02's own**, evaluated by `evaluateProjectHealth` over
  facts from `listProjectHealthFacts`. No second health formula.
- **The next action is the Tasks query's own** — the first actionable open Task of
  a Project, from ONE bounded "most actionable work" scan, which is the same rule
  and the same read the Review's Projects step uses. No next action is invented.
- **The gap** is one of three, in priority order: no next action at all · a next
  action exists and nothing from the Project is in the week · the Project has
  overdue work. A Project with none of those is not listed.
- **A Goal is listed only when nothing planned in the week supports it**, derived
  from the relationship the Task projection already resolves. There is no
  contribution score, and no Task is pushed into a Goal.

Only actively-worked Projects are considered: a Planned or On-hold Project has not
been started or has been deliberately paused, so "nothing planned this week" is
the owner's decision, already recorded.

---

## 9. SMART-01 — one filter vocabulary, two consumers

### 9.1 What was already there, and why nothing was rebuilt

The brief asked for saved smart lists and warned, correctly, not to build a second
filter DSL. Inspection found DalyHub already had exactly the right thing:

- **TASKS-03's declarative view configuration** (`app/kernel/task-views`) — a
  validated config naming filter DIMENSIONS from closed sets, never a field, an
  operator or a SQL fragment, translated to trusted predicates by the repository
  ([ADR-059](../decisions/ARCHITECTURE_DECISIONS.md));
- **X-02's one saved-view table and repository** (`task_saved_views`, keyed by
  KIND), which already stores Tasks views and cross-module views as one record
  behind one contract ([ADR-082](../decisions/ARCHITECTURE_DECISIONS.md));
- **a saved-view switcher, a filter sheet and a chip row**, all shared.

[DEBT-49](../product/PRODUCT_DEBT.md) already settled the question this item could
have re-opened, in one sentence: *a collection that filters records in the browser
uses DS-07; a collection whose filters are executed by a repository — and any
collection with saved views — uses the declarative view configuration.*

So SMART-01 **converged**: it gave that model the capabilities it was missing and
a SECOND CONSUMER. No new table, no new migration, no second filter engine.

### 9.2 The vocabulary stays "saved view"

"Smart list" is not introduced as a synonym. AGENTS.md §7 is explicit — *speak in
the user's nouns, no synonyms, no drift* — and the concept already exists under a
name the product, its switcher, its route (`/tasks/views`), its repository and its
documentation all use. Adding a second word for one object would be exactly the
drift the rule forbids. The roadmap item keeps its id; the product keeps its noun.

### 9.3 What was added to the model

All of it in the same declarative, closed-set, server-translated shape:

| Capability | Shape | Why |
|---|---|---|
| **Priority SET** | `priorities: (TaskPriority \| "__none")[]` | "P1 and P2" is the first filter an owner reaches for and the one a single value cannot say |
| **Due window** | `dueFrom` / `dueTo` (`YYYY-MM-DD`) | the derived states answer relative questions; a specific window is what a planning week is |
| **Planned window** | `plannedFrom` / `plannedTo` | the same, for intention rather than deadline — and strictly separate from it |
| **Repeats** | `recurring: boolean` | "which of my Tasks are routines?" had no answer, and "which are one-off?" none at all |

A priority set is **one dimension with more than one accepted value**, not a
nested OR clause: every member comes from a closed vocabulary, the repository
still chooses the predicate, and nothing about the persisted contract gains an
operator or a nesting level. A missing date is **never** inside a window — treating
it as one is how "planned next week" comes to include the whole unplanned backlog.

### 9.4 Compatibility

The URL parameter kept its name. `?priority=p1` — every link shared and every view
saved before this item — canonicalises into a one-member set on read, so it still
means exactly Priority 1. The stored-config parse remains **total**: an
unrecognised member, an unknown key or a value from a future version is dropped
and the rest is kept, so a bad definition degrades to a narrower view rather than
to an error page.

### 9.5 The shared control model learned multi-select

`CollectionControlGroup` gained one optional flag, `multiple`. A multi-select group
is still one dimension bound to one parameter: values are comma-joined in the
group's own option order (so two equivalent selections produce one link), options
announce themselves as `menuitemcheckbox` rather than `menuitemradio`, and the chip
row draws one chip per value with removal that leaves the others applied. Every
existing group is untouched.

### 9.6 A saved view IS a planning scope

Weekly Planning's queue offers **Suggested** (the band rule) plus every saved view.
Choosing one runs it through the **same** `listWorkspaceTasks`, with the **same**
`toWorkspaceFilters` translation of the **same** stored configuration that `/tasks`
uses. Planning duplicates no filter logic; it passes the definition into the
canonical path.

The one rule applied on top is the queue's own: work already placed in the shown
week is placed. `e2e/plan-smart-lists.spec.ts` asserts the equivalence directly —
the planning set is exactly the Tasks set minus this week's placements.

---

## 10. Interaction, and why there is no drag-and-drop

The dependency stack was inspected first. **DalyHub ships no drag-and-drop
library**, and PLAN-01's brief is explicit that one must not be added merely
because planners commonly have one — the accessible path has to be complete on its
own, and a drag is only ever an enhancement.

So placement is:

1. **Select, then choose a day.** Queue rows carry the shared row's own selection
   checkbox; the place bar offers seven day buttons, each with a real accessible
   name ("Plan 3 selected tasks for Wednesday 19 August"), committing ONE atomic
   `plan` bulk mutation. Either every selected Task moves or none does.
2. **One at a time, from the row's overflow.** "Plan for Wednesday 19 August" for
   every day of the shown week except the one it is already on, plus "Remove the
   planned date". These live in the SHARED row-actions builder, so the act has one
   set of words wherever a surface can offer it.
3. **The row's own inline date editor**, unchanged, for any other date.

Focus is managed: the day buttons disable themselves once the selection is placed,
so focus moves deliberately to the heading of the region that changed rather than
being dropped to the document body.

---

## 11. The desktop composition — and the measurement that decided it

The obvious planner is a seven-column board. It was drawn, measured and rejected.

At 1440 the pane's content column is **1216px**. After a 336px queue rail, seven
columns leave roughly **100px each** — narrower than a task title, so every row
truncates to two or three words and the day a Task is on becomes the only thing
the screen can tell you. A board that cannot print a Task's name is a board that
says what its own headings already say.

The delivered agenda, measured on the same page:

| | 1440 | 1280 | 820 | 393 |
|---|---|---|---|---|
| document `scrollWidth` vs `clientWidth` | 1440 / 1440 | 1280 / 1280 | 820 / 820 | 393 / 393 |
| horizontal overflow | none | none | none | none |
| agenda width | 856px | 696px | 752px | 393px |
| queue rail width | 336px | 336px | 752px (below) | 393px (below) |
| **usable task-title width** | **254px** | 254px | 254px | 254px |
| first actionable item Y | 297px | 297px | 297px | 299px |
| smallest day control | 45×45 | 45×45 | 101×45 | 47×49 |

Every number is captured by `e2e/plan-smart-01-screenshots.spec.ts` into
[`assets/v2-3-plan-smart-01/measurements.json`](assets/v2-3-plan-smart-01/measurements.json).

Two measurements changed the design after the first capture:

- **the queue rail was 6,878px tall beside a 748px agenda**, which made the page a
  queue with a week attached. The queue bound came down to fifteen and the sticky
  rail is now capped at the viewport with its own scroll; the page is **1,084px**.
- **the place-day row wrapped**, putting Sunday alone on a line at three times the
  width of the other six. It is a seven-column grid now.

### 11.1 What it deliberately does not draw

No card per day, no card per section, no tonal fill per weekday, no seven accent
colours, no Kanban chrome, no MD3 component styling. A day is a BAND: one hairline
and whitespace. The rows inside are the shared `dh-taskrow`, unstyled by this
surface except for one documented narrow-composition rule in the 21rem rail — a
surface that restyled the product's task row would be a second task row.

---

## 12. The phone composition

Not seven columns at 390px, and not a seven-day scroll either — a seven-day agenda
on a phone is a page the owner scrolls past rather than plans in.

- a **horizontal day rail** (the week), as a real tablist over days the loader has
  already fetched, so moving day costs no request and reaches no date the page does
  not hold;
- **one day's agenda** below it;
- **"Still to place"**, with the same seven-button place bar.

The six unselected days are `display: none` — out of the accessibility tree, not
readable-but-invisible — so a screen-reader user reads the day the rail says is
selected. One DOM, two compositions, nothing to keep in step.

Verified at 320, 375, 393, 430 and 820: no horizontal document overflow anywhere,
and every control PLAN-01 adds meets the DalyHub 44px floor on a coarse pointer.

---

## 13. Query bounds

A planning surface is the easiest place in a product to write an N+1, because
every part of it is "per day" or "per project". None of it is. The whole page is a
**fixed** number of queries, whatever the week holds:

| # | Read | Bound |
|---|---|---|
| 1 | preferences (timezone, first day of week) | — |
| 2 | the schedule window for the WHOLE week | the existing projection read + 2 bounded Meeting reads |
| 3 | the week's planned Tasks, over the explicit planned window | 250 |
| 4 | the week's completed Tasks, same window | 250 |
| 5 | the queue — 5 bounded band reads concurrently, OR exactly 1 for a saved view | 40/band, 15 merged |
| 6 | active Projects | 40 |
| 7 | grouped health facts for that page | — |
| 8 | ONE actionable-work scan yielding every Project's next action | 100 |
| 9 | completed weekly Reviews, for the prior focus | 12 |
| 10 | parent candidates for the row's inline Project editor | 50 |
| 11 | the owner's saved views, for the queue-source picker | — |

Adding a day, a Task or a Project adds no query.
`test/unit/plan/plan-query-bounds.test.ts` asserts the shape: every task read
names a bound, no repository call sits inside a loop, the schedule is read once
with a range, and the loader performs no mutation at all.

Bounds are **generous where losing a row would be a lie** (the week's own
commitments) and **tight where truncation is calm and reported** (the queue).

---

## 14. Offline

No new offline subsystem, and no second write queue.

Planning's Task mutations travel the SAME canonical client posters as every other
Task surface, so the PWA-12 slice applies unchanged: completion, reopen, priority,
due date and **planned date** are offline-capable operations, queued on the device
when a request cannot reach DalyHub and replayed against the canonical record
route. A queued change is reported as queued — the row shows the owner's change
and the words say "Waiting to sync" — and is never reported as a server success.

An operation outside that slice fails honestly: the row rolls back exactly what
that write painted and the server's own wording is shown. Nothing here ever claims
a schedule change saved when it did not.

Saved views (create / rename / update / delete) are **not** offline-capable, and
deliberately: they were not part of the PWA-12 slice, a mutation with no `offline`
descriptor reports a transport failure as an ordinary refusal exactly as before,
and inventing a second queue for a once-a-week action would be the second offline
subsystem this item was told not to build.

---

## 15. Accessibility

- **Keyboard-complete.** Selection, placement, week navigation, the day rail, the
  queue source and every row control are reachable and operable by keyboard. There
  is no drag-and-drop anywhere, so there is nothing a keyboard user is excluded
  from.
- **Semantic structure.** The week is a labelled region (not a second `main` —
  that was caught by axe and fixed), each day a labelled section with a real
  heading, the queue's bands real headings, the day rail a real tablist.
- **Never colour alone.** "Today" is a word on exactly one day; a past day is
  quieter by weight; blocked work says "Waiting"; the day rail's selection is a
  filled ground AND `aria-selected`; the queue's reason is a word.
- **Real names on date controls.** "Plan 3 selected tasks for Wednesday 19 August",
  never a bare weekday abbreviation.
- **Announced.** Every placement, clearance and completion is announced through
  one polite live region, after the server has answered, and the announcement says
  what did NOT change ("Deadlines are unchanged").
- **Focus is never lost** after a mutation that disables the control that caused it.
- **200% reflow** at a 640px viewport with no horizontal scrollbar.
- **axe WCAG 2.2 AA** passes in light, in dark and on a phone.

---

## 16. What this did not build

Habits · checklists and subtasks · advanced recurrence · Project templates · AI
automatic planning · automatic time blocking · calendar write-back · dependencies
and Gantt · capacity planning · estimates and time tracking · shared or team
planning · public or shared smart lists · a marketplace or template gallery · a
new calendar module · a month grid or week timetable · drag-and-drop · a second
Task authority · a second filter engine.

---

## 17. The week's own account (V2.4 FOLLOW-01, 2026-08-26)

PLAN-01 built the surface that asks for a commitment. It never came back to say
what became of one — and this document's own §1 framing is what makes that a gap
rather than an omission: *"a Review asks what happened; Weekly Planning asks what
am I committing to."* The planner still asks the second question. It now also
STATES the answer to the first for the week it is showing, in one sentence,
because the owner making next week's plan is the person who needs last week's.

**One statement at rest.** It takes its own row of the existing "Week at a glance"
bar rather than a fifth figure slot, because it is prose and because a fifth
number beside four would read as a score even without a percentage on it:

> This week's plan held 8 Tasks: 2 done (1 on the day planned), 4 left unfinished,
> 1 moved out and 1 taken off the plan. 1 Task was completed without being planned
> for it. _3 Tasks moved to another day 4 times between them and 1 Task came into
> the week from another day._

**One disclosure behind it**, and it is the SAME grammar the Review-focus button
beside it already uses — `aria-expanded` onto a `hidden` panel, rendered rather
than unmounted. Inside: the non-zero outcome lines, and every accounted Task with
the dates its outcome was read from, linked to its record.

### What it does not change

- **No control on a Task row.** V2.4-GATE-02's invariant — a row shows ONE
  checkbox-like control at rest — is untouched: the account lives outside the
  rows entirely, adds no selection state and no completion affordance.
- **No mutation.** `/plan` still writes nothing. Every mutation still leaves
  through the canonical Task posters, and the loader is still a read model
  (asserted).
- **No second definition of the week.** The account uses the SAME owner calendar
  week the board draws, resolved through the shared `ActivityWindow` builder that
  the weekly Review also uses.
- **No new query per day, per Task or per Project.** One bounded read for the
  whole week, inside the existing concurrent fan-out — two D1 statements, flat
  with respect to the week's size, with `PLAN_LIMITS.accountTasks` as its named
  ceiling (deliberately below `plannedTasks`: the board draws the week, the
  account describes a week that has happened).
- **No score.** No percentage of plan kept, no grade, no streak, no ranking of
  weeks — refused in advance by
  [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)
  and asserted over the rendered text.

### Where the words come from

The kernel (`~/kernel/activity-window`), not this surface — the weekly Review
renders the same sentence from the same functions, which is what makes "one
derivation, two consumers" checkable rather than aspirational. The screen derives
nothing: outcomes, counts and wording all arrive already decided.

Full record:
[`V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md`](../product/V2_4_FOLLOW_01_WEEK_ACCOUNT_2026_08.md).
