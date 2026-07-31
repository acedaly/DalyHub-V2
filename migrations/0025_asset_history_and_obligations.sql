-- ASSET-02: Asset history (events) and future obligations (maintenance & renewals).
--
-- ASSET-01 gave an Asset its CURRENT facts. It could not say what happened to the
-- thing, nor what it will need next. This migration adds the two missing halves —
-- one canonical event table for everything that HAS happened, and one canonical
-- obligation table for everything that IS DUE — plus the three meter columns an
-- odometer/hours-based maintenance model needs on the Asset itself.
--
-- THE THREE-WAY SPLIT (deliberate, documented in ASSETS_MODULE.md §"Facts,
-- history and obligations"):
--
--   * `asset_details`      — the Asset's CURRENT canonical facts. Purchase price,
--                            current warranty expiry, current registration/renewal
--                            date, next service date, current meter reading. These
--                            are read directly; they are NEVER reconstructed by
--                            replaying events. DalyHub is not event-sourced.
--   * `asset_events`       — what HAPPENED. Append-mostly history. An event may
--                            PROPOSE a new canonical fact (a service sets the next
--                            service date; a renewal sets the new expiry; a meter
--                            reading advances the current meter) — the repository
--                            applies that forward-only, in the same transaction.
--   * `asset_obligations`  — what is DUE. A future commitment with a due date
--                            and/or a meter threshold, optional recurrence, and an
--                            optional linked Task that carries it into Today.
--
-- ONE event table, not one per category (AGENTS.md §9.8): every category shares
-- the same columns and only fills the ones that apply. A repair carries a cost and
-- a provider; an inspection may carry only a date.
--
-- Money stays INTEGER minor units + an ISO-4217 code (ADR-049) — never a float,
-- never silently mixed. Dates stay wall-calendar YYYY-MM-DD strings compared as
-- integers (ADR-022 §22.7). Meter readings are non-negative INTEGERs in one of the
-- five bounded units; a "10,000 km" service interval is data, never a formula.

/* -------------------------------------------------------------------------- */
/* 1. Meter facts on the Asset (canonical current reading)                    */
/* -------------------------------------------------------------------------- */

-- The Asset's CURRENT meter reading. Advanced forward-only by a meter-bearing
-- event whose event date is not older than `current_meter_date`, so back-filling
-- an old service record can never rewind an odometer. NULL means "no reading yet",
-- which is an honest, first-class state: a meter obligation with no reading reads
-- as "Reading required", never as overdue.
ALTER TABLE asset_details ADD COLUMN current_meter_value INTEGER;
ALTER TABLE asset_details ADD COLUMN current_meter_unit TEXT;
ALTER TABLE asset_details ADD COLUMN current_meter_date TEXT;

-- Assets whose meter is worth watching, for the meter-threshold read seam.
CREATE INDEX asset_details_meter
  ON asset_details (workspace_id, archived_at, current_meter_unit, current_meter_value);

/* -------------------------------------------------------------------------- */
/* 2. asset_events — the canonical Asset history                              */
/* -------------------------------------------------------------------------- */

CREATE TABLE asset_events (
  id                TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  asset_id          TEXT NOT NULL,
  asset_entity_type TEXT NOT NULL DEFAULT 'asset',
  -- What kind of thing happened. One closed vocabulary, one table.
  category          TEXT NOT NULL,
  title             TEXT NOT NULL,
  -- The wall-calendar day the event happened on (the timeline's sort key).
  event_date        TEXT NOT NULL,
  -- Optional precise completion instant (ISO-8601), when the owner recorded one.
  completed_at      TEXT,
  -- Markdown SOURCE, rendered through the one shared sanitising pipeline (ADR-006).
  description       TEXT,
  -- A plain provider/organisation name. NEVER auto-creates a Person (§14).
  provider          TEXT,
  -- An OPTIONAL canonical Person id. A provider may be text only, a Person only,
  -- or both. No duplicate People are ever minted from a typed name.
  person_id         TEXT,
  -- Money spent on this event, and the value asserted by a valuation event. Kept
  -- as separate columns because a cost and a valuation are not the same quantity
  -- and must never be summed together.
  cost_minor        INTEGER,
  value_minor       INTEGER,
  currency_code     TEXT,
  -- The meter reading observed at the event, in one bounded unit.
  meter_value       INTEGER,
  meter_unit        TEXT,
  -- Canonical facts this event ASSERTS (applied forward-only by the repository).
  warranty_expiry   TEXT,
  next_due_date     TEXT,
  -- Relationships. A linked Task/Note is a pointer, never ownership: deleting the
  -- Task or Note must not delete the event (enforced by the repository, which
  -- clears the pointer rather than cascading).
  task_id           TEXT,
  note_id           TEXT,
  -- The obligation this event completed, when it came from completing one.
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
  -- An amount without a currency would be an unlabelled number (§15): refuse it.
  CONSTRAINT asset_events_currency_required_with_amount CHECK (
    (cost_minor IS NULL AND value_minor IS NULL) OR currency_code IS NOT NULL
  ),
  CONSTRAINT asset_events_meter_nonneg CHECK (meter_value IS NULL OR meter_value >= 0),
  CONSTRAINT asset_events_meter_unit_valid CHECK (
    meter_unit IS NULL OR meter_unit IN ('km', 'mi', 'hours', 'cycles', 'count')
  ),
  -- A reading without a unit is meaningless, and a unit without a reading is noise.
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

-- The Asset timeline read: newest first within one asset, excluding deleted rows.
-- `id` closes the ordering so cursor pagination is deterministic.
CREATE INDEX asset_events_timeline
  ON asset_events (workspace_id, asset_id, deleted_at, event_date DESC, id DESC);
-- Category-filtered history (e.g. "service and repair only") and cost aggregation.
CREATE INDEX asset_events_category
  ON asset_events (workspace_id, asset_id, category, deleted_at);
-- Meter-reading history and the "latest trusted reading" resolution.
CREATE INDEX asset_events_meter
  ON asset_events (workspace_id, asset_id, meter_unit, event_date DESC);
-- Reverse lookups from a completed obligation, and from a linked Task/Note.
CREATE INDEX asset_events_obligation
  ON asset_events (workspace_id, obligation_id);
CREATE INDEX asset_events_task
  ON asset_events (workspace_id, task_id);
CREATE INDEX asset_events_note
  ON asset_events (workspace_id, note_id);
CREATE INDEX asset_events_person
  ON asset_events (workspace_id, person_id);

/* -------------------------------------------------------------------------- */
/* 3. asset_obligations — the canonical future commitments                    */
/* -------------------------------------------------------------------------- */

-- STORED `status` is the OWNER-CONTROLLED lifecycle only: open / completed /
-- dismissed / on_hold. `upcoming`, `due` and `overdue` are DERIVED at read time
-- from the due date, the lead time and the meter, against the owner-calendar day —
-- they are deliberately NOT stored, because a stored "overdue" flag goes stale the
-- moment the clock ticks and would need a scheduler DalyHub does not have.
CREATE TABLE asset_obligations (
  id                  TEXT NOT NULL,
  workspace_id        TEXT NOT NULL,
  asset_id            TEXT NOT NULL,
  asset_entity_type   TEXT NOT NULL DEFAULT 'asset',
  category            TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  -- The date-based commitment. NULL for a purely meter-based obligation.
  due_date            TEXT,
  -- How many days before the due date this begins reading as "due" (the warning
  -- window). Bounded so a lead time can never swallow the whole calendar.
  lead_days           INTEGER NOT NULL DEFAULT 14,
  -- Recurrence: 'none' | 'days' | 'weeks' | 'months' | 'years' | 'meter'.
  -- Interval is the multiplier for the date kinds; `meter_interval` is the
  -- distance/usage between meter occurrences. Nothing here is executable: a rule
  -- is a bounded (kind, interval) pair, never a formula.
  recurrence_kind     TEXT NOT NULL DEFAULT 'none',
  recurrence_interval INTEGER,
  -- The meter commitment: due when the Asset's current reading reaches
  -- `meter_threshold` in `meter_unit`. `meter_interval` drives the next occurrence.
  meter_threshold     INTEGER,
  meter_interval      INTEGER,
  meter_unit          TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  -- The actionable commitment in Tasks/Today. A pointer, never ownership: if the
  -- Task is deleted the obligation survives and the pointer is cleared.
  task_id             TEXT,
  -- The event that completed this obligation (the proof the work happened).
  completed_event_id  TEXT,
  completed_at        TEXT,
  -- The successor created when this occurrence completed, so a series is walkable
  -- in both directions without replaying anything.
  next_obligation_id  TEXT,
  -- Recurrence series identity. UNIQUE (workspace_id, series_id, sequence) is what
  -- makes successor creation idempotent under a retry or a concurrent completion —
  -- exactly one next occurrence can ever exist (mirrors task_recurrence_rules).
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
  -- A recurring date rule needs an interval; a non-recurring one must not carry one.
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
  -- A threshold without a unit cannot be compared to a reading.
  CONSTRAINT asset_obligations_meter_pair CHECK (
    (meter_threshold IS NULL AND meter_unit IS NULL)
    OR (meter_threshold IS NOT NULL AND meter_unit IS NOT NULL)
  ),
  -- A meter recurrence needs a meter commitment to advance.
  CONSTRAINT asset_obligations_meter_recurrence_needs_meter CHECK (
    recurrence_kind <> 'meter'
    OR (meter_threshold IS NOT NULL AND meter_interval IS NOT NULL)
  ),
  -- Every obligation must commit to SOMETHING: a date, a meter, or both.
  CONSTRAINT asset_obligations_has_commitment CHECK (
    due_date IS NOT NULL OR meter_threshold IS NOT NULL
  ),
  CONSTRAINT asset_obligations_status_valid CHECK (
    status IN ('open', 'completed', 'dismissed', 'on_hold')
  ),
  -- A completed obligation always records WHEN; an open one never does.
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
  -- EXACTLY ONE next occurrence per series position, enforced by the database.
  CONSTRAINT asset_obligations_series_sequence_unique
    UNIQUE (workspace_id, series_id, sequence)
) STRICT;

-- The Asset's own obligations tab: open work first, soonest due first.
CREATE INDEX asset_obligations_by_asset
  ON asset_obligations (workspace_id, asset_id, deleted_at, status, due_date);
-- The Today due-date query: every OPEN obligation in the workspace, by due date.
-- Kept narrow and status-leading so Today never scans completed history.
CREATE INDEX asset_obligations_due
  ON asset_obligations (workspace_id, status, deleted_at, due_date, id);
-- The Today meter query: open meter obligations, resolvable against the Asset's
-- current reading without touching the date-driven rows.
CREATE INDEX asset_obligations_meter
  ON asset_obligations (workspace_id, status, deleted_at, meter_unit, meter_threshold);
-- Category facets on the obligations tab.
CREATE INDEX asset_obligations_category
  ON asset_obligations (workspace_id, asset_id, category, deleted_at);
-- Reconciling a completed/deleted Task back to the obligation that owns it.
CREATE INDEX asset_obligations_task
  ON asset_obligations (workspace_id, task_id);
-- Walking a recurrence series.
CREATE INDEX asset_obligations_series
  ON asset_obligations (workspace_id, series_id, sequence);
