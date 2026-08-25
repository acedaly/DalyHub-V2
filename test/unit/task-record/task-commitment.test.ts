/**
 * V2.4-GATE-02 — "overdue" is a claim about work the owner still OWES.
 *
 * The product-facing meaning of overdue is *the due date has passed AND this
 * Task is still an active commitment* — not *the date is earlier than today*.
 * Before this item the second sentence was what three surfaces implemented, so a
 * **cancelled** Task with a passed deadline was painted in the overdue colour
 * beside its own "Cancelled" pill: manufactured urgency on work nobody is going
 * to do, which `AGENTS.md` §2.4 ("calm over urgent") rules out.
 *
 * The answer is the KERNEL's and there is exactly one of it. These tests walk the
 * whole status vocabulary through it, then prove that the two adapters every
 * surface actually calls — `taskStillOwed` over a serialised item and
 * `toTaskRowProjection` over a list row — return the same answer, so no surface
 * can hold a second opinion.
 */

import { describe, expect, it } from "vitest";

import {
  TASK_STATUSES,
  isTaskOutOfCommitment,
  isTaskStillOwed,
  type CommitmentState,
  type TaskStatus,
} from "~/kernel/tasks";
import {
  taskStateBreakdown,
  toTaskCardData,
} from "~/modules/tasks/tasks-view-model";
import {
  taskStillOwed,
  taskUrgency,
  toTaskRowProjection,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";

const TODAY = "2026-08-22";
const PAST = "2026-07-06";
const FUTURE = "2026-09-06";

function item(
  over: Partial<SerializedTaskListItem> = {},
): SerializedTaskListItem {
  return {
    id: "task-1",
    title: "Strip out the old kitchen",
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: PAST,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    parent: null,
    waiting: null,
    ...over,
  };
}

/**
 * The repository's ACTUAL status vocabulary, and the answer each state gets.
 *
 * The roadmap item states the matrix in product words ("To do", "Waiting",
 * "Someday / Maybe"); those are DISPLAY states, and several are not `status`
 * values at all — completion is the spine's `completedAt`, Someday/Maybe is the
 * commitment state, and Waiting is the waiting model. The rows below are the
 * repository's own three fields, which is what the kernel actually reads.
 */
const MATRIX: readonly {
  readonly name: string;
  readonly over: Partial<SerializedTaskListItem>;
  readonly owed: boolean;
}[] = [
  { name: "To do", over: { status: "todo" }, owed: true },
  { name: "In progress", over: { status: "in_progress" }, owed: true },
  {
    name: "Waiting (still canonical open work)",
    over: {
      status: "todo",
      waiting: {
        since: "2026-07-01T00:00:00.000Z",
        subject: { kind: "text", note: "Finance" },
      },
    },
    owed: true,
  },
  {
    name: "On hold (still canonical open work)",
    over: { status: "on_hold" },
    owed: true,
  },
  {
    name: "Blocked by another Task",
    over: {
      status: "todo",
      blocked: { blockerCount: 1, firstBlockerTitle: "Get approval" },
    },
    owed: true,
  },
  {
    name: "Completed",
    over: { completedAt: "2026-07-20T00:00:00.000Z" },
    owed: false,
  },
  { name: "Cancelled", over: { status: "cancelled" }, owed: false },
  {
    name: "Someday / Maybe",
    over: { commitmentState: "someday" },
    owed: false,
  },
];

describe("the kernel is the ONE answer to 'is this Task still owed?'", () => {
  for (const row of MATRIX) {
    it(`${row.name} → ${row.owed ? "still owed" : "out of commitment"}`, () => {
      const task = item(row.over);
      expect(taskStillOwed(task)).toBe(row.owed);
      expect(
        isTaskStillOwed({
          completed: task.completedAt !== null,
          status: task.status,
          someday: task.commitmentState === "someday",
        }),
      ).toBe(row.owed);
      expect(
        isTaskOutOfCommitment({
          completed: task.completedAt !== null,
          status: task.status,
          someday: task.commitmentState === "someday",
        }),
      ).toBe(!row.owed);
    });
  }

  it("names exactly ONE status as terminal, and it is `cancelled`", () => {
    // A falsifier for the whole rule: if a future status were added and quietly
    // treated as closed (or `cancelled` stopped being), this fails rather than
    // letting a surface silently change what "owed" means.
    const terminal = TASK_STATUSES.filter((status: TaskStatus) =>
      isTaskOutOfCommitment({ completed: false, status, someday: false }),
    );
    expect(terminal).toEqual(["cancelled"]);
  });

  it("treats BOTH commitment states, and only `someday` parks", () => {
    const parked: CommitmentState[] = (["active", "someday"] as const).filter(
      (commitment) =>
        isTaskOutOfCommitment({
          completed: false,
          status: "todo",
          someday: commitment === "someday",
        }),
    );
    expect(parked).toEqual(["someday"]);
  });
});

describe("the shared row projection carries that answer, not a copy of it", () => {
  for (const row of MATRIX) {
    it(`${row.name}`, () => {
      expect(toTaskRowProjection(item(row.over)).stillOwed).toBe(row.owed);
    });
  }
});

describe("taskUrgency is late only while the Task is still owed", () => {
  for (const row of MATRIX) {
    it(`${row.name} with a PASSED due date`, () => {
      const evaluated = taskUrgency(item(row.over), TODAY);
      if (row.owed) {
        expect(evaluated).toEqual({
          kind: "overdue",
          label: "Overdue · due 6 Jul 2026",
          tone: "danger",
        });
      } else {
        // The date SURVIVES — history stays visible. Only the claim goes.
        expect(evaluated).toEqual({
          kind: "due",
          label: "Due 6 Jul 2026",
          tone: "neutral",
        });
      }
    });
  }

  it("is never overdue for today or a future date, however open", () => {
    expect(taskUrgency(item({ dueDate: TODAY }), TODAY)).toEqual({
      kind: "due_today",
      label: "Due today",
      tone: "warning",
    });
    expect(taskUrgency(item({ dueDate: FUTURE }), TODAY)?.kind).toBe("due");
  });

  it("counts a past-due Task into the collection's Overdue segment only while it is owed", () => {
    /*
     * The bar above `/tasks` and the rows below it must agree. It counted a
     * cancelled or Someday/Maybe Task with a passed deadline as overdue, which
     * is the same untruth the row was telling, one element higher up the page.
     */
    const cards = [
      toTaskCardData(item({})),
      toTaskCardData(item({ status: "cancelled" })),
      toTaskCardData(item({ commitmentState: "someday" })),
    ];
    // It reads "1 overdue", not "3": the label is a sentence, so the assertion is
    // over the sentence the owner is shown.
    const label = taskStateBreakdown(cards, TODAY, { bounded: false });
    expect(label).toContain("1\u00a0overdue");
    expect(label).not.toContain("3\u00a0overdue");
  });

  it("drops the WARNING from a closed Task due today, and keeps the words", () => {
    expect(
      taskUrgency(item({ dueDate: TODAY, status: "cancelled" }), TODAY),
    ).toEqual({ kind: "due_today", label: "Due today", tone: "neutral" });
  });
});
