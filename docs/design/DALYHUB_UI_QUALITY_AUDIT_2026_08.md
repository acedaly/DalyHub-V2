# DalyHub UI Quality Audit — August 2026

> A systematic visual, responsive and interaction audit of every DalyHub module,
> conducted by driving the real application in a real browser — hover, focus,
> editing, phone widths, laptop widths, browser zoom and both appearances — not
> by reading source alone. The audit hunts the class of defect that survives
> implementation review and automated tests but is immediately visible to a
> person actually using the product: clipped controls, mobile interactions
> leaking into desktop, titles wrapping while width sits unused, editing states
> that collapse, and shared components drifting apart.
>
> **Method.** Chromium (Playwright) against the seeded local workspace, enriched
> with deliberately pathological records (a 55-character Area, a 108-character
> task title, a task title carrying an unbroken URL, long person/organisation
> names, a long meeting title, notes from one line to several screens). Every
> module surface at 320 / 390 / 400 / 700 / 900 / 960 / 1024 / 1120 / 1280 /
> 1440 / 1920, light and dark, plus per-component interaction passes (rest,
> hover, focus, editing, selected, disabled) and geometry probes (document
> overflow, elements past the viewport edge, controls clipped by ancestors,
> heading line counts vs available width).
>
> Evidence: [`assets/uiq-2026-08/`](assets/uiq-2026-08/) — before/after pairs
> named by finding id.

## How to read severity

Rules per the audit brief: **Critical** = interaction cannot be completed /
content inaccessible. **High** = clipped controls, broken responsive layout,
major desktop/mobile mismatch, serious editing defect. **Medium** = clear
inconsistency, poor hierarchy, unnecessary wrapping, awkward spacing.
**Low** = polish that does not materially affect use. Critical/High are fixed in
this change; Medium where the correction is clear, low-risk and shared; the
rest are recorded here so they are decisions, not omissions.

## The count

| Severity | Found | Fixed here | Recorded (deferred) |
| --- | --- | --- | --- |
| Critical | 0 | — | — |
| High | 3 (UIQ-001, 002, 003) | 3 | 0 |
| Medium | 12 (UIQ-004 … 014, 021) | 7 (004–010) | 5 (011–014, 021) |
| Low | 6 (UIQ-015 … 020) | 0 | 6 |

Three additional suspicions were investigated and **withdrawn** with evidence
rather than recorded: the saturated dark navigation pill (a documented
deliberate `primary-container` deviation), a "missing" drawer scrim (present at
the specified 32%), and 200% zoom behaviour (correctly degrades to the phone
layout). Withdrawing checked non-findings is part of the audit — the next one
should not re-litigate them.

---

## Findings

### UIQ-001 — Desktop hover exposes the mobile swipe tray behind list rows

- **Surface:** every swipe-enabled task row — Today → My day, Tasks list; any
  future list passing `swipeActions`.
- **Severity:** High. **Category:** interaction / mobile-leaking-into-desktop /
  dark mode.
- **Viewport / state:** any fine-pointer width — hover (light and dark; dark is
  worse because dark `primary-container` is far stronger).
- **Observed:** pointing at a row paints large `primary-container` slabs down
  the row's trailing edge — the *touch* swipe tray showing through — with the
  tray's own duplicate action labels interleaving the real hover actions, which
  read as overlapping, half-clipped buttons. Screenshot: a desktop row growing
  a full-height purple "Complete | Plan today | Clear" rail with a stray
  clipped fragment at the card edge.
- **Expected:** desktop hover shows the M3 8% state layer and the row's quick
  actions. The touch tray — a gesture accelerator for coarse pointers — never
  paints on a device whose pointer can hover.
