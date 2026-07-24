-- NOTES-01A: Notes-owned persistence slice. Identity, title, workspace and
-- lifecycle stay ordinary `entities` fields; Notes are NOT part of the spine
-- (AGENTS.md §4) and add no spine_records row. This table owns ONLY the
-- durable Markdown source. Rendered HTML, excerpts and editor JSON are never
-- stored (FND-08 / ADR-006 / ADR-015). A Note with no row here has valid,
-- empty Markdown content — never backfilled, since every Note is created
-- fresh with no prior content to migrate (mirrors 0009_create_goal_details.sql).
CREATE TABLE note_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT note_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT note_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT note_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT note_details_entity_type CHECK (entity_type = 'note'),
  CONSTRAINT note_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT note_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;
