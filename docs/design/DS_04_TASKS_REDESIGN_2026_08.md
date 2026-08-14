# DS-04 — Tasks redesign and visual convergence (2026-08)

> **The question this pass answers is not "does Tasks use the design system?"** —
> DS-01 to DS-03 settled that. It is: **does the running product now look like the
> two concept images in the repository root?**
>
> Concept references (do not edit):
> `ChatGPT Image Aug 14, 2026 at 03_11_25 PM.png` (whole product, incl. mobile Tasks)
> `ChatGPT Image Aug 14, 2026 at 03_13_16 PM.png` (bottom-left panel: the Tasks screen)

Screenshots: [`assets/ds-04/`](assets/ds-04/) — `baseline/`, `row-prototype/`,
`interactions/`, `final/`, plus [`COMPARISON.md`](assets/ds-04/COMPARISON.md).

---

## 1. What the concept actually specifies

Read off the concept's Tasks panel rather than inferred:

| Element | The concept draws |
|---|---|
| Workspace ground | **White** (`#fefefe`). The Today dashboard's ground is grey (`#eff0f4`) with white cards on it — a flat list gets white, a card grid gets grey |
| List | Rows directly on the page. **No panel, no radius, no border box, no shadow** |
| Structure | A **column grid** with a header: `Task · Project · Due · Priority · Status` |
| Separation | A hairline between rows, nothing else |
| Row | drag handle · circle checkbox · title · project (dot + name) · due (plain text) · priority · status · `⋯` |
| Project | A ~6px coloured **dot** and the name. No tile, no border, no chevron |
| Due | `Today`, `21 May` — plain text, never a chip |
| Header band | Two bands only: title + controls, then quiet text tabs with a purple underline |
| Purple | The one primary button, the current tab's underline, selected state. Nothing else |
| Phone | Two-line row — title on line 1; `● Project` and priority on line 2 |

## 2. The ten measured differences (baseline, 2026-08-14)

Each was read off `assets/ds-04/baseline/`, not asserted.

| # | Current | Target |
|---|---|---|
| 1 | Rows sit in a white 16px-radius bordered panel on a grey page | Rows on a white page, hairlines only |
| 2 | No column structure — a ragged right-aligned metadata run, no header | A labelled column grid |
| 3 | Project drawn as a 24px bordered rounded tile + name + chevron | A coloured dot and the name |
| 4 | Dates relative and UNBOUNDED, in bold crimson — "20 days ago", "9722 days ago" | Bounded at every distance, and the colour without the weight bump |
| 5 | Quick capture a 60px filled card with two permanent buttons | The next row: same inset, same height, a hairline |
| 6 | 600-weight titles competing with equally saturated pills | Title at row weight; hierarchy from quieter metadata |
| 7 | Group headings uppercase crimson (`OVERDUE 15`) above every band | Muted small-caps heading, a figure, a rule |
| 8 | Phone truncates titles at ~14 characters; project and priority dropped | Two-line row; title gets the full width |
| 9 | Phone scope tabs oversized filled pills, overflowing the viewport | Pale accent capsule + underline for the current tab only |
| 10 | Drawer washed lavender with two nested 16px white cards | Neutral raised surface, no nested cards |

Plus two selector defects (§15/§16 of the brief, non-negotiable): the project menu
was unsearchable, 59px per option, wrapped to three lines and needed six screens of
scrolling for a bounded fifty; and the current value was indistinguishable from a
hovered one.

## 3. Convergence checklist

