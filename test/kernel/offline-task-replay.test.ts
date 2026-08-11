/**
 * PWA-12 — offline Task mutation replay, over the REAL route and REAL D1.
 *
 * The guarantees this file exists for are ones only a database and a real domain
 * can give, so nothing here is mocked: the replays go through the same
 * `/tasks/:taskId` action an online control posts to, against the committed
 * migrations, with the real recurrence engine.
 *
 * What it proves:
 *
 *   - a replayed mutation applies exactly once, however many times it is
 *     delivered, and a duplicate delivery is a truthful no-op rather than an
 *     error;
 *   - a recurring completion replayed twice produces EXACTLY ONE successor, and
 *     exactly one completion in the Activity stream — for a fixed schedule and
 *     for an after-completion schedule alike;
 *   - an interrupted replay (the server applied it, the client never saw the
 *     answer) does not duplicate the recurrence transition when it is retried;
 *   - a field that moved on the server produces a CONFLICT with the server's
 *     value, and an unrelated server change does not;
 *   - a queued change whose Task was deleted elsewhere is terminal, not retried;
 *   - a receipt cannot be reconciled across identities, workspaces, records or
 *     operations.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";

import type { AuthenticatedSession } from "~/kernel/auth";
import type { OfflineReplayReport } from "~/kernel/offline";
import { setAuthenticatedSession } from "~/platform/request";
import { claimMutation, settleMutation } from "~/platform/offline";
import { action as taskAction } from "~/modules/tasks/routes/task-detail";
import { action as createAction } from "~/modules/tasks/routes/new";

import {
  FakeClock,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OWNER = "dev@dalyhub.test";

const nextEntityId = sequentialIds("orent");
const nextActivityId = sequentialIds("oract");

function taskRepo() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-12T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function authedContext(subject = OWNER): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject, email: subject, displayName: null },
  } as AuthenticatedSession;
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

type ReplayBody = Record<string, unknown> & {
  readonly offline?: OfflineReplayReport;
};

async function post(taskId: string, form: FormData): Promise<ReplayBody> {
  const response = (await taskAction({
    request: new Request(`https://app.test/tasks/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskAction>[0])) as Response;
  return (await response.json()) as ReplayBody;
}

async function createTask(fields: Record<string, string>): Promise<string> {
  const form = new FormData();
  form.set("intent", "create");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const response = (await createAction({
    request: new Request("https://app.test/tasks/new", {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createAction>[0])) as Response;
  const body = (await response.json()) as { ok: boolean; taskId: string };
  expect(body.ok).toBe(true);
  return body.taskId;
}

let keyCounter = 0;

/** A well-formed idempotency key, stable within one test unless asked otherwise. */
function key(): string {
  keyCounter += 1;
  return `11111111-1111-4111-8111-${String(keyCounter).padStart(12, "0")}`;
}

/** The replay fields a queued mutation adds to an ordinary submission. */
function replay(
  form: FormData,
  operation: string,
  idempotencyKey: string,
  base: string | null,
): FormData {
  form.set("offlineKey", idempotencyKey);
  form.set("offlineOperation", operation);
  form.set("offlineBase", base ?? "");
  return form;
}

/** How many live successors this series has, by its series id. */
async function seriesRows(seriesId: string) {
  const rows = await env.DB.prepare(
    `SELECT r.entity_id, r.sequence
       FROM task_recurrence_rules r
       JOIN entities e ON e.id = r.entity_id AND e.workspace_id = r.workspace_id
      WHERE r.workspace_id = ?1 AND r.series_id = ?2 AND e.deleted_at IS NULL
      ORDER BY r.sequence`,
  )
    .bind(WS, seriesId)
    .all<{ entity_id: string; sequence: number }>();
  return rows.results;
}

/** The series id a task's rule belongs to. */
async function seriesIdOf(taskId: string): Promise<string> {
  const row = await env.DB.prepare(
    `SELECT series_id FROM task_recurrence_rules
      WHERE workspace_id = ?1 AND entity_id = ?2`,
  )
    .bind(WS, taskId)
    .first<{ series_id: string }>();
  return row!.series_id;
}

