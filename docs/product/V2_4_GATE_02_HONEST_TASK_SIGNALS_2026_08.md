# V2.4-GATE-02 — Honest signals on a task row

> The record of [`V2.4-GATE-02`](../roadmap/ROADMAP_V2_4.md#-v24-gate-02--honest-signals-on-a-task-row-and-one-day-on-a-phone),
> the bounded product decision [DHDS-13](../design/DHDS_13_COMMERCIAL_QUALITY_GATE_2026_08.md)
> correctly refused to take inside a quality gate.
>
> **Starting `main`: `868540d16580d9eaa1002d807b75f2c404a64b11`** (PR #226, the
> all-open-debt pass). Branch: `v2-4-gate-02-honest-signals`.

---

## 1. The three things a row was saying that were not true

Each was **reproduced first**, on `main`, before anything was written.

### 1.1 DEBT-194 / DEBT-164 — two checkbox-like controls on one row

Weekly Planning's *"Still to place"* queue had no selection **mode**: its state was
a bare `Set<string>`, so every row drew a selection checkbox **and** a completion
checkbox, eight pixels apart, unlabelled as a pair. `task-signals.css` already
stated the rule this broke, in its own words — *"selection is a control that
appears at the row's leading edge ONLY in selection mode … **A row shows one of
them at rest.**"*

Reproduced at the component level: rendering the shared `TaskRow` with a
`selection` prop returned **two** elements with `role="checkbox"`.

It was not only Plan. `/tasks`' own selection mode drew both too — the row kept
its completion circle while the bulk checkbox was on — so the invariant was
broken on two surfaces, not one.

A third fact, found while reproducing: the queue's selection control carried the
class `dh-checkbox__input`, **which no stylesheet in the repository styles**. It
was a bare user-agent checkbox beside a designed one. That is most of why
DEBT-194 measured them as "two near-identical boxes" that were nevertheless not
the same object.

### 1.2 DEBT-197 — a passed date claiming urgency on work nobody owes

`InlineTaskDate` derived the date's urgency from `relativeCalendarDate` alone —
pure calendar arithmetic that has never seen the Task — so a **cancelled** Task's
passed deadline took `dh-task-date--overdue` exactly like a live one, beside its
own "Cancelled" pill. `TaskRow`'s own `overdue` const had the same gap
(`!task.completed && …`), which is one third of the kernel's answer.

Reproduced at the component level: a cancelled, past-due Task rendered
`.dh-task-date--overdue` and `data-overdue="true"` on the row.

### 1.3 DEBT-193 — a hugging metadata cell painting narrower than its own content

MEASURED on `/today` at 393px against the seeded workspace, on `main`:

| Project name | painted | needed | spare width in the row |
|---|---|---|---|
| Conference talk | **94.7px** | 99px | 39.3px |
| DalyHub V2 | **69.9px** | 74px | 64.1px |
| Personal | **49.1px** | 53px | 84.9px |

Byte-identical to the numbers the entry recorded, on a row with room to spare.

---

## 2. The interaction decision

**An explicit selection MODE, in which the selection control REPLACES the
completion control in the same box.**

It is not an invention. It is the grammar `/tasks` has used since TASKS-06, and
the reducer's own rule 4 states exactly what Plan was missing: *"selection mode is
explicit and separate from having a selection."* So the queue now behaves like
every other DalyHub collection:

| | the row's leading control | the placement bar | how placement is reached |
|---|---|---|---|
| **at rest** | completion | not drawn | the row's overflow — *"Plan for Wednesday 14 May"*, one item per day of the week |
| **in selection** | selection | drawn | select rows, then choose a day (one atomic bulk mutation) |

- **Entering is deliberate**: the queue header's *"Select tasks"* button
  (`aria-pressed`), or a touch **hold** on a row — the product's existing
  `useCardLongPress` gesture, which is inert on a pointer device. Nothing depends
  on hover.
- **Leaving is clear**: the same button (*"Stop selecting"*), the bar's *"Done"*,
  **Escape**, or a completed placement — which ends the mode, because staying in
  a mode after the thing it existed for has happened is a surface holding a state
  the owner is not in.
- **Focus is never lost.** The control that owns the mode lives *outside* the
  rows, so the rows losing their selection controls cannot destroy the focused
  element. Escape returns focus to it explicitly.
- **Completion is never removed.** While selection displaces it, the row's own
  overflow carries *"Complete"* / *"Reopen"* — added by the row itself, because
  the row is what knows its lead is occupied, and a rule that depended on four
  callers remembering would be missed on the fifth. It writes through
  `onCompletedChange`, the checkbox's own handler; there is no second completion
  path in the component. On `/tasks` the bulk bar's *"Complete"* is the other
  door, unchanged.
- **The two are still told apart by shape**, at the same size and in the same
  place: selection is the design system's 18px **square** (`.dh-checkbox__control`
  — D7, *"this is the square: selection"*), completion the 20px rounded square.
  Both sit inside the **same** 44px target box, which is what keeps the geometry
  identical across the mode change.

