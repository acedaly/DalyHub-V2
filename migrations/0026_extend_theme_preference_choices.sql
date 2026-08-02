-- THEME-02: allow the Modern Light and Modern Dark themes to be persisted.
--
-- 0023 added owner_app_preferences.theme with a CHECK naming the themes that
-- existed at the time. SQLite cannot alter a CHECK in place, so WIDENING the set of
-- legal themes requires the standard table rebuild -- the same procedure 0021
-- already used to widen meeting_items.kind.
--
-- This is a rebuild, but it is not a data change:
--
--   * every column keeps its name, type, default and constraint
--   * every row is copied by an explicit column list, so a future ALTER that
--     reorders the physical columns cannot silently shift a value into the wrong
--     column
--   * the ONLY difference is that theme now also accepts 'modern-light' and
--     'modern-dark'
--   * no existing stored value is rewritten, so an owner on 'system', 'daly-dark'
--     or 'ember' is still on exactly that theme afterwards
--
-- The constraint is kept deliberately, rather than dropped in favour of "the
-- application validates it anyway". The storage boundary is the last line of
-- defence for a value that is written into the html data-theme attribute, and a
-- CHECK that names the legal set is what makes an unknown theme a write failure
-- rather than an unstyled page. parseThemePreference in
-- app/kernel/preferences/theme-preference.ts is the matching application guard and
-- must be extended in the same change. A unit test pins the two lists together.
--
-- The legacy 'light'/'dark' values remain deliberately absent, unchanged from 0023.
-- They never reached this table, and the application maps them before any write.

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
  theme TEXT NOT NULL DEFAULT 'system',
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
  CHECK (default_task_destination IN ('inbox', 'chosen_parent')),
  CHECK (theme IN (
    'system',
    'daly-light',
    'daly-dark',
    'modern-light',
    'modern-dark',
    'eucalypt',
    'coastal',
    'ember'
  ))
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
  theme,
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
  theme,
  default_task_destination
FROM owner_app_preferences;

DROP TABLE owner_app_preferences;

ALTER TABLE owner_app_preferences_new RENAME TO owner_app_preferences;

-- Recreated because it belonged to the dropped table.
CREATE INDEX owner_app_preferences_workspace_idx
  ON owner_app_preferences (workspace_id, updated_at DESC);
