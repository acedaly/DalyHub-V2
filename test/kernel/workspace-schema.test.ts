import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  countRows,
  countWorkspaces,
  ensureWorkspace,
  resetTables,
} from "./support";

// FND-03: the DATABASE — not just application code — enforces workspace
// referential integrity. These tests hit env.DB directly (bypassing the
// repository) to prove the foreign key is real.

const TS = "2026-07-17T00:00:00.000Z";

async function insertEntityRaw(id: string, workspaceId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO entities
       (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'task', 'raw', ?, ?, NULL)`,
  )
    .bind(id, workspaceId, TS, TS)
    .run();
}

describe("workspace foreign-key enforcement (migration 0002)", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("creates the workspaces table with id + timestamps", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(workspaces)",
    ).all<{ name: string; notnull: number; pk: number }>();
    const byName = new Map(results.map((c) => [c.name, c]));
    expect([...byName.keys()].sort()).toEqual(
      ["created_at", "id", "updated_at"].sort(),
    );
    expect(byName.get("id")?.pk).toBe(1);
    expect(byName.get("created_at")?.notnull).toBe(1);
    expect(byName.get("updated_at")?.notnull).toBe(1);
  });

  it("accepts an entity whose workspace exists (valid FK)", async () => {
    await ensureWorkspace("ws_ok");
    await insertEntityRaw("e_ok", "ws_ok");
    expect(await countRows()).toBe(1);
  });

  it("rejects a direct-SQL entity whose workspace does not exist (orphan)", async () => {
    let threw = false;
    try {
      await insertEntityRaw("e_orphan", "ws_missing");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(await countRows()).toBe(0);
  });

  it("declares the foreign key with ON DELETE RESTRICT", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA foreign_key_list(entities)",
    ).all<{ table: string; from: string; to: string; on_delete: string }>();
    const fk = results.find((r) => r.from === "workspace_id");
    expect(fk?.table).toBe("workspaces");
    expect(fk?.to).toBe("id");
    expect(fk?.on_delete).toBe("RESTRICT");
  });

  it("refuses to delete a workspace that still owns entities", async () => {
    await ensureWorkspace("ws_owner");
    await insertEntityRaw("e1", "ws_owner");

    let threw = false;
    try {
      await env.DB.prepare("DELETE FROM workspaces WHERE id = ?")
        .bind("ws_owner")
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // The workspace and its entity are both intact.
    expect(await countWorkspaces()).toBe(1);
    expect(await countRows()).toBe(1);
  });

  it("allows deleting a workspace once it owns no entities", async () => {
    await ensureWorkspace("ws_empty");
    await env.DB.prepare("DELETE FROM workspaces WHERE id = ?")
      .bind("ws_empty")
      .run();
    expect(await countWorkspaces()).toBe(0);
  });

  it("deleting an entity does not delete its workspace", async () => {
    await ensureWorkspace("ws_keep");
    await insertEntityRaw("e_gone", "ws_keep");
    await env.DB.prepare("DELETE FROM entities WHERE id = ?")
      .bind("e_gone")
      .run();
    expect(await countRows()).toBe(0);
    expect(await countWorkspaces()).toBe(1);
  });

  it("keeps foreign keys enabled in the runtime", async () => {
    const row = await env.DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(row?.foreign_keys).toBe(1);
  });

  it("has an index whose leading column supports scoped entity queries", async () => {
    // A query planner check: listing a workspace's entities should use one of
    // the workspace-leading indexes, not a full table scan.
    await ensureWorkspace("ws_plan");
    await insertEntityRaw("e_plan", "ws_plan");
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM entities
       WHERE workspace_id = 'ws_plan' AND deleted_at IS NULL
       ORDER BY created_at, id`,
    ).all<{ detail: string }>();
    const plan = results.map((r) => r.detail).join(" ");
    expect(plan).toMatch(/USING INDEX entities_/);
  });
});
