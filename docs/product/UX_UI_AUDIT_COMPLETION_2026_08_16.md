# UX/UI audit completion — the 16 August 2026 audit, CLOSED

> An acceptance record, not a redesign proposal.
>
> **Every row in this document is COMPLETE as of FINISH-01 (17 August 2026).**
> The audit's four stages closed across five pull requests — #188, #189, #190,
> #191 and FINISH-01 — and each row below names the one that closed it, with the
> file, the line or the measurement that proves it. Nothing is owed. Two of the
> audit's own findings turned out to be wrong on inspection and are recorded as
> wrong rather than implemented; see "Nothing is open".
>
> PR #188 ("UX/UI convergence: status colour, one editing grammar, and a
> first-class phone") states in its own body that it implements the 16 August
> 2026 UX/UI audit, and states equally plainly that a substantial part of that
> audit was left out. This document measures the audit's four stages against the
> code, records what each follow-up pass closed, and — for every requirement
> still open — says why, with the repository evidence that supports it.
>
> **The audit itself is not committed to this repository.** The requirement text
> below is reconstructed from the acceptance brief for this pass and from #188's
> own section headings, which reference the same numbered items
> (`CONTROL-01 §4`, `MOBILE-02 §4`, and so on). Where the two disagree, the
> audit's numbering is treated as authoritative. Committing the audit itself
> would remove this ambiguity and is recommended.

