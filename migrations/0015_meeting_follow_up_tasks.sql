-- Migration number: 0015 	 2026-07-27
--
-- MEET-02: meeting follow-through and Task conversion.
--
-- Two additive changes, both scoped strictly to the Meetings module storage:
--
--   1. Widen the `meeting_items.kind` vocabulary to admit a third structured kind,
--      `agenda`, alongside the MEET-01 `decision`/`outcome` kinds. This gives an
--      agenda item the SAME stable, ordered identity a decision/outcome already has
--      (MEET-01, migration 0014) so it can be converted to a Task WITHOUT parsing
--      the free-form `agenda_markdown` prose (AGENTS.md — never encode a
--      relationship in Markdown). The free-form `agenda_markdown` field is
--      unchanged; agenda items are the additional discrete, convertible surface.
--      A STRICT table's CHECK cannot be altered in place, so the table is rebuilt
--      (create → copy → drop → rename) preserving every existing row and its index.
--
--   2. Introduce the narrow, durable source-item → Task mapping table
--      `meeting_item_tasks`. A universal `task.relates_to` EntityLink already makes
--      the Meeting and its follow-up Task navigable from both ends; this table adds
--      the SMALLEST seam that additionally records WHICH agenda item / decision /
--      outcome produced the Task (or that it is a direct meeting follow-up), so the
--      Follow-up surface can show per-item conversion state and prevent accidental
--      duplicate conversion. It never replaces the EntityLink relationship — it
--      supplements it (RELATIONSHIPS.md).
--
-- Both tables are workspace-scoped and STRICT. `meeting_item_tasks` cascades only
-- from `meeting_details` (a deleted Meeting drops its mapping rows) — it never owns
-- the Task, so removing a mapping or deleting a Meeting never deletes a canonical
-- Task (MEET-02 lifecycle rules).

-- 1. Rebuild `meeting_items` with the widened `kind` CHECK. -----------------------

CREATE TABLE meeting_items_new (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, meeting_id, kind, position),
  CHECK (kind IN ('agenda', 'decision', 'outcome')),
  CHECK (length(body_markdown) > 0),
  CHECK (position >= 0),
  FOREIGN KEY (workspace_id, meeting_id)
    REFERENCES meeting_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

INSERT INTO meeting_items_new
  (workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at)
SELECT workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at
FROM meeting_items;

DROP TABLE meeting_items;
ALTER TABLE meeting_items_new RENAME TO meeting_items;

CREATE INDEX meeting_items_order
  ON meeting_items (workspace_id, meeting_id, kind, position, id);

-- 2. The durable source-item → Task mapping. -------------------------------------

CREATE TABLE meeting_item_tasks (
  workspace_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  -- NULL when the Task is a direct meeting follow-up (source is the Meeting itself);
  -- otherwise the stable `meeting_items.id` that produced the Task.
  item_id TEXT,
  task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- One mapping per Task: a Task has at most one Meeting source.
  PRIMARY KEY (workspace_id, task_id),
  FOREIGN KEY (workspace_id, meeting_id)
    REFERENCES meeting_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

-- At most ONE converted Task per source item (the documented product rule). Direct
-- follow-ups (item_id IS NULL) are exempt — a Meeting may spawn many of them.
CREATE UNIQUE INDEX meeting_item_tasks_one_per_item
  ON meeting_item_tasks (workspace_id, item_id)
  WHERE item_id IS NOT NULL;

-- Access path: list a Meeting's follow-up Tasks, stable newest-last ordering.
CREATE INDEX meeting_item_tasks_by_meeting
  ON meeting_item_tasks (workspace_id, meeting_id, created_at, task_id);
