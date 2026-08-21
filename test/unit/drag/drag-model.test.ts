/**
 * DHDS-11 — the order math and the sentences, tested without a browser.
 *
 * These are the rules a drag obeys, and the reason they are pure functions is so
 * the pointer path, the keyboard path and the per-surface "Move up" command can
 * be proved to agree rather than assumed to.
 *
 * It replaces `test/unit/card/reorder.test.ts`, which covered DS-04's own order
 * helpers. Those were removed with `ReorderableCardCollection` (a second drag
 * system); their coverage lands here, minus the pinned-card weave, which no
 * DHDS-11 collection has.
 */

import { describe, expect, it } from "vitest";

import {
  dragCancelledMessage,
  dragDroppedMessage,
  dragMovedToMessage,
  dragOverMessage,
  dragPickUpMessage,
  dragPositionMessage,
  insertionIndexForPointer,
  isPermutationOf,
  moveByStep,
  moveWithin,
  ordersDiffer,
} from "~/shared/drag";

const ORDER = ["a", "b", "c", "d"];

describe("insertionIndexForPointer", () => {
  // Slots 20px tall from y=0: centres at 10, 30, 50, 70.
  const CENTRES = [10, 30, 50, 70];

  it("asks for the slot whose centre the pointer has not yet passed", () => {
    expect(insertionIndexForPointer(CENTRES, 0)).toBe(0);
    expect(insertionIndexForPointer(CENTRES, 9)).toBe(0);
    expect(insertionIndexForPointer(CENTRES, 11)).toBe(1);
    expect(insertionIndexForPointer(CENTRES, 31)).toBe(2);
  });

  it("crosses at the CENTRE, not at the edge — which is what makes it settle", () => {
    // Exactly on a centre is "not past it": the boundary is stable rather than
    // oscillating between two answers as the pointer jitters by a pixel.
    expect(insertionIndexForPointer(CENTRES, 30)).toBe(1);
    expect(insertionIndexForPointer(CENTRES, 30.01)).toBe(2);
  });

  it("clamps to the last slot rather than inventing one past the end", () => {
    expect(insertionIndexForPointer(CENTRES, 10_000)).toBe(3);
  });

  it("is 0 for an empty collection", () => {
    expect(insertionIndexForPointer([], 42)).toBe(0);
  });

  it("treats an unmeasured slot as passed, so a partial measure appends", () => {
    // A slot that never mounted (or was detached) must not drag the answer back
    // to the top of the list.
    expect(insertionIndexForPointer([Number.NaN, Number.NaN], 0)).toBe(1);
  });
});

describe("moveWithin", () => {
  it("returns a permutation for every in-range move", () => {
    expect(moveWithin(ORDER, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveWithin(ORDER, "d", 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("clamps an out-of-range target rather than dropping the item", () => {
    expect(moveWithin(ORDER, "b", -5)).toEqual(["b", "a", "c", "d"]);
    expect(moveWithin(ORDER, "b", 99)).toEqual(["a", "c", "d", "b"]);
  });

  it("never mutates its input, and copies on a no-op", () => {
    const next = moveWithin(ORDER, "b", 1);
    expect(ORDER).toEqual(["a", "b", "c", "d"]);
    expect(next).toEqual(ORDER);
    expect(next).not.toBe(ORDER);
  });

  it("copies unchanged when the id is absent", () => {
    expect(moveWithin(ORDER, "zzz", 0)).toEqual(ORDER);
  });

  it("keeps every id exactly once, whatever the move", () => {
    for (let to = -2; to <= 6; to += 1) {
      const next = moveWithin(ORDER, "c", to);
      expect([...next].sort()).toEqual(["a", "b", "c", "d"]);
    }
  });
});

describe("moveByStep", () => {
  it("moves one place and clamps at both ends", () => {
    expect(moveByStep(ORDER, "b", -1)).toEqual(["b", "a", "c", "d"]);
    expect(moveByStep(ORDER, "a", -1)).toEqual(ORDER);
    expect(moveByStep(ORDER, "d", 1)).toEqual(ORDER);
  });

  it("is a no-op for a zero delta or an unknown id", () => {
    expect(moveByStep(ORDER, "b", 0)).toEqual(ORDER);
    expect(moveByStep(ORDER, "zzz", 1)).toEqual(ORDER);
  });

  it("agrees with moveWithin — one move, one meaning", () => {
    // The property that makes "Move up" and a drag the same operation.
    expect(moveByStep(ORDER, "c", -1)).toEqual(moveWithin(ORDER, "c", 1));
  });
});

describe("ordersDiffer", () => {
  it("is false only for the identical sequence", () => {
    expect(ordersDiffer(ORDER, ["a", "b", "c", "d"])).toBe(false);
    expect(ordersDiffer(ORDER, ["a", "c", "b", "d"])).toBe(true);
    expect(ordersDiffer(ORDER, ["a", "b", "c"])).toBe(true);
  });
});

describe("isPermutationOf", () => {
  it("accepts a reordering of the same members", () => {
    expect(isPermutationOf(ORDER, ["d", "c", "b", "a"])).toBe(true);
  });

  it("refuses an added, removed or substituted member", () => {
    expect(isPermutationOf(ORDER, ["a", "b", "c"])).toBe(false);
    expect(isPermutationOf(ORDER, ["a", "b", "c", "e"])).toBe(false);
    expect(isPermutationOf(["a", "b"], ["a", "b", "c"])).toBe(false);
  });

  it("refuses a duplicate on either side", () => {
    expect(isPermutationOf(ORDER, ["a", "a", "c", "d"])).toBe(false);
    expect(isPermutationOf(["a", "a"], ["a", "a"])).toBe(false);
  });
});

describe("the announcements", () => {
  it("state the position in one-based words a person would use", () => {
    expect(dragPositionMessage("Prepare training brief", 2, 8)).toBe(
      "Prepare training brief moved to position 3 of 8.",
    );
    expect(dragDroppedMessage("Prepare training brief", 0, 8)).toBe(
      "Prepare training brief dropped at position 1 of 8.",
    );
  });

  it("teach the keys ONCE, on pick-up", () => {
    const pickUp = dragPickUpMessage("Prepare training brief", 0, 3);
    expect(pickUp).toContain("Picked up Prepare training brief");
    expect(pickUp).toContain("arrow keys");
    // …and never again: a move says only where it now is.
    expect(dragPositionMessage("Prepare training brief", 1, 3)).not.toContain(
      "arrow keys",
    );
  });

  it("name the DESTINATION for a move, not the operation", () => {
    expect(dragMovedToMessage("Prepare training brief", "Personal")).toBe(
      "Prepare training brief moved to Personal.",
    );
    expect(dragOverMessage("Prepare training brief", "Personal")).toBe(
      "Prepare training brief over Personal. Release to move.",
    );
  });

  it("say the object stayed where it was when a move is abandoned", () => {
    expect(dragCancelledMessage("Prepare training brief")).toBe(
      "Move cancelled. Prepare training brief stayed where it was.",
    );
    expect(
      dragCancelledMessage("Prepare training brief", "this list changed."),
    ).toContain("this list changed.");
  });
});
