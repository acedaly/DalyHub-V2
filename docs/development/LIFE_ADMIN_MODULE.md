# Life Admin (obligations)

The module behind `/obligations`. It answers one question — **what do I need to
deal with?** — for everything with a date on it that is not a task: a
registration, an insurance renewal, a tax return, a subscription, a service, a
warranty, a licence.

Delivered by [V2.10](../roadmap/ROADMAP_V2_10.md) across LIFE-00 (the domain),
LIFE-01 (the store and the migration) and LIFE-02 (this surface).

---

## What an obligation is, and what it is not

An **obligation** is a commitment with a due fact — a date, a meter target, or
both — that the owner has to do something about. It is a first-class record: it
has an `entities` row, an id, a title, a Timeline, Linked items and a URL.

It is **not a Task**, and the distinction is load-bearing:

| | Task | Obligation |
|---|---|---|
| What it is | a thing the owner will DO | a thing that FALLS DUE |
| Who creates it | the owner, always | the owner, or the previous occurrence |
| Completion | ticking it off IS the completion | ticking it off is not proof the work happened |
| Recurrence | the Task engine | the obligation engine, anchored on the day the work was done |
| Lives in | the spine | beside it, about anything or about nothing |

A Task may be **linked** to carry an obligation ("book the pink slip"), and the
obligation stays authoritative for the date. Completing that Task does not
complete the obligation: the obligation asks for what actually happened, and
says so plainly on the row.

## The subject is a FIELD, not a parent

An obligation may be **about** something — an Asset, a Person, a Project, an
Area — or about nothing at all, which is the ordinary case and the whole reason
V2.10 exists. A passport renewal is about no asset; before V2.10 the only way to
record one was to invent an Asset to hang it from.

The authority is `obligation_details.subject_entity_id`, a nullable composite
foreign key. Beside it the repository writes an `obligation.subject`
[EntityLink](../decisions/ARCHITECTURE_DECISIONS.md) as a **projection**, in the
same transaction, so the generic reverse reads work
([ADR-118](../decisions/ARCHITECTURE_DECISIONS.md) decision 1). That link is
excluded from the generic link picker and from Linked Items: the foreign key is
the authority, and a second writer is how two representations of one
relationship come to disagree.

**V2.10 does not offer moving an obligation to a different subject.** Its
completion proof lives in the old subject's own history, so a move would orphan
what it points at; the honest answer is a new obligation.

## The collection, and the bands it groups by

`/obligations` is ordered by WHEN and grouped into five bands
([D10](../roadmap/ROADMAP_V2_10.md)):

**Overdue · This week · This month · Later · Done**

- `overdue` is its own band rather than folded into "this week": the evaluator's
  most urgent state is the one an owner most needs to keep distinct.
- A **meter obligation awaiting a reading** bands with overdue. It cannot be
  placed on a calendar at all, and burying it would hide the one row that needs
  the owner to go and read a number.
- The windows **roll** (seven days, thirty-one) rather than following the
  calendar, so "this week" says the same thing on a Friday as on a Monday.
- **Status is a filter, not a band.** The default lens is open work; on hold,
  dismissed and completed are one control away, and choosing them changes the
  bands too — the Done band exists only when the owner asked to see finished
  work.

Each heading carries the count of its band **across the whole collection**, not
of the loaded page. That count comes from `countByBand`: one grouped statement
before pagination. The band rule lives in the kernel
(`app/kernel/obligations/obligation-band.ts`); the SQL binds ITS boundaries from
that same function, and `test/kernel/obligations.test.ts` asserts the counts
equal the kernel's over the same rows.

## One row, one form, one mutation path

| Surface | What it draws |
|---|---|
| `/obligations` | `ObligationRow` in bands |
| `/obligations/:id` | the record; the completion form opens INLINE in the fold |
| An Asset record's Obligations tab | the SAME `ObligationRow`, banded the same way |

All three live in [`~/shared/obligations`](../../app/shared/obligations/index.ts)
and all three post to `/obligations/:id/mutate`. Before V2.10 LIFE-02 the Assets
module drew its own row, serialised its own shape and posted to
`/asset/:id/history` — two rows and two mutation paths for one record, which is
the fork [ADR-115](../decisions/ARCHITECTURE_DECISIONS.md) exists to prevent.

The Asset tab keeps ONE difference, deliberately: settled work stays behind its
disclosure rather than banding, because that tab shows everything about one
Asset at once and a dismissed rego from March under "Overdue" would put settled
work at the top of the section that exists for live work. Its band counts are
therefore taken over OPEN obligations only — the bands hold open work, and a
heading has to count the list underneath it.

## Money

