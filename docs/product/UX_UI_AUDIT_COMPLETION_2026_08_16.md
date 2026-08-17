# UX/UI audit completion — the state of the 16 August 2026 audit after PR #188

> An acceptance record, not a redesign proposal.
>
> PR #188 ("UX/UI convergence: status colour, one editing grammar, and a
> first-class phone") states in its own body that it implements the 16 August
> 2026 UX/UI audit, and states equally plainly that a substantial part of that
> audit was left out. This document measures the audit's four stages against the
> code at `afd33e5` (the squash merge of #188 into `main`), records what this
> follow-up pass closed, and — for every requirement still open — says why, with
> the repository evidence that supports it.
>
> **The audit itself is not committed to this repository.** The requirement text
> below is reconstructed from the acceptance brief for this pass and from #188's
> own section headings, which reference the same numbered items
> (`CONTROL-01 §4`, `MOBILE-02 §4`, and so on). Where the two disagree, the
> audit's numbering is treated as authoritative. Committing the audit itself
> would remove this ambiguity and is recommended.

---

## Status vocabulary

| Status | Meaning |
|---|---|
| **COMPLETE** | Implemented and verified against code, and where stated against a runtime measurement or a test. |
| **PARTIAL** | Implemented for some of the surfaces the requirement names. |
| **MISSING** | Not implemented. |
| **REGRESSED** | Was working and no longer is. |

---

## POLISH-01 — signal, contrast and responsive gaps

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Meters state STATUS, not identity, across all six meter families | COMPLETE | `app/shared/progress/meter-status.ts` defines one five-value ramp; `progress.css:91-95` maps all of `.dh-progress__fill`, `.dh-pcard__fill`, `.dh-ecard__progress-fill`, `.dh-mrow__fill`, `.dh-ptable__fill` through it. Identity stays on tiles/dots/avatars. `test/unit/tokens/identity-ramp.test.ts` is a regression guard against identity re-entering a fill. |
| 2 | Light-mode semantic text clears WCAG AA (≥4.5:1) | COMPLETE | `test/unit/tokens/dalyhub-primitive-contrast.test.ts` locks the ratios; no axe rule was disabled to reach it. |
| 3 | Tasks does not scroll horizontally at 820/900/1100px | COMPLETE | `tasks.css:1583-1650` — the whole box chain from `.dh-inline-select` down to `.dh-inline-select__label` is made shrinkable and ellipsising, at the `46rem` container tier only. |
| 4 | Projects mobile header — lifecycle nav and presentation stay separate, tabs reachable, edge fade, no collision at 393px | COMPLETE | `scroll-strip.css` provides the pure-CSS scroll shadows on the element that actually scrolls; the lifecycle rail and the Grid/Table toggle are separate rows in `ProjectsCollection`. |
| 5 | Today stat charts stay inside card padding and clip | COMPLETE | `today.css:1338-1358` insets the plot by the card's own spacing and removes the double bottom padding; `today.css:1386` drops the plot entirely below the narrow tier rather than letting it cross a border. |
| 6 | Distinct nav icons for Inbox, Upcoming, Tasks, Views, AI, Analytics | COMPLETE | `routes.manifest.ts` per module declares `navIcon` (`inbox`, `upcoming`, `views`, `ai`, `analytics`); #188 also made an explicit `navIcon` win over `entityType`. |
| 7 | `/inbox` → "Inbox", `/upcoming` → "Upcoming" | COMPLETE | `app/kernel/task-views/task-system-views.ts:76,81`. |

---

## CONTROL-01 — the controls that change a task

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Anchored compact popover on pointer, shared sheet on touch, one filter model | COMPLETE | `CollectionControls.tsx` splits on `useCompactViewport`; `CollectionControlsPopover.tsx` is the pointer presentation with live apply and no Done footer. |
| 2 | One DalyHub date control across every date-only Task field | **COMPLETE (this pass)** | #188 adopted `CalendarDateField` in `NewTaskForm` only and said so. This pass moved the last four: `TaskQuickEditPanel` (Scheduled, Due) and `TaskDetailsTab` (Delegated on, Follow up). `InlineDateField` was already the product's presets + `CalendarGrid`. `kind="datetime"` fields deliberately stay native — editing a wall clock is the one thing the native control does better. |
| 3 | One priority contract; null is P4; no fifth filtering state; D1 semantics match | COMPLETE | #188 measured the P4 filter returning 54 rows (was 8) and the priority column reading `{P1:16, P2:11, P3:12, P4:43}`. |
| 4 | **Merge the duplicate Task drawers** | **COMPLETE (this pass)** | See "What this pass closed" below. |
| 5 | Row overflow menu: consistent heights, leading icons, useful descriptions only, separator before record-level actions, shortcut hints | **COMPLETE (this pass)** | Every item now carries an icon; `OverflowMenuItem.shortcut` added and rendered at the trailing edge; the single record-level item sits alone below a separator. |
| 6 | Hover must not shift layout — reserve the caret's width | COMPLETE | `.dh-inline-select__caret` is `flex: 0 0 auto` and revealed by opacity only (`task-list.css:671-681`); `.dh-taskrow__actions` is a fixed grid column. Now measured: `ui-quality.spec.ts` asserts every metadata column's x-origin is identical before and after hover and focus. |
| 7 | Notes and Assets join the shared filter grammar; no legacy Apply | COMPLETE | Both render `CollectionControls`; `NotesFilterBar`'s header records the retired GET form and Apply button. |

---

## MOBILE-02 — the phone as a daily driver

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | ≥44px usable hit area on every Task metadata trigger under touch | COMPLETE | `task-list.css:721-747` — a `(pointer: coarse)` `::before` expansion to `--app-touch-target-min`, using `::before` because the shared state layer owns `::after`. |
| 2 | **Hide empty Task metadata on touch** | **COMPLETE (this pass)** | A pointer device already faded `.dh-inline-edit__empty` to 0 until hover; a phone matched neither arm and printed "Unassigned · No due date · No priority" on every row permanently. The whole trigger is now `display: none` for `data-empty="true"` under `(pointer: coarse)` — not just its label, because a zero-width invisible button keeps a 44px hit area floating over its neighbour. |
| 3 | One-tap capture — opens into writing, Task default, compact type switcher | COMPLETE | `CaptureSheet.tsx:144` — the chooser screen is replaced by a chip row; the field is focused on open. |
| 4 | **Swipe actions on Task rows** | **MISSING** | `useCardSwipe`/`CardSwipeTray` exist and serve the generic `Card`, but `/tasks` renders `TaskRow`, which has no swipe. See "Still open". |
| 5 | **Mobile Today** — compacted header, plan first, no duplicate Add | **PARTIAL** | The greeting steps down a rung at ≤48rem (`today.css:1109`) and the header action is full-width rather than crowding it (`today.css:1807-1830`). The *recomposition* — plan first, day navigation folded into the header, the duplicate full-width Add removed — is not done, because it is the same DOM reordering CONVERGE-01 §1 specifies and doing it twice would mean doing it differently twice. |
| 6 | **Project and Goal mobile density** | **MISSING** | See "Still open". |
| 7 | Priority flags and short dates on Today mobile rows | COMPLETE | `TodayScreen.tsx:379` renders the shared `PriorityIndicator` and only when set; `today.css:1130+` keeps the flag on a phone and drops only its tag; `relativePastLabel` is the short shared formatter. |
| 8 | Hide ⌘K and "/" hints on touch; FAB safe area; no clipped Add; scrolling strips with edge fades | PARTIAL | The scroll strips and their shadows are done (`scroll-strip.css`). #188 lists the FAB safe area as out of scope and it remains so. |

---

## CONVERGE-01 — one workspace, eight modules

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | **Today on one 12-column grid, in the specified order** | **MISSING** | `TodayScreen.tsx` still composes three named "ranks" (work / context / support) with Needs attention LAST, an Insights donut present, and no parent context on plan rows. This is the audit's single largest open item. |
| 2 | Shared collection header grammar across the eight modules | PARTIAL | All eight render `CollectionLayout`/`CollectionControls`, and the shared state breakdown (`collectionStateBreakdown`) is in use — Projects reads "20 active · 62 completed · 1 archived". The scope-chip weight reduction is not done. |
| 3 | One list-container rule across People, Notes, Tasks, Project-detail task lists | PARTIAL | Notes and Tasks are surfaceless rows; People and Project-detail lists have not been reconciled. |
| 4 | Project cards expose status, diagnostic, progress, identity | COMPLETE | #188 added the textual diagnostic so a meter's colour has a visible cause ("On track", "6 overdue"). The "table becomes the default at ~40+ projects" question is not answered. |
| 5 | Areas reframed on standing load, "Updated" not the primary metric | COMPLETE | `AreasCollection.tsx:273-284` — `openTasks` is the card's `metric`; `areaRelationshipLine` carries Projects and Goals; `updatedLabel` is demoted to secondary `meta`. No fabricated metrics. |
| 6 | **Notes as one writing workspace** | PARTIAL | The rail beside the editor already exists (`NotesRail`, UIX-04) and the excerpt pipeline is genuinely syntax-free — `cleanExcerpt` runs `markdownToPlainText` and collapses whitespace, so neither raw Markdown nor literal `\n` can reach a list. Still open: two-line excerpts (the row is one line), tags as chips (currently `tags.join(", ")`), the permanent byte-limit hint in `NoteContentForm.tsx:70`, and "+ New note". |
| 7 | People lead with relationship context | MISSING | "No shared history yet" is still `PersonTimelineTab.tsx:131`. |
| 8 | Analytics: no verbose description in body text, readable values, hover readout, an overdue metric | PARTIAL | The verbose description is already visually hidden behind a short `caption` (`AnalyticsScreen.tsx:272`, `TrendLine.tsx:553`). The **"Overdue and trend" metric is missing** — `app/kernel/analytics/analytics.ts` defines exactly four metrics and none is overdue. |
| 9 | Goals: area-first "+ New goal", one filter grammar | PARTIAL | The area-first constraint is real and handled (`NewGoalFormHost` refuses and routes to Areas when none exist). The duplicated filter systems are not collapsed. |

---

## What this pass closed

### CONTROL-01 §4 — one Task editing grammar

Three doors opened onto one Task and each showed a different subset of it:

| Drawer key | Rendered | Carried |
|---|---|---|
| `task:<id>` | `TaskRecordDrawer` | title, priority, dates, waiting, delegation, description, links, activity |
| `task-quick:<id>` | `TaskQuickEditPanel` | parent, priority, dates, Time Sector, Commitment, repeat |
| `task-move:<id>` | `TaskQuickEditPanel` | the same panel, titled "Move task" |

So "where do I change the horizon?" and "where do I change the description?" had
different answers, and the row's overflow offered both "Priority, dates and
repeat…" and "Open task record" as if they were different acts.

All three keys now resolve to `TaskRecordDrawer`. The record gained every
property the retired panel carried, each one a **pressable control** rather than
a printed value:

- **Project or Area** — one row instead of the four the record used to print
  (Project, Goal, Area, and a "Parent: Unassigned" row when it had none), backed
  by the same bounded `/tasks/parent-options` endpoint the row's editor uses.
  Clearing it is "Move to Inbox", in those words. The Goal stays as read-only
  context, because a Goal is the *Project's* goal and not a parent this control
  could set.
- **Horizon** — the persisted field is still `timeSector` and its stored values
  are untouched; only the label moves. "Time Sector" is the schema's name for it,
  and every value it holds ("This Week", "Long Term") is plainly a horizon.
- **Doing this** — likewise for `commitmentState`, whose two values already spoke
  plainly ("Yes — active" / "Someday / Maybe").
- **Repeat** — `TaskRecurrenceEditor` moved onto the record. This is load-bearing:
  the retired panel was its only host, so merging without it would have made a
  custom interval authorable nowhere but quick capture, reopening DEBT-66.

**Complete/Reopen became a first-class action.** It was a checkbox in the middle
of the summary column, ranked alongside the horizon and the repeat rule. It is
now the record header's action, in the slot every other record puts its lifecycle
act in and in the same words a Project uses — "Complete task" / "Reopen task"
against "Complete project" / "Reopen project". `secondary` rather than filled,
for the reason RECORD-01 recorded for the Project: the loudest control on a
record should not be the one that ends it.

**Preserved:** the `task-quick:` and `task-move:` URL keys still resolve (a
bookmarked or Back-stacked drawer URL from before this change opens the task it
names), Back/Forward/Escape and focus restoration are unchanged, activity and
history are unchanged, and no persisted domain value or API field was renamed.

**Removed as sediment:** `findLoadedTask` and `TaskQuickEditDrawerHost` in
`TasksWorkspace`. Both existed only to feed the second editor — and the record
drawer is strictly better than the lookup they performed, because it loads from
the canonical route and therefore works for a task that is not on the loaded
keyset page at all.

`TaskQuickEditPanel` itself is **kept**, and deliberately: Review Inbox and
`TasksReviewWorkspace` use it as the body of a triage card, which is not a
competing drawer over the same object but a different surface with a different
job.

### CONTROL-01 §5 — the row overflow menu

Every item carries a leading icon, so the menu is scannable by shape and every
row is the same height. Descriptions survive only where the label leaves a real
question open ("Skip this occurrence" — and does that complete it?). The one
record-level item sits alone below a separator. `OverflowMenuItem` gained a
`shortcut` field, rendered `aria-hidden` at the trailing edge with the labels
taking the free width so hints line up in a column — to be set only where the
shortcut genuinely exists, because a hint is a promise.

### MOBILE-02 §2 — empty metadata on a phone

See the table above.

---

## Still open, and why

**MOBILE-02 §4 (swipe), MOBILE-02 §6 (Project/Goal phone density),
CONVERGE-01 §1 (the Today grid), §6's remaining Notes items, §7 (People) and
§8's overdue metric are not implemented by this pass.**

They are not out of scope — the audit asked for them and they remain owed. They
were not attempted here because each is a composition change to a surface with
its own live E2E coverage, and the honest sequencing is:

1. **CONVERGE-01 §1 must come before MOBILE-02 §5.** Both reorder Today's DOM.
   Today's phone composition *is* its DOM order (`TodayScreen` states this
   explicitly: "Nothing on this screen is moved by CSS `order`"), so doing the
   mobile compaction first would mean doing the same reordering twice, by two
   different rules, and reconciling them afterwards.