| # | Current → Target | Implementation | Proof | Status |
|---|---|---|---|---|
| 1 | Cardified list → rows on the page | `TaskRow`/`TaskList`; `.dh-collection--tasks` takes `--dh-color-surface` | `final/tasks-1440-light.png` | ✅ |
| 2 | No columns → a shared column grid | `--taskrow-columns` declared once on `.dh-tasklist`, inherited by header + rows | `final/tasks-1440-light.png` | ✅ |
| 3 | Project tile → identity dot | `.dh-task-parent__mark` becomes an 8px dot on `currentColor`; glyph dropped | `final/task-row-normal.png` | ✅ |
| 4 | "9722 days ago" → "Over a year ago" | `relativeCalendarDate` adopts Today's bounded ladder; overdue keeps the colour, loses the weight | `final/tasks-1440-light.png` | ✅ |
| 5 | Capture card → capture row | quickadd takes the row inset, height and hairline; buttons on hover/focus | `final/quick-capture-desktop.png` | ✅ |
| 6 | Heavy titles → row weight, quiet metadata | `--dh-text-row-*` on the title, `--dh-text-meta-*` muted on cells | `final/task-row-normal.png` | ✅ |
| 7 | Crimson group heading → calm | `TaskGroup`: muted small caps, tabular count, hairline | `final/tasks-1440-light.png` | ✅ |
| 8 | Truncated phone titles → two-line row | container query at 34rem; title clamps to two lines | `final/tasks-390-light.png` | ✅ |
| 9 | Filled phone tabs → pale capsule + underline | `view-tabs.css` phone block | `final/tasks-390-light.png` | ✅ |
| 10 | Lavender drawer + nested cards → neutral, de-carded | `drawer.css` surface; `.dh-task-record` scope | `final/task-drawer-light.png` | ✅ |
| 11 | Selector: wrapping, 59px rows, no current-value mark | one-line options at the menu rung, widened, visible tick | `final/project-selector.png` | ✅ |
| 12 | Selector: bounded set with no way out | `searchAction` → the shared searchable picker | `final/project-selector.png` | ✅ |
| 13 | Header band 154px of chrome | count inline with the title; bands tightened | `final/tasks-1440-light.png` | ✅ |
| 14 | Overdue crimson checkbox ring | ring stays neutral; the date and the heading carry the state | `final/task-row-overdue.png` | ✅ |
| 15 | Filter & sort an outlined capsule; view chrome mid-row | ghost control, and every list-shaping control clustered at the trailing edge | `final/tasks-1440-light.png` | ✅ |
| 16 | Metadata block ended at ~55% of the width (concept: ~38%) | columns widened to 13/7.5/4.5/7rem; ends at ~52% | `final/tasks-1440-light.png` | ✅ |

## 4. Visual convergence decisions

**The workspace is white, and that is a real decision.** Both concepts distinguish
a card dashboard (grey ground) from a flat list (white ground). DalyHub painted the
sunken app background under both, which is correct under cards and wrong under
rows — a hairline-separated list on a tinted ground has neither the cards'
separation nor the white page's calm. Scoped to `.dh-collection--tasks`; the
narrow shell fix DS-04 §29 allows.

**Row height is the completion target and nothing else — and that is also the
limit of the density gain.** `--dh-row-height` at compact resolves to
`max(2.75rem, 45px)`, which the shared `.dh-check-circle-target` inside the row
is already sized to. Block padding on top made a 54px row for a 45px reason, so
the padding went.

MEASURED, and stated because the checklist would otherwise imply more: the row
PITCH is 46px in both the baseline and the final capture at 1440, so the number
of visible rows is essentially unchanged. What the laptop gained is 24px at the
top of the list and a column alignment it did not have. Going tighter means a
smaller completion target on a fine pointer, which amends D18 and the 44px
assertions built on it — a design-system decision rather than a Tasks one, and
[DEBT-131](../product/PRODUCT_DEBT.md).

**Breakpoints are the LIST's width, not the window's.** The Board and Time Sectors
presentations render the same list inside ~380px columns. A window media query gave
them the full desktop grid, whose fixed columns alone are 480px — a horizontal
overflow of the document. `container-type: inline-size` on `.dh-tasklist` fixes
that, and incidentally fixes the quieter case where a 1024px viewport leaves the
list ~740px, less than a 768px phone gets with no rail.

