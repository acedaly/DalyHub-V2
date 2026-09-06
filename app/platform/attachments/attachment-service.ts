/**
 * V2.11 FILE-00 — the compensated write, in one place, so no route can reorder
 * it.
 *
 * D1 and R2 share no transaction. That is the whole difficulty of this release,
 * and the answer is not to pretend otherwise but to name every step and every
 * failure between them (ADR-119 decision 6). This module is that sequence, and
 * it is the only place it exists:
 *
 * ```
 *   upload
 *     1. bound the request           (the ROUTE, before the body is read)
 *     2. validate the bytes           size, name, type, extension, signature
 *     3. digest                       SHA-256 over the buffer we will store
 *     4. R2 put with that digest      R2 verifies it and refuses a mismatch
 *     5. D1 insert + Activity         one batch
 *        ├─ succeeded  → done
 *        └─ threw      → compensate: R2 delete
 *                        └─ threw → queue the key in the purge ledger
 *
 *   delete
 *     1. read the row                 workspace-scoped; a foreign id is 404
 *     2. D1 delete + ledger + event   ONE batch
 *     3. R2 delete
 *        ├─ succeeded  → clear the ledger row
 *        └─ threw      → leave it queued; the sweep will finish it
 * ```
 *
 * ## Why the delete order is this way round
 *
 * After step 2 the bytes are unreachable through every DalyHub path and are
 * already recorded as owed to the sweep. The owner is told the truth
 * immediately, and the residue is a byte the system knows about. The opposite
 * order — object first — would risk metadata that names bytes which are gone,
 * which the owner meets as a broken record rather than as a completed delete.
 *
 * ## Why the upload order is this way round
 *
 * A row must never claim an object that does not exist. Writing the object first
 * means the only residue a failure can leave is an object no row names — which
 * is invisible to the product, costs storage, and is exactly what the ledger is
 * for. The reverse would leave a visibly broken attachment on a record.
 */

import {
  AttachmentStorageError,
  AttachmentValidationError,
  assertRecordHasRoom,
  attachmentStorageKey,
  hexDigest,
  keyBelongsToWorkspace,
  validateAttachmentUpload,
  type AttachmentObjectStore,
  type AttachmentRecord,
  type AttachmentRepository,
} from "~/kernel/attachments";

/** Everything the compensated write needs, passed explicitly (ADR-010). */
export interface AttachmentServiceDependencies {
  readonly attachments: AttachmentRepository;
  readonly objects: AttachmentObjectStore;
  /** The SERVER-resolved workspace. Never a request value. */
  readonly workspaceId: string;
  readonly newId?: () => string;
}

/** What an upload was asked to store. */
export interface UploadAttachmentInput {
  readonly ownerEntityId: string;
  readonly filename: unknown;
  readonly declaredMediaType: unknown;
  readonly bytes: Uint8Array;
  /** The client's idempotency key, already validated. */
  readonly uploadOperationId: string;
}

/** What an upload produced. */
export interface UploadAttachmentResult {
  readonly attachment: AttachmentRecord;
  /** False when the same operation id had already been stored. */
  readonly created: boolean;
}

/**
 * Store one file: bytes first, metadata second, compensation always.
 *
 * The caller has already proven the owner record exists in this workspace. The
 * FOREIGN KEY proves it again at the write, which is the guarantee that holds
 * for callers this function has not met yet.
 */
