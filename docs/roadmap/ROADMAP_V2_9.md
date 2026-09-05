# ROADMAP_V2_9.md — DalyHub V2.9, INSIGHT — and the sequence to V3

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_7.md`](ROADMAP_V2_7.md)
> hold V2.1 … V2.7 (all complete, V2.4 apart from V2.4-GATE-01's owner-held
> halves), and [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md) holds V2.8 (**complete
> 2026-09-04**, less DEBT-203's owner-held ten-run count).
>
> **This file is V2.9, and it is where new work goes.** It was defined on
> 2026-09-04 against `main` at `6b4d4a8` (CONV-03 merged, PR #252) by the
> post-V2.8 product-strategy pass, which re-measured the product rather than
> inheriting V2.8's LATER table, chose a theme, numbered its debt from
> **DEBT-238** and recorded its decisions as
> [ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export).
> The analysis behind it — the five-question coherence test, the domain
> decisions, the four sequences compared — is
> [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md);
> this file is the roadmap truth and does not repeat it. The rules are
> unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build; this
> tells you *what*. Status is updated in the PR that changes it. No time
> estimates, no dates on unstarted work.
>
> **This file also carries the whole remaining V2 sequence** —
> [V2.10 … V2.16](#the-remaining-v2-sequence) — at decreasing resolution and
> with an explicit label on each: **DEFINED** (implementation can begin),
> **PLANNED** (shape and boundary decided; defined by its own pass against a
> re-measurement), **PRESUMPTIVE** (direction recorded; everything about it
> may change). Only V2.9 is DEFINED. A later release is never
> implementation-ready because it appears here.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.9 INSIGHT — COMPLETE, 2026-09-04.** All five items,
INS-00 … INS-04, delivered in order, closing **DEBT-241, DEBT-238, DEBT-239,
DEBT-212 and DEBT-103**. The implementation decisions are recorded in
[ADR-117](../decisions/ARCHITECTURE_DECISIONS.md#adr-117-insight--one-history-vocabulary-over-stores-already-written-a-bound-that-is-stated-rather-than-applied-and-a-link-check-that-makes-the-map-a-gate);
what each item actually delivered is under its own heading below, including
where the measurement that defined it turned out to be wrong.

**Successor: V2.10 LIFE ADMIN, PLANNED** — see [the sequence](#the-remaining-v2-sequence).

**The completion pass (2026-09-05).** PR #254 merged the whole programme with
its gate red: ten TypeScript errors vitest never sees (nine in tests, one in the
degraded Analytics page's own model) and two E2E journeys that were also red
on `main` before any V2.9 code existed (a search race and a strict-mode
locator). A whole-programme review then found twenty real defects behind the
green tests, each fixed with the test that would have caught it and recorded
under its item below: month buckets that were calendar months only when the
window ended on a 31st; two D1 reads that sliced past their bound and a series
read clamped at eight while the kernel said twelve; three surfaces reading
three different across-Reviews series for one Goal; a sentence that called
"the 3 Reviews that recorded it" "the last 3"; a series read blind to archived
and reopened Reviews; an understated carry-over count and a door to the wrong
Tasks view; a failed read shown as "0 Areas" and as "no Goal has two readings";
Goal shapes drawn from readings outside the selected window; bucket sums
printed beside the window's own totals; an address bar that could name a
window the page was not drawing; and two query budgets measured on the path
where their conditional reads never fire. **Nothing here changed what the
programme delivers; it changed whether the delivery could be proved.**

---

## The theme: INSIGHT — the history the product already holds, given back

**DalyHub already remembers what happened; V2.9 lets it say so.** One
deterministic layer — a window, a grain, a series, an aggregate — over the
stores the product already writes, consumed first by the three surfaces that
already ask "what is changing?", and reusable by every domain that follows.

This is the presumptive V2.9 that V2.8 named, confirmed by re-measurement —
**and it is not charts.** Measured on `6b4d4a8`:

- `review_insight_snapshots` receives one row per completed Review (≈52 a
  year; up to 40 Project states, 25 Goal states, 20 Area counts, 50 carry-over
  ids per row) and **only `priorReviews[0]` is ever read**
  (`review-insights-context.ts:801-804`). `listSnapshotsBefore`
  (`d1-review-insight-repository.ts:537-557`) has zero production callers.
- `listMeasurementSeries` (`d1-goal-measurement-repository.ts:583`) has zero
  production callers ([DEBT-212](../product/PRODUCT_DEBT.md#-debt-212--listmeasurementseries-has-no-caller--p3--resolved-2026-09-04-v29-ins-02--ins-03)).
- The kernel `ActivityRepository` (`app/kernel/activity/activity-repository.ts:53-113`)
  has **no time-window read** — its inputs carry `type?`, `limit?`, `cursor?`
  and no from/to — so five adapters carry their own windowed SQL
  ([DEBT-238](../product/PRODUCT_DEBT.md#-debt-238--the-kernel-activity-contract-has-no-time-window-read-so-five-adapters-carry-their-own-windowed-sql--p3--resolved-2026-09-04-v29-ins-01)).
- Analytics offers three fixed ranges (7×1 day, 4×7 days, 6×14 days) chosen
  to fit `MAX_TREND_PERIODS = 8` (`analytics-range.ts:20-27, 44-70`); its
  bucketer is module-private; "completions per week for twelve weeks" is not
  askable; Projects and Goals completed have no line
  ([DEBT-239](../product/PRODUCT_DEBT.md#-debt-239--analytics-range-vocabulary-is-three-presets-bucketed-to-fit-the-reviews-eight-period-cap-and-there-is-no-shared-window-grain-or-series-primitive--p3--resolved-2026-09-04-v29-ins-01--ins-03)).
- `/today/activity` is a tested resource route with no UI
  ([DEBT-103](../product/PRODUCT_DEBT.md#-debt-103--the-workspace-wide-activity-feed-endpoint-has-no-ui-consumer--p3--resolved-2026-09-04-v29-ins-04)).

Unanswerable today although the data exists: a Goal's contribution over the
last six Reviews; which Projects were at risk in three consecutive Reviews;
which Tasks carried over at every Review this quarter; completions per week
over twelve weeks; what changed in the workspace in a chosen fortnight.

V2.9 answers those, stores nothing new, adds no navigation, and leaves behind
the layer that [V2.12 Finance](#v212--finance-core-planned--gated-on-debt-198) computes budget
variance with, [V2.13 Reports](#v213--reports-presumptive) saves definitions
over, and [V2.14 grounded AI](#v214--grounded-ai-presumptive--gated-on-the-owner-held-key) is handed its
facts by.

---

## Where V2.8 left the product

All four CONV items delivered 2026-09-02 … 2026-09-04: the gate tells the
truth (CONV-00), one Task anatomy everywhere a Task can be acted on (CONV-01,
CONV-02), a deterministic suite with a `workflow_dispatch` stability trigger
(CONV-03). One owner-held measurement remains — DEBT-203's ten-run count —
and DEBT-125/157 stay ◐ on their unweakened conditions. Nothing in V2.9
carries a migration, so nothing in V2.9 waits on it.

**Recoverability, re-checked 2026-09-04**: the R2 D1 backup tier is the
healthy copy; the off-Cloudflare copy is owner-held
([DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)).
It is **not** a V2.9 gate. It **is** a hard gate for V2.12 Finance, and it
is listed with the owner-held actions below so it has two releases to clear.

---

## Why now, and why not the alternatives

The strategy pass compared four sequences
([§10](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#10-the-sequencing-options-compared)).
Insight is first because it is the smallest release in the sequence, it needs
nothing from the owner, it carries no migration, it proves the rules money
will later run through (flat statement counts, named windows, no score) on
data that already exists, and three of the four owner priorities depend on
it: Finance's budget-vs-actual, Reports' executor and AI's fact block are all
this layer. It is the owner's third priority in name and the first two
priorities' prerequisite in fact.

**The honest objection**, recorded in the strategy: if the owner would rather
have Life Admin first, the swap is architecturally free — V2.10 depends on
nothing in V2.9 — and costs one budget-vs-actual built inside Finance rather
than on the shared layer.

---

## Product outcome

At the end of V2.9 the owner can:

- open a Review and read, in words with the counts that produced them, how
  each Project's health and each Goal's contribution has moved **across the
  last several Reviews**, and which commitments have carried over at every
  one of them;
- open a Goal and see its story carry one more line — its contribution across
  Reviews — beside the measurement trend it already plots;
- open Insight (today's Analytics, same URL), choose a real window and a
  grain, and read Tasks, Projects and Goals completed per week or per month
  up to two years back, with every figure naming its window
  and its bound, plus a compact series for every measured Goal and a bounded
  list of what changed in that window;
- trust that every one of those figures is computed once, in the database or
  a pure evaluator, from the same stores every other surface reads, with
  nothing scored, graded or stored.

And every later release can call the same layer.

---

## NOW

Five items. The map first — this file carries the whole future sequence and
its cross-references must resolve — then the kernel, then its three
consumers.

```
INS-00 ──► INS-01 ──► INS-02
 (map)     (kernel)   (across Reviews)
                  └──► INS-03 (Insight range)
                  └──► INS-04 (what changed)
