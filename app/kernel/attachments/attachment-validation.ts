/**
 * V2.11 FILE-00 — one validator, applied before a byte is written anywhere.
 *
 * The order of the checks is the design, not an accident:
 *
 *   1. **Size** — the only check that can be made without allocating. It is
 *      applied twice, once against the declared `Content-Length` at the route
 *      and once here against the real byte length, because a declaration is a
 *      claim and the length is a fact.
 *   2. **Name** — refuses a name that could become a path or a header.
 *   3. **Declared type** — must be on the allow-list, with the two active-content
 *      types refused by their own sentence.
 *   4. **Extension** — must be one the declared type is known by, so a `.pdf`
 *      declared `image/png` is refused whichever half is the lie.
 *   5. **Signature** — for the formats that have a short unambiguous one, the
 *      leading bytes must match.
 *
 * A refusal is an {@link AttachmentValidationError} with a sentence the owner can
 * act on. It never names the storage key, never quotes the bytes, and never
 * echoes the declared type back into prose — an error message is a place a
 * crafted value would love to appear.
 */

import { AttachmentValidationError } from "./attachment-errors";
import { validateAttachmentFilename } from "./attachment-filename";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_RECORD,
  MIN_ATTACHMENT_BYTES,
  formatAttachmentSize,
} from "./attachment-limits";
import {
  ATTACHMENT_REFUSED_MEDIA_TYPES,
  attachmentMediaType,
  filenameExtension,
  matchesSignature,
  mediaTypesForExtension,
  normaliseMediaType,
  type AttachmentMediaType,
} from "./attachment-media-types";

/** What the validator was given. */
export interface AttachmentUploadCandidate {
  readonly filename: unknown;
  /** The media type the client declared. Never trusted on its own. */
  readonly declaredMediaType: unknown;
  readonly bytes: Uint8Array;
}

/** What the validator produced: the values that may be stored. */
export interface ValidatedAttachmentUpload {
  readonly filename: string;
  readonly mediaType: string;
  readonly media: AttachmentMediaType;
  readonly byteSize: number;
}

/**
 * Refuse an upload whose declared length is already over the bound, BEFORE the
 * body is read into the isolate.
 *
 * Separate from {@link validateAttachmentUpload} because it runs at a different
 * moment and on a different value — a header, not a buffer — and conflating them
 * is how a "we check the size" claim becomes true only after the allocation it
 * was supposed to prevent.
 */
export function assertDeclaredSizeWithinBound(declaredBytes: number): void {
  if (!Number.isFinite(declaredBytes) || declaredBytes < 0) return;
  if (declaredBytes > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError("file", tooLargeMessage());
  }
}

/** The one sentence an oversized file gets, wherever it is refused. */
export function tooLargeMessage(): string {
  return `That file is larger than ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)}, which is the most DalyHub stores for one attachment.`;
}

/** Refuse a record that is already at its evidence bound. */
export function assertRecordHasRoom(existingCount: number): void {
  if (existingCount >= MAX_ATTACHMENTS_PER_RECORD) {
    throw new AttachmentValidationError(
      "owner",
      `This record already has ${MAX_ATTACHMENTS_PER_RECORD} files, which is the most one record holds. Remove one before adding another.`,
    );
  }
}

/**
 * Validate everything about one upload. Pure: same inputs, same outcome, no I/O.
 */
export function validateAttachmentUpload(
  candidate: AttachmentUploadCandidate,
): ValidatedAttachmentUpload {
  /* 1. Size ---------------------------------------------------------------- */
  const byteSize = candidate.bytes.length;
  if (byteSize < MIN_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError(
      "file",
      "That file is empty, so there is nothing to attach.",
    );
  }
  if (byteSize > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError("file", tooLargeMessage());
  }

  /* 2. Name ---------------------------------------------------------------- */
  const filename = validateAttachmentFilename(candidate.filename);

  /* 3. Declared type ------------------------------------------------------- */
  const declared =
    typeof candidate.declaredMediaType === "string"
      ? normaliseMediaType(candidate.declaredMediaType)
      : "";
  const refusal = ATTACHMENT_REFUSED_MEDIA_TYPES[declared];
  if (refusal !== undefined) {
    throw new AttachmentValidationError("file", refusal);
  }
  const extension = filenameExtension(filename);
  /*
   * A browser sometimes sends an empty type, or `application/octet-stream`, for
   * a file it does not recognise — commonly for `.heic` and for Office files on
   * some platforms. Falling back to the EXTENSION is legitimate there and only
   * there: the extension is matched against the same allow-list, so an unknown
   * extension is still refused, and a declared type that IS on the list is never
   * overridden by one.
   */
  const media =
    attachmentMediaType(declared) ??
    (declared === "" || declared === "application/octet-stream"
      ? (mediaTypesForExtension(extension)[0] ?? null)
      : null);
  if (media === null) {
    throw new AttachmentValidationError("file", unsupportedTypeMessage());
  }

  /* 4. Extension ----------------------------------------------------------- */
  if (!media.extensions.includes(extension)) {
    throw new AttachmentValidationError(
      "file",
      `That file’s name doesn’t end in ${media.extensions.join(" or ")}, but its contents say it is a ${media.label}. Rename it so the two agree.`,
    );
  }

  /* 5. Signature ----------------------------------------------------------- */
  if (!matchesSignature(media, candidate.bytes)) {
    throw new AttachmentValidationError(
      "file",
      `That file is named like a ${media.label} but doesn’t start like one, so DalyHub won’t store it as one.`,
    );
  }

  return { filename, mediaType: media.value, media, byteSize };
}

/** The one sentence an unsupported type gets. */
export function unsupportedTypeMessage(): string {
  return "DalyHub doesn’t accept that kind of file as evidence. PDFs, photos, plain text and common office documents are accepted.";
}

/**
 * Validate a client-supplied upload operation id.
 *
 * It is an IDEMPOTENCY KEY, not a secret and not an identifier of anything: the
 * client mints one per upload attempt and repeats it on retry. It is bounded and
 * character-restricted so it cannot become a way to smuggle content into a
 * column, and it is never rendered anywhere.
 */
export function validateUploadOperationId(value: unknown): string {
  if (typeof value !== "string") {
    throw new AttachmentValidationError(
      "operation",
      "That upload could not be identified. Try again.",
    );
  }
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    throw new AttachmentValidationError(
      "operation",
      "That upload could not be identified. Try again.",
    );
  }
  return trimmed;
}