### What was rejected, and why

| Rejected | Why |
|---|---|
| More spacing between the two | The invariant is *one control*, not *two far apart*. |
| A colour difference | Colour is never the sole carrier (`AGENTS.md` §15), and both would still be checkboxes. |
| Shrinking one | Makes the smaller one a worse target and still leaves two. |
| Hiding one visually, leaving it interactive | The mis-click stays; the screen reader still hears two. Explicitly forbidden by this item's brief. |
| Removing completion from the queue | Takes a capability off the surface. |
| Drag-and-drop placement | DHDS-11's six questions are unchanged and a planning queue has no stored order. |

**Selection is transient UI state.** Nothing about it is persisted, no Activity is
written, no Task field carries it, and no API knows it exists.

---

## 3. The semantic overdue authority

> **Overdue = the due date has passed AND the Task is still an active
> commitment.** Not *the date is earlier than today*.

The answer is the **kernel's**, stated exactly once:

```ts
// app/kernel/tasks/task.ts
export function isTaskOutOfCommitment(task: TaskCommitmentFacts): boolean {
  return task.completed || task.status === "cancelled" || task.someday;
}
export function isTaskStillOwed(task: TaskCommitmentFacts): boolean {
  return !isTaskOutOfCommitment(task);
}
```

This is not a new rule. It is the triple the `open` system view already
excluded — the kernel names them together as *"the three TERMINAL/parked-out-of-
commitment states the whole product excludes: completed, cancelled and
Someday/Maybe"* — lifted out of a comment and into a function so a surface can
**ask** it instead of restating it.

`waiting` and `on_hold` are deliberately absent by the same authority: the `open`
scope keeps them because they are work the owner still intends to do, blocked
rather than abandoned. **A Task somebody else is sitting on IS late**, and the row
says so in words beside the date.

### How it reaches a surface

```
kernel  isTaskStillOwed(facts)
  │
  ├─ task-view.ts  taskStillOwed(serialised item)      ← the one adapter
  │     ├─ toTaskRowProjection() → TaskRowProjection.stillOwed
  │     │      └─ TaskRow  → data-overdue, and InlineTaskDate's `stillOwed` prop
  │     │      └─ TaskCardData (Tasks module) spreads it
  │     └─ taskUrgency(TaskUrgencyInput)               ← the chip / card / search
  │            └─ ProjectTasksTab, TaskRecordDrawer, search, Waiting
  └─ views-presentation.ts  isClosed()                  ← the cross-view row
```

**Nothing re-derives it.** `InlineTaskDate` is handed the *answer*, never the
facts — DEBT-197's entry names that control as the place a second definition would
appear, and the one thing it must not grow is a status list. `TaskRow`,
`ProjectTasksTab`, `views-presentation.ts` and the Waiting card all call the same
two functions.

`taskUrgency`'s input widened from `completedAt` alone to require `status` and
`commitmentState`. **Required, not optional**: a caller that cannot say whether a
Task is still owed cannot honestly ask whether its date is late. The type system
then found every consumer, which is why this change touches `search.ts`,
`UrgencyChip`, `waiting-view.ts` and the Waiting serialisation — each of those was
a surface that could have painted a false urgency, and each now answers.

### The status matrix, proved

Asserted in `test/unit/task-record/task-commitment.test.ts` over the repository's
**actual** vocabulary (`status` × `commitmentState` × `completedAt`), because the
roadmap's product words are display states and several are not `status` values at
all — completion is the spine's `completedAt`, Someday/Maybe is the commitment
state, Waiting is the waiting model.

