/**
 * SET-02 — the workspace-restore kernel.
 *
 * The version gate, the safety validator, the preview and the write-port
 * contract, all storage-independent: nothing here imports D1, ZIP, HTTP or
 * React. A restore reads the SAME canonical `DalyHubWorkspaceSnapshotV1` X-04
 * writes — there is one representation of a workspace, and backup, export and
 * restore are three consumers of it rather than three formats.
 */

export {
  RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS,
  readBackupCompatibility,
  type BackupCompatibility,
  type BackupCompatibilityStatus,
} from "./backup-compatibility";

export {
  DETAIL_COLLECTION_ENTITY_TYPES,
  SPINE_KINDS,
  validateRestoreSafety,
  type RestoreSafetyIssue,
} from "./restore-safety";

export {
  RestoreFailedError,
  RestoreRejectedError,
  type RestoreBackupSummary,
  type RestoreCheck,
  type RestoreCollectionCounts,
  type RestoreMode,
  type RestoreOperationRecord,
  type RestoreOperationStatus,
  type RestorePreview,
  type RestoreRecordCounts,
  type RestoreRejection,
  type RestoreRejectionKind,
  type RestoreResult,
  type RestoreTargetState,
  type RestoreVerification,
  type SafetyBackupReceipt,
  type WorkspaceRestoreRepository,
} from "./restore-contract";

export {
  buildRestorePreview,
  countSnapshotCollections,
  countSnapshotRecords,
  emptyRecordCounts,
  isEmptyTarget,
  restoreModeFor,
  summariseBackup,
} from "./restore-preview";

export {
  upgradeLegacyObligations,
  UNTITLED_OBLIGATION,
  type LegacyObligationUpgrade,
} from "./legacy-obligations";
