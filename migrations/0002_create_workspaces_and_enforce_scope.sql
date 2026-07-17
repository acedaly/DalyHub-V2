-- Migration number: 0002 	 2026-07-17
--
-- FND-03 Workspace isolation: make Workspace a real, persisted kernel/security
-- boundary and give `entities.workspace_id` an ENFORCED foreign key.
--
-- See ADR-010 (Server-side Workspace Context) and ADR-003 (Workspace Isolation).
--
-- What this migration does, in order:
--   1. Create the minimal `workspaces` table (id + UTC timestamps only).
--   2. Back-fill a workspace record for every DISTINCT workspace_id already
--      present in `entities`, so no existing row is orphaned. DalyHub V2 is new
--      but the base table may already hold rows — we do NOT assume it is empty.
--   3. Rebuild `entities` with a foreign key to `workspaces (id)` using
--      `ON DELETE RESTRICT`, via SQLite's supported table-rebuild pattern
--      (create-new -> copy -> drop-old -> rename), because SQLite/D1 cannot add
--      a foreign key with ALTER TABLE.
--   4. Recreate every access-path index from migration 0001.
--
-- Foreign-key safety: `workspaces` is fully populated BEFORE `entities_new` is
-- filled, so every copied row already has a matching parent and the FK check
-- passes with enforcement left ON. We deliberately do NOT disable foreign keys.
-- Timestamps use the same ISO-8601 UTC millisecond format the application writes
-- (e.g. 2026-07-17T12:34:56.789Z); STRICT typing is preserved throughout.

-- 1. The workspace boundary record. Minimal by design (ADR-010): identity and
--    lifecycle only — no name, membership, role, billing, theme or settings.
CREATE TABLE workspaces (
  id         TEXT NOT NULL PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT workspaces_id_not_empty CHECK (length(id) > 0)
) STRICT;

-- 2. Back-fill: one workspace per distinct existing workspace_id. Its timestamps
--    are derived from the entities it already owns (earliest creation / latest
--    update), keeping the UTC convention without inventing a wall-clock value.
INSERT INTO workspaces (id, created_at, updated_at)
SELECT workspace_id, MIN(created_at), MAX(updated_at)
FROM entities
GROUP BY workspace_id;

-- 3. Rebuild `entities` with the enforced foreign key. The new table is
--    column-for-column identical to migration 0001 plus the FK constraint.
CREATE TABLE entities_new (
  id           TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  CONSTRAINT entities_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT entities_workspace_id_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT entities_type_not_empty CHECK (length(type) > 0),
  CONSTRAINT entities_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT entities_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;

-- Copy every existing row verbatim — ids, types, titles, timestamps and
-- soft-delete state are preserved exactly.
INSERT INTO entities_new
  (id, workspace_id, type, title, created_at, updated_at, deleted_at)
SELECT id, workspace_id, type, title, created_at, updated_at, deleted_at
FROM entities;

-- Swap the rebuilt table in. Nothing references the old `entities`, so the drop
-- is safe; the temporary table name does not survive the rename.
DROP TABLE entities;
ALTER TABLE entities_new RENAME TO entities;

-- 4. Recreate the access-path indexes exactly as in migration 0001 (a table
--    rebuild drops the originals). These keep scoped list/read queries fast.
CREATE INDEX entities_workspace_created_idx
  ON entities (workspace_id, created_at, id);

CREATE INDEX entities_workspace_type_created_idx
  ON entities (workspace_id, type, created_at, id);

CREATE INDEX entities_active_workspace_created_idx
  ON entities (workspace_id, created_at, id)
  WHERE deleted_at IS NULL;

CREATE INDEX entities_active_workspace_type_created_idx
  ON entities (workspace_id, type, created_at, id)
  WHERE deleted_at IS NULL;