| Task state | Past due | Overdue urgency |
|---|---|---|
| To do (`status: todo`) | yes | **yes** |
| In progress | yes | **yes** |
| Waiting (waiting model set) | yes | **yes** — still canonical open work |
| On hold (`status: on_hold`) | yes | **yes** — still canonical open work |
| Blocked (derived, TASKS-12) | yes | **yes** |
| Completed (`completedAt`) | yes | no |
| Cancelled (`status: cancelled`) | yes | no |
| Someday / Maybe (`commitmentState: someday`) | yes | no |
| any state, due today or later | no | no |

Two falsifiers guard the rule itself rather than the cases: one asserts that
exactly **one** member of `TASK_STATUSES` is terminal and it is `cancelled`, the
other that exactly one commitment state parks. A future status quietly treated as
closed fails them.

### The historical date survives

A closed Task keeps its date. "Yesterday", "20 days ago", "Due 6 Jul 2026" is
truthful history and stays visible; what goes is the **urgency ramp** and the
word. `taskUrgency` returns `{ kind: "due", label: "Due 6 Jul 2026", tone:
"neutral" }` where it used to return `{ kind: "overdue", label: "Overdue · due 6
Jul 2026", tone: "danger" }`. The row's date cell takes the ordinary metadata
class — the same one a planned date takes — rather than a new display state.

---

## 4. DEBT-193 — the actual defect, and the actual cause

The entry recorded this as an intrinsic-sizing quirk in a hugging flex chain that
**six** candidate corrections had failed to move, and concluded the fix was a
restructure of that chain. It is neither.

`task-list.css` has always declared, with a comment saying so:

```css
.dh-taskrow__cell .dh-inline-edit__trigger {
  inline-size: 100%;
  /* No optical pull-back in a grid: the CELL aligns the column, and a trigger
   * that starts outside its cell overhangs the one beside it. */
  margin-inline: 0;
```

**That rule never applied.** `.dh-inline-edit[data-presentation="meta"]
.dh-inline-edit__trigger` in `inline-edit.css` is three compound selectors to this
rule's two, so the shared `margin-inline: calc(-1 * var(--dh-space-1)) 0` won the
cascade and every metadata trigger in a task row kept a `-4px` start margin.

On the desktop grid that is invisible — a fixed track has slack. On the phone
composition the project cell **hugs**, and a negative start margin is subtracted
from a hugging box's intrinsic contribution while the used layout does not give it
back. The arithmetic closes exactly, MEASURED from the live DOM at 393px:

```
cell 118.688 = 8 (identity dot) + 8 (gap) + 102.688
102.688      = the trigger's MARGIN box: 98.688 of text + 8 of padding − 4 of margin
label gets   = 102.688 − 8 of padding = 94.688,  against 98.688 of text
```

The missing 4px is the margin and nothing else.

**The fix is to make the rule that already exists actually apply** — four compound
selectors (`.dh-tasklist .dh-taskrow .dh-taskrow__cell .dh-inline-edit__trigger`)
rather than repeating `[data-presentation="meta"]`, which would declare the meta
presentation outside `inline-edit.css` and break DHDS-10's grammar (asserted by
`test/unit/ui/dhds-10-inline-grammar.test.ts`).

MEASURED after, same rows, same width: **98.7 against 99**, **73.9 against 74**,
**53.1 against 53**. Falsified: reverting the selector reproduces 94.7 / 69.9 /
49.1 with the entry's own words in the failure message.

DHDS-13 answered the same defect on the **priority** cell with a
`min-inline-size` floor, because a two-character mark has a knowable width. A
Project's name does not, so a floor was never available here.

**No desktop regression.** The change also removes the 4px overhang on the desktop
grid, which is what the rule's comment always wanted. MEASURED with and without
the fix at 820 / 900 / 1280 / 1440: the number of truncated metadata cells is
**identical** (5 / 1 / 6 / 6), so nothing that fitted stopped fitting.

---

## 5. Debt dispositions

