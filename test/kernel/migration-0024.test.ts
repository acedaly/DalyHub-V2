import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * TASKS-04 — migration `0024_tasks04_daily_driver.sql`.
 *
 * The migration is purely ADDITIVE: one column on `owner_app_preferences` and one new
 * `task_recurrence_rules` table. These assertions are about the SHAPE that has to
 * survive a production apply — the default that makes existing preference rows behave
 * correctly, the constraints that keep a stored rule meaningful, and the uniqueness
 * boundary that makes successor creation idempotent.
 */

const DB = env.MIGRATION_TEST_DB;

beforeAll(async () => {
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

/** Insert a workspace + a task entity + spine record, so a rule has something real. */
async function seedTask(workspaceId: string, taskId: string): Promise<void> {
  await DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
     VALUES (?, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`,
  )
    .bind(workspaceId)
    .run();
  await DB.prepare(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'task', 'Repeating task', '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z', NULL)`,
  )
    .bind(taskId, workspaceId)
    .run();
}

async function insertRule(
  workspaceId: string,
  taskId: string,
  over: Partial<{
    dateKind: string;
    frequency: string;
    interval: number;
    weekdays: string | null;
    anchorDay: number | null;
    anchorMonth: number | null;
    seriesId: string;
    sequence: number;
  }> = {},
) {
  return DB.prepare(
    `INSERT INTO task_recurrence_rules
       (workspace_id, entity_id, entity_type, date_kind, frequency, interval,
        weekdays, anchor_day, anchor_month, series_id, sequence, created_at, updated_at)
     VALUES (?, ?, 'task', ?, ?, ?, ?, ?, ?, ?, ?, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`,
  )
    .bind(
      workspaceId,
      taskId,
      over.dateKind ?? "scheduled",
      over.frequency ?? "week",
      over.interval ?? 1,
      over.weekdays ?? null,
      over.anchorDay ?? null,
      over.anchorMonth ?? null,
      over.seriesId ?? taskId,
      over.sequence ?? 0,
    )
    .run();
}

describe("migration 0024 — the default task destination", () => {
  it("adds the column with an 'inbox' default, so EXISTING preference rows file to Inbox", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'owner_app_preferences'",
    ).first<{ sql: string }>();
    expect(row?.sql).toContain("default_task_destination");
    expect(row?.sql).toMatch(/DEFAULT 'inbox'/);
    // A legacy saved parent cannot silently keep filing ahead of Inbox: the owner's
    // intent has to be stated explicitly.
    expect(row?.sql).toContain("'inbox', 'chosen_parent'");
  });

  it("rejects an unknown destination", async () => {
    await DB.prepare(
      `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
       VALUES ('ws_m23_pref', '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`,
    ).run();
    await expect(
      DB.prepare(
        `INSERT INTO owner_app_preferences (
          workspace_id, owner_id, timezone, date_format, first_day_of_week,
          default_landing_destination, default_tasks_view, default_diary_mode,
          navigation_config, default_task_destination, created_at, updated_at
        ) VALUES ('ws_m23_pref', 'owner', 'Australia/Sydney', 'd_mmm_yyyy',
          'monday', 'today', 'focus', 'day', '{"version":1,"hiddenModuleIds":[]}',
          'somewhere_else', '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`,
      ).run(),
    ).rejects.toThrow();
  });
});

describe("migration 0024 — task_recurrence_rules", () => {
  it("is a STRICT table keyed one-rule-per-task", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_recurrence_rules'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
    expect(row?.sql).toContain("PRIMARY KEY (workspace_id, entity_id)");
    expect(row?.sql).toContain("UNIQUE (workspace_id, series_id, sequence)");
  });

  it("stores a rule against a real task", async () => {
    await seedTask("ws_m23_a", "ent_m23_a");
    const result = await insertRule("ws_m23_a", "ent_m23_a");
    expect(result.meta.changes).toBe(1);
  });

  it("rejects a rule whose entity does not exist (the FK is real)", async () => {
    await expect(insertRule("ws_m23_a", "ent_m23_missing")).rejects.toThrow();
  });

  it("rejects an unknown frequency, an unknown date kind and an out-of-range interval", async () => {
    await seedTask("ws_m23_b", "ent_m23_b");
    await expect(
      insertRule("ws_m23_b", "ent_m23_b", { frequency: "fortnight" }),
    ).rejects.toThrow();
    await expect(
      insertRule("ws_m23_b", "ent_m23_b", { dateKind: "whenever" }),
    ).rejects.toThrow();
    await expect(
      insertRule("ws_m23_b", "ent_m23_b", { interval: 0 }),
    ).rejects.toThrow();
    await expect(
      insertRule("ws_m23_b", "ent_m23_b", { interval: 100 }),
    ).rejects.toThrow();
  });

  it("requires the anchors a monthly and a yearly rule cannot work without", async () => {
    await seedTask("ws_m23_c", "ent_m23_c");
    await expect(
      insertRule("ws_m23_c", "ent_m23_c", { frequency: "month" }),
    ).rejects.toThrow();
    await expect(
      insertRule("ws_m23_c", "ent_m23_c", {
        frequency: "year",
        anchorDay: 29,
      }),
    ).rejects.toThrow();
    const ok = await insertRule("ws_m23_c", "ent_m23_c", {
      frequency: "year",
      anchorDay: 29,
      anchorMonth: 2,
    });
    expect(ok.meta.changes).toBe(1);
  });

  it("refuses a second occurrence at the same position in a series", async () => {
    await seedTask("ws_m23_d", "ent_m23_d1");
    await seedTask("ws_m23_d", "ent_m23_d2");
    await insertRule("ws_m23_d", "ent_m23_d1", {
      seriesId: "series_m23",
      sequence: 1,
    });
    // THE duplicate-successor boundary: two completions cannot both create
    // occurrence 1 of the same series.
    await expect(
      insertRule("ws_m23_d", "ent_m23_d2", {
        seriesId: "series_m23",
        sequence: 1,
      }),
    ).rejects.toThrow();
    // The NEXT position is fine.
    const next = await insertRule("ws_m23_d", "ent_m23_d2", {
      seriesId: "series_m23",
      sequence: 2,
    });
    expect(next.meta.changes).toBe(1);
  });

  it("does not obstruct the Task lifecycle: a task with a rule still SOFT-deletes", async () => {
    await seedTask("ws_m23_e", "ent_m23_e");
    await insertRule("ws_m23_e", "ent_m23_e");
    // Tasks are only ever soft-deleted, so the ON DELETE RESTRICT never fires.
    const result = await DB.prepare(
      `UPDATE entities SET deleted_at = '2026-07-31T01:00:00.000Z'
       WHERE workspace_id = 'ws_m23_e' AND id = 'ent_m23_e'`,
    ).run();
    expect(result.meta.changes).toBe(1);
    const rule = await DB.prepare(
      "SELECT entity_id FROM task_recurrence_rules WHERE workspace_id = 'ws_m23_e'",
    ).first<{ entity_id: string }>();
    // The rule survives the soft delete, so restoring the task restores its repeat.
    expect(rule?.entity_id).toBe("ent_m23_e");
  });
});
