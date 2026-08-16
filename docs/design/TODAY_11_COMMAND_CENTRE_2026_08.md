# TODAY-11 — The Command Centre (MOCKUP 5)

> Today, desktop and phone, rebuilt to `MOCKUP 5.png` using **only capabilities
> DalyHub actually has** — with every element the product cannot honestly back
> omitted or adapted by recorded decision rather than faked.

**Base SHA:** `2a98a06dc39e679801b7c3ae3088693f2395fa43` (`main`, "Add files via
upload", 2026-08-16).
**Branch:** `claude/today-mockup-5-1dox9g`.
**Screen:** `/today` (`app/modules/today/`), plus `app/styles/today.css`.

---

## 1. The truth table, re-verified against the code at build time

The work package supplied a truth table. AGENTS.md makes the repository — not a
prompt — the authority, so **every row was re-checked against `main` before it
was built**, and five of them turned out to be wrong about what exists. Those
five are marked ⚠ and the correction is stated.

| # | Mockup element | Verified capability on `2a98a06` | Decision |
|---|---|---|---|
| 1 | Greeting + date | `greetingFor` / `dayPartForHour` / `formatTodayDate`, all resolved server-side in the owner's timezone (ADR-022) | **Built as drawn.** |
| 2 | ⚠ Search icon in the header | The **shell already carries search**, as a labelled control on the same gutter line one rank above the greeting (`DesktopTopBar`, `role="search"`, `/` shortcut) and in `MobileTopBar` | **Omitted.** DS-03 settled search's fourth and final home and refused "a second real text field … a second search implementation to keep in step with the first". A second affordance on one page is exactly that. |
| 3 | `+ Add task` | CAPTURE-01's shared sheet, `useCapture().openCapture("task", …)` | **Built as drawn**, in the page header and again at the foot of the plan. |
| 4 | Stat: Tasks completed 24, +8, sparkline | `loadActivityTrend` already reads **fourteen** owner-calendar days in one grouped aggregate and returns `previousCompleted`; `Sparkline` is a shared primitive | **Built as drawn.** Delta is the last 7 days against the 7 before. |
| 5 | Stat: Focus time 6h 45m + bars | **Does not exist.** No timer, no session record, no field. `analytics.ts` refuses it by name; `DALYHUB_DESIGN_SYSTEM.md` §5d rules it out | **Omitted.** Not faked, and no timer built. |
| 6 | Stat: Goals on track, 3 of 5 | `loadGoalSummaries` (already read by Today) + `goalIsOnTrack` — the counting helper that is deliberately *not* `!goalNeedsAttention` | **Built as drawn**, with a meter. Denominator is the measurable Goals the read returns; a workspace with none shows **no card**, never "0 of 0". |
| 7 | Stat: Productivity score 78 "Great" | **Does not exist**, and is refused everywhere else (Analytics by name, Areas have no health %, Goals state honest status) | **Omitted.** No formula invented. |
| 8 | Today's plan — rows, `+ Add task` | The day's bands, the shared `dh-check-circle`, the shared `PriorityIndicator` | **Built**, with two adaptations (rows 9 and 10). |
| 9 | ⚠ A **time** on each plan row ("9:00 AM") | **Tasks have no times.** `migrations/0006`/`0012`: `due_date`/`scheduled_date` are `TEXT CHECK (… GLOB '????-??-??')`. `TaskListItem` carries no time field | **Omitted.** A task is a date; a meeting is an instant, and those have times in the Schedule panel beside it. |
| 10 | ⚠ An **Area pill** on each plan row | A task's parent is a `TaskRelation { kind: "project" \| "goal" \| "area", id, title }` — often a *Project*, not an Area, and carrying **no icon and no colour** | **Adapted.** The row ends with the parent as a linked **neutral** pill naming its kind ("Project: Kitchen renovation"). Identity colour would need a read per row or a kernel type change — [DEBT-144](../product/PRODUCT_DEBT.md). |
| 11 | ⚠ Schedule panel — "View full schedule" → `/today/schedule` | `/today/schedule` is **not a page.** It is CAL-03's `POST /today/schedule/:eventId/:action` resource route with **no `GET`** | **Adapted.** The one link goes to `/today/upcoming`, the real forward agenda. |
| 12 | Schedule panel — "View full calendar" | No calendar view distinct from the forward agenda exists, and none is being built (CAL-01 §21, §45) | **Omitted.** One label, one destination. |
| 13 | Schedule — week strip with per-day dots | Buildable from data the page now loads: `loadScheduleWindow` takes a **range** and issues the same four bounded statements for seven days as for one (CAL-01 §34) | **Built as drawn.** Dots come from the already-loaded window; selecting a day costs **no request**. |
| 14 | Schedule — timeline of timed items | CAL-01's `DaySchedule` + the shared `ScheduleList`, unchanged | **Built as drawn** — external occurrences and Meetings, with the source/Meeting mark. **Timed tasks are not in it**, per row 9. |
| 15 | Goal progress rail — tiles, bars, values, `View all` | `loadGoalSummaries`, `AccentIcon`, `GoalProgressReadout`, IDENTITY-01 | **Built as drawn.** `View all` → `/goals`. The Area returns under the title (see §3.4). |
| 16 | ⚠ Goal progress — `+ Add goal` | A Goal **requires an Area** (`NewGoalForm` takes `areaId`). `DALYHUB_FINAL_PRODUCT_UI_2026_08.md` §9 deviation 2 already records that the Goals page's own `+ New goal` was drawn and deliberately not built | **Omitted**, consistently with that recorded decision. `View all` reaches the place an Area can be chosen. |
| 17 | Insights — task-completion ring, "24 / 30" | Computable from the trend already loaded: completions against captures over the same window | **Built, adapted and relabelled** — see §2. |
| 18 | Insights — Focus time half | Does not exist (row 5) | **Omitted.** The panel composes from its truthful half. |
| 19 | Insights — "Most productive — Mornings, 9AM–12PM" | Completion instants exist in Activity, but **the read is not cheap**: hour-of-owner-day is not a function of a UTC instant across a DST transition, so it needs either ~168 bucketed ranges in one statement or a new bounded method on the kernel `TaskRepository` | **Omitted and recorded**, per the work package's own conditional. See §5.3. |
| 20 | "View analytics" | `/analytics` exists | **Built** — links there. |
| 21 | Quick capture card — field + chips | CAPTURE-01's `CAPTURE_TYPES` = task · diary · meeting · note · asset | **Built**, with the chips being **Task · Note · Diary · Meeting**. The "field" is a *button* that opens the shared sheet — see §2. |
| 22 | Capture chip: **Reminder** | No reminder field, no delivery channel (DEBT-57) | **Omitted.** Not built. |
| 23 | Capture chip: **Upload** | Attachments are deferred capability (DEBT-35) | **Omitted.** Not built. |
| 24 | Daily reflection card | Diary is real; `DiaryRepository.list` already takes an `occurredFrom`/`occurredTo` range | **Built.** Today's entry's opening as an excerpt, or the prompt and the Diary capture panel. "View all reflections" → `/diary`. **No sentiment, no AI.** |
| 25 | Phone frame | The shipped shell and bottom bar, unchanged | **Built** — the same truthful set, condensed. See §4. |

**Two rows the mockup does not draw, kept anyway** — recorded here so the
addition is as visible as the omissions:

- **Needs attention.** It is the only surface where an Asset obligation with no
  open Task reaches the owner (ADR-063 decision 10; DEBT-57 is precisely about
  that reach). Deleting a panel because a composition mockup did not depict it
  would be a silent capability loss.
- **Today · Tomorrow · Next 7 days** (`DayNav`). The week strip navigates the
  *schedule's* day; Tomorrow and Next 7 days carry tomorrow's **tasks** and seven
  days of task counts, which a strip over one panel cannot.

---

## 2. Adaptations, stated in full

### 2.1 The Insights ring is "completed against captured", not "task completion"

The mockup's ring needs a denominator. DalyHub has exactly one honest candidate
that costs no new read — what the same window **captured** — so the ring reads
**"24 of 30 captured · Last 7 days"**.

It is deliberately **not** `completed ÷ today's tasks`. That figure existed on
this screen once and was removed with an argument that still holds: the
denominator is whatever the owner happened to date for today, so clearing three
of three reads 100% and clearing nine of twelve reads 75% — the emptier day
scores better. `DALYHUB_DESIGN_SYSTEM.md` §5d rules out a "daily progress"
percentage by name, and this pass does not smuggle one back under a new label.

The two sets are not nested (a task completed this week may have been captured
last month), so the ratio can exceed 1. **The arc clamps at 100%; the words do
not** — "40 of 10 captured" is printed as it is, the same trade
`goalOverTargetLabel` documents. Asserted in
`test/unit/today/today-11-models.test.ts`.

### 2.2 The capture "field" is a button

A real `<input>` here would be a **second capture implementation** — its own
parsing, validation and error recovery — beside the shared sheet that already
owns all three; DEBT-51 exists because the product went down that road once with
the Tasks quick-add row. So it is a control that *looks* like a field and opens
the shared sheet, which is exactly what `DesktopTopBar` does for search and for
the same stated reason. Its label is real text and is its accessible name.
Asserted: `queryByRole("textbox")` finds nothing on Today.

### 2.3 The plan's context pill is neutral

See truth-table row 10. Colouring only the parents that happen to appear in
another already-loaded list would be worse than colouring none — a list where
some rows carry identity and some do not reads as a rendering fault.

---

## 3. Conflicts with shipped decisions, resolved and recorded

### 3.1 The stat rank returns to the top — amending FINAL-UI §45

FINAL-UI ([ADR-096], `DALYHUB_FINAL_PRODUCT_UI_2026_08.md` §4.3) moved Today's
figures **below** the day's work, citing its own §45 ("do not put decorative
stats before actionable content"). REDESIGN-03 then removed the stat row
outright and put one row of **week** measures above the day. MOCKUP 5 puts a stat
rank directly under the greeting. **The mockup wins**, as the owner's newer
intent.

§45's *spirit* is kept, and is what the position guard in
`TodayScreen.test.tsx` still asserts:

- the rank is **shallow** — one compact card rank, a label, a figure and a ≤36px
  chart, not a dashboard hero;
- **exactly three blocks** may precede the work rank (header, day rail,
  measures). A fourth fails the test whatever it is called;
- the greeting stays at `--dh-text-page-title-*` — a page title, not a banner —
  so D11 ("Today has no hero") survives intact.

### 3.2 The two-column body becomes four ranks

REDESIGN-03's dominant-column-plus-rail gives way to the mockup's arrangement:
**measures → work (plan | schedule) → context (goals · insights · doorways) →
support**. With seven panels, two tall columns end at wildly different heights and
leave the hole under the shorter one that every previous Today layout has chased;
a rank cannot produce that hole.

**Behaviours that survive the re-layout, unchanged:** the overdue/attention truth
rules (`day-view.ts`, `attention-view.ts` untouched), TODAY-10's three named
bands and its priority-ordering, optimistic completion with re-bucketing, the
canonical `tasksForTodayCount` behind "View all N", the "4 | 0" separator lesson
(every adjacent-numeral string on the screen carries one), and keyboard
reachability of every panel.

### 3.3 ⚠ There is no widget architecture to map onto

The work package's §3.3 asks that the mockup's panels "map onto the existing
widget architecture" and that this pass not "delete the personalisation system".
**Verified: that system no longer exists on `main`.** `useTodayLayout` and
`landing/layout.ts` are gone; `grep -r widget app/modules/today` finds only
comments describing their removal, and `TodayScreen.tsx` has said "no widget
system" in its own header since the 2026-08-07 redesign (recorded under DEBT-53).

So there was nothing to preserve and nothing was deleted. **This pass does not
build one**: a personalisation system is a feature, not a composition change, and
inventing one inside a visual pass is exactly the creep §6 of the package
forbids. [DEBT-32](../product/PRODUCT_DEBT.md) and
[DEBT-55](../product/PRODUCT_DEBT.md) both describe code that no longer exists;
both entries are updated to say so rather than left to mislead the next reader.

### 3.4 Two smaller reversals

- **The Schedule panel is now permanent.** It used to disappear on an empty day
  ("a Schedule heading over nothing is chrome"). It is no longer over nothing:
  the week strip is a real control over real data. What must never come back is a
  *silent* empty panel — the day says "Nothing scheduled", and says something
  different again when no calendar is connected at all.
- **A Goal tile shows its Area again**, reversing VIS-01. VIS-01 removed it
  because it "competed with the title for the one line a compact card has"; the
  mockup stacks them, so the competition it was resolving no longer exists.

### 3.5 What is NOT reversed

The overdue rail's removal stands. The no-fabrication rules stand.
`loadGoalSummaries` and the CAL-01 schedule read stay the canonical sources. The
shell, bottom bar, identity system, priority language, kernel goal arithmetic,
EntityLinks, Activity, capture receipts, mutation authority, security and CSRF
are untouched. No migration; no D1 schema change.

---

## 4. Composition

### Desktop (1440 / 1280)

1. **Header** — greeting (page-title role) + date; trailing `+ Add task`
   (primary). No search icon (§1 row 2).
2. **Day rail** — Today · Tomorrow · Next 7 days.
3. **Stat rank** — Tasks completed (sparkline) · Tasks captured (bars) · Goals on
   track (meter). Shallow cards, hairline boundary, no accent fill.
4. **Work rank** — Today's plan (`1.55fr`, the one bordered card on the screen)
   beside Schedule (`1fr`: month label, week strip, selected day, timeline, one
   link).
5. **Context rank** — Goal progress · Insights · (Quick capture + Daily
   reflection stacked).
6. **Support rank** — Needs attention · Continue working, absent when empty.

Every panel is a quiet header, one optional trailing action and content directly
on the surface. **No card inside a card anywhere on the screen.**

### Phone (390, surviving 320)

Same DOM, same reading order, same tab order — **nothing is moved by CSS
`order`**. Each rank collapses to one column at `< 34rem` of the pane. The
measures become two-column rows (label and note left, figure right) and drop
their charts; the plan row drops the priority flag and the context pill, exactly
as the priority flag has been dropped since TODAY-10 and for the same measured
reason. The week strip keeps its seven columns — a week is a week — and gives up
the date disc's diameter instead. The header's action goes full width under the
greeting. This is the arrangement MOBILE-01 established for this screen: inline
below, in DOM order, never a phone-only composition.

### States

- **Empty:** no plan → "Nothing planned today." with `+ Add task` beneath it; no
  schedule → "Nothing scheduled." (or the connect-a-calendar sentence); no
  measurable Goals → one line pointing at `/goals`; no reflection → the prompt
  and the Diary capture; nothing anywhere → the page ends on "All clear."
- **Loading:** the route streams behind the shell's existing skeleton; no panel
  renders a spinner.

---

## 5. Data and query discipline

### 5.1 Every read, and what it costs

| Panel | Read | Statements | New? |
|---|---|---|---|
| Today's plan | `tasks.listPlanningTasks` (bounded 200/100/100) | 1 | no |
| Needs attention (inbox) | `tasks.listWorkspaceTaskGroups` — grouped aggregate | 1 | no |
| Needs attention (assets) | `assetHistory.listAttention` | 1 | no |
| **Schedule + week strip** | `loadScheduleWindow` over the owner's **calendar week** | 4 (occurrences, sources, 2× Meetings) | **no — window widened from 1 day to 7, statement count unchanged** |
| Needs attention (waiting) | `tasks.listWaitingTasks` (bounded 50) | 1 | no |
| Continue working | `projects.listProjects` + `projectHealth.listProjectHealthFacts` | 2 | no |
| Needs attention (goals) | `goals.listGoalsByAlignment` + contributions + alignment facts | 3 | no |
| Goal progress **and** the Goals-on-track card | `loadGoalSummaries` | 4 | no |
| Tasks completed, Tasks captured **and** the Insights ring | `loadActivityTrend` → `countTaskActivityByDay` | 2 | no |
| **Daily reflection** | `diary.list({ limit: 1, occurredFrom, occurredTo })` | **1** | **yes — the only query this pass adds** |

**Net: one new bounded query, and one existing window widened.** No N+1, no
per-row read, no new repository method, no kernel interface change.

### 5.2 No figure is computed twice

`loadActivityTrend` is read once and serves the "Tasks completed" card, the
"Tasks captured" card and the Insights ring. `goalIsOnTrack` over
`loadGoalSummaries` is applied once and serves both the "Goals on track" card and
the Goal panel's "3 of 5 on track" line. `tasksForTodayCount` is derived once and
serves both the plan's heading count and its "View all N" link, so the link and
its destination cannot disagree. Both windows are named on screen ("Last 7
days"), and both are rolling seven-day spans rather than calendar weeks — read on
a Wednesday, "this week" would mean three days to the owner and seven to the
query.

### 5.3 The gap this pass found, and did not paper over

The by-hour insight ("Most productive — Mornings"). Completion instants exist in
Activity, but the owner's *hour of day* is not a function of the UTC instant
alone across a daylight-saving transition — which is why
`loadActivityTrend` already **skips** a DST-collapsed local midnight rather than
inventing a boundary. Doing it properly needs either ~168 bucketed ranges in one
statement or a new bounded read on `TaskRepository`, which is kernel surface
(AGENTS.md §14: "the kernel is sacred") inside a composition pass. Omitted, and
recorded as [DEBT-145](../product/PRODUCT_DEBT.md).

---

## 6. Accessibility

- Every stat card's figure has an accessible name; the sparkline is
  `aria-hidden` (its figures are text beside it) and the bar chart is
  `role="img"` carrying its full summary sentence, with the visible axis and
  sentence hidden in the 92px card rather than removed.
- The Insights ring is `role="img"` with the whole sentence; its percentage and
  its ratio are also plain text, so the clamped arc is never the only statement.
- The week strip is a `tablist`: **arrow keys** move between days, **Home**/**End**
  jump to the ends, only the selected day is in the tab order, and each day's
  accessible name states the whole fact in words ("Today · Saturday 8 August, 3
  scheduled" / "… — nothing scheduled") — so the dot is never a colour-only
  signal. The selected day is announced by `aria-selected` and named in text
  above the timeline.
- The plan's context pill names its kind ("Project: Kitchen renovation"), so a
  bare "Work" cannot be ambiguous between an Area and a project called Work.
- Trailing panel actions floor at `--app-touch-target-min` under
  `(pointer: coarse)`.
- Selection in the strip is a filled disc; **today** (when not selected) is an
  outline, and both have forced-colours fallbacks.

---

## 7. Verification

Run on `2a98a06` + this change:

| Gate | Result |
|---|---|
| `pnpm run format:check` | ✅ |
| `pnpm run lint` | ✅ |
| `pnpm run typecheck` | ✅ |
| `pnpm run scheme:check` | ✅ |
| `pnpm run icons:check` | ✅ |
| `pnpm run test:unit` | ✅ 5,703 → **5,741** passing, 0 failing |
| `pnpm run test:kernel` | ✅ (see the PR body for the run) |
| `pnpm run build` | ✅ |

**Tests added.** `test/unit/today/today-11-models.test.ts` (23) covers the week
strip's arithmetic across month and year boundaries, the reflection excerpt's
reduction (including that it never renders HTML), the delta sentence's four
states, the on-track counting rule and the ring's clamp. `TodayScreen.test.tsx`
gains 17 covering the strip's selection and keyboard contract, the single
schedule link, the ring's text equivalents, the real capture kinds, the absence
of Reminder/Upload/Focus time/Productivity score, the reflection's two states, the
absence of a time on any task row and the parent pill.

**E2E, run against the local D1 and the dev server, and reported honestly.**
Every failure below was re-run against the **base SHA with the same fixture** to
prove it is pre-existing; none is baselined, skipped or weakened.

| Spec | Result |
|---|---|
| `today.spec.ts` | 10 passed, **2 failed — both fail identically on `2a98a06`** ("ticking a task on Today completes it in Tasks too" and "the rail's rows navigate to their subjects", the latter because an Asset attention row's href is `/assets`, which its own pattern does not allow) |
| `today-focus.spec.ts` · `today-mobile.spec.ts` · `today-keyboard.spec.ts` | 21 passed, **5 failed — all five fail identically on `2a98a06`** (the `/tasks` swipe-accelerator trio and two task-drawer shortcut journeys) |
| `calendar.spec.ts` · `ux-01-daily-driver.spec.ts` | **32 passed, 0 failed** |
| `accessibility.spec.ts` (scoped to `/today`, `/today/waiting`, light **and** dark) | **4 passed, 0 failed** — no WCAG 2.2 AA violation reported by axe on this screen in either appearance |
| `touch-targets.spec.ts` | 8 passed, **1 failed — fails identically on `2a98a06`** (the Goal RECORD's editable values; an untouched route) |
| `responsive.spec.ts` — the whole breakpoint matrix, 13 routes × 6 widths | **455 passed**, 10 failed. Every `/today` cell passed. All ten failures are Goal inline popovers and the Project task Drawer at 320 and 2560 — untouched routes — and one was re-run against `2a98a06` and fails there too |

Before the spec updates the same three files failed **12**; the seven that were
this change's own were fixed by updating the assertion, never by relaxing it —
the `Focus` heading became `Today's plan`, "Plan day" became `+ Add task`, and
the support rank's order is now read off `.dh-today__rank--support`. New
journeys were added for the week strip (seven tabs, arrow navigation, the URL
untouched, one link to `/today/upcoming` and no "calendar" link) and for the
capture card (a `BUTTON` not a `textbox`, no Reminder, no Upload, and a chip that
genuinely opens the shared sheet). `main`'s E2E suite is separately and
independently red — [DEBT-106](../product/PRODUCT_DEBT.md).

**Evidence.** `docs/design/assets/today-11/{before,after}/` — Today at 1440,
1280, 820, 390 and 320, light and dark, on the seeded `typical` fixture, captured
from the running application at the base SHA and at this change. The capture pass
asserts `scrollWidth <= clientWidth` on every one: **zero horizontal document
overflow at any width in either appearance**.

---

## 8. What this pass did NOT do

Stated plainly, because the Definition of Done asks about the first one directly.

- **Today's plan does not use the shared `~/shared/task-record/TaskRow`.** The
  work package refers to a "UX-02 item A" brief; **no UX-02 exists in this
  repository** (`grep -rn "UX-02" docs/` finds nothing), so there is no adoption
  contract to follow. What *is* already shared, and is what FINAL-UI §4.3
  recorded as the convergence, stays shared: the completion control
  (`dh-check-circle` with the product-wide "Complete &lt;title&gt;" name), the
  `PriorityIndicator`, the band heading language and the row density. What is not
  shared is the anatomy — the shared row is a five-column grid owned by
  `TaskList` (`project · due · priority · status`) with an inline editor per
  cell, and adopting it needs a bounded parents read, five mutation intents and a
  per-row overflow menu Today's loader and route do not have. Recorded as
  [DEBT-143](../product/PRODUCT_DEBT.md) with a closing condition, not claimed.
- **No focus/time tracking, no productivity score, no reminders, no
  notifications, no attachments, no AI on reflections, no weather, no new
  calendar module, no widget-arrangement sync.** All out of scope and all still
  out.
- **No D1 schema change and no migration.**

---

## 9. Remaining debt raised

| ID | Summary |
|---|---|
| [DEBT-143](../product/PRODUCT_DEBT.md) | Today's plan still draws its own task row rather than the shared `TaskRow`. |
| [DEBT-144](../product/PRODUCT_DEBT.md) | A plan row's parent pill is identity-less, because the planning read carries no parent identity. |
| [DEBT-145](../product/PRODUCT_DEBT.md) | Completion-by-hour cannot be read cheaply in the owner's timezone, so the "most productive time" insight is omitted. |

[ADR-096]: ../decisions/ARCHITECTURE_DECISIONS.md
