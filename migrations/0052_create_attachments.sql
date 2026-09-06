-- Migration number: 0052 	 2026-09-06
--
-- V2.11 FILE-00 -- EVIDENCE: the paper lives with the thing.
--
-- See ADR-119 (what the V2.11 definition pass decided) and
-- docs/roadmap/ROADMAP_V2_11.md. This migration is forward-only and it carries
-- NO existing data: there is no attachment anywhere in DalyHub today, because
-- there has never been anywhere to put one.
--
-- ## The model, and why it is not an entity
--
-- ROADMAP_V2_9.md predicted an `attachment` ENTITY linked to its record by
-- EntityLink. The V2.11 pass rejected that, and the reason is the sketch's own
-- acceptance criterion: an attachment must REQUIRE an owner, and DalyHub is not
-- building an orphan file library.
--
--   * An EntityLink cannot express a requirement. Links are created, unlinked
--     and restored freely by design, nothing anywhere demands that one exist,
--     and a soft-deleted link leaves an attachment whose bytes are still
--     reachable and whose owner is not.
--   * An `entities` row would also buy a title, an identity colour, Search
--     exposure, a record route and Activity subjecthood -- five kernel
--     properties an attachment must NOT have, each of which would then need an
--     exclusion, and each exclusion is a place a later change forgets.
--
-- So `attachments` is a CHILD RECORD, on the `task_checklist_items` precedent
-- (0045): a row with a composite foreign key into `entities` and ON DELETE
-- RESTRICT. 0045's own comment says the restrict "exists so that if a permanent
-- purge is ever built ... it is FORCED to clear the checklist first, rather than
-- being allowed to leave orphan rows behind". That argument is stronger here: a
-- checklist orphan costs a row, an attachment orphan costs a byte in an object
-- store that nothing can find.
--
-- The owner key references `entities (workspace_id, id)` -- the UNIQUE index
-- 0003 created -- rather than the `(workspace_id, id, type)` triple 0045 uses,
-- because an attachment's owner may be ANY record type. One key, every consumer,
-- and V2.12's Finance transaction (already specified as a light entity so it can
-- carry a receipt) needs no change here at all.
--
-- ## One owner. No multi-linking, and no deduplication
--
-- `owner_entity_id` is singular and NOT NULL. The same PDF on an Obligation and
-- on the Asset it is about is TWO attachments and two objects. Multi-owner would
-- make "delete this file" undecidable without a reference count, a
-- last-owner-went-away sweep and a rule for what a workspace purge does with a
-- half-referenced object -- a second lifecycle system bought for a case nobody
-- has asked for.
--
-- `checksum_sha256` is therefore NOT unique and NOT a key. It is EVIDENCE: it
-- proves the bytes came back after a restore and it detects corruption. Two
-- records may deliberately carry the same file, and deduplicating them would
-- make one owner's delete silently a no-op for another owner's file.
--
-- ## The bytes are somewhere else, and that is the whole difficulty
--
-- The object lives in the private `ATTACHMENTS` R2 bucket. D1 and R2 share no
-- transaction, so every failure between them is named rather than assumed
-- (ADR-119 decision 6):
--
--   upload   R2 put (R2 verifies the SHA-256 it is given) -> D1 insert.
--            A failed insert deletes the object, and a failed delete queues
--            it.
--   delete   D1 delete + purge row in ONE batch -> R2 delete.
--            After the batch the bytes are unreachable through every DalyHub
--            path AND already recorded as owed to the sweep, which is why this
--            order and not the other: an owner told a file is gone while its
--            bytes remain is the one failure this release must not have.
--
-- `attachment_object_purges` is that ledger. It is the difference between "we
-- tried to clean up" and "the system knows there is a byte to clean up".
--
-- ## Idempotency is a constraint, not a convention
--
-- `upload_operation_id` is the client's idempotency key and it is UNIQUE per
-- workspace. A retried upload loses the insert, deletes the object it had just
-- written, and returns the attachment that already exists. A retry can therefore
-- never produce two attachments, and the guarantee does not depend on the client
-- behaving.
--
-- ## What is deliberately absent
--
--   * no `updated_at`  -- an attachment is IMMUTABLE. V2.11 has no rename, no
--                         replace and no versioning. A row is inserted once and
--                         deleted once. A column that never changes is a column
--                         that invites a change that should not happen.
--   * no `deleted_at`  -- deletion is HARD, for the reason above. A soft-deleted
--                         attachment whose bytes remain tells the owner a lie.
--   * no `title`       -- the filename is the name. One name, one place.
--   * no `position`    -- attachments are ordered by when they arrived.

