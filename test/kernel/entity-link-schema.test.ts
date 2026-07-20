import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// FND-04: the real committed migration 0003 creates the expected `entity_links`
// schema in the fresh, fully-migrated local D1. These run against the actual
// migrated database (0001 → 0002 → 0003), not a hand-written or mocked schema.

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

describe("migration 0003 — entity_links schema", () => {
  it("creates the entity_links table", async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entity_links'",
    ).first<{ name: string }>();
    expect(row?.name).toBe("entity_links");
  });

  it("is declared STRICT", async () => {
    const row = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entity_links'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("defines exactly the justified kernel columns", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(entity_links)",
    ).all<TableInfoRow>();
    const columns = results.map((c) => c.name).sort();
    expect(columns).toEqual(
      [
        "created_at",
        "deleted_at",
        "id",
        "source_entity_id",
        "target_entity_id",
        "type",
        "updated_at",
        "workspace_id",
      ].sort(),
    );
  });

  it("makes id the primary key and only deleted_at nullable", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(entity_links)",
    ).all<TableInfoRow>();
    const byName = new Map(results.map((c) => [c.name, c]));

    expect(byName.get("id")?.pk).toBe(1);
    for (const notNull of [
      "id",
      "workspace_id",
      "source_entity_id",
      "target_entity_id",
      "type",
      "created_at",
      "updated_at",
    ]) {
      expect(byName.get(notNull)?.notnull).toBe(1);
    }
    expect(byName.get("deleted_at")?.notnull).toBe(0);
  });

  it("declares the source and target composite foreign keys to entities(workspace_id, id) with ON DELETE RESTRICT", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA foreign_key_list(entity_links)",
    ).all<ForeignKeyRow>();

    // Every FK uses ON DELETE RESTRICT.
    expect(results.every((r) => r.on_delete === "RESTRICT")).toBe(true);

    // Group rows by FK id (a composite FK spans multiple rows).
    const byId = new Map<number, ForeignKeyRow[]>();
    for (const r of results) {
      const list = byId.get(r.id) ?? [];
      list.push(r);
      byId.set(r.id, list);
    }

    // The two composite FKs to `entities` map (workspace_id, <endpoint>) →
    // (workspace_id, id). Collect their endpoint column as a signature.
    const entityFkSignatures = [...byId.values()]
      .filter((rows) => rows.every((r) => r.table === "entities"))
      .map((rows) => {
        const mapping = new Map(rows.map((r) => [r.from, r.to]));
        expect(mapping.get("workspace_id")).toBe("workspace_id");
        // Exactly one of source/target maps to entities.id.
        const endpoint = mapping.has("source_entity_id")
          ? "source_entity_id"
          : "target_entity_id";
        expect(mapping.get(endpoint)).toBe("id");
        return endpoint;
      })
      .sort();

    expect(entityFkSignatures).toEqual([
      "source_entity_id",
      "target_entity_id",
    ]);

    // And a direct workspace FK exists too.
    const hasWorkspaceFk = [...byId.values()].some((rows) =>
      rows.every((r) => r.table === "workspaces"),
    );
    expect(hasWorkspaceFk).toBe(true);
  });

  it("creates the required parent UNIQUE key on entities(workspace_id, id)", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA index_list(entities)",
    ).all<{ name: string; unique: number }>();
    const parent = results.find((i) => i.name === "entities_workspace_id_key");
    expect(parent).toBeDefined();
    expect(parent?.unique).toBe(1);

    const { results: cols } = await env.DB.prepare(
      "PRAGMA index_info(entities_workspace_id_key)",
    ).all<{ name: string }>();
    expect(cols.map((c) => c.name)).toEqual(["workspace_id", "id"]);
  });

  it("creates the identity uniqueness index and the four access-path indexes", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entity_links' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    // Migration 0003 creates the identity index and the four access-path indexes;
    // migration 0005 (FND-07) adds `entity_links_one_active_parent_idx`, the
    // partial UNIQUE index enforcing at most one active structural parent per child;
    // migration 0007 (TODAY-03) adds `entity_links_one_active_waiting_idx`, the
    // partial UNIQUE index enforcing at most one active `task.waiting_on` per task.
    expect(results.map((r) => r.name).sort()).toEqual(
      [
        "entity_links_identity_idx",
        "entity_links_active_source_idx",
        "entity_links_active_target_idx",
        "entity_links_active_source_type_idx",
        "entity_links_active_target_type_idx",
        "entity_links_one_active_parent_idx",
        "entity_links_one_active_waiting_idx",
      ].sort(),
    );
  });

  it("makes the identity index unique over (workspace_id, source, target, type)", async () => {
    const list = await env.DB.prepare("PRAGMA index_list(entity_links)").all<{
      name: string;
      unique: number;
    }>();
    const identity = list.results.find(
      (i) => i.name === "entity_links_identity_idx",
    );
    expect(identity?.unique).toBe(1);

    const { results: cols } = await env.DB.prepare(
      "PRAGMA index_info(entity_links_identity_idx)",
    ).all<{ name: string }>();
    expect(cols.map((c) => c.name)).toEqual([
      "workspace_id",
      "source_entity_id",
      "target_entity_id",
      "type",
    ]);
  });

  it("leaves foreign-key enforcement enabled", async () => {
    const row = await env.DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(row?.foreign_keys).toBe(1);
  });

  it("leaves no temporary migration table behind", async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'",
    ).first<{ name: string }>();
    expect(row).toBeNull();
  });
});
