/**
 * THEME-02 — the Modern Light / Modern Dark pair.
 *
 * The other token tests already prove things that are true of EVERY theme: every
 * semantic name resolves, the TS data mirrors the CSS, and every contrast pair
 * clears AA. This file proves the things that are specifically claimed about the
 * PAIR, because they are the claims a reader would otherwise have to take on trust:
 *
 *   1. it really is a pair — the two themes are structural twins, differing only in
 *      colour and elevation, so switching between them cannot move the application;
 *   2. the dark half has no light surface leaking into it, which is the failure a
 *      dark theme actually ships with;
 *   3. the dark half is layered rather than flat, so a card is distinguishable from
 *      the page it sits on;
 *   4. the dark half is not pure black across large areas, and the light half is
 *      not sterile pure white;
 *   5. neither half quietly reintroduces the low-contrast muted text a dark theme
 *      tends to drift towards (covered numerically by `contrast.test.ts`, checked
 *      here as an ordering property so a future edit cannot satisfy AA by making
 *      "muted" the SAME colour as primary text).
 */

import { describe, expect, it } from "vitest";

import { THEME_IDS } from "~/kernel/preferences/theme-preference";
import { COLOR_TOKEN_NAMES, THEME_COLOR_MAPS } from "~/shared/tokens";

import { effectiveThemeTokens, themeTokens } from "./token-css";

const LIGHT = "modern-light";
const DARK = "modern-dark";

/** WCAG relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const s = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Every surface a page, panel or card is painted with. */
const SURFACES = [
  "surface-page",
  "surface",
  "surface-raised",
  "surface-sunken",
  "surface-nav",
  "surface-header",
  "surface-card",
] as const;

describe("THEME-02 both themes are registered", () => {
  it("ships Modern Light and Modern Dark as curated themes", () => {
    expect(THEME_IDS).toContain(LIGHT);
    expect(THEME_IDS).toContain(DARK);
    expect(THEME_COLOR_MAPS[LIGHT]).toBeDefined();
    expect(THEME_COLOR_MAPS[DARK]).toBeDefined();
  });
});

describe("THEME-02 the pair is structurally identical", () => {
  it("declares exactly the same token NAMES in both blocks", () => {
    // If one half declared a token the other did not, that token would fall back
    // to the base map on one side only — which is precisely how a light value
    // leaks into a dark theme.
    const light = [...themeTokens(LIGHT).keys()].sort();
    const dark = [...themeTokens(DARK).keys()].sort();
    expect(dark).toEqual(light);
  });

  it("changes only colour, entity accents and elevation between the two", () => {
    // Geometry, spacing, type, motion and layout are theme-independent by design
    // (they live on `:root`). This asserts neither half smuggles one in, so the
    // two themes cannot differ in anything the user would experience as structure.
    const structural = (id: string) =>
      [...themeTokens(id).keys()].filter(
        (name) =>
          !name.startsWith("dh-color-") &&
          !name.startsWith("dh-entity-") &&
          !name.startsWith("dh-shadow-"),
      );
    expect(structural(LIGHT)).toEqual([]);
    expect(structural(DARK)).toEqual([]);
  });

  it("resolves identical geometry, spacing, type and motion in both", () => {
    const light = effectiveThemeTokens(LIGHT);
    const dark = effectiveThemeTokens(DARK);
    const shared = [...light.keys()].filter(
      (name) =>
        name.startsWith("dh-radius-") ||
        name.startsWith("dh-space-") ||
        name.startsWith("dh-font-") ||
        name.startsWith("dh-line-height-") ||
        name.startsWith("dh-control-height-") ||
        name.startsWith("dh-duration-") ||
        name.startsWith("dh-ease-") ||
        name.startsWith("dh-border-width-"),
    );
    expect(shared.length).toBeGreaterThan(20);
    for (const name of shared) {
      expect(dark.get(name), `--${name} differs between the pair`).toBe(
        light.get(name),
      );
    }
  });

  it("gives every semantic colour a value in both halves", () => {
    for (const name of COLOR_TOKEN_NAMES) {
      expect(THEME_COLOR_MAPS[LIGHT][name], `${LIGHT} --${name}`).toBeTruthy();
      expect(THEME_COLOR_MAPS[DARK][name], `${DARK} --${name}`).toBeTruthy();
    }
  });
});