export async function uploadAttachment(
  deps: AttachmentServiceDependencies,
  input: UploadAttachmentInput,
): Promise<UploadAttachmentResult> {
  /* Room on the record, before anything is stored. */
  assertRecordHasRoom(
    await deps.attachments.countForOwner(input.ownerEntityId),
  );

  /* Validate. Throws `AttachmentValidationError` with an owner-facing sentence. */
  const validated = validateAttachmentUpload({
    filename: input.filename,
    declaredMediaType: input.declaredMediaType,
    bytes: input.bytes,
  });

  const attachmentId = (deps.newId ?? (() => crypto.randomUUID()))();
  const storageKey = attachmentStorageKey({
    workspaceId: deps.workspaceId,
    attachmentId,
  });
  const checksumSha256 = await hexDigest(input.bytes);

  /* The object. R2 verifies the digest and refuses a mismatch. */
  await deps.objects.put(storageKey, input.bytes, {
    checksumSha256,
    mediaType: validated.mediaType,
  });

  /* The metadata. On failure the object is compensated, never abandoned. */
  let result: Awaited<ReturnType<AttachmentRepository["create"]>>;
  try {
    result = await deps.attachments.create({
      id: attachmentId,
      ownerEntityId: input.ownerEntityId,
      filename: validated.filename,
      mediaType: validated.mediaType,
      byteSize: validated.byteSize,
      checksumSha256,
      storageKey,
      uploadOperationId: input.uploadOperationId,
    });
  } catch (cause) {
    await rollbackObject(deps, storageKey, "upload_rolled_back");
    throw cause;
  }

  /*
   * The retry path. A repeated upload wrote its own object a moment ago and then
   * lost the insert, so THAT object — the one this attempt just made, not the
   * stored attachment's — is the orphan, and it is compensated the same way.
   * Without this a client that retried five times would leave five objects and
   * one row.
   */
  if (!result.created && result.attachment.storageKey !== storageKey) {
    await rollbackObject(deps, storageKey, "upload_rolled_back");
  }

  return { attachment: result.attachment, created: result.created };
}

/**
 * Remove one file: metadata and ledger together, then the bytes.
 *
 * Returns the deleted record, or `null` when there was nothing to delete —
 * which is also what a cross-workspace id produces, because the read that
 * precedes it is workspace-scoped.
 */
export async function deleteAttachment(
  deps: AttachmentServiceDependencies,
  attachmentId: string,
): Promise<AttachmentRecord | null> {
  const deleted = await deps.attachments.deleteWithPurge(attachmentId);
  if (deleted === null) return null;
  await drainPurge(deps, deleted.storageKey);
  return deleted;
}

/**
 * Delete one queued object and clear its ledger row.
 *
 * Never throws: a failed delete is a ledger row that stays, with its attempt
 * recorded, which is precisely the state the sweep exists to resolve. Reporting
 * a delete failure to the owner as an error would be worse than useless — the
 * metadata really is gone, and there is nothing they can do about a byte.
 */
export async function drainPurge(
  deps: AttachmentServiceDependencies,
  storageKey: string,
): Promise<boolean> {
  /*
   * The key is derived server-side and stored, so this predicate can only fail
   * if something upstream broke. It is here because a sweep acts on rows rather
   * than on a value it just computed, and "delete whatever key this row names"
   * is one refactor away from being a cross-workspace delete.
   */
  if (!keyBelongsToWorkspace(storageKey, deps.workspaceId)) {
    await deps.attachments.recordPurgeAttempt(storageKey, "key_out_of_scope");
    return false;
  }
  try {
    await deps.objects.delete(storageKey);
  } catch (cause) {
    await deps.attachments.recordPurgeAttempt(
      storageKey,
      cause instanceof AttachmentStorageError ? cause.reason : "delete_failed",
    );
    return false;
  }
  await deps.attachments.clearPurge(storageKey);
  return true;
}

/**
 * Drain the oldest queued objects, bounded.
 *
 * Called from the Worker's existing scheduled handler. It is deliberately small
 * and slow: the ledger is a safety net for a rare failure, not a queue with
 * throughput requirements, and a sweep that tried to be fast would be a sweep
 * that could delete a lot of the wrong thing quickly.
 */