> A container query styles a container's **descendants** and can never style the
> container itself. `--taskrow-columns` is therefore re-declared on
> `.dh-tasklist__columns, .dh-taskrow` inside each query, never on `.dh-tasklist`.
> Declaring it on the container is silently dropped, which produced a seven-column
> grid addressed by three-column area names and a Sectors view whose titles had no
> track to sit in.

**Quiet is a property of the paint, never of the hit area.** The first row pass
set `min-block-size: 0` on the inline triggers to make them read as text; that
produced 16×18px targets on a row of four adjacent editors — `target-size`
serious, on every task. The trigger is invisible until hover **and** 24×24
minimum, filling its grid track so the whole column is the target.

**One pill survives.** Priority is a coloured dot and a tag; the dot keeps the
priority's own foreground colour, and only the two-character tag is muted — muting
the whole indicator turned four priorities into four identical grey dots and cost
the list the signal it is triaged by.

## 4b. Three defects the CHECKS found and the eye did not

Recorded because each is a class of mistake a visual pass invites, and none of
them was visible on a screenshot.

**The shared trigger's negative margin.** `.dh-inline-edit__trigger` carries
`margin-inline: -8px` so its text aligns optically with the static value it
replaces — right in a wrapping metadata run, and the root cause of every
"partially obscured" `target-size` violation on a column grid, because each
trigger overhung its neighbours by 8px on each side. Measured: a 24px date
button at x=774 under a priority trigger starting at x=790, in a cell starting
at 798. Two earlier fixes (a height floor, then a width floor) only moved the
symptom; the margin was the cause. In a grid the CELL aligns.

**The pinned header slid under the top bar.** `.dh-topbar` is
`position: sticky; top: 0` at a higher z-rung, and `.dh-collection__sticky` was
also `top: 0`, so on a scrolled page the collection's header — including the
page's one primary action — went behind 56px of bar. axe reported it as "New
task" reduced to 114.5×6.5px of unobscured target, which is what a control
hidden behind another control looks like to a machine. It predates DS-04, it
affects all twelve collections, and it is one declaration.

**Opacity is not a way to say "done".** A 0.72 layer over the muted role
composites to 4.28:1 on white and over the overdue role to 4.16:1 — both below
1.4.3, both introduced by this pass, neither visible as a defect. The completed
row already says it is finished twice, in the title and the status column.

The generalisation, now [D43](DALYHUB_DESIGN_SYSTEM.md#5-documented-departures-from-stock-material):
**an affordance may be invisible until hover; it may never be smaller than
24×24, and it may never be dimmed below contrast.** Quiet is a property of the
paint.

## 5. What DS-04 deliberately did NOT do

- **It did not adopt the row in Today, Projects or search.** They still render the
  generic `Card`. The row is shared code wired into one module, so the module being
  redesigned is the only one whose rows moved.
- **It did not turn the inline select into a combobox.** A text filter inside
  `role="menu"` is a different ARIA pattern; the bounded set stays a menu with
  typeahead, and the escape hatch is the shared searchable picker.
- **It did not redesign the shell.** Two shell-adjacent paints changed: the Tasks
  workspace ground, and the drawer surface + radius (which is product-wide, because
  a lavender panel under every record is the §35 violation it is).
- **It did not keep the swipe tray.** It went with the Card; both its actions
  remain reachable by pointer, keyboard and screen reader.

## 6. Evidence

- `assets/ds-04/baseline/` — the pre-DS-04 set, including every selector open.
- `assets/ds-04/row-prototype/` — the row iterated against the concept.
- `assets/ds-04/interactions/` — selectors, capture, selection, Drawer.
- `assets/ds-04/final/` — the final set the checklist above cites.
- `assets/ds-04/COMPARISON.md` — concept → baseline → final, side by side.
- `scripts/ds-04-shot.mjs` — the shooter, so the set is reproducible.
