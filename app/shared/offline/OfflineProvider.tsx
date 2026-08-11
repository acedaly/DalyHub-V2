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
  applyMutationOutcome,
  applyReplayOutcome,
  beginMutationAttempt,
  beginReplayAttempt,
  createQueueRecord,
  deriveSyncState,
  isSnapshotStale,
  offlineWindow,
  overrideMutation,
  requeueMutation,
  shouldPauseSync,
  summariseMutations,
  summariseQueue,
  type OfflineCapturePayload,
  type OfflineConnectionState,
  type OfflineMutationRecord,
  type OfflineMutationSummary,
  type OfflineQueueRecord,
  type OfflineStatus,
} from "~/kernel/offline";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  installOfflineDiagnostics,
  recordOfflineDiagnostic,
} from "./diagnostics";
import {
  installCapability,
  isIosSafari,
  watchInstallability,
  type BeforeInstallPromptEvent,
  type InstallCapability,
} from "./install";
import {
  OFFLINE_LOCAL_CHECKING,
  captureAvailability,
  isLocalStateResolved,
  localStateFromFailure,
  localStateFromMeta,
  type OfflineCaptureAvailability,
  type OfflineLocalState,
} from "./local-state";
import {
  announceReplayApplied,
  setActiveOfflineNamespace,
  subscribeMutationQueue,
} from "./mutation-queue";
import { replayMutation, replayMutations } from "./mutation-sync";
import type { OfflineDatabaseFailure } from "./offline-database";
import { afterPageIdle } from "./page-idle";
import {
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
  readDataset,
  readLatestMeta,
  readMutations,
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
  reportOfflineShellReady,
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
  /**
   * PWA-12 — the Task changes this device is holding: queued, in flight, waiting
   * on a decision or permanently refused. Synced records are pruned, so an empty
   * array is the steady state and the interface shows nothing.
   */
  readonly mutations: readonly OfflineMutationRecord[];
  readonly mutationSummary: OfflineMutationSummary;
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
   * they have not yet checked for. Derived from `local`, which is the value to
   * read: a boolean cannot say WHY a read produced nothing.
   */
  readonly initialised: boolean;
  /**
   * PWA-11 — the bounded outcome of reading this device's own storage. Always
   * resolves to one of five states; never waits indefinitely.
   */
  readonly local: OfflineLocalState;
  /** Whether an offline capture can be filed here, and the reason when it cannot. */
  readonly capture: OfflineCaptureAvailability;
  /**
   * True when a probe has found DalyHub reachable again but nothing has been
   * synchronised yet. It is an OFFER, never an action: reconnecting must not
   * reload, navigate or sync on the owner's behalf on this surface.
   */
  readonly reconnectAvailable: boolean;

  probe(): Promise<OfflineConnectionState>;
  /** Refresh the snapshot AND replay the queue. The one "sync now" action. */
  sync(): Promise<void>;
  enqueue(payload: OfflineCapturePayload): Promise<OfflineQueueRecord | null>;
  retry(id: string): Promise<void>;
  discard(id: string): Promise<void>;
  /** Send one queued Task change again, resetting its automatic attempt budget. */
  retryMutation(id: string): Promise<void>;
  /**
   * Resolve a conflicted Task change.
   *
   * `"mine"` rebases the queued intent onto the server's current value and sends
   * it again — the owner has SEEN the other device's value and chosen to replace
   * it. `"server"` discards the queued intent and keeps what the server holds.
   * There is no third option and no automatic default: DalyHub does not guess.
   */
  resolveConflict(id: string, keep: "mine" | "server"): Promise<void>;
  /** Discard one queued Task change. Destructive; callers must confirm first. */
  discardMutation(id: string): Promise<void>;
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
  /**
   * Whether regaining a connection may synchronise on its own.
   *
   * True inside the running application, where a sync is invisible and welcome.
   * FALSE on the offline shell (`/offline`), where the owner is looking at a
   * page whose entire job is to be stable: there, reconnecting sets
   * `reconnectAvailable` and waits for "Sync now". PWA-11 — automatic recovery
   * is only acceptable when it cannot surprise the surface the owner is on.
   */
  readonly autoSyncOnReconnect?: boolean;
}

