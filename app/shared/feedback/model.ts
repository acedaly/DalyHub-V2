/**
 * DS-10 Feedback platform — the React-FREE model entry.
 *
 * A re-export-only barrel forwarding the pure feedback model: the shared types,
 * the timing/bounds config, the notification-queue reducer and the
 * background-operation lifecycle reducer. A server module, a worker, or a test
 * can import this without pulling in React, the DOM, the Router or Cloudflare.
 *
 * An import-guard test (`test/unit/feedback/react-free.test.ts`) asserts every
 * file re-exported here imports no React/React-DOM/React-Router. Keep that test's
 * file list in sync when you add a pure module.
 */

export type {
  NotificationKind,
  NotificationId,
  NotificationAction,
  NotificationRecord,
  NotificationQueueState,
  OperationStatus,
  OperationRecord,
  OperationsState,
} from "./types";
export { isAssertiveKind } from "./types";

export {
  NOTIFICATION_DURATIONS,
  UNDO_WINDOW_MS,
  MAX_NOTIFICATIONS,
  OPERATION_SUCCESS_CLEAR_MS,
  DEFAULT_UNDO_LABEL,
} from "./config";

export {
  emptyNotificationQueue,
  pushNotification,
  dismissNotification,
  clearNotifications,
  findNotification,
} from "./notifications";

export {
  emptyOperations,
  startOperation,
  advanceOperation,
  retryOperation,
  removeOperation,
  findOperation,
  isOperationActive,
} from "./operations";
