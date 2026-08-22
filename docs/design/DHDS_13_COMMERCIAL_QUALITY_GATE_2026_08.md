# DHDS-13 — the commercial-quality gate

> **Status:** delivered, 21 August 2026. This phase **closes the broad
> design-convergence programme**. See [§18](#18-what-happens-after-dhds-13).
>
> **Binding inputs:** [`AGENTS.md`](../../AGENTS.md),
> [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md),
> [`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md),
> [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md),
> [`DHDS_01_WORK_PACKAGE.md`](DHDS_01_WORK_PACKAGE.md), and the DHDS-02, -03…07,
> -08, -09, -10 and -11 records.

---

## 1. Executive verdict

**B — nearly commercial.**

DalyHub reads as one product. Twenty-two surfaces were inspected adversarially
against the real application, in both appearances, across ten viewport widths,
and the design system holds: one row grammar, one collection header, one
floating-surface layer, one motion grammar, one token vocabulary, an automated
accessibility surface that is clean on every route, and no horizontal overflow
anywhere in the matrix. There is no fundamental design-system failure left, and
nothing found in this pass was a data-loss or workflow-blocking defect.

It is a **B rather than an A** for one honest reason and one honest reservation.

The reason: this pass found **four P1 defects that a shipping product should not
have had** — a two-character priority mark sliced mid-glyph on *every* task row
at *every* phone width; a Project name reduced to the single character "C…" on
Today's hero row at 393px, the width most current handsets report; the product's
primary action rendered as a **blank violet block** at every tablet width; and
one page (`/plan`) that sat on no gutter at all, its title hard against the
top bar and flush to the viewport edge on a phone. All four are fixed and
guarded. But their *existence* after five convergence phases is the finding: they
are all defects that only appear when you measure, and none of them was
measurable by the checks the programme had.

One more, found in **review** rather than in the audit, is worth naming here
because of how it was found: the Diary's phone week strip had been laid out in
254 pixels rather than the 288 its own stylesheet's arithmetic assumes — a
card's padding nesting inside a page gutter that had already been applied — so
its seven day targets drew at 35px on the narrowest phone. It looked entirely
correct: seven equal days, nothing clipped, nothing overflowing. A spec that
asserts a number caught it. That is the clearest single argument for the rule
this document ends on (§18), and it arrived in time to prove itself.

The reservation: two known P2s remain open by deliberate choice rather than by
oversight (§5, §15), and one of them — the Plan queue drawing a selection
checkbox and a completion checkbox side by side, unlabelled and eight pixels
apart — is a *clarity* defect on a flagship surface whose correction is a
product decision about how Plan's queue works, not a quality fix. Closing this
gate at A while a row can be mis-clicked into completing work the owner meant to
schedule would be inflating the number.

A is reachable from here and the distance is small. It is normal product work,
not another design phase.

---

## 2. Audit method

Everything below was measured against the **running application** — the
development-auth server over the real seeded D1, the same runtime the E2E gate
drives. No mockups, no component gallery, no synthetic fixtures.

| Pass | What it did | Scale |
|---|---|---|
| Module sweep | Every module at 1440 light, then dark | 18 routes × 2 |
| Desktop matrix | Today, Tasks, Plan, Projects, Goals, Analytics, Views | 1440 / 1280 / 1100 / 900 |
| Phone matrix | Every module at 393; flagships at 320, 360, 375, 430 | 17 routes |
| Geometry probes | Cell/label/clip-box widths read from the live DOM | ~40 measurements |
| Interaction | Capture, palette, Search, row menu, date/project/priority pickers, filter popover, drawer, completion + undo, focus order | ~25 states |
| Automated a11y | axe-core, WCAG 2.0/2.1/2.2 A+AA + best-practice, light **and** dark | 17 routes × 2 |
| Overflow sweep | Clipped-text detector over every element on every route at six widths | 18 routes × 6 |

The geometry probes are what found three of the four P1s. A screenshot at 1×
shows "P1"; a `getBoundingClientRect()` comparison against the box that clips it
shows that the "1" is four pixels wider than the box it is painted in. **That is
the method's one real lesson, and §18 turns it into a rule.**

---

## 3. Baseline scorecard

Scored 1–10 against the dimensions in the brief, from the pre-fix inspection.
The numbers are the audit's, not a summary of the previous phases' claims.

| Module | Hierarchy | Density | Interaction | Consistency | Polish | Mobile | A11y | Resilience | Feedback | Trust | **Overall** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 8 | 8 | 8 | 9 | 8 | **5** | 9 | 6 | 8 | 8 | **7.7** |
| Tasks | 9 | 9 | 9 | 9 | 9 | **6** | 9 | 8 | 9 | 9 | **8.6** |
| Inbox | 9 | 8 | 9 | 9 | 8 | 7 | 9 | 8 | 8 | 9 | **8.4** |
| Plan | **4** | 6 | 7 | **4** | **4** | **3** | 8 | 6 | 7 | 6 | **5.5** |
| Projects | 8 | 8 | 8 | 7 | 7 | 7 | 9 | 8 | 8 | 8 | **7.8** |
| Areas | 8 | 8 | 8 | 7 | 7 | 8 | 9 | 8 | 8 | 9 | **8.0** |
| Goals | 7 | 7 | 8 | 8 | **6** | 7 | **7** | 7 | 8 | 8 | **7.3** |
| Habits | 8 | 7 | 8 | **6** | 8 | 7 | 9 | 7 | 8 | 8 | **7.6** |
| Notes | 8 | 8 | 8 | 8 | 8 | 8 | 9 | 7 | 8 | 8 | **8.0** |
| Diary | 7 | 6 | 8 | **6** | 7 | 7 | 9 | 8 | 8 | 8 | **7.4** |
| Reviews | 8 | 7 | 7 | **6** | 8 | 7 | 9 | 8 | 8 | 8 | **7.6** |
| Meetings | 8 | 7 | 8 | 7 | 8 | 7 | 9 | 8 | 8 | 8 | **7.8** |
| People | 8 | 7 | 8 | 8 | **6** | 7 | 9 | **5** | 8 | 7 | **7.3** |
| Assets | 7 | 7 | 8 | **5** | **6** | 7 | 9 | 7 | 8 | 8 | **7.2** |
| Analytics | 7 | 6 | 8 | 8 | 8 | 8 | 9 | 7 | 8 | 8 | **7.7** |
| Views | **4** | 6 | 8 | **3** | **4** | 6 | 9 | 7 | 8 | 7 | **6.2** |
| Search / palette | 8 | 8 | 9 | 9 | 7 | 8 | 9 | 8 | 8 | 8 | **8.2** |
| Settings | 9 | 8 | 8 | 9 | 9 | 8 | 9 | 8 | 8 | 9 | **8.5** |
| Capture | 8 | 8 | 9 | 8 | **5** | 8 | 9 | 8 | 9 | **6** | **7.8** |
| Navigation shell | 9 | 9 | 9 | 9 | 8 | 9 | 9 | 8 | 8 | **6** | **8.4** |
| Floating surfaces | 8 | 8 | 9 | 8 | **5** | 8 | 9 | 9 | 8 | **6** | **7.8** |
| Record drawer | 6 | 6 | 8 | 8 | 7 | 8 | 9 | **6** | 8 | 8 | **7.4** |
| **Product mean** | **7.5** | **7.4** | **8.2** | **7.4** | **7.0** | **7.0** | **8.9** | **7.4** | **8.0** | **7.7** | **7.6** |

The three lowest cells are the three findings that mattered: **Plan** (a page off
the frame), **Views** (a collection that never converged), and **Mobile on
Today** (metadata destroyed by truncation).

---

## 4. Findings

### P0 — commercial blocker

**None.** No data-loss path, no inaccessible core flow, no mutation that falsely
reports success, no unusable screen. Completion, capture, inline edit, undo,
navigation and search were all driven end to end and all behave.

### P1 — clearly below commercial quality (4 found, 4 fixed)

| # | Finding | Evidence |
|---|---|---|
| **P1-1** | **A task row's priority mark is sliced mid-glyph at every phone width.** The priority cell hugged its content 4px *short* of the mark, and `.dh-inline-select__label` — `overflow: hidden` so a long Project name can ellipsise — chopped the digit. "P1" rendered as "P" plus half a stroke. | MEASURED on `/tasks` and `/today` at 320/360/375/393/430: **10 of 10 sampled rows sliced at every width.** Desktop never affected (the cell is a grid column with slack). |
| **P1-2** | **A Project name reduced to one character on Today's hero row at 393px.** Today's Now card holds the task row one container deeper than the plain list and carries the long end of the date ladder ("Over a year ago", 105px), so the row kept the date and paid for it out of the Project. | MEASURED at 393: the project label painted **28px of a 99px name** — "C…". D32 already records a fact ellipsised to two letters as a fact that has stopped carrying information. |
| **P1-3** | **The product's primary action renders as a blank violet block at every tablet width.** The rail's Capture button collapsed with `font-size: 0`; every DalyHub icon is authored `width="1em"`, so the plus collapsed with the label. | MEASURED at 820 and 900: a 32×36 violet button containing a **0×0 svg** and a 0×0 label. The band is 768–1023px. |
| **P1-4** | **`/plan` sits on no page frame.** Its `h1` was flush to the pane's left edge and hard against the underside of the sticky top bar; at 393px it touched the viewport edge while its own supporting line was indented beside it. | MEASURED against `main.dh-pane` on sixteen routes: fifteen at gutter **40/24/15–16** horizontally and 24–45 vertically; Plan alone at **0, 0** at every width. |

### P2 — noticeable quality defects (11 found, 8 fixed, 3 open)

| # | Finding | Status |
|---|---|---|
| **P2-1** | **Every modal scrim in the product is a third of its specified strength.** All eight consumers painted `color-mix(… var(--dh-color-scrim) 32%, transparent)` over a token that *already* carries 0.32 (light) / 0.58 (dark), so the shipped wash was **10.3% / 18.6%** against the 32% `DESIGN_SYSTEM.md` specifies. | **Fixed** |
| **P2-2** | **The global Capture sheet has no elevation.** It took `--dh-elevation-raised`, which is `none` by construction; `--dh-elevation-modal`'s own definition names this component ("a dialog, a sheet, a drawer"). A white panel with a 6%-alpha hairline, over a 10% scrim, on a white page. | **Fixed** |
| **P2-3** | **Views never converged on the row grammar.** Every result was its own rounded surface slab 4px from the next, its title drawn as an accent-coloured `EntityLink`, and its date `on-surface` at weight 500 — so the loudest object in each row was the date and the record's own name was subordinate to it. | **Fixed** |
| **P2-4** | **A Person's contact detail is chopped mid-glyph.** The link is `display: flex` for its 24px target floor, and `text-overflow: ellipsis` does not apply to a flex container's anonymous text item — the declaration was present and silently inert. | **Fixed** — the only hit in a clipped-text sweep of every element on 18 routes at six widths. |
| **P2-5** | **The trailing `⋯` is drawn at rest on two collections.** The Projects table declared `data-dh-action-context` and a comment saying the button fades in "rather than being drawn on forty rows at rest" — and never carried the class that makes it true. `EntityRow` (the Areas list) declared neither. | **Fixed** |
| **P2-6** | **Assets is the only collection with a tray around its filter band** — a bordered `surface-subtle` box holding two already-bordered inputs, whose right edge stopped 14px short of the shared "Filter & sort" control, so the button read as having fallen out of the toolbar. | **Fixed** |
| **P2-7** | **The Plan queue draws a selection checkbox and a completion checkbox side by side, unlabelled, 8px apart.** `task-signals.css` states the invariant this breaks in its own words: *"A row shows one of them at rest."* Ticking the wrong one completes work the owner meant to schedule. | **Open** — §15 |
| **P2-8** | **Search's empty query offers nothing.** The body restates the placeholder ("Search across everything in your workspace") where every reference product shows recent records. | **Open** — §15 |
| **P2-10** | **A terminal Task was called overdue.** `isClosed` on the cross-view surface asked `completed` alone, so a **cancelled** Task and a **Someday / Maybe** Task with passed due dates read "Overdue — due 6 Jul 2026" — and, once this phase gave the date a colour, read it in the danger red beside their own "Cancelled" status word. Raised in review on this branch. | **Fixed** — the label half predated the phase; the colour is what made it shout |
| **P2-11** | **The Diary's week strip is starved by an inset nobody measured.** `.dh-diary-toolbar` is a bordered card with its own 16px inline padding, and it sits inside `.dh-collection__filters`, which has already applied the page gutter — so the seven days were laid out in **254px, not the 288px the stylesheet's own arithmetic assumes**, and each day drew 35.4px instead of the 41 that comment records. Seven equal touch targets, all of them below any floor, on the narrowest phone. Found in review, by running the spec that asserts it. | **Fixed** — the strip now spans the card's inner width; MEASURED 40px at 320, 48 at 375, 50 at 390, 56 at 430 |
| **P2-9** | **Weekly Planning draws two days at phone width.** The phone tier is supposed to show one day plus a rail to move between them; Saturday *and* Sunday are both drawn, at 100% and at 200% zoom. Found in the audit's own phone capture and **already failing on `main`** — `plan-responsive.spec.ts` :100 and :194 both expect 1 and receive 2. | **Open** — pre-existing; **DEBT-196** |

### P3 — minor polish (documented, not chased)

1. **A hugging metadata label paints ~4px narrower than its own content on a
   phone**, so a Project name loses its last one or two characters even when the
   row has 50px of free space beside it. MEASURED on `/today` at 393: painted
   94.7px against a 99px need, consistently, on every row. Not reproducible on
   desktop (fixed grid track: painted 89, need 89). Six candidate CSS fixes were
   tried and none moved it; the mechanism is an intrinsic-sizing quirk in a
   hugging flex chain, and unpicking it means restructuring the cell.
   → **DEBT-193**.
2. **A 1px gutter difference below `md`.** `.dh-pane-header__title` carries an
   optical pull-back that Today's and Plan's own titles do not, so a collection's
   `h1` sits one pixel left of theirs. Sub-visual; recorded so the E2E gutter
   assertion's 1px tolerance is explained rather than slack.
3. **A seam in the sticky band at x≈1298** where the collection's filter column
   meets the shared controls column: two bottom rules of different weights meet
   mid-band. Visible at 4× on `/views`; not visible at 1×.
4. **The Goal pane's dead space.** The Goals list column ends ~260px above the
   panel beside it at 1440.
5. **Plan's board occupies the top ~390px of a 1000px viewport**, leaving the
   largest single dead region in the product below it.
6. **Analytics opens on five KPI figures, four of which are `0`** in a
   low-activity period. Each carries an explanation, which is why this is P3 and
   not P2, but it is still a new user's first impression of the module.
7. **The Task drawer is a wall of controls** — Checklist, Project-or-Area,
   Mark as waiting, Dependencies, Add blocker, Scheduled, Due, four date
   shortcuts, Repeat, Priority, When, Horizon, Doing this — and two of its
   labels ("Horizon", "Doing this — Yes, active") read as schema rather than as
   the product's own nouns.
8. **Habits is the one collection whose header carries a tagline** ("Build
   consistency without turning life into a game") where every other collection
   carries a count.

---

## 5. Fixes implemented

Seventeen changes. Eleven are CSS-only corrections, five touch components or
presentation code, and one corrects a governing document. **Every one of them is
a repair to something the repository already decided** — none introduces a new
visual decision, and that is deliberate (§17).

| Fix | File | What it repairs |
|---|---|---|
| Priority cell reserves its mark (`min-inline-size: 3.5rem`) | `task-list.css` | P1-1 |
| The due-date yield tier moves 19rem → **21rem** | `task-list.css` | P1-2 |
| The rail's Capture label is visually hidden instead of `font-size: 0` | `premium.css` | P1-3 |
| `.dh-plan` takes `--dh-shell-gutter` and the compact header's block start | `plan.css` | P1-4 |
| `.dh-plan__rail-day` becomes a containing block | `plan.css` | P1-4's second half — the day rail's `position: absolute` hidden labels escaped the scroll strip and pushed the document 13px sideways at 320px the moment the page took a gutter |
| Eight scrim consumers paint `var(--dh-color-scrim)` directly | 8 stylesheets | P2-1 |
| `.dh-sheet` takes `--dh-elevation-modal` | `sheet.css` | P2-2 |
| Views takes `.dh-row-list`/`.dh-row` geometry, an `on-surface` title, and a date coloured only when genuinely overdue (a real `overdue` field on the wire, not a string test) | `views.css`, `ViewsWorkspace.tsx`, `views-presentation.ts`, `views-contract.ts` | P2-3 |
| A Person's contact value truncates in its own box | `PersonRow.tsx`, `card-family.css` | P2-4 |
| The reveal contract is wired up on the Projects table and `EntityRow` | `ProjectsTable.tsx`, `EntityRowList.tsx` | P2-5 |
| The Assets filter tray is removed | `assets.css` | P2-6 |
| `.dh-urgency` bounds itself and its label ellipsises | `task-signals.css` | the drawer's overdue chip escaped the panel by 2px at 1440 and 1100 |
| The Goal pane names the surface its scroll strip covers | `goals.css` | a ~20px grey block painted on the white detail panel at both ends of a rail that does not scroll |
| The Goal list stops being a second `region` named "Goals" | `GoalWorkspace.tsx` | the single automated a11y violation anywhere in the product |
| A terminal Task is no longer overdue on the cross-view surface | `views-presentation.ts` | P2-10 |
| The Diary's phone week strip spans its card's inner width | `diary.css` | P2-11 |
| The constitution's rail statement is corrected | `AGENTS.md` | §6 still asserted "the navigation rail is DARK, in both appearances" — superseded by FINAL-UI's amendment to D35, and the last document still saying it |

### Highest-value improvements, in order

1. **The scrim.** One token-level correction repaired the modal separation of
   the Drawer, the Inspector, the Command Palette, Search, Settings, the phone
   navigation sheet and global Capture — seven surfaces, one line each. Before,
   the page behind an open Capture sheet was fully legible; after, it reads as
   modal in both appearances.
2. **The priority mark.** One floor removed a sliced glyph from every task row
   on every phone. It is the most-repeated object in the product.
3. **Views.** A whole collection stopped looking like a different application.
4. **The Plan frame.** The one page that did not sit on the shared origin now
   does, at every width, with zero horizontal overflow.

---

## 6. Module-by-module assessment

**Today** — the composition is right: one current decision, a short plan,
schedule and progress as context, reporting below the fold. It survives 37 tasks
without becoming a dashboard. Its weakness was entirely mobile (P1-1, P1-2), and
both are fixed. Residual: a ~190px dead region in the left column at 1440 where
the two columns disagree about height, and the empty "Goal progress" panel is a
large card holding one sentence.

**Tasks** — the interaction benchmark, and it earns it. 44px rows, four aligned
metadata columns, inline edit on hover with the carets latent at rest, quick-add
at the head of the list, an undoable completion with a real toast, saved views,
grouping and a filter popover that clamps and scrolls. Credible beside Todoist on
density and beats it on inline editing. What Todoist has that this does not is a
faster natural-language capture; that is feature work, not quality.

**Inbox / Upcoming** — the same surface with a different view; consistent, calm,
good empty state.

**Plan** — was the worst page in the product and is now composed. The frame fix
is the whole story. Its remaining issues are proportion (a board using 39% of
the viewport height) and P2-7.

**Projects** — the table is dense and readable, and progress is truthful
(`—` for "no tasks yet", never a fake 0%). The progress bar's colour carries
health, which is a *second* signal beside the percentage rather than the only
one, but the health vocabulary is not stated anywhere on the page.

**Areas** — correctly quieter than Projects: no progress bar (an Area never
completes), a relationship line, one figure. Now that the `⋯` is latent, it is
the calmest collection in the product.

**Goals** — honest about measurement: "No measurement" rather than 0%, and the
empty state asks for a target instead of drawing an empty ring. The list/detail
split works. Fixed: the stray grey block and the duplicate landmark.

**Habits** — clean, and its empty state is the best-written in the product ("a
habit is a behaviour you want to practise — not a task you must not forget").
Header grammar is the outlier (P3-8).

**Notes / Diary / Reviews** — Notes reads as documents: title, snippet, tags,
date, no chrome. Diary's day rail and type filters are good; its empty state is
the one that is left-aligned and uncarded where every other module's is a centred
panel. Reviews is quiet and correct.

**Meetings** — empty in the fixture, so agenda/decisions/commitments could not be
judged against real content. The empty state is good. **This is the one module
this gate could not fully assess**, and it is stated rather than scored
optimistically.

**People** — warm rather than CRM-like: initials avatars, organisation, "last
spoke", no pipeline vocabulary. Fixed the chopped contact detail. Residual: "No
shared history yet" repeated on every row is four identical sentences on a
four-person list.

**Assets** — structured and legible; obligations lead ("2 obligations due soon"
with a date), status and location follow. Fixed the bespoke filter tray.

**Analytics** — genuinely visual and, unusually, *explained*: every figure
carries a sentence and every chart carries its range and its reading in words.
Not a KPI graveyard. Its weakness is the zero-heavy opening in a quiet period.

**Views** — repaired (P2-3). It now reads as the same product as Tasks.

**Search and the command palette** — fast, grouped, counted, keyboard-hinted,
with match highlighting and a footer that teaches the keys. Two different
highlight treatments (accent text in titles, tinted background in snippets) is
the one inconsistency. The empty query is P2-8.

**Settings** — the quietest module and the most obviously finished. Grouped
sections, real radios, tinted selection (never a tonal slab), plain-language
descriptions under every choice.

**Capture** — opens instantly, focuses the title field, submits on Enter,
exposes date/priority/parent as quiet metadata rather than a form, and hides
everything else behind "More task options". Repaired: it now reads as modal.

**Navigation shell** — invisible during work and recognisably DalyHub. The rail
is 216px of labelled destinations at desktop, 68px of glyphs at tablet, and a
five-slot bottom bar with a central Capture on a phone. Repaired: the tablet
Capture glyph.

**Floating surfaces** — one anchored layer, one menu anatomy, correct viewport
clamping (the filter popover has a 6206px scroll height and clamps to the
viewport with internal scrolling at both 1000px and 700px tall), Escape and
outside-click everywhere, focus restored to the trigger. Repaired: the scrim and
the sheet's elevation.

**The record drawer** — the composition that has moved least since DS-04, and it
shows. P3-7.

---

## 7. Desktop assessment

Inspected at 1440, 1280, 1100 and 900.

- **No horizontal overflow at any width on any route**, before or after.
- The rail collapses to glyphs below 1024 (D38) and the page frame keeps its
  origin: gutter 40 at ≥1024, 24 at 768–1023, 15–16 below.
- Content does not stretch: the collection caps at the content measure and
  start-aligns, so at 2560 the title, the filter bar and the first row still
  share one vertical line.
- The two-column compositions (Today, Goals) recompose to one column below
  ~1100 rather than compressing.
- **The remaining desktop weakness is vertical dead space, not width.** Today's
  left column, the Goals list column and Plan's board all end well above the
  content beside them. None is a defect of composition; all three are surfaces
  whose content is shorter than the frame expects.

## 8. Mobile assessment

Inspected at 430, 393, 375, 360 and 320.

- The bottom bar is right: five slots, labels visible, Capture central and
  raised, safe-area padded, `More` opening the full registry-driven sheet.
- The phone header shows the wordmark on Today and the page title elsewhere,
  which is the correct home-versus-inner distinction.
- Task rows recompose to two lines rather than squeezing; at ≤19rem of list the
  date yields to the Project; at ≤12rem the metadata takes a row of its own and
  wraps. Nothing is hidden and nothing is clipped — **now**.
- **Both P1s were mobile**, and both were invisible to a screenshot at 1×.
- 320px is genuinely supported: three routes verified with zero overflow after
  the Plan fix (which the gutter change surfaced — a pre-existing latent escape
  of a `position: absolute` label from a scroll strip).
- Touch targets: the automated pass is clean, and the row's own contract
  (24px of ink, 44px of hit area via a pseudo-element) is intact.
- **The one target the audit missed on its first pass was the Diary's week
  strip** (P2-11), and the reason is worth keeping: nothing about it *looked*
  wrong — seven equal days, no clipping, no overflow — so it survived the visual
  matrix. It was caught by a spec that asserts a number, which is the whole
  argument of §18's one rule, arriving in time to prove itself.

## 9. Dark-mode assessment

Audited as a first-class appearance, not as token parity — every flagship module,
the floating surfaces and the phone were captured with `prefers-color-scheme:
dark` genuinely emulated.

> **A method note worth recording.** The first capture pass set the appearance
> cookie only, and produced a complete set of "dark" frames that were entirely
> light: the shell's loader prefers the owner's stored preference (`system`) over
> the first-paint cookie, so the media query is what actually decides. A
> dark-mode audit that sets the wrong lever proves nothing, and this one nearly
> did.

- Text, borders and tints are correctly re-toned rather than inverted; no washed
  body text, no glowing surfaces, no saturated tint blocks.
- Charts read: the overdue series holds its warning hue and the completion series
  its accent, both legible on the dark canvas.
- The near-black rail sits *under* the page rather than over it (D35), which is
  the intended recessed relationship, though the two values are close enough that
  the boundary depends on its hairline.
- Selection is a tint in both appearances (D46), never a tonal slab.
- **The one genuine dark failure was the scrim**, and it was worse in dark than
  in light: a dark sheet over an undimmed dark page has almost no tonal
  difference to work with, and 18.6% was not enough to supply it. At the token's
  authored 58% the sheet is unambiguous.
- axe is clean in dark on every route (colour-contrast rules enabled).

## 10. Accessibility assessment

- **Automated:** axe-core with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa` and `best-practice`, on 17 routes × 2 appearances × 2 viewports.
  **One violation in the entire product** (`landmark-unique` on `/goals`), now
  fixed. Zero contrast violations in either appearance.
- **Manual:** focus is visible on every control reached by Tab and the order
  follows the page; the palette, Search, the Capture sheet and the drawer all
  trap focus and restore it to their trigger on Escape; the completion control
  keeps focus after an optimistic mutation, so a keyboard user does not lose
  their place mid-list; icon-only controls carry names ("More actions for
  <record>", "Complete <task>", "Select <task> to place on a day").
- **Not colour alone:** priority carries a flag *and* the word; overdue carries
  the word "Overdue" or a relative phrase *and* the colour; selection carries
  `aria-current`/`aria-pressed`, a tone inversion *and* a weight step.
- **The brief's warning applied honestly:** "technically passes axe" is not the
  claim here. The two mobile P1s were both accessibility-adjacent — a clipped
  glyph and a one-character label are both failures of *legibility* — and axe
  reported neither. That is the gap §18 turns into a rule.

## 11. Interaction and performance assessment

- Capture opens immediately with the title field focused; Enter submits.
- `⌘K` opens the palette focused; typing "kitchen" returned five grouped,
  counted, highlighted results across four record types.
- Completing a task removes the row, decrements both the page count and the
  group count, and raises an undoable toast naming the task. The row does not
  jump; focus stays on the control.
- Inline edits on a row commit without opening the record: date, priority and
  Project each open an anchored picker in place. **Counted unnecessary record
  openings for the brief's five cases: zero.**
- The filter popover clamps to the viewport and scrolls internally rather than
  running off the bottom (verified at 1000px and 700px tall).
- Toasts are used for the reversible and consequential (completion, with Undo)
  and *not* for the self-evident (priority, date, title, sort) — which is the
  rule §29 asks for, already in force.
- No performance defect was found, and **no performance number is claimed**: the
  only timings available here are wall-clock measurements polluted by the
  harness's own waits, and a vibe is not a measurement (AGENTS.md §16).

## 12. Resilience and stress assessment

The seeded workspace is a genuine stress case, not a demo: **93 Tasks** (19
overdue), **83 Projects**, 11 Areas, 6 Goals, long titles ("Consolidate every
household insurance, utili…"), sentinel dates (1 Jan 2000 → "Over a year ago"),
records with no metadata at all (a Person with a name and nothing else), and
collections with two items and with sixty.

- Long titles truncate in their track and never widen the grid.
- Sparse records degrade to whitespace rather than to placeholders — Areas with
  no Projects read "Ready for its first Project" rather than "0 Projects".
- A 60-task Project shows `100%` and a 0-task Project shows `—`, not `0%`.
- **What broke under stress was metadata, not layout**: P1-1, P1-2, P2-4 and the
  drawer's urgency chip are all "a real value is longer than the box the
  composition assumed", and all four are fixed.

## 13. Competitive comparison

Used for standards, not imitation.

| Dimension | DalyHub | Reference bar |
|---|---|---|
| List density and inline editing | **At or above.** Four aligned metadata columns at 44px with hover-latent inline editors; Todoist opens a row to change a project | Todoist |
| Capture speed | **Below.** Fast and focused, but no natural-language parsing ("tomorrow 5pm #Work") | Todoist |
| Calm and restraint | **At.** No badges, no streaks, no manufactured urgency; one expressive moment per page | Things, Apple |
| Writing surface | **At.** Notes reads as documents; content dominates | Craft, Notion |
| Cross-module coherence | **At**, after this pass. One row grammar, one header, one floating layer | Notion |
| Explained analytics | **Above.** Every figure carries a sentence and every chart its reading in words | most of the category |
| Mobile as a designed surface | **At**, after this pass. A composed bottom bar and a genuinely recomposed row, not a squeezed desktop | Todoist, Things |
| Goal→action connection | **At.** Truthful measurement, linked Projects, no vanity rings | Griply |
| Onboarding a sparse workspace | **Below.** A new owner meets several zeroes before meeting a next action | Todoist |

---

## 14. Post-fix scorecard

Only cells with evidence of change are moved. **No cell was raised because a
phase shipped.**

| Module | Hierarchy | Density | Interaction | Consistency | Polish | Mobile | A11y | Resilience | Feedback | Trust | **Overall** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Today | 8 | 8 | 8 | 9 | 8 | **8** | 9 | **8** | 8 | 8 | **8.2** |
| Tasks | 9 | 9 | 9 | 9 | 9 | **9** | 9 | **9** | 9 | 9 | **9.0** |
| Inbox | 9 | 8 | 9 | 9 | 8 | **8** | 9 | 8 | 8 | 9 | **8.5** |
| Plan | **7** | 6 | 7 | **8** | **8** | **8** | 8 | 7 | 7 | **7** | **7.3** |
| Projects | 8 | 8 | 8 | **8** | **8** | 7 | 9 | 8 | 8 | 8 | **8.0** |
| Areas | 8 | 8 | 8 | **8** | **8** | 8 | 9 | 8 | 8 | 9 | **8.2** |
| Goals | 7 | 7 | 8 | 8 | **8** | 7 | **9** | 7 | 8 | 8 | **7.7** |
| Habits | 8 | 7 | 8 | 6 | 8 | **8** | 9 | 7 | 8 | 8 | **7.7** |
| Notes | 8 | 8 | 8 | 8 | 8 | 8 | 9 | 7 | 8 | 8 | **8.0** |
| Diary | 7 | 6 | 8 | 6 | 7 | **8** | 9 | 8 | 8 | 8 | **7.5** |
| Reviews | 8 | 7 | 7 | 6 | 8 | 7 | 9 | 8 | 8 | 8 | **7.6** |
| Meetings | 8 | 7 | 8 | 7 | 8 | 7 | 9 | 8 | 8 | 8 | **7.8** |
| People | 8 | 7 | 8 | 8 | **8** | **8** | 9 | **8** | 8 | **8** | **8.0** |
| Assets | 7 | 7 | 8 | **8** | **8** | 7 | 9 | 7 | 8 | 8 | **7.7** |
| Analytics | 7 | 6 | 8 | 8 | 8 | 8 | 9 | 7 | 8 | 8 | **7.7** |
| Views | **8** | **7** | 8 | **9** | **8** | **8** | 9 | 7 | 8 | **8** | **8.0** |
| Search / palette | 8 | 8 | 9 | 9 | **8** | 8 | 9 | 8 | 8 | 8 | **8.3** |
| Settings | 9 | 8 | 8 | 9 | 9 | 8 | 9 | 8 | 8 | 9 | **8.5** |
| Capture | 8 | 8 | 9 | 8 | **8** | 8 | 9 | 8 | 9 | **9** | **8.4** |
| Navigation shell | 9 | 9 | 9 | 9 | **9** | 9 | 9 | 8 | 8 | **9** | **8.8** |
| Floating surfaces | 8 | 8 | 9 | 8 | **8** | 8 | 9 | 9 | 8 | **9** | **8.4** |
| Record drawer | 6 | 6 | 8 | 8 | 7 | 8 | 9 | **8** | 8 | 8 | **7.6** |
| **Product mean** | **7.9** | **7.4** | **8.2** | **8.0** | **8.0** | **7.9** | **8.9** | **7.8** | **8.0** | **8.3** | **8.1** |

**7.6 → 8.1.** Consistency, polish and trust carry most of the movement, which is
the right shape for a convergence gate: nothing new was designed, and things that
were quietly wrong stopped being wrong.

One score moved for an uncomfortable reason. **Diary's Mobile 7 in the baseline
table was too generous, and it is left standing** rather than retro-corrected:
that is what the audit actually scored, and it scored it by looking. The strip
had 35px targets at the time. Its post-fix 8 is the honest number, so the
before-and-after understates the movement by exactly the amount the audit's own
method missed — which is a more useful record than a tidier one.

Plan is deliberately still the lowest flagship at **7.3**. Its frame is fixed;
its proportion and its queue's two checkboxes are not.

---

## 15. Remaining debt

**Raised by this phase:**

- **DEBT-193** — a hugging metadata label paints ~4% narrower than its own
  content on a phone (P3-1). *P3.*
- **DEBT-194** — the Plan queue shows a selection control and a completion
  control side by side, breaking `task-signals.css`'s own stated invariant
  (P2-7). *P2.*
- **DEBT-195** — Search's empty query offers no recent records (P2-8). *P2.*
- **DEBT-196** — Weekly Planning draws two days at phone width, where the tier
  says one (P2-9). *P2.*
- **DEBT-197** — a Task ROW still paints a cancelled Task's passed due date in
  the overdue colour (P2-10's other half). *P3.* `InlineTaskDate` derives urgency
  from calendar arithmetic alone and takes no Task, so honouring commitment there
  means adding a semantic prop to a shared control rendered on seven surfaces —
  and deciding, product-wide, whether `--overdue` means "this date has passed" or
  "you still owe this". Pre-existing, and by §17's own rule a decision this gate
  raises rather than takes. Raised rather than fixed because it is **pre-existing
  and already has two failing tests on `main`**; giving it an entry stops it
  living only inside DEBT-179's undifferentiated red set.

**Deliberately not fixed here, and why:**

- **DEBT-194** needs a decision about how Plan's queue *works* — a surface
  permanently in selection mode is the thing that makes two controls adjacent,
  and hiding either one changes what the queue can do. A quality gate is the
  wrong place to make that call, and the honest cost of leaving it is stated in
  §1 rather than hidden in a table.
- **DEBT-195** needs a data source for "recent records" that does not exist as a
  search-side concept. That is feature work, which §46 excludes.
- **DEBT-193** resisted six candidate fixes; the mechanism is an intrinsic-sizing
  quirk and the correction is a cell restructure. The visible cost is one or two
  characters of a Project name on a phone, which does not justify the risk.

**Closed by DHDS-08…13:** see [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md).
This phase closes nothing it did not itself prove closed, and re-states DEBT-179
honestly in §17 rather than declaring the E2E set healthy.

---

## 16. Visual evidence index

`docs/design/assets/dhds-13-2026-08/` — **73 frames**, all captured from the real
application by
[`e2e/dhds-13-commercial-quality-screenshots.spec.ts`](../../e2e/dhds-13-commercial-quality-screenshots.spec.ts)
(`CAPTURE_SCREENSHOTS=1`).

| Set | Files | What it proves |
|---|---|---|
| `desktop-1440-light-*` | 18 | Every module, the primary appearance |
| `desktop-1440-dark-*` | 12 | Every flagship, genuinely dark |
| `desktop-1280/1100/900-light-*` | 12 | The narrow matrix; 900 is the tablet glyph rail |
| `phone-393-light-*` / `-dark-*` | 15 | The phone, both appearances |
| `phone-320-light-*` | 3 | The narrowest supported width |
| `floating-light-*` / `floating-dark-*` | 10 | Capture, palette, the engaged row, the date picker, the filter popover |
| `state-*` | 3 | An empty collection, a record panel, an undoable toast |

Read `floating-light-capture.png` and `floating-dark-capture.png` first: they are
the clearest single before/after in the set, and the "before" is the same file in
this branch's history.

---

## 17. Validation results

| Gate | Result |
|---|---|
| `pnpm run format:check` | pass |
| `pnpm run lint` | pass |
| `pnpm run typecheck` | pass |
| `pnpm run scheme:check` | pass — tokens.css and scheme.ts match the generator |
| `pnpm run icons:check` | pass — 11 icon assets match canonical geometry |
| `pnpm run dhds:check` | pass — 0 direct machinery references |
| `pnpm run build` | pass |
| `pnpm run test:unit` | pass — **6,390** tests in 451 files (24 new) |
| `pnpm run test:kernel` | pass |
| `pnpm run e2e:partitions:check` | pass — 117 spec files across 12 partitions, heaviest 16.1 min |
| `e2e/dhds-13-commercial-quality.spec.ts` | pass — 12/12 |
| Focused E2E for every changed area | see below — **no failure is this branch's** |

**Regression boundary added:**
[`test/unit/ui/dhds-13-commercial-quality.test.ts`](../../test/unit/ui/dhds-13-commercial-quality.test.ts)
(15 source-side checks) and
[`e2e/dhds-13-commercial-quality.spec.ts`](../../e2e/dhds-13-commercial-quality.spec.ts)
(12 geometry checks — sliced marks at five phone widths, the Project stub at 393,
the Capture glyph across the tablet band, the gutter across eight routes at four
widths, and drawer containment at two), plus
[`test/unit/views/views-overdue-commitment.test.ts`](../../test/unit/views/views-overdue-commitment.test.ts)
(9 cases pinning which Task states can still be late — added in response to
review, and asserting the LABEL as well as the state, because "Overdue" in
words and "Overdue" in red are two separate false claims).

### The focused E2E run, and how ownership was established

Eleven spec files covering every changed area were run. **Every failure was
reproduced against baseline app code** — the same branch with `app/` stashed, on
a freshly re-seeded local D1, in the same session — rather than compared by
count, because [DEBT-179](../product/PRODUCT_DEBT.md) records that this suite's
failure set *churns* (19, 19, 18 and 20 failures across four runs of identical
content), and a count comparison against a churning set is not evidence.

| Spec | Branch | Baseline | Verdict |
|---|---|---|---|
| `cross-module-views` · `people` · `areas` · `global-capture` | pass | — | green (re-run after the P2-10 fix: 21/21 with `dhds-13-commercial-quality`) |
| `floating-surfaces` | pass | — | green |
| `tasks-collection` (fresh DB) | 30 pass | — | green |
| `dhds-13-commercial-quality` | 12 pass | — | green (new) |
| `today.spec.ts` | 4 failed / 8 passed | **4 failed / 8 passed, same four tests** | pre-existing |
| `plan-responsive` + `plan-weekly-planning` | 4 failed / 23 passed | **4 failed / 23 passed, same four tests, byte-identical messages** | pre-existing |
| `accessibility.spec.ts:235` | fail | **fail** | pre-existing |
| `goals.spec.ts:12` · `projects.spec.ts:630` | 2 failed / 24 passed | **2 failed / 24 passed, same two tests** | pre-existing |
| `assets.spec.ts:65` | 3 failures, then **5 consecutive passes** | pass | accumulated state — see below |
| `today-task-convergence` + `iphone-daily-driver` | 3 failed / 31 passed → **34 passed** | **3 failed, byte-identical messages** | pre-existing, root-caused and repaired — see below |
| `responsive` · `mobile-shell` · `people-diary-context` · `non-diary-audit` | 1 failed / 564 passed | **1 failed, byte-identical message** (`topWidth` expected 0, received 1) | pre-existing — `non-diary-audit.spec.ts:33`, already named in DEBT-179's own set |

**The twelve pre-existing failures**, named so a future run can tell them apart
from a new one: `today.spec.ts` :122, :262, :398, :432; `plan-responsive.spec.ts`
:100, :194, :266; `plan-weekly-planning.spec.ts` :233 (already recorded as
DEBT-180); `accessibility.spec.ts` :235; `goals.spec.ts` :12;
`projects.spec.ts` :630; `non-diary-audit.spec.ts` :33. The last was added in
review, when a 565-test sweep of `responsive`, `mobile-shell`,
`people-diary-context` and `non-diary-audit` was run to prove the Diary fix had
not moved anything else — 564 passed, and the one that did not fails identically
on baseline and is already inside DEBT-179's named set.

Two of those are worth naming as **product** findings rather than test debt,
because they were reproduced in the browser during this audit and are real:
`plan-responsive` :100 and :194 both fail on "exactly ONE day below the phone
tier" and receive **2** — Weekly Planning draws Saturday *and* Sunday at phone
width, at 100% and at 200% zoom. That is a genuine Plan composition defect, it
predates this phase, and it is visible in `phone-393-light-plan.png` in the
evidence set.

**`assets.spec.ts:65` is accumulated state, not this diff.** It failed three
times when run after other specs, passes on baseline, and then passed **five
consecutive times** on this branch against a re-seeded database, including
`--repeat-each=4`. The spec creates two Assets per run and the local D1 persists
between runs; that is [DEBT-173](../product/PRODUCT_DEBT.md)'s signature exactly
("specs assert against the shared workspace's ACCUMULATED state"). No mechanism
in this diff touches a record's Settings tab. It is reported here as observed
rather than as dismissed.

### The three CI failures on partition 9, and what they actually were

CI ran two spec files this branch's focused runs had not covered, and reported
three failures on them. Neither file was in the pre-existing set above, and one
of them exercises the task row this phase changed — so ownership was established
the same way as everything else: reproduced locally, then reproduced again with
`app/` checked out from `origin/main` at `b31323c` on a re-seeded database.
**All three failed on baseline with byte-identical messages** (`>= 38` /
`Received: 35`; `locator.check: Test timeout of 30000ms exceeded` at :173). They
are not this branch's. They were then root-caused rather than logged, because a
red test whose mechanism is unknown is indistinguishable from a real defect —
which, in one of the three, it was.

**`iphone-daily-driver.spec.ts:279` — a real product defect.** P2-11. The
stylesheet's own arithmetic was written against the page's 288px content box;
the strip was actually laid out in 254, because the toolbar card's inline
padding nests inside the page gutter that `.dh-collection__filters` has already
applied. 35.4px days. Fixed, and the fix is a measurement, not a judgement.

**`today-task-convergence.spec.ts:165` and `:396` — one spec assumption, twice.**
Completing a task on Today does not leave its row where it was: `TodayScreen`
files it under the plan's `Completed · n` disclosure, and that `<details>`
renders closed. The row stays in the DOM and leaves the accessibility tree, so
`getByRole("checkbox", { name: "Reopen …" })` scoped to the plan resolves to
nothing — which is why :396 reported "element(s) not found" while the page's own
live region said *"Completed TTC-… swipe."*, and why :165's `.check()` hung to
the 30-second timeout: Playwright re-resolves the locator to verify the new
state, and the act of completing had removed the only element it could resolve
to. The gesture, the mutation and the server round trip were all working
throughout; the assertions were looking in the wrong place.

Both were repaired by asserting where the product actually files the row — the
disclosure is opened by CLICKING ITS SUMMARY, so the completed row is now proved
*reachable* rather than merely present, and the reopen half proves it comes back
out into the day's bands. **No assertion was weakened, no timeout was raised and
no rule was skipped**; the two files now run 34/34.

**What the three failures gave back to DEBT-179.** That entry names
`today-task-convergence.spec.ts` (2) and `iphone-daily-driver.spec.ts` (1) among
its nineteen, and describes the dominant signature as *"`locator.check()` clicks
a task's completion checkbox, Playwright reports the click as performed, the
checkbox never becomes checked, and `check()` retries to timeout"* — with the
cause recorded as unknown. **It is now known**, and the entry has been updated
with it: the click *is* performed, the checkbox *is* checked, and it is inside a
closed disclosure the assertion cannot see. Three of the nineteen are fixed by
that finding. The remaining sixteen have deliberately **not** been re-checked
against it here — five of them complete a task and re-assert, which is where
whoever takes DEBT-179 should start, and turning a design gate into a
sixteen-test suite repair is the bundling that entry itself warns against.

**On the E2E gate's known instability.** This phase does not claim to have fixed
DEBT-179 and does not use it as cover: ownership above is established by
reproduction, the new specs are green, and the partition manifest is regenerated
from a real measurement rather than a 120-second guess.

---

## 18. What happens after DHDS-13

**The broad design-convergence programme is closed.** DHDS-01's outcome — "make
DalyHub feel like one mature, distinctive product" — is met, and the numbered
phases end here.

Future UI work is **module-specific, feature-specific, bug-specific or
accessibility-specific**, tied to actual product work and justified by evidence.
A future broad redesign requires a materially changed product direction — a new
platform, a new audience, a new information architecture — **not dissatisfaction
with the current one**. "The screenshots could look better" is not a mandate.

### The one rule this phase adds

Every P1 it found was invisible to the checks the programme had. A screenshot at
1× shows "P1"; only a measurement shows that the "1" is four pixels wider than
the box painting it. A visual pass shows a violet button; only a measurement
shows the svg inside it is 0×0. A page looks fine until you subtract its
neighbour's gutter from its own.

> **A visual claim about a rendered surface is proven by a measurement of that
> surface, not by looking at it.** Where a UI change asserts a geometry — a
> target, a gutter, a floor, a truncation, a reserved column — the assertion
> belongs in a test that reads the live box, at every width the claim covers.

That is what [`e2e/dhds-13-commercial-quality.spec.ts`](../../e2e/dhds-13-commercial-quality.spec.ts)
is, and it is the durable output of this phase — more so than any of the eleven
fixes.
