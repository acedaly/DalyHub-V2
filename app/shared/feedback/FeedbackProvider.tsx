/**
 * DS-10 Feedback platform — the single provider (mounted once at AppShell).
 *
 * This is the ONE implementation of the whole feedback layer for the entire
 * application. It owns:
 *
 *   - the notification queue (via the pure `notifications` reducer) and its
 *     dismissal timers, with pause-on-hover/focus so a toast is never yanked away
 *     mid-read;
 *   - the background-operation lifecycle (via the pure `operations` reducer),
 *     including the real `AbortController`s for cancellation and the retry path;
 *   - the Undo mechanism: an Undo notification runs its reverse handler on Undo
 *     and its commit handler on expiry/dismissal (dismissing an optimistic action
 *     commits it — Gmail-style);
 *   - the ARIA live regions that announce feedback to assistive tech (polite for
 *     success/info, assertive for warning/error).
 *
 * Modules see none of this — they call `useFeedback()` (see `feedback-context`).
 * The clock and id generation live HERE (the pure model stays deterministic).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { NotificationCenter } from "./NotificationCenter";
import {
  DEFAULT_UNDO_LABEL,
  NOTIFICATION_DURATIONS,
  OPERATION_SUCCESS_CLEAR_MS,
  UNDO_WINDOW_MS,
} from "./config";
import {
  FeedbackContext,
  type FeedbackApi,
  type NotifyOptions,
  type RunOperationOptions,
  type UndoOptions,
} from "./feedback-context";
import {
  advanceOperation,
  clearNotifications,
  dismissNotification,
  emptyNotificationQueue,
  emptyOperations,
  pushNotification,
  removeOperation,
  retryOperation,
  startOperation,
} from "./model";
import {
  isAssertiveKind,
  type NotificationId,
  type NotificationKind,
  type NotificationQueueState,
  type NotificationRecord,
  type OperationsState,
} from "./types";

type TimerEntry = {
  timeoutId: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remaining: number;
  createdAt: number;
};

type Announcement = {
  readonly text: string;
  readonly assertive: boolean;
} | null;

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function now(): number {
  return Date.now();
}

export function FeedbackProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [queue, setQueue] = useState<NotificationQueueState>(
    emptyNotificationQueue,
  );
  const [operations, setOperations] =
    useState<OperationsState>(emptyOperations);
  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement>(null);

  // Per-notification dismissal timers, reconciled by the effect below.
  const timersRef = useRef<Map<NotificationId, TimerEntry>>(new Map());
  // Commit handlers for Undo notifications: called on expiry/dismissal (NOT on
  // Undo). Removing an id before dismissal is how the Undo path opts out of commit.
  const commitHandlersRef = useRef<Map<NotificationId, () => void>>(new Map());
  // Per-operation abort controllers and retry launchers.
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const retryHandlersRef = useRef<Map<string, () => void>>(new Map());
  const opClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const announce = useCallback((record: NotificationRecord) => {
    const text = record.message
      ? `${record.title}. ${record.message}`
      : record.title;
    // A trailing invisible counter is unnecessary: coalesced repeats change the
    // count in the visible text; distinct notifications change the text itself.
    setAnnouncement({ text, assertive: record.assertive });
  }, []);

  // Remove a notification from the queue. Firing its Undo commit handler (an
  // un-undone Undo commits on removal) is NOT done here — it is centralised in the
  // reconciliation effect below, so EVERY removal path (timer expiry, manual
  // dismiss, dismiss-all, coalescing replacement, bounded-stack eviction) commits
  // exactly once. Stable — safe to call inside timers. To OPT OUT of the commit
  // (the Undo path), delete the handler before the record leaves the queue.
  const finalizeDismiss = useCallback((id: NotificationId) => {
    const timer = timersRef.current.get(id);
    if (timer?.timeoutId != null) {
      clearTimeout(timer.timeoutId);
    }
    timersRef.current.delete(id);
    setQueue((prev) => dismissNotification(prev, id));
  }, []);

  const raise = useCallback(
    (
      kind: NotificationKind,
      title: string,
      options: NotifyOptions | undefined,
      overrides?: Partial<NotificationRecord>,
    ): NotificationId => {
      const id = nextId("fb");
      const duration =
        options?.duration !== undefined
          ? options.duration
          : NOTIFICATION_DURATIONS[kind];
      const record: NotificationRecord = {
        id,
        kind,
        title,
        message: options?.message,
        action: options?.action,
        duration,
        dedupeKey: options?.dedupeKey,
        count: 1,
        createdAt: now(),
        assertive: isAssertiveKind(kind),
        ...overrides,
      };
      setQueue((prev) => pushNotification(prev, record));
      announce(record);
      return record.id;
    },
    [announce],
  );

  const notify = useCallback(
    (kind: NotificationKind, title: string, options?: NotifyOptions) =>
      raise(kind, title, options),
    [raise],
  );
  const notifySuccess = useCallback(
    (title: string, options?: NotifyOptions) =>
      raise("success", title, options),
    [raise],
  );
  const notifyInfo = useCallback(
    (title: string, options?: NotifyOptions) => raise("info", title, options),
    [raise],
  );
  const notifyWarning = useCallback(
    (title: string, options?: NotifyOptions) =>
      raise("warning", title, options),
    [raise],
  );
  const notifyError = useCallback(
    (title: string, options?: NotifyOptions) => raise("error", title, options),
    [raise],
  );

  const dismiss = useCallback(
    (id: NotificationId) => finalizeDismiss(id),
    [finalizeDismiss],
  );

  const notifyUndo = useCallback(
    (title: string, options: UndoOptions): NotificationId => {
      const duration = options.duration ?? UNDO_WINDOW_MS;
      const id = nextId("fb");
      // Undo notifications are DELIBERATELY non-coalescing: each represents a
      // distinct reversible action with its own reverse/commit handlers, so they
      // must never merge (which would drop one action's handlers and desynchronise
      // the commit-handler id from the queue id). We therefore never pass a
      // dedupeKey, guaranteeing the record keeps THIS id — the id its handler is
      // registered under and its action closure captures.
      if (options.onExpire) {
        commitHandlersRef.current.set(id, options.onExpire);
      }
      const action = {
        label: options.undoLabel ?? DEFAULT_UNDO_LABEL,
        dismissOnSelect: true,
        onSelect: async () => {
          // Undo chosen — opt out of the commit handler (synchronously, before the
          // first await and before the record is removed), then reverse.
          commitHandlersRef.current.delete(id);
          await options.onUndo();
        },
      };
      return raise(
        "success",
        title,
        {
          message: options.message,
          duration,
          action,
        },
        { id },
      );
    },
    [raise],
  );

  // ---- Background operations -------------------------------------------------

  const scheduleOperationClear = useCallback((id: string) => {
    const existing = opClearTimersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
    }
    const timeoutId = setTimeout(() => {
      opClearTimersRef.current.delete(id);
      setOperations((prev) => removeOperation(prev, id));
    }, OPERATION_SUCCESS_CLEAR_MS);
    opClearTimersRef.current.set(id, timeoutId);
  }, []);

  const runOperation = useCallback(
    <T,>(options: RunOperationOptions<T>): Promise<T> => {
      const id = nextId("op");
      const cancellable = options.cancellable ?? false;
      const retryable = options.retryable ?? false;
      const startedAt = now();
      setOperations((prev) =>
        startOperation(prev, {
          id,
          label: options.label,
          description: options.description,
          status: "pending",
          cancellable,
          retryable,
          attempt: 1,
          createdAt: startedAt,
          updatedAt: startedAt,
        }),
      );

      const attempt = (): Promise<T> => {
        const controller = new AbortController();
        controllersRef.current.set(id, controller);
        setOperations((prev) => advanceOperation(prev, id, "running", now()));

        return options.run({ signal: controller.signal }).then(
          (result) => {
            controllersRef.current.delete(id);
            retryHandlersRef.current.delete(id);
            setOperations((prev) =>
              advanceOperation(prev, id, "success", now()),
            );
            scheduleOperationClear(id);
            if (options.successMessage) {
              notifySuccess(options.successMessage);
            }
            return result;
          },
          (error: unknown) => {
            controllersRef.current.delete(id);
            if (controller.signal.aborted) {
              // Cancelled by the user: quietly retire the row.
              setOperations((prev) => removeOperation(prev, id));
              retryHandlersRef.current.delete(id);
              throw error;
            }
            const message =
              options.errorMessage ??
              (error instanceof Error && error.message
                ? error.message
                : "Something went wrong.");
            setOperations((prev) =>
              advanceOperation(prev, id, "failure", now(), message),
            );
            if (retryable) {
              retryHandlersRef.current.set(id, () => {
                setOperations((prev) => retryOperation(prev, id, now()));
                void attempt().catch(() => {
                  /* surfaced via state; swallow to avoid an unhandled rejection */
                });
              });
            } else {
              notifyError(options.label, { message });
            }
            throw error;
          },
        );
      };

      return attempt();
    },
    [notifyError, notifySuccess, scheduleOperationClear],
  );

  const retryOperationById = useCallback((id: string) => {
    const handler = retryHandlersRef.current.get(id);
    if (handler) {
      handler();
    }
  }, []);

  const cancelOperationById = useCallback((id: string) => {
    const controller = controllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
  }, []);

  const dismissOperationById = useCallback((id: string) => {
    const clearTimer = opClearTimersRef.current.get(id);
    if (clearTimer) {
      clearTimeout(clearTimer);
      opClearTimersRef.current.delete(id);
    }
    retryHandlersRef.current.delete(id);
    setOperations((prev) => removeOperation(prev, id));
  }, []);

  // ---- Notification dismissal timers ----------------------------------------

  useEffect(() => {
    const timers = timersRef.current;
    const present = new Set(queue.notifications.map((n) => n.id));
    for (const [id, timer] of timers) {
      if (!present.has(id)) {
        if (timer.timeoutId != null) {
          clearTimeout(timer.timeoutId);
        }
        timers.delete(id);
      }
    }

    const current = now();
    for (const record of queue.notifications) {
      if (record.duration === null) {
        continue; // sticky — never auto-dismisses
      }
      let timer = timers.get(record.id);
      if (!timer || timer.createdAt !== record.createdAt) {
        // New or coalesced/refreshed — restart the full window.
        if (timer?.timeoutId != null) {
          clearTimeout(timer.timeoutId);
        }
        timer = {
          timeoutId: null,
          startedAt: 0,
          remaining: record.duration,
          createdAt: record.createdAt,
        };
        timers.set(record.id, timer);
      }
      if (paused) {
        if (timer.timeoutId != null) {
          timer.remaining = Math.max(
            0,
            timer.remaining - (current - timer.startedAt),
          );
          clearTimeout(timer.timeoutId);
          timer.timeoutId = null;
        }
      } else if (timer.timeoutId == null) {
        timer.startedAt = current;
        const target = record.id;
        timer.timeoutId = setTimeout(
          () => finalizeDismiss(target),
          timer.remaining,
        );
      }
    }
  }, [queue, paused, finalizeDismiss]);

  // ---- Undo commit finalisation (single source of truth) --------------------
  //
  // Whenever an Undo notification leaves the queue for ANY reason WITHOUT the Undo
  // being chosen — timer expiry, manual dismiss, dismiss-all, coalescing
  // replacement, or bounded-stack eviction — its optimistic action must commit
  // exactly once. This one effect is the only place `onExpire` fires: it reconciles
  // the commit handlers against the live queue, so no removal path can leak a
  // handler or skip a commit. The Undo path opts out by deleting the handler
  // BEFORE the record is removed, so the record is gone by the time this runs.
  useEffect(() => {
    const present = new Set(queue.notifications.map((n) => n.id));
    for (const [id, commit] of commitHandlersRef.current) {
      if (!present.has(id)) {
        commitHandlersRef.current.delete(id);
        commit();
      }
    }
  }, [queue]);

  // Clean up every timer/controller on unmount, and commit any still-pending Undo
  // actions (their window is being torn down, so the optimistic change stands).
  useEffect(() => {
    const timers = timersRef.current;
    const opClears = opClearTimersRef.current;
    const controllers = controllersRef.current;
    const commits = commitHandlersRef.current;
    return () => {
      for (const timer of timers.values()) {
        if (timer.timeoutId != null) {
          clearTimeout(timer.timeoutId);
        }
      }
      timers.clear();
      for (const timeoutId of opClears.values()) {
        clearTimeout(timeoutId);
      }
      opClears.clear();
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
      for (const [id, commit] of commits) {
        commits.delete(id);
        commit();
      }
    };
  }, []);

  const dismissAll = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      if (timer.timeoutId != null) {
        clearTimeout(timer.timeoutId);
      }
    }
    timersRef.current.clear();
    // Commit handlers are finalised by the reconciliation effect once the queue
    // clears — each pending Undo commits exactly once.
    setQueue((prev) => clearNotifications(prev));
  }, []);

  const runNotificationAction = useCallback(
    (record: NotificationRecord) => {
      const action = record.action;
      if (!action) {
        return;
      }
      // A rejected async action (e.g. an Undo whose reverse fails) must never
      // become an unhandled rejection or crash the app; the toast still dismisses.
      Promise.resolve(action.onSelect()).catch(() => {
        /* the handler owns its own error surfacing */
      });
      if (action.dismissOnSelect !== false) {
        // The action opted out of the commit handler already (Undo path); a plain
        // action simply removes the toast.
        finalizeDismiss(record.id);
      }
    },
    [finalizeDismiss],
  );

  const api = useMemo<FeedbackApi>(
    () => ({
      notify,
      notifySuccess,
      notifyInfo,
      notifyWarning,
      notifyError,
      notifyUndo,
      dismiss,
      runOperation,
    }),
    [
      notify,
      notifySuccess,
      notifyInfo,
      notifyWarning,
      notifyError,
      notifyUndo,
      dismiss,
      runOperation,
    ],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <NotificationCenter
        notifications={queue.notifications}
        operations={operations.operations}
        announcement={announcement}
        onDismiss={dismiss}
        onDismissAll={dismissAll}
        onAction={runNotificationAction}
        onOperationRetry={retryOperationById}
        onOperationCancel={cancelOperationById}
        onOperationDismiss={dismissOperationById}
        onPauseChange={setPaused}
      />
    </FeedbackContext.Provider>
  );
}
