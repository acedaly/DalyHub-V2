# Record-screen convergence — the anatomy contract (2026-08, PR #131)

> **Status:** implementation record for PR #131. The *canonical* statement of the
> record anatomy lives in [`DESIGN_SYSTEM.md → Shared Record Layout`](DESIGN_SYSTEM.md#shared-record-layout-ds-02);
> this document holds the convergence's reasoning, its measured before/after
> evidence and its **deviation log**.

PR #130 converged the product at *collection* level. Record-detail screens were
the next systemic problem, and the August 2026 UI quality audit had already
recorded one instance of it as [UIQ-011](../product/PRODUCT_DEBT.md).

## What was actually wrong (measured, 2026-08-07, before)

Measured in a real browser at 1280×800 against the RECORD-01 fixtures. "Content
top" is the y-coordinate of the first row of working content; the viewport ends
at 800.

| Record | Header height | Summary height | Content top | Verdict |
| --- | --- | --- | --- | --- |
| Project | 158 | **505** | **860** | Tasks entirely below the fold |
| Goal | 156 | 371 | 724 | One row, barely |
| Area (active) | 156 | 240 | 593 | Tight |
| Area (quiet) | 156 | 240 | 593 | 240px spent saying "nothing here" |
| Note | 126 | 37 | 360 | Editor starts low for a writing surface |
| Meeting | 156 | — | 333 | Content is admin fields, not the meeting |
| Person | 158 | — | 335 | Content is a button launcher |
| Asset | 156 | — | 333 | Overview repeats the header |
| Review | 111 | — | 288 | Header says "Weekly" three times |
| Long title | **215** | 168 | 580 | Title wraps to 4 lines at 1280 |

The Project record — the reference case — stated the same fact repeatedly:

- **task counts 3×** — "9 of 24 tasks complete" (meter), "38% — 9 of 24 complete"
  (Progress field), "9 of 24 complete" (Tasks field);
- **health 2×** — header chip, then again inside the roll-up card;
- **Area 2×** — header metadata, then the summary grid;
- **state 2×** — the header status pill, then a "State: Active" field;
- **each of six health signals 2×** — once as a bullet, once as a grid field.

The quiet Area stated one absence **four times**: header metadata ("No goals
yet", "No Projects yet"), the roll-up line ("No active tasks yet."), a nested
outlined card ("This Area has no active goals, projects or tasks yet.") and a
bullet inside it — then a full icon+headline+description+button empty state
below the tabs.

## After

Same measurement, same fixtures, same viewport.

| Record | Header | Content top (before → after) |
| --- | --- | --- |
| Project | 158 → **71** | 860 → **317** |
| Area (active) | 156 → **71** | 593 → **317** |
| Area (quiet) | 156 → **71** | 593 → **288** |
| Goal | 156 → **124** | 724 → **553** |
| Note | 126 → **96** | 360 → **253** |
| Meeting | 156 → **96** | 333 → **273** |
| Person | 158 → **99** | 335 → **276** |
| Asset | 156 → **96** | 333 → **273** |
| Review | 111 → **87** | 288 → **264** |
| Long title | 215 → **185** | 580 → **398** |

No horizontal overflow and no tab wrapping at 320, 390, 700, 1024, 1280 or 1440.

## The contract

See [`DESIGN_SYSTEM.md → The record contract`](DESIGN_SYSTEM.md#the-record-contract)
for the canonical statement. In summary, one anatomy in this order on every
record — breadcrumb, identity (one row), context line, summary (only where it
earns its space), tabs, working content, secondary/admin later — with three
metadata tiers, a fold anchor at 1280×800, filters subordinate to tabs, compact
record-level empty states, and one mechanism per creation outcome.

## Shared primitives introduced or changed

| Primitive | What it does |
| --- | --- |
| `RecordHeader` | Identity is one row (glyph · title · status); `metadata` renders as a tight context line; `typeLabel` becomes its first entry |
| `RecordSummaryBar` | The compact derived-state band replacing per-module roll-up dashboards; takes the card surface only when it carries prose |
| `RecordDetails` + `recordTimestampItems` | The Settings-tab home for demoted administrative metadata |
| `RecordTab.surface` | `plain` for content that already brings its own surface (the Note's editor) |
| `EmptyState size="inline"` | The record-level absence: one calm line, no icon, no card |
| `SegmentedFilter` | Now renders the shared segmented control at a subordinate weight, always |
| `.dh-record-toolbar` | One tab-panel toolbar, replacing the identical private copies Projects and Areas had each grown |
| `healthSignals` | A Project's health reasons as summary-band signals, replacing `ProjectHealthPanel` |

`RecordLayout` itself was not rewritten.

## Fixed at source, beyond the layout

**Every editable record title in the product carried ~29px of dead space.** The
inline-edit shell mounts its `aria-live` status slot at all times (a live region
that unmounts as it gains content announces nothing) and the slot is
`inline-flex`, so while empty it still generated a line box — at a record
heading's inherited `line-height`, ~29px. Measured on the Project: a 45px
trigger inside a 74px heading, which dragged the entity glyph and the status
pill 15px below the title they sit beside. Taking it out of flow while `:empty`
removes the line box without unmounting the region.

**The Meeting capture strip sat under the global + FAB.** Collapsing the strip to
one row put its own Add button directly beneath the global capture button — two
capture affordances on the same pixels, the nearer one unclickable. The strip
now clears the FAB using the FAB's own tokens.

---

## Deviation log

Every departure from the contract, and every contextual default skipped, with
the reason.

| # | Record | Deviation / decision | Reason |
| --- | --- | --- | --- |
| 1 | Goal | Administrative timestamps demoted to the summary band's trailing `facts` line, not to Settings → Record details | A Goal has no Settings tab. Adding one purely to host two dates is an information-architecture change this PR is scoped out of; "later in the record" is the contract's other permitted answer. Recorded as **RECORD-02**. |
| 2 | Note | Same as above — "Created" is not rendered on screen at all; it lives in the Activity tab's `entity.created` event and the print byline | A Note has no Settings tab either, and a writing surface is the one record where a line of paperwork above the cursor costs the most. The fact is still in the product, in the record's own history. Recorded as **RECORD-02**. |
| 3 | Note | Tags render only when there ARE tags, rather than showing DS-14's designed absence ("No tags") | DS-14 §8 governs how absence *looks* where it is shown, not that it must always be shown. On a writing surface, "Tags: No tags" above every untagged note is a line of chrome earning nothing, and "Edit tags" is one press away in the overflow regardless. |
| 4 | Goal | The alignment **evidence** ("Recent contributing Tasks") stays in the summary rather than moving to the Projects tab | It is content the owner clicks into, not derived state; moving it into a tab would push the project rows down by exactly as much and gain nothing. Its heading is now rendered only when there is evidence. |
| 5 | Goal | On phone widths the Goal's summary is still the tallest of any record | Real content in a narrow column, not duplication. The contract's fold anchor is specified at 1280×800 and phones may recompose. Recorded as **RECORD-03**. |
| 6 | Person | The relationship word ("Builder") stays in the Summary rather than moving to the header context line, unlike organisation and role | It is a relationship record, and the relationship belongs beside the person's face. The header context line would have carried four items, over the 1–3 budget. |
| 7 | Task | No `typeLabel`, but also no breadcrumb to replace it | The Task record is hosted in the Drawer, whose own panel header already says "Task" and "Task record" directly above the title. The eyebrow was the third statement, not the only one. |
| 8 | Asset | `typeLabel` **kept** ("Vehicle") where every other record dropped it | It is a genuine subtype, not the entity type the breadcrumb carries. This is exactly the case the contract keeps `typeLabel` for. The duplicate "Type: Vehicle" metadata chip and the Overview's repetition were removed instead. |
| 9 | Asset | The primary history capture is chosen from the asset's own `assetType` | Not a context engine — one membership test on a field the record already has. Without it, either "Record service" is wrong for a licence or nothing is primary at all. |
| 10 | Task drawer | UIQ-015's full-width tonal "Mark as waiting" / "Edit details" bars left as they are | Explicitly recorded as a deliberate shared mobile contract that deserves its own design pass, and out of this PR's scope. |
| 11 | Person / DS-13 | The two "Relationship" stat tiles remain outlined cards inside the tab panel | Two stat tiles is a legitimate M3 pattern and the shared DS-13 component's job; the contract says to keep containers that genuinely aid comprehension. The *duplicated* fact between them and the panel below ("Last interaction") was removed instead. |
| 12 | Meeting | The Meeting tab still stacks two editors (agenda, notes), each with its own toolbar | The brief scopes editor redesign out ("don't redesign the editor itself beyond layout consistency"). The strip above them was the dominance problem, and that is what changed. |

### Contextual creation defaults

| Where | Outcome |
| --- | --- |
| Task created inside a Project | **Implemented** (already passed the route-param test — the form receives `projectId`). The header overflow's duplicate global-capture "New task" was removed, leaving one local path and the generic global +. |
| Goal created inside an Area | **Implemented** (the Drawer form already receives the Area id). Made unconditional in the tab toolbar, so the empty state no longer carries a duplicate copy of it. |
| Person context on meetings/notes/tasks/diary | **Already implemented** by ADR-060 and preserved unchanged; the entries moved from the Summary's pill row into the record header's overflow, carrying the same context. |
| Project context on notes/meetings/diary | **Already implemented**; kept in the header overflow, because these have no local path on a Project record. |

Nothing needed more than passing an existing route param or prop, so nothing was
skipped under that rule.

---

## Evidence

Before/after pairs are captured by
[`e2e/record-convergence-screenshots.spec.ts`](../../e2e/record-convergence-screenshots.spec.ts)
(opt-in: `CAPTURE_SCREENSHOTS=1 SHOT_STAGE=before|after`) into
[`assets/record-2026-08/`](assets/record-2026-08/), against the fixtures seeded
by [`e2e/seed-record-convergence.sql`](../../e2e/seed-record-convergence.sql).

| Surface | Before | After |
| --- | --- | --- |
| Project, 1280 | [before](assets/record-2026-08/record-before-project-1280.png) | [after](assets/record-2026-08/record-after-project-1280.png) |
| Project, 1440 | [before](assets/record-2026-08/record-before-project-1440.png) | [after](assets/record-2026-08/record-after-project-1440.png) |
| Project, dark | [before](assets/record-2026-08/record-before-project-dark-1280.png) | [after](assets/record-2026-08/record-after-project-dark-1280.png) |
| Project, phone | [before](assets/record-2026-08/record-before-project-390.png) | [after](assets/record-2026-08/record-after-project-390.png) |
| Area (active) | [before](assets/record-2026-08/record-before-area-active-1280.png) | [after](assets/record-2026-08/record-after-area-active-1280.png) |
| Area (no active work) | [before](assets/record-2026-08/record-before-area-quiet-1280.png) | [after](assets/record-2026-08/record-after-area-quiet-1280.png) |
| Goal | [before](assets/record-2026-08/record-before-goal-1280.png) | [after](assets/record-2026-08/record-after-goal-1280.png) |
| Note | [before](assets/record-2026-08/record-before-note-1280.png) | [after](assets/record-2026-08/record-after-note-1280.png) |
| Meeting | [before](assets/record-2026-08/record-before-meeting-1280.png) | [after](assets/record-2026-08/record-after-meeting-1280.png) |
| Meeting sticky capture | [before](assets/record-2026-08/record-before-meeting-capture-1280.png) | [after](assets/record-2026-08/record-after-meeting-capture-1280.png) |
| Person (full contact data) | [before](assets/record-2026-08/record-before-person-full-1280.png) | [after](assets/record-2026-08/record-after-person-full-1280.png) |
| Person (partial contact data) | [before](assets/record-2026-08/record-before-person-partial-1280.png) | [after](assets/record-2026-08/record-after-person-partial-1280.png) |
| Asset | [before](assets/record-2026-08/record-before-asset-1280.png) | [after](assets/record-2026-08/record-after-asset-1280.png) |
| Asset history actions | [before](assets/record-2026-08/record-before-asset-history-1280.png) | [after](assets/record-2026-08/record-after-asset-history-1280.png) |
| Review | [before](assets/record-2026-08/record-before-review-1280.png) | [after](assets/record-2026-08/record-after-review-1280.png) |
| Long title | [before](assets/record-2026-08/record-before-long-title-1280.png) | [after](assets/record-2026-08/record-after-long-title-1280.png) |

## Tests

- [`test/unit/record-layout/record-anatomy.test.tsx`](../../test/unit/record-layout/record-anatomy.test.tsx)
  — the shared primitives: one identity row, the context line, the summary
  band's earned container, demoted details, one summary region, plain-surface
  tabs.
- [`e2e/record-anatomy.spec.ts`](../../e2e/record-anatomy.spec.ts) — the layout
  half: the fold anchor on all nine records, long-title behaviour, tab wrapping
  and keyboard at laptop and phone, filter subordination, the Meeting capture
  strip at both heights, the Person action hierarchy, and contextual creation.
