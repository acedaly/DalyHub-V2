-- M3-01: remove owner_app_preferences.theme.
--
-- DalyHub no longer has a theme feature. ADR-074 replaced seven curated palettes
-- with ONE generated light/dark pair selected by prefers-color-scheme, so there
-- is no longer a choice to persist: no picker, no cookie mirror, no data-theme
-- attribute, and nothing left that reads this column.
--
-- The column goes rather than being left in place unused. It carries a CHECK
-- that names seven palettes which no longer exist anywhere in the product, and a
-- schema that describes a feature the application has deleted is a schema that
-- lies to the next agent. This one would lie in a way that passes every test.
--
-- SQLite cannot drop a column that participates in a CHECK, so this uses the
-- standard table rebuild, the same procedure 0026 used to widen this exact CHECK
-- and 0021 used before it for meeting_items.kind. It is a rebuild, but it is not
-- a data change:
--
--   * every SURVIVING column keeps its name, type, default and constraint
--   * every row is copied by an explicit column list, so a future ALTER that
--     reorders the physical columns cannot silently shift a value into the wrong
--     column
--   * the ONLY difference is that theme and its CHECK are absent
--   * no other stored value is rewritten, so an owner timezone, date format,
--     landing destination, navigation config and task defaults are all exactly
--     what they were
--
-- The stored theme values themselves are discarded, deliberately and
-- irreversibly. They name palettes that no longer have CSS behind them, so
-- keeping them would preserve bytes rather than meaning. A production export is
-- taken before this is applied (the AGENTS.md database procedure), so the values
-- remain recoverable from that backup if the decision is ever revisited.

CREATE TABLE owner_app_preferences_new (
  workspace_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  date_format TEXT NOT NULL DEFAULT 'd_mmm_yyyy',
  first_day_of_week TEXT NOT NULL DEFAULT 'monday',
  default_landing_destination TEXT NOT NULL DEFAULT 'today',
  default_tasks_view TEXT NOT NULL DEFAULT 'focus',
  default_diary_mode TEXT NOT NULL DEFAULT 'day',
  navigation_config TEXT NOT NULL DEFAULT '{"version":1,"hiddenModuleIds":[]}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  default_task_capture_parent_id TEXT,
  default_task_capture_parent_kind TEXT,
  default_task_view_id TEXT,
  default_task_destination TEXT NOT NULL DEFAULT 'inbox',
  PRIMARY KEY (workspace_id, owner_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CHECK (length(owner_id) > 0 AND length(owner_id) <= 256),
  CHECK (length(timezone) > 0 AND length(timezone) <= 128),
  CHECK (date_format IN ('dmy_slash', 'd_mmm_yyyy', 'iso')),
  CHECK (first_day_of_week IN ('monday', 'sunday')),
  CHECK (default_landing_destination IN ('today', 'tasks', 'diary', 'projects', 'notes')),
  CHECK (default_tasks_view IN ('focus', 'matrix', 'sectors', 'all')),
  CHECK (default_diary_mode IN ('day', 'timeline')),
  CHECK (json_valid(navigation_config)),
  CHECK (version >= 1),
  CHECK (length(created_at) > 0 AND length(updated_at) > 0),
  CHECK (
    default_task_capture_parent_kind IS NULL
    OR default_task_capture_parent_kind IN ('area', 'project')
  ),
  CHECK (default_task_destination IN ('inbox', 'chosen_parent'))
) STRICT;

INSERT INTO owner_app_preferences_new (
  workspace_id,
  owner_id,
  timezone,
  date_format,
  first_day_of_week,
  default_landing_destination,
  default_tasks_view,
  default_diary_mode,
  navigation_config,
  version,
  created_at,
  updated_at,
  default_task_capture_parent_id,
  default_task_capture_parent_kind,
  default_task_view_id,
  default_task_destination
)
SELECT
  workspace_id,
  owner_id,
  timezone,
  date_format,
  first_day_of_week,
  default_landing_destination,
  default_tasks_view,
  default_diary_mode,
  navigation_config,
  version,
  created_at,
  updated_at,
  default_task_capture_parent_id,
  default_task_capture_parent_kind,
  default_task_view_id,
  default_task_destination
FROM owner_app_preferences;

DROP TABLE owner_app_preferences;

ALTER TABLE owner_app_preferences_new RENAME TO owner_app_preferences;

-- Recreated because it belonged to the dropped table.
CREATE INDEX owner_app_preferences_workspace_idx
  ON owner_app_preferences (workspace_id, updated_at DESC);
