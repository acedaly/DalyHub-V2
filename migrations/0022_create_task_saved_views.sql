-- TASKS-03: persistent, workspace- and owner-scoped Tasks saved views.
--
-- ADDITIVE ONLY. No existing table is rebuilt, no task data is rewritten and no
-- existing row is touched: this creates one new table and adds one nullable
-- column to the existing preferences table.
--
-- The stored `config` is a VALIDATED DECLARATIVE configuration (see
-- `app/kernel/task-views/task-view-config.ts`) — a small JSON object naming filter
-- DIMENSIONS from closed sets. It never contains SQL, a column name, a repository
-- field or an ordering expression, and the repository maps a validated dimension
-- to its own trusted predicate. `config_version` records the format the row was
-- written with, so a later shape change is migratable without a destructive
-- rewrite; readers parse leniently and drop what they do not recognise.
--
-- The BUILT-IN views (Inbox, Today, Upcoming, Overdue, Waiting, Delegated,
-- Someday/Maybe, Completed) are deliberately NOT seeded here. They are derived in
-- code, so they cost no storage, cannot be deleted, and cannot silently mutate.

CREATE TABLE task_saved_views (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config_version INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(id) > 0 AND length(id) <= 128),
  CHECK (length(owner_id) > 0 AND length(owner_id) <= 256),
  CHECK (length(trim(name)) > 0 AND length(name) <= 80),
  CHECK (config_version >= 1),
  CHECK (json_valid(config)),
  -- A saved view is a small declarative object; a bound length keeps a hostile or
  -- runaway write from becoming an unbounded read on every page load.
  CHECK (length(config) <= 4096),
  CHECK (length(created_at) > 0 AND length(updated_at) > 0)
) STRICT;

-- One owner cannot hold two views with the same name (case-insensitively), so the
-- switcher never shows two indistinguishable entries.
CREATE UNIQUE INDEX task_saved_views_owner_name
  ON task_saved_views (workspace_id, owner_id, lower(name));

-- The listing access path: an owner's views in one workspace, name-ordered.
CREATE INDEX task_saved_views_owner
  ON task_saved_views (workspace_id, owner_id, name, id);

-- The owner's chosen DEFAULT Tasks view. Nullable and unconstrained by a foreign
-- key on purpose: it may name either a built-in view id (derived in code, so it has
-- no row to reference) or a saved-view id, and a deleted saved view must degrade to
-- "no default" rather than block the delete. The application validates the stored
-- value on read and falls back to the standard view when it no longer resolves.
ALTER TABLE owner_app_preferences
  ADD COLUMN default_task_view_id TEXT;
