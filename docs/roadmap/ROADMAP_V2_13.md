# ROADMAP_V2_13.md — DalyHub V2.13, REPORTS

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md)
> hold V2.1 … V2.8; [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) holds V2.9 INSIGHT
> **and the remaining V2 sequence, V2.14 … V2.16**, which this file does not
> restate and does not replace; [`ROADMAP_V2_10.md`](ROADMAP_V2_10.md) holds
> V2.10 LIFE ADMIN (**complete 2026-09-05**);
> [`ROADMAP_V2_11.md`](ROADMAP_V2_11.md) holds V2.11 EVIDENCE (**complete
> 2026-09-06**); [`ROADMAP_V2_12.md`](ROADMAP_V2_12.md) holds V2.12 FINANCE
> CORE (**implementation complete 2026-09-06; production activation
> owner-gated on
> [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)**).
>
> **This file is V2.13, and it is where new work goes.** It was defined on
> 2026-09-07 against `main` at `8287d71` (PERF-01, PR #270) by a pass that
> re-measured the saved-view, history, analytics, Finance, obligation, Goal
> measurement, Review-snapshot, Task-completion, export, restore, search,
> navigation and chart code rather than inheriting the PRESUMPTIVE sketch in
> [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v213--reports-presumptive). Where that
> sketch and this file disagree, **this file wins**, and every disagreement is
> stated with the measurement that produced it. The durable decisions this pass
> made are
> [ADR-121](../decisions/ARCHITECTURE_DECISIONS.md#adr-121-reports--a-saved-definition-is-a-third-saved-view-kind-one-breakdown-axis-per-question-a-closed-per-source-vocabulary-and-a-result-that-carries-its-own-currency-and-bound).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.13 REPORTS — COMPLETE (2026-09-07).** All six items,
RPT-00 … RPT-05, delivered in one branch and one pull request, as the owner
asked.

**Successor: V2.14 GROUNDED AI — PLANNED, definition pass next** — see
[`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v214--grounded-ai-presumptive--gated-on-the-owner-held-key).
Nothing in V2.14 is built here. `ReportResult` is deliberately shaped so a fact
block can be derived from it without Reports acquiring any dependency on AI;
there is no provider call, no "Explain" control and no dead AI surface in this
release.

---

## The theme: REPORTS — one saved definition, many questions

DalyHub already knows a great deal. It knows which Tasks were completed and
when, what state each Project was in at every Review, every Goal measurement the
owner has recorded, every obligation and what it is expected to cost, every
transaction, category, budget and account balance, and the latest valuation of
every Asset.

**Those facts live on separate screens, and none of them can be kept.** The
owner can read this month's spending on the Finance home, and next month they
must read it again from scratch. They cannot write down the *question* — "how
much do I spend on groceries each month?" — and come back to it. Every question
DalyHub can answer today is answered once, by navigating to the surface that
happens to hold it, with the period that surface happens to offer.

The product theme is one sentence: **one saved definition, many questions.**

> I open Insight. I open *Spending by category*. It is the last twelve months of
> my money, by category, per currency, transfers excluded, and it agrees with
> the Finance home to the cent. I change the period; the URL changes with it. I
> save it as *Household spending*. Tomorrow I open it again and it answers with
> today's data, because what I saved was the question and not the answer.

Everything below serves that paragraph.

### The one architectural rule

**A Report stores the question, never the answer.**

Results are computed on open, from canonical domain reads, through the
repositories that already own those facts. There is no stored aggregate, no
snapshot table, no cache, no second analytics engine and no second meaning for
any figure. V2.9's deterministic history layer
([ADR-117](../decisions/ARCHITECTURE_DECISIONS.md#adr-117-insight--one-history-vocabulary-over-stores-already-written-a-bound-that-is-stated-rather-than-applied-and-a-link-check-that-makes-the-map-a-gate))
remains authoritative for "over time", and this release adds consumers to it
rather than a fourth idea of a period.

---

## What was measured, and what it changed

The pass read `main` at `8287d71` before writing a line. Ten measurements
changed the sketch.

**1. The saved-view seam is genuinely codec-driven, and a `report` kind needs no
migration.** `task_saved_views` gained its `kind` column in migration
`0036_generalise_saved_views.sql`, and that column carries **no `CHECK`
constraint** — the comment there says a row of an unrecognised kind "is simply
invisible rather than misinterpreted", and the repository binds `kind = ?` on
every statement. `D1SavedViewRepository<TConfig>` is parameterised by a
`SavedViewCodec<TConfig>` and knows nothing about any particular config. The
existing `length(config) <= 4096` `CHECK` is ample for a bounded report
definition. **RPT-00 therefore ships zero migrations.** The sketch said "a
config blob, no migration"; the measurement confirms it rather than assuming it.

**2. Export and restore already carry the kind.** The snapshot's
`readTaskSavedViews` selects `kind` and the restore's `TASK_SAVED_VIEWS`
descriptor lists it, with a comment recording exactly why: restoring without it
"would silently rewrite every cross-module view as a Tasks view". A `report` row
therefore round-trips through export → destroy → restore **with no new
collection and no code change**, and this release proves it rather than assuming
it.

**3. The history kernel already names V2.13.** `GRAIN_MAXIMUMS`'s comment says a
question wider than a grain's maximum "is a different question — one the
Review's across-Reviews facts and, from V2.13, a Report answer". The grains
(`day` 366, `week` 52, `month` 24, `review_period` 12) and the bucketing rule
(whole buckets generated backward from the window's end) are consumed unchanged.

**4. `insight-range.ts` already computes which grains a window can hold.**
`allowedGrains(windowId, todayIso)` derives the offer from
`requestedBucketCount` against `GRAIN_MAXIMUMS`, so "the control's offer and the
series' bound can never drift apart". Reports reuse it verbatim; there is no
second table of legal window/grain pairs.

**5. Finance can answer a month and cannot answer a range.**
`FinanceRepository.monthSummary(month)` is one grouped statement and is what
both the Finance home and the budget screen read — but there is no read for "a
span of days, grouped by category" and no read for "money out per month across
twelve months". Executing the first built-in against `monthSummary` would be
twelve statements for twelve months, which is the per-bucket N+1 this programme
forbids. **RPT-02 adds exactly one Finance read**, `summariseRange`, and a
kernel test asserts it equals `monthSummary` over one month on a fixture built
to expose a second implementation.

**6. Task completion has two authorities, and only one of them is right here.**
`spine_records.completed_at` is the completion-time authority
([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine)
decision 4) and backs `countCompletedTasksInWindows` and
`countCompletedInBuckets`. `ReviewInsightRepository.listPeriodContributions`
groups completions by Area **from the Activity stream** — a different question,
deliberately immutable for closed periods. The Tasks-by-Area report must not use
it. **RPT-02 adds `TaskRepository.countCompletedByGroup`**, reading
`completed_at` under exactly the Completed collection's predicates, with the
Area resolved by the spine's own `COALESCE` precedence.

**7. Obligations can be listed and banded, and cannot be grouped.**
`ObligationRepository` has `list`, `listAttention`, `countByBand` and
`summariseBySubject`; none of them answers "how many obligations fall due in
each of the next three months, and what are they expected to cost". **RPT-02
adds `summariseDue`**, one grouped statement over the due-date range.

**8. There is no obligation occurrence store, and there must not be one.** An
obligation has exactly one open occurrence; the successor is written by
`complete`. Future occurrences beyond the next one **do not exist as rows**, and
`asset_obligations`' successor rule is deliberate
([ADR-118](../decisions/ARCHITECTURE_DECISIONS.md#adr-118-life-admin--an-obligation-is-an-entity-with-one-subject-in-two-representations-an-expected-amount-that-is-not-a-payment-and-an-old-table-that-is-retired-rather-than-left-behind)).
"Recurring commitments by month" is therefore a **projection computed in the
kernel from the canonical recurrence arithmetic** over the open recurring
obligations — never a stored schedule, never a forecast of all future spending,
and bounded to twelve months ahead with the bound stated.

**9. Net worth has no history, and this release does not invent one.**
`finance-networth.ts` says so in terms: "No historical series. A net-worth
series is a Report and belongs to V2.13." The pass re-measured, and the honest
answer is **no**. Account balances are derived from transactions and could be
run backwards; **Asset valuations cannot** — `listLatestAssetValuations` returns
the *latest* valuation and the store keeps no valuation history a balance-sheet
series could read. A net-worth series computed from today's Asset values applied
to past dates would be a fabricated history of the largest number in the
product. **Net worth is not a V2.13 report source.** See
[Net worth: refused, with the reason](#net-worth-refused-with-the-reason).

**10. Navigation has no room for another top-level rail item, and does not need
one.** Analytics sits at `navGroup: "organise", navOrder: 180`; Views, Finance
and Life Admin are already in `more`. Reports belong *inside* the surface that
already asks "what has been happening", so **`/analytics` is relabelled
Insight** — the label only, the route unchanged, every bookmark still working —
and Reports live at `/reports` in the same `organise` group directly after it.
The rail gains one row, not two, and no URL churns. Final question-first
navigation remains V2.16's.

---

## The model

### A Report is a definition

```
ReportConfig {
  version    1
  source     tasks | goals | projects | obligations | finance
  measure    a key from THAT source's closed measure list
  window     preset | ahead | custom
  breakdown  none | { time, grain } | { group, key }
  filters    a closed, per-source set of validated ids and enum values
  sort       value_desc | value_asc | label_asc | label_desc | chronological
  visual     number | table | bars | trend
}
```

It is declarative, versioned, serialisable, bounded, parseable and safe. It
**cannot** contain SQL, JavaScript, a formula, an arbitrary expression, a
function body, a column name, an operator or any user-authored code. The
executor maps a closed vocabulary to canonical repository reads, exactly as
`CrossViewConfig` maps a validated dimension to a trusted predicate. **This is a
product feature, not a query language.**

### Report is the third saved-view KIND

`SAVED_VIEW_KINDS` becomes `["tasks", "cross", "report"]`. One table, one
repository class, one storage path, one export collection — a kind contributes a
parser, a canonical serialiser and a write validator, and never a table
([ADR-082 saved views](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract),
decisions 3 and 10). Identity, title, workspace and owner scope, the 50-per-kind
bound, the case-insensitive unique name, export, restore and the URL integration
all arrive with the seam.

**The contract is not bent to fit.** The report codec obeys every rule the seam
states: `parse` is total, `validateForWrite` throws only when the value is not a
configuration at all, `serialise` is canonical, and `equals` is text equality
over the canonical form. Reports register **no entity type, no link type and no
Activity type**, exactly as Views and Analytics do.

### One breakdown AXIS per report, and why

The sketch's shape listed `grain` **and** `group` as independent fields, which
implies a fourth result shape: groups across periods. This pass rejected it, and
the reason is a product one rather than an implementation one.

Every question the release exists to make askable is answerable on **one** axis
plus filters:

| The owner's question | source | filter | breakdown |
|---|---|---|---|
| How much have I spent on groceries each month? | finance | category = Groceries | time, month |
| Where did my money go last year? | finance | — | group, category |
| Which Goals have moved over the last year? | goals | goal = *one Goal* | time, month |
| How many Tasks did I complete by Area? | tasks | — | group, area |
| What obligations are due in the next 90 days? | obligations | — | group, month |
| Which Projects repeatedly appeared at risk? | projects | — | group, project |
| What known commitments are coming up? | obligations | recurring only | group, month |

A `grouped_series` would buy the twelve-categories-by-twelve-months matrix, and
that matrix has no honest drawing: a stacked bar of twelve categories is
unreadable at 1440 px and absurd at 393 px, and the table is 144 cells on a
phone. **The axis is a choice the owner makes, and the registry decides which
choices exist.** An unsupported combination is impossible to express, rather
than possible to express and refused.

Deferred, not forbidden: if a real question needs it, `grouped_series` is an
additive fourth shape in a later release.

### Result shapes

```
scalar     one number                         (breakdown: none)
series     one value per BUCKET, oldest first (breakdown: time)
grouped    one value per GROUP, sorted        (breakdown: group)
```

A `ReportResult` carries the definition it answered, the resolved window, the
grain, the unit, its boundedness, its notes, and **BLOCKS**:

```
ReportResult { definition, shape, window, grain, unit, blocks[], bounded,
               bound, boundReason, notes[], availability }
ReportBlock  { currencyCode | null, rows[], total | null, remainder | null }
ReportRow    { key, label, value | null, detail?, period?, referenceId?, href? }
```

**One block per currency**, and never more than one currency inside a block.
That is how [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split)'s
rule — never sum unlike currencies — becomes a property of the type rather than
a rule a surface has to remember. A count measure produces exactly one block
with `currencyCode: null`. There is no FX conversion in V2.13 and none is
planned.

**`value: number | null` is the second load-bearing choice.** A measure declares
how an empty bucket reads:

- `zero` — *flows*: Tasks completed, money out, transaction count, obligations
  due. No records in a month genuinely means zero.
- `absent` — *levels*: a Goal measurement. A month with no weigh-in is **not
  70 kg and not 0 kg**; it is a month with no reading, and the row says so.
  Nothing is interpolated, carried forward or drawn through.

`referenceId` and `href` exist so a doubted figure opens the surface that owns
it, and so V2.14 can cite a row by id without Reports knowing AI exists.

---

## The closed source vocabulary

A source belongs only if the owner can ask a useful question over it **and** a
canonical bounded read already answers it (or is added here deliberately). Five
sources ship.

Every source declares its measures; every **measure** declares the grains and
the groups it supports, its unit, its empty-bucket rule and its default window
and breakdown. That is the registry, and it is the single authority — there is
no switch statement in a loader, an executor or a component that decides whether
a combination is legal.

### `tasks` — Tasks completed

| measure | unit | grains | groups | empty |
|---|---|---|---|---|
| `completed_count` | count | day, week, month | area, project, goal | zero |

Authority: `spine_records.completed_at`, live Tasks only — the *current*
completion state, so a reopened Task is not counted and a deleted one is not
counted. This is exactly the population the Completed collection returns for the
same window, which is what makes a report figure and the list behind it agree.
**Not** Activity `task.completed` events.

### `goals` — Goal measurements

| measure | unit | grains | groups | empty |
|---|---|---|---|---|
| `measurement_value` | value | month, week | — | **absent** |

Requires a `goalId` filter: a report is about one Goal's readings. Twenty Goals
on one chart is a texture, not a trend, and the units do not commute — kilograms
and books have no shared axis. The bucket value is **the latest reading in that
bucket**, which is the same rule `GoalMeasurementSummary` already uses for
"current value"; the report states it in words.

### `projects` — Project health across Reviews

| measure | unit | grains | groups | empty |
|---|---|---|---|---|
| `health_state_reviews` | count | — | project, health_state | zero |

Authority: the Review insight snapshots, read through `listSnapshotSeries` from
the most recent completed Review of one type. A `reviewType` filter is required
and defaults to `weekly`, because **a weekly Review's series contains only
weekly Reviews** — the same-type rule the snapshot series already enforces. The
result states how many Reviews it observed. **No health score, no percentage, no
grade.** The measure counts Reviews in which a Project recorded a state; a
`health_state` filter narrows it to `at_risk` for "which Projects repeatedly
appeared at risk".

### `obligations` — what falls due

| measure | unit | grains | groups | empty |
|---|---|---|---|---|
| `due_count` | count | month, week | month, category, subject | zero |
| `expected_amount` | money | month | month, category | zero |
| `recurring_count` | count | month | month, category | zero |
| `recurring_expected_amount` | money | month | month, category | zero |

`due_count` and `expected_amount` read **stored obligations** in a forward
window. `recurring_*` read the **projection**: the open recurring obligations,
advanced by the canonical recurrence arithmetic, bounded to twelve months. A
meter-recurring obligation cannot be projected onto a calendar and is
**excluded and counted** in a note, never estimated. An obligation with no
recorded amount contributes `null` to `expected_amount` and is **counted as
"amount not recorded"**, never as zero.

### `finance` — where the money went

| measure | unit | grains | groups | empty |
|---|---|---|---|---|
| `money_out` | money | month | category, account | zero |
| `money_in` | money | month | category, account | zero |
| `transaction_count` | count | month | category, account | zero |

Transfer legs are excluded by the query, exactly as `monthSummary` excludes
them. A refund in a spending category makes the net less negative and therefore
**reduces** spend — the canonical refund model, not a second one. Uncategorised
transactions are their own row, labelled *Uncategorised*, never folded into a
category and never dropped.

### What is deliberately absent

- **Net worth / balances over time** — see below.
- **Reviews as a source** — a Review's own facts are read through the Review
  surfaces and the snapshot series; `projects` is the report over them, and a
  second "reviews" source would be a second door onto one store.
- **Notes, Meetings, People, Diary, Habits, Assets** — real collections, and
  none of them answers a question the owner asked for in the shape of a measure.
  A source exists because a question exists, not because a table does.
- **Any cross-source measure.** A report has one source. "Spend per completed
  Task" is a ratio between two domains and nothing in the product means it.

---

## Net worth: refused, with the reason

The V2.9 sketch and `finance-networth.ts` both name a net-worth series as a
V2.13 opportunity. This pass re-measured and refuses it, in this release, for
one reason:

**DalyHub does not store Asset valuation history in a form a balance-sheet
series can read.** `FinanceRepository.listLatestAssetValuations()` returns each
live Asset's *latest* recorded valuation and nothing else. Net worth is
`accounts + valued Assets`, per currency. An account balance at a past date is
derivable from its transactions; an Asset's value at a past date is not
derivable from anything. A series built by holding today's house valuation
constant across twenty-four months would draw a smooth line through a number the
product was never told, and it would be the **largest** number in the product.

Three options were considered and one was taken:

1. **Ship a current-only "net worth" report.** Rejected: the Finance home
   already shows exactly that figure with its inputs and its exclusions. A
   report that duplicates one card is a second place for it to drift.
2. **Introduce a valuation-history mechanism here.** Rejected: it is a store, a
   migration, an export collection, a restore rehearsal and a write path, and
   [ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export)
   decision 2 is explicit that a bounded read needing new storage is a *finding*
   rather than a licence to add one. It is a Finance decision, not a Reports
   decision.
3. **Omit it, and raise the finding.** Taken. **[DEBT-250](../product/PRODUCT_DEBT.md)**
   records that Asset valuations keep no history, that this is what blocks a
   truthful net-worth series, and that the fix belongs to whichever release
   decides Assets should keep one.

`finance-networth.ts`'s comment is corrected in the same change, so the codebase
no longer promises a series V2.13 deliberately did not build.

---

## The window

The window vocabulary is V2.9's, extended by exactly one shape.

- **`preset`** — the six `INSIGHT_WINDOWS` (7 days, 4 weeks, 12 weeks, 6 months,
  12 months, 24 months), resolved against the owner's calendar day. **Dynamic by
  design**: "last 12 months" moves with time, which is the whole point of saving
  a question.
- **`ahead`** — a forward window of *N* days from the owner's today, for the
  questions that are about the future rather than the past (obligations due,
  commitments coming up). Bounded to 730 days. There is no backward equivalent
  because the presets are it.
- **`custom`** — an explicit `startIso`/`endIso` pair in owner wall-calendar
  days, **fixed** rather than dynamic. Bounded to 1096 days (three years) and
  refused if inverted. A custom window that would need more buckets than its
  grain allows is **refused at parse time**, never silently shortened.

The distinction between dynamic and fixed is **explicit in the stored config**,
so a saved report either keeps asking the same question of a moving period or
keeps asking about one fixed period, and never accidentally the other. A preset
is never serialised into today's exact dates.

Owner-day semantics throughout: every boundary resolves through the owner's
timezone via `ownerCalendarIso` and `buildActivityWindow`, exactly as every
other windowed read does. There is no new date logic in this release.

---

## Grain, sort, and the visual set

**Grain** is `~/kernel/history`'s. A source's measure declares which grains it
supports; the window declares which grains it can *hold*
(`allowedGrains`). A grain outside either is **rejected at parse**, with a named
error. Nothing truncates.

**Sort** is four values plus one: `value_desc` (the grouped default),
`value_asc`, `label_asc`, `label_desc`, and `chronological` (the only legal sort
for a time breakdown, because a series drawn out of order is not a series).
There is no multi-column sorting, because no built-in needs one.

**Visuals** — four, and no chart library:

| visual | shape | primitive |
|---|---|---|
| `number` | scalar | the existing headline figure treatment |
| `table` | any | rows of label · value, always present |
| `trend` | series | the existing `TrendBars` |
| `bars` | grouped | **`CategoryBars`**, new shared primitive |

`CategoryBars` is the one new visual, and it is **horizontal proportion bars** —
the design system's agreed language for a share across named categories
(`DALYHUB_DESIGN_SYSTEM.md` Part 2 A5, and the reason `AnalyticsScreen`'s "Where
the work landed" is bars and not a donut). It is built as **shared** design-system
UI in `app/shared/charts/`, not as a Reports-private component, because a share
across named categories is a generic shape. No pie chart, no donut, no chart
zoo, and **no charting dependency**: the existing primitives are hand-rolled SVG
for reasons `TrendBars` records, and one more `map` over rectangles does not
change that trade.

**Every chart has a textual equivalent, and the table is never optional.** The
result table is rendered for every report, on every viewport, with the chart
beneath it. A chart carries `role="img"` and a generated summary naming every
label, value, period and unit. Colour is never the signal.

---

## Information architecture: Insight, and Reports inside it

`/analytics` is relabelled **Insight**, in the rail, the page title, the command
palette and the module manifest. **The route does not change.** Bookmarks,
existing links, the `analytics.activity` resource route and every test that
navigates to `/analytics` keep working. Churning a URL for a label is exactly
the kind of cost the constitution's "never lose the user's place" bullet
refuses.

Reports get `/reports`, in the same `organise` navigation group, at
`navOrder: 185` — directly after Insight and before Reviews. One new rail row
for the whole domain:

```
/analytics            Insight   — the ambient reading, unchanged
/reports              Reports   — the collection: built-ins and saved
/reports/new          the builder, from a blank definition
/reports/view?…       a definition executed from the URL (built-ins live here)
/reports/:reportId    a saved report, its definition read from storage
/reports/saved        the mutation resource route (create/update/rename/
                      duplicate/delete)
```

Reports is a *destination*, not a fourth phone bar slot: the three earned phone
slots are unchanged for the whole of V2, as Life Admin and Finance both decided.
It reaches the phone through the navigation sheet.

**No dashboard.** No grid, no widgets, no pinboard, no arrangement, no home
dashboard, no scheduling. That is
[ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export)
decision 2 and it is not re-litigated because several reports now exist.

---

## The six built-in reports

**Built-ins are definitions in code, not rows.** Everybody gets the canonical
examples; there is no migration, no duplicate row, no seed, and a later version
can improve one. They demonstrate the vocabulary, and a built-in id is stable so
a link to one keeps working. The same choice `CROSS_VIEW_SYSTEM_VIEWS` and the
Tasks built-in views already make.

Opening a built-in and changing something does **not** edit the built-in: the
surface offers **Save as a new report**, which writes an ordinary saved row. A
built-in can never be renamed, edited or deleted, and it can never silently
mutate globally.

| # | Built-in | Definition | Truth it must match |
|---|---|---|---|
| 1 | **Spending by category** | finance · `money_out` · 12 months · group category · bars | `monthSummary` over the same span, transfers excluded, refunds netted, uncategorised its own row, one block per currency |
| 2 | **Goal measurements** | goals · `measurement_value` · 12 months · time month · trend | `listMeasurements` for that Goal — the readings themselves, months without one absent |
| 3 | **Completed Tasks by Area** | tasks · `completed_count` · 12 weeks · group area · bars | `countCompletedTasksInWindows` over the same window; `spine_records.completed_at`, live Tasks |
| 4 | **Obligations due in the next 90 days** | obligations · `due_count` · ahead 90 · group month · table + bars | `ObligationRepository.list` filtered to the same window |
| 5 | **Project health across Reviews** | projects · `health_state_reviews` · health_state = at_risk · group project · table | the Review insight snapshots the Review surfaces read |
| 6 | **Recurring commitments by month** | obligations · `recurring_expected_amount` · ahead 365 · group month · bars | the canonical recurrence arithmetic over the open recurring obligations |

Each built-in's parity is asserted **by machine value** against the canonical
read, on real D1, on a fixture designed to expose a second implementation — not
by eye and not by a screenshot.

### Built-in 3: the historical-attribution question, answered honestly

A Task completed in March under *Health* and moved to *Career* in July: which
Area does the March completion belong to?

**DalyHub does not store Area-at-completion, and this release does not pretend
it does.** The spine keeps no link history; `listPeriodContributions` already
makes the same approximation and states it. The report therefore attributes a
completion to the Area the Task rolls up to **now**, and **says so on the
surface, every time**, in the report's own notes:

> Attributed to where each Task sits today. DalyHub does not record which Area a
> Task belonged to when it was completed, so moving a Task moves its history.

That is the truthful answer available. Refusing the grouping entirely was
considered and rejected: "completed Tasks by Area" is a question the owner
genuinely has, the current-classification answer is useful, and an unstated
approximation — not the approximation itself — is what would make it dishonest.
**[DEBT-251](../product/PRODUCT_DEBT.md)** records the underlying gap.

### Built-in 6: a projection, not a forecast

"Recurring commitments by month" answers *what known commitments are expected
each month*. It is not a forecast of future spending. It:

- reads only **open**, **date-recurring** obligations;
- advances each by its own canonical recurrence rule, through the same
  arithmetic `complete` uses to write a successor;
- is bounded to twelve months ahead, and says so;
- **excludes and counts** meter-recurring obligations, which have no calendar;
- reports an obligation with no recorded amount as *amount not recorded*, never
  as zero;
- separates currencies, never converting.

---

## Saving, URLs and reproducibility

The URL **is** the definition, exactly as it is for cross-module views. One
codec (`reports-url-state.ts`) sits between the address bar and
`ReportConfig`, decoding is total and lenient, and the same shape backs the
address bar, the loader payload and the persisted row — so a saved report and a
copied link can never mean different things.

**What a Report URL carries:** source, measure, window kind and bounds, grain or
group, sort, visual, and **ids** for filters. **What it never carries:** an
amount, a payee, a memo, a category *name*, an account *name*, or any value from
a result. A URL is shoulder-surfable, shareable and logged; the Finance module
already holds this line and Reports hold it too.

"Shareable by URL" in a single-user product means *the URL reproduces the view
for the authorised owner*. There is no public link, no share token and no
unauthenticated access; Cloudflare Access stays in front of everything.

**Reproducibility.** A saved report answers the same *semantic* question after
reload. A preset window moves with time (that is the point); a custom window
does not. The stored config says which, so the two can never be confused.

---

## Failure, emptiness and boundedness

**Four states, four sentences, never one drawing.**

| state | what it means | what is shown |
|---|---|---|
| true zero | the read succeeded and the value is 0 | `0`, with the period named |
| no records | nothing in the window matched | "Nothing in this period", never a flat zero chart |
| unsupported | the source or combination cannot answer | the named refusal, at parse |
| read failed | the repository read did not return | **Not available**, using the existing semantics |

A failed read is **never** a zero. Source-level atomicity is the first-release
rule: a report reads one source, so a failed read fails the whole result rather
than quietly omitting a group. Nothing is partially rendered as though complete.

**Boundedness is stated, always.** A grouped result is bounded to
`MAX_REPORT_GROUPS` rows; when more groups exist, the surface shows the top *N*
**plus an explicit, arithmetically truthful remainder row** ("18 other
categories · $412.00"), computed from the same statement rather than by
subtracting a bounded page from an unbounded guess. A series carries the history
kernel's own `bounded`/`bound`/`boundReason` straight through. Nothing is
silently discarded.

---

## Cost: statements and bounds

The executor's shape is fixed by the definition and **never by the data**.

| built-in | statements | grows with |
|---|---|---|
| 1 Spending by category | 1 (`summariseRange`) | nothing |
| 2 Goal measurements | 1 (`listMeasurements`, bounded) | nothing |
| 3 Completed Tasks by Area | 2 (grouped rows; totals) | nothing |
| 4 Obligations due 90 days | 1 (`summariseDue`) | nothing |
| 5 Project health across Reviews | 2 (latest Review; snapshot series) | nothing |
| 6 Recurring commitments | 1 (bounded list) + pure arithmetic | nothing |

Never one query per group, never one query per bucket, never one query per
entity. Where a bucketed read is needed, it uses the V2.9 technique — bucket
boundaries as **one bound JSON parameter** expanded by `json_each` — so the
statement's shape is independent of the window, and D1's 100-bound-variable
ceiling is never approached. There is no private Report SQL batching.

**The Reports home executes nothing.** It lists built-in definitions (name,
question, source) and saved definitions (name, question) — **it does not run
six reports before first paint**. A report executes when it is opened. The
builder executes on an explicit, deselected-control change, never on a keystroke.

**No cache.** Reports are live deterministic reads. A generic result cache would
buy nothing measurable here and would cost invalidation across every domain;
the strong bias against it is taken.

`/reports` is registered with PERF-01's navigation instrumentation beside the
seven routes that programme measured: **2 statements, depth 2, 1,373 bytes at
BOTH fixture sizes**. Every other route there grows with the records it draws;
this one draws none.

`EXPLAIN QUERY PLAN` over every distinct statement the six built-ins issue — as
issued, with their real bindings — finds **no base-table scan**, so V2.13 adds
**no index**: an index is warranted when a measurement shows an avoidable scan,
and the measurement showed none. Round-trip depth is at most 2 for every
built-in, and the two that pay it are the ones that genuinely must.

Reports and Insight inherit `PRIMARY_NAV_PREFETCH` (`intent`) through the shared
policy. There is no second prefetch strategy.

---

## Security and privacy

**Workspace isolation is in the query.** Every repository the executor reaches
is workspace-bound at construction and takes no `workspaceId`. A foreign
category, account, Area, Project, Goal, obligation subject or saved-report id is
**indistinguishable from one that does not exist** — the read returns nothing,
and no error text discloses existence.

**A foreign filter id cannot broaden a result.** A filter is a narrowing
predicate bound inside a workspace-scoped statement; an unknown id narrows to
nothing rather than being dropped. The hostile-workspace suite proves each id
kind.

**Nothing logs a result.** A Reports route logs a source key, a shape and a
duration. No amount, no payee, no group label, no row value, ever — the same
line `finance-facts.server.ts` holds.

**Activity.** Saving, renaming or deleting a report writes **no Activity event**,
because saved views do not and Reports are saved views. *Executing* a report is
emphatically not an event: reading is not history, the judgement Analytics and
the Review's evidence already made.

**Search.** Saved reports are searchable **by name only**. No config, no source,
no filter id, no result value, no amount. Built-ins are not indexed. Reports are
in `RECENCY_EXCLUDED_TYPES`' spirit: nothing is volunteered for an empty query.

**AI.** No provider is called, no "Explain" control exists, no summary is
generated and nothing is sent anywhere. `ReportResult` is structured so V2.14
can derive a fact block from it; that is a shape, not a feature, and there is no
dead AI UI in this release.

---

## Work breakdown

- **☑ RPT-00 — the `report` saved-view kind.** `SAVED_VIEW_KINDS` gains
  `report`; `ReportConfig`, its total parser, its canonical serialiser, its
  write validator and `REPORT_CODEC`; the repository factory and the
  `reports` scope member; export/restore round-trip proven. **No migration.**
- **☑ RPT-01 — the closed source vocabulary.** The registry: five sources, their
  measures, grains, groups, filters, defaults and visuals, with per-measure
  support declared once and consumed everywhere. Strict validation with named
  refusals.
- **☑ RPT-02 — the canonical reads.** `FinanceRepository.summariseRange`,
  `TaskRepository.countCompletedByGroup`, `ObligationRepository.summariseDue`
  and `listDueInRange`; each one grouped statement, each proven against the
  surface it must agree with.
- **☑ RPT-03 — the deterministic executor.** `app/kernel/reports` parses,
  validates against the registry, resolves window and grain, calls one source
  adapter, and returns a canonical `ReportResult`. No D1 in a component, no
  per-screen executor.
- **☑ RPT-04 — the Reports experience.** `/reports`, the builder, the report
  page, `CategoryBars`, the URL codec, the mutation route, the commands, the
  search provider, and the Insight relabel.
- **☑ RPT-05 — the six built-ins.** In code, with machine-value parity proven
  for each against its canonical read.

---

## Non-goals

Refused for V2.13, each with its reason:

- **Any dashboard** — grid, widgets, pinboard, arrangement, home dashboard
  (ADR-116 d2; V3).
- **Scheduled or emailed reports**, notifications, weekly PDFs.
- **A formula field, calculated column, expression, operator or SQL fragment.**
  A missing measure is added deliberately to the registry as deterministic code.
- **A charting library.** The existing primitives plus one grouped-bar component
  cover every defined shape.
- **`grouped_series`** — no question in this release needs it and no drawing of
  it is honest at 393 px.
- **A net-worth series** — see [above](#net-worth-refused-with-the-reason).
- **A result cache**, a stored aggregate, or any snapshot introduced to make
  Reports fast.
- **PDF export or a print designer.** CSV of the current result IS shipped — see
  below — because the rows are already computed; nothing beyond it.
- **Favourites, folders, report packs.** The saved list is enough.
- **Reports on Today.**
- **Any AI.**

### Three decisions the definition pass owed an answer

**CSV: shipped.** `/reports/export` returns the rows of the definition in the
URL, through the SAME codec and the SAME executor the page uses — so a
downloaded figure and the figure on screen cannot differ. It costs one route and
no new arithmetic. Three rules make it honest: the **currency travels with the
number**, because a spreadsheet is exactly where two currencies get summed by
whoever opens it; a row with **no reading is written empty**, never as `0`; and
every **note the surface printed is in the file** as a comment row above the
data, because a spreadsheet is exactly where an approximation gets forgotten.
The filename names the source and the measure, never a value — a filename is
visible in a download shelf.

**Obsidian: the definition, never the result.** The vault's Settings page lists
saved views and reports, and a report prints its QUESTION ("Finance · Money out
· 12 months") rather than its answer. A result is derived and stale the moment
it is written to a file; the definition is the durable thing, and it is what the
canonical archive carries too. No static report snapshot is created inside
DalyHub to feed the vault.

The same change corrects an inaccuracy V2.13 would otherwise have made worse:
that list was headed *"Saved Tasks views"* and already carried cross-module
views, so a saved report would have been exported as a Tasks view. It is now
grouped by kind.

**Offline: no new behaviour, and none removed.** A report already open stays
readable under the existing PWA cache; nothing about a result is persisted for
offline use, and the `.data` request that produces one is never served stale
(`PERFORMANCE.md` §8). Reports adds no offline surface of its own.

---

## Debt

**Closed:** none. V2.13 creates no store and repairs no existing entry.

**Raised:**

- **DEBT-250 — Asset valuations keep no history, so net worth has no truthful
  series.** P3. The finding behind the refusal above.
- **DEBT-251 — the spine stores no Area-at-completion, so completion history is
  attributed to where a Task sits today.** P3. Stated on every surface that
  makes the approximation; the fix is a link-history store, which is a spine
  decision.

**Untouched, deliberately:** DEBT-198 (Finance's owner-held gate — Reports do
not close it, and every Finance fixture in this release is synthetic),
[DEBT-248](../product/PRODUCT_DEBT.md#-debt-248--today-ships-up-to-200-overdue-rows-to-draw-three--p2)
and
[DEBT-249](../product/PRODUCT_DEBT.md#-debt-249--one-93-kb-stylesheet-is-render-blocking-on-every-first-paint--p3)
(PERF-01's findings — Reports change neither system, and a release must not
become a dumping ground for unrelated performance debt).

---

## Falsification: eighteen deliberate breakages, every one reverted

Each rule below was BROKEN in the working tree, the narrowest suite that should
catch it was run, and the breakage was reverted. A rule that survived its own
falsification is a test gap, not a passing rule — **one did**, and the gap was
closed before this release completed.

| # | The breakage | What failed |
|---|---|---|
| 1 | The Finance adapter computes spend privately instead of `rangeDirectionAmount` | *spending by category equals the Finance month's own totals*; *transfers are excluded* |
| 2 | The Tasks report counts `task.completed` ACTIVITY events instead of `completed_at` | *completed Tasks by Area equals the completion authority* — the reopened Task appeared, 5 against 4 |
| 3 | The workspace predicate dropped from the range read | *a foreign CATEGORY narrows to nothing*; *a foreign ACCOUNT contributes nothing* |
| 4 | An unsupported source/group combination accepted at parse | three refusal tests, including `review_period` |
| 5 | A grain the window cannot hold silently truncated | *REFUSES a grain the window cannot hold, rather than shortening it* |
| 6 | Unlike currencies collapsed into one block | five unit tests and four kernel tests, including *the two currencies never meet* |
| 7 | A built-in seeded as a database row (a report migration added) | *adds no migration* |
| 8 | The executor reads once per GROUP | *the statement budget holds at a SMALL workspace* — 4 against 2 |
| 9 | The executor reads once per BUCKET | *is flat in the number of BUCKETS a series asks for* — 25 against 13 |
| 10 | The export projection stops carrying `kind` | *a saved definition survives the archive* — the row came back as `tasks` |
| 11 | The restore descriptor drops `kind`, so a restore rewrites the definition's meaning | *the restore descriptor carries the kind and the config* |
| 12 | A Reports path records Activity | *records no Activity type and appends no event* |
| 13 | A result read logged with a figure in the line | *logs no result, and no figure* |
| 14 | The chart drawn without its table | five rendering tests, including *prints every label and value as text when the visual is BARS* |
| 15 | The Reports home executes all six built-ins before first paint | *never executes more than one report per surface* |
| 16 | An AI import added to a Reports path | *imports nothing from the AI kernel, platform or module* |
| 17 | A second `SavedViewCodec` declared for the `report` kind | *declares exactly one codec, and no repository of its own* |
| 18 | A `DashboardWidgetGrid` component added | **nothing failed** — see below |

**The gap #18 found, and how it was closed.** The dashboard assertion matched
`\bwidget`, which requires a word boundary — so `widget` was caught and
`DashboardWidgetGrid` was not, and a dashboard arrives under the second spelling
at least as often as the first. The pattern is now boundary-free and covers
`dashboard`, `pinboard`, `gridlayout`, `draggable` and `resizable` as well;
re-running the same breakage fails the test.

Two findings the falsification pass produced were **fixed rather than recorded**:

- The Tasks measure declared `areaId`, `projectId` and `goalId` filters that no
  read applied. A declared filter no read applies computes a BROADER figure than
  the owner asked for and prints it under their name — invisible, because a
  total looks the same either way. The list is now empty, the reason is in
  `report-source.ts`, and a test asserts it.
- Deleting a saved report left the owner on a page whose next revalidation said
  the report was no longer available. The delete now redirects to the
  collection.

---

## Completion criteria

V2.13 is complete when **all** of the following hold:

- [x] V2.13 is defined against measured `main`, and the durable decisions are an
      ADR.
- [x] One Report definition model exists; there is no second one.
- [x] The source registry is closed and is the only authority on legal
      combinations.
- [x] The executor is deterministic, pure of storage, and shared by every
      surface.
- [x] Reports are a saved-view **kind**; no table, no entity, no migration.
- [x] Saved reports create, rename, duplicate, update and delete; URL state
      round-trips; a built-in copies to a saved report.
- [x] All six built-ins work, and each matches its canonical read **by machine
      value** on real D1.
- [x] Mixed currency is never summed; a money result is one block per currency.
- [x] Every bound is stated; no truncation is silent.
- [x] No SQL, formula or expression language exists in a definition.
- [x] No dashboard exists.
- [x] Every chart has a textual equivalent; the table is always present.
- [x] The phone reads number → table → chart, with no horizontal overflow at
      320 px.
- [x] Search, export and restore work; a saved definition survives
      export → destroy → restore and answers identically.
- [x] Hostile-workspace isolation is proven for every id kind.
- [x] Statement counts are flat in workspace size, at a small and a large
      fixture.
- [x] PERF-01's prefetch contract is respected and unchanged.
- [x] No AI provider is reachable from any Reports code path.

---

## Owner actions

**None.** V2.13 creates no store, needs no migration, adds no binding, changes
no deployment configuration and does not touch DEBT-198's gate. Real financial
data must still not be imported until DEBT-198 closes; every Finance fixture in
this release is synthetic.
