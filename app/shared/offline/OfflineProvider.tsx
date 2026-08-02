/**
 * PWA-03 — the one offline/connection context the whole shell reads.
 *
 * Mounted once, inside the authenticated app shell. Everything else — the status
 * pill, the offline snapshot views, the capture sheet's offline path, the
 * Settings panel — reads this context rather than probing, opening IndexedDB or
 * registering a worker of its own.
 *
 * ── Probing policy ───────────────────────────────────────────────────────────
 * DalyHub does not poll a healthy connection. It probes when something actually
 * happened: on mount, when the tab becomes visible again, when the browser fires
 * `online`, and after a request failure. Only while the connection is NOT healthy
 * does a slow heartbeat run, and even then it backs off. An expired Access
 * session stops the heartbeat entirely, because every retry there is a redirect
 * to the identity provider and a phone in a pocket would generate thousands.
 *
 * ── Offline capture is gated on a prior successful online session ────────────
 * `namespace` comes from a snapshot the server produced. Until one has been
 * stored on this device, there is no namespace, and `enqueue` refuses. That is
 * the milestone's "no offline access before the first successful authenticated
 * online session" rule, enforced by the data model rather than by a flag.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  applyReplayOutcome,
  beginReplayAttempt,
  createQueueRecord,
  deriveSyncState,
  isSnapshotStale,
  offlineWindow,
  shouldPauseSync,
  summariseQueue,
  type OfflineCapturePayload,
  type OfflineConnectionState,
  type OfflineQueueRecord,
  type OfflineStatus,
} from "~/kernel/offline";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  installCapability,
  isIosSafari,
  watchInstallability,
  type BeforeInstallPromptEvent,
  type InstallCapability,
} from "./install";
import type { OfflineDatabaseFailure } from "./offline-database";
import { afterPageIdle } from "./page-idle";
import {
  EMPTY_OFFLINE_DATASET,
  clearAllOfflineData,
  clearOtherNamespaces,
  clearSnapshot,
  deleteQueueRecord,
  estimateOfflineStorage,
  pruneRetention,
  pruneSyncedQueue,
  putQueueRecord,
  readDataset,
  readLatestMeta,
  readQueue,
  type OfflineDataset,
  type OfflineMetaRecord,
} from "./offline-store";
import { probeConnection } from "./probe";
import {
  applyServiceWorkerUpdate,
  clearServiceWorkerCaches,
  isRunningStandalone,
  refreshOfflineShell,
  registerServiceWorker,
  type ServiceWorkerStatus,
} from "./service-worker";
import {
  reclaimStalled,
  replayCapture,
  replayQueue,
  syncSnapshot,
} from "./sync";

/** The heartbeat interval while the connection is unhealthy. */
const UNHEALTHY_HEARTBEAT_MS = 15_000;

/** The ceiling the unhealthy heartbeat backs off to. */
const MAX_HEARTBEAT_MS = 120_000;

export interface OfflineStorageEstimate {
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}

export interface OfflineContextValue {
  readonly status: OfflineStatus;
  readonly serviceWorker: ServiceWorkerStatus;
  readonly install: InstallCapability;
  readonly standalone: boolean;
  /** The active identity + workspace namespace, or null before the first sync. */
  readonly namespace: string | null;
  readonly meta: OfflineMetaRecord | null;
  readonly dataset: OfflineDataset;
  readonly queue: readonly OfflineQueueRecord[];
  /** True when the stored snapshot is old enough to warrant a warning. */
  readonly stale: boolean;
  /** Non-null when offline storage is unusable on this device. */
  readonly storageFailure: OfflineDatabaseFailure | null;
  readonly storage: OfflineStorageEstimate;
  /** True while a sync pass is running. */
  readonly busy: boolean;
  /**
   * True once this device's storage has been read at least once. Until then the
   * offline surfaces say they are looking, rather than reporting an emptiness
   * they have not yet checked for.
   */
  readonly initialised: boolean;

