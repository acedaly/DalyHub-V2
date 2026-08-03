/**
 * PX-02 / THEME-01 — entity-identity accent tokens, in every curated theme.
 *
 * The entity accents (`--dh-entity-<type>-accent`) are used at identity sites (icon,
 * card edge, chip). This test enforces that each is resolved in EVERY theme (not just
 * light and dark), that the two dark blocks stay in parity, that dark actually
 * remaps rather than inheriting the light values, and that each accent meets 3:1
 * non-text contrast against its own theme's background so the glyph stays legible.
 *
 * The colour VALUES are asserted against the TS mirror in `tokens.test.ts`; this file
 * is about coverage and legibility.
 */

import { describe, expect, it } from "vitest";

import { THEME_IDS } from "~/kernel/preferences/theme-preference";
import { ENTITY_TYPES } from "~/shared/entity";

import {
  darkSystemTokens,
  effectiveThemeTokens,
  themeTokens,
} from "./token-css";

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("PX-02 entity accent tokens", () => {
  it("resolves an accent for every entity type in every curated theme", () => {
    for (const themeId of THEME_IDS) {
      const effective = effectiveThemeTokens(themeId);
      for (const type of ENTITY_TYPES) {
        const token = `dh-entity-${type}-accent`;
        expect(
          effective.has(token),
          `theme "${themeId}" does not resolve --${token}`,
        ).toBe(true);
      }
    }
  });

  it("keeps the two dark blocks in parity for entity accents", () => {
    const darkExplicit = themeTokens("daly-dark");
    const darkSystem = darkSystemTokens();
    for (const type of ENTITY_TYPES) {
      const token = `dh-entity-${type}-accent`;
      expect(darkSystem.get(token)).toBe(darkExplicit.get(token));
    }
  });

  it("remaps the accent between the light default and the dark theme", () => {
    const light = effectiveThemeTokens("daly-light");
    const dark = effectiveThemeTokens("daly-dark");
    for (const type of ENTITY_TYPES) {
      const token = `dh-entity-${type}-accent`;
      expect(dark.get(token)).not.toBe(light.get(token));
    }
  });

  it("meets 3:1 non-text contrast against every theme's background", () => {
    for (const themeId of THEME_IDS) {
      const effective = effectiveThemeTokens(themeId);
      const background = effective.get("dh-color-surface-page")!;
      for (const type of ENTITY_TYPES) {
        const accent = effective.get(`dh-entity-${type}-accent`)!;
        const ratio = contrastRatio(accent, background);
        expect(
          ratio,
          `${themeId} ${type} accent ${accent} on ${background} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
