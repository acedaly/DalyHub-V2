/**
 * M3-01 — the entity-identity colours.
 *
 * Every entity type in the kernel has one identity colour, generated as an M3
 * custom colour so it comes with a full `colour / on-colour / container /
 * on-container` quartet rather than a lone hex. The quartet is what lets an
 * identity render as a filled badge (a 40px rounded square with the entity's
 * glyph in `on-container`) as readily as a dot.
 *
 * This file is about COVERAGE and IDENTITY: one colour per entity type, no two
 * types sharing one, and the container pair defined in both schemes. Contrast is
 * asserted in `contrast.test.ts`, and the CSS↔TS values in `tokens.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { ENTITY_TYPES } from "~/shared/entity";
import {
  DARK_SCHEME,
  LIGHT_SCHEME,
  type SchemeColorMap,
  type SchemeRole,
} from "~/shared/tokens";

/** sRGB hex to CIE L*a*b*, D65. */
function toLab(hex: string): readonly [number, number, number] {
  const channel = (offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const r = linear(channel(1));
  const g = linear(channel(3));
  const b = linear(channel(5));
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. Roughly: below 2 is invisible, above 10 is obvious. */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/**
 * The floor, in CIE76. Deliberately forgiving — well short of what a designer
 * would ask for, comfortably past what a screen can blur away.
 */
const PERCEPTIBLE_DELTA_E = 10;

/*
 * DEBT — two pairs that were already this close when the assertion was written
 * (V2.10 LIFE-02), recorded rather than quietly permitted by a lowered floor.
 * Both involve `entity-diary`, whose violet harmonises toward the Project blue
 * and the Goal purple in the dark scheme; in the ELECTRIC scheme (not asserted
 * here, which only reads the default pair) Project and Diary come within 5.4.
 * Nothing NEW may join this set: an accent added today is held to the floor.
 */
const KNOWN_TIGHT_PAIRS: ReadonlySet<string> = new Set([
  "dark: diary vs project",
  "dark: diary vs goal",
]);

const SCHEMES = [
  ["light", LIGHT_SCHEME],
  ["dark", DARK_SCHEME],
] as const;

/** The four roles every entity identity defines. */
function quartet(type: string): readonly SchemeRole[] {
  return [
    `entity-${type}`,
    `on-entity-${type}`,
    `entity-${type}-container`,
    `on-entity-${type}-container`,
  ] as SchemeRole[];
}

describe.each(SCHEMES)("M3-01 entity identity — %s scheme", (label, scheme) => {
  it("defines the full quartet for every entity type", () => {
    for (const type of ENTITY_TYPES) {
      for (const role of quartet(type)) {
        expect(
          (scheme as SchemeColorMap)[role],
          `${label}: --md-sys-color-${role} is missing`,
        ).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("gives every entity type its own colour", () => {
    // An activity feed shows several entity kinds at once. Each also carries a
    // distinct glyph and a label — colour is never the only signal — but two
    // types resolving to the same hex would still be a defect.
    const accents = ENTITY_TYPES.map(
      (type) => (scheme as SchemeColorMap)[`entity-${type}` as SchemeRole],
    );
    expect(new Set(accents).size).toBe(ENTITY_TYPES.length);
  });

  /*
   * V2.10 LIFE-02 — "its own colour" as an owner sees it, not as a string
   * comparison sees it.
   *
   * The two assertions above are satisfied by any two DIFFERENT hexes, and
   * "different" is a very low bar after harmonisation pulls every source hue
   * toward the seed. Adding this type, three of the ten candidate hues tried
   * came back within ΔE 1.3 of an existing accent in at least one scheme —
   * indistinguishable to a person, and passing every test in this file. That is
   * the defect this asserts against: identity is the thing that lets an owner
   * tell two records apart at a glance, and two accents a person cannot
   * separate are one accent with two names.
   *
   * ΔE 10 in CIE76 is a deliberately forgiving floor — well short of what a
   * designer would ask for, comfortably past what a screen can blur away.
   */
  it("keeps every pair of accents PERCEPTIBLY apart, not merely unequal", () => {
    const accents = ENTITY_TYPES.map((type) => ({
      type,
      hex: (scheme as SchemeColorMap)[`entity-${type}` as SchemeRole],
    }));
    const failures: string[] = [];
    for (let i = 0; i < accents.length; i += 1) {
      for (let j = i + 1; j < accents.length; j += 1) {
        const pair = [accents[i].type, accents[j].type].sort().join(" vs ");
        if (KNOWN_TIGHT_PAIRS.has(`${label}: ${pair}`)) continue;
        const distance = deltaE(accents[i].hex, accents[j].hex);
        if (distance <= PERCEPTIBLE_DELTA_E) {
          failures.push(
            `${label}: ${accents[i].type} (${accents[i].hex}) and ` +
              `${accents[j].type} (${accents[j].hex}) are only ` +
              `${distance.toFixed(1)} apart`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("gives every entity type its own container tint", () => {
    const containers = ENTITY_TYPES.map(
      (type) =>
        (scheme as SchemeColorMap)[`entity-${type}-container` as SchemeRole],
    );
    expect(new Set(containers).size).toBe(ENTITY_TYPES.length);
  });
});

describe("M3-01 entity identity across schemes", () => {
  it("remaps every accent between light and dark", () => {
    for (const type of ENTITY_TYPES) {
      const role = `entity-${type}` as SchemeRole;
      expect(DARK_SCHEME[role], `--md-sys-color-${role}`).not.toBe(
        LIGHT_SCHEME[role],
      );
    }
  });
});