export function OfflineProvider({
  children,
  autoSyncOnReconnect = true,
}: OfflineProviderProps) {
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
  const [mutations, setMutations] = useState<readonly OfflineMutationRecord[]>(
    [],
  );
  const [storageFailure, setStorageFailure] =
    useState<OfflineDatabaseFailure | null>(null);
  const [storage, setStorage] = useState<OfflineStorageEstimate>({
    usageBytes: null,
    quotaBytes: null,
  });
  const [busy, setBusy] = useState(false);
  // PWA-11 — the bounded outcome of the FIRST read of this device's storage.
  // `checking` is what stops a server-rendered (or not-yet-hydrated) offline
  // page asserting "no offline copy on this device" before it has looked; every
  // other value is a resolved answer, and the read that produces it is on a
  // deadline so one of them always arrives.
  const [local, setLocal] = useState<OfflineLocalState>(OFFLINE_LOCAL_CHECKING);
  const [reconnectAvailable, setReconnectAvailable] = useState(false);

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
    const [data, queued, changes] = await Promise.all([
      readDataset(targetNamespace),
      readQueue(targetNamespace),
      readMutations(targetNamespace),
    ]);
    if (changes.ok) setMutations(changes.value);
    if (data.ok) {
      setDataset(data.value);
      setMeta(data.value.meta);
      setStorageFailure(null);
      setLocal(localStateFromMeta(data.value.meta));
    } else {
      setStorageFailure(data.failure);
      setLocal(localStateFromFailure(data.failure));
      recordOfflineDiagnostic("indexedDb", data.failure.message);
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

  /**
   * The one place a RECONNECTION is recognised.
   *
   * PWA-12 — this used to be nowhere. `probe` set the connection state and the
   * only code that called `sync()` on regaining a connection was the unhealthy
   * HEARTBEAT's tick. But the heartbeat runs on a 15-second timer and stops the
   * moment the state is healthy, so whenever the browser's own `online` event
   * (or a visibility change) discovered the network first — which is the common
   * case, and the case a phone leaving a lift always takes — the heartbeat was
   * cancelled by the very transition that should have triggered the pass, and
   * nothing replayed until something else happened to sync.
   *
   * With queued CAPTURES that was a delay. With queued Task CHANGES it would be
   * a broken promise: §23 requires that reconnection while the application is
   * active is sufficient to reconcile, without the owner pressing anything.
   *
   * The ref, rather than the state value, is what makes this a transition rather
   * than a level: it must fire on unhealthy → online, and not on every probe of
   * an already-healthy connection (which is what a visible tab produces on every
   * tab switch, and would turn into a snapshot request each time).
   */
  const onReconnected = useCallback(
    (state: OfflineConnectionState) => {
      const recovered =
        state === "online" && connectionRef.current !== "online";
      if (!recovered) return;
      // PWA-11 — reconnecting NEVER reloads and never navigates. Inside the
      // running application it synchronises, which is invisible and wanted. On
      // the offline shell it does neither: it offers.
      if (autoSyncOnReconnect) void sync();
      else setReconnectAvailable(true);
    },
    // `sync` is stable for the provider's lifetime; naming it here would
    // re-create this callback on every render of the effects that depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoSyncOnReconnect],
  );

  const probe = useCallback(async () => {
    const state = await probeConnection(
      fetch,
      undefined,
      abortRef.current?.signal,
    );
    onReconnected(state);
    setConnection(state);
    // A surface that does not sync on its own says so instead, so "the network
    // came back" is visible without anything having happened behind the owner.
    if (!autoSyncOnReconnect) setReconnectAvailable(state === "online");
    return state;
  }, [autoSyncOnReconnect, onReconnected]);

  // PWA-11 — the in-flight pass, so a second "Sync now" JOINS the running one
  // instead of starting a second. The button's `disabled` state is a courtesy;
  // this is the guarantee. Without it two passes can both read the queue before
  // either has marked a record `syncing`, and the same capture is sent twice —
  // which the server's idempotency key then has to catch, at the cost of a
  // wasted round trip and a race the client should never have created.
  const syncInFlight = useRef<Promise<void> | null>(null);

  const runSync = useCallback(async () => {
    setBusy(true);
    setReconnectAvailable(false);
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
        // the replay passes never spend a second round trip re-establishing it.
        const pass = await replayQueue({
          namespace: active,
          signal: abortRef.current?.signal,
          ...(syncedConnection ? { connection: syncedConnection } : {}),
        });
        // PWA-12 — Task mutations replay in the SAME pass, after captures. The
        // order is deliberate: a capture creates a record, and a mutation edits
        // one, so sending creations first is the only order in which a device
        // holding both can end up consistent in one pass. This provider is the
        // ONE replay authority (§22): the service worker replays nothing, no
        // component replays anything, and re-entrant calls join the running pass
        // rather than starting a second.
        const changes = await replayMutations({
          namespace: active,
          signal: abortRef.current?.signal,
          ...(pass.connection === "online"
            ? { connection: pass.connection }
            : {}),
        });
        if (changes.blocked > 0 || pass.blocked > 0) {
          setConnection("authRequired");
          // An expired sign-in is REPORTED, never navigated to. The queued
          // captures stay exactly where they are; the owner signs in again from
          // a page they chose to open. Redirecting from here is how an offline
          // page ends up bouncing between DalyHub and an identity provider.
          recordOfflineDiagnostic(
            "authRedirect",
            "Sync paused: the DalyHub sign-in has expired. Queued work is untouched.",
          );
        }
        await pruneSyncedQueue(active);
        // PWA-12 retention (§42): a confirmed change has served its purpose and
        // the Activity stream is the audit authority. The queue keeps only what
        // is still owed or still owned by the owner.
        await pruneSyncedMutations(active);
        // A replayed change may have moved server state this page is rendering —
        // most visibly a recurring completion, whose SUCCESSOR only the server
        // knows about. Re-reading is how the authoritative result reaches the
        // surface; the client never invents one (§10).
        if (changes.synced > 0) announceReplayApplied();
        await reload(active);
      }
    } finally {
      setBusy(false);
    }
  }, [reload]);

  /** The one "sync now" entry point. Re-entrant calls join the running pass. */
  const sync = useCallback(async () => {
    if (syncInFlight.current) return syncInFlight.current;
    const pass = runSync().finally(() => {
      syncInFlight.current = null;
    });
    syncInFlight.current = pass;
    return pass;
  }, [runSync]);

  /* ---- diagnostics ------------------------------------------------------ */
  // Attached FIRST and synchronously: an error thrown while the rest of this
  // provider is still setting itself up is exactly the error worth having.
  useEffect(() => installOfflineDiagnostics(), []);

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
      //
      // PWA-11 — every branch below RESOLVES `local`. `readLatestMeta` is itself
      // on a deadline (`offline-store.ts`), and the `try/catch` covers the one
      // remaining way this could end without an answer: an exception thrown
      // somewhere in the read. There is no path from here that leaves the offline
      // page saying "checking…" forever.
      try {
        const latest = await readLatestMeta();
        if (cancelled) return;
        if (!latest.ok) {
          setStorageFailure(latest.failure);
          setLocal(localStateFromFailure(latest.failure));
          recordOfflineDiagnostic("indexedDb", latest.failure.message);
        } else if (latest.value) {
          namespaceRef.current = latest.value.namespace;
          setLocal(localStateFromMeta(latest.value));
          await reload(latest.value.namespace);
        } else {
          setLocal({ kind: "empty" });
        }
      } catch (cause) {
        if (cancelled) return;
        setLocal({
          kind: "unreadable",
          reason:
            "The copy stored on this device could not be read. Nothing has been lost — reconnect and DalyHub will store a fresh one.",
        });
        recordOfflineDiagnostic("snapshotCorrupt", cause);
      }
      if (cancelled) return;
      // The offline surface has reached a settled state, so the worker's
      // offline-boot loop breaker can forget this launch. Reporting it here —
      // after the read resolved, not on mount — is what makes the breaker
      // measure "did this page get anywhere", rather than "did it start".
      void reportOfflineShellReady();
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
        // `probe` has already recognised the transition and started the pass
        // (or made the offer). All the heartbeat has to do now is stop, so this
        // happens once per disconnection rather than on a timer.
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
  }, [connection, probe]);

  /* ---- PWA-12: publish the namespace, and follow the queue ------------- */
  // The gateway (`mutation-queue.ts`) is a plain module, because the seam every
  // Task edit already passes through is a plain module. It cannot read React
  // state, so the provider PUSHES the active namespace to it — and nothing can
  // be queued until a server-produced snapshot has established one, which is the
  // "no offline editing before a successful authenticated session" rule enforced
  // by the data model rather than by a flag.
  useEffect(() => {
    setActiveOfflineNamespace(namespace);
    return () => setActiveOfflineNamespace(null);
  }, [namespace]);

  useEffect(() => {
    return subscribeMutationQueue(() => {
      const active = namespaceRef.current;
      if (!active) return;
      void readMutations(active).then((result) => {
        if (result.ok) setMutations(result.value);
      });
    });
  }, []);

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
      recordOfflineDiagnostic("storageUnavailable", stored.failure.message);
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

  /* ---- PWA-12: the queued Task changes -------------------------------- */

  /**
   * Send one queued Task change again.
   *
   * The record's `id` is unchanged, so this is still the SAME mutation to the
   * server's receipt table: a manual retry of a change that in fact already
   * applied is answered from the receipt and applies nothing a second time. Only
   * the attempt budget resets, because the owner has looked at the failure and
   * decided — a different fact from the machine having tried five times.
   */
  const sendMutation = useCallback(
    async (record: OfflineMutationRecord) => {
      const active = namespaceRef.current;
      if (!active) return;
      const attempt = beginMutationAttempt(record, new Date());
      await putMutationRecord(attempt);
      const outcome = await replayMutation(
        attempt,
        fetch,
        abortRef.current?.signal,
      );
      const settled = applyMutationOutcome(attempt, outcome, new Date());
      await putMutationRecord(settled);
      if (settled.status === "synced") {
        await pruneSyncedMutations(active);
        announceReplayApplied();
      }
      await reload(active);
    },
    [reload],
  );

  const retryMutation = useCallback(
    async (id: string) => {
      const current = mutations.find((record) => record.id === id);
      if (!current) return;
      await sendMutation(requeueMutation(current));
    },
    [mutations, sendMutation],
  );

  const resolveConflict = useCallback(
    async (id: string, keep: "mine" | "server") => {
      const active = namespaceRef.current;
      const current = mutations.find((record) => record.id === id);
      if (!current) return;
      if (keep === "server") {
        // The owner chose the other device's value. The queued intent is dropped
        // — nothing is sent, and nothing on the server is touched.
        await deleteMutationRecord(id);
        if (active) await reload(active);
        return;
      }
      // "Keep mine" REBASES onto the value the owner has now seen and accepted
      // overwriting. Without the rebase the next attempt would detect the same
      // conflict against the same base and the change could never be sent.
      await sendMutation(overrideMutation(current));
    },
    [mutations, reload, sendMutation],
  );

  const discardMutation = useCallback(
    async (id: string) => {
      const active = namespaceRef.current;
      await deleteMutationRecord(id);
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
    setLocal({ kind: "empty" });
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
    setMutations([]);
    setLocal({ kind: "empty" });
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
    const mutationSummary = summariseMutations(mutations);
    // PWA-12 — queued CHANGES count towards the same two figures queued captures
    // do, so the status surfaces keep one vocabulary. The distinction the owner
    // needs is "waiting" versus "needs me", not "capture" versus "edit", and
    // splitting the counters would have produced a second status system for the
    // same two facts.
    const pending =
      summary.pending +
      summary.syncing +
      summary.blocked +
      mutationSummary.outstanding;
    const attention = summary.failed + mutationSummary.needsAttention;
    const status: OfflineStatus = {
      connection,
      sync: deriveSyncState({
        busy,
        hasSnapshot: meta !== null,
        pendingCaptures: pending,
        failedCaptures: attention,
      }),
      lastSyncedAt: meta?.lastSyncedAt ?? null,
      pendingCaptures: pending,
      failedCaptures: attention,
    };
    return {
      mutations,
      mutationSummary,
      retryMutation,
      resolveConflict,
      discardMutation,
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
      initialised: isLocalStateResolved(local),
      local,
      capture: captureAvailability({ local, namespace }),
      reconnectAvailable,
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
    discardMutation,
    discardQueued,
    enqueue,
    local,
    meta,
    mutations,
    namespace,
    probe,
    promptInstall,
    queue,
    reconnectAvailable,
    resetDevice,
    resolveConflict,
    retry,
    retryMutation,
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
