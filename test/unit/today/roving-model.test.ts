import { describe, expect, it } from "vitest";

import {
  firstId,
  flattenOrder,
  lastId,
  nextId,
  prevId,
  reconcileFocus,
  sectionFirstId,
  sectionFirstIdOf,
  sectionLastId,
  tabStopId,
  type RovingOrder,
} from "~/modules/today/keyboard/roving-model";

/**
 * TODAY-05 — the pure roving-navigation model. Arrow Up/Down cross section
 * boundaries and clamp at the ends (no wrap); Home/End move within the current
 * section; the tab stop is the focused task (or the first when none).
 */

const ORDER: RovingOrder = [
  { id: "overdue", taskIds: ["a", "b"] },
  { id: "today", taskIds: ["c"] },
  { id: "anytime", taskIds: ["d", "e", "f"] },
];

describe("roving-model", () => {
  it("flattens sections in visual order", () => {
    expect(flattenOrder(ORDER)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(firstId(ORDER)).toBe("a");
    expect(lastId(ORDER)).toBe("f");
  });

  it("returns nulls for an empty collection", () => {
    const empty: RovingOrder = [{ id: "overdue", taskIds: [] }];
    expect(firstId(empty)).toBeNull();
    expect(lastId(empty)).toBeNull();
    expect(nextId(empty, null)).toBeNull();
    expect(prevId(empty, "x")).toBeNull();
    expect(tabStopId(empty, null)).toBeNull();
  });

  it("moves to the next task, crossing sections", () => {
    expect(nextId(ORDER, "b")).toBe("c"); // overdue → today
    expect(nextId(ORDER, "c")).toBe("d"); // today → anytime
  });

  it("clamps Arrow Down at the last task", () => {
    expect(nextId(ORDER, "f")).toBe("f");
  });

  it("moves to the previous task, crossing sections", () => {
    expect(prevId(ORDER, "c")).toBe("b");
    expect(prevId(ORDER, "d")).toBe("c");
  });

  it("clamps Arrow Up at the first task", () => {
    expect(prevId(ORDER, "a")).toBe("a");
  });

  it("enters from a null/unknown focus predictably", () => {
    expect(nextId(ORDER, null)).toBe("a");
    expect(prevId(ORDER, null)).toBe("f");
    expect(nextId(ORDER, "missing")).toBe("a");
    expect(prevId(ORDER, "missing")).toBe("f");
  });

  it("Home/End move within the current section", () => {
    expect(sectionFirstId(ORDER, "e")).toBe("d"); // first of anytime
    expect(sectionLastId(ORDER, "e")).toBe("f"); // last of anytime
    expect(sectionFirstId(ORDER, "a")).toBe("a");
    expect(sectionLastId(ORDER, "b")).toBe("b"); // overdue: a,b
  });

  it("Home/End fall back to the whole collection when focus is unknown", () => {
    expect(sectionFirstId(ORDER, null)).toBe("a");
    expect(sectionLastId(ORDER, null)).toBe("f");
    expect(sectionFirstId(ORDER, "missing")).toBe("a");
  });

  it("reconciles focus against a changed order", () => {
    expect(reconcileFocus(ORDER, "c")).toBe("c");
    expect(reconcileFocus(ORDER, "gone")).toBeNull();
    expect(reconcileFocus(ORDER, null)).toBeNull();
  });

  it("finds the first task of a section by its id (for Go-to-section)", () => {
    expect(sectionFirstIdOf(ORDER, "anytime")).toBe("d");
    expect(sectionFirstIdOf(ORDER, "today")).toBe("c");
    expect(sectionFirstIdOf(ORDER, "overdue")).toBe("a");
    // An empty or unknown section yields null (the command is omitted for those).
    expect(
      sectionFirstIdOf([{ id: "overdue", taskIds: [] }], "overdue"),
    ).toBeNull();
    expect(sectionFirstIdOf(ORDER, "nope")).toBeNull();
  });

  it("resolves the single tab stop", () => {
    expect(tabStopId(ORDER, "c")).toBe("c"); // focused owns the tab stop
    expect(tabStopId(ORDER, null)).toBe("a"); // else the first task
    expect(tabStopId(ORDER, "gone")).toBe("a"); // stale focus → first
  });
});
