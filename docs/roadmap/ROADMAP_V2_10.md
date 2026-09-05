# ROADMAP_V2_10.md — DalyHub V2.10, LIFE ADMIN

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md)
> hold V2.1 … V2.8; [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) holds V2.9 INSIGHT
> (**complete 2026-09-04**) **and the remaining V2 sequence, V2.11 … V2.16**,
> which this file does not restate and does not replace.
>
> **This file is V2.10, and it is where new work goes.** It was defined on
> 2026-09-05 against `main` at `57c4b19` (V2.9's merged-tree gate pass, PR #255)
> by a pass that re-measured the obligation implementation rather than
> inheriting the PLANNED sketch in
> [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v210--life-admin-planned). Where that
> sketch and this file disagree, **this file wins**, and every disagreement is
> stated with the measurement that produced it. The durable decisions this pass
> made — the ones ADR-116 did not already make — are
> [ADR-118](../decisions/ARCHITECTURE_DECISIONS.md#adr-118-life-admin--an-obligation-is-an-entity-with-one-subject-in-two-representations-an-expected-amount-that-is-not-a-payment-and-an-old-table-that-is-retired-rather-than-left-behind).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.10 LIFE ADMIN — DEFINED 2026-09-05.** Four items,
LIFE-00 … LIFE-03. The architecture was already decided by
[ADR-116 decision 1](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export)
and this pass confirmed it against the code rather than restating it.

**Successor: V2.11 EVIDENCE, PLANNED** — see
[`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v211--evidence-planned).

---

## The theme: LIFE ADMIN — one Obligation, whether or not it is about an Asset

**DalyHub already knows how to carry something that is due and recurs; it just
insists that the something be an Asset.** V2.10 removes that one assumption and
gives the model a home, so a tax return, a passport renewal, a gym membership,
a school fee and a rego renewal are the same kind of record, on the same due
fact, through the same Today row and the same digest rung.

This is the PLANNED V2.10 the post-V2.8 strategy named, confirmed by
re-measurement — **and it is not a new domain.** Measured on `57c4b19`:

- `asset_obligations` (`migrations/0025_asset_history_and_obligations.sql:97-200`)
  declares `asset_id TEXT NOT NULL` with a composite foreign key into
  `entities (workspace_id, id, type)` pinned to `'asset'` by
  `asset_entity_type TEXT NOT NULL DEFAULT 'asset'` and a CHECK (`:101, :127,
  :182-184`). There is no amount column of any kind.
- The domain arithmetic is already general. `app/kernel/assets/asset-obligation.ts`
  (717 lines) is pure, calendar-only and touches no Asset except through two
  named bridges — `canonicalFactForCategory` (`:104-121`) and
  `completionEventCategory` (`:128-150`). Its categories, statuses, recurrence
  kinds, date arithmetic, `evaluateObligation` and the recurrence anchor
  ("a full interval after the work was actually done", `:316-342`) carry no
  Asset assumption at all.
- The completion transaction is one `D1Database.batch()` already
  (`app/platform/storage/d1/d1-asset-history-repository.ts:1485-1830`,
  [ADR-083](../decisions/ARCHITECTURE_DECISIONS.md#adr-083-a-compound-domain-mutation-is-one-storage-transaction-composed-from-the-owning-repositories-statements)):
  close → Activity → proof `asset_events` row → at most one successor guarded
  both by `completionGuard` and by the `(workspace_id, series_id, sequence)`
  UNIQUE constraint → forward-only canonical Asset fact → the linked Task's own
  planned statements, appended last and gated on the same predicate.
- **An obligation is not an entity.** It has no `entities` row, so it has no
  EntityLink, no Activity subject of its own, no record route, no search
  exposure and no identity glyph. Every Activity event about an obligation is
  filed against the *Asset* (`#appendStatements(ASSET_OBLIGATION_COMPLETED,
  [current.assetId], …)`, `:1606-1615`).
- **Today and the digest are Asset-shaped in their wording, not only their
  reads.** The notice title is `` `${assetTitle} — ${title}` ``
  (`app/kernel/notifications/digest.ts:266-280`), the href is
  `/asset/<id>?tab=obligations`, the notification `kind` is `asset_obligation`
  behind a database CHECK (`migrations/0043_create_notifications.sql:153`), the
  dedupe key is `` `asset:${obligationId}:${rungDays}` ``
  (`app/kernel/notifications/notification.ts:193-198`), and
  `SerializedAttentionItem` requires `assetId`, `assetTitle` and `assetType`
  (`app/kernel/assets/asset-today.ts:33-45`).

Unrepresentable today although every other part of the machinery exists: a tax
return; a passport renewal; a school fee with the amount it will cost; an
annual subscription; a licence that belongs to a Person rather than a thing; a
renewal whose expected cost the owner wants to see before it lands.

V2.10 makes those first-class, migrates every existing Asset obligation onto
the same model, retires the old table, and adds **no** second due fact, no
second recurrence engine, no reminder engine and no Finance.

---

## Where V2.9 left the product

V2.9 INSIGHT completed 2026-09-04 (PR #254) and its merged-tree gate pass
landed 2026-09-04 (PR #255): `main` is `57c4b19`. Nothing in V2.9 is a
dependency of V2.10 — the strategy said the swap was architecturally free and
that is still true — and nothing in V2.10 consumes the history layer. The one
place they will meet is V2.13, where "obligations due in the next 90 days" is
a Report over this release's store.

Two owner-held items are unchanged and neither gates this programme:
DEBT-203's ten-run count, and
[DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2),
which is a hard gate for V2.12 Finance and has now had two releases' notice.
**DEBT-198 is not a V2.10 gate**, and this pass does not make it one — but
V2.10 carries the programme's first data-carrying migration since V2.6, so
§[The migration, and what proves it](#the-migration-and-what-proves-it) states
exactly what evidence is required and which half of it only the owner can
produce.

---

## What was measured, item by item

The strategy estimated the Asset obligation as "≈80% of the required model".
**Re-measured, that number conflates two different denominators and should not
be carried forward.** Of the *domain arithmetic* — categories, statuses,
recurrence kinds, calendar advance, urgency evaluation, the series chain, the
one-successor rule, the Task-pointer semantics and the Today dedupe rule —
essentially all of it moves unchanged; the only Asset-specific arithmetic is
the meter dimension. Of the *release*, rather less: identity, the subject, the
amount, the home, Search, EntityLink, the export shape and the surfacing
wording are all new or must be generalised.

### The store

| Concern | Measured on `57c4b19` |
|---|---|
| Schema | `migrations/0025_asset_history_and_obligations.sql:97-187`, STRICT, PK `(workspace_id, id)`, ~20 named CHECK constraints, `UNIQUE (workspace_id, series_id, sequence)`, composite FK to `entities (workspace_id, id, type)` pinned to `'asset'` |
| `has_commitment` | `CHECK (due_date IS NOT NULL OR meter_threshold IS NOT NULL)` (`:167-169`) — an obligation must commit to a date or a meter |
| Indexes | six (`:189-200`): by asset, by due, by meter, by category, by task, by series |
| Category | closed to nine Asset-shaped values (`:128-133`) |
| Money | **none** |
| Identity | no `entities` row; `id` is unique per workspace only |

### The code

| Concern | Where | Verdict |
|---|---|---|
| Domain (pure) | `app/kernel/assets/asset-obligation.ts` (717 lines) | **Moves.** Two Asset bridges (`canonicalFactForCategory`, `completionEventCategory`) stay behind |
| Meter | `app/kernel/assets/asset-meter.ts`, and the `current_meter_*` columns on `asset_details` | **Asset-specific.** A meter is a property of a thing; a subject-less obligation cannot have one |
| Today projection | `app/kernel/assets/asset-today.ts` (120 lines) | **Moves**, with `assetId`/`assetTitle`/`assetType` becoming an optional subject |
| Repository contract | `app/kernel/assets/asset-history-repository.ts:197-320` | **Splits.** Obligation methods move to a new contract; event/meter methods stay |
| D1 adapter | `d1-asset-history-repository.ts:1225-2308` — create `:1225`, get `:1305`, update `:1322`, status `:1431`, complete `:1485`, delete `:1881`, list `:1914`, link/unlink/reconcile Task `:1995`/`:2043`/`:2070`, attention `:2138`, summarise `:2233` | **Moves**, with the joins in `listAttention` (`:2166-2172`) and `summariseObligations` (`:2255-2257`) becoming LEFT joins |
| Activity | `workspace-activity-descriptors.ts:466-510`; subjects are the **Asset** | **Generalises.** No amount reaches the feed today and none may after |
| Export | `SnapshotAssetObligation` (`workspace-snapshot.ts:746-770`), collection `assetObligations` (`:967`, order `:1087`) | **Replaced** by an `obligations` collection; the old key stays readable forever |
| Restore | `d1-workspace-restore-repository.ts:468-495` + `stageRows` `:1227-1252`; cross-reference integrity in `restore-safety.ts:349-383` | **Replaced**, and the legacy key must still restore |
| Vault | `assetObligationLine` (`build-vault.ts:829-861`), the Asset's `## Obligations` section (`:966-971`) | **Kept as a section**, now linking records |
| Search | nothing — an obligation is not searchable in any form today | **New** |
| EntityLink | nothing — an obligation has no link of any kind today | **New** |
| Notifications | rungs `[30, 7, 1]` (`notification-evaluator.ts:141`), `kind` CHECK (`0043:153`), dedupe `` `asset:…` `` (`notification.ts:193-198`), notice text (`digest.ts:266-280`) | **Generalises**, and the `kind` needs a real migration |
| Today | `attention-facts.server.ts:186-211` → `dedupeAttention` → `attention-view.ts:188-214`; one row inside `ATTENTION_MAX = 5` | **Widens the set the row reads**, nothing else |
| Statement budgets | `TODAY_STATEMENT_BUDGET = 22` (`test/kernel/today-review-door.test.ts:296`) | Must not move; if it must, the file's own rule requires the bump be documented where it is declared |
| Mobile UI | `AssetObligationsTab.tsx` (357), `AssetObligationForm.tsx` (266), `AssetCompleteObligationForm.tsx` (269) | **Replaced** by shared Obligation components the Assets tab composes |

### The five questions the definition had to answer

1. **What can move unchanged?** The whole pure domain except the meter, and the
   whole completion transaction shape.
2. **What is genuinely Asset-specific?** The meter dimension; the canonical
   Asset fact update; the `asset_events` logbook proof row; the archived-Asset
   suppression rule.
3. **What assumes `asset_id NOT NULL`?** The schema's FK and CHECK; both
   repository reads' inner joins; every serialisation type in `asset-today.ts`,
   `attention-view.ts` and `digest.ts`; the notice title, href and subject id;
   the export row shape.
4. **What assumes every obligation has an Asset event?** Only
   `completeObligation`'s proof row and `CompleteAssetObligationResult.event`,
   which is why the completion result's `event` must become nullable rather
   than being faked for a subject-less obligation.
5. **Which queries become invalid or expensive if the subject is optional?**
   `listAttention` and `summariseObligations`, whose inner joins would silently
   drop every subject-less row. Both become LEFT joins with the archived guard
   rewritten as `(d.entity_id IS NULL OR d.archived_at IS NULL)`. Neither gains
   a statement: the subject's title comes from the same LEFT join, so **there
   is no per-obligation subject query at any point in this programme.**

---

## The decisions

### D1 — Obligation is an entity, and Life Admin owns it

**Confirmed, on evidence.** `entities.type` is an open validated string
(`app/kernel/entities/entity.ts:22`, `ENTITY_TYPE_PATTERN` at
`entity-validation.ts:48`) and **no migration in the repository puts a CHECK on
it**, so `obligation` is a legal type today at zero schema cost. Every other
record in the product is an `entities` row plus one additive STRICT detail
slice, and that is what buys EntityLinks, Activity subjects, Search, the record
layout, the identity glyph and export for free.

So: an `obligation` **entity** plus an `obligation_details` slice, owned by a
new `obligations` module whose navigation label is **Life Admin**. The
Assets record's Obligations tab becomes a lens over the same records filtered
by subject. The `obligation` type is **reserved** from the generic entity
repository exactly as `asset` is (`RESERVED_ASSET_ENTITY_TYPES`,
`asset-identifiers.ts:32`), so an obligation can never exist without its detail
row.

*Rejected:* keeping `asset_obligations` and adding a nullable `asset_id`
(rejected: it leaves the record without identity, links, search or export, and
ADR-116 d4 would still require a bespoke export shape); a second table for
non-Asset obligations (rejected: that is the two-model outcome ADR-116 d1
exists to prevent).

### D2 — One subject, two representations, one authority

The subject is optional and may be any entity: an Asset, a Person, a Project,
an Area, or nothing at all.

It is stored **twice, deliberately**, and this is the decision the definition
had to make rather than inherit:

- `obligation_details.subject_entity_id` + `subject_entity_type`, a nullable
  pair carrying a composite foreign key into `entities (workspace_id, id, type)`
  — the same shape `asset_obligations` already uses, generalised. Entity type
  is immutable after creation, so the denormalised type cannot drift, and the
  FK makes a cross-workspace subject impossible **at the database level**,
  which is the isolation guarantee `entity_links` already relies on
  (`migrations/0003_create_entity_links.sql:53-64`).
- One typed EntityLink, `obligation.subject`, source = the obligation,
  target = the subject.

**The foreign key is authoritative. The link is a projection of it.** Every
structural read — the Assets lens, the attention read, the canonical-fact
update, the collection's subject column — reads the FK, because only the FK can
sit inside an index with `status` and `due_date`. Every *generic* read — the
subject record's Linked items, the relationship timeline, the link picker —
reads the link, because that is the kernel primitive and a bespoke reverse
reader is exactly the "second relationship system" ADR-116 forbids.

Parity is guaranteed three ways, and none of them is hope:

1. Both are written, changed and cleared in **one** `D1Database.batch()`, on
   the ADR-083 statement-seam pattern the obligation completion already uses.
2. `obligation.subject` is a **reserved link type**: the generic link picker
   and the generic unlink path refuse it, so the projection has no second
   writer.
3. A kernel invariant test asserts, over a real D1, that every obligation with
   a subject has exactly one active `obligation.subject` link to that subject
   and no obligation without a subject has one — and it is falsified by
   removing the link statement from the batch.

*Rejected:* the FK alone (rejected: the subject's record would need a bespoke
reverse read, and Person, Project and Area records already render linked items
generically); the link alone (rejected: `WHERE subject_entity_id = ? AND status
= 'open' ORDER BY due_date` cannot be served from `entity_links` without a join
per read, and the canonical-fact update needs the subject inline inside the
completion batch).

### D3 — Thirteen categories, still closed, with labels held separately

The existing nine stay **unchanged and uncoerced** — they drive
`canonicalFactForCategory`, so changing one would silently move an Asset's
dates. Four are added:

| Added | Why it earns a place |
|---|---|
| `bill` | A recurring charge for something already consumed — rates, electricity, water. Money-bearing, recurring, renews nothing |
| `subscription` | A standing payment for continued access. **Membership is this**, and its label says so, rather than being a fourteenth key |
| `fee` | A charge that is neither consumption nor access — school fees, strata, body corporate. Usually annual or per-term |
| `tax` | A tax payment or lodgement. Its label says "or lodgement" rather than adding `filing` |

Thirteen keys, closed, structure and never tags
([ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates)'s
non-goal). No category administration, no owner-defined categories.

**Labels are widened where the key is narrower than the vocabulary**, in the
options table rather than in the stored value: `licence` reads "Licence, permit
or passport renewal"; `subscription` reads "Subscription or membership"; `tax`
reads "Tax or lodgement"; `reminder` keeps "Custom reminder" and remains the
escape hatch that stops category pressure becoming tag pressure.

**`appointment` is refused**, and the refusal is the point: an appointment that
has been booked is a Meeting or an external calendar event, and an appointment
that needs booking is the thing you have to deal with — which every other
category already expresses. Adding it would put a fourth surface in front of a
question Meetings and the calendar already answer.

Every example the programme was asked to support lands somewhere: car
registration → `registration`; insurance renewal → `insurance`; vehicle service
→ `service`; passport renewal → `licence`; tax return → `tax`; school fee →
`fee`; gym membership → `subscription`; annual subscription → `subscription`;
licence → `licence`; inspection → `inspection`; recurring household obligation
→ `bill`, `maintenance` or `reminder`.

### D4 — An expected amount is not a payment, and the actual amount has one home

Under [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split):
integer minor units, an ISO-4217 code, **no conversion**, bounded by
`MAX_MONEY_MINOR_UNITS`.

Three columns, named so they cannot be confused:

- `expected_amount_minor` — what it is expected to cost. Optional. Never a
  claim that anything was paid.
- `completed_amount_minor` — what it actually cost, recorded at completion.
  Optional even for a money-bearing obligation.
- `currency_code` — **one** code per obligation, applying to both. Supplying an
  actual amount in a different currency is refused with a named validation
  error rather than converted; an obligation with no currency takes the one
  from the first amount recorded, and for an Asset-subject obligation that
  defaults to the Asset's currency exactly as
  `AssetCompleteObligationForm` already does.

**Why the actual amount is a column and not an Activity payload:** ADR-049
decision 5 forbids a price in an Activity payload, and the Assets descriptors
honour it today. An amount that exists only in an event the product refuses to
write is an amount that does not exist.

**The Asset logbook keeps its own cost, and that is not a second authority.**
When the subject is an Asset, completion still writes the `asset_events` proof
row with `cost_minor`, exactly as today — parity is a hard requirement. The two
figures come from one input in one transaction and answer different questions:
"what did this obligation cost" and "what has this Asset cost me". The
obligation's column is never read back from the event, and the event is never
read back from the obligation.

**Amounts are sensitive.** They may not appear in a Search excerpt or subtitle,
in any Activity descriptor or payload, in any notification title or body, in
the digest, on Today, or in any log or diagnostic. This is asserted by test,
not by convention.

### D5 — One completion, one transaction, one successor

One operation performs, in one `D1Database.batch()`, whichever of these apply:

close the occurrence · record the completion date · record the actual amount ·
append **one** `obligation.completed` Activity event with the obligation as its
subject · create **at most one** successor, anchored on the day the work was
actually done · maintain the `(series_id, sequence)` chain · update the
subject's canonical fact where the subject has one · write the `asset_events`
logbook row where the subject is an Asset · complete the linked Task through
its own repository's planned statements, gated on the obligation having closed
in this very transaction.

Nothing here is new except the amount, the Activity subject and the two
"where applicable" clauses. `CompleteObligationResult.event` becomes nullable,
because a subject-less obligation writes no Asset event and faking one would be
the first lie in this domain.

### D6 — One recurrence engine, generalised, and still three in the product

The product has three deliberate recurrence engines — Tasks, obligations,
Habits — and V2.10 adds none. The obligation engine is *moved*, not copied:
`app/kernel/assets/asset-obligation.ts` is **deleted**, not aliased, on the
`analytics-range.ts` precedent
([ADR-117 alternatives](../decisions/ARCHITECTURE_DECISIONS.md#adr-117-insight--one-history-vocabulary-over-stores-already-written-a-bound-that-is-stated-rather-than-applied-and-a-link-check-that-makes-the-map-a-gate)) —
an alias keeps a second vocabulary alive behind a re-export. A structural test
fails if a second evaluator, a second category vocabulary or a fourth
recurrence helper appears.

The anchor rule is preserved verbatim and tested explicitly: a recurring
obligation's successor is due a full interval after **the day the work was
done**, not after the day it was originally due, so lateness never compounds
(`asset-obligation.ts:304-315`). Month-end clamping (31 January + 1 month = 28
February) and leap years are pinned by test.

### D7 — The migration retires the old table, in one change, with the IDs kept

One data-carrying migration, on the
`0049_create_tag_vocabulary.sql` precedent (create → copy with an explicit
column list → drop → recreate indexes verbatim; no triggers; a production
export taken first):

1. `CREATE TABLE obligation_details` (STRICT, composite PK, named CHECKs, the
   composite subject FK, the series UNIQUE, and covering indexes).
2. `INSERT INTO entities` — **one entity per obligation, keeping the
   obligation's own id as the entity id**, with `type = 'obligation'`, the
   obligation's `title`, and its `created_at`/`updated_at`/`deleted_at`
   verbatim.
3. `INSERT INTO obligation_details` — every column carried across by name,
   `subject_entity_id = asset_id`, `subject_entity_type = 'asset'`.
4. `INSERT INTO entity_links` — one `obligation.subject` row per obligation,
   with a **deterministic** id derived from the obligation's, so the migration
   is inspectable and re-runnable rather than depending on `randomblob`.
5. `DROP TABLE asset_obligations`.

**Keeping the id is the whole migration's safety property.** `series_id`,
`sequence`, `next_obligation_id`, `completed_event_id`, `task_id` and
`asset_events.obligation_id` all reference obligation ids and none of them has
a database foreign key — `restore-safety.ts:349-383` is their only integrity
authority. Preserve the ids and every one of those chains is preserved by
construction, with nothing to remap and nothing to get wrong.

Two measured hazards the migration must handle rather than discover:

- `asset_obligations` allows a whitespace-only title (`length(title) > 0`)
  while `entities` requires `length(trim(title)) > 0`. The application cannot
  create one, but an archive could. The migration substitutes a stated
  placeholder rather than failing an owner's upgrade, and the rehearsal
  **counts** such rows and expects zero.
- `entities.id` is globally unique while `asset_obligations.id` is unique per
  workspace. A collision is impossible for ids this application generated, and
  the rehearsal proves it by counting.

### D8 — Retirement, decided

**The old table is dropped in the same migration.** Not left unused, and not
kept behind a compatibility window.

The argument that decided
[ADR-082 decision 4](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-one-saved-view-system-two-kinds--the-tasks-declarative-configuration-generalised-into-a-cross-module-query-contract)
the other way was that renaming `task_saved_views` would make a rollback to the
previous Worker fatal for **no gain** — the column DEFAULT already classified
every existing row, so nothing needed to move. That argument does not transfer,
and this pass says why rather than citing it: here the rows genuinely move, so
the previous Worker is already broken by the data whether the table survives or
not. A retained `asset_obligations` would be a second copy of every obligation
that no code writes, that export would either have to keep emitting (a lie) or
silently drop (a loss), and that the next release would find and have to reason
about. Leaving it is the two-authority outcome by another name.

What replaces the rollback is stated, not assumed: a production export is taken
immediately before the migration is applied (the standing `AGENTS.md` database
precondition), the nightly R2 tier is the verified healthy copy, and the
migration is rehearsed end to end before it is merged.

### D9 — Life Admin's place, and what it must not become

Route `/obligations`; navigation label **Life Admin**; module id `obligations`;
`navGroup: "more"`, `navOrder: 215` — immediately **before** Assets (220), so
the two read together and the pair is already in the order the V2.16
"Deal with" group will adopt. No phone-bar slot: the three earned slots are
unchanged for the whole of V2, and Life Admin reaches the phone through Today's
attention row and the More sheet.

The Obligation record is a full record at `/obligations/:obligationId`. The
Assets record's Obligations tab is the **same rows** filtered by subject.
People, Projects and Areas get a reference through the ordinary Linked items
they already render — no bespoke door, no new tab.

**Not built:** a Life Admin dashboard, a second Today card, a calendar, any
amount on Today, a phone-bar slot, a capture-grammar token.

### D10 — The collection groups the owner's actual question

The planned grouping was *due this week / this month / later / done*. Measured
against the evaluator, **that is wrong in one place and it matters**: the
evaluator's most urgent state is `overdue`, and an overdue obligation folded
into "this week" is the one row the owner most needs to see losing its
distinction. The groups are therefore:

**Overdue · This week · This month · Later · Done**

with `unknown` (a meter obligation awaiting a reading) sorted with `overdue`'s
neighbours exactly as `dedupeAttention` already ranks it. Status is a filter,
not a group: the default lens is open work; on-hold, dismissed and completed
are reachable through the shared collection controls. Counts and grouping come
from the canonical due semantics, computed in SQL over the whole collection
before pagination — never over the loaded page.

### D11 — One Search provider, and no amount in it

One provider on the module manifest, matching **title, category label and
subject title**. Amounts are never matched and never excerpted, exactly as the
Assets provider never matches a price (`app/modules/assets/search.ts:6-9`). The
explicit-query boundary
([ADR-114 decision 2](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine))
is unchanged: an obligation's description is body content and is matched only
in answer to a query the owner typed.

### D12 — Today widens; the notification kind is renamed truthfully

Today's **one** obligation attention row reads the whole obligation set. The
dedupe rule is unchanged and stays in the kernel where neither surface can fork
it: an open linked Task wins, and the count it suppressed is stated in words. A
subject-less tax return surfaces exactly as an Asset rego does. Nothing else
from Life Admin appears on Today.

The notification `kind` becomes `obligation`. It is a CHECK-constrained value
in a STRICT table, so it takes a real table rebuild — and the rebuild is the
opportunity to do the one thing a rename must not skip: **the dedupe keys are
rewritten in the same statement.** The key shape is a storage contract
(`notification.ts:167-178`) and changing the prefix without carrying the
existing rows across would re-fire every historical rung at the owner. The
settings column `asset_obligations_enabled` is renamed in place with
`ALTER TABLE … RENAME COLUMN`, and its label stops saying "Asset".

The rungs `[30, 7, 1]`, the one channel, the insert-before-send discipline and
the owner-day semantics are all unchanged. **No reminder engine, no per-obligation
notification settings, no time-of-day** — ADR-114's refusal stands.

### D13 — Export and restore ship with the table, not after it

[ADR-116 decision 4](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export)
says a new collection enters the canonical snapshot **in the same PR as its
table**. This pass therefore moves export and restore out of the planned
LIFE-03 and into the item that creates the store. That is the one place where
this definition materially changes the PLANNED shape, and it is not a judgement
call.

The `obligations` collection is added under the write-always /
tolerate-absence-on-read protocol (`EXPORT_AND_PORTABILITY.md` §2), and
`assetObligations` **stays readable forever**: an archive taken the day before
the migration must still restore the day after, translated by the same rule the
migration uses. An archive written after the migration carries `obligations`
and no `assetObligations`.

The Obsidian vault renders an Obligation as a record in its own folder, and the
Asset's `## Obligations` section becomes links to those records rather than
inline lines.

### D14 — Evidence is a slot, not a control

The record exposes the relationship architecture for linking an existing Note,
and says in words that files arrive in V2.11. **No upload button, no file
metadata, no R2, no placeholder** — DEBT-53's discipline.

### D15 — Security, stated before it is built

Every new read and mutation is proven against a hostile second workspace, using
the `recall-01-search-content.test.ts` pattern: real D1, two workspace
constants, synthetic distinctive fixture strings, and assertions at the
repository rather than inferred from routing. Specifically: a subject entity id
from another workspace (refused by the composite FK, and asserted); a linked
Task id from another workspace; an `obligation.subject` link from another
workspace; direct access to an obligation id that exists elsewhere
(indistinguishable from "does not exist"); Search; the Assets lens; Today; the
notification evaluator; export; restore. No title, amount or existence may
leak, and no test failure or diagnostic may print an obligation's description
or amount.

### D16 — Budgets are measured, then pinned

Measured on realistic fixtures — 1, 30 and 100+ obligations, mixed subjects,
subject-less rows, recurring chains — and pinned as constants asserted against
real D1 at every shape the surface offers: the collection page, the Asset lens,
the Obligation record, the Today obligation read, the completion operation, and
Search. **No per-row subject read, no per-row Task read, no per-row Activity
read, and no query per category band.** `TODAY_STATEMENT_BUDGET = 22` does not
move; if it must, the bump is documented where the constant is declared, in
`TODAY_DASHBOARD.md`, and in this file.

---

## NOW

Four items. The domain first, then the store, then the home, then the signal.

```
LIFE-00 ──► LIFE-01 ──► LIFE-02 ──► LIFE-03
(domain)    (store +    (Life Admin  (one due
            migration    home)        signal)
            + export)
```

### ☑ LIFE-00 — One obligation domain — **delivered 2026-09-05**

**The obligation arithmetic lives in one place, carries no Asset assumption,
and there is no second copy of it.**

- **Reproduced.** `app/kernel/assets/asset-obligation.ts` (717 lines) holds
  the categories, statuses, recurrence kinds, calendar advance, urgency
  evaluator and completion contract for a concept ADR-116 has already made
  general, under a name and a directory that say it belongs to Assets.
  `asset-today.ts` holds the Today dedupe rule with `assetId`, `assetTitle` and
  `assetType` non-optional (`:33-45`).
- **Intended.** `app/kernel/obligations` — pure, no D1, no JSX, no clock —
  holding the vocabulary, `evaluateObligation`, the recurrence advance, the
  subject-optional attention projection, the completion input/result contracts
  and the money validation. `asset-obligation.ts` and `asset-today.ts` are
  **deleted**; the Assets kernel imports the shared domain and keeps only
  `canonicalFactForCategory`, `completionEventCategory` and the meter.
- **What does not change.** Every stored value, every derived state, every
  word the owner reads. The category vocabulary stays at nine here — it widens
  in LIFE-01, with the database CHECK, so the kernel can never accept a
  category the database refuses.
- **Falsification.** Re-introduce a second evaluator behind a re-export and
  watch the structural test fail; change the successor anchor from the
  completion day to the due date and watch the "a service done two months late
  schedules six months after the work" test fail.
- **Acceptance.** Machine-value parity on the same fixtures before and after
  (the V2.5 rule); every existing obligation unit and kernel test passes
  unchanged through the moved domain; a structural test enumerates the one
  evaluator, the one category vocabulary and the three recurrence engines and
  fails when a count moves in either direction (the ADR-117 registry shape).
- **Non-goals.** Any schema change; any behaviour change; any surface.

**Delivered 2026-09-05.** [`app/kernel/obligations`](../../app/kernel/obligations/index.ts)
holds the domain; the Assets kernel keeps what is genuinely about an Asset. Five
places where implementing it corrected the definition:

- **The meter forced a decision this file did not anticipate, and it is the
  interesting one.** `evaluateObligation` cannot both be free of Assets and
  evaluate a meter: the units, the approach windows and the current reading are
  properties of the *thing*, and `asset_details.current_meter_*` is where the
  reading lives. So the meter side is **injected** — the shared evaluator takes
  an already-evaluated `ObligationMeterEvaluation | null` and ranks it against
  the date side, and `evaluateAssetObligation` is the composition that computes
  it. That is the same shape ADR-117 decision 1 chose for the history kernel,
  where owner-day resolution arrives as an argument rather than as a dependency.
  The structural test asserts the composition *delegates*: it fails if the Asset
  side ever grows a `needsAttention` of its own.
- **`asset-obligation.ts` keeps its path, and that is not the alias this file
  warned about.** What was deleted is the general domain the file used to own —
  693 of its 717 lines. What remains is the meter glue, the two bridges and the
  Asset-shaped extensions, and the file's header says so. Keeping the path makes
  the diff show exactly what left; a *new* filename would have hidden it. The
  guarantee that no second copy exists is the registry test, never a filename.
- **`asset-today.ts` did NOT move, and should not have been listed here.**
  Measured: its `SerializedAttentionItem` and `AttentionInput` require
  `assetId`, `assetTitle` and `assetType`, and its href is `/asset/:id?tab=obligations`.
  Moving it means making the subject optional, and a subject-optional projection
  with no subject-optional store to feed it is a shape nothing can produce. It
  moves in LIFE-01, with the schema.
- **The money validation moved to LIFE-01 for the same reason.** A pure
  validator with no caller is exactly what DEBT-212 measured as debt; it lands
  with the columns it validates.
- **`describeRecurrence` is now `describeObligationRecurrence`.** Tasks already
  has a `describeRecurrence` for its own, different engine
  (`d1-task-repository.ts:614`), and two identically-named recurrence describers
  in one codebase is how two engines come to be mistaken for one. The Asset
  wrapper `describeAssetObligationRecurrence` formats the meter interval in the
  Asset's units before delegating.

**Falsified, then reverted.** Four rules, each broken on the tree and each
failing the test that claims it: an import of `~/kernel/assets` added to the
obligations kernel (the domain-purity test named the file and the specifier); the
successor anchored on the due date instead of the completion day (the anchor test
failed with 2026-07-15 against 2026-09-15); a fourth `nextOccurrenceDate` helper
added to the kernel (the engine registry named it); and a second evaluator
declared beside the bridge (the delegation test failed). All four reverted, and
the suite is green on the reverted tree.

**Parity, not a rewrite.** Every existing obligation, meter, Today and
notification test passes unchanged through the moved domain — the same machine
values before and after (the V2.5 rule). The general cases moved to
[`test/unit/obligations/obligation.test.ts`](../../test/unit/obligations/obligation.test.ts),
which imports `~/kernel/obligations` and nothing else from the product; the
meter, the "whichever comes first" resolution and the two category bridges stay
in `test/unit/assets/asset-obligation.test.ts`.

**Nothing owner-facing changed**, so there is no changelog entry. That is the
item's acceptance criterion, not an omission.

### ☑ LIFE-01 — The shared store, and the Asset record does not notice — **delivered 2026-09-05**

**Every obligation is an entity with an optional subject and an optional
expected amount, the old table is gone, and an Asset owner experiences the
change as nothing at all.**

- **Reproduced.** §[What was measured](#what-was-measured-item-by-item).
- **Intended.** The `obligation` entity type and the `obligation_details`
  slice (D1); the subject pair and its reserved projection link (D2); the four
  added categories with the database CHECK (D3); the three money columns (D4);
  the completion transaction with a nullable event (D5); the data-carrying
  migration that retires `asset_obligations` (D7, D8); the `obligations`
  collection in export, restore, restore-safety and the vault (D13); the
  Assets module converged onto the shared repository as a lens.
- **The Assets module keeps nothing private.** No private mutation path, no
  private evaluator, no private row anatomy, no private completion transaction,
  no private recurrence. A convergence test on the V2.8 shared-consumer shape
  fails if the Assets module reintroduces one or reads the legacy table.
- **Falsification.** Make `subject_entity_id NOT NULL` and watch the
  subject-less test fail; drop the workspace predicate from one read and watch
  the hostile fixture fail; remove the link statement from the completion batch
  and watch the FK/link parity invariant fail; let the batch create two
  successors and watch the one-successor invariant fail; skip the canonical
  Asset fact update and watch the before/after parity test fail; remove
  `obligations` from the export and watch the restore parity test fail.
- **Acceptance.** Count, id, title, category, due date, recurrence, status,
  Task pointer, series chain, Asset association, canonical dates and historical
  events all identical before and after on a realistic fixture; a subject-less
  obligation is creatable, completable and recurring at the repository; hostile
  second workspace on every read and mutation; export → restore into an empty
  disposable workspace reproduces every machine fact, for subject-less,
  Asset-subject, Person-subject, recurring, completed, open, money-bearing and
  Task-linked rows; an archive containing `assetObligations` and no
  `obligations` still restores; statement budgets pinned; `PRAGMA
  foreign_key_check` clean after the migration.
- **Non-goals.** Any Life Admin surface; any Today or notification change; any
  settlement, payment status or Finance concept.

**Delivered 2026-09-05.** Migration
[`0050_create_obligations.sql`](../../migrations/0050_create_obligations.sql)
moved every obligation into `obligation_details` beside an ordinary `entities`
row and an `obligation.subject` link, and dropped `asset_obligations`.
[`app/kernel/obligations`](../../app/kernel/obligations/index.ts) owns the
contract; [`d1-obligation-repository.ts`](../../app/platform/storage/d1/d1-obligation-repository.ts)
implements it; the Assets module reads it as a lens.

- **The migration is proven by moving data through it, not by writing the new
  shape.** [`test/kernel/migration-0050.test.ts`](../../test/kernel/migration-0050.test.ts)
  applies `0001…0049` — the schema production runs today, with `asset_id NOT
  NULL` still in force — seeds obligations of every status, every recurrence
  kind, a mid-series chain, a proof pointer, a linked Task, a soft-deleted one,
  an archived one and a second workspace's, and only THEN applies `0050`. It
  compares **every column, field by field**, checks the chains that have no
  foreign key still resolve, and runs `PRAGMA foreign_key_check` clean. A test
  that seeded the new shape would pass with the whole data-carrying half
  deleted, which is the failure V2.6 FIND-02 recorded.
- **Eight corrections the definition did not anticipate**, each recorded here
  because each is a decision:
  - **The Activity vocabulary had to generalise HERE, not in LIFE-03.** The
    repository that writes the events is this item's, and `asset.obligation_*`
    cannot be written about an obligation with no Asset. So `obligation.*` is
    the vocabulary now, carrying the obligation AND its subject as subjects —
    the multi-anchor shape `asset.task_linked` already used — so the Asset's
    timeline keeps showing what happened to its obligations. The historical
    `asset.obligation_*` events stay in the stream with their descriptors: an
    append-only log is not rewritten to match a new vocabulary. Both halves are
    asserted rather than assumed —
    [`activity-type-coverage.test.ts`](../../test/unit/activity-feed/activity-type-coverage.test.ts)
    now reads `OBLIGATION_ACTIVITY_TYPES` alongside `ASSET_ACTIVITY_TYPES`, so
    an obligation event with no descriptor fails the suite instead of reaching
    the feed as an unrecognised type. The new lines carry no identity glyph:
    that arrives with the Life Admin surface in LIFE-02, and until it does an
    event inherits the glyph of the record it names, which for the obligations
    an owner has today is the Asset. A wrong glyph asserted early would be
    harder to see and harder to remove than none.
  - **The completion guard had to name three things.** Every dependent
    statement fires only if THIS attempt closed the obligation, and
    `completed_at` alone is not attempt-unique — a fake clock returns one
    instant and two real requests inside a millisecond return one too. A retry
    against a guard that matched the winner's row inserted a second successor
    entity, which the concurrency test caught. The guard now also names the
    proof id and the successor id, both generated per attempt and both exactly
    what a second attempt could duplicate.
  - **The subject's proof arrives through an ADR-083 seam, and so does the
    meter's next threshold.** The `asset_events` row and the canonical-date
    advance are Assets' SQL, so the Assets adapter authors them and the
    obligation's batch runs them. The meter successor's threshold went the same
    way once it was clear the obligation repository would otherwise have to own
    arithmetic in a unit vocabulary it does not have.
  - **`obligation.subject` is hidden from generic Linked Items**, on the
    precedent that already hides the spine and Habit links: the Asset record
    renders its obligations in a tab, so listing them again would be a second
    copy of a relationship the reader can already see — and the foreign key is
    the authority, so this surface must never become its second writer.
  - **`assetObligations` stays in the snapshot as a RETIRED collection.** An
    export written from now on carries `obligations` and an empty
    `assetObligations`; an archive written before today carries the reverse and
    is upgraded as it is read, by exactly the rule the migration used
    ([`legacy-obligations.ts`](../../app/kernel/restore/legacy-obligations.ts)).
    A change of store that invalidated the backups taken before it would make
    "export always possible" a promise with an expiry date.
  - **The `obligation` entity type is RESERVED, and the guard is wired, not
    only declared.** Every obligation read joins `obligation_details`, so a
    bare `entities` row of that type is a commitment to nothing: invisible to
    Life Admin, to Today and to the Asset it claimed to be about, while still
    holding an id. The predicate existed and the generic entity repository's
    reservation chain did not name it — a declaration nobody checked. It is
    checked now, and asserted.
  - **Purging an Asset takes its obligations with it, and its own link never
    blocks that.** An obligation whose subject was purged is a commitment about
    nothing, and leaving it would move it silently to Life Admin's "no subject"
    band — a real state this owner did not ask for. So the purge batch removes
    each obligation's projection link, its Activity subject pointers, its detail
    row and its entity row, child-first, under the same guard every other
    statement carries. `obligation.subject` is excluded from that guard and from
    the link precheck: counted, it reported every Asset that had ever carried an
    obligation as `has_links`, a block with no way out, because the link is not
    offered by the picker and not removable from Linked Items.
  - **The obligation vault page is a record, and the Asset links to it.** The
    Asset's Obligations section used to restate each obligation inline; two
    renderings of one thing is how a vault comes to disagree with the workspace
    it came from. Money appears on the obligation's page and nowhere else.
- **A foreign subject now refuses differently, and better.** The subject used to
  be the obligation's mandatory parent, so a foreign one meant "no such Asset" —
  a 404. It is an optional FIELD now, so a foreign one is a field-level refusal
  that names the field and discloses nothing. The Assets route is unaffected: it
  still fails closed on the Asset before any dispatch. The composite foreign key
  refuses it again at the database, which is the boundary that actually holds.
- **Falsified, then reverted.** A `NOT NULL` on `subject_entity_id` fails the
  subject-less test; a category outside the closed set, a meter on a
  subject-less obligation, an amount with no currency, a paid amount on an open
  obligation and a second successor at one point in a series are each refused by
  the database and asserted to be; and the concurrency test caught the guard
  defect above before any of this was called done.

### ☑ LIFE-02 — Life Admin has a home — **delivered 2026-09-05**

**`/obligations` answers "what do I need to deal with?" and is comfortable on a
phone.**

- **Intended.** The `obligations` module: the collection (D10) built from
  `CollectionLayout` and a shared Obligation row, the full Obligation record on
  the shared record layout, title-first creation that requires no subject, one
  completion/renewal sheet carrying the completion date and — only when the
  obligation is money-bearing — the actual amount, the Search provider (D11), a
  `New obligation` palette command, the identity glyph and accent, and the rail
  entry (D9). The Assets Obligations tab renders the same row.
- **A shared money field is built here, once.** Three hand-rolled
  `TextField` + currency pairs exist today (`AssetDetailsForm.tsx:310-325`,
  `AssetCompleteObligationForm.tsx:197-240`); a fourth would be the bespoke
  duplicate `AGENTS.md` §9.8 calls debt on the day it merges.
- **Falsification.** Leak an amount into a Search subtitle or excerpt and
  watch the privacy test fail; make the completion sheet a second modal over
  the record and watch the modal-stack assertion fail.
- **Acceptance.** Create → appears → search finds it → open → complete →
  successor appears, with no Asset anywhere in the journey; the record joins
  `FOLD_RECORDS` in `e2e/record-anatomy.spec.ts` and holds the fold anchor and
  the contained-surface rule; 320 / 375 / 390 / 430 / phone landscape and the
  195px 200%-zoom case; light and dark; `axe` clean with no rule disabled;
  keyboard equivalents for every swipe action; statement budgets pinned and
  flat at 1, 30 and 100+ obligations.
- **Non-goals.** A dashboard; a wizard; an onboarding flow; a capture-grammar
  token; a phone-bar slot; any upload control.

**Delivered 2026-09-05.** [`/obligations`](../../app/modules/obligations/module.ts)
is the Life Admin surface, banded Overdue · This week · This month · Later ·
Done, with each heading carrying the count of its band across the whole
collection. [`app/shared/obligations`](../../app/shared/obligations/index.ts)
owns the ONE row, the ONE completion form and the ONE mutation path; the Asset
record's Obligations tab draws them. The module is documented in
[`LIFE_ADMIN_MODULE.md`](../development/LIFE_ADMIN_MODULE.md).

- **Six corrections and additions the definition did not anticipate**, each
  recorded here because each is a decision:
  - **The obligation entity type was RESERVED in name only.** The predicate
    existed; the generic entity repository's reservation chain did not consult
    it, so a bare `create` could produce an `entities` row with no detail slice
    — a commitment to nothing, invisible to every read that joins that table.
    Fixed and asserted on LIFE-01's branch, where it belonged.
  - **The accent test checked INEQUALITY, not distinguishability.** Of the ten
    candidate hues measured for the new identity, three came back within a CIE76
    distance of 1.3 of an existing accent in at least one scheme — visually
    identical, and passing every assertion the file then held. It asserts a
    perceptual floor now, which surfaced three PRE-EXISTING pairs below it (all
    involving Diary's violet), recorded as
    [DEBT-245](../product/PRODUCT_DEBT.md) rather than absorbed into a lowered
    bar. `#795548` was chosen because it holds ΔE 19.1 against its nearest
    neighbour in the worst scheme.
  - **`obligation.subject` cannot be the Task link.** The completion path needed
    a link between an obligation and the Task carrying it, and the subject
    projection was the only obligation link that existed. Reusing it would have
    made "what this is about" and "what is tracking this" one type;
    `obligation.linked_task` is its own.
  - **A COUNT that ignored the search would describe a different list.** The
    band counts and the row read take the same query, the same filters and the
    same subject scope, through one shared predicate rather than two copies —
    the specific defect D10 exists to prevent, one forgotten argument away.
  - **The Search predicate was wrong on first write, and nothing said so.** It
    matched `o.title`, a column that does not exist: the title lives on the
    `entities` row, one title in one place. The orchestrator isolates a provider
    failure to `ok: false` with no message, so the only visible symptom was a
    `partial` status in an unrelated route test. Covered now by repository tests
    that match by title, by category LABEL and by subject title, and by the
    amount refusals D11 asks for.
  - **A component may not import a `.server` module, and the production build is
    where that is enforced.** The collection imported its loader for two types
    and a constant; `pnpm build` refuses it, and rightly — it would drag the
    composition boundary and D1 into the client bundle. The client-safe half is
    its own file, and the band grouping (pure) moved to the view model.
- **The completion sheet offers the amount on EVERY obligation**, not only
  where an expected one was recorded. The item's own wording said "only when the
  obligation is money-bearing", and that reads tidy and loses a fact: completion
  is the moment the real figure is known, an owner who did not guess in advance
  is the ordinary case, and on an Asset the same field is what carries the cost
  onto the Asset's own history. D4 always permitted `completed_amount_minor`
  independently; this is the surface catching up with it.
- **A shared money field, and one fewer thing to get right separately.** Four
  hand-rolled amount-plus-code pairs existed across three Asset forms — not the
  three the definition counted. Two put the code behind a "More details"
  disclosure two sections from the amount it labelled; one used
  `inputMode="text"`, which is the alphabetic keyboard for a number. All four are
  now `MoneyField`.
- **Measured.** `e2e/life-admin.spec.ts` — five journeys, 49 s — runs the
  acceptance path with no Asset anywhere in it: create → appears in its band →
  Search finds it → open → complete → the successor exists. `axe` clean in light
  AND dark across the collection, the record, the record with its completion
  form open, and the create page. No horizontal overflow at 320, 375, 390, 430,
  phone landscape, 768, 1024, 1280, 1440 and 2560. The record joins
  `FOLD_RECORDS` twice — about an Asset, and about nothing.
- **Falsified.** The amount refusal is a test that fails when the predicate
  reaches an amount; the band ordering is a test that fails when the SQL's cases
  are reordered (verified by reordering them, and reverted).

### ☐ LIFE-03 — One due signal

**Today and the digest read the whole obligation set, and there is still one of
each.**

- **Intended.** The attention row's set widens to every obligation with the
  dedupe rule unchanged; the notification kind becomes `obligation` with its
  dedupe keys carried across in the same migration (D12); the settings column
  and its label stop saying "Asset"; the digest line and the notice text name
  the subject when there is one and the obligation when there is not; one
  generic `obligation.*` Activity vocabulary with descriptors, carrying no
  amount.
- **Falsification.** Break the linked-Task dedupe and watch the Today
  duplicate test fail; put an amount in a notification body and watch the
  privacy test fail; add a second Today row and watch the rail contract fail.
- **Acceptance.** A subject-less obligation reaches Today exactly as an Asset
  rego does, and only when no open linked Task carries it; the rungs, the
  channel, the insert-before-send discipline and the owner-day semantics are
  unchanged; every historical notification survives the kind migration without
  re-firing; `TODAY_STATEMENT_BUDGET` unchanged; hostile workspace on the
  evaluator.
- **Non-goals.** A reminder engine; per-obligation notification settings;
  quiet hours; a time of day; a second Today card; any money on Today.

---

## The migration, and what proves it

The migration is this programme's risk, and its evidence is defined before it
is written.

**Required, and achievable in this repository:** a realistic fixture built from
the shapes production actually holds — obligations of every category, every
recurrence kind and every status, with and without a linked Task, with and
without a completion, mid-series and at sequence 0 — moved through the
migration on a real D1 and read back, with count, id, title, category, due
date, recurrence, status, Task pointer, chain, Asset association, canonical
dates and historical events compared field by field; `PRAGMA foreign_key_check`
clean; then export → restore → read again, with the same comparison.

**Required, and owner-held:** the V2.6 convention is a rehearsal against a
*restored production artefact*. Re-checked against the current conventions:
`scripts/production-backup.mjs rehearse` is deliberately network-free and
credential-free and takes the encrypted artefact plus the recovery key as
arguments, and **no production artefact exists in this repository or can be
fetched from it**. The rehearsal therefore requires the owner to supply both
out of band. It is recorded here as an owner-held action with its exact
command, it is a **precondition of applying the migration to production**, and
it is not a precondition of merge — because a gate no contributor can run is a
gate that will be skipped rather than met.

**The migration audit** — run before the item is called done, against the
migrated fixture: orphan entities; orphan detail rows; chains pointing at ids
that no longer resolve; lost Task links; duplicate obligations; duplicate
Activity; duplicate Asset events; canonical Asset fact regression; category
coercion; currency nullability; a completed obligation reopened; restore
incompatibility.

---

## Why this sequence

LIFE-00 first because a domain that still lives under an Assets name cannot be
generalised without either moving it or copying it, and the copy is the outcome
every rule in this repository exists to prevent. LIFE-01 second because the
store cannot be built before the domain and must not be built without its
export. LIFE-02 third because a home for records that do not yet exist is a
home for nothing. LIFE-03 last because widening a signal is only meaningful
once there is something wider to signal.

**The one change from the PLANNED shape**, stated plainly: export and restore
move from LIFE-03 into LIFE-01, because ADR-116 decision 4 requires a
collection to enter the snapshot in the same PR as its table.

Nothing rides beside this programme.

---

## Dependencies

**External.** None that gate merge. **This programme carries a data-carrying
migration**, so the standing database precondition applies: a production export
is taken before it is applied.

**Internal.** LIFE-00 precedes LIFE-01 precedes LIFE-02 precedes LIFE-03. Every
item consumes — and none forks — the entity kernel, EntityLinks, the shared
Activity stream, the module registry, the shared collection and record layouts,
`app/shared/ui`, the money kernel, the notification evaluator, the export
compatibility protocol and the restore safety validator.

**Owner-held actions, separated from code work.**

| Action | Unblocks | Where recorded |
|---|---|---|
| Supply the encrypted production artefact and the recovery key, then run `production-backup.mjs rehearse` | Applying LIFE-01's migration to **production** (not merge) | This file, [above](#the-migration-and-what-proves-it) |
| Dispatch ten CI runs on one unchanged tree | DEBT-203's count, with it DEBT-125 and DEBT-157 | V2.8 CONV-03 |
| Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as a Worker secret in a non-production environment | the AI gate; V2.14 | AI_PLATFORM §21, ADR-112 d2 |
| Four GitHub `production` secrets **and** the public-repo protection decision | **DEBT-198 — a hard gate for V2.12 Finance.** Not a V2.10 or V2.11 gate | DEBT-198 |
| ~30 seconds in production: choose an identity colour, reload, confirm | DEBT-139's last clause | DEBT-139 |

---

## The acceptance boundary

Every item carries the durable rules verbatim (DHDS-13; V2.4; V2.5; V2.6; V2.7;
V2.8 — see [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md#the-acceptance-boundary)) and
V2.9's history rule where a figure is derived, and V2.10 adds one for the
domain it builds:

> **There is one Obligation, one due fact, one urgency evaluator, one
> completion transaction and one recurrence engine for everything the owner has
> to deal with — and a subject, an amount and an Asset are each optional
> without any of them becoming a second model.** An expected amount is never
> presented as a payment, and no amount reaches Search, Activity, a
> notification, Today, a log or telemetry.

Concretely, every item is accepted against: real seeded data with known values;
hostile rows in a second workspace on every touched query and mutation; light
and dark; 1440 and the 320/375/390/430 phone widths plus the 195px zoom case
where Today or a phone surface is touched; keyboard reach, visible focus,
accessible names; `axe` clean with no rule disabled; bounded queries with
counting-DB proofs; deterministic tests — none skipped, weakened, retried or
quarantined; and the falsification named on each item.

---

## Non-goals of V2.10

- **No Finance.** No accounts, no transactions, no categorisation, no
  settlement, no payment status distinct from completion — V2.12 owns the
  settlement link.
- **No attachments.** No R2, no upload control, no file metadata, no OCR, no
  document text — V2.11 owns files, and this release ships no placeholder.
- **No reminder engine**, no per-obligation notification preferences, no time
  of day, no quiet hours (ADR-114's refusal stands).
- **No fourth recurrence engine**, and no import of Task recurrence rules.
- **No second due fact, no second commitment model, no second surfacing
  system** — one Today row, one digest rung.
- **No dashboard**, on Today or inside the record.
- **No new phone-bar slot** and no global navigation regroup — the rail
  regroup is V2.16 CONSOLIDATE's, accepted at every width on its own evidence.
- **No category administration** and no owner-defined categories.
- **No forecasting** and no projection of future commitments — that is a
  Report over this store, V2.13.
- The standing non-goals of V2.3 → V2.9 stand unrestated.

---

## The debt, reconciled

This pass raised nothing new. The next free number is **DEBT-245**.

| Entry | Severity | Disposition |
|---|---|---|
| [DEBT-240](../product/PRODUCT_DEBT.md#-debt-240--an-obligation-cannot-exist-without-an-asset-parent-and-carries-no-amount--p3) — an obligation cannot exist without an Asset and carries no amount | P3 | **Taken by V2.10.** Its closing condition is LIFE-01's and LIFE-03's acceptance verbatim, and the owner-held half of its production-artefact clause is recorded [above](#the-migration-and-what-proves-it) rather than assumed |
| [DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3) — Assets' deferred capabilities | P3 | **The renewals-and-reminders half is taken by V2.10**, through the shared model. The attachments half stays with V2.11. The entry still closes empty |
| [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2) — the off-Cloudflare encrypted backup | P2 | **Not taken, and not a V2.10 gate.** It is Finance's, and pulling it into V2.10 because Finance will need it is exactly the widening this programme refuses. It becomes relevant to V2.10 only as the standing pre-migration export precondition, which the R2 tier already satisfies |
| [DEBT-243](../product/PRODUCT_DEBT.md#-debt-243--seven-surfaces-link-a-task-with-taskstask-a-parameter-nothing-reads--p3) — seven surfaces link a Task with a parameter nothing reads | P3 | **Not taken, and V2.10 must not become the eighth caller.** Life Admin's Task references use the drawer contract the Task drawer actually reads |
| DEBT-244 — one colour-scheme journey times out | P3 | **Not taken**; it belongs with DEBT-203's stability work and reproduces on `main` |
| DEBT-53 | P3 | **Honoured, not taken**: V2.10's evidence slot ships no dead control |
| DEBT-125 · DEBT-157 · DEBT-203 · DEBT-139 | ◐ | **Owner-held, unchanged** |

---

## Succession logic

V2.11 EVIDENCE is defined by its own decision pass against a re-measurement of
`main` after V2.10 completes, exactly as this file was defined against
`57c4b19` rather than inherited from V2.9's PLANNED sketch. It may keep,
reorder or refuse anything in
[the remaining sequence](ROADMAP_V2_9.md#the-remaining-v2-sequence), and it says
why. What it may not do is add a second due-and-recurring model, a second
aggregation layer, a second file primitive or an AI feature that computes a
fact (ADR-116).

---

## Related documents

- [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) — V2.9 INSIGHT, complete, and the remaining V2 sequence this file does not restate
- [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md) — the analysis that named this release; §4.2 and §4.5 are the Obligation decisions
- [ADR-116](../decisions/ARCHITECTURE_DECISIONS.md#adr-116-the-post-v28-domain-boundaries--one-obligation-model-for-life-admin-and-finance-deterministic-facts-before-ai-explanation-saved-reports-before-dashboards-and-no-domain-without-its-export) — one Obligation model, and no domain without its export
- [ADR-118](../decisions/ARCHITECTURE_DECISIONS.md#adr-118-life-admin--an-obligation-is-an-entity-with-one-subject-in-two-representations-an-expected-amount-that-is-not-a-payment-and-an-old-table-that-is-retired-rather-than-left-behind) — what this definition pass decided
- [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split) — integer minor-unit money
- [ADR-083](../decisions/ARCHITECTURE_DECISIONS.md#adr-083-a-compound-domain-mutation-is-one-storage-transaction-composed-from-the-owning-repositories-statements) — one compound mutation is one transaction
- [ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine) — the explicit-query boundary and the refusal of a reminder engine
- [`ASSETS_MODULE.md`](../development/ASSETS_MODULE.md) · [`TODAY_DASHBOARD.md`](../development/TODAY_DASHBOARD.md) · [`NOTIFICATIONS.md`](../development/NOTIFICATIONS.md) · [`SHARED_SEARCH.md`](../development/SHARED_SEARCH.md) · [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) · [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) — the module authorities this programme touches
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — what is owed, including DEBT-240