- **Root cause:** two invariants meeting. `CardSwipeTray` renders whenever
  `swipeActions` is present (SSR-safe, by design) and sits *behind* the card
  surface (`z-index: 0` vs the surface's `1`), relying on the surface being
  opaque. `.dh-card-collection--list .dh-card:hover` then replaces the opaque
  card background with `color-mix(in srgb, on-surface 8%, transparent)` — a
  translucent wash — so the hovered surface stops covering the tray. The
  selected state had the second half of the same fault available to it via its
  bleed shadows.
- **Shared impact:** the one shared Card; every list collection.
- **Fix:** (a) the tray is `display: none` under `(hover: hover) and (pointer:
  fine)` — the gesture hook never fires there, so the tray was dead weight with
  leak potential; (b) row hover/selected surfaces mix over
  `--md-app-color-surface-card` instead of `transparent`, so the surface over
  the tray stays opaque under every state, present and future. Visual result is
  identical (the mix resolves to the same colour the eye saw over the group
  surface).
- **Evidence:** [`uiq-001-002-before-today-hover.png`](assets/uiq-2026-08/uiq-001-002-before-today-hover.png) · [`uiq-001-002-before-tasks-hover.png`](assets/uiq-2026-08/uiq-001-002-before-tasks-hover.png) · [`uiq-001-before-dark-hover.png`](assets/uiq-2026-08/uiq-001-before-dark-hover.png) → [`uiq-001-002-after-today-hover.png`](assets/uiq-2026-08/uiq-001-002-after-today-hover.png) · [`uiq-001-002-after-tasks-hover.png`](assets/uiq-2026-08/uiq-001-002-after-tasks-hover.png).

### UIQ-002 — Invisible hover-action rail permanently consumes a third of the row

- **Surface:** shared Card list rows (Today → My day at any two-column width,
  Tasks, and every list passing `quickActions`).
- **Severity:** High. **Category:** responsive / space usage / typography.
- **Viewport / state:** fine-pointer devices, most visible on Today at
  1200–1440px — rest state.
- **Observed:** at rest, three labelled buttons ("Complete", "Plan today",
  "Clear") sit at `opacity: 0` but **in flow**, reserving ~200px + gap of every
  row. On Today's ~580px primary column that is 34% of the row: the body is
  squeezed to ~292px, so metadata chips wrap onto a third line for ordinary
  Area names (ragged 63px/83px row rhythm) and long titles wrap while a third
  of the row sits invisibly reserved. The invisible buttons also remained
  hit-testable at rest (opacity alone does not remove pointer targets).
- **Expected:** row content owns the row at rest. Hover/focus reveals the
  actions without moving anything — geometry stays stable — and controls that
  are not visible are not clickable.
- **Root cause:** `.dh-card__actions` is a normal flex sibling of the body with
  an opacity-only reveal, so its reserved width is the stability mechanism.
- **Shared impact:** the one shared Card; every list collection on desktop.
- **Fix:** on hover-capable fine pointers only, list-presentation actions
  become an overlay anchored to the row's trailing edge (absolutely positioned,
  vertically centred, on the row's own surface colour so covered content never
  bleeds through), and are `pointer-events: none` until revealed — deliberately
  not `visibility: hidden`, which would have made the concealed buttons
  unfocusable and dropped them from the accessibility tree, breaking direct
  Tab access on surfaces without a roving model. Geometry is *more* stable
  than before (nothing is reserved, nothing reflows), titles and metadata get
  the full row at rest, and rest-state hit-testing matches what the eye sees.
  Touch keeps the always-visible in-flow rail unchanged.
- **Evidence:** [`uiq-002-before-today-rest.png`](assets/uiq-2026-08/uiq-002-before-today-rest.png) (ragged three-line rows) → [`uiq-002-after-today-rest.png`](assets/uiq-2026-08/uiq-002-after-today-rest.png) (uniform two-line rows), plus the hover pair above.

### UIQ-003 — Renaming a record collapses the title editor to ~300px

- **Surface:** every record header (Area, Goal, Project, Task, Note, Person,
  Asset, Meeting, Review — the shared RecordLayout inline heading edit).
- **Severity:** High. **Category:** interaction / editing geometry.
- **Viewport / state:** desktop widths — editing state.
- **Observed:** activating the title to rename swaps a full-width heading for a
  ~301px input showing the tail of the name ("…scription Audit for Q3 2026"),
  clipping the text being edited while ~600px of the title row sits empty. A
  large layout jump in the single most common inline edit.
- **Expected:** the editor takes the width the heading had — the title gets
  width before anything else does, *while being edited* as much as while being
  read.
- **Root cause:** the exact intrinsic-sizing family #127 fixed for the read
  state, one state deeper. `h1.record-title` is a flex item whose base size is
  its max-content contribution; in edit state that contribution is the
  editor frame's, which resolves to the browser's default `<input>` intrinsic
  width (~20ch). The input's own `inline-size: 100%` then faithfully fills a
  301px parent.
- **Shared impact:** all records; also any narrow container hosting the
  heading variant (Drawer).