-- ---------------------------------------------------------------------------
-- 1. The attachment.
-- ---------------------------------------------------------------------------

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- REQUIRED. The record this evidence belongs to, of any type.
  owner_entity_id TEXT NOT NULL,
  -- The owner's own filename, stored verbatim within the bound. It is never
  -- part of the object key and never interpolated into a header without the
  -- RFC 6266 fold -- see `app/kernel/attachments/attachment-filename.ts`.
  filename TEXT NOT NULL,
  -- From the validated allow-list. Never the client's declaration alone: the
  -- extension and, for the formats that have an unambiguous one, the leading
  -- signature are checked before this is written.
  media_type TEXT NOT NULL,
  -- What was actually stored, not what was declared.
  byte_size INTEGER NOT NULL,
  -- Lowercase hex SHA-256, computed here and verified by R2 on write.
  checksum_sha256 TEXT NOT NULL,
  -- Derived (`workspaces/<workspace>/attachments/<id>`) and STORED, so a future
  -- change to the derivation rule cannot strand the objects written under the
  -- old one. Never rendered to a surface, never in an export, never in an
  -- Activity payload.
  storage_key TEXT NOT NULL,
  -- The client's idempotency key for the upload that created this row.
  upload_operation_id TEXT NOT NULL,
  -- The Access subject that uploaded it, where the identity model has one.
  -- Nullable, like every other actor column, so a system-actor write is
  -- expressible rather than fabricated.
  uploaded_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  -- The required owner. ON DELETE RESTRICT, so a permanent purge is FORCED to
  -- clear the evidence rather than being allowed to orphan its bytes.
  FOREIGN KEY (workspace_id, owner_entity_id)
    REFERENCES entities (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT attachments_id_bounded CHECK (length(id) > 0 AND length(id) <= 64),
  CONSTRAINT attachments_workspace_not_empty CHECK (length(workspace_id) > 0),
  CONSTRAINT attachments_owner_bounded CHECK (
    length(owner_entity_id) > 0 AND length(owner_entity_id) <= 64
  ),
  -- Bounded at the storage boundary as well as in the kernel. The kernel's
  -- validator produces the readable message. This is the last line of defence,
  -- and it is what makes an unbounded filename a write failure rather than a row.
  CONSTRAINT attachments_filename_bounded CHECK (
    length(trim(filename)) > 0 AND length(filename) <= 200
  ),
  -- A filename can never introduce a path segment. The kernel refuses one long
  -- before here. The database refuses it too, because this column is what the
  -- Obsidian vault and the export archive derive their paths from.
  CONSTRAINT attachments_filename_no_separator CHECK (
    instr(filename, '/') = 0
    AND instr(filename, '\') = 0
    AND instr(filename, char(0)) = 0
    AND instr(filename, char(10)) = 0
    AND instr(filename, char(13)) = 0
  ),
  CONSTRAINT attachments_media_type_bounded CHECK (
    length(media_type) > 0 AND length(media_type) <= 128
  ),
  -- Never zero. An empty file is not evidence, and accepting one would make
  -- "the bytes came back" unfalsifiable. The ceiling is FILE-00's stated 10 MiB
  -- bound, enforced here as well as before the body is read.
  CONSTRAINT attachments_byte_size_bounded CHECK (
    byte_size > 0 AND byte_size <= 10485760
  ),
  CONSTRAINT attachments_checksum_shape CHECK (length(checksum_sha256) = 64),
  CONSTRAINT attachments_storage_key_bounded CHECK (
    length(storage_key) > 0 AND length(storage_key) <= 512
  ),
  CONSTRAINT attachments_operation_bounded CHECK (
    length(upload_operation_id) >= 8 AND length(upload_operation_id) <= 128
  ),
  CONSTRAINT attachments_uploaded_by_bounded CHECK (
    uploaded_by IS NULL OR (length(uploaded_by) > 0 AND length(uploaded_by) <= 256)
  ),
  CONSTRAINT attachments_created_at_not_empty CHECK (length(created_at) > 0)
);

-- Access path: the only read a record surface makes -- "the evidence on this
-- record, oldest first". One bounded statement per record page, never one per
-- attachment.
CREATE INDEX attachments_owner_idx
  ON attachments (workspace_id, owner_entity_id, created_at, id);

-- Access path: the workspace sweep -- export, restore parity and purge. Ordered
-- by id so a snapshot is byte-identical twice running.
CREATE INDEX attachments_workspace_idx
  ON attachments (workspace_id, id);

-- The idempotency constraint. A retried upload with the same operation id
-- CANNOT insert a second row. It loses here, deterministically, and the route
-- returns the attachment that already exists.
CREATE UNIQUE INDEX attachments_upload_operation_key
  ON attachments (workspace_id, upload_operation_id);

-- ---------------------------------------------------------------------------
-- 2. The compensation ledger: object bytes with no metadata.
-- ---------------------------------------------------------------------------
--
-- A row here means "this object key is owed to the sweep": either the metadata
-- was deleted and the object has not been (the ordinary delete path, where the
-- row exists for the moment between the batch and the R2 call), or an upload's
-- D1 insert failed and its object could not be removed, or a destructive
-- restore replaced a workspace whose previous objects are now unreachable.
--
-- It holds NO owner content: a key, a reason and the attempt record. The key
-- carries two application-generated identifiers and nothing a person wrote.
--
-- It has no foreign key to `attachments` ON PURPOSE. Every row here describes an
-- attachment that no longer exists -- that is what makes it a ledger of bytes
-- rather than a column on a record.

CREATE TABLE attachment_object_purges (
  workspace_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  -- Why the bytes are owed. A closed vocabulary, so the sweep's log and the
  -- integrity report can group without parsing prose.
  reason TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  -- The LAST failure's short reason, for the operator. Never an R2 error string
  -- verbatim and never anything owner-authored.
  last_error TEXT,
  CONSTRAINT attachment_object_purges_pk PRIMARY KEY (workspace_id, storage_key),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CONSTRAINT attachment_object_purges_workspace_not_empty CHECK (
    length(workspace_id) > 0
  ),
  CONSTRAINT attachment_object_purges_key_bounded CHECK (
    length(storage_key) > 0 AND length(storage_key) <= 512
  ),
  CONSTRAINT attachment_object_purges_reason_valid CHECK (
    reason IN (
      'attachment_deleted',
      'upload_rolled_back',
      'workspace_replaced',
      'restore_rolled_back'
    )
  ),
  CONSTRAINT attachment_object_purges_queued_not_empty CHECK (
    length(queued_at) > 0
  ),
  CONSTRAINT attachment_object_purges_attempts_nonneg CHECK (attempts >= 0),
  CONSTRAINT attachment_object_purges_last_error_bounded CHECK (
    last_error IS NULL OR length(last_error) <= 200
  )
);

-- Access path: the sweep drains oldest-first, bounded, across every workspace
-- the Worker serves.
CREATE INDEX attachment_object_purges_queue_idx
  ON attachment_object_purges (queued_at, workspace_id, storage_key);
