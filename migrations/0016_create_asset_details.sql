-- ASSET-01: the first-class Asset detail slice.
--
-- An Asset's identity, display title, workspace and soft-delete lifecycle stay
-- ordinary `entities` fields (type 'asset'); Assets are NOT part of the
-- Area→Goal→Project→Task spine (AGENTS.md §4) and add no spine_records row. This
-- additive, STRICT table owns the structured Asset detail slice — type, status,
-- identity, ownership/location (canonical ids, never duplicated records),
-- acquisition & value (integer minor units, never floats — ADR-049), warranty &
-- service, and document/policy/licence fields — plus the reversible `archived_at`
-- put-away state (distinct from the entity's `deleted_at` soft-deletion, and
-- distinct again from the real-world `status`).
--
-- Like meeting_details / person_details, EVERY Asset MUST have EXACTLY ONE row
-- here: reads INNER-JOIN this table, so a detail-less 'asset' entity would be
-- invisible and unrepairable through the AssetRepository. The generic
-- EntityRepository refuses to CREATE an 'asset' entity (only the AssetRepository
-- does, atomically), so a fresh detail-less Asset is impossible. No backfill is
-- needed: before this migration no 'asset' entity could exist.
--
-- Money is stored as INTEGER minor units of `currency_code` (never a float); the
-- kernel never converts between currencies. Date fields are wall-calendar
-- YYYY-MM-DD strings compared as integers, never instants (ADR-022 §22.7). `tags`
-- is a JSON array of strings (bounded/validated in the kernel). The composite FK
-- to entities(workspace_id, id, type) makes a detail row that disagrees with its
-- entity type impossible; ON DELETE RESTRICT keeps the slice through soft-deletion.
CREATE TABLE asset_details (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'asset',
  -- Identity
  asset_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  reference_code TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  -- Ownership & location (canonical ids only)
  owner_person_id TEXT,
  responsible_person_id TEXT,
  location TEXT,
  area_id TEXT,
  -- Acquisition & value
  acquisition_date TEXT,
  purchase_price_minor INTEGER,
  currency_code TEXT,
  supplier TEXT,
  replacement_value_minor INTEGER,
  disposal_date TEXT,
  disposal_notes TEXT,
  -- Warranty & service
  warranty_expiry TEXT,
  service_interval TEXT,
  last_service_date TEXT,
  next_service_date TEXT,
  service_provider TEXT,
  maintenance_notes TEXT,
  -- Document / policy / licence / subscription
  issuer TEXT,
  reference_number TEXT,
  issue_date TEXT,
  renewal_date TEXT,
  url TEXT,
  document_notes TEXT,
  -- Lifecycle
  archived_at TEXT,
  updated_at TEXT NOT NULL,
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
  CONSTRAINT asset_details_tags_not_empty CHECK (length(tags) > 0),
  CONSTRAINT asset_details_updated_at_not_empty CHECK (length(updated_at) > 0),
  CONSTRAINT asset_details_entity_fk FOREIGN KEY (workspace_id, entity_id, entity_type)
    REFERENCES entities (workspace_id, id, type) ON DELETE RESTRICT
) STRICT;

-- Active/archived collection partition + recency ordering within a workspace.
CREATE INDEX asset_details_collection
  ON asset_details (workspace_id, archived_at, updated_at, entity_id);
-- Type and status filtered collections.
CREATE INDEX asset_details_type
  ON asset_details (workspace_id, archived_at, asset_type, entity_id);
CREATE INDEX asset_details_status
  ON asset_details (workspace_id, archived_at, status, entity_id);
-- Expiring-soon queries (warranty + renewal) and service-due queries.
CREATE INDEX asset_details_warranty
  ON asset_details (workspace_id, archived_at, warranty_expiry);
CREATE INDEX asset_details_renewal
  ON asset_details (workspace_id, archived_at, renewal_date);
CREATE INDEX asset_details_service
  ON asset_details (workspace_id, archived_at, next_service_date);
-- Owner / responsible Person and Area facets.
CREATE INDEX asset_details_owner
  ON asset_details (workspace_id, owner_person_id);
CREATE INDEX asset_details_responsible
  ON asset_details (workspace_id, responsible_person_id);
CREATE INDEX asset_details_area
  ON asset_details (workspace_id, area_id);
