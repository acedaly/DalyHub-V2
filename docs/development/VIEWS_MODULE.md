# Views — cross-module saved views (X-02)

> **Roadmap:** [X-02 — Saved views & cross-module filters](../roadmap/ROADMAP_V2_1.md#-x-02--saved-views--cross-module-filters)
> **Decision record:** [ADR-082](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract)
> **Builds on:** [ADR-059](../decisions/ARCHITECTURE_DECISIONS.md#adr-059-the-tasks-collection-contract--one-declarative-view-configuration-server-side-filtering-and-grouping-and-saved-views-as-validated-configuration) (the Tasks contract this generalises) · [ADR-079](../decisions/ARCHITECTURE_DECISIONS.md#adr-079-review-insights--three-kinds-of-truth-one-persisted-snapshot-and-no-score) (the Review evidence it reads)

Views is the answer to a question DalyHub could not previously hold open:

> *What currently needs my attention?* — and keep showing me, as the records move.

It is **not** a new place records live. The module registers no entity type, no link
type and no Activity type. A saved view describes a **query**; it never becomes a
second source of truth, and it never stores a result row.

---

## What it is, in one paragraph

One validated, declarative, versioned configuration can name a SET of entity scopes,
a set of SHARED filter dimensions, a set of strongly-typed MODULE dimensions, a sort
and a grouping. That configuration is the URL, the loader payload and the persisted
saved view — there is deliberately no second representation, so a saved view and a
copied link can never mean different things. It is executed by a bounded,
workspace-scoped repository that maps each already-validated dimension to its own
trusted predicate.

---

## Where the pieces live

| Path | What it owns |
|---|---|
| [`app/kernel/views/view-scopes.ts`](../../app/kernel/views/view-scopes.ts) | The closed set of entity scopes, the module each belongs to, and the owner's visible subset. |
| [`app/kernel/views/view-config.ts`](../../app/kernel/views/view-config.ts) | The configuration: shared + module dimensions, total lenient parsing, canonical serialisation, scope resolution. |
| [`app/kernel/views/saved-view.ts`](../../app/kernel/views/saved-view.ts) | The ONE saved-view record, repository contract and codec — generic over the config it holds. |
| [`app/kernel/views/view-system-views.ts`](../../app/kernel/views/view-system-views.ts) | The four built-in views, derived in code. |
| [`app/kernel/views/view-result.ts`](../../app/kernel/views/view-result.ts) | The shared result header + typed per-scope detail. |
| [`app/platform/storage/d1/d1-saved-view-repository.ts`](../../app/platform/storage/d1/d1-saved-view-repository.ts) | The ONE saved-view D1 adapter, for every kind. |
| [`app/platform/storage/d1/d1-cross-view-query-repository.ts`](../../app/platform/storage/d1/d1-cross-view-query-repository.ts) | The query engine: one bounded read per scope, a deterministic merge, a fixed anchor tail. |
| [`app/modules/views/`](../../app/modules/views/) | The `/views` surface, its URL codec, its control groups and its saved-view route. |
| [`app/shared/saved-views/`](../../app/shared/saved-views/) | The shared saved-view switcher, used by Tasks and Views. |

`~/kernel/task-views` is now a **façade** over the saved-view half of `~/kernel/views`:
`TaskSavedView` is `SavedView<TaskViewConfig>`, `TaskViewRepository` is
`SavedViewRepository<TaskViewConfig>`, and `TaskViewValidationError` and friends are
literally the same classes as `SavedViewValidationError` and friends. Every Tasks
caller is unchanged.

---

## The dimensions

### Shared

Meaningful across more than one scope. Each declares which scopes SUPPORT it in
`SHARED_DIMENSION_SUPPORT`, and that declaration is **enforced**.

| Dimension | Supported by |
|---|---|
| `areaId` | Task · Project · Goal · Note · Meeting |
| `goalId` | Task · Project |
| `projectId` | Task · Note · Meeting |
| `linkedToId` | every scope |
| `state` (open / closed) | Task · Project · Goal · Meeting · Review |
| `attention` | Task · Project · Goal · Meeting · Review |
| `createdWithin` / `updatedWithin` | every scope |
| `dueWithin` | Task · Goal · Meeting · Review |
| `archived` (`only`) | Project · Note · Meeting · Review |
| `changedSince: "last_review"` | every scope |

Tasks and Goals have no archive lifecycle of their own, so `exclude`/`include` are
trivially satisfied for them and only `archived: "only"` narrows to the scopes that
have one.

**A dimension a scope cannot answer REMOVES that scope and says so.** A Note has no
due date; a view filtering on "overdue" returns no Notes and the surface states why.
It never invents a value and it never quietly widens the result.

### Module-specific

Strongly typed, in each module's own vocabulary.

| Scope | Dimensions |
|---|---|
| Task | `priority` · `timeSector` · `status` · `waiting` · `delegated` · `someday` |
| Project | `workflowStatus` · `health` (PROJ-02) · `healthMovedSinceLastReview` (REVIEW-03) |
| Goal | `alignment` (AREA-03) |
| Note | `tag` (NOTES-02) |
| Meeting | `status` · `when` (upcoming / past) |
| Review | `reviewType` · `status` |

### "Needs attention", stated per scope

Nothing here is a score. Each clause is a plain fact the surface can name back:

- **Task** — open, and either due today or earlier, or being waited on.
- **Project** — open, and PROJ-02 rates it `at_risk`, `stale` or `blocked`.
- **Goal** — open, and AREA-03 rates it `neglected`, `unreachable` or `no_structure`.
- **Meeting** — planned but already past, or carrying a follow-up action with no
  completed Task behind it.
- **Review** — its period has ended and it is not complete.
- **Note** — deliberately none. A Note does not "need attention"; pretending it does
  would be the kind of manufactured urgency [AGENTS.md §2](../../AGENTS.md#2-product-philosophy) forbids.

Project health and Goal alignment are derived, not columns, so their SQL carries only
the OPEN precondition and the derived state is applied afterwards over the bounded
candidate set — by **PROJ-02's and AREA-03's own evaluators**, over their own batched
facts repositories. This module computes no health and no alignment of its own.

---

## How a view executes

1. Resolve the owner's visible scopes from `navigation.hiddenModuleIds` — **before**
   any row is read, so a hidden module's data can never be reached.
2. Resolve which of the requested scopes the configuration's own dimensions allow.
3. Read the REVIEW-03 boundary when the view filters on it, or when Projects are in
   scope (so every Project result can state how its health compares).
4. One bounded, deterministically ordered read per included scope
   (`CROSS_VIEW_SCOPE_CANDIDATE_LIMIT`).
5. Apply derived dimensions over the merged candidates.
6. Merge with a comparator that **matches each scope's `ORDER BY`**, then slice one
   page (`CROSS_VIEW_PAGE_LIMIT`).
7. Resolve Area/Project/Goal anchors for the whole page in a fixed number of grouped
   reads.

Not one enormous UNION: each scope has different predicates and different indexes,
and a UNION over six differently-shaped scopes produces a plan that depends on which
filters happened to be applied.

**Bind safety (RECALL-00-B, DEBT-223).** Every multi-id read in step 7 chunks its
`IN (…)` list at a D1-safe size: link anchors at 45 ids (each id appears in both
directions of the UNION, so `2 + 2n` binds — unchunked, a full 60-row page of
Notes/Meetings bound 122 parameters against D1's 100 cap and the statement
failed), parents at 90, and titles through `entities.getByIds` outright (its 90-id
chunks; the repository keeps no private twin of it). The anchor tail is therefore
still fixed relative to the page size — worst case two or three statements per
helper — and every statement stays inside the bind cap, asserted directly.

**The bound is stated (RECALL-00-B, the recorded decision).** The 60-row page
limit stays and `/views` discloses it instead of paginating: `CrossViewPage`
reports `readCount` (matching candidates read, before the page slice) and
`saturatedScopes` (scopes whose candidate read hit `CROSS_VIEW_SCOPE_CANDIDATE_LIMIT`),
and `bounded` is true for EITHER truncation — the page slice included, which the
old scope-saturation-only flag missed. The surface renders the Analytics-style
sentence ("first 60 of the N records read") plus one notice per saturated scope;
a keyset cursor over per-scope SQL ordering remains available to a later pass
without changing this contract.

**Cost.** A five-module view is an asserted **8 executed statements** against real
D1 (`test/kernel/cross-module-view-query.test.ts`), flat with respect to how many
records come back — and the adversarial 60-row Notes/Meetings page (every row
carrying its own Project and Area anchor) is a pinned **7 statements**, every one
within the bind cap, with hostile-workspace isolation asserted beside it.

---

## Dates

The owner's calendar day, current week and the AREA-03 recent-window boundary are
computed in the loader from the stored timezone and first-day-of-week preference,
using the same `~/shared/datetime` and `~/kernel/reviews` helpers the rest of the
product uses. **No timezone logic exists inside SQL, and X-02 introduces no second
definition of "today".**

---

## Persistence

One table, two kinds. Migration
[`0036_generalise_saved_views.sql`](../../migrations/0036_generalise_saved_views.sql)
adds `kind TEXT NOT NULL DEFAULT 'tasks'` to `task_saved_views` and swaps the two
owner indexes for kind-aware ones. Nothing is rewritten; existing Tasks saved views
are classified by the column default alone, and names are unique per owner **per
kind**.

The table keeps its historical name deliberately: renaming it would make a rollback
to the previous Worker fatal. `kind` is the truth.

The stored `config` is always the CANONICAL re-serialised configuration, so only
known keys with known values ever reach the column. It is read leniently, so a row
written by a later build degrades to the parts this build understands.

---

## REVIEW-03 integration

Two dimensions, both **reading** REVIEW-03 rather than rebuilding it:

- **`changedSince: "last_review"`** resolves to the `period_end` of the most recent
  `review_insight_snapshots` row. When no completed Review has one, the view returns
  **nothing** and the surface says so — returning everything would silently answer a
  different question.
- **`project.healthMovedSinceLastReview`** compares today's live PROJ-02 health with
  the health that snapshot recorded, and every Project result carries
  `healthSinceLastReview` so the movement can be stated in words with both states
  named.

In the other direction, REVIEW-03's evidence links now lead into the matching view
(`REVIEW_INSIGHT_VIEW_QUERIES`), so a Review says what was true when the period
closed and hands the owner a view that keeps answering it. A unit test decodes each
of those links and asserts it still means what its label promises.

No second Review analytics store. No score, grade, streak, percentage or AI
interpretation was added anywhere.

---

## The surface

`/views`, composed entirely from shared primitives — the PX-02 `CollectionLayout`,
the MOBILE-01 `CollectionControls` sheet and its `CollectionFilterChips` row, the
shared `EmptyState`, PX-02 entity identity and `EntityLink`, and the shared
saved-view switcher.

The controls read as a sentence:

```
Show      Tasks  Projects  Goals  Notes  Meetings  Reviews
Filter & sort →  Needs attention · Due: overdue · Sort: due date
```

There is no clause builder and no `Entity.Type = Project AND Relation.Area.Id IN (…)`.

Every result opens its **canonical** destination through the one shared
`entityDestination` helper — a Task opens the shared Task drawer (which this surface
hosts, exactly as Today does), a Project opens the Project record, a Review opens the
Review. A saved view never grows a detail surface of its own.

### Built-in views

Derived in code from the same vocabulary, so they cost no storage, cannot be deleted,
cannot silently mutate, and run through the **same** query engine:

- **Needs attention** — Tasks, Projects, Goals, Meetings, Reviews; sorted by due date.
- **This week** — everything that moved in the owner's current week.
- **Since my last Review** — the REVIEW-03 boundary.
- **Waiting & follow-up** — waiting Tasks and Meetings with outstanding actions.

### Empty states

Three genuinely different situations, three different next actions:

- **Nothing matched** — change what's included, or relax a condition.
- **No completed Review yet** — the Review boundary has nothing to compare against.
- **A scope was excluded** — some record types can't answer one of these conditions.

A saved view naming a module the owner later hid is **not deleted** and does **not
leak**: the unavailable part is named, and the remaining scopes still answer.

---

## Not scopes yet, and why

**People, Assets and Diary.** Their collections are real, but their query contracts
do not express the shared dimensions — People has no Area/Project anchor through the
spine, Asset obligations carry their own lifecycle vocabulary that does not map onto
open/closed, and Diary is chronological by design (DIARY-01A) with no structural
parent until [DIARY-02](../roadmap/ROADMAP_V2_1.md#-diary-02--day-context-links)
lands. Adding them would have meant a poor abstraction rather than universal support,
so they are recorded here as follow-up rather than built badly.

**Free-text search is not a dimension.** Search answers *"find this thing"*; a saved
view answers *"keep showing me things matching this condition"*. They reuse
repository infrastructure, not product concepts, and X-02 deliberately did not merge
them.

**Grouping by Area** is not offered. `groupBy` is `entity` or `none`; banding a mixed
list by Area needs an Area-first ordering the merge does not currently establish
workspace-wide, and inventing a per-page one would repeat the mistake DEBT-23 fixed.

---

## Testing

| Layer | File |
|---|---|
| Configuration (accept / drop / hostile input / canonical form / scope resolution) | `test/unit/views/view-config.test.ts` |
| URL codec + REVIEW-03 link integrity | `test/unit/views/views-url-state.test.ts` |
| Saved views: two kinds, one table; Task-view backward compatibility; isolation | `test/kernel/cross-module-saved-views.test.ts` |
| Cross-module querying: combined results, anchors, lifecycle, attention, REVIEW-03, module visibility, workspace isolation, query cost | `test/kernel/cross-module-view-query.test.ts` |
| The journey: create / reopen / edit / delete, canonical navigation, empty states, phone, keyboard, axe | `e2e/cross-module-views.spec.ts` |

## The alignment vocabulary is the product's, and other surfaces adopted it (V2.7 RECALL-04, 2026-09-01)

`/views` has always drawn `evaluateGoalAlignment`'s `active` state as **"Moving"**
(`ALIGNMENT_LABELS`, `views-controls.ts` and `views-presentation.ts`), and that
was already correct: alignment asks *"has this Goal had contributing work
recorded recently?"*, which consults no target, no schedule and no reading.

Analytics counted the identical state and called it **"Goals on track"** —
GOAL-02's phrase for a different question — so one label spanned two predicates
and two surfaces could honestly disagree about one workspace
([DEBT-234](../product/PRODUCT_DEBT.md#-debt-234--on-track-and-moving-carry-four-different-predicates-across-surfaces-and-a-project-with-no-health-facts-defaults-to-on-track-inside-snapshots--p2--resolved-2026-09-01),
ADR-114 decision 6). **RECALL-04 moved Analytics onto this module's word rather
than inventing a third**: its tile is now "Goals moving".

Nothing in `/views` changed, and that is the point — `HEALTH_LABELS.on_track`
("On track") is untouched, because **Project health** legitimately owns that
phrase for its own state. The rule is not "the words 'on track' are banned"; it
is that no word may span two predicates.
`test/unit/alignment/recall-04-label-truth.test.ts` asserts every option in this
module's `goal-alignment` group stays in alignment words, and that every
alignment state is offered — so no state can quietly borrow another vocabulary by
being absent from the group.
