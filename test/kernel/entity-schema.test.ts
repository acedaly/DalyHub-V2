import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Scenario 1: the real committed migration creates the expected schema in a
// fresh local D1. These tests run against the actual migrated database, not a
// hand-written or mocked schema.

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

describe("migration 0001 — entities schema", () => {
  it("creates the entities table", async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entities'",
    ).first<{ name: string }>();
    expect(row?.name).toBe("entities");
  });

  it("defines exactly the shared base columns", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(entities)",
    ).all<TableInfoRow>();
    const columns = results.map((c) => c.name).sort();
    expect(columns).toEqual(
      [
        "created_at",
        "deleted_at",
        "id",
        "title",
        "type",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });

  it("makes id the primary key and only deleted_at nullable", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(entities)",
    ).all<TableInfoRow>();
    const byName = new Map(results.map((c) => [c.name, c]));

    expect(byName.get("id")?.pk).toBe(1);
    for (const notNull of [
      "id",
      "workspace_id",
      "type",
      "title",
      "created_at",
      "updated_at",
    ]) {
      expect(byName.get(notNull)?.notnull).toBe(1);
    }
    expect(byName.get("deleted_at")?.notnull).toBe(0);
  });

  it("creates the expected access-path indexes", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entities' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    const indexes = results.map((r) => r.name).sort();
    // Migration 0001 creates the four access-path indexes; migration 0003 later
    // adds the `entities_workspace_id_key` UNIQUE parent key (referenced by the
    // entity_links composite foreign keys). On the fully-migrated database all
    // five are present.
    expect(indexes).toEqual(
      [
        "entities_active_workspace_created_idx",
        "entities_active_workspace_type_created_idx",
        "entities_workspace_created_idx",
        "entities_workspace_type_created_idx",
        "entities_workspace_id_key",
      ].sort(),
    );
  });

  it("enforces the not-empty title CHECK constraint at the database", async () => {
    // The kernel validates first, but the DB is the backstop. A blank title is
    // rejected by the CHECK constraint even if inserted directly. The workspace
    // must exist first (FK), so the CHECK — not the FK — is what rejects this.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
       VALUES ('ws_check', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
         VALUES ('x', 'ws_check', 'task', '   ', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')`,
      ).run(),
    ).rejects.toThrow();
  });

  it("keeps the four access-path indexes after the 0002 rebuild, plus the FND-04 parent key", async () => {
    // Migration 0002 rebuilds `entities`; its four access-path indexes must be
    // recreated, not lost (also asserted in migration-0002.test.ts). Migration
    // 0003 then adds the `entities_workspace_id_key` UNIQUE parent key that the
    // entity_links composite foreign keys reference — so on the fully-migrated
    // database exactly these five indexes exist.
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entities' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual(
      [
        "entities_active_workspace_created_idx",
        "entities_active_workspace_type_created_idx",
        "entities_workspace_created_idx",
        "entities_workspace_type_created_idx",
        "entities_workspace_id_key",
      ].sort(),
    );
  });
});
