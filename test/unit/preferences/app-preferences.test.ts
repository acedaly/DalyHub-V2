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
    expect(parseTaskDefaultView("sectors")).toBe("sectors");
    expect(parseDiaryDefaultMode("timeline")).toBe("timeline");
    expect(() => parseDateFormat("MM/DD/YYYY")).toThrow();
    expect(() => parseFirstDayOfWeek("wednesday")).toThrow();
    expect(() => parseLandingDestination("assets")).toThrow();
    expect(() => parseTaskDefaultView("kanban")).toThrow();
    // V2.2 removed the Matrix, so the WRITE path refuses it — Settings no longer
    // offers it, and a hand-crafted patch cannot store a view that does not exist.
    expect(() => parseTaskDefaultView("matrix")).toThrow();
    expect(() => parseDiaryDefaultMode("month")).toThrow();
  });

  it("validates IANA timezones", () => {
    expect(parseTimezone("Australia/Sydney")).toBe("Australia/Sydney");
    expect(parseTimezone("Europe/London")).toBe("Europe/London");
    expect(() => parseTimezone("Sydney")).toThrow();
    expect(() => parseTimezone("Not/A_Zone")).toThrow();
  });

  it("accepts every timezone the Settings list actually offers", () => {
    // AUDIT-14 — the owner's stored timezone is the ONE definition of their
    // calendar day, so every value the picker offers must be storable.
    // `Intl.supportedValuesOf('timeZone')` lists canonical zones only and omits
    // links, so `UTC` used to be offered and then rejected on save.
    for (const zone of [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Perth",
      "Pacific/Auckland",
      "Europe/London",
      "Europe/Dublin",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "UTC",
    ]) {
      expect(parseTimezone(zone)).toBe(zone);
    }
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
      presentation: "sectors" as const,
    };
    expect(
      configFromParams(new URLSearchParams(), preferred).presentation,
    ).toBe("sectors");
    // An explicit URL value always wins over the preference — a deep link and
    // Back/Forward stay authoritative.
    expect(
      configFromParams(new URLSearchParams("view=board"), preferred)
        .presentation,
    ).toBe("board");
    // An invalid URL value falls back to the preference, never to an error.
    expect(
      configFromParams(new URLSearchParams("view=bad"), preferred).presentation,
    ).toBe("sectors");
  });

  it("validates a patch field by field, rejecting a value the kernel does not know", () => {
    // The write-path guard. M3-01 removed `theme`, which used to be this
    // validator's most-exercised field; the same defence still applies to every
    // remaining one, so the behaviour keeps a test rather than losing one.
    expect(validateAppPreferencesPatch({ firstDayOfWeek: "sunday" })).toEqual({
      firstDayOfWeek: "sunday",
    });
    expect(() =>
      validateAppPreferencesPatch({ firstDayOfWeek: "caturday" as never }),
    ).toThrow(AppPreferencesValidationError);
  });

  it("normalises a stored row, degrading an unknown value to the default", () => {
    // The read path is forgiving where the write path is strict: a row written
    // by an older release must still produce a complete, usable record rather
    // than failing every page load.
    expect(normalise({ defaultTasksView: "retired" }).defaultTasksView).toBe(
      DEFAULT_APP_PREFERENCES.defaultTasksView,
    );
    expect(normalise({ timezone: "Europe/London" }).timezone).toBe(
      "Europe/London",
    );
  });

  it("formats the supported date display options", () => {
    expect(formatPreferenceDate("2026-07-27", "dmy_slash")).toBe("27/07/2026");
    expect(formatPreferenceDate("2026-07-27", "d_mmm_yyyy")).toBe(
      "27 Jul 2026",
    );
    expect(formatPreferenceDate("2026-07-27", "iso")).toBe("2026-07-27");
  });
});