- **Fix:** while the heading variant is editing
  (`.record-title:has(> .dh-inline-edit[data-editing])`), the title flex item
  grows (`flex: 1 1 auto`). Read-state layout is untouched — chips keep sitting
  beside short titles — because the rule binds to the editing state only.
- **Evidence:** [`uiq-003-before-title-edit.png`](assets/uiq-2026-08/uiq-003-before-title-edit.png) → [`uiq-003-after-title-edit.png`](assets/uiq-2026-08/uiq-003-after-title-edit.png).

### UIQ-004 — Grid cards shatter their heading when the title wraps

- **Surface:** shared Card `presentation="grid"` / `"board"` — Today →
  Continue working; collection loading skeletons; board fixtures.
- **Severity:** Medium (clearly user-visible on Today with any real project
  name of moderate length). **Category:** component consistency / typography.
- **Viewport / state:** any width where a grid card's title wraps — rest.
- **Observed:** the entity glyph orphans on a line of its own, the wrapped
  title starts beneath it, and the status chip dangles bottom-right at the end
  of the title's last line. One-line titles compose correctly, so adjacent
  cards render two different anatomies.
- **Expected:** icon beside the title's first line, status pinned to the
  heading row, title wrapping within its own column — the same anatomy at
  every title length.
- **Root cause:** the DS-14 dense-*row* treatment (`.dh-card__heading
  { display: contents }`, title as a `flex: 1 1 auto` item with a `12ch`
  floor, status `order: 9; margin-inline-start: auto`) is unscoped, so grid
  cards inherit a one-dimensional wrapping flex line: when the title cannot
  share the line, the flex wrap distributes icon / title / status onto
  separate rows.
- **Shared impact:** any current or future grid/board use of the shared Card.
- **Fix:** grid/board presentations lay the primary line out as the
  two-dimensional thing it is: `grid-template-columns: auto minmax(0, 1fr)
  auto` (icon · title · status), title wrapping inside its column, icon and
  status pinned to the first row. List rows keep the dense-row flex line
  unchanged.
- **Evidence:** [`uiq-004-before-grid-cards.png`](assets/uiq-2026-08/uiq-004-before-grid-cards.png) → [`uiq-004-after-grid-cards.png`](assets/uiq-2026-08/uiq-004-after-grid-cards.png).

### UIQ-005 — Meeting status pills are lowercase

- **Surface:** Meetings collection rows, Meeting record header + details.
- **Severity:** Medium. **Category:** component consistency / copy.
- **Observed:** "planned" / "completed" pills, lowercase — beside "Planned",
  "Active", "Draft" everywhere else. The raw domain enum is rendered as the
  label.
- **Expected:** the product's Sentence-case status vocabulary.
- **Root cause:** `MeetingsCollection` and the record detail pass
  `meeting.status` straight through instead of a derived label.
- **Fix:** one `meetingStatusLabel` derivation in `meeting-view.ts`, consumed
  by the collection row, the record header pill and the details list.
- **Evidence:** [`uiq-005-007-before-meeting.png`](assets/uiq-2026-08/uiq-005-007-before-meeting.png) → [`uiq-005-007-after-meeting.png`](assets/uiq-2026-08/uiq-005-007-after-meeting.png) (shared with UIQ-006/007).

### UIQ-006 — Meetings speak a different date language

- **Surface:** Meetings collection ("When: Aug 10, 2026, 7:00 PM"), Meeting
  record header.
- **Severity:** Medium. **Category:** component consistency.
- **Observed:** US middle-endian `Intl` output beside a product that
  everywhere else says "10 Aug 2026" (`formatCalendarDate`, urgency chips,
  card facts, reviews).
- **Root cause:** a module-local `Intl.DateTimeFormat("en", { dateStyle:
  "medium", … })` instead of the shared day-first formatting.
- **Fix:** format meeting start instants day-first ("10 Aug 2026, 7:00 pm")
  via the shared owner-timezone parts helper; one function in
  `meeting-view.ts`, used by list and record.
- **Evidence:** the UIQ-005 pair.

### UIQ-007 — Meeting details render as browser-default definition list

- **Surface:** Meeting record → Overview → Meeting details.
- **Severity:** Medium. **Category:** spacing / component consistency.
- **Observed:** bare `<dt>`/`<dd>` with user-agent indentation — labels above
  40px-indented values in a ragged column — beside records whose summaries use
  the shared label-over-value metadata grid. Reads as unstyled HTML.
