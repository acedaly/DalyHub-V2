-- TASKS-07 (Recurrence 2.0): two scheduling MODES, and a series schedule anchor.
--
-- Purely ADDITIVE. Two columns on task_recurrence_rules. No existing row is
-- rewritten, no rule is reinterpreted, and no other table is touched. Matrix
-- removal, bulk selection, list grouping and filter presentation are all
-- presentation concerns and deliberately have NO migration.
--
-- 1. mode
--      'fixed' is a SCHEDULE: "every Monday" stays Monday even when the occurrence
--      is completed late. 'after_completion' is an INTERVAL that restarts on the
--      completion day: "14 days after completion". The DEFAULT is 'fixed', which is
--      EXACTLY the semantics every rule stored before this migration already had, so
--      running the migration changes no existing series' behaviour. That equivalence
--      is asserted by test/kernel/task-recurrence-modes.test.ts.
--
-- 2. series_anchor_date
--      The date the SERIES grid is stepped from, when it is deliberately different
--      from THIS occurrence's own anchor date. NULL for every existing row and for
--      every ordinary occurrence, in which case the occurrence's own date IS the grid
--      (unchanged behaviour). It is set only by the "change this occurrence"
--      series-edit scope, which moves one occurrence without re-anchoring the
--      routine. The successor returns to the grid and stores NULL again. An
--      after_completion rule never reads it, because that mode's grid is the
--      completion day.
--
-- Rollback is by application deployment (D1 migrations are forward-only). The
-- previous application ignores both columns: mode has a default and nothing older
-- selects either name.

ALTER TABLE task_recurrence_rules
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'fixed';

ALTER TABLE task_recurrence_rules
  ADD COLUMN series_anchor_date TEXT;

-- SQLite cannot add a CHECK constraint to an existing table, and rebuilding this
-- table would rewrite every stored rule for a presentation-neutral addition. The
-- closed sets are therefore enforced where every other cross-field task invariant
-- is enforced: in the workspace-bound TaskRepository and the kernel validators
-- (validateTaskRecurrenceRule), exactly as migration 0007 did for waiting. The index
-- below makes the mode queryable without a scan.
CREATE INDEX task_recurrence_workspace_mode_idx
  ON task_recurrence_rules (workspace_id, mode);
