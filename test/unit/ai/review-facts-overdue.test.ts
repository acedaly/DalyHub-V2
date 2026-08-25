/**
 * V2.4-GATE-02 — the assistant's "tasks overdue" is a claim about work still OWED.
 *
 * `listTasks` excludes only COMPLETED work, so this figure counted a **cancelled**
 * or **Someday / Maybe** Task with a passed deadline as overdue — the same untruth
 * the Task row was telling, in a number the assistant reports to the owner in
 * words. The row and the sentence about the row have to agree.
 *
 * The repository is a stub: what is under test is the derivation, not the query.
 */

import { describe, expect, it } from "vitest";

import { computeWeeklyReviewFacts } from "~/modules/ai/review-facts";
import type { TaskListItem } from "~/kernel/tasks";
import type { WorkspaceScope } from "~/platform/workspaces";

const TODAY = "2026-08-22";
const PAST = "2026-07-06";

function task(over: Partial<TaskListItem>): TaskListItem {
  return {
    id: "t",
    workspaceId: "w" as TaskListItem["workspaceId"],
    title: "Strip out the old kitchen",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
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
  } as TaskListItem;
}

function scopeWith(items: readonly TaskListItem[]): WorkspaceScope {
  return {
    tasks: {
      listTasks: async () => ({ items }),
      listPlanningTasks: async () => ({ items: [] }),
    },
    meetings: { list: async () => ({ items: [] }) },
  } as unknown as WorkspaceScope;
}

describe("the weekly Review facts count overdue work, not passed dates", () => {
  it("counts an open past-due Task", async () => {
    const facts = await computeWeeklyReviewFacts(
      scopeWith([task({ id: "a" })]),
      "2026-08-17",
      "2026-08-23",
      TODAY,
      "Australia/Sydney",
    );
    expect(facts.tasksOverdue).toBe(1);
  });

  it("does NOT count a cancelled or Someday / Maybe past-due Task", async () => {
    const facts = await computeWeeklyReviewFacts(
      scopeWith([
        task({ id: "a" }),
        task({ id: "b", status: "cancelled" }),
        task({ id: "c", commitmentState: "someday" }),
      ]),
      "2026-08-17",
      "2026-08-23",
      TODAY,
      "Australia/Sydney",
    );
    expect(facts.tasksOverdue).toBe(1);
  });

  it("keeps a WAITING or ON HOLD past-due Task overdue — blocked is not abandoned", async () => {
    const facts = await computeWeeklyReviewFacts(
      scopeWith([
        task({
          id: "a",
          waiting: {
            since: new Date("2026-07-01T00:00:00.000Z"),
            subject: { kind: "text", note: "Finance" },
          },
        }),
        task({ id: "b", status: "on_hold" }),
      ]),
      "2026-08-17",
      "2026-08-23",
      TODAY,
      "Australia/Sydney",
    );
    expect(facts.tasksOverdue).toBe(2);
  });
});
