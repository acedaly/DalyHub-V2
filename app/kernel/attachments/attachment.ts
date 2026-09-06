/**
 * V2.11 FILE-00 Attachments kernel — the attachment contract and its bounds.
 *
 * Storage-independent by construction: nothing here imports D1, R2 or any
 * Cloudflare type. The D1 adapter (`app/platform/storage/d1`) implements the
 * metadata repository and the R2 adapter (`app/platform/attachments`) implements
 * the object-store port; both are the only places their vendor's shapes exist.
 *
 * ## What an attachment is
 *
 * One file, belonging to exactly ONE record, stored once. It is not an entity:
 * it has no title of its own, no record page, no identity colour, no Search
 * entry and no Activity subjecthood. It is a child record with a REQUIRED owner,
 * on the `task_checklist_items` precedent — see ADR-119 decision 1 and
 * `migrations/0052_create_attachments.sql`.
 *
 * ## The two shapes, and why there are two
 *
 * {@link AttachmentRecord} is what the server holds. It carries the storage key
 * and the checksum, because the server needs both.
 *
 * {@link SerializedAttachment} is what a surface receives, and it carries
 * NEITHER. The key is an implementation fact and the checksum is an integrity
 * fact; a record page needs a filename, a size and a date. Keeping them in two
 * types means a leak is a type error rather than a review finding.
 */

/**
 * A stored attachment, as the server holds it.
 *
 * An attachment is IMMUTABLE. There is no `updatedAt` because nothing about a
 * row ever changes after it is inserted — V2.11 has no rename, no replace and no
 * versioning — and no `deletedAt` because deletion is hard: a soft-deleted
 * attachment whose bytes remain tells the owner a lie.
 */
export interface AttachmentRecord {
  readonly id: string;
  readonly workspaceId: string;
  /** The record this evidence belongs to. Never null, never plural. */
  readonly ownerEntityId: string;
  /** The owner's own filename, verbatim within the bound. */
  readonly filename: string;
  /** The validated media type, canonical and lowercase. */
  readonly mediaType: string;
  /** What was actually stored. */
  readonly byteSize: number;
  /** Lowercase hex SHA-256 of the bytes. */
  readonly checksumSha256: string;
  /** The derived object key. Never rendered, never exported, never logged to a client. */
  readonly storageKey: string;
  /** The idempotency key of the upload that created this row. */
  readonly uploadOperationId: string;
  /** The actor subject that uploaded it, where the identity model has one. */
  readonly uploadedBy: string | null;
  readonly createdAt: Date;
}

/**
 * What a surface receives.
 *
 * No storage key, no checksum, no workspace id, no operation id. Those are
 * implementation facts, and a record page that never receives them cannot leak
 * them.
 */
export interface SerializedAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  /** What the owner is told this class of file is, in one word ("PDF", "Image"). */
  readonly kindLabel: string;
  readonly byteSize: number;
  /** "1.2 MB" — formatted once, server-side, so every surface agrees. */
  readonly sizeLabel: string;
  /** ISO-8601 UTC instant. */
  readonly createdAt: string;
  /** "6 September 2026" — the owner's own date formatting. */
  readonly createdLabel: string;
  /** The authenticated download route. Always `Content-Disposition: attachment`. */
  readonly downloadHref: string;
  /**
   * The authenticated inline route, for raster images only, or `null`.
   *
   * `null` is the answer for every other type, including PDF: DalyHub's CSP sets
   * `object-src`, `frame-src` and `media-src` to `'none'`, so nothing but an
   * `<img>` can display a byte inside a DalyHub page.
   */
  readonly previewHref: string | null;
}

/**
 * Input to create an attachment, after every value has been validated.
 *
 * The `id` is supplied by the CALLER rather than minted inside the repository,
 * and that is load-bearing rather than stylistic: the storage key is derived
 * from the attachment id, and the object has to be written under that key BEFORE
 * the metadata row exists (ADR-119 decision 6). A repository that minted its own
 * id would produce a row whose id and whose key disagreed — which still works,
 * right up to the moment a restore needs to write an archived object to its
 * final, deterministic key and finds it cannot derive one.
 */
export interface CreateAttachmentInput {
  readonly id: string;
  readonly ownerEntityId: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly storageKey: string;
  readonly uploadOperationId: string;
}

