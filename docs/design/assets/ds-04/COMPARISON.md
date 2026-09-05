# DS-04 — concept ↔ baseline ↔ final

The two concept images are in the repository root and are **not edited or copied
here**; this page names the reference for each comparison and puts the before and
after beside it.

- **Concept A** — `ChatGPT Image Aug 14, 2026 at 03_11_25 PM.png` (whole product;
  the phone Tasks screen is the third device in the bottom row)
- **Concept B** — `ChatGPT Image Aug 14, 2026 at 03_13_16 PM.png` (the Tasks
  screen is the bottom-left panel)

Every "final" shot below was captured with `node scripts/ds-04-shot.mjs`, against
the real dev server and the real seeded workspace. The captures (`baseline/` and
`final/` beside this page) were not committed to the repository; each section
names its shots in plain text and records what they showed.

---

## 1. The Tasks screen, 1440 (Concept B, bottom-left panel)

Shots: `baseline/tasks-1440-light.png` — the Tasks list at 1440, light, before
DS-04: a bordered, rounded panel on a grey page with a right-aligned metadata
run; `final/tasks-1440-light.png` — the same list after: hairline rows on a
white workspace under a column header.

**What changed**

- The list stopped being a bordered, rounded panel on a grey page. Rows are drawn
  on a **white workspace** separated by hairlines — the concept's ground for a
  flat list.
- A **column grid with a header** (`Task · Project · Date · Priority · Status`)
  replaced a right-aligned metadata run. Dates and project names now start on the
  same x down the whole list.
- **Project** is an identity dot and a name, not a 24px bordered tile with a
  chevron. **Date** is ordinary text in a bounded vocabulary —
  `20 days ago`, `3 months ago`, `Over a year ago` — rather than an unbounded
  `9722 days ago`, and overdue takes the colour without also taking a weight
  step. **Priority** is the priority's own dot and its tag, with no container.
- The **status pill is the only bounded coloured container left on a row.**
- The header band lost a line: the count sits beside the title instead of under
  it, which is ~30px of the calmest band on the page returned to the list.
- Quick capture became the row above the first task rather than a filled card.
- The group heading is muted small caps with a tabular figure and a rule, not
  crimson uppercase.

**Still different from the concept**

- The concept's row carries a drag handle; DalyHub's task order is a server sort
  and there is nothing to drag it into, so the column is not drawn.
- The concept's view switcher (List / Board / Calendar / Timeline) sits beside
  the title; DalyHub's three presentations are in the header's overflow, which is
  where UIX-01 put a decision made once a week.
- The concept draws `Filter` and `Sort` as two ghost buttons in the title row;
  DalyHub has one ghost "Filter & sort" control at the end of the tab row,
  because one shared sheet carries all sixteen filter dimensions at every width
  (TASKS-03). Every control that SHAPES the list — the saved-view trigger, its
  manage menu and the filter sheet — is clustered at that trailing edge, which
  is the concept's composition.
- The concept gives its metadata ~60% of the row and DalyHub gives it ~48%. The
  columns were widened toward it and stopped short deliberately (§31): the title
  is the only flexible track, so every pixel handed to metadata is one a long
  title loses.
- The concept has no group headings — it shows one flat scope at a time. DalyHub
  groups by due state, which is a real feature and not a difference to close.

## 2. Density at laptop widths

Shots: `final/tasks-1366-light.png` — the final list at 1366, light, the row
pitch unchanged at 46px; `final/tasks-wide-light.png` — the final list at
1920, light, the metadata columns fixed and the title taking the extra width.

**Measured, and worth stating plainly: the row PITCH did not change.** Both the
baseline and the final list run at 46px per row at 1440 — the row is the
completion control's 45px target plus a hairline, and DS-04 removed the block
padding that was on top of it rather than the target underneath it. The first
task starts 24px higher than it did (the header band lost a line, the column key
gave some of that back), which is about half a row.

So the laptop gain here is legibility and alignment, not row count. Reducing the
pitch further means giving the completion control a smaller target on a fine
pointer, which amends a documented departure (D18: the 45px one-line task row)
and the 44px assertions built on it — a design-system decision rather than a
Tasks one. Recorded as [DEBT-131](../../../product/PRODUCT_DEBT.md).

