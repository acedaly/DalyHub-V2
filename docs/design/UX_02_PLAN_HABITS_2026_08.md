# UX-02 — Weekly Planning and Habits, rebuilt to the visual references

> The record of the UX-02 rebuild of `/plan` (`Mockup 7.png`) and `/habits`
> (`Mockup 8.png`). Accepted as
> [ADR-104](../decisions/ARCHITECTURE_DECISIONS.md#adr-104-the-planning-week-is-a-board-and-a-habit-may-state-one-proportion--two-decisions-re-taken-on-fresh-measurements-superseding-adr-101-10-and-adr-102-8),
> which supersedes [ADR-101](../decisions/ARCHITECTURE_DECISIONS.md) §10 and
> narrows [ADR-102](../decisions/ARCHITECTURE_DECISIONS.md) §8.
>
> Roadmap item: [`ROADMAP_V2_3.md` → UX-02](../roadmap/ROADMAP_V2_3.md).
> Module behaviour: [`HABITS_MODULE.md`](../development/HABITS_MODULE.md).

---

## 1. What it is

Two screens, rebuilt to two approved references. Neither is a new feature: every
record, every mutation and every authority is the one PLAN-01, SMART-01 and
HABITS-01 shipped. What changed is the composition, and in two places the
composition required re-taking a decision the roadmap had recorded as deliberate.

- **`/plan`** becomes a **week BOARD** — six day columns, each with the day's
  calendar commitments above its planned Tasks — with the "Still to place" queue
  and the planning signals in the rail beside it, and the week's four figures in a
  glance bar beneath.
- **`/habits`** becomes a **four-column table** with a glance row of four figures
  above it and a rail beside it (what today asks for, which Goals these behaviours
  support, and the week in three figures).

## 2. The two decisions that had to be re-taken

Both references contradict a recorded decision, and the two contradictions are
not alike. Naming the difference is what made them decidable rather than a matter
of taste.

| | ADR-101 §10 — "the week is an agenda" | ADR-102 §8 — "no percentage anywhere" |
|---|---|---|
| Made on | a MEASUREMENT | a PRINCIPLE |
| Still true? | **No** — the number it rests on is wrong now | **Yes** — and the reference does not actually breach it |
| Outcome | superseded, on fresh measurements (§3) | narrowed to permit exactly one figure (§7) |

The general rule this pass followed: **a decision made on a measurement is
re-decided by re-measuring; a decision made on a principle is re-decided only by
reading the principle precisely enough to see what it does and does not forbid.**

## 3. The board, and every number behind it

ADR-101 §10 rejected a column board in one sentence: *"at 1440 a seven-column
board leaves ~100px per day after the queue rail, which is narrower than a task
title."* That is a good reason, and it is no longer true.

MEASURED in Chromium on `main` @ 3d8d0d6, before any UX-02 change, with
`node scripts/ux-02-shot.mjs --measure 1`:

| viewport | `.dh-plan__week` | queue rail | 7 columns | 6 columns |
|---|---|---|---|---|
| 1440 | **856px** | 336px | 112px | 133px |
| 1280 | 696px | 336px | 91px | 108px |
| 820 | 752px | (below) | 101px | 120px |

The 1096px the old figure was derived from predated the shell's current gutters.
Three further changes made the board viable at 1440:

1. **Six columns, not seven.** Saturday and Sunday share one — what the reference
   draws, and what a week actually holds.
2. **The rail gives up 2rem** (21rem → 19rem) at the width where the board becomes
   six columns. A title is the scarcest thing on this screen and the rail is the
   roomiest, so the trade is one-way.
3. **A day column holds a CARD, not a row.** The shared Task row gained a
   documented card presentation (§5) whose title wraps to three lines.

MEASURED after the rebuild, same command:

| viewport | board | columns | day column | Task card | card TITLE |
|---|---|---|---|---|---|
| 1440 | **888px** | 6 | **147px** | 131px | **73px** |
| 1280 | 696px | 3 (two rows) | 230px | 206px | 111px |
| 820 | 752px | 3 (two rows) | 249px | 225px | 111px |
| 393 | 393px | 1 (day rail) | full width | full width | 111px |
| 320 | 320px | 1 (day rail) | full width | full width | — |

`document.scrollWidth === window.innerWidth` at all five widths, in both
appearances: the document never scrolls sideways.

**Six columns is the composition from 90rem (1440px) up, and the board FOLDS to
three columns over two rows below it.** At 1280 six columns would be 108px, which
is narrower than the card the board needs; folding is the product's standing
"recompose, never squeeze" rule applied to a new surface, and the reference's own
proportions describe a ~1600px canvas rather than a 1280px one.

Below `md` the composition is unchanged from PLAN-01: a horizontal day rail, then
one day, from the same DOM, with the unselected columns `display: none` so they
leave the accessibility tree too.

### The weekend column keeps two days inside it

Mockup 7 draws the weekend as ONE shared band pair. This is the single thing on
the reference the rebuild did not copy, and the reason is the surface's whole
purpose: a planner exists to say WHICH DAY, and a Saturday task drawn in a band
that also holds Sunday's is a task whose day the screen has stopped stating. The
column is one column holding two headed sections.

The pairing is computed from the loader's own `isWeekend` and pairs only ADJACENT
weekend days, so it follows the owner's `firstDayOfWeek` instead of assuming
Monday. A Sunday-start week yields seven groups — Sunday leads and Saturday
trails, and neither has a neighbour — and the seventh column wraps rather than
taking width off the other six.

## 4. What the board did NOT change

- **Planning still stores nothing.** No `PlanningTask`, no week row, no migration.
  The Task's `scheduled_date` IS the plan (ADR-030).
- **`/plan` still has no mutation authority.** Every write leaves through
  `POST /tasks/:id` and `POST /tasks/bulk` via the shared `useTaskSurfaceActions`.
- **No drag-and-drop, and no dependency added for one.** Placement is still
  select-then-choose-a-day: one atomic bulk mutation, each day named in words.
- **No query was added.** The week's four figures are arithmetic over the days and
  the queue the loader had already read (`planningWeekTotals`, pure and
  unit-tested). `plan-query-bounds.test.ts` still holds.

### "+ Plan a task" ARMS a day; it creates nothing

The reference puts a control in every column. It sets the day the queue's existing
bulk placement will commit to, and moves focus to the queue — because the queue is
the only place a Task can be chosen, and a button that changed a label the owner
cannot see would appear to do nothing.

It is deliberately not a create. A create here would be a second create path
beside the shared Quick Capture, and the accessible name says what it does:
*"Plan a task for Thursday 20 August — choose it from Still to place."*

Clicking a day chip in the queue still commits in ONE gesture, so PLAN-01's
keyboard path is untouched; the armed day gives the reference's filled
"Plan selected (n)" button a destination, and both doors lead to the same one
mutation.

### The Review focus is disclosed rather than removed

PLAN-01 drew the prior Review's written focus as a permanent panel above the week,
because REVIEW → PLAN is the premise of the surface. Mockup 7 replaces it with one
control at the foot. It is now a real disclosure — `aria-expanded` plus
`aria-controls` onto a `hidden` panel — because the focus is prose read ONCE at the
start of a planning sitting, and a paragraph above the board costs the board its
first fold every time afterwards. The panel is the same read-only rendering of the
owner's own words, and it still creates nothing.

### The queue's source is chips, and they are links

SMART-01's queue source was a `<select>`; the reference draws chips. They are
LINKS: each source is a real URL the owner can bookmark and share, Back works, and
changing source needs no JavaScript. `aria-current` is the one source of truth for
both the appearance and assistive technology. The strip scrolls rather than
wrapping — a rail that grows a row taller for every saved view pushes the work off
screen — and the reference's trailing filter glyph is a door to `/views`, where a
source is actually made.

The placement bar sticks to the foot of the rail's own scroller, which is both what
the reference draws (beneath the rows) and what the measurement requires (fifteen
rows put it ~1,000px down). It is sticky ONLY inside that scroller: at phone widths
the rail is a section of the page, and `inset-block-end: 0` there stuck the bar
over the top of the rows — MEASURED on the 393px capture, six queue titles
unreadable behind it.

## 5. The card presentation of the shared Task row

`dh-tasklist--cards` — a variant in `app/styles/task-list.css`, consumed by the
board. `TaskRow.tsx` is not forked and gains no prop: same markup, same controls,
same canonical intents, different grid and surface.

Two departures from DS-04 are stated in the stylesheet rather than discovered
later:

1. **It has a surface.** DS-04's rule (a task row has no card of its own) still
   governs `/tasks`, Today and a Project. On a board, a card is what makes a task
   read as a thing PLACED ON a day rather than a line of text near a date.
2. **The title wraps to three lines** instead of truncating. §10's rule is that
   metadata yields before the title does; at 147px there is no metadata left to
   yield, so the title takes the height it needs. Three lines, then it truncates —
   an unbounded title would let one card push a column past the board.

Three smaller decisions inside it:

- **The completion target narrows to 28×28**, on the SAME bargain the row already
  strikes for its block size (`task-signals.css`): the input must be precise AND
  the frame must be the desktop one. WCAG 2.2 SC 2.5.8's 24×24 (AA) fits with room
  on both axes; SC 2.5.5's 44px is a TOUCH guideline and every pixel of it is kept
  wherever a thumb can reach — on a coarse pointer, and below `md`, where the board
  is not drawn at all. Without this the target alone took a third of a day column.
- **The due date yields, and it is the only thing that does.** A card in a day
  column already says when it is planned — the column IS the date. The cell stays
  in the DOM and in the accessible reading; only the drawing yields.
- **The overflow menu is positioned, not tracked.** `position: absolute`, so the
  card's geometry is identical with it and without it (the device the row's swipe
  tray already uses), revealed on hover AND on `:focus-within` so a keyboard user
  is not excluded, and always visible where hover does not exist.

