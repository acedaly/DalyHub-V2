import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// AREA-02 — prove the ACTUAL sequential migration 0001 → … → 0009 over a
// database that already contains PRE-EXISTING spine data (an Area, a Goal and
// a Task — none of which are Goals other than the one Goal), mirroring the
// migration-0008 test's approach. We do NOT assume an empty database.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-20T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001–0008 only (everything before AREA-02).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 8));

  // 2. Seed a workspace with pre-existing spine data: an Area, a Goal and a
  // Task (non-Goal).
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m9', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('area_m9', 'ws_m9', 'area', 'Area', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m9', 'area_m9', 'area', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('goal_m9', 'ws_m9', 'goal', 'Existing goal', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m9', 'goal_m9', 'goal', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('task_m9', 'ws_m9', 'task', 'Task', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m9', 'task_m9', 'task', NULL)`,
    ),
  ]);

  // 3. Now apply migration 0009 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0008 → 0009 (goal_details, additive, existing-data safe)", () => {
  it("keeps goal_details STRICT", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goal_details'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("performs NO backfill — an existing Goal has no goal_details row", async () => {
    const row = await DB.prepare(
      "SELECT 1 AS x FROM goal_details WHERE workspace_id = 'ws_m9' AND entity_id = 'goal_m9'",
    ).first();
    expect(row).toBeNull();
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM goal_details",
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("enforces the composite (workspace, entity, type) foreign key — a non-Goal entity cannot receive a goal_details row", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO goal_details (workspace_id, entity_id, target_date, definition_of_done, updated_at)
         VALUES ('ws_m9', 'task_m9', NULL, NULL, ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects a malformed target_date via the CHECK constraint", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO goal_details (workspace_id, entity_id, target_date, definition_of_done, updated_at)
         VALUES ('ws_m9', 'goal_m9', '31-12-2026', NULL, ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("accepts a well-formed target_date", async () => {
    await DB.prepare(
      `INSERT INTO goal_details (workspace_id, entity_id, target_date, definition_of_done, updated_at)
       VALUES ('ws_m9', 'goal_m9', '2026-12-31', NULL, ?)`,
    )
      .bind(AT)
      .run();
    const row = await DB.prepare(
      "SELECT target_date FROM goal_details WHERE workspace_id = 'ws_m9' AND entity_id = 'goal_m9'",
    ).first<{ target_date: string }>();
    expect(row?.target_date).toBe("2026-12-31");
  });

  it("rejects a blank (non-null but empty/whitespace) definition_of_done via the CHECK constraint", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO goal_details (workspace_id, entity_id, target_date, definition_of_done, updated_at)
         VALUES ('ws_m9', 'goal_m9', NULL, '   ', ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects a workspace/entity_id mismatch across workspaces (composite FK, not just entity_id)", async () => {
    await DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m9_other', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    let threw = false;
    try {
      // 'goal_m9' exists in ws_m9, NOT in ws_m9_other.
      await DB.prepare(
        `INSERT INTO goal_details (workspace_id, entity_id, target_date, definition_of_done, updated_at)
         VALUES ('ws_m9_other', 'goal_m9', NULL, NULL, ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rerunning the application's upsert path does not create duplicate rows (idempotent PK)", async () => {
    await DB.prepare(
      `INSERT INTO goal_details (workspace_id, entity_id, target_date, definition_of_done, updated_at)
       VALUES ('ws_m9', 'goal_m9', '2026-01-01', 'Finish it.', ?)
       ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
         target_date = excluded.target_date,
         definition_of_done = excluded.definition_of_done,
         updated_at = excluded.updated_at`,
    )
      .bind(AT)
      .run();
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM goal_details WHERE workspace_id = 'ws_m9' AND entity_id = 'goal_m9'",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
    const row = await DB.prepare(
      "SELECT target_date, definition_of_done FROM goal_details WHERE workspace_id = 'ws_m9' AND entity_id = 'goal_m9'",
    ).first<{ target_date: string; definition_of_done: string }>();
    expect(row).toEqual({
      target_date: "2026-01-01",
      definition_of_done: "Finish it.",
    });
  });
});
