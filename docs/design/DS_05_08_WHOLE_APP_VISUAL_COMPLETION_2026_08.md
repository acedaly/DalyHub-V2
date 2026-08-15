# DS-05…DS-08 — whole-app visual completion (2026-08)

> DS-01 gave DalyHub its own token layer, DS-02 the generic primitives, DS-03 the
> frame, DS-04 the Tasks row. Each was a foundation. **This pass is the one that
> has to make the product LOOK like the concept**, everywhere, and it is judged by
> looking at the screen rather than by counting `--dh-*` usages.
>
> Concept references (do not edit):
> `ChatGPT Image Aug 14, 2026 at 03_11_25 PM.png` — the whole product, incl. mobile
> `ChatGPT Image Aug 14, 2026 at 03_13_16 PM.png` — Today, Projects, Tasks, mobile

Screenshots: [`assets/ds-final/`](assets/ds-final/) — `baseline/`, `projects-areas-goals/`,
`today/`, `remaining-modules/`, `mobile/`, `convergence/`, `final/`.

Three tools make the pass reproducible, and none is part of the gate:

| Tool | What it does |
|---|---|
| `scripts/ds-final-shot.mjs` | The whole-app shooter — one capture per (surface × width × appearance) |
| `scripts/ds-final-seed.mjs` | The LOCAL design fixture (see below) |
| `scripts/ds-final-audit.mjs` | Overflow, touch-target and axe findings per (route × width × appearance) |

**Why a design fixture exists.** The shared E2E seed is deliberately the small
deterministic spine the journeys assert on, and on it Analytics reads "nothing
completed", Meetings "0 Meetings", Diary is empty and **every Goal is "Not
measured"** — four of the surfaces this pass redesigns, invisible. A visual pass
cannot judge an empty screen. The fixture adds measurable Goals with real reading
histories, a fortnight of completions, meetings either side of now and a populated
Diary. Local-only, `dsf-`-prefixed, `--clear`-able, and it taught the pass one
thing worth recording: **completion COUNTS are read from the Activity stream, not
from `spine_records.completed_at`** — a fixture that sets the spine alone produces
a workspace full of finished work and an Analytics screen that says nothing was.

---

## 1. What the concept actually specifies

Read off both images rather than inferred. DS-04 §1 established the Tasks row;
this is the rest.

