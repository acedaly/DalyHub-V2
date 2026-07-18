-- Migration number: 0004 	 2026-07-18
--
-- FND-05 Shared Activity model: ONE append-only, workspace-isolated Activity
-- stream that every module and entity type writes to — the source of the record
-- Timeline, the workspace Activity Feed and the security audit trail.
--
-- See ADR-012 (Activity Persistence and Atomic Mutation Recording) and ADR-005
-- (Shared Activity Model).
--
-- This migration runs AFTER 0001 (entities), 0002 (workspaces + enforced
-- entities.workspace_id FK) and 0003 (entity_links + parent
-- entities (workspace_id, id) key). It only CREATES new tables and indexes; it
-- does NOT touch `entities` or `entity_links`, so all existing data survives
-- unchanged. There is NO backfill: the Activity stream begins when FND-05 is
-- deployed, and events are never fabricated for records created before this
-- migration (ADR-012).
--
-- Conventions (identical to the existing tables): timestamps are ISO-8601 UTC
-- TEXT written by the application; `type`, `actor_type` and `role` are free-form
-- identifiers validated by the kernel, NOT database enums, so future modules and
-- actors appear without a migration; STRICT enforces column typing so a schema
-- mistake fails loudly. There is deliberately NO `updated_at`, `deleted_at`,
-- title, entity type or mutable status column: an Activity event is an immutable
-- historical fact, not an Entity.

-- 1. The Activity event: one uniform, append-only historical fact per meaningful
--    mutation. A normalised subject association (below) — not a single embedded
--    entity id — records which entities the event relates to, so one event can
--    relate to one OR many entities (e.g. both endpoints of an EntityLink).
CREATE TABLE activities (
  id            TEXT NOT NULL PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  type          TEXT NOT NULL,
  actor_type    TEXT NOT NULL,
  actor_id      TEXT,
  occurred_at   TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  CONSTRAINT activities_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT activities_workspace_id_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT activities_type_not_empty CHECK (length(type) > 0),
  CONSTRAINT activities_actor_type_not_empty CHECK (length(actor_type) > 0),
  -- actor_id is nullable (e.g. the system actor), but never an empty string.
  CONSTRAINT activities_actor_id_not_empty
    CHECK (actor_id IS NULL OR length(actor_id) > 0),
  CONSTRAINT activities_occurred_at_not_empty CHECK (length(occurred_at) > 0),
  CONSTRAINT activities_payload_not_empty CHECK (length(payload_json) > 0),
  -- The workspace must exist. ON DELETE RESTRICT: a workspace that still owns
  -- Activity history cannot be hard-deleted out from under it.
  CONSTRAINT activities_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;

-- Parent key for the subject association's COMPOSITE foreign key. The FK
-- references the PAIR (workspace_id, id) so a subject can only reference an
-- activity that is BOTH the named event AND in the subject's workspace — making a
-- cross-workspace subject/activity pairing structurally impossible. That exact
-- pair needs its own unique index (the primary key alone indexes only `id`).
CREATE UNIQUE INDEX activities_workspace_id_key ON activities (workspace_id, id);

-- 2. The normalised subject association: which entity an event relates to, and in
--    what role. Same-workspace composite foreign keys make cross-workspace
--    associations impossible at the database level; the composite primary key
--    forbids duplicate (activity, entity) pairs.
CREATE TABLE activity_subjects (
  workspace_id  TEXT NOT NULL,
  activity_id   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  role          TEXT NOT NULL,
  CONSTRAINT activity_subjects_workspace_id_not_empty
    CHECK (length(workspace_id) > 0),
  CONSTRAINT activity_subjects_activity_id_not_empty
    CHECK (length(activity_id) > 0),
  CONSTRAINT activity_subjects_entity_id_not_empty
    CHECK (length(entity_id) > 0),
  CONSTRAINT activity_subjects_role_not_empty CHECK (length(role) > 0),
  -- One association per (activity, entity): no duplicate subject rows. Scoped by
  -- workspace_id so the key aligns with the composite foreign keys below.
  CONSTRAINT activity_subjects_pk
    PRIMARY KEY (workspace_id, activity_id, entity_id),
  -- The activity must exist IN THE SAME WORKSPACE. ON DELETE RESTRICT: a
  -- referenced activity cannot be hard-deleted while a subject points at it.
  CONSTRAINT activity_subjects_activity_fk
    FOREIGN KEY (workspace_id, activity_id)
    REFERENCES activities (workspace_id, id) ON DELETE RESTRICT,
  -- The subject entity must exist IN THE SAME WORKSPACE. ON DELETE RESTRICT: a
  -- referenced entity cannot be HARD-deleted while history points at it, so a
  -- deleted entity's Timeline is preserved (soft-delete leaves this row intact;
  -- entity soft-delete is a query-time state, not a row removal).
  CONSTRAINT activity_subjects_entity_fk
    FOREIGN KEY (workspace_id, entity_id)
    REFERENCES entities (workspace_id, id) ON DELETE RESTRICT
) STRICT;

-- Access path: the workspace Activity Feed, ordered for deterministic
-- (occurred_at, id) keyset pagination. A single ascending index also serves the
-- newest-first (DESC) scan — SQLite can walk an index in reverse.
CREATE INDEX activities_workspace_occurred_idx
  ON activities (workspace_id, occurred_at, id);

-- Access path: the workspace feed filtered to a single event type, same ordering.
CREATE INDEX activities_workspace_type_occurred_idx
  ON activities (workspace_id, type, occurred_at, id);

-- Access path: an entity Timeline — find the activities an entity is a subject
-- of. The join then orders by the activity's (occurred_at, id). (Subject lookup
-- BY ACTIVITY id — fetching all subjects of a page — is served by the composite
-- primary key's leftmost (workspace_id, activity_id) prefix, so it needs no extra
-- index.)
CREATE INDEX activity_subjects_entity_idx
  ON activity_subjects (workspace_id, entity_id, activity_id);
