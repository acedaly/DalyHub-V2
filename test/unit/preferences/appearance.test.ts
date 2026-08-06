/**
 * APPEARANCE-01 — the appearance preference contract.
 *
 * This is the pure half of the feature: what a legal value is, how a stored or
 * cookie value is read, what an illegal one degrades to, and how `system`
 * resolves against a device. Everything that decides what the owner actually
 * SEES runs through here, so it is tested directly rather than only through a
 * component.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPEARANCE_COOKIE_MAX_AGE,
  APPEARANCE_COOKIE_NAME,
  APPEARANCE_PREFERENCES,
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  isSecureAppearanceEnvironment,
  parseAppearancePreference,
  readAppearancePreference,
  resolveAppearance,
  serializeAppearanceCookie,
} from "~/kernel/preferences/appearance";
import {
  DEFAULT_APP_PREFERENCES,
  normaliseStoredPreferences,
  parseAppearance,
  validateAppPreferencesPatch,
  AppPreferencesValidationError,
} from "~/kernel/preferences";
import {
  APPEARANCE_LABEL,
  APPEARANCE_OPTIONS,
  appearanceLabel,
} from "~/shared/shell/appearance";

const STORED_SHAPE = {
  timezone: "Australia/Sydney",
  dateFormat: "d_mmm_yyyy",
  firstDayOfWeek: "monday",
  defaultLandingDestination: "today",
  defaultTasksView: "focus",
  defaultDiaryMode: "day",
  navigation: { version: 1, hiddenModuleIds: [] },
} as const;

describe("APPEARANCE-01 — the value set", () => {
  it("offers exactly System, Light and Dark, in that order", () => {
    expect(APPEARANCE_PREFERENCES).toEqual(["system", "light", "dark"]);
  });

  it("defaults to system, which is the shipped pre-APPEARANCE-01 behaviour", () => {
    expect(DEFAULT_APPEARANCE).toBe("system");
    expect(DEFAULT_APP_PREFERENCES.appearance).toBe("system");
  });

  it("recognises exactly the three legal values", () => {
    for (const value of APPEARANCE_PREFERENCES) {
      expect(isAppearancePreference(value)).toBe(true);
    }
    for (const value of [
      "auto",
      "night",
      "Light",
      "daly-dark",
      "",
      null,
      undefined,
      1,
      {},
    ]) {
      expect(isAppearancePreference(value)).toBe(false);
    }
  });

  /*
   * The list, the CHECK constraint and the migration must agree. If a future
   * release adds a value to `APPEARANCE_PREFERENCES` without widening the
   * constraint, the write fails at the storage boundary in production and
   * NOWHERE ELSE — so it is pinned here instead.
   */
  it("matches the CHECK constraint migration 0033 writes", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "migrations",
        "0033_add_owner_appearance_preference.sql",
      ),
      "utf8",
    );
    const match = /CHECK \(appearance IN \(([^)]*)\)\)/.exec(sql);
    expect(match).not.toBeNull();
    const constrained = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""));
    expect(constrained.sort()).toEqual([...APPEARANCE_PREFERENCES].sort());
    expect(sql).toContain("DEFAULT 'system'");
  });
});

describe("APPEARANCE-01 — parsing", () => {
  it("passes a legal value straight through", () => {
    expect(parseAppearancePreference("dark")).toBe("dark");
    expect(parseAppearancePreference("light")).toBe("light");
    expect(parseAppearancePreference("system")).toBe("system");
  });

  it("COERCES anything else to system rather than throwing", () => {
    // Coercion, not rejection: a hand-edited cookie or a stale form post must
    // never be able to break the surface the owner is looking at.
    for (const value of ["auto", "daly-dark", "", "  ", null, undefined, 7]) {
      expect(parseAppearancePreference(value)).toBe("system");
    }
  });

  it("REJECTS an illegal value on the write path", () => {
    // A patch is a deliberate write. An unknown value there means the caller and
    // the value set disagree, which is a bug worth surfacing rather than quietly
    // storing `system` over the owner's actual choice.
    expect(() => parseAppearance("auto")).toThrow(
      AppPreferencesValidationError,
    );
    expect(() =>
      validateAppPreferencesPatch({ appearance: "auto" as never }),
    ).toThrow(AppPreferencesValidationError);
    expect(validateAppPreferencesPatch({ appearance: "dark" })).toEqual({
      appearance: "dark",
    });
  });

  it("reads an invalid or absent STORED value as system", () => {
    expect(
      normaliseStoredPreferences({ ...STORED_SHAPE, appearance: "dark" })
        .appearance,
    ).toBe("dark");
    // A row written before migration 0033, or by a future release that removed a
    // value, degrades to `system` rather than failing the whole read.
    expect(normaliseStoredPreferences({ ...STORED_SHAPE }).appearance).toBe(
      "system",
    );
    expect(
      normaliseStoredPreferences({ ...STORED_SHAPE, appearance: "eucalypt" })
        .appearance,
    ).toBe("system");
    expect(
      normaliseStoredPreferences({ ...STORED_SHAPE, appearance: null })
        .appearance,
    ).toBe("system");
  });
});

