/**
 * THEME-01 — the theme registry and the persisted theme-preference contract.
 *
 * Covers the acceptance criteria that are pure logic: the registry ships the
 * curated themes with owner-facing names, valid values are accepted, invalid ones
 * are rejected safely, the legacy `light`/`dark` preference migrates onto the
 * curated themes rather than resetting, `system` resolves to a real theme, and the
 * first-paint cookie can never carry an unvalidated value.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  DEFAULT_THEME,
  SYSTEM_THEME,
  SYSTEM_THEME_OPTION,
  THEMES,
  THEME_COOKIE_NAME,
  THEME_IDS,
  THEME_PREFERENCES,
  isThemeId,
  isThemePreference,
  parseThemePreference,
  readThemePreference,
  resolveThemeId,
  serializeThemeCookie,
  themeById,
  themePreferenceName,
} from "~/shared/shell/theme";

describe("THEME-01 theme registry", () => {
  it("ships at least five curated themes", () => {
    expect(THEME_IDS.length).toBeGreaterThanOrEqual(5);
    expect(THEMES).toHaveLength(THEME_IDS.length);
  });

  it("ships the Modern pair: one light and one dark, both selectable", () => {
    // THEME-02's whole premise is a PAIR. Two themes with matching structure are
    // only a pair if both are in the registry and they present as opposite
    // appearances — otherwise "switch by time of day" is not actually offered.
    const light = themeById("modern-light");
    const dark = themeById("modern-dark");
    expect(light.appearance).toBe("light");
    expect(dark.appearance).toBe("dark");
    expect(THEME_PREFERENCES).toContain("modern-light");
    expect(THEME_PREFERENCES).toContain("modern-dark");
  });

  it("describes every registered theme, with no duplicate ids or names", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual([...THEME_IDS]);
    expect(new Set(THEMES.map((theme) => theme.name)).size).toBe(THEMES.length);
    for (const theme of THEMES) {
      expect(
        theme.name.length,
        `${theme.id} needs a display name`,
      ).toBeGreaterThan(0);
      expect(
        theme.description.length,
        `${theme.id} needs a description`,
      ).toBeGreaterThan(0);
      // The owner never sees the raw id, so the display name must not BE the id.
      expect(theme.name).not.toBe(theme.id);
    }
  });

  it("includes every theme the milestones require, by name and in order", () => {
    expect(THEMES.map((theme) => theme.name)).toEqual([
      "Daly Light",
      "Daly Dark",
      "Modern Light",
      "Modern Dark",
      "Eucalypt",
      "Coastal",
      "Ember",
    ]);
  });

  it("keeps every existing theme, so no owner's choice is taken away", () => {
    // THEME-02 ADDS a pair. A theme an owner may already be on must never be
    // dropped by a release that was only meant to add one.
    for (const id of [
      "daly-light",
      "daly-dark",
      "eucalypt",
      "coastal",
      "ember",
    ] as const) {
      expect(THEME_IDS, `theme "${id}" was removed`).toContain(id);
    }
  });

  it("declares at least one fully supported dark theme", () => {
    const dark = THEMES.filter((theme) => theme.appearance === "dark");
    expect(dark.length).toBeGreaterThanOrEqual(1);
    expect(dark.map((theme) => theme.id)).toContain(DEFAULT_DARK_THEME);
  });

  it("offers `system` in addition to the curated themes, never instead of one", () => {
    expect(THEME_PREFERENCES).toHaveLength(THEME_IDS.length + 1);
    expect(THEME_PREFERENCES).toContain(SYSTEM_THEME);
    expect(SYSTEM_THEME_OPTION.name).toBe("Match system");
  });

  it("looks a theme up by id", () => {
    expect(themeById("daly-dark").name).toBe("Daly Dark");
    expect(themeById("ember").appearance).toBe("light");
  });

  it("names any preference for display, including `system`", () => {
    expect(themePreferenceName("system")).toBe("Match system");
    expect(themePreferenceName("eucalypt")).toBe("Eucalypt");
    // An unknown value must still produce a sensible label, never a raw id.
    expect(themePreferenceName("gone")).toBe("Match system");
  });
});

describe("THEME-01 preference validation", () => {
  it("defaults to system", () => {
    expect(DEFAULT_THEME).toBe("system");
  });

  it("recognises every curated theme id", () => {
    for (const id of THEME_IDS) {
      expect(isThemeId(id), id).toBe(true);
      expect(isThemePreference(id), id).toBe(true);
    }
  });

  it("does not treat `system` as a curated theme id", () => {
    // `system` is an appearance mode; it has no palette of its own, so it must
    // never be treated as a curated theme when a concrete theme is required.
    expect(isThemeId(SYSTEM_THEME)).toBe(false);
    expect(isThemePreference(SYSTEM_THEME)).toBe(true);
  });

  it("rejects values that are not themes", () => {
    expect(isThemePreference("neon")).toBe(false);
    expect(isThemePreference("")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(42)).toBe(false);
  });

  it("coerces an unknown or removed theme to the default", () => {
    expect(parseThemePreference("bogus")).toBe(DEFAULT_THEME);
    expect(parseThemePreference(undefined)).toBe(DEFAULT_THEME);
    expect(parseThemePreference({})).toBe(DEFAULT_THEME);
  });

  it("migrates the legacy light/dark preference onto curated themes", () => {
    // An owner who chose Dark before this milestone must land on Daly Dark, not be
    // silently reset to the default.
    expect(parseThemePreference("dark")).toBe(DEFAULT_DARK_THEME);
    expect(parseThemePreference("light")).toBe(DEFAULT_LIGHT_THEME);
    expect(parseThemePreference("system")).toBe(SYSTEM_THEME);
  });

  it("passes a curated theme through unchanged", () => {
    for (const id of THEME_IDS) {
      expect(parseThemePreference(id)).toBe(id);
    }
  });
});

describe("THEME-01 resolving what actually paints", () => {
  it("resolves `system` against the operating-system appearance", () => {
    expect(resolveThemeId("system", "light")).toBe(DEFAULT_LIGHT_THEME);
    expect(resolveThemeId("system", "dark")).toBe(DEFAULT_DARK_THEME);
  });

  it("returns a chosen theme regardless of the OS appearance", () => {
    // A chosen theme is not an appearance mode: Ember stays Ember in a dark OS.
    expect(resolveThemeId("ember", "dark")).toBe("ember");
    expect(resolveThemeId("daly-dark", "light")).toBe("daly-dark");
    // The Modern pair is two chosen themes, not one theme that follows the OS.
    expect(resolveThemeId("modern-light", "dark")).toBe("modern-light");
    expect(resolveThemeId("modern-dark", "light")).toBe("modern-dark");
  });

  it("always resolves to a theme that has a palette", () => {
    for (const preference of THEME_PREFERENCES) {
      expect(THEME_IDS).toContain(resolveThemeId(preference, "light"));
      expect(THEME_IDS).toContain(resolveThemeId(preference, "dark"));
    }
  });
});

describe("THEME-01 first-paint cookie", () => {
  it("reads the preference from a cookie header", () => {
    expect(readThemePreference(`${THEME_COOKIE_NAME}=daly-dark`)).toBe(
      "daly-dark",
    );
    expect(
      readThemePreference(`other=x; ${THEME_COOKIE_NAME}=coastal; more=y`),
    ).toBe("coastal");
  });

  it("migrates a legacy cookie written before this milestone", () => {
    expect(readThemePreference(`${THEME_COOKIE_NAME}=dark`)).toBe(
      DEFAULT_DARK_THEME,
    );
  });

  it("falls back safely for a missing or invalid cookie", () => {
    expect(readThemePreference(null)).toBe(DEFAULT_THEME);
    expect(readThemePreference("")).toBe(DEFAULT_THEME);
    expect(readThemePreference("other=x")).toBe(DEFAULT_THEME);
    expect(readThemePreference(`${THEME_COOKIE_NAME}=bogus`)).toBe(
      DEFAULT_THEME,
    );
  });

  it("serialises a bounded, same-site, http-only cookie", () => {
    const cookie = serializeThemeCookie("eucalypt", { secure: false });
    expect(cookie).toContain(`${THEME_COOKIE_NAME}=eucalypt`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure when asked", () => {
    expect(serializeThemeCookie("coastal", { secure: true })).toContain(
      "Secure",
    );
  });

  it("never reflects an unvalidated value into the cookie", () => {
    // Defence in depth: even if a caller skipped validation, the serialiser must
    // not put browser-supplied text into a Set-Cookie header.
    const cookie = serializeThemeCookie(
      "evil; Path=/; Domain=attacker.example" as never,
      { secure: false },
    );
    expect(cookie).toContain(`${THEME_COOKIE_NAME}=${DEFAULT_THEME}`);
    expect(cookie).not.toContain("attacker.example");
  });
});