> ## Refreshed 17 August 2026 against `cd385cfd`
>
> This document was last written during #189 and measured against `afd33e5`. Two
> pull requests landed after it — **#190** (`e6fa530`) and **#191** (`cd385cfd`)
> — and neither reopened this file. Three rows therefore said MISSING or PARTIAL
> about work that was already merged: **CONVERGE-01 §1** (the Today grid),
> **MOBILE-02 §4** (Task row swipe) and **MOBILE-02 §5** (mobile Today). A
> register that is wrong in that direction is worse than no register, because the
> next pass reads it and rebuilds something that exists.
>
> Every MISSING and PARTIAL row was re-read against `cd385cfd` in this refresh,
> not just the three. Two more rows were wrong in the OTHER direction and are
> corrected here rather than quietly left:
>
> - **CONVERGE-01 §7 (People)** was recorded MISSING on the strength of a line in
>   `PersonTimelineTab.tsx` — which is the Person RECORD's timeline tab, not the
>   collection row the requirement is about. The row already reaches (`mailto:`
>   / `tel:`), already carries a rhythm column and already draws identity colour.
>   It is PARTIAL, and the open half is narrower and different from what the row
>   claimed.
> - **MOBILE-02 §6** named "Project **and Goal**" density. Measured at 393×852,
>   Goals already renders at row scale — `.dh-mrow`, 64px, nine per viewport — so
>   only the Project half is open. The measurement is in the row.
>
> The register's own rule is unchanged and is what this refresh applies: **a row
> closes on evidence, and the evidence is a file and a line.**

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
| 4 | Projects mobile header — lifecycle nav and presentation stay separate, tabs reachable, edge fade, no collision at 393px | COMPLETE | `scroll-strip.css` provides the pure-CSS scroll shadows on the element that actually scrolls; the lifecycle rail and the Grid/Table toggle are separate rows in `ProjectsCollection`. FINISH-01 additionally fixed a page-level horizontal scroll the table caused at 390/320 (see CONVERGE-01 §4). |
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
| 4 | **Swipe actions on Task rows** | **COMPLETE (#191)** | `app/shared/task-record/useTaskRowSwipe.ts` is the row's own gesture, and its header states why it is not `useCardSwipe`: a `TaskRow` IS the column grid (DS-04), so the tray cannot be a sibling and the CELLS move by `transform` instead — `task-list.css:1419-1436`. Inert unless `(hover: none) and (pointer: coarse)`; `TaskRow.tsx:203-215` binds both edges to the row's OWN controls (the checkbox handler, and the inline date trigger the row already renders), so there is no swipe-only mutation. Decisions are in the pure model `app/shared/card/swipe-model.ts`, covered by `test/unit/card/row-swipe-model.test.ts`. |
| 5 | **Mobile Today** — compacted header, plan first, no duplicate Add | **COMPLETE (#191)** | The recomposition landed with CONVERGE-01 §1, in the markup, exactly as this row said it had to. The header is now the greeting block alone (`today.css:1902-1916`) because the duplicate "+ Add task" is gone from the DOM at every width, not hidden on a phone (`TodayScreen.tsx:1126-1141`). The stat band is three cards abreast at ≤34rem, ~76px against the 171px measured before (`today.css:261-300`). The plan leads the grid's working rows. |
| 6 | **Project and Goal mobile density** | **COMPLETE (FINISH-01)** | The GOAL half was already closed and this row's wording hid it: `/goals` renders `ProgressRow` (`.dh-mrow`), measured at 393×852 as 64px per row, nine per viewport. The PROJECT half closes here. `.dh-pcard` gains a phone composition using the SAME `display: contents` technique `.dh-ecard` already uses one section up — the head dissolves into the card's own grid so the mark takes a column and the title, the bar and the status line indent against it. Measured at 393×852: **180px → 112px per card, three → five fully visible** (5.65 by arithmetic), no horizontal overflow. Same DOM, same reading order, nothing moved by `order`. One element goes — the two-line description, the only prose on the card; the audit's four survivors (identity tile, title, the single most important metric, the status line) are all present and asserted. DS-05's recorded lesson about the previous phone block is applied rather than repeated: this one declares no layout model for the card's children, only their placement. |
| 7 | Priority flags and short dates on Today mobile rows | COMPLETE | `TodayScreen.tsx:379` renders the shared `PriorityIndicator` and only when set; `today.css:1130+` keeps the flag on a phone and drops only its tag; `relativePastLabel` is the short shared formatter. |
| 8 | Hide ⌘K and "/" hints on touch; FAB safe area; no clipped Add; scrolling strips with edge fades | **COMPLETE (FINISH-01)** | The scroll strips were done. The safe-area half closes here, in the two places it was broken. **The inset no longer eats the labels:** it is capped at what is left after every control has the width its label needs (`--dh-bottomnav-content-min`, five slots at 4rem), so a device that reports one gets it honoured as far as it can be and reclaimed below that. Measured with a 59px inline inset: "Projects" was 55px → 47px at 393 and 55px → 37px at 320; **no label truncates at either width now.** **The label's line is reserved:** the control is a two-row grid whose bottom track is the label, so the Capture control's taller 44px indicator grows the indicator band instead of pushing its own label at the bar's edge. Measured before: four labels 11px above the bar's bottom and "Add" 4px above it; **after: one clearance value for all five.** The residual is stated rather than papered over — at 150% OS text scaling five labels genuinely do not fit 393px and the longest still ellipsises, which is the same arithmetic the Diary week strip records for itself. |

---

## CONVERGE-01 — one workspace, eight modules

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | **Today on one 12-column grid, in the specified order** | **COMPLETE (#191)** | `TodayScreen.tsx:1194-1209` is one `.dh-today__grid`; `today.css:482-517` gives every band the same twelve tracks (stats 4·4·4, then 7·5, 7·5, 7·5), with the pair's spans data-conditional so a lone survivor takes the full width. Needs attention now sits ABOVE Goal progress (`TodayScreen.tsx:36-47`). Insights and `todayInsight` were deleted rather than restyled. Nothing is moved by CSS `order` — the DOM order is the phone order, the reading order and the tab order. |
| 2 | Shared collection header grammar across the eight modules | **COMPLETE (FINISH-01)** | All eight render `CollectionLayout`/`CollectionControls`, and the shared state breakdown is in use. The scope chip's weight is now reduced product-wide in the one place it is drawn (`segmented-filter.css`): `label-medium` rather than `label-large`, one space rung of inline padding rather than two, and the check glyph's whole reserved box removed from the LABELLED variant. The near-black fill is a recorded FINAL-UI decision and is untouched, and so is `min-height` — the hit area was never the complaint. The icon-only variant KEEPS its check, because there the label is visually hidden and the fill alone would be a tone with nothing beside it (AGENTS.md §15). Measured at 1440: the chip is 12px against a 26px page title, where it was `label-large` plus a glyph before. Asserted per collection in `collection-header.spec.ts`. |
| 3 | One list-container rule across People, Notes, Tasks, Project-detail task lists | **COMPLETE (FINISH-01)** | The rule is **bare rows on the page background, hairlines owned by the list**, and it is now written down in `DESIGN_SYSTEM.md` beside the collection-header anatomy ("One list container"). Three of the four already followed it — Notes, Tasks and Areas' `.dh-erow-list`; People was the single outlier and is migrated: `.dh-prow-list` loses its surface, its radius and its resting shadow, and the `forced-colors` border moves from the list to between its rows, because a box around the run would draw a container the list no longer has. **Project detail's list keeps its container, and the reason is documented and cited:** that is `.record-tabs__panel`, the record layout's own surface, drawn identically behind Overview, Links, Activity and Settings on every record and joined to its tab strip (M3-INT, `record-layout.css`). RECORD-01 already defines the deliberate opt-out (`data-surface="plain"`) and its condition — "a panel whose content already IS a surface does not draw a second" — which a task list does not meet. Removing it for one tab of one record would make that tab the odd one out among its own siblings. Recorded as the rule's one exception. |
| 4 | Project cards expose status, diagnostic, progress, identity | **COMPLETE (FINISH-01)** | #188 added the textual diagnostic so a meter's colour has a visible cause. The open question — "does the table become the default at ~40+ projects?" — is now **answered on the record** in [ADR-100](../decisions/ARCHITECTURE_DECISIONS.md): above forty records in the CURRENT scope, and only when the owner has not chosen, the collection opens as a table; an explicit `?present=` always wins at every size. One shared rule (`resolveCollectionPresentation`), one exported threshold, no new query (the lifecycle counts the header already prints supply the total). Two defects surfaced and fixed on the way: `ViewSwitcher` deleted the param for its first option, which made "Grid" a choice the owner could press and never keep (`alwaysWriteValue`), and `.dh-ptable__scroll` had no positioned ancestor for its absolutely-positioned descendants, so `?present=table` scrolled the whole DOCUMENT sideways at 390px — 1134px against a 390px client, reproduced on the clean tree. |
| 5 | Areas reframed on standing load, "Updated" not the primary metric | COMPLETE | `AreasCollection.tsx:273-284` — `openTasks` is the card's `metric`; `areaRelationshipLine` carries Projects and Goals; `updatedLabel` is demoted to secondary `meta`. No fabricated metrics. |
| 6 | **Notes as one writing workspace** | **COMPLETE (FINISH-01)** | The rail and the syntax-free excerpt pipeline were already done (UIX-04). All four remaining items close here. **"+ New note"** is back in the header's shared primary slot (`NotesCollection.tsx`), opening the same URL-backed drawer the empty state and global capture reach — one more door, not a second path — and, following People's `canQuickAdd` rule, only in the ACTIVE scope. **Two-line excerpts**: `notes.css` clamps `.dh-notes-list__excerpt` at the rendered measure; measured live, a full excerpt is 2 lines at 1280px (it was forced to 1 and ellipsised) and the clamp is what holds it to 2 at 393px, where the server's 180-character bound would otherwise draw four. **Tags as chips** through a new shared `TagChip`/`TagChipList` (`app/shared/ui/TagChip.tsx`), bounded at three per row with the remainder stated as a count and named in full — and the two module-local copies (`.dh-person-summary__tag`, `.dh-asset-summary__tag`, identical but for their radius) migrated onto it rather than a third being added. **The byte hint** is gone from `NoteContentForm`'s permanent help; the limit is unchanged and still enforced in both places, and the sentence now appears only at ≥90% of it or on the validation error. |
| 7 | People lead with relationship context | **COMPLETE (FINISH-01)** | The old evidence cited `PersonTimelineTab.tsx:131` — the RECORD's timeline tab, not the collection row. On the row, UIX-05/UIX-06 had already delivered reach (`mailto:`/`tel:`, rendered only where the data exists — UIQ-011's rule, cited at `PersonRow.tsx`), the rhythm column and identity colour. This pass adds the missing half: `connectionLine` (`PeopleCollection.tsx`) composes the row's one supporting line in the audit's order — last interaction, open commitments (linked Tasks still open, `@waiting` included), linked active Projects — with the identity context following rather than leading. Both counts come from `relationship.summary` inside the batched `listPersonRelationshipFacts` read the page already performs: no new query, no new repository method. "No shared history yet" is demoted, not deleted — `rhythm.quiet` drops it to the muted ramp and removes the dot (`card-family.css`), because a dot agrees with a state and "nothing recorded" is not one. Row height is now fixed rather than a floor: measured 72px desktop / 88px phone on every row, against 68/81/68/68 before. |
| 8 | Analytics: no verbose description in body text, readable values, hover readout, an overdue metric | **COMPLETE (FINISH-01)** | The verbose description was already visually hidden behind a short `caption`. The overdue metric is now the row's fifth figure (`analytics.ts` → the `overdue` entry) over a new bounded aggregate, `ReviewInsightRepository.countOverdueAtPeriodEnd` — ONE grouped statement over the two stored columns a live overdue check already reads (`d1-review-insight-repository.ts`), no table, no migration, no per-bucket query. `OverduePanel` (`AnalyticsScreen.tsx`) draws it through the SAME shared `TrendLine`, with the interactive readout and the CONVERGE-01 §I caption/enumeration split. The card's figure is the line's last reading by construction. The chart takes the status ramp's `warning` via `data-meter-status` — the product's one meter vocabulary, not a chart-local colour; the delta sentence stays the row's plain grey ("4 fewer than the previous period (12)"). Measured live at `/analytics`: 18 overdue, `+5` on the previous 7 days, `+14` on the previous 4 weeks, `+16` on the previous 12. Not wired into NOTIFY-01 — Today remains the one authority for "what needs you now". |
| 9 | Goals: area-first "+ New goal", one filter grammar | **COMPLETE (FINISH-01)** | The area-first constraint was already handled. The two stacked filter surfaces are now ONE `ViewTabs` rail in the filter band — `All · On track · Needs attention · Completed · Deleted` (`goalViewTabs`, `GoalsCollection.tsx`) — and the header's view slot is empty. This follows Projects rather than inventing a third convention: its four lifecycle scopes (`Active · All · Completed · Archived`) are already one rail in that band with the header slot free. It also settles the audit's own objection — "Deleted" is not a peer of "Active", but it IS a peer of "Completed", and it sits last where a rail's least-frequent destination belongs. Deleted keeps `?state=deleted` through `ViewTabOption.to` (CAL-02's per-tab path), so neither param learns about the other, and the same rail is drawn on the deleted scope so the way out is where the way in was. |

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

## What #190 and #191 closed

The two passes after #189 answered the sequencing this document set out, and in
the order it set out.

**CONVERGE-01 §1 had to come before MOBILE-02 §5**, because both reorder Today's
DOM and Today's phone composition *is* its DOM order. #190/#191 did the
reordering once, in the markup, and the phone composition fell out of it — which
is why both rows close together and neither needed a media query to move an
element. `today.css:449-454` records the constraint at the grid itself.

**MOBILE-02 §4 (swipe) needed a decision, and the decision was neither of the two
options this document listed.** It said the tray had to become an absolutely
positioned layer inside the row, or the row had to gain a wrapper and the grid
move up a level — and rejected the second as a change to the locked desktop
Task-row anatomy. The implementation takes a third route: the row keeps its grid
untouched and the CELLS move by `transform`. A transform does not participate in
layout, so every column's x-origin is identical during a swipe, after a swipe and
on a desktop that never swipes — the constraint DS-04 exists to protect, held
without touching the anatomy. `useTaskRowSwipe.ts:9-45` states it, and the
transform is applied only while `[data-swipe-edge]` exists so a permanent
identity transform never becomes a containing block for the row's anchored
popovers.

## Nothing is open

**Every row in the four tables above is COMPLETE.** The 16 August 2026 audit is
closed, on evidence, at FINISH-01.

The last eight rows closed in one package, in the order the register set out:

| Row | Closed by |
|---|---|
| CONVERGE-01 §8 | The overdue metric and its trend, over a new bounded aggregate that adds no table and no migration. |
| CONVERGE-01 §7 | The People row's connection line, and "No shared history yet" demoted rather than deleted. |
| CONVERGE-01 §6 | "+ New note", two-line excerpts, tag chips through a new shared `TagChip`, and the byte hint only when it matters. |
| CONVERGE-01 §9 + §2 | One `ViewTabs` rail on Goals, and the scope chip's weight reduced product-wide. |
| CONVERGE-01 §4 | [ADR-100](../decisions/ARCHITECTURE_DECISIONS.md) — the table as the default above forty, and an explicit choice that is never overridden. |
| MOBILE-02 §6 + §8 | The Project card at row scale on a phone; the bottom bar's labels fitting inside a safe-area inset. |
| CONVERGE-01 §3 | Bare rows as the one list container, with the record tab panel recorded as its single exception. |

### Two things this pass found that the audit had wrong

Both are recorded because a register that only ever agrees with its brief is not
being read against the code.

- **CONVERGE-01 §7 was narrower than it looked.** The row already reached
  (`mailto:`/`tel:`, only where the data exists) and already drew identity
  colour; the evidence line pointed at the Person RECORD's timeline tab rather
  than at the collection row. Corrected in Phase 0, closed in Phase 2.
- **The "Grid / Table vs Grid / List" finding was the opposite of drift.** The
  audit read two words for one control; they are the right words for two
  different drawings, and `presentation.ts` had already defined them as "not
  synonyms". Renaming either would have made a label describe something the page
  does not draw. Nothing was renamed; the vocabulary is now recorded in
  `DESIGN_SYSTEM.md` with the rule that a fourth word needs a fourth drawing.

### Three defects found by driving the product, not by reading it

None was in the audit, and each was reproduced on the clean tree before it was
fixed:

- **`?present=table` scrolled the whole DOCUMENT sideways at 390px** — 1134px
  against a 390px client, a WCAG 1.4.10 reflow failure. An absolutely-positioned
  descendant with no positioned ancestor was escaping the table's own scroll
  container. One `position: relative`.
- **`ViewSwitcher` made a conditional default's choice unexpressible.** It
  deletes the param for its first option, so pressing "Grid" produced a URL the
  new rule reads as "has not chosen".
- **The phone bar spent the safe-area inset out of its labels**, and reserved no
  line for them, so "Add" sat closest to the edge of the five.

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
