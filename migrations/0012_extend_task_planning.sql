-- Migration number: 0012 	 2026-07-25
--
-- TASKS-01 first-class Tasks module (ROADMAP TASKS-01, ADR-043): extend the
-- additive `task_details` slice with the four-question planning model — the
-- canonical Todoist/Eisenhower priority (P1–P4), the Carl Pullein Time Sector, the
-- Someday/Maybe commitment state, an extended workflow status (adding on_hold and
-- cancelled) and an honest plain-text delegation record.
--
-- This migration runs AFTER 0001–0011. Two of the changes are VALUE-SET widenings
-- of existing CHECK constraints (priority: low/medium/high → p1/p2/p3/p4; status:
-- todo/in_progress → +on_hold/+cancelled), which SQLite can only apply by rebuilding
-- the STRICT table (the same supported create-new → copy → drop → rename pattern
-- migration 0002 used for `entities`). The rebuild is data-preserving: every
-- existing row is copied, legacy priority values are REMAPPED once
-- (high→p1, medium→p2, low→p3; NULL stays NULL = untriaged), and the new columns
-- take their documented defaults (commitment_state='active', everything else NULL).
-- No production data is lost; DalyHub V2 has not entered production with task_details
-- rows, but the migration does NOT assume the table is empty.
--
-- Conventions (identical to the existing tables): timestamps are ISO-8601 UTC TEXT
-- and calendar dates are date-only `YYYY-MM-DD` TEXT written by the application;
-- STRICT enforces column typing; the delegatee/note are stored as PLAIN TEXT
-- (rendered escaped, never HTML/Markdown). Closed value sets are DB CHECK sets.
-- Cross-field invariants a portable CHECK cannot express (a delegation date/note
-- requires a delegatee; Someday/Maybe exclusion rules; the display-state precedence)
-- are enforced by the workspace-bound TaskRepository and covered by tests, exactly
-- as migration 0007 did for the waiting invariants.
--
-- Foreign-key safety: every copied row references an `entities` row that is
-- UNCHANGED by this migration, so the composite FK to `entities (workspace_id, id,
-- type)` passes with enforcement left ON. We deliberately do NOT disable foreign
-- keys.

