import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

// TASKS-01: prove the ACTUAL sequential migration 0001 → … → 0012 over a database
// that ALREADY contains task rows with the LEGACY priority set. We apply 0001–0011,
// seed a task_details row with a legacy `high` priority, then apply 0012 and observe
// the real result: the priority is remapped (high → p1), the new columns exist with
// their documented defaults, the widened status/priority CHECK sets are enforced, the
// table stays STRICT, and the new indexes exist. We do NOT assume the DB is empty.

const DB = env.MIGRATION_TEST_DB;
const AT = "2026-07-24T00:00:00.000Z";

beforeAll(async () => {
  // 1. Apply migrations 0001–0011 only (everything before TASKS-01).
  await applyD1Migrations(DB, env.TEST_MIGRATIONS.slice(0, 11));

  // 2. Seed a workspace + a task with a legacy-priority details row.
  await DB.batch([
    DB.prepare(
      `INSERT INTO workspaces (id, created_at, updated_at) VALUES ('ws_m12', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at)
       VALUES ('t12', 'ws_m12', 'task', 'Legacy task', ?, ?)`,
    ).bind(AT, AT),
    DB.prepare(
      `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES ('ws_m12', 't12', 'task', NULL)`,
    ),
    DB.prepare(
      `INSERT INTO task_details
         (workspace_id, entity_id, entity_type, status, priority, due_date,
          scheduled_date, description, updated_at)
       VALUES ('ws_m12', 't12', 'task', 'in_progress', 'high', '2026-08-01', NULL, 'Body', ?)`,
    ).bind(AT),
  ]);

  // 3. Now apply migration 0012 over the seeded data.
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0011 → 0012 (data-preserving rebuild)", () => {
  it("remaps the legacy priority (high → p1) and preserves other fields", async () => {
    const row = await DB.prepare(
      "SELECT status, priority, due_date, description FROM task_details WHERE entity_id = 't12'",
    ).first<{
      status: string;
      priority: string;
      due_date: string;
      description: string;
    }>();
    expect(row).toEqual({
      status: "in_progress",
      priority: "p1",
      due_date: "2026-08-01",
      description: "Body",
    });
  });

  it("adds the new columns with documented defaults", async () => {
    const row = await DB.prepare(
      `SELECT time_sector, commitment_state, delegate_to, delegated_on,
              follow_up_on, delegate_note FROM task_details WHERE entity_id = 't12'`,
    ).first<Record<string, string | null>>();
    expect(row).toEqual({
      time_sector: null,
      commitment_state: "active",
      delegate_to: null,
      delegated_on: null,
      follow_up_on: null,
      delegate_note: null,
    });
  });

  it("keeps task_details STRICT and enforces the widened priority set", async () => {
    const table = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_details'",
    ).first<{ sql: string }>();
    expect(table?.sql).toMatch(/\bSTRICT\b/);

    // A widened status value (on_hold) is now allowed.
    await DB.prepare(
      "UPDATE task_details SET status = 'on_hold' WHERE entity_id = 't12'",
    ).run();
    // A legacy priority value is now rejected by the CHECK.
    let threw = false;
    try {
      await DB.prepare(
        "UPDATE task_details SET priority = 'high' WHERE entity_id = 't12'",
      ).run();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("rejects an invalid time_sector and commitment_state", async () => {
    let sectorThrew = false;
    try {
      await DB.prepare(
        "UPDATE task_details SET time_sector = 'someday' WHERE entity_id = 't12'",
      ).run();
    } catch {
      sectorThrew = true;
    }
    expect(sectorThrew).toBe(true);

    let commitThrew = false;
    try {
      await DB.prepare(
        "UPDATE task_details SET commitment_state = 'parked' WHERE entity_id = 't12'",
      ).run();
    } catch {
      commitThrew = true;
    }
    expect(commitThrew).toBe(true);
  });

  it("creates the new access-path indexes", async () => {
    for (const name of [
      "task_details_workspace_due_idx",
      "task_details_waiting_idx",
      "task_details_workspace_sector_idx",
      "task_details_workspace_someday_idx",
      "task_details_workspace_scheduled_idx",
    ]) {
      const idx = await DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
        .bind(name)
        .first<{ name: string }>();
      expect(idx?.name).toBe(name);
    }
  });
});
