-- Migration number: 0045 	 2026-08-18
--
-- TASKS-13: Task checklists -- the ordered steps inside ONE Task, and the one
-- widened CHECK the offline replay ledger needs to carry a checklist tick.
--
-- THE NUMBERING. 0045 is the next free number on main at the time this branch
-- was opened. The repository has two grandfathered collisions (0013 and 0039)
-- recorded in test/unit/migrations/migration-numbering.test.ts, and this
-- migration deliberately does not add a third.
--
-- ==========================================================================
-- WHY A CHECKLIST ITEM IS NOT A TASK
-- ==========================================================================
-- DalyHub already has a perfectly good record for "a thing to do": the Task. So
-- the cheap answers were a child Task under `parent_task_id`, a Markdown
-- checkbox inside `task_details.description`, or a JSON array on the Task. All
-- three are wrong, for three different reasons:
--
--   a CHILD TASK is a second level of the SPINE. Every count, rollup, filter and
--   view in the product answers a question about Tasks -- how many are open in
--   this Project, how many are overdue, what is planned for Wednesday, what did
--   I complete this week. Adding a second level makes every one of those answers
--   ambiguous, and the ambiguity is permanent. "Prepare camper" with four steps
--   would become five Tasks in the Inbox, five in a Project count and five in
--   the weekly planning queue.
--
--   a MARKDOWN CHECKBOX is not data. Ticking one would be a whole-description
--   rewrite, two devices ticking two different boxes would lose one of them, the
--   order could not be changed without editing prose, and a future Project
--   Template could not copy the steps without parsing them back out again.
--
--   a JSON ARRAY on the Task has the same lost-update problem in a less honest
--   form: one checkbox changing writes the whole array, so the last writer wins
--   over changes it never saw. It also cannot be indexed, counted or ordered by
--   the database, so every progress figure would mean reading and parsing the
--   blob.
--
-- So a checklist item is a ROW: small, ordered, individually addressable, and
-- individually writable. What it is NOT is an entity -- it has no id in
-- `entities`, no spine record, no EntityLinks, no Activity of its own and no
-- route. It cannot be searched to, opened, planned, delegated or completed as a
-- Task, because none of the machinery that would let it exists for it.
--
-- ==========================================================================
-- ONE LEVEL, AND ONLY ONE
-- ==========================================================================
-- `task_id` references a TASK. There is no `parent_item_id`, and there will not
-- be one: a checklist item cannot contain another checklist item, a Task, a Note
-- or a checklist. The absence of that column is the whole of the no-nesting
-- rule, enforced by the schema rather than by a convention someone has to
-- remember.
--
-- ==========================================================================
-- ORDERING
-- ==========================================================================
-- `position` is a plain INTEGER, and the read order is
-- (position, created_at, id) -- a TOTAL order, so two items that somehow share a
-- position still have one deterministic sequence rather than whatever the query
-- planner returns.
--
-- The position is deliberately NOT unique. A reorder rewrites the positions of
-- one Task's items inside a single transaction, and SQLite checks a UNIQUE index
-- row by row rather than at commit, so a unique constraint would reject exactly
-- the legitimate intermediate state a reorder passes through. Uniqueness would
-- buy nothing the total order does not already give, and would cost the one
-- operation the column exists for.
--
-- No floating-point positions and no fractional midpoints: a checklist is a
-- SHORT list (bounded at 100 items in the kernel), a whole-list renumber is one
-- statement, and a rebalance that never has to happen cannot go wrong.
--
-- ==========================================================================
-- CONVENTIONS
-- ==========================================================================
-- Identical to the existing tables: application-written ISO-8601 UTC TEXT
-- timestamps, STRICT column typing, a workspace foreign key with ON DELETE
-- RESTRICT, and a composite entity foreign key that carries `entity_type` so the
-- database itself asserts the parent really is a Task (the device
-- `task_details` (0006) and `habit_details` (0044) both use).

CREATE TABLE task_checklist_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  -- Carried so the composite foreign key below can assert the parent really is
  -- a Task. A checklist item can never hang off a Project, a Goal or a Habit.
  task_type TEXT NOT NULL DEFAULT 'task',
  -- The step, as one short line of PLAIN TEXT. Not Markdown: a checklist row is
  -- a label beside a checkbox, and long-form writing belongs in the Task's
  -- description or in a linked Note.
  title TEXT NOT NULL,
  -- The owner's order. See ORDERING above.
  position INTEGER NOT NULL,
  -- 0 or 1. A checklist item has no workflow status, no priority, no dates and
  -- no waiting state -- it is done or it is not, and that is the entire point of
  -- it being simpler than a Task.
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT, like every other detail table. A Task is soft-deleted in
  -- DalyHub, so this is not the ordinary path. It exists so that if a permanent
  -- purge is ever built for Tasks it is FORCED to clear the checklist first,
  -- rather than being allowed to leave orphan rows behind.
  FOREIGN KEY (workspace_id, task_id, task_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  CONSTRAINT task_checklist_items_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT task_checklist_items_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT task_checklist_items_task_bounded CHECK (length(task_id) > 0 AND length(task_id) <= 64),
  CONSTRAINT task_checklist_items_task_type CHECK (task_type = 'task'),
  -- Bounded at the storage boundary as well as in the kernel. The kernel's
  -- validator is the one that produces a readable message. This is the last line
  -- of defence, and it is what makes an unbounded title a write failure rather
  -- than a row.
  CONSTRAINT task_checklist_items_title_bounded CHECK (
    length(title) > 0 AND length(title) <= 500
  ),
  CONSTRAINT task_checklist_items_position_range CHECK (position >= 0),
  CONSTRAINT task_checklist_items_completed_flag CHECK (completed IN (0, 1)),
  CONSTRAINT task_checklist_items_timestamps CHECK (
    length(created_at) > 0 AND length(updated_at) > 0
  )
) STRICT;

-- The ONE read every surface makes: this Task's items, already in the owner's
-- order. It is also the index the bounded progress aggregate uses -- "how many
-- items, how many done, for these fifty Tasks" is one indexed statement over a
-- bounded id list, never one statement per Task.
CREATE INDEX task_checklist_items_by_task
  ON task_checklist_items (workspace_id, task_id, position, id);

-- ---------------------------------------------------------------------------
-- offline_mutation_receipts: one more legal operation
-- ---------------------------------------------------------------------------
-- PWA-12 (migration 0040) constrained `operation` to the six Task operations
-- that could be performed offline at the time. TASKS-13 adds a seventh --
-- ticking or unticking a checklist item -- and SQLite cannot alter a CHECK in
-- place, so widening the set requires the standard table rebuild. The same
-- procedure 0021 and 0026 already used, for the same reason.
--
-- This is a rebuild, but it is not a data change:
--
--   * every column keeps its name, type and constraint
--   * every row is copied by an explicit column list, so a future ALTER that
--     reorders the physical columns cannot silently shift a value into the
--     wrong column
--   * the index is recreated with the same name over the same columns
--   * the ONLY difference is that `operation` now also accepts
--     'set_checklist_completed'
--
-- The CHECK is kept rather than dropped in favour of "the application validates
-- it anyway", for the reason 0040 gave: the receipt's whole job is to stop one
-- intent's key being satisfied by a different intent, and a constraint naming
-- the legal set is what makes an unknown operation a write failure instead of a
-- receipt nobody can interpret. The matching application guard is the closed set
-- in app/kernel/offline/offline-mutation.ts, and a unit test pins the two lists
-- together.

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
    'set_checklist_completed'
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
