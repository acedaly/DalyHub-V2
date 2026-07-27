-- SETTINGS-01A: core owner/workspace application preferences.
--
-- Preferences are scoped by workspace AND authenticated owner. Core behavioural
-- preferences use explicit typed columns; navigation visibility is stored as a
-- small versioned representation because it is a variable-length module list.

CREATE TABLE owner_app_preferences (
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
  CHECK (length(created_at) > 0 AND length(updated_at) > 0)
) STRICT;

CREATE INDEX owner_app_preferences_workspace_idx
  ON owner_app_preferences (workspace_id, updated_at DESC);

