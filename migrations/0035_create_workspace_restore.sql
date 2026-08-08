-- Migration number: 0035 	 2026-08-08
--
-- SET-02 Backup and restore: the two tables that make a restore FAILURE-SAFE.
--
-- The problem these solve. A workspace restore writes tens of thousands of rows
-- across twenty-five tables. D1 gives a single batch() transactional atomicity,
-- but a whole workspace does not fit in one batch: the per-statement
-- bound-parameter ceiling forces the rows to be written across many statements
-- and many batches, and a failure between two of them would leave the owner with
-- part of one workspace and part of another. That is the single worst outcome a
-- recovery feature can produce, so the write path is split in two.
--
--   1. STAGING (many bounded batches, interruptible, touches nothing canonical).
--      Every row of the validated snapshot is written into
--      workspace_restore_staged_rows as an inert JSON object whose keys are
--      exactly the destination table's columns.
--   2. CUTOVER (ONE batch, therefore ONE transaction). For each table, a DELETE
--      of the workspace's rows followed by an INSERT ... SELECT that projects
--      the staged JSON through json_extract. That is a FIXED set of roughly 55
--      statements regardless of how large the workspace is, so the atomic step
--      never grows with the data.
--
-- The invariant this buys: at every instant the workspace is either entirely the
-- old one or entirely the restored one. An interruption during staging leaves
-- the workspace untouched. An interruption during cutover rolls the transaction
-- back. There is no third state.
--
-- Why JSON rather than twenty-five mirror tables. A staging table per canonical
-- table would double the schema (against D1's 100-table ceiling) and would have
-- to be migrated in lockstep forever. One generic table with json_extract in the
-- cutover projection keeps the atomic step fixed-size, keeps the schema honest,
-- and keeps the column list in exactly one place (the TypeScript descriptor that
-- also builds the JSON).
--
-- Conventions match every other table: ISO-8601 UTC TEXT timestamps written by
-- the application, no database enums beyond explicit CHECKs, STRICT typing so a
-- schema mistake fails loudly. Both tables are workspace-scoped with an enforced
-- foreign key, so restore state can never escape the isolation boundary.
--
-- This migration is purely ADDITIVE: it creates two new tables and touches no
-- existing table, row or index, so applying it to production preserves every
-- existing record unchanged.

-- 1. The restore journal. One row per restore the owner started, recording what
--    was validated, which mode applies, and the receipt for the pre-restore
--    safety backup. It is the durable answer to "was a safety backup actually
--    produced before anything was replaced", a question the restore route must
--    not answer from a client-supplied value.
CREATE TABLE workspace_restore_operations (
  id                     TEXT NOT NULL,
  workspace_id           TEXT NOT NULL,
  -- The authenticated owner who started the restore. Owner-scoped rows
  -- (preferences, saved views) are rebound to THIS subject, never to any
  -- identifier inside the uploaded backup.
  owner_id               TEXT NOT NULL,
  -- staged, then safety_backed_up, then applied, then completed. Or failed at
  -- any point.
  status                 TEXT NOT NULL,
  -- 'into-empty' (nothing can be lost) or 'replace' (destructive).
  mode                   TEXT NOT NULL,
  -- The backup's own meta.exportedAt, so the confirmation names a real date.
  backup_created_at      TEXT NOT NULL,
  -- The workspace the backup came FROM. Provenance only: it is displayed and is
  -- never used to decide where rows are written.
  source_workspace_id    TEXT NOT NULL,
  staged_row_count       INTEGER NOT NULL,
  -- The verified pre-restore safety backup, when one was taken. All four are
  -- written together or not at all.
  safety_backup_filename TEXT,
  safety_backup_sha256   TEXT,
  safety_backup_bytes    INTEGER,
  safety_backup_records  INTEGER,
  -- A short structural reason, never record content.
  failure_reason         TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,

  CONSTRAINT workspace_restore_operations_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT workspace_restore_operations_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT workspace_restore_operations_workspace_not_empty
    CHECK (length(workspace_id) > 0),
  CONSTRAINT workspace_restore_operations_owner_not_empty
    CHECK (length(owner_id) > 0 AND length(owner_id) <= 256),
  CONSTRAINT workspace_restore_operations_status_valid
    CHECK (status IN ('staged', 'safety_backed_up', 'applied', 'completed', 'failed')),
  CONSTRAINT workspace_restore_operations_mode_valid
    CHECK (mode IN ('into-empty', 'replace')),
  CONSTRAINT workspace_restore_operations_counts_nonneg
    CHECK (staged_row_count >= 0),
  -- A safety-backup receipt is all-or-nothing: a half-recorded receipt must
  -- never be readable as proof that a backup was taken.
  CONSTRAINT workspace_restore_operations_safety_backup_complete CHECK (
    (safety_backup_filename IS NULL
      AND safety_backup_sha256 IS NULL
      AND safety_backup_bytes IS NULL
      AND safety_backup_records IS NULL)
    OR (safety_backup_filename IS NOT NULL
      AND safety_backup_sha256 IS NOT NULL
      AND safety_backup_bytes IS NOT NULL
      AND safety_backup_records IS NOT NULL)
  ),
  CONSTRAINT workspace_restore_operations_created_at_not_empty
    CHECK (length(created_at) > 0),
  CONSTRAINT workspace_restore_operations_updated_at_not_empty
    CHECK (length(updated_at) > 0),
  CONSTRAINT workspace_restore_operations_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;

-- Access path: expire stale operations and find the owner's active one.
CREATE INDEX workspace_restore_operations_status_idx
  ON workspace_restore_operations (workspace_id, status, created_at);

-- 2. The staging area. Inert rows: nothing in DalyHub reads them except the
--    cutover projection and the post-restore verification. The primary key's
--    leftmost prefix already serves the cutover read, so no extra index exists.
--    row_json is a JSON object whose keys are EXACTLY the destination table's
--    column names and whose values are exactly the values those columns take,
--    which is what makes the cutover a pure projection with no per-row binding.
CREATE TABLE workspace_restore_staged_rows (
  workspace_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  -- The snapshot collection name (entities, taskDetails, and so on). The
  -- TypeScript descriptor maps it to a table and a column list.
  collection   TEXT NOT NULL,
  -- Position within the collection, preserving the snapshot's documented total
  -- ordering so the cutover inserts parents before children deterministically.
  sequence     INTEGER NOT NULL,
  row_json     TEXT NOT NULL,

  CONSTRAINT workspace_restore_staged_rows_pk
    PRIMARY KEY (workspace_id, operation_id, collection, sequence),
  CONSTRAINT workspace_restore_staged_rows_workspace_not_empty
    CHECK (length(workspace_id) > 0),
  CONSTRAINT workspace_restore_staged_rows_operation_not_empty
    CHECK (length(operation_id) > 0),
  CONSTRAINT workspace_restore_staged_rows_collection_not_empty
    CHECK (length(collection) > 0),
  CONSTRAINT workspace_restore_staged_rows_sequence_nonneg CHECK (sequence >= 0),
  CONSTRAINT workspace_restore_staged_rows_json_valid CHECK (json_valid(row_json)),
  CONSTRAINT workspace_restore_staged_rows_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;
