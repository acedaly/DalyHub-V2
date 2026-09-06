-- Migration number: 0053 	 2026-09-06
--
-- V2.12 FIN-00 -- FINANCE CORE: where is my money going?
--
-- See ADR-120 (what the V2.12 definition pass decided) and
-- docs/roadmap/ROADMAP_V2_12.md. This migration is forward-only and it carries
-- NO existing data: there is no Finance anywhere in DalyHub today. Measured on
-- `main` at bd471f1 -- `grep -ril "finance_"` over app/, workers/ and
-- migrations/ returns nothing, as do `payee`, `merchant`, `net worth` and
-- `reconciliation`.
--
-- Every column added to `obligation_details` is NULLABLE, so the one table this
-- migration touches that already holds owner data is only widened.
--
-- ## What is deliberately NOT here
--
-- There is NO `balance` column, on any table, and there never will be
-- (ADR-120 decision 5). An account's balance is its opening balance plus the
-- sum of its transactions -- order-independent, exactly reconstructible, and
-- unable to drift from transaction truth because there is nothing to drift
-- from. `test/unit/architecture/finance-boundaries.test.ts` asserts the absence
-- rather than trusting it.
--
-- There is NO recurring-transaction table and NO bills table. A money-bearing
-- recurring commitment is an Obligation (ADR-116 decision 1, unchanged). This
-- migration adds ONE nullable column to `obligation_details` so an obligation
-- can name the transaction that settled it, and nothing else.
--
-- There is NO credential column of any kind -- no username, no password, no
-- account number, no BSB, no card number, no token, no feed URL. There are no
-- bank feeds in V2.12 and no place to put a credential if there were.
--
-- There is NO exchange rate and NO converted amount. Totals over unlike
-- currencies are produced per currency and state their exclusions.
--
-- ## The sign convention, which the CHECK constraints below rely on
--
--   POSITIVE is money IN. NEGATIVE is money OUT.
--
-- It holds in the CSV mapping's output, in `amount_minor`, in the balance sum,
-- in every category total, in the budget comparison and in net worth. A credit
-- card the owner owes $1,240 on has a balance of -124000, and net worth adds
-- every balance -- so LIABILITIES SUBTRACT BECAUSE THEIR BALANCES ARE NEGATIVE,
-- not because a rule flips them. There is no per-type sign rule to forget, which
-- is what makes the credit-card double-count structurally impossible rather
-- than merely tested for.

-- ---------------------------------------------------------------------------
-- 1. The account.
-- ---------------------------------------------------------------------------
--
-- An ENTITY -- an ordinary `entities` row plus this additive STRICT slice, on
-- the `obligation_details` / `asset_details` pattern. It is an entity because it
-- has identity, a record page, evidence (a statement PDF belongs to the
-- account), a place in Search, and it must survive export and restore. The
-- entity pattern supplies every one of those and a plain table supplies none.
--
-- The TITLE lives on the entity, not here: one title, one place.