  probe(): Promise<OfflineConnectionState>;
  /** Refresh the snapshot AND replay the queue. The one "sync now" action. */
  sync(): Promise<void>;
  enqueue(payload: OfflineCapturePayload): Promise<OfflineQueueRecord | null>;
  retry(id: string): Promise<void>;
  discard(id: string): Promise<void>;
  /** Remove the cached read-only snapshot. Keeps queued captures. */
  clearCachedData(): Promise<void>;
  /** Remove queued captures. Destructive; callers must confirm first. */
  discardQueued(): Promise<void>;
  /** Remove everything DalyHub stores on this device, including caches. */
  resetDevice(): Promise<void>;
  promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">;
  applyUpdate(): Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/** Read the offline context. Returns null outside the provider (SSR, tests). */
export function useOffline(): OfflineContextValue | null {
  return useContext(OfflineContext);
}

/**
 * The offline context, or a throw. Use in surfaces that structurally cannot
 * render outside the shell (the Settings panel, the offline views).
 */
export function useRequiredOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (!value) {
    throw new Error(
      "useRequiredOffline must be used inside an OfflineProvider.",
    );
  }
  return value;
}

export interface OfflineProviderProps {
  readonly children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  // The initial value is `online`, not `reconnecting`. Nothing is RENDERED while
  // online, so this claims nothing — whereas starting at `reconnecting` put a
  // "Checking the connection" banner at the top of every page load for the few
  // hundred milliseconds before the first probe resolved, which is exactly the
  // restless chrome `AGENTS.md §2` rules out. A real failure still surfaces:
  // the probe that follows is what sets the state from then on.
  const [connection, setConnection] =
    useState<OfflineConnectionState>("online");
  const [serviceWorker, setServiceWorker] = useState<ServiceWorkerStatus>({
    kind: "pending",
  });
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [meta, setMeta] = useState<OfflineMetaRecord | null>(null);
  const [dataset, setDataset] = useState<OfflineDataset>(EMPTY_OFFLINE_DATASET);
  const [queue, setQueue] = useState<readonly OfflineQueueRecord[]>([]);
  const [storageFailure, setStorageFailure] =
    useState<OfflineDatabaseFailure | null>(null);
  const [storage, setStorage] = useState<OfflineStorageEstimate>({
    usageBytes: null,
    quotaBytes: null,
  });
  const [busy, setBusy] = useState(false);
  // False until the FIRST read of this device's storage has completed. It is
  // what stops a server-rendered (or not-yet-hydrated) offline page asserting
  // "no offline copy on this device" before it has looked.
  const [initialised, setInitialised] = useState(false);

  // A ref as well as state: the heartbeat closure must read the CURRENT value
  // without being re-created (and thus rescheduled) on every change.
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  // One abort signal for every request this provider makes, fired when the
  // document goes away. A request still in flight when its document is destroyed
  // is LOST — the browser reports it as neither finished nor failed — so ending
  // them deliberately is the difference between a clean teardown and a dangling
  // request. `pagehide` is used rather than `beforeunload` because it also fires
  // when a page enters the back/forward cache, which is exactly when continuing
  // to probe would be pointless.
  const abortRef = useRef<AbortController | null>(null);
  if (abortRef.current === null && typeof AbortController !== "undefined") {
    abortRef.current = new AbortController();
  }
  useEffect(() => {
    const controller = abortRef.current;
    if (typeof window === "undefined" || !controller) return;
    const abort = () => controller.abort();
    window.addEventListener("pagehide", abort);
    return () => {
      window.removeEventListener("pagehide", abort);
      controller.abort();
    };
  }, []);
  const namespace = meta?.namespace ?? null;
  const namespaceRef = useRef<string | null>(null);
  namespaceRef.current = namespace;

  /** Re-read everything the device holds for the active namespace. */
  const reload = useCallback(async (targetNamespace: string | null) => {
    if (!targetNamespace) return;
    const [data, queued] = await Promise.all([
      readDataset(targetNamespace),
      readQueue(targetNamespace),
    ]);
    if (data.ok) {
      setDataset(data.value);
      setMeta(data.value.meta);
      setStorageFailure(null);
    } else {
      setStorageFailure(data.failure);
    }
    // Reclaiming here (rather than only inside a replay pass) means a capture
    // stranded by a tab that was closed mid-request stops claiming to be
    // "Synchronising…" the moment the app comes back, not whenever the next
    // pass happens to run.
    if (queued.ok) {
      setQueue(await reclaimStalled(queued.value, targetNamespace, new Date()));
    }
    setStorage(await estimateOfflineStorage());
  }, []);