- **Root cause:** the details `<dl>` never adopted the shared record metadata
  presentation.
- **Fix:** the meeting details list joins the shared record summary `<dl>`
  styling (label-over-value facts in a responsive grid), in `meetings.css`
  against existing tokens.
- **Evidence:** the UIQ-005 pair.

### UIQ-008 — Today's Waiting section hides its exit after the rows

- **Surface:** Today → My day → Waiting.
- **Severity:** Medium. **Category:** interaction / documented-pattern
  violation.
- **Observed:** "View all waiting (6)" renders *after* the last row — the
  bounded-section-preview rule says the link lives in the heading row, because
  a control after the last card of a roving collection stands between the
  keyboard user and the exit. Every sibling section (Anytime, Notes, Diary)
  already does this via `TodaySection`'s `action` slot.
- **Root cause:** the Waiting band simply never adopted the section's existing
  `action` slot.
- **Fix:** move the link into the heading row via the existing slot.
- **Evidence:** [`uiq-008-before-waiting.png`](assets/uiq-2026-08/uiq-008-before-waiting.png) → [`uiq-008-after-waiting.png`](assets/uiq-2026-08/uiq-008-after-waiting.png).

### UIQ-009 — Assets filter fields are three different controls in one row

- **Surface:** Assets collection filter bar.
- **Severity:** Medium. **Category:** forms / alignment.
- **Observed:** the Tag field renders as a large bare box (56px `.dh-input`
  default, no placeholder) beside 44px bordered selects; the search input is a
  third height again; baselines don't align across the row.
- **Root cause:** `.dh-assets-filters` styles its `select`s explicitly but
  leaves its text inputs on component defaults.
- **Fix:** the filter bar's inputs share the selects' height, border and
  radius; the tag input gains a placeholder naming what it filters.
- **Evidence:** [`uiq-009-before-assets-filters.png`](assets/uiq-2026-08/uiq-009-before-assets-filters.png) → [`uiq-009-after-assets-filters.png`](assets/uiq-2026-08/uiq-009-after-assets-filters.png).

### UIQ-010 — Reviews duplicates the period on every row

- **Surface:** Reviews collection rows.
- **Severity:** Medium (Low effort). **Category:** copy / hierarchy.
- **Observed:** each row prints the period twice — as the subtitle
  ("3 Aug 2026–9 Aug 2026") and again as a "Period:" metadata fact. A value
  stated twice is a value nobody reads.
- **Fix:** the subtitle keeps the period; the metadata keeps Updated /
  progress facts and drops the duplicate.
- **Evidence:** [`uiq-010-before-review-row.png`](assets/uiq-2026-08/uiq-010-before-review-row.png) → [`uiq-010-after-review-row.png`](assets/uiq-2026-08/uiq-010-after-review-row.png).

---

## Recorded, deliberately not fixed here

