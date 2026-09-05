# Assets module (ASSET-01 · ASSET-02 · ASSET-03)

Assets are **first-class DalyHub records** for the important things you own or are
responsible for — vehicles and camper trailers, appliances, electronics, tools and
equipment, home and work items, identification and important documents, software
licences, subscriptions, warranties, insurance policies, and any other valuable or
important record. An Asset carries its own structured metadata and history —
manufacturer/model, ownership, location, acquisition and value, warranty and
service dates, and document/policy details — and links to Areas, Projects, Goals,
Tasks, Notes, Diary entries, Meetings, People and other Assets through the shared
Universal Relationship System.

This first version is deliberately useful **without** external cloud file storage,
barcode scanning, OCR, AI, reminders or automated integrations. See
[Not implemented (by design)](#7-not-implemented-by-design).

**ASSET-02** turned that static register into an ownership system: every Asset now
carries its **history** (what happened) and its **obligations** (what is due), with
both calendar-based and meter-based maintenance, recorded costs, value history, a
documented Task authority contract and a calm Today presence.

Decision records: **[ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split)** (the Asset record) and
**[ADR-063](../decisions/ARCHITECTURE_DECISIONS.md#adr-063-asset-ownership-history--canonical-facts-recorded-events-and-future-obligations-as-three-separate-things)** (history and obligations).

---

## 1. Architecture

An Asset is an ordinary `entities` row of type `asset` **plus** exactly one
`asset_details` row owning the structured Asset slice. Assets are **not** part of
the Area → Goal → Project → Task spine (they add no `spine_records` row); they
attach across the spine through FND-04 EntityLinks.

- **Identity, title, soft-delete/restore** stay the generic `EntityRepository`'s
  (the single authority for identity/title). A rename goes through it.
- **The structured detail slice, real-world status and the archive lifecycle**
  belong to the authoritative, workspace-bound **`AssetRepository`**
  (`app/kernel/assets` contract; `app/platform/storage/d1/d1-asset-repository.ts`
  adapter). The `asset` type is **reserved**: the generic repository refuses to
  CREATE one, so an Asset can never exist without its detail row (mirrors
  People/Diary).
- **Relationships** stay EntityLinks; **the audit trail** stays the shared Activity
  stream; there is no second entity system, relationship table, Activity stream or
  file-storage provider.

### Two independent lifecycles (read this)

| Concept | Column | What it means | Where it's changed |
| --- | --- | --- | --- |
| **Real-world status** | `asset_details.status` | The state of the physical/digital thing: Active, Stored, Loaned, Under repair, Retired, Disposed. | The record's **Details** tab. A change appends `asset.status_changed` (or `asset.disposed`). |
| **Record archive** | `asset_details.archived_at` | Whether the DalyHub RECORD appears in active collections and ordinary pickers. Reversible put-away. | The record's **Settings** tab. Appends `asset.archived` / `asset.restored`. |
| **Soft-delete** | `entities.deleted_at` | The record reads as "not found" everywhere. | Generic entity lifecycle. |

These are genuinely independent: a **disposed** asset can still be an **active
(un-archived) record** you keep for history, and an **archived** record can still be
**"Active"** in the world. Archiving is never a status; a status is never archiving.

---

## 2. Data model

### Entity + detail slice

`migrations/0016_create_asset_details.sql` — a STRICT table keyed by
`(workspace_id, entity_id)` with a composite FK to `entities(workspace_id, id, type)`
(`ON DELETE RESTRICT`). Groups:

- **Identity** — `asset_type` (required), `status` (required, default `active`),
  `description`, `manufacturer`, `model`, `serial_number`, `reference_code`.

**Tags are no longer a column here.** V2.6 FIND-02 moved them to the workspace's one vocabulary — a `workspace_tags` row keyed by its ASCII case-folded `tag_key`, attached by `entity_tags`, read back on the record's own `SELECT` as one correlated projection ([ADR-113](../decisions/ARCHITECTURE_DECISIONS.md#adr-113-a-tag-is-a-workspace-vocabulary-with-a-folded-key-and-an-owners-spelling--one-join-table-one-normalisation-rule-one-filter-dimension-and-a-tag-that-offers-rather-than-creates)). The domain type still exposes `tags` as an array of the owner's own spellings, so nothing above this line changed shape; the storage did.

- **Ownership & location** — `owner_person_id`, `responsible_person_id`, `location`
  (plain text), `area_id`. Person/Area references are **canonical ids**, never
  duplicated records.
- **Acquisition & value** — `acquisition_date`, `purchase_price_minor` (INTEGER
  minor units), `currency_code` (ISO-4217), `supplier`, `replacement_value_minor`,
  `disposal_date`, `disposal_notes`.
- **Warranty & service** — `warranty_expiry`, `service_interval` (text), `last_service_date`,
  `next_service_date`, `service_provider`, `maintenance_notes`.
- **Document / policy / licence / subscription** — `issuer`, `reference_number`,
  `issue_date`, `renewal_date`, `url`, `document_notes`.
- **Lifecycle** — `archived_at`, `updated_at`.

Indexes serve the active/archived collection partition + recency, the type/status
facets, the expiry (warranty + renewal) and next-service date-driven views, and the
owner/responsible/area facets.

### Money — integer minor units, never a float

`app/kernel/money` is the (new) money helper: it parses a human decimal string into
integer minor units with **string arithmetic** (no float multiplication), formats and
round-trips exactly, resolves a currency's minor-digit count from `Intl`, and
performs **no currency conversion**. Amounts are stored as `INTEGER` with a
non-negative CHECK. Money is never shown on a collection card by default.

### Dates — wall-calendar, owner timezone

Date fields are literal `YYYY-MM-DD` strings compared as integers, never routed
through `Date` (ADR-022 §22.7). "Today" is the owner-calendar day
(`ownerCalendarIso`), so the whole app agrees on what "today" means. One canonical
evaluator — `app/modules/assets/asset-dates.ts` — classifies every due date
(overdue / due-soon / today / future / historical) and picks the single "next
meaningful date". The collection card, Summary and Dates tab all derive from it; due
date logic is never duplicated.

### Controlled vocabularies (stable keys, friendly labels)

- **Type** — `vehicle`, `trailer` (Trailer or camper), `equipment`, `appliance`,
  `electronics`, `tool`, `property_item`, `document`, `licence`, `insurance`,
  `subscription`, `software`, `other`. Extend by adding a key to the vocabulary and
  the migration CHECK (and a subtype icon) — no schema redesign.
- **Status** — `active`, `stored`, `loaned`, `under_repair`, `retired`, `disposed`.


---

## 2a. Facts, history and obligations — the three-way split (ASSET-02)

Read this before touching anything in `asset_events` or `asset_obligations`. The
whole feature rests on keeping three things separate, and on ONE direction of flow
between them.

| | What it is | Where it lives | How it changes |
| --- | --- | --- | --- |
| **Canonical facts** | The Asset's CURRENT state: purchase price, warranty expiry, registration/renewal date, next service date, current meter reading. | `asset_details` | Read DIRECTLY. Edited on the Details tab, or advanced FORWARD-ONLY by a completed event or obligation. |
| **History** | What HAPPENED: a service, a repair, a rego renewal, a valuation, a note about the hail. | `asset_events` | Appended. Corrected by editing the event. |
| **Obligations** | What is DUE: rego by 30 September, a service every six months or 10,000 km. | `asset_obligations` | Created, rescheduled, completed, dismissed or put on hold. |

**DalyHub is NOT event-sourced, and ASSET-02 does not make it so.** An Asset's
current warranty expiry is a column that is read; it is never reconstructed by
replaying a stream. An event may PROPOSE a new canonical fact, and the repository
applies that in the same transaction — but only forwards.

### Forward-only, guarded in SQL

Recording last year's service must not rewind today's next-service date. Entering
an old odometer reading must not rewind the odometer. Every projection is a
`CASE WHEN ? > column THEN ? ELSE column END` **inside the same batch as the event
insert**, so the rule cannot be bypassed by a second caller or forgotten by a
future one. A meter reading in a DIFFERENT unit on a newer date is allowed as an
explicit re-baseline (the owner switched the asset from km to miles); the two
readings are simply not comparable, so there is nothing to protect.

### The consequence worth knowing

A mistaken canonical date is corrected on the **Details** tab, not by editing
history. Editing an event corrects the record of what happened; it does not
retroactively rewrite a fact that was set deliberately.

---

## 2b. Asset Events — one model, fourteen categories

`migrations/0025_asset_history_and_obligations.sql` — a STRICT `asset_events`
table keyed by `(workspace_id, id)`, with a composite FK to
`entities(workspace_id, id, type)` (`ON DELETE RESTRICT`).

**Categories** (closed, stored keys): `purchase`, `service`, `repair`,
`inspection`, `registration`, `renewal`, `warranty`, `insurance`, `upgrade`,
`modification`, `damage`, `valuation`, `disposal`, `history`. `history` is the
deliberate catch-all so the owner is never forced to mis-file.

**One table, not fourteen.** Every category shares the columns and fills only the
ones that apply: a repair carries a cost and a provider; an inspection may carry a
date and a sentence. The FORMS differ (see §13 below), not the schema.

Fields, where applicable: title, `event_date` (wall-calendar, the timeline's sort
key), optional `completed_at` instant, Markdown `description`, `provider` (plain
text), `person_id` (an OPTIONAL canonical Person), `cost_minor`, `value_minor`,
`currency_code`, `meter_value` + `meter_unit`, `warranty_expiry`, `next_due_date`,
`task_id`, `note_id`, `obligation_id`, and the created/updated/archived/deleted
timestamps.

`cost_minor` and `value_minor` are **separate columns**: a cost and a valuation are
not the same quantity and must never be summed. An amount without a currency is
refused by a CHECK — a bare number is an unlabelled number.

Indexes serve the newest-first timeline read, the category facet + cost
aggregation, meter-reading resolution, and the reverse lookups from an obligation,
a Task, a Note and a Person.

---

## 2c. Asset Obligations — and the status split

`asset_obligations`, STRICT, same FK discipline.

**Categories:** `registration`, `warranty`, `insurance`, `licence`, `service`,
`inspection`, `maintenance`, `replacement`, `reminder`.

### Stored status vs derived state — read this

The stored `status` is the **owner-controlled lifecycle ONLY**:

- `open` · `completed` · `dismissed` · `on_hold`

The urgency words an owner actually reads are **DERIVED at read time**, never
stored:

- `upcoming` · `due` · `overdue` · `unknown`

A stored "overdue" flag is wrong the moment the clock ticks past it, and keeping it
true would need a background scheduler DalyHub deliberately does not have. One
evaluator — `evaluateObligation` in `app/kernel/assets/asset-obligation.ts` —
resolves the derived state from the due date, the lead time, the meter and the
owner-calendar day. The record, the collection card and Today all call it, so they
can never disagree.

**Task status values are not reused.** A Task is done or not; an obligation can be
on hold, dismissed as no longer relevant, or waiting on a reading nobody has taken.

### Date-based and meter-based maintenance

An obligation must commit to **something** — a due date, a meter threshold, or
both. When it carries both ("six months or 10,000 km, whichever comes first"), the
**more urgent side wins**, and an unknown meter never silences a known date.

**Meters** are bounded data, never formulas:

| Unit | Label | Approach window |
| --- | --- | --- |
| `km` | Kilometres | 500 km |
| `mi` | Miles | 300 mi |
| `hours` | Hours | 20 hrs |
| `cycles` | Cycles | 20 cycles |
| `count` | Count | 5 uses |

Two readings are comparable **only within the same unit**. A km obligation against
a mi reading is reported as *incompatible*, never converted — the odometer analogue
of ADR-049's refusal to convert currency.

**"No reading" is a first-class state.** A meter obligation with no current reading
reads as **"Current meter reading needed"** and is **never** called overdue.
Accusing the owner of being late for work whose trigger we cannot measure would be
a lie the data does not support.

### Recurrence

`none` · `days` · `weeks` · `months` · `years` · `meter`, each with a bounded
interval. No expression language, no cron.

**A recurrence anchors on the day the work was ACTUALLY done.** A service done two
months late schedules the next one a full interval after the work, not after the
date it was originally due — otherwise being late once compounds forever. A meter
interval measures from the reading at completion, so a service done 400 km late
does not permanently pull the schedule 400 km early.

**Exactly ONE successor per completion.** The successor insert is gated on the
completion having been written in THIS batch AND on a `NOT EXISTS` check, with
`UNIQUE (workspace_id, series_id, sequence)` as the database-level backstop. A
retry returns the existing completion; a concurrent completion produces one event
and one successor, not two.

---

## 2d. The Task authority contract

| Field | Authoritative record |
| --- | --- |
| Due date, recurrence, meter threshold, maintenance meaning | **Obligation** |
| Whether the work is on the owner's plate today | **Task** |
| Proof that the work happened | **Asset Event** |
| Current warranty / renewal / next-service date, current meter | **Asset** (`asset_details`) |

The rules that follow from it:

- **Completing the Task never asserts the work happened.** Ticking off "book the
  service" is not proof the car was serviced. The obligation stays open and the
  record says so in the owner's words: *"Its task is done. Record what actually
  happened to complete this obligation."*
- **Completing the obligation completes an open linked Task, in the SAME
  transaction.** That direction is safe, because completing an obligation *is*
  recording the work — and since AUDIT-13 the two commit together or not at all
  (below).
- **Rescheduling the obligation moves the Task's due date**, so the two can never
  permanently diverge.
- **Deleting the Task never deletes the obligation.** The pointer is cleared on
  reconciliation, and the owner can create a fresh Task.
- **Task WRITES go through the canonical `TaskRepository`**, so Task recurrence,
  project rollup and the Task's own Activity are never reimplemented here.

### Obligation completion and its linked Task are ONE transaction (AUDIT-13)

The Task used to be completed FIRST, through the injected `ObligationTaskGateway`,
with the obligation's own batch following. A failure in that second transaction left
a Task ticked off against an obligation that was still open — and the obligation is
the record of whether the work happened. `ObligationTaskGateway.completeTask` is
therefore **deleted**: an API that closes a Task on behalf of another transaction is
the failure mode, not a step towards fixing it.

`completeObligation` now assembles ONE `D1Database.batch()`:

```text
  closeObligation (UPDATE … status='open' → 'completed' … RETURNING)
  asset.obligation_completed Activity            (guarded on changes())
  insertEvent — the proof the work happened      (guarded on completionGuard)
  successor occurrence, at most one              (guarded on completionGuard
                                                  AND NOT EXISTS the series slot)
  canonical asset facts / meter, forward-only    (guarded on completionGuard)
  ── the linked Task's completion statements ──   (its gate carries completionGuard)
```

The Task's statements are **planned, not executed**, by the Task adapter
(`planCompletion`, which returns prepared statements and writes nothing), and its
completion gate carries the obligation's own `completionGuard` —
`EXISTS (obligation completed with this event id)` — evaluated *inside* the
transaction. So the Task closes only if the obligation actually closed, and any
later failure rolls the Task's completion back with everything else. Task
recurrence and the waiting-state clearance ride along in the same batch exactly as
they do for an ordinary completion.

**The Activity payload stopped guessing — by not making the claim at all.**
`taskOutcome` used to be produced by `catch { taskOutcome = "already_closed" }`, so
a genuine storage failure, a validation error and a Task the owner had actually
already ticked were all recorded as `already_closed` in the permanent event.
Replacing that with a pre-batch read was better and still not truthful: the payload
is serialised BEFORE the batch, so a Task completed — or deleted — by another
request in the gap left an event asserting that this operation closed it.

So the obligation's event no longer restates it. There is already exactly one
authority for "was the linked Task completed": the Task's OWN `task.completed`
event, appended by the Task's own statements in this same batch. A second copy of
one fact is how two events come to disagree. The payload keeps only structural
facts it can guarantee — `category`, `recurrence`, `createdSuccessor`.

**The RESULT still reports the outcome, and derives it from what the batch did.**
`completeObligation` remembers the index of the Task's completion gate and reads
its `changes()` afterwards. A planned `completed` that changed no row means another
request won the gap, so the result is re-derived from fresh state: `already_closed`
if the Task is still there, `missing` if it is gone. `none` when nothing was
linked. A rolled-back completion appends no event at all.

**Evidence.** `test/kernel/audit-13-atomic-operations.test.ts` (real Workers
runtime, real D1): success closes the obligation, lands the proof event and
completes the Task together; a fault BEFORE the Task's statements and a fault AFTER
them both leave the obligation open, the Task open and no event, with no successor
left behind; a retry after a failure yields exactly one completion, one event and
one completed Task; two concurrent completions commit one of each; a Task closed or
deleted by another request between the plan and the batch is reported as
`already_closed` / `missing` rather than `completed`, with no invented
`task.completed`; and another workspace can neither complete the obligation nor
touch its Task. See
[ADR-083](../decisions/ARCHITECTURE_DECISIONS.md#adr-083-a-compound-domain-mutation-is-one-storage-transaction-composed-from-the-owning-repositories-statements).

---

## 2e. Today, and the deduplication rule

> **Restored by TODAY-09 (2026-08-09).** The Today redesign removed the old Assets
> dashboard widget and briefly left `asset-today.ts` without a product caller.
> TODAY-09 restores the contract as an **Asset** row in the existing Needs
> attention rail, not as a rebuilt widget. This closes
> [DEBT-111](../product/PRODUCT_DEBT.md).

Today carries Asset obligations that need attention within the Assets attention
horizon, ordered overdue → due → reading-needed by the Assets Today kernel rule.
The rail shows one row for the signal and stays under Today's five-row cap.

**The rule: an OPEN linked Task wins.** An obligation whose Task is still open is
already in the day or Tasks view, so showing it again would be the same job twice
on one page. It is suppressed from the Assets row and the suppressed count is
**stated in words** ("2 tracked as tasks"), never silently dropped when another
obligation remains visible. The moment that Task is completed, cancelled or
deleted, the obligation reappears here — which is precisely the "now record what
actually happened" moment.

The rule lives in the KERNEL (`app/kernel/assets/asset-today.ts`), because Today
must not import a module's internals and both surfaces have to agree.
`AssetHistoryRepository.listAttention` is ONE bounded workspace query — never N
reads for N assets — and excludes archived and deleted Assets.

---

## 2f. Recorded costs and value history

Cost groups: **service and maintenance** (`service`, `inspection`), **repairs**
(`repair`, `damage`), **renewals and registration** (`registration`, `renewal`,
`warranty`, `insurance`), **upgrades and modifications** (`upgrade`,
`modification`).

- Totals are labelled **"Recorded costs"** everywhere, with an explicit line saying
  they are *not* a complete cost of ownership. DalyHub cannot know whether every
  receipt was entered and must not imply it.
- The **purchase price stays separate** from ongoing cost, combinable only under an
  explicitly-labelled "Recorded lifetime total".
- **Mixed currencies are never added together.** The dominant currency is
  summarised and the others are reported as excluded, by name.
- Aggregation happens **in SQL over the full history**, never over a loaded page.

**Value history** is valuation events only — a date, a value, a currency, an
optional source. Two points are two points: the shape is drawn only above THREE
points, and a plain-text summary always accompanies it. No depreciation model, no
inferred market value.

---

## 2g. Documents and Notes

Asset Events link an existing **Note** (`note_id`) for a service report, a receipt,
warranty details, a registration or insurance record. There is no second embedded
notes system inside Assets, and no fake attachment UI: file attachments are not a
DalyHub capability yet, so Notes and documented external references carry that job
until they are ([DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3)).

**Providers are not People.** An event may store a plain provider name, a linked
Person, or both. Typing a provider name **never** creates a Person record.

---

## 2h. Lifecycle

| Action | Effect on history and obligations |
| --- | --- |
| **Archive an Asset** | History and obligations are KEPT and become read-only. The Asset stops asking for things: its obligations leave Today. |
| **Restore an Asset** | Open obligations return to Today. Completed occurrences stay completed — restoring never reopens finished work. |
| **Soft-delete an Asset** | Everything disappears from every read, including Today. |
| **Archive an Event** | It leaves the default timeline and the cost totals; it is never destroyed, and `includeArchived` still reads it. |
| **Delete an Event** | Soft-deleted. An obligation whose completion PROOF was deleted keeps its completed status and its series position; only the dangling pointer is cleared, so recurrence is never corrupted. |
| **Delete a linked Task** | The obligation survives; reconciliation clears the pointer so a fresh Task can be created. |
| **Cross-workspace ids** | Rejected on every relation (Person, Task, Note) — an id from another workspace is simply not found here. |

---

## 3. The repository contract (`AssetRepository`)

Workspace-bound (ADR-010): constructed with one `WorkspaceContext`; no method
accepts a `workspaceId`; the trusted Activity actor is bound at construction.

- `create` — validates, then writes the `entities` row, the `asset_details` row and
  one `asset.created` event in ONE atomic `D1Database.batch()`.
- `get` — fails closed (missing / wrong-type / soft-deleted / cross-workspace → `null`);
  archived assets are returned (archive is not deletion).
- `list` — bounded cursor pagination with a deterministic total order over the FULL
  workspace collection in SQL (never only the loaded page). Views: `all`, `recent`,
  `expiring`, `service_due`, `archived`. Structured filters (type, status, area,
  owner/responsible person, tag) and a non-sensitive text query; sorts: recently
  updated, title, type, next date. The cursor is versioned and **scope-bound** — a
  cursor issued for one (workspace + view + sort + filters + query) is rejected under
  any other.
- `update` — touches only changed columns; an idempotent no-op appends nothing; a
  status change appends `asset.status_changed` / `asset.disposed`, any other change
  appends `asset.updated`.
- `archive` / `restore` — reversible put-away, atomic with `asset.archived` /
  `asset.restored`; independent of status.
- `permanentlyDelete` — **guarded**: refuses while active relationships reference the
  Asset (`{ deleted: false, blockedReason: "has_links" }`), then purges the Asset's
  footprint child-first in one atomic, race-closing batch. Never touches a linked
  record.
  - **The purge includes the Asset's OWN `asset_events` and `asset_obligations`
    (V2.0.1).** Both reference the Asset's `entities` row with `ON DELETE
    RESTRICT` (migration `0025`), and until V2.0.1 the batch omitted them — so
    **any Asset with a single recorded event or obligation could never be
    permanently deleted**: the database refused the entity DELETE, the whole
    batch rolled back safely, and the route surfaced a generic "try again" for an
    operation retrying could not fix. The owner could not clear the blockage
    either, because `deleteEvent`/`deleteObligation` are SOFT deletes whose rows
    (and whose foreign-key references) survive. The purge now removes both
    tables' rows for that Asset — soft-deleted ones included — inside the same
    batch, before the entity. **The foreign keys were not weakened**, the purge
    is still one transaction, and the link guard is unchanged: a deletion blocked
    by a link still removes nothing at all, history included. Proven in
    `test/kernel/asset.test.ts` (a create → event → obligation → delete journey
    asserting zero remaining rows across all six tables, plus the
    blocked-purge-removes-nothing and cross-workspace cases).
  - **The purge writes ONE subject-less `asset.deleted` tombstone
    (AUDIT-FIX-03).** Until this fix the batch appended nothing at all, so an
    irreversible destruction — the Asset, its details, its whole service and
    financial history and every obligation — left no record that it had happened
    [AUDIT-03 / DEBT-79]. The final statement order is now `entity_links` →
    `activity_subjects` → `asset_events` → `asset_obligations` → `asset_details`
    → `entities` (`RETURNING`) → the tombstone, which is inserted **directly
    after** the entity DELETE and guarded `WHERE changes() > 0` on it. That
    adjacency is the contract, not a style choice: `D1ActivityRecorder`'s guard
    reads the statement immediately before it, so hanging the tombstone on any
    earlier child DELETE would fire it wrongly — those legitimately match zero
    rows for an Asset with no history, while the Asset itself is still destroyed.
  - **The tombstone is subject-less by design and carries `{assetId, title}`.**
    Its subject would point at the `entities` row the same batch removed, so
    there is none; the payload is therefore the only surviving statement of which
    Asset was destroyed, and the workspace feed renders the name from it. The
    Asset's existing `activities` rows are **retained** (append-only, ADR-012) —
    only their now-obsolete `activity_subjects` pointers go, and removing a
    pointer never removes the event it points at.
  - **Blocked, already-gone and race-losing purges write no tombstone at all.**
    A second purge returns `{ deleted: false }` having touched nothing, and a
    link created after the precheck but before the commit makes every guarded
    statement match zero rows — so the Asset is never partially destroyed and the
    caller gets a truthful `blockedReason: "has_links"` with the count, never a
    raw D1 error. Proven in `test/kernel/asset.test.ts` (five cases covering the
    tombstone, idempotency, active-link blocking, the commit-time race and
    fault-injected rollback at both `after-entity` and `after-tombstone`) and in
    `test/kernel/permanent-delete-contract.test.ts`, which asserts the same
    invariants across Areas, Assets and Reviews.

### `AssetHistoryRepository` (ASSET-02)

One workspace-bound repository owns BOTH halves of the ownership record, because
the interesting operations span them: completing an obligation writes an event,
advances a canonical Asset fact, creates at most one successor and reconciles a
Task, and every part of that must commit or none of it (ADR-012). Splitting them
would force a caller to orchestrate a transaction across two repositories, which
is exactly the route-level coordination the architecture forbids.

- **Events** — `recordEvent`, `getEvent`, `updateEvent`, `archiveEvent`,
  `restoreEvent`, `deleteEvent`, `listEvents` (bounded, cursor-paged, newest
  first), `costSummary` (aggregated in SQL over the FULL history),
  `valuationHistory`, and `recordMeterReading` (a deliberate front door so "just
  update the odometer" is one call and one event).
- **Obligations** — `createObligation`, `getObligation`, `updateObligation`,
  `setObligationStatus` (never `completed`: completion must produce its proof),
  `completeObligation` (the atomic five-step transaction), `deleteObligation`,
  `listObligations`.
- **Tasks** — `linkObligationTask`, `unlinkObligationTask`,
  `reconcileObligationTask`. Task WRITES route through the injected
  `ObligationTaskGateway` over the canonical `TaskRepository`; this repository
  never creates or completes a Task itself.
- **Cross-asset** — `listAttention` (the ONE bounded Today read) and
  `summariseObligations` (a whole collection page's counts in ONE query, so a card
  never loads history).

**Activity privacy (§17):** payloads carry only changed field NAMES and the status
vocabulary term — never a serial/policy number, price or private note.

---

## 4. The module (routes, navigation, UI)

Registered declaratively in `app/modules/assets/module.ts` (entity type, activity
types, `asset.linked_*` link types, commands, search provider) — discovery wires it
in with no central edit.

- **Routes** (`routes.manifest.ts`): `/assets` (collection, the only sidebar row),
  `/assets/recent`, `/assets/expiring`, `/assets/service-due`, `/assets/archived`
  (label-less sub-views reached from the collection's view switcher), `/new/asset`
  (create page), `/assets/create` (action-only JSON endpoint), `/asset/:id` (record),
  `/asset/:id/mutate` (action-only lifecycle/edit endpoint), `/asset/:id/activity`
  (Timeline JSON).
- **Collection** (`AssetsCollection.tsx`) — the shared PX-02 Collection Layout with a
  segmented view switcher, a URL-driven filter bar (type/status/area/owner/tag), a
  sort control, DS-04 Cards and cursor "Load more". Cards show only non-sensitive
  facts (subtype icon, title, type, status, make/model, location) plus the single
  next meaningful date, phrased explicitly ("Warranty expires in 18 days", "Service
  overdue", "Renewal due 12 September") — never colour alone.
- **Record** (`AssetRecord.tsx`) — the canonical DS-02 Record Layout with tabs:
  **Overview** (the glance: icon/type, status, make/model, owner/responsible/area,
  location, current meter, purchase, warranty, last work, the single most urgent
  obligation, linked open tasks — plus recorded costs, value history and the full
  date list behind progressive disclosure), **Obligations** (overdue → due soon →
  later, with completed and set-aside work behind a disclosure), **History** (the
  event timeline with six fast-capture actions), **Details** (grouped structured
  editing; changing the type never clears other data), **Linked** (the shared
  `LinkedItemsTab`, `anchorType="asset"`), **Activity** (the shared Timeline),
  **Settings** (rename / archive / restore / guarded permanent delete via the
  shared DS-10b Settings + `DangerousAction`).

  **ASSET-02 folded the old standalone Dates tab into Overview**, behind an "All
  dates" disclosure. Seven tabs is already the ceiling on a phone, and the canonical
  dates are context for the overview rather than a destination — a future date now
  lives as an obligation.

  **A row that does not apply is not rendered.** A software licence has no odometer
  and a hand tool has no registration, so neither shows an empty enterprise-style
  field for one.

- **Fast capture** (`AssetEventForm.tsx`) — six presets, each naming the SMALLEST
  useful field set for one real action: *Record service*, *Record repair*, *Update
  meter* (two fields), *Record renewal*, *Record valuation*, *Add history entry*.
  Everything else is behind a "More details" disclosure that most captures never
  open. The shape is data (`QUICK_EVENT_PRESETS`), so adding a preset is not
  another component.
- **Create** — a responsive progressive flow (`NewAssetForm.tsx`): start with a name
  and a type, then reveal only the fields relevant to that type
  (`asset-form-model.ts`, unit-tested); switching type preserves entered values. Full
  editing lives on the record's Details tab.
- **Subtype icons** — `asset-icons.tsx` maps each type to one stable icon from the
  shared icon set (`~/shared/icons`), with a safe fallback to the Asset entity glyph
  (mirrors the Diary subtype-icon precedent). Icons are `currentColor` (design
  tokens), work in light and dark, and are always paired with text.
- **Search & commands** — `search.ts` registers a real, repository-backed provider
  (title, manufacturer, model, type, location, provider, tags — never sensitive
  fields), resolving `/asset/:id` and participating in PR #69 linked-result boosting;
  `commands.ts` adds Open Assets, New Asset, View Expiring Assets, View Service Due
  Assets and Archived Assets.

---

## 5. Cross-module integration & the Today seam

`AssetRepository.list` with `view: "expiring" | "service_due" | "recent"` remains
the bounded read seam for the date-driven collection views.

**ASSET-02 shipped the Today presence** the ASSET-01 note anticipated, over a
different (and better) seam: `AssetHistoryRepository.listAttention` — ONE bounded,
horizon-limited, workspace-scoped query returning open obligations with the Asset
context and current reading needed to evaluate them. Today calls the shared kernel
evaluator and the shared deduplication rule; it never re-derives obligation state
and never imports the Assets module's internals. See §2e.

---

## 6. Accessibility & mobile

Verified at 320 / 375 / 390 / 430 / 768 / desktop / wide desktop: no horizontal overflow;
long serial numbers, URLs and titles wrap; coarse-pointer touch targets meet the
44px minimum; the collection, forms, tabs and lifecycle are keyboard-operable with
visible focus; status and date meaning is carried by text (never colour alone);
sensitive values are never exposed through an accessible name; axe (WCAG 2.2 AA)
passes in light and dark; Back/Forward and refresh preserve collection filters and
the record tab. Covered by `e2e/assets.spec.ts`, `e2e/assets-mobile-capture.spec.ts`
(ASSET-03) and the shared `e2e/accessibility.spec.ts` / `e2e/responsive.spec.ts`
sweeps.

**Corrected 2026-07-27.** `e2e/assets.spec.ts` asserted the saved manufacturer
with an unscoped `getByText("Toyota")`, which resolves to **two** elements under
Playwright strict mode: the record header's "Make & model" metadata chip and the
Summary tab's identity line. The product is correct — an Asset's make
legitimately appears in both places — so the assertion is now scoped to each of
them explicitly (the `Summary` tab panel and the `Record metadata` list) rather
than relying on accidental text uniqueness. No Assets code changed.

---

## 7. Not implemented (by design)

Deferred to later work (no dead UI ships for any of these) — see
[`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md): real file attachments; R2/object
storage; OCR; barcode/QR scanning; receipt/email ingestion; external subscription
sync; AI extraction; household sharing/permissions beyond current workspace rules.

**ASSET-02 additionally and deliberately excludes:** external vehicle lookup,
registration-authority or insurer integration, automatic market valuations,
accounting, tax depreciation, fleet administration, fuel tracking, GPS tracking,
meter-unit conversion, any notification channel (push, email, Pushover), data
export, and backup or restore. Several are genuinely good future ideas; none is
partially built here.

**ASSET-01's "recurring reminders and automated warranty alerts" is now partly
delivered and partly still out of scope, and the line matters.** Obligations DO
recur, and they DO surface on Today and on the collection when they are due. What
does not exist is any mechanism that reaches the owner when they are not looking at
DalyHub — there is no scheduler, no background job and no notification of any
kind. A renewal is noticed by opening the app, which is the whole reason the
derived state is computed at read time rather than stored.

---

## Related documents

- [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split) — the Assets decision record.
- [`DATA_KERNEL.md`](DATA_KERNEL.md) — entities, workspace scoping, atomic Activity, cursors.
- [`RELATIONSHIPS.md`](RELATIONSHIPS.md) — the Universal Relationship System (Assets are a supported endpoint).
- [`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md) — the shared Activity stream and payload privacy.
- [`PEOPLE_MODULE.md`](PEOPLE_MODULE.md) / [`MEETINGS_MODULE.md`](MEETINGS_MODULE.md) — the supporting-entity pattern Assets follows.
- [`MODULES.md`](MODULES.md) — the module registry.
- [`ACCESSIBILITY_RESPONSIVE.md`](ACCESSIBILITY_RESPONSIVE.md) — the a11y/responsive contract.

---

## Status (2026-07-31, after ASSET-02)

**Current status.** [ASSET-01](../roadmap/ROADMAP_V2.md#-asset-01--asset-record--done) ☑ ·
[ASSET-02](../roadmap/ROADMAP_V2.md#-asset-02--history--renewals--done) ☑ ·
[ASSET-03](../roadmap/ROADMAP_V2_1.md#-asset-03--mobile-assets--delivered-2026-08-08) ☑ (2026-08-08).

**Delivered by ASSET-01.** Assets as first-class entities with a STRICT
`asset_details` slice (migration `0016`); an authoritative workspace-bound
`AssetRepository`; money as integer minor units plus an ISO-4217 code (never a
float); wall-calendar dates compared as integers in the owner timezone; a
controlled-but-extensible type vocabulary with per-type subtype icons; the
`/assets` collection with All / Recently updated / Expiring soon / Service due /
Archived views; the canonical Record Layout; a repository-backed search provider
and five commands.

**Delivered by ASSET-02.** Migration `0025` adds `asset_events`,
`asset_obligations` and the three meter columns on `asset_details`. One canonical
event model covers fourteen categories; one obligation model covers nine, with a
deliberate split between the stored owner lifecycle and the derived urgency state.
Both date-based and meter-based maintenance, with a bounded five-unit meter
vocabulary, no unit conversion, and an honest "reading needed" state. Recurrence
anchored on the day the work was actually done, producing exactly one successor
under retry and concurrency. A documented Task authority contract in which
completing a Task never asserts the work happened. A calm Today attention-rail
signal with a stated deduplication rule. Recorded-cost totals that never claim to
be a cost of ownership and never mix currencies. Value history that refuses to call
two points a trend. An Overview that renders only the facts that apply, six
fast-capture actions, and a bounded obligation signal on every collection card.

**Known limitations (honest).**

- **Nothing reaches the owner outside the app.** There is no scheduler, no
  background job and no notification channel. A renewal is noticed by opening
  DalyHub. This is a deliberate ASSET-02 exclusion, not an oversight — but it is
  the single biggest gap between "tracked" and "reminded".
- **The obligation-state collection filter is applied over the loaded page**, not
  in the Asset list SQL. The state is derived (it depends on the owner-calendar day
  and the current meter reading), so pushing it into the collection query would
  mean duplicating the evaluator in SQL and letting the two drift. The page is
  bounded, so this is cheap and always agrees with the record — but it means the
  filter narrows a page rather than the whole collection.
- **Linked-Task open-state on the obligations tab is resolved for at most 50 Tasks
  per record load.** Beyond that the remainder read as "not open", which is
  conservative (it shows the obligation rather than hiding it) but not exact.
- **Correcting a canonical fact is a Details-tab edit, not a history edit.** The
  forward-only projection is deliberate; the consequence needs teaching, and Help
  now does.
- ~~Mobile completion — phone-first capture of a NEW asset and the type/subtype
  picker at narrow widths.~~ **Delivered 2026-08-08** by
  [ASSET-03](../roadmap/ROADMAP_V2_1.md#-asset-03--mobile-assets--delivered-2026-08-08); see
  [ASSET-03 — phone-first capture](#asset-03--phone-first-capture-2026-08-08)
  below, including why "subtype" was stale wording rather than a missing column.

**Relevant product-debt items.** [DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3) ·
[DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2--resolved-2026-08-16-notify-01) — **resolved 2026-08-16 by NOTIFY-01**, which reads obligations through this module's existing bounded `listAttention` seam and its existing `evaluateObligation`; nothing in Assets changed · [DEBT-58](../product/PRODUCT_DEBT.md#-debt-58--the-assets-obligation-state-filter-narrows-a-page-not-the-collection--p3) · [DEBT-59](../product/PRODUCT_DEBT.md#-debt-59--linked-task-open-state-on-the-asset-obligations-tab-is-resolved-for-at-most-50-tasks--p3--resolved-2026-08-25).

---

## The consistency pass (DS-12 / PX-04 / PX-05 / PX-06, 2026-07-28)

**Lifecycle in the shared overflow.** Archive/Restore and the guarded permanent delete now also
appear in the Record Header overflow (⋯), driving the same handlers as the Settings tab, with
wording derived from the identity map.

**Subtype icons became shared.** `asset-icons.tsx` registers its Asset-type map with the shared
subtype-icon registry instead of keeping a private one; resolution and the safe fallback to the
Asset entity glyph now live in shared code.

See [`DESIGN_SYSTEM.md → Shared overflow menu`](../design/DESIGN_SYSTEM.md#shared-overflow-menu-ds-12),
[`→ Shared record lifecycle`](../design/DESIGN_SYSTEM.md#shared-record-lifecycle-px-04) and
[ADR-053](../decisions/ARCHITECTURE_DECISIONS.md#adr-053-the-shared-overflow-menu-and-one-record-lifecycle-vocabulary).

---

## EDIT-02 — editing moved onto the shared inline system (August 2026)

An Asset's name is edited on the record heading through the shared
`InlineTextField` (read-only while the Asset is archived), posting the same
`rename` intent. The `Rename` header action, the Settings tab's `Name` group and
`RenameAssetForm.tsx` are removed. Every other Asset form — details, events,
obligations — is unchanged: they are multi-field with real validation
dependencies.

The full classification of every editable field in the product, and the reasons
for what was **not** moved, is in
[`EDITING_CONSISTENCY_AUDIT_2026_08.md`](../product/EDITING_CONSISTENCY_AUDIT_2026_08.md).
Passages above that describe a `Rename` action, an `Edit details` panel or a
per-module long-form control describe the surface as it was before that change;
the mutation contracts they document are unchanged.

## Record-screen anatomy (RECORD-01, #131)

The Asset record follows the canonical
[record-screen anatomy](../design/DESIGN_SYSTEM.md#the-record-contract), with
two Asset-specific outcomes.

**The subtype label survives.** Every other record dropped its `typeLabel`
because the breadcrumb already carried it; "Vehicle" is a genuine subtype rather
than the entity type, which is exactly the case the contract keeps it for. The
duplicate "Type: Vehicle" metadata chip and the Overview's repetition of the
type, the make and model, and the status were removed instead — all three were
being stated twice in the record's first 120px. The Overview now opens with the
maintenance and renewal situation, starting with the next relevant obligation.

**History has a real action hierarchy.** Six equally-weighted ghost links
(`Record service … Add history entry`) floating above the filter became: the
asset's *primary* capture exposed in the shared record toolbar, with the other
five in the shared DS-12 overflow. Which one is primary comes from the asset's
own `asset_type` — a serviceable thing leads with **Record service**, a
document, licence, insurance policy, subscription or software with **Record
renewal**. That rule is the pure, unit-tested `primaryHistoryAction`.

---

## ASSET-03 — phone-first capture (2026-08-08)

Creating a NEW Asset is now something you do standing in front of the thing, on a
phone, in seconds. Nothing about the Asset model changed: an Asset is still an
`entity` of type `asset` plus its canonical `asset_details` row, related through
EntityLinks, created only by `AssetRepository.create`.

### "Type/subtype" was stale wording

The roadmap asked for "the type/subtype picker". **DalyHub has no persisted Asset
subtype and none was added.** The schema, `AssetRepository`, the validation layer
and the ADRs carry exactly ONE controlled vocabulary — `asset_details.asset_type` —
and "subtype" is the [PX-05 subtype-icon registry](../design/DESIGN_SYSTEM.md)'s
word for it: an Asset's *type* is the record's subtype, which is why the Asset
record is the one record that kept its `typeLabel` after RECORD-01. Inventing an
`asset_subtype` column to satisfy a phrase would have added data semantics no
product requirement asked for. The requirement the phrase was reaching for —
**choosing the right Asset type on a phone must be easy** — is what was built.

### Asset is a global capture type

`CAPTURE_TYPES` now offers **Task · Diary entry · Meeting · Note · Asset**, so the
global `+` reaches Assets from anywhere. Asset is last: it is the least routine of
the five, and the four record types a life generates hourly keep the top of the
list.

The panel (`app/modules/assets/AssetCapturePanel.tsx`) is deliberately thin — it
renders **the canonical `NewAssetForm`**, the same component `/new/asset` renders,
posting to the same `/assets/create` action. Every other capture panel asks for the
least that can work and offers a "more options" hand-off to the module's fuller
form; Assets needs no such split, because the canonical form already asks only for a
name and a type and reveals the rest progressively. So `fullFormRoute("asset")` is
`null` and the sheet renders no hand-off link rather than one that leads to the same
fields. The panel adds only what the form has no opinion about: the shared
post-capture confirmation (Done · Open asset · Add another) and the remount that
clears the form for the next capture.

It lives in the module rather than in `app/shared/capture` because it *is* Assets'
creation surface; the shared sheet reaches it through a **lazy import**, so the
shell never statically depends on a module and no Asset form enters the initial
bundle.

### The type control: one control, two presentations

`SelectField` gained `sheetOnCompact`. Above `md` the Type field is unchanged — the
DS-16 combobox with type-to-filter, which is the right desktop control and is what
`/new/asset` still uses. Below `md` the same field renders a 44px trigger that opens
the **shared phone `Sheet`** of large option rows.

The reason is specific rather than aesthetic: the anchored listbox is capped at
`16rem`, and inside a capture sheet it opens underneath the software keyboard the
focused text input has just raised, in a scroll container that is already scrolling.
Thirteen options in that space is a poor way to answer "what kind of thing is this?".

The compact presentation keeps every DS-16 rule: the field starts genuinely empty
and shows the placeholder; the prompt is an attribute, never a pickable row; the
whole list is offered every time, so a selection is replaced directly; selection is
`aria-pressed` plus a check, never colour; `controlRef` points at the trigger, so
"jump to the first invalid field" reaches it. No new modal primitive was created —
the sheet is the MOBILE-01 `Sheet`, and the rows are `SheetOptionList`.

**Grouping is presentation only.** `assetTypeOptions()` sorts the thirteen types
under Physical · Documents and cover · Digital and recurring · Anything else,
derived from the same sets that decide which fields a type reveals — so a type
chosen under "Documents and cover" is exactly the one that then asks for an issuer
and a renewal date. No group name is stored, submitted or validated, and a unit test
asserts every kernel key and label survives exactly once.

### What did not change

`newAssetFieldsForType` is untouched: name + type, then the small relevant set,
with the complete slice edited later on the record's Details tab. Switching type
still keeps what was typed and still submits only the FINAL type's fields. The
minimum viable Asset is still a name and a type.

### Two shared defects found and fixed

- **Escape closed two surfaces at once.** Both sheets listen on `document` in the
  capture phase, and `stopPropagation` does not stop other listeners on the same
  node — so dismissing the type picker also dismissed the capture beneath it,
  losing a half-written Asset. `Sheet` now keeps a small open-sheet stack and only
  the topmost sheet acts on Escape; everything below returns without touching the
  event, so the Drawer protection that `stopPropagation` provided is unchanged.
  Regression test: `test/unit/shell/Sheet.test.tsx`.
- **The error summary was a moving target.** Blurring the untouched Name field to
  reach Type rendered the form error summary above the fields, moving the Type
  control ~118px down between finger-down and finger-up: the tap landed on nothing.
  `FormErrorSummary` documents itself as a post-submit affordance, and the New Asset
  form now renders it only when a submit has actually failed. The field's own inline
  error still appears on blur, beside the field, where it moves nothing being aimed
  at. Other forms still surface the summary on blur; converging them is a follow-up,
  not something this item changed under cover of an Assets PR.

### What it costs

Production `pnpm run build`, client JS, measured on the same machine before and
after (chunk hashes stripped, sizes aggregated per name):

| | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Total client JS | 2,104,141 B | 2,110,163 B | **+6,022 B (+0.29%)** |
| Chunks | 202 | 204 | +2 |
| `entry.client` | 182,542 B | 182,542 B | **0** |

The initial bundle is byte-for-byte unchanged. `AssetCapturePanel` is its own
813 B lazy chunk and `NewAssetForm` a 4,276 B one shared with `/new/asset`, so
nothing Asset-shaped loads until someone chooses to capture an Asset. Opening
the capture surface performs **no new reads**: the form needs the type
vocabulary, which is a static kernel constant — no Areas, People, history or
obligations are fetched to create an Asset.

### Proof

[`e2e/assets-mobile-capture.spec.ts`](../../e2e/assets-mobile-capture.spec.ts):
global `+` → Asset at 390px through to a canonical record; a documentary Asset
(insurance) proving the progressive model across very different types; type
switching that reveals the right fields and submits only those; validation that
keeps the words and the surface; cancel with no mutation and focus returned to the
opener; Escape scoped to the type sheet; keyboard-only operation; the type sheet's
grouping, wording and touch targets; axe in light and dark; 320/375/390/430px; and a
1280px desktop regression. Unit coverage sits in `test/unit/assets/` and
`test/unit/forms/select-sheet.test.tsx`; the create boundary is exercised against
real Workers/D1 in `test/kernel/asset-create-route.test.ts`. Nine screenshots —
the chooser, the form before and after a type is chosen for two very different
types, the picker in light and dark, validation, the created record and the
desktop page — were captured to `docs/product/assets/asset-03-2026-08/` by the
opt-in `e2e/assets-mobile-capture-screenshots.spec.ts` (the folder was not committed;
the spec regenerates the set, and the sentence above records what it showed).
