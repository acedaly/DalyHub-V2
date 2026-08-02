/**
 * PWA-04 / PWA-05 — data minimisation, the Today derivation, and how a create
 * route's answer becomes a replay outcome.
 *
 * The classification test is the one that decides whether an owner's capture is
 * retried, paused or reported as failed. Getting it wrong in the "unknown
 * answer" direction discards work; the rule is that anything DalyHub did not
 * clearly reject is RETRYABLE.
 */

import { describe, expect, it } from "vitest";

import { OFFLINE_EXCERPT_LIMIT, toExcerpt } from "~/kernel/offline";
import { summariseToday } from "~/platform/offline";
import type { OfflineMeeting, OfflineTask } from "~/kernel/offline";
import { offlineWindow } from "~/kernel/offline";
import {
  captureFormData,
  classifyCreateResponse,
  replayQueue,
} from "~/shared/offline/sync";
import {
  OFFLINE_CAPTURE_IN_PROGRESS,
  createQueueRecord,
} from "~/kernel/offline";

const SYDNEY = "Australia/Sydney";
const WINDOW = offlineWindow("2026-08-02", SYDNEY);

function task(overrides: Partial<OfflineTask>): OfflineTask {
  return {
    id: "t",
    title: "Task",
    status: "open",
    priority: null,
    timeSector: null,
    dueDate: null,
    scheduledDate: null,
    completedAt: null,
    updatedAt: "2026-08-02T00:00:00.000Z",
    parentId: null,
    parentLabel: null,
    waiting: false,
    ...overrides,
  };
}

describe("toExcerpt — data minimisation", () => {
  it("keeps short text whole and reports it untruncated", () => {
    const { excerpt, truncated } = toExcerpt("A short note.");
    expect(excerpt).toBe("A short note.");
    expect(truncated).toBe(false);
  });

  it("collapses whitespace so the stored excerpt is what is rendered", () => {
    expect(toExcerpt("  many\n\n  spaces  ").excerpt).toBe("many spaces");
  });

  it("bounds long text and SAYS it was bounded", () => {
    const long = "word ".repeat(500);
    const { excerpt, truncated } = toExcerpt(long);
    expect(truncated).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(OFFLINE_EXCERPT_LIMIT);
    // Never mid-word when a sensible break exists.
    expect(excerpt.endsWith("word")).toBe(true);
  });

  it("treats an absent body as empty rather than as the string 'null'", () => {
    expect(toExcerpt(null)).toEqual({ excerpt: "", truncated: false });
    expect(toExcerpt(undefined)).toEqual({ excerpt: "", truncated: false });
  });
});

describe("summariseToday", () => {
  const meetings: readonly OfflineMeeting[] = [
    {
      id: "m1",
      title: "Standup",
      // 09:00 Sydney on 2 August is 23:00 UTC on 1 August: a UTC-based count
      // would put this meeting on the wrong day.
      startsAt: "2026-08-01T23:00:00.000Z",
      heldAt: null,
      attendeeLabels: [],
    },
    {
      id: "m2",
      title: "Next week",
      startsAt: "2026-08-06T01:00:00.000Z",
      heldAt: null,
      attendeeLabels: [],
    },
  ];

  it("buckets open tasks by their owner-calendar planning date", () => {
    const summary = summariseToday(
      [
        task({ id: "a", scheduledDate: "2026-07-30" }), // overdue
        task({ id: "b", dueDate: "2026-08-02" }), // today
        task({ id: "c", scheduledDate: "2026-08-05" }), // upcoming
        task({ id: "d" }), // unplanned: counted in none of the three
        task({
          id: "e",
          status: "completed",
          completedAt: "2026-08-01T02:00:00.000Z",
        }),
      ],
      meetings,
      WINDOW,
      SYDNEY,
    );
    expect(summary).toEqual({
      overdueCount: 1,
      dueTodayCount: 1,
      upcomingCount: 1,
      completedRecentlyCount: 1,
      meetingsTodayCount: 1,
    });
  });

  it("prefers the scheduled date over the due date, as the planning views do", () => {
    const summary = summariseToday(
      [task({ dueDate: "2026-07-01", scheduledDate: "2026-08-02" })],
      [],
      WINDOW,
      SYDNEY,
    );
    expect(summary.dueTodayCount).toBe(1);
    expect(summary.overdueCount).toBe(0);
  });
});

