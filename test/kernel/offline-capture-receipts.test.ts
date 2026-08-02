/**
 * PWA-05 — idempotent offline capture replay, against REAL D1.
 *
 * The whole point of `offline_capture_receipts` is a guarantee that only a
 * database can give, so these run in the Workers runtime against the real
 * committed migration rather than a mock. What they prove:
 *
 *   - the same key creates at most ONE record, however many times it is replayed,
 *     including when two attempts race;
 *   - a losing attempt reports the id the winner created, so the client
 *     reconciles instead of retrying forever;
 *   - a key is scoped by workspace, identity and record kind, so a replay can
 *     never cross the FND-03 isolation boundary or be attributed to the wrong
 *     sign-in;
 *   - a creation that FAILS releases its claim, so the owner's retry is not
 *     permanently blocked by a receipt for a record that does not exist;
 *   - a claim abandoned by a crashed request is eventually taken over rather
 *     than stranding the capture.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  claimCapture,
  isIdempotencyKey,
  releaseClaim,
  withCaptureIdempotency,
  withReplayGuard,
  type CaptureReceiptContext,
} from "~/platform/offline";

import { resetTables } from "./support";

const WS = "offline_ws";
const OTHER_WS = "offline_other_ws";
const OWNER = "owner-subject";
const OTHER_OWNER = "other-owner-subject";
const KEY = "11111111-1111-4111-8111-111111111111";

const NOW = new Date("2026-08-02T09:00:00.000Z");

function context(
  overrides: Partial<CaptureReceiptContext> = {},
): CaptureReceiptContext {
  return {
    db: env.DB,
    workspaceId: WS,
    ownerSubject: OWNER,
    kind: "task",
    now: NOW,
    ...overrides,
  };
}

describe("offline capture idempotency — D1", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER_WS]);
  });

  it("creates exactly once, however many times the capture is replayed", async () => {
    let creations = 0;
    const create = async () => {
      creations += 1;
      return { recordId: `task-${creations}` };
    };

    const first = await withCaptureIdempotency(context(), KEY, create);
    const second = await withCaptureIdempotency(context(), KEY, create);
    const third = await withCaptureIdempotency(context(), KEY, create);

    expect(creations).toBe(1);
    expect(first).toEqual({ ok: true, recordId: "task-1", replayed: false });
    expect(second).toEqual({ ok: true, recordId: "task-1", replayed: true });
    expect(third).toEqual({ ok: true, recordId: "task-1", replayed: true });
  });

  it("lets exactly one of two concurrent attempts claim the key", async () => {
    // The database arbitrates, not application code: a read-then-write check
    // would let both of these through.
    const [a, b] = await Promise.all([
      claimCapture(context(), KEY),
      claimCapture(context(), KEY),
    ]);
    const claimed = [a, b].filter((result) => result.kind === "claimed");
    expect(claimed).toHaveLength(1);
    const other = [a, b].find((result) => result.kind !== "claimed")!;
    // The loser is told to wait, not to create.
    expect(other.kind).toBe("conflict");
  });

  it("keeps one workspace's key from resolving another workspace's capture", async () => {
    await withCaptureIdempotency(context(), KEY, async () => ({
      recordId: "task-in-ws",
    }));

    let created = false;
    const inOtherWorkspace = await withCaptureIdempotency(
      context({ workspaceId: OTHER_WS }),
      KEY,
      async () => {
        created = true;
        return { recordId: "task-in-other-ws" };
      },
    );

    // The SAME key in a different workspace is a different capture entirely.
    expect(created).toBe(true);
    expect(inOtherWorkspace).toEqual({
      ok: true,
      recordId: "task-in-other-ws",
      replayed: false,
    });
  });

  it("refuses to reconcile a receipt belonging to a different sign-in", async () => {
    await withCaptureIdempotency(context(), KEY, async () => ({
      recordId: "task-1",
    }));

    let created = false;
    const result = await withCaptureIdempotency(
      context({ ownerSubject: OTHER_OWNER }),
      KEY,
      async () => {
        created = true;
        return { recordId: "task-2" };
      },
    );

    expect(created).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/different sign-in/i);
      // The message never discloses WHICH check failed, or that a record exists.
      expect(result.reason).not.toContain("task-1");
    }
  });

  it("refuses to let one record kind satisfy another kind's receipt", async () => {
    await withCaptureIdempotency(context({ kind: "note" }), KEY, async () => ({
      recordId: "note-1",
    }));

    let created = false;
    const result = await withCaptureIdempotency(
      context({ kind: "task" }),
      KEY,
      async () => {
        created = true;
        return { recordId: "task-1" };
      },
    );
    expect(created).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("releases the claim when creation throws, so a retry can succeed", async () => {
    await expect(
      withCaptureIdempotency(context(), KEY, async () => {
        throw new Error("D1 was unavailable");
      }),
    ).rejects.toThrow("D1 was unavailable");

    // The owner's retry must not be answered with "already being created".
    const retry = await withCaptureIdempotency(context(), KEY, async () => ({
      recordId: "task-after-retry",
    }));
    expect(retry).toEqual({
      ok: true,
      recordId: "task-after-retry",
      replayed: false,
    });
  });

  it("takes over a claim abandoned by a crashed request", async () => {
    // A claim written but never completed (the process died between the two
    // statements). Immediately afterwards a concurrent attempt should wait…
    await claimCapture(context(), KEY);
    const immediately = await claimCapture(context(), KEY);
    expect(immediately.kind).toBe("conflict");

    // …but it must not strand the owner's capture forever.
    const muchLater = await claimCapture(
      context({ now: new Date(NOW.getTime() + 5 * 60_000) }),
      KEY,
    );
    expect(muchLater.kind).toBe("claimed");
  });

  it("rejects a malformed key without touching the database", async () => {
    for (const key of ["", "short", "has spaces in it", "x".repeat(200)]) {
      expect(isIdempotencyKey(key)).toBe(false);
      const result = await claimCapture(context(), key);
      expect(result.kind).toBe("conflict");
    }
  });

  it("never deletes a COMPLETED receipt", async () => {
    await withCaptureIdempotency(context(), KEY, async () => ({
      recordId: "task-1",
    }));
    // `releaseClaim` only ever removes an unfinished claim; a completed one is
    // immutable, or a retry after a successful create would duplicate.
    await releaseClaim(context(), KEY);
    const again = await withCaptureIdempotency(context(), KEY, async () => ({
      recordId: "task-2",
    }));
    expect(again).toEqual({ ok: true, recordId: "task-1", replayed: true });
  });
});

describe("withReplayGuard — the shape the create routes use", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER_WS]);
  });

  type Result =
    { ok: true; taskId: string } | { ok: false; formError?: string };

  const guard = (key: string | null, create: () => Promise<Result>) =>
    withReplayGuard<Result>(
      context(),
      key,
      create,
      (result) => (result.ok ? result.taskId : null),
      (taskId) => ({ ok: true, taskId }),
      (reason) => ({ ok: false, formError: reason }),
    );

  it("is a complete pass-through when no key is supplied", async () => {
    // Every ONLINE capture and every full form takes this path, so existing
    // behaviour must be byte-for-byte unchanged.
    let creations = 0;
    const create = async (): Promise<Result> => {
      creations += 1;
      return { ok: true, taskId: `task-${creations}` };
    };
    expect(await guard(null, create)).toEqual({ ok: true, taskId: "task-1" });
    expect(await guard(null, create)).toEqual({ ok: true, taskId: "task-2" });
    expect(creations).toBe(2);
  });

  it("returns the already-created id on a replay", async () => {
    let creations = 0;
    const create = async (): Promise<Result> => {
      creations += 1;
      return { ok: true, taskId: `task-${creations}` };
    };
    expect(await guard(KEY, create)).toEqual({ ok: true, taskId: "task-1" });
    expect(await guard(KEY, create)).toEqual({ ok: true, taskId: "task-1" });
    expect(creations).toBe(1);
  });

  it("releases the claim when the handler reports a validation failure", async () => {
    // A rejected capture is not a created one, so the key must stay available:
    // the owner may fix the problem and the SAME queued record replays.
    const rejected = await guard(KEY, async () => ({
      ok: false,
      formError: "Give it a title.",
    }));
    expect(rejected).toEqual({ ok: false, formError: "Give it a title." });

    const accepted = await guard(KEY, async () => ({
      ok: true,
      taskId: "task-1",
    }));
    expect(accepted).toEqual({ ok: true, taskId: "task-1" });
  });
});