  const probe = useCallback(async () => {
    const state = await probeConnection(
      fetch,
      undefined,
      abortRef.current?.signal,
    );
    setConnection(state);
    return state;
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    let syncedConnection: OfflineConnectionState | null = null;
    try {
      const result = await syncSnapshot({ signal: abortRef.current?.signal });
      if (result.kind === "updated") {
        syncedConnection = "online";
        const previous = namespaceRef.current;
        setMeta(result.meta);
        setConnection("online");
        namespaceRef.current = result.meta.namespace;
        if (previous !== null && previous !== result.meta.namespace) {
          // A DIFFERENT identity or workspace is signed in than the one this
          // device last held data for. Their data is removed immediately —
          // before anything renders it — so one identity's records can never
          // appear under another's on a shared browser profile. Queued captures
          // belonging to the other namespace are NOT touched: they are that
          // identity's un-synced work, and they replay when they sign back in.
          await clearOtherNamespaces(result.meta.namespace);
        }
        // The cached offline shell belongs to the running deployment; refreshing
        // it here keeps the document the owner sees offline in step with the
        // snapshot they will see inside it.
        void refreshOfflineShell();
      } else {
        // BOTH `skipped` and `failed` carry the connection state, and both must
        // apply it. Handling only `skipped` left the state stuck on its previous
        // value when the request failed outright — so a device that had just
        // lost its connection went on claiming it was online.
        setConnection(result.connection);
      }

      const active = namespaceRef.current;
      if (active) {
        // The snapshot request has already established the connection state, so
        // the replay pass never spends a second round trip re-establishing it.
        const pass = await replayQueue({
          namespace: active,
          signal: abortRef.current?.signal,
          ...(syncedConnection ? { connection: syncedConnection } : {}),
        });
        if (pass.blocked > 0) setConnection("authRequired");
        await pruneSyncedQueue(active);
        await reload(active);
      }
    } finally {
      setBusy(false);
    }
  }, [reload]);

  /* ---- service worker + install --------------------------------------- */
  useEffect(() => {
    setStandalone(isRunningStandalone());
    // The install prompt listener is free and must be attached IMMEDIATELY: the
    // browser fires `beforeinstallprompt` once, and a listener attached later
    // misses it entirely.
    const stopInstall = watchInstallability(setDeferredPrompt);
    // Registration is not free — the worker immediately precaches the shell —
    // so it waits for the page to finish loading and the browser to go idle.
    let stopWorker = () => {};
    const cancelIdle = afterPageIdle(() => {
      stopWorker = registerServiceWorker({ onStatus: setServiceWorker });
      // Cache the offline shell document once, here, rather than inside the
      // worker's install: install must not make the server render a second
      // document while it is still serving the one being loaded.
      void refreshOfflineShell();
    });
    return () => {
      cancelIdle();
      stopWorker();
      stopInstall();
    };
  }, []);

  /* ---- first load: read what the device already has, then sync --------- */
  useEffect(() => {
    let cancelled = false;
    const readAndSync = async () => {
      // The device may already hold a snapshot from a previous session. Read it
      // FIRST so the offline views have data before any network work — this is
      // what makes an offline cold launch instant instead of waiting out a probe
      // timeout on a page with nothing to show.
      const latest = await readLatestMeta();
      if (cancelled) return;
      if (!latest.ok) {
        setStorageFailure(latest.failure);
      } else if (latest.value) {
        namespaceRef.current = latest.value.namespace;
        await reload(latest.value.namespace);
      }
      if (cancelled) return;
      setInitialised(true);
      await sync();
    };
    // Reading this device's own storage is local and cheap, so it happens now —
    // it is what lets an offline cold launch render immediately. The SYNC inside
    // it is network work, and `readAndSync` is scheduled as one unit after the
    // page is idle so neither competes with the page being loaded.
    const cancelIdle = afterPageIdle(() => void readAndSync());
    return () => {
      cancelled = true;
      cancelIdle();
    };
    // Deliberately once per mount: the shell mounts one provider for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- event-driven probing ------------------------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => void probe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };
    // `offline` is a HINT, not an answer: it is followed by a real probe, whose
    // result is what actually sets the state.
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [probe]);

  /* ---- unhealthy heartbeat, with backoff ------------------------------- */
  useEffect(() => {
    if (connection === "online") return;
    // An expired sign-in is NOT retried on a timer. Retrying is a redirect to
    // the identity provider every time, and it cannot succeed until the owner
    // acts; the "Sign in again" control is what resumes.
    if (shouldPauseSync(connection)) return;

    let delay = UNHEALTHY_HEARTBEAT_MS;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const state = await probe();
      if (cancelled) return;
      if (state === "online") {
        void sync();
        return;
      }
      delay = Math.min(MAX_HEARTBEAT_MS, delay * 2);
      timer = setTimeout(() => void tick(), delay);
    };
    timer = setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, probe, sync]);

