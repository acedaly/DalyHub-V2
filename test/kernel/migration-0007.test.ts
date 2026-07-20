import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// TODAY-03: prove the ACTUAL sequential migration 0001 → … → 0007 over a database
// that ALREADY contains TODAY-02 task rows (an `entities` task, its `spine_records`
// row and a `task_details` row). We apply 0001–0006, seed that data, then apply
// 0007 and observe the real result: existing rows survive untouched, the two new
// nullable columns exist and default to NULL (not waiting), and the new indexes
// exist. We do NOT assume the database is empty when 0007 runs.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-19T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001–0006 only (everything before TODAY-03).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 6));

  // 2. Seed a workspace + a TODAY-02 task with a details row (no waiting columns).
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m7', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('t7', 'ws_m7', 'task', 'Existing task', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m7', 't7', 'task', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO task_details
         (workspace_id, entity_id, entity_type, status, priority, due_date,
          scheduled_date, description, updated_at)
       VALUES ('ws_m7', 't7', 'task', 'todo', 'high', '2026-08-01', NULL, 'Body', ?)`,
    ).bind(AT),
  ]);

  // 3. Now apply migration 0007 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0006 → 0007 (additive, existing-data safe)", () => {
  it("preserves the pre-existing task_details row unchanged", async () => {
    const row = await DB.prepare(
      "SELECT status, priority, due_date, description FROM task_details WHERE entity_id = 't7'",
    ).first<{
      status: string;
      priority: string;
      due_date: string;
      description: string;
    }>();
    expect(row).toEqual({
      status: "todo",
      priority: "high",
      due_date: "2026-08-01",
      description: "Body",
    });
  });

  it("adds waiting_since and waiting_note columns defaulting to NULL", async () => {
    const row = await DB.prepare(
      "SELECT waiting_since, waiting_note FROM task_details WHERE entity_id = 't7'",
    ).first<{ waiting_since: string | null; waiting_note: string | null }>();
    expect(row).toEqual({ waiting_since: null, waiting_note: null });
  });

  it("keeps task_details STRICT after ADD COLUMN", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_details'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
  });

  it("creates the one-active-waiting partial unique index", async () => {
    const idx = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'entity_links_one_active_waiting_idx'",
    ).first<{ name: string }>();
    expect(idx?.name).toBe("entity_links_one_active_waiting_idx");

    const listIdx = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'task_details_waiting_idx'",
    ).first<{ name: string }>();
    expect(listIdx?.name).toBe("task_details_waiting_idx");
  });

  it("lets an existing task be marked waiting after the migration", async () => {
    await DB.prepare(
      "UPDATE task_details SET waiting_since = ?, waiting_note = 'finance' WHERE entity_id = 't7'",
    )
      .bind("2026-07-20T00:00:00.000Z")
      .run();
    const row = await DB.prepare(
      "SELECT waiting_since, waiting_note FROM task_details WHERE entity_id = 't7'",
    ).first<{ waiting_since: string; waiting_note: string }>();
    expect(row).toEqual({
      waiting_since: "2026-07-20T00:00:00.000Z",
      waiting_note: "finance",
    });
  });

  it("enforces at most one active task.waiting_on link per task", async () => {
    await DB.batch([
      DB.prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
         VALUES ('p7a', 'ws_m7', 'person', 'A', ?, ?)`,
      ).bind(AT, AT),
      DB.prepare(
        `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
         VALUES ('p7b', 'ws_m7', 'person', 'B', ?, ?)`,
      ).bind(AT, AT),
      DB.prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
         VALUES ('wl7', 'ws_m7', 't7', 'p7a', 'task.waiting_on', ?, ?)`,
      ).bind(AT, AT),
    ]);
    // A second ACTIVE waiting link from the same task must fail the partial unique index.
    let threw = false;
    try {
      await DB.prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at)
         VALUES ('wl7b', 'ws_m7', 't7', 'p7b', 'task.waiting_on', ?, ?)`,
      )
        .bind(AT, AT)
        .run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
