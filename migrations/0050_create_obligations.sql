-- Migration number: 0050 	 2026-09-05
--
-- V2.10 LIFE-01 -- ONE Obligation, whether or not it is about an Asset.
--
-- See ADR-116 decision 1 (one Obligation model for everything due and
-- recurring, in every domain) and ADR-118 (what the V2.10 definition pass
-- decided beyond it). This migration is forward-only and it CARRIES LIVE OWNER
-- DATA.
--
-- ## What is wrong today (DEBT-240)
--
-- `asset_obligations` (0025) declares `asset_id TEXT NOT NULL` behind a
-- composite foreign key into `entities (workspace_id, id, type)` pinned to
-- `'asset'`, so the database refuses an obligation with no Asset. It has no
-- amount column of any kind. And an obligation is not an entity, so it has no
-- EntityLink, no Activity subject of its own, no record route, no search
-- exposure and no identity.
--
-- A tax return, a passport renewal, a gym membership or a school fee therefore
-- has nowhere to live but a recurring Task with the wrong recurrence engine, no
-- amount and no renewal history -- or a fake Asset created to hold it.
--
-- ## The model
--
--   * an `obligation` ENTITY -- an ordinary `entities` row, the pattern every
--     record in the product uses, which is what buys links, Activity, Search,
--     the record layout and export with no kernel change. `entities.type` is an
--     open validated string with no CHECK, so this costs no schema change of
--     its own.
--   * `obligation_details` -- the additive STRICT slice, keyed by
--     `(workspace_id, entity_id)`, on the `asset_details` / `review_details`
--     pattern. The TITLE lives on the entity, not here: one title, one place.
--   * an OPTIONAL SUBJECT -- `subject_entity_id` + `subject_entity_type`, a
--     nullable pair carrying a composite foreign key into
--     `entities (workspace_id, id, type)`. It is the generalisation of the
--     `(asset_id, asset_entity_type)` pair 0025 already had, with the `'asset'`
--     CHECK removed. Because both columns are nullable together, SQLite's
--     default (MATCH SIMPLE) treats a null pair as satisfying the constraint --
--     which is exactly "an obligation about nothing at all".
--   * an OPTIONAL EXPECTED AMOUNT and a SEPARATE COMPLETED AMOUNT, integer
--     minor units with one ISO-4217 code (ADR-049). Two names because the one
--     defect this domain must not have is an expectation read as a payment.
--
-- ## The subject is also an EntityLink, and the foreign key is authoritative
--
-- Step 4 writes one `obligation.subject` link per obligation. The FK serves the
-- structural reads (the Assets lens, the attention read, the canonical-fact
-- update) because only it can sit inside an index with `status` and `due_date`.
-- The link serves the GENERIC reads (the subject record's linked items, the
-- relationship timeline) because that is the kernel primitive and a bespoke
-- reverse reader per subject type is the ecosystem EntityLinks replaced.
-- ADR-118 decision 1 records why both exist and how they are kept in step: one
-- batch, a reserved link type, and an invariant test.
--
-- The link ids are DERIVED from the obligation's own id rather than generated,
-- so this step is inspectable, re-runnable and produces the same database
-- twice. A migration is not the place for a random number.
--
-- ## Ordering
--
--   1. create `obligation_details` and its indexes
--   2. create one `entities` row per obligation, KEEPING THE OBLIGATION'S ID
--   3. copy every obligation into `obligation_details` by explicit column list
--   4. create the `obligation.subject` link for each
--   5. drop `asset_obligations`
--
-- ## Keeping the id is the whole safety property
--
-- `series_id`, `sequence`, `next_obligation_id`, `completed_event_id`,
-- `task_id` and `asset_events.obligation_id` all reference obligation ids, and
-- NONE of them has a database foreign key -- `app/kernel/restore/restore-safety.ts`
-- is their only integrity authority. Preserve the ids and every one of those
-- chains is preserved by construction: there is nothing to remap, and so
-- nothing to get wrong. `entities.id` is globally unique where an obligation id
-- was unique per workspace. A collision is impossible for ids this application
-- generated, and the migration rehearsal counts them to prove it.
--
-- ## The one value that is not carried verbatim
--
-- `asset_obligations` allows a whitespace-only title (`length(title) > 0`)
-- while `entities` requires `length(trim(title)) > 0`. The application cannot
-- create one -- every write goes through `validateObligationTitle`, which trims
-- -- but a restored archive could, and a migration that fails halfway through an
-- owner's upgrade is worse than a stated placeholder. Step 2 substitutes
-- 'Untitled obligation' for a blank title and step 3 preserves the original in
-- no column, because there is nothing there to preserve. The rehearsal counts
-- such rows and expects zero.
--
-- ## Retirement
--
-- Step 5 DROPS `asset_obligations` rather than leaving it unused. ADR-082
-- decision 4 kept `task_saved_views` under its historical name because renaming
-- it would have made a Worker rollback fatal FOR NO GAIN -- the rows did not
-- move. Here the rows genuinely move, so the previous Worker is broken by the
-- data whether or not the table survives, and a retained copy would be a second
-- set of every obligation that no code writes and that export must either keep
-- emitting (a lie) or silently drop (a loss). What replaces the rollback is
-- stated rather than assumed: a production export is taken before this is
-- applied (the AGENTS.md database procedure, and V2.4-GATE-01's standing
-- precondition), the nightly R2 tier is the verified healthy copy, and the
-- migration is rehearsed end to end before it is merged.

