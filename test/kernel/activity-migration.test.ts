import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// FND-05: prove the ACTUAL sequential migration 0001 → 0002 → 0003 → 0004 against
// seeded data on MIGRATION_TEST_DB — a second, deliberately un-migrated local D1.
// We apply 0001–0003, seed workspaces, entities and a link, then apply 0004 and
// observe the real result: existing rows survive, the new tables/keys exist, and
// the composite foreign keys enforce same-workspace subjects. We do NOT assume the
// database is empty when 0004 runs.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-18T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001, 0002 and 0003 only (all but the last).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 3));

  // 2. Seed workspaces, entities and a link under them.
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
    DB.prepare(
      `INSERT INTO entity_links
         (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
       VALUES ('l1', 'ws_a', 'a1', 'a2', 'task.relates_to', ?, ?)`,
    ).bind(AT, AT),
  ]);

  // 3. Now apply migration 0004 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0003 → 0004 (existing-data preservation & new schema)", () => {
  it("preserves every pre-existing entity, workspace and link row unchanged", async () => {
    const entities = await DB.prepare(
      "SELECT id FROM entities ORDER BY id",
    ).all<{ id: string }>();
    expect(entities.results.map((r) => r.id)).toEqual(["a1", "a2", "b1"]);

    const workspaces = await DB.prepare(
      "SELECT id FROM workspaces ORDER BY id",
    ).all<{ id: string }>();
    expect(workspaces.results.map((r) => r.id)).toEqual(["ws_a", "ws_b"]);

    const links = await DB.prepare("SELECT id FROM entity_links").all<{
      id: string;
    }>();
    expect(links.results.map((r) => r.id)).toEqual(["l1"]);
  });

  it("creates the activities and activity_subjects tables as STRICT", async () => {
    for (const table of ["activities", "activity_subjects"]) {
      const row = await DB.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
        .bind(table)
        .first<{ sql: string }>();
      expect(row?.sql).toMatch(/\bSTRICT\b/);
    }
  });

  it("does NOT backfill any Activity events for pre-existing rows", async () => {
    const row = await DB.prepare("SELECT COUNT(*) AS n FROM activities").first<{
      n: number;
    }>();
    expect(row?.n).toBe(0);
  });

  it("lets a valid same-workspace activity + subject insert succeed", async () => {
    await DB.batch([
      DB.prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         VALUES ('act1', 'ws_a', 'entity.created', 'system', NULL, ?, '{}')`,
      ).bind(AT),
      DB.prepare(
        `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
         VALUES ('ws_a', 'act1', 'a1', 'subject')`,
      ),
    ]);
    const row = await DB.prepare(
      "SELECT id FROM activities WHERE id = 'act1'",
    ).first<{ id: string }>();
    expect(row?.id).toBe("act1");
  });

  it("rejects a cross-workspace subject via the composite foreign key", async () => {
    // An activity in ws_a with a subject entity b1 (which lives in ws_b) must
    // fail: there is no entities row with (workspace_id='ws_a', id='b1').
    await DB.prepare(
      `INSERT INTO activities
         (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES ('act2', 'ws_a', 'entity.created', 'system', NULL, ?, '{}')`,
    )
      .bind(AT)
      .run();
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
         VALUES ('ws_a', 'act2', 'b1', 'subject')`,
      ).run();
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
