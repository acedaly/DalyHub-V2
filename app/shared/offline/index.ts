/**
 * PWA — the browser-side offline platform's public surface.
 *
 * Client-only. These modules touch IndexedDB, `navigator`, `caches` and the
 * service worker, and must never be imported by a Worker/loader path — the server
 * half lives in `~/platform/offline`, and the contracts both sides share live in
 * `~/kernel/offline`.
 *
 * ── This barrel is the RUNTIME, and deliberately not the SCREENS ────────────
 *
 * It exports the provider, the hooks, the queue and the storage/sync functions —
 * the things a surface anywhere in the product legitimately needs. It exports no
 * offline PANEL, and that is a bundling decision with a measurement behind it.
 *
 * `~/shared/task-record/usePendingTasks` imports `useOffline` from here, and
 * `task-record` is reached by Today, Tasks, Projects, Meetings and Notes — so
 * every one of those routes statically loaded whatever this file named. It named
 * six screens: `OfflineSettingsPanel`, `OfflineSnapshotView`, `OfflineChangesPanel`,
 * `OfflineSyncPanel`, `OfflineDiagnostics` and `OfflineCaptureForm`, ~44 KB of
 * Settings and `/offline` UI, on five routes that render none of them.
 *
 * The panels are imported from their own modules by the three surfaces that draw
 * them — `app/routes/offline.tsx`, Settings and the Tasks workspace — exactly as
 * `AppShell` already imports `ConnectionStatus` and as the unit tests already
 * import all of them. Their co-located helpers (`formatBytes`, `queueSummary`,
 * `conflictFieldLabel` and the rest) were re-exported here for no consumer at
 * all, and a re-export with no consumer is a load-bearing import waiting to
 * happen. Held by `scripts/route-budget.mjs`.
 */

export {
  OfflineProvider,
  useOffline,
  useRequiredOffline,
  type OfflineContextValue,
  type OfflineProviderProps,
  type OfflineStorageEstimate,
} from "./OfflineProvider";
export {
  OFFLINE_REPLAY_APPLIED_EVENT,
  announceReplayApplied,
  enqueueOfflineMutation,
  getActiveOfflineNamespace,
  hasOutstandingMutations,
  notifyMutationQueueChanged,
  readActiveMutations,
  setActiveOfflineNamespace,
  subscribeMutationQueue,
  type EnqueueResult,
  type OfflineMutationIntent,
} from "./mutation-queue";

export {
  MUTATION_REPLAY_BATCH_SIZE,
  classifyMutationResponse,
  mutationFormData,
  reclaimStalledMutations,
  replayMutation,
  replayMutations,
  type MutationPassResult,
} from "./mutation-sync";

export {
  OFFLINE_DIAGNOSTIC_LIMIT,
  classifyOfflineFailure,
  installOfflineDiagnostics,
  readOfflineDiagnostics,
  recordOfflineDiagnostic,
  redactDetail,
  redactUrl,
  resetOfflineDiagnostics,
  subscribeOfflineDiagnostics,
  summariseOfflineDiagnostics,
  type OfflineDiagnostic,
  type OfflineDiagnosticCode,
} from "./diagnostics";

export {
  OFFLINE_LOCAL_CHECKING,
  captureAvailability,
  isLocalStateResolved,
  localStateCopy,
  localStateFromFailure,
  localStateFromMeta,
  type OfflineCaptureAvailability,
  type OfflineLocalState,
} from "./local-state";

export { MASKABLE_PREVIEW_SRC, MASK_SHAPES, PNG_SIZES } from "./icon-preview";

export { afterPageIdle } from "./page-idle";

export {
  GENERIC_INSTALL_STEPS,
  IOS_INSTALL_STEPS,
  installCapability,
  isIosSafari,
  watchInstallability,
  type BeforeInstallPromptEvent,
  type InstallCapability,
} from "./install";

export {
  OFFLINE_DATABASE_TIMEOUT_MS,
  deleteOfflineDatabase,
  isOfflineStorageAvailable,
  openOfflineDatabase,
  storageTimeoutFailure,
  withDeadline,
  type OfflineDatabaseFailure,
  type OfflineDatabaseResult,
} from "./offline-database";

export {
  EMPTY_OFFLINE_DATASET,
  clearAllOfflineData,
  clearOtherNamespaces,
  clearSnapshot,
  deleteMutationRecord,
  deleteQueueRecord,
  estimateOfflineStorage,
  pruneRetention,
  pruneSyncedMutations,
  pruneSyncedQueue,
  putMutationRecord,
  putQueueRecord,
  readAllMutations,
  readAllQueued,
  readDataset,
  readLatestMeta,
  readMutations,
  readQueue,
  saveSnapshot,
  summariseNamespaceQueue,
  type OfflineDataset,
  type OfflineMetaRecord,
  type OfflineStoreResult,
} from "./offline-store";

export {
  OFFLINE_PING_PATH,
  browserThinksItIsOnline,
  probeConnection,
} from "./probe";

export {
  SERVICE_WORKER_SCOPE,
  SERVICE_WORKER_URL,
  applyServiceWorkerUpdate,
  clearServiceWorkerCaches,
  hasUsedUpdateReload,
  isRunningStandalone,
  isServiceWorkerSupported,
  refreshOfflineShell,
  registerServiceWorker,
  reportOfflineShellReady,
  requestBuildId,
  resetUpdateReloadGuardForTests,
  type ServiceWorkerStatus,
} from "./service-worker";

export {
  REPLAY_BATCH_SIZE,
  captureFormData,
  classifyCreateResponse,
  replayCapture,
  replayQueue,
  syncSnapshot,
  type ReplayPassResult,
  type SnapshotSyncResult,
} from "./sync";