describe("captureFormData", () => {
  const now = new Date("2026-08-02T00:00:00.000Z");

  it("always sends the queue id as the idempotency key", () => {
    const record = createQueueRecord({
      namespace: "ns",
      payload: { kind: "task", title: "Buy milk", dueDate: "2026-08-03" },
      now,
      id: "33333333-3333-4333-8333-333333333333",
    });
    const form = captureFormData(record);
    expect(form.get("idempotencyKey")).toBe(record.id);
    expect(form.get("title")).toBe("Buy milk");
    expect(form.get("dueDate")).toBe("2026-08-03");
  });

  it("sends the diary entry type", () => {
    const record = createQueueRecord({
      namespace: "ns",
      payload: { kind: "diary", title: "A moment", entryType: "note" },
      now,
      id: "44444444-4444-4444-8444-444444444444",
    });
    expect(captureFormData(record).get("entryType")).toBe("note");
  });

  it("sends nothing a note capture does not have", () => {
    const record = createQueueRecord({
      namespace: "ns",
      payload: { kind: "note", title: "Thought" },
      now,
      id: "55555555-5555-4555-8555-555555555555",
    });
    const form = captureFormData(record);
    expect([...form.keys()].sort()).toEqual(["idempotencyKey", "title"]);
  });
});

describe("classifyCreateResponse", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  it("recognises a created task, note and diary entry", async () => {
    expect(
      await classifyCreateResponse(json({ ok: true, taskId: "t1" })),
    ).toEqual({ kind: "created", recordId: "t1" });
    expect(
      await classifyCreateResponse(json({ ok: true, noteId: "n1" })),
    ).toEqual({ kind: "created", recordId: "n1" });
    expect(
      await classifyCreateResponse(json({ ok: true, entryId: "d1" })),
    ).toEqual({ kind: "created", recordId: "d1" });
  });

  it("blocks — never fails — on an expired sign-in", async () => {
    for (const status of [401, 403]) {
      const outcome = await classifyCreateResponse(
        new Response("", { status }),
      );
      expect(outcome.kind).toBe("blocked");
    }
  });

  it("retries a server fault rather than reporting the owner's capture as bad", async () => {
    const outcome = await classifyCreateResponse(
      new Response("", { status: 503 }),
    );
    expect(outcome.kind).toBe("retryable");
  });

  it("waits, rather than failing, when an earlier attempt may still be running", async () => {
    // The commonest network failure there is: the request was sent, the answer
    // never arrived, the client asked again — and the server is still holding the
    // first attempt's claim. Reporting the owner's capture as permanently failed
    // here would be wrong; asking again in a moment is right.
    const outcome = await classifyCreateResponse(
      json({ ok: false, formError: OFFLINE_CAPTURE_IN_PROGRESS }),
    );
    expect(outcome).toEqual({
      kind: "retryable",
      reason: OFFLINE_CAPTURE_IN_PROGRESS,
    });
  });

  it("reports a real validation rejection with the server's own message", async () => {
    const outcome = await classifyCreateResponse(
      json({ ok: false, fieldErrors: { title: "Give it a title." } }),
    );
    expect(outcome).toEqual({ kind: "rejected", reason: "Give it a title." });
  });

  it("prefers a form-level error message when there is one", async () => {
    const outcome = await classifyCreateResponse(
      json({ ok: false, formError: "That Project is no longer available." }),
    );
    expect(outcome).toEqual({
      kind: "rejected",
      reason: "That Project is no longer available.",
    });
  });

  it("RETRIES an answer it does not understand instead of discarding work", async () => {
    // A proxy's HTML error page, a captive portal, a truncated body. Treating
    // any of these as a rejection would throw away an owner's capture.
    const outcome = await classifyCreateResponse(
      new Response("<html>gateway error</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(outcome.kind).toBe("retryable");
  });
});

describe("the request budget of a sync pass", () => {
  it("costs ZERO requests when there is nothing queued", async () => {
    // The overwhelmingly common case. Probing before knowing whether there is
    // work spends a round trip to discover there is none — and every request the
    // provider makes is one that can be in flight when the page navigates away.
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error("no request should have been made");
    }) as unknown as typeof fetch;

    const result = await replayQueue({
      namespace: "dh1-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fetchImpl,
    });

    expect(calls).toEqual([]);
    expect(result.attempted).toBe(0);
    expect(result.synced).toBe(0);
  });

  it("accepts a connection the caller already established", async () => {
    // The sync pass has just fetched a snapshot, which carries the same
    // authentication marker a probe would. Re-probing would be a second round
    // trip for an answer already in hand.
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error("no request should have been made");
    }) as unknown as typeof fetch;

    const result = await replayQueue({
      namespace: "dh1-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fetchImpl,
      connection: "online",
    });

    expect(calls).toEqual([]);
    expect(result.connection).toBe("online");
  });
});