An obligation may carry an **expected** amount and, at completion, an **actual**
one. Both are integer minor units beside an explicit ISO-4217 code, and nothing
is ever converted ([ADR-049](../decisions/ARCHITECTURE_DECISIONS.md)).

An amount is **not** a payment. V2.10 has no settlement, no balance and no
transaction; recording what something cost is a fact about what happened, never
a claim that anything was reconciled.

The completion form offers the actual amount on **every** obligation and
requires it on none. Offering it only where an expectation was already recorded
reads tidy and loses a fact: completion is the moment the real figure is known,
and on an Asset the same field is what carries the cost onto the Asset's own
history.

Where an amount may appear, and where it may never:

| Surface | Amount |
|---|---|
| The obligation record | **yes** — the owner went there to look |
| The Asset record's Obligations tab | yes (the comfortable row) |
| The Life Admin collection row | **no** — a collection is glanced at |
| Search results, titles, subtitles, excerpts | **never**, and never matched |
| Activity payloads and descriptors | **never** (ADR-049 decision 5) |
| Notifications, telemetry, logs | **never** |

The `MoneyField` ([`~/shared/forms`](../../app/shared/forms/index.ts)) is the one
control for an amount: one label, one help line, one error slot, and the
currency beside the amount rather than two sections away.

## Today, and the digest

One obligation needs the owner today whether it is about an Asset, a Person, or
nothing at all — so Today's **Needs attention** rail carries the whole set, and
the daily digest states the same fact in the same words.

- **One row, not a second card.** Several obligations collapse into one *Life
  admin* row pointing here; exactly one names itself and leads to its own
  record.
- **The subject leads where there is one.** "Ute — Renew registration: due in 14
  days"; "Lodge the tax return: due in 9 days" where there is not.
- **An open linked Task wins.** The obligation steps aside and the row SAYS so
  ("1 tracked as a task") rather than dropping it. The moment the Task is
  completed, cancelled or deleted, the obligation is back — which is exactly the
  "you ticked the task, now record what actually happened" moment.
- **Notifications** fire at three fixed rungs, 30 / 7 / 1 days, once each and
  deduped forever by `obligation:<id>:<rung>`. No amount reaches any of them.

None of this is a reminder engine, a second Today card, per-obligation
notification settings, quiet hours or a time of day. See
[`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md#obligations-on-today-asset-02-widened-by-v210-life-03)
and [`NOTIFICATIONS.md`](NOTIFICATIONS.md).

## Search

One provider, matching **title, category label and subject title** — nothing
else ([D11](../roadmap/ROADMAP_V2_10.md)). The description is body content,
reachable only under the explicit-query boundary
([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md) decision 2), so this provider
does not reach it at all; the amount is not in the predicate and never will be.

Both refusals are asserted rather than promised — in
`test/kernel/obligations.test.ts` at the repository, and in
`e2e/life-admin.spec.ts` through the surface an owner actually uses.

## The read budget

Two statements a page, whatever it returns:

1. the rows, with the subject, the subject's current meter reading and the
   linked-Task state resolved in the SAME statement;
2. the band counts over the whole collection.

The meter rides on the subject projection because it is needed exactly where the
subject is; a second read per Asset subject would be the N+1 every collection in
this product is written to avoid.
`test/unit/obligations/obligation-query-bounds.test.ts` asserts it at source.

## Where the code is

| Layer | Path |
|---|---|
| Domain (pure) | [`app/kernel/obligations`](../../app/kernel/obligations/index.ts) |
| Storage | [`d1-obligation-repository.ts`](../../app/platform/storage/d1/d1-obligation-repository.ts) |
| The one bounded read | [`obligation-facts.server.ts`](../../app/platform/obligations/obligation-facts.server.ts) |
| Row, list, forms, view-model | [`app/shared/obligations`](../../app/shared/obligations/index.ts) |
| The module | [`app/modules/obligations`](../../app/modules/obligations/module.ts) |
| The table | [`migrations/0050_create_obligations.sql`](../../migrations/0050_create_obligations.sql) |

## Deliberately not built

A Life Admin dashboard. A second Today card. A calendar. Any total of what the
year will cost. An amount on Today. A phone-bar slot. A capture-grammar token.
Attachments — an obligation points at a Note for its receipt, and the document
store is a later programme's.

## Related

- [`ROADMAP_V2_10.md`](../roadmap/ROADMAP_V2_10.md) — the programme, its
  decisions and its acceptance.
- [`ASSETS_MODULE.md`](ASSETS_MODULE.md) — the Assets record, whose Obligations
  tab is a lens over this store.
- [`NOTIFICATIONS.md`](NOTIFICATIONS.md) — the due-date digest.
- [`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md) — the `obligations`
  snapshot collection and the retired `assetObligations` one.
