import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// FND-05: the real committed migration 0004 creates the expected `activities` and
// `activity_subjects` schema in the fresh, fully-migrated local D1 (0001 → 0002 →
// 0003 → 0004). These run against the actual migrated database, not a mock.

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

describe("migration 0004 — activities schema", () => {
  it("creates the activities and activity_subjects tables", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('activities', 'activity_subjects') ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      "activities",
      "activity_subjects",
    ]);
  });

  it("declares both tables STRICT", async () => {
    for (const table of ["activities", "activity_subjects"]) {
      const row = await env.DB.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
        .bind(table)
        .first<{ sql: string }>();
      expect(row?.sql).toMatch(/\bSTRICT\b/);
    }
  });

  it("defines exactly the justified activities columns (no updated_at/deleted_at/title/status)", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(activities)",
    ).all<TableInfoRow>();
    const columns = results.map((c) => c.name).sort();
    expect(columns).toEqual(
      [
        "actor_id",
        "actor_type",
        "id",
        "occurred_at",
        "payload_json",
        "type",
        "workspace_id",
      ].sort(),
    );
    // Explicitly forbidden mutable/entity-like fields must be absent.
    for (const forbidden of [
      "updated_at",
      "deleted_at",
      "title",
      "entity_type",
      "status",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("makes activities.id the primary key and only actor_id nullable", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(activities)",
    ).all<TableInfoRow>();
    const byName = new Map(results.map((c) => [c.name, c]));

    expect(byName.get("id")?.pk).toBe(1);
    for (const notNull of [
      "id",
      "workspace_id",
      "type",
      "actor_type",
      "occurred_at",
      "payload_json",
    ]) {
      expect(byName.get(notNull)?.notnull).toBe(1);
    }
    expect(byName.get("actor_id")?.notnull).toBe(0);
  });

  it("declares the activities workspace foreign key with ON DELETE RESTRICT", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA foreign_key_list(activities)",
    ).all<ForeignKeyRow>();
    expect(results).toHaveLength(1);
    expect(results[0]!.table).toBe("workspaces");
    expect(results[0]!.from).toBe("workspace_id");
    expect(results[0]!.to).toBe("id");
    expect(results[0]!.on_delete).toBe("RESTRICT");
  });

  it("creates the parent UNIQUE key on activities(workspace_id, id)", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA index_list(activities)",
    ).all<{ name: string; unique: number }>();
    const parent = results.find(
      (i) => i.name === "activities_workspace_id_key",
    );
    expect(parent?.unique).toBe(1);

    const { results: cols } = await env.DB.prepare(
      "PRAGMA index_info(activities_workspace_id_key)",
    ).all<{ name: string }>();
    expect(cols.map((c) => c.name)).toEqual(["workspace_id", "id"]);
  });

  it("creates the two activities access-path indexes", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activities' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual(
      [
        "activities_workspace_id_key",
        "activities_workspace_occurred_idx",
        "activities_workspace_type_occurred_idx",
      ].sort(),
    );
  });

  it("defines exactly the justified activity_subjects columns", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(activity_subjects)",
    ).all<TableInfoRow>();
    expect(results.map((c) => c.name).sort()).toEqual(
      ["activity_id", "entity_id", "role", "workspace_id"].sort(),
    );
    for (const c of results) {
      expect(c.notnull).toBe(1);
    }
  });

  it("makes (workspace_id, activity_id, entity_id) the composite primary key", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(activity_subjects)",
    ).all<TableInfoRow>();
    const pkOrder = results
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    expect(pkOrder).toEqual(["workspace_id", "activity_id", "entity_id"]);
  });

  it("declares both composite foreign keys with ON DELETE RESTRICT", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA foreign_key_list(activity_subjects)",
    ).all<ForeignKeyRow>();
    expect(results.every((r) => r.on_delete === "RESTRICT")).toBe(true);

    const byId = new Map<number, ForeignKeyRow[]>();
    for (const r of results) {
      const list = byId.get(r.id) ?? [];
      list.push(r);
      byId.set(r.id, list);
    }
    const targets = [...byId.values()]
      .map((rows) => {
        const mapping = new Map(rows.map((r) => [r.from, r.to]));
        expect(mapping.get("workspace_id")).toBe("workspace_id");
        return rows[0]!.table;
      })
      .sort();
    expect(targets).toEqual(["activities", "entities"]);
  });

  it("creates the entity-subject access-path index", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'activity_subjects' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toContain(
      "activity_subjects_entity_idx",
    );
  });

  it("leaves foreign-key enforcement enabled and no temp table behind", async () => {
    const fk = await env.DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(fk?.foreign_keys).toBe(1);

    const temp = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'",
    ).first<{ name: string }>();
    expect(temp).toBeNull();
  });
});
