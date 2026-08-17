# TODAY-TASK-01 — One task row, and Today as the daily driver

**Status:** delivered 2026-08-17
**Supersedes nothing.** It CLOSES [DEBT-143](../product/PRODUCT_DEBT.md) and
[DEBT-144](../product/PRODUCT_DEBT.md), which
[TODAY-11](TODAY_11_COMMAND_CENTRE_2026_08.md) raised and deliberately did not do.

---

## 1. What this pass was for

Today is the screen the owner opens first. After TODAY-11, CONVERGE-01, FINAL-UI
and FINISH-01 its composition was substantially right and two things were still
wrong with it:

1. **The plan drew its own task row.** `TodayScreen.tsx` declared a private
   `TaskRow`, while `/tasks` had drawn the shared
   [`~/shared/task-record/TaskRow`](../../app/shared/task-record/TaskRow.tsx)
   since DS-04. One object, two anatomies — and, the part that actually cost the
   owner something, two sets of CAPABILITIES: a task's project, its dates and its
   priority were editable in place on `/tasks` and merely printed on the surface
   opened every morning.
2. **The page still read as a board of widgets.** Three bordered metric cards, a
   heading area spread over three vertical beats, and a plan that was the page's
   subject without looking like it.

This pass does both, and it is deliberately not a third redesign: the information
architecture, the honesty rules and every capability TODAY-11 established are
unchanged.

---

## 2. Part A — the convergence

### 2.1 What was deleted

`TodayScreen.tsx` no longer declares `function TaskRow` or `ParentPill`, and
`today.css` no longer carries `.dh-day-row__due`, `.dh-day-row__parent`,
`.dh-day-row__priority`, `.dh-day-row__check` or `.dh-day-list--overdue`. The
plan's bands render the shared `TaskRow` inside the shared `TaskList`.

There is **no** `TodayTaskRow`, `CompactTodayTaskRow` or `DashboardTaskRow`;
`test/unit/today/one-task-row.test.ts` fails if one appears.

### 2.2 The plan's facts survived without a new slot

The strongest evidence that the two rows were the same row is that adopting the
shared one cost the plan nothing:

| The private row drew | The shared row draws it as |
|---|---|
| the mockup's context PILL (a neutral link) | the row's **project cell** — now an identity-carrying inline editor |
| the overdue AGE ("Due 2 days ago") | the row's **date cell** — `relativeCalendarDate` renders a passed date as "2 days ago" in the overdue colour, in words, bounded at every distance |
| the priority FLAG | the row's **priority cell** |

So the "optional trailing slot" DEBT-143 anticipated was not needed. Nothing was
added to `TaskRow` for Today's sake.

### 2.3 What Today gained

Completion, reopen, inline project, inline due/planned date, inline priority, the
row overflow (Move to Project or Area…, Move to Someday / Maybe, Skip this
occurrence, Stop repeating, Open task), the touch long-press, the two swipe acts,
the pending/offline note, and the row's accessibility behaviour — all of them, and
none of them re-implemented.

### 2.4 Where the shared surface actually grew

Four SHARED changes, each usable by every caller:

- **`toTaskRowProjection`** (`task-view.ts`) — the display projection of a list
  item. `toTaskCardData` now composes it; there is one display-state derivation
  rather than two that happen to agree.
