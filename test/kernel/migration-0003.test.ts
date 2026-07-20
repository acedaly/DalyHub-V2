import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// FND-04: prove the ACTUAL sequential migration 0001 → 0002 → 0003 against seeded
// data on MIGRATION_TEST_DB — a second, deliberately un-migrated local D1 (see
// vitest.workers.config.ts). We apply 0001+0002, seed workspaces and entities,
// then apply 0003 and observe the real result: existing rows survive, the new
// table/keys exist, and the composite foreign keys enforce same-workspace
// endpoints. We do NOT assume the database is empty when 0003 runs.

const DB = env.MIGRATION_TEST_DB;

const AT = "2026-07-17T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001 and 0002 only.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 2));

  // 2. Seed two workspaces and some entities under them.
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_a', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_b', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('a1', 'ws_a', 'task', 'A1', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('a2', 'ws_a', 'note', 'A2', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('b1', 'ws_b', 'task', 'B1', ?, ?)`,
    ).bind(AT, AT),
  ]);

  // 3. Now apply migration 0003 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0002 → 0003 (existing-data preservation & new schema)", () => {
  it("preserves every pre-existing entity and workspace row unchanged", async () => {
    const entities = await DB.prepare(
      "SELECT id FROM entities ORDER BY id",
    ).all<{ id: string }>();
    expect(entities.results.map((r) => r.id)).toEqual(["a1", "a2", "b1"]);

    const workspaces = await DB.prepare(
      "SELECT id FROM workspaces ORDER BY id",
    ).all<{ id: string }>();
    expect(workspaces.results.map((r) => r.id)).toEqual(["ws_a", "ws_b"]);
  });

  it("creates the entity_links table as STRICT", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entity_links'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("creates the parent unique key and the link indexes", async () => {
    const parent = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'entities_workspace_id_key'",
    ).first<{ name: string }>();
    expect(parent?.name).toBe("entities_workspace_id_key");

    const { results } = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entity_links' AND name NOT LIKE 'sqlite_%'",
    ).all<{ name: string }>();
    // The sequential apply runs every committed migration, so the fully-migrated
    // DB also carries the FND-07 (0005) one-active-parent and the TODAY-03 (0007)
    // one-active-waiting partial unique indexes.
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

  it("lets a valid same-workspace link insert succeed", async () => {
    await DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', 'ws_a', 'a1', 'a2', 'task.relates_to', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    const row = await DB.prepare(
      "SELECT id FROM entity_links WHERE id = 'l1'",
    ).first<{ id: string }>();
    expect(row?.id).toBe("l1");
  });

  it("rejects a cross-workspace endpoint via the composite foreign key", async () => {
    // ws_a link pointing at b1 (which lives in ws_b) must fail: there is no
    // entities row with (workspace_id='ws_a', id='b1').
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
         VALUES ('l_bad', 'ws_a', 'a1', 'b1', 'task.relates_to', ?, ?)`,
      )
        .bind(AT, AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("leaves foreign keys enabled and no temp table behind", async () => {
    const fk = await DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(fk?.foreign_keys).toBe(1);

    const temp = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_new'",
    ).first<{ name: string }>();
    expect(temp).toBeNull();
  });
});