/** What a create call actually did. */
export type CreateAttachmentOutcome =
  /** A new row was inserted. */
  | "created"
  /**
   * The same `uploadOperationId` already had a row, so this call wrote nothing
   * and the existing attachment is returned. The retry guarantee (ADR-119
   * decision 6), enforced by a UNIQUE index rather than by convention.
   */
  | "already_uploaded";

/** Result of a create. `created` is true only for a brand-new row. */
export interface CreateAttachmentResult {
  readonly attachment: AttachmentRecord;
  readonly outcome: CreateAttachmentOutcome;
  readonly created: boolean;
}

/** One entry in the compensation ledger: object bytes owed to the sweep. */
export interface AttachmentObjectPurge {
  readonly workspaceId: string;
  readonly storageKey: string;
  readonly reason: AttachmentPurgeReason;
  readonly queuedAt: Date;
  readonly attempts: number;
  readonly lastAttemptAt: Date | null;
  readonly lastError: string | null;
}

/** Why an object's bytes are owed to the sweep. A closed vocabulary. */
export type AttachmentPurgeReason =
  /** The ordinary delete: the row is gone, the object may not be yet. */
  | "attachment_deleted"
  /** An upload's metadata write failed and its object could not be removed. */
  | "upload_rolled_back"
  /** A destructive restore replaced a workspace; its old objects are unreachable. */
  | "workspace_replaced"
  /** A restore wrote objects and then failed before its rows became visible. */
  | "restore_rolled_back";

/**
 * The workspace-scoped attachment repository.
 *
 * There is deliberately no `workspaceId` on any input: scope comes from the
 * repository's bound `WorkspaceContext` (FND-03 / ADR-010), so module code
 * cannot select or override it and a stray `workspaceId` property is a type
 * error rather than a silently-honoured override.
 */
export interface AttachmentRepository {
  /**
   * Insert one attachment's metadata, with its Activity event, in one batch.
   *
   * The owner is verified to exist IN THIS WORKSPACE by the foreign key, so an
   * owner id from another workspace fails the write rather than creating a row
   * that points across the boundary.
   */
  create(input: CreateAttachmentInput): Promise<CreateAttachmentResult>;

  /** Read one attachment by id, scoped to the workspace. `null` when not found. */
  get(attachmentId: string): Promise<AttachmentRecord | null>;

  /**
   * The evidence on one record, oldest first.
   *
   * ONE bounded statement. A record page never reads an attachment's metadata
   * one row at a time and never reads a byte to list metadata.
   */
  listForOwner(
    ownerEntityId: string,
    options?: { readonly limit?: number },
  ): Promise<readonly AttachmentRecord[]>;

  /** How many attachments a record already has. Used to enforce the per-record bound. */
  countForOwner(ownerEntityId: string): Promise<number>;

  /**
   * The evidence on many records at once, for a collection page.
   *
   * Bounded PER OWNER, on the EntityLink precedent, so one heavily-evidenced
   * record cannot starve the rest of the page.
   */
  listForOwners(
    ownerEntityIds: readonly string[],
    options?: { readonly limitPerOwner?: number },
  ): Promise<ReadonlyMap<string, readonly AttachmentRecord[]>>;

  /**
   * Every attachment in the workspace, ordered by id.
   *
   * The export and the restore-parity check read this. Bounded by
   * {@link MAX_ATTACHMENTS_PER_ARCHIVE}; a workspace above the bound is an
   * explicit failure, never a silent truncation.
   */
  listAll(options?: {
    readonly limit?: number;
  }): Promise<readonly AttachmentRecord[]>;

  /**
   * Delete one attachment's metadata AND queue its bytes, in one batch, with the
   * Activity event.
   *
   * Returns the deleted record, or `null` when there was nothing to delete. The
   * caller then deletes the object and, on success, clears the queue row — see
   * ADR-119 decision 6 for why the metadata goes first.
   */
  deleteWithPurge(attachmentId: string): Promise<AttachmentRecord | null>;

  /** Queue an object key for the sweep without deleting any metadata. */
  queuePurge(storageKey: string, reason: AttachmentPurgeReason): Promise<void>;

  /** Remove a queue row once its bytes are actually gone. */
  clearPurge(storageKey: string): Promise<void>;

  /** The oldest queued purges, bounded, for the sweep. */
  listPurges(options?: {
    readonly limit?: number;
  }): Promise<readonly AttachmentObjectPurge[]>;

  /** Record that a sweep attempt failed, so the ledger shows what is stuck. */
  recordPurgeAttempt(storageKey: string, error: string): Promise<void>;
}