2. **MOBILE-02 §4 (swipe) needs a decision this pass did not have the evidence
   to make.** `useCardSwipe` exists and is proven on the generic `Card`, but
   `TaskRow` is a grid row whose columns are the *list's* columns — a swipe tray
   behind it cannot be a sibling in the same grid without breaking the column
   alignment DS-04 exists to protect. Either the tray becomes a
   `position: absolute` layer inside the row, or the row gains a wrapper and the
   grid moves up one level. The second is a change to the locked desktop Task-row
   anatomy and should not be made without measuring it.

**CONVERGE-01 §8's overdue metric** is the smallest of these and the most nearly
free: `app/kernel/analytics/analytics.ts` already computes four metrics from the
same reads, and an overdue count is available from the existing task query. It is
listed here rather than done because a metric added without its trend and its
range semantics settled would be the fabricated-analytics failure the audit
forbids.

---

## Measured, not inferred

### The PWA precache budget is a pre-existing failure, and predates #188 by
### thirteen pull requests

`e2e/pwa-budget.spec.ts` fails at HEAD: 1,317,514 bytes against a 1,200,000-byte
budget. The budget was **already exceeded before #188 was written**. Measured by
building each commit and summing the emitted precache list:

| Commit | PR | Precache bytes | of which CSS | Assets |
|---|---|---|---|---|
| `fbcb03a` | #173 HARDEN-04 | 1,171,773 | 641,230 | 26 |
| `5bb6cb0` | #174 DS-01 | 1,179,912 | 647,820 | 26 |
| `4ceced0` | #175 DS-02 | **1,234,480** | 651,370 | **31** |
| `d4592d5` | #176 DS-03 | 1,242,051 | 656,553 | 31 |
| `0662ee5` | #182 | 1,245,360 | 659,044 | 31 |
| `6e13e4a` | #183 | 1,256,290 | 669,964 | 31 |
| `fcdfb8c` | #184 | 1,267,182 | 680,856 | 31 |
| `d6f629c` | #185 IDENTITY-01 | 1,296,172 | 709,420 | 30 |
| `b2622b6` | #186 TODAY-11 | 1,303,721 | 716,969 | 30 |
| `c719c32` | #187 NOTIFY-01 | 1,306,028 | 718,946 | 30 |
| `afd33e5` | **#188** | **1,317,514** | 729,048 | 30 |

