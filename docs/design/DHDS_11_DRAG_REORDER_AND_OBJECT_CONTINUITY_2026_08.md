# DHDS-11 — Drag, reorder and object continuity

**Status:** implemented. Branch `claude/dhds-11-drag-reorder-continuity-87une7`.
**Date:** August 2026.
**Extends:** [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md),
[`DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md),
[`DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md`](DHDS_09_FLOATING_SURFACES_AND_CONTEXTUAL_CHOICE_2026_08.md)
and
[`DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md`](DHDS_10_INLINE_MANIPULATION_AND_DIRECT_EDITING_2026_08.md).

DHDS-08 decided how a surface **moves**. DHDS-09 decided what a floating surface
**is**. DHDS-10 decided **which values are changed where they are shown**.
DHDS-11 decides **which objects can be moved through space**, and — the half
that took most of the work — **which cannot**.

---

## 1. The product outcome

> **Moving something in DalyHub should feel like moving that actual thing — not
> submitting a form and waiting for the screen to redraw.**

An object the owner picks up is the same object all the way through: it lifts,
it follows the pointer, the place it came from stays where it was, the place it
is going says so, and when it is released it settles into a truth that survives
a reload.

**And the hard counterweight, which matters as much:** almost nothing in DalyHub
is draggable, and that is the design. A page at rest after DHDS-11 is
byte-identical to a page at rest before it. There are no grips on Today, none in
Search, none on a Project card, none on a Habit, none on a Note. Every grip in
the product appears on engagement, on a surface where the domain already has
somewhere to put the object.

---

## 2. The rule — "Can I make this draggable?"

A future agent should be able to answer that from this document alone. The
answer is **yes only when all six are true**:

1. **The object has a real spatial destination or a real order.** A stored
   position the product reads back, or a container that is a value of a field.
2. **The underlying domain mutation is explicit.** You can name the field the
   drop writes, in one sentence, without a conditional.
3. **The destination is visible and understandable** on the screen the drag
   starts from.
4. **A non-drag path exists** and is at least as complete — a contextual choice,
   a menu command, or a keyboard grammar.
5. **Persistence is truthful.** The server accepts the change, and a reload
   proves it.
6. **Dragging is faster or clearer than choosing.** If a two-press menu would do
   the same job, the menu is the answer.

If any one of them is no, **the object is not draggable**. The correct response
is a DHDS-10 control, not a drag with a caveat.

### The forbidden list, stated positively

DalyHub does not, and will not:

| Never | Because |
|---|---|
| Drag to delete, or a destructive swipe hidden inside a drag | This is a person's life. Destruction is an explicit command with its existing safeguards. |
| Drag to change arbitrary metadata | A value with a name is changed where it is stated (DHDS-10). |
| Drag when the destination is off-screen | An operation whose target you cannot see is a guess. |
| Manual reorder inside a derived sort | The drop would appear to work and the next read would undo it. |
| Client-only ordering | Fake persistence is the single worst outcome this phase could ship. |
| A mutation fired on hover | A request happens on a committed drop and at no other moment. |
| Drag as the ONLY way to do something | Asserted by test, not by convention. |
| Rotation, tilt, spring, bounce, elastic movement | DHDS-08 owns motion; none of those is in its vocabulary. |
| A second drag system | DHDS-11 began by deleting one. |

---

## 3. What is actually orderable — the audit

Before a line of UI, every candidate collection was classified against its own
schema. This table is the finding, and it is the reason the implemented set is
small.

| Collection | Order is | Stored where | Draggable? |
|---|---|---|---|
| **Task checklist steps** | **manual, the owner's** | `task_checklist_items.position` (migration 0045) | **Yes** |
| **Goal stages (milestones)** | **manual, the owner's** | `goal_milestones.position` (migration 0038) | **Yes** |
| Tasks in a list | **derived** — `smart`, `due_date`, `scheduled_date`, `priority`, `created`, `updated`, `title`, `parent` | nothing. `task_details` has **no ordering column**, deliberately (migration 0006 says so in as many words) | **No** — §4 |
| Tasks in a grouped bucket | derived within the bucket; the BUCKET is a field | the field the dimension names | **Between buckets only** — §6 |
| Today's sections | editorial + scheduling logic | derived | No |
| Plan's week | `scheduled_date` per day | a date, not a rank | No — the day buttons already write it |
| Projects, Areas, Goals, Notes, People, Assets, Meetings, Habits | derived (alphabetical, status, updated) | nothing | No |
| Meeting agenda items | manual (`meeting_items.position`) | — | Not adopted — §11 |
| Project template items | manual (`project_template_items.position`) | — | Not adopted — §11 |
| Analytics, Search | not a collection of movable objects at all | — | No |

Two of the product's collections passed. Both are implemented.

---

## 4. Tasks have no manual order, and DHDS-11 did not invent one

This is the phase's largest decision, so it is stated plainly.

Every Tasks sort in the product is **derived from data**: `smart`, `due_date`,
`scheduled_date`, `priority`, `created`, `updated`, `title`, `parent`. There is
no `manual` sort, and `task_details` carries no rank column — migration 0006
records the omission as deliberate ("there is deliberately NO … ordering …
column"), and nothing since has added one.

So dragging a Task **up and down a list** would have required one of two things:

- **inventing a ranking model** — a new column, a new ordering key, a new
  concurrency story, a new offline operation, a new sort mode, a new control to
  select it, and a migration on a live schema; or
- **faking it** — a client-side order that looks right and is gone on the next
  navigation.

The second is forbidden outright (§2). The first is a **domain change**, not an
interaction one: it needs a decision about what "Manual order" means when a
filter is applied, what it means across two devices, and whether an owner who has
eight sorts wants a ninth. DHDS-11 is an interaction pass over the product's
existing domain, and it will not add a persistence model to give itself something
to drag.

**What the product does instead is already better for the common case.** A Task
list has eight orderings, thirteen filters and a grouping axis. The reason to
move a Task is almost never "it should be two rows higher"; it is "it belongs
somewhere else" — a different Project, a different priority, a different Time
Sector — and that is exactly what §6 makes spatial.

Recorded as **DEBT-188**. If a manual ranking model is ever added, this document
is where the drag that consumes it belongs.

### Sorted lists say why, rather than snapping a row back

A Tasks list sorted by due date offers **no grip at all**. It does not offer one
and then refuse the drop, and it does not accept the drop and then undo it on the
next read. There is nothing to explain because there is nothing to attempt — the
capability is absent, in the same way the row's date control is absent on a
read-only Deleted view.

---

## 5. The grammar

One sequence, everywhere:

```
engage → lift → destination reveals → move → settle → persist → Undo where useful
```

### Engage — a grip, not a row

Dragging is **deliberate**. A row is not draggable from every pixel, because a
DalyHub row is also a link, a checkbox, four editable values and (on touch) a
swipe surface. Every drag starts from an explicit `DragHandle`: a real
`<button>` with an accessible name in the product's words ("Reorder Prepare
training brief", "Move Prepare training brief").

- **Fine pointer:** the grip is a DHDS-08 reveal element inside the row's
  `data-dh-action-context`. It occupies its geometry at rest, so revealing it
  moves nothing, and it stays revealed while it is holding something.
- **Coarse pointer:** it is simply drawn, at the product's 44px floor.
- **Forced colours:** it is drawn unconditionally.

`touch-action: none` is scoped to **the grip alone**, so every other pixel of
every row still scrolls a phone normally. That is the whole of how DHDS-11
avoids breaking touch scrolling.

### Lift

The object becomes a floating preview under the pointer (§7). The row it left
keeps its place and is drawn quiet (§8). Nothing collapses, nothing jumps, the
scroll position does not move.

### Move

Destinations disclose progressively (§9). Exactly one region on screen looks like
the answer at any moment.

### Settle

On release: the object lands, the surrounding rows close the gap at
`--dh-motion-base` on `--dh-ease-emphasized` (DHDS-08's recorded rung for exactly
this), the change is painted optimistically where that is safe, and the canonical
mutation is posted. No bounce, no overshoot.

### Persist

Through the **same intent the contextual control beside it posts**. There is no
drag mutation, no drag endpoint, no drag cache and no drag history anywhere in
the product. This is a hard architectural requirement and it is asserted by test.

### Undo

The product's one Undo (DS-10), through the ordinary notification. The toast
names the destination:

```
Moved to DHDS-11 Homestead        Undo
```

never `Drag operation successful`.

---

## 6. Where a drag exists, and what each one writes

### 6.1 A Task's checklist — reorder

The order is the owner's and is stored. The drag posts `checklist_reorder`:
**the same intent, through the same client seam, that "Move up" in the item's
menu has posted since TASKS-13.** Both submit the WHOLE order, so the server can
refuse a list that no longer matches its own rather than applying half a move.

The menu commands stay. TASKS-13's reason for them is still true — "Move up"
works identically with a mouse, a keyboard and a thumb — and DHDS-11 adds the
spatial path beside it rather than replacing it.

### 6.2 A Goal's stages — reorder

`goal_milestones.position` has been stored and read back in since GOAL-02 with
**nothing able to change it**: the order was whatever the stages happened to be
added in. DHDS-11 adds:

- `GoalMeasurementRepository.reorderMilestones(goalId, ids)` — one transaction,
  dense renumbering, a membership precondition carried into the write, and **no
  Activity**, because the order of a Goal's stages is configuration and only a
  completion transition is progress;
- a `reorder_milestones` intent on `POST /goals/:goalId/measurements`, which
  verifies every id belongs to THIS Goal before anything is written;
- **Move up / Move down** in the stage's overflow — which the row did not have at
  all, and which is the non-drag path the rule in §2 requires.

Reordering changes no completion and moves no progress. Asserted in the kernel
tests and again end to end.

The stage row's actions converged onto the Task checklist row's grammar in the
same change: it carried a bare "Remove" button and now carries the same overflow
— Move up, Move down, then the destructive act.

### 6.3 A Task into another bucket — the cross-context move

A grouped Tasks view already draws its destinations: every bucket is a
server-authoritative group of one dimension. **A bucket is a destination exactly
when its key IS a value of a stored field.** That single rule is the whole
decision, it lives in one file
([`task-drop-targets.ts`](../../app/modules/tasks/task-drop-targets.ts)), and it
admits four dimensions:

| Grouping | Bucket key is | The drop posts | Reused from |
|---|---|---|---|
| `parent` | the Project/Area entity id, or `__none` for Inbox | `set_parent` | the row's own Project picker (DHDS-10) and the bulk bar |
| `priority` | `p1`…`p4` | `set_priority` | the row's priority menu |
| `status` | `todo` / `in_progress` / `on_hold` / `cancelled` | `set_status` | the bulk bar |
| `sector` | a Time Sector, or `__none` | `set_sector` | the bulk bar |

**Group by Project, then drag a Task onto another Project.** That is the
interaction §14 of the brief asks for, and it is the one this phase is proudest
of: the destination is a real Project with a real name, on screen, holding real
Tasks, and the drop writes `projectId` through `intent=set_parent` — the same
atomic mutation the picker uses, with the same validation, the same archived-
Project refusal and the same Activity.

Three dimensions are **refused**, and the reasons are the rule working:

- **`due_state` and `planned`** bucket by a derived RANGE — `due_this_week`,
  `planned_later`, `overdue`. No date is named by those keys. "Make this due
  later" is not an operation, and picking one (the Friday of the current week,
  say) would be the product guessing at intent. The row's `DateChoice` says a
  date in one press.
- **`delegate`** — delegation carries a note and a follow-up date and is an act
  rather than a metadata choice. DHDS-10 kept it off the row for the same reason.
- **the `completed` bucket of `status`** — that key is derived from spine
  completion, not from `task_details.status`. A drop there would be a lifecycle
  change wearing a re-bucket's clothes, and completion has its own control on
  every row, its own Undo and a recurrence consequence.

**The Board presentation is a grouped view, so its columns are destinations by
the same rule and with no extra code.** `list`, `board` and `sectors` render the
same buckets through the same component; only the container layout differs, and
that difference is CSS. A Task dragged between board columns therefore writes the
same field a Task dragged between list groups writes — which is also why DalyHub
does not have Kanban semantics anywhere: a column is a bucket of a stored field,
never a workflow stage invented to give the board something to be.

**Two configurations opt out entirely even when the dimension qualifies:** the
Deleted view (every mutation on a soft-deleted Task is invisible, so a drag could
only ever fail) and **selection mode** (a mode with its own gesture — a hold
enters it, a tap extends it — and the selection already has a "Move" action in
the bulk bar; two meanings for one press on one row is the interaction conflict
§44 of the brief describes).

---

## 7. The drag preview — the same object, floating

The preview is **the object**, at the size it was lifted at, drawn by the surface
that owns it.

- A **Task** preview carries the four facts the row leads with: its priority
  flag, its title, its completion state (struck through if it is done) and its
  Project. No columns, no editable fields, no dates, no overflow.
- A **checklist step** or a **Goal stage** preview is its words. A step is
  deliberately simpler than a Task, and its preview is deliberately simpler than
  a Task's.

It gains **elevation**, because it is now physically floating, and an **edge**,
because in dark mode a shadow alone does not separate a surface from the surface
under it. It gains nothing else: no saturated outline, no glow, no rotation, no
tilt, no scale, and it is only slightly translucent — a preview you cannot read
is not the object.

It has **no transition** while it tracks the pointer. A transition on a followed
pointer is lag, by construction.

**It is capped, and clamped.** A Task row is the full width of the collection,
and the first implementation used the source's measured width — which produced a
976px banner following the pointer and running off the right edge of the window.
Found by looking at the frames. The preview is now capped at 360px, the GRAB
OFFSET is capped with it (otherwise the pointer ends up beside the preview
rather than holding it), and the layer clamps its position into the viewport so
the object the owner is holding is never cut in half. A preview narrower than
the cap keeps its own width: a checklist step is already the size of an object.

**A keyboard drag renders no preview at all.** Nothing is following anything: the
object moves through the collection itself and the live region says where it now
is, which is the whole of the feedback a keyboard user can act on.

---

## 8. The source placeholder — one slot, kept

When an object lifts, **its row keeps its place** and is drawn quiet
(`[data-dh-drag-source]`, 40% opacity; an edge in forced colours, where opacity
is discarded). It never collapses. The list never jumps. The scroll position
never moves.

In a sortable list that quiet slot IS the placeholder: it travels to the
insertion position as the pointer crosses each neighbour's centre, so the gap the
object will land in is always visible and is always exactly one row. There is no
dashed rectangle anywhere in the product.

---

## 9. Drop indicators — two, and only two

One canonical grammar per kind of destination:

| Destination | What is drawn |
|---|---|
| **A sortable list** | the placeholder slot moving to the insertion position. No insertion line: the gap IS the line, and it is the thing that will actually be occupied. |
| **A container** (a Tasks bucket) | a restrained edge, plus its own name and "Move here" when it is the active one. |

**Progressive disclosure, in two rungs and no more:**

- a **candidate** — a destination that would genuinely accept THIS object —
  gains a dotted edge and nothing else, so a page of candidates reads as a page
  rather than as a light show;
- the **active** one gains the accent, a tint and a solid edge.

A region that would **refuse** the drop registers nothing and is drawn nothing.
It is never possible to hover a lit target that then declines — including the
bucket the object came from, which stays completely dark because moving a Task to
where it already is would change nothing.

---

## 10. Object continuity

The second half of the phase, and the half with no gesture in it.

### A completed row LEAVES — DEBT-177, closed

DHDS-08 shipped steps 1–4 and 6 of the completion sequence and deferred the
departure, recording two blockers. DHDS-11 takes both.

**Which rows depart** is not a per-surface opt-in flag. A row departs when it
**actually left** — when an id the surface has just mutated is no longer in the
list the loader answered with. A surface that KEEPS completed work produces no
departure at all, because the row is still there; a surface that removes it
produces exactly one. The animation therefore cannot disagree with what happened,
because it is derived from what happened. A filter change, a page and a
navigation remove rows too, and none of those is a departure: only ids the owner
just acted on are eligible.

**Where focus goes**: to the row that takes this one's place — the next live
row's completion control, the previous one when there is no next, and the list
itself (a named region, `tabIndex={-1}`) when the list is now empty. Never
`<body>`. The rule is the one the product already uses when a checklist step is
deleted, so it is a precedent rather than a guess.

The departing row is `aria-hidden` and pointer-inert rather than `inert` — `inert`
blurs its subtree synchronously, so the successor could no longer be chosen. The
departure is derived **during render** and spliced back **at the index it held**,
so the DOM node is never removed and never moved, which is the other half of
keeping focus.

The collapse animates `block-size` at `--dh-motion-deliberate` on
`--dh-ease-exit`: the third documented structural exception in `motion.css`,
beside disclosure's `grid-template-rows` and progress's `inline-size`, and for
the same reason — there is no compositor-friendly way to close a gap. It is one
row, once, for 260ms.

Under reduced motion no row is ever marked as leaving: it goes when the loader
says it went, exactly as it did before, and the focus handoff — which is not
motion — still runs.

### Stable identity

Every movable collection is keyed by its record's canonical id, never by an array
index, and this is a **functional requirement** rather than a React optimisation:
an index-keyed reorderable row remounts every sibling on every move, so focus is
lost, an in-flight edit is discarded, and the exit animation plays on the wrong
object. `SortableList` owns the key so a consumer cannot get it wrong, and a
source-level test asserts it.

### The record you opened came from HERE

A Task row whose record is open keeps a quiet current marker — a 2px accent at
its leading edge, and `aria-current="page"` on the link that opened it — for as
long as the Inspector is above it. Closing the Inspector therefore lands the
owner's eye on the row they came from rather than on a list they have to re-find
their place in.

It is a MARK rather than a wash, for two reasons: bulk selection already owns the
wash, and two states that look alike and mean different things is worse than one
state fewer; and it is an inset shadow rather than a border, so it costs the row
no width and moves no text. It reads the drawer STACK rather than a second piece
of state, so it is true for a bookmarked URL and for a Back-navigated one exactly
as it is for a click — and every row in a nested stack (a Task opened from a
Task) is marked, because each is one the owner came THROUGH.

There is no shared-element animation, and there will not be one. The continuity
DalyHub owes here is *"I opened this object from here, and here is still here"* —
which is a matter of stable identity, a preserved scroll position and one quiet
mark, not of animating a row into a panel.

### Context survives a move

A drop changes one field through one intent and **revalidates only when the
change touches the dimension the current configuration is sensitive to**
(`task-revalidation.ts`, unchanged). The URL is untouched, so the grouping, the
filters and the sort are untouched. Scroll is untouched. The buckets the object
did not come from or go to are untouched.

### A move can legitimately make an object disappear

A view filtered to one Project, with a Task dragged to another, correctly no
longer contains that Task. That disappearance is the truth, and it is made
understandable by the departure motion and by the Undo toast, which names where
the object went. Stale data is never kept on screen for the sake of continuity.

---

## 11. Deliberate non-adoption

Every one of these looks like a missed surface and is not. A good DHDS phase
includes deliberate non-adoption; these are the decisions.

| Not draggable | Why |
|---|---|
| **A Task's position in a list** | The domain has no manual rank (§4). Implementing one is a schema change, not an interaction pass. |
| **Today** | Today is editorial and decision-first. Its order is a recommendation and a schedule; overriding that to make a drag possible would be replacing the product's own judgement with a gesture. Today gains continuity here, not reorder. |
| **Plan (weekly)** | Placement is a date, and PLAN-01's seven day buttons already write it — at the full touch target, named in words, reachable by keyboard. A drag would be an accelerator over a control that is already one press. Its own stylesheet says so: "the reason this surface needs no drag". |
| **Scheduled calendar events** | External calendar events are READ-ONLY in DalyHub. Dragging one would be fake rescheduling of somebody else's truth. |
| **Task reparenting (subtasks)** | The spine's Task parent is a Project or an Area; DalyHub has no Task→Task hierarchy to indent into. DHDS-10's explicit parent picker remains the whole answer, with the domain's own cycle prevention behind it. |
| **Projects → Areas** | A Projects collection is not grouped by Area, so there is no visible Area container to drop onto — the destination fails rule 3. DHDS-10 made the parent an inline picker in the Projects table, which is one press. If a Projects view ever groups by Area, its buckets become destinations by exactly the rule in §6.3 and this entry should be revisited. |
| **The navigation rail (Today / Inbox / Upcoming)** | Evaluated, and refused on architecture. The rail is registry-derived chrome that owns no domain mutation (`AGENTS.md` §9.1–9.2); making it a Task destination would put a Task mutation in the shell, or would need a new runtime capability in the module registry — a kernel change with its own ADR. **Inbox is already a destination** on the grouped view (the `__none` parent bucket), and Today is one press away through the row's own date control and the touch swipe. Recorded as DEBT-189. |
| **Goals** | A Goal is not a board and will not become one. Its stages are ordered (§6.2); nothing else about it is. |
| **Habits** | Check-in is one tap and stays one tap. Cadence is domain-protected. There is no user-defined habit display order to persist. |
| **Notes, People, Assets, Meetings, Diary** | No manual order exists in any of them, and no cross-context move has an unambiguous field. A Meeting's agenda items DO have `position` — they are the strongest remaining candidate and are recorded as debt rather than added, because the agenda has explicit conflict protection and an autosave contract that a reorder would have to be reconciled with. |
| **Project templates** | `project_template_items.position` is manual, but a template is authored rarely and edited through a form. Adding a drag there would be adoption for its own sake. |
| **Analytics** | There is no customisable dashboard concept in DalyHub. Charts are not draggable for visual novelty. |
| **Search** | Search navigates. A global result list is not an editing surface (DHDS-10 §12), and it is not a drag source either. |
| **Drag to delete** | Never. §2. |

---

## 12. Behaviour contracts

### Desktop

- the grip reveals with the row's other affordances and moves nothing when it
  does;
- the cursor is `grab` on the grip and `grabbing` across the whole document while
  a drag is live;
- text selection and the context menu are suppressed for the length of the drag,
  because the pointer belongs to the object;
- **autoscroll** activates within 48px of a scroll container's edge (the nearest
  genuinely scrollable ancestor, or the viewport) and moves 12px a frame — about
  700px a second: fast enough to cross a long list, slow enough to stop on a row.
  It stops on the same frame the pointer leaves the band.

### Keyboard

| Key | On a sortable collection |
|---|---|
| Enter / Space | pick up — and, while holding, drop |
| ↑ / ↓ | move one place, announced |
| Escape | cancel; the object returns to where it was |

Arrow keys are captured **only while the handle is holding an object**, so
nothing the row's arrows already do is taken away. No shortcut in the product was
rebound.

A handle with **no home collection** — a Task row, which has no manual order to
move within — offers pointer dragging only. Its keyboard equivalent is the row's
own DHDS-10 control, six pixels away, which changes the same field by choosing.
That is not a gap: it is the rule that drag is an accelerator.

**Announcements** come from one live region, `polite`, in the product's words:

```
Picked up Prepare training brief. position 2 of 8. Use the arrow keys to move, Enter to drop, Escape to cancel.
Prepare training brief moved to position 3 of 8.
Prepare training brief over DHDS-11 Homestead. Release to move.
Prepare training brief moved to DHDS-11 Homestead.
Move cancelled. Prepare training brief stayed where it was.
```

The instructions are spoken **once**, on pick-up, and never repeated on the moves
that follow.

### Touch and mobile

Deliberate, not copied from the desktop.

- **A checklist step and a Goal stage keep their grip on a phone**, at the 44px
  floor. They are short lists inside a record, the grip is explicit, and
  `touch-action: none` is scoped to it so the record still scrolls.
- **A Task row offers no grip on a phone.** A phone-width Tasks list is a
  scrolling surface where the row is already a link, a checkbox and a swipe
  target; a free drag between buckets would fight all three. The move is the
  row's own overflow — "Move to Project or Area…" — which works with a thumb, a
  mouse and a screen reader alike, plus the row's inline priority and date
  controls, which DHDS-10 already converted to the canonical sheet.

That is the design goal the brief states: **effective manipulation, not identical
gestures.**

No **reorder mode** was introduced. It exists to resolve a conflict between a
gesture and ordinary row interaction, and no surface here has that conflict: the
two reorderable collections have explicit grips inside a record, and the Task
row has no free drag on touch at all. Adding a mode nothing needs would be the
complexity §44 warns against.

### Reduced motion

DHDS-08's contract, inherited unchanged, plus one thing stated locally: no row is
ever marked as departing, so the completion collapse simply does not run. Every
destination state is a colour or an edge that does not depend on movement to be
seen, and every operation completes immediately.

### Offline

A drag maps to an existing intent or it does not exist, so this is decided by the
intent rather than by the gesture:

| Operation | Offline |
|---|---|
| `set_priority` on a drop into a priority bucket | the **same** replace-style offline operation the row's priority control already queues (PWA-12) — wherever the surface routes it through the offline poster |
| `set_parent`, `set_status`, `set_sector`, `checklist_reorder`, `reorder_milestones` | **online only**, exactly as they are through their pickers and menus |

`/tasks/bulk` is not part of the PWA-12 slice, so a bucket drop made offline is
refused with the ordinary transport message rather than being queued — the same
answer the bulk bar gives. **Nothing claims a reorder succeeded offline**, which
is the one thing that must never happen. Widening the offline slice to cover
relationship and order changes is a PWA-12 decision (each needs the whole list's
identity to still be what the device last saw, which is not a single comparable
field) and is recorded as debt rather than guessed at here.

### Failure and refusal

- the optimistic paint is the **client's guess** (ADR-086) and survives only
  until the loader answers or the write is refused;
- a refusal rolls back **exactly the keys that write painted**, so a refused
  parent cannot un-paint a priority the server accepted a moment earlier;
- the server's own words are used where it gave a reason — "These stages changed
  somewhere else, so the new order was not saved" is a different fact from "that
  couldn't be saved", and the owner needs the first to understand that nothing
  was lost;
- a refused reorder **re-reads** the collection, so what is on screen afterwards
  is the truth rather than an order the server declined;
- **a release over nothing is not an error.** No toast, no alert: the object
  returns and the live region says so once.

### Concurrency

Both reorder operations submit the **whole order**, and both repositories refuse
a list that does not name exactly the collection's current members — in the same
transaction that would have written it, with the membership carried in as a
precondition rather than trusted across the read/write gap. A device holding a
stale list is told the collection moved instead of being told a stale order was
saved.

The client refuses first as a courtesy: `SortableList` cancels an in-flight drag
the moment its collection stops being a permutation of what the drag began
against. That is the courtesy; the repository is the protection.

Positions are renumbered densely (0…n-1) rather than fractionally. Both
collections are short, bounded and single-owner; a fractional key would buy
nothing here and would need a rebalancing story. `position` deliberately carries
no UNIQUE index — a renumber necessarily passes through states where two rows
briefly share a value, and the read order's `(position, created_at, id)` tiebreak
means even that transient state has one deterministic answer.

---

## 13. Dependency decision — no drag-and-drop library

**Decision: none added.** The engine is ~700 lines over the browser's own Pointer
Events.

**Requirements weighed:** pointer, touch, keyboard, sortable lists, container
targets, collision detection, a portalled preview, accessibility announcements,
React 19 compatibility, bundle impact, maintenance.

**Alternatives considered.**

- **HTML5 drag-and-drop** (`dragstart`/`dataTransfer`). Rejected outright, and
  banned by test: it cannot be driven from a keyboard, it is unusable on touch,
  and its drag image is a browser-drawn bitmap rather than a DalyHub object.
- **A focused DnD library** (the `dnd-kit`/`react-dnd` class). These are
  well-made and would have been justifiable. Three things decided against one
  here: (1) **the product already had most of it** — DS-04 had written an
  accessible pointer + keyboard reorder collection, and this phase generalises
  that rather than importing a second answer beside it; (2) **the hard part is
  DalyHub's vocabulary, not the mechanics** — the announcements, the destination
  wording, the "would this change anything?" rule and the Undo semantics are all
  product decisions a library cannot make, and they are most of the code; (3)
  **the surface area actually needed is small** — two sortable lists and one set
  of container targets, with no multi-axis grid, no virtualised list and no
  cross-window drag.
- **A full board library.** Rejected on product grounds: DalyHub is not a board
  app, and adopting a board abstraction is how it would become one.

**If that judgement changes** — a virtualised list, a two-dimensional grid
reorder, or a genuine multi-select drag — a focused MIT-licensed library is the
right answer, and the seam is already the right shape: `~/shared/drag` exposes
`useDragHandle`, `useDropTarget` and `SortableList`, and the surfaces know
nothing about what is underneath them. What must not change is that DalyHub keeps
its own visual behaviour and that no library's default styles reach the product.

No dependency was added, so there is no licence or provenance entry for this
phase.

---

## 14. What was removed

DHDS-11 began by deleting the product's **second drag system**.

DS-04 shipped `ReorderableCardCollection`, `CardReorderHandle` and `reorder.ts`:
a complete pointer + keyboard reorder collection with its own grip, its own
announcement wording, its own order model and its own pinned-card weave. It was
used by exactly one design fixture and by nothing in the product.

Leaving it would have meant two grips, two announcement vocabularies and two
answers to "what is a reorder", from the first day this phase shipped. All three
files are gone, the design fixture composes `SortableList` like everything else,
the card's `reorderHandle` slot now takes the shared `SortableHandle`, and
`card.css`'s private grip styles went with them (one entry off the state-layer
ratchet). Its pure order math moved into `drag-model.ts` with a fuller test.

The pinned-card concept did not survive the move. No DHDS-11 collection has a
notion of a card that stays put while its neighbours move, and carrying a
parameter nobody sets is how a second order model starts.

---

## 15. The architecture

```
app/shared/drag/
  drag-model.ts        pure: insertion index, permutations, every announcement
  drag-context.ts      the session contract
  DragProvider.tsx     the ONE session — pointer loop, targets, autoscroll, live region
  DragPreviewLayer.tsx the floating object, positioned through a ref
  use-drag-handle.ts   a source: the grip's props and the keyboard grammar
  use-drop-target.ts   a destination: accepts / candidate / active
  SortableList.tsx     a manually ordered collection
  DragHandle.tsx       the one grip
app/styles/drag.css    every state a drag paints, and nowhere else
```

`DragProvider` is mounted **once**, by the `AppShell`, above both the navigation
rail and the page. At rest it attaches no listener, renders no preview and costs
the page nothing.

**Performance.** `pointermove` writes the point into a ref and schedules one
animation frame; every DOM measurement happens inside that frame, once. React
state changes only when the DESTINATION or the INDEX changes — the preview's own
position is a transform written through a ref, so following the pointer costs no
re-render at all. The target registry is a ref rather than state, so a list
mounting fifty rows does not re-render the shell fifty times. **No request is
issued at any point except a committed drop.**

**It owns no mutation.** `onDrop` hands the payload back to the surface that
registered the destination. Asserted by test: nothing under `app/shared/drag/`
may contain a `fetch`, a fetcher, a revalidator or a submit.

---

## 16. Validation

### Gates

`format:check`, `lint`, `typecheck`, `scheme:check`, `icons:check`, `dhds:check`,
`build`, `test:unit`, `test:kernel`, `e2e:partitions:check`.

### Coverage added

**Unit**

| File | Protects |
|---|---|
| `test/unit/drag/drag-model.test.ts` | insertion at the centre rather than the edge, clamping, permutation-safety, the staleness predicate, and every announcement's exact words |
| `test/unit/drag/sortable-list.test.tsx` | the keyboard grammar end to end, that reorder emits INTENT, the live gap, focus staying on the grip, cancelling, the stale-collection refusal, a read-only collection, and that nothing is drawn at rest |
| `test/unit/drag/drop-target.test.tsx` | the whole pointer loop over supplied geometry: a destination that would change nothing never lights up, exactly one destination is active, **nothing is requested while the pointer passes over a target**, a release over empty space is a cancellation rather than an error, and the preview exists only while a drag is live |
| `test/unit/tasks/task-drop-targets.test.ts` | which dimensions are spatial and which are refused, what each bucket writes, that the `completed` bucket is refused, and that only canonical intents are ever produced |
| `test/unit/tasks/departing-rows.test.tsx` | which rows depart and which simply go, the three focus fallbacks, and a row that comes back cancelling its own exit |
| `test/unit/ui/dhds-11-drag-grammar.test.ts` | the source-level contracts below |

**The regression contracts**, each verified to fail when broken:

1. no HTML5 drag-and-drop anywhere in `app/`;
2. only `~/shared/drag` starts a drag;
3. the drag module contains no mutation of any kind;
4. DS-04's parallel reorder collection is gone and cannot return;
5. every drag STATE is declared in `drag.css` and nowhere else;
6. exactly one grab cursor exists in the product;
7. `drag.css` spells no duration and no curve of its own;
8. it states a reduced-motion contract and a forced-colours contract;
9. a bucket is mapped to an intent in exactly one file;
10. that file imports no React and issues no request;
11. sortable rows are keyed by the record's id, in the list itself;
12. no destination is registered under an index.

**Kernel** — `test/kernel/goal-measurements.test.ts` gains nine: the persisted
order, dense renumbering, repeated moves, the no-op, a refused partial order, a
refused foreign stage, malformed orders, cross-workspace isolation, and that a
reorder changes no completion, appends no Activity and leaves the weighted
summary identical.

**End to end** — `e2e/dhds-11-drag-reorder.spec.ts`, the brief's own acceptance
journeys: reorder → reload → the order holds; drag a Task onto a Project →
reload → it is still there → Undo puts it back; the same move through DHDS-10's
picker landing identically; the phone; and continuity (scroll, URL, filters and
the untouched buckets). Plus the rules those depend on: the source bucket stays
dark, no request is made while hovering, and a keyboard reaches all of it.

Timing is by visible state and by persisted server state. There are no sleeps and
no pixel choreography — a drag is expressed as "from this element's centre to
that element's centre", which is geometry the page itself supplies.

---

## 17. Visual evidence

`docs/design/assets/dhds-11-2026-08/`, captured by
`e2e/dhds-11-drag-screenshots.spec.ts` (opt-in: `CAPTURE_SCREENSHOTS=1`). Every
frame that has a light/dark distinction exists in both, because elevation and a
dotted edge are exactly the kind of restraint that survives light and fails dark.

| Frame | Shows |
|---|---|
| `tasks-rest-*` | **The acceptance frame.** A grouped Task list at rest, with no grip anywhere on it |
| `tasks-hover-*` | the same list with one row engaged with — the grip, and only then |
| `task-lifted-*` | the floating object, the quiet source row that kept its place, and the candidate destination |
| `task-over-project-*` | the active destination, with its own words, while every other region stays as it was |
| `task-settled-*` | after the drop: the Task in its new bucket, and the toast that says where it went |
| `checklist-rest-*`, `checklist-reordering-*`, `checklist-settled-*` | a manually ordered collection before, during and after — the middle frame is the one that matters, because the gap IS the insertion indicator |
| `goal-stages-rest-*`, `goal-stages-focus-*` | a Goal's stages, and the grip revealed by the keyboard rather than by a pointer |
| `phone-checklist-*` | a coarse pointer: the grip is simply drawn, at the touch floor |
| `phone-tasks-*` | a coarse pointer: the Task list has **no** grip at all |
| `forced-colours-drag` | every shadow and tint discarded, and the drag still legible from its borders |
| `reduced-motion-rest`, `reduced-motion-dragging` | the same operation with the travel removed |

**The frames were looked at, which is the only reason this section can be
trusted — and looking at them found two defects.** The first drag preview took
the SOURCE's measured width, which for a Task row is the full width of the
collection: a 976px banner following the pointer and running off the right edge
of the window. It is now capped at 360px, with the grab offset capped alongside
it and the layer clamped into the viewport (§7). The second was the capture pass
itself: seeded once rather than per test, so the second frame of each pair
photographed a Task already in the destination it was about to be dragged to —
evidence of nothing happening.

---

## 18. Known debt

Recorded in [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md).

- **DEBT-188 — Tasks have no manual ranking model.** §4. Until a domain decision
  is taken, a Task cannot be dragged up a list, and the product must not pretend
  otherwise.
- **DEBT-189 — the navigation rail cannot be a drop destination.** §11. It would
  need either a Task mutation in the shell or a new module-registry runtime
  capability.
- **DEBT-190 — the offline slice does not cover relationship or order changes.**
  A bucket drop and a reorder are online-only, and say so. Widening it needs a
  conflict story for a whole-list operation.
- **DEBT-191 — a Meeting's agenda items are ordered and are not draggable.** The
  strongest remaining candidate, held back by the agenda's autosave and conflict
  contract.
- **DEBT-192 — the Goal record and the Goals workspace pane declare their
  milestone callbacks twice.** The pane was extracted from the record and the
  record was not migrated onto it. The AUTHORITY is shared — both post the same
  intent to the same endpoint — but the wiring is duplicated, and this phase paid
  the cost by adding one callback in two places.

---

## 19. Phase boundaries

| Phase | Scope | State |
|---|---|---|
| **DHDS-08** | Motion and interaction grammar | done |
| **DHDS-09** | Floating surfaces and contextual choice | done |
| **DHDS-10** | Inline manipulation and direct editing | done |
| **DHDS-11** | Drag, reorder and object continuity | **this phase** |

**DHDS-10 chooses through interaction. DHDS-11 manipulates spatially.** Where
both can express the same change, they call the same operation — that is not a
convention, it is asserted.

---

## 20. The rule for future work

> **A drag that does not survive a reload is a bug. A second way to move
> something is a bug. A grip on a list whose order is derived is a lie.**

Compose `SortableList` for a collection whose order is stored, `useDropTarget`
for a container that is a value of a field, and `useDragHandle` for the grip.
Post the owning module's canonical intent — the same one the contextual control
beside it posts. If the six questions in §2 do not all answer yes, do not add
drag: the DHDS-10 control is the whole answer, and it is a better one.
