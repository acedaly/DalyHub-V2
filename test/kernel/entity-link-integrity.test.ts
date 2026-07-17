import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { resetTables, seedEntity } from "./support";

// FND-04: prove the DATABASE — not just application code — enforces referential
// integrity for entity_links via direct SQL. These bypass the repository on
// purpose: the constraints are the backstop.

const WS_A = "ws_a";
const WS_B = "ws_b";
const AT = "2026-07-17T00:00:00.000Z";

/** Attempt a direct link insert, returning whether it was rejected. */
async function insertLinkFails(values: {
  id: string;
  workspaceId: string;
  source: string;
  target: string;
  type?: string;
}): Promise<boolean> {
  try {
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        values.id,
        values.workspaceId,
        values.source,
        values.target,
        values.type ?? "task.relates_to",
        AT,
        AT,
      )
      .run();
    return false;
  } catch {
    return true;
  }
}

describe("entity_links database integrity (direct SQL)", () => {
  beforeEach(async () => {
    await resetTables([WS_A, WS_B]);
    await seedEntity(WS_A, "a1");
    await seedEntity(WS_A, "a2");
    await seedEntity(WS_B, "b1");
  });

  it("rejects a link with an unknown workspace", async () => {
    expect(
      await insertLinkFails({
        id: "l",
        workspaceId: "ws_absent",
        source: "a1",
        target: "a2",
      }),
    ).toBe(true);
  });

  it("rejects a link with an unknown source entity", async () => {
    expect(
      await insertLinkFails({
        id: "l",
        workspaceId: WS_A,
        source: "ghost",
        target: "a2",
      }),
    ).toBe(true);
  });

  it("rejects a link with an unknown target entity", async () => {
    expect(
      await insertLinkFails({
        id: "l",
        workspaceId: WS_A,
        source: "a1",
        target: "ghost",
      }),
    ).toBe(true);
  });

  it("rejects a source in workspace A with a target in workspace B", async () => {
    // Link declared in ws_a but target b1 lives in ws_b → no (ws_a, b1) parent.
    expect(
      await insertLinkFails({
        id: "l",
        workspaceId: WS_A,
        source: "a1",
        target: "b1",
      }),
    ).toBe(true);
  });

  it("rejects an endpoint that belongs to a different workspace than the link", async () => {
    // Link declared in ws_b but source a1 lives in ws_a → no (ws_b, a1) parent.
    expect(
      await insertLinkFails({
        id: "l",
        workspaceId: WS_B,
        source: "a1",
        target: "b1",
      }),
    ).toBe(true);
  });

  it("rejects a self-link via the CHECK constraint", async () => {
    expect(
      await insertLinkFails({
        id: "l",
        workspaceId: WS_A,
        source: "a1",
        target: "a1",
      }),
    ).toBe(true);
  });

  it("rejects a duplicate (workspace, source, target, type) tuple", async () => {
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', ?, 'a1', 'a2', 'task.relates_to', ?, ?)`,
    )
      .bind(WS_A, AT, AT)
      .run();

    // A different id but the same identity tuple → rejected by the unique index.
    expect(
      await insertLinkFails({
        id: "l2",
        workspaceId: WS_A,
        source: "a1",
        target: "a2",
        type: "task.relates_to",
      }),
    ).toBe(true);
  });

  it("allows the reverse-direction relationship as a distinct row", async () => {
    // Direction is meaningful: (a1 → a2) and (a2 → a1) are different links.
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', ?, 'a1', 'a2', 'task.relates_to', ?, ?)`,
    )
      .bind(WS_A, AT, AT)
      .run();

    expect(
      await insertLinkFails({
        id: "l2",
        workspaceId: WS_A,
        source: "a2",
        target: "a1",
        type: "task.relates_to",
      }),
    ).toBe(false);
  });

  it("restricts hard-deleting a referenced entity", async () => {
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', ?, 'a1', 'a2', 'task.relates_to', ?, ?)`,
    )
      .bind(WS_A, AT, AT)
      .run();

    let threw = false;
    try {
      await env.DB.prepare(
        "DELETE FROM entities WHERE workspace_id = ? AND id = 'a1'",
      )
        .bind(WS_A)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // The entity is still there.
    const row = await env.DB.prepare(
      "SELECT id FROM entities WHERE workspace_id = ? AND id = 'a1'",
    )
      .bind(WS_A)
      .first<{ id: string }>();
    expect(row?.id).toBe("a1");
  });

  it("restricts hard-deleting a workspace that still owns entities/links", async () => {
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', ?, 'a1', 'a2', 'task.relates_to', ?, ?)`,
    )
      .bind(WS_A, AT, AT)
      .run();

    let threw = false;
    try {
      await env.DB.prepare("DELETE FROM workspaces WHERE id = ?")
        .bind(WS_A)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("deleting a link row directly does not delete its endpoint entities", async () => {
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', ?, 'a1', 'a2', 'task.relates_to', ?, ?)`,
    )
      .bind(WS_A, AT, AT)
      .run();

    await env.DB.prepare("DELETE FROM entity_links WHERE id = 'l1'").run();

    const { results } = await env.DB.prepare(
      "SELECT id FROM entities WHERE workspace_id = ? ORDER BY id",
    )
      .bind(WS_A)
      .all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(["a1", "a2"]);
  });
});
