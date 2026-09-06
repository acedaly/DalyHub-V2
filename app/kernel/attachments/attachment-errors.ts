/**
 * V2.11 FILE-00 Attachments kernel — the domain's own typed refusals.
 *
 * Two error kinds, and the split is the point:
 *
 *   - {@link AttachmentValidationError} is about the file the owner chose — too
 *     big, wrong type, an unusable name. It carries a field and a sentence the
 *     owner can act on, and a route maps it to a 4xx with that sentence.
 *   - {@link AttachmentStorageError} is about the object store — a put that
 *     failed, a get that found nothing, a delete that would not. It carries a
 *     SHORT internal reason and never the provider's own message, because that
 *     message is logged and summarised and must not become a leak (the rule
 *     `ZipReadError` already follows for archives).
 *
 * Nothing here interpolates a filename into a message the server logs. The owner
 * sees their own filename in the UI, where they typed it; the log sees the rule
 * that refused it.
 */

/** Which part of an upload a refusal is about. Kept open: callers name their own. */
export type AttachmentValidationField = string;

/** A value crossing the attachment domain boundary was malformed or refused. */
export class AttachmentValidationError extends Error {
  readonly code = "attachment_validation" as const;

  constructor(
    readonly field: AttachmentValidationField,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

/** Why an object-store operation failed, as a closed vocabulary. */
export type AttachmentStorageFailure =
  /** The bucket refused or could not complete a write. */
  | "put_failed"
  /** The bucket has no object under that key. */
  | "object_missing"
  /** The bucket refused or could not complete a delete. */
  | "delete_failed"
  /** The bucket returned bytes that do not match the digest recorded for them. */
  | "checksum_mismatch"
  /** No object store is configured for this environment at all. */
  | "unavailable";

/**
 * An object-store operation failed.
 *
 * `reason` is a closed vocabulary, never the provider's string. The optional
 * `key` is DalyHub's own derived key — two application identifiers and nothing a
 * person wrote — so it is safe in a server log and is still never sent to a
 * client.
 */
export class AttachmentStorageError extends Error {
  readonly code = "attachment_storage" as const;

  constructor(
    readonly reason: AttachmentStorageFailure,
    readonly key: string | null = null,
  ) {
    super(`Attachment storage operation failed: ${reason}.`);
    this.name = "AttachmentStorageError";
  }
}
