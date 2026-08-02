-- PWA-05: idempotency receipts for offline capture replay.
--
-- Numbered 0027, not 0026. THEME-02 (#99) landed 0026 on main while this branch
-- was open, and the repository already carries one duplicate number (0013,
-- recorded as DEBT-40) whose cost is documented in the migration tests: a
-- positional slice over `migrations/` is one merge away from selecting the wrong
-- set. Renumbering here rather than shipping a second collision.
--
-- ADDITIVE ONLY. One new table. No existing table is rebuilt, no column is added
-- to an existing table, and no existing row is read or rewritten. Nothing in
-- DalyHub depends on this table existing except the offline capture queue, so a
-- deployment that never replays a queued record never writes a row here.
--
-- Why this exists
-- ---------------
-- An offline capture is created on the device and replayed later. Replay happens
-- over a network that has just proven itself unreliable, so the client WILL
-- sometimes retry a request whose response it never saw. Without a server-side
-- guarantee that produces a duplicate task, note or diary entry, silently, in
-- the modules the owner trusts most. "The client generates a UUID and checks
-- first" is not a guarantee, because two in-flight retries can both pass the
-- check before either commits.
--
-- So creation is made idempotent at the ONE place that can make it so, the
-- database. The client sends an idempotency key it generated when the record was
-- queued. The create route inserts the receipt FIRST, and a duplicate key fails
-- the primary key. A losing retry then reads back the receipt and reports the
-- ALREADY created record id instead of creating a second one.
--
-- Isolation
-- ---------
-- The key is scoped by workspace_id, the FND-03 isolation boundary, and carries
-- the owner_subject it was created under. A receipt therefore cannot be used to
-- observe, or collide with, a record in another workspace, and the create route
-- refuses to reconcile a receipt whose owner does not match the authenticated
-- session, so a replayed capture can never be attributed across identities.
--
-- Retention
-- ---------
-- Receipts are small and bounded by how many offline captures the owner actually
-- makes, but they are not needed forever. Their whole purpose is to survive the
-- retry window. created_at is indexed so a later maintenance item can prune rows
-- older than the retention horizon. Nothing prunes them today, which is stated
-- honestly in PWA_AND_OFFLINE.md rather than implied to be handled.
--
-- Conventions, identical to the existing tables: timestamps are ISO-8601 UTC
-- TEXT written by the application, STRICT column typing, and a workspace foreign
-- key with ON DELETE RESTRICT.

CREATE TABLE offline_capture_receipts (
  workspace_id TEXT NOT NULL,
  -- The client-generated key. Opaque to the server: it is compared, never
  -- parsed, and never reflected into a page. Length-bounded so a hostile client
  -- cannot turn the primary key into an unbounded write.
  idempotency_key TEXT NOT NULL,
  -- The authenticated subject the capture was replayed under. Stored so a
  -- receipt can only be reconciled by the identity that created it.
  owner_subject TEXT NOT NULL,
  -- Which module created the record, from a closed set. Guards against a receipt
  -- for a note being reconciled by the task endpoint.
  record_kind TEXT NOT NULL,
  -- The id of the record that WAS created. This is what a losing retry reads
  -- back. Two values are sentinels rather than ids: the empty string means the
  -- claim is held but creation has not finished, and 'unresolved' means the
  -- claiming request never came back, so whether it created anything cannot be
  -- determined. 'unresolved' is terminal, and no attempt creates under that key
  -- again -- an unknowable outcome is reported to the owner rather than guessed
  -- at, because guessing wrong writes a duplicate into the modules this table
  -- exists to protect.
  record_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(idempotency_key) >= 8 AND length(idempotency_key) <= 128),
  CHECK (length(owner_subject) > 0 AND length(owner_subject) <= 256),
  CHECK (record_kind IN ('task', 'note', 'diary')),
  CHECK (length(record_id) <= 128),
  CHECK (length(created_at) > 0)
) STRICT;

-- Supports a future age-based prune without a table scan.
CREATE INDEX offline_capture_receipts_by_created_at
  ON offline_capture_receipts (workspace_id, created_at);
