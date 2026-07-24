-- DIARY-01A: the Diary Entry persistence slice. A Diary Entry's identity,
-- title, workspace and lifecycle stay ordinary `entities` fields (type
-- 'diary'); Diary Entries are NOT part of the Area→Goal→Project→Task spine
-- (AGENTS.md §4) and add no spine_records row. This additive, STRICT table owns
-- ONLY the chronology-bearing detail slice every entry must carry: the entry
-- type, an OPTIONAL Markdown body, the OCCURRED-AT instant that positions the
-- entry on the Timeline, the capture TIMEZONE and the capture SOURCE. Rendered
-- HTML is never stored (FND-08 / ADR-006 / ADR-015).
--
-- Unlike note_details (where an absent row means "empty content" and the read
-- LEFT-JOINs), EVERY Diary Entry MUST have EXACTLY ONE row here: the Timeline
-- read INNER-JOINs this table, so a detail-less 'diary' entity would be
-- invisible and unrepairable through the DiaryRepository. Going forward the
-- generic EntityRepository refuses to create a 'diary' entity, so a fresh
-- detail-less entry is impossible. This migration additionally BACKFILLS any
-- pre-existing 'diary' entity (which, before DIARY-01A, the generic repository
-- could create) with an explicit-default detail row (see the INSERT below), so
-- the "every diary entity has a detail row" invariant holds for old AND new
-- data and no entity is left in a permanent partial state (ADR-041 §41.2).
--
-- Chronology is the primary organising principle (ADR-041): `occurred_at` is the
-- Timeline sort key, distinct from the record's `created_at`/`updated_at`, so an
-- entry can be backdated (Memory Mode) or future-dated. `occurred_at` is stored
-- as the same fixed-width ISO-8601 UTC TEXT the rest of the kernel uses, so it
-- also serves as a lexicographically chronological sort key.
CREATE TABLE diary_entry_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'diary',
  entry_type TEXT NOT NULL,
  body TEXT,
  occurred_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  source_channel TEXT NOT NULL DEFAULT 'manual',
  source_reference TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT diary_entry_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT diary_entry_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT diary_entry_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT diary_entry_details_entity_type CHECK (entity_type = 'diary'),
  CONSTRAINT diary_entry_details_entry_type_not_empty CHECK (length(entry_type) > 0),
  CONSTRAINT diary_entry_details_occurred_at_not_empty CHECK (length(occurred_at) > 0),
  CONSTRAINT diary_entry_details_timezone_not_empty CHECK (length(timezone) > 0),
  CONSTRAINT diary_entry_details_source_channel_not_empty CHECK (length(source_channel) > 0),
  CONSTRAINT diary_entry_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT diary_entry_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- Timeline access path: newest/oldest by occurred_at within a workspace, with
-- entity_id as the total-order tiebreaker matching the cursor's (occurred_at, id).
CREATE INDEX diary_entry_details_timeline
  ON diary_entry_details (workspace_id, occurred_at, entity_id);

-- Type-filtered Timeline access path: entries of a given type by occurred_at.
CREATE INDEX diary_entry_details_type_timeline
  ON diary_entry_details (workspace_id, entry_type, occurred_at, entity_id);

-- Backfill any pre-existing 'diary' entity with an explicit-default detail row so
-- it stays visible/editable through the DiaryRepository's INNER-JOIN read. The
-- defaults are deliberate and honest: entry_type 'note' (the neutral default
-- kind), occurred_at = the entity's own created_at (the only truthful chronology
-- signal available for a legacy row), timezone 'UTC', source 'manual', and
-- updated_at = the entity's updated_at. Idempotent (this migration runs once, and
-- the primary key would reject a duplicate regardless). New entries never reach
-- this path — they are created with their real slice by the repository.
INSERT INTO diary_entry_details
  (workspace_id, entity_id, entry_type, body, occurred_at, timezone,
   source_channel, source_reference, updated_at)
SELECT workspace_id, id, 'note', NULL, created_at, 'UTC', 'manual', NULL, updated_at
FROM entities
WHERE type = 'diary';