| Entry | Result |
|---|---|
| **DEBT-194** — the Plan queue's two adjacent checkboxes | **CLOSED.** Reproduced, fixed at the shared row, asserted over the rendered row on four surfaces. |
| **DEBT-164** — the same defect at P3 | **CLOSED with DEBT-194**, as its own note requires (*"do not work them as two items"*). |
| **DEBT-197** — a cancelled Task's passed date painted overdue | **CLOSED.** One kernel answer, applied through the shared projection; asserted by reading the **painted colour** in both appearances. |
| **DEBT-193** — a hugging label 4px narrower than its content | **CLOSED.** Root-caused (a cascade loss, not intrinsic sizing), fixed at the shared anatomy, measured before and after, falsified. |
| **DEBT-196** — two days at phone width | **VERIFIED still closed.** Not rebuilt. `plan-responsive.spec.ts` :105 and :205 pass at 100% and 200% zoom, before and after this change. |
| **DEBT-162** — six columns needs 1440 | **STILL OPEN, deferred.** Verified real and its rationale still valid. |
| **DEBT-163** — a Sunday-start week wraps its seventh column | **STILL OPEN, deferred.** Same. |
| **DEBT-128 / DEBT-175** — Project Tasks is a second Task anatomy | **STILL OPEN**, and deliberately not taken. See §6. |
| **DEBT-180** — the row-reveal contract is unclickable by automation | Untouched. Its known behaviour is why this item's E2E uses the established hover-and-poll helper to open a row menu rather than a bare click. |

### DEBT-162 / DEBT-163 — re-read, and re-deferred

Both are named as explicit non-goals by this item's own roadmap entry, and both
entries were re-read rather than taken on trust.

- **DEBT-162** is a *composition* question, not a defect: at 1280 the board is
  696px, so six columns would be 108px and a card title about 35px — the exact
  truncation ADR-101 §10 rejected a board to avoid. Its closing condition is a new
  measurement (six columns at 1280 with a title at or above the 73px it measures
  at 1440), and the width would have to come from the shell's rail or the page
  gutters, neither of which has been measured for it. Nothing in this item touched
  the board's width, and taking it would be the Weekly Planning redesign this item
  forbids.
- **DEBT-163** is correct-but-untidy by design: pairing the two weekend days
  wherever they sit would draw "Sun / Sat" as the first column of a Sunday-start
  week, putting two days out of calendar order to save a column. Its closing
  condition is a *design* decision with a capture at `firstDayOfWeek: sunday`.

Neither has been made trivial by anything in this change, so neither is closed.
Both entries already state why they stay open; both were re-verified as real.

---

## 6. Project Tasks — and why DEBT-175 stays open

`ProjectTasksTab` still builds `Card` props by hand; it does **not** render the
shared `TaskRow`. The question this item had to answer was whether its semantic
fix could be delivered without expanding into the DEBT-128 / DEBT-175 convergence
programme.

It can, and it was — because the two surfaces already share the thing that
matters. The tab renders the **shared `InlineTaskDate`** for its due date and the
**shared `taskUrgency`** for its completion affordance, so both now read the
kernel's answer through the same two functions the row reads it through. The tab
passes `stillOwed={taskStillOwed(task)}` — the same adapter, not a second rule.

**No third overdue implementation was created**, and no duplicated rule exists on
any surface: `grep` for the status triple finds it in exactly one place,
`app/kernel/tasks/task.ts`.

Converging the anatomy would have meant rewriting a record surface's task list
with its own responsive, axe and screenshot consequences, inside a PR about
interaction semantics. That is the bundling DEBT-175's own entry says to avoid.
**The entries stay open, with their reason unchanged** — and the E2E asserts the
one-signal invariant on the Project tab's `Card` anatomy too, so the claim is
about the product rather than about one component.

---

## 7. Phone verification — DEBT-196

Not rebuilt. PR #223 (V2.4-GATE-01) fixed it at the composition, and the
mechanism is unchanged: `PlanDaySection` receives `selected` and renders it as
`data-selected`; `plan.css`'s phone block hides every day that is not the rail's
selected one, so the six that are not selected leave the accessibility tree.

Run on `main` **before** any change here, and again after:

| Assertion | Result |
|---|---|
| `plan-responsive.spec.ts` :105 — seven days above the phone tier, exactly **one** below it, and it is the rail's selected day | pass, before and after |
| `plan-responsive.spec.ts` :205 — reflows at **200% zoom** (640×512) with exactly one day and no horizontal scrollbar | pass, before and after |
| 100% zoom, 320 / 360 / 375 / 393 / 430 — no horizontal document overflow | pass |
| axe WCAG 2.2 AA, light / dark / phone | pass |

**Recorded as previously delivered and still passing.** The roadmap entry's
criterion 4 was already met by GATE-01, exactly as DEBT-196's own note asked
GATE-02 to record.

---

## 8. Geometry

MEASURED from the live DOM (never from a screenshot) on `/plan` and
`/tasks?system=all`, at **320 / 360 / 375 / 393 / 430 / 820 / 900 / 1280 / 1440**,
in **light and dark**, **at rest and in selection mode** — 36 measurement passes.

