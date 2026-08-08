import { describe, expect, it } from "vitest";

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  migrateLegacyViewParams,
  resolveGroupedSections,
  toTaskCardData,
} from "~/modules/tasks/tasks-view-model";
import type { TasksGroup, TasksGrouping } from "~/modules/tasks/tasks-contract";

function item(
  over: Partial<SerializedTaskListItem> & { id: string },
): SerializedTaskListItem {
  return {
    title: over.id,
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    parent: null,
    waiting: null,
    ...over,
  };
}

function group(over: Partial<TasksGroup> & { key: string }): TasksGroup {
  return {
    count: 1,
    hasMore: false,
    items: [],
    label: null,
    ...over,
  };
}

describe("legacy view migration", () => {
  it("rewrites ?view=focus to the list scoped to This Week", () => {
    const next = migrateLegacyViewParams(new URLSearchParams("view=focus"));
    expect(next?.get("view")).toBe("list");
    expect(next?.get("system")).toBe("this_week");
  });

  it("rewrites ?view=all to the list over everything", () => {
    const next = migrateLegacyViewParams(new URLSearchParams("view=all"));
    expect(next?.get("view")).toBe("list");
    expect(next?.get("system")).toBe("all");
  });

  it("preserves an explicit system view rather than overwriting it", () => {
    const next = migrateLegacyViewParams(
      new URLSearchParams("view=focus&system=waiting"),
    );
    expect(next?.get("system")).toBe("waiting");
  });

  it("leaves the retained Time Sectors presentation alone", () => {
    expect(
      migrateLegacyViewParams(new URLSearchParams("view=sectors")),
    ).toBeNull();
  });

  it("resolves a legacy ?view=matrix to the priority-grouped LIST", () => {
    // V2.2 removed the Matrix (TASKS-05). An old bookmark must land calmly on the
    // primary workspace with the same records banded by the same signal — never an
    // error, and never a silent loss of the grouping the 2x2 provided.
    const migrated = migrateLegacyViewParams(
      new URLSearchParams("view=matrix"),
    );
    expect(migrated?.get("view")).toBe("list");
    expect(migrated?.get("system")).toBe("active");
    expect(migrated?.get("group")).toBe("priority");
  });

  it("keeps an explicit grouping already in a legacy Matrix link", () => {
    const migrated = migrateLegacyViewParams(
      new URLSearchParams("view=matrix&group=due_state"),
    );
    expect(migrated?.get("group")).toBe("due_state");
  });

  it("leaves a TASKS-03 URL untouched", () => {
    expect(
      migrateLegacyViewParams(new URLSearchParams("view=list")),
    ).toBeNull();
    expect(migrateLegacyViewParams(new URLSearchParams())).toBeNull();
  });
});

describe("toTaskCardData", () => {
  it("derives the priority tag, sector and state", () => {
    const card = toTaskCardData(
      item({
        id: "a",
        priority: "p1",
        timeSector: "this_week",
        status: "in_progress",
      }),
    );
    expect(card.priorityTag).toBe("P1");
    expect(card.sectorLabel).toBe("This Week");
    expect(card.stateLabel).toBe("In progress");
    expect(card.completed).toBe(false);
  });

  it("marks waiting and delegated", () => {
    const card = toTaskCardData(
      item({
        id: "b",
        waiting: { since: "x", subject: { kind: "text", note: "finance" } },
        delegation: {
          to: "Sam",
          delegatedOn: null,
          followUpOn: null,
          note: null,
        },
      }),
    );
    expect(card.waiting).toBe(true);
    expect(card.delegatedTo).toBe("Sam");
    expect(card.stateLabel).toBe("Waiting");
  });
});

