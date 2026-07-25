import { describe, expect, it } from "vitest";

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  DEFAULT_PRIMARY_VIEW,
  groupByQuadrant,
  groupBySector,
  resolveMatrixSections,
  resolvePrimaryView,
  resolveSectorSections,
  resolveSort,
  resolveSystemView,
  systemViewFor,
  toTaskCardData,
} from "~/modules/tasks/tasks-view-model";
import type { TasksGrouping } from "~/modules/tasks/tasks-contract";

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

describe("view/sort/system resolution", () => {
  it("defaults the primary view to focus", () => {
    expect(resolvePrimaryView(null)).toBe(DEFAULT_PRIMARY_VIEW);
    expect(resolvePrimaryView("focus")).toBe("focus");
    expect(resolvePrimaryView("matrix")).toBe("matrix");
    expect(resolvePrimaryView("nonsense")).toBe("focus");
  });

  it("defaults the sort to smart and validates", () => {
    expect(resolveSort(null)).toBe("smart");
    expect(resolveSort("due_date")).toBe("due_date");
    expect(resolveSort("bogus")).toBe("smart");
  });

  it("resolves system view or null", () => {
    expect(resolveSystemView(null)).toBeNull();
    expect(resolveSystemView("today")).toBe("today");
    expect(resolveSystemView("bogus")).toBeNull();
  });

  it("focus→this_week, matrix/sectors→active, all→all, explicit overrides", () => {
    expect(systemViewFor("focus", null)).toBe("this_week");
    // Planning views scope to ACTIVE work, not the complete collection.
    expect(systemViewFor("matrix", null)).toBe("active");
    expect(systemViewFor("sectors", null)).toBe("active");
    expect(systemViewFor("all", null)).toBe("all");
    expect(systemViewFor("focus", "someday")).toBe("someday");
  });
});

describe("toTaskCardData", () => {
  it("derives quadrant, sector and state", () => {
    const card = toTaskCardData(
      item({
        id: "a",
        priority: "p1",
        timeSector: "this_week",
        status: "in_progress",
      }),
    );
    expect(card.quadrant).toBe("do");
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

describe("groupByQuadrant", () => {
  it("buckets by priority and collects the untriaged", () => {
    const cards = [
      toTaskCardData(item({ id: "1", priority: "p1" })),
      toTaskCardData(item({ id: "2", priority: "p2" })),
      toTaskCardData(item({ id: "3", priority: "p3" })),
      toTaskCardData(item({ id: "4", priority: "p4" })),
      toTaskCardData(item({ id: "5", priority: null })),
    ];
    const g = groupByQuadrant(cards);
    expect(g.do.map((c) => c.id)).toEqual(["1"]);
    expect(g.defer.map((c) => c.id)).toEqual(["2"]);
    expect(g.delegate.map((c) => c.id)).toEqual(["3"]);
    expect(g.delete.map((c) => c.id)).toEqual(["4"]);
    expect(g.untriaged.map((c) => c.id)).toEqual(["5"]);
  });
});

describe("groupBySector", () => {
  it("buckets by sector with null → inbox", () => {
    const cards = [
      toTaskCardData(item({ id: "a", timeSector: "this_week" })),
      toTaskCardData(item({ id: "b", timeSector: null })),
      toTaskCardData(item({ id: "c", timeSector: "routines" })),
    ];
    const g = groupBySector(cards);
    expect(g["this_week"]!.map((c) => c.id)).toEqual(["a"]);
    expect(g["inbox"]!.map((c) => c.id)).toEqual(["b"]);
    expect(g["routines"]!.map((c) => c.id)).toEqual(["c"]);
  });
});

describe("resolveMatrixSections (server grouping)", () => {
  const grouping: TasksGrouping = {
    dimension: "quadrant",
    groups: [
      { key: "p1", count: 5, hasMore: true, items: [item({ id: "d1" })] },
      { key: "p2", count: 1, hasMore: false, items: [item({ id: "f1" })] },
      {
        key: "untriaged",
        count: 2,
        hasMore: false,
        items: [item({ id: "u1" }), item({ id: "u2" })],
      },
    ],
  };

  it("returns all five buckets in reading order with authoritative counts", () => {
    const sections = resolveMatrixSections(grouping);
    expect(sections.map((s) => s.key)).toEqual([
      "do",
      "defer",
      "delegate",
      "delete",
      "untriaged",
    ]);
    const byKey = new Map(sections.map((s) => [s.key, s]));
    // The count comes from the server, NOT the loaded slice length.
    expect(byKey.get("do")?.count).toBe(5);
    expect(byKey.get("do")?.cards).toHaveLength(1);
    expect(byKey.get("do")?.hasMore).toBe(true);
    expect(byKey.get("do")?.filterKey).toBe("p1");
    // A bucket the server omitted (no matching tasks) is present with count 0.
    expect(byKey.get("delegate")?.count).toBe(0);
    expect(byKey.get("delegate")?.cards).toEqual([]);
    // Untriaged maps to the explicit no-priority filter.
    expect(byKey.get("untriaged")?.filterParam).toBe("priority");
    expect(byKey.get("untriaged")?.filterKey).toBe("__none");
  });

  it("returns zeroed sections for a null grouping", () => {
    const sections = resolveMatrixSections(null);
    expect(sections).toHaveLength(5);
    expect(sections.every((s) => s.count === 0 && s.cards.length === 0)).toBe(
      true,
    );
  });
});

describe("resolveSectorSections (server grouping)", () => {
  it("returns inbox + the six sectors with counts and inbox → __none filter", () => {
    const grouping: TasksGrouping = {
      dimension: "sector",
      groups: [
        { key: "inbox", count: 3, hasMore: false, items: [item({ id: "i1" })] },
        {
          key: "this_week",
          count: 1,
          hasMore: false,
          items: [item({ id: "w1" })],
        },
      ],
    };
    const sections = resolveSectorSections(grouping);
    expect(sections[0]?.key).toBe("inbox");
    expect(sections[0]?.filterParam).toBe("sector");
    expect(sections[0]?.filterKey).toBe("__none");
    expect(sections[0]?.count).toBe(3);
    const week = sections.find((s) => s.key === "this_week");
    expect(week?.count).toBe(1);
    expect(week?.filterKey).toBe("this_week");
    // Sectors with no tasks still render (count 0).
    expect(sections.find((s) => s.key === "long_term")?.count).toBe(0);
  });
});
