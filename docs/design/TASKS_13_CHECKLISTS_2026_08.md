# TASKS-13 — Task checklists

> **Delivered 2026-08-18.** The implementation record for the V2.3 roadmap item
> [TASKS-13](../roadmap/ROADMAP_V2_3.md). Accepted as
> [ADR-103](../decisions/ARCHITECTURE_DECISIONS.md#adr-103-a-checklist-item-is-not-a-task--one-durable-level-of-ordered-steps-inside-one-task-with-dense-integer-order-no-activity-and-no-automatic-completion-in-either-direction).
> Module behaviour: [`TASKS_MODULE.md`](../development/TASKS_MODULE.md#checklists-tasks-13).
> Evidence: [`assets/v2-3-tasks-13-checklists/`](assets/v2-3-tasks-13-checklists/).

---

## 1. What it is

Some Tasks are one commitment with several steps. *Prepare camper for trip* is
one thing to have done and four things to do:

```
Prepare camper for trip                                   2 of 4 complete

  ✓  Check tyre pressures
  ✓  Fill water tanks
  ○  Charge batteries
  ○  Pack the fridge

  + Add item
```

TASKS-13 gives those four steps somewhere to live: a small, ordered, durable list
inside ONE Task, editable from the Task record by keyboard or by thumb.

## 2. The decision the roadmap asked for

The roadmap named two questions. Both are answered, and the first answers the
second.

**Where does a checklist live?** In its own table. Not in `task_details`, not in
the Markdown description, and — the answer it was most important to refuse — not
as child Tasks.

**What does a partially-complete checklist mean to a Project's progress?**
Nothing. A checklist item is not a Task, so it is not in the count that the
progress is computed from. A Project holding one Task with ten steps reports one
open Task, and a Goal's measured progress does not move when a step is ticked.
The domain mathematics stays truthful because the thing that would have corrupted
it does not exist.

### Why not child Tasks

Every count, rollup, filter and view in DalyHub answers a question about Tasks.
Adding a second level of the spine makes every one of those answers ambiguous,
permanently and everywhere: a Project's open count, an overdue count, the Inbox,
the weekly planning queue, Today, Analytics, a saved view. "Prepare camper" with
four steps would become five Inbox rows, five planning-queue candidates and five
Project tasks — and the owner would have to file, prioritise and plan each of
them. That is a project-management system, and TASKS-13's purpose is to make a
complex Task easier to execute without becoming one.

### Why not Markdown, and not JSON

A Markdown checkbox in the description is not data. Ticking one is a
whole-description rewrite, so two devices ticking two boxes lose one of them; the
order cannot change without editing prose; and a future Project Template would
have to parse the steps back out of a paragraph. A JSON array on the Task has the
same lost update in a less honest form and cannot be indexed, counted or ordered
by the database, so every progress figure would mean reading and parsing a blob.

A checklist item is therefore a ROW: small, ordered, individually addressable and
individually writable. One checkbox changing writes one column of one row.

## 3. What a checklist item is NOT

It has no `entities` row, no spine record, no EntityLinks, no Activity of its own
and no route. So it cannot be opened, planned, delegated, filed, filtered,
counted, completed as a Task or reached by a URL — not because the interface
hides those things, but because the machinery that would provide them does not
exist for it. `test/kernel/task-checklist.test.ts` asserts that at the storage
layer: creating an item adds nothing to `entities`, nothing to `spine_records`
and nothing to `activities`.

There is also exactly ONE level. `task_checklist_items` has no `parent_item_id`
and will not get one; the absence of the column is the whole of the no-nesting
rule.

## 4. Storage

`migrations/0045_create_task_checklist_items.sql`.

| column | meaning |
|---|---|
| `id` | the item's own identity — stable, and what a reorder and a clone address |
| `workspace_id` | the FND-03 isolation boundary, on every statement |
| `task_id` + `task_type` | a composite FK to `entities (workspace_id, id, type)` with `task_type = 'task'`, so the database itself asserts the parent is a Task |
| `title` | one short line of PLAIN text, bounded at 500 |
| `position` | the owner's order; dense `0..n-1`, deliberately NOT unique |
| `completed` | `0` or `1`. No status, no priority, no dates, no waiting state |
| `created_at` / `updated_at` | application-written ISO-8601 UTC TEXT, as everywhere |

Index `task_checklist_items_by_task (workspace_id, task_id, position, id)` serves
both reads the product makes: one Task's ordered list, and the bounded progress
aggregate over a page of Tasks.

The same migration REBUILDS `offline_mutation_receipts` to widen its `operation`
CHECK for the new offline operation. SQLite cannot alter a CHECK in place, so
this is the standard rebuild that `0021` and `0026` already used: every column
keeps its name, type and constraint, every row is copied by an explicit column
list, and the only difference is one more legal value.

## 5. Ordering

`position` is a plain integer and the canonical read order is
`(position, created_at, id)` — a TOTAL order, so the list is deterministic even
if two rows ever shared a position.

The position is **not unique**, and that is deliberate. A reorder rewrites one
Task's positions inside a single transaction, and SQLite checks a UNIQUE index
row by row rather than at commit — so a unique constraint would reject exactly
the legitimate intermediate state a reorder passes through. Uniqueness would buy
nothing the total order does not already give.

There are no floating-point midpoints and no rebalancing scheme. A checklist is
bounded at 100 items, a whole-list renumber is one batch of at most 100
statements, and a rebalance that never has to happen cannot go wrong.

A reorder submits the WHOLE order. If the submitted list does not name exactly
the Task's current items — one short because another device added a step, or
naming an item that has gone — it is REFUSED and nothing is written, with the
current list returned so the surface corrects itself. A partial reorder would
silently invent an order the owner never chose.

Deleting an item closes the gap in the same transaction, so positions stay dense
and the next item added cannot collide with the slot the deletion vacated.

## 6. Completion semantics

Two rules, and they point in opposite directions on purpose.

**Completing every step does not complete the Task.** A checklist describes the
steps; the Task is the commitment. A camper can have all four checks done and
still need the owner to decide it is ready. The record says so in words when the
last box is ticked — *"4 of 4 complete — the task is still open until you
complete it"* — because the owner will otherwise wonder whether something failed.

**Completing the Task does not rewrite the checklist.** Nothing is ticked,
cleared or hidden. A Task completed with two of four steps done says exactly that
afterwards, which is the truthful record and the one a later reader needs.
Reopening restores the Task and touches no item.

**Completing a Task with unfinished steps is allowed, with no confirmation.**
DalyHub prefers undo over confirmation dialogs (AGENTS.md §7): reopening is one
click and restores everything, so a dialog here would tax the most frequent act
in the product to warn about a state the record already shows. The item's own
brief said this was the recommended default and it is the one taken.

## 7. Recurrence

A recurring Task's successor inherits the checklist STRUCTURE with completion
RESET:

```
Monthly camper check          →      Monthly camper check   (next month)
  ✓ Check tyre pressures                ○ Check tyre pressures
  ✓ Check gas bottle                    ○ Check gas bottle
  ✓ Check batteries                     ○ Check batteries
```

A routine's steps are part of the routine, so a successor that arrived empty
would make the owner retype them every month. Last month's ticks describe last
month's work, so copying them would have this month's occurrence claim, on the
day it was created, that its steps were already done.

It is implemented at the ONE recurrence authority. `#planSuccessor` reads the
predecessor's checklist before the batch (each cloned row needs an id, and SQL
cannot mint one per row) and `#buildSuccessorGroup` writes the rows INSIDE the
completion batch, gated on the successor entity existing — so the successor
arrives with its steps or does not arrive at all. `completed` is hard-coded to
`0` in the SQL: the reset is in the statement, not in a value a caller could
pass. The completed occurrence's own checklist is never shared and never
rewritten, and undoing the completion withdraws the successor with its clone.

## 8. Mutation authority

Five intents on the Task's own route, `/tasks/:taskId`:

| intent | form fields |
|---|---|
| `checklist_add` | `title` |
| `checklist_rename` | `itemId`, `title` |
| `checklist_set_completed` | `itemId`, `completed` (`1` / empty) |
| `checklist_delete` | `itemId` |
| `checklist_reorder` | repeated `itemId`, in the new order |

They live on the TASK's route because a checklist item has no address of its own:
it is reachable only through the Task that owns it, and routing it that way makes
the workspace + ownership check impossible to skip. Every mutation proves the
item's workspace, its parent Task's workspace and the authenticated workspace all
agree — once in the guard and again in the `workspace_id = ?` on every statement.

Every answer carries the WHOLE checklist as the server now holds it, which is
what makes the section self-correcting: an add, a rename, a tick, a delete and a
reorder all reconcile the same way, and a client that had drifted is corrected by
the next answer rather than accumulating a second opinion.

`app/shared/task-record/use-task-checklist.ts` is the one client seam — the
counterpart to `task-inline-edit.ts` for a Task's own fields. It is not an
authority: it POSTs, and the server's answer replaces its state wholesale.

## 9. Concurrency

Each mutation is narrow by construction. A rename writes `title` and nothing
else; a tick writes `completed` on ONE row and nothing else; neither can disturb
the other's field or the order. Two devices renaming two different items never
contend, and a rename racing a tick on the SAME item does not either.

Every write is guarded on the value actually changing, and `changed` reports what
the guarded statement did rather than what was asked for — so two ticks that race
both see the intended state and at most one of them reports having written it.
Reordering and deleting are transactional batches: the whole new order commits or
none of it does, and a delete closes its gap in the same transaction.

The whole checklist array is never written to change one checkbox. That is the
lost update the JSON-on-Task option would have shipped, and it is the reason the
model is rows.

## 10. Activity

**Checklist mutations append no Activity events.** A checklist tick is STATE, not
history. Activity is the history of RECORDS, and putting ten rows into the
workspace timeline because a Task grew ten steps would drown the events that
describe commitments — exactly the flood the item warned about. The Task's
current checklist is itself the useful truth, and the surface that shows it is
the record.

Every mutation does bump the parent Task's `updated_at`, so "recently updated"
stays honest and a Task whose steps changed reads as changed.

If per-item completion history is ever wanted, it is a deliberate design (an
append-only history table, or an event type with a payload that carries no free
text) rather than a side effect of this one.

## 11. Offline

**Ticking and unticking a checklist item is offline-capable. Adding, renaming,
deleting and reordering are not.**

The tick rides PWA-12's existing queue, receipts and conflict rule rather than a
second system:

  - the queued operation is `set_checklist_completed`, a replace-style operation
    whose field is the ITEM's own tick;
  - the record gains `targetId`, the sub-record inside the entity — so two queued
    ticks on two different steps of ONE Task are two independent changes rather
    than one field edited twice, which is what a coalesce would otherwise
    destroy;
  - the receipt is filed under the ITEM's id, so a receipt for "tick step 2" can
    never be satisfied by a request naming step 3;
  - a conflict compares the item's tick, so a server change to a DIFFERENT step
    MERGES rather than conflicting;
  - an item deleted elsewhere is terminal and says which thing went — the Task is
    still there, so a message claiming the Task was deleted would be untrue;
  - replay posts the SAME intent the online control posts, to the same protected
    route.

The other four are online-only, and each for the same kind of reason: adding
needs a server-assigned id and a server-assigned position; renaming and deleting
address an item whose identity the device may no longer share; reordering
contends over the list's WHOLE current order, which is not a single comparable
field. Queueing any of them would mean inventing a conflict rule that PWA-12
deliberately does not have. Recorded as **DEBT-160**.

## 12. Query bounds

A row surface obtains progress only through
`TaskRepository.listChecklistProgress(ids)`: one indexed, workspace-scoped
aggregate per bounded chunk of ids. The statement count is a function of the
caller's PAGE SIZE — a constant per surface — and never of how many Tasks the
workspace holds.

MEASURED in `test/kernel/task-checklist.test.ts`: a page of 50 Tasks with
checklists costs the SAME one statement that a page of 1 does, and an empty page
costs none.

The chunk is **80**, not 100, and the reason is a defect this item found and
fixed: **D1 accepts at most 100 bound parameters per query**, and the workspace id
is one of them. With a chunk of 100 the statement failed — and because Today
degrades a failed section rather than returning a 500, the symptom was a day
reporting *"Nothing planned today"* while the database held thirty-seven planned
Tasks. `test/unit/tasks/task-checklist-query-bounds.test.ts` pins the chunk under
the limit, and `test/kernel/task-checklist.test.ts` reads a 120-id page across
the seam.

Two further guards followed from it: each progress read is wrapped in its own
degradation, so a figure that cannot be read costs the FIGURE and never the page;
and a source-level test asserts no loader ever calls the aggregate from inside a
loop.

The Task record reads its own Task's checklist directly, with the record, in one
statement. That is a record fetching its own children and is not an N+1.

## 13. The record's UX

The checklist is the Task record's FEATURE region — under the header, above the
summary band. `RecordLayout` describes that slot as the region that IS the
record's subject, and for a Task with steps, the steps are what the owner opened
the record to work through. Below the planning controls it would have meant
scrolling past the parent, the waiting state, two dates and the repeat rule to
reach the thing being executed.

The interaction is modelled on Things and Todoist rather than on a form:

  - one **Add checklist** / **Add item** affordance, which opens an inline input
    in place. A Task with no checklist costs one subtle button, not an
    empty-state card;
  - **Enter** saves and immediately opens the next blank input, so a list is
    typed in one flow rather than one round trip per step;
  - **⌘/Ctrl+Enter** finishes — the same "commit and leave" the rest of the
    product binds it to, not a new shortcut;
  - **Escape** closes a BLANK input and never discards typed words;
  - blur saves, like every other inline field in DalyHub;
  - a title is renamed through the shared DS-16 inline field — the same
    click / Enter / Escape / blur behaviour every other editable value has;
  - **reorder is two ordinary commands** in the item's menu, *Move up* and *Move
    down*, disabled at the ends. No drag-and-drop dependency was added, and more
    importantly a menu command works identically with a mouse, a keyboard and a
    thumb, which no drag gesture does.

Progress is two NUMBERS — "2 of 4 complete" — never a ring, never a percentage
and never a score. When every step is done the line says so AND says the Task is
still open.

Anatomy, deliberately the lightest thing in the product:

```
[check]  Item title ................................................ [⋯]
```

No card per item, no chip, no priority, no date, no assignee, no icon run. A
checklist is intentionally simpler than a Task and the anatomy is the argument.

## 14. The collection, Today and Weekly Planning

The shared `TaskRow` gained ONE compact value — `2 of 5` — in the title cell,
beside the repeat mark. It is a shared capability, so `/tasks`, Today and `/plan`
all show the same figure for the same Task; none of them forks the row.

Checklist item TITLES are never drawn in a collection. An item never gets a
selection checkbox. The Task appears exactly once in `/tasks`, once on Today and
once in `/plan`, with or without a checklist.

**The figure stops below `md`, and the numbers are why.** MEASURED on the same
page with and without a checklist
([`measurements.json`](assets/v2-3-tasks-13-checklists/measurements.json)):

| width | row WITH "2 of 5" | row with no checklist |
|---|---|---|
| 1440 | 44px | 44px |
| 1280 | 44px | 44px |
| 393 (before the rule) | 100px | 81px |
| 320 (before the rule) | 100px | 81px |

On a desktop it costs nothing. On a phone the row is two stacked lines and the
title has the narrowest measure it ever gets, so five characters beside it do not
sit in spare space — they take width off the title and wrap it, at nineteen
pixels a row, on the surface where density matters most. With the rule in place,
a phone row with a checklist measures the same as one without.

Weekly Planning shows the figure and nothing else: a checklist item has no
planned date, never enters "Still to place", never consumes the bulk selection
and never writes a `scheduled_date`. `/plan`'s one extra read is a single
aggregate over the union of the page's Tasks.

The Review Inbox and the guided Review deliberately project NO progress: both are
triage flows whose question is "where does this belong", and a step count answers
a different one. Not projecting it also means those surfaces pay nothing for it.

## 15. Search

Searching *"tyre pressures"* finds the parent Task *Prepare camper for trip*,
because the phrase exists in one of its steps. It is one `EXISTS` inside the
statement `searchTasks` already makes — no second query, no index, no new
provider — and it ranks below every title match, so a Task actually called "Tyre
pressures" still comes first.

A checklist item is **never a result**. It has no route, no record and no hit of
its own; the result is always the TASK. SEARCH-02 is not started here.

## 16. Phone and accessibility

MEASURED at 1440, 393 and 320
([`measurements.json`](assets/v2-3-tasks-13-checklists/measurements.json)):

  - **no horizontal overflow at any width**, including 320
    (`scrollWidth === clientWidth` on every capture);
  - **checklist row height 45px** — the touch floor — for a one-line step at
    every width. A first draft measured 57px because the row's own padding
    stacked on top of the shared inline editor's 44px floor; removing it is
    thirteen pixels a step, which on a checklist of eight is a hundred pixels of
    a 420px panel;
  - **every check control and every item menu is 45 × 45**, on every viewport.
    The Task ROW's control shrinks to 28px behind a fine-pointer query for
    density; a record panel has the height to spare, so the checklist does not
    inherit that reduction;
  - **a long step WRAPS rather than truncating**: the 76-character step measures
    75px at 1440 and 118px at 320, and the row grows with it;
  - **the title keeps the width**: 269px at 1440, 255px at 393, 182px at 320,
    inside a record 375 / 361 / 288px wide.

Accessibility: the checklist is a semantic `<ul>` named by its heading; each
checkbox is a real `<input type="checkbox">` whose accessible name is its own
step and whose state is the checkbox's; completion is carried by the checkbox and
the strike-through is decoration on top of it, never the only signal; every item
menu names its step; focus after a delete lands on the step that took its place;
and closing the composer returns focus to the control that opened it. `axe` runs
clean at WCAG 2.2 AA in BOTH appearances, with no rule disabled.

That last one found a real defect. The checkbox's 20px mark passes SC 2.5.8 only
through the spacing exception, and the shared control's -12px inline margins put
the rename trigger 2px INSIDE it — a serious `target-size` violation on every
row. The fix is the row occupying its full 44px target rather than pulling itself
out of the grid, which is the right thing for a record panel anyway.

## 17. Ready for Project Templates

PROJECT-02 is the next item and is NOT started here. What TASKS-13 leaves it:

  - **durable rows**, not prose and not a blob — so a template copies records;
  - **clear clone semantics**, already exercised: the recurrence successor is a
    structure-only clone with per-row fresh ids and reset completion, and a
    template's copy is the same operation;
  - **stable ordering** that survives a copy, because `position` is dense and the
    read order is total;
  - **deterministic ids**, minted by the repository's own generator;
  - **no component-local state as a source of truth** — the client seam holds the
    server's last answer and nothing else.

## 18. Deliberate non-goals

Child Tasks · nested checklists · arbitrary Task hierarchy · checklist due dates,
priorities, assignees, Projects, recurrence, reminders, comments, attachments or
dependencies · per-item time estimates · per-item notifications · Project
Templates · advanced recurrence · AI-generated checklist items ·
natural-language checklist capture (`Buy groceries [milk, bread]` is NOT parsed;
Task capture stays fast and deterministic) · shared or team assignment · a
checklist as a global search record.

## 19. Debt raised

  - **DEBT-160** — only checklist COMPLETION is offline-capable; add, rename,
    delete and reorder are online-only.
  - **DEBT-161** — a phone Task row shows no checklist figure, so the step count
    is reachable only by opening the record.
