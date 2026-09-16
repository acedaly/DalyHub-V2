# DALYHUB_RESIDUAL_DEBT.md — what is left, prioritised

> **Status:** current as of 2026-09-16, after the final deep engineering pass.
> **Scope:** this is the SHORT list — what a maintainer should actually act on,
> in order. It is deliberately not a wishlist.

## How this relates to the other registers

DalyHub has three debt records and they answer different questions. This one does
not replace them; it says which of their entries still matter.

| Register | What it is | Status |
| :-- | :--- | :--- |
| [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) | 266 numbered entries, each with its own evidence, decision history and resolution. The per-item HISTORICAL record. | **Keep.** Its anchors are referenced from ADRs, roadmaps and PRs, and its value is that a closed entry says why it closed. Do not prune it. |
| [`UNTITLED_UI_MIGRATION.md` → named maintenance debt](../design/UNTITLED_UI_MIGRATION.md#named-maintenance-debt) | 16 rows of FRONTEND maintenance, each a specific file or count. | **Keep**, corrected by this pass. It is the authority for frontend items; this document points at it rather than restating it. |
| **This file** | The prioritised current state across all of them. | The thing to read first. |

**Every entry below was re-verified against the repository during this pass.** An
item that a register claimed and the code contradicted is recorded as a correction
rather than copied forward — §6.

---

## P0 — production and data safety

### P0-1 · Nothing in this repository knows what production is running

- **Problem.** The live release, the applied migration head and the secret names
  set on the Worker are all unverified. The last direct observation on record is
  the V2 upgrade in August 2026.
- **Evidence.** `DEPLOYMENT.md` → *Current status*; `pnpm run verify:production`
  reports `SKIPPED` rather than a pass without credentials.
- **Impact.** A deploy is planned against an unknown starting state. That matters
  more now than it used to, because the pending set decides whether the
  migrate-then-deploy window is reversible (§P0-2).
- **Solution.** The owner runs `pnpm run verify:production` and
  `pnpm run db:production:list` with credentials, and records both in
  `DEPLOYMENT.md` → *Current status* with a date.
- **Why not done here.** It needs Cloudflare credentials this environment does not
  and must not have. **Owner action.**

### P0-2 · The migrate-then-deploy window is not reversible for this release

- **Problem.** `DEPLOYMENT.md`'s order puts the migration before the deploy
  because the previous Worker keeps serving a migrated database. That holds for an
  additive migration and not for four of the 58 — `0031`, `0049`, `0050`, `0051`
  each remove something an older Worker may read.
- **Evidence.** `pnpm run db:compat`, derived by applying every migration to a
  throwaway SQLite database and diffing the schema after each;
  [`migration-ledger.json`](../development/migration-ledger.json).
- **Impact.** If the deploy fails after the migration succeeds, rolling the Worker
  back is not a recovery, and the alternative discards every write since the
  backup.
- **Solution (already delivered).** The ledger is committed and checked in CI;
  `deploy:production:release-check` prints `ROLLBACK BOUNDARY` when the pending set
  crosses one; the recovery runbook is
  [`DEPLOYMENT.md` → When the migration succeeded and the deploy did not](../development/DEPLOYMENT.md#when-the-migration-succeeded-and-the-deploy-did-not).
- **Credit where it is due, and why it still needed fixing.** The V3.0.0 release
  checklist's §1.2 already said "there is no rollback after `0050`" — worked out
  by hand, for that release. What was wrong was the STANDING procedure:
  `DEPLOYMENT.md` said the opposite in general terms, so the next release would
  have started from the wrong premise. The ledger generalises what one release
  team already knew into something every release gets for free.
- **What remains.** Running the release-check against real production (P0-1), and
  taking both backups at step 1. **Owner action.**

### P0-3 · The off-Cloudflare encrypted backup has never been produced

- **Problem.** The GitHub-artifact backup (AUDIT-11) is the only copy that is not
  on Cloudflare, and it has never actually run, because the GitHub `production`
  environment holds no secrets.
- **Evidence.** `PRODUCT_DEBT.md` → DEBT-198, unchanged.
- **Impact.** A Cloudflare-side incident would leave only Cloudflare-side copies.
- **Solution.** Set the recovery key in the GitHub `production` environment and let
  the workflow run once; verify the artifact decrypts.
- **Why not done here.** Needs repository secrets. **Owner action.**

---

## P1 — user-facing reliability

### P1-1 · The E2E gate carries latent timing races

- **Problem.** "Green" is probabilistic rather than certain.
- **Evidence.** DEBT-203, DEBT-125, and one **directly observed** instance during
  this pass: `css-cascade-ownership.spec.ts` failed with
  `page.evaluate: Execution context was destroyed, most likely because of a
  navigation` — a fixed `waitForTimeout(2500)` racing the route's own hydration.
- **Impact.** A red build that is not about the change that found it, which is the
  most expensive kind of failure a gate can produce.
- **The scale of it, corrected.** The suite has 53 `waitForTimeout` calls, and a
  first reading of that number overstates the gate's exposure by about four to
  one. **Forty-one are in `*-screenshots.spec.ts`**, which `playwright.config.ts`
  `testIgnore`s unless `CAPTURE_SCREENSHOTS=1`, so the required gate never runs
  them. Of the twelve that remain, four are documented, correct uses — proving
  that something does NOT happen requires letting time pass, and a poll for
  "still equal" succeeds on its first sample whether or not the thing was about
  to happen (`csp.spec.ts`, `interaction-consistency.spec.ts`,
  `life-admin.spec.ts`, `pwa-offline.spec.ts`'s deliberate ten-second
  observation window). Three more sit after a viewport resize with a retrying
  assertion behind them, where the wait is redundant rather than racy.
- **What this pass fixed.** The four in `css-cascade-ownership.spec.ts`, which
  now wait on `data-editor-ready` through one shared helper that fails with a
  sentence rather than a raw locator timeout; and the two in
  `activity-feed.spec.ts`, which clicked "load more" and then waited 150 ms /
  200 ms before asserting — those now poll `aria-setsize`, the count the
  component itself publishes, so the assertion cannot run before the page it is
  about has landed.
- **What remains.** A genuinely small number of judgement calls, plus the deeper
  problem the duration was never the whole of: a node can be detached by
  revalidation between locating it and interacting with it, which no wait fixes.
  That is P2-11's territory.

### P1-2 · Chromium is not iPhone WebKit, and 3.1 is a phone release

- **Problem.** Every automated result in this repository is Chromium. DalyHub 3.1
  makes the installed PWA a mobile application.
- **Evidence.** `MOBILE_WEB_EXPERIENCE.md`; the absence of any WebKit run.
- **Impact.** Safe-area insets, the Visual Viewport listener, keyboard behaviour,
  install flow and service-worker update behaviour are the places iOS diverges,
  and all five are 3.1 subject matter.
- **Solution.** [`MOBILE_WEB_EXPERIENCE.md` §13](../design/MOBILE_WEB_EXPERIENCE.md) —
  a 23-item checklist covering Safari and the installed app, launch and
  lifecycle, capture and keyboard, a meeting captured in a real meeting, and
  geometry. **All 23 are ⏳.** It was reviewed in this pass and needed no
  improvement: it already says what a Playwright run cannot answer and why, and
  where to record the results (the PR, or `PRODUCT_DEBT.md` when an item fails).
- **Why not done here.** No device. **Owner action**, and it must not be recorded
  as automated evidence — the checklist's own rule is that a ticked box nobody
  did is a lie the next person builds on.

---

## P2 — engineering maintainability and performance

### P2-1 · `~/shared/forms` puts a calendar on routes with no date picker

- **Problem.** The shared forms barrel has 27 exports including
  `CalendarDateField`, which pulls React Aria's Calendar and
  `@internationalized/date`'s manipulation module.
- **Evidence.** `forms-*.js` is 119.5 kB raw / 35.5 kB gzip, of which roughly
  51 kB raw is calendar (`useCalendarState` 12.7, `@internationalized/date`'s
  manipulation module 12.3, `Calendar.mjs` 10.3, `useCalendarCell` 8.3,
  `CalendarGrid.tsx` 7.5). The chunk is in the static graph of `/today`,
  `/tasks`, `/projects` and `/notes`. Notes' three forms — `NewNoteForm`,
  `NoteContentForm`, `NoteTagsForm` — import from the barrel and **none of them
  uses a date field**; `app/modules/notes` contains no reference to `DateField`
  or `CalendarDateField` at all.

  Whether the barrel is the ONLY route by which `/notes` reaches the calendar is
  not established here, and is the first thing to measure before doing the work:
  `pnpm run perf:budget` after the split is what answers it.
- **Impact.** ~15 kB gzip on routes that render no date picker.
- **Solution.** Split the barrel the way `~/shared/charts` and `~/shared/offline`
  were split in this pass: the barrel keeps what every form needs; the calendar
  field is imported from its own module by the surfaces that draw one.
- **Why not done here.** It is the product's shared form system with call sites in
  every module, and the payoff is a fifth of the Recharts fix. It is the right
  next bundle change and it deserves its own careful pass rather than being
  bundled into this one.

### P2-2 · Every E2E fixture statement boots wrangler

- **Problem.** `e2e/d1.ts` spawns wrangler per statement. This pass removed the
  `pnpm exec` layer (median 2,275 ms → 2,019 ms locally, n=6) and memoised the one
  query the register named as duplicated. The remaining ~1.8 s is wrangler itself.
- **Evidence.** Named maintenance debt items 11 and 15; 114 `d1Execute`, 51
  `d1Query` and 4 `d1ExecuteFile` call sites, most in a `beforeEach`.
- **Impact.** Test-harness cost only. It is the largest single remaining lever on
  E2E wall clock.
- **Solution.** Fewer statements per invocation. `d1Execute` already accepts an
  array and sends it to one process; the work is going call site by call site and
  batching what is genuinely one sequence.
- **Why not done here.** The obvious alternative — reading the SQLite file with
  `node:sqlite` — was tried in an earlier pass and **reverted for cause**: a
  `readOnly` connection cannot maintain the WAL index and silently returned stale
  snapshots, which can turn a real failure into a false green. A read-WRITE
  connection would not have that limitation, but proving it does not requires
  reproducing a timing-dependent failure, and being wrong means false greens in
  the 16 files that use it — 11 spec files and 5 shared fixtures — to check
  invariants the interface cannot show. Not a change to make without that proof.

### P2-3 · Two colour engines ship side by side

- **Problem.** `tokens.css` (8,453 generated lines, five schemes × two
  appearances) and `untitled/theme.css` both define colour. `dh-tokens` sits after
  `theme` so DalyHub's values win where they collide.
- **Evidence.** Named maintenance debt item 14. Measured in this pass: the
  `dh-tokens` layer is 224 kB of the 796 kB built stylesheet.
- **Impact.** **Maintainability, not bundle size — and the distinction is the
  whole point.** Two measurements, both taken this pass:

  | | raw | gzip | brotli |
  | :-- | --: | --: | --: |
  | the four non-default colour schemes | 154 kB | 7.1 kB | **2.4 kB** |
  | 138 `--md-sys-color-*` roles with no `var()` consumer in `app/` (of 205 defined) | 82.6 kB | 5.4 kB | **2.2 kB** |

  Brotli is what Cloudflare serves. **Neither is a performance problem**, because
  both are near-identical generated token lists that a compressor removes almost
  entirely by itself.

  What they ARE is 8,453 lines of generated stylesheet of which roughly two
  thirds of the colour section has no consumer, in a repository whose next
  engineer has to decide which of two colour vocabularies to reach for. The 138
  unconsumed roles were verified as unconsumed: `colorVar(role)` builds
  `var(--md-sys-color-${role})` dynamically and has **zero** callers outside the
  token module, so nothing reaches them at runtime either. `test/unit/tokens/`
  asserts contrast over all 205, which is coverage of a palette rather than a
  product consumer.
- **Solution.** Decide between the two engines, with evidence. It is a
  design-system question.
- **Why not done here.** Out of scope for a consolidation pass, and — importantly
  — the performance argument that would have justified rushing it **does not
  survive measurement**. Anyone who reaches for the 154 kB or the 82.6 kB figure
  as a bundle argument should read the brotli column first.

### P2-4 · Seven legacy control stylesheets, 1,899 lines, in `dh-legacy`

- **Problem.** `floating.css` (593), `ui.css` (536), `filters.css` (380),
  `pill.css` (125), `tooltip.css` (92), `overflow-menu.css` (91),
  `skeleton.css` (82) paint generic controls Untitled owns.
- **Evidence.** `CSS_CASCADE_ARCHITECTURE.md` → the `dh-legacy` inventory, and
  named maintenance debt item 12. `progress.css` (67 lines) was deleted in this
  pass with the component it painted.
- **Impact.** None on screen — they sit in `dh-legacy` and lose to every Untitled
  utility.
- **Solution.** Delete file by file, replacing each with the Untitled component.
- **Why not done here, and a warning.** Every class in all seven was checked and
  **all are live**. A static grep initially reported six `ui.css` modifiers as
  unused; all six are built at runtime (`` `dh-surface--${variant}` ``). Do not
  delete on a grep.

### P2-5 · A second tooltip implementation beside Untitled's

- **Problem.** `~/shared/tooltip/Tooltip.tsx` is DalyHub's own, imported by 9
  modules — `IconButton`, the editor toolbar, the overflow menu, the user menu,
  both top bars, the primary navigation. Untitled's vendored `base/tooltip` is
  used by Untitled's own components.
- **Evidence.** Corrected in this pass; the register previously called this file
  **dead** — see §6.
- **Impact.** None today. It is a design-system defect under CLAUDE.md rule 1, not
  a defect on screen.
- **Solution, checked against upstream in this pass.** Untitled's `base/tooltip`
  takes `title`, `description`, `arrow` and `delay` and **has no shortcut slot** —
  confirmed by reading the vendored source at revision `0b78cd49`. Both `title`
  and `description` are `ReactNode`, so the convergence is either passing the
  formatted chip as part of `description`, or adding a `shortcut` prop through
  `~/shared/ui/untitled/overrides/`, which exists for exactly this and which
  `scripts/vendor-untitled.mjs` preserves across a re-vendor. Then DalyHub's
  tooltip and `tooltip.css` retire together.
- **Why not done here.** It is a real component migration with a real behaviour to
  preserve, across the whole shell chrome, and it was mis-recorded as a deletion.
  Correcting the record was the urgent half.

### P2-6 · `forms.css` mixes generic paint with field geometry, and holds an accessibility floor

- **Problem.** 1,120 lines that are two things. Demoting the file to `dh-legacy`
  correctly retires the paint and incorrectly retires the geometry with it.
- **Evidence.** Named maintenance debt item 13. Measured: `.dh-combobox__input`
  loses the `padding-inline-end: 32px` that reserves room for its own trailing
  control.
- **Impact.** None today; the file stays in `dh-product` until it is split.
- **Solution.** Split rule by rule. **Whoever does it must keep the
  `@media (hover: none)` `min-block-size` in `dh-product`** — it is the only thing
  holding WCAG 2.2 §2.5.8 on a coarse pointer, and moving the file drops a shared
  field to 38 px at 900 px under `hover: none`. Gated by
  `e2e/touch-targets.spec.ts`.

### P2-7 · Forty-nine `.cm-*` rules should live in `EditorView.theme()`

- **Problem.** Seven rules cannot be layered while CodeMirror injects its CSS at
  runtime. That is a consequence of where the rules live, not a law.
- **Evidence.** Named maintenance debt item 16; `CSS_CASCADE_ARCHITECTURE.md` →
  *The one exception*.
- **Impact.** One unlayered file, now guarded automatically in both directions
  (§6) rather than by a hand-written list.
- **Solution.** Move the rules into CodeMirror's own `EditorView.theme()`, where
  they share the StyleModule and precedence of the defaults they override. The
  exception file then goes entirely.
- **Why not done here.** It is a refactor of a working editor and belongs to its
  own change. The automated guard makes the current state safe to leave.

### P2-8 · `md-state-layer` has 36 usages across 23 component files

- **Problem.** A working, tested, single-implementation hover/focus/pressed model
  that predates Untitled's own hover treatments.
- **Evidence.** Re-measured in this pass: 36 occurrences in 23 `.tsx`/`.ts` files,
  plus 7 stylesheets. (The register said 34 across 23 — close, and the file count
  was right.)
- **Impact.** None. `base.css` declares it inside `@layer base`, the lowest
  DalyHub layer, so a component that migrates to Untitled's hover treatment wins
  automatically rather than having to out-specify it.
- **Solution.** One pass, component by component.

### P2-9 · The shell precache is 1,481 kB raw / 333 kB gzip

- **Problem.** What a phone downloads at install time.
- **Evidence.** Measured this pass. Down from 1,569 kB raw / 343 kB gzip before
  it, via the root-chunk and offline-barrel fixes. DEBT-151 recorded 1,321 kB at
  an earlier point, so it grew before it shrank.
- **Composition.** CSS 795.5 kB raw / 94.6 kB gzip in one file; 27 JS chunks
  646.9 kB raw / 201.8 kB gzip; 6 other assets 38.4 kB.
- **Impact.** One install-time download, cached afterwards.
- **Solution.** The CSS half is P2-3's subject and does not pay. The JS half is
  the shell's real dependency graph and is already minimal enough that further
  cuts would remove offline behaviour.
- **Why not pursued further.** The largest remaining precached chunks are
  `entry.client` (React DOM), `errorBoundaries` (the React Router runtime) and
  `sheet` (tailwind-merge plus React Aria overlays). None is removable without
  removing the framework.

### P2-10 · Today ships up to 200 overdue rows to draw three

- **Problem.** `/today`'s `.data` payload is 88 kB on a four-year-old workspace
  and **78 kB of it is `day.overdue`** — 168 serialized Tasks, of which the
  timeline draws three plus the day's completions.
- **Evidence.** DEBT-248, measured by
  `test/kernel/navigation-statement-budget.test.ts`'s payload instrument.
  `OVERDUE_SHOWN` is 3; `PLANNING_SCHEDULED_LIMIT` is 200, so this is the shape
  at scale rather than a fixture artefact.
- **Impact.** The largest single item left in Today's cost, on the route the owner
  opens every morning — and it is **larger than everything this pass removed from
  Today's JavaScript** (78 kB serialized against 146 kB gzip of chunks). It is
  data, not code, so no bundle change reaches it.
- **Why it is sent.** `TodayScreen` re-buckets `[...overdue, ...today]` on every
  render so an optimistic edit re-files a row immediately, and four figures are
  derived from the full buckets — the canonical `todayCount`, `openTodayCount`,
  the `+n more overdue` remainder and the completed run. The rows are a whole
  collection standing in for four counts.
- **Solution.** The loader sends the rows the surface can draw plus the counts it
  derives, as counts — the "a count in SQL beside a page in SQL" pattern the
  obligation page already uses.
- **Why not done here.** Assessed and declined twice before, for the reason that
  still holds: it changes Today's data contract across `day-view.ts`, the 96 kB
  `TodayScreen.tsx` and their tests, and a mistake in that surgery makes Today
  *wrong*, which is worse than making it 88 kB. It needs Today's whole journey
  set re-proved, which a consolidation pass cannot honestly do. **It is the right
  next performance change after P2-1.**

### P2-11 · E2E specs assert against accumulated workspace state

- **Problem.** One dev server, one SQLite file, and specs that read what earlier
  specs left behind — so re-ordering the suite can change what they see.
- **Evidence.** DEBT-173, unchanged. `pnpm run e2e:order-proof` exists precisely
  to compare two gate runs test by test.
- **Impact.** A spec can pass for a reason its author did not intend.
- **Solution.** Per-spec workspace isolation, which is a substantial change to how
  every fixture is written.

---

## P3 — worthwhile, not urgent

| # | Item | Where |
| :-- | :--- | :--- |
| P3-1 | Nine bare native controls carry their own field paint instead of using `inputClassName()` | migration register item 1 |
| P3-2 | `~/shared/ui/Card` (`.dh-surface`) paints from DalyHub tokens. **Re-checked through the Untitled connector in this pass: there is still no generic `base/card`** — every catalogue hit for "card" is a marketing SECTION (hero, pricing, CTA, testimonial). So nothing upstream is waiting to take this over, and the entry is a question about whether the box is needed rather than a migration | item 2 |
| P3-3 | `TagChip` and `PanelHeading` are DalyHub's own where Untitled ships `base/tags` and `application/section-headers` | item 4 |
| P3-4 | `application/file-upload`'s drop zone would replace ~370 lines DalyHub wrote | item 7 |
| P3-5 | A Project inside a Goal record carries no health | item 8 |
| P3-6 | The Diary week strip's focus order has never been measured | item 9 |
| P3-7 | A bounded `people.getByIds` | item 10 |
| P3-8 | 68 open P3 entries in `PRODUCT_DEBT.md`, each with its own evidence | that register |

---

## Later — genuinely optional

- **`application/progress-steps`** for the guided Review's step rail. Blocked on
  interactive Untitled Pro CLI access, not on design (migration register item 6),
  and **re-checked through the Untitled connector in this pass**: the catalogue
  reports `has_pro_access: true` and returns the component's METADATA (6 files,
  `access: "pro"`), but source still comes from
  `npx untitledui@latest add progress-steps`, which the tool's own instruction
  says needs `npx untitledui@latest login` first. So the register's claim stands,
  now with the boundary named — catalogue access is not source access. The
  current implementation is retained and documented, never faked.
- **Splitting `tokens.css` per colour scheme.** Measured at 2.4 kB brotli. Do not.
- **A second E2E tier for WebKit.** Would need a real device to be meaningful; a
  WebKit run in CI is not an iPhone either.

---

## 6. Corrections this pass made to the existing registers

Recorded rather than silently fixed, because a register that was wrong once can be
wrong again and the shape of the error is useful.

| Claim | Where | What is actually true |
| :-- | :--- | :--- |
| "`tooltip.css` has NO CONSUMER … `dh-tooltip` appears **zero** times in the rendered DOM. 92 lines with no consumer." | migration register item 12a | **Wrong, and acting on it would have been a visible regression.** There are two tooltips; the audit measured Untitled's. DalyHub's renders `className="dh-tooltip dh-motion-reveal"` and carries no Untitled utility, so `tooltip.css` is its entire appearance. Corrected in place. |
| "Every migration from `0006` onward is additive … no column … is dropped" | `DEPLOYMENT.md` | True of `0006`–`0025`, which is when it was written. Four later migrations drop a column or a table. Corrected, and now derived by `pnpm run db:compat` rather than asserted. |
| "largest route chunk (Today) — 78 kB raw / 22 kB gzip" | `PERFORMANCE.md` §7 | Measured the route's own chunk. `/today`'s static graph was **515 kB gzip across 92 chunks**, 111.6 kB of it Recharts. Replaced with a per-route measurement and a CI budget. |
| "`progress.css` … has no consumer" | migration register item 12a | **Right.** Component and stylesheet deleted. |
| "`md-state-layer` — 34 usages across 23 files" | migration register item 5 | 36 across 23. Close enough that it was not misleading; restated for accuracy. |

### Claims that were re-checked and ARE still true

Recorded so the next audit does not spend the same time. All three are claims
about a third party, checked against the third party rather than against memory
(CLAUDE.md's rule), through the Untitled connector and the vendored source:

| Claim | Still true because |
| :-- | :--- |
| Untitled ships no generic Card (item 2) | every catalogue hit for "card" is a marketing SECTION — hero, pricing, CTA, testimonial, login. There is no `base/card`. |
| Untitled's tooltip has no shortcut slot (P2-5) | `base/tooltip` takes `title`, `description`, `arrow`, `delay`, read off the vendored source at revision `0b78cd49`. |
| `application/progress-steps` is not retrievable (item 6) | the connector reports `has_pro_access: true` and returns the component's METADATA, which reads like access and is not. Source comes from `npx untitledui@latest add`, which needs `npx untitledui@latest login` first. **Catalogue access is not source access.** |

Two numbers were also restated against the tool that produces them, both in this
document's own direction of travel: `DEPLOYMENT.md` said fifteen migrations narrow
a `CHECK` and `db:compat` says fourteen; `e2e/d1.ts` said "fifteen spec files" use
`d1Query` and it is sixteen files — 11 spec files and 5 shared fixtures.

### A method note for whoever audits next

Two of the three wrong claims above share a cause: **a measurement that could not
see the thing it was about.** The tooltip audit rendered a matrix that never drew
DalyHub's tooltip; the chunk table measured a number that cannot contain a
transitive import. Both looked like evidence.

The three checks that would have caught them, and which this pass added:

1. `pnpm run perf:budget` — measures a route's **whole static graph**, not one chunk.
2. `pnpm run db:compat` — **derives** the migration boundary rather than restating it.
3. `e2e/css-cascade-ownership.spec.ts` → the CodeMirror contest test — derives the
   exception from the **live** stylesheet, and carries sanity assertions that fail
   when it has measured nothing.

Each of those is a measurement that fails loudly when it is blind, which is the
property the three wrong claims lacked.
