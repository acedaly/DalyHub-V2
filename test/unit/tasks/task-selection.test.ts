/**
 * TASKS-06 — the multi-selection state model and the mixed-value summaries.
 *
 * Selection bugs are the expensive kind: a bulk action applies to a set the owner
 * cannot see, so the damage is discovered afterwards. These tests pin the four rules
 * that prevent that — range selection uses DISPLAY order, selection resets when the
 * query changes, selection is pruned to what is on screen, and a mixed field never
 * claims a single value.
 */

import { describe, expect, it } from "vitest";

import {
  EMPTY_TASK_SELECTION,
  bulkFieldLabel,
  summariseBulkField,
  taskSelectionReducer,
  type TaskSelectionAction,
  type TaskSelectionState,
} from "~/modules/tasks/task-selection";

const VISIBLE = ["a", "b", "c", "d", "e"] as const;

function run(
  actions: readonly TaskSelectionAction[],
  from: TaskSelectionState = EMPTY_TASK_SELECTION,
): TaskSelectionState {
  return actions.reduce(taskSelectionReducer, from);
}

const toggle = (
  id: string,
  selected: boolean,
  shift = false,
): TaskSelectionAction => ({
  type: "toggle",
  id,
  selected,
  shift,
  visibleIds: [...VISIBLE],
});

const ids = (state: TaskSelectionState) => [...state.ids].sort();

describe("entering and leaving selection", () => {
  it("starts empty and out of selection mode", () => {
    expect(EMPTY_TASK_SELECTION.mode).toBe(false);
    expect(EMPTY_TASK_SELECTION.ids.size).toBe(0);
  });

  it("enters the mode with nothing selected (the header toggle)", () => {
    const state = run([{ type: "enter" }]);
    expect(state.mode).toBe(true);
    expect(state.ids.size).toBe(0);
  });

  it("enters the mode AND selects the held row (a phone long press)", () => {
    // One gesture, one outcome. Entering the mode without selecting what was held
    // would make the hold feel like it did nothing.
    const state = run([{ type: "enter", id: "c" }]);
    expect(state.mode).toBe(true);
    expect(ids(state)).toEqual(["c"]);
    expect(state.anchorId).toBe("c");
  });

  it("reset leaves the mode and drops everything", () => {
    const state = run([
      toggle("a", true),
      toggle("b", true),
      { type: "reset" },
    ]);
    expect(state).toEqual(EMPTY_TASK_SELECTION);
  });

  it("clear drops the selection but STAYS in selection mode", () => {
    // "I picked the wrong rows" is not "I am done selecting".
    const state = run([toggle("a", true), { type: "clear" }]);
    expect(state.mode).toBe(true);
    expect(state.ids.size).toBe(0);
    expect(state.anchorId).toBeNull();
  });
});

describe("toggling", () => {
  it("adds and removes one row at a time", () => {
    expect(ids(run([toggle("a", true), toggle("c", true)]))).toEqual([
      "a",
      "c",
    ]);
    expect(
      ids(run([toggle("a", true), toggle("c", true), toggle("a", false)])),
    ).toEqual(["c"]);
  });

  it("moves the anchor to the last row toggled", () => {
    expect(run([toggle("a", true), toggle("d", true)]).anchorId).toBe("d");
  });

  it("selecting anything implies selection mode", () => {
    // A checkbox click on a desktop is a legitimate way in; it must not require the
    // header toggle first.
    expect(run([toggle("a", true)]).mode).toBe(true);
  });
});