One defect this found and fixed: `--taskrow-columns` is declared on the list and
inherited, but the narrow container-query tiers redeclare it on `.dh-taskrow`
itself — and a value set on the element beats one it inherits, however specific the
list's selector. MEASURED before the declaration moved onto the row: the card's
computed template was `36px 47.3px 0px`, the 34rem tier's three tracks, with the
title squeezed to 47px.

## 6. The Habits table

Four columns — habit · schedule & context · progress · this week — with the
template declared ONCE on `HabitList` and inherited by the header and every row.
That is the device DS-04 built for the Tasks list, applied here for the same
reason: a cell cannot line up with its neighbours if each row decides its own
tracks.

`HabitRow` gained a `layout` rather than a sibling, because HABITS-01's "ONE Habit
row" is what keeps `/habits` and Today from disagreeing about the same record:

```
layout="row"      (Today, a Goal's supporting section — unchanged)
  [check]  Strength training                        1 of 3 this week
           3× weekly · Health & Fitness

layout="columns"  (the collection)
  [check] [▧]  Strength training  3× weekly       1 of 3 this week    M T W T F S S  ›
               ● Health & Fitness  Mon · Wed · Fri ▓▓▓░░░░            ● ● ○ · · · ·
```

MEASURED: the table is 742px at 1440 beside the 21rem rail, 582px at 1280, and
327px at 393 with no rail. The tiers are container queries on the LIST, not media
queries on the window — a correctness requirement, because this component is drawn
both full-width and inside the rail, and a window query would hand the rail the
seven-track desktop grid. The strip yields at 42rem (it is the least load-bearing
cell — the week is already stated in words beside it), and below 34rem the row
returns to the flat two-line composition.