describe("THEME-02 no light surface leaks into Modern Dark", () => {
  const dark = THEME_COLOR_MAPS[DARK];

  it("keeps every surface genuinely dark", () => {
    for (const surface of SURFACES) {
      const value = dark[surface];
      expect(
        luminance(value),
        `${surface} (${value}) is too light for a dark theme`,
      ).toBeLessThan(0.06);
    }
  });

  it("keeps every interactive and skeleton surface dark too", () => {
    // These are the ones a hurried dark theme forgets, because they are only
    // visible on hover or during a load.
    for (const name of [
      "hover-surface",
      "active-surface",
      "disabled-surface",
      "secondary",
      "secondary-hover",
      "skeleton-base",
      "skeleton-highlight",
      // `progress-track` is deliberately NOT in this list any more.
      //
      // DS-14 §6.5 requires the track to clear 3:1 against `surface-card`, so
      // that the EXTENT of a progress bar — not only its filled portion — is a
      // visible boundary rather than a suggestion. On a dark card that can only
      // be satisfied by a mid-tone track, which is by construction lighter than
      // the ceiling this assertion holds every other surface to.
      //
      // The two rules genuinely conflict and the newer, explicitly-decided one
      // wins (ADR-068 decision 6 over THEME-02; AGENTS.md's "a later, explicitly
      // dated decision supersedes"). The track is still asserted, harder, in
      // `ds-14-theme-invariants.test.ts` — in BOTH directions, against the card
      // and against the fill — so it is not unpoliced, it is policed by the rule
      // that actually applies to it.
      "nav-selected-surface",
    ] as const) {
      const value = dark[name];
      expect(
        luminance(value),
        `${name} (${value}) is a light surface`,
      ).toBeLessThan(0.06);
    }
  });

  it("keeps every tinted status surface dark", () => {
    for (const name of COLOR_TOKEN_NAMES.filter((n) =>
      n.endsWith("-surface"),
    )) {
      const value = dark[name];
      expect(
        luminance(value),
        `${name} (${value}) is a light tint`,
      ).toBeLessThan(0.06);
    }
  });

  it("uses light text, not dark text, everywhere text is defined", () => {
    for (const name of ["text", "text-secondary", "text-muted"] as const) {
      expect(luminance(dark[name]), `${name}`).toBeGreaterThan(0.25);
    }
  });
});

describe("THEME-02 Modern Dark is layered, not flat or black", () => {
  const dark = THEME_COLOR_MAPS[DARK];

  it("separates the card from the page it sits on", () => {
    // "Cards indistinguishable from the page background" is an explicit failure
    // mode for this theme, so the separation is asserted rather than eyeballed.
    expect(dark["surface-card"]).not.toBe(dark["surface-page"]);
    expect(luminance(dark["surface-card"])).toBeGreaterThan(
      luminance(dark["surface-page"]),
    );
    expect(luminance(dark["surface-raised"])).toBeGreaterThan(
      luminance(dark["surface-card"]),
    );
    expect(luminance(dark["surface-sunken"])).toBeLessThan(
      luminance(dark["surface-page"]),
    );
  });

  it("avoids pure black across the large areas", () => {
    for (const surface of [
      "surface-page",
      "surface",
      "surface-nav",
      "surface-card",
    ] as const) {
      expect(dark[surface].toLowerCase()).not.toBe("#000000");
      expect(
        luminance(dark[surface]),
        `${surface} is effectively pure black`,
      ).toBeGreaterThan(0.002);
    }
  });

  it("keeps the muted ramp genuinely stepped, not three names for one colour", () => {
    expect(luminance(dark.text)).toBeGreaterThan(
      luminance(dark["text-secondary"]),
    );
    expect(luminance(dark["text-secondary"])).toBeGreaterThan(
      luminance(dark["text-muted"]),
    );
  });
});

describe("THEME-02 Modern Light is warm, not sterile", () => {
  const light = THEME_COLOR_MAPS[LIGHT];

  it("uses an off-white page rather than pure white", () => {
    expect(light["surface-page"].toLowerCase()).not.toBe("#ffffff");
    expect(luminance(light["surface-page"])).toBeLessThan(0.95);
    expect(luminance(light["surface-page"])).toBeGreaterThan(0.8);
  });

  it("lifts the card ABOVE the page, so content reads as paper on a surround", () => {
    expect(luminance(light["surface-card"])).toBeGreaterThan(
      luminance(light["surface-page"]),
    );
    expect(luminance(light["surface-sunken"])).toBeLessThan(
      luminance(light["surface-page"]),
    );
  });

  it("keeps the text ramp stepped", () => {
    expect(luminance(light.text)).toBeLessThan(
      luminance(light["text-secondary"]),
    );
    expect(luminance(light["text-secondary"])).toBeLessThan(
      luminance(light["text-muted"]),
    );
  });
});
