# DalyHub — the final product UI (2026-08)

> **The visual reference for this implementation pass is `concept 1.png`,
> `concept 2.png` and `concept 3.png` in the repository root.** The governing
> product brief is now [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md); the concepts
> illustrate its composition and finish but do not override its usability,
> semantics, accessibility or adaptive-mobile rules. They supersede the earlier
> exploratory references (`ChatGPT Image Aug 14 …`) wherever the two disagree,
> and they supersede any generic Material Design 3, Fluent, shadcn or Radix
> reference for the scope of this recorded pass.
>
> The three are one specification seen from three angles, not three options:
>
> | Concept | What it settles |
> |---|---|
> | **1** | The whole-product language — shell, Today, Projects, Goals, Areas, Calendar, Notes, Diary, Meetings, People, Analytics, Settings. Card proportions, desktop density, page composition, sidebar anatomy. |
> | **2** | Tasks, and interaction detail — the row, grouping, the detail inspector, quick capture, the board, mobile Tasks. |
> | **3** | Refinement — page-level hierarchy, flatter groups, the Project gallery/detail relationship, selective purple, control alignment, whitespace, mobile hierarchy. |
>
> This document is the implementation record for that convergence. It does not
> replace [`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md) (the policy) or
> [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (the mechanics); it records what the
> concepts changed and what was deliberately not changed.

**Screenshots:** [`assets/final-product-ui/`](assets/final-product-ui/)

| Folder | What it holds |
|---|---|
| `baseline/` (23) | Every module at 1440 light, **before** any FINAL-UI commit — the dark rail, the 56px task row, Today's figure cards |
| `refine-baseline/` (5) | The core five at 1440 light, **before** the refinement pass — the faint card edge, Today's five panels |
| `final/` (23) | Every module and every record screen at 1440 light |
| `mobile/` (9) | Today, Tasks, Projects, Goals, Notes, Settings, Meetings, Diary at 390 |
| `mobile-narrow/` (6) | Today, Tasks, Goals at 320 and 430 |
| `dark/` (6) | Today, Tasks, Projects, Goals, Notes, Settings at 1440 dark |
| `convergence/` (6) | Tasks, Today, Projects at 1366 and 1920 — the laptop and wide-desktop checks |

Capture is one command against a running dev server, unchanged from DS-05:

```
node scripts/ds-final-shot.mjs --out docs/design/assets/final-product-ui/final --set core
node scripts/ds-final-seed.mjs          # the local design fixture
```

---

## 1. The governing decision rule

When existing presentation conflicts with the approved concepts, **the concepts
win** — unless the change would break real functionality, accessibility,
truthful data presentation or established product semantics.

When *architecture* conflicts with a cosmetic detail in a concept, architecture
wins and the underlying visual principle is reproduced another way. §9 records
every place that happened.

The correction this pass carries over DS-01…DS-04 is one sentence:

> **Preserve application architecture and functionality. Do not preserve visual
> legacy.**

DS-01 and DS-02 were right to change the foundation while holding presentation
still. That is over. Nothing below was kept because it already existed.

---

## 2. What DS-01…DS-08 had actually established

Read off the repository rather than off the briefs, because the two differ.

| Stage | What was real on `main`/branch before this pass |
|---|---|
| **DS-01** | A `--dh-*` semantic token layer with DalyHub's name on it; an explicit three-preset density model (`compact`/`default`/`touch`) driving eight tokens; MD3 demoted to machinery (generated colour, typescale, shape/elevation scales, state layer, motion). ADR-092. |
| **DS-02** | The generic primitive layer — `Button`, `IconButton`, `Field`, `Menu`, `Drawer`, `Sheet`, `EmptyState`, the one state layer, one control corner (D33). |
| **DS-03** | The application frame: a persistent 216px rail, a 56px top bar with search at the leading edge, the account cluster at the bottom of the rail, a tablet glyph rail, the phone bottom bar. **And a rail that was near-black in both appearances.** |
| **DS-04** | The Tasks row: a flat list on a white ground, a shared column grid, a hairline per row, no per-row card. Rows were 56px carrying 16px titles. |
| **DS-05…08** | Whole-app card boundary (one hairline, 12px, no shadow), Project/Goal card compaction, one scope control, inline collection counts, one create-action label, Today's Goal progress in the fold, Settings de-slabbed, 1,269 MD3 references migrated to `--dh-*`. |

**This pass is not another design-system migration.** No token layer was added,
no primitive library replaced, no framework changed, no repository or mutation
authority touched.

---

## 3. The fifteen largest gaps at baseline

Every one measured on `assets/final-product-ui/baseline/` at 1440 unless stated.

| # | Measured gap | Status |
|---|---|---|
| 1 | **The rail is near-black.** All three approved concepts draw a near-white rail one tone under a white canvas. The single most recognisable thing about the shipped product was the one thing the concepts do not have. | ✅ §4.1 |
| 2 | **The current destination is a saturated violet block** across a 216px row. Concepts draw a ~1.02:1 lavender tint with a violet label. | ✅ §4.1 |
| 3 | **Task rows are 56px carrying 16px titles** — a ratio of 3.5. The concepts draw ~2.5 (a 36px row at 14px). Fourteen rows on screen cost ~280px. | ✅ §4.2 |
| 4 | **The Tasks list has a column KEY** (`Task · Project · Date · Priority · Status` in small caps). Neither Tasks concept has one; it is what makes a list read as a data grid. | ✅ §4.2 |
| 5 | **Group headings are muted uppercase bands with a rule under them.** Concepts 2 and 3 both draw `Overdue · 2` in red and `Today · 5` in near-black, sentence case, no rule. | ✅ §4.2 |
| 6 | **Priority is a tinted capsule** on Today, the Drawer, Project task lists and Board cards — a coloured container per task for a two-character fact. Concepts draw a flag and a tag. | ✅ §4.2 |
| 7 | **Metadata order is `project · date`.** Concepts 2 and 3 both run `date · project`: after the title, WHEN comes before WHERE. | ✅ §4.2 |
| 8 | **A filled status pill on every in-flight row**, in the accent — fourteen violet words down the trailing edge of a list, competing with the page's one violet control. | ✅ §4.2 |
| 9 | **Today opens on two 80px figure cards.** Concept 1's Today opens on the day's tasks and its schedule and keeps its two small measures at the bottom. The stat row cost the fold ~110px of the owner's actual work. | ✅ §4.3 |
| 10 | **Today's greeting is `headline-medium` (28px)** — hard-coded rather than reading the page-title role, so it was the largest type in the application on thirteen pages' worth of comparison. | ✅ §4.3 |
| 11 | **Today's rows are 61px** (45 + 8 block padding) where the same task on `/tasks` is 37 — the same object drawn twice. | ✅ §4.3 |
| 12 | **The page title is `headline-small` (24px).** Concepts draw ~1.5× the list row beneath it — about 21px at DS-01's 14px row. | ✅ §4.5 |
| 13 | **The scope filter is a sunken track with a raised chip**, in the header of seven collections. Concepts 1 and 3 draw a filled chip for the current scope and plain text for the others, with nothing behind either. | ✅ §4.4 |
| 14 | **Two filled violet buttons on every collection** — the frame's global "+ New" and the page's own "+ New project" twenty pixels below it. | ✅ §4.5 |
| 15 | **The Goal card's reading is `headline-small` (24px)**, forcing a ~235px card for six facts. Concept 1 draws the reading at roughly its title's size and lets the chart and the bar carry the weight, in ~150px. | ✅ §4.6 |

Three defects found while measuring, fixed because §105 puts them in scope:

| Defect | Where | Fix |
|---|---|---|
| The module filter band was sized shrink-to-fit inside a persistent-controls row — **405px inside a 1224px pane** — so Assets' search and tag fields wrapped onto two lines and "Filter & sort" sat marooned in the gap. | `/assets`, 1440 | `collection-layout.css` — the band grows |
| At 390 the project name **ran into the P1 flag with no gap**, and the ellipsis never appeared because `text-overflow` does not apply to a flex container's anonymous text item. | `/tasks`, 390 | `task-list.css` — a padding floor the auto margin cannot eat, and a block box for the label |
| At 320 the date column is dropped by design, but its separator was not, so every row opened `· Kitchen fit-out`. | `/tasks`, 320 | `task-list.css` — the 19rem container query suppresses it |

### Preserved

The architecture this pass deliberately did not touch, because it was right:

- the **shell silhouette** — a persistent rail owning identity and navigation, a
  compact top bar, a full-height pane, a phone bottom bar with a central capture
  action (which is what concept 3's mobile draws);
- **`--dh-*` and the density model** — every value below is a token, and the
  36px task row is a density preset rather than a number in one stylesheet;
- **the one state layer**, the one control corner, the one focus contract;
- **`CollectionLayout`**, `PaneHeader`, `ViewTabs`, `EmptyState`, `Drawer`,
  `Sheet`, the inline-edit and selector primitives;
- **`TaskRow` / `TaskList` / `TaskGroup`** as the single row implementation
  shared by Tasks, Today, Projects and the Drawer;
- **canonical record authority** — one Task model, one Project model, one
  mutation path, no second mobile data model;
- **DS-05's card boundary** (one hairline, 12px, no shadow) — it is already what
  the concepts draw;
- **Areas** and **People**, which were already concept-shaped: a clean list on a
  white ground with a small identity mark, a title and one real count.

### Replaced

- the rail's entire colour treatment and its selected state;
- the Tasks row's density, type, metadata order, priority mark and status chip;
- the Tasks column key and group-heading band (deleted);
- Today's block order, greeting scale, row density and band labels;
- the scope filter's track and chip;
- the Goal card's reading scale;
- the Settings section rail (now the concept's two-line list).

### Risks, and what covers each

| Risk | Cover |
|---|---|
| **The rail re-tone touches five schemes × two appearances.** | `contrast.test.ts` asserts every rail pair per scheme per appearance, including the new `on-rail-selected` against the mixed selected surface. The "rail is dark in both" assertion was rewritten to the rule the concepts state, not deleted. |
| **A 36px row is a smaller target.** | The fine-pointer height applies under `(pointer: fine)` only. `(pointer: coarse)` keeps 45px unconditionally, which is the same bargain AGENTS.md §15 already strikes for the compact density preset. WCAG 2.2 SC 2.5.8 (AA) asks 24×24; the check target is 45×28. |
| **Shared components change many screens at once.** | That is the point (§98), and it is why `PriorityIndicator`, `TaskRow` and the segmented control were changed at the component rather than per module. Screenshots were taken per module afterwards. |
| **Removing the status pill's fill could lose information.** | It did not: the state's WORDS stay, in the state's own colour. Only the container went (§86 — hide complexity, do not delete capability). |
| **Reordering Today's blocks changes the phone order too.** | Deliberate — §45 asks for exactly that order on mobile. `TodayScreen.test.tsx` guards the DOM order and was updated to the new claim rather than deleted. |
| **`:has()` in the mobile separator guard and the Settings row.** | Both degrade to "the separator shows" / "the row is not tinted", never to a broken layout. Baseline support is universal in the browsers the PWA targets. |

---

## 4. The specification, as implemented

### 4.1 Shell and navigation

**The rail is light.** `surface-rail` re-tones from 14 to **96** in the light
appearance with dark foregrounds (`on-rail` 18, `on-rail-muted` 42,
`rail-hairline` 90); dark is unchanged at 8. The property that survived is the
one that makes it the same object in both: **the rail is two tones under its own
canvas** (96 under 98; 8 under 10). `surface-navigation` is still *above* the
page — it is the phone bar drawn *on* a page, where the rail is the frame a page
sits *inside*.

The canvas moves with it, from tone 97 to **98**, and the hairline from 92 to
**91**. The concepts draw a near-white working surface and let a hairline carry
every boundary; 98 is the highest rung the ladder test's 1.4-tone navigation
separation leaves available.

| | Before | After |
|---|---|---|
| Rail surface (light) | `#222427` | `#f4f3f7` |
| Rail label | `#b6b5b9` on near-black | `#2b2c2f`, weight 500 |
| Current destination | `primary` at 62% — a violet block | `primary` at **12%** — a lavender row |
| Current destination's label | the rail's light foreground | **`primary`** (new `on-rail-selected` role) |
| Group divider | none (VIS-01 deleted it) | a rail hairline — at two tones it confirms the gap instead of competing with it |
| Rail edge | none | one hairline |

Selection is still never colour alone: `aria-current`, a shape, a weight step and
a foreground step — four signals, as before.

**The top bar's create action drops to `secondary`.** The action, label,
shortcut, accessible name and unconditional touch target are unchanged; only the
emphasis moved to the surface that owns the record being created (§73).

### 4.2 Tasks — the primary benchmark

The target is concept 2's list and concept 3's inspector.

```
Tasks                                          Search / actions
List   Board   Calendar   Upcoming
──────────────────────────────────────────────────────────────
Overdue · 2
○  Submit Planning Level 2 assessment   Yesterday   ● Work      ⚑ P1
○  Book vehicle service                 Yesterday   ● Personal  ⚑ P2

Today · 5
○  Finish OPPO issues paper             2:00 pm     ● Work      ⚑ P1
```

| Element | Before | After |
|---|---|---|
| Row height | 56px (`default` density) | **36px** — `--dh-row-height` at `compact`, which is now the Tasks default |
| Row type | 16px `body-large` | **14px** `--dh-text-row-size` |
| Completion target | 45×45, which is what actually held the row at 46px | 45×**28** on a fine pointer; 45×45 under `(pointer: coarse)` |
| Column key | `Task · Project · Date · Priority · Status` | **removed** — it was `aria-hidden` decoration |
| Metadata order | project · date · priority · status | **date · project · priority · status** |
| Group heading | `OVERDUE 20`, muted small caps, hairline under it | **`Overdue · 20`** — sentence case, weight 600, `--dh-color-overdue` on the overdue bucket, no rule |
| Priority | a tinted capsule with a dot | **a flag and a tag**, everywhere in the product |
| Display state | a filled tonal chip | the tone's own colour as **text**; `in progress` takes no colour at all |
| Row hairline | full-bleed | inside the row's inset; the last row of a group drops it |

**Mobile Tasks** recomposes rather than shrinking, per §57:

```
Dataset task 59
21 days ago · ● Task Dataset Beta          ⚑ P1
```

The cells keep their source order (and so their reading order); only the visual
order is swapped with `order`, which is why every cell also states `grid-row: 1`
— `order` participates in grid auto-placement, and without the pin the first
build of this split every desktop row in two.

### 4.3 Today — the product showcase

> **Amended 2026-08-16 by [TODAY-11](TODAY_11_COMMAND_CENTRE_2026_08.md).** This
> section is kept as the historical record of what FINAL-UI decided and why; it
> is no longer what `/today` looks like. `MOCKUP 5.png` recomposed the screen as
> four ranks and put a stat rank back **directly under the greeting**, reversing
> the §45 placement recorded below. The mockup is the owner's newer intent and
> wins on composition; §45's *spirit* is kept by making the rank shallow and by
> holding the "exactly three blocks before the day's work" guard in
> `TodayScreen.test.tsx`. Everything else this section records about Today — the
> page-title greeting, the Tasks row density, the sentence-case band labels, the
> one bordered card — survives unchanged. Do not read the ASCII sketch below as
> current; read [TODAY-11 §4](TODAY_11_COMMAND_CENTRE_2026_08.md#4-composition).

Concept 1's Today opens on the day. So does this one.

```
Good afternoon, Aidan                                     Plan day
Saturday 15 August 2026
Today   Tomorrow   Next 7 days
────────────────────────────────────────────────────────────────
Focus                              │  Needs attention
Overdue                            │  Continue working
○ …                                │
Due today                          │
○ …                                │
Goal progress  ──────────────────────────────────────────────
Today at a glance · This week ───────────────────────────────
```

- the **stat row moved below the body grid** (§45: do not put decorative stats
  before actionable content). Nothing is hidden and nothing moves by CSS
  `order`, so the phone order changed with it — which is the reordering §45 asks
  for there;
- the **greeting reads `--dh-text-page-title-*`** instead of hard-coding
  `headline-medium`. UIX-06's reasoning ("Today is a page, and its greeting is
  its heading") was right; its token was not;
- **Today's rows are the Tasks rows** — same density, same type, same completion
  control. They are the same object and now look like it;
- **band labels are the Tasks group heading** — sentence case, weight 600,
  overdue in `--dh-color-overdue`. Two vocabularies for one idea was the
  inconsistency §98 asks this pass to find.

### 4.4 The scope filter

One control, seven collections. The sunken track and the raised chip are gone;
the current scope is a **filled near-black chip** and the others are plain text,
which is what concepts 1 and 3 draw. Height follows `--dh-control-height`
(36px on a cursor, floored to 45 under a coarse pointer) rather than a hard 44.

Deliberately **not** the accent: purple is spent on the primary action, the
current tab, progress and the selected navigation row, and a violet scope chip
beside a violet "+ New project" is two primaries in one header.

The leading check glyph stays. It is the signal that survives forced colours,
and it is why the chip is wider than the concept's — a recorded deviation (§9).

### 4.5 Type, colour and controls

| Role | Before | After |
|---|---|---|
| Page title | `headline-small` 24px | **`title-large` 22px emphasized** |
| Record title | `title-large` 22px | unchanged |
| Section / card title | `title-medium` 16px | unchanged |
| List row | `body-medium` 14px | unchanged — but the task row now *reads* it |
| Metadata | `body-small` 12px | unchanged |

The M3 `headline` rung is gone from ordinary productivity surfaces entirely,
which is §14 stated as a token rather than as a rule authors have to remember.

**Purple appears** on: the primary action, the current tab's underline, the
selected navigation row's label and tint, progress fills, focus, and a Goal or
Project's identity mark. **It does not appear** on: card backgrounds, every
navigation row, every chip, secondary actions, or a task's display state.

### 4.6 Cards, panels and surfaces

Unchanged from DS-05 because it already matches: one hairline, ~12px corner, no
shadow, moderate padding. Shadows are reserved for menus, popovers, dialogs,
floating detail panels and mobile sheets.

The **Goal card's reading** drops from `headline-small` to `title-large`
emphasized. The principle is unchanged and correct — the reading is what the
owner set out to change and the percentage is a derivation of it, the opposite
proportion to a Project card — but at 24px it was the largest type in the
application on a screen that shows ten of them, and it forced a 235px card for
six facts. It is now ~145px.

### 4.7 Settings

Concept 1's Settings is a list of two-line rows, and DalyHub already carried the
second line for every section — it wrote them for the phone list and hid them on
the desktop rail with a `clip-path`. They are visible at every width now:

```
General
Appearance, where DalyHub opens, and how new work starts.

Date & time
Your timezone, date format and the first day of your week.
```

Hover and selection moved from the link to the **row**, because the link is only
its first line. Hover is the shared state layer (the row carries
`md-state-layer`), which is what `state-layer.test.ts` exists to insist on — and
it gains the pressed state the hand-rolled rule never had. One entry came off
that test's `KNOWN_HAND_ROLLED` ratchet.

---

## 5. Density and responsive rules

Three presets, unchanged in mechanism. What changed is one value:

| Token | `compact` before | `compact` after |
|---|---|---|
| `--dh-row-height` | 45px (`--app-touch-target-min`) | **36px** (`--app-control-height-md`) |

Under `(pointer: coarse)` the preset is floored back to `--app-touch-target-min`
unconditionally, in the same block that has always done so. **Density may take
padding, type and glyph; it may never take hit area from a finger.**

Verified at 320, 375, 390, 430, 768, 1024, 1366, 1440 and 1920. 1366 and 1440
are first-class: the four-column Project and Goal galleries hold, the task
title's track never shrinks below `minmax(0, 1fr)`, and the metadata columns are
dropped narrowest-first by container query — status at 56rem, then the grid
tightens at 44rem, then the row recomposes to two lines at 34rem, then the date
yields to the project at 19rem.

---

## 6. Mobile

Mobile is a recomposition, not a compression (§57). The existing safe-area-aware
shell is unchanged — a 66px labelled bottom bar with a central capture action,
which is what concept 3's mobile draws.

What this pass changed on the phone:

- **Tasks**: `date · project` under the title, priority pinned to the trailing
  edge with a gap it cannot lose, the project truncating with a real ellipsis,
  and no orphan separator at 320;
- **Today**: the block order follows the DOM, so the stat row moved to the
  bottom there too — the top of the screen is the day's work;
- **Settings**: unchanged (the phone list was already the concept's shape; the
  desktop rail moved *toward* it).

---

## 7. Dark mode

Dark is a designed appearance, not an inversion. The rail stays the deepest
surface on the screen — two tones under its canvas, the same relationship the
light rail now has, which is what makes it the same object in both appearances
now that it is no longer the same hex.

Everything that changed in light is a generated role or a token, so dark
followed without a single appearance rule outside the generator:

- `on-rail-selected` resolves to `primary` in light (violet on a pale tint) and
  to the rail's own light foreground in dark (light on a saturated block) —
  because violet-on-violet is the least legible pairing on a dark rail, and
  grey-on-lavender is not a selection on a light one;
- `rail-selected` tint strength is 12% in light and 80% in dark;
- the scope chip's `--dh-color-text` on `--dh-color-surface` inverts correctly by
  construction.

---

## 8. Validation

Every command below was run on this branch; §126 of the final report records the
actual results.

```
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run scheme:check
pnpm run icons:check
pnpm run test:unit
pnpm run test:kernel
pnpm run build
```

Targeted E2E, on the modules this pass materially changed:

| Suite | Result |
|---|---|
| `tasks-journey.spec.ts` | 6 passed |
| `accessibility.spec.ts`, `design-foundation.spec.ts`, `creation-controls.spec.ts` | passed |
| `collection-header.spec.ts` | 1 updated (below), 4 **pre-existing** failures |
| `iphone-daily-driver.spec.ts` + `mobile-shell.spec.ts` | 44 passed, 1 skipped, 6 **pre-existing** failures |

The four pre-existing failures are `UIQ-021 — the shared menu fits the
viewport`, and none of them reaches an assertion about a menu. Its helper
`openRowMenuNear` locates rows with `page.locator("article.dh-card")` on
`/tasks`, and DS-04 replaced the Tasks card with `li.dh-taskrow` — so the helper
returns zero rows and fails at its own precondition. **Verified by checking out
`013a6b9` (this branch's starting point, before any FINAL-UI commit) and running
`a trigger near the bottom flips the menu above it`: it fails identically
there.** Fixing the helper is a Tasks-selector change in a menu-placement spec
and belongs with whoever next touches that suite; weakening it here would hide a
real gap in menu coverage.

The six phone failures are the same shape and were confirmed the same way — the
suite reports **6 failed / 44 passed / 1 skipped both at `013a6b9` and at this
branch's tip**, the same six by name. Five of them look for `.dh-card__open`,
`.dh-card__actions .dh-overflow-menu__trigger` or `article.dh-card` on `/tasks`,
which DS-04 replaced with `li.dh-taskrow`; the sixth asserts a 16px anti-zoom
floor on the quick-add input, which the floor's own `(hover: none)` guard does
not reach in a desktop-Chromium run. All six predate this pass and none is
tracking a defect that this pass could introduce or hide.

**DEBT recommendation:** this is one root cause behind ten failing browser
assertions across three specs — the phone and menu suites still address Tasks
through the generic Card that DS-04 retired. It is worth one pass over those
selectors rather than ten separate fixes.

Three tests were updated rather than weakened, and each records why:

- **`contrast.test.ts`** — "keeps the rail DARK in both appearances" becomes
  "keeps the rail on the same side of the ladder as its appearance", with a
  near-white floor in light and the original near-black ceiling in dark, plus a
  new assertion that the rail recedes under its own page. The selected row's
  fill floor is 1.04 in light (the drawer's floor) and DS-03's 1.5 in dark: a
  pale tint on a near-white rail cannot reach 1.5 and must not try — the
  concepts draw it at ~1.02 — and what replaces the missing fill contrast is the
  violet foreground, asserted at 4.5.
- **`TodayScreen.test.tsx`** — the block-order guard now expects
  `head · timeline · stat-row`. It is the same claim about the same order; §45
  changed which order is correct.
  *(Historical. REDESIGN-03 removed the stat row outright and put one row of week
  measures above the day; [TODAY-11](TODAY_11_COMMAND_CENTRE_2026_08.md) keeps
  that position because `MOCKUP 5.png` draws it. The guard survives in a
  different form — it now asserts that exactly THREE blocks may precede the day's
  work, so a second figure row still fails it whatever it is called.)*
- **`collection-header.spec.ts`** — the switcher's height floor drops from 44 to
  24. The 44 was `--app-touch-target-min` spent on a control inside a tray that
  no longer exists; the height is now `--dh-control-height`, which IS 45px under
  `(pointer: coarse)`. Playwright's desktop Chrome reports a fine pointer, so
  24 (WCAG 2.2 SC 2.5.8, AA) is what this run can honestly assert.

And one measured accessibility regression was found by the axe pass and fixed
rather than baselined: making the project label a block with an ellipsis let it
shrink to its `min-inline-size` of 0, so in a narrow Sectors column the value's
trigger measured **8×24** — a real SC 2.5.8 failure, because an 8px-wide button
is not clickable. The cell now floors at 4rem and the trigger at 24px.

The completion target's fine-pointer reduction is additionally gated on
`(min-width: 48rem)`. A 390px window on a laptop reports `pointer: fine`, and
that is exactly the viewport MOBILE-01's `expectMinTouchTarget` assertions stand
a thumb in — so the reduction is confined to the widths where the desktop shell
is the one on screen. Below `md` the row keeps the full 45px whatever the
pointer claims to be. Measured: 45×45 at 390, 45×28 at 768 and above.

---

## 8b. The refinement pass (REFINE, 2026-08-15)

The convergence above put DalyHub on the concepts' foundation. This second pass
is §116's mandatory convergence pass, and its subject is confidence rather than
structure: the implementation had become quiet in places where the concepts are
quiet but *crisp*, and a few surfaces were still each other's exceptions.

### The audit, measured on `assets/final-product-ui/refine-baseline/`

| # | Measured | Fix |
|---|---|---|
| 1 | **One hairline was doing two jobs.** The concepts draw a card EDGE at ~1.36:1 against its canvas (`#d3d3dd` on `#fefefe`, read off concept 1) and a row DIVIDER inside it at ~1.03. DalyHub drew both with `outline-hairline`, so at tone 91 over the tone-98 canvas the card edge measured 1.13 — a suggestion — while every list still carried a visible grid of lines. §7 and §8 at once. | `outline-hairline` 91 → **87**; new **`outline-divider`** role at 94, published as `--dh-color-divider`; task rows, Today's rows and Meetings' rows take it |
| 2 | **Today was five equal-weight rectangles.** Focus, Needs attention, Continue working, Goal progress and a panel of four bordered goal tiles — a card inside a card on the one screen that refuses panel-in-panel everywhere else. Concept 1 draws ONE bordered card (the day) and an uncarded right column. | `.dh-today__panel` is a plain section; `--card` is the day's own. Goal progress loses its panel and its tiles lose their edges |
| 3 | **Settings' page title was 28px/400** where every other page was 22px/600 — the largest and the lightest title in the product, in the same screen position. UIX-06 had matched the value `.dh-pane-header__title` happened to have by copying it, and the copy did not follow when the role moved. | Settings and Ask read `--dh-text-page-title-*` |
| 4 | **The task title was the same weight as its metadata** (§14). Five facts in a row at one weight in two colours. | Task and Today row titles step to **500**; the metadata does not |
| 5 | **Meetings was too sparse** (§40): three rows of two facts in a 900px pane, with a day heading (14px) *smaller* than the titles it grouped (16px/600). | Duration — derived from the `endsAt` already stored — leads the meta line; the day heading takes the Tasks group-heading language with its count; the title takes the row role at 500 |
| 6 | **Diary wasted its canvas** (§39). `--app-width-content` is 72rem, wider than the pane at every laptop width, so the cap did nothing and a two-line reflection sat in a 1140px card with its text in the left third. | A 56rem reading measure |
| 7 | **The phone tab rail was a different control from the desktop one.** DS-04 gave it a pale accent capsule, justified against the two *exploratory* references. Concept 3's phone Tasks rail is `List Board Calendar` as plain text with a purple underline — the desktop treatment exactly. | The capsule is gone at every width |
| 8 | **Small caps survived in four places** after this pass removed them from Tasks and Today — Notes' `PINNED`/`RECENT`, Settings' section groups, the Diary entry kind. | All four take the settled group-heading language |
| 9 | **A Goal's definition of done clamped at three lines on a phone**, where every card is full width — a 230px card in an 844px viewport for a Goal that is not even measured (§49). | Two lines below `md` |
| 10 | **Settings' phone summary was indented 12px** past the name it belongs to, because the desktop rail's inset was not reset in the phone block. | Reset |

### What §6 was worried about, checked rather than assumed

Muted text is **not** washed out. `--dh-color-text-muted` measures **8.90:1**
against the canvas — comfortably past AA, and past AAA. The pass that was needed
was the opposite one: the *boundaries* were too faint, not the text.

### Responsive

Verified at 320 / 375 / 390 / 430 across eleven routes: **zero horizontal
document overflow anywhere**. Laptop widths re-checked at 1366 and 1920.

---

## 9. Intentional deviations from the concepts

Recorded so a future pass does not re-open them.

| # | The concept draws | DalyHub does | Why |
|---|---|---|---|
| 1 | A purple or black rounded tile with a white "D" | The DalyHub brand mark — a "D" with a three-node network in the brand gradient, no tile | The mark is DalyHub's own identity, GENERATED from `scripts/icons/geometry.mjs` and gate-checked against the favicon, Apple touch icon and every PWA icon by `pnpm run icons:check`. A generic letter tile is not more DalyHub than DalyHub's mark. The tile is omitted for the reason `BrandMark.tsx` already records: at 28px a 22%-rounded square reads as a smudge. |
| 2 | `+ New goal` in the Goals page header | No page-level create on Goals | A Goal requires an Area (`NewGoalForm` takes `areaId`). A page-level action that cannot complete is worse than none; the empty state says "Open an Area to add one", which is true. §91 — omit unsupported functionality rather than draw it. |
| 3 | A scope chip with no check glyph | A leading check inside the filled chip | The check is the selection signal that survives forced colours, and its box is reserved in every segment so selecting a different scope moves nothing. It costs ~26px per segment. Colour-independent meaning (§89) outranks chip width. |
| 4 | Members / avatars on Project and Goal cards | Nothing | DalyHub is single-owner. There is no membership to draw and none was invented (§91). |
| 5 | Attachments, milestones and comment counts in the Task inspector | The fields DalyHub has | Same rule. The inspector's *anatomy* — a strong title, aligned field/value rows, light section dividers, minimal cards — is what was taken. |
| 6 | A description line on each Project card | Title, context, attention line, progress, counts | The card view model does not carry a description, and adding one is a loader change rather than a visual one. Recorded as a remaining difference, not as done. |
| 7 | A per-group bordered container around the task rows (concept 3) | Rows on the page, hairline-separated (concept 2) | The two concepts disagree here. §2 makes concept **2** the authority for Tasks, and concept 2 draws no per-group container — as does DS-04, for the reason it recorded: a bounded surface per group is most of what makes a page read as a stack of panels. |
| 8 | "50 Projects loaded" as "50 Projects" | "50 Projects loaded" | Not a copy leak. `count-label.ts` argues it and the argument holds: it is the difference between "there are 50" and "you can see 50 of an unknown number", and a count that quietly means the second is a count that lies. |

---

## 10. Remaining differences

Honest, and specific.

1. **Project cards carry no description** — deviation 6 above.
2. **The concepts' navigation glyphs are outline-stroke**; DalyHub's are filled
   Material Symbols. §66 forbids introducing a new icon library, and the set is
   generated and gate-checked. The *size* and *weight* relationship (small,
   monochrome, secondary to the label) matches.
3. **Concept 1's Today has a Schedule column with times and a colour bar.**
   DalyHub has one (CAL-01) and renders it when the day has events; on a day
   with none the grid falls back to two regions rather than drawing an empty
   column. The concept always has meetings; a real Saturday does not.
4. **Goals has no gallery/list switcher.** Concept 1 shows one. DalyHub's Goals
   collection is gallery-only; adding a list presentation is a feature, not a
   paint change.
5. **The Notes filter band still carries four controls** (search, sort, more
   filters, apply) where concept 1 shows a search field and a create action.
   The controls are real and each does something; reducing them is a
   progressive-disclosure change worth doing deliberately rather than by
   deleting affordances in a visual pass.
6. **Analytics** matches the concept's restraint in shape (a headline row, two
   panels, thin strokes) but still shows four headline figures where concept 1
   shows two larger ones.