### A Habit's identity comes from where it belongs

A Habit stores no colour and no icon, and UX-02 did not give it one. The row's tile
is the shared `AccentIcon` at its compact rung, resolved through the ONE
`resolveIdentity` from the Area's (or the supporting Goal's) stored slot and icon
key — so "Health & Fitness" is the same hue on this row that it is on its own
record. A Habit filed nowhere draws the neutral container and the entity's default
glyph, which is the honest answer rather than a colour that means something it
does not mean.

### The week strip

Seven dots under seven weekday letters, and it is a `<table>` with real column
headers where every cell carries the full sentence `habitHistoryDayLabel` writes
("Wednesday 2026-08-19: done") — the same rules the record's four-week grid obeys.

**A day that has not happened is not drawn at all.** The strip is handed only the
days up to and including today (`buildHabitHistory` clamps there), and every
remaining column is empty ground whose accessible cell says "not yet". Thursday
cannot be incomplete on Wednesday, so Thursday is blank rather than hollow.

It costs NO query. The completions for the owner's current week are already the
second of `readHabitPage`'s two statements; the strip is the same facts arranged by
day instead of summed. `weekHistory` is OPTIONAL on the serialised shape, and
absent means "the surface did not ask for it" — the `TaskRowData.checklist`
precedent — so Today and a Goal's supporting section pay nothing for a strip they
do not draw.

## 7. The one percentage, and why it is allowed

ADR-102 §8 says *"no score and no percentage anywhere in the product"*. Read
literally that forbids Mockup 8's "84% recent consistency". Read for what it was
protecting against, it forbids three specific things — and this figure has none of
them:

| What the ban was protecting against | What this figure does |
|---|---|
| a figure with **no denominator**, which the owner cannot check | drawn WITH "111 of 142 expected check-ins" on the same card, always |
| a figure over an **unbounded history**, which becomes a score for a life | the existing 28-day `HABIT_RECENT_WINDOW_DAYS` window, and no other |
| a figure that treats an **unscheduled or future day as a miss** | computed from `evaluateHabitConsistency`, which excludes both; a window that expected nothing has NO percentage rather than 0% |

