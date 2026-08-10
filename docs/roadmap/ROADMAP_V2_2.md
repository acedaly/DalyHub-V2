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

## Current audit sequence - 2026-08-09

The full-product UX/Product audit on current `main`
([`DALYHUB_UX_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md))
found no P0 Task blocker and confirmed that the expected foundational concern is
already solved: **a Task can exist without a Project, and Inbox is first-class**.
The next work should therefore harden the daily-driver loop rather than restart a
visual redesign or add speculative capability.

### NOW

### ☑ TODAY-09 - Attention rail truth and Tasks/Today wording — DELIVERED 2026-08-09

Make Today truthful enough to remain the daily entry point.

- Restored the existing Assets obligation contract as an `asset` attention row:
  obligations with no linked open Task can reach Today, while obligations already
  represented by open Tasks are counted in words rather than duplicated.
- Replaced the misleading "Due today" Today label with "For today" / "Tasks for
  today", matching the `day-view` union of due-today OR scheduled-today work.
- Made the Inbox attention count authoritative by reading the canonical Tasks
  `inbox` system view, independent of the bounded Today planning read.
- Aligned the Tasks `today` system view with Today: open, non-waiting work whose
  due date OR scheduled date is the owner's today.
- Added focused Today/unit and kernel coverage for Inbox truth, due/scheduled
  Today agreement, completed exclusion from active task counts, and Assets
  obligation surfacing/deduplication.
- **Non-goals:** weather/calendar, push notifications, a metrics dashboard, or a
  broader Today redesign.

### ☑ TASKS-10 - Daily-driver verification and capture polish — **DELIVERED 2026-08-09**

Lock the current Tasks daily-driver behaviour before adding new Task features.

- Added the missing >100 selection/bulk-bound E2E coverage recorded in
  [DEBT-110](../product/PRODUCT_DEBT.md#-debt-110--the-100-task-bulk-bound-has-unit-coverage-but-no-e2e-journey-that-accumulates-more-than-one-page--p3).
- Re-ran and preserved the phone acceptance matrix for capture, list editing, bulk
  actions and recurrence at 320, 375, 390 and 430px.
- Revalidated the full create form against the title-first composer contract: the
  full Drawer still focuses title first, accepts title-only Inbox capture, and leaves
  the faster quick-add/global capture paths unchanged.
- Fixed the completed-task double-announcement debt
  ([DEBT-115](../product/PRODUCT_DEBT.md#-debt-115--a-completed-task-is-announced-twice-once-by-the-list-once-by-the-notification-centre--p3)).
- **Non-goals:** new views, AI parsing, offline editing, subtasks or another Matrix.

### ☑ UIX-01 - Product UI redesign against the supplied references — **DELIVERED 2026-08-09**

Reproduce two supplied reference designs in the real product: the shell, Today and
Tasks, at desktop and phone widths, in both appearances.

- Added six generated **decorative accent** ramps (coral · blue · violet · green ·
  amber · teal) and a per-appearance `wash` tint strength, with contrast asserted
  for every accent's washed surface and every tonal tile's glyph in both schemes.
- Retired the floating action button; Create is the top app bar's one violet
  control on desktop and the navigation bar's central circle on a phone.
- Redrew Today as three balanced regions with a full-width Goal progress row, and
  its figures as washed tonal glance cards.
- Redrew Tasks: due-state grouping by default on the three everyday views, a tab
  rail of those views, a one-line ~45px row leading with a completion circle, and
  relative dates in words in place of the urgency chip.
- Redrew the phone Task capture sheet as `Cancel · New task · Save` over a big
  title field and three metadata rows.
- **Non-goals:** new features, new data, a second UI framework, module-by-module
  redesign beyond the shared foundations (that is UIX-02), and any change to
  TASKS-10 behaviour.
- Record: [`UIX_01_PRODUCT_REDESIGN_2026_08.md`](../design/UIX_01_PRODUCT_REDESIGN_2026_08.md).

### ☑ EDIT-03 - Inline editors must show the whole list of choices — **DELIVERED 2026-08-09**

Fix the reported defect that made inline Task editing unusable: opening Priority,
Project or Due date on a `/tasks` row showed the stored value and none of the
alternatives.

- Diagnosed as a SHARED placement defect, not three Task bugs. Both DS-16 anchored
  surfaces were `position: absolute` inside the field, so a Tasks row's three
  load-bearing `overflow: hidden` ancestors cut a 305px priority menu to a 45px,
  64px-wide sliver and wrapped `P2 · High` to `P2 · Hi / gh`.
- Added `~/shared/anchored` — one portalled, viewport-placed overlay surface plus
  the pure geometry (flip · height clamp · inline slide), generalised from DS-12's
  `menu-placement` rather than copied. `InlineSelectField` and `InlineDateField`
  adopt it; `useAnchoredAlignment` is deleted.
- Added `--app-z-anchored` (1350) so a surface opened from inside the Task record
  Drawer renders above it rather than behind it.
- Made `Sheet` portal into `<body>`: a swipe card is TRANSFORMED, so it was the
  containing block for its `position: fixed` descendants and clipped a phone sheet
  to a 45px row.
- Gave the phone the shared sheet presentation for both fields, and every Task date
  editor the product's own Today / Tomorrow / Next week shortcuts from one shared
  derivation.
- Added typeahead to the select menu, so the fifty-candidate Project chooser is
  navigable by keyboard without a filter box the menu role cannot carry.
- Audited the product's other floating surfaces in a browser: the DS-12 overflow
  menu and the combobox listbox are unclipped on the same rows and are unchanged.
- **Non-goals:** a positioning dependency, the native Popover API, converting the
  DS-12 menu, changing any route/intent/storage rule, or making the task row taller.
- Record: [ADR-087](../decisions/ARCHITECTURE_DECISIONS.md#adr-087-inline-editors-float-in-a-shared-overlay-layer-and-become-sheets-on-a-phone) ·
  [DESIGN_SYSTEM → Anchored overlay](../design/DESIGN_SYSTEM.md#anchored-overlay-edit-03) ·
  captures in [`docs/design/assets/edit-03-2026-08/`](../design/assets/edit-03-2026-08)
  (`e2e/inline-editor-overlay-screenshots.spec.ts`).

### ☑ UIX-02 - Projects & Areas product UI redesign — **DELIVERED 2026-08-10**

Extend the UIX-01 visual language into the spine's two middle rungs, against the
third supplied reference — both galleries, both records, both phone compositions
and the dark appearance.

- **Separated the two modules.** They shared one `EntityCard` in one grid, so a
  finite body of work and a permanent domain of a life were the same object with
  different words in it. A Project now has `ProjectCard` (identity above a pinned
  measure); an Area has `EntityRow` in one bordered list.
- **Moved record identity off the CHART ramp.** `area-accent-*` was `chart-*`
  reused, whose hues are chosen so a legend stays separable — it was putting an
  olive, a magenta and a crimson on Project progress bars. Identity now resolves
  to UIX-01's widget accents, plus one generated `accent-cyan` so the sixth slot
  is clear of the scheme's alarm band.
- **Removed the fabricated Area completion meter** from the Area record. Areas
  never complete; the gallery had never drawn one and the record had.
- **Gave the Area record an Overview** of what is actually in it, and gave both
  records their own identity mark on their own accent.
- **Made a Project's tasks Tasks rows**: the shared completion circle (which now
  works, through the canonical `/tasks/bulk` route), relative dates in words, and
  no routine status pills — via a `.dh-tasklist` opt-in on the UIX-01 row.
- **Shared the view tab rail** (`ViewTabs` / `.dh-viewtabs`) between Tasks and
  Projects instead of copying it, and gave its phone pills a 44px target.
- **Non-goals:** new Project methodology (Kanban, Gantt, dependencies,
  templates), an Area health score, an Area completion model, AI summaries,
  notifications, analytics, or any change to domain rules.
- Record: [`UIX_02_PROJECTS_AREAS_2026_08.md`](../design/UIX_02_PROJECTS_AREAS_2026_08.md).

### ☑ UIX-03 - Goals product UI redesign — **DELIVERED 2026-08-10**

Turn the Goals experience from a collection of project-shaped cards with
percentages into a personal progress system: the gallery, the record, the trend
chart, both phone compositions and the dark appearance.

- **Gave Goals a card of their own** (`GoalCard` / `.dh-gcard`), the third
  family in the shared grid after UIX-02's `ProjectCard`. It leads with the
  READING rather than the percentage, states the whole journey
  (`from 85 kg → 70 kg`) so the percentage is checkable by eye, and carries one
  visual chosen by the data.
- **Gave Goals identity.** A Goal inherits its AREA's accent and glyph — the
  rule Projects already follow — resolved in every Goal read. Every Goal in the
  gallery previously drew the same neutral grey flag, and Today derived a tone
  from a hash of the Goal's id.
- **Put the target on the trend chart's scale.** `TrendLine` scaled to the
  readings and drew the target only if it happened to land inside them, so the
  product's own acceptance Goal (85 kg → 79.3 kg, target 70 kg) never showed its
  target: the chart answered "have I moved?" and refused "am I getting there?".
- **Made the Goal record a progress workspace.** The measurement section moved
  out of the summary band's `description` — a chart inside a summary card inside
  a record — into a new top-level `feature` region of the shared Record Layout,
  above the band. It opens with a labelled **Start · Now · Target · Remaining**
  strip in place of one run-on sentence.
- **Added `Sparkline`** to `~/shared/charts` and the batched
  `listMeasurementSeries` read that feeds it: one grouped statement per page of
  Goals, capped per Goal inside the window function.
- **Added status views** (All / On track / Needs attention / Completed) over
  statuses the kernel evaluator already produces, and retired the alignment
  ring that dominated the gallery — the recap sentence stays as a quiet note.
- **Non-goals:** no new measurement type, no unit conversion, no forecasting
  engine, no auto-generated milestones, no change to the GOAL-02 progress
  arithmetic, and no schema change — the domain shipped in GOAL-02 was already
  correct, including inverse direction and the baseline-relative formula.
- Record: [`UIX_03_GOALS_2026_08.md`](../design/UIX_03_GOALS_2026_08.md).

### ☐ DS-17 - Select clear-control names

Complete the cross-product select accessibility follow-up.

- Convert the affected tests away from brittle substring `getByLabel` queries.
- Rename `SelectField` and `SelectSheetControl` clear controls so each names the
  field it clears, matching `InlineSelectField`.
- **Non-goals:** redesigning selects or changing unset/empty semantics, which are
  already correct.

### NEXT

### ☐ TASKS-11 - Deterministic natural-language capture v2

Extend the existing parser only where it is reliable and testable.

- Support after-completion recurrence phrases such as "Service Hilux every 6 months
  after completion".
- Keep AI out of ordinary capture; AI remains a later proposal layer, not a mutation
  path.
- Prove parser changes with unit tests and one route/browser capture journey.

### ☐ PWA-12 - Offline Task mutation slice

Define and implement the first offline Task capability beyond capture.

- Cover completion/reopen, date/priority/title edits, recurrence replay and conflict
  wording.
- Keep the slice small enough to validate the queue contract before broader offline
  editing.

### ☐ TODAY-10 - Focus panel refinement

After TODAY-09, refine the Focus panel only if the evidence shows that one combined
"For today" bucket is still unclear.

### LATER

- **TASKS-12 - Ordinal monthly recurrence**, only if owner routines need patterns
  such as "first Monday of every month".
- Broader mobile polish after Tasks/Today acceptance is stable.
- Analytics or richer review surfaces after daily capture and attention are trusted.

### DEFERRED / NOT PLANNED

- Eisenhower Matrix replacement.
- AI task prioritisation or autonomous rescheduling.
- Jira-style subtasks, dependencies, Gantt views or workflow builders.
- Collaboration or multi-user assignment.
- Push reminders before the in-app attention model is correct.
- A broad visual redesign before the daily-driver hardening work above.

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
- **TASKS-10 follow-on:** a completion is now announced once. The workspace live
  region carries the committed completion and any recurrence consequence, while the
  visible Undo notification opts out of its own duplicate feedback live-region write
  through the shared DS-10 notify API.

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
- [`DALYHUB_UX_PRODUCT_AUDIT_2026_08.md`](../product/DALYHUB_UX_PRODUCT_AUDIT_2026_08.md) — the current-main UX/Product audit that set the post-V2.2 sequence
- [ADR-085](../decisions/ARCHITECTURE_DECISIONS.md#adr-085-the-tasks-daily-driver--the-matrix-removed-editing-moved-onto-the-row-bulk-made-structural-and-recurrence-given-a-second-scheduling-mode) — the accepted decision
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is still owed
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the shared patterns this added
