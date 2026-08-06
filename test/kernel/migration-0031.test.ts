import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * M3-01 — migration `0031_remove_theme_preference.sql`.
 *
 * This replaces `migration-0026.test.ts`, which proved the same properties about
 * the same table under the same procedure. 0026 widened the `theme` CHECK; 0031
 * removes the column and the CHECK entirely (ADR-074), so 0026's assertions —
 * "the constraint accepts these eight themes and nothing else" — now describe a
 * column that does not exist. The guarantee worth keeping is not about themes: it
 * is that a TABLE REBUILD of `owner_app_preferences` does not lose or shift data,
 * and that is exactly what this file asserts on the migration that now performs
 * one.
 *
 * A rebuild is where data is genuinely at risk, so these are the properties a
 * deployment depends on:
 *
 *   * the column and its CHECK are actually gone, so nothing can write a theme;
 *   * every OTHER column, constraint, default and the primary key came back;
 *   * a row round-trips with every value intact — the explicit-column-list
 *     `INSERT…SELECT` exists precisely so a value cannot land in a neighbouring
 *     column;
 *   * the workspace index the dropped table owned was recreated.
 */

const DB = env.MIGRATION_TEST_DB;
const WS = "ws_m3_01";
const AT = "2026-08-06T00:00:00.000Z";

beforeAll(async () => {
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
  await DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at) VALUES (?, ?, ?)`,
  )
    .bind(WS, AT, AT)
    .run();
});

/** The rebuilt table's `CREATE TABLE` text, as SQLite stored it. */
async function tableSql(): Promise<string> {
  const row = await DB.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'owner_app_preferences'",
  ).first<{ sql: string }>();
  return row?.sql ?? "";
}

describe("migration 0031 — the theme column is gone", () => {
  it("declares no theme column and no theme CHECK", async () => {
    const sql = await tableSql();
    expect(sql).not.toContain("theme");
    for (const retired of [
      "daly-light",
      "daly-dark",
      "modern-light",
      "modern-dark",
      "eucalypt",
      "coastal",
      "ember",
    ]) {
      expect(sql, `the CHECK still names "${retired}"`).not.toContain(
        `'${retired}'`,
      );
    }
  });

  it("refuses a write naming the removed column", async () => {
    // The storage boundary is the last line of defence. With the column gone, a
    // write that somehow still names it must fail loudly rather than be ignored.
    await expect(
      DB.prepare(
        `INSERT INTO owner_app_preferences
           (workspace_id, owner_id, theme, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(WS, "owner_theme_write", "system", AT, AT)
        .run(),
    ).rejects.toThrow();
  });
});

describe("migration 0031 — the rebuilt table kept its shape", () => {
  it("kept every other constraint, the key, the default and STRICT", async () => {
    const sql = await tableSql();
    expect(sql).toContain("STRICT");
    expect(sql).toContain("PRIMARY KEY (workspace_id, owner_id)");
    expect(sql).toContain(
      "FOREIGN KEY (workspace_id) REFERENCES workspaces(id)",
    );
    expect(sql).toContain("'dmy_slash', 'd_mmm_yyyy', 'iso'");
    expect(sql).toContain("'monday', 'sunday'");
    expect(sql).toContain("'today', 'tasks', 'diary', 'projects', 'notes'");
    expect(sql).toContain("'focus', 'matrix', 'sectors', 'all'");
    expect(sql).toContain("'day', 'timeline'");
    expect(sql).toContain("'inbox', 'chosen_parent'");
    expect(sql).toContain("json_valid(navigation_config)");
    expect(sql).toContain("DEFAULT 'Australia/Sydney'");
    // The temporary rebuild name must not have survived the rename.
    expect(sql).not.toContain("owner_app_preferences_new");
  });

  it("round-trips every surviving column with its value intact", async () => {
    // The rebuild copies by an explicit column list, so this is the assertion
    // that a value cannot silently shift into a neighbouring column.
    await DB.prepare(
      `INSERT INTO owner_app_preferences
         (workspace_id, owner_id, timezone, date_format, first_day_of_week,
          default_landing_destination, default_tasks_view, default_diary_mode,
          navigation_config, version, created_at, updated_at,
          default_task_capture_parent_id, default_task_capture_parent_kind,
          default_task_view_id, default_task_destination)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        WS,
        "owner_round_trip",
        "Europe/London",
        "iso",
        "sunday",
        "projects",
        "matrix",
        "timeline",
        '{"version":1,"hiddenModuleIds":["help"]}',
        3,
        AT,
        AT,
        "prj_1",
        "project",
        "view_1",
        "chosen_parent",
      )
      .run();

    const row = await DB.prepare(
      "SELECT * FROM owner_app_preferences WHERE workspace_id = ? AND owner_id = ?",
    )
      .bind(WS, "owner_round_trip")
      .first<Record<string, unknown>>();

    expect(row).toMatchObject({
      timezone: "Europe/London",
      date_format: "iso",
      first_day_of_week: "sunday",
      default_landing_destination: "projects",
      default_tasks_view: "matrix",
      default_diary_mode: "timeline",
      navigation_config: '{"version":1,"hiddenModuleIds":["help"]}',
      version: 3,
      default_task_capture_parent_id: "prj_1",
      default_task_capture_parent_kind: "project",
      default_task_view_id: "view_1",
      default_task_destination: "chosen_parent",
    });
    expect(row).not.toHaveProperty("theme");
  });

  it("recreated the workspace index the dropped table owned", async () => {
    const row = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'owner_app_preferences_workspace_idx'",
    ).first<{ name: string }>();
    expect(row?.name).toBe("owner_app_preferences_workspace_idx");
  });
});
