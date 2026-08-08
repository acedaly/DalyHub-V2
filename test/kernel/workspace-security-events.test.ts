/**
 * SET-03 — workspace-scoped security events against REAL D1.
 *
 * The claim these tests are here to hold is that DalyHub gained a way to record
 * "the owner did a security-relevant thing" WITHOUT gaining a second audit log
 * (DEBT-33's stated failure mode). So they assert the event lands in the one
 * `activities` table, is readable through the ordinary workspace feed, is bound
 * to its workspace, carries the trusted actor rather than a caller-supplied one,
 * and never appears in an entity's Timeline — because it is about no entity.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  SECURITY_LOCAL_DATA_CLEARED,
  SECURITY_SIGNED_OUT,
} from "~/kernel/account-security";
import {
  ActivityValidationError,
  createActivityActorContext,
} from "~/kernel/activity";
import { createWorkspaceEventRecorder } from "~/platform/storage/d1";

import {
  ensureWorkspace,
  makeActivityRepository,
  makeContext,
  resetTables,
  seedEntity,
  sequentialIds,
} from "./support";

const WS = "ws_security";
const OTHER = "ws_security_other";
const CTX = makeContext(WS);
const OTHER_CTX = makeContext(OTHER);

const OWNER = createActivityActorContext({
  type: "user",
  id: "access-subject-1",
});

function recorder(context = CTX, actor = OWNER) {
  return createWorkspaceEventRecorder(env.DB, context, {
    actorContext: actor,
    idGenerator: sequentialIds("sec"),
    clock: () => new Date("2026-08-08T09:00:00.000Z"),
  });
}

describe("SET-03 workspace security events (real D1)", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    await ensureWorkspace(WS);
    await ensureWorkspace(OTHER);
  });

  it("appends a subject-less event that the workspace feed returns", async () => {
    await recorder().record({
      type: SECURITY_SIGNED_OUT,
      payload: { localSnapshotCleared: true, queuedCapturesKept: 0 },
    });

    const page = await makeActivityRepository(CTX).listForWorkspace({
      type: SECURITY_SIGNED_OUT,
    });
    expect(page.items).toHaveLength(1);
    const [event] = page.items;
    expect(event.type).toBe(SECURITY_SIGNED_OUT);
    expect(event.subjects).toEqual([]);
    expect(event.payload).toEqual({
      localSnapshotCleared: true,
      queuedCapturesKept: 0,
    });
    expect(event.occurredAt.toISOString()).toBe("2026-08-08T09:00:00.000Z");
  });

  // The actor is the trusted one bound at composition, not anything the caller
  // passed: the recorder's `record` takes no actor parameter at all.
  it("records the bound actor, which the caller cannot supply", async () => {
    await recorder().record({
      type: SECURITY_LOCAL_DATA_CLEARED,
      payload: { scope: "everything", queuedCapturesDiscarded: 2 },
    });
    const [event] = (
      await makeActivityRepository(CTX).listForWorkspace({
        type: SECURITY_LOCAL_DATA_CLEARED,
      })
    ).items;
    expect(event.actor).toEqual({ type: "user", id: "access-subject-1" });
  });

  // Workspace isolation is a security boundary (ADR-003), and a security log
  // that leaked across it would be the worst possible place to lose it.
  it("is invisible from another workspace", async () => {
    await recorder().record({
      type: SECURITY_SIGNED_OUT,
      payload: { localSnapshotCleared: true, queuedCapturesKept: 0 },
    });

    const otherPage = await makeActivityRepository(OTHER_CTX).listForWorkspace(
      {},
    );
    expect(otherPage.items).toEqual([]);
  });

  /*
   * The distinguishing property of a workspace-scoped event: it belongs to the
   * workspace, not to a record. An entity Timeline joins through
   * `activity_subjects`, and this event writes none — so a record's history is
   * not polluted by an account action that had nothing to do with it.
   */
  it("never appears in an entity's Timeline", async () => {
    await seedEntity(WS, "e1", { title: "A note" });
    await recorder().record({
      type: SECURITY_SIGNED_OUT,
      payload: { localSnapshotCleared: true, queuedCapturesKept: 0 },
    });

    const timeline = await makeActivityRepository(CTX).listForEntity("e1");
    expect(timeline.items).toEqual([]);

    const subjects = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activity_subjects WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(subjects?.n).toBe(0);
  });

  it("shares one stream with ordinary entity events", async () => {
    await seedEntity(WS, "e1", { title: "A note" });
    await env.DB.prepare(
      `INSERT INTO activities
         (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "act_entity",
        WS,
        "entity.created",
        "user",
        "access-subject-1",
        "2026-08-08T08:00:00.000Z",
        "{}",
      )
      .run();

    await recorder().record({
      type: SECURITY_SIGNED_OUT,
      payload: { localSnapshotCleared: false, queuedCapturesKept: 3 },
    });

    // One unfiltered feed, both events, newest first. Not two histories.
    const page = await makeActivityRepository(CTX).listForWorkspace({});
    expect(page.items.map((item) => item.type)).toEqual([
      SECURITY_SIGNED_OUT,
      "entity.created",
    ]);
  });

  it("rejects an invalid event type before writing anything", async () => {
    await expect(
      recorder().record({ type: "NOT A TYPE", payload: {} }),
    ).rejects.toBeInstanceOf(ActivityValidationError);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ?",
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});
