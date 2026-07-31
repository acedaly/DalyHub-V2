-- TASKS-04: explicit Task destination preference.
--
-- Existing UX-01 preferences stored only an optional parent id/kind. TASKS-04
-- makes Inbox the default and rootless Tasks valid, so a saved legacy parent must
-- not silently keep filing capture ahead of Inbox. This additive mode column makes
-- the user's choice explicit: 'inbox' (default) or 'chosen_parent'.

ALTER TABLE owner_app_preferences
  ADD COLUMN default_task_destination TEXT NOT NULL DEFAULT 'inbox'
  CHECK (default_task_destination IN ('inbox', 'chosen_parent'));

-- TASKS-04: structured, calendar-based recurrence.
--
-- Recurrence is not stored as prose. One active occurrence may carry one validated
-- rule. The series id and sequence let completion create a successor idempotently
-- and give the database a duplicate-prevention boundary.
CREATE TABLE task_recurrence_rules (
  workspace_id    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  entity_type     TEXT NOT NULL DEFAULT 'task',
  date_kind       TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  interval        INTEGER NOT NULL DEFAULT 1,
  weekdays        TEXT,
  anchor_day      INTEGER,
  anchor_month    INTEGER,
  series_id       TEXT NOT NULL,
  sequence        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CONSTRAINT task_recurrence_workspace_id_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT task_recurrence_entity_id_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT task_recurrence_entity_type_is_task CHECK (entity_type = 'task'),
  CONSTRAINT task_recurrence_date_kind_valid CHECK (date_kind IN ('scheduled', 'due')),
  CONSTRAINT task_recurrence_frequency_valid
    CHECK (frequency IN ('day', 'weekday', 'week', 'month', 'year')),
  CONSTRAINT task_recurrence_interval_valid CHECK (interval BETWEEN 1 AND 99),
  CONSTRAINT task_recurrence_weekdays_bounded
    CHECK (weekdays IS NULL OR (length(weekdays) BETWEEN 1 AND 13)),
  CONSTRAINT task_recurrence_anchor_day_valid
    CHECK (anchor_day IS NULL OR anchor_day BETWEEN 1 AND 31),
  CONSTRAINT task_recurrence_anchor_month_valid
    CHECK (anchor_month IS NULL OR anchor_month BETWEEN 1 AND 12),
  CONSTRAINT task_recurrence_month_anchor_required
    CHECK (frequency <> 'month' OR anchor_day IS NOT NULL),
  CONSTRAINT task_recurrence_year_anchor_required
    CHECK (frequency <> 'year' OR (anchor_day IS NOT NULL AND anchor_month IS NOT NULL)),
  CONSTRAINT task_recurrence_series_id_not_empty CHECK (length(series_id) > 0),
  CONSTRAINT task_recurrence_series_id_bounded CHECK (length(series_id) <= 128),
  CONSTRAINT task_recurrence_sequence_valid CHECK (sequence >= 0),
  CONSTRAINT task_recurrence_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT task_recurrence_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT task_recurrence_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT task_recurrence_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  CONSTRAINT task_recurrence_series_sequence_unique
    UNIQUE (workspace_id, series_id, sequence)
) STRICT;

CREATE INDEX task_recurrence_workspace_series_idx
  ON task_recurrence_rules (workspace_id, series_id, sequence);

CREATE INDEX task_recurrence_workspace_frequency_idx
  ON task_recurrence_rules (workspace_id, frequency, date_kind);
