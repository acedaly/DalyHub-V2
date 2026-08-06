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
