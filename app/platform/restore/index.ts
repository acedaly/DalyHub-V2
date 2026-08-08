/**
 * SET-02 — the restore platform: reading an untrusted archive, and the ordered
 * orchestration that turns a validated snapshot into a restored workspace.
 *
 * Everything storage- and format-independent lives in `~/kernel/restore`. This
 * layer owns the two things that are not: the ZIP reader (a byte format) and the
 * sequence of repository calls (an orchestration).
 */

export {
  ALLOWED_BACKUP_FILES,
  BACKUP_CHECKSUMS_PATH,
  BACKUP_MANIFEST_PATH,
  BACKUP_SNAPSHOT_PATH,
  REQUIRED_BACKUP_FILES,
  readBackupArchive,
  type ReadBackupArchive,
} from "./read-backup-archive";

export {
  MAX_COMPRESSION_RATIO,
  MAX_ENTRIES,
  RESTORE_MAX_ARCHIVE_BYTES,
  RESTORE_MAX_CONTENT_BYTES,
  ZipReadError,
  readZipArchive,
  type ReadZipEntry,
} from "./zip-reader";

export {
  applyRestore,
  createSafetyBackup,
  discardRestore,
  prepareRestore,
  type RestoreDependencies,
  type SafetyBackup,
} from "./restore-workspace";
