import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const DB = env.MIGRATION_TEST_DB;

beforeAll(async () => {
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
});

describe("migration 0017 (owner_app_preferences)", () => {
  it("creates a STRICT owner/workspace preference table", async () => {
    const row = await DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'owner_app_preferences'",
    ).first<{ sql: string }>();
    expect(row?.sql).toMatch(/\bSTRICT\b/);
    expect(row?.sql).toContain("PRIMARY KEY (workspace_id, owner_id)");
  });

  it("enforces workspace foreign key and enum checks", async () => {
    await expect(
      DB.prepare(
        `INSERT INTO owner_app_preferences (
          workspace_id, owner_id, timezone, date_format, first_day_of_week,
          default_landing_destination, default_tasks_view, default_diary_mode,
          navigation_config, created_at, updated_at
        ) VALUES ('missing', 'owner', 'Australia/Sydney', 'd_mmm_yyyy',
          'monday', 'today', 'focus', 'day', '{"version":1,"hiddenModuleIds":[]}',
          '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z')`,
      ).run(),
    ).rejects.toThrow();
  });
});
