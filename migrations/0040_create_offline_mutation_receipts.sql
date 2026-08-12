-- PWA-12: idempotency receipts for replayed offline Task MUTATIONS.
--
-- ADDITIVE ONLY. One new table. No existing table is rebuilt, no column is added
-- to an existing table, and no existing row is read or rewritten. Nothing in
-- DalyHub depends on this table existing except offline mutation replay, so a
-- deployment on which nobody ever edits a Task offline never writes a row here.
--
-- Why this is a SECOND table rather than a widened offline_capture_receipts
-- ------------------------------------------------------------------------
-- The PWA-05 table (migration 0027) records "a record was CREATED under this
-- key", and its record_kind CHECK constrains it to the three creatable kinds. A
-- mutation receipt answers a different question -- "an intent was APPLIED to an
-- existing record under this key" -- and needs to carry the operation and the
-- outcome, not a created id. Widening the capture table would have meant
-- rebuilding it (SQLite cannot alter a CHECK) and would have left one table with
-- two meanings. The claim/complete/release PROTOCOL is deliberately identical,
-- reused rather than reinvented, and both are described together in
-- PWA_AND_OFFLINE.md.
--
-- The guarantee
-- -------------
-- The client generates one idempotency key when the mutation is QUEUED (not when
-- it is sent), so every retry of the same intent carries the same key. The server
-- claims the key with an INSERT before it applies anything:
--
--   - the insert succeeds, so this request owns the application. It applies the
--     intent, then records the outcome against the claimed key.
--   - the insert conflicts, so some other attempt already owns it. The receipt is
--     read back and its recorded outcome reported, applying nothing.
--
-- The primary key (workspace_id, idempotency_key) is what makes this safe under
-- concurrency: the DATABASE arbitrates, not application code. This is what stops
-- a replayed completion of a recurring Task producing a second successor -- and
-- it is the second of two protections, because completeTask is itself an
-- idempotent no-op on an already-completed Task.
--
-- Isolation
-- ---------
-- The key is scoped by workspace_id, the FND-03 isolation boundary, and carries
-- the owner_subject it was created under. A replayed mutation therefore cannot
-- cross a workspace boundary or be attributed to another identity, and the route
-- refuses to reconcile a receipt whose owner or entity does not match the
-- request. There is no unauthenticated replay endpoint: replay posts to the same
-- authenticated /tasks/:taskId route the online controls post to.
--
-- Retention
-- ---------
-- Receipts are small and bounded by how many offline changes the owner actually
-- makes. created_at is indexed so a later maintenance item can prune rows past a
-- retention horizon. Nothing prunes them today, which is stated honestly in
-- PWA_AND_OFFLINE.md rather than implied to be handled.
--
-- Conventions, identical to the existing tables: timestamps are ISO-8601 UTC TEXT
-- written by the application, STRICT column typing, and a workspace foreign key
-- with ON DELETE RESTRICT.

CREATE TABLE offline_mutation_receipts (
  workspace_id TEXT NOT NULL,
  -- The client-generated key. Opaque to the server: it is compared, never
  -- parsed, and never reflected into a page. Length-bounded so a hostile client
  -- cannot turn the primary key into an unbounded write.
  idempotency_key TEXT NOT NULL,
  -- The authenticated subject the mutation was replayed under. Stored so a
  -- receipt can only be reconciled by the identity that created it.
  owner_subject TEXT NOT NULL,
  -- The entity the intent addressed. Guards against a receipt for one Task being
  -- satisfied by a request naming another.
  entity_id TEXT NOT NULL,
  -- The intent, from the closed PWA-12 set. Guards against a receipt for a rename
  -- being satisfied by a completion.
  operation TEXT NOT NULL,
  -- What happened. Three values are sentinels rather than outcomes: the empty
  -- string means the claim is held but application has not finished, 'unresolved'
  -- means the claiming request never came back so whether it applied anything
  -- cannot be determined, and every other value is a terminal outcome the next
  -- replay is answered with. 'unresolved' is terminal and nothing applies under
  -- that key again -- an unknowable outcome is reported to the owner rather than
  -- guessed at, because guessing wrong is how a duplicate is written into the
  -- module this table exists to protect.
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(idempotency_key) >= 8 AND length(idempotency_key) <= 128),
  CHECK (length(owner_subject) > 0 AND length(owner_subject) <= 256),
  CHECK (length(entity_id) > 0 AND length(entity_id) <= 128),
  CHECK (operation IN (
    'complete', 'reopen', 'set_title', 'set_priority', 'set_due', 'set_planned'
  )),
  CHECK (length(outcome) <= 32),
  CHECK (length(created_at) > 0)
) STRICT;

-- Supports a future age-based prune without a table scan.
CREATE INDEX offline_mutation_receipts_by_created_at
  ON offline_mutation_receipts (workspace_id, created_at);
