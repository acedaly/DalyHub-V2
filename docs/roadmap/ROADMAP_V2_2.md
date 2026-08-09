# ROADMAP_V2_2.md — V2.2, the Tasks daily driver

> The first V2.2 product programme: make Tasks as fast, direct and dependable as a
> dedicated task manager, while keeping DalyHub's Area → Goal → Project → Task spine.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) holds the V2.1 work. This file is V2.2.
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build;
> this tells you *what*. Status is updated in the PR that changes it. No time
> estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

---

## The programme

Four items, delivered as one coherent Tasks upgrade and accepted together as
[ADR-085](../decisions/ARCHITECTURE_DECISIONS.md#adr-085-the-tasks-daily-driver--the-matrix-removed-editing-moved-onto-the-row-bulk-made-structural-and-recurrence-given-a-second-scheduling-mode).
A fifth — **TASKS-09**, the latency contract — follows them: the four made Tasks
correct and direct, and TASKS-09 is what stops it *feeling* slow while it is.

The objective, in one sentence:

> **See Task → act on Task**, rather than *see Task → open record → find Edit →
> modify field → save → close record.*

The full behaviour is documented in
[`TASKS_MODULE.md → The daily driver (V2.2)`](../development/TASKS_MODULE.md#the-daily-driver-v22--tasks-05060708).
No Task authority changed: the spine still owns identity, completion and parentage,
`task_details` the additive fields, the shared Task Drawer the canonical record,
EntityLinks the one relationship model and Activity the one audit stream.

---

### ☑ TASKS-05 — Daily Driver Workspace — **DELIVERED 2026-08-08**

**List-first execution, the Eisenhower Matrix removed, and direct editing on the row.**

- **The Matrix is genuinely removed**, not hidden: the presentation, the `quadrant`
  server grouping dimension, the Do/Defer/Delegate/Delete vocabulary, the
  `priorityQuadrant` derivations, the CSS grid, the palette command and the
  `defaultTasksView` option are all gone. P1–P4 remain untouched as data, as a filter,
  as a sort, as a grouping and as a row signal.
  - `/tasks?view=matrix` **redirects once** to `view=list&group=priority` — the same
    records, banded by the same signal, in the primary workspace.
  - A stored `defaultTasksView: "matrix"` needs no migration: the preference read
    validates against the closed set and resolves to the primary list.
- **Time Sectors was assessed and KEPT** as a secondary planning presentation. It is a
  distinct stored field answering a question no date answers, unlike the Matrix, which
  was a second reading of one field.
- **Priority, due date, planned date and Project/Area edit IN PLACE on the row**,
  through the shared DS-16 inline fields. Nine now-duplicated entries left the row's
  overflow menu.
- **A Task may still have no parent.** Inbox stays first-class, "Move to Inbox" is a
  first-class command on the inline parent control, and one selection REPLACES the
  previous Project — never clear-then-save-then-reopen-then-choose.
- Quick capture, the deterministic parser and the project-less Inbox are unchanged.

---

### ☑ TASKS-06 — Bulk Management — **DELIVERED 2026-08-08**

**Real multi-selection over the existing canonical bulk authority.**

- **Selection**: row checkboxes, Shift-range in display order, "Select all visible",
  an explicit "Select tasks" toggle, and a phone long press. Selection resets on any
  view/filter/sort/grouping change and is pruned to what is on screen.
- **A rebuilt bulk bar** with mixed-value summaries: with P1s, P2s and untriaged tasks
  selected, Priority reads *Mixed* rather than inventing a current value. Complete ·
  Reopen · Date · Priority · Move · More, with the long tail behind **More**.
- **New atomic bulk operations** on the existing `/tasks/bulk` contract:
  `reopen`, `set_parent` (including Inbox), `delete` and `restore`. Each validates
  every id and the destination before a single write, then runs ONE `D1Database.batch()`.
  There is no client loop and no per-task request anywhere.
- **Bulk delete is reversible.** A soft delete, a calm confirmation naming the count and
  the consequence, and a new built-in **Deleted** view to restore from. Permanent
  destruction is not reachable from a toolbar.
- **Follow-on, 2026-08-09:** the 100-task bulk bound is now **stated before the action**
  rather than met as a refusal after it — "Select all" is capped and says what it takes,
  and a selection past the bound shows the bound and the remedy instead of a toolbar of
  controls that would all be rejected. The rule is pure and unit-tested; the E2E case
  that accumulates more than one page is still owed
  ([DEBT-110](../product/PRODUCT_DEBT.md)).

---

### ☑ TASKS-07 — Recurrence 2.0 — **DELIVERED 2026-08-08**

**Full authoring, two scheduling modes, and explicit series operations.**

- **Two modes**, stored as structured data and never inferred from text:
  - **Fixed schedule** — "Every Monday" stays Monday when the occurrence is finished
    late. This is exactly what every pre-V2.2 rule already meant, and it is the
    migration default.
  - **After completion** — "14 days after completion" re-anchors to the day the work
    was actually done.
  - A kernel test writes a rule the OLD way (no `mode` in the insert) and completes it
    late, so the equivalence is proven rather than assumed.
- **Custom rules are authorable** — any interval 1–99 over days/weeks/months/years,
  selected weekdays for a weekly schedule, and the choice of which date the rule
  advances. The result is stated in plain language *before* it is saved, through the
  ONE shared formatter every read-only surface uses. Closes
  [DEBT-66](../product/PRODUCT_DEBT.md).
- **Series scope is explicit** for the one operation where it is meaningful: moving an
  occurrence's date is *this occurrence* (the routine keeps its schedule) or *this and
  future* (the routine re-anchors). Completed occurrences are never rewritten.
- **Skip** is first-class and truthful: the occurrence advances one step and stays
  OPEN, with its own `task.recurrence_occurrence_skipped` event. Skipped work is never
  recorded as completed.
- **Stop repeating** ends the future and keeps every past occurrence.
- Every V2.0.1/AUDIT-FIX-01 guarantee is intact: exactly one successor, safe undo,
  retained edited successors, concurrent completion, retries, sequence uniqueness and
  recurrence-row slot release.
- **Deferred, recorded honestly:** ordinal monthly patterns ("first Monday of every
  month") — see [DEBT-109](../product/PRODUCT_DEBT.md).

---

### ☑ TASKS-08 — Mobile Daily Driver — **DELIVERED 2026-08-08**

**Capture, edit, select, bulk and recurrence, designed for touch.**

- **Long press → selection mode**, with the held row selected. It is an accelerator:
  the Card checkbox and the "Select tasks" toggle are the ordinary, labelled,
  keyboard-and-screen-reader path, and the gesture is inert on a non-touch device.
- The bulk bar collapses to the M3 bottom action row the shell already uses —
  Complete · Date · Priority · Move · More — with no new overlay primitive.
- The **custom recurrence editor is phone-first**: single-column at every width, seven
  44px weekday targets that wrap rather than shrink, `inputMode="numeric"` on the
  interval, and the plain-language result above the Save button. Verified at 320, 375,
  390 and 430px.
- The existing swipe tray is unchanged and still mirrors the row's visible actions;
  nothing is gesture-only.

---

### ☑ TASKS-09 — The latency contract: an optimistic list, reconciled — **DELIVERED 2026-08-09**

**The `/tasks` list stops waiting for the server to show what it already knows, and
never claims anything the server has not said.**

Accepted as
[ADR-086](../decisions/ARCHITECTURE_DECISIONS.md#adr-086-optimistic-presentation-on-task-lists-with-server-authoritative-reconciliation-and-announcement),
which revises one sentence of ADR-085 §3 for the list surface and leaves
[ADR-029 §29.4a](../decisions/ARCHITECTURE_DECISIONS.md#adr-029-task-waiting--additive-state-a-reserved-entitylink-and-a-derived-first-class-display-state)
(completion is ONE atomic task-domain operation) untouched.

- **The split, stated once.** *Presentation may lead the server; announcements,
  Activity and any claim of success may not.* Every row mutation paints immediately;
  every live region, every toast and every Undo waits for the server's own answer —
  including the recurrence consequence of a completion, which only the server knows.
- **Nothing moved.** Completion still posts to `POST /tasks/:taskId`, field changes to
  `/tasks/bulk`, creation to `/tasks/new`, saved views to `/tasks/views`. No new
  endpoint, no list-only mutation path, no client-side task cache.
- **Revalidation became a predicate.** `shouldRevalidateTasks` asks whether a change
  could move the row out of — or reorder it inside — the configuration on screen,
  from the `TaskViewConfig` alone. A priority change on an unsorted, unfiltered list
  re-reads nothing; a completion under a filter that excludes completed work still
  does. The rules mirror the repository's own view clauses, sorts and grouping
  dimensions, and they are pure and unit-tested.
- **Each write is its own request**, so completing three rows in three seconds is
  three writes rather than two superseded ones behind a disabled toolbar.
- **Completion and reopen carry an Undo**, raised from the server's reply through the
  existing `notifyUndo`; a refusal reverts the row and raises a calm DS-10 error with
  the server's own wording.
- **"Load more" survives the work done on it.** The page accumulator used to reset on
  the identity of the loader's first page — fresh JSON on every revalidation — so any
  mutation collapsed three loaded pages back to one. It now resets on the
  configuration alone and merges a refreshed first page by id.
- **Recorded honestly:** a completion is now announced twice to assistive technology
  (the workspace's live region and the notification centre's). Converging them needs
  an opt-out on the shared notify API — [DEBT-115](../product/PRODUCT_DEBT.md).

---

## What this programme deliberately did NOT add

Recorded so they are not mistaken for oversights. Each is a separate product decision:
calendar sync, Todoist sync, notifications and push reminders, email ingestion, AI task
prioritisation, autonomous rescheduling, time tracking, collaboration, multi-user
assignment, attachments, subtasks, dependencies/Gantt, a kanban board added merely
because Todoist has one, another Eisenhower replacement view, a generic workflow
builder, cron expressions, realtime collaborative editing and PWA offline Task editing.

---

## Related documents

- [`TASKS_MODULE.md`](../development/TASKS_MODULE.md) — the module's full behaviour
- [ADR-085](../decisions/ARCHITECTURE_DECISIONS.md#adr-085-the-tasks-daily-driver--the-matrix-removed-editing-moved-onto-the-row-bulk-made-structural-and-recurrence-given-a-second-scheduling-mode) — the accepted decision
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the shared patterns this added
