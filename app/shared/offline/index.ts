/**
 * PWA — the browser-side offline platform's public surface.
 *
 * Client-only. These modules touch IndexedDB, `navigator`, `caches` and the
 * service worker, and must never be imported by a Worker/loader path — the server
 * half lives in `~/platform/offline`, and the contracts both sides share live in
 * `~/kernel/offline`.
 */

export {
  ConnectionStatus,
  shouldShowStatus,
  statusSummary,
  type ConnectionStatusProps,
} from "./ConnectionStatus";
export {
  OfflineCaptureForm,
  type OfflineCaptureFormProps,
} from "./OfflineCaptureForm";
export {
  OfflineProvider,
  useOffline,
  useRequiredOffline,
  type OfflineContextValue,
  type OfflineProviderProps,
  type OfflineStorageEstimate,
} from "./OfflineProvider";
export { OfflineDiagnosticsPanel } from "./OfflineDiagnostics";
export { OfflineSettingsPanel, formatBytes } from "./OfflineSettingsPanel";
export {
  OfflineSnapshotView,
  type OfflineSnapshotViewProps,
} from "./OfflineSnapshotView";
export {
  OfflineSyncPanel,
  queueStatusLabel,
  queueSummary,
  type OfflineSyncPanelProps,
} from "./OfflineSyncPanel";

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
  deleteQueueRecord,
  estimateOfflineStorage,
  pruneRetention,
  pruneSyncedQueue,
  putQueueRecord,
  readAllQueued,
  readDataset,
  readLatestMeta,
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
