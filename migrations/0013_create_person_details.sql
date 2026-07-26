-- PEOPLE-01: the Person persistence slice. A Person's identity, display name,
-- workspace and lifecycle stay ordinary `entities` fields (type 'person');
-- People are NOT part of the Area→Goal→Project→Task spine (AGENTS.md §4) and add
-- no spine_records row. This additive, STRICT table owns the structured
-- relationship detail slice every Person carries — names, contact points,
-- relationship, follow-up cadence and avatar — plus the reversible `archived_at`
-- put-away state (distinct from the entity's `deleted_at` soft-deletion).
--
-- Like diary_entry_details (and unlike note_details), EVERY Person MUST have
-- EXACTLY ONE row here: reads INNER-JOIN this table, so a detail-less 'person'
-- entity would be invisible and unrepairable through the PersonRepository. Going
-- forward the generic EntityRepository refuses to CREATE a 'person' entity (only
-- the PersonRepository does, atomically), so a fresh detail-less Person is
-- impossible. No backfill is needed: before this migration no 'person' entity
-- could exist (the type was never created by any repository).
--
-- `tags` is a JSON array of strings (bounded and validated in the kernel). Date
-- fields (birthday, next_follow_up, last_interaction) are wall-calendar
-- YYYY-MM-DD strings, not instants. The composite FK to entities(workspace_id,
-- id, type) makes a person detail row that disagrees with its entity type
-- impossible; ON DELETE RESTRICT keeps the detail slice through soft-deletion.
CREATE TABLE person_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'person',
  preferred_name TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  pronouns TEXT,
  organisation TEXT,
  role TEXT,
  department TEXT,
  email TEXT,
  secondary_email TEXT,
  mobile TEXT,
  work_phone TEXT,
  address TEXT,
  website TEXT,
  birthday TEXT,
  relationship TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  favourite_contact_method TEXT,
  follow_up_frequency TEXT,
  next_follow_up TEXT,
  last_interaction TEXT,
  photo_url TEXT,
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT person_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT person_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT person_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT person_details_entity_type CHECK (entity_type = 'person'),
  CONSTRAINT person_details_tags_not_empty CHECK (length(tags) > 0),
  CONSTRAINT person_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT person_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- Collection access path: the People collection joins entities and filters by the
-- archived split; this index serves the active/archived partitioning within a
-- workspace. Ordering stays on entities(workspace_id, type, created_at, id).
CREATE INDEX person_details_workspace_archived
  ON person_details (workspace_id, archived_at, entity_id);