```

**All five delivered 2026-09-04, in that order.** What each actually shipped is
recorded under its own heading below, including three places where implementing
it corrected the definition:

- **INS-00's baseline was wrong, and re-measuring was part of the item.** The
  defining pass measured 447 broken links of 6,601; a fresh measurement found
  **422 of 6,737** (233 anchors, 39 non-image files, 150 screenshots), because
  that pass repaired eleven of its own as it went and because the checker reads
  reference definitions and nested image links the estimate did not.
- **DEBT-238's "five adapters" was wrong in BOTH directions.** Three of the five
  named carry no window predicate at all; two the entry did not name do. The
  proposed `grep` closing condition was replaced by a registry test that
  enumerates every remaining bound with the reason it did not converge.
- **INS-03's statement budget was first measured on a fixture with no Goals**,
  which understated the page by three conditional reads. The honest figure is
  **12**, still flat at every window and grain.

One item's non-goal was tested and held: **nothing was migrated and nothing new
is stored.** Every figure V2.9 shows is derived at read time from
`spine_records`, `activities`, `goal_measurements` and the Review snapshots the
product was already writing.

---

### ☑ INS-00 — The map tells the truth — **delivered 2026-09-04** — closes [DEBT-241](../product/PRODUCT_DEBT.md#-debt-241--no-documentation-link-or-anchor-check-exists-and-447-local-links-are-broken--p2--resolved-2026-09-04-v29-ins-00)

**Every local link and anchor in the documentation resolves, and a Static
check keeps it that way.**

- **Measured 2026-09-04** with a temporary checker over every `docs/**/*.md`,
  `AGENTS.md` and `README.md`: **6,601 local links, 447 broken** — 254
  anchors that drifted when a heading changed (chiefly debt entries whose
  headings gained a `— **RESOLVED …**` suffix, and ADR titles amended after
  they were linked), 43 missing non-image files, 150 missing screenshots under
  `docs/design/assets/`. Eleven are in `ROADMAP_V2_8.md`, all to debt
  headings resolved by V2.8 itself; those eleven were repaired by the pass
  that defined this file, the rest were not.
- **Intended.** `scripts/docs-links.mjs check` (`pnpm run docs:links:check`),
  a `Static` step beside `e2e:fixture-dates:check`: resolves every relative
  link and `#anchor` in Markdown using the same slug rule GitHub renders with
  (lower-case; letters, digits, spaces, hyphens and underscores kept; spaces
  to hyphens; duplicate headings suffixed `-1`, `-2`), skips any target with
  a URI scheme, treats a fenced code block as prose-free, and fails naming
  file, line and target. **No allowlist.** A missing screenshot is repaired
  by committing the image or by replacing the reference with a sentence that
  names what the image showed; a drifted anchor is repaired at the link, never
  by renaming a heading back (headings carry their resolution on purpose).
- **The rule this item records**, in `AGENTS.md §12` and the debt register's
  "how to use" section: *resolving or amending an entry changes its heading
  and therefore its anchor; the PR that changes a heading repairs every link
  to it in the same change, and Static proves it.*
- **Falsification.** Break one anchor and one file path on a scratch tree;
  Static names both. Annotating is not an escape: there is no annotation.
- **Acceptance.** The check is green on `main` with zero findings; the script
  has unit tests for the slug rule against the repository's own heading forms
  (`☐ DEBT-NN — … — P2`, `ADR-NNN: …`, headings with backticks, apostrophes,
  `/`, `+`, `%`, and non-ASCII); CI's Static job runs it; `SETUP_AND_CI.md`
  documents it.
