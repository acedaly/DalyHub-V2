/**
 * DS-10 Feedback platform — timing & bounds (React-free).
 *
 * The calm defaults for the feedback layer: how long each tone lingers, how long
 * an Undo stays available, and how many notifications may stack before the oldest
 * is retired. Centralised so the behaviour is one decision, not scattered magic
 * numbers, and so the reducers and the provider agree.
 */

import type { NotificationKind } from "./types";

/**
 * Per-tone auto-dismiss delays (ms). Errors are STICKY (`null`) — a failure must
 * not vanish before it is read; the user dismisses it. Warnings linger longer
 * than the quiet success/info confirmations.
 */
export const NOTIFICATION_DURATIONS: Readonly<
  Record<NotificationKind, number | null>
> = Object.freeze({
  success: 5000,
  info: 5000,
  warning: 8000,
  error: null,
});

/**
 * How long an Undo affordance stays offered (ms). Long enough to reconsider a
 * delete/complete/archive, short enough to stay calm. Pausing on hover/focus
 * freezes this window so it is never yanked away mid-read.
 */
export const UNDO_WINDOW_MS = 8000;

/** The most notifications shown at once; the oldest dismissable one is retired. */
export const MAX_NOTIFICATIONS = 5;

/** After a background operation succeeds, auto-clear its tray row after this. */
export const OPERATION_SUCCESS_CLEAR_MS = 4000;

/** Default label for the Undo action. */
export const DEFAULT_UNDO_LABEL = "Undo";
