/**
 * DS-04 — pure reorder order-math.
 *
 * Proves moves are strict permutations (no card lost/duplicated), pinned cards
 * stay fixed, and pointer targeting resolves correctly.
 */

import { describe, expect, it } from "vitest";

import {
  moveByStep,
  moveToReorderablePosition,
  ordersDiffer,
  reorderablePositionForPointer,
  reorderablePositionOf,
} from "~/shared/card";

const NONE = new Set<string>();

describe("moveByStep / moveToReorderablePosition", () => {
  it("moves an id up and down while preserving the permutation", () => {
    const order = ["a", "b", "c", "d"];
    expect(moveByStep(order, NONE, "c", -1)).toEqual(["a", "c", "b", "d"]);
    expect(moveByStep(order, NONE, "b", 1)).toEqual(["a", "c", "b", "d"]);
    // Same set of ids, no loss/dup.
    expect([...moveByStep(order, NONE, "a", 1)].sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("clamps at the ends (no-op)", () => {
    const order = ["a", "b", "c"];
    expect(moveByStep(order, NONE, "a", -1)).toEqual(order);
    expect(moveByStep(order, NONE, "c", 1)).toEqual(order);
  });

  it("keeps pinned ids at their absolute index", () => {
    const order = ["a", "b", "c", "d"];
    const pinned = new Set(["b"]);
    // Move 'a' down past pinned 'b': 'b' stays at index 1.
    const next = moveToReorderablePosition(order, pinned, "a", 2);
    expect(next[1]).toBe("b");
    expect([...next].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("refuses to move a pinned id", () => {
    const order = ["a", "b", "c"];
    const pinned = new Set(["b"]);
    expect(moveByStep(order, pinned, "b", -1)).toEqual(order);
  });
});

describe("reorderablePositionForPointer", () => {
  it("resolves the target position from pointer coordinate vs midpoints", () => {
    const order = ["a", "b", "c"];
    const midpoints = new Map([
      ["a", 10],
      ["b", 30],
      ["c", 50],
    ]);
    expect(reorderablePositionForPointer(order, NONE, midpoints, 5)).toBe(0);
    expect(reorderablePositionForPointer(order, NONE, midpoints, 35)).toBe(2);
    expect(reorderablePositionForPointer(order, NONE, midpoints, 100)).toBe(2);
  });
});

describe("helpers", () => {
  it("reorderablePositionOf ignores pinned ids", () => {
    expect(reorderablePositionOf(["a", "b", "c"], new Set(["a"]), "c")).toBe(1);
  });
  it("ordersDiffer detects any change", () => {
    expect(ordersDiffer(["a", "b"], ["a", "b"])).toBe(false);
    expect(ordersDiffer(["a", "b"], ["b", "a"])).toBe(true);
  });
});
