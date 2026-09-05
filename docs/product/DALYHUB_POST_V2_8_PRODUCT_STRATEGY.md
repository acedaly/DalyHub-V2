# DalyHub after V2.8 — the product strategy from V2.9 to V3

> **What this is.** The product-strategy, architecture-planning and
> interaction-design pass that follows V2.8 CONVERGE. It re-measured `main`
> at `6b4d4a8` (CONV-03 merged, PR #252) on 2026-09-04 rather than inheriting
> V2.8's LATER table, and it answers one question: **what is the strongest
> sequence of releases after V2.8 that turns DalyHub into a coherent personal
> operating system without building four disconnected feature islands?**
>
> **What this is not.** It is not roadmap truth. The releases it recommends
> are *defined* in [`ROADMAP_V2_9.md`](../roadmap/ROADMAP_V2_9.md) — V2.9 in
> full, the rest at progressively lower resolution and labelled accordingly —
> and the durable architectural boundaries it draws are recorded once, in
> [ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export).
> Where this document and those two disagree, they win. Nothing here is a
> licence to implement: this pass changed documentation only.
>
> **Owner priorities, as given.** After V2.8: **Finance**, **Life Admin**,
> **Reports / Insight**, **AI** — stronger than the previously proposed
> emphasis on broad offline expansion, richer capture as a headline
> programme, People as a standalone programme, or visual polish for its own
> sake. Those may still appear as *enabling* work inside a priority release;
> they do not displace one.

---

## 0. The headline

**V2.9 is Insight, and it is not charts.** It is the deterministic history
and aggregation layer the product already has the data for and none of the
API for — the layer Reports, Finance's budget-vs-actual and grounded AI all
sit on. It is the cheapest release in the sequence, it carries no migration,
it needs nothing from the owner, and every later release consumes it.

**Then Life Admin, then Attachments, then Finance** — in that order because
Life Admin's founding decision (one `Obligation` model, shared with Finance
from day one) has to exist *before* Finance so that "something due,
recurring, optionally with money attached" is never modelled twice; because
Attachments are a second data store whose backup and restore must be
rehearsed before the first owner file is accepted; and because Finance is
hard-gated on the off-Cloudflare backup ([DEBT-198](PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2))
that only the owner can produce — sequencing two releases in front of it is
what gives that gate time to clear without stalling the product.

**Then Reports, then grounded AI reads, then assisted AI actions, then one
consolidation release — and V3.** Eight releases, not ten: the "unified
obligations" release the brief sketched is dissolved into Life Admin (the
model is shared from the start) and Finance (the settlement link), and
"consolidation" and "V3 readiness" are one release, because a release whose
theme is tidying up does not need a sequel.