-- ---------------------------------------------------------------------------
-- 1. The detail slice.
-- ---------------------------------------------------------------------------

CREATE TABLE obligation_details (
  workspace_id         TEXT NOT NULL,
  entity_id            TEXT NOT NULL,
  entity_type          TEXT NOT NULL DEFAULT 'obligation',
  subject_entity_id    TEXT,
  subject_entity_type  TEXT,
  category             TEXT NOT NULL,
  description          TEXT,
  due_date             TEXT,
  lead_days            INTEGER NOT NULL DEFAULT 14,
  recurrence_kind      TEXT NOT NULL DEFAULT 'none',
  recurrence_interval  INTEGER,
  meter_threshold      INTEGER,
  meter_interval       INTEGER,
  meter_unit           TEXT,
  expected_amount_minor INTEGER,
  completed_amount_minor INTEGER,
  currency_code        TEXT,
  status               TEXT NOT NULL DEFAULT 'open',
  task_id              TEXT,
  completed_event_id   TEXT,
  completed_at         TEXT,
  completed_on         TEXT,
  next_obligation_id   TEXT,
  series_id            TEXT NOT NULL,
  sequence             INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  archived_at          TEXT,
  deleted_at           TEXT,
  CONSTRAINT obligation_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT obligation_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT obligation_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT obligation_details_entity_type CHECK (entity_type = 'obligation'),
  -- The subject is optional, and both halves travel together: a pointer with no
  -- type could not be joined, and a type with no pointer names nothing.
  CONSTRAINT obligation_details_subject_pair CHECK (
    (subject_entity_id IS NULL AND subject_entity_type IS NULL)
    OR (subject_entity_id IS NOT NULL AND subject_entity_type IS NOT NULL)
  ),
  CONSTRAINT obligation_details_subject_not_empty CHECK (
    subject_entity_id IS NULL OR length(subject_entity_id) > 0
  ),
  -- The thirteen-key closed vocabulary: the nine `asset_obligations` shipped
  -- with, carried across unchanged because they drive the Assets module's
  -- canonical-fact bridge, plus the four life shapes V2.10 adds. Closed, and
  -- never tags (ADR-113's non-goal).
  CONSTRAINT obligation_details_category_valid CHECK (
    category IN (
      'registration', 'warranty', 'insurance', 'licence', 'service',
      'inspection', 'maintenance', 'replacement', 'reminder',
      'bill', 'subscription', 'fee', 'tax'
    )
  ),
  CONSTRAINT obligation_details_due_shape CHECK (
    due_date IS NULL OR length(due_date) = 10
  ),
  CONSTRAINT obligation_details_completed_on_shape CHECK (
    completed_on IS NULL OR length(completed_on) = 10
  ),
  CONSTRAINT obligation_details_lead_days_valid CHECK (lead_days BETWEEN 0 AND 365),
  CONSTRAINT obligation_details_recurrence_kind_valid CHECK (
    recurrence_kind IN ('none', 'days', 'weeks', 'months', 'years', 'meter')
  ),
  CONSTRAINT obligation_details_recurrence_interval_valid CHECK (
    recurrence_interval IS NULL OR recurrence_interval BETWEEN 1 AND 999
  ),
  CONSTRAINT obligation_details_recurrence_interval_required CHECK (
    (recurrence_kind IN ('none', 'meter') AND recurrence_interval IS NULL)
    OR (recurrence_kind NOT IN ('none', 'meter') AND recurrence_interval IS NOT NULL)
  ),
  CONSTRAINT obligation_details_meter_threshold_nonneg CHECK (
    meter_threshold IS NULL OR meter_threshold >= 0
  ),
  CONSTRAINT obligation_details_meter_interval_valid CHECK (
    meter_interval IS NULL OR meter_interval BETWEEN 1 AND 100000000
  ),
  CONSTRAINT obligation_details_meter_unit_valid CHECK (
    meter_unit IS NULL OR meter_unit IN ('km', 'mi', 'hours', 'cycles', 'count')
  ),
  CONSTRAINT obligation_details_meter_pair CHECK (
    (meter_threshold IS NULL AND meter_unit IS NULL)
    OR (meter_threshold IS NOT NULL AND meter_unit IS NOT NULL)
  ),
  CONSTRAINT obligation_details_meter_recurrence_needs_meter CHECK (
    recurrence_kind <> 'meter'
    OR (meter_threshold IS NOT NULL AND meter_interval IS NOT NULL)
  ),
  -- A meter belongs to the thing that has one. An obligation about nothing
  -- cannot be measured in kilometres, and the database says so rather than
  -- leaving it to a validator.
  CONSTRAINT obligation_details_meter_needs_subject CHECK (
    meter_threshold IS NULL OR subject_entity_id IS NOT NULL
  ),
  CONSTRAINT obligation_details_has_commitment CHECK (
    due_date IS NOT NULL OR meter_threshold IS NOT NULL
  ),
  -- Money: integer minor units, an ISO-4217 code, never converted (ADR-049).
  -- One code covers both amounts: an actual amount in a different currency is
  -- refused at the boundary rather than converted here.
  CONSTRAINT obligation_details_expected_amount_nonneg CHECK (
    expected_amount_minor IS NULL OR expected_amount_minor >= 0
  ),
  CONSTRAINT obligation_details_completed_amount_nonneg CHECK (
    completed_amount_minor IS NULL OR completed_amount_minor >= 0
  ),
  CONSTRAINT obligation_details_amount_bounded CHECK (
    (expected_amount_minor IS NULL OR expected_amount_minor <= 90000000000000)
    AND (completed_amount_minor IS NULL OR completed_amount_minor <= 90000000000000)
  ),
  CONSTRAINT obligation_details_currency_shape CHECK (
    currency_code IS NULL OR length(currency_code) = 3
  ),
  CONSTRAINT obligation_details_currency_required_with_amount CHECK (
    (expected_amount_minor IS NULL AND completed_amount_minor IS NULL)
    OR currency_code IS NOT NULL
  ),
  -- A completed amount is proof of what was paid, so it cannot exist on an
  -- obligation that was never completed.
  CONSTRAINT obligation_details_completed_amount_needs_completion CHECK (
    completed_amount_minor IS NULL OR status = 'completed'
  ),
  CONSTRAINT obligation_details_status_valid CHECK (
    status IN ('open', 'completed', 'dismissed', 'on_hold')
  ),
  CONSTRAINT obligation_details_completed_at_consistent CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT obligation_details_series_id_not_empty CHECK (length(series_id) > 0),
  CONSTRAINT obligation_details_series_id_bounded CHECK (length(series_id) <= 128),
  CONSTRAINT obligation_details_sequence_valid CHECK (sequence >= 0),
  CONSTRAINT obligation_details_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT obligation_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT obligation_details_entity_fk
    FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  -- The subject may be an entity of ANY kind, in THIS workspace. A
  -- cross-workspace subject is impossible at the database level, not merely in
  -- application code -- the guarantee `entity_links` has relied on since 0003.
  CONSTRAINT obligation_details_subject_fk
    FOREIGN KEY (workspace_id, subject_entity_id, subject_entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT,
  CONSTRAINT obligation_details_series_sequence_unique
    UNIQUE (workspace_id, series_id, sequence)
) STRICT;

-- Access path: the Life Admin collection and the Today attention read -- open
-- work in the whole workspace, soonest due first.
CREATE INDEX obligation_details_due
  ON obligation_details (workspace_id, status, deleted_at, due_date, entity_id);

-- Access path: the Assets lens and every other subject's obligations.
CREATE INDEX obligation_details_by_subject
  ON obligation_details (workspace_id, subject_entity_id, deleted_at, status, due_date);

-- Access path: the meter attention read.
CREATE INDEX obligation_details_meter
  ON obligation_details (workspace_id, status, deleted_at, meter_unit, meter_threshold);

-- Access path: the category filter, per subject.
CREATE INDEX obligation_details_category
  ON obligation_details (workspace_id, subject_entity_id, category, deleted_at);

-- Access path: the linked-Task lookup (a pointer, never ownership).
CREATE INDEX obligation_details_task
  ON obligation_details (workspace_id, task_id);

-- Access path: the recurrence chain.
CREATE INDEX obligation_details_series
  ON obligation_details (workspace_id, series_id, sequence);

-- ---------------------------------------------------------------------------
-- 2. One entity per obligation, KEEPING THE OBLIGATION'S OWN ID.
-- ---------------------------------------------------------------------------

INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
SELECT
  o.id,
  o.workspace_id,
  'obligation',
  CASE WHEN trim(o.title) = '' THEN 'Untitled obligation' ELSE o.title END,
  o.created_at,
  o.updated_at,
  o.deleted_at
FROM asset_obligations o;

-- ---------------------------------------------------------------------------
-- 3. The detail rows, by explicit column list so a value cannot land in a
--    neighbour. The subject is the Asset the obligation was already about.
--    `completed_on` is left NULL for migrated rows: `asset_obligations` stored
--    only the completion INSTANT, and the day the work was done lives on the
--    `asset_events` proof row. Inventing a day from a UTC timestamp would be
--    fabricating a fact in the owner's timezone.
-- ---------------------------------------------------------------------------

INSERT INTO obligation_details (
  workspace_id, entity_id, entity_type,
  subject_entity_id, subject_entity_type,
  category, description, due_date, lead_days,
  recurrence_kind, recurrence_interval,
  meter_threshold, meter_interval, meter_unit,
  expected_amount_minor, completed_amount_minor, currency_code,
  status, task_id, completed_event_id, completed_at, completed_on,
  next_obligation_id, series_id, sequence,
  created_at, updated_at, archived_at, deleted_at
)
SELECT
  o.workspace_id, o.id, 'obligation',
  o.asset_id, 'asset',
  o.category, o.description, o.due_date, o.lead_days,
  o.recurrence_kind, o.recurrence_interval,
  o.meter_threshold, o.meter_interval, o.meter_unit,
  NULL, NULL, NULL,
  o.status, o.task_id, o.completed_event_id, o.completed_at, NULL,
  o.next_obligation_id, o.series_id, o.sequence,
  o.created_at, o.updated_at, o.archived_at, o.deleted_at
FROM asset_obligations o;

-- ---------------------------------------------------------------------------
-- 4. The subject relationship, as the ordinary kernel primitive.
--
--    Direction is obligation -> subject, matching `asset.linked_*`, so the
--    Asset's Linked items show the obligations about it. The id is derived from
--    the obligation's, which is unique, so this is deterministic and
--    re-runnable, and `entity_links_identity_idx` is the backstop.
-- ---------------------------------------------------------------------------

INSERT INTO entity_links (
  id, workspace_id, source_entity_id, target_entity_id, type,
  created_at, updated_at, deleted_at
)
SELECT
  'obl-subject-' || o.id,
  o.workspace_id,
  o.id,
  o.asset_id,
  'obligation.subject',
  o.created_at,
  o.updated_at,
  o.deleted_at
FROM asset_obligations o;

-- ---------------------------------------------------------------------------
-- 5. Retire the old authority.
-- ---------------------------------------------------------------------------

DROP TABLE asset_obligations;
