import { describe, expect, it } from "vitest";

import { MAX_NOTIFICATIONS } from "~/shared/feedback/config";
import {
  clearNotifications,
  dismissNotification,
  emptyNotificationQueue,
  findNotification,
  pushNotification,
} from "~/shared/feedback/notifications";
import type { NotificationRecord } from "~/shared/feedback/types";

function record(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    id: overrides.id ?? "n1",
    kind: overrides.kind ?? "success",
    title: overrides.title ?? "Saved",
    message: overrides.message,
    action: overrides.action,
    duration: overrides.duration === undefined ? 5000 : overrides.duration,
    dedupeKey: overrides.dedupeKey,
    count: overrides.count ?? 1,
    createdAt: overrides.createdAt ?? 1000,
    assertive: overrides.assertive ?? false,
  };
}

describe("DS-10 notification queue", () => {
  it("starts empty and frozen", () => {
    const state = emptyNotificationQueue();
    expect(state.notifications).toHaveLength(0);
    expect(Object.isFrozen(state.notifications)).toBe(true);
  });

  it("prepends new notifications newest-first", () => {
    let state = emptyNotificationQueue();
    state = pushNotification(state, record({ id: "a" }));
    state = pushNotification(state, record({ id: "b" }));
    expect(state.notifications.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("coalesces a repeat with the same dedupeKey instead of stacking", () => {
    let state = emptyNotificationQueue();
    state = pushNotification(
      state,
      record({ id: "a", dedupeKey: "msg", count: 1, createdAt: 1000 }),
    );
    state = pushNotification(
      state,
      record({
        id: "b",
        dedupeKey: "msg",
        title: "Message received again",
        count: 1,
        createdAt: 2000,
      }),
    );
    expect(state.notifications).toHaveLength(1);
    const merged = state.notifications[0];
    // Keeps the ORIGINAL id (so the DOM node/timer is reused) but bumps count and
    // refreshes the visible fields + createdAt.
    expect(merged.id).toBe("a");
    expect(merged.count).toBe(2);
    expect(merged.title).toBe("Message received again");
    expect(merged.createdAt).toBe(2000);
  });

  it("moves a coalesced notification to the front", () => {
    let state = emptyNotificationQueue();
    state = pushNotification(state, record({ id: "a", dedupeKey: "msg" }));
    state = pushNotification(state, record({ id: "b", dedupeKey: "other" }));
    // Re-raise the "msg" notification — it should jump to the front.
    state = pushNotification(state, record({ id: "c", dedupeKey: "msg" }));
    expect(state.notifications.map((n) => n.id)).toEqual(["a", "b"]);
    expect(state.notifications[0].count).toBe(2);
  });

  it("does not coalesce when no dedupeKey is set", () => {
    let state = emptyNotificationQueue();
    state = pushNotification(state, record({ id: "a" }));
    state = pushNotification(state, record({ id: "b" }));
    expect(state.notifications).toHaveLength(2);
  });

  it("bounds the stack, retiring the oldest auto-dismissing entry first", () => {
    let state = emptyNotificationQueue();
    for (let i = 0; i < MAX_NOTIFICATIONS + 2; i += 1) {
      state = pushNotification(
        state,
        record({ id: `n${i}`, duration: 5000, createdAt: i }),
      );
    }
    expect(state.notifications).toHaveLength(MAX_NOTIFICATIONS);
    // The two oldest (n0, n1) were retired.
    expect(findNotification(state, "n0")).toBeUndefined();
    expect(findNotification(state, "n1")).toBeUndefined();
  });

  it("never drops a sticky (error) notification when trimming a burst", () => {
    let state = emptyNotificationQueue();
    // One sticky error first (oldest), then a burst of successes.
    state = pushNotification(
      state,
      record({ id: "err", kind: "error", duration: null, createdAt: 0 }),
    );
    for (let i = 1; i <= MAX_NOTIFICATIONS + 2; i += 1) {
      state = pushNotification(
        state,
        record({ id: `ok${i}`, duration: 5000, createdAt: i }),
      );
    }
    expect(state.notifications).toHaveLength(MAX_NOTIFICATIONS);
    expect(findNotification(state, "err")).toBeDefined();
  });

  it("dismisses by id and is idempotent", () => {
    let state = emptyNotificationQueue();
    state = pushNotification(state, record({ id: "a" }));
    const dismissed = dismissNotification(state, "a");
    expect(dismissed.notifications).toHaveLength(0);
    // Dismissing an unknown id returns the same reference (no-op).
    expect(dismissNotification(dismissed, "missing")).toBe(dismissed);
  });

  it("clears all notifications", () => {
    let state = emptyNotificationQueue();
    state = pushNotification(state, record({ id: "a" }));
    state = pushNotification(state, record({ id: "b" }));
    expect(clearNotifications(state).notifications).toHaveLength(0);
  });
});
