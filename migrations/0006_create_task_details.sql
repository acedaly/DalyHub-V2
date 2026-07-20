-- Migration number: 0006 	 2026-07-20
--
-- TODAY-02 Task Drawer: the additive, task-only domain fields the Task Drawer
-- edits and displays (ROADMAP TODAY-02, ADR-028). FND-07 / ADR-014 deliberately
-- kept the spine minimal — a Task is an `entities` row plus a single
-- `spine_records.completed_at` and a structural parent EntityLink — and recorded
-- that status, priority, dates and descriptions belong to later module work.
-- TODAY-02 is that later work for the smallest honest slice needed to make the
-- Task Drawer a usable, persistent task record.
--
-- This migration runs AFTER 0001–0005. It is purely ADDITIVE: it CREATES one
-- domain table plus one index and does NOT alter `entities`, `entity_links`,
-- `activities`, `spine_records` or their data. No backfill: DalyHub V2 has not
-- entered production and a task simply has no details row until it is first
-- edited (the repository treats an absent row as the documented defaults).
--
-- Conventions (identical to the existing tables): timestamps are ISO-8601 UTC
-- TEXT and calendar dates are date-only `YYYY-MM-DD` TEXT written by the
-- application; STRICT enforces column typing; Markdown descriptions are stored as
-- SOURCE (FND-08 / ADR-015) and rendered through the one shared sanitising
-- pipeline — never as HTML. The closed value sets below (status, priority) are DB
-- CHECK sets because they are a small, closed, first-class part of this domain,
-- mirroring how `spine_records.kind` is a closed CHECK set.

-- The additive task-detail state, one row per Task, created lazily on first edit.
-- It holds ONLY what the Task Drawer justifies beyond the shared entity header and
-- the spine's completion timestamp: a workflow status (independent of completion —
-- "done" is derived from `spine_records.completed_at`, not stored here), an
-- optional priority, an optional due date and scheduled date, and an optional
-- Markdown description. Identity, title, timestamps and soft-delete stay on
-- `entities`; completion stays on `spine_records`; structural parentage stays in
-- `entity_links`. There is deliberately NO waiting/blocking column (TODAY-03), no
-- ordering, recurrence, estimate or subtask column.
CREATE TABLE task_details (
  workspace_id    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  -- Pinned to 'task' so the composite foreign key below can GUARANTEE a details
  -- row only ever attaches to a `task` entity in the same workspace — the same
  -- technique `spine_records.kind` uses. It is never anything but 'task'.
  entity_type     TEXT NOT NULL DEFAULT 'task',
  -- Workflow status, independent of completion. A completed task DISPLAYS as done
  -- (derived from spine completion); this column carries the open-state workflow
  -- position only, so the two can never disagree in a way the user sees.
  status          TEXT NOT NULL DEFAULT 'todo',
  priority        TEXT,
  due_date        TEXT,
  scheduled_date  TEXT,
  description     TEXT,
  updated_at      TEXT NOT NULL,
  CONSTRAINT task_details_workspace_id_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT task_details_entity_id_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT task_details_entity_type_is_task CHECK (entity_type = 'task'),
  CONSTRAINT task_details_status_valid
    CHECK (status IN ('todo', 'in_progress')),
  CONSTRAINT task_details_priority_valid
    CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high')),
  -- Calendar dates are date-only `YYYY-MM-DD` (never routed through a timezone).
  -- GLOB single-character wildcard is `?` (`_` is a literal in GLOB, unlike LIKE).
  CONSTRAINT task_details_due_date_shape
    CHECK (due_date IS NULL OR due_date GLOB '????-??-??'),
  CONSTRAINT task_details_scheduled_date_shape
    CHECK (scheduled_date IS NULL OR scheduled_date GLOB '????-??-??'),
  -- Absent description is NULL; a present description is never the empty string.
  CONSTRAINT task_details_description_not_empty
    CHECK (description IS NULL OR length(description) > 0),
  CONSTRAINT task_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  -- One details row per task: (workspace_id, entity_id) is the identity.
  CONSTRAINT task_details_pk PRIMARY KEY (workspace_id, entity_id),
  -- The details row's entity must exist IN THE SAME WORKSPACE and be a `task`.
  -- ON DELETE RESTRICT: a task cannot be HARD-deleted while its details row points
  -- at it (soft-delete leaves this row intact — soft-deletion is a query-time
  -- state, not a row removal). Backed by the (workspace_id, id, type) unique index
  -- migration 0005 created for the spine's composite foreign key.
  CONSTRAINT task_details_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- Access path for the Today surface's bounded due-date ordering of a workspace's
-- tasks (workspace-scoped, due date first). The list read drives off `entities`
-- (type = 'task', active) LEFT JOINed to this table, so this supports the sort.
CREATE INDEX task_details_workspace_due_idx
  ON task_details (workspace_id, due_date);
