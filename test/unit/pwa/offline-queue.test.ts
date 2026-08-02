/**
 * PWA-05 — the capture queue's state machine.
 *
 * The queue holds work that exists ONLY on the device, so the properties tested
 * here are the ones whose failure loses an owner's capture or duplicates it:
 * identifiers are collision-safe, a blocked sign-in does not burn the retry
 * budget, nothing is ever silently dropped, and a record is never replayable
 * under a namespace it does not belong to.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_ATTEMPT_LEASE_MS,
  OFFLINE_CAPTURE_PAYLOAD_VERSION,
  OFFLINE_MAX_AUTOMATIC_ATTEMPTS,
  applyReplayOutcome,
  beginReplayAttempt,
  createQueueRecord,
  isOfflineCaptureKind,
  isReplayable,
  isStalledAttempt,
  newCaptureId,
  reclaimStalledAttempt,
  retryDelayMs,
  summariseQueue,
  type OfflineQueueRecord,
} from "~/kernel/offline";

const NAMESPACE = "dh1-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_NAMESPACE = "dh1-1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = new Date("2026-08-02T09:00:00.000Z");

function queued(
  overrides: Partial<OfflineQueueRecord> = {},
): OfflineQueueRecord {
  return {
    ...createQueueRecord({
      namespace: NAMESPACE,
      payload: { kind: "task", title: "Buy milk", dueDate: null },
      now: NOW,
      id: "11111111-1111-4111-8111-111111111111",
    }),
    ...overrides,
  };
}

describe("createQueueRecord", () => {
  it("records everything needed to explain the capture later", () => {
    const record = queued();
    expect(record.namespace).toBe(NAMESPACE);
    expect(record.kind).toBe("task");
    expect(record.payloadVersion).toBe(OFFLINE_CAPTURE_PAYLOAD_VERSION);
    expect(record.createdAt).toBe(NOW.toISOString());
    expect(record.queuedAt).toBe(NOW.toISOString());
    expect(record.status).toBe("pending");
    expect(record.attempts).toBe(0);
    expect(record.lastError).toBeNull();
    expect(record.serverId).toBeNull();
    expect(record.attemptStartedAt).toBeNull();
  });
});

describe("newCaptureId", () => {
  it("uses the platform UUID generator when available", () => {
    const id = newCaptureId({
      randomUUID: () => "22222222-2222-4222-8222-222222222222",
      getRandomValues: () => {
        throw new Error("should not be reached");
      },
    } as unknown as Crypto);
    expect(id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("falls back to a well-formed v4 UUID from getRandomValues", () => {
    const id = newCaptureId({
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    } as unknown as Crypto);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("refuses to invent an identifier without a secure random source", () => {
    expect(() => newCaptureId({} as unknown as Crypto)).toThrow(
      /secure random source/i,
    );
  });
});

describe("applyReplayOutcome", () => {
  const later = new Date("2026-08-02T09:05:00.000Z");

  it("records the server id on success", () => {
    const result = applyReplayOutcome(
      queued(),
      { kind: "created", recordId: "task-1" },
      later,
    );
    expect(result.status).toBe("synced");
    expect(result.serverId).toBe("task-1");
    expect(result.syncedAt).toBe(later.toISOString());
    expect(result.lastError).toBeNull();
  });

  it("does NOT consume a retry attempt when the sign-in has expired", () => {
    // A blocked capture is not the owner's mistake. Burning attempts on an
    // expired session would eventually present valid work as failed.
    const result = applyReplayOutcome(
      queued({ attempts: 2 }),
      { kind: "blocked", reason: "Your DalyHub sign-in has expired." },
      later,
    );
    expect(result.status).toBe("blocked");
    expect(result.attempts).toBe(2);
    expect(result.lastError).toMatch(/sign-in has expired/);
  });

  it("keeps a rejected capture with its reason instead of discarding it", () => {
    const result = applyReplayOutcome(
      queued(),
      { kind: "rejected", reason: "Give it a title." },
      later,
    );
    expect(result.status).toBe("failed");
    expect(result.lastError).toBe("Give it a title.");
    expect(result.serverId).toBeNull();
  });

  it("retries a transient failure until the attempt budget is spent", () => {
    let record = queued();
    for (
      let attempt = 1;
      attempt < OFFLINE_MAX_AUTOMATIC_ATTEMPTS;
      attempt += 1
    ) {
      record = applyReplayOutcome(
        record,
        { kind: "retryable", reason: "offline" },
        later,
      );
      expect(record.status).toBe("pending");
    }
    record = applyReplayOutcome(
      record,
      { kind: "retryable", reason: "offline" },
      later,
    );
    // Still present, with its reason — never dropped.
    expect(record.status).toBe("failed");
    expect(record.attempts).toBe(OFFLINE_MAX_AUTOMATIC_ATTEMPTS);
    expect(record.lastError).toBe("offline");
  });
});

describe("isReplayable", () => {
  it("refuses a record belonging to another identity or workspace", () => {
    const foreign = queued({ namespace: OTHER_NAMESPACE });
    expect(isReplayable(foreign, NAMESPACE, NOW)).toBe(false);
  });

  it("replays a fresh pending record immediately", () => {
    expect(isReplayable(queued(), NAMESPACE, NOW)).toBe(true);
  });

  it("waits out the backoff after a failed attempt", () => {
    const record = queued({
      attempts: 3,
      lastAttemptAt: NOW.toISOString(),
    });
    const tooSoon = new Date(NOW.getTime() + retryDelayMs(3) - 1);
    const dueNow = new Date(NOW.getTime() + retryDelayMs(3));
    expect(isReplayable(record, NAMESPACE, tooSoon)).toBe(false);
    expect(isReplayable(record, NAMESPACE, dueNow)).toBe(true);
  });

  it("never automatically replays a blocked, failed or synced record", () => {
    for (const status of ["blocked", "failed", "synced", "syncing"] as const) {
      expect(isReplayable(queued({ status }), NAMESPACE, NOW)).toBe(false);
    }
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially and stops at a bounded ceiling", () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(3)).toBe(4_000);
    expect(retryDelayMs(20)).toBe(30_000);
  });
});

describe("summariseQueue", () => {
  it("tallies every status", () => {
    const summary = summariseQueue([
      queued({ id: "a", status: "pending" }),
      queued({ id: "b", status: "pending" }),
      queued({ id: "c", status: "failed" }),
      queued({ id: "d", status: "blocked" }),
      queued({ id: "e", status: "synced" }),
    ]);
    expect(summary).toEqual({
      pending: 2,
      syncing: 0,
      synced: 1,
      failed: 1,
      blocked: 1,
      total: 5,
    });
  });
});

describe("the supported capture kinds are a closed set", () => {
  it("accepts only task, note and diary", () => {
    expect(isOfflineCaptureKind("task")).toBe(true);
    expect(isOfflineCaptureKind("note")).toBe(true);
    expect(isOfflineCaptureKind("diary")).toBe(true);
    // Everything else is an UNSUPPORTED offline action by construction.
    expect(isOfflineCaptureKind("project")).toBe(false);
    expect(isOfflineCaptureKind("meeting")).toBe(false);
    expect(isOfflineCaptureKind("delete")).toBe(false);
    expect(isOfflineCaptureKind(undefined)).toBe(false);
  });
});

describe("an interrupted replay attempt", () => {
  const inFlight = beginReplayAttempt(queued(), NOW);

  it("is marked syncing with its lease stamped, so it can be recognised later", () => {
    expect(inFlight.status).toBe("syncing");
    expect(inFlight.attemptStartedAt).toBe(NOW.toISOString());
  });

  it("is not stalled while the lease holds", () => {
    const during = new Date(NOW.getTime() + OFFLINE_ATTEMPT_LEASE_MS - 1);
    expect(isStalledAttempt(inFlight, during)).toBe(false);
  });

  it("is stalled once the lease has expired", () => {
    const after = new Date(NOW.getTime() + OFFLINE_ATTEMPT_LEASE_MS);
    expect(isStalledAttempt(inFlight, after)).toBe(true);
  });

  it("is stalled when the record predates the lease field entirely", () => {
    // The ONLY way to be `syncing` with no lease is to have been written by the
    // version that could strand a capture, so this must be recoverable.
    const legacy = queued({ status: "syncing", attemptStartedAt: null });
    expect(isStalledAttempt(legacy, NOW)).toBe(true);
  });

  it("is never confused with a record that is not syncing", () => {
    expect(isStalledAttempt(queued({ status: "pending" }), NOW)).toBe(false);
    expect(isStalledAttempt(queued({ status: "failed" }), NOW)).toBe(false);
    expect(isStalledAttempt(queued({ status: "blocked" }), NOW)).toBe(false);
    expect(isStalledAttempt(queued({ status: "synced" }), NOW)).toBe(false);
  });

  it("is NOT automatically replayable while it still says syncing", () => {
    // Reclaiming has to happen first, so the interruption is counted as an
    // attempt and shown to the owner instead of being replayed invisibly.
    const after = new Date(NOW.getTime() + OFFLINE_ATTEMPT_LEASE_MS);
    expect(isReplayable(inFlight, NAMESPACE, after)).toBe(false);
  });
});

describe("reclaiming a stalled attempt", () => {
  const after = new Date(NOW.getTime() + OFFLINE_ATTEMPT_LEASE_MS);
  const reclaimed = reclaimStalledAttempt(
    beginReplayAttempt(queued(), NOW),
    after,
  );

  it("returns the capture to the queue, so it is never stranded", () => {
    expect(reclaimed.status).toBe("pending");
    expect(reclaimed.attemptStartedAt).toBeNull();
  });

  it("counts the interruption as an attempt and explains it to the owner", () => {
    expect(reclaimed.attempts).toBe(1);
    expect(reclaimed.lastError).toMatch(/interrupted/i);
  });

  it("dates the attempt from when it STARTED, not from the recovery", () => {
    // Otherwise the owner serves a fresh backoff on top of however long the
    // capture was already stranded, and the pass that reclaims a record can
    // never be the pass that replays it.
    expect(reclaimed.lastAttemptAt).toBe(NOW.toISOString());
  });

  it("is replayable immediately, because its backoff is long past", () => {
    expect(isReplayable(reclaimed, NAMESPACE, after)).toBe(true);
    expect(retryDelayMs(reclaimed.attempts)).toBeLessThan(
      OFFLINE_ATTEMPT_LEASE_MS,
    );
  });

  it("falls back to the recovery instant when the record has no lease at all", () => {
    const legacy = queued({
      status: "syncing",
      attemptStartedAt: null,
      lastAttemptAt: null,
    });
    expect(reclaimStalledAttempt(legacy, after).lastAttemptAt).toBe(
      after.toISOString(),
    );
  });

  it("stops retrying a capture that reliably interrupts this device", () => {
    let record = queued();
    for (
      let attempt = 0;
      attempt < OFFLINE_MAX_AUTOMATIC_ATTEMPTS;
      attempt += 1
    ) {
      record = reclaimStalledAttempt(beginReplayAttempt(record, NOW), after);
    }
    // Not discarded — surfaced, so the owner decides.
    expect(record.status).toBe("failed");
    expect(record.payload).toEqual(queued().payload);
  });
});

describe("every replay outcome releases the attempt lease", () => {
  const inFlight = beginReplayAttempt(queued(), NOW);

  it.each([
    ["created", { kind: "created", recordId: "task-1" }] as const,
    ["blocked", { kind: "blocked", reason: "Signed out." }] as const,
    ["rejected", { kind: "rejected", reason: "Too long." }] as const,
    ["retryable", { kind: "retryable", reason: "Unreachable." }] as const,
  ])("clears it on a %s outcome", (_label, outcome) => {
    const applied = applyReplayOutcome(inFlight, outcome, NOW);
    expect(applied.attemptStartedAt).toBeNull();
    expect(
      isStalledAttempt(applied, new Date(NOW.getTime() + 86_400_000)),
    ).toBe(false);
  });
});