| Id | Surface | Severity | Finding | Why deferred |
| --- | --- | --- | --- | --- |
| UIQ-011 | Person record summary | Medium | Eight equally-weighted tonal pill actions (Call … Copy phone) compete; Quick Actions says a curated 2–3 with the tail in overflow/palette. | Which 2–3 lead is a product decision about the People module, not a mechanical correction; needs the owner's call. |
| UIQ-012 | Goals gallery | Medium | The goal status chip label "Open" sits top-right where every other card shows its ⋯ menu and reads as an *action* ("Open the record"), not a state. Alignment absence is also stated twice (chip + identical sentence). | "Open" is the shared goal-state vocabulary used across the module; renaming it (e.g. "Active") is a vocabulary decision that should change the record chip, filters and copy together. |
| UIQ-013 | All collections | Medium | View switchers render four ways: segmented control (Goals/Projects/Meetings/Notes), pill tabs under the header (People), pill row inside the pane header (Assets), menu + button row (Tasks). | Converging on one presentation touches every module's header; right change is a shared `viewSwitcher` slot standard — too broad for this audit PR. |
| UIQ-014 | Reviews header | Medium | "New Review" renders inline after the view pills instead of the pane-header primary slot every other module uses. | Same header-slot convergence as UIQ-013; fixing Reviews alone re-forks the pattern. |
| UIQ-015 | Task drawer / desktop | Low | "Mark as waiting" and "Edit details" are full-width tonal bars on a desktop drawer — phone-first weight on a pointer surface. | Deliberate shared mobile contract (`stickyActions` weight); a desktop-specific variant deserves its own design pass. |
| UIQ-016 | Capture sheet / desktop | Low | The centred desktop dialog keeps the sheet's 32×4 drag handle — a touch affordance with no meaning under a mouse. | Cosmetic; the handle is documented as decorative. Fix folded into a future Sheet polish item. |
| UIQ-017 | Editor toolbar / phone | Low | The horizontally scrollable toolbar gives no scroll affordance (a control simply sits half-clipped at the fold). | Contract-compliant (row scrolls in its own box); an overflow fade is polish for the editor's own roadmap item. |
| UIQ-018 | Tasks → Review Inbox | Low | "Back to Tasks" appears twice at equal weight (header action + empty-state primary). | Both placements are individually per-pattern; dropping one is a copy decision. |
| UIQ-019 | Notes filter bar | Low | Second filter row's tracks don't align with the first row's columns; Apply floats detached at the row end. | Native-select filter bars are already documented as the deliberate exception; alignment polish only. |
| UIQ-020 | Today Waiting rows | Low | Waiting previews render a bespoke light row (no checkbox, no chips) while My-day rows are full shared Cards — two anatomies for the same entity on one surface. | The bounded-preview pattern permits light slice rows; upgrading them to Cards is a Today design decision, not a defect fix. |
| UIQ-021 | Shared overflow menu (DS-12) | Medium | The panel always opens below its trigger with no max-height and no flip, so a long menu (a Tasks row carries ~12 items ≈ 600px) opened low on the screen runs past the viewport bottom. Recoverable — the menu is non-modal so the page still scrolls, and arrow-key focus scrolls items into view — but pointer users must notice that. | The right fix is placement logic in the ONE shared menu (measure the trigger rect, flip above / clamp height exactly as the shared Tooltip already does), which changes DS-12's tested behavioural surface — too much risk to fold into this audit PR. Recorded with the recommended approach. |

## Verified healthy (so the next audit starts ahead)

- **No horizontal document overflow** on any audited route at 320–1920px,
  both schemes (probe + screenshots).
- **Record read-state titles** hold one line wherever room exists (the #127
  contract held everywhere tested, including 55-char Areas at 1280).
- **Editor geometry** (EDIT-02): left-aligned, full surface, 90ch cap, table
  and long-URL content wrap correctly, light and dark.
- **Drawer, palette, search, capture, More-sheet** all sit within the
  viewport, scrim present (32% black), Escape/focus behaviour correct.
- **Dark appearance**: surfaces, cards, editor, menus and pills all resolve
  correctly from the one scheme; the saturated dark nav pill is the
  *documented* primary-container deviation, not a defect.
- **Phone (320/390)**: bottom bar, top bar, record layouts, capture sheet and
  collection control sheets lay out correctly; no clipped controls found.
- **Browser zoom 200%** degrades to the phone layout exactly as designed.
- **Keyboard**: roving Today list is one tab stop; revealed-on-focus actions
  become visible on focus-within; skip link and focus rings present on the
  audited paths.

## Shared root causes, named

1. **Opacity used as absence** — the hover rail was invisible but present
   (space, hit-testing); the tray was present but assumed covered. Both High
   findings are the same lesson: *what should not be interactable must not be
   laid out or hit-testable, and what covers something must be opaque.*
2. **Intrinsic sizing across state changes** — #127 fixed the read state;
   the edit state carried the identical fault one level deeper. A flex item's
   base size follows its content's max-content contribution *in every state*.
3. **Row rules leaking into non-row presentations** — the DS-14 dense-row
   flattening was written for rows and inherited by grids.
4. **Module-local derivations of shared vocabulary** — meetings rendering raw
   enums and private date formats where shared derivations exist.

## Regression coverage added

`e2e/ui-quality.spec.ts` — geometry/interaction contracts measured in a real
browser, failing against the pre-fix CSS:

- hovering a Today task row changes no row geometry, reveals actions **inside**
  the card bounds, and paints no tray on a fine-pointer device;
- at rest the row's body (title + metadata) owns at least ~90% of the card's
  inner width (the reserved-rail regression);
- invisible actions are not hit-testable at rest;
- entering title rename keeps the editor at least 60% of the title row's
  width (the collapse regression);
- a wrapping grid-card title keeps the icon on its first line and the status
  chip in the heading band (the shattered-heading regression).