describe("resolveGroupedSections — grouped by priority", () => {
  const grouping: TasksGrouping = {
    dimension: "priority",
    groups: [
      group({
        key: "p1",
        count: 5,
        hasMore: true,
        items: [item({ id: "d1" })],
      }),
      group({ key: "p2", count: 1, items: [item({ id: "f1" })] }),
      group({
        key: "untriaged",
        count: 2,
        items: [item({ id: "u1" }), item({ id: "u2" })],
      }),
    ],
  };

  it("renders the OCCUPIED buckets in declared order with authoritative counts", () => {
    const sections = resolveGroupedSections(grouping);
    // Declared order (P1 → P4 → untriaged), and EMPTY buckets are hidden: an ordinary
    // grouped list is not a matrix, so a priority with no work in it is noise rather
    // than a missing cell. Time Sectors is the one dimension that keeps its empties.
    expect(sections.map((s) => s.key)).toEqual(["p1", "p2", "untriaged"]);
    const byKey = new Map(sections.map((s) => [s.key, s]));
    // The count comes from the SERVER, not the loaded slice length.
    expect(byKey.get("p1")?.count).toBe(5);
    expect(byKey.get("p1")?.cards).toHaveLength(1);
    expect(byKey.get("p1")?.hasMore).toBe(true);
    expect(byKey.get("p1")?.filterKey).toBe("p1");
    // Untriaged maps to the explicit no-priority filter.
    expect(byKey.get("untriaged")?.filterParam).toBe("priority");
    expect(byKey.get("untriaged")?.filterKey).toBe("__none");
  });

  it("labels a bucket in the ONE priority vocabulary", () => {
    const sections = resolveGroupedSections(grouping);
    expect(sections[0]?.title).toBe("P1 · Urgent");
    expect(sections.at(-1)?.title).toBe("No priority");
  });

  it("returns nothing for a null grouping", () => {
    expect(resolveGroupedSections(null)).toEqual([]);
  });
});

describe("resolveGroupedSections — Time Sectors (the planning view)", () => {
  it("returns No sector + the six sectors, mapping null sector to the __none filter", () => {
    const sections = resolveGroupedSections({
      dimension: "sector",
      groups: [
        group({ key: "__none", count: 3, items: [item({ id: "i1" })] }),
        group({ key: "this_week", count: 1, items: [item({ id: "w1" })] }),
      ],
    });
    expect(sections[0]?.key).toBe("__none");
    expect(sections[0]?.title).toBe("No sector");
    expect(sections[0]?.filterParam).toBe("sector");
    expect(sections[0]?.filterKey).toBe("__none");
    expect(sections[0]?.count).toBe(3);
    const week = sections.find((s) => s.key === "this_week");
    expect(week?.count).toBe(1);
    expect(week?.filterKey).toBe("this_week");
    // A sector with no tasks still renders, so "nothing planned" is visible.
    expect(sections.find((s) => s.key === "long_term")?.count).toBe(0);
  });
});

describe("resolveGroupedSections — ordinary grouped views", () => {
  it("hides EMPTY buckets outside the specialist views", () => {
    const sections = resolveGroupedSections({
      dimension: "due_state",
      groups: [
        group({ key: "overdue", count: 2, items: [item({ id: "o1" })] }),
        group({ key: "no_due_date", count: 7, items: [item({ id: "n1" })] }),
      ],
    });
    // Declared order is preserved; the buckets with no tasks are simply absent.
    expect(sections.map((s) => s.key)).toEqual(["overdue", "no_due_date"]);
    expect(sections[0]?.title).toBe("Overdue");
    expect(sections[1]?.count).toBe(7);
  });

  it("orders an OPEN-ENDED dimension by size, then deterministically by label", () => {
    const sections = resolveGroupedSections({
      dimension: "parent",
      groups: [
        group({ key: "a-1", count: 2, label: "Alpha", items: [] }),
        group({ key: "a-2", count: 9, label: "Beta", items: [] }),
        group({ key: "a-3", count: 2, label: "Aardvark", items: [] }),
      ],
    });
    expect(sections.map((s) => s.title)).toEqual(["Beta", "Aardvark", "Alpha"]);
  });

  it("offers NO drill-down where a bucket has no single-dimension filter", () => {
    const [section] = resolveGroupedSections({
      dimension: "parent",
      groups: [group({ key: "p-1", count: 3, label: "Website", items: [] })],
    });
    expect(section?.filterParam).toBeNull();
    expect(section?.filterKey).toBeNull();
  });

  it("labels a delegate bucket from the server, and the empty bucket in words", () => {
    const sections = resolveGroupedSections({
      dimension: "delegate",
      groups: [
        group({ key: "Sam", count: 2, label: "Sam", items: [] }),
        group({ key: "__none", count: 5, items: [] }),
      ],
    });
    expect(sections.map((s) => s.title)).toEqual(["Not delegated", "Sam"]);
    expect(sections.find((s) => s.title === "Sam")?.filterParam).toBe("person");
    expect(
      sections.find((s) => s.title === "Not delegated")?.filterKey,
    ).toBeNull();
  });

  it("groups by status with completion as its own bucket", () => {
    const sections = resolveGroupedSections({
      dimension: "status",
      groups: [
        group({ key: "todo", count: 4, items: [] }),
        group({ key: "completed", count: 11, items: [] }),
      ],
    });
    expect(sections.map((s) => s.title)).toEqual(["To do", "Completed"]);
    // "Completed" is not a status value, so it exposes no status filter.
    expect(sections[1]?.filterKey).toBeNull();
  });
});
