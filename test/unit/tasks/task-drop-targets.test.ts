/**
 * DHDS-11 — which Task destinations exist, and what each one writes.
 *
 * This is the entrance exam of the whole phase expressed as a test: a bucket is
 * a destination exactly when its key IS a value of a stored field, and the drop
 * writes that field through the canonical `/tasks/bulk` intent. Everything else
 * must answer null, because a destination whose meaning is unclear is a
 * destination the product does not have.
 */

import { describe, expect, it } from "vitest";

import {
  isTaskDropDimension,
  TASK_DROP_DIMENSIONS,
  taskDropSubmission,
  taskDropUndoLabel,
} from "~/modules/tasks/task-drop-targets";
import { TASK_GROUP_BYS } from "~/kernel/task-views";

describe("which grouping dimensions are spatial", () => {
  it("is exactly the four whose bucket key is a value of a stored field", () => {
    expect([...TASK_DROP_DIMENSIONS]).toEqual([
      "parent",
      "priority",
      "status",
      "sector",
    ]);
  });

  it("refuses the DERIVED date ranges — no date is named by `due_this_week`", () => {
    expect(isTaskDropDimension("due_state")).toBe(false);
    expect(isTaskDropDimension("planned")).toBe(false);
  });

  it("refuses delegation, which is an act rather than a metadata choice", () => {
    expect(isTaskDropDimension("delegate")).toBe(false);
  });

  it("classifies every dimension the product actually offers", () => {
    // A new grouping added without a decision here would be silently
    // undraggable, which is the safe direction — but it must be a DECISION.
    for (const dimension of TASK_GROUP_BYS) {
      if (dimension === "none") continue;
      expect(typeof isTaskDropDimension(dimension)).toBe("boolean");
    }
  });
});

describe("what a drop writes", () => {
  it("a Project bucket sets the structural parent, with its KIND", () => {
    expect(taskDropSubmission("parent", "pr-1", "project")).toEqual({
      fields: { intent: "set_parent", parentKind: "project", parentId: "pr-1" },
      patch: { parent: { kind: "project", id: "pr-1", title: "" } },
    });
  });

  it("an Area bucket says `area`, because the spine link is a different one", () => {
    expect(
      taskDropSubmission("parent", "ar-1", "area")?.fields.parentKind,
    ).toBe("area");
  });

  it("refuses a parent bucket whose kind is unknown rather than guessing", () => {
    // The server never guesses which spine link a destination wants, so neither
    // does this: no kind, no destination.
    expect(taskDropSubmission("parent", "pr-1", null)).toBeNull();
    expect(taskDropSubmission("parent", "pr-1")).toBeNull();
  });

  it("the Inbox bucket CLEARS the parent — an empty id is the explicit move", () => {
    expect(taskDropSubmission("parent", "__none")).toEqual({
      fields: { intent: "set_parent", parentKind: "", parentId: "" },
      patch: { parent: null },
    });
  });

  it("a priority bucket sets the priority", () => {
    expect(taskDropSubmission("priority", "p1")).toEqual({
      fields: { intent: "set_priority", priority: "p1" },
      patch: { priority: "p1" },
    });
  });

  it("refuses a priority bucket that is not one of the four", () => {
    expect(taskDropSubmission("priority", "untriaged")).toBeNull();
    expect(taskDropSubmission("priority", "__none")).toBeNull();
  });

  it("a status bucket sets the workflow status", () => {
    expect(taskDropSubmission("status", "in_progress")).toEqual({
      fields: { intent: "set_status", status: "in_progress" },
      patch: { status: "in_progress" },
    });
  });

  it("refuses the COMPLETED bucket — completion is not this field", () => {
    /*
     * `completed` is derived from spine completion, not from
     * `task_details.status`. Accepting it would make a drop a lifecycle change
     * wearing a re-bucket's clothes — and completion has its own control on
     * every row, its own Undo and a recurrence consequence.
     */
    expect(taskDropSubmission("status", "completed")).toBeNull();
  });

  it("a sector bucket sets the Time Sector, and `__none` clears it", () => {
    expect(taskDropSubmission("sector", "this_week")).toEqual({
      fields: { intent: "set_sector", sector: "this_week" },
      patch: { timeSector: "this_week" },
    });
    expect(taskDropSubmission("sector", "__none")).toEqual({
      fields: { intent: "set_sector", sector: "" },
      patch: { timeSector: null },
    });
  });

  it("refuses a sector bucket that is not a Time Sector", () => {
    expect(taskDropSubmission("sector", "someday")).toBeNull();
  });

  it("only ever posts an intent the bulk route already accepts", () => {
    // The hard architectural requirement: no drag mutation path exists.
    const canonical = new Set([
      "set_parent",
      "set_priority",
      "set_status",
      "set_sector",
    ]);
    for (const [dimension, key, kind] of [
      ["parent", "pr-1", "project"],
      ["parent", "__none", null],
      ["priority", "p3", null],
      ["status", "on_hold", null],
      ["sector", "long_term", null],
    ] as const) {
      const submission = taskDropSubmission(dimension, key, kind);
      expect(submission).not.toBeNull();
      expect(canonical.has(submission!.fields.intent!)).toBe(true);
    }
  });
});

describe("what the toast says", () => {
  it("names the DESTINATION, never the gesture", () => {
    expect(taskDropUndoLabel("parent", "Personal")).toBe("Moved to Personal");
    expect(taskDropUndoLabel("priority", "Priority 1")).toBe(
      "Set to Priority 1",
    );
    expect(taskDropUndoLabel("status", "On hold")).toBe("Marked On hold");
    expect(taskDropUndoLabel("sector", "This week")).toBe("Moved to This week");
    for (const dimension of TASK_DROP_DIMENSIONS) {
      expect(taskDropUndoLabel(dimension, "Personal")).not.toMatch(
        /drag|drop|operation|success/i,
      );
    }
  });
});