- **Delivered 2026-09-04.** `scripts/docs-links.mjs check` (`pnpm run
  docs:links:check`) is a `Static` step beside `e2e:fixture-dates:check`, and the
  count is **zero**: 6,564 local links across 149 files, all resolving.
  - **Re-measured rather than inherited.** The permanent checker's first run on
    this branch found **422 of 6,737** broken — 233 drifted anchors, 39 missing
    non-image files, 150 missing screenshots — against the 447 of 6,601 this file
    recorded. The difference is the defining pass's own eleven repairs plus the
    reference definitions and nested image-links this checker reads and the
    temporary one did not. The three classes are the ones the item named.
  - **Repaired at the correct end.** 213 anchors were rewritten mechanically
    (exactly one heading in the target file extended the broken anchor, or shared
    its `DEBT-NNN`/`ADR-NNN` identifier); 20 by hand, where a heading had been
    rewritten or its document retired. **No heading was renamed back.** The
    missing code files were retired or renamed rather than lost — `responsive.spec.ts`
    (split by CONV-03) and ASSET-03's folder were re-pointed; `theme-preference.ts`,
    `TodayDashboard.tsx`, `task-selection.ts`, `menu-placement.ts`, `CaptureFab.tsx`
    and `today/routes/plan.tsx` were unlinked to plain code text naming the pass
    that removed each. **No image was invented**: every missing screenshot folder
    was checked against `git log --all` and had never been committed, so each
    reference became prose saying what the capture showed, derived from its alt
    text, its filename and the surrounding analysis.
  - **Falsified, then reverted.** Breaking one anchor and one path each made
    `Static` fail naming file, line and target. The rule caught its own first real
    case unprompted: resolving DEBT-241's heading in this same change broke the
    link to it from this file, and the check named it before the commit.
  - **The rule is recorded** in [`AGENTS.md` §12](../../AGENTS.md#12-development-workflow),
    in the register's [how to use](../product/PRODUCT_DEBT.md#how-to-use-this-register)
    section and in [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md#documentation-links-v29-ins-00).
    `test/unit/ci/docs-links.test.ts` pins the slug rule against this repository's
    own heading forms and the repository's own zero-finding state.
- **Non-goals.** External links; prose style; a docs site.

### ☑ INS-01 — The history kernel — **delivered 2026-09-04** — closes [DEBT-238](../product/PRODUCT_DEBT.md#-debt-238--the-kernel-activity-contract-has-no-time-window-read-so-five-adapters-carry-their-own-windowed-sql--p3--resolved-2026-09-04-v29-ins-01), [DEBT-239](../product/PRODUCT_DEBT.md#-debt-239--analytics-range-vocabulary-is-three-presets-bucketed-to-fit-the-reviews-eight-period-cap-and-there-is-no-shared-window-grain-or-series-primitive--p3--resolved-2026-09-04-v29-ins-01--ins-03)

**One vocabulary for "over time" — window, grain, bucket, series — and one
kernel read for each store that has a time axis, with nothing stored.**

- **Reproduced.** Windowed reads over `activities` live in five adapters with
  five hand-written `occurred_at` predicates (`d1-activity-window-repository.ts:169-186, 414-417`;
  `d1-review-insight-repository.ts:208-215, 346-347`;
  `d1-project-health-repository.ts:288-298`; `d1-recent-records-repository.ts`;
  `d1-meeting-repository.ts`); the Review's `readSeries` and Analytics both
  bucket to eight periods because `rangeBuckets` was written to fit
  `MAX_TREND_PERIODS`; the `/views` "since last Review" boundary reimplements
  `listSnapshotsBefore`'s ordering inline (`d1-cross-view-query-repository.ts:315-339`).
- **Intended.** `app/kernel/history` (name decided in the PR; `series` is the
  alternative), holding:
  - `Window` — the existing `ActivityWindow` (`activity-window.ts:41-52`),
    re-exported, not duplicated: inclusive owner days, half-open instants.
  - `Grain` — `day | week | month | review_period`; `bucket(window, grain,
    weekStart)` — the generalisation of `rangeBuckets` (`analytics-range.ts:157-176`)
    with the same backward-from-the-end rule so the most recent bucket is
    always whole, and a **stated maximum** per grain (52 weeks, 24 months,
    366 days, 12 Review periods) instead of an inherited eight.
  - `Series<Point>` — points with their bucket, a `bounded` flag and the
    bound's value, so a surface can never present a capped series as exact
    (ADR-079 d11).
  - Four kernel reads, each one grouped statement whatever the window:
    `TaskRepository.countCompletedInBuckets({ window, grain })` over
    `spine_records.completed_at` — **the one completion-time authority
    (RECALL-02, ADR-114)**, never over `task.completed` events, which survive
    a reopen and a delete; a Task completed, reopened and completed again
    counts once per bucket exactly as `analytics-context.ts:198-218` already
    makes the range total count it once, and the bucketed read is the
    unbucketed `countCompletedTasksInWindows` generalised, not a second
    authority; `ActivityRepository.countByTypeInBuckets({ types, window,
    grain })` and `listInWindow({ window, types?, limit, cursor })` for the
    *event* series and the window list (the five adapter reads converge on
    these; `project.completed` and `goal.completed` keep the ADR-079 d2
    Activity semantics they have today unless the PR proves
    `spine_records.completed_at` answers them identically for Projects and
    Goals, and records which); `ReviewInsightRepository.listSnapshotSeries(reviewId,
    n)` over `listSnapshotsBefore`, returning per-Review Project states, Goal
    states and carry-over ids in Review order; and
    `GoalMeasurementRepository.listMeasurementSeries` unchanged, given its
    caller in INS-03.
  - Pure evaluators only: nothing in `app/kernel/history` touches D1 or JSX.
- **What does not change.** `MAX_TREND_PERIODS` stays the Review panel's
  *display* bound; ADR-110's period account and ADR-079's `readSeries` keep
  their statement counts (asserted) and switch to the shared read without a
  behaviour change (parity-asserted on the same fixture, before and after).
  No new table, column or index — the `(workspace_id, type, occurred_at, id)`
  index and `completed_at`'s index already answer every read here; if one
  does not, that is a finding under ADR-110 d7, not a licence.
- **Falsification.** Point one consumer at a window of 40 weeks and assert
  one statement; remove the bucket-end rule and watch the partial-bucket
  parity test fail; feed a second workspace's events and watch the count stay
  at the fixture's known value.
- **Acceptance.** Counting-DB tests assert every read is flat in workspace
  size and window length; the five converged callers are enumerated by a
  contract test (the CONV-01 shape); unit tests over a fixture whose events
  are known (the V2.4 rule) for every grain including week-start and
  month-end edges in the owner's timezone; hostile second workspace on every
  read; zero behaviour change on the Review and `/plan` measured by the same
  machine values before and after (the V2.5 rule).
- **Delivered 2026-09-04.** [`app/kernel/history`](../../app/kernel/history/index.ts)
  holds the vocabulary; the reads live on the contracts they belong to.
  - **The name.** `history`, as the roadmap proposed. `Window` is the existing
    `ActivityWindow` re-exported, not duplicated — one definition, now five
    consumers.
  - **The bucket rule is preserved verbatim and generalised.** Backward from
    the window's end, remainder clamped at the oldest end. **There is no
    `weekStart` parameter, and that is a decision rather than an omission**:
    aligning a week bucket to the owner's Monday would make the most recent
    bucket partial whenever the window ends mid-week — the exact defect the
    backward rule exists to prevent, and the falsification below measures it as
    a 29% phantom dip. A caller wanting calendar weeks ends the window on the
    owner's week end and gets them exactly; both cases are asserted.
    `planningWeekStart` remains the product's one week-start authority.
  - **The inherited eight is gone.** `GRAIN_MAXIMUMS` states 366 days, 52
    weeks, 24 months and 12 Review periods, and a wider window comes back with
    `bounded`, the bound and the count that was asked for — never silently
    shortened (ADR-079 d11). `requestedBucketCount` exists so INS-03 can refuse
    before building anything.
  - **The obstacle nobody had measured, and the shape it forced.** D1 binds at
    most 100 parameters. Both existing bucketed shapes — a `SUM(CASE …)` column
    per window (RECALL-02) and a `CASE WHEN … THEN index` arm per period
    (`countPeriodCompletions`) — bind two per bucket, so both stop at about 48
    while a grain maximum here is 366. The boundaries now travel as ONE bound
    JSON parameter expanded by `json_each`, making the statement's shape
    independent of the window: **measured at one statement for 365 daily
    buckets and for 52 weekly ones.**
  - **What converged, and what did not.** `countPeriodCompletions` and
    `ActivityRepository.countByTypeInBuckets` now share
    [`history-window-read.ts`](../../app/platform/storage/d1/history-window-read.ts)
    — one predicate, two callers, and `COMPLETION_TYPE_MATCH`'s event-type-to-
    entity-type table replaced by a generic primary-subject role filter.
    FOLLOW-01/02's plan history did NOT converge and should not: it is a
    three-arm UNION that also extracts each event's plan-before and plan-after
    from `payload_json` and looks *after* the window for the event that moved a
    plan out of it. **DEBT-238's "five adapters" was wrong in both directions**
    — three of the five carry no window predicate at all, and two it did not
    name do — so the grep the entry proposed is replaced by a registry test
    that enumerates every remaining bound with its reason and fails when any
    count moves.
  - **Falsified.** A 40-week window asserts one statement. Laying the same
    buckets out FORWARD from the window's start drops the most recent point
    from 7 to 5 on a flat week — the artefact the backward rule prevents,
    measured rather than argued. A hostile second workspace's identical fixture
    leaves every count at its known value.
  - **Parity, not a second authority.** `countCompletedInBuckets` and
    `countCompletedTasksInWindows` return identical results on one fixture; a
    Task completed, reopened and completed again counts once, in its current
    bucket; a deleted Task counts nowhere. The Review's own 47 kernel tests
    pass unchanged through the converged read, and `MAX_TREND_PERIODS` is now
    purely the panel's display bound rather than also a limit D1 was imposing.
  - **Corrected by the completion pass (2026-09-05).** Month buckets were
    calendar months only when the window ended on a 31st — `addCalendarMonths`
    clamps the day, so stepping back from 30 April landed on 30 March and 31
    March was counted in "April"; a window ending on any month end now tiles
    into whole calendar months (asserted at 30 April, 28 February and 30 June),
    and `requestedBucketCount` agrees with the buckets and is exact rather than
    capped at 50 for months. An inverted window is refused. Both bucketed D1
    reads had SLICED past 366 and returned a shorter series than asked for,
    while their contracts said the bound was "reported"; they refuse, the
    ceiling derives from `GRAIN_MAXIMUMS`, and an empty or oversized type list
    is refused as the contract said. `listSnapshotSeries` was clamped to
    `MAX_TREND_PERIODS` (8) after all, so a caller asking for twelve got eight
    unreported — it is bounded by the kernel's twelve, proved on fourteen
    Reviews. A DST changeover is now placed against real D1.
- **Non-goals.** A query language; a cache; any stored aggregate; any
  surface.

### ☑ INS-02 — Across Reviews — **delivered 2026-09-04** — takes the `listSnapshotsBefore` half of [DEBT-212](../product/PRODUCT_DEBT.md#-debt-212--listmeasurementseries-has-no-caller--p3--resolved-2026-09-04-v29-ins-02--ins-03)'s disposition

**The Review reads more than one snapshot back, and says in words what
changed across them.**

- **Reproduced.** `readPreviousSnapshot` reads `priorReviews[0]` only
  (`review-insights-context.ts:797-808`); the insights panel compares one
  step; "at risk in three consecutive Reviews" and "carried over every Review
  this quarter" have no source although every snapshot holds the facts.
- **Intended.** Over `listSnapshotSeries` (INS-01), the Review evidence gains
  three across-Reviews facts, each with its reason and its window in words,
  rendered in the guided weekly flow's evidence step and the Review record's
  Progress tab — the two places ADR-079 d12 already put the evidence:
  - **Project health across Reviews** — "At risk in 3 of the last 4 weekly
    Reviews (since 9 Aug)"; a Project appears here only when its state
    differs across the series (ADR-079 d8/d9 — absence renders less).
  - **Goal contribution across Reviews** — "Moving in 5 of the last 6" /
    "No contribution path in every one" — the same classification the
    snapshot already stores, read as a series; **and the one Goal story
    gains this line** (ADR-111 d6: every surface that presents a Goal's
    progress composes the one story).
  - **Repeated carry-over** — Tasks whose id appears in the carry-over set of
    every Review in the series, bounded, by live title through the id (never
    a stored title, ADR-079 d3), with a door to the Tasks view that lists
    them.
  - The series length is the panel's existing `trendPeriods` bound; the
    panel says "over the last N Reviews" and never implies more.
- **Falsification.** Seed four completed Reviews with known snapshots whose
  Project states alternate; assert the sentence names the count; delete two
  snapshots and assert the sentence shrinks its window rather than inventing
  a state (ADR-079 d5).
- **Acceptance.** Fixture with known snapshots across six Reviews of two
  types; the same-type rule holds (a monthly Review's series never includes
  weeklies); the serialised model contains no score, grade, percentage or
  `danger` tone (the ADR-079 d6 test extended); one evidence load's statement
  count is asserted and flat in Review count; the Goal story's three
  surfaces (Area record, Review Goals step, search) show the same machine
  value; light and dark; 320 → 1440 plus the 195px zoom case; `axe` clean.
- **Delivered 2026-09-04.** The Review reads a SERIES of snapshots and says, in
  words, what changed across them.
  - **The three facts** are built by `app/kernel/review-insights/across-reviews.ts`
    — pure, reading no repository and formatting no date — and rendered as an
    "Across recent Reviews" section of the existing evidence panel, so both
    mount points (the guided flow's evidence step and the Review record's
    Progress tab) gained it with no change of their own.
  - **A Project appears only when its state DIFFERS** across the series, and a
    Review that recorded NO reading is skipped rather than counted as one — so
    a Project with two readings across four Reviews says "2 of the 2 that
    recorded one" instead of inventing two (RECALL-04/DEBT-234). A Project the
    one-step health section already named is not repeated.
  - **Every title is live, through the stored id** (ADR-079 d3): the snapshots
    hold ids only, and a record absent from today's facts is simply not named.
  - **It cost NO statement.** `listSnapshotSeries` REPLACED the single
    `getSnapshot` read, and the previous snapshot is derived from the series
    with the old semantics exactly — the immediately prior Review's, or null,
    never "the most recent Review that happens to have one".
    `REVIEW_INSIGHTS_QUERY_BUDGET` stays at **17**, asserted against real D1.
    **Corrected 2026-09-05 by the completion pass:** that 17 was measured on a
    FIRST Review, where the snapshot series and the prior Review's sections are
    never read. On the path the number describes — a Review with a completed,
    snapshotted predecessor — it is **19** (21 with a routine), and the
    first-Review cost is asserted separately as two fewer.
    The guided flow's Goals step pays **one** more (12 → 13, declared) for the
    same read, because the guided flow loads one step per request.
  - **The Goal story gained the line** (ADR-111 d6):
    `GoalStory.contributionAcrossReviews`, projected into
    `GOAL_STORY_FACT_KEYS` as the state AND the number of Reviews it was read
    over, so no surface can show the classification without its window. It is
    `null` where a surface did not ask — the same meaning `alignment` and
    `movement` already carry — and populated in the Review's Goals step, which
    is where the series is affordable. The words come from one kernel helper,
    so two surfaces cannot phrase the same machine value differently.
  - **Falsified.** Four Reviews with alternating Project states assert the
    sentence names the count; deleting two snapshots makes the sentence shrink
    to "the last 2 Reviews" rather than invent a state — and the pair the
    falsification keeps is the pair whose states differ, because a Project that
    held ONE state is correctly not a finding at all.
  - **Two precisions the disposition predicted differently**, recorded on
    DEBT-212: the caller is `listSnapshotSeries`, so `listSnapshotsBefore`
    is superseded and *still has no caller*; and the `/views` boundary read did
    not converge, because routing a `LIMIT 1` read of the same table through
    another repository's contract crosses a boundary for no measured gain.
  - **Corrected by the completion pass (2026-09-05).** The "same machine
    value" claim was false: the evidence step read six snapshots, the guided
    Goals step asked for a Goal page size (twelve, clamped to eight) and
    Analytics anchored on the latest completed Review of any type with eight.
    `ACROSS_REVIEWS_SERIES_LENGTH` is the one number all three read, Analytics
    anchors on the latest completed weekly Review, the Goal story projects the
    series length beside the count, and a D1 test asserts the guided step and
    Analytics print the same words for one Goal. A subject some Reviews did not
    record now reads "2 of the 3 Reviews that recorded it, of your last 4" and
    is dated from the oldest Review that recorded it. The series leaves out
    Reviews archived or reopened after their snapshot, as `readPriorReviews`
    always did. The repeated carry-over count reads "N+" whenever more ids
    repeated than the bounded live page could name, and its door goes to the
    waiting view for a waiting commitment. A Goal work reached at every Review
    is not repeated as a finding. The no-snapshot comparison rule has its test.
- **Non-goals.** A chart of health over time; any change to snapshot
  capture; monthly/quarterly *guided* Reviews (their own decision, unchanged).

### ☑ INS-03 — Insight with a real range — **delivered 2026-09-04** — closes the caller half of [DEBT-212](../product/PRODUCT_DEBT.md#-debt-212--listmeasurementseries-has-no-caller--p3--resolved-2026-09-04-v29-ins-02--ins-03)

**Analytics asks the question the owner has, over the window the owner
chooses.**

- **Reproduced.** Three ranges, no picker (`analytics-range.ts:44-70`); one
  series (Tasks completed) plus overdue level; Projects and Goals completed
  have no line; a measured Goal's series is visible only on its own record.
- **Intended.** On `/analytics` (URL, module id and nav label unchanged — the
  label becomes *Insight* when Reports arrive in V2.13):
  - a **window** control (this week, 4 weeks, 12 weeks, 6 months, 12 months,
    24 months — each a named preset over `Window`, and none wider than its
    grain's stated maximum, so no preset promises more than the series can
    hold; a workspace older than two years reads its earlier history through
    the Review's across-Reviews facts and, from V2.13, a Report) and a
    **grain** (day / week / month) the preset defaults sensibly and the owner
    may change within the grain's stated maximum;
  - three completion series — Tasks from `countCompletedInBuckets` over
    `completed_at`, Projects and Goals from the Activity read — drawn with
    the design system's existing bounded trend primitive; the range total stays a separate window, never the sum
    of buckets (the existing reopen rule);
  - the overdue *level* series unchanged in shape, never summed;
  - a **Goals** section listing every measured Goal with a compact series
    (the `listMeasurementSeries` caller DEBT-212 asks for, bounded per Goal,
    bound stated), each linking to the record; a Goal without a measurement
    renders its across-Reviews contribution line from INS-02 instead;
  - every figure with its window in words; zero-valued claims not emitted;
    the "Not available" model kept for a failed read.
- **Falsification.** Choose 12 weeks / week and assert twelve points from a
  fixture with known completions; choose a grain above its maximum and assert
  the control refuses rather than truncating silently; reopen and recomplete
  a Task and assert that both its bucket and the range total count it once,
  and that a deleted Task leaves both.
- **Acceptance.** Loader statement count asserted per window and flat; the
  page is a page (skeleton, never a spinner-blocked blank); keyboard-complete
  controls built from `app/shared/ui`; 320 → 2560; light and dark; `axe`
  clean; the URL carries window and grain so a view can be shared and comes
  back identical.
- **Non-goals.** Saved definitions (V2.13); any Finance or obligation series
  (their stores do not exist); a chart library; a dashboard; the nav label.

**Delivered 2026-09-04.**

- **`analytics-range.ts` is deleted, not aliased.** `ANALYTICS_RANGES`,
  `rangeSpan`, `rangeBuckets` and `parseAnalyticsRange` are gone;
  [`insight-range.ts`](../../app/kernel/analytics/insight-range.ts) holds the
  six windows, the grain vocabulary and the spans, and the buckets come from
  [the history kernel](../../app/kernel/history/index.ts). A thin alias would
  have kept a second range vocabulary alive behind a re-export.
- **The grain control offers only what the window can hold, computed.**
  `allowedGrains` runs `requestedBucketCount` against `GRAIN_MAXIMUMS`, so 24
  months is months-only and 12 months is days-or-months (53 week-buckets
  exceeds the 52 maximum). A grain that would need bounding is never offered,
  and `resolveInsightGrain` falls back to one the window holds rather than
  shortening the series — the refusal the falsification asks for.
- **Changing the window drops the grain**, so the URL can never claim a grain
  the loader silently substituted. Both controls are ordinary links: Back
  works, the page works with JavaScript off, and the view can be shared.
- **Three completion series, reading the right authorities.** Tasks from
  `countCompletedInBuckets` over `spine_records.completed_at`; Projects and
  Goals from `countByTypeInBuckets` over the Activity stream, in the same
  event semantics their totals use. The range TOTAL stays its own window read,
  never the sum of the buckets — proved by a reopened-and-recompleted Task
  counting once in both, and a deleted one leaving both.
- **The Goals panel closes DEBT-212's caller half.** Every measured Goal gets a
  compact `listMeasurementSeries` series with its bound stated; a Goal with one
  reading is dropped rather than drawn as a flat line; and a Goal with no
  measurement gets INS-02's across-Reviews sentence instead, which names its
  own window because a Review period is not the span the owner selected.
- **One bound survived, and the page says so.** The overdue LEVEL read could
  not be lifted the way the counting reads were — its moments do not partition
  anything, so each needs its own `SUM(CASE …)` column, and two bound
  parameters per column against D1's ceiling of 100 puts the limit at
  `MAX_OVERDUE_MOMENTS = 40`. A 366-day or 52-week window reads the most recent
  40 closes, and `overdueMoments` carries that number into a note on the
  surface. A stated bound replacing an invisible one is the whole of DEBT-239.
- **The page's cost is declared and flat.** `ANALYTICS_QUERY_BUDGET = 12`
  as delivered — **corrected to 14 by the completion pass (2026-09-05)**,
  because the fixture held no completed Review and the across-Reviews read
  (an anchor lookup and a series) never fired; 12 is now the asserted cost of
  a workspace that has never completed a Review —
  asserted in [`test/kernel/ins-03-insight-range.test.ts`](../../test/kernel/ins-03-insight-range.test.ts)
  against the real D1 at **every** window and grain the surface offers — 24
  months at month grain costs exactly what 7 days at day grain costs.
- **The page is a page.** The shared collection loading signal drives a
  dashboard-shaped skeleton (`AnalyticsSkeleton`) rather than the shared column
  of record cards, because a ghost that promises a list and resolves into
  panels is worse than none.
- **Corrected by the completion pass (2026-09-05).** A failed distribution
  read put "0" on *Areas worked in* beside a panel saying the read had failed,
  and a failed Goal page or across-Reviews read left the Goals panel claiming
  "no Goal has two readings yet"; both now say "Not available". The
  measured-Goal series ignored the selected window (a 7-day view drew July's
  weigh-ins and called them "readings in this window"); `listMeasurementSeries`
  takes the page's window. The trend caption and the Projects/Goals rows
  summed the series beside metric cards that read the window's own total; the
  model carries the totals and the surface prints those. `?window=quarter` and
  `?window=24-months&grain=day` were normalised silently, so a shared link kept
  naming a page it did not match; the loader redirects to the address it
  draws. A 24-month axis carries the year. At phone widths a Goal row's reading
  takes its own line rather than crushing the name.

### ☑ INS-04 — What changed — **delivered 2026-09-04** — closes [DEBT-103](../product/PRODUCT_DEBT.md#-debt-103--the-workspace-wide-activity-feed-endpoint-has-no-ui-consumer--p3--resolved-2026-09-04-v29-ins-04)

**The workspace's history is readable in the window the owner is looking
at, and `/today/activity` finally has a consumer — or goes.**

- **Reproduced.** `/today/activity` (`app/modules/today/routes/activity.tsx`)
  reads `listForWorkspace` with a cursor and no window; its descriptor map
  (`today/landing/activity.ts`) and kernel tests exist; nothing renders it.
- **Intended, decided:** the endpoint moves to the Analytics module as its
  own resource route (`/analytics/activity`), reads `listInWindow` (INS-01)
  for the window and grain INS-03 selected, and renders on the Insight page as
  a **bounded "What changed" list** through the shared DS-05 feed — keyset
  paged, bound stated, entity titles resolved by id, the Today descriptor map
  moved with it and the Today route retired in the same change (one owner, no
  stranded route). Diary bodies and People remain excluded from the feed's
  descriptors exactly as the Person timeline excludes other modules' payloads.
- **Falsification.** Choose a window that excludes a known event and assert
  its absence; page past the bound and assert the cursor rather than a
  truncated total.
- **Acceptance.** The route is workspace-scoped and hostile-tested; one
  statement per page; `grep -rn "today/activity" app/` returns only the
  manifest comment recording the move; phone widths; `axe` clean.
- **Non-goals.** A widget on Today (the redesign removed it for a reason
  recorded on DEBT-103); a notification; filtering by actor.

**Delivered 2026-09-04.**

- **One door, and the old one is gone.** The endpoint is
  [`/analytics/activity`](../../app/modules/analytics/routes/activity.tsx) and
  its model is [`activity-feed.ts`](../../app/modules/analytics/activity-feed.ts);
  the Today route and its descriptor map moved with them and the Today entry
  was retired in the same change. `grep -rn "today/activity" app/` finds two
  comments recording the move and no route.
- **It reads `listInWindow`.** The window travels in the query string as the
  SAME `window=` vocabulary the page's address bar uses, resolved by the same
  parser — so the list and the charts above it cannot be describing different
  periods, and a caller cannot ask this route for a span the surface does not
  offer. A stale value (`?window=quarter`, from the deleted range vocabulary)
  falls back to the default rather than erroring.
- **The panel is the shared DS-05 feed**
  ([`WhatChangedPanel.tsx`](../../app/modules/analytics/WhatChangedPanel.tsx)),
  supplying a page loader and nothing else; it names its window on the card,
  because a list of events at the bottom of a long page needs its period
  stated. It sits LAST: the figures answer "how much", this answers "what".
  Every page comes from the route, the first included — the shared stream loads
  its own first page, so a server-rendered one would be replaced on mount.
- **Bounded, with a cursor rather than a total.** 30 events a page, `hasMore`
  and `nextCursor`, and no count anywhere in the payload — a bounded list
  stating a total would claim a completeness it does not have (ADR-079 d11).
- **The window carries its ANCHOR DAY, bounded to today or yesterday.** Every
  Insight window ends on the owner's today, so a page left open across their
  midnight would page a feed one day off the figures above it — and because a
  cursor is bound to its window, "Load more" would then be rejected outright: a
  dead end retrying cannot clear. The page sends the day it was rendered for,
  and the route accepts it only for today or the day before, which is the whole
  set a real rollover produces. Anything else falls back to the server's today,
  so a caller still cannot name an arbitrary anchor and read a 12-week window
  from 1994.
- **The empty state keeps the panel beneath it.** `isEmpty` is a claim about
  COMPLETIONS, and a period can hold records created, notes written and a
  Meeting held while completing nothing at all. The layout replaces every child
  with the empty slot, so the one panel that could show what DID happen would
  otherwise be the one hidden, on the surface whose job is to show it.
- **Falsified and hostile-tested** in
  [`test/kernel/ins-04-what-changed.test.ts`](../../test/kernel/ins-04-what-changed.test.ts):
  an event outside the window is absent and stays absent at the widest window;
  paging past the bound continues without repeating; a cursor issued for
  another window is refused with a calm 400, as is a tampered one; another
  workspace's events never appear, by id or by title; and the per-page
  statement count does not move between a 3-event page and a 28-event one —
  **and, since the completion pass (2026-09-05), is pinned at
  `INSIGHT_ACTIVITY_PAGE_BUDGET = 5`**, because "equal counts" is satisfied by
  a per-event read that fires on both pages. The panel states its bound
  ("the most recent changes in this period, newest first, thirty at a time")
  where the list is read.

---

## Why this sequence

INS-00 first because this file carries the whole future sequence and every
later item links into the register; a map with 447 dead ends is a memory
defect of exactly the class V2.8 refused. INS-01 second because the three
consumers are consumers of it and its parity proof must land before anything
renders through it. INS-02, INS-03 and INS-04 are independent once INS-01
exists and may ship in any order; INS-02 is listed first because it lands in
the ritual that already has a reviewer, a cadence and an undo.

Nothing rides beside this programme. The code-held half of the AI gate
(DEBT-237) keeps V2.8's rule: its own PR, on its own evidence, the day the
owner's secret exists.

---

## Dependencies

**External.** None that gate merge. No migration in this programme.

**Internal.** INS-00 precedes everything; INS-01 precedes INS-02/03/04. Every
item consumes — and none modifies — the snapshot writer, the Review's
evidence model contract, the Goal story composition (ADR-111 d6), the
Analytics module's route and the design system's bounded trend and feed
primitives.

**Owner-held actions, separated from code work.** Unchanged from V2.8, with
one re-stated as a future gate:

| Action | Unblocks | Where recorded |
|---|---|---|
| Dispatch ten CI runs on one unchanged tree | DEBT-203's count, with it DEBT-125 and DEBT-157 | V2.8 CONV-03 |
| Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as a Worker secret in a non-production environment | the AI gate (V2.8's statement); V2.14 | AI_PLATFORM §21, ADR-112 d2 |
| Four GitHub `production` secrets **and** the public-repo protection decision | **DEBT-198 — a hard gate for V2.12 Finance.** Not a V2.9, V2.10 or V2.11 gate; two releases' notice | DEBT-198 |
| ~30 seconds in production: choose an identity colour, reload, confirm | DEBT-139's last clause | DEBT-139 |

---

## The acceptance boundary

Every item carries the six durable rules verbatim (DHDS-13; V2.4; V2.5;
V2.6; V2.7; V2.8 — see [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md#the-acceptance-boundary)),
and V2.9 adds one for the layer it builds:

> **A figure about the owner's history names its window and its bound, is
> computed once in the database or a pure evaluator from a store the product
> already writes, and is proven flat in the size of that store.** No stored
> aggregate, no score, no second derivation of a fact another surface already
> derives.

Concretely, every item is accepted against: real seeded data with known
events; hostile rows in a second workspace on every touched query; light and
dark; 1440 and the 320/360/375/393/430 phone widths plus the 195px zoom case
where Today is touched; keyboard reach, visible focus, accessible names;
`axe` clean with no rule disabled; bounded queries with counting-DB proofs;
deterministic tests — none skipped, weakened, retried or quarantined; and the
falsification named on each item.

---

## Non-goals of V2.9

- **No new stored artefact** — no aggregate table, no cache, no second
  snapshot (ADR-110 d3/d7).
- **No score, grade, streak, percentage or verdict** (ADR-079 d6, ADR-110
  d4, ADR-111 d7).
- **No saved report, no dashboard, no chart library** — Reports are V2.13
  and dashboards are V3.
- **No AI** in any Insight surface (ADR-079 d13); the layer is what AI will
  later be handed.
- **No navigation change** — no new entry, no relabel, no regroup.
- **No Finance, obligation or attachment data** — the stores do not exist.
- **No migration.**
- The standing non-goals of V2.3 → V2.8 stand unrestated.

---

## The debt, reconciled

**This pass raised DEBT-238 … DEBT-242** and gave every entry it touched a
dated disposition. **Implementing it raised two more, DEBT-243 and DEBT-244**
(next free **DEBT-245**). DEBT-243: seven surfaces link a Task with `/tasks?task=<id>`, a parameter
the Tasks module does not read, so the link opens the collection rather than
the record. Found while INS-02 was reading the Review's own claim links;
recorded rather than silently becoming an eighth caller. DEBT-244 is the one
E2E journey the programme's own full-suite run left red — bisected to `main`
at `082f01e` in a clean worktree rather than assumed to be V2.9's, and left
open rather than quietly re-run until green.

| Entry | Severity | Disposition |
|---|---|---|
| **DEBT-238** — the kernel Activity contract has no window read | P3 | **Raised · CLOSED by INS-01 (2026-09-04)**, with its own measurement corrected |
| **DEBT-239** — three Analytics presets, an inherited eight-bucket cap, no shared series primitive | P3 | **Raised · ☑ resolved by INS-01 + INS-03 (2026-09-04)** |
| **DEBT-240** — an obligation cannot exist without an Asset and carries no amount | P3 | **Raised · owner V2.10 LIFE ADMIN** — not taken here |
| **DEBT-241** — no docs link/anchor check; 447 broken local links | P2 | **Raised · CLOSED by INS-00 (2026-09-04)**; the eleven in `ROADMAP_V2_8.md` repaired by the defining pass |
| **DEBT-242** — no workspace or account deletion path | P3 | **Raised · owner V2.16 CONSOLIDATE**; re-rated at V2.12's definition if Finance's pass finds it must precede money |
| DEBT-212 · DEBT-103 | P3 | Both **☑ resolved (2026-09-04)** — DEBT-212 by INS-02 + INS-03, DEBT-103 by INS-04 |
| **DEBT-243** — seven surfaces link a Task with a parameter Tasks does not read | P3 | **Raised by INS-02 (2026-09-04)**, not taken: it is a Tasks-module link contract, not an Insight defect |
| **DEBT-244** — one colour-scheme journey times out reading computed styles | P3 | **Raised by V2.9's own full-suite run (2026-09-04)**, not taken: reproduced on `main` at `082f01e` in a clean worktree, so it is not this programme's; it belongs with DEBT-203's stability work |
| DEBT-35 | P3 | **Re-homed**: attachments → V2.11; renewals and reminders for non-Asset things → V2.10; the entry closes empty as it always said it would |
| DEBT-198 | P2 | **Owner-held, unchanged, and now a hard gate for V2.12** — recorded on the entry |
| DEBT-237 · DEBT-213 · DEBT-91 · DEBT-92 · DEBT-93 | P3 | **The V2.14 sequence**: gate, registry, fact block, then the Weekly Review assistant live; unchanged in order, re-dated |
| DEBT-70 · DEBT-102 · DEBT-151 · DEBT-160 | P2/P3 | **Not taken, unchanged** — the offline slice and the capture-processing decision remain their own decisions; neither is required by a priority release |
| DEBT-125 · DEBT-157 · DEBT-203 · DEBT-139 | ◐ | **Owner-held, unchanged** |

---

## The remaining V2 sequence

Each release below has a name, a one-sentence theme, a user-visible outcome,
three to five implementation items, explicit dependencies, explicit
non-goals, debt and prerequisites, completion criteria, and what it unlocks.
**Resolution decreases deliberately**: a PLANNED release is defined by its
own pass against a re-measurement of `main` and may change; a PRESUMPTIVE
release is a direction, and everything about it may change. One release is
one coherent product outcome; a release that grows a second theme is split.

```
V2.9 INSIGHT ──► V2.10 LIFE ADMIN ──► V2.11 EVIDENCE ──► V2.12 FINANCE CORE
  (history)        (Obligation)        (attachment)       (accounts, imports)
      │                  │                   │                    │
      └──────────────────┴───────────────────┴────────────────────┤
                                                                  ▼
                V2.13 REPORTS ──► V2.14 GROUNDED AI ──► V2.15 ASSISTED AI ──► V2.16 CONSOLIDATE ──► V3
```

### V2.10 — LIFE ADMIN (PLANNED)

- **Theme.** *What do I need to deal with?* — one Obligation model for
  everything due and recurring, whether or not it is about an Asset, with one
  home.
- **User-visible outcome.** A rego, an insurance renewal, a tax return, a
  gym membership and a school fee are all Obligations: due, recurring, with an
  expected amount where there is one, completable with the actual amount and
  date, surfaced through the one Today attention row and the digest rung the
  product already has, listed at `/obligations` under a **Life Admin** rail
  entry, and still visible on the Asset they are about.
- **Implementation items** (directional; the defining pass fixes them):
  1. **LIFE-00 — the Obligation kernel.** `app/kernel/obligations`
     generalised from `app/kernel/assets/asset-obligation.ts`: an `obligation`
     **entity** type with an `obligation_details` slice; an optional subject
     — a nullable `subject_entity_id` foreign key to `entities` (any kind) for
     the structural reads the Assets lens and the canonical-fact update need,
     **and** a reserved typed EntityLink (`obligation.subject`) written in the
     same transaction so the subject's record shows the obligation in its
     linked items and timeline, on the Meeting-item → Task pair's precedent
     (ADR-083) and never as a second relationship system; optional
     expected `amount_minor` + `currency_code` (ADR-049); the closed category
     set widened to life shapes (bill, subscription, membership, fee, tax,
     filing, appointment, …), still closed; the obligation recurrence engine
     unchanged and **no fourth engine**; one evaluator, one completion
     transaction (ADR-083) writing `obligation.completed` with date and actual
     amount as the proof of record, and the Asset logbook row too when the
     subject is an Asset.
  2. **LIFE-01 — the migration, rehearsed.** Existing `asset_obligations`
     rows become entity-backed Obligations by a data-carrying migration proven
     by moving a restored production artefact through it and reading it back
     (the V2.6 rule); the Assets module's Obligations tab becomes a lens over
     the shared records filtered by subject; `canonicalFactForCategory` keeps
     updating the Asset's dates; the old table's retirement decided with
     ADR-082 d4's rollback argument in front of it.
  3. **LIFE-02 — the home.** The Life Admin module: `/obligations`
     (collection: due this week / this month / later / done, the shared row
     pattern, complete or renew from the row with one sheet for date and
     actual amount), the Obligation record (facts, evidence links, history),
     a search provider (title, category, subject — never amounts in
     excerpts), a palette command, a door from the Asset record and from
     People; a rail entry registered into the existing *more* group.
  4. **LIFE-03 — surfacing, widened not multiplied.** Today's one obligation
     attention row and the `asset_obligation` digest rung read the whole
     obligation set (the notification kind renamed or generalised by its own
     migration of the `kind` CHECK), deduplicated against open linked Tasks
     exactly as today; the export snapshot gains the `obligations` collection
     in the same release; the Obsidian vault renders them.
- **Dependencies.** None on V2.9. The Assets kernel, ADR-083, the
  notification evaluator, the export protocol.
- **Non-goals.** File evidence (V2.11 — the record offers a linked Note and
  says a file is coming, with no dead upload control); payment status
  distinct from completion (V2.12's settlement link); reminders at a time of
  day, per-obligation notification settings, quiet hours (ADR-114's refusal
  stands); a capture-grammar token; a phone-bar slot; forecasting.
- **Debt and prerequisites.** Takes DEBT-240 and the renewals half of
  DEBT-35. No owner-held gate. The migration is the release's risk and its
  rehearsal is its first acceptance criterion.
- **Completion criteria.** Every former Asset obligation reads identically on
  the Asset record before and after (machine values, the V2.5 rule); a
  subject-less obligation completes, creates its successor and appears on
  Today only when not tracked by an open Task; hostile-workspace tests on
  every new read; the `obligations` collection exports and restores with
  matching counts; the six acceptance rules.
- **Unlocks.** V2.12's recurring commitments (an Obligation with an amount
  and a settlement link) and V2.13's "obligations due next 90 days" and
  "recurring commitments by month" reports.

### V2.11 — EVIDENCE (PLANNED)

- **Theme.** *The paper lives with the thing* — one `attachment` entity on one
  private bucket, backed up and restorable before the first owner file is
  accepted.
- **User-visible outcome.** A policy on its Obligation, a receipt on its
  Asset, a PDF on its Meeting, a photo on a Note — added from the record on
  desktop or from the phone's picker or camera, downloaded through DalyHub
  only, counted against a stated budget, included in the export, and
  restorable.
- **Implementation items** (the smallest legitimate shape V2.8 recorded, with
  its backup and mobile halves):
  1. **FILE-00 — the second store is recoverable first.** The backup Worker
     covers the attachments bucket (listing and copy or versioning plus a
     retained manifest — decided in the PR); a **restore rehearsal covering
     D1 and R2 together** — objects verified against restored `attachment`
     rows by content hash, a missing object a named finding — passes before
     any upload route exists.
  2. **FILE-01 — the entity and the route.** `attachment` entity +
     `attachment_details` (filename, byte size, content type, content hash,
     R2 key, soft-delete); one R2 binding in the application Worker (the
     `wrangler.jsonc` policy comment amended by ADR); multipart upload
     bounded before the body is read (the restore route's shape); download
     through an authenticated same-origin route with `Content-Disposition:
     attachment`, sniff-proof types, no inline HTML/SVG; per-file and
     per-workspace budgets stated in Settings; a content-type allowlist.
  3. **FILE-02 — on the record.** An Attachments section on the shared record
     layout for every entity kind, linked by EntityLink; privacy class
     inherited from the linked record (a file on a Person or Diary entry is
     structurally excluded from AI evidence); soft delete with a lifecycle
     purge; the phone path — record and capture sheet with the OS picker and
     camera; `share_target` for files **only if** the picker measures as
     friction.
  4. **FILE-03 — export and vault.** The canonical archive's binary
     collection under the compatibility protocol; an export without files
     says so; the Obsidian vault places files beside their record; the
     manifest's "DalyHub stores none" line retired in code.
- **Dependencies.** None on V2.9 or V2.10 in code; V2.10 gives the first
  record that most wants a file.
- **Non-goals.** Folders, versions, sharing links, OCR, full-text search over
  file contents, text extraction of any kind (refused until a sanitising
  extractor exists — V3), a general document manager.
- **Debt and prerequisites.** Takes the attachments half of DEBT-35 (the
  entry closes empty). FILE-00 is the internal gate; DEBT-198 is *not* a gate
  here.
- **Completion criteria.** The D1+R2 restore rehearsal green; the CSP
  unchanged; a hostile workspace cannot read another's object by key or id;
  the upload bound proven before the body is read; budgets enforced; the
  archive round-trips with hashes matching; phone capture at 393px.
- **Unlocks.** Statements and receipts in V2.12; evidence on Meetings, Notes
  and People immediately; document context for AI — by reference only — in
  V2.14.

### V2.12 — FINANCE CORE (PLANNED — gated on DEBT-198)

- **Theme.** *Where is my money going?* — accounts, imported transactions,
  categories, one readable month, budget against actual, and obligations
  settled by the transactions that paid them.
- **User-visible outcome.** The owner imports a bank CSV once a week, sees
  "0 new" when they import it twice, categorises the uncategorised from a
  phone, reads September by category with the budget beside it, sees the
  balance of every account and one net-worth figure, and watches the
  electricity bill's Obligation complete when its transaction is linked.
- **Implementation items** (the smallest Finance that could start replacing
  a standalone app — the boundary is [§4.4 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#44-finance--the-first-release-boundary)
  and must not grow):
  1. **FIN-00 — accounts, transactions, the import ledger; export first.**
     `finance_account_details` (an entity), `finance_transaction_details`
     — a transaction is a **light entity**: an `entities` row so a receipt
     (V2.11) or an Obligation links to it by EntityLink, with no Activity
     per edit, no record page (a drawer) and payee-only search under the
     explicit-query boundary; this is V2.12's first recorded decision,
     because the alternative is a second attachment-linking system —
     `finance_imports` (file hash, mapping, counts — the
     audited unit, one Activity event per applied import),
     `finance_categories` (one level, structure not tags), `finance_budgets`;
     every collection in the snapshot and the restore rehearsal **before any
     UI**; balances derived from opening balance plus transactions, never
     stored.
  2. **FIN-01 — CSV import, idempotent.** One bounded parser; a per-bank
     column mapping saved once; identity by the bank's stable transaction id
     where the file carries one, otherwise an **occurrence-aware** row
     fingerprint — `(account, date, amount, normalised payee, n)`, where `n`
     counts identical rows within one file — so two same-day purchases at one
     merchant are both kept and both recognised again across overlapping
     exports; a suspected cross-file duplicate is *shown and skipped*, never
     silently merged; transfers as linked pairs excluded from spend; a
     desktop flow.
  3. **FIN-02 — the month and the budget.** Spend and income by category for
     a month, computed by the V2.9 history layer (`sum-by-group-per-bucket`);
     mixed-currency totals reporting exclusions as Assets do; a monthly budget
     per category with variance in words; account balances and one derived
     net-worth figure (accounts plus latest Asset valuations minus loans).
  4. **FIN-03 — categorise from a phone.** The transaction row (shared row
     pattern, inline category picker, swipe with a keyboard equivalent), the
     "last category for this payee" deterministic suggestion, the
     uncategorised queue as the daily-driver phone surface.
  5. **FIN-04 — obligations settled.** `settled_by` from an Obligation to a
     transaction; completion with the actual amount from the link; the Finance
     overview lists this month's expected commitments from the Obligation
     model — **no recurring-transaction engine** (ADR-116 d1).
- **Dependencies.** V2.9 (the aggregation reads), V2.10 (the Obligation
  model), V2.11 (if statements are attached; not otherwise), **DEBT-198**.
- **Non-goals.** Bank feeds / Open Banking, OFX/QIF, double entry, invoicing,
  tax, shared ledgers, investment analytics beyond balances, split
  transactions (recorded as the first later item, not built), rules engines,
  a net-worth *series* (a V2.13 Report), any AI categorisation (V2.15), a
  phone-bar slot, anything on Today.
- **Debt and prerequisites.** **DEBT-198 is a hard gate**: the off-Cloudflare
  encrypted copy exists and has been restored from once before the first
  import. The security requirements in [§9 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#9-security-and-privacy)
  are acceptance criteria, not follow-ups. DEBT-242's rating is revisited
  here.
- **Completion criteria.** A repeated import yields zero rows and says so;
  two identical legitimate rows in one file both import and both survive a
  re-import of an overlapping export;
  every balance recomputes identically after export → restore; a transfer
  never appears in spend; the month's category totals equal the sum of their
  rows on a known fixture; logs carry no payee or amount; a hostile
  workspace sees nothing; the phone queue at 393px; the six rules.
- **Unlocks.** "Monthly spend by category", "net worth over time" and
  "recurring commitments by month" as Reports (V2.13); "why was August more
  expensive than July?" (V2.14); categorisation proposals and duplicate /
  transfer suggestions (V2.15).

### V2.13 — REPORTS (PRESUMPTIVE)

- **Theme.** *One saved definition, many questions* — a Report is a saved
  `(source, window, grain, filters, group, measure, sort, visualisation)`
  executed by the history layer on open; nothing is stored but the definition.
- **User-visible outcome.** The six example reports — monthly spend by
  category, Goal measurements over twelve months, completed Tasks by Area,
  obligations due in the next 90 days, Project health across Reviews,
  recurring commitments by month — each saveable, nameable, shareable by URL,
  readable on a phone as a number and a table with the chart beneath; the
  Analytics entry relabelled **Insight**.
- **Implementation items** (directional): **RPT-00** the `report` saved-view
  `kind` through the existing `SavedViewCodec` seam (a config blob, no
  migration, no entity — ADR-082 d10); **RPT-01** the closed source
  vocabulary with per-source grains, groups and measures declared the way
  `SHARED_DIMENSION_SUPPORT` declares scopes; **RPT-02** the report page and
  its three visual shapes (the existing bounded trend and sparkline plus one
  grouped bar); **RPT-03** the six built-in reports as code, not rows, and the
  relabel.
- **Dependencies.** V2.9; V2.10 and V2.12 for their sources (a source whose
  store does not exist is absent from the vocabulary, not stubbed).
- **Non-goals.** A dashboard or any arrangement of reports (V3); a formula
  field, an expression or SQL in a definition; a chart library; reports on
  Today; scheduled or emailed reports.
- **Debt and prerequisites.** None owner-held.
- **Completion criteria.** Every built-in report's figures match the
  surfaces they summarise by machine value; a definition round-trips through
  export; the executor's statement count is flat; a report over an absent
  source is refused at parse.
- **Unlocks.** "Explain this report" (V2.14); dashboards (V3).

### V2.14 — GROUNDED AI (PRESUMPTIVE — gated on the owner-held key)

- **Theme.** *Explain the facts* — Stage A: AI retrieves, compares,
  summarises, explains and identifies patterns over facts deterministic code
  computed, cited by id; it never computes or invents one.
- **User-visible outcome.** The Weekly Review assistant live inside the
  ritual, reading the Review's own fact block; "Explain this report" on any
  Report; Ask DalyHub answering "why was August more expensive than July?"
  with the fact block shown beside the prose and every figure traceable to
  it; every surface degrading to its facts and one honest sentence when the
  provider is off, slow, refused or over budget.
- **Implementation items** (directional, in order): **GROUND-00** the gate as
  V2.8 stated it, plus DEBT-237's dev-only fake provider and DEBT-213's
  registry re-verification; **GROUND-01** the fact-block contract — history
  layer → `FactBlock` with evidence ids → schema that refuses an unsupplied
  figure; **GROUND-02** DEBT-91 closed by calling `loadGoalStories`,
  `selectGoalNextAction` and the period account, and the Weekly Review
  assistant live; **GROUND-03** "explain this" for Reports and the
  comparison intents in Ask; **GROUND-04** the injection corpus extended with
  payee, memo and filename cases, attachment content asserted absent from
  evidence, the metadata-only ledger asserted by query.
- **Dependencies.** The owner's key; V2.9 (facts), V2.13 (reports to
  explain), V2.12 (money to explain — optional: the Review assistant needs
  none of it).
- **Non-goals.** Any mutation (V2.15); document text as evidence; embeddings
  (ADR-073 §20); a chat with memory; autonomous anything.
- **Debt and prerequisites.** DEBT-237, DEBT-213, DEBT-91 in that order;
  DEBT-92/93 re-read against live usage data once it exists.
- **Completion criteria.** The gate's seven clauses green; no figure in any
  answer absent from its fact block (asserted by test on the evaluation
  corpus); the fake-provider E2E path green on the same tree; the off-state
  journeys unchanged.
- **Unlocks.** V2.15.

### V2.15 — ASSISTED AI (PRESUMPTIVE)

- **Theme.** *Propose, never act* — Stage B: structured, approval-based
  proposals through the one existing apply path, for the work the domains now
  generate.
- **User-visible outcome.** Proposed Tasks from a Meeting or a Note as today,
  plus: categories for a batch of uncategorised transactions; a likely
  duplicate or an unpaired transfer flagged for correction; a follow-up
  drafted for an overdue Obligation; a Review's reflection drafted from its
  facts — each reviewed field by field, applied as the owner, idempotent on
  acceptance, undoable.
- **Implementation items** (directional): **ASSIST-00** new proposal item
  kinds (`transaction_category`, `transfer_pair`, `obligation`) in
  `apply-proposal.ts`, no second path; **ASSIST-01** the categorisation and
  correction proposals over the Finance queue; **ASSIST-02** obligation and
  Review drafting; **ASSIST-03** the evaluation corpus and budgets per feature.
- **Dependencies.** V2.14 live for at least one release with usage in the
  ledger.
- **Non-goals.** Unattended runs, scheduling, background agents, any
  mutation without a click, any proposal that cannot be undone.
- **Completion criteria.** Every new item kind proven through the apply
  route with a replayed acceptance creating nothing twice; rejection charged
  and recorded; the owner's undo reaching every applied kind.
- **Unlocks.** V2.16.

### V2.16 — CONSOLIDATE (PRESUMPTIVE — the V3 readiness release)

- **Theme.** *One product, one map* — the question-first rail, the deletion
  path, every store in the archive and the rehearsal, and the register
  closed or re-homed.
- **User-visible outcome.** The rail reads as the five questions — Do,
  Organise, Deal with, Money, Understand — with Views under system; the
  owner can delete a workspace deliberately; an export and a restore cover
  every store the product has, proven together; nothing in the register is
  open without a home.
- **Implementation items** (directional): **CONSOL-00** the rail regroup
  ([§6 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#6-information-architecture)),
  accepted at every width and appearance; **CONSOL-01** DEBT-242 — a guarded
  purge with an audit tombstone on the ADR-046 pattern, or a recorded
  decision that deletion is the owner's infrastructure act; **CONSOL-02** the
  whole-product restore rehearsal (D1, R2, every collection) as a repeatable
  command; **CONSOL-03** the register pass: every open entry closed, re-homed
  to V3 with a recorded reason, or struck by decision; **CONSOL-04** the
  retirement of anything two releases left behind (an old table, a stranded
  route, a duplicated read).
- **Dependencies.** Everything above.
- **Non-goals.** New capability of any kind; a visual redesign; V3 features.
- **Completion criteria.** The V3 boundary in
  [§12 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#12-the-v3-boundary)
  measured true, clause by clause, against `main`.
- **Unlocks.** V3.

---

## The V3 boundary

Recorded in [§12 of the strategy](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#12-the-v3-boundary)
and not restated: V3 begins when the spine, Life Admin, Finance core,
Reports, grounded and assisted AI, attachments and the consolidated
architecture are all measured mature, and it is the home of dashboards,
document text as evidence, bank feeds, splits and holdings, a real
capture-triage state, the offline slice if it is ever earned, and anything
that would need an owner-supplied credential class the product does not yet
hold. Not a number reached; a boundary crossed.

---

## Succession logic

V2.10 LIFE ADMIN is defined by its own decision pass against a
re-measurement of `main` after V2.9 completes, exactly as V2.9 was defined
against `6b4d4a8` rather than inherited from V2.8's LATER table. It may keep,
reorder or refuse anything in the sequence above, and it says why. What it
may not do is add a second due-and-recurring model, a second aggregation
layer, a second file primitive or an AI feature that computes a fact
(ADR-116) — those are the boundaries that keep the four priorities from
becoming four islands, and they outlive any one release's ordering.

---

## Related documents

- [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md) — the analysis this file is the roadmap truth of
- [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md) — the predecessor programme, complete 2026-09-04
- [ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export) — this pass's decision record
- [ADR-117](../decisions/ARCHITECTURE_DECISIONS.md#adr-117-insight--one-history-vocabulary-over-stores-already-written-a-bound-that-is-stated-rather-than-applied-and-a-link-check-that-makes-the-map-a-gate) — what implementing V2.9 decided
- [ADR-079](../decisions/ARCHITECTURE_DECISIONS.md#adr-079-review-insights--three-kinds-of-truth-one-persisted-snapshot-and-no-score) · [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) · [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question) — the rules every INS item inherits
- [ADR-082 (saved views)](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract) — the seam V2.13 reuses
- [`REVIEWS_MODULE.md`](../development/REVIEWS_MODULE.md) · [`GOALS_MODULE.md`](../development/GOALS_MODULE.md) · [`ACTIVITY_TIMELINE.md`](../development/ACTIVITY_TIMELINE.md) · [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md) — the module authorities INS-02/03/04 touch
- [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md) — the Static tier INS-00 extends
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is owed, including DEBT-238 … DEBT-242
- [`PRODUCT_PRINCIPLES.md`](../product/PRODUCT_PRINCIPLES.md) — "the system is the memory"; V2.9 is the memory reading itself back
