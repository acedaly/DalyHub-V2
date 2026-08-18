/**
 * TASKS-13 — the checklist domain's PURE rules.
 *
 * Validation, progress and the move, tested without a database or a browser
 * because they have no need of either. The storage guarantees (ordering,
 * isolation, atomicity, the recurrence clone) are proved against the real D1 in
 * `test/kernel/task-checklist.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  CHECKLIST_TITLE_MAX_LENGTH,
  EMPTY_CHECKLIST_PROGRESS,
  MAX_CHECKLIST_ITEMS,
  TaskValidationError,
  checklistIsComplete,
  checklistProgress,
  checklistProgressLabel,
  moveChecklistOrder,
  validateChecklistItemId,
  validateChecklistOrder,
  validateChecklistTitle,
  type TaskChecklistItem,
} from "~/kernel/tasks";

function item(id: string, completed = false, position = 0): TaskChecklistItem {
  return {
    id,
    taskId: "task-1",
    title: id,
    position,
    completed,
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    updatedAt: new Date("2026-08-18T00:00:00.000Z"),
  };
}

describe("checklist title validation", () => {
  it("trims and keeps a plain step", () => {
    expect(validateChecklistTitle("  Check tyre pressures  ")).toBe(
      "Check tyre pressures",
    );
  });

  it("refuses a blank step rather than storing an unreadable row", () => {
    expect(() => validateChecklistTitle("   ")).toThrow(TaskValidationError);
    expect(() => validateChecklistTitle("")).toThrow(TaskValidationError);
  });

  it("refuses a non-string", () => {
    expect(() => validateChecklistTitle(42)).toThrow(TaskValidationError);
    expect(() => validateChecklistTitle(null)).toThrow(TaskValidationError);
  });

  it("collapses a pasted paragraph into ONE line", () => {
    // A checklist item is one line. Without this, pasting a paragraph makes one
    // row as tall as the rest of the list.
    expect(validateChecklistTitle("Fill water\ntanks\tand check\r\ngas")).toBe(
      "Fill water tanks and check gas",
    );
  });

  it("bounds the title, and says so in the message", () => {
    const long = "x".repeat(CHECKLIST_TITLE_MAX_LENGTH + 1);
    expect(() => validateChecklistTitle(long)).toThrow(
      new RegExp(String(CHECKLIST_TITLE_MAX_LENGTH)),
    );
    expect(
      validateChecklistTitle("x".repeat(CHECKLIST_TITLE_MAX_LENGTH)),
    ).toHaveLength(CHECKLIST_TITLE_MAX_LENGTH);
  });

  it("counts code points, so an emoji step is not rejected early", () => {
    const flags = "\u{1F1E6}\u{1F1FA}".repeat(CHECKLIST_TITLE_MAX_LENGTH / 2);
    expect(() => validateChecklistTitle(flags)).not.toThrow();
  });
});

describe("checklist item id validation", () => {
  it("takes an id verbatim", () => {
    expect(validateChecklistItemId("item-1")).toBe("item-1");
  });

  it("refuses an empty, non-string or oversized id", () => {
    expect(() => validateChecklistItemId("")).toThrow(TaskValidationError);
    expect(() => validateChecklistItemId(7)).toThrow(TaskValidationError);
    expect(() => validateChecklistItemId("x".repeat(65))).toThrow(
      TaskValidationError,
    );
  });
});

describe("checklist order validation", () => {
  it("takes an ordered list of ids", () => {
    expect(validateChecklistOrder(["b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("refuses a list that names one item twice", () => {
    // Such a list describes no order at all, so applying part of it would invent
    // one the owner never chose.
    expect(() => validateChecklistOrder(["a", "b", "a"])).toThrow(
      /more than once/,
    );
  });

  it("refuses an empty list, a non-list and an oversized one", () => {
    expect(() => validateChecklistOrder([])).toThrow(TaskValidationError);
    expect(() => validateChecklistOrder("a,b")).toThrow(TaskValidationError);
    expect(() =>
      validateChecklistOrder(
        Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, (_, i) => `i${i}`),
      ),
    ).toThrow(TaskValidationError);
  });
});

describe("checklist progress", () => {
  it("is 0 of 0 for a Task with no checklist, and says nothing", () => {
    expect(checklistProgress([])).toEqual(EMPTY_CHECKLIST_PROGRESS);
    // "0 of 0" is not a sentence, so the label is absent rather than empty — no
    // surface has to decide what it means.
    expect(checklistProgressLabel(checklistProgress([]))).toBeNull();
    expect(checklistProgressLabel(undefined)).toBeNull();
    expect(checklistProgressLabel(null)).toBeNull();
  });

  it("counts a partial checklist", () => {
    const progress = checklistProgress([
      item("a", true),
      item("b", false),
      item("c", true),
      item("d", false),
      item("e", false),
    ]);
    expect(progress).toEqual({ total: 5, completed: 2 });
    expect(checklistProgressLabel(progress)).toBe("2 of 5");
    expect(checklistIsComplete(progress)).toBe(false);
  });

  it("counts a complete checklist, with no percentage and no score", () => {
    const progress = checklistProgress([item("a", true), item("b", true)]);
    expect(progress).toEqual({ total: 2, completed: 2 });
    expect(checklistProgressLabel(progress)).toBe("2 of 2");
    expect(checklistIsComplete(progress)).toBe(true);
    // The two numbers are the whole vocabulary: no "100%", no "done!".
    expect(checklistProgressLabel(progress)).not.toMatch(/%/);
  });

  it("counts a checklist with nothing done yet", () => {
    const progress = checklistProgress([item("a"), item("b"), item("c")]);
    expect(checklistProgressLabel(progress)).toBe("0 of 3");
    expect(checklistIsComplete(progress)).toBe(false);
  });

  it("never calls an EMPTY checklist complete", () => {
    expect(checklistIsComplete(EMPTY_CHECKLIST_PROGRESS)).toBe(false);
    expect(checklistIsComplete(undefined)).toBe(false);
  });
});

describe("moving one item in the order", () => {
  const order = ["a", "b", "c", "d"];

  it("moves up and down by one place", () => {
    expect(moveChecklistOrder(order, "c", -1)).toEqual(["a", "c", "b", "d"]);
    expect(moveChecklistOrder(order, "b", 1)).toEqual(["a", "c", "b", "d"]);
  });

  it("clamps at both ends and returns the SAME array for a no-op", () => {
    // Identity, not equality: the caller uses it to skip the request entirely.
    expect(moveChecklistOrder(order, "a", -1)).toBe(order);
    expect(moveChecklistOrder(order, "d", 1)).toBe(order);
    expect(moveChecklistOrder(order, "a", 0)).toBe(order);
    expect(moveChecklistOrder(order, "missing", -1)).toBe(order);
  });

  it("clamps a large delta to the end rather than refusing it", () => {
    expect(moveChecklistOrder(order, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveChecklistOrder(order, "d", -99)).toEqual(["d", "a", "b", "c"]);
  });

  it("never adds, removes or duplicates an id", () => {
    for (const id of order) {
      for (const delta of [-2, -1, 1, 2]) {
        const next = moveChecklistOrder(order, id, delta);
        expect([...next].sort()).toEqual([...order].sort());
      }
    }
  });
});
