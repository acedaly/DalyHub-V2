/**
 * PWA-12 — the offline Task mutation queue model.
 *
 * The queue's whole contract, proven without a browser, a network or a database:
 * enqueue, ordering, coalescing, retry, duplicate replay, conflict, permanent
 * failure, authentication pause, restart recovery and bounds. These are the
 * decisions everything above them is a shell around, so if this file is right the
 * remaining risk is wiring rather than logic.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_MAX_MUTATION_ATTEMPTS,
  OFFLINE_MAX_QUEUED_MUTATIONS,
  OFFLINE_MUTATION_LEASE_MS,
  applyMutationOutcome,
  beginMutationAttempt,
  checkMutationBounds,
  coalesceInto,
  createMutationRecord,
  fieldFor,
  findCoalesceTarget,
  isMutationReplayable,
  isStalledMutation,
  mutationDiagnostic,
  mutationRetryDelayMs,
  nextSequence,
  orderMutations,
  overrideMutation,
  reclaimStalledMutation,
  requeueMutation,
  selectReplayBatch,
  summariseMutations,
  type OfflineMutationOperation,
  type OfflineMutationRecord,
} from "~/kernel/offline";

const NS = "dh1-1-0123456789abcdef0123456789abcdef";
const T0 = new Date("2026-08-12T09:00:00.000Z");

let counter = 0;

function record(
  overrides: Partial<OfflineMutationRecord> & {
    readonly entityId?: string;
    readonly operation?: OfflineMutationOperation;
  } = {},
): OfflineMutationRecord {
  counter += 1;
  const base = createMutationRecord({
    namespace: NS,
    entityId: overrides.entityId ?? "task-1",
    operation: overrides.operation ?? "set_title",
    value: overrides.value ?? "Next",
    baseValue: overrides.baseValue ?? "Before",
    now: T0,
    sequence: overrides.sequence ?? counter,
    id: `key-${counter}`,
  });
  return { ...base, ...overrides };
}

describe("the mutation envelope", () => {
  it("carries the smallest safe representation and no secrets", () => {
    const created = createMutationRecord({
      namespace: NS,
      entityId: "task-1",
      operation: "set_title",
      value: "Book Hilux service",
      baseValue: "Service Hilux",
      baseUpdatedAt: "2026-08-12T08:00:00.000Z",
      now: T0,
      sequence: 1,
      id: "key-1",
    });

    // Everything the replay needs to identify the intent, and nothing else. In
    // particular: no session token, no CSRF token, and no copy of the Task.
    expect(Object.keys(created).sort()).toEqual([
      "attemptStartedAt",
      "attempts",
      "baseUpdatedAt",
      "baseValue",
      "conflict",
      "createdAt",
      "entityId",
      "entityType",
      "errorCategory",
      "id",
      "lastAttemptAt",
      "lastError",
      "namespace",
      "operation",
      "payloadVersion",
      "sequence",
      "status",
      "syncedAt",
      "value",
    ]);
    expect(created.status).toBe("pending");
    expect(created.attempts).toBe(0);
  });

  it("stores no value for a lifecycle operation", () => {
    // The operation IS the value. Storing one would invite a second way to say
    // "done", which is exactly how two sources of truth start.
    const completion = createMutationRecord({
      namespace: NS,
      entityId: "task-1",
      operation: "complete",
      value: "anything",
      now: T0,
      sequence: 1,
    });
    expect(completion.value).toBeNull();
  });

  it("names the one field each operation contends over", () => {
    expect(fieldFor("set_title")).toBe("title");
    expect(fieldFor("set_priority")).toBe("priority");
    expect(fieldFor("set_due")).toBe("dueDate");
    expect(fieldFor("set_planned")).toBe("scheduledDate");
    expect(fieldFor("complete")).toBe("completedAt");
    expect(fieldFor("reopen")).toBe("completedAt");
  });

  it("issues sequence numbers that do not depend on the device clock", () => {
    expect(nextSequence([])).toBe(1);
    expect(
      nextSequence([record({ sequence: 4 }), record({ sequence: 2 })]),
    ).toBe(5);
  });
});

describe("ordering", () => {
  it("preserves causal order for one task, whatever order the store returns", () => {
    const rename = record({ sequence: 1, operation: "set_title" });
    const priority = record({ sequence: 2, operation: "set_priority" });
    const due = record({ sequence: 3, operation: "set_due" });
    const complete = record({ sequence: 4, operation: "complete" });

    expect(
      orderMutations([complete, due, rename, priority]).map((r) => r.sequence),
    ).toEqual([1, 2, 3, 4]);
  });

  it("replays a task's mutations strictly in order", () => {
    const first = record({ entityId: "a", sequence: 1 });
    const second = record({
      entityId: "a",
      sequence: 2,
      operation: "complete",
    });
    const batch = selectReplayBatch([second, first], NS, T0, 10);
    expect(batch.map((r) => r.id)).toEqual([first.id, second.id]);
  });

  it("stops one task at its first record that is not ready, and no further", () => {
    // The rename conflicts. The completion that FOLLOWED it must not be applied
    // on top of a base the rename never established.
    const blocked = record({ entityId: "a", sequence: 1, status: "conflict" });
    const later = record({ entityId: "a", sequence: 2, operation: "complete" });
    expect(selectReplayBatch([blocked, later], NS, T0, 10)).toEqual([]);
  });

  it("lets an unrelated task replay past a stuck one", () => {
    // A single global serial queue would freeze the whole device behind one
    // record awaiting a decision. Correctness is per-task, so blocking is too.
    const stuck = record({ entityId: "a", sequence: 1, status: "failed" });
    const other = record({ entityId: "b", sequence: 2 });
    expect(
      selectReplayBatch([stuck, other], NS, T0, 10).map((r) => r.id),
    ).toEqual([other.id]);
  });

  it("never selects another identity's queued change", () => {
    const foreign = record({
      namespace: "dh1-1-ffffffffffffffffffffffffffffffff",
    });
    expect(selectReplayBatch([foreign], NS, T0, 10)).toEqual([]);
  });

  it("bounds a pass so it always terminates", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      record({ entityId: `task-${index}`, sequence: index + 1 }),
    );
    expect(selectReplayBatch(many, NS, T0, 5)).toHaveLength(5);
  });

  it("sends the oldest intent first across tasks", () => {
    const newer = record({ entityId: "b", sequence: 9 });
    const older = record({ entityId: "a", sequence: 2 });
    expect(
      selectReplayBatch([newer, older], NS, T0, 10).map((r) => r.id),
    ).toEqual([older.id, newer.id]);
  });
});

describe("coalescing", () => {
  it("folds a third unsent title edit into the first", () => {
    const first = record({ operation: "set_title", value: "Call Toyota" });
    const target = findCoalesceTarget([first], {
      entityId: "task-1",
      operation: "set_title",
    });
    expect(target?.id).toBe(first.id);

    const folded = coalesceInto(first, {
      value: "Call Toyota Dubbo",
      now: new Date("2026-08-12T09:05:00.000Z"),
    });
    // The intent moves on; the record's IDENTITY and its POSITION do not. The id
    // is the idempotency key and the sequence is causal order — neither is a
    // property of the value.
    expect(folded.id).toBe(first.id);
    expect(folded.sequence).toBe(first.sequence);
    expect(folded.baseValue).toBe(first.baseValue);
    expect(folded.value).toBe("Call Toyota Dubbo");
  });

  it("refuses to coalesce into a record that has already been attempted", () => {
    // The server may already hold a receipt under this key. Rewriting the payload
    // would make one key mean two mutations, which the receipt protocol cannot
    // survive.
    const attempted = record({ operation: "set_title", attempts: 1 });
    expect(
      findCoalesceTarget([attempted], {
        entityId: "task-1",
        operation: "set_title",
      }),
    ).toBeNull();
  });

  it("never coalesces completion or reopen", () => {
    const completion = record({ operation: "complete", sequence: 1 });
    expect(
      findCoalesceTarget([completion], {
        entityId: "task-1",
        operation: "complete",
      }),
    ).toBeNull();
  });

  it("does not let a later edit jump over an intervening completion", () => {
    // rename → complete → rename again. Folding the second rename into the first
    // would move it BEFORE the completion and silently reorder the owner's intent.
    const rename = record({ operation: "set_title", sequence: 1 });
    const complete = record({ operation: "complete", sequence: 2 });
    expect(
      findCoalesceTarget([rename, complete], {
        entityId: "task-1",
        operation: "set_title",
      }),
    ).toBeNull();
  });

  it("does not coalesce across different tasks or different fields", () => {
    const other = record({ entityId: "task-2", operation: "set_title" });
    expect(
      findCoalesceTarget([other], {
        entityId: "task-1",
        operation: "set_title",
      }),
    ).toBeNull();
    const priority = record({ operation: "set_priority" });
    expect(
      findCoalesceTarget([priority], {
        entityId: "task-1",
        operation: "set_title",
      }),
    ).toBeNull();
  });

  it("does not coalesce into a conflicted or failed record", () => {
    for (const status of [
      "conflict",
      "failed",
      "blocked",
      "syncing",
    ] as const) {
      expect(
        findCoalesceTarget([record({ operation: "set_title", status })], {
          entityId: "task-1",
          operation: "set_title",
        }),
      ).toBeNull();
    }
  });
});

describe("attempts, retries and interruption", () => {
  it("marks a record synced when the server applies it", () => {
    const settled = applyMutationOutcome(record(), { kind: "applied" }, T0);
    expect(settled.status).toBe("synced");
    expect(settled.syncedAt).toBe(T0.toISOString());
    expect(settled.attemptStartedAt).toBeNull();
  });

  it("backs off between automatic attempts, and stops after the budget", () => {
    expect(mutationRetryDelayMs(1)).toBe(1_000);
    expect(mutationRetryDelayMs(3)).toBe(4_000);
    expect(mutationRetryDelayMs(50)).toBe(30_000);

    let current = record();
    for (
      let attempt = 0;
      attempt < OFFLINE_MAX_MUTATION_ATTEMPTS;
      attempt += 1
    ) {
      current = applyMutationOutcome(
        current,
        { kind: "retryable", category: "network", reason: "no network" },
        T0,
      );
    }
    // Never retried forever: it becomes the owner's to look at.
    expect(current.status).toBe("failed");
    expect(current.attempts).toBe(OFFLINE_MAX_MUTATION_ATTEMPTS);
  });

  it("holds a record until its backoff has elapsed", () => {
    const tried = applyMutationOutcome(
      record(),
      { kind: "retryable", category: "network", reason: "no network" },
      T0,
    );
    expect(isMutationReplayable(tried, T0)).toBe(false);
    expect(isMutationReplayable(tried, new Date(T0.getTime() + 2_000))).toBe(
      true,
    );
  });

  it("recovers a change stranded by a tab that closed mid-request", () => {
    const inFlight = beginMutationAttempt(record(), T0);
    expect(isStalledMutation(inFlight, T0)).toBe(false);

    const later = new Date(T0.getTime() + OFFLINE_MUTATION_LEASE_MS);
    expect(isStalledMutation(inFlight, later)).toBe(true);

    const reclaimed = reclaimStalledMutation(inFlight, later);
    // Back in the queue, with the interruption RECORDED as an attempt — so a
    // change whose replay reliably kills this device eventually stops rather
    // than retrying for ever.
    expect(reclaimed.status).toBe("pending");
    expect(reclaimed.attempts).toBe(1);
    expect(reclaimed.errorCategory).toBe("interrupted");
    expect(reclaimed.attemptStartedAt).toBeNull();
    // The backoff runs from when the attempt STARTED, so the owner does not
    // serve a fresh delay on top of however long it was stranded.
    expect(isMutationReplayable(reclaimed, later)).toBe(true);
  });

  it("treats a record left `syncing` by an older release as stalled", () => {
    const legacy = {
      ...record(),
      status: "syncing" as const,
      attemptStartedAt: null,
    };
    expect(isStalledMutation(legacy, T0)).toBe(true);
  });

  it("resets the attempt budget when the OWNER chooses to retry", () => {
    const exhausted = { ...record(), attempts: 5, status: "failed" as const };
    const again = requeueMutation(exhausted);
    expect(again.status).toBe("pending");
    expect(again.attempts).toBe(0);
    // The IDENTITY is unchanged, so this is still the same mutation to the
    // server's receipt table and still cannot apply twice.
    expect(again.id).toBe(exhausted.id);
  });
});

describe("authentication expiry", () => {
  it("pauses rather than failing, and never spends a retry", () => {
    const blocked = applyMutationOutcome(
      record(),
      { kind: "blocked", reason: "Your DalyHub sign-in has expired." },
      T0,
    );
    expect(blocked.status).toBe("blocked");
    expect(blocked.errorCategory).toBe("auth");
    // Burning attempts on an expired session would eventually present valid work
    // as the owner's mistake.
    expect(blocked.attempts).toBe(0);
  });

  it("tries blocked work again once the pass runs, so a recovered sign-in resumes", () => {
    // §24 — resuming must not require the owner to press anything. DalyHub
    // cannot know the session recovered except by trying, and a rule that
    // admitted only `pending` would strand their work behind a Retry button
    // they were never told about.
    const blocked = applyMutationOutcome(
      record(),
      { kind: "blocked", reason: "expired" },
      T0,
    );
    const later = new Date(T0.getTime() + 5_000);
    expect(selectReplayBatch([blocked], NS, later, 10)).toHaveLength(1);
  });

  it("still stops a pass at the first blocked record", () => {
    // Trying again is cheap only because it is bounded: one identity-provider
    // redirect per pass, never one per queued record.
    const first = record({ entityId: "a", sequence: 1 });
    const second = record({ entityId: "b", sequence: 2 });
    const batch = selectReplayBatch([first, second], NS, T0, 10);
    expect(batch).toHaveLength(2);
    // The engine's own loop breaks on the first `blocked` outcome; this asserts
    // the SELECTION does not pre-empt that by excluding the rest.
    expect(batch.map((r) => r.entityId)).toEqual(["a", "b"]);
  });
});

describe("conflict state", () => {
  const conflicted = applyMutationOutcome(
    record({ value: "Mine", baseValue: "Original" }),
    {
      kind: "conflict",
      conflict: {
        field: "title",
        serverValue: "Theirs",
        message:
          "This task was renamed on another device while you were offline.",
      },
    },
    T0,
  );

  it("holds the owner's change and waits for a decision", () => {
    expect(conflicted.status).toBe("conflict");
    expect(conflicted.value).toBe("Mine");
    expect(conflicted.conflict?.serverValue).toBe("Theirs");
    // Never retried automatically: retrying would either loop against the same
    // base or silently overwrite the other device.
    expect(selectReplayBatch([conflicted], NS, T0, 10)).toEqual([]);
  });

  it("rebases onto the server's value when the owner keeps their change", () => {
    const kept = overrideMutation(conflicted);
    expect(kept.status).toBe("pending");
    expect(kept.value).toBe("Mine");
    // Without the rebase the next attempt detects the same conflict against the
    // same base and the change can never be sent.
    expect(kept.baseValue).toBe("Theirs");
    expect(kept.conflict).toBeNull();
  });
});

describe("permanent failure", () => {
  it("does not retry a change whose task was deleted elsewhere", () => {
    const gone = applyMutationOutcome(
      record(),
      { kind: "rejected", category: "gone", reason: "deleted" },
      T0,
    );
    expect(gone.status).toBe("failed");
    expect(gone.errorCategory).toBe("gone");
    expect(selectReplayBatch([gone], NS, T0, 10)).toEqual([]);
  });
});

describe("storage bounds", () => {
  it("accepts an ordinary change", () => {
    expect(
      checkMutationBounds({ value: "Book Hilux service", queuedCount: 3 }),
    ).toBeNull();
  });

  it("refuses truthfully at the queue bound rather than dropping the oldest", () => {
    const refusal = checkMutationBounds({
      value: "x",
      queuedCount: OFFLINE_MAX_QUEUED_MUTATIONS,
    });
    expect(refusal?.kind).toBe("queueFull");
    // The oldest change is the one the later ones were built on. Losing it
    // silently is worse than declining a new one out loud.
    expect(refusal?.message).toContain("Reconnect");
  });

  it("refuses a value larger than any the domain would accept", () => {
    expect(
      checkMutationBounds({ value: "x".repeat(2_000), queuedCount: 0 })?.kind,
    ).toBe("valueTooLarge");
  });
});

describe("summaries and diagnostics", () => {
  it("separates what is owed to the server from what is owed to the owner", () => {
    const summary = summariseMutations([
      record({ status: "pending" }),
      record({ status: "syncing" }),
      record({ status: "blocked" }),
      record({ status: "conflict" }),
      record({ status: "failed" }),
      record({ status: "synced" }),
    ]);
    expect(summary.outstanding).toBe(3);
    expect(summary.needsAttention).toBe(2);
    expect(summary.total).toBe(6);
  });

  it("logs the shape of a change and never its content", () => {
    const diagnostic = mutationDiagnostic(
      record({ value: "Dinner with Dr Patel about the biopsy", attempts: 2 }),
    );
    const serialised = JSON.stringify(diagnostic);
    expect(serialised).not.toContain("Patel");
    expect(serialised).not.toContain("biopsy");
    expect(diagnostic.operation).toBe("set_title");
    expect(diagnostic.attempts).toBe(2);
  });
});
