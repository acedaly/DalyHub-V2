-- PROJ-05: Projects-owned operational state. Identity, completion and parentage stay in the spine.
CREATE TABLE project_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'project',
  status TEXT NOT NULL DEFAULT 'planned',
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT project_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT project_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT project_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT project_details_entity_type CHECK (entity_type = 'project'),
  CONSTRAINT project_details_status CHECK (status IN ('planned', 'active', 'on_hold')),
  CONSTRAINT project_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT project_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;
CREATE INDEX project_details_workspace_archived_idx ON project_details (workspace_id, archived_at);
CREATE INDEX project_details_workspace_status_idx ON project_details (workspace_id, status);
-- Existing non-deleted projects retain their historical operational meaning: active.
INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
SELECT workspace_id, id, 'active', NULL, updated_at
FROM entities WHERE type = 'project' AND deleted_at IS NULL;
