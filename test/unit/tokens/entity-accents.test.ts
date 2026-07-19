/**
 * PX-02 — entity-identity accent tokens.
 *
 * The entity accents (`--dh-entity-<type>-accent`) are used at identity sites (icon,
 * card edge, chip). This test enforces that each is defined in the light map AND
 * both dark blocks (parity, like the colour tokens), that dark actually remaps, and
 * that each accent meets a 3:1 non-text contrast against its theme background so the
 * glyph is legible.
 */

import { describe, expect, it } from "vitest";

import { ENTITY_TYPES } from "~/shared/entity";

import { darkExplicitTokens, darkSystemTokens, lightTokens } from "./token-css";

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
  const light = lightTokens();
  const darkExplicit = darkExplicitTokens();
  const darkSystem = darkSystemTokens();
  const LIGHT_BG = light.get("dh-color-bg")!;
  const DARK_BG = darkExplicit.get("dh-color-bg")!;

  it("defines an accent for every entity type in all three theme blocks", () => {
    for (const type of ENTITY_TYPES) {
      const token = `dh-entity-${type}-accent`;
      expect(light.has(token), `light missing --${token}`).toBe(true);
      expect(darkExplicit.has(token), `dark missing --${token}`).toBe(true);
      expect(darkSystem.has(token), `dark(system) missing --${token}`).toBe(
        true,
      );
    }
  });

  it("keeps the two dark blocks in parity for entity accents", () => {
    for (const type of ENTITY_TYPES) {
      const token = `dh-entity-${type}-accent`;
      expect(darkSystem.get(token)).toBe(darkExplicit.get(token));
    }
  });

  it("remaps the accent between light and dark", () => {
    for (const type of ENTITY_TYPES) {
      const token = `dh-entity-${type}-accent`;
      expect(darkExplicit.get(token)).not.toBe(light.get(token));
    }
  });

  it("meets 3:1 non-text contrast against the theme background", () => {
    for (const type of ENTITY_TYPES) {
      const token = `dh-entity-${type}-accent`;
      const lightRatio = contrastRatio(light.get(token)!, LIGHT_BG);
      const darkRatio = contrastRatio(darkExplicit.get(token)!, DARK_BG);
      expect(
        lightRatio,
        `${type} light accent ${light.get(token)} = ${lightRatio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        darkRatio,
        `${type} dark accent ${darkExplicit.get(token)} = ${darkRatio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
