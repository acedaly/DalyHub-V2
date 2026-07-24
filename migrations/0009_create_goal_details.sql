-- AREA-02: Goals-owned detail state. Identity, title, completion and Area
-- parentage stay in the spine (spine_records / entity_links); this table owns
-- only the additive fields the spine deliberately does not model: a nullable
-- owner-calendar target date and a nullable definition of done. A Goal with no
-- row here has no target date and no definition of done — never backfilled,
-- since both fields are optional by design (mirrors 0008_create_project_details.sql).
CREATE TABLE goal_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'goal',
  target_date TEXT,
  definition_of_done TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT goal_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT goal_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT goal_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT goal_details_entity_type CHECK (entity_type = 'goal'),
  CONSTRAINT goal_details_target_date_format CHECK (
    target_date IS NULL OR (
      length(target_date) = 10
      AND substr(target_date, 5, 1) = '-'
      AND substr(target_date, 8, 1) = '-'
      AND target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    )
  ),
  CONSTRAINT goal_details_definition_not_blank CHECK (
    definition_of_done IS NULL OR length(trim(definition_of_done)) > 0
  ),
  CONSTRAINT goal_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT goal_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;
