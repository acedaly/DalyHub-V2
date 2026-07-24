import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// NOTES-01A — prove the ACTUAL sequential migration 0001 → … → 0010 over a
// database that already contains PRE-EXISTING data (a Note entity and a
// non-Note entity), mirroring the migration-0009 test's approach. We do NOT
// assume an empty database.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-24T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001–0009 only (everything before NOTES-01A).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 9));

  // 2. Seed a workspace with pre-existing data: a Note and a non-Note entity.
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m10', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('note_m10', 'ws_m10', 'note', 'Existing note', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('task_m10', 'ws_m10', 'task', 'Task', ?, ?)`,
    ).bind(AT, AT),
  ]);

  // 3. Now apply migration 0010 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0009 → 0010 (note_details, additive, existing-data safe)", () => {
  it("keeps note_details STRICT", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'note_details'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("performs NO backfill — an existing Note has no note_details row", async () => {
    const row = await DB.prepare(
      "SELECT 1 AS x FROM note_details WHERE workspace_id = 'ws_m10' AND entity_id = 'note_m10'",
    ).first();
    expect(row).toBeNull();
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM note_details",
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it("enforces the composite (workspace, entity, type) foreign key — a non-Note entity cannot receive a note_details row", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO note_details (workspace_id, entity_id, content, updated_at)
         VALUES ('ws_m10', 'task_m10', '', ?)`,
      )
        .bind(AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("accepts an empty-string content value (valid, meaningful Markdown)", async () => {
    await DB.prepare(
      `INSERT INTO note_details (workspace_id, entity_id, content, updated_at)
       VALUES ('ws_m10', 'note_m10', '', ?)`,
    )
      .bind(AT)
      .run();
    const row = await DB.prepare(
      "SELECT content FROM note_details WHERE workspace_id = 'ws_m10' AND entity_id = 'note_m10'",
    ).first<{ content: string }>();
    expect(row?.content).toBe("");
  });

  it("rejects a NULL content value (NOT NULL, no rendered-HTML/nullable-body escape hatch)", async () => {
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO note_details (workspace_id, entity_id, content, updated_at)
         VALUES ('ws_m10', 'note_m10', NULL, ?)`,
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
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m10_other', ?, ?)`,
    )
      .bind(AT, AT)
      .run();
    let threw = false;
    try {
      // 'note_m10' exists in ws_m10, NOT in ws_m10_other.
      await DB.prepare(
        `INSERT INTO note_details (workspace_id, entity_id, content, updated_at)
         VALUES ('ws_m10_other', 'note_m10', '', ?)`,
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
      `INSERT INTO note_details (workspace_id, entity_id, content, updated_at)
       VALUES ('ws_m10', 'note_m10', 'Hello, world.', ?)
       ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
         content = excluded.content,
         updated_at = excluded.updated_at`,
    )
      .bind(AT)
      .run();
    const count = await DB.prepare(
      "SELECT COUNT(*) AS n FROM note_details WHERE workspace_id = 'ws_m10' AND entity_id = 'note_m10'",
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
    const row = await DB.prepare(
      "SELECT content FROM note_details WHERE workspace_id = 'ws_m10' AND entity_id = 'note_m10'",
    ).first<{ content: string }>();
    expect(row?.content).toBe("Hello, world.");
  });
});