At 1920 the metadata columns stay fixed and the title takes the extra width —
metadata does not spread.

## 3. The phone (Concept A, "Tasks (Mobile)")

Shots: `baseline/tasks-390-light.png` — the phone list at 390 before: titles
cut to fourteen characters, project and priority dropped, solid purple scope
pills running off the edge; `final/tasks-390-light.png` — the same at 390
after, the row on two lines with quiet text tabs; `final/tasks-320-light.png` —
the final row holding the same composition at 320.

**What changed**

- The row is **recomposed, not squeezed**: title on line one with the full width,
  `● Project · Date` and the priority on line two. Titles are no longer cut to
  fourteen characters, and project and priority are no longer dropped entirely.
- The scope tabs are quiet text with a **pale accent capsule and an underline**
  for the current one, instead of solid purple pills running off the edge.
- No carets are drawn where there is no hover to reveal them; the value itself is
  the target, at the 44px floor.

## 4. Dark

Shots: `baseline/tasks-1440-dark.png` — the list at 1440, dark, before, the
panel sunk into the page beside the dark rail; `final/tasks-1440-dark.png` —
the same after, the workspace on the raised surface so the rail reads as a
frame.

The workspace takes the raised surface rather than the page's sunken one, so the
dark rail reads as a frame around a distinctly lighter working surface instead of
disappearing into it. Dividers, hover, selected, metadata and the status pill were
all re-checked in dark; the eight-pass axe sweep covers both appearances.

## 5. Row states

Shots, all final: `final/task-row-normal.png` — a row at rest;
`final/task-row-hover.png` — the hover surface; `final/task-row-long-title.png`
— a long title truncating in the only flexible track while the metadata columns
hold; `final/task-row-overdue.png` — the overdue date coloured, the completion
ring not; `final/task-row-completed.png` — the completed row muted and struck.

The overdue row's **completion ring is not crimson**. The date says the task has
slipped and the heading above says Overdue; a third, larger, colour-only
restatement on the control that finishes the task is alarm rather than
information. The completed row is muted and struck, and is not dimmed with
opacity — a 0.72 layer over the muted role composites below 4.5:1.

## 6. Selectors

Shots, all final: `final/priority-selector.png` — the priority menu, one line
per option with the current value ticked; `final/project-selector.png` — the
project menu at the menu rung, ending in the search hand-off;
`final/date-selector.png` — the date menu.

Baseline for comparison: `baseline/project-selector.png` showed the project menu
before — fifty candidates at 59px each, wrapping to three lines, in a menu the width of a
176px column.

Now: one line per option at the menu rung, so ~14 are visible instead of ~5; the
current value carries a tick as well as `aria-checked`; and the menu ends with
**Search all Projects and Areas…**, which hands off to the shared searchable
picker over the whole workspace.

## 7. Quick capture and selection

Shots, all final: `final/quick-capture-desktop.png` — quick capture as the row
above the first task at desktop width, not a filled card;
`final/quick-capture-mobile.png` — the same on the phone;
`final/bulk-selection.png` — rows selected in bulk with the selection state on
the list.

## 8. The Task Drawer

Shots: `baseline/task-drawer-light.png` — the drawer before: a lavender wash,
two nested white cards, full-width outlined buttons and a 28px radius;
`final/task-drawer-light.png` — the drawer after, light, hairline-separated
bands and word-sized buttons; `final/task-drawer-dark.png` — the same in dark.

The lavender wash is gone — product-wide, because a generated tonal step resolved
to `#f7f1ff` under every record in the product. The two nested white cards became
hairline-separated bands, the full-width outlined buttons became buttons the size
of their words, and the panel's radius came down from 28px.

## 9. Cross-module regression

Shots, both final: `final/regression-today.png` — Today after DS-04;
`final/regression-projects.png` — Projects after DS-04.

Both still render the generic `Card` and are unchanged in structure. What changed
for them is what changed product-wide: the drawer surface, the phone tab rail's
capsule, and dates further back than a week reading as a date rather than a
count-up. Recorded as [DEBT-128](../../../product/PRODUCT_DEBT.md).
