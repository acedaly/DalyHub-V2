-- Migration number: 0013 	 2026-07-26
--
-- AREA-05 Area lifecycle: the Areas-owned archival slice. Area identity, title,
-- soft-delete and parentage stay in the spine (`entities` + `spine_records` +
-- structural `entity_links`); the spine deliberately models only completion and
-- soft-delete (ADR-014 §4.5), and Areas never complete. Archival is a THIRD,
-- reversible lifecycle state distinct from both — it must apply to a lived-in
-- (non-empty) Area and must keep the record readable by its canonical URL, which
-- the spine's soft-delete (blocks non-empty containers; returns not-found) cannot
-- express. So archival is stored the way every other additive Area/Goal/Project
-- detail slice is stored (the `project_details`/`goal_details` precedent, ADR-037
-- / ADR-039): a small, module-owned table keyed by `(workspace_id, entity_id)`,
-- pinned to the `area` entity type by a composite foreign key, mutated only
-- through the trusted `AreaSettingsRepository`. It is NOT a second identity model:
-- it holds ONE nullable timestamp and nothing the spine already owns.
--
-- This migration runs AFTER 0001–0012. It is purely ADDITIVE: it CREATES one
-- table plus one index and alters no existing table or data.
--
-- Conventions (identical to `project_details`, migration 0008): timestamps are
-- ISO-8601 UTC TEXT written by the application; STRICT enforces column typing; the
-- composite foreign key to `entities (workspace_id, id, type)` guarantees a detail
-- row can only reference an `area` entity in the same workspace. `ON DELETE
-- RESTRICT` matches every other detail table — a permanent Area deletion removes
-- this row FIRST, in FK-safe order, inside the SpineRepository's atomic purge
-- batch (AREA-05).
--
-- No backfill: an Area has no `area_details` row until it is first archived (or
-- archived then restored); its absence means "active" (never archived), exactly as
-- a missing row means the default everywhere else. There are no pre-existing
-- archived Areas to seed.

CREATE TABLE area_details (
  workspace_id  TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  entity_type   TEXT NOT NULL DEFAULT 'area',
  archived_at   TEXT,
  updated_at    TEXT NOT NULL,
  CONSTRAINT area_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT area_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT area_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT area_details_entity_type CHECK (entity_type = 'area'),
  -- archived_at is nullable (active / never-archived), but never an empty string.
  CONSTRAINT area_details_archived_at_not_empty
    CHECK (archived_at IS NULL OR length(archived_at) > 0),
  CONSTRAINT area_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT area_details_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- Access path: exclude archived Areas from the active collection, and find the
-- archived set, without a table scan.
CREATE INDEX area_details_workspace_archived_idx
  ON area_details (workspace_id, archived_at);
