

ALTER TABLE asset_details ADD COLUMN current_meter_value INTEGER;
ALTER TABLE asset_details ADD COLUMN current_meter_unit TEXT;
ALTER TABLE asset_details ADD COLUMN current_meter_date TEXT;

CREATE INDEX asset_details_meter
  ON asset_details (workspace_id, archived_at, current_meter_unit, current_meter_value);


CREATE TABLE asset_events (
  id                TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  asset_id          TEXT NOT NULL,
  asset_entity_type TEXT NOT NULL DEFAULT 'asset',
  category          TEXT NOT NULL,
  title             TEXT NOT NULL,
  event_date        TEXT NOT NULL,
  completed_at      TEXT,
  description       TEXT,
  provider          TEXT,
  person_id         TEXT,
  cost_minor        INTEGER,
  value_minor       INTEGER,
  currency_code     TEXT,
  meter_value       INTEGER,
  meter_unit        TEXT,
  warranty_expiry   TEXT,
  next_due_date     TEXT,
  task_id           TEXT,
  note_id           TEXT,
  obligation_id     TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  archived_at       TEXT,
  deleted_at        TEXT,
  CONSTRAINT asset_events_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT asset_events_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT asset_events_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT asset_events_asset_not_empty CHECK (length(asset_id) > 0),
  CONSTRAINT asset_events_asset_entity_type CHECK (asset_entity_type = 'asset'),
  CONSTRAINT asset_events_category_valid CHECK (
    category IN (
      'purchase', 'service', 'repair', 'inspection', 'registration', 'renewal',
      'warranty', 'insurance', 'upgrade', 'modification', 'damage', 'valuation',
      'disposal', 'history'
    )
  ),
  CONSTRAINT asset_events_title_not_empty CHECK (length(title) > 0),
  CONSTRAINT asset_events_title_bounded CHECK (length(title) <= 200),
  CONSTRAINT asset_events_event_date_shape CHECK (length(event_date) = 10),
  CONSTRAINT asset_events_warranty_shape CHECK (
    warranty_expiry IS NULL OR length(warranty_expiry) = 10
  ),
  CONSTRAINT asset_events_next_due_shape CHECK (
    next_due_date IS NULL OR length(next_due_date) = 10
  ),
  CONSTRAINT asset_events_cost_nonneg CHECK (cost_minor IS NULL OR cost_minor >= 0),
  CONSTRAINT asset_events_value_nonneg CHECK (value_minor IS NULL OR value_minor >= 0),
  CONSTRAINT asset_events_currency_shape CHECK (
    currency_code IS NULL OR length(currency_code) = 3
  ),
  CONSTRAINT asset_events_currency_required_with_amount CHECK (
    (cost_minor IS NULL AND value_minor IS NULL) OR currency_code IS NOT NULL
  ),
  CONSTRAINT asset_events_meter_nonneg CHECK (meter_value IS NULL OR meter_value >= 0),
  CONSTRAINT asset_events_meter_unit_valid CHECK (
    meter_unit IS NULL OR meter_unit IN ('km', 'mi', 'hours', 'cycles', 'count')
  ),
  CONSTRAINT asset_events_meter_pair CHECK (
    (meter_value IS NULL AND meter_unit IS NULL)
    OR (meter_value IS NOT NULL AND meter_unit IS NOT NULL)
  ),
  CONSTRAINT asset_events_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT asset_events_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT asset_events_asset_fk
    FOREIGN KEY (workspace_id, asset_id, asset_entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

CREATE INDEX asset_events_timeline
  ON asset_events (workspace_id, asset_id, deleted_at, event_date DESC, id DESC);
CREATE INDEX asset_events_category
  ON asset_events (workspace_id, asset_id, category, deleted_at);
CREATE INDEX asset_events_meter
  ON asset_events (workspace_id, asset_id, meter_unit, event_date DESC);
CREATE INDEX asset_events_obligation
  ON asset_events (workspace_id, obligation_id);
CREATE INDEX asset_events_task
  ON asset_events (workspace_id, task_id);
CREATE INDEX asset_events_note
  ON asset_events (workspace_id, note_id);
CREATE INDEX asset_events_person
  ON asset_events (workspace_id, person_id);


CREATE TABLE asset_obligations (
  id                  TEXT NOT NULL,
  workspace_id        TEXT NOT NULL,
  asset_id            TEXT NOT NULL,
  asset_entity_type   TEXT NOT NULL DEFAULT 'asset',
  category            TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  due_date            TEXT,
  lead_days           INTEGER NOT NULL DEFAULT 14,
  recurrence_kind     TEXT NOT NULL DEFAULT 'none',
  recurrence_interval INTEGER,
  meter_threshold     INTEGER,
  meter_interval      INTEGER,
  meter_unit          TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  task_id             TEXT,
  completed_event_id  TEXT,
  completed_at        TEXT,
  next_obligation_id  TEXT,
  series_id           TEXT NOT NULL,
  sequence            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  archived_at         TEXT,
  deleted_at          TEXT,
  CONSTRAINT asset_obligations_pk PRIMARY KEY (workspace_id, id),
  CONSTRAINT asset_obligations_id_not_empty CHECK (length(id) > 0),
  CONSTRAINT asset_obligations_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT asset_obligations_asset_not_empty CHECK (length(asset_id) > 0),
  CONSTRAINT asset_obligations_asset_entity_type CHECK (asset_entity_type = 'asset'),
  CONSTRAINT asset_obligations_category_valid CHECK (
    category IN (
      'registration', 'warranty', 'insurance', 'licence', 'service',
      'inspection', 'maintenance', 'replacement', 'reminder'
    )
  ),
  CONSTRAINT asset_obligations_title_not_empty CHECK (length(title) > 0),
  CONSTRAINT asset_obligations_title_bounded CHECK (length(title) <= 200),
  CONSTRAINT asset_obligations_due_shape CHECK (
    due_date IS NULL OR length(due_date) = 10
  ),
  CONSTRAINT asset_obligations_lead_days_valid CHECK (lead_days BETWEEN 0 AND 365),
  CONSTRAINT asset_obligations_recurrence_kind_valid CHECK (
    recurrence_kind IN ('none', 'days', 'weeks', 'months', 'years', 'meter')
  ),
  CONSTRAINT asset_obligations_recurrence_interval_valid CHECK (
    recurrence_interval IS NULL OR recurrence_interval BETWEEN 1 AND 999
  ),
  CONSTRAINT asset_obligations_recurrence_interval_required CHECK (
    (recurrence_kind IN ('none', 'meter') AND recurrence_interval IS NULL)
    OR (recurrence_kind NOT IN ('none', 'meter') AND recurrence_interval IS NOT NULL)
  ),
  CONSTRAINT asset_obligations_meter_threshold_nonneg CHECK (
    meter_threshold IS NULL OR meter_threshold >= 0
  ),
  CONSTRAINT asset_obligations_meter_interval_valid CHECK (
    meter_interval IS NULL OR meter_interval BETWEEN 1 AND 100000000
  ),
  CONSTRAINT asset_obligations_meter_unit_valid CHECK (
    meter_unit IS NULL OR meter_unit IN ('km', 'mi', 'hours', 'cycles', 'count')
  ),
  CONSTRAINT asset_obligations_meter_pair CHECK (
    (meter_threshold IS NULL AND meter_unit IS NULL)
    OR (meter_threshold IS NOT NULL AND meter_unit IS NOT NULL)
  ),
  CONSTRAINT asset_obligations_meter_recurrence_needs_meter CHECK (
    recurrence_kind <> 'meter'
    OR (meter_threshold IS NOT NULL AND meter_interval IS NOT NULL)
  ),
  CONSTRAINT asset_obligations_has_commitment CHECK (
    due_date IS NOT NULL OR meter_threshold IS NOT NULL
  ),
  CONSTRAINT asset_obligations_status_valid CHECK (
    status IN ('open', 'completed', 'dismissed', 'on_hold')
  ),
  CONSTRAINT asset_obligations_completed_at_consistent CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT asset_obligations_series_id_not_empty CHECK (length(series_id) > 0),
  CONSTRAINT asset_obligations_series_id_bounded CHECK (length(series_id) <= 128),
  CONSTRAINT asset_obligations_sequence_valid CHECK (sequence >= 0),
  CONSTRAINT asset_obligations_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT asset_obligations_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT asset_obligations_asset_fk
    FOREIGN KEY (workspace_id, asset_id, asset_entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  CONSTRAINT asset_obligations_series_sequence_unique
    UNIQUE (workspace_id, series_id, sequence)
) STRICT;

CREATE INDEX asset_obligations_by_asset
  ON asset_obligations (workspace_id, asset_id, deleted_at, status, due_date);
CREATE INDEX asset_obligations_due
  ON asset_obligations (workspace_id, status, deleted_at, due_date, id);
CREATE INDEX asset_obligations_meter
  ON asset_obligations (workspace_id, status, deleted_at, meter_unit, meter_threshold);
CREATE INDEX asset_obligations_category
  ON asset_obligations (workspace_id, asset_id, category, deleted_at);
CREATE INDEX asset_obligations_task
  ON asset_obligations (workspace_id, task_id);
CREATE INDEX asset_obligations_series
  ON asset_obligations (workspace_id, series_id, sequence);