describe("APPEARANCE-01 — resolution", () => {
  it("follows the device under system", () => {
    expect(resolveAppearance("system", "dark")).toBe("dark");
    expect(resolveAppearance("system", "light")).toBe("light");
  });

  it("keeps following the device as it CHANGES under system", () => {
    // The stored preference does not move; only the device signal does. This is
    // the pure equivalent of the stylesheet's `prefers-color-scheme` block
    // re-evaluating while DalyHub is open.
    const stored = "system" as const;
    expect(resolveAppearance(stored, "light")).toBe("light");
    expect(resolveAppearance(stored, "dark")).toBe("dark");
    expect(resolveAppearance(stored, "light")).toBe("light");
  });

  it("IGNORES the device under an explicit Light or Dark", () => {
    expect(resolveAppearance("light", "dark")).toBe("light");
    expect(resolveAppearance("light", "light")).toBe("light");
    expect(resolveAppearance("dark", "light")).toBe("dark");
    expect(resolveAppearance("dark", "dark")).toBe("dark");
  });

  it("assumes light when no device signal is supplied", () => {
    expect(resolveAppearance("system")).toBe("light");
  });
});

describe("APPEARANCE-01 — the first-paint cookie", () => {
  it("reads the preference out of a Cookie header", () => {
    expect(readAppearancePreference("dh_appearance=dark")).toBe("dark");
    expect(
      readAppearancePreference("other=1; dh_appearance=light; more=2"),
    ).toBe("light");
    expect(readAppearancePreference("  dh_appearance = dark ")).toBe("dark");
  });

  it("falls back to system for a missing, empty or invalid cookie", () => {
    expect(readAppearancePreference(null)).toBe("system");
    expect(readAppearancePreference(undefined)).toBe("system");
    expect(readAppearancePreference("")).toBe("system");
    expect(readAppearancePreference("other=1")).toBe("system");
    expect(readAppearancePreference("dh_appearance=eucalypt")).toBe("system");
    expect(readAppearancePreference("dh_appearance")).toBe("system");
  });

  it("serialises a bounded, HttpOnly, same-site cookie", () => {
    const cookie = serializeAppearanceCookie("dark", { secure: false });
    expect(cookie).toContain(`${APPEARANCE_COOKIE_NAME}=dark`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${APPEARANCE_COOKIE_MAX_AGE}`);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
    expect(serializeAppearanceCookie("light", { secure: true })).toContain(
      "Secure",
    );
  });

  it("never reflects an unvalidated value into a Set-Cookie header", () => {
    const cookie = serializeAppearanceCookie(
      "dark; Path=/; Domain=evil.example" as never,
      { secure: false },
    );
    expect(cookie).toContain(`${APPEARANCE_COOKIE_NAME}=system`);
    expect(cookie).not.toContain("evil.example");
  });

  it("marks the cookie Secure in the deployed environments only", () => {
    // One helper, used by BOTH writers — the action and the app-shell loader's
    // reconciliation. A cookie written from two places with different flags is
    // two cookies, and the browser would keep the wrong one.
    for (const environment of ["production", "staging", "preview"]) {
      expect(isSecureAppearanceEnvironment(environment)).toBe(true);
      expect(
        isSecureAppearanceEnvironment(` ${environment.toUpperCase()} `),
      ).toBe(true);
    }
    for (const environment of ["development", "test", "", undefined, "prod"]) {
      expect(isSecureAppearanceEnvironment(environment)).toBe(false);
    }
  });

  it("round-trips every legal value", () => {
    for (const value of APPEARANCE_PREFERENCES) {
      const cookie = serializeAppearanceCookie(value, { secure: true });
      const header = cookie.split(";")[0];
      expect(readAppearancePreference(header)).toBe(value);
    }
  });
});

describe("APPEARANCE-01 — presentation", () => {
  it("has exactly one descriptor per legal value, in the same order", () => {
    expect(APPEARANCE_OPTIONS.map((option) => option.value)).toEqual([
      ...APPEARANCE_PREFERENCES,
    ]);
  });

  it("uses the fixed terminology and never an ambiguous synonym", () => {
    expect(APPEARANCE_LABEL).toBe("Appearance");
    expect(APPEARANCE_OPTIONS.map((option) => option.label)).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
    const copy = APPEARANCE_OPTIONS.map(
      (option) => `${option.label} ${option.description}`,
    )
      .join(" ")
      .toLowerCase();
    for (const banned of ["auto", "default", "night mode", "theme"]) {
      expect(copy).not.toContain(banned);
    }
  });

  it("names every preference, and degrades an unknown one to System", () => {
    expect(appearanceLabel("system")).toBe("System");
    expect(appearanceLabel("light")).toBe("Light");
    expect(appearanceLabel("dark")).toBe("Dark");
    expect(appearanceLabel("eucalypt" as never)).toBe("System");
  });
});
