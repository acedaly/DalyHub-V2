/**
 * THEME-01 — the colour-scheme preference contract.
 *
 * The scheme is a persisted owner preference with a first-paint cookie mirror, an
 * owner-facing registry and a CHECK constraint. Four lists therefore have to say
 * the same five things — the kernel's `COLOR_SCHEMES`, the generator's emitted
 * palettes, the Settings registry, and migration 0039 — and none of them fails
 * loudly when they disagree: a missing palette paints the previous block's
 * colours, a missing descriptor renders an unnamed radio, and a value the CHECK
 * rejects fails only in production. So they are pinned to each other here.
 *
 * The other half of this file is the FALLBACK behaviour, which is the whole of
 * THEME-01 §30: an unknown, stale or hand-edited value must land the owner on
 * Daly Violet rather than on an error page or an unstyled document.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AppPreferencesValidationError,
  COLOR_SCHEMES,
  COLOR_SCHEME_COOKIE_NAME,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_COLOR_SCHEME,
  isColorScheme,
  isSecureColorSchemeEnvironment,
  normaliseStoredPreferences,
  parseColorScheme,
  parseColorSchemePreference,
  readColorSchemePreference,
  serializeColorSchemeCookie,
  validateAppPreferencesPatch,
} from "~/kernel/preferences";
import {
  COLOR_SCHEME_LABEL,
  COLOR_SCHEME_OPTIONS,
  COLOR_SCHEME_PREVIEW_SLOTS,
  colorSchemeLabel,
  colorSchemeOption,
} from "~/shared/shell/color-scheme";
import { GENERATED_COLOR_SCHEMES } from "~/shared/tokens";

/** A complete stored row, for the normalisation cases. */
const STORED_SHAPE = {
  timezone: "Australia/Sydney",
  dateFormat: "d_mmm_yyyy",
  firstDayOfWeek: "monday",
  defaultLandingDestination: "today",
  defaultTasksView: "focus",
  defaultDiaryMode: "day",
  navigation: { version: 1, hiddenModuleIds: [] },
} as const;

describe("THEME-01 — the scheme registry is one bounded list", () => {
  it("ships exactly the five briefed schemes, default first", () => {
    expect([...COLOR_SCHEMES]).toEqual([
      "violet",
      "electric",
      "pulse",
      "ocean",
      "graphite",
    ]);
    expect(COLOR_SCHEMES[0]).toBe(DEFAULT_COLOR_SCHEME);
  });

  it("defaults to Daly Violet, so no existing owner is migrated onto a new scheme", () => {
    // THEME-01 §45. The stored default, the coerced default and the record
    // default all have to be the same value, or "nobody's colours change" would
    // depend on which path a given render took.
    expect(DEFAULT_COLOR_SCHEME).toBe("violet");
    expect(DEFAULT_APP_PREFERENCES.colorScheme).toBe("violet");
    expect(parseColorSchemePreference(undefined)).toBe("violet");
  });

  it("generates a palette for every scheme, and no scheme without one", () => {
    // The generator and the persisted contract are separate files by design (one
    // is a build step, the other is a kernel module). A scheme the owner can
    // choose but that has no generated block would paint the previous block's
    // colours, which is the failure mode nobody notices.
    expect([...GENERATED_COLOR_SCHEMES].sort()).toEqual(
      [...COLOR_SCHEMES].sort(),
    );
  });

  it("gives every scheme exactly one Settings descriptor", () => {
    expect(COLOR_SCHEME_OPTIONS.map((option) => option.value)).toEqual([
      ...COLOR_SCHEMES,
    ]);
    for (const scheme of COLOR_SCHEMES) {
      const option = colorSchemeOption(scheme);
      expect(option.label.length, `${scheme}: needs a name`).toBeGreaterThan(0);
      expect(
        option.description.length,
        `${scheme}: needs a description`,
      ).toBeGreaterThan(0);
    }
  });

  it("uses DalyHub's own names, never another company's", () => {
    // THEME-01 §44. The schemes take character from contemporary brands and
    // nothing else: no name, no palette and no asset is borrowed.
    const text = JSON.stringify(COLOR_SCHEME_OPTIONS).toLowerCase();
    for (const forbidden of ["ventra", "viatek"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(COLOR_SCHEME_OPTIONS.map((option) => option.label)).toEqual([
      "Daly Violet",
      "Electric",
      "Pulse",
      "Ocean",
      "Graphite",
    ]);
  });

  it("calls the setting a colour scheme, not a theme", () => {
    // §4 — "theme" invites the owner to expect different typography, spacing and
    // shapes, none of which a scheme touches.
    expect(COLOR_SCHEME_LABEL).toBe("Colour scheme");
    expect(COLOR_SCHEME_LABEL.toLowerCase()).not.toContain("theme");
  });

  it("previews three roles, so a swatch says something the name cannot", () => {
    expect([...COLOR_SCHEME_PREVIEW_SLOTS]).toEqual([
      "primary",
      "secondary",
      "tertiary",
    ]);
  });

  it("matches the CHECK constraint migration 0039 writes", () => {
    /*
     * The list, the CHECK constraint and the migration must agree. If a future
     * release adds a value to `COLOR_SCHEMES` without widening the constraint,
     * the write fails at the storage boundary in production and NOWHERE ELSE —
     * so it is pinned here instead.
     */
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "migrations",
        "0039_add_owner_color_scheme_preference.sql",
      ),
      "utf8",
    );
    const match = /CHECK \(color_scheme IN \(([^)]*)\)\)/.exec(sql);
    expect(match).not.toBeNull();
    const constrained = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/^'|'$/g, ""));
    expect(constrained.sort()).toEqual([...COLOR_SCHEMES].sort());
    expect(sql).toContain("DEFAULT 'violet'");
  });
});

