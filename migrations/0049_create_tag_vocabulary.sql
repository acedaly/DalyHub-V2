-- Migration number: 0049 	 2026-08-29
--
-- V2.6 FIND-02 -- ONE canonical tag vocabulary.
--
-- See ADR-113 (the tag vocabulary decision) and ADR-112 decision 4 ("a tag is a
-- VOCABULARY, never a second structure"). This migration is the one FIND-02
-- names: it is forward-only, and it CARRIES LIVE OWNER DATA.
--
-- ## What is wrong today (DEBT-182)
--
-- Tags are a free-text JSON array on three unrelated detail tables --
-- `person_details.tags` (0013), `asset_details.tags` (0016) and
-- `note_details.tags` (0019). Each has its own validator, its own suggestion
-- set and -- the part that makes them three different things rather than one
-- thing stored three times -- its own CASE rule: Notes case-fold on write,
-- People and Assets preserve the owner's casing. `Errand` on an Asset and
-- `errand` on a Note are therefore different tags, nothing can be renamed, and
-- there is nothing for a `#tag` capture token to resolve against.
--
-- ## The model
--
--   * `workspace_tags` -- the workspace's vocabulary. One row per tag. Its
--     IDENTITY is `tag_key`, the case-folded canonical form. Its `label` is the
--     casing the owner typed, preserved for display. That pair is the whole of
--     the case decision: one tag, one identity, the owner's own spelling shown.
--   * `entity_tags` -- which entity carries which tag. Polymorphic by
--     `entity_id`, so a Task gains tags (FIND-03) with NO further migration.
--
-- Neither table is an entity and neither is an EntityLink. A tag has no record
-- page, no timeline and no Activity of its own. Making it an entity would give
-- it every one of those by construction, which ADR-112's non-goals forbid.
--
-- ## Ordering
--
--   1. create the two tables
--   2. stage every legacy tag with its canonical key and display label
--   3. build the vocabulary (first spelling wins, deterministically)
--   4. attach every entity to its tags
--   5. drop the three legacy columns, so nothing can write a fourth dialect
--
-- Step 5 uses the standard table rebuild for `person_details` and
-- `asset_details` (both carry a `..._tags_not_empty` CHECK, and SQLite cannot
-- drop a column a CHECK names), exactly as 0031 did for
-- `owner_app_preferences`. `note_details.tags` was added by a bare ALTER in
-- 0019 with no CHECK and no index, so it drops directly. Every surviving
-- column, default, constraint, primary key and index is reproduced verbatim
-- from the schema this migration was written against, and every row is copied
-- by an EXPLICIT column list so a value can never land in a neighbour.
--
-- The legacy columns are dropped rather than left behind on purpose. A column
-- nothing reads is a second place a tag could be written, and "one vocabulary
-- source" is a claim the schema should make structurally rather than by
-- convention. The values are not lost: they are in the two new tables above,
-- and a production export is taken before this is applied (the AGENTS.md
-- database procedure, and V2.4-GATE-01's standing precondition).

-- ---------------------------------------------------------------------------
-- 1. The vocabulary and the attachment.
-- ---------------------------------------------------------------------------

CREATE TABLE workspace_tags (
  workspace_id TEXT NOT NULL,
  -- The canonical identity: whitespace-normalised and case-folded. This is what
  -- makes `Errand` and `errand` ONE tag everywhere in the product.
  tag_key      TEXT NOT NULL,
  -- The display form: the casing the owner typed the first time this tag was
  -- used. `~/shared/forms/tags.ts` deliberately preserves it, and this column is
  -- how that stays true under a case-folded identity.
  label        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CONSTRAINT workspace_tags_pk PRIMARY KEY (workspace_id, tag_key),
  CONSTRAINT workspace_tags_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT workspace_tags_key_not_empty CHECK (length(tag_key) > 0),
  CONSTRAINT workspace_tags_key_bounded CHECK (length(tag_key) <= 64),
  -- The key IS the folded label. Asserted by the database so a write that
  -- invented its own folding rule fails loudly instead of creating a duplicate
  -- identity nobody can see.
  CONSTRAINT workspace_tags_key_is_folded CHECK (tag_key = lower(tag_key)),
  CONSTRAINT workspace_tags_label_not_empty CHECK (length(label) > 0),
  CONSTRAINT workspace_tags_label_bounded CHECK (length(label) <= 64),
  CONSTRAINT workspace_tags_label_matches_key CHECK (lower(label) = tag_key),
  CONSTRAINT workspace_tags_created_at_not_empty CHECK (length(created_at) > 0),
  CONSTRAINT workspace_tags_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT workspace_tags_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE entity_tags (
  workspace_id TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  tag_key      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  CONSTRAINT entity_tags_pk PRIMARY KEY (workspace_id, entity_id, tag_key),
  CONSTRAINT entity_tags_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT entity_tags_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT entity_tags_key_not_empty CHECK (length(tag_key) > 0),
  CONSTRAINT entity_tags_created_at_not_empty CHECK (length(created_at) > 0),
  -- The entity must exist IN THIS WORKSPACE. The composite key makes a
  -- cross-workspace attachment impossible at the database level, exactly as
  -- `entity_links` does for a relationship's endpoints.
  --
  -- CASCADE, where `entity_links` chose RESTRICT, and the difference is
  -- deliberate: a link is a relationship BETWEEN two records and losing one
  -- silently would lose information, whereas a tag attachment is an ATTRIBUTE
  -- of one record and cannot outlive it. It also means no future purge path has
  -- to learn about tags in order to stay correct.
  CONSTRAINT entity_tags_entity_fk
    FOREIGN KEY (workspace_id, entity_id) REFERENCES entities (workspace_id, id)
    ON DELETE CASCADE,
  -- A vocabulary entry cannot vanish while an entity still carries it.
  CONSTRAINT entity_tags_tag_fk
    FOREIGN KEY (workspace_id, tag_key) REFERENCES workspace_tags (workspace_id, tag_key)
    ON DELETE RESTRICT
) STRICT;

-- "Which entities carry this tag?" -- the access path the Tasks tag filter, the
-- Notes tag facet and the vocabulary's reference count all read.
CREATE INDEX entity_tags_by_tag ON entity_tags (workspace_id, tag_key, entity_id);

-- ---------------------------------------------------------------------------
-- 2. Stage every legacy tag, canonicalised.
-- ---------------------------------------------------------------------------
--
-- `source_rank` records which column a spelling came from, so "first spelling
-- wins" is a rule rather than an accident of row order: People, then Assets,
-- then Notes -- Notes last because 0019 case-folds on write and therefore holds
-- no casing worth preserving.
--
-- The canonical form is computed here in SQL and is the SAME rule
-- `canonicalTagKey` applies in the application: tabs/newlines/carriage returns
-- become spaces, runs of spaces collapse to one, the result is trimmed, and the
-- key is that lower-cased. Six halving passes collapse any run up to 64 spaces,
-- which is every run a 64-character tag can contain.

CREATE TABLE tag_migration_0049_staging (
  workspace_id TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  source_rank  INTEGER NOT NULL,
  position     INTEGER NOT NULL,
  label        TEXT NOT NULL,
  tag_key      TEXT NOT NULL
);

INSERT INTO tag_migration_0049_staging
  (workspace_id, entity_id, source_rank, position, label, tag_key)
WITH raw_tags AS (
  SELECT d.workspace_id AS workspace_id, d.entity_id AS entity_id,
         1 AS source_rank, j.key AS position, j.value AS raw
    FROM person_details d, json_each(d.tags) j
   WHERE json_valid(d.tags) AND json_type(d.tags) = 'array' AND j.type = 'text'
  UNION ALL
  SELECT d.workspace_id, d.entity_id, 2, j.key, j.value
    FROM asset_details d, json_each(d.tags) j
   WHERE json_valid(d.tags) AND json_type(d.tags) = 'array' AND j.type = 'text'
  UNION ALL
  SELECT d.workspace_id, d.entity_id, 3, j.key, j.value
    FROM note_details d, json_each(d.tags) j
   WHERE json_valid(d.tags) AND json_type(d.tags) = 'array' AND j.type = 'text'
),
normalised AS (
  SELECT workspace_id, entity_id, source_rank, position,
         trim(replace(replace(replace(replace(replace(replace(
           replace(replace(replace(raw, char(9), ' '), char(10), ' '), char(13), ' '),
           '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')) AS label
    FROM raw_tags
)
SELECT workspace_id, entity_id, source_rank, position, label, lower(label)
  FROM normalised
 WHERE length(label) > 0 AND length(label) <= 64;

-- ---------------------------------------------------------------------------
-- 3. The vocabulary: one row per canonical key, first spelling wins.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at)
SELECT workspace_id, tag_key, label,
       '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'
  FROM (
    SELECT workspace_id, tag_key, label,
           ROW_NUMBER() OVER (
             PARTITION BY workspace_id, tag_key
             ORDER BY source_rank, entity_id, position, label
           ) AS spelling_rank
      FROM tag_migration_0049_staging
  )
 WHERE spelling_rank = 1;

-- ---------------------------------------------------------------------------
-- 4. Attach every entity to every tag it had.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO entity_tags (workspace_id, entity_id, tag_key, created_at)
SELECT DISTINCT workspace_id, entity_id, tag_key, '2026-08-29T00:00:00.000Z'
  FROM tag_migration_0049_staging;

DROP TABLE tag_migration_0049_staging;

-- ---------------------------------------------------------------------------
-- 5. Retire the three legacy columns.
-- ---------------------------------------------------------------------------

-- 5a. `note_details.tags` -- added by a bare ALTER in 0019, named by no CHECK and
--     no index, so it drops in place.
ALTER TABLE note_details DROP COLUMN tags;

-- 5b. `person_details` -- rebuilt, because `person_details_tags_not_empty` names
--     the column. Every other column, constraint, default and index is verbatim.
CREATE TABLE person_details_new (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'person',
  preferred_name TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  pronouns TEXT,
  organisation TEXT,
  role TEXT,
  department TEXT,
  email TEXT,
  secondary_email TEXT,
  mobile TEXT,
  work_phone TEXT,
  address TEXT,
  website TEXT,
  birthday TEXT,
  relationship TEXT,
  notes TEXT,
  favourite_contact_method TEXT,
  follow_up_frequency TEXT,
  next_follow_up TEXT,
  last_interaction TEXT,
  photo_url TEXT,
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  CONSTRAINT person_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT person_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT person_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT person_details_entity_type CHECK (entity_type = 'person'),
  CONSTRAINT person_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT person_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

INSERT INTO person_details_new
  (workspace_id, entity_id, entity_type, preferred_name, first_name, middle_name,
   last_name, pronouns, organisation, role, department, email, secondary_email,
   mobile, work_phone, address, website, birthday, relationship, notes,
   favourite_contact_method, follow_up_frequency, next_follow_up, last_interaction,
   photo_url, archived_at, updated_at)
SELECT
   workspace_id, entity_id, entity_type, preferred_name, first_name, middle_name,
   last_name, pronouns, organisation, role, department, email, secondary_email,
   mobile, work_phone, address, website, birthday, relationship, notes,
   favourite_contact_method, follow_up_frequency, next_follow_up, last_interaction,
   photo_url, archived_at, updated_at
  FROM person_details;

DROP TABLE person_details;

ALTER TABLE person_details_new RENAME TO person_details;

CREATE INDEX person_details_workspace_archived
  ON person_details (workspace_id, archived_at, entity_id);

-- 5c. `asset_details` -- the same rebuild, for the same reason.
CREATE TABLE asset_details_new (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'asset',

  asset_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  reference_code TEXT,

  owner_person_id TEXT,
  responsible_person_id TEXT,
  location TEXT,
  area_id TEXT,

  acquisition_date TEXT,
  purchase_price_minor INTEGER,
  currency_code TEXT,
  supplier TEXT,
  replacement_value_minor INTEGER,
  disposal_date TEXT,
  disposal_notes TEXT,

  warranty_expiry TEXT,
  service_interval TEXT,
  last_service_date TEXT,
  next_service_date TEXT,
  service_provider TEXT,
  maintenance_notes TEXT,

  issuer TEXT,
  reference_number TEXT,
  issue_date TEXT,
  renewal_date TEXT,
  url TEXT,
  document_notes TEXT,

  archived_at TEXT,
  updated_at TEXT NOT NULL,
  current_meter_value INTEGER,
  current_meter_unit TEXT,
  current_meter_date TEXT,
  CONSTRAINT asset_details_pk PRIMARY KEY (workspace_id, entity_id),
  CONSTRAINT asset_details_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT asset_details_entity_not_empty CHECK (length(entity_id) > 0),
  CONSTRAINT asset_details_entity_type CHECK (entity_type = 'asset'),
  CONSTRAINT asset_details_type_not_empty CHECK (length(asset_type) > 0),
  CONSTRAINT asset_details_status_valid CHECK (
    status IN ('active', 'stored', 'loaned', 'under_repair', 'retired', 'disposed')
  ),
  CONSTRAINT asset_details_type_valid CHECK (
    asset_type IN (
      'vehicle', 'trailer', 'equipment', 'appliance', 'electronics', 'tool',
      'property_item', 'document', 'licence', 'insurance', 'subscription',
      'software', 'other'
    )
  ),
  CONSTRAINT asset_details_purchase_price_nonneg CHECK (
    purchase_price_minor IS NULL OR purchase_price_minor >= 0
  ),
  CONSTRAINT asset_details_replacement_value_nonneg CHECK (
    replacement_value_minor IS NULL OR replacement_value_minor >= 0
  ),
  CONSTRAINT asset_details_currency_shape CHECK (
    currency_code IS NULL OR length(currency_code) = 3
  ),
  CONSTRAINT asset_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT asset_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

INSERT INTO asset_details_new
  (workspace_id, entity_id, entity_type, asset_type, status, description,
   manufacturer, model, serial_number, reference_code, owner_person_id,
   responsible_person_id, location, area_id, acquisition_date,
   purchase_price_minor, currency_code, supplier, replacement_value_minor,
   disposal_date, disposal_notes, warranty_expiry, service_interval,
   last_service_date, next_service_date, service_provider, maintenance_notes,
   issuer, reference_number, issue_date, renewal_date, url, document_notes,
   archived_at, updated_at, current_meter_value, current_meter_unit,
   current_meter_date)
SELECT
   workspace_id, entity_id, entity_type, asset_type, status, description,
   manufacturer, model, serial_number, reference_code, owner_person_id,
   responsible_person_id, location, area_id, acquisition_date,
   purchase_price_minor, currency_code, supplier, replacement_value_minor,
   disposal_date, disposal_notes, warranty_expiry, service_interval,
   last_service_date, next_service_date, service_provider, maintenance_notes,
   issuer, reference_number, issue_date, renewal_date, url, document_notes,
   archived_at, updated_at, current_meter_value, current_meter_unit,
   current_meter_date
  FROM asset_details;

DROP TABLE asset_details;

ALTER TABLE asset_details_new RENAME TO asset_details;

CREATE INDEX asset_details_collection
  ON asset_details (workspace_id, archived_at, updated_at, entity_id);
CREATE INDEX asset_details_type
  ON asset_details (workspace_id, archived_at, asset_type, entity_id);
CREATE INDEX asset_details_status
  ON asset_details (workspace_id, archived_at, status, entity_id);
CREATE INDEX asset_details_warranty
  ON asset_details (workspace_id, archived_at, warranty_expiry);
CREATE INDEX asset_details_renewal
  ON asset_details (workspace_id, archived_at, renewal_date);
CREATE INDEX asset_details_service
  ON asset_details (workspace_id, archived_at, next_service_date);
CREATE INDEX asset_details_owner
  ON asset_details (workspace_id, owner_person_id);
CREATE INDEX asset_details_responsible
  ON asset_details (workspace_id, responsible_person_id);
CREATE INDEX asset_details_area
  ON asset_details (workspace_id, area_id);
CREATE INDEX asset_details_meter
  ON asset_details (workspace_id, archived_at, current_meter_unit, current_meter_value);
