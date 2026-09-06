# ROADMAP_V2_12.md — DalyHub V2.12, FINANCE CORE

> **Read [`AGENTS.md`](../../AGENTS.md) first.** It is the constitution.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the closed record of V2;
> [`ROADMAP_V2_1.md`](ROADMAP_V2_1.md) … [`ROADMAP_V2_8.md`](ROADMAP_V2_8.md)
> hold V2.1 … V2.8; [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md) holds V2.9 INSIGHT
> **and the remaining V2 sequence, V2.13 … V2.16**, which this file does not
> restate and does not replace; [`ROADMAP_V2_10.md`](ROADMAP_V2_10.md) holds
> V2.10 LIFE ADMIN (**complete 2026-09-05**);
> [`ROADMAP_V2_11.md`](ROADMAP_V2_11.md) holds V2.11 EVIDENCE (**complete
> 2026-09-06**).
>
> **This file is V2.12, and it is where new work goes.** It was defined on
> 2026-09-06 against `main` at `bd471f1` (V2.11 EVIDENCE, PR #267) by a pass
> that re-measured the money, obligation, attachment, export, restore, history
> and search code rather than inheriting the PLANNED sketch in
> [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v212--finance-core-planned--gated-on-debt-198).
> Where that sketch and this file disagree, **this file wins**, and every
> disagreement is stated with the measurement that produced it. The durable
> decisions this pass made are
> [ADR-120](../decisions/ARCHITECTURE_DECISIONS.md#adr-120-finance-core--one-signed-money-convention-a-transaction-that-is-a-light-entity-an-occurrence-aware-import-identity-and-balances-that-cannot-be-stored).
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to
> build; this tells you *what*. Status is updated in the PR that changes it. No
> time estimates, no dates on unstarted work.

**Status key.** ☐ not started · ◐ partly delivered · ☑ delivered

**Programme status: V2.12 FINANCE CORE — IMPLEMENTATION COMPLETE; PRODUCTION
ACTIVATION OWNER-GATED.** All five items, FIN-00 … FIN-04, delivered in one
branch and one pull request, as the owner asked. **Real financial data must not
be imported until [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)
closes** — see [The hard gate](#the-hard-gate-debt-198) for exactly what that
means and what remains.

**Successor: V2.13 REPORTS — PLANNED, definition pass next** — see
[`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v213--reports-presumptive). Nothing in
V2.13 is built here. The Finance facts this release computes are deterministic
so a Report can execute over them later, and so V2.14's AI can explain them
without computing one.

---

## The theme: FINANCE CORE — where is my money going?

**DalyHub can tell you what you own, what you have committed to, and what falls
due. It cannot tell you what you spent.** V2.10 gave every recurring commitment
a record and an expected amount; nothing in the product knows whether that
amount was ever paid. V2.11 gave records their paperwork; there is no record for
a receipt to belong to.

The product theme is one sentence: **where is my money going?** Not an
accounting system, not a ledger, not a budgeting philosophy. The smallest
Finance the owner could genuinely begin using:

> I have my accounts. I import my statement. Importing it twice does not
> duplicate anything. I can see the month. I can categorise transactions. I can
> set budgets. I can see account balances and net worth. DalyHub knows which
> obligations are expected to cost money, and when a transaction pays one, the
> two are connected.

That is the whole of V2.12. Everything else is [a non-goal](#non-goals), and the
non-goals are the load-bearing half of the definition.

### What was measured on `bd471f1`

Measured by reading the code, not the documentation, on 2026-09-06.

1. **V2.10 LIFE ADMIN is complete on `main`, and `obligation` is the shared
   due/recurring model.** `migrations/0050_create_obligations.sql` created the
   `obligation_details` STRICT slice beside an ordinary `entities` row, carried
   the `asset_obligations` data across keeping every id, and dropped the old
   table. `obligation_details` already holds `expected_amount_minor`,
   `completed_amount_minor` and one `currency_code`, with a CHECK that a
   completed amount cannot exist on an obligation that was never completed.
   There is **no second recurrence engine anywhere in the repository**, and
   V2.12 adds none: `grep -ril "recurring"` finds Task recurrence
   (`0037`/`0047`), Habit schedules (`0044`) and obligation recurrence
   (`0050`), and Finance uses the third by linking to it rather than by
   copying it.
2. **V2.11 EVIDENCE is merged through PR #267.** `migrations/0052_create_attachments.sql`
   created `attachments` with a REQUIRED `owner_entity_id` behind a composite
   foreign key into `entities (workspace_id, id)` — **any** entity type — and
   `test/unit/architecture/one-attachment-surface.test.ts` enumerates the six
   consumer modules. A transaction becomes attachment-capable by being an
   `entities` row and by adding one name to that list. That test names "a
   Finance receipt widget appearing eight months from now" as the exact drift it
   exists to prevent; this release does not add one.
3. **Finance does not exist, at all.** `grep -ril "finance_"` over `app/`,
   `workers/` and `migrations/` returns nothing. `payee`, `merchant`, `net
   worth` and `reconciliation` return nothing. `budget` returns only the AI
   token budget and Review copy; `transfer` returns only focus transfer and
   drag. `csv` returns only `text/csv` in the attachment media-type allow-list
   and a class name in `segmented-filter.css`. **There is no Finance code to
   extend and nothing to reconcile with.**
4. **Migrations are at head `0052`, 54 files.** V2.12's is `0053` and it carries
   **no owner data**: every table it creates is new and every column it adds to
   `obligation_details` is nullable. It is the first migration since `0050` that
   is not purely additive to one module, and it is still additive.
5. **The money kernel already exists and is sufficient.**
   `app/kernel/money/money.ts` (ASSET-01, ADR-049) parses to integer minor units
   with string arithmetic and no float multiply, validates ISO-4217 codes,
   resolves minor-unit digits through `Intl.NumberFormat`, and caps at
   `MAX_MONEY_MINOR_UNITS = 90_000_000_000_000`. **Finance invents no money
   representation.** What it adds is one thing the kernel does not have: a
   *total over many amounts that may be in different currencies*, which is a
   Finance-shaped question and lands in `app/kernel/finance/finance-money.ts` as
   a currency-grouped total that states its exclusions.
6. **The V2.9 history layer is real and its own contract says where a read
   belongs.** `app/kernel/history/index.ts`: *"The READS live on the repository
   contracts they belong to … because a history read is a read of a store, and
   putting it here would give this slice a second identity as a repository."*
   `app/platform/storage/d1/history-window-read.ts` is the shared *technique* —
   bucket boundaries bound as ONE JSON parameter and expanded with `json_each`,
   because D1 refuses a statement with more than 100 bound variables and a
   per-bucket column would stop at ~48. Finance's month read uses the same
   vocabulary (`bucketWindow`, `buildSeries`, `Series`) and the same technique,
   and does **not** get a private analytics layer.
7. **Export and restore are a mechanical, total contract.** A collection is one
   entry in `SnapshotCollectionRowMap`, one position in
   `SNAPSHOT_COLLECTION_ORDER`, one entry in
   `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, one descriptor in
   `d1-workspace-snapshot-repository.ts`, one descriptor plus one `toRows` arm
   in `d1-workspace-restore-repository.ts`, and identity + referential rules in
   `snapshot-validation.ts`. The map is exhaustive by type, so **a Finance
   collection that is not wired everywhere does not compile.**
8. **`SNAPSHOT_SCHEMA_VERSION` is 2 and does not move.** Adding collections is
   backwards compatible by the contract's own policy; the five new keys join
   `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` so every archive an owner already
   has still validates and still restores.
9. **DEBT-247 is real, is reachable, and its mechanism is not what a reader
   would assume.** `ZIP_MAX_TOTAL_BYTES = 64 MiB` bounds the writer's
   **uncompressed content**; `RESTORE_MAX_CONTENT_BYTES = 64 MiB` bounds the
   reader's, *deliberately equal*; `RESTORE_MAX_ARCHIVE_BYTES = 32 MiB` bounds
   the **compressed archive file** and has no counterpart on the writer at all.
   So the asymmetry is not "64 versus 32": it is that the writer never measures
   the artefact it produced. Four 9 MiB PDFs compress to ~36 MiB and are written
   without complaint. **V2.12 closes it** — see
   [DEBT-247](#debt-247-closed-here-and-why-it-is-proportionate).
10. **DEBT-198 is open, and was re-measured today rather than read.** The
    `Production D1 backup` workflow's most recent run is **#35**
    ([`33984090408`](https://github.com/acedaly/DalyHub-V2/actions/runs/33984090408),
    `schedule`, 2026-09-05T18:26Z), `conclusion: failure`, as are runs 31–34.
    Thirty-five runs, zero successes. The entry's closing condition is unchanged
    and unmet.
11. **Open PRs were inspected before anything was written.** #265 (V2.10 LIFE
    ADMIN close-out), #266 (V2.8 CONV-03 order proof) and #230 (DEBT-173) are
    open against `main`. **None of their content is duplicated here.** No CI
    fix, cleanup or roadmap edit from those branches has been copied; where this
    branch touches a file they also touch, the change is Finance's own.
12. **The `production` R2 bucket `dalyhub-v2-attachments` is still an owner
    action** and is recorded as one at the end of this file. It does not block
    Finance: a transaction may carry evidence, and Finance Core functions
    completely without any transaction carrying a file.

### Where this file disagrees with the PLANNED sketch

The V2.9 sketch is strong and mostly survives. Six changes, each with its
measurement:

| Sketch | This file | Why |
|---|---|---|
| Categories are *"a closed-by-the-owner set with **one level of parent**"* ([strategy §4.4](../product/DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#44-finance--the-first-release-boundary)) | **One level. No parent at all.** | A parent column with no product reading it is a schema field with no product use, which AGENTS.md §9.8 and this pass both refuse. Nothing in V2.12 rolls a child into a parent; the month reads flat categories, the budget is per category, the picker is one list. Adding a parent later is additive. Recorded as a [later item](#later-not-debt), not as debt. |
| A built-in **`transfer` category** and a built-in **`uncategorised` category** | **Neither exists as a category row.** A transfer is `transfer_group_id`; uncategorised is `category_id IS NULL`. | Both were vocabulary standing in for structure. A `transfer` category can be applied to one leg and not the other, which is how spend gets inflated; `transfer_group_id` cannot. An `uncategorised` category row can be renamed, archived or deleted, and every one of those makes "what is uncategorised?" a different question — `NULL` cannot be edited. |
| A transaction carries a **`posted date`** where the file supplies one | **Omitted.** | Nothing in V2.12 reads it. The month is cut by the transaction date, dedup uses the transaction date, the balance is order-independent. A nullable column no code reads is exactly the debt this pass is meant to avoid creating. A mapping that names both columns uses the transaction date and says so in the preview. |
| An account may record a **last four digits** | **Omitted.** | It is a fragment of an account number: a privacy surface with a disambiguation job that `name` and `institution` already do. Cutting it removes the surface entirely rather than protecting it in six places. |
| The suspected cross-file duplicate is *"shown and skipped"* | **Shown, skipped BY DEFAULT, and includable with one control before apply.** | "Skipped" alone loses a genuine transaction the owner can see is genuine. The default is unchanged (nothing suspected is imported unless asked), nothing is ever silently merged, and the owner is not forced to type a row back in by hand. |
| The import ledger is idempotent by *"file hash plus a stable source id or occurrence-aware row fingerprint"* | **Both, as two independent database constraints**, and the ledger's is the one that answers "0 new". | The sketch reads as one mechanism. They are two, they fail differently, and only having both makes the concurrency case correct — see [Idempotency](#idempotency-two-constraints-not-one). |

Everything else in the sketch — the light entity, the occurrence-aware
fingerprint, derived balances, transfers as pairs, `settled_by`, no
recurring-transaction engine, the phone job being categorisation, export before
UI — is adopted as written.

---

## The hard gate: DEBT-198

**The gate is not weakened, reinterpreted or narrowed.**
[DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2)'s
closing condition, verbatim from the entry:

> A scheduled run of `Production D1 backup` completes with `conclusion:
> success`; `pnpm run backup:verify` and `pnpm run db:production:backup:list`
> both report a non-zero result; and a recorded rehearsal decrypts the artefact,
> restores it into a scratch D1, and boots the application against it.

And [`ROADMAP_V2_9.md`](ROADMAP_V2_9.md#v212--finance-core-planned--gated-on-debt-198)
adds the release-level clause: *"the off-Cloudflare encrypted copy exists and
has been restored from once **before the first import**."*

**Measured 2026-09-06: unmet.** Run #35 failed like the thirty-four before it,
at the guard that refuses to export production without an encryption key. The
guard is behaving correctly and nothing here touches it.

**What that means for this release, precisely:**

- V2.12 is **implemented and verified against synthetic data only**. Every
  fixture in this branch is obviously synthetic — `Bank of Synthetica`,
  `NORTHWIND GROCERS`, `SYNTH CAFE 001` — and no real owner financial data
  exists in any commit, test, screenshot or PR body.
- The product **does not import real financial data yet**, and does not pretend
  otherwise. Finance's own empty state and the Settings → Privacy & data page
  both carry one sentence naming the gate and linking the owner action.
- V2.12 is **not marked COMPLETE** in the sense the entry requires. It is marked
  *implementation complete, production activation owner-gated*, which is the
  honest state and is the state the prompt for this work names as acceptable.
- The gate is **owner-held by construction**, as DEBT-198 itself records: a
  session that can write the GitHub secret but has nowhere outside GitHub to
  keep a copy of the key cannot satisfy the entry's own desired state. Nothing
  in this branch generated a passphrase, wrote a secret, dispatched a workflow,
  or routed around `production-d1.mjs` / `production-backup.mjs`.

**What V2.12 *does* contribute to the recoverability story**, because "wait for
the owner" is not the same as "do nothing":

1. Every Finance fact is in the canonical archive in the same item that creates
   its store (FIN-00), before any UI exists.
2. The archive rehearsal is extended to Finance and asserts machine values, not
   row counts: every account balance is **recomputed after restore** and
   compared to the figure the archive stated.
3. [DEBT-247](#debt-247-closed-here-and-why-it-is-proportionate) is closed, so
   DalyHub can no longer write an archive it will refuse to read.
4. `BACKUP_AND_RESTORE.md` gains Finance's restore ordering and the balance
   re-derivation proof, and the residual risk sentence V2.11 wrote is left
   exactly as it is.

---

## The model

### 1. What is a Finance Account?

**An entity.** `entities.type = 'finance_account'`, with a
`finance_account_details` STRICT slice on the `obligation_details` /
`asset_details` pattern. It is an entity because it has identity, a record page,
evidence (a statement PDF belongs to the account), a place in Search, and it
must survive export and restore — every one of which the entity pattern already
supplies and none of which a plain table does.

| Field | Rule |
|---|---|
| `title` (on `entities`) | The owner's name for it. One title, one place. |
| `account_type` | Closed set: `transaction`, `savings`, `credit_card`, `cash`, `loan`, `other`. |
| `currency_code` | **Required.** An account is denominated. ISO-4217, validated. |
| `opening_balance_minor` | **Signed.** Required, defaults to 0. Negative for a card you already owe on. |
| `opening_date` | Required ISO date. The day the opening balance was true. |
| `institution` | Optional, bounded 120. `Bank of Synthetica`. |
| `status` | `open` or `closed`. |
| `import_mapping_json` | The last CSV mapping used for this account, so the owner maps once. Optional, bounded 2 KiB, a closed shape — see [CSV mapping](#the-csv-mapping). |
| `archived_at`, `deleted_at`, `created_at`, `updated_at` | The standard lifecycle. |

**Types this release does not have, and why.** No `investment`: an investment
account is holdings and prices, which is a different model and a market data
dependency. An owner who wants one balance tracked uses `other`; an owner who
wants the *thing* valued already has Assets. No `offset`, no `term_deposit`, no
`mortgage` distinct from `loan` — each would be a word with no behaviour.

**What is never stored on an account:** a bank username, a password, a card
number, an account number, an internet-banking credential, a BSB, an API key, a
feed URL. There are no bank feeds in V2.12 and no place to put a credential if
there were. This is asserted structurally, not merely stated: a schema test
enumerates every Finance column and fails on a new one whose name matches the
credential vocabulary.

### 2. Balance authority

**A balance is DERIVED and cannot be stored.** There is no `balance` column
anywhere in the Finance schema, and a structural test asserts there never is.

```
balance(account) = opening_balance_minor + Σ amount_minor
                   over non-deleted transactions in that account
```

Order-independent, exactly reconstructible, and unable to drift because there is
nothing to drift from. An owner who needs to correct a balance records a
**transaction**, which is auditable, dated and visible — not an invisible edit to
a stored figure. `account_type = 'cash'` is where that happens most, and it is
the same model as everything else.

**A CSV balance column is a check, never an authority.** If the mapping names
one, the import preview compares the file's final balance to the balance the
imported rows would produce and reports the difference in words. It never
writes. A disagreement is information — *"the statement ends at $1,240.18 and
these rows produce $1,198.18, a difference of $42.00"* — and information is the
point.

### 3. What is a Transaction?

**A light entity.** An `entities` row (`type = 'finance_transaction'`, `title` =
the display payee) plus a `finance_transaction_details` STRICT slice.

This is V2.12's first recorded decision and it is decided the way the sketch
proposed, for the reason the sketch gave: the alternative is a second
attachment-linking system. An attachment's owner is an `entities` row; an
obligation's settlement projection is an EntityLink between two `entities` rows;
a Search result needs a stable entity identity. A plain table would need a
parallel mechanism for each.

**What "light" means, enforced:**

- **No Activity per transaction.** Not on create, not on categorise, not on
  edit, not on delete. One import writes one Activity event with counts. A
  structural test asserts the Finance adapter appends Activity for exactly four
  event types and none of them is per-transaction.
- **No record page.** A transaction opens in the shared Drawer. There is no
  `/finance/transactions/:id` document route.
- **No record chrome.** No Activity tab, no Linked-items tab, no summary band.
  The drawer holds: the amount, the account, the date, the payee, the memo, the
  category, the transfer link, the settled obligation, and Evidence.

| Field | Rule |
|---|---|
| `account_id` | Required. Composite FK into the account entity. `ON DELETE RESTRICT`. |
| `occurred_on` | Required ISO date. The date the owner thinks in and the month is cut by. |
| `amount_minor` | Required, **signed**. See [the sign convention](#4-money-and-the-one-sign-convention). |
| `currency_code` | Required. Always equal to the account's, enforced at the boundary, stored so an aggregate reads one table. |
| `source_description` | Required. The bank's raw string, **never destroyed**. |
| `payee_display` | Required. What the owner sees. Editable. |
| `payee_key` | Required. The bounded normalisation — see [payee normalisation](#12-payee-normalisation). |
| `memo` | Optional, the owner's own note, bounded 500. |
| `category_id` | Optional. `NULL` **is** uncategorised. |
| `category_confirmed_at` | Set when the owner chose the category by hand. The suggestion engine learns only from these. |
| `import_id` | Optional. `NULL` means entered by hand. |
| `source_transaction_id` | Optional. The bank's stable id where the file carried one. |
| `fingerprint` | Required. The row's identity within its account — see [Idempotency](#idempotency-two-constraints-not-one). |
| `transfer_group_id` | Optional. Both legs of one transfer share it. |
| `created_at`, `updated_at`, `deleted_at` | Soft delete. No `archived_at` — a transaction is not put away. |

**Deliberately absent:** `cleared`, `reconciled`, `split_parent_id`,
`posted_on`, `exchange_rate`, `running_balance`. Nothing in V2.12 reads any of
them.

### 4. Money, and the ONE sign convention

Money is [ADR-049](../decisions/ARCHITECTURE_DECISIONS.md#adr-049-first-class-assets--the-asset_details-slice-integer-minor-unit-money-and-the-real-world-status-vs-record-archive-split): integer minor units, explicit ISO-4217 code, no float, no
conversion. Finance imports `~/kernel/money` and defines no second
representation. A structural test asserts no Finance file performs floating
arithmetic on a persisted monetary value.

**The sign convention, one sentence, everywhere:**

> **Positive is money IN. Negative is money OUT.**

It holds in the CSV mapping's output, in `amount_minor`, in the balance sum, in
every category total, in the budget comparison, in net worth, and in the UI's
own arithmetic. A bank adapter's job is to *translate into* it, never to invent
its own — a `debit`/`credit` pair becomes one signed amount at the mapping
boundary and nothing downstream knows the file had two columns.

**The consequence that makes credit cards correct with no special case:** an
account's balance is its opening balance plus its transactions, whatever type it
is. A credit card you owe $1,240 on has a balance of **−124000**. A loan has a
large negative balance. Net worth adds every balance. **Liabilities subtract
because their balances are negative, not because a rule flips them** — so there
is no rule to get wrong, and the credit-card double-counting test passes by
construction rather than by vigilance.

Displaying a negative balance on a liability is a phrasing problem, not an
arithmetic one: the account row says `$1,240.00 owing` in words beside the
figure, so nothing is conveyed by a minus sign or a colour alone.

### 5. Spend, income, and refunds

Category rows carry a `kind`: `spending` or `income`. That one field is what
makes every total below structural rather than a name check.

```
Money out (month) = −Σ amount_minor  over non-transfer transactions
                     whose category is a SPENDING category
Money in  (month) = +Σ amount_minor  over non-transfer transactions
                     whose category is an INCOME category
Uncategorised     = reported separately, split into in and out magnitudes,
                    with a count and a link to the queue
```

**Refunds fall out of this and need no model of their own.** A +$50 refund
categorised as Groceries is a positive amount in a spending category, so it
*reduces* Groceries spend and never appears as income. That is the correct
answer, it costs nothing, and it is the simplified rule this release commits to:
a refund is an inflow in a spending category. A refund the owner leaves in an
income category counts as income, which is what they asked for.

**Uncategorised is never folded into either figure.** A month with 40
uncategorised transactions says so, with the magnitudes, rather than quietly
understating spend. That also makes the phone queue the obvious next action
without a nag.

### 6. Transfers

A transfer is **a pair of transactions sharing a `transfer_group_id`**, in two
different accounts, with opposite signs. It is not a category, not a third
transaction type, and not a flag on one row.

**Spend and income exclude any transaction with a non-null
`transfer_group_id`.** That is one predicate in the aggregation, and it is why
paying the credit card from the everyday account cannot become a second $1,000
of spending: the groceries were spent once on the card, and the payment is two
linked rows neither of which is spend.

Pairing is **manual, with deterministic suggestions**. For an unpaired outflow,
the suggestion read returns unpaired inflows in a *different* account with the
exactly opposite `amount_minor`, the same currency, within ±3 days, ordered by
date proximity. The owner confirms. **Nothing auto-pairs**, and there is no AI
anywhere near it.

`linkTransfer` refuses: the same account on both legs, the same sign on both
legs, a leg already in a transfer, a leg that is deleted, and a leg in another
workspace. `unlinkTransfer` clears both legs in one write.

The two legs may be in different currencies (an international transfer). Nothing
compares them, because nothing converts; both are excluded from spend either
way.

### 7. Categories

`finance_categories` is a workspace-scoped table and **not** an entity: it has no
record page, no evidence, no links and no Activity, so the entity pattern would
buy nothing and cost a row in `entities` per category.

| Field | Rule |
|---|---|
| `id`, `workspace_id` | Identity. |
| `name` | The owner's spelling, bounded 60. |
| `name_key` | Case-folded, unique per workspace, so two `Groceries` cannot exist. |
| `kind` | `spending` or `income`. Immutable after creation — changing it would silently rewrite every month it appears in. |
| `is_builtin` | Whether it came from the starter set. Affects nothing but copy. |
| `sort_order` | The owner's order in the picker. |
| `archived_at` | Archived categories keep their history and stop being offered. |
| `created_at`, `updated_at` | — |

**A transaction stores the category's identity, never its text.** Renaming
`Dining` to `Eating out` changes one row and rewrites no history.

**Deletion is defined, and cannot orphan anything.**

- A category **in use** cannot be deleted. The refusal names the count: *"432
  transactions use Dining. Archive it instead, or move them first."*
- A category **not in use** can be deleted.
- **Archiving is always allowed.** An archived category is not offered for new
  categorisation, still appears in historical totals, and its transactions are
  untouched. This is the answer for almost every real case.

**The starter set** is twelve categories — Groceries, Dining, Transport,
Housing, Utilities, Insurance, Health, Entertainment, Shopping, Education, Fees
(spending) and Income (income) — seeded **in the same batch as the first account
the workspace ever creates**, and never again. It is small, unopinionated,
entirely renameable and entirely deletable. A test asserts the second account
seeds nothing.

### 8. Budgets

`finance_budgets`: `(workspace_id, category_id, period_month)` unique,
`amount_minor` ≥ 0, `currency_code`.

- **A budget is one amount, for one spending category, for one month
  (`YYYY-MM`).** Income categories cannot carry one.
- **Budgets do not repeat.** There is no template, no rollover, no envelope and
  no carry-forward. The budget screen for a month offers **"Copy from
  <previous month>"** as one explicit action that writes rows. An owner who
  wants September to differ from August changes September.
- **Variance is words and figures, never a score.** `$420 of $600` ·
  `$180 remaining` · `$75 over`. No percentage-of-health, no grade, no
  gamification, no colour-only state.
- **The budget and the Finance home read the same total.** One function computes
  spend per category per month; both surfaces call it. A test asserts they agree
  on a fixture designed to expose a second implementation (transfers, a refund,
  an archived category, an uncategorised row and two currencies all present).
- **Mixed currency is explicit.** A budget names its currency, and the
  comparison uses only actual spend in that currency, stating any excluded
  amount in the other currencies by name.

### 9. Imports, and the import ledger

An import is **the audited unit**. `finance_imports` records enough to answer
"what happened, and can I reproduce it?" without keeping the owner's bank file:

`id`, `account_id`, `file_name`, `file_sha256`, `file_bytes`, `row_count`,
`added_count`, `skipped_existing_count`, `suspected_count`,
`invalid_count`, `mapping_json`, `imported_at`, `created_at`.

- **The raw CSV is not retained.** Its SHA-256 is. If the owner wants the
  statement kept, they attach it to the account through V2.11 — a decision, not
  a default.
- **One `finance.import.applied` Activity event per applied import**, payload =
  counts and the account id. Never a payee, never an amount, never a row.
- The ledger row is never deleted. It is the audit record.

### Idempotency: two constraints, not one

Two database constraints, doing two different jobs. Both are needed and the
release is explicit that they are separate.

**Constraint A — the ledger.** `UNIQUE (workspace_id, account_id, file_sha256)`.

The same bytes cannot be applied to the same account twice. This is what
produces the product's headline promise: importing the same file again is
refused *before any row is considered*, with **0 new transactions** and the date
of the first import. It is also what makes the concurrency case correct — two
simultaneous applies of one file are two INSERTs into a unique index; one wins,
the loser's whole batch fails atomically and is reported as *"already
imported"*. There is no check-then-insert anywhere in the path.

**Constraint B — the row.** `UNIQUE (workspace_id, account_id, fingerprint)`.

Two *different* files that overlap cannot produce the same transaction twice.
This is the one that matters for the weekly-export workflow, where every file is
new bytes and most rows are not.

The fingerprint has two forms, both scoped to the account:

```
id:<sourceTransactionId>                              when the file carries one
occ:<occurredOn>:<amountMinor>:<payeeKey>:<n>         otherwise
```

**`n` is an occurrence index within the (date, amount, payee) group, and this is
the part that is easy to get wrong.** It is *not* "existing rows plus this row's
position". The algorithm is:

> For each `(occurredOn, amountMinor, payeeKey)` group the file contributes `k`
> rows to, the candidate fingerprints are `n = 0 … k−1`. Each candidate is
> checked against the account. A candidate that already exists is **skipped as
> already imported**; a candidate that does not is **inserted**.

Worked, because the wrong algorithm passes the obvious test and fails the real
one:

| Situation | Candidates | Result |
|---|---|---|
| File A has two identical $12.50 café rows, account empty | `n=0`, `n=1` | both new — **two legitimate purchases survive** |
| File A imported again (constraint A refuses first; if bytes differ, B still holds) | `n=0`, `n=1` | both collide — **0 new** |
| Next week's overlapping export contains the same two rows plus new ones | `n=0`, `n=1` collide; new rows have their own groups | **only the genuinely new rows** |
| A **third** identical café purchase on the same day appears in a later export alongside the first two | `n=0`, `n=1` collide; `n=2` is new | **one new row** — correct |

**The one limitation, stated rather than discovered.** Because `n` is positional
within its group, a file whose window *begins mid-group* under-counts: an export
containing only the third café purchase offers `n=0`, which collides, and the
row is reported as already imported. Three things bound it: most banks supply a
stable transaction id, which bypasses `occ:` entirely; the preview *shows* the
row as already imported rather than hiding it; and the owner can add it by hand.
It is recorded as a [later item](#later-not-debt), and it is the honest cost of
having no bank-supplied identity.

**Soft-deleted rows keep their fingerprint.** A transaction the owner deleted is
not resurrected by a later overlapping import — it is reported as already
imported. Deleting was a decision; silently undoing it would be worse than
saying so.

### Suspected duplicates

Distinct from constraint B, and never confused with it. A candidate row is
**suspected** when it is genuinely new *and* the account already holds a
non-deleted transaction with the same `amount_minor` and the same `payee_key`
whose date is within **±3 days**, *and* the file supplied no stable transaction
id for it (a bank id makes it certain, so it suppresses suspicion).

Suspected rows are **shown in the preview, excluded from the apply by default,
and includable with one control**. Nothing is ever silently merged, and nothing
is silently dropped. The count lands in the import ledger.

This is also the mechanism that catches the manual-entry overlap: an owner who
typed a $40 cash withdrawal by hand and then imported the statement sees it
flagged rather than duplicated.

### Corrections, and what an import may never overwrite

**A re-import can never overwrite anything, because it never updates a row.** An
existing fingerprint is skipped, full stop. There is no `ON CONFLICT DO UPDATE`
anywhere in the Finance adapter, and a structural test asserts it.

What the owner may correct on an **imported** transaction: `payee_display`,
`memo`, `category_id`. What they may not: `occurred_on`, `amount_minor`,
`account_id`, `source_description`, `source_transaction_id`, `fingerprint`.
Those six *are* the import's identity, and letting them move would make an
applied import unreproducible and could silently break dedup.

A **manual** transaction (no `import_id`) is fully editable, and its fingerprint
is `man:<entityId>` — unique by construction, content-independent, and never
matched by an import. That is deliberate: a row you typed and a row the bank
sent are different facts with different provenance, and the suspected-duplicate
signal is where they meet.

If an imported amount or date is genuinely wrong, the owner deletes the row and
enters a correction by hand. The deleted row keeps its provenance and its
fingerprint, so the import stays reproducible and the statement cannot re-add
it. **There is no reversal machinery**: a personal ledger is not double-entry,
and pretending otherwise is the over-design this release refuses.

### 10. Obligation settlement

`obligation_details` gains **one nullable column**,
`settled_by_transaction_id`, with a composite foreign key into the transaction
entity and a unique index so **one transaction settles at most one obligation**.
Beside it, an `obligation.settled_by` EntityLink projection written in the same
batch — exactly the pattern ADR-118 established for the subject, so the reverse
read works with no bespoke reader and no second writer.

**Settlement IS completion.** `completeObligation` gains an optional
`settledByTransactionId`. When present:

- `completed_amount_minor` = the transaction's magnitude (`−amount_minor`),
- `completed_on` = the transaction's `occurred_on`,
- `settled_by_transaction_id` and the link are written,
- and the **existing** recurrence engine creates at most one successor, guarded
  exactly as it already is.

Refusals, each with a named reason: an inflow (a refund cannot pay a bill); a
transaction already settling another obligation; an obligation that is not open;
a transaction in another workspace; a currency that differs from the
obligation's (never converted); a deleted transaction.

**There is no unlink, and this pass changed its own mind by measuring.** The
definition above originally said "reopening an obligation clears the
settlement". It cannot: `ObligationRepository.setStatus` refuses to reopen a
completed occurrence — *"cannot be changed once the obligation is completed"* —
because reopening would orphan its successor and its proof. That is V2.10's
decision, it is right, and V2.12 does not reopen it.

So a settlement is a historical fact, like every other completion in this
product. The sharp edge is stated rather than hidden: an owner who settles with
the wrong transaction has the recovery they have for any wrong completion, which
is to delete the occurrence and record it again. What V2.12 owes that is a
CONFIRMATION rather than a second lifecycle — the settle action states the amount
and the date it is about to record, taken from the transaction, before it records
them.

**Recurrence stays in Obligations. Due dates stay in Obligations.** Finance
reads them. There is no `recurring_transactions` table, no `bills` table, and no
Finance notification — a structural test asserts the Finance module contributes
no notification kind and declares no recurrence.

**Partial and multiple payments are NOT modelled.** One obligation, one
settling transaction. School fees paid in three instalments are three
obligations in a series or one obligation settled by the last payment — both are
expressible today. Splitting settlement is a [later item](#later-not-debt).

### 11. Expected commitments

The Finance home answers *"what known money is due this month?"* by reading
**open, money-bearing obligations with a due date in the month**, grouped by
currency, summing `expected_amount_minor`. It is a deterministic sum of recorded
amounts, not a forecast. Obligations due this month with **no** recorded amount
are listed and counted as *"3 with no amount recorded"* — never inferred, never
estimated, never zero.

### 12. Payee normalisation

Deliberately conservative, and it exists for exactly two jobs: the `occ:`
fingerprint and the previous-category suggestion.

```
uppercase → strip a leading terminal/method prefix from a closed list
          → drop pure-digit and short alphanumeric-with-digits runs
            (card and terminal ids)
          → collapse punctuation and whitespace to single spaces
          → trim → cap at 64 characters
```

`WOOLWORTHS 1234 DUBBO` and `WOOLWORTHS DUBBO NSW` both become
`WOOLWORTHS DUBBO`. That is as far as it goes: **no fuzzy matching, no edit
distance, no merchant directory, no merchant entity, no learning.** Two strings
that normalise differently are two payees, and the owner can rename the display
payee on either.

`source_description` is stored verbatim and is never overwritten, so a better
normalisation in a later release can be re-derived from the original rather than
from a lossy one.

### 13. The deterministic category suggestion

> *Last time, you put SYNTH CAFE in Dining.*

One rule: the **most recent manually-confirmed** category
(`category_confirmed_at IS NOT NULL`) for the same `payee_key` in the same
workspace. It **suggests**; it never applies. The owner accepts with one tap or
key, and accepting is what sets `category_confirmed_at`, so the rule learns only
from decisions the owner actually made.

No AI, no rules engine, no confidence score, no bulk auto-apply. The read is one
grouped statement for the whole visible page, never one per row.

### 14. Searchability and privacy

| Surface | Rule |
|---|---|
| Account | **Searchable by name**, plus its type and institution in the subtitle. **Never a balance.** |
| Transaction | **Explicit query only**, matching `payee_display`. Subtitle is the account name and the date. **Never an amount, never `source_description`, never an excerpt.** |
| Category, budget, import | **Not searchable at all.** They are vocabulary and configuration, not records. |
| Empty-query recency | `finance_transaction` joins `RECENCY_EXCLUDED_TYPES`. A transaction is never volunteered. Accounts *are* listable — an account name is not a confession, and it is the record an owner most wants to re-find. |

Enforced by a Finance search-architecture test that reads the provider source
with comments stripped and fails if any amount-bearing field reaches a result,
if `source_description` is matched or rendered, or if
`finance_transaction` leaves the recency exclusion set.

### 15. Activity, logs and URLs

**Four Finance Activity types**, and the list is the whole list:
`finance.account.created`, `finance.account.updated`,
`finance.account.closed`, `finance.import.applied`. Reopening an account is
`finance.account.updated`; deleting an empty account is `finance.account.updated`
with a lifecycle payload, because an account with transactions cannot be deleted
at all.

**No Activity event carries a monetary value, a payee, a memo or a row.**
`finance.import.applied` carries the account id and five counts.
`finance.account.created` carries the type and the currency code — never the
opening balance. Asserted by a payload test that enumerates every key.

**Logs** carry counts and durations. No payee, no amount, no CSV cell, no
filename. The existing redaction tests are extended to the Finance routes.

**URLs** carry ids and periods: `/finance?month=2026-09`,
`/finance/transactions?account=<id>&category=<id>&uncategorised=1`,
`/finance/accounts/<id>`. No payee text, no amount, no description — a URL is
shoulder-surfable, shareable and logged.

**Today gets nothing.** No card, no balance, no budget bar, no net worth, no
spend chart. Asserted structurally: a test fails if any Today file imports
anything from `~/kernel/finance`, `~/shared/finance` or `app/modules/finance`.

### 16. Attachments

A transaction and an account each become attachment-capable by **existing as an
`entities` row**. The drawer renders the shared `AttachmentsSection`; the account
record renders the shared `attachmentsTab`. `finance` joins the enumerated
consumer list in `test/unit/architecture/one-attachment-surface.test.ts`.

**No `TransactionReceipt`, no Finance file table, no receipt bucket, no second
picker.** The one exception this release makes to that test is stated there and
here: the CSV import screen carries a `<input type="file">`, and it joins
`RestoreFromBackup.tsx` in the file's allow-list for the same reason —
**a CSV is read once and never stored as a file.** It is not an attachment
surface and does not become one.

---

## The CSV parser and mapping

### Why DalyHub writes the parser

[`OPEN_SOURCE_POLICY.md`](../governance/OPEN_SOURCE_POLICY.md) prefers reuse and
this pass took it seriously. The measurement:

- The repository has **no CSV capability today** — `text/csv` appears only as an
  attachment media type.
- The property that matters here is not "parses CSV". It is **bounded**: a hard
  ceiling on bytes, rows, columns, field length and total cells, applied
  *during* the scan so a hostile file cannot be large before it is refused. Every
  general-purpose parser would still need that wrapper, because its own limits
  are advisory or absent.
- The format DalyHub must accept is RFC 4180 plus the two real-world variations
  every bank export has (CRLF, a UTF-8 BOM). That is a ~140-line character
  scanner, not a project.
- There is precedent in this repository for exactly this trade: the export ZIP
  **writer** (`app/platform/export/zip.ts`) and the restore ZIP **reader**
  (`app/platform/restore/zip-reader.ts`) are both hand-written to the published
  format under the same reasoning, and the reader's header states it.

**Decision: one bounded parser in `app/kernel/finance/finance-csv.ts`, no new
dependency**, with the adversarial cases pinned by test: quoted fields, escaped
quotes, embedded commas, embedded newlines, CRLF and LF, a BOM, an unterminated
quote, a ragged row, an empty file, a header-only file, a field at the length
ceiling, a row at the count ceiling, and invalid UTF-8.

### Bounds

| Bound | Value | Why |
|---|---|---|
| File bytes | **2 MiB** | A twelve-month statement is ~100 KB. |
| Rows | **2,000** | Measured against the apply path — see [Cost](#cost-statements-and-bounds). |
| Columns | **64** | Wider than any statement; narrow enough to be a constant-time refusal. |
| Field characters | **512** | A bank description is under 100. |
| Total cells | **rows × columns**, checked during the scan | So a 2,000 × 64 file is refused before it is built, not after. |
| Encoding | UTF-8, optional BOM, `TextDecoder({ fatal: true })` | Invalid bytes are a named refusal, not mojibake. |

**Formula injection.** DalyHub **never writes CSV**, so there is no sink: a cell
beginning `=`, `+`, `@` or a control character is stored as the text it is and
rendered escaped by React. The owner's data is not mangled to defend a hazard
that does not exist here, and the absence of the sink is asserted by a test that
fails if any Finance route sets a `text/csv` content type.

### The CSV mapping

A closed shape. **No expressions, no formula language, no user-supplied SQL, no
regex, no script.**

```ts
{
  v: 1,
  headerRows: 0..5,
  date: <column index>,
  dateFormat: 'iso' | 'dmy' | 'mdy' | 'dmy_dot' | 'dmy_short' | 'd_mon_y',
  description: <column index>,
  amount: { kind: 'single', column, invert: boolean }
        | { kind: 'debit_credit', debitColumn, creditColumn, debitPositive: boolean },
  sourceId: <column index> | null,
  balance: <column index> | null,     // validation only, never written
}
```

**Dates are never guessed.** `03/04/2026` is 3 April under `dmy` and 4 March
under `mdy`, and DalyHub does not decide which by locale, by filename or by
scanning the column for a value above 12. The owner picks the format, the
preview renders the parsed dates in words (`3 April 2026`), and an ambiguous
choice is visible in the first row rather than discovered in December. There is
no owner-locale authority in the repository that could legitimately settle it,
and inventing one to avoid asking is how a year of dates goes silently wrong.

**Sign is never guessed either.** `invert` and `debitPositive` are explicit
controls, and the preview shows the resulting money-in / money-out totals, so a
wrong choice is obvious in the first screen.

**Mapping scope: per account**, stored on `finance_account_details`. That is how
a person actually works — this account, this bank, this format — and it needs no
table. The import screen pre-fills the account's saved mapping; changing it
saves the new one on apply. **The account is always chosen explicitly and is
never inferred from a filename.**

### The import flow

1. **Choose the account.** Explicit, always.
2. **Choose the file.**
3. **Map the columns** — pre-filled from the account's saved mapping when there
   is one.
4. **Preview**, showing: the parsed first rows with their dates in words and
   their signed amounts; totals for money in and money out; the four counts
   (new, already imported, suspected, invalid); each invalid row with its reason
   and its line number; and the balance check when the mapping names a balance
   column.
5. **Apply.** One action. No row-by-row confirmation.

Preview and apply both take the file and both re-derive everything server-side;
the client never sends parsed rows. Apply carries the SHA-256 the preview
reported and is refused if the bytes differ, so an owner cannot preview one file
and apply another.

### Atomicity

**An applied import is all of its included rows or none of them.** One D1
`batch()`, whose statement count does not grow with the row count: the rows
travel as **one bound JSON parameter** expanded with `json_each`, the same
technique `history-window-read.ts` uses and for the same reason — D1 refuses a
statement with more than 100 bound variables, so a per-row or per-column
binding would cap the import at a handful of rows.

Invalid rows are separated in the **preview**, before the apply, and are never
part of the batch. There is no partial import, and there is no "wrote 600 rows
and failed at 601".

---

## Information architecture

**One primary navigation item: Finance, at `/finance`.** In the `more` group at
`navOrder: 210`, so the rail reads Finance → Life Admin → Assets: money, then
paperwork, then things.

**No primary navigation item for Accounts, Transactions, Budgets or Imports.**
Finance owns those routes:

```
/finance                              the home — a month
/finance/accounts/new                 create an account
/finance/accounts/:accountId          the account record
/finance/transactions                 the month's transactions; the uncategorised queue
/finance/budgets                      budgets for a month
/finance/categories                   the vocabulary
/finance/import                       the CSV flow (desktop)
```

**No phone-bar slot.** The three earned phone slots are unchanged for the whole
of V2, exactly as Life Admin decided. Finance reaches the phone through the More
sheet, and the daily-driver phone action — categorising the uncategorised — is
one tap from the Finance home.

**Nothing on Today.** Today answers *what am I doing today?*; Finance answers
*where is my money going?*. Life Admin already surfaces the obligations that
fall due. Asserted by test.

### The Finance home

Deliberately not six cards. In order:

1. **The month**, with previous / current / next and the period in the URL.
   Money in, money out, and the uncategorised count with its magnitudes.
2. **Spending by category** for the month, largest first, each with its budget
   beside it in words where one exists.
3. **Accounts**, each with its derived balance, and one **net worth** figure per
   currency beneath.
4. **Due this month** — money-bearing obligations, summed per currency, with the
   count that have no amount recorded.
5. **Recent imports** — the last few, with their counts.

**The empty state renders less, not zeros.** A workspace with no accounts sees
one sentence and one action: *Add your first account.* With an account and no
transactions: *Import a statement, or add a transaction.* There is no dashboard
of `$0.00` cards, no chart of nothing, and no "0% of budget used".

---

## Cost: statements and bounds

Every figure below is **measured against real D1** in
`test/kernel/finance-statement-budget.test.ts`, at both a small and a large
fixture, and pinned. A read whose count grows with the row count is a failure,
not a note.

| Surface | Statements | Flat at |
|---|---|---|
| Finance home | one page read + one grouped category sum + one account-balance sum + one obligation read + one import read | 10 vs 2,000 transactions |
| Account record | one detail read + one balance sum + one bounded transaction page | 10 vs 2,000 |
| Transactions / uncategorised page | one page read (categories joined) + one count | 10 vs 2,000 |
| Category suggestion for a page | **one** grouped statement for the whole page | 1 vs 50 rows on the page |
| Month aggregation | **one** grouped statement per measure | 1 vs 12 buckets |
| Budget screen | one budget read + one grouped spend read | 1 vs 12 categories |
| Import preview | one existing-fingerprint read + one suspected-window read | 1 vs 2,000 rows |
| Import apply | one batch, **constant** statements | 1 vs 2,000 rows |
| Obligation settlement | the existing completion batch, plus the settlement statements inside it | — |

**No per-transaction category read. No per-transaction account read. No
per-transaction attachment read.** Categories arrive with the row through a
`LEFT JOIN`; balances are one grouped sum; attachment presence is not shown on a
row at all.

### Indexes

Derived from the access paths above, and every one of them is used by a read in
this release. Query plans are asserted in the kernel budget test.

| Index | Access path |
|---|---|
| `(workspace_id, account_id, occurred_on DESC, entity_id)` | the account's transactions, newest first |
| `(workspace_id, occurred_on, entity_id)` | the month, workspace-wide |
| `(workspace_id, category_id, occurred_on)` | a category's month |
| `(workspace_id, deleted_at, category_id, occurred_on)` | the uncategorised queue |
| `(workspace_id, account_id, fingerprint)` **UNIQUE** | dedup, and the concurrency guarantee |
| `(workspace_id, payee_key, category_confirmed_at DESC)` | the deterministic suggestion |
| `(workspace_id, transfer_group_id)` | a transfer's other leg |
| `(workspace_id, import_id)` | an import's rows |
| `(workspace_id, account_id, file_sha256)` **UNIQUE** on `finance_imports` | idempotency, and the concurrency guarantee |
| `(workspace_id, settled_by_transaction_id)` **UNIQUE** on `obligation_details` | one transaction settles at most one obligation |

There is no speculative index. A column with no read has none.

---

## Mixed currency

**Nothing converts. Ever.** There is no exchange-rate table, no rate provider, no
network dependency and no implicit conversion, and a structural test fails on any
Finance file that names one.

Where a single total cannot truthfully be produced, DalyHub produces one total
**per currency** and states what it excluded, in the same shape Assets already
uses:

> `Money out · A$3,412.55` — *and NZ$180.00 in 2 transactions, shown separately
> because DalyHub never converts between currencies.*

That rule holds for the month totals, category totals, budget comparison,
account balances, net worth and expected commitments. A budget in AUD is
compared only to AUD spend, and any spend in another currency in that category is
named rather than folded in or dropped.

---

## Net worth

```
net worth (per currency) =
    Σ balance over every non-deleted account in that currency
  + Σ latest recorded valuation over every non-deleted Asset in that currency
```

- **Liabilities need no rule.** A credit card's or loan's balance is negative,
  so it subtracts.
- **A closed account still counts.** Closing changes what the UI offers, never
  what the arithmetic says. A closed account with a non-zero balance is shown in
  its own section with that balance, because hiding it would silently move the
  figure.
- **An Asset with no recorded valuation is excluded and counted**, never valued
  at zero and never estimated. *"4 assets have no recorded value."*
- **One figure per currency**, never one number across currencies.
- **No historical series.** A net-worth series is a Report and belongs to V2.13.
  V2.12 shows today's figure and its inputs.

**Double counting** is prevented by the boundary rather than by arithmetic: a
bank account is a Finance account, a thing you own is an Asset, and the Finance
home says so in one sentence where net worth is shown. A loan account is the
debt; the house is the Asset; both belong and neither duplicates the other.

The latest-valuation-per-Asset read is **one statement**, added to
`AssetHistoryRepository` — the repository that owns the data — rather than
authored in Finance. Finance never writes Asset SQL.

---

## DEBT-247: closed here, and why it is proportionate

**Does Finance make it materially easier to hit?** Measured, not assumed:
Finance's contribution to an archive is JSON text, and a snapshot is
pretty-printed JSON of highly repetitive records that deflate compresses
extremely well. 10,000 transactions is roughly 4 MB of JSON and well under
500 KB compressed. **Finance is not what reaches 32 MiB; attachments are.**

So the honest answer is that Finance does *not* materially worsen DEBT-247 — and
it is still closed here, for a reason that is about this release rather than
about size:

> V2.12 is the release whose entire gate is recoverability, and it is the
> release that puts a year of financial history into the archive. Shipping it
> while DalyHub can still write a backup it will refuse to read would be
> incoherent with its own acceptance criteria.

**The fix costs no memory budget.** The reader's ceiling is not raised and the
writer's content ceiling is not lowered. Instead the writer, which already holds
the finished archive in memory, **measures the artefact it produced** and refuses
above the reader's own limit:

- `ZIP_MAX_ARCHIVE_BYTES` is defined once, in `app/platform/export/zip.ts`, and
  `RESTORE_MAX_ARCHIVE_BYTES` is **derived from it**, so the two ends cannot
  drift again.
- `createZipArchive` throws `ZipTooLargeError` when the assembled archive
  exceeds it, naming the produced size and the limit.
- The export route's 507 keeps its actionable sentence, now reachable at the
  point where something can still be done about it.

That satisfies DEBT-247's closing condition by its first branch — *"refused at
WRITE time with an actionable sentence"* — and the kernel test the entry asks
for is written and fails against the pre-fix code.

---

## Security

| Requirement | How |
|---|---|
| **Workspace isolation** | Every Finance table carries `workspace_id` in its primary key and in every foreign key. Every repository method is bound to one `WorkspaceContext` and no method accepts a workspace id. A hostile second workspace is tested against **every** Finance read and write — foreign account, transaction, category, budget, import, transfer link, settlement and attachment owner — and the answer is always "not found", never "forbidden", so existence does not leak. |
| **Untrusted input** | The CSV is untrusted: bounded before parsing, bounded during parsing, validated per cell, and never rendered as anything but escaped text. The mapping is a closed shape with integer column indexes and enumerated formats — no expression, no regex, no SQL. |
| **No new secret class** | Bank CSVs carry no credentials; there are no feeds; nothing in the Finance schema can hold one, and a structural test enumerates the columns and fails on a credential-shaped name. |
| **SQL** | Every value is bound. The only generated SQL fragments are column lists and placeholder runs the adapter authors itself; the `json_each` payloads are `JSON.stringify` of application values. |
| **Route boundary** | Every Finance route sits behind the existing authenticate-then-same-origin boundary. The capture token cannot reach any of them. |
| **AI** | `financial` is already a sensitive AI category. V2.12 adds **no** AI: no categorisation, no advice, no summaries, no receipt reading, no explanation. A structural test fails if any Finance file imports the AI kernel. |
| **Least privilege** | No new binding, no new token, no new external call. Finance reads and writes D1 and nothing else; attachments go through V2.11's existing store. |

---

## Work breakdown

### ☑ FIN-00 — Finance authority, and recovery before UI

Migration `0053`. The kernel slice (`app/kernel/finance/`): the account,
transaction, category and budget models; the money total that states its
exclusions; identifiers, cursors, errors and validation; the repository
contract. The D1 adapter. The composition wiring. The two entity identities and
their accents. **And the export/restore integration in this same item, before
any screen exists** — five collections through the snapshot map, the order, the
optional-on-read list, both adapters, the validator's identity and referential
rules, and the Obsidian vault where it is meaningful. The synthetic archive
rehearsal that recomputes every balance after restore.

Also closes DEBT-247, because the recovery item is where it belongs.

### ☑ FIN-01 — Import statements without duplicates

The bounded CSV parser and its adversarial tests. The mapping shape, its
validation and its date formats. The occurrence-aware fingerprint. The preview
(new / already imported / suspected / invalid, with the balance check). The
atomic apply through one `json_each` batch. The import ledger and its single
Activity event. The desktop flow at `/finance/import`. The concurrency proof.

### ☑ FIN-02 — Make the month readable

`/finance`. The month vocabulary over the V2.9 history layer. Spend and income
by category. Derived account balances. Net worth per currency, with the
Asset-valuation read added to the repository that owns it. Budgets and
variance in words. Mixed-currency exclusions everywhere a total appears.

### ☑ FIN-03 — Categorise from the phone

The shared transaction row and the transaction drawer. The uncategorised queue.
The category picker with a keyboard path for every gesture. The deterministic
previous-category suggestion. Categories as a manageable vocabulary. Evidence on
a transaction through V2.11. 320 px, 393 px, 200% zoom, axe.

### ☑ FIN-04 — Settle obligations with transactions

`settled_by_transaction_id` and its projection. Completion with the actual
amount and date from the transaction, through the existing recurrence engine.
Reopening that clears it. Transfers — pairing, suggestions, and the exclusion
that makes the credit-card payment not be spending. Expected commitments on the
Finance home.

---

## Non-goals

Refused for V2.12, and each is a decision rather than an omission:

Open Banking · Plaid / Basiq / any bank feed · bank credentials of any kind ·
OFX / QIF / MT940 · double-entry · an accounting general ledger · invoicing ·
tax preparation · GST/VAT · payroll · investment holdings, share prices or
portfolio analytics · exchange-rate conversion of any kind · split transactions ·
envelope or rolling budgets · budget carry-forward · saved reports · custom
dashboards · scheduled reports · a net-worth series · a financial score, grade or
health percentage · AI categorisation · AI financial advice · AI transaction
summaries · AI reading a receipt · recurring Finance bills separate from
Obligations · a Finance notification of any kind · a Finance phone-bar slot ·
anything on Today · a merchant entity or directory · fuzzy merchant matching ·
cross-account reconciliation · a Finance offline sync engine.

### Later, not debt

These are wishlist items with a place to be recorded, not gaps in what was
built. **None of them is raised as debt**, because missing wishlist features are
not debt:

- **Split transactions.** A second row shape and a second total to reconcile.
- **Partial or multiple settlement** of one obligation.
- **A category parent level**, if the flat list is ever measured as insufficient.
- **A posted date**, if something ever reads one.
- **Import formats beyond CSV** (OFX, QIF), if the owner's banks stop offering
  CSV.
- **Institution presets** for the mapping, once there is evidence of which
  formats recur.
- **The mid-group export limitation** on the `occ:` fingerprint, if a bank that
  supplies no stable id also exports mid-group windows in practice.

---

## Debt

| Entry | Disposition |
|---|---|
| [DEBT-198](../product/PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2) | **Still open, still the hard gate, re-measured today** (run #35, `failure`, 2026-09-05). Owner-held by construction. V2.12 is implemented against synthetic data and does not claim production readiness. |
| [DEBT-247](../product/PRODUCT_DEBT.md#-debt-247--dalyhub-can-write-an-export-archive-it-will-refuse-to-read-back--p2) | **CLOSED by FIN-00.** One constant governs both ends; the writer refuses at the reader's limit with an actionable sentence; the kernel test the entry names is written and fails against the pre-fix code. |
| [DEBT-242](../product/PRODUCT_DEBT.md) — no workspace or account deletion path | **Re-rated as V2.9 asked, and left at P3 on V2.16.** Finance does not make it a prerequisite: the workspace snapshot is complete, restore is destructive-with-replacement, and no Finance data is unreachable without a deletion path. It is re-rated *upward in consequence* — a workspace that cannot be deleted now holds financial history — and that sentence is added to the entry rather than the rating being moved without evidence. |

**No new debt is raised by this release.** Every limitation this pass found is
either fixed here, or is a stated non-goal with a [later item](#later-not-debt)
to point at.

---

## Completion criteria

V2.12 FINANCE CORE is complete when every one of these is true. Each is asserted
by a named test rather than by inspection.

1. A repeated import of the same file yields **0 new transactions** and says so.
2. Two identical legitimate rows in one file both import, and both survive a
   re-import of an overlapping export.
3. An overlapping export adds only the genuinely new rows.
4. A row from another account never collides with one in this account.
5. A re-import never overwrites an owner's categorisation — because it never
   updates a row at all.
6. A credit-card payment from the everyday account is a transfer and is not
   spending; the groceries bought on the card are spending exactly once.
7. Transfers never appear in money in or money out.
8. A hostile second workspace sees nothing, on every Finance read and write.
9. No amount reaches Search, in any field.
10. No amount, payee or CSV cell reaches Activity or a log.
11. A category in use cannot be deleted, and no transaction can be orphaned.
12. Every account balance recomputes identically after export → restore.
13. No balance is stored anywhere.
14. Mixed currencies are never summed; every total states its exclusions.
15. The budget screen and the Finance home produce the same category total.
16. The month is computed through the V2.9 history vocabulary, not a private one.
17. There is no second recurring-commitment model.
18. Settling an obligation creates exactly one successor.
19. A transaction's receipt uses V2.11 with no Finance attachment implementation.
20. The export carries every Finance fact and the restore reproduces every one.
21. DalyHub cannot write an archive it will refuse to read.
22. The uncategorised queue works at 393 px, by keyboard, and passes axe.
23. Nothing Finance appears on Today.
24. No AI touches Finance.
25. The full static, unit, kernel, build and E2E gate is green.
26. **DEBT-198's exact closing condition is satisfied** — *this one is not met,
    is owner-held, and is why the programme status reads "implementation
    complete; production activation owner-gated" rather than "COMPLETE".*

---

## Owner actions

Two, neither of which a session may perform:

1. **DEBT-198.** Set `BACKUP_ENCRYPTION_PASSPHRASE` and the three Cloudflare
   secrets in the protected `production` GitHub environment, after deciding the
   public-repo protection question and after keeping a copy of the key **outside
   GitHub**. Then run the two proofs and the rehearsal.
   [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) has the exact
   sequence. **Real financial data must not be imported until this is done.**
2. **The production attachments bucket.** `dalyhub-v2-attachments` — V2.11's
   outstanding owner action, unchanged. Finance Core functions completely
   without it; a receipt on a transaction needs it.
