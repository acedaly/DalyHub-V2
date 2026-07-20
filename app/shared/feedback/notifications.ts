/**
 * DS-10 Feedback platform — the pure notification queue (React-free).
 *
 * All queue semantics live here as pure, deterministic functions over immutable
 * state — no timers, no clock, no React, no DOM. The provider owns the id/clock
 * seams and the dismissal timers; this module owns WHAT the queue contains:
 *
 *   - intelligent stacking: a notification with a `dedupeKey` matching one
 *     already present COALESCES onto it (count bumps, fields refresh, timer
 *     restarts via a new `createdAt`, position moves to front) rather than
 *     stacking a duplicate — the antidote to toast spam;
 *   - a bounded stack: at most `MAX_NOTIFICATIONS`; on overflow the OLDEST
 *     dismissable (auto-dismissing) notification is retired first, so a sticky
 *     error is never silently dropped by a burst of successes;
 *   - newest-first ordering.
 *
 * Keeping this pure mirrors the DS-06 autosave split (a pure reducer plus a
 * timing hook) and lets the whole queue policy be unit-tested without a DOM.
 */

import { MAX_NOTIFICATIONS } from "./config";
import type {
  NotificationId,
  NotificationQueueState,
  NotificationRecord,
} from "./types";

/** The empty queue. */
export function emptyNotificationQueue(): NotificationQueueState {
  return { notifications: Object.freeze([]) };
}

/** Trim the stack to the bound, retiring the OLDEST auto-dismissing entry first. */
function enforceBound(
  notifications: readonly NotificationRecord[],
): readonly NotificationRecord[] {
  if (notifications.length <= MAX_NOTIFICATIONS) {
    return notifications;
  }
  const excess = notifications.length - MAX_NOTIFICATIONS;
  const out = [...notifications];
  // Retire from the oldest end; skip sticky (duration === null) entries so a
  // failure is never dropped by a burst. Fall back to the oldest overall if the
  // whole stack is sticky.
  let removed = 0;
  for (let i = out.length - 1; i >= 0 && removed < excess; i -= 1) {
    if (out[i].duration !== null) {
      out.splice(i, 1);
      removed += 1;
    }
  }
  while (removed < excess && out.length > MAX_NOTIFICATIONS) {
    out.pop();
    removed += 1;
  }
  return out;
}

/**
 * Add `incoming` to the queue. If its `dedupeKey` matches an existing record, the
 * two are coalesced: the existing id is kept (so its DOM node/timer is reused and
 * reset), the count increments, the visible fields and `createdAt` refresh to the
 * incoming values, and the record moves to the front. Otherwise it is prepended.
 *
 * `incoming.count` is taken as the base (normally 1); on coalesce it is added to
 * the existing count so an explicit multi-bump is respected.
 */
export function pushNotification(
  state: NotificationQueueState,
  incoming: NotificationRecord,
): NotificationQueueState {
  let next: NotificationRecord[];
  const existingIndex =
    incoming.dedupeKey === undefined
      ? -1
      : state.notifications.findIndex(
          (n) =>
            n.dedupeKey !== undefined && n.dedupeKey === incoming.dedupeKey,
        );

  if (existingIndex >= 0) {
    const existing = state.notifications[existingIndex];
    const merged: NotificationRecord = {
      ...incoming,
      id: existing.id,
      count: existing.count + incoming.count,
    };
    next = [
      merged,
      ...state.notifications.filter((_, i) => i !== existingIndex),
    ];
  } else {
    next = [incoming, ...state.notifications];
  }

  return { notifications: Object.freeze(enforceBound(next)) };
}

/** Remove a notification by id (idempotent). */
export function dismissNotification(
  state: NotificationQueueState,
  id: NotificationId,
): NotificationQueueState {
  const notifications = state.notifications.filter((n) => n.id !== id);
  if (notifications.length === state.notifications.length) {
    return state;
  }
  return { notifications: Object.freeze(notifications) };
}

/** Remove every notification. */
export function clearNotifications(
  state: NotificationQueueState,
): NotificationQueueState {
  if (state.notifications.length === 0) {
    return state;
  }
  return emptyNotificationQueue();
}

/** Look up a notification by id (or `undefined`). */
export function findNotification(
  state: NotificationQueueState,
  id: NotificationId,
): NotificationRecord | undefined {
  return state.notifications.find((n) => n.id === id);
}
