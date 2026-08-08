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
  validateRestoreSafety,
  type BackupCompatibility,
  type RestoreSafetyIssue,
} from "~/kernel/restore";
import { sha256Hex } from "~/platform/export";

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
  const unexpected = files.filter(
    (path) => !ALLOWED_BACKUP_FILES.includes(path),
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

  return { snapshot, compatibility, files };
}