-- 1. Rebuild `task_details` with the widened CHECK sets and the additive columns.
--    Column-for-column identical to migrations 0006 + 0007, plus: the widened
--    priority/status CHECKs and the new time_sector / commitment_state / delegation
--    columns.
CREATE TABLE task_details_new (
  workspace_id     TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  entity_type      TEXT NOT NULL DEFAULT 'task',
  status           TEXT NOT NULL DEFAULT 'todo',
  priority         TEXT,
  due_date         TEXT,
  scheduled_date   TEXT,
  -- TASKS-01 additive planning fields.
  time_sector      TEXT,
  commitment_state TEXT NOT NULL DEFAULT 'active',
  delegate_to      TEXT,
  delegated_on     TEXT,
  follow_up_on     TEXT,
  delegate_note    TEXT,
  description      TEXT,
  waiting_since    TEXT,
  waiting_note     TEXT,
  updated_at       TEXT NOT NULL,
  CONSTRAINT task_details_workspace_id_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT task_details_entity_id_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT task_details_entity_type_is_task CHECK (entity_type = 'task'),
  -- Widened workflow status set (TASKS-01): open-state positions only. "done" is
  -- still spine-derived; waiting/someday/inbox/planned are DERIVED display states.
  CONSTRAINT task_details_status_valid
    CHECK (status IN ('todo', 'in_progress', 'on_hold', 'cancelled')),
  -- Canonical P1–P4 priority set (TASKS-01). NULL = untriaged.
  CONSTRAINT task_details_priority_valid
    CHECK (priority IS NULL OR priority IN ('p1', 'p2', 'p3', 'p4')),
  CONSTRAINT task_details_due_date_shape
    CHECK (due_date IS NULL OR due_date GLOB '????-??-??'),
  CONSTRAINT task_details_scheduled_date_shape
    CHECK (scheduled_date IS NULL OR scheduled_date GLOB '????-??-??'),
  -- The closed Time Sector set (TASKS-01). NULL = no sector (derived "Inbox").
  CONSTRAINT task_details_time_sector_valid
    CHECK (time_sector IS NULL OR time_sector IN
      ('this_week', 'next_week', 'this_month', 'next_month', 'long_term', 'routines')),
  -- The closed commitment-state set (TASKS-01). Default 'active'.
  CONSTRAINT task_details_commitment_state_valid
    CHECK (commitment_state IN ('active', 'someday')),
  -- Delegatee/note are non-empty plain text when present.
  CONSTRAINT task_details_delegate_to_not_empty
    CHECK (delegate_to IS NULL OR length(delegate_to) > 0),
  CONSTRAINT task_details_delegated_on_shape
    CHECK (delegated_on IS NULL OR delegated_on GLOB '????-??-??'),
  CONSTRAINT task_details_follow_up_on_shape
    CHECK (follow_up_on IS NULL OR follow_up_on GLOB '????-??-??'),
  CONSTRAINT task_details_delegate_note_not_empty
    CHECK (delegate_note IS NULL OR length(delegate_note) > 0),
  CONSTRAINT task_details_description_not_empty
    CHECK (description IS NULL OR length(description) > 0),
  CONSTRAINT task_details_waiting_since_not_empty
    CHECK (waiting_since IS NULL OR length(waiting_since) > 0),
  CONSTRAINT task_details_waiting_note_not_empty
    CHECK (waiting_note IS NULL OR length(waiting_note) > 0),
  CONSTRAINT task_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT task_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT task_details_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- 2. Copy every existing row, remapping the legacy priority value set to P1–P4 and
--    defaulting the new columns. Order/id/dates/description/waiting are preserved
--    exactly.
INSERT INTO task_details_new
  (workspace_id, entity_id, entity_type, status, priority, due_date,
   scheduled_date, time_sector, commitment_state, delegate_to, delegated_on,
   follow_up_on, delegate_note, description, waiting_since, waiting_note, updated_at)
SELECT
  workspace_id,
  entity_id,
  entity_type,
  status,
  CASE priority
    WHEN 'high' THEN 'p1'
    WHEN 'medium' THEN 'p2'
    WHEN 'low' THEN 'p3'
    ELSE priority
  END,
  due_date,
  scheduled_date,
  NULL,        -- time_sector
  'active',    -- commitment_state
  NULL,        -- delegate_to
  NULL,        -- delegated_on
  NULL,        -- follow_up_on
  NULL,        -- delegate_note
  description,
  waiting_since,
  waiting_note,
  updated_at
FROM task_details;

-- 3. Swap the rebuilt table in. Nothing references `task_details` by name (the
--    waiting partial-unique index lives on `entity_links`, untouched).
DROP TABLE task_details;
ALTER TABLE task_details_new RENAME TO task_details;

-- 4. Recreate the access-path indexes from 0006 + 0007 (a rebuild drops them), plus
--    new partial indexes for the hot TASKS-01 query paths (sector planning, the
--    Someday/Maybe view). Partial indexes stay small — most tasks are neither
--    someday nor sectored.
CREATE INDEX task_details_workspace_due_idx
  ON task_details (workspace_id, due_date);

CREATE INDEX task_details_waiting_idx
  ON task_details (workspace_id, waiting_since)
  WHERE waiting_since IS NOT NULL;

CREATE INDEX task_details_workspace_sector_idx
  ON task_details (workspace_id, time_sector)
  WHERE time_sector IS NOT NULL;

CREATE INDEX task_details_workspace_someday_idx
  ON task_details (workspace_id, entity_id)
  WHERE commitment_state = 'someday';

CREATE INDEX task_details_workspace_scheduled_idx
  ON task_details (workspace_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;