export async function sweepAttachmentPurges(
  deps: AttachmentServiceDependencies,
  options: { readonly limit?: number } = {},
): Promise<{ readonly attempted: number; readonly cleared: number }> {
  const queued = await deps.attachments.listPurges({ limit: options.limit });
  let cleared = 0;
  for (const entry of queued) {
    if (await drainPurge(deps, entry.storageKey)) cleared += 1;
  }
  return { attempted: queued.length, cleared };
}

/** Read an attachment's bytes, verifying them against the metadata's digest. */
export async function readAttachmentBytes(
  deps: AttachmentServiceDependencies,
  attachment: AttachmentRecord,
): Promise<Uint8Array> {
  const object = await deps.objects.get(attachment.storageKey);
  if (object === null) {
    /*
     * The metadata says a file exists and the bucket disagrees. This is the
     * "D1 claims an object R2 does not have" case, and it is an ERROR rather
     * than an empty response: the owner is told the file could not be read, the
     * server log carries the key, and nothing pretends a zero-byte download is
     * their document.
     */
    throw new AttachmentStorageError("object_missing", attachment.storageKey);
  }
  const digest = await hexDigest(object.bytes);
  if (digest !== attachment.checksumSha256) {
    throw new AttachmentStorageError(
      "checksum_mismatch",
      attachment.storageKey,
    );
  }
  return object.bytes;
}

/**
 * Compensate a written object whose metadata did not land.
 *
 * Best effort by design, and the failure of the best effort is RECORDED rather
 * than swallowed: if the delete throws, the key goes into the ledger, which is
 * the difference between an orphan the system knows about and one it does not.
 */
async function rollbackObject(
  deps: AttachmentServiceDependencies,
  storageKey: string,
  reason: "upload_rolled_back",
): Promise<void> {
  try {
    await deps.objects.delete(storageKey);
    return;
  } catch {
    /* fall through to the ledger */
  }
  try {
    await deps.attachments.queuePurge(storageKey, reason);
  } catch {
    /*
     * The ledger write failed too, which means D1 is unavailable — the same
     * reason the metadata write failed. There is nothing further this process
     * can do; the object is an orphan, and the workspace audit
     * (`listOrphanedObjects`) is what finds it later. Rethrowing here would
     * replace the caller's real error with a secondary one.
     */
  }
}

/**
 * Every object key in the workspace that no attachment row names.
 *
 * The integrity read behind the "an R2 object exists without D1 knowing"
 * question. It is a bounded prefix listing joined against a bounded metadata
 * listing — both already exist for the export — so it costs nothing new, and it
 * is what makes the orphan claim in the documentation checkable rather than
 * asserted.
 */
export async function listOrphanedObjects(
  deps: AttachmentServiceDependencies,
  prefix: string,
  options: { readonly limit?: number } = {},
): Promise<readonly string[]> {
  const [objects, rows] = await Promise.all([
    deps.objects.list(prefix, { limit: options.limit }),
    deps.attachments.listAll(),
  ]);
  const known = new Set(rows.map((row) => row.storageKey));
  return objects
    .map((object) => object.key)
    .filter((key) => !known.has(key))
    .sort((a, b) => (a < b ? -1 : 1));
}

/**
 * Every attachment row whose object is missing from the bucket.
 *
 * The other half of the same question — "D1 claims an object R2 does not have" —
 * and the one the restore rehearsal asserts is empty.
 */
export async function listMissingObjects(
  deps: AttachmentServiceDependencies,
  prefix: string,
): Promise<readonly AttachmentRecord[]> {
  const [objects, rows] = await Promise.all([
    deps.objects.list(prefix, { limit: 1000 }),
    deps.attachments.listAll(),
  ]);
  const present = new Set(objects.map((object) => object.key));
  return rows.filter((row) => !present.has(row.storageKey));
}

/** True when `error` is an attachment refusal the owner should read verbatim. */
export function isAttachmentValidationError(
  error: unknown,
): error is AttachmentValidationError {
  return error instanceof AttachmentValidationError;
}
