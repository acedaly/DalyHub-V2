/**
 * PWA — the offline kernel's public surface.
 *
 * Storage- and platform-independent: no IndexedDB, no D1, no React, no `fetch`.
 * The browser adapter (`~/shared/offline`) and the server builder
 * (`~/platform/offline`) both depend on these contracts, never on each other.
 */

export {
  OFFLINE_CONNECTION_STATES,
  OFFLINE_SNAPSHOT_STALE_AFTER_MS,
  OFFLINE_SYNC_STATES,
  canReachBackend,
  classifyProbe,
  connectionStateDescription,
  connectionStateLabel,
  deriveSyncState,
  isSnapshotStale,
  shouldPauseSync,
  syncStateLabel,
  type OfflineConnectionState,
  type OfflineProbeResult,
  type OfflineStatus,
  type OfflineSyncState,
} from "./offline-connection";

export {
  OFFLINE_SCHEMA_VERSION,
  deriveOfflineNamespace,
  isOfflineNamespace,
  namespaceDisplayFragment,
  namespaceSchemaVersion,
} from "./offline-identity";

export {
  OFFLINE_ATTEMPT_LEASE_MS,
  OFFLINE_CAPTURE_IN_PROGRESS,
  OFFLINE_CAPTURE_KINDS,
  OFFLINE_CAPTURE_PAYLOAD_VERSION,
  OFFLINE_MAX_AUTOMATIC_ATTEMPTS,
  OFFLINE_QUEUE_STATUSES,
  applyReplayOutcome,
  beginReplayAttempt,
  createQueueRecord,
  isOfflineCaptureKind,
  isReplayable,
  isStalledAttempt,
  newCaptureId,
  reclaimStalledAttempt,
  retryDelayMs,
  summariseQueue,
  type OfflineCaptureKind,
  type OfflineCapturePayload,
  type OfflineDiaryCapture,
  type OfflineNoteCapture,
  type OfflineQueueRecord,
  type OfflineQueueStatus,
  type OfflineQueueSummary,
  type OfflineReplayOutcome,
  type OfflineTaskCapture,
} from "./offline-queue";

export {
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  OFFLINE_INDEXES,
  OFFLINE_SCHEMA_STEPS,
  OFFLINE_STORES,
  recordKey,
  stepsFor,
  type OfflineSchemaStep,
} from "./offline-schema";

export {
  OFFLINE_EXCERPT_LIMIT,
  OFFLINE_RECORD_KINDS,
  OFFLINE_SNAPSHOT_LIMITS,
  OFFLINE_SNAPSHOT_VERSION,
  toExcerpt,
  type OfflineDiaryEntry,
  type OfflineMeeting,
  type OfflineNote,
  type OfflineRecordKind,
  type OfflineReference,
  type OfflineSnapshot,
  type OfflineTask,
  type OfflineTodaySummary,
} from "./offline-snapshot";

export {
  OFFLINE_RETENTION_FUTURE_DAYS,
  OFFLINE_RETENTION_PAST_DAYS,
  addCalendarDays,
  calendarDaysBetween,
  isCalendarIso,
  isWithinWindow,
  offlineWindow,
  windowInstantBounds,
  type CalendarIso,
  type OfflineWindow,
} from "./offline-window";
