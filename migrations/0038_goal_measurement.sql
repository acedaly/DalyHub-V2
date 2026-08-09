-- Migration number: 0038 	 2026-08-09
--
-- GOAL-02: measurable Goals - measurement configuration, measurement history
-- and optional milestones.
--
-- WHY. A DalyHub Goal could state a target DATE and a definition of done, but it
-- could not state a measurable OUTCOME: there was no baseline, no target value,
-- no unit and no record of where the owner is now. Progress on a Goal was
-- therefore only ever the proportion of contributing Projects completed, which
-- answers "how much work is finished" and not "am I closer to 70 kg". This
-- migration adds the smallest schema that lets a Goal answer the second question
-- honestly, and keeps the first one exactly as it was.
--
-- WHAT IS ADDED.
--   1. Five nullable columns on the EXISTING `goal_details` slice. Measurement
--      configuration is Goal-owned detail state in precisely the sense
--      `target_date` and `definition_of_done` already are (ADR-039's
--      `project_details` precedent), so it belongs on that table rather than in a
--      second per-Goal table that would have to be joined everywhere the first
--      one already is.
--   2. `goal_measurements` - the append-only-in-spirit history of what the owner
--      actually measured. A Goal's CURRENT value is never a column that gets
--      overwritten. It is the latest row here, which is what makes a trend
--      possible at all, and what makes correcting a mistyped reading a normal
--      edit rather than a lost history.
--   3. `goal_milestones` - the defined stages a milestone-measured Goal derives
--      its progress from, with an optional integer weight (default 1, i.e. equal
--      weighting) so a five-stage pathway does not have to pretend every stage is
--      the same size.
--
-- NO BACKFILL, NO REINTERPRETATION. Every existing Goal keeps working unchanged:
-- a NULL `measurement_type` means "this Goal has no measurement configured",
-- which is exactly what was true of every Goal before this migration, and a Goal
-- with no `goal_details` row still has no row. Nothing is rewritten, nothing is
-- inferred from free text, and no existing column, constraint, index or row is
-- touched. DalyHub has never stored a manually entered Goal progress percentage
-- (see `goal_details` in 0009 - the columns are `target_date` and
-- `definition_of_done` only), so there is no legacy percentage to map. `manual`
-- exists as a first-class CHOICE for Goals that genuinely cannot be measured
-- objectively, not as a migration target.
--
-- WHY NO CHECK NAMES THE MEASUREMENT TYPES. The same reason 0032 gave for icon
-- keys, and the lesson 0031 had to rebuild a whole table to learn: a CHECK
-- enumerating a domain that may grow turns "add a measurement type" into "rebuild
-- a production table", and SQLite cannot drop a column that participates in a
-- CHECK. The controlled enum lives in `app/kernel/goals/goal-measurement.ts` and
-- is enforced at the one validation boundary every write already passes through.
-- An unrecognised stored value degrades to "not measured" rather than throwing,
-- so a value written by a future version reads as absent instead of breaking the
-- page. The CHECKs that ARE here are structural invariants that can never grow:
-- non-empty identifiers, a finite weight, a well-formed date.
--
-- SAFE AGAINST PRODUCTION D1. Three `ALTER TABLE ... ADD COLUMN` statements (all
-- nullable, no defaults, no constraints that block a later `DROP COLUMN`) and two
-- `CREATE TABLE`s with their indexes. No table is rebuilt and no data is moved.

ALTER TABLE goal_details ADD COLUMN measurement_type TEXT;

ALTER TABLE goal_details ADD COLUMN measurement_unit TEXT;

ALTER TABLE goal_details ADD COLUMN measurement_direction TEXT;

ALTER TABLE goal_details ADD COLUMN baseline_value REAL;

ALTER TABLE goal_details ADD COLUMN target_value REAL;

-- One measurement the owner recorded for a Goal.
--
-- `measured_on` is an OWNER-CALENDAR date (`YYYY-MM-DD`), never an instant. A
-- weigh-in belongs to a day the way a Task's due date does, and storing it as a
-- timestamp would make the same reading land on a different day for a traveller
-- (the exact class of bug AUDIT-14 removed elsewhere). `created_at` breaks ties
-- when two readings share a day, so "the latest measurement" is always a total
-- order and never depends on row order.
CREATE TABLE goal_measurements (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'goal',
  value REAL NOT NULL,
  measured_on TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT goal_measurements_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT goal_measurements_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT goal_measurements_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT goal_measurements_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT goal_measurements_entity_type CHECK (entity_type = 'goal'),
  CONSTRAINT goal_measurements_measured_on_format CHECK (
    length(measured_on) = 10
    AND substr(measured_on, 5, 1) = '-'
    AND substr(measured_on, 8, 1) = '-'
    AND measured_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  CONSTRAINT goal_measurements_note_not_blank CHECK (
    note IS NULL OR length(trim(note)) > 0
  ),
  CONSTRAINT goal_measurements_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT goal_measurements_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT goal_measurements_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- The read every measurable surface makes: this Goal's readings, newest first.
-- Covers both "the latest value" (LIMIT 1) and "the recent history" (LIMIT n)
-- without a second index and without a sort.
CREATE INDEX goal_measurements_by_goal
  ON goal_measurements (workspace_id, entity_id, measured_on DESC, created_at DESC);

-- One defined stage of a milestone-measured Goal.
--
-- `weight` is an integer >= 1 and defaults to 1, so the default model is equal
-- weighting and a weighted model is opt-in per stage. `position` is the owner's
-- chosen order. It is not derived from creation time, because stages are
-- reordered far more often than they are created.
CREATE TABLE goal_milestones (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'goal',
  title TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT goal_milestones_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT goal_milestones_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT goal_milestones_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT goal_milestones_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT goal_milestones_entity_type CHECK (entity_type = 'goal'),
  CONSTRAINT goal_milestones_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT goal_milestones_weight_positive CHECK (weight >= 1),
  CONSTRAINT goal_milestones_position_not_negative CHECK (position >= 0),
  CONSTRAINT goal_milestones_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT goal_milestones_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT goal_milestones_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

CREATE INDEX goal_milestones_by_goal
  ON goal_milestones (workspace_id, entity_id, position, created_at);

-- Today's 7-day workload trend counts tasks COMPLETED per owner-calendar day.
-- `spine_records` had no index on `completed_at`, so that count meant scanning
-- every spine row in the workspace once per page load. This makes it a bounded
-- index range instead. Purely additive, and it serves any future
-- "what was completed between these instants" read as well.
CREATE INDEX spine_records_workspace_kind_completed_idx
  ON spine_records (workspace_id, kind, completed_at);
