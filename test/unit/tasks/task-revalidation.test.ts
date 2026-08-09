/**
 * TASKS-09 — the revalidation predicate.
 *
 * `/tasks` used to re-read the server after every row change, which meant four
 * sequential hops and roughly a dozen statements before a checkbox moved. The
 * predicate replaces that with one question — *could this change move the row out of,
 * or reorder it inside, the configuration on screen?* — and these tests pin both
 * halves of the answer, because the two failure modes are asymmetric: a redundant
 * re-read only costs time, while a missed one leaves the owner looking at a row the
 * server no longer agrees with.
 *
 * The rules mirror `D1TaskRepository`'s own view clauses, sort expressions and
 * grouping dimensions; each case below names the clause it is standing in for.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TASK_VIEW_CONFIG,
  type TaskViewConfig,
} from "~/kernel/task-views";
import {
  shouldRevalidateTasks,
  shouldRevalidateTasksForIntent,
  taskMutationEffects,
  taskViewSensitivity,
} from "~/modules/tasks/task-revalidation";

function config(patch: Partial<TaskViewConfig> = {}): TaskViewConfig {
  return { ...DEFAULT_TASK_VIEW_CONFIG, ...patch };
}

/** The flattest possible list: every task, no filters, no grouping, a stable sort. */
const PLAIN = config({ systemView: "all", sort: "title" });

describe("shouldRevalidateTasks — what can be skipped", () => {
  it("skips a priority change on an unfiltered, ungrouped, unsorted-by-priority list", () => {
    expect(shouldRevalidateTasksForIntent(PLAIN, "set_priority")).toBe(false);
  });

  it("skips a due-date change when nothing on screen reads the due date", () => {
    expect(shouldRevalidateTasksForIntent(PLAIN, "set_due")).toBe(false);
  });

  it("skips a planned-date change under the same conditions", () => {
    expect(shouldRevalidateTasksForIntent(PLAIN, "plan")).toBe(false);
    expect(shouldRevalidateTasksForIntent(PLAIN, "clear_plan")).toBe(false);
  });

  it("skips a parent change on the `all` view with no parent filter, grouping or sort", () => {
    expect(shouldRevalidateTasksForIntent(PLAIN, "set_parent")).toBe(false);
  });

  it("skips a completion on `all` — the one view that holds open and finished work together", () => {
    expect(shouldRevalidateTasksForIntent(PLAIN, "complete")).toBe(false);
    expect(shouldRevalidateTasksForIntent(PLAIN, "reopen")).toBe(false);
  });

  it("returns false for a change with no effects at all", () => {
    expect(shouldRevalidateTasks(PLAIN, [])).toBe(false);
  });
});

describe("shouldRevalidateTasks — what must never be skipped", () => {
  it("revalidates a completion under any view that excludes completed work", () => {
    // `#appendViewClause` puts `sr.completed_at IS NULL` in every active-execution
    // view; a completed row leaves them.
    for (const systemView of [
      "active",
      "inbox",
      "today",
      "upcoming",
      "overdue",
      "this_week",
      "routines",
      "waiting",
      "someday",
      "cancelled",
    ] as const) {
      expect(
        shouldRevalidateTasksForIntent(config({ systemView }), "complete"),
      ).toBe(true);
    }
  });

  it("revalidates a completion on the Completed view, where reopening removes the row", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "completed" }),
        "reopen",
      ),
    ).toBe(true);
  });

  it("revalidates a completion under an explicit completed-visibility filter", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({
          systemView: "all",
          sort: "title",
          filters: { completed: "hide" },
        }),
        "complete",
      ),
    ).toBe(true);
  });

  it("revalidates a completion under the smart sort, which orders open work first", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "all", sort: "smart" }),
        "complete",
      ),
    ).toBe(true);
  });

  it("revalidates a parent change under a project filter", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({
          systemView: "all",
          sort: "title",
          filters: { projectId: "p1" },
        }),
        "set_parent",
      ),
    ).toBe(true);
  });

  it("revalidates a parent change on the Inbox, whose membership IS parentlessness", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "inbox" }),
        "set_parent",
      ),
    ).toBe(true);
  });

  it("revalidates a sector change under a sector filter and on the Sectors presentation", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({
          systemView: "all",
          sort: "title",
          filters: { timeSector: "this_week" },
        }),
        "set_sector",
      ),
    ).toBe(true);
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "all", sort: "title", presentation: "sectors" }),
        "set_sector",
      ),
    ).toBe(true);
  });

  it("revalidates a change the grouping buckets by", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "all", sort: "title", groupBy: "priority" }),
        "set_priority",
      ),
    ).toBe(true);
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "all", sort: "title", groupBy: "planned" }),
        "plan",
      ),
    ).toBe(true);
  });

  it("revalidates a change the sort orders by", () => {
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "all", sort: "due_date" }),
        "set_due",
      ),
    ).toBe(true);
    expect(
      shouldRevalidateTasksForIntent(
        config({ systemView: "all", sort: "title" }),
        "rename",
      ),
    ).toBe(true);
  });

  it("revalidates EVERY change under an `updated` sort or an updated-within filter", () => {
    const byUpdated = config({ systemView: "all", sort: "updated" });
    for (const intent of ["set_priority", "set_due", "plan", "set_parent"]) {
      expect(shouldRevalidateTasksForIntent(byUpdated, intent)).toBe(true);
    }
    expect(
      shouldRevalidateTasksForIntent(
        config({
          systemView: "all",
          sort: "title",
          filters: { updatedWithin: "7d" },
        }),
        "set_priority",
      ),
    ).toBe(true);
  });

  it("revalidates a delete, a restore and every recurrence-series operation, always", () => {
    for (const intent of [
      "delete",
      "restore",
      "skip_occurrence",
      "set_recurrence",
    ]) {
      expect(shouldRevalidateTasksForIntent(PLAIN, intent)).toBe(true);
    }
  });

  it("treats an intent it does not know as a change it cannot reason about", () => {
    expect(taskMutationEffects("something_new")).toEqual(["deletion"]);
    expect(shouldRevalidateTasksForIntent(PLAIN, "something_new")).toBe(true);
  });
});

describe("taskViewSensitivity", () => {
  it("reports the flattest list as sensitive to nothing", () => {
    const sensitivity = taskViewSensitivity(PLAIN);
    expect(sensitivity.anyChange).toBe(false);
    expect([...sensitivity.effects]).toEqual(["title"]);
  });

  it("accumulates the view, the filters, the grouping and the sort", () => {
    const sensitivity = taskViewSensitivity(
      config({
        systemView: "today",
        groupBy: "priority",
        sort: "due_date",
        filters: { delegated: true },
      }),
    );
    expect(sensitivity.anyChange).toBe(false);
    expect([...sensitivity.effects].sort()).toEqual(
      [
        "commitment",
        "completion",
        "delegation",
        "dueDate",
        "plannedDate",
        "priority",
        "status",
        "waiting",
      ].sort(),
    );
  });
});