What stays forbidden is unchanged, and is still asserted in tests: no streak, no
flame, no "day 17", no chain to break, no ring that empties, and no sentence that
describes an unscheduled day as a miss or a future day as incomplete. The ban was
on manufactured urgency, not on arithmetic the owner can verify.

`habitConsistencyPercent` is pure, rounds to a whole number (a habit reading is not
a measurement instrument), clamps to 0–100 so a stored oddity cannot draw an arc
past full, and returns `null` for an empty window.

## 8. The figures, and where each one comes from

`/plan` (one set of numbers, printed twice — the chip row and the glance bar):

| figure | rule |
|---|---|
| planned | Tasks with a plan inside the shown week (the board's own rows) |
| still to place | the queue's length, whatever its source |
| overdue | OPEN Tasks the screen is showing — board or queue — whose DUE date is before the owner's today |
| calendar commitments | minutes the calendar already holds across the week, as "8h 30m" |

Two decisions inside `overdue` are the product's, not arithmetic: a COMPLETED Task
is never overdue however old its date, and a PLANNED date in the past is not
overdue at all — only a DUE date can be late, and a lapsed plan is what the queue's
own "plan lapsed" band reports. The two sets are disjoint by construction, so
nothing is counted twice.

Durations are **hours and minutes, never days.** Mockup 7 prints "3d 30m"; a day is
not a unit anybody means by "how much of this week is spoken for", and a figure
that looks precise while saying nothing is worse than no figure. An all-day
commitment contributes zero minutes — it is a day something is true ON, not a block
of time — and a week with no timed commitments says "None" rather than "0m".

`/habits`:

| figure | rule |
|---|---|
| Active | active Habits read (bounded; a larger workspace says so) |
| Due today | `habitDueToday` — the cadence names today, or a count-based week is not yet satisfied |
| Completed this week | check-ins recorded inside the owner's current calendar week |
| Recent consistency | §7 |
| Week at a glance | expected vs completed this week, completed today, still open today |

"Still open", never "missed": the day is not over.

## 9. Query bounds

Both surfaces stay bounded by construction, and the budgets are asserted.

`/plan` — **unchanged.** The four figures are arithmetic over data already read.

`/habits` — **four bounded statements**, whatever the workspace holds:

1. the preference read;
2. `readHabitOverview`: the active Habits (bounded at 60), then
3. ONE four-week completion window for all of them;
4. for the `all` and `archived` scopes only, `readHabitPage`'s existing two.

The `today` scope makes no page read at all — it is the overview it already has,
ordered and (when searching) narrowed.

**Sixty rather than a hundred, and the number is a constraint.** The completion
window binds one parameter per Habit id plus the workspace and two dates, and D1
accepts at most 100 bound parameters per query — the ceiling TASKS-13 found the
hard way, where a 100-id chunk failed and a Today section reported "Nothing planned
today" against thirty-seven planned Tasks. `habit-query-bounds.test.ts` asserts the
constant stays under it.

The rail's "Supporting goals" card adds NO query: a Habit already carries its Goal
through its EntityLink join, so the card is that data inverted rather than a second
read of the Goals collection.

## 10. Accessibility

- **Keyboard-complete, and nothing gained a hover-only path.** The board's
  per-column control is a real button with `aria-pressed`; the queue's chips are
  links with `aria-current`; the Review focus is a real disclosure; the card's
  overflow menu is revealed on `:focus-within` as well as hover, and is always
  visible where hover does not exist.
- **Never colour alone.** The armed day has a tinted ground AND the button's
  pressed state AND the queue's sentence naming the day in words. A non-zero
  overdue count takes the overdue ink and nothing else, with the word beside it.
  "Done today" takes the success role, with the words and the drawn tick.
- **Every dot has a sentence.** The week strip's cells carry the full day label; a
  future column says "not yet" rather than anything readable as a verdict.
- **The trailing chevron is decoration.** It is the same destination the title
  already links to, so it is `aria-hidden` with `tabIndex={-1}` rather than a
  second identical link on every row — and it is not sized as a touch target,
  because it is not one.
- **Two landmarks, not two mains.** Both bodies use labelled `section`/`aside`; the
  shell keeps the document's one `main`.
- **Touch targets.** The only reduction is the card's completion control, under the
  precise-pointer AND desktop-frame guard described in §5.

## 11. Deliberate non-goals

Recorded so they are not mistaken for oversights:

- **No drag-and-drop**, and no dependency added for one.
- **No create on `/plan`.** The board's control arms a day (§4).
- **No calendar write-back, no month grid, no time blocking.** CAL-01 §21/§45
  stand.
- **No Habit icon or colour of its own.** The tile inherits (§6). Giving a Habit
  stored identity is a migration and a form field, and it is a separate decision.
- **No streaks, flames or chains**, and no second percentage.
- **The mockups' header overflow menus** ("…") are not drawn: neither screen has an
  action that belongs in one, and an empty menu is worse than none.
- **The mockups' "Filters" and "Sort" buttons on `/habits`** are not added. The
  collection's search and its three tabs are its narrowing controls; a filter
  vocabulary for Habits is a SMART-01-shaped decision, not a button.

## 12. Debt raised

- **DEBT-162** — the six-column board needs a 1440px viewport. Between 64rem and
  90rem the board folds to three columns, which is a good composition but is not
  the reference's. Closing it means finding width in the shell (the rail is 216px)
  or accepting a narrower card, and both are measurements nobody has taken yet.
- **DEBT-163** — a Sunday-start week draws seven columns and wraps the seventh.
  Correct, and slightly untidy. A weekend pairing that reads well when the two days
  are not adjacent is a design question, not a bug fix.
- **DEBT-164** — a queue row still carries two checkboxes (select, and complete).
  PLAN-01 shipped both and both are useful; the reference draws one. Merging them
  needs a decision about what a single tick on a queue row MEANS.

## 13. How it was verified

| Layer | Files |
|---|---|
| Pure logic | `test/unit/plan/planning-load.test.ts` (durations, and the four figures' rules — 20 tests) · `test/unit/habits/habit-overview.test.ts` (the percentage, "due today", and the week strip — 18 tests) |
| Query bounds | `test/unit/habits/habit-query-bounds.test.ts`, extended with the overview's parameter ceiling · `test/unit/plan/plan-query-bounds.test.ts`, unchanged and still passing |
| Journeys | `e2e/ux-02-plan-habits.spec.ts` (new: the board's columns and its fold, the weekend pairing, a commitment's duration and location, arming a day, the armed placement leaving the deadline alone, the figures agreeing with the rows, the week strip stopping at today, the percentage never appearing without its denominator, the rail and the table being the same check-in, the three scopes, and 393/320 without overflow) |
| Existing journeys | `e2e/habits.spec.ts` (14), `e2e/plan-weekly-planning.spec.ts` (11), `e2e/plan-responsive.spec.ts` (17), `e2e/plan-smart-lists.spec.ts` (11), `e2e/planning.spec.ts` (3) — all passing, with three locator updates where a control changed form (the queue's source is chips, not a select) and one where the same Habit now legitimately appears twice on `/habits` |
| Accessibility | `axe` WCAG 2.2 AA on `/plan` in light, dark and phone, and on `/habits` — green with no rule disabled |
| Measurement | `node scripts/ux-02-shot.mjs --measure 1` against `scripts/ux-02-seed.mjs`'s local fixture, recorded in [`assets/ux-02/measurements.json`](assets/ux-02/measurements.json) |

**One test skips conditionally, and it is disclosed rather than hidden:** the
Review-focus disclosure runs only when the seeded workspace holds a completed
weekly Review with a written focus for the prior period, and the committed E2E seed
does not. The panel's CONTENT is PLAN-01's, unchanged; what UX-02 added is the
disclosure, and building a completed guided Review through the UI to assert
`aria-expanded` was judged a worse trade than a conditional skip that states its
condition. Closing it means a review fixture that writes a completed weekly Review
directly.

## 14. Related documents

- [ADR-104](../decisions/ARCHITECTURE_DECISIONS.md#adr-104-the-planning-week-is-a-board-and-a-habit-may-state-one-proportion--two-decisions-re-taken-on-fresh-measurements-superseding-adr-101-10-and-adr-102-8) — the accepted decision
- [`PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md`](PLAN_01_SMART_01_WEEKLY_PLANNING_2026_08.md) — what this rebuilt
- [`HABITS_01_HABITS_AND_ROUTINES_2026_08.md`](HABITS_01_HABITS_AND_ROUTINES_2026_08.md) — likewise
- [`HABITS_MODULE.md`](../development/HABITS_MODULE.md) — the Habits module's behaviour
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — the shared patterns this used and added
- [`ROADMAP_V2_3.md`](../roadmap/ROADMAP_V2_3.md) — the item
- [`assets/ux-02/measurements.json`](assets/ux-02/measurements.json) — every figure above, as recorded
- `scripts/ux-02-shot.mjs` — the shooter and measurer they came from
- `scripts/ux-02-seed.mjs` — the local design fixture the captures were taken on