- **`applyTaskListItemPatch`** (`task-view.ts`) — the optimistic applier, moved
  out of the Tasks module and made generic over the record type, so a surface
  carrying extra per-day facts (Today's `DayTask`) keeps them.
- **`buildTaskRowActions`** (`task-row-actions.tsx`) — the overflow SET. The
  ordering, icons, separators and the three shapes (read-only, completed, open)
  live once; callers supply callbacks and omit what does not apply to them.
- **The column ladder was corrected** (`task-list.css`). Below 56rem the 4th and
  5th tracks still carried the widths from before FINAL-UI swapped date and
  project, so priority was given 9.5rem and project 4rem. On `/tasks` that was a
  wide gap after every flag; at Today's ~38rem list it truncated every project
  name to one letter. MEASURED on `/today` at 1440: project cell 64 → 144px,
  title cell 202 → 303px.

Today declares **no** `.dh-today .dh-taskrow` structural overrides. The only Today
rules touching the list are two: the band label's inset, and pulling the list's
own inset back out of the card's so a task title lands on the same vertical line
as the band label above it.

### 2.5 Mutation authority

Unchanged and canonical. `useDayTaskActions` is a HOST — an optimistic patch map,
an announcement and a revalidation, which are properties of a SURFACE — and every
write leaves through the shared posters in
[`task-inline-edit.ts`](../../app/shared/task-record/task-inline-edit.ts) to
`POST /tasks/:id` and `POST /tasks/bulk`. There is no Today task endpoint, and the
route's own `useFetcher` completion path (and `completion-feedback.ts` with it) is
gone rather than left as a second door.

A refused write rolls back exactly the keys it painted and says so; a queued one
(PWA-12) keeps the paint and says "Waiting to sync".

### 2.6 The parent candidates

Today's loader adds ONE bounded read — `scope.tasks.searchTaskParents({ limit: 50 })`
— which is the same call `/tasks`'s loader makes, at the same bound. No per-row
query, no unbounded workspace read, no Today-only repository. Parents outside the
bounded page are reached through the same searchable picker (`task-move:<id>`),
offered both at the foot of the inline menu and in the row's overflow.

---

## 3. DEBT-144 — one parent, one identity

`TaskRelation` now carries `colourSlot`, `iconKey` and `colourRank` — exactly the
three inputs `resolveIdentity` walks — resolved by the SAME joined statement that
already resolved `parent_title`. One extra CTE (`task_parent_identity`) ranks the
workspace's Areas and Projects in separate 0-based sequences, matching
`PROJECT_RANKS_CTE`/`AREA_RANKS_CTE` in the Project repository, so the same
Project is the same colour on `/projects`, on `/tasks` and on `/today`.

Cost: one extra scan of the workspace's Areas and Projects per task-list
statement. No extra round trip, no per-row query, no migration, no column.

`InlineTaskParent` draws the shared `AccentIcon` through `resolveIdentity` instead
of the entity TYPE's generic badge — so BOTH surfaces changed, which is what makes
consistency structural rather than a Today decision. `TaskParentCandidate` carries
identity too, so the optimistic paint after re-filing does not flash neutral.

---

## 4. Part B — the visual pass

### 4.1 The heading area (§B3)

Greeting, date and the Today · Tomorrow · Next 7 days rail were three siblings of
the page's flex column, each paying the page gap. They are now ONE element with
its own rhythm, and on a desktop the rail sits on the greeting's baseline row.
MEASURED at 1440: the block from the greeting to the foot of the rail, 107 → 62px.

### 4.2 The measure rank (§B2)

Three bordered `--dh-color-surface` cards, 16px padding on four sides, a 32px plot
under each figure — 176px of band under the greeting, three rectangles of the same
weight as the plan card below them. Now a statistics STRIP: no boxes, no fill, one
`--dh-color-divider` hairline between measures, and the figure sharing a line with
its own 24px plot. **82px.** Nothing was removed: the same labels, the same real
figures, the same real plots, the same links.

### 4.3 The split (§B1) — measured, not assumed

The brief asks whether 7/5 should become 8/4 and asks for the answer to be
measured. It was, on the seeded fixture:

| container | 7/5 plan | 8/4 plan | 7/5 rail | 8/4 rail | 8/4 per week-day |
|---|---|---|---|---|---|
| 832px | 477 | 548 | 335 | 264 | 34.3px ← too tight |
| 976px (1280) | 561 | 644 | 395 | 312 | 41.1px |
| 1136px (1440) | 654 | 751 | 462 | 365 | 48.7px |
| 1424px (cap) | 822 | 943 | 582 | 461 | 62.4px |

The binding constraint is the week strip: seven columns each holding a 28px
selected-date disc and a three-letter weekday. So the step is **8/4 from a 60rem
container** and 7/5 below it, where the week is what would pay. That is the
measured result rather than the blanket change.

### 4.4 The plan as the hero without a hero banner

The card keeps the page's one border. Its block inset tightened to `space-4`
(the shared rows carry their own rhythm), and the ROWS bleed to its inline edges
so the hairlines run the full width of the card — which is what makes it read as
one continuous plan rather than as a list floating inside a box. Band spacing
tightened from `space-4`/`space-1` to `space-3`/`space-2`.

### 4.5 Needs attention (§B5)

On a wide rail the row is now ONE line — subject, then its fact at the end of the
line, muted — so the section reads as a short decision list rather than as another
widget. Below the step the fact keeps its own line, which is what a phone needs.
Nothing is coloured red that was not; the tonal mark is identity, never status.

---

## 5. Measurements

Seeded `today-fixtures.mjs typical`, captured by
[`e2e/today-task-01-evidence.mjs`](../../e2e/today-task-01-evidence.mjs);
screenshots and numbers come from the same navigation. Full JSON in
[`assets/today-task-01/`](assets/today-task-01/).

| | before | after |
|---|---|---|
| first task row y, 1440 | 457.6 | **319.6** |
| first task row y, 393 | 354.1 | **324.1** |
| plan width, 1440 | 654.3 | **750.7** |
| Schedule width, 1440 | 461.7 | 365.3 |
| plan : rail, 1440 | 1.42 : 1 | **2.06 : 1** |
| title track, 1440 | 422 | 302.7 |
| title track, 1280 | 328.6 | 244 |
| document horizontal overflow, every width | 0 | **0** |

Overflow is 0 at 320, 375, 390, 393, 430, 820, 1100, 1280, 1440, 1728 and 2560, in
both appearances.

**Row height.** A desktop row is 44px, unchanged. A PHONE row is the shared
two-line composition (title, then `date · project … P1`) at ~72px, where the
private row was one line at ~45px. That is the deliberate trade: the old shape
kept the title widest by DELETING the project on a phone; the new one gives the
title a whole line and puts the metadata where it cannot compete — which is why
the project, the date and the priority are reachable and editable on a phone for
the first time.

**Touch targets** (coarse pointer, 393): completion label 45×45, row overflow
45×45, inline editors 24px boxes with the shared `::before` 44px hit area
(`task-list.css`), title link 19.6px (an inline text link, exempt under WCAG 2.2
SC 2.5.8) — identical to `/tasks`, and covered by `touch-targets.spec.ts`.

**Why the title track is NARROWER and that is not a regression.** The private row
was a flex line, so the title took whatever the one trailing pill and the flag
left. The shared row is a column grid, so the date, the priority and the project
each hold a fixed track whether or not this row's value fills it — which is the
whole reason a date reads as a column rather than as four elements near each
other. The title track is still the only flexible one, still the widest thing on
every row at every measured width, and what the plan bought with the difference is
three editable cells and an overflow menu where there were two printed strings.

---

## 6. What this pass deliberately did NOT do

- **No new columns, no new data, no new figure.** No productivity score, no focus
  time, no task times. Every omission TODAY-11 recorded still holds.
- **No `order`-based reordering.** The DOM order is the reading order, the tab
  order and the phone composition, exactly as CONVERGE-01 §1 left it.
- **No Today-specific row CSS.** See §2.4.
- **The date cell still says "Today" on every row of the "Due today" band.** It is
  redundant against the band heading and it is the same thing `/tasks` does when
  grouped by due state, so it stays consistent rather than becoming a Today-only
  suppression rule. Recorded as [DEBT-150](../product/PRODUCT_DEBT.md).

---

## 7. Related

- [DS-04](../roadmap/ROADMAP_V2.md) built the shared row and wired it into
  `/tasks` alone.
- [TODAY-11](TODAY_11_COMMAND_CENTRE_2026_08.md) rebuilt Today and raised
  DEBT-143/144/145.
- [IDENTITY-01](IDENTITY_01_IDENTITY_SYSTEM_2026_08.md) §10 — the identity system
  DEBT-144 extends to a task's parent.
