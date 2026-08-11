/**
 * PWA-12 — the Task mutation replay engine, driven over an in-memory store.
 *
 * The store is a double (there is no IndexedDB in this environment) but the
 * ENGINE is real: the selection, the leasing, the per-entity serialisation, the
 * classification of every answer a route can give, and the pass's own bounds.
 *
 * The classification tests are the ones that decide whether an owner's change is
 * retried, paused, queued for a decision or reported as permanently refused.
 * Getting the "unknown answer" direction wrong loses work, so the rule under test
 * is that anything DalyHub did not clearly reject is RETRYABLE.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMutationRecord,
  type OfflineMutationRecord,
} from "~/kernel/offline";

const NS = "dh1-1-0123456789abcdef0123456789abcdef";

/** The device's mutation queue, as a plain array the tests shape per case. */
const device: { mutations: OfflineMutationRecord[] } = { mutations: [] };

vi.mock("~/shared/offline/offline-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/shared/offline/offline-store")>();
  return {
    ...actual,
    readMutations: async (namespace: string) =>
      ({
        ok: true,
        value: device.mutations
          .filter((row) => row.namespace === namespace)
          .sort((a, b) => a.sequence - b.sequence),
      }) as const,
    putMutationRecord: async (record: OfflineMutationRecord) => {
      device.mutations = [
        ...device.mutations.filter((row) => row.id !== record.id),
        record,
      ];
      return { ok: true, value: record } as const;
    },
  };
});

vi.mock("~/shared/offline/probe", () => ({
  OFFLINE_PING_PATH: "/offline/ping",
  probeConnection: vi.fn(async () => "online" as const),
  browserThinksItIsOnline: () => true,
}));

const { classifyMutationResponse, mutationFormData, replayMutations } =
  await import("~/shared/offline/mutation-sync");

let counter = 0;

function queue(
  overrides: Partial<OfflineMutationRecord> & {
    readonly entityId?: string;
    readonly operation?: OfflineMutationRecord["operation"];
  } = {},
): OfflineMutationRecord {
  counter += 1;
  const record: OfflineMutationRecord = {
    ...createMutationRecord({
      namespace: NS,
      entityId: overrides.entityId ?? "task-1",
      operation: overrides.operation ?? "set_title",
      value: "Book Hilux service",
      baseValue: "Service Hilux",
      now: new Date("2026-08-12T09:00:00.000Z"),
      sequence: overrides.sequence ?? counter,
      id: `11111111-1111-4111-8111-${String(counter).padStart(12, "0")}`,
    }),
    ...overrides,
  };
  device.mutations.push(record);
  return record;
}