CREATE TABLE finance_account_details (
  workspace_id          TEXT NOT NULL,
  entity_id             TEXT NOT NULL,
  entity_type           TEXT NOT NULL DEFAULT 'finance_account',
  -- The closed set V2.12 can meaningfully support. `investment` is deliberately
  -- absent: holdings and prices are a different model with a market-data
  -- dependency, an owner who wants one balance tracked uses `other`, and an
  -- owner who wants the THING valued already has Assets.
  account_type          TEXT NOT NULL,
  -- REQUIRED. An account is denominated, and an amount with no currency is a
  -- number rather than money (ADR-049).
  currency_code         TEXT NOT NULL,
  -- SIGNED, and required. Negative for a card the owner already owes on.
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  -- The day the opening balance was true as at.
  opening_date          TEXT NOT NULL,
  institution           TEXT,
  status                TEXT NOT NULL DEFAULT 'open',
  -- The last CSV column mapping used for THIS account, so the owner maps once
  -- per bank rather than once per file. A closed shape validated in the kernel:
  -- integer column indexes and enumerated formats, never an expression, a
  -- regex, a formula or a SQL fragment.
  import_mapping_json   TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  archived_at           TEXT,
  deleted_at            TEXT,
  CONSTRAINT finance_account_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT finance_account_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT finance_account_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT finance_account_entity_type CHECK (entity_type = 'finance_account'),
  CONSTRAINT finance_account_type_valid CHECK (
    account_type IN (
      'transaction', 'savings', 'credit_card', 'cash', 'loan', 'other'
    )
  ),
  CONSTRAINT finance_account_currency_shape CHECK (length(currency_code) = 3),
  CONSTRAINT finance_account_opening_bounded CHECK (
    opening_balance_minor BETWEEN -90000000000000 AND 90000000000000
  ),
  CONSTRAINT finance_account_opening_date_shape CHECK (length(opening_date) = 10),
  CONSTRAINT finance_account_institution_bounded CHECK (
    institution IS NULL OR length(institution) <= 120
  ),
  CONSTRAINT finance_account_status_valid CHECK (status IN ('open', 'closed')),
  CONSTRAINT finance_account_mapping_bounded CHECK (
    import_mapping_json IS NULL OR length(import_mapping_json) <= 2048
  ),
  CONSTRAINT finance_account_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT finance_account_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT finance_account_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- Access path: the accounts list on the Finance home and the account picker --
-- the whole workspace's live accounts, in creation order.
CREATE INDEX finance_account_details_live
  ON finance_account_details (workspace_id, deleted_at, status, entity_id);

-- ---------------------------------------------------------------------------
-- 2. The category vocabulary.
-- ---------------------------------------------------------------------------
--
-- NOT an entity: a category has no record page, no evidence, no links and no
-- Activity, so an `entities` row would buy nothing and cost one row per
-- category. It is structure, not tags (ADR-113's non-goal), and it is ONE LEVEL
-- -- there is no parent column, because nothing in V2.12 rolls a child into a
-- parent and a column no code reads is the debt this release refuses to create.
--
-- `kind` is what makes "income is not spending" and "a refund reduces spend"
-- STRUCTURAL rather than a name check. It is immutable after creation: changing
-- it would silently rewrite every month the category appears in.
--
-- There is NO `transfer` category and NO `uncategorised` category (ADR-120
-- decision 4). A transfer is `transfer_group_id` on both legs, which cannot be
-- half-applied the way a category can. Uncategorised is `category_id IS NULL`,
-- which cannot be renamed, archived or deleted the way a row can.

CREATE TABLE finance_categories (
  workspace_id TEXT NOT NULL,
  id           TEXT NOT NULL,
  -- The owner's own spelling.
  name         TEXT NOT NULL,
  -- Case-folded, unique per workspace, so two `Groceries` cannot exist.
  name_key     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  is_builtin   INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived_at  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CONSTRAINT finance_categories_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT finance_categories_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT finance_categories_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT finance_categories_name_bounded CHECK (
    length(trim(name)) > 0 AND length(name) <= 60
  ),
  CONSTRAINT finance_categories_name_key_bounded CHECK (
    length(name_key) > 0 AND length(name_key) <= 60
  ),
  CONSTRAINT finance_categories_kind_valid CHECK (kind IN ('spending', 'income')),
  CONSTRAINT finance_categories_builtin_flag CHECK (is_builtin IN (0, 1)),
  CONSTRAINT finance_categories_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT finance_categories_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT finance_categories_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;

-- One spelling of one word per workspace. The database refuses the second
-- `Groceries`. The kernel produces the readable message.
CREATE UNIQUE INDEX finance_categories_name_key
  ON finance_categories (workspace_id, name_key);

-- Access path: the picker and the categories screen -- live categories in the
-- owner's order.
CREATE INDEX finance_categories_live
  ON finance_categories (workspace_id, archived_at, sort_order, id);

-- ---------------------------------------------------------------------------
-- 3. The import ledger.
-- ---------------------------------------------------------------------------
--
-- An import is the AUDITED UNIT. This row records enough to answer "what
-- happened, and can I reproduce it?" WITHOUT retaining the owner's bank file:
-- the hash is kept, the bytes are not. An owner who wants the statement kept
-- attaches it to the account through V2.11 -- a decision, not a default.
--
-- ONE Activity event per applied import, carrying the account id and the five
-- counts. Never a payee, never an amount, never a row.

CREATE TABLE finance_imports (
  workspace_id           TEXT NOT NULL,
  id                     TEXT NOT NULL,
  account_id             TEXT NOT NULL,
  -- The owner's own filename, stored verbatim within the bound. Never
  -- interpolated into a path, a header or an object key -- nothing here writes
  -- a file.
  file_name              TEXT NOT NULL,
  -- Lowercase hex SHA-256 of the exact bytes that were applied.
  file_sha256            TEXT NOT NULL,
  file_bytes             INTEGER NOT NULL,
  row_count              INTEGER NOT NULL,
  added_count            INTEGER NOT NULL,
  skipped_existing_count INTEGER NOT NULL,
  suspected_count        INTEGER NOT NULL,
  invalid_count          INTEGER NOT NULL,
  -- The mapping actually used, so an applied import is reproducible from the
  -- same file. The same closed shape as the account's saved mapping.
  mapping_json           TEXT NOT NULL,
  imported_at            TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  CONSTRAINT finance_imports_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT finance_imports_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT finance_imports_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT finance_imports_file_name_bounded CHECK (
    length(trim(file_name)) > 0 AND length(file_name) <= 200
  ),
  CONSTRAINT finance_imports_sha_shape CHECK (length(file_sha256) = 64),
  CONSTRAINT finance_imports_bytes_bounded CHECK (
    file_bytes > 0 AND file_bytes <= 2097152
  ),
  CONSTRAINT finance_imports_counts_nonneg CHECK (
    row_count >= 0 AND added_count >= 0 AND skipped_existing_count >= 0
    AND suspected_count >= 0 AND invalid_count >= 0
  ),
  CONSTRAINT finance_imports_mapping_bounded CHECK (
    length(mapping_json) > 0 AND length(mapping_json) <= 2048
  ),
  CONSTRAINT finance_imports_imported_at_not_empty CHECK (length(imported_at) > 0),
  CONSTRAINT finance_imports_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT finance_imports_account_fk
    FOREIGN KEY (workspace_id, account_id)
    REFERENCES finance_account_details (workspace_id, entity_id) ON DELETE RESTRICT
) STRICT;

-- THE IDEMPOTENCY CONSTRAINT, half one (ADR-120 decision 3). The same bytes
-- cannot be applied to the same account twice. This is what produces "0 new
-- transactions" BEFORE any row is considered, and it is what makes two
-- concurrent applies of one file correct: one INSERT wins, the loser's whole
-- batch fails atomically and is reported as already imported. There is no
-- check-then-insert anywhere in the path.
CREATE UNIQUE INDEX finance_imports_file_key
  ON finance_imports (workspace_id, account_id, file_sha256);

-- Access path: an account's import history, and the Finance home's recent list.
CREATE INDEX finance_imports_recent
  ON finance_imports (workspace_id, account_id, imported_at DESC, id);

-- ---------------------------------------------------------------------------
-- 4. The transaction.
-- ---------------------------------------------------------------------------
--
-- A LIGHT ENTITY (ADR-120 decision 2): an ordinary `entities` row whose title is
-- the display payee, plus this slice. It is an entity ONLY because three things
-- need a stable entity identity and each already exists -- an attachment's owner
-- is an `entities` row (ADR-119 d1), an obligation's settlement projection is an
-- EntityLink between two `entities` rows (ADR-118 d1), and a Search result needs
-- an entity id. A plain table would need a parallel mechanism for each, and the
-- first of those is the "Finance receipt widget" that
-- test/unit/architecture/one-attachment-surface.test.ts exists to prevent.
--
-- "Light" is ENFORCED, not described: no Activity event is written for any
-- transaction mutation, there is no record route, and there is no record chrome.

CREATE TABLE finance_transaction_details (
  workspace_id          TEXT NOT NULL,
  entity_id             TEXT NOT NULL,
  entity_type           TEXT NOT NULL DEFAULT 'finance_transaction',
  account_id            TEXT NOT NULL,
  -- The date the owner thinks in, and the date the month is cut by. There is no
  -- posted date: nothing in V2.12 reads one, and a nullable column no code reads
  -- is exactly the debt this release refuses to create.
  occurred_on           TEXT NOT NULL,
  -- SIGNED. Positive is money in, negative is money out. Zero is legitimate
  -- (a fee waived, a $0.00 authorisation) and is neither.
  amount_minor          INTEGER NOT NULL,
  -- Always equal to the account's, enforced at the boundary. Stored so an
  -- aggregate reads ONE table rather than joining to get the currency it must
  -- group by.
  currency_code         TEXT NOT NULL,
  -- The bank's raw string, NEVER destroyed and never overwritten, so a better
  -- normalisation in a later release can be re-derived from the original rather
  -- than from a lossy one.
  source_description    TEXT NOT NULL,
  -- The DISPLAY payee lives on the `entities` row as its title, not here: one
  -- title, one place, exactly as `obligation_details` decided (V2.10 LIFE-01).
  -- Renaming it is one update to `entities.title` in the same batch as anything
  -- else the edit touches.
  -- The bounded normalisation, used for exactly two jobs: the `occ:`
  -- fingerprint, and the deterministic previous-category suggestion. No fuzzy
  -- matching, no edit distance, no merchant directory, no merchant entity.
  payee_key             TEXT NOT NULL,
  memo                  TEXT,
  -- NULL IS uncategorised. There is no `uncategorised` category row to rename,
  -- archive or delete.
  category_id           TEXT,
  -- Set when the OWNER chose the category by hand. The suggestion engine learns
  -- only from these, so it never learns from its own guesses.
  category_confirmed_at TEXT,
  -- NULL means entered by hand.
  import_id             TEXT,
  -- The bank's stable id where the file carried one.
  source_transaction_id TEXT,
  -- The row's identity WITHIN its account. `id:<sourceId>` where the bank
  -- supplied one, `occ:<date>:<amount>:<payeeKey>:<n>` otherwise, and
  -- `man:<entityId>` for a row the owner typed -- unique by construction,
  -- content-independent, and never matched by an import, because a row you typed
  -- and a row the bank sent are different facts with different provenance.
  fingerprint           TEXT NOT NULL,
  -- Both legs of one transfer share it. Spend and income exclude any
  -- transaction with a non-null one, which is the single predicate that makes
  -- paying a credit card structurally unable to become a second $1,000 of
  -- spending.
  transfer_group_id     TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  -- Soft delete. There is no `archived_at`: a transaction is not put away.
  deleted_at            TEXT,
  CONSTRAINT finance_transaction_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT finance_transaction_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT finance_transaction_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT finance_transaction_entity_type CHECK (entity_type = 'finance_transaction'),
  CONSTRAINT finance_transaction_occurred_shape CHECK (length(occurred_on) = 10),
  CONSTRAINT finance_transaction_amount_bounded CHECK (
    amount_minor BETWEEN -90000000000000 AND 90000000000000
  ),
  CONSTRAINT finance_transaction_currency_shape CHECK (length(currency_code) = 3),
  CONSTRAINT finance_transaction_source_description_bounded CHECK (
    length(source_description) <= 512
  ),
  CONSTRAINT finance_transaction_payee_key_bounded CHECK (
    length(payee_key) > 0 AND length(payee_key) <= 64
  ),
  CONSTRAINT finance_transaction_memo_bounded CHECK (
    memo IS NULL OR length(memo) <= 500
  ),
  CONSTRAINT finance_transaction_source_id_bounded CHECK (
    source_transaction_id IS NULL OR
    (length(source_transaction_id) > 0 AND length(source_transaction_id) <= 128)
  ),
  CONSTRAINT finance_transaction_fingerprint_bounded CHECK (
    length(fingerprint) > 0 AND length(fingerprint) <= 256
  ),
  CONSTRAINT finance_transaction_transfer_group_bounded CHECK (
    transfer_group_id IS NULL OR
    (length(transfer_group_id) > 0 AND length(transfer_group_id) <= 64)
  ),
  -- A category the owner never confirmed cannot claim they did, and a
  -- confirmation with no category is a confirmation of nothing.
  CONSTRAINT finance_transaction_confirmed_needs_category CHECK (
    category_confirmed_at IS NULL OR category_id IS NOT NULL
  ),
  CONSTRAINT finance_transaction_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT finance_transaction_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT finance_transaction_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  -- The account, in THIS workspace. A cross-workspace transaction is impossible
  -- at the database level, not merely in application code.
  CONSTRAINT finance_transaction_account_fk
    FOREIGN KEY (workspace_id, account_id)
    REFERENCES finance_account_details (workspace_id, entity_id) ON DELETE RESTRICT,
  CONSTRAINT finance_transaction_category_fk
    FOREIGN KEY (workspace_id, category_id)
    REFERENCES finance_categories (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT finance_transaction_import_fk
    FOREIGN KEY (workspace_id, import_id)
    REFERENCES finance_imports (workspace_id, id) ON DELETE RESTRICT
) STRICT;

-- THE IDEMPOTENCY CONSTRAINT, half two (ADR-120 decision 3). Two DIFFERENT
-- files that overlap cannot produce the same transaction twice -- the weekly-
-- export case, where every file is new bytes and most rows are not.
--
-- It deliberately includes SOFT-DELETED rows. A transaction the owner deleted is
-- not resurrected by a later overlapping import: it is reported as already
-- imported. Deleting was a decision, and silently undoing it would be worse than
-- saying so.
CREATE UNIQUE INDEX finance_transaction_fingerprint_key
  ON finance_transaction_details (workspace_id, account_id, fingerprint);

-- Access path: the account record's transactions, newest first.
CREATE INDEX finance_transaction_by_account
  ON finance_transaction_details (workspace_id, account_id, occurred_on DESC, entity_id);

-- Access path: the month, workspace-wide -- the Finance home and the month list.
CREATE INDEX finance_transaction_by_date
  ON finance_transaction_details (workspace_id, occurred_on, entity_id);

-- Access path: a category's month, and the grouped spend read the budget and the
-- Finance home BOTH call.
CREATE INDEX finance_transaction_by_category
  ON finance_transaction_details (workspace_id, category_id, occurred_on);

-- Access path: the uncategorised queue -- the daily-driver phone surface.
CREATE INDEX finance_transaction_uncategorised
  ON finance_transaction_details (workspace_id, deleted_at, category_id, occurred_on DESC);

-- Access path: the deterministic "last category for this payee" suggestion. One
-- grouped statement for a whole page, never one read per row.
CREATE INDEX finance_transaction_payee_category
  ON finance_transaction_details (workspace_id, payee_key, category_confirmed_at DESC);

-- Access path: a transfer's other leg.
CREATE INDEX finance_transaction_transfer
  ON finance_transaction_details (workspace_id, transfer_group_id);

-- Access path: an import's rows, for the ledger's detail view.
CREATE INDEX finance_transaction_import
  ON finance_transaction_details (workspace_id, import_id);

-- ---------------------------------------------------------------------------
-- 5. The budget.
-- ---------------------------------------------------------------------------
--
-- ONE amount, for ONE spending category, for ONE month. Budgets do not repeat:
-- there is no template, no rollover, no envelope and no carry-forward. The
-- budget screen offers "Copy from <previous month>" as one explicit action that
-- writes rows, which is simpler than a repetition engine and never surprises.
--
-- The `kind = 'spending'` restriction lives in the kernel rather than here,
-- because SQLite cannot express a CHECK across a foreign key.

CREATE TABLE finance_budgets (
  workspace_id  TEXT NOT NULL,
  id            TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  -- `YYYY-MM`. The month is V2.12's primary reporting period.
  period_month  TEXT NOT NULL,
  amount_minor  INTEGER NOT NULL,
  currency_code TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CONSTRAINT finance_budgets_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT finance_budgets_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT finance_budgets_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT finance_budgets_period_shape CHECK (length(period_month) = 7),
  -- A budget is a limit, and a negative limit is not a thing.
  CONSTRAINT finance_budgets_amount_valid CHECK (
    amount_minor >= 0 AND amount_minor <= 90000000000000
  ),
  CONSTRAINT finance_budgets_currency_shape CHECK (length(currency_code) = 3),
  CONSTRAINT finance_budgets_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT finance_budgets_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT finance_budgets_category_fk
    FOREIGN KEY (workspace_id, category_id)
    REFERENCES finance_categories (workspace_id, id) ON DELETE RESTRICT
) STRICT;

-- One budget per category per month. A second is an edit, not a second row.
CREATE UNIQUE INDEX finance_budgets_period_key
  ON finance_budgets (workspace_id, category_id, period_month);

-- Access path: the month's budgets, for the budget screen and the Finance home.
CREATE INDEX finance_budgets_by_month
  ON finance_budgets (workspace_id, period_month, category_id);

-- ---------------------------------------------------------------------------
-- 6. Obligation settlement -- ONE nullable column, and its projection.
-- ---------------------------------------------------------------------------
--
-- Finance has no recurring-commitment model (ADR-116 decision 1, unchanged).
-- What V2.12 adds is the link an obligation needs to say WHICH transaction paid
-- it, on exactly the pattern ADR-118 decision 1 established for the subject: an
-- authoritative foreign key here, and an `obligation.settled_by` EntityLink
-- projection written in the same batch for the generic reverse reads.
--
-- Settlement IS completion. `completeObligation` takes an optional transaction,
-- the completed amount and date come from it, and the EXISTING recurrence engine
-- creates at most one successor under its existing guard.
-- There is no independent link/unlink lifecycle, because "this transaction paid
-- it" and "this is complete" are the same statement, and two state machines for
-- one fact is how they come to disagree.
--
-- There is no unsettle, and that follows from V2.10 rather than from a choice
-- made here: `setStatus` refuses to reopen a completed obligation, so a
-- settlement cannot be cleared by reopening one. The recovery from settling the
-- wrong transaction is to delete the obligation and make it again, which the
-- index below is written to allow.

-- `ALTER TABLE ADD COLUMN` accepts only a SINGLE-column REFERENCES clause, so
-- this names `entities (id)` -- the table's primary key -- rather than the
-- composite `(workspace_id, id)` every other key in this migration uses. The
-- workspace half is enforced in the repository, which refuses a transaction it
-- cannot read in its own workspace, and `test/kernel/finance-isolation.test.ts`
-- proves it with a real second workspace rather than trusting it.
ALTER TABLE obligation_details
  ADD COLUMN settled_by_transaction_id TEXT REFERENCES entities (id);

-- ONE LIVE transaction settles AT MOST ONE LIVE obligation. A partial index, so
-- the many obligations with no settlement do not collide with each other on
-- NULL.
--
-- ## Why `deleted_at IS NULL` is part of the predicate
--
-- Completing an obligation cannot be undone -- V2.10 refuses to reopen a
-- completed one by name -- so an owner who settles the WRONG transaction
-- recovers by deleting the obligation and making it again. Without this half of
-- the predicate that recovery is impossible: the soft-deleted row would still
-- hold the transaction, and the second attempt would fail on a constraint
-- naming a record the owner can no longer see.
--
-- It also makes the index agree with the read. `resolveSettlement` joins
-- `obligation_details` with `ob.deleted_at IS NULL`, so it already reports a
-- transaction under a deleted obligation as free. An index that disagreed would
-- mean the product says "yes" and the database says "no" for the same question,
-- which is the worst of the three possible answers.
--
-- The column is NOT cleared on delete: what settled a deleted obligation is
-- still what happened, and provenance is not the constraint's business.
--
-- It is ALSO the access path for "does this transaction settle anything?", which
-- the transaction drawer and every transaction page ask once. There is no second
-- index for the same lookup.
CREATE UNIQUE INDEX obligation_details_settlement_key
  ON obligation_details (workspace_id, settled_by_transaction_id)
  WHERE settled_by_transaction_id IS NOT NULL AND deleted_at IS NULL;
