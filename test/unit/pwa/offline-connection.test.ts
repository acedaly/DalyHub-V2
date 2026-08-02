/**
 * PWA-03 — connection classification and sync state.
 *
 * The single most consequential branch in the whole milestone is here: telling
 * "you are offline" apart from "your Cloudflare Access session expired". Both
 * present to `fetch` as a failure to get a normal response, and showing the wrong
 * one sends the owner to fix the wrong problem.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_SNAPSHOT_STALE_AFTER_MS,
  canReachBackend,
  classifyProbe,
  connectionStateDescription,
  connectionStateLabel,
  deriveSyncState,
  isSnapshotStale,
  shouldPauseSync,
  syncStateLabel,
  type OfflineConnectionState,
} from "~/kernel/offline";

function response(
  status: number,
  options: { type?: string; authenticated?: boolean } = {},
) {
  return classifyProbe({
    kind: "response",
    status,
    type: options.type ?? "basic",
    authenticated: options.authenticated ?? false,
  });
}

describe("classifyProbe", () => {
  it("treats a request that never completed as offline", () => {
    expect(classifyProbe({ kind: "networkError" })).toBe("offline");
  });

  it("treats DalyHub's own authenticated 200 as online", () => {
    expect(response(200, { authenticated: true })).toBe("online");
  });

  it("does NOT trust a 200 that DalyHub did not mark", () => {
    // A captive portal, a proxy, or a cached Access challenge page can all
    // answer 200. Without the Worker's marker, this is not a working session.
    expect(response(200, { authenticated: false })).toBe("authRequired");
  });

  it("recognises an Access redirect as a sign-in problem, not an outage", () => {
    expect(response(0, { type: "opaqueredirect" })).toBe("authRequired");
    expect(response(302)).toBe("authRequired");
    expect(response(0)).toBe("authRequired");
  });

  it("recognises DalyHub's own auth failures", () => {
    expect(response(401)).toBe("authRequired");
    expect(response(403)).toBe("authRequired");
  });

  it("separates a reachable-but-unhealthy backend from both of the above", () => {
    // Access is fine and the network is fine; the Worker or D1 is not. Queued
    // work must be retried, not blocked on a sign-in that is already valid.
    expect(response(500)).toBe("backendUnavailable");
    expect(response(503)).toBe("backendUnavailable");
  });

  it("counts a non-auth 4xx as reachable — the backend answered", () => {
    expect(response(404)).toBe("online");
  });
});

describe("what each state permits", () => {
  it("only allows server work when the session is genuinely usable", () => {
    expect(canReachBackend("online")).toBe(true);
    for (const state of [
      "offline",
      "reconnecting",
      "authRequired",
      "backendUnavailable",
    ] as const) {
      expect(canReachBackend(state)).toBe(false);
    }
  });

  it("pauses syncing ONLY for an expired sign-in", () => {
    // Every other unhealthy state may recover on its own, so retrying is
    // useful. An expired Access session cannot, and every retry is another
    // redirect to the identity provider.
    expect(shouldPauseSync("authRequired")).toBe(true);
    expect(shouldPauseSync("offline")).toBe(false);
    expect(shouldPauseSync("backendUnavailable")).toBe(false);
  });
});

describe("state presentation", () => {
  const states: readonly OfflineConnectionState[] = [
    "online",
    "offline",
    "reconnecting",
    "authRequired",
    "backendUnavailable",
  ];

  it("gives every state a distinct text label, so colour is never the only signal", () => {
    const labels = states.map(connectionStateLabel);
    expect(new Set(labels).size).toBe(states.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });

  it("explains every state in one sentence the owner can act on", () => {
    for (const state of states) {
      expect(connectionStateDescription(state).length).toBeGreaterThan(20);
    }
  });

  it("tells the owner their queued work is safe when the sign-in expires", () => {
    expect(connectionStateDescription("authRequired")).toMatch(/safe/i);
  });
});

describe("deriveSyncState", () => {
  const base = {
    busy: false,
    hasSnapshot: true,
    pendingCaptures: 0,
    failedCaptures: 0,
  };

  it("says so plainly when nothing has ever been stored", () => {
    expect(deriveSyncState({ ...base, hasSnapshot: false })).toBe("never");
  });

  it("reports work in progress above everything else", () => {
    expect(deriveSyncState({ ...base, busy: true, failedCaptures: 3 })).toBe(
      "syncing",
    );
  });

  it("surfaces a failure ahead of merely pending work", () => {
    expect(
      deriveSyncState({ ...base, pendingCaptures: 2, failedCaptures: 1 }),
    ).toBe("failed");
  });

  it("is up to date only when there is a snapshot and nothing queued", () => {
    expect(deriveSyncState(base)).toBe("upToDate");
    expect(deriveSyncState({ ...base, pendingCaptures: 1 })).toBe("pending");
  });

  it("labels every sync state distinctly", () => {
    const labels = (
      ["upToDate", "syncing", "pending", "failed", "never"] as const
    ).map(syncStateLabel);
    expect(new Set(labels).size).toBe(5);
  });
});

describe("isSnapshotStale", () => {
  const now = new Date("2026-08-02T00:00:00.000Z");

  it("is not stale when nothing has ever been synced (there is a different message for that)", () => {
    expect(isSnapshotStale(null, now)).toBe(false);
  });

  it("is fresh inside the staleness horizon and stale on it", () => {
    const fresh = new Date(
      now.getTime() - OFFLINE_SNAPSHOT_STALE_AFTER_MS + 1_000,
    ).toISOString();
    const old = new Date(
      now.getTime() - OFFLINE_SNAPSHOT_STALE_AFTER_MS,
    ).toISOString();
    expect(isSnapshotStale(fresh, now)).toBe(false);
    expect(isSnapshotStale(old, now)).toBe(true);
  });

  it("treats an unreadable timestamp as stale rather than as fresh", () => {
    expect(isSnapshotStale("not-a-timestamp", now)).toBe(true);
  });
});