| Claim | Result |
|---|---|
| No document-level horizontal overflow | `scrollWidth === clientWidth` at every width, both appearances, both modes |
| One checkbox-like control per row | `min = max = 1` in every pass, at rest **and** in selection |
| Selection mode does not distort row geometry | `lead` width and the title's `left` are **identical** between rest and selection at every width and appearance (e.g. `/tasks` at 1440: lead 20px, title left 310px in both) |
| Touch targets under a coarse pointer | 45px below the phone tier; 28px only where the pointer is fine **and** the frame is the desktop one — the documented `task-signals.css` bargain, still above SC 2.5.8's 24px |
| No clipped priority / status / date signal | the count of truncated metadata cells is **unchanged** by this item at every width (0 on phones; 5/1/6/6 at 820/900/1280/1440, identical with and without the DEBT-193 fix) |
| Focus ring not clipped | the lead never escapes its row box (0 offenders at every width) |
| Plan's own controls meet the 44px floor | `plan-responsive.spec.ts` measures the day rail, the seven placement buttons, **the new mode toggle** and **the bar's "Done"** at 393px on a touch device — all pass |

The mode toggle and the "Done" button were **added to that measurement**, not
exempted from it: a control this item introduces is a control a thumb has to hit.

---

## 9. Accessibility

- **Distinct accessible names, and only ever one at a time.** At rest a row's
  control is `Complete <title>` / `Reopen <title>`; in selection mode it is
  `Select <title> to place on a day`. Never `checkbox` twice, and never both in
  one row — there is one control in the DOM, so duplicate-name and
  multiple-labels classes of failure are impossible by construction rather than by
  wording.
- **Native controls throughout.** Both are real `<input type="checkbox">`. The
  only ARIA added anywhere in this change is `aria-pressed` on the mode toggle,
  which is what a toggle button IS — not a patch to satisfy axe.
- **Keyboard-complete, both acts, both modes.** Asserted end to end: Tab to the
  toggle → Enter enters the mode → Tab to a row → Space selects → Tab to a day →
  Enter places. Completion is Space on the row's control at rest, or the row's
  overflow while selection displaces it. Placement at rest is the row's overflow,
  one item per day, named in words.
- **Escape leaves the mode**, and focus lands on the toggle — asserted, because a
  browser moves focus from a removed element to the document body and that is
  precisely the "lost your place" failure `AGENTS.md` §6 rules out. Bound on the
  region rather than the document, so an Escape meant for an open menu or an
  inline editor still reaches it first.
- **State is announced.** The toggle's own label carries the state in words
  ("Select tasks" / "Stop selecting") as well as `aria-pressed`; entering and
  leaving the mode, and every placement, are announced through the planner's
  existing `aria-live` region. Completion is announced through the existing Task
  grammar, unchanged.
- **Nothing depends on hover.** The touch way in is the product's existing hold
  gesture, which is gated on a touch-first media query.
- **axe WCAG 2.2 AA, with no rule disabled** beyond the suite's four standing
  exclusions (each already recorded in `e2e/helpers.ts`), run on the queue **in
  selection mode** — a state no existing scan could see. `/plan` at rest in both
  appearances and on a phone is still scanned by `plan-responsive.spec.ts`.

---

## 10. Tests

### Falsification

The new unit tests were run against the starting `main` in a clean worktree:
**31 of 49 failed**, including every commitment-matrix case, both selection-mode
cases and all three closed-state paint cases. The DEBT-193 E2E assertion was
falsified separately by reverting one selector, and failed with the entry's exact
numbers (`painted 94.7 of 99 with 15.3px spare`).

### Unit / component

| File | What it holds |
|---|---|
| `test/unit/task-record/task-commitment.test.ts` | the semantic matrix at the **authority**: the kernel, the serialised adapter, the row projection and `taskUrgency`, over every status × commitment × completion combination, plus two rule-level falsifiers |
| `test/unit/task-record/honest-task-signals.test.tsx` | what the **row** does with it: one control at rest, one in selection, distinct names, the same target box, the right shape per act, completion reachable through the menu while displaced, placement reachable at rest, the mode ending restores the row, and the paint of every closed state |
| `test/unit/task-record/task-selection.test.ts` | the selection reducer, moved with its module (unchanged) |

