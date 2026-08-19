-- TASKS-12 (Advanced recurrence + dependencies): four recurrence columns, and
-- NO dependency table.
--
-- Purely ADDITIVE. Four columns on `task_recurrence_rules`, one index. No
-- existing row is rewritten, no stored rule changes meaning, and no other table
-- is touched.
--
-- -- Why there is no `task_dependencies` table --------------------------------
-- A Task-to-Task dependency is a typed, directed, workspace-isolated relationship
-- between two entities - the definition of the kernel primitive migration 0003
-- already created. `entity_links` supplies, for free and at the DATABASE level:
--
--   * composite endpoint foreign keys `(workspace_id, entity_id)`, so a
--     cross-workspace dependency is impossible rather than merely refused,
--   * `entity_links_no_self_link CHECK (source <> target)`, so `A blocks A`
--     cannot be stored,
--   * `entity_links_identity_idx UNIQUE (workspace, source, target, type)`
--     spanning deleted rows, so a duplicate edge is impossible and a removed
--     dependency keeps ONE stable relationship identity across re-adding,
--   * `entity_links_active_source_type_idx` and
--     `entity_links_active_target_type_idx`, which are exactly the two access
--     paths a blocker read and the bounded cycle walk need.
--
-- A second join model would have re-earned all of that and left Tasks with two
-- relationship systems. What `entity_links` does NOT know is dependency
-- SEMANTICS - no cycles, at most 20 blockers and 20 blocks per Task, and
-- Task-only endpoints - and those are enforced in the workspace-bound
-- `TaskRepository` INSIDE the write (a predicate in the same statement, never a
-- read-then-decide), exactly as migration 0007 did for `task.waiting_on`. The
-- generic EntityLink repository REFUSES `task.blocks` (RESERVED_TASK_LINK_TYPES),
-- so there is no second way to create one. See ADR-106.
--
-- -- The four recurrence columns ----------------------------------------------
-- 1. ordinal
--      'first' | 'second' | 'third' | 'fourth' | 'last' - which occurrence of a
--      weekday inside the month a MONTHLY rule means ("the last Friday"). NULL
--      for every existing row and for every ordinary day-of-month monthly rule,
--      in which case `anchor_day` decides the day exactly as it did before. There
--      is deliberately no 'fifth': a fifth Monday exists in only some months, so
--      a rule naming one would need a silent fallback nobody chose.
--      `weekdays` carries the single weekday for such a rule. `anchor_day` stays
--      populated (migration 0024's CHECK requires it for a monthly rule) and is
--      ignored by the arithmetic when `ordinal` is set.
--
-- 2. weekend_rule
--      'allow' | 'before' | 'after' | 'skip' - what happens to an occurrence that
--      lands on a Saturday or Sunday. The DEFAULT is 'allow', which is EXACTLY
--      the semantics every rule stored before this migration already had, so
--      running it changes no existing series' behaviour. 'before'/'after' move
--      the occurrence and record the unadjusted schedule date in
--      `series_anchor_date` (migration 0037's column) on the successor, so a
--      moved occurrence never re-anchors the routine.
--
-- 3. ends_after_count
--      NULL (never ends - every existing row) or 1..999. The CURRENT occurrence
--      counts: occurrence number is `sequence + 1`, so a successor is created
--      only while `sequence + 2 <= ends_after_count`.
--
-- 4. ends_on_date
--      NULL (never ends) or an owner-calendar 'YYYY-MM-DD', INCLUSIVE. Mutually
--      exclusive with `ends_after_count`.
--
-- Rollback is by application deployment (D1 migrations are forward-only). The
-- previous application ignores all four: `weekend_rule` has a default and nothing
-- older selects any of these names.

ALTER TABLE task_recurrence_rules
  ADD COLUMN ordinal TEXT;

ALTER TABLE task_recurrence_rules
  ADD COLUMN weekend_rule TEXT NOT NULL DEFAULT 'allow';

ALTER TABLE task_recurrence_rules
  ADD COLUMN ends_after_count INTEGER;

ALTER TABLE task_recurrence_rules
  ADD COLUMN ends_on_date TEXT;

-- SQLite cannot add a CHECK constraint to an existing table, and rebuilding this
-- table would rewrite every stored rule for a behaviour-neutral addition. The
-- closed sets and the mutual exclusion of the two end conditions are therefore
-- enforced where every other cross-field task invariant is enforced: in the
-- workspace-bound TaskRepository and the kernel validator
-- (`validateTaskRecurrenceRule`), exactly as migrations 0007 and 0037 did.
--
-- The index makes "which series end on/near a date" answerable without a scan,
-- and keeps the end-condition columns queryable for the snapshot reader.
CREATE INDEX task_recurrence_workspace_ends_idx
  ON task_recurrence_rules (workspace_id, ends_on_date)
  WHERE ends_on_date IS NOT NULL;