| Element | The concept draws |
|---|---|
| Ground | Grey under a CARD GRID; white under a flat LIST (DS-04's rule, unchanged) |
| Card | White, a **hairline**, a small corner (~12px), **no shadow** |
| Card padding | ~16px. A project card is ~150px tall for six facts |
| Card head | A ~40px rounded icon tile, the title beside it, a `⋯` in the corner |
| Status | A 6px dot and two words — never a filled chip |
| Progress | A thin track, and the percentage as **small trailing text at the bar's end** |
| Page header | Title, count inline, one primary action; then quiet text tabs with a purple underline |
| Create action | `+ New <thing>` — a leading plus, sentence case, one per page |
| Dashboard | A row of stat tiles, a 2-column band, then a progress strip |
| Purple | Primary button, current tab, selected nav, meaningful progress. Nothing else |
| Phone | One column, the same objects, reordered — never a shrunken desktop |

---

## 2. The fifteen measured differences (baseline, 2026-08-15)

Every one was read off `assets/ds-final/baseline/`, at 1440 unless stated.

| # | Measured | Status |
|---|---|---|
| 1 | Gallery cards 40–50% taller than their content: a Project card **215px**, a Goal card **305px** for six facts | ✅ 117px / 195px |
| 2 | A Goal's reading in a **filled tonal slab** ~110px tall, washed in the Area's accent | ✅ removed |
| 3 | Record cards paint shadow + `border: none` + a **16px** corner while `.dh-dcard` had moved to hairline + 12px | ✅ one boundary |
| 4 | The **percentage is the loudest thing** on a Project card — 24px emphasised beside a 16px title | ✅ meta size, on the bar's row |
| 5 | The collection SCOPE filter is underlined text tabs in Tasks/Projects and a **sunken segmented track** in Goals | ✅ one control |
| 6 | Page headers disagree: Tasks puts the count inline, seven other collections stack a second band | ✅ all inline |
| 7 | Primary actions disagree: "**+ New task**" vs "New Project", "New Area", "New meeting" | ✅ one label |
| 8 | **Today's Goal progress was below the fold**, under a 300px hole | ✅ in the fold |
| 9 | Today's stat tiles carry no boundary on the grey canvas | ✅ hairline |
| 10 | Today wastes the **bottom-left half of the viewport** — measured 500×300px | ✅ filled |
| 11 | Focus draws a **3px crimson rail** down the whole overdue group | ✅ removed |
| 12 | **Settings is a different application**: filled lavender slabs for every selection | ✅ tints |
| 13 | Routine empty states are **260px full-width cards** for three lines | ✅ ~200px |
| 14 | Areas is a **72px-row list inside a bordered panel on the grey ground** | ✅ white ground, 64px rows |
| 15 | The Diary type rail fills its current option; the notes rail fills its current row | ✅ tab rail / tint |

Two things the baseline flagged that turned out **not** to be defects, recorded so
the next pass does not re-open them:

- **"50 Projects loaded"** is not a copy leak. `count-label.ts` argues it, and the
  argument holds: it is the difference between "there are 50" and "you can see 50
  of an unknown number", and a count that quietly means the second is a count that
  lies.
- **Notes, Meetings and Goals have no page-level create.** `DESIGN_SYSTEM.md`
  states the rule — one global capture affordance per viewport, and a module does
  not add its own where global Quick Capture creates the same record. Their empty
  states carry one, which is where it belongs.

---

## 3. The convergence checklist

| # | Issue | Action | Evidence | Status |
|---|---|---|---|---|
| C1 | Card boundary | `.dh-pcard`/`.dh-gcard`/`.dh-acard`/`.dh-ecard`/`.dh-stat`/`.dh-today__panel`/`.dh-settings-group`/`.dh-empty-state` take one hairline + 12px + no shadow | `projects-areas-goals/p2-*` | ✅ |
| C2 | Card height | padding 20→16, mark 56→40, foot two rows not three | `projects-areas-goals/p2-projects-1440-light.png` | ✅ |
| C3 | Percentage weight | grid `1fr auto`; the bar and its figure are one row | same | ✅ |
| C4 | Goal tonal slab | `.dh-gcard__reading` / `__note` de-tinted; six accent washes deleted | `projects-areas-goals/p2-goals-1440-light.png` | ✅ |
| C5 | Scope filter | Goals adopts the shared `ViewTabs`; Diary's type rail takes the same underline | `remaining-modules/r2-diary-*` | ✅ |
| C6 | Page header | the inline count moves from `.dh-collection--tasks` to `.dh-pane-header--compact` | every `final/` capture | ✅ |
| C7 | Primary action | shared `CreateActionLabel` — a plus and sentence case, 6 modules | `final/` | ✅ |
| C8 | Today: Goal progress | moved into the body grid, placed in row 2 | `today/t3-*` | ✅ |
| C9 | Today: stat tiles | the one card boundary | `today/t4-*` | ✅ |
| C10 | Today: dead canvas | attention column spans both rows; Goal progress fills the hole | `today/t3-*` | ✅ |
| C11 | Overdue rail | dropped; the heading and the date carry the state, as DS-04 has it in Tasks | `today/t4-*` | ✅ |
| C12 | Settings slabs | `--dh-color-surface-selected` for the appearance rows, the scheme list and the section nav | `remaining-modules/r2-settings-*` | ✅ |
| C13 | Empty states | 40px → 32px block padding, plus the one boundary | `remaining-modules/r2-reviews-*` | ✅ |
| C14 | Areas ground | `.dh-collection--flat`, generalised out of `.dh-collection--tasks` | `projects-areas-goals/p2-areas-*` | ✅ |
| C15 | Notes rail selection | tint + a 2px accent edge, and the text roles back to standard | `remaining-modules/r2-notes-*` | ✅ |
| C16 | Charts | the comparison axis gains a separator — "4 0" read as "forty" | `today/t4-*` | ✅ |
| C17 | Mobile | audited 320/390 × light/dark × 13 routes — **no document overflow anywhere** | `mobile/`, §6 | ✅ |
| C18 | Dark mode | audited 1366/1920 × dark × 13 routes — no axe findings | `today/t4-today-1440-dark.png` | ✅ |
| C19 | MD3 remnants | 1,269 references migrated to `--dh-*`, **verified pixel-identical** | §7 | ◑ partial, measured |
| C20 | 404 has no `<title>` | root `meta` fallback (WCAG 2.4.2) | §6 | ✅ |

---

## 4. Module changes

**Projects.** The card lost 98px of height without losing a fact. Its foot is two
rows — the status line with the open count at its trailing edge, then the bar with
its percentage — rather than three with a 24px figure on one of them. The mark
steps from the 56px rung to the product's standard 40px identity tile.

**Areas.** A flat list, drawn as one: the white ground DS-04 established for
Tasks, hairlines between rows, and the two-line row height instead of a bespoke
72px. The bordered panel it floated in is gone.

**Goals.** The tinted reading block — the card's "signature" since UIX-01 — is
gone, and the reading is text on the card. Identity is still drawn twice, at the
mark and at the progress fill, which is the size at which a hue is a signal rather
than a field. The status rail is the same tab rail Tasks and Projects use, so the
page no longer stacks two identically-shaped segmented controls.

**Today.** The composition changed rather than the content. The attention column
spans both grid rows and Goal progress takes the two tracks beneath Focus and
Schedule, which puts the product's stated Goal-progress requirement inside the
fold and closes a measured 500×300px hole. The overdue rail is gone; the goal
tiles are hairline-separated rather than filled in pastel; the week's comparison
axis separates its two figures.

**Settings.** Three filled `secondary-container` slabs became the product's own
selected tint — the appearance rows, the colour-scheme rows and the section nav.
Nothing else in DalyHub paints a selection as a slab. Every selection still
carries a real radio and a check glyph, so nothing was ever colour alone.

**Notes / Diary / Reviews / Meetings / Assets.** Header count inline, create
action normalised, the notes rail's selected row a tint with an accent edge, the
Diary type rail on the shared underline.

---

## 5. Responsive rules

Unchanged from DS-03/DS-04 in mechanism; what DS-07 added is the verification.
Audited at 320, 390, 768, 1366 and 1920 in both appearances across thirteen
routes:

- **No document-level horizontal overflow at any width.** A wide chart or table
  scrolls inside its own box; the page never does.
- **Touch targets.** The reported sub-44px controls are all cases where the
  control's own box is small and its HIT AREA is not — a 20px checkbox inside a
  44px `.dh-check-circle-target`, a 21px settings nav link inside a 44px row it
  covers with `::after`. The audit measures boxes; the design floors areas.
- **1366 is comfortable for every module**, which was the priority viewport.
- **1920 gives Projects five columns** without stretching a card.

---

## 6. Accessibility

`scripts/ds-final-audit.mjs` over 13 routes × {390, 1366} × {light, dark} with
axe-core at WCAG 2.0/2.1/2.2 A+AA:

- **One violation found, and fixed:** `document-title` on any URL that matches no
  route. The root exported no `meta`, so a 404 shipped with no `<title>` at all
  (WCAG 2.4.2). A root `meta` fallback fixes it; every route that exports its own
  is unaffected, verified.
- **No other violations** at any route, width or appearance.
- The de-slabbing in Settings and Notes removed a contrast TRAP as a side effect:
  `on-secondary-container` is chosen to clear 4.5:1 against `secondary-container`
  exactly, so any transparency took it under — a hazard `notes.css` had already
  been bitten by once. Over a quiet tint the standard text pair carries the
  margin it carries everywhere else.

---

## 7. What remains MD3, and why

Feature stylesheet references to MD3 vocabulary, before and after:

| Vocabulary | Before | After | Verdict |
|---|---|---|---|
| `--md-sys-color-*`, `--md-app-color-*` (with a 1:1 `--dh-*` alias) | 1,269 | **0** | migrated |
| `--md-sys-typescale-*` | 979 | 979 | **debt** — see below |
| `--md-sys-color-*`/`--md-app-color-*` with no `--dh-*` equivalent | 787 | 787 | **acceptable** |
| `--md-sys-shape-*` / `-motion-*` / `-elevation-*` / `-state-*` | 497 | 497 | **debt** |
| **Total in feature stylesheets** | **3,532** | **2,144** | −39% |

**The migration is provably value-preserving, and was proved.** Every `--dh-*`
colour token is literally `var(<the same underlying token>)`, and nothing outside
`tokens.css` redefines one of the 26 mapped names in any scope (checked). The full
Today page was captured before and after: **0 differing pixels of 2,301,120.**

**Acceptable (AGENTS.md §9.8).** The 787 remaining colour references are the roles
the DalyHub layer deliberately does not name — chart series, the priority ramp,
the six area accents, `outline-variant`, the four `*-container` status pairs.
Those are DATA vocabularies rather than surface vocabularies, and §9.8 says a
surface needing one "reads the generated role directly".

**Debt, and honestly so.** The typescale, shape, motion and elevation references
have `--dh-*` equivalents, but the mapping is many-to-one and SEMANTIC: DalyHub
publishes seven type ROLES (`page-title`, `record-title`, `section-title`, `body`,
`row`, `meta`, `label`) over a scale where three different things are
`body-medium` for three different reasons. Choosing the role is a judgement per
call site, not a substitution — which is exactly why it cannot be done the way the
colour pass was, and why forcing it would be the "speculative" change §58 rules
out. Recorded as [DEBT] in `PRODUCT_DEBT.md`.

The same is true of `--md-sys-color-primary` (190 references): it aliases to BOTH
`--dh-color-accent` and `--dh-color-focus`, and telling a brand decision from an
accessibility contract is the distinction the semantic layer exists to draw. A
mechanical pass would erase it.

---

## 8. What DS-05…DS-08 deliberately did NOT do

- **It did not add page-level create controls** to Notes, Meetings or Goals. The
  design system's rule already covers them, and the baseline reading of "Notes has
  no create action" was a misreading of a documented decision.
- **It did not change the overdue bound on Today.** Three rows is a calm-product
  decision ("a day that opens with twenty red rows is a day the owner closes the
  tab on"); raising it would have filled the screenshot at the product's expense.
- **It did not remove the 0% track from an unmeasured Goal.** The bar measures
  contributing PROJECT completion and the fact line labels it as such, which is
  honest — an empty bar there says "no contributing project is finished", not
  "this goal is nought per cent done".
- **It did not migrate the typescale.** See §7.

---

## 9. Evidence

- `assets/ds-final/baseline/` — 56 pre-pass captures, plus a `seeded-` set once
  the design fixture made four modules visible.
- `assets/ds-final/projects-areas-goals/` — the DS-05 iterations (`p1-`, `p2-`)
  and the record screens (`d1-`).
- `assets/ds-final/today/` — the DS-06 iterations (`t1-`…`t4-`), full-page.
- `assets/ds-final/remaining-modules/` — before (`r1-`) and after (`r2-`).
- `assets/ds-final/mobile/` — 390 in both appearances.
- `assets/ds-final/convergence/` — 1366 and 1920.
- `assets/ds-final/final/` — the representative set per module.

---

## 10. Validation

| Gate | Result |
|---|---|
| `format:check`, `lint`, `typecheck` | pass |
| `scheme:check`, `icons:check` | pass |
| `build` | pass |
| `test:unit` | **5,577 passed** (399 files) |
| `test:kernel` | **2,531 passed** (162 files) |
| E2E — accessibility, tasks-collection, today-mobile, responsive, areas-goals-mobile, projects-mobile | **625 passed, 3 failed** |
| E2E — creation-controls, people, assets, collection-header, goals, projects | **69 passed, 4 failed** |
| `ds-final-audit.mjs` — 13 routes × {320,390,768,1366,1920} × {light,dark} | no overflow; one axe finding, fixed |

**All seven E2E failures are red at `de4f5d1` (the DS-04 merge, and this
branch's base) too**, verified by checking that commit out and re-running each
one there. They are recorded individually in
[DEBT-135](../product/PRODUCT_DEBT.md), together with the two ways the
verification was got WRONG first — a `git stash` on an already-clean tree, which
"baselines" against the branch itself, and a stale local `main` at DS-03, where
the swipe-tray journeys still pass because the Card they locate had not yet been
removed. Compare against the branch's base COMMIT, never against a branch name.

Seven unit assertions were updated rather than weakened: they asserted the old
create-action copy ("New Project"), which D47 deliberately changed. Twenty-four
E2E spec files had their create-action LOCATORS repointed for the same reason —
and only the link/button locators, never the `dialog`/`form` titles, which name
the record type and are a different string.

---

## 11. Review round 1 — four findings, all confirmed

An automated review of PR #178 raised four, and **all four reproduced**. Recorded
because each is a class of mistake the pass invited.

**P1 — a locator my search-and-replace could not see.** D47's copy change was
propagated across 24 spec files by matching
`getByRole("link"|"button", { name: "New X" })` on ONE line.
`mobile-capture-journeys.spec.ts` wraps the same call across three lines, so its
`headerCreate` helper — used by three journeys — kept searching for
`New Diary entry`. The same sweep also missed
`creation-controls.spec.ts`'s `{ name: /New Note/ }`, which is worse than a
failure: it is a NEGATIVE assertion ("Notes has no header create"), so a regex
that no longer matches makes the test pass vacuously. Both fixed; the second now
matches case-insensitively so it cannot silently stop asserting again.

**P2 — a documented path that was never run.** `--clear` is advertised in the
script's own header and `DELETE FROM activities … WHERE entity_id LIKE …`
addressed a column `activities` does not have. Running it exposed two more:
`activity_subjects` holds an `ON DELETE RESTRICT` key onto `activities` and had
to go first, and `area_details` was missing from the list entirely — which does
not partially clear, it refuses the `entities` delete, and D1 attributes the
failure to the FIRST statement of the batch rather than the cause. Fixed and
exercised: seed → clear → seed round-trips, and every `dsf-` row is gone.

**P2 — an audit looser than the contract it printed.** The target check compared
against 40×24 under a comment stating DalyHub's floor is 44px, so a 43×43 control
passed the audit that exists to check 44. The threshold is now 44 in both
dimensions — and because raising it alone produces a page of false positives, the
audit now measures the EFFECTIVE target: the two mechanisms DalyHub actually uses
for an oversized hit area (a stretched `::after` over a positioned ancestor, and
a wrapping `<label>`). Findings fell from 23 to 7 at 390px, and the 7 are the
DS-04-documented ones (D43's 24×24 inline triggers, and row titles whose target
is the grid cell).

That tightening immediately found something real: **the skip link was 40px tall
on every page** — clearing WCAG 2.2 AA's 24px, missing DalyHub's own 44px by
four, on the first control a keyboard or switch user reaches. Fixed.

**P2 — a placement scoped too narrowly.** The Goal-progress grid rules were all
scoped to `[data-columns="3"]`, so a day with **no schedule** — the ordinary
morning, not the exception — auto-placed the panel into a single track with an
empty column beside it, and a three-region day between 44rem and 58rem did the
same. `1 / -1` is now the default from 44rem, narrowed to `1 / 3` at 58rem where
the attention column occupies the third track. Verified by moving the fixture's
only meeting off today and re-capturing.
