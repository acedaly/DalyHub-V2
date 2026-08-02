/**
 * PWA-11 — every offline loading state is BOUNDED.
 *
 * The iPhone failure had two symptoms. The loud one was WebKit killing the page;
 * the quiet one was that, before it died, the page said "Checking what this
 * device has stored…" and never stopped. That sentence was rendered from a
 * boolean that was set after an IndexedDB read — and an IndexedDB read on iOS can
 * fire no event at all, so nothing in the system guaranteed the sentence would
 * ever be replaced.
 *
 * These tests assert the two halves of the fix:
 *   1. a storage operation that never answers RESOLVES anyway, as a failure;
 *   2. every possible outcome maps to a stated, actionable state — never to a
 *      wait.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OFFLINE_LOCAL_CHECKING,
  captureAvailability,
  isLocalStateResolved,
  localStateCopy,
  localStateFromFailure,
  localStateFromMeta,
  type OfflineLocalState,
} from "~/shared/offline/local-state";
import {
  openOfflineDatabase,
  storageTimeoutFailure,
  withDeadline,
  type OfflineDatabaseFailure,
} from "~/shared/offline/offline-database";
import type { OfflineMetaRecord } from "~/shared/offline/offline-store";

function meta(overrides: Partial<OfflineMetaRecord> = {}): OfflineMetaRecord {
  return {
    namespace: "dh1-1-abc",
    identityLabel: "owner@example.invalid",
    workspaceLabel: "Personal",
    snapshotVersion: 1,
    lastSyncedAt: "2026-08-02T00:00:00.000Z",
    window: {
      startIso: "2026-07-26",
      todayIso: "2026-08-02",
      endIso: "2026-08-09",
      timezone: "Australia/Sydney",
    },
    today: {
      dueTodayCount: 0,
      overdueCount: 0,
      upcomingCount: 0,
      completedRecentlyCount: 0,
      meetingsTodayCount: 0,
    },
    bounded: false,
    counts: {},
    ...overrides,
  };
}

describe("withDeadline", () => {
  it("resolves with the work when it finishes in time", async () => {
    await expect(
      withDeadline(Promise.resolve("done"), 50, () => "gave up"),
    ).resolves.toBe("done");
  });

  it("resolves with the fallback when the work NEVER settles", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const settled = withDeadline(never, 6_000, () => "gave up");
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(settled).resolves.toBe("gave up");
    vi.useRealTimers();
  });

  it("lets a genuine rejection through, because a failure is not a silence", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("broken")), 50, () => "gave up"),
    ).rejects.toThrow("broken");
  });
});

describe("openOfflineDatabase", () => {
  const original = globalThis.indexedDB;

  afterEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: original,
      configurable: true,
      writable: true,
    });
    vi.useRealTimers();
  });

  function stubIndexedDb(value: unknown): void {
    Object.defineProperty(globalThis, "indexedDB", {
      value,
      configurable: true,
      writable: true,
    });
  }

  it("reports storage as unavailable when the platform has none", async () => {
    stubIndexedDb(undefined);
    const result = await openOfflineDatabase();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("unavailable");
  });

  it("reports a TIMEOUT when the open fires no event at all", async () => {
    // The iOS behaviour, reproduced: `open` returns a request whose handlers are
    // never called. Before the deadline this hung forever; now it answers.
    stubIndexedDb({
      open: () => ({
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      }),
      deleteDatabase: () => ({
        onsuccess: null,
        onerror: null,
        onblocked: null,
      }),
    });

    vi.useFakeTimers();
    const opening = openOfflineDatabase({ timeoutMs: 6_000 });
    await vi.advanceTimersByTimeAsync(6_000);
    const result = await opening;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("timedOut");
  });

  it("never DELETES the database because it merely timed out", async () => {
    // Recovery deletes the offline database, and un-synced captures live there.
    // "It did not answer in time" is not evidence that it is broken.
    const deleteDatabase = vi.fn(() => ({
      onsuccess: null,
      onerror: null,
      onblocked: null,
    }));
    stubIndexedDb({
      open: () => ({
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      }),
      deleteDatabase,
    });

    vi.useFakeTimers();
    const opening = openOfflineDatabase({ timeoutMs: 6_000 });
    await vi.advanceTimersByTimeAsync(6_000);
    await opening;

    expect(deleteDatabase).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("the local state machine", () => {
  it("starts by checking, and that is the only unresolved value", () => {
    expect(isLocalStateResolved(OFFLINE_LOCAL_CHECKING)).toBe(false);
    const resolved: OfflineLocalState[] = [
      { kind: "empty" },
      { kind: "loaded", namespace: "n", lastSyncedAt: "2026-08-02" },
      { kind: "unavailable", reason: "no" },
      { kind: "unreadable", reason: "no" },
    ];
    for (const state of resolved)
      expect(isLocalStateResolved(state)).toBe(true);
  });

  it("maps every storage failure to a stated outcome", () => {
    const failures: OfflineDatabaseFailure[] = [
      { kind: "unavailable", message: "private mode" },
      { kind: "blocked", message: "another tab" },
      { kind: "newerSchema", message: "newer release" },
      { kind: "migrationFailed", message: "incomplete" },
      storageTimeoutFailure(),
    ];
    for (const failure of failures) {
      const state = localStateFromFailure(failure);
      expect(["unavailable", "unreadable"]).toContain(state.kind);
      expect(isLocalStateResolved(state)).toBe(true);
    }
  });

  it("separates 'this browser will not store' from 'this copy could not be read'", () => {
    expect(
      localStateFromFailure({ kind: "unavailable", message: "x" }).kind,
    ).toBe("unavailable");
    expect(
      localStateFromFailure({ kind: "migrationFailed", message: "x" }).kind,
    ).toBe("unreadable");
  });

  it("distinguishes a stored snapshot from none at all", () => {
    expect(localStateFromMeta(null)).toEqual({ kind: "empty" });
    expect(localStateFromMeta(meta())).toEqual({
      kind: "loaded",
      namespace: "dh1-1-abc",
      lastSyncedAt: "2026-08-02T00:00:00.000Z",
    });
  });

  it("gives every state copy that says what happened, not that it is waiting", () => {
    expect(
      localStateCopy({ kind: "loaded", namespace: "n", lastSyncedAt: "" })
        .title,
    ).toBe("Local snapshot loaded");
    expect(localStateCopy({ kind: "empty" }).title).toBe(
      "No local snapshot exists yet",
    );
    expect(localStateCopy({ kind: "unavailable", reason: "why" }).title).toBe(
      "Local storage is unavailable",
    );
    expect(localStateCopy({ kind: "unreadable", reason: "why" }).title).toBe(
      "Local data could not be read",
    );
    // Even the in-flight copy promises an end, because there now is one.
    expect(localStateCopy({ kind: "checking" }).description).toContain(
      "always finishes",
    );
  });

  it("carries the reason into the copy, so a failure is never mute", () => {
    expect(
      localStateCopy({ kind: "unreadable", reason: "The stores are missing." })
        .description,
    ).toBe("The stores are missing.");
  });
});

describe("captureAvailability", () => {
  it("is available only with a stored snapshot AND a namespace", () => {
    expect(
      captureAvailability({
        local: { kind: "loaded", namespace: "n", lastSyncedAt: "" },
        namespace: "n",
      }),
    ).toEqual({ kind: "available" });
  });

  it("is unavailable WITH A REASON for every other outcome", () => {
    const cases = [
      { local: { kind: "empty" } as const, namespace: null },
      {
        local: { kind: "unavailable", reason: "Storage is off." } as const,
        namespace: null,
      },
      {
        local: { kind: "unreadable", reason: "The stores are gone." } as const,
        namespace: null,
      },
      // A stored snapshot with no namespace: real, and the one case where the
      // form must explain itself rather than simply not appearing.
      {
        local: { kind: "loaded", namespace: "n", lastSyncedAt: "" } as const,
        namespace: null,
      },
    ];
    for (const input of cases) {
      const result = captureAvailability(input);
      expect(result.kind).toBe("unavailable");
      // Never an empty string and never a shrug: every refusal names a cause.
      if (result.kind === "unavailable") {
        expect(result.reason.trim().length).toBeGreaterThan(0);
        expect(result.reason).toMatch(/\.$/);
      }
    }
  });

  it("passes a storage failure's own reason through verbatim", () => {
    expect(
      captureAvailability({
        local: { kind: "unavailable", reason: "Storage is off." },
        namespace: null,
      }),
    ).toEqual({ kind: "unavailable", reason: "Storage is off." });
  });

  it("reports checking only while the read is genuinely in flight", () => {
    expect(
      captureAvailability({ local: { kind: "checking" }, namespace: null }),
    ).toEqual({ kind: "checking" });
  });
});