  /* ---- retention on open ---------------------------------------------- */
  useEffect(() => {
    if (!namespace || !meta) return;
    void pruneRetention(
      namespace,
      offlineWindow(
        ownerCalendarIso(new Date(), meta.window.timezone),
        meta.window.timezone,
      ),
    );
  }, [namespace, meta]);

  const enqueue = useCallback(async (payload: OfflineCapturePayload) => {
    const active = namespaceRef.current;
    if (!active) return null;
    const record = createQueueRecord({
      namespace: active,
      payload,
      now: new Date(),
    });
    const stored = await putQueueRecord(record);
    if (!stored.ok) {
      setStorageFailure(stored.failure);
      return null;
    }
    const queued = await readQueue(active);
    if (queued.ok) setQueue(queued.value);
    return record;
  }, []);

  const retry = useCallback(
    async (id: string) => {
      const active = namespaceRef.current;
      if (!active) return;
      const current = queue.find((record) => record.id === id);
      if (!current) return;
      // A manual retry resets the automatic attempt budget: the owner has looked
      // at the failure and chosen to try again, which is a different fact from
      // the machine trying five times.
      const reset: OfflineQueueRecord = beginReplayAttempt(
        { ...current, attempts: 0, lastError: null },
        new Date(),
      );
      await putQueueRecord(reset);
      const outcome = await replayCapture(
        reset,
        fetch,
        abortRef.current?.signal,
      );
      await putQueueRecord(applyReplayOutcome(reset, outcome, new Date()));
      await reload(active);
    },
    [queue, reload],
  );

  const discard = useCallback(
    async (id: string) => {
      const active = namespaceRef.current;
      await deleteQueueRecord(id);
      if (active) await reload(active);
    },
    [reload],
  );

  const clearCachedData = useCallback(async () => {
    const active = namespaceRef.current;
    if (!active) return;
    await clearSnapshot(active);
    setDataset(EMPTY_OFFLINE_DATASET);
    setMeta(null);
    setStorage(await estimateOfflineStorage());
  }, []);

  const discardQueued = useCallback(async () => {
    const active = namespaceRef.current;
    if (!active) return;
    const queued = await readQueue(active);
    if (queued.ok) {
      await Promise.all(
        queued.value.map((record) => deleteQueueRecord(record.id)),
      );
    }
    await reload(active);
  }, [reload]);

  const resetDevice = useCallback(async () => {
    await clearAllOfflineData();
    await clearServiceWorkerCaches();
    setDataset(EMPTY_OFFLINE_DATASET);
    setMeta(null);
    setQueue([]);
    setStorage(await estimateOfflineStorage());
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return "unavailable" as const;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  }, [deferredPrompt]);

  const value = useMemo<OfflineContextValue>(() => {
    const summary = summariseQueue(queue);
    const status: OfflineStatus = {
      connection,
      sync: deriveSyncState({
        busy,
        hasSnapshot: meta !== null,
        pendingCaptures: summary.pending + summary.syncing + summary.blocked,
        failedCaptures: summary.failed,
      }),
      lastSyncedAt: meta?.lastSyncedAt ?? null,
      pendingCaptures: summary.pending + summary.syncing + summary.blocked,
      failedCaptures: summary.failed,
    };
    return {
      status,
      serviceWorker,
      install: installCapability({
        deferredPrompt,
        standalone,
        ios: isIosSafari(),
      }),
      standalone,
      namespace,
      meta,
      dataset,
      queue,
      stale: isSnapshotStale(meta?.lastSyncedAt ?? null, new Date()),
      storageFailure,
      storage,
      busy,
      initialised,
      probe,
      sync,
      enqueue,
      retry,
      discard,
      clearCachedData,
      discardQueued,
      resetDevice,
      promptInstall,
      applyUpdate: applyServiceWorkerUpdate,
    };
  }, [
    busy,
    clearCachedData,
    connection,
    dataset,
    deferredPrompt,
    discard,
    discardQueued,
    enqueue,
    initialised,
    meta,
    namespace,
    probe,
    promptInstall,
    queue,
    resetDevice,
    retry,
    serviceWorker,
    standalone,
    storage,
    storageFailure,
    sync,
  ]);

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}
