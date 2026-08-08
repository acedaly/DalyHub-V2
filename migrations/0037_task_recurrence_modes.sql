-- TASKS-07 (Recurrence 2.0) — two scheduling MODES, and a series schedule anchor.
--
-- Purely ADDITIVE. Two nullable-or-defaulted columns on `task_recurrence_rules`;
-- no existing row is rewritten, no rule is reinterpreted, and no other table is
-- touched. Matrix removal, bulk selection, list grouping and filter presentation
-- are all presentation concerns and deliberately have NO migration.
--
-- 1. `mode` — `'fixed'` (a schedule: "every Monday" stays Monday even when the
--    occurrence is completed late) or `'after_completion'` (an interval that
--    restarts on the completion day: "14 days after completion"). The default is
--    `'fixed'`, which is EXACTLY the semantics every rule stored before this
--    migration already had, so running the migration changes no series' behaviour.
--    That equivalence is asserted by `test/kernel/task-recurrence-modes.test.ts`.
--
-- 2. `series_anchor_date` — the date the SERIES grid is stepped from, when it is
--    deliberately different from THIS occurrence's own anchor date. It is NULL for
--    every existing row and for every ordinary occurrence, in which case the
--    occurrence's own date is the grid (unchanged behaviour). It is set only by the
--    "change this occurrence" series-edit scope: moving one occurrence off the grid
--    without re-anchoring the routine. The successor always returns to the grid and
--    stores NULL.
--
--    `after_completion` never reads it: that mode's grid IS the completion day.
--
-- Rollback is by application deployment (D1 migrations are forward-only). The
-- previous application ignores both columns: `mode` has a default and nothing older
-- selects either name.

ALTER TABLE task_recurrence_rules
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'fixed';

ALTER TABLE task_recurrence_rules
  ADD COLUMN series_anchor_date TEXT;

-- SQLite cannot add a CHECK constraint to an existing table, and rebuilding this
-- table would rewrite every stored rule for a presentation-neutral addition. The
-- closed sets are therefore enforced where every other cross-field task invariant
-- is enforced — in the workspace-bound `TaskRepository` and the kernel validators
-- (`validateTaskRecurrenceRule`), exactly as migration 0007 did for waiting. The
-- indexes below make the mode queryable without a scan.
CREATE INDEX task_recurrence_workspace_mode_idx
  ON task_recurrence_rules (workspace_id, mode);