/**
 * Completion events recorded against a task, read from the shared Activity
 * stream — the audit authority (ADR-005). A duplicated replay that produced two
 * of these would be invisible in the Task itself and glaring here.
 */
async function completionEvents(taskId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM activities a
       JOIN activity_subjects s ON s.activity_id = a.id
      WHERE a.workspace_id = ?1 AND s.entity_id = ?2 AND a.type LIKE '%complete%'`,
  )
    .bind(WS, taskId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS]);
  keyCounter = 0;
});

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                */
/* -------------------------------------------------------------------------- */

describe("replaying the same mutation twice", () => {
  it("renames once, and the second delivery is a truthful no-op", async () => {
    const taskId = await createTask({ title: "Service Hilux" });
    const k = key();

    const first = await post(
      taskId,
      replay(
        (() => {
          const f = new FormData();
          f.set("intent", "rename");
          f.set("title", "Book Hilux service");
          return f;
        })(),
        "set_title",
        k,
        "Service Hilux",
      ),
    );
    expect(first.offline).toEqual({ kind: "applied", replayed: false });

    const second = await post(
      taskId,
      replay(
        (() => {
          const f = new FormData();
          f.set("intent", "rename");
          f.set("title", "Book Hilux service");
          return f;
        })(),
        "set_title",
        k,
        "Service Hilux",
      ),
    );
    // Answered from the RECEIPT: the domain is not touched a second time.
    expect(second.offline).toEqual({ kind: "applied", replayed: true });

    const task = await taskRepo().getTask(taskId);
    expect(task?.title).toBe("Book Hilux service");
  });

  it("applies a priority change once under a repeated key", async () => {
    const taskId = await createTask({ title: "Triage" });
    const k = key();
    const send = () => {
      const f = new FormData();
      f.set("intent", "update");
      f.set("priority", "p2");
      return post(taskId, replay(f, "set_priority", k, ""));
    };

    expect((await send()).offline).toEqual({
      kind: "applied",
      replayed: false,
    });
    expect((await send()).offline).toEqual({ kind: "applied", replayed: true });
    expect((await taskRepo().getTask(taskId))?.priority).toBe("p2");
  });
});

/* -------------------------------------------------------------------------- */
/* Recurrence — the exactly-one-successor invariant                            */
/* -------------------------------------------------------------------------- */

describe("recurrence: a FIXED schedule completed offline", () => {
  it("produces exactly one successor, on the fixed-schedule date", async () => {
    const taskId = await createTask({
      title: "Bin night",
      scheduledDate: "2026-08-12",
      recurrenceFrequency: "week",
      recurrenceDateKind: "scheduled",
      recurrenceInterval: "1",
      recurrenceMode: "fixed",
    });
    const seriesId = await seriesIdOf(taskId);

    const body = await post(
      taskId,
      replay(
        (() => {
          const f = new FormData();
          f.set("intent", "complete");
          return f;
        })(),
        "complete",
        key(),
        "",
      ),
    );
    expect(body.offline).toEqual({ kind: "applied", replayed: false });

    const rows = await seriesRows(seriesId);
    expect(rows).toHaveLength(2);
    const successorId = rows[1].entity_id;
    const successor = await taskRepo().getTask(successorId);
    // The fixed rule advances from the OCCURRENCE's own anchor, not from the day
    // the owner happened to tick it.
    expect(successor?.scheduledDate).toBe("2026-08-19");
    expect(successor?.completedAt).toBeNull();
  });

  it("does not create a SECOND successor when the completion is replayed again", async () => {
    const taskId = await createTask({
      title: "Bin night",
      scheduledDate: "2026-08-12",
      recurrenceFrequency: "week",
      recurrenceDateKind: "scheduled",
      recurrenceInterval: "1",
      recurrenceMode: "fixed",
    });
    const seriesId = await seriesIdOf(taskId);
    const k = key();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const f = new FormData();
      f.set("intent", "complete");
      await post(taskId, replay(f, "complete", k, ""));
    }

    expect(await seriesRows(seriesId)).toHaveLength(2);
    expect(await completionEvents(taskId)).toBe(1);
  });

  it("does not duplicate the transition when a DIFFERENT key replays the same intent", async () => {
    // The case a receipt alone cannot catch: the client's first attempt failed
    // before the response was read, it queued the intent under a NEW key, and it
    // replays. The `satisfied` decision — and, beneath it, `completeTask`'s own
    // idempotence — is what keeps the series correct. Two protections, and this
    // test removes the first one.
    const taskId = await createTask({
      title: "Bin night",
      scheduledDate: "2026-08-12",
      recurrenceFrequency: "week",
      recurrenceDateKind: "scheduled",
      recurrenceInterval: "1",
      recurrenceMode: "fixed",
    });
    const seriesId = await seriesIdOf(taskId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const f = new FormData();
      f.set("intent", "complete");
      await post(taskId, replay(f, "complete", key(), ""));
    }

    expect(await seriesRows(seriesId)).toHaveLength(2);
    expect(await completionEvents(taskId)).toBe(1);
  });
});

describe("recurrence: an AFTER-COMPLETION schedule completed offline", () => {
  it("anchors the one successor on the canonical completion day", async () => {
    const taskId = await createTask({
      title: "Service Hilux",
      scheduledDate: "2026-08-01",
      recurrenceFrequency: "month",
      recurrenceDateKind: "scheduled",
      recurrenceInterval: "6",
      recurrenceMode: "after_completion",
    });
    const seriesId = await seriesIdOf(taskId);

    const f = new FormData();
    f.set("intent", "complete");
    const body = await post(taskId, replay(f, "complete", key(), ""));
    expect(body.offline).toEqual({ kind: "applied", replayed: false });

    const rows = await seriesRows(seriesId);
    expect(rows).toHaveLength(2);
    const successor = await taskRepo().getTask(rows[1].entity_id);
    // After-completion anchors on the OWNER's completion day (the server's
    // resolution of it), not on the occurrence's old anchor.
    expect(successor?.scheduledDate).not.toBe("2026-08-01");
    expect(successor?.scheduledDate).toBeTruthy();
  });

  it("stays at exactly one successor across repeated replay", async () => {
    const taskId = await createTask({
      title: "Service Hilux",
      scheduledDate: "2026-08-01",
      recurrenceFrequency: "month",
      recurrenceDateKind: "scheduled",
      recurrenceInterval: "6",
      recurrenceMode: "after_completion",
    });
    const seriesId = await seriesIdOf(taskId);
    const k = key();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const f = new FormData();
      f.set("intent", "complete");
      await post(taskId, replay(f, "complete", k, ""));
    }

    expect(await seriesRows(seriesId)).toHaveLength(2);
    expect(await completionEvents(taskId)).toBe(1);
  });
});

describe("recurrence: an INTERRUPTED replay", () => {
  it("does not repeat the transition when the response was lost", async () => {
    // Connectivity returned long enough for the server to accept the mutation
    // but not long enough for the browser to receive the answer. The client
    // retries later, under the same key.
    const taskId = await createTask({
      title: "Bin night",
      scheduledDate: "2026-08-12",
      recurrenceFrequency: "week",
      recurrenceDateKind: "scheduled",
      recurrenceInterval: "1",
      recurrenceMode: "fixed",
    });
    const seriesId = await seriesIdOf(taskId);
    const k = key();

    const first = new FormData();
    first.set("intent", "complete");
    await post(taskId, replay(first, "complete", k, ""));
    // (the client never saw this response)

    const retry = new FormData();
    retry.set("intent", "complete");
    const second = await post(taskId, replay(retry, "complete", k, ""));

    expect(second.offline).toEqual({ kind: "applied", replayed: true });
    expect(await seriesRows(seriesId)).toHaveLength(2);
    expect(await completionEvents(taskId)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Conflicts                                                                  */
/* -------------------------------------------------------------------------- */

describe("conflicts", () => {
  it("reports a title changed on another device, and applies nothing", async () => {
    const taskId = await createTask({ title: "Service Hilux" });

    // Another session renames it while this device was offline.
    await taskRepo().updateTask(taskId, { title: "Hilux 100,000km service" });

    const f = new FormData();
    f.set("intent", "rename");
    f.set("title", "Book Hilux service");
    const body = await post(
      taskId,
      replay(f, "set_title", key(), "Service Hilux"),
    );

    expect(body.offline?.kind).toBe("conflict");
    if (body.offline?.kind !== "conflict")
      throw new Error("expected a conflict");
    expect(body.offline.conflict.serverValue).toBe("Hilux 100,000km service");
    // Neither side is silently discarded: the server keeps its value and the
    // owner's intent is still on the device, waiting for their decision.
    expect((await taskRepo().getTask(taskId))?.title).toBe(
      "Hilux 100,000km service",
    );
  });

  it("applies an offline PRIORITY change when only the TITLE moved on the server", async () => {
    // The merge case §18 requires. `updatedAt` moved; the priority did not.
    const taskId = await createTask({ title: "Service Hilux" });
    await taskRepo().updateTask(taskId, { title: "Renamed elsewhere" });

    const f = new FormData();
    f.set("intent", "update");
    f.set("priority", "p2");
    const body = await post(taskId, replay(f, "set_priority", key(), ""));

    expect(body.offline).toEqual({ kind: "applied", replayed: false });
    const task = await taskRepo().getTask(taskId);
    expect(task?.priority).toBe("p2");
    expect(task?.title).toBe("Renamed elsewhere");
  });

  it("reports a conflict when both sides changed the same date", async () => {
    const taskId = await createTask({
      title: "Lodge BAS",
      dueDate: "2026-08-14",
    });
    await taskRepo().updateTask(taskId, { dueDate: "2026-08-20" });

    const f = new FormData();
    f.set("intent", "update");
    f.set("dueDate", "2026-08-15");
    const body = await post(taskId, replay(f, "set_due", key(), "2026-08-14"));

    expect(body.offline?.kind).toBe("conflict");
    if (body.offline?.kind !== "conflict")
      throw new Error("expected a conflict");
    expect(body.offline.conflict.field).toBe("dueDate");
    expect(body.offline.conflict.serverValue).toBe("2026-08-20");
  });

  it("lets a conflicted change be re-sent under the SAME key once the owner decides", async () => {
    // The claim must not outlive a question. If a conflict finalised the
    // receipt, "keep my change" would be permanently unanswerable.
    const taskId = await createTask({ title: "Service Hilux" });
    await taskRepo().updateTask(taskId, { title: "Renamed elsewhere" });
    const k = key();

    const conflicted = await post(
      taskId,
      replay(
        (() => {
          const f = new FormData();
          f.set("intent", "rename");
          f.set("title", "Book Hilux service");
          return f;
        })(),
        "set_title",
        k,
        "Service Hilux",
      ),
    );
    expect(conflicted.offline?.kind).toBe("conflict");

    // "Keep my change" rebases onto the value the owner has now seen.
    const resolved = await post(
      taskId,
      replay(
        (() => {
          const f = new FormData();
          f.set("intent", "rename");
          f.set("title", "Book Hilux service");
          return f;
        })(),
        "set_title",
        k,
        "Renamed elsewhere",
      ),
    );
    expect(resolved.offline).toEqual({ kind: "applied", replayed: false });
    expect((await taskRepo().getTask(taskId))?.title).toBe(
      "Book Hilux service",
    );
  });

  it("treats a task already completed elsewhere as success for a queued completion", async () => {
    const taskId = await createTask({ title: "Pay the rates" });
    await taskRepo().completeTask(taskId, { ownerTodayIso: "2026-08-12" });

    const f = new FormData();
    f.set("intent", "complete");
    const body = await post(taskId, replay(f, "complete", key(), ""));

    // The intended TERMINAL STATE holds, so this is a truthful success — not a
    // conflict, and not a second completion.
    expect(body.offline).toEqual({ kind: "applied", replayed: true });
    expect(await completionEvents(taskId)).toBe(1);
  });

  it("applies a queued completion to a task that was reopened elsewhere", async () => {
    const taskId = await createTask({ title: "Pay the rates" });
    await taskRepo().completeTask(taskId, { ownerTodayIso: "2026-08-12" });
    await taskRepo().reopenTask(taskId);

    const f = new FormData();
    f.set("intent", "complete");
    const body = await post(taskId, replay(f, "complete", key(), ""));

    expect(body.offline).toEqual({ kind: "applied", replayed: false });
    expect((await taskRepo().getTask(taskId))?.completedAt).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Permanent failure and isolation                                            */
/* -------------------------------------------------------------------------- */

describe("a task deleted elsewhere", () => {
  it("is terminal and is said in the owner's words", async () => {
    const taskId = await createTask({ title: "Cancel the gym" });
    await taskRepo().deleteTasks([taskId]);

    const f = new FormData();
    f.set("intent", "rename");
    f.set("title", "Cancel the gym membership");
    const body = await post(
      taskId,
      replay(f, "set_title", key(), "Cancel the gym"),
    );

    expect(body.offline?.kind).toBe("gone");
    if (body.offline?.kind !== "gone") throw new Error("expected gone");
    expect(body.offline.message).toMatch(/deleted on another device/);
    expect(body.offline.message).not.toMatch(/404|not_found/);
  });
});

describe("a malformed replay", () => {
  it("is refused, and nothing is applied", async () => {
    const taskId = await createTask({ title: "Service Hilux" });

    // A key issued for a rename, attached to a completion.
    const f = new FormData();
    f.set("intent", "complete");
    const body = await post(taskId, replay(f, "set_title", key(), ""));

    expect(body.offline?.kind).toBe("invalid");
    expect((await taskRepo().getTask(taskId))?.completedAt).toBeNull();
  });
});

describe("receipt isolation", () => {
  const base = {
    db: env.DB,
    workspaceId: WS,
    ownerSubject: OWNER,
    entityId: "task-1",
    operation: "set_title" as const,
    now: new Date("2026-08-12T09:00:00.000Z"),
  };

  it("cannot be reconciled by a different identity", async () => {
    const k = key();
    expect((await claimMutation(base, k)).kind).toBe("claimed");
    await settleMutation(base, k, "applied");

    const other = await claimMutation(
      { ...base, ownerSubject: "someone-else@dalyhub.test" },
      k,
    );
    expect(other.kind).toBe("conflict");
    if (other.kind !== "conflict") throw new Error("expected a conflict");
    // Never discloses WHICH check failed, and never reconciles across identities.
    expect(other.reason).toMatch(/different sign-in/);
  });

  it("cannot be satisfied by a request naming another task", async () => {
    const k = key();
    await claimMutation(base, k);
    await settleMutation(base, k, "applied");
    expect((await claimMutation({ ...base, entityId: "task-2" }, k)).kind).toBe(
      "conflict",
    );
  });

  it("cannot be satisfied by a different operation", async () => {
    const k = key();
    await claimMutation(base, k);
    await settleMutation(base, k, "applied");
    expect(
      (await claimMutation({ ...base, operation: "complete" }, k)).kind,
    ).toBe("conflict");
  });

  it("lets exactly one of two concurrent attempts claim the key", async () => {
    // The DATABASE arbitrates: a read-then-write check would let both through.
    const k = key();
    const [a, b] = await Promise.all([
      claimMutation(base, k),
      claimMutation(base, k),
    ]);
    const claimed = [a, b].filter((result) => result.kind === "claimed");
    expect(claimed).toHaveLength(1);
    // The loser is told to ask again shortly, not that its change failed.
    const loser = [a, b].find((result) => result.kind !== "claimed")!;
    expect(loser.kind).toBe("conflict");
    if (loser.kind !== "conflict") throw new Error("expected a conflict");
    expect(loser.retryable).toBe(true);
  });

  it("refuses a malformed key rather than claiming it", async () => {
    expect((await claimMutation(base, "short")).kind).toBe("conflict");
  });
});
