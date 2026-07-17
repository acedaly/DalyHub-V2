-- Migration number: 0003 	 2026-07-17
--
-- FND-04 EntityLinks: typed, bidirectional links between any two entities as a
-- KERNEL PRIMITIVE — one directed row per relationship, discoverable from either
-- endpoint, workspace-isolated, and centrally governed.
--
-- See ADR-011 (EntityLink Persistence and Lifecycle) and ADR-002 (EntityLinks).
--
-- This migration runs AFTER 0001 (entities) and 0002 (workspaces + enforced
-- entities.workspace_id FK). It does two things:
--   1. Add the parent UNIQUE key `entities (workspace_id, id)` that the link
--      table's COMPOSITE foreign keys reference.
--   2. Create the `entity_links` table, its uniqueness/identity constraint and
--      its access-path indexes.
--
-- Conventions (identical to entities): timestamps are ISO-8601 UTC TEXT written
-- by the application; `type` is a free-form identifier validated by the kernel,
-- NOT a database enum, so future modules register link types without a
-- migration; STRICT enforces column typing so a schema mistake fails loudly.

-- 1. Parent key for the composite foreign keys below.
--    A SQLite/D1 composite foreign key must reference columns that carry a
--    UNIQUE (or PRIMARY KEY) index. `entities.id` is already the primary key, but
--    the FK references the PAIR `(workspace_id, id)` — so that a link can only
--    reference an entity that is BOTH the named entity AND in the link's
--    workspace, making a cross-workspace endpoint structurally impossible. That
--    exact pair needs its own unique index.
CREATE UNIQUE INDEX entities_workspace_id_key ON entities (workspace_id, id);

-- 2. The EntityLink relationship record. It is NOT an entity: no title, no entity
--    type, no soft-searchable header — only the fields the relationship justifies.
CREATE TABLE entity_links (
  id               TEXT NOT NULL PRIMARY KEY,
  workspace_id     TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  type             TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  CONSTRAINT entity_links_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT entity_links_workspace_id_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT entity_links_source_not_empty CHECK (length(source_entity_id) > 0),
  CONSTRAINT entity_links_target_not_empty CHECK (length(target_entity_id) > 0),
  CONSTRAINT entity_links_type_not_empty CHECK (length(type) > 0),
  -- Direction is meaningful, but a link from an entity to ITSELF is meaningless.
  CONSTRAINT entity_links_no_self_link
    CHECK (source_entity_id <> target_entity_id),
  -- The workspace must exist. (Also transitively guaranteed by the endpoint FKs,
  -- but stated directly so the boundary is explicit and self-documenting.)
  CONSTRAINT entity_links_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT,
  -- Both endpoints must exist IN THE SAME WORKSPACE as the link. The composite
  -- key `(workspace_id, source/target_entity_id) -> entities (workspace_id, id)`
  -- makes a cross-workspace endpoint impossible at the database level — not just
  -- in application code. ON DELETE RESTRICT means a referenced entity cannot be
  -- HARD-deleted while links point at it (entity SOFT-delete leaves link rows
  -- untouched; hiding is handled by queries, not by cascading writes).
  CONSTRAINT entity_links_source_fk
    FOREIGN KEY (workspace_id, source_entity_id)
    REFERENCES entities (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT entity_links_target_fk
    FOREIGN KEY (workspace_id, target_entity_id)
    REFERENCES entities (workspace_id, id) ON DELETE RESTRICT
) STRICT;

-- One stable relationship identity per (workspace, source, target, type),
-- INCLUDING after unlinking (the unique index spans deleted rows too). This
-- prevents duplicate links, preserves the stable link id across unlink/restore,
-- is the exact-relationship lookup path used by create, and is the final
-- backstop against concurrent duplicate inserts.
CREATE UNIQUE INDEX entity_links_identity_idx
  ON entity_links (workspace_id, source_entity_id, target_entity_id, type);

-- Access path: active OUTGOING links of an entity (anchor is the source),
-- ordered for deterministic (created_at, id) cursor pagination. Partial over the
-- not-unlinked subset keeps this hot path small.
CREATE INDEX entity_links_active_source_idx
  ON entity_links (workspace_id, source_entity_id, created_at, id)
  WHERE deleted_at IS NULL;

-- Access path: active INCOMING links of an entity (anchor is the target).
CREATE INDEX entity_links_active_target_idx
  ON entity_links (workspace_id, target_entity_id, created_at, id)
  WHERE deleted_at IS NULL;

-- Access path: type-filtered active OUTGOING links.
CREATE INDEX entity_links_active_source_type_idx
  ON entity_links (workspace_id, source_entity_id, type, created_at, id)
  WHERE deleted_at IS NULL;

-- Access path: type-filtered active INCOMING links.
CREATE INDEX entity_links_active_target_type_idx
  ON entity_links (workspace_id, target_entity_id, type, created_at, id)
  WHERE deleted_at IS NULL;