describe("range selection", () => {
  it("extends from the anchor in DISPLAY order, inclusive", () => {
    const state = run([toggle("b", true), toggle("d", true, true)]);
    expect(ids(state)).toEqual(["b", "c", "d"]);
  });

  it("extends BACKWARDS just as well", () => {
    const state = run([toggle("d", true), toggle("b", true, true)]);
    expect(ids(state)).toEqual(["b", "c", "d"]);
  });

  it("applies the acting row's new state to the whole span", () => {
    // Shift-clicking a SELECTED row clears the span — the behaviour every file
    // manager has, and the reason `selected` is applied rather than each row flipped.
    const state = run([
      { type: "select_visible", visibleIds: [...VISIBLE] },
      toggle("b", false),
      toggle("d", false, true),
    ]);
    expect(ids(state)).toEqual(["a", "e"]);
  });

  it("falls back to a single toggle when there is no anchor", () => {
    const state = run([toggle("c", true, true)]);
    expect(ids(state)).toEqual(["c"]);
  });

  it("falls back to a single toggle when an endpoint is off screen", () => {
    // A range with a missing endpoint is not a range. Guessing one would select rows
    // the owner never pointed at.
    const state = run([
      { type: "toggle", id: "z", selected: true, visibleIds: [...VISIBLE] },
      {
        type: "toggle",
        id: "c",
        selected: true,
        shift: true,
        visibleIds: [...VISIBLE],
      },
    ]);
    expect(ids(state)).toEqual(["c", "z"]);
  });
});

describe("select all visible", () => {
  it("selects exactly what is on screen — never 'everything matching'", () => {
    const state = run([{ type: "select_visible", visibleIds: [...VISIBLE] }]);
    expect(ids(state)).toEqual(["a", "b", "c", "d", "e"]);
    expect(state.anchorId).toBe("e");
  });
});

describe("keeping selection honest about what is visible", () => {
  it("prunes ids that are no longer on screen", () => {
    // A mutation moved two tasks out of the current view. They must stop counting
    // rather than lingering invisibly in the bulk bar's total.
    const state = run(
      [{ type: "prune", visibleIds: ["a", "c"] }],
      run([{ type: "select_visible", visibleIds: [...VISIBLE] }]),
    );
    expect(ids(state)).toEqual(["a", "c"]);
  });

  it("drops an anchor that scrolled out of the result set", () => {
    const state = run(
      [{ type: "prune", visibleIds: ["a"] }],
      run([toggle("a", true), toggle("e", true)]),
    );
    expect(state.anchorId).toBeNull();
  });

  it("returns the SAME state when nothing needs pruning (no needless re-render)", () => {
    const before = run([toggle("a", true)]);
    expect(
      taskSelectionReducer(before, { type: "prune", visibleIds: [...VISIBLE] }),
    ).toBe(before);
  });
});

describe("mixed-value summaries", () => {
  const task = (priority: string | null) => ({ priority });

  it("reports the shared value when every task agrees", () => {
    expect(
      summariseBulkField([task("p1"), task("p1")], (t) => t.priority),
    ).toEqual({ value: "p1", mixed: false });
  });

  it("treats an agreed ABSENCE as a real shared value", () => {
    // Three untriaged tasks are not "mixed" — they all have no priority, and saying
    // "Mixed" would imply a difference that is not there.
    expect(
      summariseBulkField([task(null), task(null)], (t) => t.priority),
    ).toEqual({ value: null, mixed: false });
  });

  it("reports MIXED rather than inventing a current value", () => {
    // This is the §17 rule: with P1s, P2s and untriaged tasks selected, the control
    // must not pretend the selection has one priority.
    expect(
      summariseBulkField(
        [task("p1"), task("p2"), task(null)],
        (t) => t.priority,
      ),
    ).toEqual({ value: null, mixed: true });
    expect(
      summariseBulkField([task("p1"), task(null)], (t) => t.priority),
    ).toEqual({ value: null, mixed: true });
  });

  it("is neither for an empty selection", () => {
    expect(
      summariseBulkField([], (t: { priority: string }) => t.priority),
    ).toEqual({
      value: null,
      mixed: false,
    });
  });

  it("labels the three states in words", () => {
    const label = (v: string) => `Priority ${v}`;
    expect(bulkFieldLabel({ value: "p1", mixed: false }, label)).toBe(
      "Priority p1",
    );
    expect(bulkFieldLabel({ value: null, mixed: true }, label)).toBe("Mixed");
    expect(
      bulkFieldLabel({ value: null, mixed: false }, label, "No priority"),
    ).toBe("No priority");
  });
});
