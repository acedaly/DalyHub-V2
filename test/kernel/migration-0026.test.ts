import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * THEME-02 — migration `0026_extend_theme_preference_choices.sql`.
 *
 * This is the one migration in the range that is a TABLE REBUILD rather than an
 * `ALTER TABLE … ADD COLUMN`, because SQLite cannot widen a CHECK in place. A
 * rebuild is where data is genuinely at risk, so these assertions are about the
 * properties a deployment depends on:
 *
 *   * the widened constraint actually accepts the two new themes;
 *   * it still REJECTS anything else, so the storage boundary is not now open;
 *   * every previously-legal theme is still legal — nobody's stored choice becomes
 *     un-writable;
 *   * a preference row written before the rebuild survives it with every column
 *     intact, not just the theme;
 *   * the table's other constraints, its primary key, its default and its index all
 *     came back.
 */

const DB = env.MIGRATION_TEST_DB;
const WS = "ws_theme02";
const AT = "2026-08-02T00:00:00.000Z";

beforeAll(async () => {
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
  await DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at) VALUES (?, ?, ?)`,
  )
    .bind(WS, AT, AT)
    .run();
});

/** Insert one preference row, returning the D1 result so a failure is visible. */
async function insertPreferences(ownerId: string, theme: string) {
  return DB.prepare(
    `INSERT INTO owner_app_preferences
       (workspace_id, owner_id, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(WS, ownerId, theme, AT, AT)
    .run();
}

describe("migration 0026 — the widened theme constraint", () => {
  it("accepts the two new Modern themes", async () => {
    await insertPreferences("owner-modern-light", "modern-light");
    await insertPreferences("owner-modern-dark", "modern-dark");

    const rows = await DB.prepare(
      `SELECT owner_id, theme FROM owner_app_preferences
        WHERE workspace_id = ? AND owner_id LIKE 'owner-modern-%' ORDER BY owner_id`,
    )
      .bind(WS)
      .all<{ owner_id: string; theme: string }>();

    expect(rows.results.map((row) => row.theme)).toEqual([
      "modern-dark",
      "modern-light",
    ]);
  });

  it("still accepts every theme that was legal before", async () => {
    for (const theme of [
      "system",
      "daly-light",
      "daly-dark",
      "eucalypt",
      "coastal",
      "ember",
    ]) {
      await expect(
        insertPreferences(`owner-legacy-${theme}`, theme),
        `theme "${theme}" is no longer writable`,
      ).resolves.toBeDefined();
    }
  });

  it("still rejects a theme that is not in the registry", async () => {
    // The widened set must be a WIDER set, not an open one: the column is written
    // straight into `<html data-theme>`.
    await expect(
      insertPreferences("owner-bogus", "neon-hacker"),
    ).rejects.toThrow();
  });

  it("keeps the default, so an existing owner is not moved to a new theme", async () => {
    await DB.prepare(
      `INSERT INTO owner_app_preferences (workspace_id, owner_id, created_at, updated_at)
       VALUES (?, 'owner-default', ?, ?)`,
    )
      .bind(WS, AT, AT)
      .run();
    const row = await DB.prepare(
      `SELECT theme FROM owner_app_preferences WHERE workspace_id = ? AND owner_id = 'owner-default'`,
    )
      .bind(WS)
      .first<{ theme: string }>();
    expect(row?.theme).toBe("system");
  });

  it("preserves every other column across the rebuild", async () => {
    // The rebuild copies by explicit column list. This proves nothing was shifted
    // into the wrong column — the failure mode a positional `SELECT *` copy has.
    await DB.prepare(
      `INSERT INTO owner_app_preferences
         (workspace_id, owner_id, timezone, date_format, first_day_of_week,
          default_landing_destination, default_tasks_view, default_diary_mode,
          navigation_config, version, created_at, updated_at,
          default_task_capture_parent_id, default_task_capture_parent_kind,
          default_task_view_id, theme, default_task_destination)
       VALUES (?, 'owner-full', 'Australia/Perth', 'iso', 'sunday', 'tasks', 'matrix',
               'timeline', '{"version":1,"hiddenModuleIds":["diary"]}', 3, ?, ?,
               'p_1', 'project', 'view_1', 'modern-dark', 'chosen_parent')`,
    )
      .bind(WS, AT, AT)
      .run();

    const row = await DB.prepare(
      `SELECT * FROM owner_app_preferences WHERE workspace_id = ? AND owner_id = 'owner-full'`,
    )
      .bind(WS)
      .first<Record<string, unknown>>();

    expect(row).toMatchObject({
      timezone: "Australia/Perth",
      date_format: "iso",
      first_day_of_week: "sunday",
      default_landing_destination: "tasks",
      default_tasks_view: "matrix",
      default_diary_mode: "timeline",
      navigation_config: '{"version":1,"hiddenModuleIds":["diary"]}',
      version: 3,
      default_task_capture_parent_id: "p_1",
      default_task_capture_parent_kind: "project",
      default_task_view_id: "view_1",
      theme: "modern-dark",
      default_task_destination: "chosen_parent",
    });
  });
});

describe("migration 0026 — the rebuilt table kept its shape", () => {
  it("names every curated theme in the CHECK, and nothing else", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'owner_app_preferences'",
    ).first<{ sql: string }>();
    const sql = row?.sql ?? "";
    for (const theme of [
      "system",
      "daly-light",
      "daly-dark",
      "modern-light",
      "modern-dark",
      "eucalypt",
      "coastal",
      "ember",
    ]) {
      expect(sql, `CHECK omits "${theme}"`).toContain(`'${theme}'`);
    }
    // The legacy values stay out, exactly as 0023 intended.
    expect(sql).not.toContain("'light'");
    expect(sql).not.toContain("'dark'");
    // …and it is still STRICT, still keyed, still constrained everywhere else.
    expect(sql).toContain("STRICT");
    expect(sql).toContain("PRIMARY KEY (workspace_id, owner_id)");
    expect(sql).toContain("'inbox', 'chosen_parent'");
    expect(sql).toContain("json_valid(navigation_config)");
    // The temporary rebuild name must not have survived the rename.
    expect(sql).not.toContain("owner_app_preferences_new");
  });

  it("recreated the workspace index the dropped table owned", async () => {
    const row = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'index' AND name = 'owner_app_preferences_workspace_idx'`,
    ).first<{ name: string }>();
    expect(row?.name).toBe("owner_app_preferences_workspace_idx");
  });

  it("left no rebuild scaffolding behind", async () => {
    const row = await DB.prepare(
      `SELECT name FROM sqlite_master WHERE name = 'owner_app_preferences_new'`,
    ).first<{ name: string }>();
    expect(row).toBeNull();
  });
});
