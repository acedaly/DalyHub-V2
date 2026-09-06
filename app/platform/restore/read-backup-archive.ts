/**
 * SET-02 — turn an uploaded file into a snapshot that is SAFE to restore, or
 * into an honest refusal.
 *
 * This is the whole validation stage, in the order the checks have to happen:
 *
 *   1. **Archive integrity** — the ZIP parses within bounds, every entry's
 *      declared size and CRC-32 match its actual bytes, and no entry path could
 *      escape the archive (`zip-reader.ts`).
 *   2. **Archive structure** — exactly the file set a DalyHub backup contains:
 *      no missing required file, no extra file smuggled in beside them.
 *   3. **Checksums** — `CHECKSUMS.txt` is recomputed against the bytes actually
 *      read. This is the archive's own integrity claim, verified rather than
 *      trusted, and it is a SEPARATE check from the ZIP CRC: the CRC proves the
 *      file survived transport, the checksum file proves the archive was not
 *      rewritten by something that also rewrote the CRCs.
 *   4. **Version** — `meta.schema` and `meta.schemaVersion` before anything is
 *      interpreted (`readBackupCompatibility`). An unknown version is refused,
 *      never guessed at.
 *   5. **Shape and referential integrity** — the X-04 validator.
 *   6. **Persistability** — the constraints the database will enforce, checked
 *      first so a corrupt backup fails before restoration begins
 *      (`validateRestoreSafety`).
 *
 * **No database write happens anywhere in this file.** It is a pure function of
 * the uploaded bytes.
 *
 * Every failure is a {@link RestoreRejectedError} carrying an owner-facing
 * sentence and, separately, the structural issue list for the server-side log.
 * The two are kept apart deliberately: the owner needs to know what to do, and
 * the diagnostic detail — paths and rule names — belongs where it cannot become
 * a leak.
 */

import {
  SnapshotValidationError,
  assertValidWorkspaceSnapshot,
  validateWorkspaceSnapshot,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";
import {
  RestoreRejectedError,
  readBackupCompatibility,
  upgradeLegacyObligations,
  validateRestoreSafety,
  type BackupCompatibility,
  type RestoreSafetyIssue,
} from "~/kernel/restore";
import { sha256Hex } from "~/platform/export";

import {
  attachmentIdFromArchivePath,
  isArchiveAttachmentPath,
} from "~/platform/export/attachment-archive";

import { ZipReadError, readZipArchive, type ReadZipEntry } from "./zip-reader";

/** The snapshot file every DalyHub backup archive carries. */
export const BACKUP_SNAPSHOT_PATH = "dalyhub-snapshot.json";
/** The manifest file every DalyHub backup archive carries. */
export const BACKUP_MANIFEST_PATH = "manifest.json";
/** The checksum file every DalyHub backup archive carries. */
export const BACKUP_CHECKSUMS_PATH = "CHECKSUMS.txt";

/** Files a DalyHub backup archive must contain. */
export const REQUIRED_BACKUP_FILES: readonly string[] = [
  BACKUP_MANIFEST_PATH,
  BACKUP_SNAPSHOT_PATH,
  BACKUP_CHECKSUMS_PATH,
];

/**
 * Every file a DalyHub backup archive may contain.
 *
 * An allow-list rather than a deny-list: an archive carrying anything else is
 * refused outright. That is what stops a crafted "backup" being used as a
 * delivery vehicle for files DalyHub never asked for, and it costs nothing —
 * the writer produces exactly these five.
 */
export const ALLOWED_BACKUP_FILES: readonly string[] = [
  BACKUP_MANIFEST_PATH,
  BACKUP_SNAPSHOT_PATH,
  BACKUP_CHECKSUMS_PATH,
  "README.md",
  "SCHEMA.md",
];

/** A backup archive read, verified and validated. */
export interface ReadBackupArchive {
  readonly snapshot: WorkspaceSnapshotV1;
  readonly compatibility: BackupCompatibility;
  /** The archive's own file list, for the diagnostic log. */
  readonly files: readonly string[];
  /**
   * V2.11 FILE-02 — the attachment BYTES, keyed by attachment id.
   *
   * Every entry here has already had its SHA-256 verified against the snapshot
   * row that names it, and every row in `snapshot.records.attachments` has an
   * entry: a row with no bytes and bytes with no row are both refusals, not
   * tolerated states. So a caller holding this map holds a complete, checked set
   * — which is what lets the restore write objects BEFORE the cutover with no
   * further validation of its own.
   */
  readonly attachmentBytes: ReadonlyMap<string, Uint8Array>;
}

function reject(
  kind: RestoreRejectedError["rejection"]["kind"],
  message: string,
  issues: readonly RestoreSafetyIssue[] = [],
  compatibility: BackupCompatibility | null = null,
): never {
  throw new RestoreRejectedError({ kind, message, issues, compatibility });
}

/** Parse `sha256sum` output: `<64 hex>  <path>`, one per line. */
function parseChecksums(text: string): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(trimmed);
    if (match === null) {
      reject(
        "corrupt",
        "This backup's checksum file is malformed, so its contents cannot be verified. The archive may be damaged.",
      );
    }
    parsed.set(match[2]!, match[1]!);
  }
  return parsed;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function decodeText(entry: ReadZipEntry): string {
  try {
    return utf8.decode(entry.data);
  } catch {
    reject(
      "corrupt",
      `This backup's ${entry.path} is not valid text, so the archive cannot be read.`,
    );
  }
}

