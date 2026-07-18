import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureWorkspace, resetTables, seedEntity } from "./support";

// FND-05: direct-SQL integrity checks against REAL D1 — the database (not just
// application code) enforces the Activity invariants ADR-012 requires.

const WS = "ws_i";
const OTHER = "ws_i_other";
const AT = "2026-07-18T00:00:00.000Z";

async function insertActivity(
  id: string,
  workspaceId: string,
  extra: { type?: string; actorType?: string; actorId?: string | null } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO activities
       (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, '{}')`,
  )
    .bind(
      id,
      workspaceId,
      extra.type ?? "entity.created",
      extra.actorType ?? "system",
      extra.actorId ?? null,
      AT,
    )
    .run();
}

async function insertSubject(
  workspaceId: string,
  activityId: string,
  entityId: string,
  role = "subject",
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(workspaceId, activityId, entityId, role)
    .run();
}

async function expectRejected(promise: Promise<unknown>): Promise<void> {
  let threw = false;
  try {
    await promise;
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
}

describe("Activity direct database integrity (real D1)", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    await seedEntity(WS, "e1");
    await seedEntity(OTHER, "foreign");
  });

  it("rejects an activity in an unknown workspace", async () => {
    await expectRejected(insertActivity("a1", "ws_missing"));
  });

  it("rejects a subject referencing an unknown activity", async () => {
    await expectRejected(insertSubject(WS, "no_such_activity", "e1"));
  });

  it("rejects a subject referencing an unknown entity", async () => {
    await insertActivity("a1", WS);
    await expectRejected(insertSubject(WS, "a1", "no_such_entity"));
  });

  it("rejects a cross-workspace subject entity", async () => {
    await insertActivity("a1", WS);
    // 'foreign' exists, but in OTHER, not WS — the composite FK rejects it.
    await expectRejected(insertSubject(WS, "a1", "foreign"));
  });

  it("rejects a duplicate activity id", async () => {
    await insertActivity("a1", WS);
    await expectRejected(insertActivity("a1", WS));
  });

  it("rejects a duplicate (activity, entity) subject association", async () => {
    await insertActivity("a1", WS);
    await insertSubject(WS, "a1", "e1", "source");
    // Same activity + same entity again (even with a different role) is a dup.
    await expectRejected(insertSubject(WS, "a1", "e1", "target"));
  });

  it("rejects empty required fields", async () => {
    await expectRejected(insertActivity("", WS)); // empty id
    await expectRejected(insertActivity("a_empty_type", WS, { type: "" }));
    await expectRejected(
      insertActivity("a_empty_actor", WS, { actorType: "" }),
    );
    // actor_id present but empty is rejected; NULL is allowed.
    await expectRejected(
      insertActivity("a_empty_actor_id", WS, { actorId: "" }),
    );
  });

  it("hard-deleting a referenced activity is restricted", async () => {
    await insertActivity("a1", WS);
    await insertSubject(WS, "a1", "e1");
    await expectRejected(
      env.DB.prepare("DELETE FROM activities WHERE id = ?").bind("a1").run(),
    );
  });

  it("hard-deleting a referenced entity is restricted", async () => {
    await insertActivity("a1", WS);
    await insertSubject(WS, "a1", "e1");
    await expectRejected(
      env.DB.prepare("DELETE FROM entities WHERE workspace_id = ? AND id = ?")
        .bind(WS, "e1")
        .run(),
    );
  });

  it("deleting an activity's subject does not delete or modify the entity", async () => {
    await insertActivity("a1", WS);
    await insertSubject(WS, "a1", "e1");
    // Removing the subject association first releases the RESTRICT, then the
    // activity can be removed — and the entity is untouched throughout.
    await env.DB.prepare("DELETE FROM activity_subjects WHERE activity_id = ?")
      .bind("a1")
      .run();
    await env.DB.prepare("DELETE FROM activities WHERE id = ?")
      .bind("a1")
      .run();

    const entity = await env.DB.prepare(
      "SELECT id, title FROM entities WHERE workspace_id = ? AND id = ?",
    )
      .bind(WS, "e1")
      .first<{ id: string; title: string }>();
    expect(entity?.id).toBe("e1");
    await ensureWorkspace(WS);
  });
});