/** A JSON response, as the Task route produces one. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  device.mutations = [];
  counter = 0;
});

describe("what replay sends", () => {
  it("posts the canonical intent, never an offline-only verb", () => {
    const form = mutationFormData(queue({ operation: "set_title" }));
    expect(form.get("intent")).toBe("rename");
    expect(form.get("title")).toBe("Book Hilux service");
    // The three fields replay ADDS, and nothing else. No session token, no CSRF
    // token: replay travels on the ordinary same-origin credentials.
    expect(form.get("offlineOperation")).toBe("set_title");
    expect(form.get("offlineBase")).toBe("Service Hilux");
    expect(String(form.get("offlineKey"))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("carries the same idempotency key on every attempt", () => {
    const record = queue();
    expect(mutationFormData(record).get("offlineKey")).toBe(
      mutationFormData(record).get("offlineKey"),
    );
  });

  it("uses the planned date's own domain authority, both directions", () => {
    const set = mutationFormData(
      queue({ operation: "set_planned", value: "2026-08-20" }),
    );
    expect(set.get("intent")).toBe("plan");
    expect(set.get("scheduledDate")).toBe("2026-08-20");

    // Clearing a plan is a DIFFERENT canonical operation, not a field write of
    // the empty string (ADR-043 §3).
    const cleared = mutationFormData(
      queue({ operation: "set_planned", value: null }),
    );
    expect(cleared.get("intent")).toBe("clear_plan");
  });

  it("sends a cleared field as the empty string the route reads back as null", () => {
    const form = mutationFormData(
      queue({ operation: "set_priority", value: null }),
    );
    expect(form.get("intent")).toBe("update");
    expect(form.get("priority")).toBe("");
  });
});

describe("classifying the route's answer", () => {
  it("reads the server's own replay envelope as authoritative", async () => {
    expect(
      await classifyMutationResponse(
        jsonResponse({
          kind: "update",
          status: "success",
          offline: { kind: "applied", replayed: false },
        }),
      ),
    ).toEqual({ kind: "applied" });
  });

  it("treats an already-applied replay as a plain success", async () => {
    // The retry-after-a-lost-response case. It is a no-op, not a failure and not
    // a conflict.
    expect(
      await classifyMutationResponse(
        jsonResponse({
          kind: "completion",
          ok: true,
          offline: { kind: "applied", replayed: true },
        }),
      ),
    ).toEqual({ kind: "applied" });
  });

  it("surfaces a conflict with the field and the server's value", async () => {
    const outcome = await classifyMutationResponse(
      jsonResponse({
        kind: "update",
        status: "error",
        offline: {
          kind: "conflict",
          conflict: {
            field: "title",
            serverValue: "Hilux 100,000km service",
            message:
              "This task was renamed on another device while you were offline.",
          },
        },
      }),
    );
    expect(outcome.kind).toBe("conflict");
    if (outcome.kind !== "conflict") throw new Error("expected a conflict");
    expect(outcome.conflict.serverValue).toBe("Hilux 100,000km service");
  });

  it("retries when an earlier attempt at the same change may still be in flight", async () => {
    const outcome = await classifyMutationResponse(
      jsonResponse({
        kind: "update",
        status: "error",
        offline: { kind: "busy", message: "still going" },
      }),
    );
    expect(outcome).toEqual({
      kind: "retryable",
      category: "interrupted",
      reason: "still going",
    });
  });

  it("stops permanently when the task was deleted elsewhere", async () => {
    const outcome = await classifyMutationResponse(
      jsonResponse(
        {
          kind: "update",
          status: "error",
          offline: { kind: "gone", message: "This task was deleted." },
        },
        404,
      ),
    );
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") throw new Error("expected a rejection");
    expect(outcome.category).toBe("gone");
  });

  it("pauses rather than failing when the sign-in has expired", async () => {
    for (const status of [401, 403]) {
      expect(
        (await classifyMutationResponse(jsonResponse({}, status))).kind,
      ).toBe("blocked");
    }
    // Cloudflare Access answers with a cross-origin redirect, which `fetch`
    // surfaces as an opaque redirect rather than as a status.
    const opaque = { type: "opaqueredirect", status: 0 } as unknown as Response;
    expect((await classifyMutationResponse(opaque)).kind).toBe("blocked");
  });

  it("retries a server error rather than discarding the change", async () => {
    const outcome = await classifyMutationResponse(jsonResponse({}, 503));
    expect(outcome.kind).toBe("retryable");
  });

  it("retries when something that is not DalyHub answered", async () => {
    // A proxy's HTML error page. Discarding an owner's change because of this
    // would be the worst failure mode this classifier has.
    const html = new Response("<!doctype html><p>Gateway", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    expect((await classifyMutationResponse(html)).kind).toBe("retryable");
  });

  it("falls back to the route's own shape when no envelope is present", async () => {
    // A rolling deploy during an outage: an older Worker answers a replay.
    expect(
      await classifyMutationResponse(
        jsonResponse({ kind: "update", status: "success" }),
      ),
    ).toEqual({ kind: "applied" });
    const refused = await classifyMutationResponse(
      jsonResponse({ kind: "update", status: "error", formError: "Too long." }),
    );
    expect(refused).toEqual({
      kind: "rejected",
      category: "invalid",
      reason: "Too long.",
    });
  });
});

describe("a replay pass", () => {
  const applied = () =>
    jsonResponse({
      kind: "update",
      status: "success",
      offline: { kind: "applied", replayed: false },
    });

  it("costs zero requests when nothing is queued", async () => {
    const fetchImpl = vi.fn(async () => applied()) as unknown as typeof fetch;
    const pass = await replayMutations({ namespace: NS, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(pass.attempted).toBe(0);
  });

  it("posts each change to the canonical record route and marks it synced", async () => {
    queue({ entityId: "task-7" });
    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return applied();
    }) as unknown as typeof fetch;

    const pass = await replayMutations({ namespace: NS, fetchImpl });
    expect(urls).toEqual(["/tasks/task-7"]);
    expect(pass.synced).toBe(1);
    expect(device.mutations[0].status).toBe("synced");
  });

  it("sends one task's changes serially, in the owner's order", async () => {
    queue({ entityId: "a", sequence: 1, operation: "set_title" });
    queue({ entityId: "a", sequence: 2, operation: "set_priority" });
    queue({ entityId: "a", sequence: 3, operation: "complete" });

    const intents: string[] = [];
    const fetchImpl = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      intents.push(String((init?.body as FormData).get("intent")));
      return applied();
    }) as unknown as typeof fetch;

    await replayMutations({ namespace: NS, fetchImpl });
    // Never "complete an older representation, then overwrite the title with
    // stale data": the completion goes last because the owner did it last.
    expect(intents).toEqual(["rename", "update", "complete"]);
  });

  it("abandons a task's LATER changes when an earlier one does not succeed", async () => {
    queue({ entityId: "a", sequence: 1, operation: "set_title" });
    queue({ entityId: "a", sequence: 2, operation: "complete" });

    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({
        kind: "update",
        status: "error",
        offline: {
          kind: "conflict",
          conflict: {
            field: "title",
            serverValue: "Renamed elsewhere",
            message:
              "This task was renamed on another device while you were offline.",
          },
        },
      });
    }) as unknown as typeof fetch;

    const pass = await replayMutations({ namespace: NS, fetchImpl });
    // The completion is NOT sent. Applying it now would apply the owner's later
    // intent on top of a base their earlier intent never established.
    expect(calls).toBe(1);
    expect(pass.conflicts).toBe(1);
    expect(pass.raised).toHaveLength(1);
    expect(
      device.mutations.find((row) => row.operation === "complete")?.status,
    ).toBe("pending");
  });

  it("lets an unrelated task's change through while one task is stuck", async () => {
    queue({ entityId: "a", sequence: 1, operation: "set_title" });
    queue({ entityId: "b", sequence: 2, operation: "set_priority" });

    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return String(input).endsWith("/task-a")
        ? jsonResponse({}, 503)
        : applied();
    }) as unknown as typeof fetch;

    // Ids are `task-1`-shaped by default; name them explicitly for this case.
    device.mutations = device.mutations.map((row) => ({
      ...row,
      entityId: row.entityId === "a" ? "task-a" : "task-b",
    }));

    const pass = await replayMutations({ namespace: NS, fetchImpl });
    expect(urls).toEqual(["/tasks/task-a", "/tasks/task-b"]);
    expect(pass.synced).toBe(1);
  });

  it("stops the whole pass the moment the sign-in has expired", async () => {
    queue({ entityId: "a", sequence: 1 });
    queue({ entityId: "b", sequence: 2 });

    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({}, 401);
    }) as unknown as typeof fetch;

    const pass = await replayMutations({ namespace: NS, fetchImpl });
    // One redirect to the identity provider, not one per queued record.
    expect(calls).toBe(1);
    expect(pass.blocked).toBe(1);
    expect(pass.connection).toBe("authRequired");
    // Nothing is discarded. The work waits for a valid session.
    expect(device.mutations).toHaveLength(2);
  });

  it("keeps a change when this device cannot reach DalyHub at all", async () => {
    queue();
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const pass = await replayMutations({ namespace: NS, fetchImpl });
    expect(pass.synced).toBe(0);
    expect(device.mutations[0].status).toBe("pending");
    expect(device.mutations[0].errorCategory).toBe("network");
  });

  it("never sends another identity's queued change", async () => {
    queue({ namespace: "dh1-1-ffffffffffffffffffffffffffffffff" });
    const fetchImpl = vi.fn(async () => applied()) as unknown as typeof fetch;
    await replayMutations({ namespace: NS, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("leases each attempt so an interruption is recoverable", async () => {
    queue();
    let observed: string | null = null;
    const fetchImpl = (async () => {
      // Read the persisted record MID-flight: it must already say an attempt is
      // running, or a tab closed here would strand it forever.
      observed = device.mutations[0].attemptStartedAt;
      return applied();
    }) as unknown as typeof fetch;

    await replayMutations({ namespace: NS, fetchImpl });
    expect(observed).not.toBeNull();
    // And the lease is released on the way out, whatever happened.
    expect(device.mutations[0].attemptStartedAt).toBeNull();
  });

  it("bounds one pass", async () => {
    for (let index = 0; index < 20; index += 1) {
      queue({ entityId: `task-${index}`, sequence: index + 1 });
    }
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return applied();
    }) as unknown as typeof fetch;

    const pass = await replayMutations({
      namespace: NS,
      fetchImpl,
      batchSize: 4,
    });
    expect(calls).toBe(4);
    expect(pass.attempted).toBe(4);
  });
});
