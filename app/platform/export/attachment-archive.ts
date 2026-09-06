/**
 * V2.11 FILE-02 — the binary half of a DalyHub archive, and the rule that an
 * export which cannot read a byte FAILS.
 *
 * ## The shape
 *
 * ```
 *   manifest.json          — what this archive is, including every file below
 *   dalyhub-snapshot.json  — every record, including `records.attachments`
 *   attachments/<id>       — one entry per attachment, named by its id
 *   README.md  SCHEMA.md  CHECKSUMS.txt
 * ```
 *
 * The entry is named by the attachment's **id**, not by its filename. Three
 * reasons, and the third is the one that decides it:
 *
 *   1. filenames collide — two records can both hold `receipt.pdf`;
 *   2. filenames are hostile — the archive path rules would have to sanitise
 *      every one of them, which is a second sanitiser beside the vault's;
 *   3. the id is what the SNAPSHOT ROW carries, so a manifest entry, a snapshot
 *      row and an archive path are the same string, and a restore matches them
 *      without parsing anything.
 *
 * The owner's filename is not lost: it is on the snapshot row, it is in the
 * manifest, and the Obsidian vault — which is the archive a person reads — puts
 * the file under its real name beside its record.
 *
 * ## No R2 key appears in an archive
 *
 * Not in the path, not in the manifest, not in the snapshot. An archive must be
 * restorable into a DIFFERENT environment, and a storage key is the exporting
 * deployment's own bucket layout (ADR-119 decision 8). The key is derived on the
 * way back in.
 *
 * ## Failing is the feature
 *
 * {@link readAttachmentBytesForArchive} throws when it cannot read a file, and
 * the export route turns that into an honest error. A backup missing a byte is
 * not a backup, and an archive that quietly omitted one would be the single most
 * expensive lie this release could tell.
 */

import type { SnapshotAttachment } from "~/kernel/export";
import {
  MAX_ATTACHMENTS_PER_ARCHIVE,
  attachmentStorageKey,
  hexDigest,
  type AttachmentObjectStore,
} from "~/kernel/attachments";

/** The folder every attachment entry lives under, inside an archive. */
export const ARCHIVE_ATTACHMENT_FOLDER = "attachments";

/** The archive path for one attachment. Pure, and derived from its id alone. */
export function archiveAttachmentPath(attachmentId: string): string {
  return `${ARCHIVE_ATTACHMENT_FOLDER}/${attachmentId}`;
}

/** True when `path` is an attachment entry. Used by the archive reader. */
export function isArchiveAttachmentPath(path: string): boolean {
  return (
    path.startsWith(`${ARCHIVE_ATTACHMENT_FOLDER}/`) &&
    path.indexOf("/", ARCHIVE_ATTACHMENT_FOLDER.length + 1) === -1 &&
    path.length > ARCHIVE_ATTACHMENT_FOLDER.length + 1
  );
}

/** The attachment id an archive path names, or `null` when it is not one. */
export function attachmentIdFromArchivePath(path: string): string | null {
  if (!isArchiveAttachmentPath(path)) return null;
  return path.slice(ARCHIVE_ATTACHMENT_FOLDER.length + 1);
}

/** What the manifest records about one archived file. */
export interface ManifestAttachment {
  readonly id: string;
  /** The owner's own filename, for a person reading the manifest. */
  readonly filename: string;
  readonly mediaType: string;
  readonly byteSize: number;
  /** Lowercase hex SHA-256. Verified on restore, twice. */
  readonly sha256: string;
  /** Where the bytes are, inside this archive. */
  readonly path: string;
}

/**
 * An export could not read an attachment's bytes.
 *
 * Deliberately a distinct error class: the export route maps it to its own
 * sentence, and the sentence has to say that NO archive was produced rather
 * than that one was produced with something missing.
 */
export class AttachmentExportError extends Error {
  constructor(
    readonly reason:
      "object_missing" | "checksum_mismatch" | "unavailable" | "too_many",
    readonly attachmentId: string | null = null,
  ) {
    super(`Attachment bytes could not be exported: ${reason}.`);
    this.name = "AttachmentExportError";
  }
}

/** One attachment's bytes, ready to be placed in the archive. */
export interface ArchivedAttachment {
  readonly row: SnapshotAttachment;
  readonly path: string;
  readonly bytes: Uint8Array;
}

/**
 * Read every attachment's bytes for an archive, verifying each one.
 *
 * Each object is read at its DERIVED key — the same derivation the upload used —
 * and its bytes are digested and compared with the metadata's own checksum
 * BEFORE they go into the archive. Two things follow:
 *
 *   - an archive can never contain a file that does not match its manifest,
 *     because the manifest is written from the same verified digest;
 *   - the "D1 says this exists and R2 disagrees" case is caught at BACKUP time,
 *     which is the moment it is cheapest to discover.
 *
 * `store` may be `null` — a deployment with no bucket bound. That is fine only
 * when there is nothing to read: an attachment row with no way to read its bytes
 * is an export that must fail rather than omit.
 */
export async function readAttachmentBytesForArchive(options: {
  readonly workspaceId: string;
  readonly attachments: readonly SnapshotAttachment[];
  readonly store: AttachmentObjectStore | null;
}): Promise<readonly ArchivedAttachment[]> {
  const { workspaceId, attachments, store } = options;
  if (attachments.length === 0) return [];
  if (attachments.length > MAX_ATTACHMENTS_PER_ARCHIVE) {
    throw new AttachmentExportError("too_many");
  }
  if (store === null) {
    throw new AttachmentExportError("unavailable", attachments[0]!.id);
  }

  const archived: ArchivedAttachment[] = [];
  for (const row of attachments) {
    const key = attachmentStorageKey({
      workspaceId,
      attachmentId: row.id,
    });
    const object = await store.get(key);
    if (object === null) {
      throw new AttachmentExportError("object_missing", row.id);
    }
    const digest = await hexDigest(object.bytes);
    if (digest !== row.checksumSha256 || object.bytes.length !== row.byteSize) {
      throw new AttachmentExportError("checksum_mismatch", row.id);
    }
    archived.push({
      row,
      path: archiveAttachmentPath(row.id),
      bytes: object.bytes,
    });
  }
  return archived;
}

/** The manifest section for a set of archived attachments. */
export function describeArchivedAttachments(
  archived: readonly ArchivedAttachment[],
): readonly ManifestAttachment[] {
  return archived.map((entry) => ({
    id: entry.row.id,
    filename: entry.row.filename,
    mediaType: entry.row.mediaType,
    byteSize: entry.row.byteSize,
    sha256: entry.row.checksumSha256,
    path: entry.path,
  }));
}
