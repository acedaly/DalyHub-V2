/**
 * V2.6 FIND-04 — a capture QUEUED BEFORE the `#tag` grammar still replays.
 *
 * ADR-090 is the standing authority: an offline capture is replayed through the
 * module's OWN canonical create route, and the queue is the one store holding
 * data that exists nowhere else. So a change to the capture grammar has a
 * failure mode nothing else in this programme has — it can strand or corrupt
 * work the owner has already done and cannot redo, on a device that is not
 * online to be fixed.
 *
 * This file is the proof that it does not, and it is deliberately a REAL replay:
 * a frozen queue record, exactly as a pre-FIND-04 release wrote it into
 * IndexedDB, is put through the SHIPPED `captureFormData` and the SHIPPED
 * `POST /tasks/new` action against real D1. Nothing here restates the
 * implementation's intentions; every assertion is on what the database holds
 * afterwards.
 *
 * The three ways FIND-04 could have broken it, each covered below:
 *
 *   1. **Stranding.** `OFFLINE_SCHEMA_VERSION` is an input to the NAMESPACE
 *      digest. Bumping it re-files every device's data under a new namespace,
 *      and replay refuses a record whose namespace is not the signed-in one — so
 *      a bump would silently orphan every queued capture. It is unchanged, and
 *      the digest is pinned to a literal so a future edit cannot change it
 *      quietly.
 *   2. **Rejection.** The old wire body carries no `tags` field. The route must
 *      still accept it, rather than failing validation on a field that did not
 *      exist when the capture was made.
 *   3. **Retroactive reinterpretation.** The old record's title is stored as the
 *      owner typed it. A `#` in that text must NOT become a tag at replay time:
 *      the offline form never parsed the capture grammar, so the grammar has no
 *      claim on text queued under it, and inventing vocabulary from a replay is
 *      the one thing the recorded unknown-tag decision forbids outright.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";

import type { AuthenticatedSession } from "~/kernel/auth";
import {
  OFFLINE_CAPTURE_PAYLOAD_VERSION,
  OFFLINE_SCHEMA_VERSION,
  deriveOfflineNamespace,
  type OfflineQueueRecord,
} from "~/kernel/offline";
import { OFFLINE_DATABASE_VERSION } from "~/kernel/offline/offline-schema";
import { captureFormData } from "~/shared/offline/sync";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskCreateAction } from "~/modules/tasks/routes/new";
import type { TasksCreateResult } from "~/modules/tasks/tasks-contract";

import { resetTables } from "./support";

const WS = "test-default-workspace";
const OWNER = "dev@dalyhub.test";

/**
 * A queue record EXACTLY as a pre-FIND-04 release wrote it.
 *
 * Written as a frozen literal rather than built by `createQueueRecord`, because
 * a record built by today's code proves only that today's code agrees with
 * itself. This is the shape sitting in a real device's IndexedDB right now.
 *
 * The title carries a `#` on purpose: `#home` is precisely the text that FIND-04
 * teaches the capture line to reinterpret, and this capture was made before it
 * did.
 */
const QUEUED_BEFORE_FIND_04: OfflineQueueRecord = {
  id: "9e0b2d1a-4c3f-4a8b-9d21-5f6a7b8c9d01",
  namespace: "dh1-1-a55a69e6226024fa695d7add371fd94e",
  kind: "task",
  payload: { kind: "task", title: "Fix the #home gutter", dueDate: null },
  payloadVersion: 1,
  createdAt: "2026-07-01T09:15:00.000Z",
  queuedAt: "2026-07-01T09:15:00.000Z",
  status: "pending",
  attempts: 1,
  lastAttemptAt: "2026-07-01T09:20:00.000Z",
  attemptStartedAt: null,
  lastError: "This device could not reach DalyHub.",
  serverId: null,
  syncedAt: null,
} as OfflineQueueRecord;

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: OWNER, email: OWNER, displayName: null },
  } as AuthenticatedSession;
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

/** Replay one queued record the way `replayCapture` does: the same body, the
 * same route, the same idempotency key. */
