# Finance

The module behind `/finance`. It answers one question — **where is my money
going?** — and it is deliberately not an accounting system.

Delivered by [V2.12](../roadmap/ROADMAP_V2_12.md) across FIN-00 (the store, the
migration and the recovery path), FIN-01 (CSV import), FIN-02 (the month and
budgets), FIN-03 (categorisation) and FIN-04 (settling an Obligation with a
Transaction).

> **Finance is implemented and verified against SYNTHETIC data only.** Real
> financial data must not be imported until
> [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)
> closes. See [The gate](#the-gate) below.

---

## What Finance is not

It is not Xero, YNAB, PocketSmith or Microsoft Money. There is no double entry,
no reconciliation workflow, no chart of accounts, no tax treatment, no
investment performance, no bank feed, no forecast and no financial-health score.

There is also **no AI anywhere in Finance**: no AI categorisation, no AI advice,
no AI transaction summaries, no AI reading of receipts, no AI explanation of
spending. Every figure the product shows is a deterministic read that a person
could reproduce by hand, and the suggestion engine is "the last category you
chose for this payee" — a lookup, not a model.

## What it holds

| | What it is | Entity? |
|---|---|---|
| **Account** | where money sits: an everyday account, savings, a credit card, a loan, cash, an offset | yes — record page, Timeline, attachments |
| **Transaction** | one movement, on one day, in one account | yes, but **light** — no record page, opens in the shared Drawer |
| **Category** | the owner's own vocabulary for what money was for | no |
| **Budget** | an intention for one category in one month | no |
| **Import** | the ledger row for one applied CSV | no |

A transaction is an entity because a receipt has to be able to belong to one and
an Obligation has to be able to name one. It is a **light** entity: no record
route, no Activity event of its own, no visual identity of its own — it borrows
the account's accent, because the design system's accent space is full at its
own ΔE 10 perceptibility floor and the lightest entity in the product is the
last thing that should spend a hue
([ADR-120](../decisions/ARCHITECTURE_DECISIONS.md) decision 2).

## One signed money convention

**Positive is money in. Negative is money out.** Everywhere, in every table, in
every read.

Liabilities need no special rule as a result: a credit card you owe $400 on has
a balance of −$400, and it subtracts from net worth because it is negative, not
because a per-type rule says liabilities subtract. There is no `is_liability`
branch in the arithmetic
([ADR-120](../decisions/ARCHITECTURE_DECISIONS.md) decision 1).

The owner never types a minus sign. Every form that takes an amount takes a
**magnitude and a direction control**, and the server composes the sign — a
forgotten minus would otherwise be wrong by twice the figure in every reading
afterwards.

Amounts are integer minor units with an explicit ISO-4217 code
([ADR-049](../decisions/ARCHITECTURE_DECISIONS.md)). **DalyHub never converts
between currencies.** Unlike currencies are never summed: a total is a list of
totals, one per currency, and a figure excluded from a comparison says so in
words.

## No balance is stored

There is no `balance` column, no `setBalance`, no `recalculate` and no balance
parameter anywhere in the repository contract. A balance is
`opening_balance_minor + SUM(amount_minor)`, derived for every account in ONE
grouped statement.

That is not a performance decision, it is a correctness one: a stored balance is
a second answer to a question the transactions already answer, and the two
diverge the first time a write is interrupted. There is nowhere for them to
disagree because there is only one of them
([ADR-120](../decisions/ARCHITECTURE_DECISIONS.md) decision 5).

The account record states the balance **with its inputs** — *$1,240.18 =
$1,000.00 opening + 42 transactions* — so a derived figure is one the owner can
check rather than trust.

## Importing a statement

Export a CSV from the bank, tell DalyHub which column is which, see exactly what
will happen, then apply it. **Importing the same file twice adds nothing**, and
that promise is kept by the database rather than by a check.

Two constraints and one algorithm:

1. `finance_imports (workspace_id, account_id, file_sha256)` is UNIQUE. The same
   bytes into the same account are refused before a single row is considered,
   and reported as *"already imported — 0 new"*.
2. `finance_transaction_details (workspace_id, account_id, fingerprint)` is
   UNIQUE. A row the account already holds cannot be written a second time even
   from a different file.
3. The **fingerprint** is the bank's own transaction id where the file supplies
   one (`src:<id>`), and otherwise an **occurrence-aware** key over the date, the
   amount and the normalised payee (`occ:<date>|<amount>|<payee>|<n>`) — so a
   third identical $12.50 coffee on the same day at the same café imports as a
   third row, because it is one.

A row that *looks* like one the account already holds — same amount, within
three days, but not the same-day-same-payee shape the occurrence index already
resolves exactly — is marked **suspected**, shown, and **excluded by default**.
Including one is an explicit act, per row. Nothing suspected is written unless it
is asked for by name.

The mapping the owner chose is saved on the account for next time. The CSV
itself is parsed, hashed and **discarded inside the request**: nothing reaches
R2, and nothing reaches D1 but the ledger row (file name, byte count, SHA-256,
counts). A statement the owner wants to *keep* is an attachment on the account,
through the shared evidence surface, which is a different control on the same
screen.

## The month

The Finance home answers the product's question for one month:

1. **Money out** and **money in**, per currency.
2. **Spending by category**, largest first, each with its budget beside it in
   words where one exists.
3. **Accounts**, each with its derived balance, and one **net worth** figure per
   currency beneath.
4. **Due this month** — money-bearing Obligations, with the total of what is
   still to pay and the settled ones marked.
5. **Recent imports**, with their counts.

The home and the budgets screen call the **same** read (`monthSummary`), which
is what makes "they agree" a property of the code rather than a rule two screens
have to remember.

**A transfer is a pair, not a category.** Two transactions in different accounts
with opposite amounts are linked as the two legs of one transfer, and both are
excluded from spend by the query — so paying a credit card is not a second
thousand dollars of spending
([ADR-120](../decisions/ARCHITECTURE_DECISIONS.md) decision 4). Candidates are
offered deterministically (unpaired, different account, exactly opposite amount,
same currency, within three days); nothing auto-pairs.

**Budgets do not repeat.** There is no template and no rollover. *"Copy last
month's budgets"* is one explicit action that skips any category this month
already has, so pressing it twice cannot overwrite a budget the owner has since
edited.

The variance is a **sentence with its figures in it** — *$420 of $600 · $180
remaining*, *$675 of $600 · $75 over*, *$600 of $600 · exactly on budget*. No
percentage, no bar that turns red, no score and no financial-health grade.
`exactly on budget` is its own state, because $600 of $600 is not *over*.

## Categorising

`null` **is** uncategorised. There is no `uncategorised` category row, and no
`transfer` category row — a state that is the absence of a value should not be
a value ([ADR-120](../decisions/ARCHITECTURE_DECISIONS.md) decision 4).

Twelve starter categories are seeded once, with the workspace's first account,
and are entirely the owner's from there: rename them, add your own, archive the
ones that stop earning their place.

- **Archiving** is always allowed and never touches a transaction.
- **Deleting** a category in use is refused, and the refusal names the count —
  *"432 transactions use Dining"* — because "you can't do that" is not an
  answer. A category with no transactions deletes. **No transaction is ever
  orphaned, in either branch.**
- **`kind` cannot change.** Flipping Groceries from money-out to money-in would
  rewrite every month it appears in, turning historical spend into historical
  income with no record that anything happened.

The **suggestion** is the most recent category the *owner* confirmed for the
same payee key, read for a whole page in one grouped statement. It suggests;
nothing applies it. It learns only from decisions the owner actually made — a
suggestion nobody accepted teaches it nothing.

## Settling an Obligation

Finance has **no recurring-commitment model**. A money-bearing recurring
commitment is an Obligation, which is
[ADR-116](../decisions/ARCHITECTURE_DECISIONS.md) decision 1 and is unchanged.
There is no second "bill due" notification, because Life Admin already sends the
first.

What V2.12 adds is the link that says *which transaction paid it*:
`obligation_details.settled_by_transaction_id`, one nullable column with a
partial unique index, and an `obligation.settled_by` EntityLink projection
written in the same batch.

**Settlement is completion.** There is no separate link/unlink lifecycle:
completing an Obligation may name a transaction, and then the amount and the
date come from the bank rather than from the owner — the kernel *refuses* a
typed amount or date beside a settlement, because two sources for one figure and
no rule for which wins is how a ledger starts disagreeing with itself.

Five named refusals: a transaction that is not in this workspace (reported as
one that does not exist, so existence does not leak), money coming in, one that
already settles another obligation, one in a different currency, and a
deployment with no gateway wired.

**There is no unsettle**, and that follows from V2.10 rather than from a choice
made here: a completed Obligation cannot be reopened. The recovery from settling
the wrong transaction is to delete the occurrence and record it again — so the
settle control states the amount and the date it is about to record, from the
transaction, before it records them.

### The dependency runs one way

Finance implements `ObligationSettlementGateway` and therefore knows about
Obligations. **Life Admin never joins a Finance table.** The settle control
lives on the Finance home for that reason, and because it is where the owner is
when the question occurs to them — here is the electricity bill, here is the
$182.40 that left the account, those are the same event. The *write* is still
the Obligation's own endpoint.

## Privacy

Finance holds the most concentrated personal record in the product, and the
boundaries are structural rather than advisory.

- **No credentials, ever.** There is no column, field or form input for a bank
  username, a password, a card number, a BSB, an account number or an internet
  banking login. There are no bank feeds in V2.12, and there would be nowhere to
  put a credential if there were.
  `test/unit/architecture/finance-boundaries.test.ts` asserts it over the schema
  rather than trusting it.
- **Search matches accounts by name and transactions by the DISPLAY payee
  only** — never an amount, never a balance, never the bank's raw description,
  never a memo, and nothing at all for an empty query. A transaction is also in
  `RECENCY_EXCLUDED_TYPES`, so it is never volunteered before the owner has
  typed something. `test/unit/finance/search-privacy.test.ts` asserts this
  against the provider's own source with comments stripped.
- **The URL carries ids and periods and nothing else** — `?month=2026-09`,
  `?account=<id>`, `?uncategorised=1`. No payee text, no amount, no
  description. A URL is shoulder-surfable, shareable and logged.
- **No amount reaches an Activity payload.** Four Finance events exist — an
  account's lifecycle, and one per applied import carrying counts. There is no
  event per transaction: it would double an import's write volume and fill the
  feed with a fact nobody reads.
- **No broad log carries a row.** No full account number, amount, payee or CSV
  line reaches `console`.

## Export and restore

Every Finance table is in the workspace snapshot, and the restore rehearsal in
`test/kernel/finance-archive-rehearsal.test.ts` proves the whole journey: seed
three accounts in two currencies with a real applied import, categories, a
budget, a transfer pair, a settled money-bearing Obligation and a receipt;
export; **destroy the workspace**; restore; then compare every machine value
read *through the product's own repository*, with balances recomputed on both
sides. Re-importing the same statement after the restore still reports *0 new*,
because the ledger came back with it.

`SNAPSHOT_SCHEMA_VERSION` is unchanged at 2: adding collections is backwards
compatible, and `SnapshotCollectionRowMap` is exhaustive-by-type, so a Finance
table nobody wired would not compile.

## The gate

[DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)
— DalyHub has no automated backup outside the Cloudflare account. Re-measured
2026-09-06: **35 runs, 0 successes.**

Finance is complete in implementation and **not complete in acceptance**. The
remaining action is the owner's: four secrets on the GitHub `production`
environment, one green AUDIT-11 run, and one restore *from that artefact*. Until
then the product works and should be exercised with synthetic data, and a real
bank statement should not be imported into it.

---

## Related documents

- [`ROADMAP_V2_12.md`](../roadmap/ROADMAP_V2_12.md) — the definition, the 23
  product-design answers and the completion criteria.
- [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) —
  ADR-120 (Finance), ADR-116 (one obligation model), ADR-119 (attachments),
  ADR-049 (money).
- [`LIFE_ADMIN_MODULE.md`](./LIFE_ADMIN_MODULE.md) — the Obligations a
  settlement completes.
- [`ATTACHMENTS.md`](./ATTACHMENTS.md) — the evidence surface a statement or a
  receipt uses.
- [`EXPORT_AND_PORTABILITY.md`](./EXPORT_AND_PORTABILITY.md) — the snapshot
  Finance is part of.