`test/unit/views/views-overdue-commitment.test.ts` (already on `main`) now covers
the cross-view row against the kernel-delegating `isClosed`, unchanged and
passing — which is why this item adds no E2E for `/views`.

### E2E — `e2e/gate-02-honest-signals.spec.ts` (+ `e2e/gate-02-fixtures.ts`)

Deterministic fixtures, owned outright rather than borrowed from the seed: five
past-due Tasks — live, cancelled, completed, Someday/Maybe and **on hold** (the
control that stops this being a test of "closed means not completed"), all sharing
one far-past deadline, all hanging from one Project so a Project's Tasks tab draws
them.

1. **The Plan journey.** Open Weekly Planning → find a Task in *Still to place* →
   confirm exactly one control on **every** queue row and no placement bar → enter
   the mode **by keyboard** → Escape leaves it with focus intact → re-enter →
   confirm the selection control **replaced** completion on every row → confirm
   the two accessible names → axe over the queue in the mode → select two Tasks →
   place them on a day → **reload**, both accepted → complete one independently
   through its own control → **reload**, the completion survives.
2. **Both acts, both modes**, on one row: at rest, one control plus seven
   "Plan for …" menu items and no completion item; in the mode, no completion
   control and a completion menu item.
3. **One signal at rest on `/today` and a Project's Tasks tab** — the latter over
   the `Card` anatomy, so the claim is about the product.
4. **`/tasks`**: one signal at rest, the painted-colour matrix in **both**
   appearances, then its own selection mode and one signal there too.

### E2E — existing specs

- `e2e/dhds-13-commercial-quality.spec.ts` gains DEBT-193's closing condition:
  *a label whose cell has spare width paints its full `scrollWidth`*, over
  `/today` and `/tasks` at all five phone widths.
- `plan-weekly-planning.spec.ts`, `plan-responsive.spec.ts` and
  `ux-02-plan-habits.spec.ts` enter the mode before selecting. Their assertions
  are unchanged; only the way in is.

### The gate's own budget

The suite grew from 190.4 to 191.3 min of measured test time against a derived
16.7 min per-partition ceiling, and the first split of the new work was over it.
The answer taken is the one the mechanism names first: **a genuinely cheaper spec
file.** `gate-02-honest-signals.spec.ts` was consolidated from 13 tests over 12
page loads to 4 over 7, and the DEBT-193 check measures five widths from two page
loads rather than ten. **What was removed is redundant page loads and one
duplicate axe scan of the same component in the same state — never an
assertion.** `PARTITION_COUNT` was not raised: 13 is past the runner pool's
measured practical ceiling of twelve. The headroom left is thin, and
`e2e/partitions.json` says so in as many words.

---

## 11. Explicit non-goals

- **No Weekly Planning redesign.** The board, its columns, the day rail, the
  arming control, the queue's sources and the glance bar are untouched.
- **No drag-and-drop.** DHDS-11's six questions are unchanged and a planning queue
  has no stored order.
- **No new mutation authority.** Completion is `useTaskSurfaceActions` →
  `POST /tasks/:id`; placement is `postTaskBulkAction` → `POST /tasks/bulk`, the
  same route and intent the Tasks bulk bar and Today's plan actions post.
- **No Plan-specific Task repository method, no selection API, no selection
  Activity event, no Task field for interface selection.** Selection is transient
  UI state and nothing else.
- **DEBT-162, DEBT-163** — re-read, re-verified, still deferred with their reasons.
- **DEBT-128 / DEBT-175** — the Task-row convergence programme is not taken here.
- **Not V2.4-GATE-01.** No production backup or deployment work is in this branch,
  and GATE-01 remains explicitly deferred on owner-held blockers.

### What was NOT introduced

| | |
|---|---|
| schema change | none |
| new API route | none |
| new runtime dependency | none |
| new design-system phase | none |
| new Task status | none |
| new Plan mutation authority | none |
| new colour or display state | none — a closed Task's date takes the **existing** ordinary metadata ramp |

The one structural move is `app/modules/tasks/task-selection.ts` →
`app/shared/task-record/task-selection.ts`. It is a file move, not a new
abstraction: giving the Plan queue a mode meant either importing a module-private
model (which the module-isolation rule forbids) or writing a **second** selection
model beside the first. `AGENTS.md` §9.8 answers that — *"if one should exist but
doesn't, build it as shared"* — and `/tasks` is byte-identical across the move.
