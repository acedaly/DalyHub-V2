import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { countLinkRows, resetTables, seedEntity } from "./support";

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

// The repository folds the active-endpoint requirement INTO the create/restore
// statements (not just a pre-check), so a soft-delete racing between validation
// and the write cannot slip a link past it. These tests run the exact atomic
// statements directly to prove the SQL itself enforces active endpoints — the
// composite FK only guarantees an endpoint EXISTS, not that it is active.
describe("entity_links atomic active-endpoint enforcement (direct SQL)", () => {
  const ATOMIC_INSERT = `INSERT INTO entity_links
       (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     SELECT ?, ?, ?, ?, 'task.relates_to', ?, ?, NULL
     WHERE EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
           )
       AND EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
           )`;

  const ATOMIC_RESTORE = `UPDATE entity_links
       SET deleted_at = NULL, updated_at = ?
     WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL
       AND EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = entity_links.workspace_id
               AND id = entity_links.source_entity_id
               AND deleted_at IS NULL
           )
       AND EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = entity_links.workspace_id
               AND id = entity_links.target_entity_id
               AND deleted_at IS NULL
           )`;

  beforeEach(async () => {
    await resetTables([WS_A]);
    await seedEntity(WS_A, "act1"); // active
    await seedEntity(WS_A, "act2"); // active
    await seedEntity(WS_A, "gone", { deletedAt: AT }); // soft-deleted
  });

  it("atomic insert writes nothing when the source is soft-deleted", async () => {
    await env.DB.prepare(ATOMIC_INSERT)
      .bind("l", WS_A, "gone", "act1", AT, AT, WS_A, "gone", WS_A, "act1")
      .run();
    expect(await countLinkRows()).toBe(0);
  });

  it("atomic insert writes nothing when the target is soft-deleted", async () => {
    await env.DB.prepare(ATOMIC_INSERT)
      .bind("l", WS_A, "act1", "gone", AT, AT, WS_A, "act1", WS_A, "gone")
      .run();
    expect(await countLinkRows()).toBe(0);
  });

  it("atomic insert writes the row when both endpoints are active", async () => {
    await env.DB.prepare(ATOMIC_INSERT)
      .bind("l", WS_A, "act1", "act2", AT, AT, WS_A, "act1", WS_A, "act2")
      .run();
    expect(await countLinkRows()).toBe(1);
  });

  it("conditional restore re-activates nothing when an endpoint is soft-deleted", async () => {
    // An UNLINKED link whose target then became inactive.
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES ('l1', ?, 'act1', 'gone', 'task.relates_to', ?, ?, ?)`,
    )
      .bind(WS_A, AT, AT, AT)
      .run();

    await env.DB.prepare(ATOMIC_RESTORE).bind(AT, "l1", WS_A).run();

    const row = await env.DB.prepare(
      "SELECT deleted_at FROM entity_links WHERE id = 'l1'",
    ).first<{ deleted_at: string | null }>();
    // Still unlinked — the endpoint-active EXISTS clause blocked the restore.
    expect(row?.deleted_at).not.toBeNull();
  });

  it("conditional restore re-activates the row when both endpoints are active", async () => {
    await env.DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES ('l1', ?, 'act1', 'act2', 'task.relates_to', ?, ?, ?)`,
    )
      .bind(WS_A, AT, AT, AT)
      .run();

    await env.DB.prepare(ATOMIC_RESTORE).bind(AT, "l1", WS_A).run();

    const row = await env.DB.prepare(
      "SELECT deleted_at FROM entity_links WHERE id = 'l1'",
    ).first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBeNull();
  });
});
