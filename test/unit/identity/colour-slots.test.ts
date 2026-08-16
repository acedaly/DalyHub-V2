/**
 * The identity colour SLOT vocabulary, held to its icon sibling's standard.
 *
 * `colour_slot` is stored in an unconstrained column (migration 0042), on the
 * same bargain `icon_key` is stored under: the vocabulary lives in the kernel
 * and is enforced at the write boundary rather than in a CHECK that would need a
 * migration every time the ramp changes. That bargain is only as good as these
 * assertions, so they mirror `entity-icons/catalogue.test.ts` deliberately —
 * same cases, same reasoning, one vocabulary each.
 */

import { describe, expect, it } from "vitest";

import {
  DERIVED_IDENTITY_SLOTS,
  DERIVED_IDENTITY_SLOT_COUNT,
  IDENTITY_COLOUR_SLOTS,
  identityForRank,
  isIdentityColourSlot,
  isRejectedIdentityColourSlot,
  normaliseIdentityColourSlot,
} from "~/kernel/entities/identity-colour-slots";
import { IDENTITY_RAMP, IDENTITY_SLOT_NAMES } from "~/shared/tokens";

describe("the slot vocabulary", () => {
  it("holds sixteen distinct slots", () => {
    expect(IDENTITY_COLOUR_SLOTS).toHaveLength(16);
    expect(new Set(IDENTITY_COLOUR_SLOTS).size).toBe(16);
  });

  /*
   * The kernel's list and the generated ramp are two halves of one thing: the
   * kernel decides what may be STORED, the ramp decides what may be PAINTED. A
   * slot in one and not the other is either a colour nobody can choose or a
   * choice that renders nothing, and both fail silently in production.
   */
  it("is the same list, in the same order, as the generated ramp", () => {
    expect([...IDENTITY_COLOUR_SLOTS]).toEqual([...IDENTITY_SLOT_NAMES]);
  });

  it("gives every slot all four roles in both appearances", () => {
    for (const slot of IDENTITY_COLOUR_SLOTS) {
      for (const appearance of ["light", "dark"] as const) {
        const roles = IDENTITY_RAMP[appearance][slot];
        for (const role of ["hue", "tint", "edge", "soft"] as const) {
          expect(roles[role], `${appearance} ${slot} ${role}`).toMatch(
            /^#[0-9a-f]{6}$/,
          );
        }
      }
    }
  });

  /*
   * The single most important invariant in IDENTITY-01, and the one §14 is
   * about: adding ten slots must not repaint a single record that chose nothing.
   * The derived fallback folds over the FIRST SIX slots, in the order the six
   * shipped accents already used — so an Area at rank 0 is still the violet one.
   */
  it("derives over the first six slots only, in the shipped order", () => {
    expect(DERIVED_IDENTITY_SLOT_COUNT).toBe(6);
    expect([...DERIVED_IDENTITY_SLOTS]).toEqual([
      "violet",
      "green",
      "red",
      "orange",
      "blue",
      "teal",
    ]);
    expect([...IDENTITY_COLOUR_SLOTS].slice(0, 6)).toEqual([
      ...DERIVED_IDENTITY_SLOTS,
    ]);
  });
});

describe("deriving a slot from a rank", () => {
  it("gives six consecutive ranks six different slots", () => {
    const slots = [0, 1, 2, 3, 4, 5].map(identityForRank);
    expect(new Set(slots).size).toBe(6);
  });

  it("wraps at the sixth, so a seventh Area is not undrawable", () => {
    expect(identityForRank(6)).toBe(identityForRank(0));
    expect(identityForRank(13)).toBe(identityForRank(1));
  });

  it("folds a hostile rank rather than trusting it", () => {
    // A bad caller must not be able to produce a slot the ramp has no value for.
    for (const rank of [-1, -7, 2.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isIdentityColourSlot(identityForRank(rank)), `rank ${rank}`).toBe(
        true,
      );
    }
  });

  it("never derives a slot outside the six", () => {
    for (let rank = -20; rank <= 40; rank += 1) {
      expect(DERIVED_IDENTITY_SLOTS).toContain(identityForRank(rank));
    }
  });
});

describe("normalising a slot from an untrusted boundary", () => {
  it("accepts a known slot", () => {
    expect(normaliseIdentityColourSlot("teal")).toBe("teal");
    expect(normaliseIdentityColourSlot("  brown  ")).toBe("brown");
  });

  it("treats absence and emptiness as no choice", () => {
    expect(normaliseIdentityColourSlot(null)).toBeNull();
    expect(normaliseIdentityColourSlot(undefined)).toBeNull();
    expect(normaliseIdentityColourSlot("")).toBeNull();
    expect(normaliseIdentityColourSlot("   ")).toBeNull();
  });

  it("REFUSES anything outside the vocabulary rather than storing it", () => {
    // A hex is the case the whole controlled vocabulary exists to prevent: it
    // has no contrast guarantee, no dark counterpart, and it would be painted
    // straight onto a page.
    for (const value of [
      "#ff0000",
      "rgb(255,0,0)",
      "crimson",
      "indigo",
      "7",
      "0",
      // Case matters: a slot is an exact stored name, not a display label.
      "Teal",
      "<script>",
      "url(x)",
      "var(--identity-teal)",
    ]) {
      expect(normaliseIdentityColourSlot(value), value).toBeNull();
    }
    expect(normaliseIdentityColourSlot(7)).toBeNull();
    expect(normaliseIdentityColourSlot({ slot: "teal" })).toBeNull();
  });

  it("distinguishes 'not chosen' from 'chosen badly'", () => {
    // The distinction the storage normaliser cannot make and a form must: a
    // route that silently discards a bad value tells the owner it was saved.
    expect(isRejectedIdentityColourSlot(null)).toBe(false);
    expect(isRejectedIdentityColourSlot(undefined)).toBe(false);
    expect(isRejectedIdentityColourSlot("")).toBe(false);
    expect(isRejectedIdentityColourSlot("   ")).toBe(false);
    expect(isRejectedIdentityColourSlot("teal")).toBe(false);
    expect(isRejectedIdentityColourSlot("#ff0000")).toBe(true);
    expect(isRejectedIdentityColourSlot("chartreuse")).toBe(true);
    expect(isRejectedIdentityColourSlot(7)).toBe(true);
  });

  it("guards the type predicate too", () => {
    expect(isIdentityColourSlot("violet")).toBe(true);
    expect(isIdentityColourSlot("indigo")).toBe(false);
    expect(isIdentityColourSlot(null)).toBe(false);
    expect(isIdentityColourSlot(0)).toBe(false);
  });
});
