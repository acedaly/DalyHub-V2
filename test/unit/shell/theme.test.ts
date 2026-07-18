import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  THEME_COOKIE_NAME,
  isThemePreference,
  parseThemePreference,
  readThemePreference,
  serializeThemeCookie,
} from "~/shared/shell/theme";

describe("theme preference", () => {
  it("defaults to system", () => {
    expect(DEFAULT_THEME).toBe("system");
  });

  it("recognises valid preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("neon")).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  it("coerces invalid values to system", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("bogus")).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
  });

  it("reads the preference from a cookie header", () => {
    expect(readThemePreference(`${THEME_COOKIE_NAME}=dark`)).toBe("dark");
    expect(
      readThemePreference(`other=x; ${THEME_COOKIE_NAME}=light; more=y`),
    ).toBe("light");
  });

  it("falls back to system for a missing or invalid cookie", () => {
    expect(readThemePreference(null)).toBe("system");
    expect(readThemePreference("")).toBe("system");
    expect(readThemePreference("other=x")).toBe("system");
    expect(readThemePreference(`${THEME_COOKIE_NAME}=bogus`)).toBe("system");
  });

  it("serialises a bounded, same-site, http-only cookie", () => {
    const cookie = serializeThemeCookie("dark", { secure: false });
    expect(cookie).toContain(`${THEME_COOKIE_NAME}=dark`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure in production", () => {
    expect(serializeThemeCookie("light", { secure: true })).toContain("Secure");
  });
});