The sequence, the reasoning and the alternatives are in [§10](#10-the-sequencing-options-compared).

---

## 1. The product, measured through the five questions

The brief's product-coherence test. Every verdict is measured on `6b4d4a8`.

| The owner asks | Answered by | Verdict | Evidence |
|---|---|---|---|
| **What do I need to do?** | Tasks · Projects · Today · Plan | **Mature.** The daily-driver chain has no broken verb (V2.8 measured it), one Task anatomy everywhere it can be acted on (CONV-01/02), a green deterministic gate (CONV-00/03, the ten-run count owner-held), the Goal layer decision-grade (V2.5), retrieval reaching content, time and commitment (V2.7). | [`ROADMAP_V2_8.md`](../roadmap/ROADMAP_V2_8.md#the-chain) |
| **What do I need to deal with?** | Assets' obligations, and nothing else | **Half-answered, and only for things that are Assets.** `asset_obligations.asset_id` is `NOT NULL` with a composite FK into `entities (…, type='asset')`, so an obligation cannot exist without an Asset parent; there is no amount column; a school fee, a tax return, a passport renewal or a gym membership has nowhere to live but a recurring Task with no amount, no evidence and no renewal history. The machinery that *does* exist is the right shape: a closed category set, a recurrence chain (`series_id`/`sequence`/`next_obligation_id`), one-batch completion with a proof event and a forward-only canonical-fact update (ADR-083), 30/7/1 notification rungs, one Today attention row deduplicated against an open linked Task. | `migrations/0025_asset_history_and_obligations.sql:97-187`; `app/kernel/assets/asset-obligation.ts`; `app/kernel/notifications/notification-evaluator.ts:141`; [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md#obligations-on-today-asset-02-widened-by-v210-life-03) |
| **Where is my money going?** | — | **Unanswered.** The money discipline exists (ADR-049: integer minor units + a currency code, `app/kernel/money/money.ts`, never converts), and every money column in the schema is an Asset column (`purchase_price_minor`, `replacement_value_minor`, `asset_events.cost_minor`/`value_minor`). No accounts, no transactions, no categories, no budget, and **no CSV/OFX/QIF parser anywhere in `app/`** — the only import path in the product is read-only ICS. | `migrations/0016`, `0025`; grep of `app/` for `csv\|CSV\|OFX\|QIF` — no matches; [`SETTINGS_MODULE.md`](../development/SETTINGS_MODULE.md) ("import … remains X-03 and is unstarted") |
| **What is changing over time?** | Review insights · Analytics · Goal measurements | **Weak, and the data is already there.** One row per completed Review is stored (`review_insight_snapshots`, ≈52 a year, up to 40 Project states, 25 Goal states, 20 Area counts, 50 carry-over ids) and **only `priorReviews[0]` is ever read**; `listSnapshotsBefore` and `listMeasurementSeries` have zero production callers; Analytics offers three fixed ranges bucketed to fit `MAX_TREND_PERIODS = 8` so "completions per week for twelve weeks" is not askable; the kernel `ActivityRepository` has no time-window read at all, so five adapters carry their own bespoke windowed SQL; `/today/activity` renders nothing. | [§3.1](#31-history-and-aggregation-what-is-stored-what-is-read) |
| **Help me understand all of that.** | AI | **Built, tested, never run.** ~8,160 lines behind one `StructuredRequest → StructuredResponse` contract, reserve → run → reconcile budgets, a content-free usage ledger, evidence-id citation, structural People/Diary exclusion, four features, five deterministic Ask intents reachable with AI off — and *no request has ever reached a provider* (`AI_PLATFORM.md` §21), no fake-provider seam exists (DEBT-237), and the model/pricing registry is pinned to 2026-08-05 (DEBT-213). The fact block the Weekly Review assistant would read is narrower than the Review's own evaluators (DEBT-91). | [§3.6](#36-ai) |

**The shape of the gap.** The first question is answered by a mature spine.
The other four are answered by, respectively, half a domain, no domain, an
idle data layer and an idle model layer. The brief's instinct is right: these
are not four features to add. Two of them (Life Admin and Finance) share a
noun the product already half-has — *a commitment that is due, that recurs,
and that may cost money* — and the other two (Insight and AI) share a
dependency the product does not have yet — *deterministic, windowed,
aggregated facts computed once and consumed everywhere*. That pair of shared
things is what keeps the four from becoming islands, and it is what the
sequence below builds first.

---

## 2. What "not four islands" requires

Three shared primitives and one rule, each of which is measured below to be
either already present in the kernel or a bounded extension of something that
is:

1. **One `Obligation` model** for everything due-and-recurring, whether it is
   about an Asset (rego, insurance, service), about nothing in particular (a
   tax return, a membership), or about money (a subscription, a school fee, a
   utility bill). Life Admin *is* this model with a surface; Finance's
   "recurring commitments" *are* this model with an amount and a settlement
   link. Decided in [§4.2](#42-life-admin--obligation-is-the-domain-not-a-pile-of-screens)
   and [§4.5](#45-unified-obligations--one-model-not-two).
2. **One deterministic history layer** — window, bucket, series, aggregate —
   over the stores the product already writes (Activity, `completed_at`,
   Review snapshots, Goal measurements, later obligations and transactions).
   Insight renders it, Reports save definitions over it, Finance's budget
   variance and net worth are computed by it, and AI is *handed its output*
   and never asked to compute it. Decided in [§4.1](#41-insight--a-reusable-history-layer-not-a-chart) and [§4.6](#46-reports--a-saved-definition-not-a-dashboard-builder).
3. **One evidence primitive** — the `attachment` entity linked by EntityLink —
   that an Obligation, a Transaction, a Meeting or a Note can carry, backed by
   one private R2 bucket with its own backup and restore rehearsal. Decided in
   [§4.3](#43-attachments--an-enabling-platform-release-placed-before-finance).
4. **AI explains facts it is given; deterministic code computes them; every
   mutation is a proposal.** Decided in [§4.7](#47-ai--reading-before-acting).

---

## 3. What exists, measured

A compact inventory so the next decision pass does not re-derive it. File
references are to `main` at `6b4d4a8`.

### 3.1 History and aggregation: what is stored, what is read

| Store | Shape | Written by | Read by | Idle capability |
|---|---|---|---|---|
| `activities` + `activity_subjects` (migration `0004`) | Append-only; `(workspace_id, type, occurred_at, id)` and `(workspace_id, occurred_at, id)` indexes; no title, no entity type, no status column by design | every kernel mutation | per-record timelines; the Person timeline (ADR-052) | **The kernel contract has no window read.** `ActivityRepository` (`app/kernel/activity/activity-repository.ts:53-113`) exposes `getById`, `listForWorkspace`, `listForEntity`, `listForEntities` — inputs carry `type?`, `limit?`, `cursor?` and **no from/to**. Windowed reads exist only as bespoke SQL in `d1-activity-window-repository.ts:169-186, 414-417`, `d1-review-insight-repository.ts:208-215, 346-347`, `d1-project-health-repository.ts:288-298`, `d1-recent-records-repository.ts` and `d1-meeting-repository.ts`. Raised as DEBT-238. |
| `review_insight_snapshots` (`0034`) | One row per completed Review; `facts_json` holds ids, states and counts only (ADR-079 d3); `version`; indexed `(workspace_id, period_end DESC, captured_at DESC, review_id DESC)` | `captureReviewInsightSnapshot` (`review-insights-context.ts:826-846`), after both completion paths | `priorReviews[0]` only (`:801-804`); the `/views` "since last Review" boundary reimplements the ordering inline (`d1-cross-view-query-repository.ts:315-339`) | `listSnapshotsBefore` (`d1-review-insight-repository.ts:537-557`, bounded at `MAX_TREND_PERIODS = 8`): **zero production callers** |
| `goal_measurements` (`0038`) | Owner-dated readings, correctable, each write an Activity event | `goals/routes/measurements.tsx:147-181` | the Goal record and pane (`listMeasurements`), the collection's three-reading summary | `listMeasurementSeries` (`d1-goal-measurement-repository.ts:583`): **zero production callers** (DEBT-212) |
| `spine_records.completed_at` (`0005`; index `0038:150`) | The one completion-time authority (RECALL-02, ADR-114) | spine completes/reopens | `completedWithin`, the Completed view, `countCompletedTasksInWindows` | — |
| `asset_events` (`0025`) | Fourteen categories incl. `valuation` with `value_minor`; the Asset logbook and value history | obligation completion, manual log | the Asset record's history and value-history views | a general "value over time" series exists for Assets only |
| `habit_completions` (`0044`) | One check-in per day, no count | check-in | the four-week strip | no longer series |
| `ai_usage_requests` (`0030`) | Spend ledger with `period_day`/`period_month` | the AI runtime | Settings | empty — no run has happened |

**The windows and buckets that exist.** `ActivityWindow` (`app/kernel/activity-window/activity-window.ts:41-52`: inclusive owner days, half-open instants; `ReviewPeriodWindow` is an alias) is the one shared period abstraction and is good. `rangeBuckets` (`app/kernel/analytics/analytics-range.ts:157-176`) is the only bucketer and it is Analytics-private, with exactly three presets (7×1-day, 4×7-day, 6×14-day) chosen to fit the Review's 8-period cap (`:20-27`). There is no generic "bucket a window at a grain" function and no series type that Reports or Finance could reuse. Raised as DEBT-239.

**The rules already written.** ADR-079 d1/d2/d6/d9/d11/d13 (three kinds of truth; the trend is derived from Activity in one grouped statement; no score; absence renders less; flat statement counts; no AI), ADR-110 d1/d3/d4/d7 (follow-through derived, never stored; the Review snapshot is the only stored period artefact; a bounded query that needs new storage is a finding, not a licence), ADR-111 d7 (no composite Goal score). These are Insight's constitution and are not restated by V2.9.

### 3.2 Obligations, recurrence and money

Measured in full by the Assets report; the load-bearing facts:

- `asset_obligations` (`0025:97-187`): `category IN (registration, warranty, insurance, licence, service, inspection, maintenance, replacement, reminder)`; `recurrence_kind IN (none, days, weeks, months, years, meter)`; `status IN (open, completed, dismissed, on_hold)`; `lead_days` (default 14); `task_id` a **pointer, never ownership**; `series_id`/`sequence`/`next_obligation_id` a recurrence *chain*; **no amount**; **`asset_id NOT NULL`**. Urgency (`overdue`/`due`/`upcoming`) is derived at read time (`evaluateObligation`).
- Completion is one `D1Database.batch()` (ADR-083): close → `asset.obligation_completed` Activity → proof `asset_events` row → at most one successor (anchored on the day the work was done, `nextObligationDate`) → forward-only update of the Asset's canonical date (`canonicalFactForCategory`) → the linked Task's completion statements.
- **Three recurrence engines, deliberately separate**: Tasks (`task-recurrence.ts`, 956 lines, no RRULE), obligations (their own kinds plus a meter dimension), Habits (`habit-schedule.ts`, effective-dated versions). Only calendar arithmetic (`~/kernel/datetime`) is shared. A fourth engine is the thing to refuse.
- Notifications: two kinds (`digest`, `asset_obligation`), the `kind` CHECK closed, insert-before-send dedupe on `(workspace_id, dedupe_key)`, one channel (Pushover), rungs `[30, 7, 1]`, **no reminder engine** (ADR-114).
- Money: `app/kernel/money/money.ts` (182 lines, pure): parse/format/validate integer minor units per ISO code via CLDR digits; `MAX_MONEY_MINOR_UNITS = 90_000_000_000_000`; never converts. Prices are treated as sensitive (the Assets search provider never matches or excerpts them; the AI evidence category for Assets is `financial`, sensitive by default).

### 3.3 Import, export, backup and restore

- **Export**: one canonical snapshot (`DalyHubWorkspaceSnapshotV1`, 36 collections) with the *write-always, tolerate-absence-on-read* compatibility protocol; the Obsidian vault is a pure function of the same snapshot. The manifest says in code `"File attachments: DalyHub stores none."` (`app/platform/export/manifest.ts:118`).
- **Restore**: staged, atomic, no merge; `RESTORE_MAX_ARCHIVE_BYTES = 32 MiB` checked before the body is read (`restore.tsx:242-249`, `zip-reader.ts:53`). Restore into a throwaway remote D1 from a real production artefact was rehearsed 2026-08-30 with matching counts and a clean `PRAGMA foreign_key_check` (DEBT-199); a D1 export's `CREATE INDEX`-last ordering means `entity_links` must be reordered before import (`production-backup.mjs reorder`, [`BACKUP_AND_RESTORE.md` §5.0a](../development/BACKUP_AND_RESTORE.md)).
- **Backup**: the backup Worker (`infra/backup/`) exports **D1 only** into a private R2 bucket nightly (healthy, 20/20 at last measurement); the GitHub off-Cloudflare encrypted copy has **never been produced** — four missing secrets and one public-repo protection decision, all owner-held (DEBT-198). There is no second data store to back up today; Attachments would create one.
- **Import**: none. ICS is read-only (`ical.js`, MPL-2.0, ADR-091); the capture token API creates Tasks/Notes only; X-03 (Todoist/Notion) is unstarted.

### 3.4 Attachments and R2

No R2 binding in the application Worker, by written policy in `wrangler.jsonc` ("deliberately has NO R2 binding and NO D1-export token"). Every mention of attachments in `app/` is an absence, recorded honestly (the export manifest, the vault README, the Today upload chip deferred to DEBT-35, the Settings "not built yet" list). `EntityType` is an open validated string (`app/kernel/entities/entity.ts:22`), `entity_links.type` is free-form, and a module registers entity types, link types, Activity types, commands, search providers and settings through one `ModuleDefinition` — so an `attachment` entity needs a details table and a module, not a kernel change. V2.8 already recorded the smallest legitimate shape ([`ROADMAP_V2_8.md`](../roadmap/ROADMAP_V2_8.md#attachments-assessed-step-4)); this pass adopts it unchanged and adds the mobile and export halves in [§4.3](#43-attachments--an-enabling-platform-release-placed-before-finance).

### 3.5 Views: the seam Reports can reuse

`task_saved_views` gained a `kind` column in `0036` (ADR-082, the saved-view ADR) and the D1 repository is codec-driven: a new kind contributes `parse`/`validateForWrite`/`serialise`/`equals` (`SavedViewCodec`, `app/kernel/views/saved-view.ts:112-127`) and **no table, no repository, no SQL path**. `SAVED_VIEW_KINDS = ["tasks", "cross"]`, `MAX_SAVED_VIEWS_PER_KIND = 50`, config ≤ 4096 bytes, `json_valid` checked in the schema. A saved view is a config blob, not an entity: no `entities` row, no Activity, no timeline, no cached result (ADR-082 d10). `CrossViewConfig` carries scopes, shared filters, sort, direction and `groupBy` — and **no measure or bucket axis**. A saved *report* is therefore a third `kind` with a vocabulary that adds window, grain, group-by and measure, and zero migration. That is the Reports decision in [§4.6](#46-reports--a-saved-definition-not-a-dashboard-builder).

### 3.6 AI

The platform is complete and idle. What matters for this pass:

- **Proposals are not stored.** There is no proposals table; a proposal exists in the response and the owner's review state, and `apply-proposal.ts` accepts exactly three item kinds — `task`, `note`, `link` — with the browser submitting the *reviewed* fields and every write going through the owning module as the authenticated owner. Extending "acting" means adding item kinds to this one path, not a second one.
- **Evidence is retrieval over the search projections plus links**, bounded (`PAGE = { links: 25, candidates: 20, searchPerProvider: 12 }`), with `CandidateSets` as the allowlist of ids an answer may cite; an unsupplied id rejects the answer. Body-search excerpts are a Search artefact and never AI evidence (ADR-114 d2).
- **Facts are already the design** where they exist: the Weekly Review assistant is fed a fact block DalyHub computes (`review-facts.ts`) — it is just the *wrong* block (DEBT-91), narrower than the Review's own evaluators and blind to `set_aside`. The five deterministic Ask intents are answered before any provider gate. Insight's history layer is the generalisation of this pattern.
- **Privacy is structural**: `SENSITIVE_CATEGORIES = health, family, relationships, financial, reflection`; Person → relationships, Diary/Review → reflection; `allowed_categories` defaults to `["general"]` in D1; the ledger cannot hold prompts or record content by column list.
- **Gate**: stated in full in V2.8; owner-held secret plus DEBT-237's code-held seam plus DEBT-213's re-verification. Unchanged here.

### 3.7 Offline, capture, People, navigation

- **Offline**: a fifteen-day read snapshot and seven Task mutations replayed with idempotency receipts and field-level conflict arbitration; no `share_target`, no `shortcuts`; hydrated offline rendering not covered by CI (DEBT-70). No measured owner pain since V2.4.
- **Capture**: one sheet for Task/Note/Diary/Meeting, one closed grammar reused from Tasks, one external token API; no capture-processing state (DEBT-102).
- **People**: first-class, timeline derived from the one Activity stream, most sensitive class.
- **Navigation**: nineteen modules across four rail groups — *daily* (Today, Plan, Inbox, Upcoming, Tasks), *organise* (Projects, Goals, Habits, Areas, Notes, Diary, Meetings, People, Analytics), *more* (Views, Assets, Reviews, AI), *system* (Settings, Help, About) — derived from route metadata, never a central array; the phone bar is `Today · Tasks · Add · Projects · More` with three earned slots (`MOBILE_PRIMARY_DESTINATION_LIMIT = 3`) and More opening the whole navigation sheet. Today is governed by "Today is not a dashboard" ([`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#the-today-screen)) and an attention rail capped at five rows.
- **Security**: single owner behind Cloudflare Access with `OWNER_EMAIL` pinned; nonce CSP with no reporting; Worker secrets only; a `sealed-secret` kernel primitive (AES-256-GCM, context-bound) for owner-supplied credentials; **no telemetry pipeline of any kind**; redacted diagnostics that never leave the device; **no workspace or account deletion path** (Settings lists it among things not built; raised as DEBT-242).

---

## 4. The domain decisions

### 4.1 Insight — a reusable history layer, not a chart

**What existing history is already stored?** Everything [§3.1](#31-history-and-aggregation-what-is-stored-what-is-read) lists: an exact event stream since the first record, ≈52 Review snapshots a year, dated Goal readings, completion instants, the Asset logbook, Habit check-ins.

**Which history is currently unused?** Every snapshot but the most recent; the Goal series read; workspace-wide Activity; any completion series longer than eight points; anything across Reviews (a Goal's contribution over six Reviews, a Project at risk in three consecutive Reviews, a Task carried over at every Review this quarter).

**What APIs are missing?** Three, and they are small:

1. **A kernel window read per time-axis store** — count-by-type-per-bucket and list-in-window over Activity's existing `(workspace_id, type, occurred_at, id)` index, replacing five bespoke adapter reads with one (DEBT-238), and a **Task completion series over `spine_records.completed_at`**, the one completion-time authority (RECALL-02, ADR-114) — never over `task.completed` events, which survive a reopen and a delete, the discrepancy `analytics-context.ts:198-218` already guards for the range total. One grouped statement per question, flat in workspace size, the way ADR-079 d2 already does it for one caller.
2. **A window/grain/series vocabulary** — `Window` (the existing `ActivityWindow`), `Grain` (day/week/month/Review-period), `bucket(window, grain)` (the generalisation of `rangeBuckets` without the 8-cap), `Series<Point>` with its bound stated — that Analytics, the Review, the Goal story, Reports and Finance all consume (DEBT-239).
3. **A snapshot series read** — `listSnapshotsBefore` given its caller, returning per-Review states for a Project, a Goal and the carry-over set, so "across Reviews" questions become answerable from data that already exists.

**What should be deterministic?** All of it. Every figure is computed in SQL or in a pure kernel evaluator, names its window and its bound, emits nothing for zero, carries its reason, and is unit-tested against a fixture whose events are known. Nothing is scored, graded or ranked (ADR-079 d6, ADR-110 d4, ADR-111 d7). **Nothing new is stored** (ADR-110 d3/d7): the layer is a read model over stores the product already writes.

**What belongs in UI now versus later?**

- *Now (V2.9)*: the multi-Review trend where the Review already asks the question (the insights panel and the Review record's Progress tab); the across-Reviews line on the one Goal story; Analytics gaining an explicit range and week/month grains with the Projects and Goals lines it never had, the compact Goal series column DEBT-212 wants, and the workspace Activity list for the selected window as DEBT-103's one consumer. No new route, no new navigation entry.
- *Later*: saved definitions (Reports, V2.13); obligation and financial series once those stores exist (V2.10, V2.12); charts beyond the bounded trend and sparkline the design system already has; any dashboard.

**What becomes reusable by Reports and AI?** The whole layer. A Report is a saved `(source, window, grain, group, measure)` over it; a grounded AI answer is a fact block computed by it, cited by id.

**Why V2.9 and not later.** It is the only candidate that is unblocked, migration-free, owner-independent, and on the dependency path of three of the four priorities. The snapshot store accrues value weekly and nothing reads it; each week it is left idle is a week of the owner's history the product cannot give back. And it is the cheapest possible proof that the history layer's rules (flat statement counts, named windows, no score) hold *before* Finance puts money through them.

### 4.2 Life Admin — Obligation is the domain, not a pile of screens

**Module or cross-cutting capability?** Both, in a specific way: **Obligation becomes a kernel entity type with one home surface, and Life Admin is the name of that surface.** It is cross-cutting in the sense that an Obligation can attach to an Asset, a Person, a Project or nothing; it is a module in the sense that something has to own the entity type, its routes, its commands and its search provider, and that is the Life Admin module. It is *not* a new spine and *not* a fifth kind of Task.

**Why Obligation and not something else.** The alternatives were measured and refused:

- *A recurring Task with an amount.* Refused: Tasks are "the only thing you actually do" (AGENTS §4); an insurance renewal is not done, it is *dealt with* and it comes back; Task recurrence (fixed vs after-completion, ordinals, weekend rules, end conditions) is the wrong engine for "due on the anniversary of the last renewal, whenever that was"; and the Assets domain already refused this in ADR-083's authority table (obligation owns due date and recurrence; Task owns "on my plate today").
- *Asset fields for everything.* Refused: it forces the owner to create a fake Asset ("Tax") to hold a commitment, and it leaves money-bearing commitments with no amount.
- *A Finance "bill" and a separate Life Admin "renewal".* Refused: two systems representing "something due, recurring, optionally with money attached" — the exact duplication the brief names.

**What is already represented.** The Assets obligation is ~80% of the model: category, title, due date, lead days, recurrence kinds, status, linked Task pointer, series chain, one-batch completion with proof and successor, notification rungs, a Today attention row. What it lacks is exactly what Life Admin and Finance need: an optional owner instead of a mandatory Asset, an optional amount, evidence, and a home.

**The smallest useful model.** An `obligation` **entity** (an `entities` row plus an `obligation_details` slice, the pattern every record uses), so it gets EntityLinks, Search, Activity, export and the record layout for free:

| Field | First release | Notes |
|---|---|---|
| title, category | yes | the closed category set widened (bill, subscription, membership, fee, tax, filing, appointment…) — a closed set, never tags (ADR-113's non-goal) |
| due date, lead days | yes | unchanged from Assets |
| recurrence | yes | the obligation engine's own kinds; **no fourth engine** |
| status | yes | `open / completed / dismissed / on_hold`, urgency derived |
| subject entity (optional) | yes | a nullable FK to `entities` (any kind) for the structural reads — the Assets lens filters on it, completion updates the subject's canonical fact — **and** a reserved typed EntityLink written in the same transaction, so the subject's record and timeline show the obligation without a bespoke reverse read (the Meeting-item → Task precedent, ADR-083); one relationship, two indexes, never a second relationship system |
| optional amount | yes | `amount_minor` + `currency_code` under ADR-049, *expected* amount; the *actual* amount is recorded at completion |
| linked Task | yes | pointer, never ownership — unchanged |
| evidence | **slot only** | an EntityLink to a Note today and to an `attachment` from V2.11; no dead "upload" affordance ships in V2.10 (DEBT-53's discipline) |
| history | yes | the completion chain plus the `obligation.completed` Activity event carrying date and actual amount as the proof of record; Asset-subject obligations *also* write the `asset_events` logbook row exactly as today |
| next due, renewal | yes | successor creation unchanged |
| surfacing rules | yes | the existing rungs and the existing Today row, widened to all obligations |

Not in the first release: reminders at a time of day, per-obligation notification preferences, payment status distinct from completion (that is Finance's settlement link, V2.12), obligations shared across workspaces, documents' text.

**What happens to existing Assets?** Nothing the owner notices. Existing `asset_obligations` rows migrate into the entity-backed model by a data-carrying migration rehearsed against a restored production artefact (the V2.6 rule: proven by moving real data through it and reading it back); the Assets record keeps its Obligations tab as a **lens** over the same records filtered by subject; `canonicalFactForCategory` keeps updating the Asset's dates on completion. The Assets module stops owning the obligation *type* and keeps owning the Asset. Whether the old table is dropped in the same migration or retired one release later is V2.10's own decision, taken with ADR-082 d4's rollback argument in front of it.

**The canonical obligation authority** is the Life Admin kernel (`app/kernel/obligations`, generalised from `app/kernel/assets/asset-obligation.ts`): one evaluator for urgency, one completion transaction, one successor rule, one attention read. Assets, Today, the digest, Finance and AI all read it; none re-derive it.

**How Today surfaces obligations without becoming another dashboard.** Through the row it already has. Today's attention rail carries *one* obligation row today ("2 obligations due · 1 tracked as a task"), deduplicated against open linked Tasks, inside a five-row cap. Life Admin widens the *set* that row reads, not the number of rows. What is due *today* and has a linked Task is already in the plan; what is due *this week* and has no Task is one attention row with a count and a door to `/obligations`. Nothing else from Life Admin appears on Today: no amounts, no list, no calendar.

### 4.3 Attachments — an enabling platform release, placed before Finance

**Placement: a dedicated release (V2.11), after Life Admin and before Finance.** Not inside Life Admin, because a second data store with its own backup, restore, export, privacy and CSP consequences is a decision of its own and folding it in makes Life Admin two decisions wide; not inside Finance, because Meetings, Notes, People and Life Admin want it too and a file primitive born inside Finance is the second storage primitive the architecture forbids; not split across releases, because the prerequisite (the R2 tier is backed up and restore is rehearsed *before* the first owner file is accepted) cannot be half-done.

**Why after Life Admin and not before.** Life Admin's value with reference-only evidence (`url`, `document_notes`, `issuer`, `reference_number` already exist on Assets; a linked Note works for everything else) is real and its *model* decision is the one Finance depends on, so it goes first; Attachments' first item is a backup and restore programme for a second store, and running that while the owner clears DEBT-198 for the first store is the right overlap. The cost is one release in which an obligation cannot hold its certificate; the record says so and offers the Note, and no placeholder ships.

**The required minimum**, adopted from V2.8's assessment with two halves added:

| Concern | Requirement |
|---|---|
| Storage | One private R2 bucket bound to the application Worker; objects keyed `workspace/attachment-id`, never a user-supplied name; no public access, no signed cross-origin URL |
| Metadata | An `attachment` entity: filename, byte size, content type, content hash, R2 key, soft-delete state; linked to any record by the ordinary EntityLink |
| Auth | Content served only through an authenticated same-origin route behind the existing request boundary; `Content-Disposition: attachment`; sniff-proof content type; **no inline rendering of user-supplied HTML/SVG** (ADR-015 §12) |
| Upload / download | Multipart through the one file-reading path shape the restore route already uses (size bounded before the body is read); streaming download |
| Limits and types | Per-file and per-workspace byte budgets stated in Settings the way the export bound is; an allowlist of content types (images, PDF, plain text, common office documents); refusal is a named state, never a silent drop |
| Deletion | Soft delete on the entity, object purge by a lifecycle rule after the retention window; the export excludes soft-deleted files and says so |
| Privacy | An attachment inherits the class of the record it is linked to: linked to a Person or Diary entry, it is `relationships`/`reflection` and structurally excluded from AI evidence; **its content never enters AI evidence in V2** (see [§4.7](#47-ai--reading-before-acting)) |
| Export | The canonical archive gains a binary collection under the compatibility protocol; an export without its files says so in the manifest; the Obsidian vault gets the files beside the record's Markdown |
| Backup | The R2 tier joins the backup Worker's scope (object listing and copy, or bucket versioning plus a retained manifest — V2.11's decision); **a restore rehearsal covering D1 and R2 together is the release's first acceptance criterion** |
| Restore | Restore ordering is D1 first, then objects verified against the restored `attachment` rows by content hash; a missing object is a named restore finding, never a silent absence |
| Mobile | Capture from the record and from the capture sheet with the OS file picker / camera; `share_target` for files is the one **enabling capture slice** this release takes if measurement shows the picker alone is friction |

What is refused: a document management system, folders, OCR, full-text search over file contents (a derived representation — refused until a sanitising extractor exists), versioning of files, sharing links.

### 4.4 Finance — the first release boundary

**The smallest useful Finance that could start replacing a standalone personal-finance app**, unchanged in spirit from the 2026-08-29 audit §8 and V2.8's assessment, now with its boundaries decided:

| In V2.12 | Later (V2.13+ or V3) |
|---|---|
| **Accounts** (manual): name, type (`transaction / savings / credit / loan / cash / other`), currency, opening balance and date, archived; an entity (linkable, searchable) | investment accounts with holdings, superannuation, property as an account (Assets already hold value) |
| **Transactions**: date, amount (minor units, signed), account, payee (normalised + display), memo, category, `import_id`, source identity; a **light entity** — an `entities` row so a receipt or an Obligation links to it by EntityLink, with no Activity per edit, no record page (a drawer) and payee-only search; soft delete | attachments on a transaction beyond the owner linking one by hand |
| **CSV import**: one bounded parser, a per-bank column mapping the owner saves once, an **import ledger** (`finance_imports`: file hash, account, row counts, applied/skipped/duplicate, one Activity event) so re-importing the same file is idempotent and a re-run reports "0 new" | OFX/QIF, bank feeds / Open Banking, email receipts |
| **Deduplication**: identity by the bank's stable transaction id where the file carries one, otherwise an **occurrence-aware** row fingerprint `(account, date, amount, normalised payee, n)` with `n` counting identical rows within one file — so two same-day purchases at one merchant both survive and are both recognised across overlapping exports; a suspected cross-file duplicate is *shown and skipped*, never silently merged | fuzzy cross-account reconciliation |
| **Transfers**: a pair of transactions linked as one transfer, excluded from spend and income by construction | multi-leg transfers, fees inside transfers |
| **Categories**: one workspace vocabulary that is **structure, not tags** — a closed-by-the-owner set with one level of parent, a `transfer` and an `uncategorised` built-in; a deterministic "last category for this payee" suggestion | rules engines, split transactions (deferred deliberately: a split is a second row shape and a second total to reconcile; recorded, not built) |
| **Month view**: spend and income by category for a month, computed by the V2.9 history layer, mixed-currency totals reporting their exclusions exactly as Assets do | custom periods (Reports, V2.13) |
| **Budget vs actual**: a monthly amount per category, variance in words with the figures that produced it, no colour-only state | rolling budgets, envelopes, goals-as-budgets |
| **Balances and net worth**: account balance derived (opening + Σ transactions to date); net worth = Σ account balances + latest Asset valuations − loan balances, **derived, never stored** — a figure on the Finance overview | the net-worth *series* (a Report over the same derivation) |
| **Recurring commitments**: **Obligations with an amount** (Life Admin's model) linked to the transaction that settled them — see [§4.5](#45-unified-obligations--one-model-not-two) | auto-matching a transaction to an obligation; forecasting |
| **Export/restore**: every new collection in the snapshot in the same release; import files not retained (their hash is) | — |

**The assessments the brief asks for**, decided:

- *Schema*: `finance_account_details` and `finance_transaction_details` (entity slices — the transaction a light entity, above), `finance_imports`, `finance_categories`, `finance_budgets`; all `STRICT`, composite workspace keys, indexed by `(workspace_id, account_id, occurred_on DESC, id)` and `(workspace_id, category_id, occurred_on)`; amounts integer minor units with a currency code per row (ADR-049).
- *Auditability*: the import is the audited unit (one Activity event per applied import with counts); a transaction edit does not write Activity (it would double the row count for a low-value fact); a category change is a mutation with `updated_at`; deletion is soft. Corrections are edits; **reversal is not modelled** — a personal ledger is not double-entry, and pretending otherwise is the over-design the brief warns against.
- *Idempotent imports*: file hash plus the source identity above; the same file twice yields zero new rows and says so, and two legitimate identical rows in one file both import.
- *Transfer handling*: pairs, excluded from spend; an unpaired "transfer" category is a named review state.
- *Merchant/payee*: a normalised key beside the display string; no merchant entity.
- *Category hierarchy*: one level. *Account types*: the closed set above. *Opening balances*: dated, on the account. *Currency*: one workspace default; per-row codes stored; totals never convert and always report exclusions.
- *Privacy*: `financial` is already a sensitive AI category; Finance rows never enter search excerpts with amounts; logs carry counts only.
- *Query/index requirements*: the V2.9 history layer's `sum-by-group-per-bucket` over `finance_transaction_details` — the same statement shape as completions-per-bucket.
- *Mobile*: the daily-driver phone action is **categorise the uncategorised** — a row list with an inline category picker and a swipe; import is a desktop act.

**Hard gates**: DEBT-198 (the off-Cloudflare copy exists and has been restored from once), and V2.11's D1+R2 restore rehearsal if statements are to be attached. Finance's own first item is the import architecture; its second is the export/restore of its own collections, before any UI.

### 4.5 Unified obligations — one model, not two

**Decision: Obligation is the shared recurring-commitment model. Finance has no recurring-transaction engine.** A subscription, a utility bill, a mortgage payment, an insurance premium, a school fee and a rego renewal are all Obligations; the ones that cost money carry an expected amount; when a transaction arrives that settles one, the transaction is linked to the obligation (`settled_by`), the obligation completes with the actual amount, and the successor is created by the rule that already exists.

**Trade-offs, stated.**

- *Finance recurring transaction, separate but linkable* — rejected. It would be a fourth recurrence engine, a second "due" fact competing for the Today row, and a second place to record "how much this costs". The one thing it does better — projecting future cash flow from a schedule — is a Report over Obligations (expected amounts by month), not a second store.
- *A generic "Commitment" above both* — rejected. It is the same model with a vaguer name; the product's noun is Obligation and it already has a surface, rungs and a proof rule.
- *What Obligation gives up by being shared*: its category set must widen from Asset-shaped to life-shaped, and its evaluator must accept an absent subject. Both are bounded and both land in V2.10 before Finance depends on them.

**Convergence is scheduled, not hoped for**: V2.10 makes the model shared; V2.12 adds the settlement link and the actual-amount completion; V2.13's "recurring commitments by month" is the first Report over it. No release between them may add a due-and-recurring concept anywhere else — that is ADR-116 decision 1.

### 4.6 Reports — a saved definition, not a dashboard builder

**A Report is a saved definition of `(source, window, grain, filters, group, measure, sort, visualisation)` executed by the history layer on open; nothing is stored but the definition.** Concretely:

- **Storage**: a third saved-view `kind` (`report`) through the existing `SavedViewCodec` seam — a config blob in `task_saved_views`, workspace- and owner-scoped, ≤ 4096 bytes, no migration, no entity, no Activity, no cached result (ADR-082 d10). *Entity record versus config blob* is therefore decided the way Views decided it: a report describes a query and never becomes a source of truth; if it ever needs a timeline, a link or an attachment, that is the day it becomes an entity, and nothing in the six example reports needs one.
- **Source vocabulary**: closed and typed, per domain — `completions` (Activity), `goal_measurements`, `review_snapshots`, `obligations` (V2.10+), `transactions` (V2.12+) — each declaring which grains, groups and measures it supports, exactly as `SHARED_DIMENSION_SUPPORT` declares scopes today; an unsupported combination is refused at parse, never widened at run.
- **Deterministic by construction**: the executor is the V2.9 layer; every point names its window and bound; every total reports its currency exclusions; there is no free-text expression, no formula field and no SQL fragment in a definition (ADR-059/082's persisted-injection rule holds).
- **Where charts belong**: on the report page and the Insight screen, using the two bounded visual primitives the design system already has (the insight list and bounded trend, the sparkline) plus one grouped-bar shape; not on Today; not on a record.
- **Mobile**: the number and the table first, the chart beneath; a report is a page, opened from Insight, saveable to the More sheet; nothing on the bottom bar.
- **Composition into dashboards**: *later, and out of V2*. A dashboard is a saved arrangement of saved reports; it needs report definitions to exist and be stable first, and the product refuses to build the arrangement before the thing arranged.
- **Existing Views infrastructure reuse**: the storage, codec, ownership, naming, switcher and URL-sharing all reuse; the *execution* does not (Views merge bounded per-scope row reads; Reports aggregate), and the two are kept separate on purpose so a saved view never grows a measure and a report never grows a row list.

### 4.7 AI — reading before acting

**Decision: two stages, a hard boundary between them, and one rule that spans both — deterministic application code computes every machine fact; the model explains, compares, summarises and identifies patterns over facts it is handed, cited by id, and never computes or invents one.**

**Stage A — grounded reads (V2.14).** The architecture for *"Why was August more expensive than July?"*:

1. DalyHub resolves the two windows and retrieves the transactions in them (the history layer, bounded).
2. Deterministic code computes the difference, the per-category contributions ranked by absolute change, the top payees within the largest movers, and the transfers excluded — as a **fact block**, the same shape as `review-facts.ts` but produced by the history layer, and never wider than the answer needs.
3. The fact block, with each fact carrying an evidence id, is the *only* numerical content in the prompt; the model's job is to explain, and its schema forbids a number that is not one of the supplied facts (the existing validator's "unsupplied id rejects the answer" rule, applied to figures).
4. The answer renders with its evidence attached — the fact block *is* shown beside the prose, so the owner can disagree with the explanation by reading the facts.

The same shape serves the Weekly Review assistant (DEBT-91: the fact block becomes `loadGoalStories` + `selectGoalNextAction` + the period account — the calls already exist), "explain this Report", and Ask DalyHub extended with report-backed intents. Provider activation is the V2.8 gate, unchanged, run first; DEBT-237's dev-only fake provider is the seam that lets every Stage A feature be E2E-proven without a key; the owner-held key remains a Worker secret and never a settings column.

Budgets, privacy, injection and failure — decided:

- *Budgets*: unchanged (reserve → run → reconcile); a Stage A answer is priced from exact bytes of the fact block; the deep tier stays off by default.
- *Privacy*: financial facts leave the Worker only when the owner's `financial` category allowance is on (the existing per-category switch); amounts are aggregates and top movers, never the ledger; People/Diary exclusion stands; the ledger holds metadata only, asserted by query.
- *Prompt injection from attachments and imports*: **attachment content never enters evidence in V2** — a file is cited by name and link only; payee strings, memos and imported CSV text are untrusted input rendered as data inside the evidence block under the existing injection-refusal contract, and the evaluation corpus gains a case for each. The moment a document's text is wanted as evidence is the moment a sanitising extractor and a stronger boundary are designed — that is V3.
- *Failure and fallback*: every Stage A surface has a deterministic floor. The fact block renders with or without the model; a provider timeout, a refused answer, a budget stop or a disabled state shows the facts and one honest sentence, exactly as the five deterministic Ask intents already do with AI off.

**Stage B — assisted actions (V2.15).** Only after Stage A has run live for at least one release: proposals to create Tasks from a document or Meeting, to draft an obligation follow-up, to categorise imported transactions, to suggest a Finance correction (a likely duplicate, an unpaired transfer), to prepare a Review's reflection from the facts. Every one is a **structured proposal through the one existing apply path**, extended with new item kinds (`transaction_category`, `obligation`, `transfer_pair`), reviewed field by field, applied as the owner, idempotent on acceptance, undoable. **No autonomous agent**: nothing runs unattended, nothing schedules itself, nothing mutates without a click.

### 4.8 Offline, capture and People — enabling slices only

- **Offline.** No headline release. The recorded contract stands (a loaded surface survives a network loss; seven Task mutations replay). Finance's transaction review does **not** need an offline-safe path: categorising is a desktop-or-connected act and the loaded list already survives a drop. If the offline slice is ever taken, DEBT-70 (CI observes hydrated offline) comes first — unchanged from V2.8.
- **Capture.** No headline release. Two enabling slices are embedded: `share_target` for files inside V2.11 *if* the OS picker alone measures as friction on the phone; and, inside V2.10, a palette command and an Asset-record door for "New obligation" — the closed capture grammar does not gain an obligation token, because "rego due 14 Sep $890 every year" is a form, not a sentence.
- **People.** No standalone programme. The one link Life Admin needs — an Obligation whose subject is a Person (a birthday gift, a loan to a friend, a follow-up you owe) — comes free from the subject FK and EntityLinks; the Person timeline shows it through the one Activity stream. Nothing else in the four priorities needs a People change.
- **Visual polish.** Only the consequence of a new component: the obligation row, the transaction row, the report page — each built from the shared row and record patterns, each accepted at the widths and appearances the acceptance boundary already names.

---

## 5. Interaction design coherence, per domain

| | **Life Admin** (V2.10) | **Attachments** (V2.11) | **Finance** (V2.12) | **Insight / Reports** (V2.9, V2.13) | **AI** (V2.14, V2.15) |
|---|---|---|---|---|---|
| **Primary navigation** | one entry, **Life Admin**, beside Assets; route `/obligations` | **none** — reached from records | one entry, **Finance**; route `/finance` | the existing Analytics entry, relabelled **Insight** when Reports land; `/analytics` keeps its URL | the existing AI entry; Ask gains report-backed intents |
| **On Today** | the one existing attention row, widened; nothing else | never | **nothing** — no balance, no spend, no chart | nothing new; the three week measures stay | nothing |
| **In Search** | obligations by title, category, subject; never amounts in excerpts | by filename and linked record | accounts by name; transactions by payee under the explicit-query boundary, amounts never excerpted | reports by name | — |
| **Quick Add / capture** | palette "New obligation"; a door on the Asset record; **no grammar token** | from a record and from the capture sheet's file picker | palette "Import transactions" (desktop); "Add transaction" for cash | palette "New report" | the existing proposal surfaces |
| **Full record vs reference** | the Obligation record (header, facts, evidence, history); a *reference* on Today, the digest and the Asset tab | a row on the record it belongs to; opens as a download, never a page | Account is a record; a Transaction is a **row**, never a page (a drawer for edit) | a Report is a page; a point on a chart is a reference to its rows | an answer is a page with its facts; a proposal is a review sheet |
| **Mobile** | row list; complete/renew from the row with one sheet for date and actual amount | camera / picker from the record | "categorise the uncategorised" row list with inline picker and swipe; import is desktop | number and table first, chart beneath | Ask and proposals unchanged |
| **Empty state** | "Add the first thing you have to deal with" with the three commonest categories as doors | "No files yet — add one from any record" | "Import your first statement" with the mapping walkthrough; or add a cash account | "Nothing to compare yet — complete a Review / log a reading" (present tense, no zeros) | the existing honest off-state sentence |
| **Daily-driver action** | deal with what is due this week | attach the paper to the thing | categorise, then read the month | read the trend at Review time | ask why |
| **Does not belong on Today** | amounts, the list, a calendar | any file | balances, spend, budget state, charts | any chart | any AI sentence |

The principle behind the table: **Today answers "what am I doing today?" and nothing else.** Every new domain reaches Today through the attention rail's existing rows and caps, or not at all.

---

## 6. Information architecture

**Does the current module structure scale?** The registry does — a module registers its own routes, entity types, link types, commands, search providers and settings, and five new entity kinds (obligation, attachment, account, transaction, report) need no kernel change. The **rail** does not: it already carries nineteen entries in four groups whose names (*daily / organise / more / system*) are shapes, not questions, and two more entries put Views, Assets, Life Admin, Reviews, Finance and AI in a "more" that is now the second-largest group.

**Recommendation — record now, adopt in V2.16, redesign nothing before it.** The rail evolves to the five questions the product answers, in this order:

| Group (question) | Entries |
|---|---|
| **Do** — *what do I need to do?* | Today, Plan, Inbox, Upcoming, Tasks |
| **Organise** | Projects, Goals, Areas, Habits, Notes, Diary, Meetings, People |
| **Deal with** — *what do I need to deal with?* | Life Admin, Assets |
| **Money** — *where is my money going?* | Finance |
| **Understand** — *what is changing over time? help me understand it* | Insight (Analytics + Reports), Reviews, AI |
| *system* | Views, Settings, Help, About |

Until V2.16, new modules register into the existing groups (`Life Admin` and `Finance` into *more*; nothing else moves), because a regroup is a shell change that deserves its own acceptance pass at every width and appearance, not a side effect of a domain release. The phone bar stays `Today · Tasks · Add · Projects · More` for the whole of V2: the three earned slots are the three daily-driver destinations, and Life Admin and Finance reach the phone through Today's attention row and the More sheet, which is one tap. Whether Finance earns a phone slot is a V3 question answered by measured use.

**Other IA changes recorded for V2.16, not before**: Views moves to *system* (it is a tool over data, not a domain); the Assets record's Obligations tab and the Life Admin list are the same rows; the Settings "Your data" group gains Finance import mappings and attachment budgets beside capture, calendars and notifications.

---

## 7. Data architecture — the shared primitives

| Primitive | New or extension? | Immutable event or mutable state? | Audit / history | Export / restore | Indexing | EntityLink | Search | Workspace scoping | Migration risk |
|---|---|---|---|---|---|---|---|---|---|
| **History series** (V2.9) | Read model only — **no table** | derived, never stored | none needed; sources are already audited | none needed | reuses existing `(workspace, type, occurred_at)`, `completed_at`, snapshot and measurement indexes | — | — | inherited from bound repositories | **none** |
| **Obligation** (V2.10) | new entity type + `obligation_details`; generalised from `asset_obligations` | mutable state with an immutable completion chain and one Activity event per lifecycle change | `obligation.created/completed/dismissed/…` Activity; Asset-subject obligations also write `asset_events` | new snapshot collection (required on read once written); Asset obligations exported as the same collection | `(workspace, status, due_date)`, `(workspace, subject_entity_id)`, series unique | yes — subject by FK **and** a reserved typed link written together; evidence and settlement by link | yes, own provider | composite keys throughout | **data-carrying**: rehearsed against a restored production artefact before merge; old table's retirement decided in V2.10 |
| **Attachment** (V2.11) | new entity type + `attachment_details`; R2 object | mutable metadata, immutable object (content hash) | `attachment.added/removed` Activity on the linked record | binary collection in the archive; restore verifies hash per row | `(workspace, content_hash)`, `(workspace, deleted_at)` | yes — the only way it attaches to anything | by filename | object key prefixed by workspace; route checks the workspace on every read | low for D1; **operational** for R2 (backup, lifecycle, budgets) |
| **Account** (V2.12) | new entity type + `finance_account_details` | mutable | Activity on create/archive/opening-balance change | new collection | `(workspace, archived_at)` | yes | yes | composite | low |
| **Transaction** (V2.12) | new entity type + `finance_transaction_details` — a **light entity**: an `entities` row for links, no Activity per edit, no record page | mutable rows; the **import** is the immutable, audited unit | one Activity per applied import (counts); no per-row Activity | new collection, paged in the archive | `(workspace, account, occurred_on, id)`, `(workspace, category, occurred_on)`, `(workspace, account, source_identity)` unique — the bank's id or the occurrence-aware fingerprint | `settled_by` from an Obligation and attachments, both by EntityLink | payee under explicit query; amounts never excerpted | composite | low per table; **volume** is the new property — first paged collection in the archive, and the first entity kind with thousands of rows a year |
| **Category / Budget** (V2.12) | new tables | mutable | Activity on create/rename/merge | new collections | small | — | — | composite | low |
| **Report definition** (V2.13) | **extension** — a third saved-view `kind` | config blob | none (ADR-082 d10) | already exported with saved views | existing | — | by name | existing | **none** |
| **AI evidence / fact block** (V2.14) | none stored — the ledger's `source_entity_ids` already carries ids | ephemeral | the ledger (metadata only) | — | — | — | — | existing | none |
| **Net worth** (V2.12) | derived figure; the *series* is a Report | derived | — | — | — | — | — | — | none |

Two rules the table enforces: **nothing new is stored where a bounded read exists** (ADR-110 d7 generalised), and **every new store ships its export collection, its restore path and its hostile-workspace test in the release that creates it** (ADR-116 decision 4).

---

## 8. Backup and restore, first-class

Defined *before* implementation, per domain, so nothing becomes "export later" debt:

| | Life Admin | Attachments | Finance |
|---|---|---|---|
| **D1 backup** | covered by the nightly R2 dump automatically (new tables are in the export) | metadata covered; objects are not | covered; the archive gains its first paged collection |
| **R2 attachment backup** | — | **the release's first item**: objects listed, copied or versioned into the backup tier with a manifest; verified per run like the D1 dump is | statements attached are covered by V2.11's tier |
| **Off-Cloudflare risk** | unchanged (rows are recoverable in-account) | the canonical owner archive with its binary collection **is** the off-Cloudflare copy of files; the GitHub tier stays D1-only | **DEBT-198 is a hard gate**: a year of reconciliation is not "a fortnight of notes"; the off-Cloudflare copy must exist and have been restored from once before the first import |
| **Restore ordering** | ordinary — `entities` before details, links after (the existing reorder step) | D1 first, then objects verified against restored rows by hash; a missing object is a named finding | accounts → categories → imports → transactions → budgets → obligation settlement links; FK order asserted by the restore rehearsal |
| **Import idempotency** | n/a | n/a | file hash plus a stable source id or occurrence-aware row fingerprint; a repeated import yields zero rows and says so; legitimate identical rows survive; the import ledger survives export/restore |
| **Data integrity** | the completion chain's unique `(series, sequence)` | content hash on every object | balances are derived so cannot drift; a restore is verified by recomputing every account balance and comparing to the archive's stated figure |

**Prerequisites that are now gates**: DEBT-198 for Finance (hard); the D1+R2 rehearsal for any owner file (hard, inside V2.11); DEBT-139's remaining 30-second owner UI check is *not* a gate for anything here.

---

## 9. Security and privacy

Roadmap-level requirements, decided now so Finance and AI do not arrive first:

| Requirement | Decision |
|---|---|
| **Authorization** | unchanged and sufficient: one owner behind Cloudflare Access with `OWNER_EMAIL` pinned; every new route sits behind the existing boundary (authenticate, then same-origin provenance for every mutation); the capture token's capabilities stay structural — it cannot create an obligation, a transaction or an attachment |
| **Workspace isolation** | every new table carries composite workspace keys; every new query is accepted against a hostile second workspace holding the same record kinds; R2 object keys are workspace-prefixed and the route re-checks the workspace on read |
| **Secret handling** | no new secret class in V2: bank CSVs carry no credentials, there are no bank feeds, and the AI key stays a Worker secret. If a credential of the "owner-supplied, must stay usable" shape ever arrives (a feed URL, a webhook), it uses the existing `sealed-secret` primitive — never a second crypto implementation |
| **Attachment access** | authenticated same-origin route only; `Content-Disposition: attachment`; sniff-proof types; no inline HTML/SVG; per-file and per-workspace budgets enforced before the body is read; CSP unchanged |
| **Data export** | complete in every release that adds a store; the archive states what it excludes |
| **Account deletion** | **DEBT-242**: no workspace or account deletion path exists. Decided for V2.16 with the options named (a guarded purge with an audit tombstone, on the ADR-046 pattern, versus documenting that deletion is the owner's `wrangler d1 delete` plus bucket removal). Not deferred past V2. |
| **AI provider exposure** | financial facts leave only under the owner's `financial` category allowance; aggregates and top movers, never the ledger; People/Diary exclusion structural; attachment content never enters evidence in V2; `store: false` and the metadata-only ledger asserted by query, as the gate already requires |
| **Logs** | Finance routes log counts and durations, never payees or amounts; the existing redaction rules extend to the new routes and are asserted by the same tests |
| **Financial data in telemetry** | there is no telemetry pipeline, and none is added; `cf-aig-metadata` stays feature/model/app only |
| **Prompt injection / malicious documents** | evidence is data, never instruction (the existing injection-refusal line in the integration check, extended with a payee-string and a memo case); file content is not evidence; imported CSV cells are validated at the boundary and rendered escaped; a PDF is stored and served, never parsed, in V2 |
| **Least privilege** | the application Worker gains exactly one R2 binding (the attachments bucket); the backup Worker keeps its separate scope; the D1-export token stays out of the application Worker; nothing gains a Cloudflare API token |

---

## 10. The sequencing options, compared

Four credible sequences. Scored qualitatively — this repository does not score with false precision — on the brief's eight dimensions.

| | **A. Insight → Life Admin → Attachments → Finance → Reports → AI** (chosen) | **B. Life Admin → Attachments → Finance → Insight/Reports → AI** | **C. Insight → Attachments → Finance → Life Admin convergence → Reports → AI** | **D. Finance first (Attachments inside it) → Life Admin → Insight/Reports → AI** |
|---|---|---|---|---|
| **Owner priority alignment** | Finance is fourth in order but the two releases before it are its prerequisites; Life Admin second; Insight third-as-first | strongest surface alignment (priority 2 first) | Finance earlier than A | strongest on paper (priority 1 first) |
| **Immediate user value** | weekly (Review-time trends) then weekly (renewals) then weekly (files) then weekly (money) | weekly from the first release, on the owner's second priority | a full release of platform (Attachments) before any new domain | high if it ships; blocked on DEBT-198 from day one |
| **Architectural leverage** | **highest**: the history layer is consumed by four of the seven later releases; the Obligation model is consumed by Finance | Obligation early; the history layer arrives *after* Finance, so budget-vs-actual is built once inside Finance and once again for Reports | history early; Obligation **late** — Finance ships recurring commitments without the shared model, then converges (the duplication the brief warns against, scheduled on purpose) | Finance builds its own aggregates and its own recurring engine; two later convergences |
| **Dependency risk** | low: nothing in V2.9 or V2.10 waits on the owner; DEBT-198 has two releases to clear | low for the first two; Finance third with the same gate | medium: Finance second, so DEBT-198 must clear within one release | **highest**: the first release is gated on an owner-held secret set and a public-repo security decision, with a 0-for-4 record on owner-held blockers |
| **Migration complexity** | V2.9 none; V2.10 one data-carrying migration rehearsed; V2.11 one simple table + R2; V2.12 five tables | same migrations, one release earlier | Finance's tables land before the obligation generalisation, so V2.13 migrates *Finance* rows as well | Finance's tables first, then obligations migrate twice (Assets → Finance-shaped → shared) |
| **UX complexity** | rises gradually: no new nav in V2.9; one entry in V2.10; none in V2.11; one in V2.12 | same, one release earlier | Attachments' record UI before any domain gives it a reason | Finance UI, import mapping and files in one release |
| **Testing burden** | V2.9 is unit/kernel-heavy and proves the flat-statement rules on data that exists; each later release's series tests reuse the same fixtures | Finance's aggregates tested inside Finance, then re-tested under Reports | Finance and Attachments back-to-back are the two heaviest E2E additions in the sequence | the heaviest release first, with two stores, on a suite whose ten-run count is still owner-held |
| **V3 readiness** | consolidation arrives with every primitive shared | one convergence (aggregation) left for V2.16 | one convergence (obligation) explicitly scheduled | two convergences and a rebuilt aggregation |

**Why A wins.** It is the only sequence in which every release consumes something the previous one built and nothing is built twice: the history layer (V2.9) is consumed by V2.12, V2.13 and V2.14; the Obligation model (V2.10) is consumed by V2.12 and V2.13; the evidence primitive (V2.11) is consumed by V2.12, V2.14 and every record. It puts the owner's first priority fourth in *order* but first in *preparation* — two prerequisite releases and an owner-held gate with time to clear — and it never stalls the product on that gate. B's honest advantage is one release of earlier Life Admin value; its cost is a budget-vs-actual built twice. C schedules duplication deliberately. D would be the right sequence for a product that already had its backup, its aggregation layer and its files; DalyHub has the first in-account and neither of the others.

**The honest objection**: *"Insight is the owner's third priority and you are doing it first."* Yes — because it is the smallest release, it needs nothing from anyone, it proves the rules money will later run through, and the owner's first and third priorities both depend on it. If the owner reads V2.9's definition and wants Life Admin first, the swap costs nothing architecturally (V2.10 depends on nothing in V2.9) and one release of budget-vs-actual built inside Finance rather than on the shared layer.

---

## 11. The chosen sequence

Defined in [`ROADMAP_V2_9.md`](../roadmap/ROADMAP_V2_9.md) — V2.9 in full, the rest at decreasing resolution. The summary:

| Release | Theme | Status | Gate |
|---|---|---|---|
| **V2.9 INSIGHT** | the history the product already holds, given back — one deterministic window/bucket/series layer, the multi-Review trend, Insight with a real range | **DEFINED** | none |
| **V2.10 LIFE ADMIN** | what do I need to deal with — one Obligation model for everything due and recurring, with one home | PLANNED | none |
| **V2.11 EVIDENCE** | the paper lives with the thing — the `attachment` entity on one private bucket, backed up and restored before the first file | PLANNED | D1+R2 restore rehearsal (internal) |
| **V2.12 FINANCE CORE** | where is my money going — accounts, imported transactions, categories, one month, budget vs actual, obligations settled | PLANNED | **DEBT-198** (owner-held) |
| **V2.13 REPORTS** | one saved definition, many questions — Report as a saved-view kind over the history layer | PRESUMPTIVE | V2.9 |
| **V2.14 GROUNDED AI** | explain the facts — the gate, the fact block, the Weekly Review assistant live, "explain this" | PRESUMPTIVE | **the AI key** (owner-held), DEBT-237, DEBT-213 |
| **V2.15 ASSISTED AI** | propose, never act — new proposal kinds through the one apply path | PRESUMPTIVE | V2.14 live for one release |
| **V2.16 CONSOLIDATE** | one product, one map — the question-first rail, deletion, every store restorable, the register closed | PRESUMPTIVE | everything above |

---

## 12. The V3 boundary

**V3 is a product boundary, not a number.** DalyHub is V3-ready when all of the following are true, and V3 begins with the capabilities that only make sense once they are:

- Tasks / Projects / Goals / Reviews mature — **true today**.
- Life Admin mature: the Obligation model shared, every due-and-recurring thing in one place, surfaced through one row — V2.10 + V2.12.
- Finance core mature: imports idempotent, months readable, budgets honest, obligations settled — V2.12 + V2.13.
- Reports mature: definitions saved, deterministic, over every domain — V2.13.
- Grounded AI available and proven live; assisted proposals through one path — V2.14 + V2.15.
- Attachments and evidence available, backed up, restorable — V2.11.
- Architecture consolidated: the question-first rail, deletion, one recurrence engine per domain and no more, every store in the archive and the rehearsal, the register's open entries either closed or re-homed — V2.16.

**What becomes appropriate for V3, and is refused in V2**: dashboards as arrangements of saved reports; document text as AI evidence behind a sanitising extractor; bank feeds and any owner-supplied third-party credential class beyond feed URLs; split transactions and investment holdings; a phone slot for Finance if measured use earns it; a real capture-triage state (DEBT-102's decision); the offline slice if pain is ever measured; embeddings, still only on their own evaluation (ADR-073 §20); multi-workspace or household sharing; anything autonomous.

**What stays out of both**: a general document management system, full accounting, tax, invoicing, scores of any kind, a reminder engine, a second search index, a second tag model, a fourth recurrence engine, a dashboard on Today.

---

## 13. Debt raised and changed by this pass

Raised (next free after this pass: **DEBT-243**), each with evidence, impact, desired state, owner programme and closing condition on the entry:

- **DEBT-238** — the kernel `ActivityRepository` has no time-window read; five adapters carry bespoke windowed SQL. Owner: V2.9. P3.
- **DEBT-239** — Analytics' range vocabulary is three presets bucketed to fit the Review's eight-period cap; no shared window/grain/series primitive. Owner: V2.9. P3.
- **DEBT-240** — an obligation cannot exist without an Asset parent and carries no amount, so a commitment that is not about an Asset has no home but a recurring Task. Owner: V2.10. P3.
- **DEBT-241** — no documentation link or anchor check exists; **447 broken local links measured across the docs** (254 anchors that drifted when a heading changed, 43 missing non-image files, 150 uncommitted screenshots), including eleven in `ROADMAP_V2_8.md` alone. Owner: V2.9 (INS-00). P2.
- **DEBT-242** — no workspace or account deletion path exists while Finance is about to raise the sensitivity of what would be deleted. Owner: V2.16. P3.

Changed: DEBT-212 and DEBT-103 (taken by V2.9); DEBT-35 (re-homed to V2.10 and V2.11); DEBT-198 (**now a hard gate for V2.12**); DEBT-237, DEBT-213, DEBT-91 (the V2.14 sequence); DEBT-70, DEBT-102 (dispositions unchanged, re-dated). All on the entries.

---

## 14. Related documents

- [`ROADMAP_V2_9.md`](../roadmap/ROADMAP_V2_9.md) — the roadmap truth: V2.9 defined, the sequence to V2.16 labelled
- [`ROADMAP_V2_8.md`](../roadmap/ROADMAP_V2_8.md) — the predecessor programme and the assessments this pass adopted (AI gate, Attachments shape, Finance prerequisites)
- [ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export) — the durable boundaries this pass draws
- [ADR-079](../decisions/ARCHITECTURE_DECISIONS.md#adr-079-review-insights--three-kinds-of-truth-one-persisted-snapshot-and-no-score) · [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal) · [ADR-111](../decisions/ARCHITECTURE_DECISIONS.md#adr-111-steering--owner-judgement-is-stored-beside-derived-signals-never-merged--one-next-action-rule-one-goal-story-and-a-collection-order-that-answers-a-recorded-question) — Insight's constitution
- [ADR-082 (saved views)](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract) — the seam Reports reuse
- [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split) · [ADR-083](../decisions/ARCHITECTURE_DECISIONS.md#adr-083-a-compound-domain-mutation-is-one-storage-transaction-composed-from-the-owning-repositories-statements) — money and the obligation transaction
- [ADR-073](../decisions/ARCHITECTURE_DECISIONS.md#adr-073-the-controlled-ai-platform--provider-independence-proposal-only-writes-application-enforced-budgets-and-an-evidence-contract) · [ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable) — the AI platform and its gate
- [`DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md`](DALYHUB_POST_V2_6_PRODUCT_AUDIT_2026_08.md) §8–§9 — the Finance and reporting assessments this pass builds on
- [`ASSETS_MODULE.md`](../development/ASSETS_MODULE.md) · [`AI_PLATFORM.md`](../development/AI_PLATFORM.md) · [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) · [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) · [`VIEWS_MODULE.md`](../development/VIEWS_MODULE.md) · [`NOTIFICATIONS.md`](../development/NOTIFICATIONS.md) — the module authorities measured
- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — DEBT-238 … DEBT-242 and the dispositions above

*Written by the post-V2.8 product-strategy pass, 2026-09-04, from the code at `6b4d4a8` and the repository's own records. Nothing here was implemented.*
