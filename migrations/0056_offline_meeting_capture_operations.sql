-- Migration number: 0056 	 2026-09-16
--
-- MOBILE-03 (DalyHub 3.1): four more legal offline mutation operations.
--
-- offline_mutation_receipts: the Meeting appends
-- ---------------------------------------------------------------------------
-- PWA-12 (migration 0040) constrained `operation` to the six Task operations
-- that could be performed offline at the time, and TASKS-13 (migration 0045)
-- added a seventh. MOBILE-03 adds four more, the Meeting captures the 3.1
-- brief (section 35) asks for:
--
--   add_agenda_item . add_decision . add_outcome . add_action
--
-- SQLite cannot alter a CHECK in place, so widening the set requires the
-- standard table rebuild. This is the same procedure 0021, 0026 and 0045
-- already used, for the same reason, and the rebuild is not a data change:
--
--   * every column keeps its name, type and constraint
--   * every row is copied by an explicit column list, so a future ALTER that
--     reorders the physical columns cannot silently shift a value into the
--     wrong column
--   * the index is recreated with the same name over the same columns
--   * the ONLY difference is the four additional accepted operations
--
-- Why the CHECK is kept rather than dropped
-- -----------------------------------------
-- 0040's reason, unchanged: the receipt's whole job is to stop one intent's key
-- being satisfied by a different intent, and a constraint naming the legal set
-- is what makes that a property of the DATABASE rather than of whichever code
-- path happens to read the row. One operation per meeting item KIND, rather
-- than one `add_item` operation carrying a kind in a column the CHECK cannot
-- see, is what keeps that guarantee at this table for Meetings too: a receipt
-- for a queued decision cannot be satisfied by a request carrying an action.
-- The matching application guard is the closed set in
-- app/kernel/offline/offline-mutation.ts, and a unit test pins the two lists
-- together.
--
-- Why an APPEND is safe to replay under this protocol
-- ---------------------------------------------------
-- An append writes a new meeting_items row. It overwrites no value, so it
-- cannot conflict with another device (app/kernel/offline/offline-conflict.ts
-- returns `applied` for every append without comparing anything). The ONLY
-- duplicate risk is the one this table exists to remove: a replay whose first
-- attempt reached the server but whose response was lost. The key is minted
-- when the item is queued, so both attempts carry it, and the second is
-- answered from the settled receipt with nothing written.
--
-- Nothing depends on this table existing except offline mutation replay, and no
-- existing row's meaning changes, so a deployment on which nobody ever captures
-- during a meeting offline never writes a row here.

CREATE TABLE offline_mutation_receipts_new (
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  owner_subject TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(idempotency_key) >= 8 AND length(idempotency_key) <= 128),
  CHECK (length(owner_subject) > 0 AND length(owner_subject) <= 256),
  CHECK (length(entity_id) > 0 AND length(entity_id) <= 128),
  CHECK (operation IN (
    'complete', 'reopen', 'set_title', 'set_priority', 'set_due', 'set_planned',
    'set_checklist_completed',
    'add_agenda_item', 'add_decision', 'add_outcome', 'add_action'
  )),
  CHECK (length(outcome) <= 32),
  CHECK (length(created_at) > 0)
) STRICT;

INSERT INTO offline_mutation_receipts_new (
  workspace_id, idempotency_key, owner_subject, entity_id, operation, outcome,
  created_at
)
SELECT
  workspace_id, idempotency_key, owner_subject, entity_id, operation, outcome,
  created_at
FROM offline_mutation_receipts;

DROP TABLE offline_mutation_receipts;

ALTER TABLE offline_mutation_receipts_new RENAME TO offline_mutation_receipts;

CREATE INDEX offline_mutation_receipts_by_created_at
  ON offline_mutation_receipts (workspace_id, created_at);