/**
 * Read, verify and validate an uploaded backup archive.
 *
 * Throws {@link RestoreRejectedError} for every kind of unusable file. Returns
 * only when the snapshot is structurally sound AND can be written to the
 * database without violating a single constraint.
 */
export async function readBackupArchive(
  bytes: Uint8Array,
): Promise<ReadBackupArchive> {
  /* 1. Archive integrity ---------------------------------------------------- */
  let entries: readonly ReadZipEntry[];
  try {
    entries = await readZipArchive(bytes);
  } catch (error) {
    if (error instanceof ZipReadError) {
      reject(
        error.reason.includes("size limit") || error.reason.includes("limit")
          ? "too_large"
          : "unreadable_archive",
        `${error.message.replace(/\.$/, "")}. Choose the ZIP file DalyHub produced under "Download full DalyHub export".`,
      );
    }
    reject(
      "unreadable_archive",
      "That file could not be opened as a DalyHub backup archive.",
    );
  }

  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const files = [...byPath.keys()].sort();

  /* 2. Archive structure ---------------------------------------------------- */
  if (files.some((path) => path.startsWith("DalyHub Export/"))) {
    reject(
      "incompatible",
      "That is an Obsidian vault export. It is Markdown for reading, not a restorable backup — use the full DalyHub export ZIP instead.",
    );
  }
  for (const required of REQUIRED_BACKUP_FILES) {
    if (!byPath.has(required)) {
      reject(
        "incompatible",
        `That archive is missing ${required}, so it is not a DalyHub backup.`,
      );
    }
  }
  /*
   * V2.11 FILE-02 — the allow-list became "these five documents, plus the
   * attachment folder". That is a genuine loosening of an exact set into a
   * prefix rule, and it is bounded on both sides rather than trusted:
   * `isArchiveAttachmentPath` accepts `attachments/<id>` and NOTHING with a
   * further slash, `assertSafeZipPath` has already refused traversal, control
   * characters and drive letters, `MAX_ENTRIES` bounds the count, and step 5
   * below refuses any attachment entry the snapshot does not name. An archive
   * still cannot be used as a delivery vehicle for files DalyHub never asked
   * for — it can only carry the ones its own snapshot declares.
   */
  const unexpected = files.filter(
    (path) =>
      !ALLOWED_BACKUP_FILES.includes(path) && !isArchiveAttachmentPath(path),
  );
  if (unexpected.length > 0) {
    reject(
      "incompatible",
      "That archive contains files a DalyHub backup never does, so it will not be restored.",
      unexpected.map((path) => ({
        code: "unexpected_archive_entry",
        path,
        message: "is not part of the DalyHub backup file set",
      })),
    );
  }

  /* 3. Checksums ------------------------------------------------------------ */
  const declared = parseChecksums(
    decodeText(byPath.get(BACKUP_CHECKSUMS_PATH)!),
  );
  const mismatches: RestoreSafetyIssue[] = [];
  for (const entry of entries) {
    if (entry.path === BACKUP_CHECKSUMS_PATH) continue;
    const expected = declared.get(entry.path);
    if (expected === undefined) {
      mismatches.push({
        code: "checksum_missing",
        path: entry.path,
        message: "is present in the archive but absent from CHECKSUMS.txt",
      });
      continue;
    }
    if ((await sha256Hex(entry.data)) !== expected) {
      mismatches.push({
        code: "checksum_mismatch",
        path: entry.path,
        message: "does not match the SHA-256 recorded in CHECKSUMS.txt",
      });
    }
  }
  for (const path of declared.keys()) {
    if (!byPath.has(path)) {
      mismatches.push({
        code: "checksum_orphan",
        path,
        message: "is listed in CHECKSUMS.txt but missing from the archive",
      });
    }
  }
  if (mismatches.length > 0) {
    reject(
      "corrupt",
      "This backup failed its own integrity check: its contents do not match the checksums it was written with. It will not be restored.",
      mismatches,
    );
  }

  /* 4. Version -------------------------------------------------------------- */
  const snapshotText = decodeText(byPath.get(BACKUP_SNAPSHOT_PATH)!);
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotText);
  } catch {
    reject(
      "corrupt",
      "This backup's snapshot file is not valid JSON, so it cannot be read.",
    );
  }

  const compatibility = readBackupCompatibility(parsed);
  if (compatibility.status !== "supported") {
    const supported = compatibility.supportedVersions.join(", ");
    const message =
      compatibility.status === "unsupported_version"
        ? `This backup was written by a version of DalyHub this one cannot read (snapshot version ${compatibility.schemaVersion}; this DalyHub reads ${supported}). Restoring it could misinterpret your data, so it will not be attempted.`
        : compatibility.status === "missing_version"
          ? "This backup does not say which DalyHub snapshot version it is. A backup without a version is never guessed at, so it will not be restored."
          : compatibility.status === "malformed_version"
            ? "This backup's snapshot version is malformed, so it will not be restored."
            : "That file is not a DalyHub workspace snapshot.";
    reject("unsupported_version", message, [], compatibility);
  }

  /* 4b. Upgrade a pre-V2.10 archive ----------------------------------------
   * An archive written before obligations became entities carries
   * `assetObligations` and no `obligations`. It is upgraded here, by exactly
   * the rule migration 0050 used, BEFORE anything validates or stages — so
   * every check below sees one shape and one only (V2.10 LIFE-01).
   */
  if (parsed && typeof parsed === "object" && "records" in parsed) {
    upgradeLegacyObligations(
      (parsed as { records: Parameters<typeof upgradeLegacyObligations>[0] })
        .records,
    );
  }

  /* 5. Shape and referential integrity -------------------------------------- */
  try {
    assertValidWorkspaceSnapshot(parsed);
  } catch (error) {
    const issues =
      error instanceof SnapshotValidationError
        ? error.issues
        : validateWorkspaceSnapshot(parsed);
    reject(
      "incompatible",
      "This backup is a DalyHub snapshot, but its contents do not hold together — records reference things the file does not contain, or fields are missing. It will not be restored.",
      issues.map((issue) => ({
        code: "snapshot_invalid",
        path: issue.path,
        message: issue.message,
      })),
    );
  }
  const snapshot = parsed as WorkspaceSnapshotV1;

  /* 6. Persistability ------------------------------------------------------- */
  const safety = validateRestoreSafety(snapshot);
  if (safety.length > 0) {
    const truncated = safety.some(
      (issue) => issue.code === "backup_incomplete",
    );
    reject(
      "incompatible",
      truncated
        ? "This backup recorded that it was incomplete when it was written, so restoring it would not restore the whole workspace. It will not be used."
        : "This backup cannot be written to the database without breaking DalyHub's own rules — for example a repeated record id or a detail row on the wrong kind of record. It will not be restored.",
      safety,
    );
  }

  /* 7. Attachment parity, and the bytes themselves ---------------------------
   *
   * The archive's own `CHECKSUMS.txt` (step 3) already proved every entry
   * survived transport unchanged. This is a DIFFERENT claim and it is the one
   * the release rests on: that every attachment row has bytes, that every set
   * of bytes has a row, and that the bytes hash to what the ROW says they
   * should — the digest computed when the file was first uploaded, months or
   * years ago, and carried through every export since.
   *
   * A mismatch here is refused whole. There is no partial restore of evidence:
   * an owner recovering from a failure must not be handed a workspace where
   * some files are theirs and some are something else.
   */
  const archivedAttachments = new Map<string, Uint8Array>();
  const attachmentIssues: RestoreSafetyIssue[] = [];
  for (const entry of entries) {
    const id = attachmentIdFromArchivePath(entry.path);
    if (id !== null) archivedAttachments.set(id, entry.data);
  }

  const declaredAttachments = snapshot.records.attachments;
  const declaredIds = new Set(declaredAttachments.map((row) => row.id));
  for (const id of archivedAttachments.keys()) {
    if (!declaredIds.has(id)) {
      attachmentIssues.push({
        code: "attachment_orphan_file",
        path: `attachments/${id}`,
        message:
          "is in the archive but is not one of the attachments the snapshot lists",
      });
    }
  }
  for (const row of declaredAttachments) {
    const bytes = archivedAttachments.get(row.id);
    if (bytes === undefined) {
      attachmentIssues.push({
        code: "attachment_file_missing",
        path: `records.attachments[${row.id}]`,
        message: "is listed in the snapshot but its file is not in the archive",
      });
      continue;
    }
    if (bytes.length !== row.byteSize) {
      attachmentIssues.push({
        code: "attachment_size_mismatch",
        path: `attachments/${row.id}`,
        message: `is ${bytes.length} bytes where the snapshot says ${row.byteSize}`,
      });
      continue;
    }
    if ((await sha256Hex(bytes)) !== row.checksumSha256) {
      attachmentIssues.push({
        code: "attachment_checksum_mismatch",
        path: `attachments/${row.id}`,
        message:
          "does not match the SHA-256 DalyHub recorded when the file was uploaded",
      });
    }
  }
  if (attachmentIssues.length > 0) {
    const missing = attachmentIssues.some(
      (issue) => issue.code === "attachment_file_missing",
    );
    reject(
      "corrupt",
      missing
        ? "This backup lists files it does not contain, so restoring it would leave records pointing at evidence that is not there. It will not be restored."
        : "One or more of this backup's files do not match what DalyHub recorded for them, so it will not be restored.",
      attachmentIssues,
    );
  }

  return {
    snapshot,
    compatibility,
    files,
    attachmentBytes: archivedAttachments,
  };
}