describe("THEME-01 — parsing", () => {
  it("passes a legal value straight through", () => {
    for (const scheme of COLOR_SCHEMES) {
      expect(parseColorSchemePreference(scheme)).toBe(scheme);
      expect(isColorScheme(scheme)).toBe(true);
    }
  });

  it("COERCES anything else to Daly Violet rather than throwing", () => {
    // §30. A hand-edited cookie, a stale form post or a row written by a release
    // that had a sixth scheme must never break the surface the owner is looking
    // at — and must never reach `<html data-color-scheme>` either.
    for (const value of [
      "chartreuse",
      "Electric",
      "",
      "  ",
      null,
      undefined,
      7,
      { violet: true },
    ]) {
      expect(parseColorSchemePreference(value)).toBe("violet");
      expect(isColorScheme(value)).toBe(false);
    }
  });

  it("REJECTS an illegal value on the write path", () => {
    // A patch is a deliberate write. An unknown value there means the caller and
    // the value set disagree, which is a bug worth surfacing rather than quietly
    // storing the default over the owner's actual choice.
    expect(() => parseColorScheme("chartreuse")).toThrow(
      AppPreferencesValidationError,
    );
    expect(() =>
      validateAppPreferencesPatch({ colorScheme: "chartreuse" as never }),
    ).toThrow(AppPreferencesValidationError);
    expect(validateAppPreferencesPatch({ colorScheme: "pulse" })).toEqual({
      colorScheme: "pulse",
    });
  });

  it("reads an invalid or absent STORED value as Daly Violet", () => {
    expect(
      normaliseStoredPreferences({ ...STORED_SHAPE, colorScheme: "ocean" })
        .colorScheme,
    ).toBe("ocean");
    // A row written before migration 0039, or by a future release that removed a
    // scheme, still resolves to a working product.
    for (const stored of [undefined, null, "chartreuse", 3]) {
      expect(
        normaliseStoredPreferences({ ...STORED_SHAPE, colorScheme: stored })
          .colorScheme,
      ).toBe("violet");
    }
  });

  it("leaves the appearance alone when the scheme is normalised", () => {
    // The two preferences are independent, including on the degraded read path.
    const preferences = normaliseStoredPreferences({
      ...STORED_SHAPE,
      appearance: "dark",
      colorScheme: "chartreuse",
    });
    expect(preferences.appearance).toBe("dark");
    expect(preferences.colorScheme).toBe("violet");
  });
});

describe("THEME-01 — the first-paint cookie mirror", () => {
  it("reads the scheme out of a Cookie header", () => {
    expect(readColorSchemePreference("dh_color_scheme=pulse")).toBe("pulse");
    expect(
      readColorSchemePreference("dh_appearance=dark; dh_color_scheme=ocean"),
    ).toBe("ocean");
  });

  it("falls back to Daly Violet for a missing, empty or tampered cookie", () => {
    for (const header of [
      null,
      undefined,
      "",
      "dh_appearance=dark",
      "dh_color_scheme=",
      "dh_color_scheme=chartreuse",
    ]) {
      expect(readColorSchemePreference(header)).toBe("violet");
    }
  });

  it("never reflects an unvalidated value into a Set-Cookie header", () => {
    const cookie = serializeColorSchemeCookie(
      "chartreuse; Domain=evil.example" as never,
      { secure: true },
    );
    expect(cookie.startsWith(`${COLOR_SCHEME_COOKIE_NAME}=violet;`)).toBe(true);
    expect(cookie).not.toContain("evil.example");
  });

  it("marks the cookie HttpOnly and SameSite=Lax, and Secure where deployed", () => {
    const local = serializeColorSchemeCookie("electric", { secure: false });
    expect(local).toContain("HttpOnly");
    expect(local).toContain("SameSite=Lax");
    expect(local).toContain("Path=/");
    expect(local).not.toContain("Secure");
    expect(serializeColorSchemeCookie("electric", { secure: true })).toContain(
      "Secure",
    );
  });

  it("requires Secure in every deployed environment, and not in development", () => {
    for (const environment of [
      "production",
      "staging",
      "preview",
      "PRODUCTION",
    ]) {
      expect(isSecureColorSchemeEnvironment(environment)).toBe(true);
    }
    for (const environment of ["development", "test", "", undefined]) {
      expect(isSecureColorSchemeEnvironment(environment)).toBe(false);
    }
  });

  it("uses a cookie name of its own, so the two mirrors cannot collide", () => {
    expect(COLOR_SCHEME_COOKIE_NAME).toBe("dh_color_scheme");
    expect(readColorSchemePreference("dh_appearance=light")).toBe("violet");
  });
});

describe("THEME-01 — the display registry", () => {
  it("names the current scheme in words", () => {
    expect(colorSchemeLabel("violet")).toBe("Daly Violet");
    expect(colorSchemeLabel("electric")).toBe("Electric");
    // A value that should be impossible still resolves rather than throwing:
    // this is used in status text, and status text must not break a page.
    expect(colorSchemeLabel("chartreuse" as never)).toBe("Daly Violet");
  });

  it("throws for an unknown descriptor lookup, which is a programming error", () => {
    expect(() => colorSchemeOption("chartreuse" as never)).toThrow();
  });
});