The ceiling was crossed at **`4ceced0` (DS-02, PR #175)**, where the shell's
chunk graph gained five assets and 54,568 bytes in one step. #188 contributes
**11,486 bytes — 0.9% of the 117 KB overage**.

The budget is therefore **not** raised here, and the failure is **not** #188's.
The real cause is structural and is stated so the next pass can act on it:
`app/root.tsx` imports `app/app.css`, which `@import`s all 72 module
stylesheets, so the precache walk pulls **the entire product's CSS (729 KB, 55%
of the precache)** into an offline shell that only needs to boot Today and the
offline route. Splitting that is a cascade-order change across 82 files and is
the wrong thing to attempt inside an audit-completion pass; it wants its own
change with its own measurements.

### The Goals alignment failure predates #188 by four pull requests

`goals-alignment.spec.ts:83` looked for a visible "Recently active" on a Goal
card. `git log -S openAriaLabel` shows the decision that moved it out of visible
text landed in **`fcdfb8c` (REDESIGN-04, PR #184)**, which states it in the
source: "The row's accessible name carries what the row's DRAWING deliberately
does not". #188's only change to `GoalWorkspace.tsx` was the POLISH-01 meter
status. The attribution itself is correct — the live-created Goal *is* classified
`active` — so the assertion was rewritten to read the name the product publishes.

---

## Test changes, and what each one still protects

| Spec | Was | Is | Why |
|---|---|---|---|
| `helpers.ts` `todayDayPanel` | `region "Focus"` | `getByTestId("today-plan")` | The name has moved three times ("My day" → "Focus" → "Today's plan"), silently breaking every dependent spec each time. The region's name is product COPY; "the Today workspace exists and holds the day's rows" is the contract. |
| `ui-quality.spec.ts` × 3 | `.dh-card--list` on `/tasks` | `getByTestId("task-row")` | DS-04 retired the card on this route. The rule is unchanged and is CONTROL-01 §6 — and it is now measured more strictly: every metadata column's x-origin must be identical before and after reveal. |
| `goals-alignment.spec.ts` | visible state text; a bar on an unmeasured Goal | accessible name; **no** bar on an unmeasured Goal | #184's recorded decision. The replacement assertion protects the stronger rule: "no bar, and no zero, for a Goal nothing advances". |
| `projects.spec.ts` | `/\d+ active/` | `/\d+\s+active/` | `collectionStateSegment` joins with a **no-break space** so a segment cannot wrap between a number and its noun. A literal `" "` matched nothing. The copy is right; the pattern was wrong. |
| `task-drawer.spec.ts` | `"P1"` in the drawer | `"Priority 1"` | The locked priority contract: short tag in rows, full label in menus and on the record. |
| `task-drawer.spec.ts` | completion checkbox | `Complete task` / `Reopen task` buttons | CONTROL-01 §4. |
| `tasks-collection`, `tasks-daily-driver`, `tasks-v22-daily-driver`, `projects`, `projects-mobile`, `project-health`, `assets-ownership`, `tasks-journey` | the second drawer | the one record | CONTROL-01 §4. |

No coverage was deleted and no assertion was weakened to hide a regression.
