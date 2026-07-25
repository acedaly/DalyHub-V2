import { describe, expect, it } from "vitest";

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";
import {
  DEFAULT_PRIMARY_VIEW,
  groupByQuadrant,
  groupBySector,
  resolvePrimaryView,
  resolveSort,
  resolveSystemView,
  systemViewFor,
  toTaskCardData,
} from "~/modules/tasks/tasks-view-model";

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
