-- UX-01: Tasks capture defaults and explicit Meeting Action items.
--
-- 1. Extend owner/workspace preferences with an optional default Task capture
--    parent. The application validates this as an active Area or non-archived
--    Project before saving and again before using it.
--
-- 2. Widen meeting_items.kind from agenda/decision/outcome to include action.
--    Existing items and source-item mappings are preserved. Activity payloads
--    remain structural and carry only item kind metadata.

ALTER TABLE owner_app_preferences
  ADD COLUMN default_task_capture_parent_id TEXT;

ALTER TABLE owner_app_preferences
  ADD COLUMN default_task_capture_parent_kind TEXT
  CHECK (
    default_task_capture_parent_kind IS NULL
    OR default_task_capture_parent_kind IN ('area', 'project')
  );

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
  CHECK (kind IN ('agenda', 'decision', 'outcome', 'action')),
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
