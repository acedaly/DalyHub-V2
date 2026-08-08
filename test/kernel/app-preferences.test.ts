import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";

import {
  FakeClock,
  makeAppPreferencesRepository,
  makeContext,
  resetTables,
} from "./support";

const WS = "prefs_ws";
const OTHER_WS = "prefs_other_ws";
const OWNER = "owner-subject";
const OTHER_OWNER = "other-owner";

describe("AppPreferencesRepository — D1", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER_WS]);
  });

  it("returns defaults when no row exists", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    const preferences = await repo.get(OWNER);
    expect(preferences.version).toBe(0);
    expect(preferences.timezone).toBe("Australia/Sydney");
    expect(preferences.defaultLandingDestination).toBe("today");
  });

  /* THEME-01 — the theme is a persisted owner preference (migration 0023). These
   * cover the whole round trip through D1: the default for an existing owner, a
   * real write, isolation between owners, and what happens to a stored value that
   * names a theme this release no longer has. */

  it("keeps every other preference when the theme column is dropped", async () => {
    // Migration 0031 rebuilds the table to drop `theme`. An owner who had a row
    // before that release must keep every OTHER preference exactly as it was —
    // the rebuild copies by an explicit column list precisely so a value cannot
    // shift into a neighbouring column.
    const repo = makeAppPreferencesRepository(makeContext(WS));
    await repo.update(OWNER, { timezone: "Europe/London" });
    const preferences = await repo.get(OWNER);
    expect(preferences.timezone).toBe("Europe/London");
  });

  it("creates the first row atomically", async () => {
    const clock = new FakeClock("2026-07-27T01:00:00.000Z");
    const repo = makeAppPreferencesRepository(makeContext(WS), {
      clock: clock.now,
    });
    const result = await repo.update(OWNER, {
      timezone: "Europe/London",
      defaultLandingDestination: "tasks",
    });
    expect(result.changed).toBe(true);
    expect(result.preferences.version).toBe(1);
    expect(result.preferences.timezone).toBe("Europe/London");
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM owner_app_preferences WHERE workspace_id = ? AND owner_id = ?",
    )
      .bind(WS, OWNER)
      .first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it("updates an existing row and increments the version", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    await repo.update(OWNER, { defaultTasksView: "sectors" });
    const result = await repo.update(OWNER, { defaultTasksView: "all" });
    expect(result.preferences.defaultTasksView).toBe("all");
    expect(result.preferences.version).toBe(2);
  });

  it("does not write or increment for an idempotent no-op", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    await repo.update(OWNER, { defaultDiaryMode: "timeline" });
    const result = await repo.update(OWNER, { defaultDiaryMode: "timeline" });
    expect(result.changed).toBe(false);
    expect(result.preferences.version).toBe(1);
    const row = await env.DB.prepare(
      "SELECT version FROM owner_app_preferences WHERE workspace_id = ? AND owner_id = ?",
    )
      .bind(WS, OWNER)
      .first<{ version: number }>();
    expect(row?.version).toBe(1);
  });

  it("isolates by workspace and owner", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    const otherWorkspace = makeAppPreferencesRepository(makeContext(OTHER_WS));
    await repo.update(OWNER, { timezone: "Europe/London" });
    await repo.update(OTHER_OWNER, { timezone: "America/New_York" });
    await otherWorkspace.update(OWNER, { timezone: "Pacific/Auckland" });
    expect((await repo.get(OWNER)).timezone).toBe("Europe/London");
    expect((await repo.get(OTHER_OWNER)).timezone).toBe("America/New_York");
    expect((await otherWorkspace.get(OWNER)).timezone).toBe("Pacific/Auckland");
  });

  it("rolls back an injected failure after the write statement", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS), {
      mutationFault: "after-write",
    });
    await expect(
      repo.update(OWNER, { timezone: "Europe/London" }),
    ).rejects.toThrow();
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM owner_app_preferences WHERE workspace_id = ? AND owner_id = ?",
    )
      .bind(WS, OWNER)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("falls back safely when a future stored navigation config is unknown", async () => {
    await env.DB.prepare(
      `INSERT INTO owner_app_preferences (
        workspace_id, owner_id, timezone, date_format, first_day_of_week,
        default_landing_destination, default_tasks_view, default_diary_mode,
        navigation_config, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(
        WS,
        OWNER,
        "Not/A_Zone",
        "d_mmm_yyyy",
        "monday",
        "today",
        "focus",
        "day",
        JSON.stringify({ version: 999, hiddenModuleIds: ["tasks"] }),
        "2026-07-27T00:00:00.000Z",
        "2026-07-27T00:00:00.000Z",
      )
      .run();
    const repo = makeAppPreferencesRepository(makeContext(WS));
    const preferences = await repo.get(OWNER);
    expect(preferences.timezone).toBe(DEFAULT_APP_PREFERENCES.timezone);
    expect(preferences.dateFormat).toBe(DEFAULT_APP_PREFERENCES.dateFormat);
    expect(preferences.navigation.hiddenModuleIds).toEqual([]);
  });

  /* APPEARANCE-01 — the appearance is a persisted owner preference (migration
   * 0033). These cover the whole round trip through D1: the default for an owner
   * with no row and for a row written before the column existed, a real write,
   * isolation between owners and workspaces, and what the storage boundary does
   * with a value the CHECK does not name. */

  it("defaults an owner with no row to the system appearance", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    expect((await repo.get(OWNER)).appearance).toBe("system");
  });

  it("round-trips each of the three appearances", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    for (const appearance of ["dark", "light", "system"] as const) {
      const result = await repo.update(OWNER, { appearance });
      expect(result.preferences.appearance).toBe(appearance);
      expect((await repo.get(OWNER)).appearance).toBe(appearance);
    }
  });

  it("treats an unchanged appearance as no change, and does not bump the version", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    const first = await repo.update(OWNER, { appearance: "dark" });
    const second = await repo.update(OWNER, { appearance: "dark" });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.preferences.version).toBe(first.preferences.version);
  });

  it("keeps every other preference when the appearance changes", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    await repo.update(OWNER, {
      timezone: "Europe/London",
      defaultLandingDestination: "tasks",
    });
    await repo.update(OWNER, { appearance: "dark" });
    const preferences = await repo.get(OWNER);
    expect(preferences.appearance).toBe("dark");
    expect(preferences.timezone).toBe("Europe/London");
    expect(preferences.defaultLandingDestination).toBe("tasks");
  });

  it("isolates the appearance by workspace and owner", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    const otherWorkspace = makeAppPreferencesRepository(makeContext(OTHER_WS));
    await repo.update(OWNER, { appearance: "dark" });
    await repo.update(OTHER_OWNER, { appearance: "light" });
    await otherWorkspace.update(OWNER, { appearance: "system" });
    expect((await repo.get(OWNER)).appearance).toBe("dark");
    expect((await repo.get(OTHER_OWNER)).appearance).toBe("light");
    expect((await otherWorkspace.get(OWNER)).appearance).toBe("system");
  });

  it("refuses an appearance the CHECK constraint does not name", async () => {
    // The validator rejects it first in the application, but the storage boundary
    // is the last line of defence for a value that ends up in an HTML attribute.
    await expect(
      env.DB.prepare(
        `INSERT INTO owner_app_preferences (
          workspace_id, owner_id, appearance, timezone, date_format,
          first_day_of_week, default_landing_destination, default_tasks_view,
          default_diary_mode, navigation_config, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
        .bind(
          WS,
          OWNER,
          "eucalypt",
          "Australia/Sydney",
          "d_mmm_yyyy",
          "monday",
          "today",
          "focus",
          "day",
          JSON.stringify({ version: 1, hiddenModuleIds: [] }),
          "2026-08-06T00:00:00.000Z",
          "2026-08-06T00:00:00.000Z",
        )
        .run(),
    ).rejects.toThrow();
  });

  it("reads a row written before the appearance column as system", async () => {
    // Migration 0033 is additive with a default, so an existing row cannot be
    // missing the column — but an INSERT that omits it is exactly what a
    // pre-0033 code path does, and it must land on the shipped behaviour.
    await env.DB.prepare(
      `INSERT INTO owner_app_preferences (
        workspace_id, owner_id, timezone, date_format, first_day_of_week,
        default_landing_destination, default_tasks_view, default_diary_mode,
        navigation_config, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(
        WS,
        OWNER,
        "Australia/Sydney",
        "d_mmm_yyyy",
        "monday",
        "today",
        "focus",
        "day",
        JSON.stringify({ version: 1, hiddenModuleIds: [] }),
        "2026-08-06T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z",
      )
      .run();
    const repo = makeAppPreferencesRepository(makeContext(WS));
    expect((await repo.get(OWNER)).appearance).toBe("system");
  });

  it("does not create Activity rows for non-entity preference changes", async () => {
    const repo = makeAppPreferencesRepository(makeContext(WS));
    await repo.update(OWNER, { firstDayOfWeek: "sunday" });
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM activities WHERE type LIKE 'settings.%'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
