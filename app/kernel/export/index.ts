/**
 * X-04 — the workspace-export kernel.
 *
 * The versioned snapshot contract, its read-only repository contract and its
 * validator. Storage-independent: nothing here imports D1, React, Cloudflare or
 * a parser. Both shipped exports are derived from a `WorkspaceSnapshotV1`.
 */

export {
  EXPORT_FORMAT_NAME,
  EXPORT_FORMAT_VERSION,
  SNAPSHOT_COLLECTION_ORDER,
  SNAPSHOT_CONSISTENCY,
  SNAPSHOT_SCHEMA_NAME,
  SNAPSHOT_SCHEMA_VERSION,
  snapshotLifecycleState,
  snapshotRecordCounts,
  type IsoDate,
  type IsoInstant,
  type JsonValue,
  type SnapshotActivity,
  type SnapshotActivitySubject,
  type SnapshotApplication,
  type SnapshotAreaDetail,
  type SnapshotAssetDetail,
  type SnapshotAssetEvent,
  type SnapshotAssetObligation,
  type SnapshotCollection,
  type SnapshotCollectionRowMap,
  type SnapshotConsistency,
  type SnapshotDiaryEntryDetail,
  type SnapshotEntity,
  type SnapshotEntityLink,
  type SnapshotGoalDetail,
  type SnapshotLifecycleState,
  type SnapshotLimitation,
  type SnapshotMeetingDetail,
  type SnapshotMeetingItem,
  type SnapshotMeetingItemTask,
  type SnapshotMeta,
  type SnapshotNoteDetail,
  type SnapshotOwnerPreferences,
  type SnapshotPersonDetail,
  type SnapshotProjectDetail,
  type SnapshotRecords,
  type SnapshotReviewDetail,
  type SnapshotReviewSection,
  type SnapshotSpineRecord,
  type SnapshotTaskDetail,
  type SnapshotTaskRecurrenceRule,
  type SnapshotTaskSavedView,
  type SnapshotWorkspace,
  type WorkspaceSnapshotV1,
} from "./workspace-snapshot";

export {
  SNAPSHOT_COLLECTION_MAX_ROWS,
  SNAPSHOT_PAGE_SIZE,
  type SnapshotPage,
  type WorkspaceSnapshotRepository,
} from "./snapshot-repository";

export {
  FORBIDDEN_EXPORT_KEY_PATTERN,
  INFRASTRUCTURE_KEY_HINTS,
  SNAPSHOT_ORDER_KEYS,
  SnapshotValidationError,
  assertValidWorkspaceSnapshot,
  isIsoDate,
  isIsoInstant,
  validateWorkspaceSnapshot,
  type SnapshotValidationIssue,
} from "./snapshot-validation";
