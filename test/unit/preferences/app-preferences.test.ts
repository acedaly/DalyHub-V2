import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_PREFERENCES,
  formatPreferenceDate,
  parseDateFormat,
  parseDiaryDefaultMode,
  parseFirstDayOfWeek,
  parseLandingDestination,
  parseTaskDefaultView,
  parseTimezone,
  resolveDefaultLandingPath,
  resolveNavigationPreferences,
} from "~/kernel/preferences";
import { DEFAULT_TASK_VIEW_CONFIG } from "~/kernel/task-views";
import { configFromParams } from "~/modules/tasks/tasks-url-state";
import {
  readThemePreference,
  serializeThemeCookie,
} from "~/shared/shell/theme";

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

  it("keeps appearance in the existing local cookie authority", () => {
    const cookie = serializeThemeCookie("dark", { secure: false });
    expect(readThemePreference(cookie)).toBe("dark");
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
