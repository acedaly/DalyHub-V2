/**
 * DS-08 Search — the record-anchor helper: mapping a canonical record pathname to
 * the anchor entity id the browser carries to `/search` (`boostLinkedTo`), so the
 * linked-record boost is actually reachable through the product UI. Regression for
 * Codex thread PRRT_kwDOTbatJs6T6Oym (the anchor was never sent).
 */

import { describe, expect, it } from "vitest";

import { recordAnchorFromPath } from "~/shared/search/record-anchor";

describe("recordAnchorFromPath", () => {
  it("extracts the entity id from each canonical record path", () => {
    expect(recordAnchorFromPath("/notes/n1")).toBe("n1");
    expect(recordAnchorFromPath("/person/p1")).toBe("p1");
    expect(recordAnchorFromPath("/meeting/m1")).toBe("m1");
    expect(recordAnchorFromPath("/areas/a1")).toBe("a1");
    expect(recordAnchorFromPath("/goals/g1")).toBe("g1");
    expect(recordAnchorFromPath("/projects/pr1")).toBe("pr1");
  });

  it("decodes an encoded id segment", () => {
    expect(recordAnchorFromPath("/notes/a%20b%2Fc")).toBe("a b/c");
  });

  it("returns null for collection, create and nested/action paths", () => {
    expect(recordAnchorFromPath("/notes")).toBeNull();
    expect(recordAnchorFromPath("/notes/")).toBeNull();
    expect(recordAnchorFromPath("/notes/new")).toBeNull();
    expect(recordAnchorFromPath("/notes/resolve")).toBeNull();
    expect(recordAnchorFromPath("/notes/n1/activity")).toBeNull();
    expect(recordAnchorFromPath("/person/p1/mutate")).toBeNull();
  });

  it("returns null for unrelated surfaces, empty input and a bare slash", () => {
    expect(recordAnchorFromPath("/today")).toBeNull();
    expect(recordAnchorFromPath("/tasks")).toBeNull();
    expect(recordAnchorFromPath("")).toBeNull();
    expect(recordAnchorFromPath("/")).toBeNull();
  });

  it("returns null for a malformed percent-encoding rather than throwing", () => {
    expect(recordAnchorFromPath("/notes/%E0%A4%A")).toBeNull();
  });
});
