# Reports — saved questions over canonical reads (V2.13)

> **Roadmap:** [V2.13 REPORTS](../roadmap/ROADMAP_V2_13.md)
> **Decision record:** [ADR-121](../decisions/ARCHITECTURE_DECISIONS.md#adr-121-reports--a-saved-definition-is-a-third-saved-view-kind-one-breakdown-axis-per-question-a-closed-per-source-vocabulary-and-a-result-that-carries-its-own-currency-and-bound)
> **Builds on:** [ADR-082 (saved views)](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract) · [ADR-117 (the history vocabulary)](../decisions/ARCHITECTURE_DECISIONS.md#adr-117-insight--one-history-vocabulary-over-stores-already-written-a-bound-that-is-stated-rather-than-applied-and-a-link-check-that-makes-the-map-a-gate) · [ADR-116 (saved reports before dashboards)](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export)

Reports is the answer to a question DalyHub could not previously keep:

> *How much do I spend on groceries each month?* — asked once, and answered again
> every time it is opened.

It is **not** a new place records live, and it is **not** a second analytics
engine. The module registers no entity type, no link type and no Activity type.

---

## What it is, in one paragraph

A Report is a **saved question**, never an answer. One validated, declarative,
versioned definition names a source, a measure, a window, ONE breakdown axis, a
set of filters, a sort and a visual — all from closed vocabularies. That
definition is the URL, the loader payload and the persisted row. It is executed
on open by one deterministic executor that asks EXACTLY ONE source adapter,
which reads through the repository that already owns the fact. Nothing is
stored, cached, snapshotted or pre-aggregated.

---

## Where the pieces live

| Path | What it owns |
|---|---|
| [`app/kernel/reports/report-vocabulary.ts`](../../app/kernel/reports/report-vocabulary.ts) | Every closed key set, and the shape a definition has. |
| [`app/kernel/reports/report-source.ts`](../../app/kernel/reports/report-source.ts) | **The registry** — the one authority on what a report may ask. |
| [`app/kernel/reports/report-config.ts`](../../app/kernel/reports/report-config.ts) | Total parsing, strict write validation, canonical serialisation. |
| [`app/kernel/reports/report-codec.ts`](../../app/kernel/reports/report-codec.ts) | The whole of what the `report` saved-view kind adds to storage. |
| [`app/kernel/reports/report-window.ts`](../../app/kernel/reports/report-window.ts) | Window resolution, and the grain refusal. |
| [`app/kernel/reports/report-result.ts`](../../app/kernel/reports/report-result.ts) | The result family: blocks, rows, remainders, notes. |
| [`app/kernel/reports/report-executor.ts`](../../app/kernel/reports/report-executor.ts) | The ONE executor, and the adapter contract. |
| [`app/kernel/reports/report-builtins.ts`](../../app/kernel/reports/report-builtins.ts) | The six built-ins, as code. |
| [`app/kernel/obligations/obligation-projection.ts`](../../app/kernel/obligations/obligation-projection.ts) | Projecting recurring commitments from the canonical recurrence rule. |
| [`app/platform/reports/report-adapters.server.ts`](../../app/platform/reports/report-adapters.server.ts) | The five source adapters — the only place a Report touches a store. |
| [`app/platform/reports/report-execution.server.ts`](../../app/platform/reports/report-execution.server.ts) | The trusted seam between a workspace scope and the executor. |
| [`app/modules/reports/`](../../app/modules/reports/) | The `/reports` surface, its URL codec, its controls and its mutation route. |
| [`app/shared/charts/CategoryBars.tsx`](../../app/shared/charts/CategoryBars.tsx) | The shared horizontal-bar primitive V2.13 added. |

---

## The definition

```
ReportConfig {
  version    1
  source     tasks | goals | projects | obligations | finance
  measure    a key from THAT source's closed measure list
  window     { preset } | { ahead, days } | { custom, startIso, endIso }
  breakdown  { none } | { time, grain } | { group, key }
  filters    a closed per-source set of validated ids and enum values
  sort       value_desc | value_asc | label_asc | label_desc | chronological
  visual     number | table | bars | trend
}
```

It can never contain SQL, JavaScript, a formula, an expression, an operator, a
column name or user-authored code. The executor maps a validated key to a
trusted canonical read, exactly as `CrossViewConfig` maps a validated dimension
to a trusted predicate.

### Two failure rules, on purpose

The saved-view seam requires `parse` to be TOTAL, and a cross-module view parses
leniently: an unknown key drops and the rest is kept. That is right for a filter
on a LIST — the owner can see the list is wider. It is wrong for a report,
because a report returns a NUMBER, and a number computed from a question the
owner did not ask looks identical to one computed from the question they did.

| Half | Fields | An unreadable value |
|---|---|---|
| **The question** | source, measure, window, breakdown, every filter | The definition is **incompatible**. Nothing is defaulted, the stored bytes are preserved verbatim, the surface says so, and every mutation on it is refused. |
| **Presentation** | sort, visual | Falls back to the measure's declared default. How a figure is drawn cannot change what was asked. |

An **unrecognised filter key fails the whole definition** rather than being
ignored, which is the opposite of a cross-module view's rule and the same
reasoning: a build that silently ignores a filter computes a BROADER figure than
the owner saved, presented under the same name.

---

## The registry is the one authority

Five sources; each declares its measures; each **measure** declares its unit,
aggregation, empty-bucket rule, supported grains, supported groups, supported
window kinds, allowed filters, required filters and defaults.

| Source | Measures | Groups |
|---|---|---|
| `tasks` | `completed_count` | area, project, goal |
| `goals` | `measurement_value` | — (one Goal per report) |
| `projects` | `health_state_reviews` | project, health_state |
| `obligations` | `due_count`, `expected_amount`, `recurring_count`, `recurring_expected_amount` | month, category, subject |
| `finance` | `money_out`, `money_in`, `transaction_count` | category, account, month |

**Support is declared per MEASURE, not per source**, because the honest support
genuinely differs inside one source: Finance money groups by category and by
account; a Goal measurement groups by nothing, because a Goal report is about
one Goal's readings and kilograms and books share no axis.

**A declared filter is applied by the read behind it.** That property is what
keeps the registry honest — a declared filter no read applies would compute a
broader figure and present it under the owner's name. The `tasks` measure
therefore declares **no filters at all** in V2.13: answering "completed Tasks in
Health, by week" means an ancestry predicate on three shared reads, two of which
V2.9 built for Insight and the Review, and this release's own questions do not
need it. `test/kernel/reports.test.ts` asserts the empty list rather than
leaving it to a reader's memory.

### One breakdown axis

A report breaks its measure down by TIME **or** by a GROUP, never both. Every
question the release exists to make askable is answerable that way, and the
fourth shape — groups across periods — has no honest drawing at the widths
DalyHub supports. The axis is a choice the registry offers, so an unsupported
combination is **not expressible** rather than expressible and refused.

---

## The result

```
ReportResult { definition, shape, window, grain, unit, blocks[], bounded, bound,
               boundReason, notes[], availability, computedAtIso }
ReportBlock  { currencyCode | null, rows[], total | null, recordCount, remainder }
ReportRow    { key, label, value | null, detail, period, referenceId }
```

- **One block per currency.** [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split)'s
  "never sum unlike currencies" is a property of the TYPE rather than a rule a
  surface remembers: there is no shape in which two currencies meet, and there
  is no FX conversion.
- **`value: number | null`.** A FLOW measure (completions, money, counts) reads
  an empty bucket as a true zero. A LEVEL measure (a Goal measurement) reads it
  as **absent**, and the surface says "No reading". Nothing is interpolated,
  carried forward or drawn through.
- **A bounded grouped result carries a REMAINDER** computed from the same read
  — "18 others · $412.00" — so the total still adds up and nothing is silently
  discarded.
- **A failed read is `unavailable`, never a zero.** A report reads one source,
  so failure is atomic at the source rather than a quietly missing group.
- **`referenceId`** is the seam V2.14 will cite a fact by. Reports depends on no
  AI, calls no provider and shows no "Explain" control.

---

## Every figure comes from the read that already owns it

| Source | Canonical read | Proof |
|---|---|---|
| finance | `FinanceRepository.summariseRange` — and `monthSummary` is **defined in terms of it** | `reports.test.ts` compares the two row for row over one month |
| tasks | `countCompletedByGroup` / `countCompletedInBuckets`, both over `spine_records.completed_at` ([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine) d4) | the report's rows sum to `countCompletedTasksInWindows` for the same window |
| goals | `listMeasurements` | the recorded readings, gaps and all |
| projects | `ReviewInsightRepository.listSnapshotSeries` | the same snapshots the Review surfaces read |
| obligations | `summariseDue`, and `listRecurring` + the canonical recurrence arithmetic | the report's total equals the canonical due read |

**Never the Activity stream for Task completions.**
`ReviewInsightRepository.listPeriodContributions` groups the same work from
`task.completed` events and is deliberately immutable for closed periods; it
answers a different question, and a Report must not present one as evidence for
the other.

### Two approximations, both stated on the surface

1. **Task completions are attributed to where each Task sits TODAY.** The spine
   stores no link history, so moving a Task moves its history
   ([DEBT-251](../product/PRODUCT_DEBT.md)). The measure's `standingNote` says
   so, the executor puts it in `ReportResult.notes`, and a kernel test asserts
   it arrives — the claim and its qualification travel together.
2. **A Goal measurement bucket shows the LAST reading in it.** The rule
   `GoalMeasurementSummary` already uses for "current value", stated rather than
   assumed.

Where a truthful answer is not available at all, the source is **omitted**: net
worth over time is refused because Asset valuations keep no history
([DEBT-250](../product/PRODUCT_DEBT.md)).

---

## Recurring commitments are projected, never stored

An obligation has exactly ONE open occurrence; its successor is written by
`complete`. Future occurrences beyond the next do not exist as rows, and V2.13
creates no schedule store to make them exist
([ADR-118](../decisions/ARCHITECTURE_DECISIONS.md#adr-118-life-admin--an-obligation-is-an-entity-with-one-subject-in-two-representations-an-expected-amount-that-is-not-a-payment-and-an-old-table-that-is-retired-rather-than-left-behind)).
`projectObligations` steps each open recurring commitment forward through
`nextObligationDate` — the same arithmetic `complete` uses — bounded to the
window and to 60 occurrences per commitment.

It is **not a forecast of future spending**. A meter-recurring commitment has no
calendar and is excluded and counted; a commitment with no recorded amount
contributes nothing to any total and is counted separately.

---

## Persistence: a kind, not a table

`SAVED_VIEW_KINDS` is `["tasks", "cross", "report"]`. One table, one repository
class, one storage path, one export collection.

**RPT-00 shipped zero migrations**, and that is a measurement: the `kind` column
added by [`0036_generalise_saved_views.sql`](../../migrations/0036_generalise_saved_views.sql)
carries no `CHECK`, the repository binds `kind = ?` on every statement, the
`length(config) <= 4096` bound is ample for a bounded definition, and both the
snapshot's `readTaskSavedViews` and the restore's `TASK_SAVED_VIEWS` descriptor
already carry `kind`. A saved report therefore exports and restores with no code
change; `reports.test.ts` proves the round trip answers identically rather than
assuming it.

A definition this build cannot read is preserved **verbatim** — the codec
re-serialises the stored value — and every mutation on it is refused, so a
rename can never rewrite a question nobody could read.

---

## The surface

```
/analytics            Insight   — the ambient reading (route unchanged)
/reports              the collection: built-ins and saved definitions
/reports/new          the builder, from a blank definition (a redirect)
/reports/view?…       a definition executed from the URL
/reports/:reportId    a saved report, or a built-in
/reports/saved        the mutation resource route
```

- **The controls are LINKS.** Every option is an ordinary link that changes the
  address bar, so the URL is always exactly what is on screen, a reload is a
  no-op, back works, and there is no query storm — there are no keystrokes.
- **The collection executes NOTHING.** Opening `/reports` is one statement: the
  owner's saved definitions. Built-ins are code and cost no read. A report runs
  when it is opened.
- **Number, then table, then chart**, in that DOM order, at every width. The
  table is never optional; `visual` chooses only what is drawn beside it.
- **Built-ins are immutable.** Changing one and saving writes a new report.
- **No dashboard.** No grid, no widgets, no arrangement, no previews.

### What a Report URL carries

Source, measure, window, breakdown, sort, visual and **ids** for filters. Never
an amount, a payee, a memo, a category NAME, an account NAME or any value from a
result — the line the Finance module already holds.

---

## Search, Activity and AI

- **Search** matches saved report **names** and nothing else. No config, no
  source, no filter id, no result value. Built-ins are not indexed, and an empty
  query returns nothing.
- **Activity**: none. Saving a report writes no event because saved views do
  not, and *executing* one certainly does not — reading is not history.
- **AI**: no provider is reachable from any Reports code path.

---

## Cost

| Built-in | Statements | Grows with |
|---|---|---|
| Spending by category | 1 | nothing |
| Goal measurements | 1 | nothing |
| Completed Tasks by Area | 2 | nothing |
| Obligations due in 90 days | 1 | nothing |
| Project health across Reviews | 2 | nothing |
| Recurring commitments by month | 1 | nothing |

Asserted against real D1 at a small workspace and again after 200 more
transactions and 40 more completed Tasks across 10 more Areas — the counts are
identical. A separate assertion doubles the bucket count of a series and checks
the statement count does not move.

Reports and Insight inherit PERF-01's `PRIMARY_NAV_PREFETCH` through the shared
policy; there is no second prefetch strategy and **no result cache**.

---

## Testing

| What | Where |
|---|---|
| The definition: parsing, refusals, canonical form, the registry's own invariants | [`test/unit/reports/report-definition.test.ts`](../../test/unit/reports/report-definition.test.ts) |
| The executor's assembly rules, against fake adapters | [`test/unit/reports/report-executor.test.ts`](../../test/unit/reports/report-executor.test.ts) |
| Machine-value parity, hostile workspace, the statement budget, export/restore — against real D1 | [`test/kernel/reports.test.ts`](../../test/kernel/reports.test.ts) |
| The journey: open, change, save, reload, delete, and the phone | [`e2e/reports.spec.ts`](../../e2e/reports.spec.ts) |
