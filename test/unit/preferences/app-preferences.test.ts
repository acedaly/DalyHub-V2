import { describe, expect, it } from "vitest";

import {
  AppPreferencesValidationError,
  DEFAULT_APP_PREFERENCES,
  formatPreferenceDate,
  normaliseStoredPreferences,
  parseDateFormat,
  parseDiaryDefaultMode,
  parseFirstDayOfWeek,
  parseLandingDestination,
  parseTaskDefaultView,
  parseTimezone,
  resolveDefaultLandingPath,
  resolveNavigationPreferences,
  validateAppPreferencesPatch,
} from "~/kernel/preferences";
import { DEFAULT_TASK_VIEW_CONFIG } from "~/kernel/task-views";
import { configFromParams } from "~/modules/tasks/tasks-url-state";
import {
  readThemePreference,
  serializeThemeCookie,
} from "~/shared/shell/theme";

/** Normalise a partial stored row, filling the untouched fields with defaults. */
function normalise(overrides: Record<string, unknown>) {
  return normaliseStoredPreferences({
    timezone: DEFAULT_APP_PREFERENCES.timezone,
    dateFormat: DEFAULT_APP_PREFERENCES.dateFormat,
    firstDayOfWeek: DEFAULT_APP_PREFERENCES.firstDayOfWeek,
    defaultLandingDestination:
      DEFAULT_APP_PREFERENCES.defaultLandingDestination,
    defaultTasksView: DEFAULT_APP_PREFERENCES.defaultTasksView,
    defaultDiaryMode: DEFAULT_APP_PREFERENCES.defaultDiaryMode,
    navigation: DEFAULT_APP_PREFERENCES.navigation,
    ...overrides,
  });
}

describe("app preferences", () => {
  it("resolves deterministic defaults", () => {
    expect(DEFAULT_APP_PREFERENCES).toMatchObject({
      timezone: "Australia/Sydney",
      dateFormat: "d_mmm_yyyy",
      firstDayOfWeek: "monday",
      defaultLandingDestination: "today",
      defaultTasksView: "focus",
      defaultDiaryMode: "day",
    });
  });

  it("validates every core preference", () => {
    expect(parseDateFormat("dmy_slash")).toBe("dmy_slash");
    expect(parseFirstDayOfWeek("sunday")).toBe("sunday");
    expect(parseLandingDestination("tasks")).toBe("tasks");
    expect(parseTaskDefaultView("matrix")).toBe("matrix");
    expect(parseDiaryDefaultMode("timeline")).toBe("timeline");
    expect(() => parseDateFormat("MM/DD/YYYY")).toThrow();
    expect(() => parseFirstDayOfWeek("wednesday")).toThrow();
    expect(() => parseLandingDestination("assets")).toThrow();
    expect(() => parseTaskDefaultView("kanban")).toThrow();
    expect(() => parseDiaryDefaultMode("month")).toThrow();
  });

  it("validates IANA timezones", () => {
    expect(parseTimezone("Australia/Sydney")).toBe("Australia/Sydney");
    expect(parseTimezone("Europe/London")).toBe("Europe/London");
    expect(() => parseTimezone("Sydney")).toThrow();
    expect(() => parseTimezone("Not/A_Zone")).toThrow();
  });

  it("reconciles navigation against the module registry model", () => {
    const canonical = [
      { moduleId: "today", label: "Today" },
      { moduleId: "tasks", label: "Tasks" },
      { moduleId: "notes", label: "Notes" },
      { moduleId: "settings", label: "Settings" },
      { moduleId: "new_module", label: "New module" },
    ];
    const resolved = resolveNavigationPreferences(
      {
        version: 1,
        hiddenModuleIds: ["missing", "tasks", "settings"],
      },
      canonical,
    );
    expect(resolved.preferences.hiddenModuleIds).toEqual(["tasks"]);
    expect(
      resolved.items.find((item) => item.moduleId === "settings")?.hidden,
    ).toBe(false);
    expect(
      resolved.items.find((item) => item.moduleId === "new_module")?.hidden,
    ).toBe(false);
  });

  it("does not allow every optional route to disappear", () => {
    const canonical = [
      { moduleId: "today", label: "Today" },
      { moduleId: "tasks", label: "Tasks" },
      { moduleId: "settings", label: "Settings" },
    ];
    const resolved = resolveNavigationPreferences(
      { version: 1, hiddenModuleIds: ["tasks"] },
      canonical,
    );
    expect(resolved.preferences.hiddenModuleIds).toEqual([]);
  });

  it("falls back to Today for invalid or unavailable landing destinations", () => {
    const available = new Set(["/today", "/tasks"]);
    expect(resolveDefaultLandingPath("tasks", available)).toBe("/tasks");
    expect(resolveDefaultLandingPath("notes", available)).toBe("/today");
    expect(resolveDefaultLandingPath("assets" as never, available)).toBe(
      "/today",
    );
  });

  it("uses the preferred Tasks view only when URL state is absent", () => {
    const preferred = {
      ...DEFAULT_TASK_VIEW_CONFIG,
      presentation: "matrix" as const,
    };
    expect(
      configFromParams(new URLSearchParams(), preferred).presentation,
    ).toBe("matrix");
    // An explicit URL value always wins over the preference — a deep link and
    // Back/Forward stay authoritative.
    expect(
      configFromParams(new URLSearchParams("view=board"), preferred)
        .presentation,
    ).toBe("board");
    // An invalid URL value falls back to the preference, never to an error.
    expect(
      configFromParams(new URLSearchParams("view=bad"), preferred).presentation,
    ).toBe("matrix");
  });

  it("carries the theme as a real owner preference, defaulting to system", () => {
    // THEME-01 moved appearance out of a device-local cookie and onto the owner
    // record, so a theme follows the owner between browsers. The cookie survives
    // only as the first-paint mirror.
    expect(DEFAULT_APP_PREFERENCES.theme).toBe("system");
    expect(validateAppPreferencesPatch({ theme: "eucalypt" })).toEqual({
      theme: "eucalypt",
    });
  });

  it("rejects a write naming a theme DalyHub does not have", () => {
    expect(() =>
      validateAppPreferencesPatch({ theme: "neon" as never }),
    ).toThrow(AppPreferencesValidationError);
  });

  it("accepts a legacy light/dark write and maps it onto a curated theme", () => {
    expect(validateAppPreferencesPatch({ theme: "dark" as never })).toEqual({
      theme: "daly-dark",
    });
  });

  it("normalises a stored theme, degrading an unknown value to the default", () => {
    // A row written by a release that had a theme this one removed must still
    // produce a complete, readable theme rather than failing every page load.
    expect(normalise({ theme: "coastal" }).theme).toBe("coastal");
    expect(normalise({ theme: "retired-theme" }).theme).toBe("system");
    expect(normalise({ theme: undefined }).theme).toBe("system");
    expect(normalise({ theme: "dark" }).theme).toBe("daly-dark");
  });

  it("still mirrors the preference into the first-paint cookie", () => {
    const cookie = serializeThemeCookie("daly-dark", { secure: false });
    expect(readThemePreference(cookie)).toBe("daly-dark");
    expect(readThemePreference("dh_theme=bad")).toBe("system");
  });

  it("formats the supported date display options", () => {
    expect(formatPreferenceDate("2026-07-27", "dmy_slash")).toBe("27/07/2026");
    expect(formatPreferenceDate("2026-07-27", "d_mmm_yyyy")).toBe(
      "27 Jul 2026",
    );
    expect(formatPreferenceDate("2026-07-27", "iso")).toBe("2026-07-27");
  });
});
