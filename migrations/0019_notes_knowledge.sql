-- NOTES-02/03/06 (knowledge completion): Note organisation + the access paths
-- the Notes collection, global full-content Search and Project Knowledge need.
--
-- This migration is ADDITIVE and IDEMPOTENT. `note_details` keeps its existing
-- identity, composite entity foreign key, STRICT typing and no-blank-content
-- contract (NOTES_PERSISTENCE.md); it gains exactly two columns:
--
--   * `tags`        — a JSON array of normalised (trimmed, case-folded,
--                     de-duplicated, sorted) tag strings, matching the
--                     `person_details.tags` / `asset_details.tags` convention
--                     already in use. NOT a comma-separated id list: tags are
--                     labels, never references. The kernel validates and bounds
--                     the set; a corrupt value degrades to "no tags" on read.
--   * `archived_at` — the reversible "put away" state, distinct from the
--                     entity's own `deleted_at` soft-deletion (exactly as
--                     `person_details.archived_at` / `area_details.archived_at`
--                     already are). NULL means active.
--
-- Note↔record relationships (including Note↔Project knowledge associations and
-- `[[Wiki Link]]` references) are deliberately NOT modelled here: they are
-- ordinary FND-04 `entity_links` rows, which already provide workspace-scoped
-- endpoints, `(workspace, source, target, type)` uniqueness, restore-in-place
-- (so a re-link never duplicates) and atomic Activity. This migration adds no
-- second relationship store.
--
-- Idempotency: every index below is `IF NOT EXISTS`. SQLite/D1 has no
-- `ADD COLUMN IF NOT EXISTS`, so the two ALTERs rely on the migration ledger
-- Wrangler maintains (`wrangler d1 migrations apply`, local and production
-- alike), which applies each numbered file exactly once — the same guarantee
-- every earlier DalyHub migration depends on. Re-running the file's remaining
-- statements is safe; the ALTERs are never re-run.

-- 1. Tags. Defaulted to the empty JSON array so every existing row is valid
--    immediately; no backfill pass is needed and no row is rewritten.
ALTER TABLE note_details ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

-- 2. The reversible archive state. Nullable, so existing rows are active.
ALTER TABLE note_details ADD COLUMN archived_at TEXT;

-- 3. Access path: the ACTIVE (non-archived) Notes of a workspace. The Notes
--    collection's default view and every non-archived search filter on this
--    pair, so keeping the archived rows out of the hot path is worth an index.
CREATE INDEX IF NOT EXISTS note_details_active_workspace_idx
  ON note_details (workspace_id, entity_id)
  WHERE archived_at IS NULL;

-- 4. Access path: the ARCHIVED Notes of a workspace (the Archived view).
CREATE INDEX IF NOT EXISTS note_details_archived_workspace_idx
  ON note_details (workspace_id, archived_at, entity_id)
  WHERE archived_at IS NOT NULL;

-- 5. Access path: the `recent` collection ordering and the search ordering both
--    resolve a Note's EFFECTIVE updated moment, which reads
--    `note_details.updated_at` alongside `entities.updated_at`.
CREATE INDEX IF NOT EXISTS note_details_workspace_updated_idx
  ON note_details (workspace_id, updated_at, entity_id);

-- Deliberately NOT added: a full-text index over `note_details.content`.
--   D1 exposes SQLite's LIKE/instr/substr, and DalyHub's every existing search
--   (People, Assets, Meetings, Reviews, Tasks) is a bounded, workspace-scoped,
--   parameterised `lower(col) LIKE ? ESCAPE '\'` scan. A leading-wildcard LIKE
--   cannot use a B-tree index in any case, so an index on `content` would cost
--   write amplification and buy nothing. FTS5 (which D1 does support) would
--   need a shadow virtual table kept in sync by triggers — a second, derived
--   representation of the canonical Markdown source, which ADR-015 exists to
--   prevent. The candidate set is already narrowed by
--   `entities_active_workspace_type_created_idx` (workspace + type + not
--   deleted) before any content is inspected, and every query is bounded.
--   The trade-off is documented in SHARED_SEARCH.md; revisit if a workspace
--   ever holds enough Notes for the scan to be measurable.
