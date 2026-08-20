import { describe, expect, it } from "vitest";

import {
  COLLECTION_TABLE_DEFAULT_THRESHOLD,
  parseCollectionPresentation,
  resolveCollectionPresentation,
} from "~/shared/collection-layout";

/**
 * ADR-100 / CONVERGE-01 §4 — how a collection decides what it looks like.
 *
 * The rule has exactly two inputs and one non-negotiable property: the owner's
 * explicit choice always wins. Everything else — the threshold, the failed
 * count, the misspelled param — is what happens when they have NOT chosen, and
 * each of those is a case a defaulting rule gets wrong by being clever.
 *
 * The threshold is asserted through the exported constant rather than through
 * the literal 40, so moving it is one edit and these tests keep meaning what
 * they say.
 */

const PROJECTS = ["grid", "table"] as const;
const AT = COLLECTION_TABLE_DEFAULT_THRESHOLD;

function resolve(param: string | null, total: number | null) {
  return resolveCollectionPresentation({
    param,
    allowed: PROJECTS,
    total,
    large: "table",
  });
}

describe("resolveCollectionPresentation", () => {
  describe("with no choice made", () => {
    it("keeps the gallery at and below the threshold", () => {
      expect(resolve(null, 0)).toBe("grid");
      expect(resolve(null, AT - 1)).toBe("grid");
      // AT itself is NOT over the threshold — the rule is "more than".
      expect(resolve(null, AT)).toBe("grid");
    });

    it("opens as a table above it", () => {
      expect(resolve(null, AT + 1)).toBe("table");
      expect(resolve(null, AT * 10)).toBe("table");
    });

    /*
     * The count is its own failure domain. Guessing "table" from a failed read
     * would let a transient database error silently change what the page looks
     * like.
     */
    it("falls to the gallery when the size is unknown", () => {
      expect(resolve(null, null)).toBe("grid");
    });
  });

  describe("with a choice made", () => {
    /*
     * The case that makes the rule worth stating. A default that re-asserted
     * itself over an explicit `grid` would be a preference the owner cannot
     * hold.
     */
    it("honours an explicit gallery however large the collection is", () => {
      expect(resolve("grid", AT * 100)).toBe("grid");
    });

    it("honours an explicit table however small it is", () => {
      expect(resolve("table", 0)).toBe("table");
      expect(resolve("table", null)).toBe("table");
    });
  });

  describe("what does NOT count as a choice", () => {
    it("treats a misspelled or tampered value as no choice at all", () => {
      expect(resolve("tabel", AT + 1)).toBe("table");
      expect(resolve("", AT + 1)).toBe("table");
      expect(resolve("../../etc", 0)).toBe("grid");
    });

    /*
     * `?present=list` on Projects names a real presentation that THIS collection
     * does not draw. It is not the owner asking for a gallery, so it falls to
     * the size rule rather than pinning the page to the default.
     */
    it("treats a presentation this collection does not draw as no choice", () => {
      expect(resolve("list", AT + 1)).toBe("table");
      expect(resolve("list", 1)).toBe("grid");
    });
  });

  it("is parameterised by the collection, not hard-coded to Projects", () => {
    // Areas draws grid/list and does not opt in today; if it ever did, it takes
    // the same arithmetic rather than a second one.
    expect(
      resolveCollectionPresentation({
        param: null,
        allowed: ["grid", "list"],
        total: AT + 1,
        large: "list",
      }),
    ).toBe("list");
    // …and a collection that draws only a gallery can never be given a
    // presentation it has no markup for.
    expect(
      resolveCollectionPresentation({
        param: "table",
        allowed: ["grid"],
        total: AT + 1,
        large: "table",
      }),
    ).toBe("grid");
  });

  it("leaves the older parser's contract untouched", () => {
    // `parseCollectionPresentation` still answers the narrower question — "what
    // does this string mean?" — with no notion of size.
    expect(parseCollectionPresentation("table", PROJECTS)).toBe("table");
    expect(parseCollectionPresentation(null, PROJECTS)).toBe("grid");
    expect(parseCollectionPresentation("list", PROJECTS)).toBe("grid");
    expect(parseCollectionPresentation(null, ["list", "grid"])).toBe("list");
    expect(parseCollectionPresentation("table", ["list", "grid"])).toBe("list");
  });
});