async function replay(record: OfflineQueueRecord): Promise<TasksCreateResult> {
  const response = (await taskCreateAction({
    request: new Request("https://app.test/tasks/new", {
      method: "POST",
      body: captureFormData(record),
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof taskCreateAction>[0])) as Response;
  return (await response.json()) as TasksCreateResult;
}

async function titleOf(taskId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT title FROM entities WHERE workspace_id = ? AND id = ?",
  )
    .bind(WS, taskId)
    .first<{ title: string }>();
  return row?.title ?? null;
}

async function tagsOf(taskId: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT tag_key FROM entity_tags
      WHERE workspace_id = ? AND entity_id = ? ORDER BY tag_key`,
  )
    .bind(WS, taskId)
    .all<{ tag_key: string }>();
  return rows.results.map((row) => row.tag_key);
}

async function vocabulary(): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT tag_key FROM workspace_tags WHERE workspace_id = ? ORDER BY tag_key",
  )
    .bind(WS)
    .all<{ tag_key: string }>();
  return rows.results.map((row) => row.tag_key);
}

describe("FIND-04 — the offline queue survives the grammar change", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("does not strand queued work: the namespace digest is unchanged", async () => {
    // The one constant that re-files a device's data. Pinned, not merely read.
    expect(OFFLINE_SCHEMA_VERSION).toBe(1);
    expect(OFFLINE_CAPTURE_PAYLOAD_VERSION).toBe(1);
    // The IndexedDB ladder is untouched too, so no `versionchange` runs at all.
    expect(OFFLINE_DATABASE_VERSION).toBe(2);
    // And the digest itself, which is what replay actually compares. A future
    // edit to the material, the prefix or the length fails HERE, next to the
    // reason, rather than as a support question about vanished captures.
    const namespace = await deriveOfflineNamespace({
      subject: OWNER,
      workspaceId: WS,
    });
    expect(namespace).toBe("dh1-1-a55a69e6226024fa695d7add371fd94e");
  });

  it("sends the same wire body it always did — no `tags` field", () => {
    const form = captureFormData(QUEUED_BEFORE_FIND_04);
    expect([...form.keys()].sort()).toEqual(["idempotencyKey", "title"]);
    expect(form.get("title")).toBe("Fix the #home gutter");
    expect(form.get("idempotencyKey")).toBe(QUEUED_BEFORE_FIND_04.id);
  });

  it("replays into a Task whose title is the text the owner typed", async () => {
    const result = await replay(QUEUED_BEFORE_FIND_04);
    expect(result.ok).toBe(true);
    const taskId = (result as { readonly taskId: string }).taskId;

    // The whole of guarantee 3: the `#home` the owner typed BEFORE `#tag` meant
    // anything is still the words they typed. It is not a tag, the title has not
    // been shortened, and — the part that would be hardest to undo — no tag has
    // been added to the workspace's vocabulary as a side effect of a replay the
    // owner was not watching.
    expect(await titleOf(taskId)).toBe("Fix the #home gutter");
    expect(await tagsOf(taskId)).toEqual([]);
    expect(await vocabulary()).toEqual([]);
  });

  it("is still idempotent: a second delivery creates nothing", async () => {
    const first = await replay(QUEUED_BEFORE_FIND_04);
    const second = await replay(QUEUED_BEFORE_FIND_04);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ? AND type = 'task'",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("accepts the NEW body too, so a queue may hold both shapes at once", async () => {
    // A device that queued before the release and again after it replays both in
    // one pass. The route reads `tags` when it is present and defaults it when it
    // is not — there is no version negotiation, and none is needed.
    const older = await replay(QUEUED_BEFORE_FIND_04);
    const form = new FormData();
    form.set("idempotencyKey", "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f");
    form.set("title", "Fix the gutter");
    form.set("tags", JSON.stringify(["Home"]));
    const response = (await taskCreateAction({
      request: new Request("https://app.test/tasks/new", {
        method: "POST",
        body: form,
      }),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof taskCreateAction>[0])) as Response;
    const newer = (await response.json()) as TasksCreateResult;

    expect(older.ok).toBe(true);
    expect(newer.ok).toBe(true);
    const olderId = (older as { readonly taskId: string }).taskId;
    const newerId = (newer as { readonly taskId: string }).taskId;
    expect(await tagsOf(olderId)).toEqual([]);
    expect(await tagsOf(newerId)).toEqual(["home"]);
    // Exactly the vocabulary the NEW capture asked for, and nothing the old one
    // could have been read as having asked for.
    expect(await vocabulary()).toEqual(["home"]);
  });
});
