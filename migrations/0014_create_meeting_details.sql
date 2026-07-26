-- MEET-01: first-class Meeting detail and structured decision/outcome slices.
CREATE TABLE meeting_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'meeting',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  timezone TEXT NOT NULL,
  location TEXT,
  mode TEXT,
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  agenda_markdown TEXT NOT NULL DEFAULT '',
  notes_markdown TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entity_id),
  CHECK (entity_type = 'meeting'),
  CHECK (length(starts_at) > 0 AND length(timezone) > 0),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (status IN ('planned', 'completed', 'cancelled')),
  CHECK (mode IS NULL OR mode IN ('in_person', 'phone', 'online')),
  FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

CREATE TABLE meeting_items (
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
  CHECK (kind IN ('decision', 'outcome')),
  CHECK (length(body_markdown) > 0),
  CHECK (position >= 0),
  FOREIGN KEY (workspace_id, meeting_id)
    REFERENCES meeting_details (workspace_id, entity_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX meeting_details_collection
  ON meeting_details (workspace_id, archived_at, starts_at, entity_id);
CREATE INDEX meeting_items_order
  ON meeting_items (workspace_id, meeting_id, kind, position, id);

