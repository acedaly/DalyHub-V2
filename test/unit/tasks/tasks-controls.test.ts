/**
 * TASKS-03 — the Tasks control-group declaration.
 *
 * The whole "one filter system" claim rests on this being the SINGLE declaration
 * that drives the sheet, the chips and the badge. These tests pin what it must
 * offer, what it must never offer, and the badge honesty rule.
 */

import { describe, expect, it } from "vitest";

import {
  activeControls,
  activeFilterCount,
} from "~/shared/collection-layout/collection-controls-model";
import { buildTasksControlGroups } from "~/modules/tasks/tasks-controls";

const groups = buildTasksControlGroups({
  delegates: [{ value: "Sam", label: "Sam" }],
  parents: [
    { id: "p-1", kind: "project", title: "Alpha" },
    { id: "a-1", kind: "area", title: "Work" },
  ],
});

const byId = (id: string) => groups.find((group) => group.id === id);
const params = (search: string) => new URLSearchParams(search);

describe("the declared filter dimensions", () => {
  it("covers every dimension the Tasks workspace promises", () => {
    for (const id of [
      "status",
      "priority",
      "due",
      "planned",
      "sector",
      "parentType",
      "project",
      "area",
      "person",
      "delegated",
      "waiting",
      "someday",
      "created",
      "updated",
      "completed",
    ]) {
      expect(byId(id), `missing control group: ${id}`).toBeDefined();
    }
  });

  it("offers priority as ONE axis, in ONE vocabulary", () => {
    // Priority is one stored field (ADR-043 §2), and since V2.2 removed the Matrix it
    // also has one NAME: the everyday urgency wording. The Eisenhower action words the
    // filter used to carry alongside them had no surface left to serve.
    expect(byId("quadrant")).toBeUndefined();
    const labels = byId("priority")?.options.map((o) => o.label) ?? [];
    expect(labels.join(" ")).toContain("Priority 1");
    expect(labels.join(" ")).toContain("Priority 3");
    expect(labels.join(" ")).not.toContain("Delegate");
  });

  it("offers an explicit empty-field option where absence is meaningful", () => {
    // A Time Sector genuinely CAN be unset — "no sector" is a state a task is
    // in, and an owner filtering for unsectored work is triaging.
    expect(byId("sector")?.options.map((o) => o.value)).toContain("__none");
  });

  it("does NOT offer a fifth priority for the absence of one", () => {
    /*
     * CONTROL-01 — `null` IS Priority 4, so there is no "No priority" to filter
     * for. The option existed and was worse than redundant: it and "Priority 4"
     * returned two DIFFERENT subsets of the one state, and neither returned all
     * the tasks the list beside it was drawing with a grey P4 flag.
     */
    const values = byId("priority")?.options.map((o) => o.value) ?? [];
    expect(values).not.toContain("__none");
    expect(values).toEqual(["", "p1", "p2", "p3", "p4"]);
  });

  it("gives every priority option its flag, in the one priority vocabulary", () => {
    // The filter speaks the same language as the row it filters: a coloured
    // pennant and the full label (the short P1–P4 tag belongs to compact rows).
    for (const option of byId("priority")?.options ?? []) {
      if (option.value === "") continue;
      expect(option.mark, option.value).toEqual({
        kind: "priority",
        value: option.value,
      });
    }
  });

  it("offers a due and a planned filter as SEPARATE dimensions", () => {
    expect(byId("due")?.param).toBe("due");
    expect(byId("planned")?.param).toBe("planned");
    expect(byId("due")?.options.map((o) => o.value)).toContain("overdue");
    expect(byId("planned")?.options.map((o) => o.value)).toContain(
      "planned_today",
    );
  });

  it("only offers a parent or delegate filter when the workspace HAS them", () => {
    const empty = buildTasksControlGroups({ delegates: [], parents: [] });
    expect(empty.find((g) => g.id === "project")).toBeUndefined();
    expect(empty.find((g) => g.id === "area")).toBeUndefined();
    expect(empty.find((g) => g.id === "person")).toBeUndefined();
    // A control that could not narrow anything is not shown at all.
    expect(empty.find((g) => g.id === "priority")).toBeDefined();
  });

  it("builds the parent options from REAL workspace records", () => {
    expect(byId("project")?.options.map((o) => o.label)).toEqual([
      "Any Project",
      "Alpha",
    ]);
    expect(byId("area")?.options.map((o) => o.label)).toEqual([
      "Any Area",
      "Work",
    ]);
    expect(byId("person")?.options.map((o) => o.label)).toEqual([
      "Anyone",
      "Sam",
    ]);
  });
});

describe("shaping controls are not filters", () => {
  it("declares layout, grouping, sort, order and density as non-filter kinds", () => {
    expect(byId("layout")?.kind).toBe("group");
    expect(byId("group")?.kind).toBe("group");
    expect(byId("sort")?.kind).toBe("sort");
    expect(byId("direction")?.kind).toBe("sort");
    expect(byId("density")?.kind).toBe("display");
  });

  it("keeps them out of the active-filter badge and the chip row", () => {
    const search =
      "view=board&group=status&sort=title&dir=desc&density=compact";
    expect(activeFilterCount(groups, params(search))).toBe(0);
    expect(activeControls(groups, params(search))).toEqual([]);
  });

  it("counts genuine filters, and only once each", () => {
    expect(
      activeFilterCount(groups, params("priority=p1&due=overdue&sort=title")),
    ).toBe(2);
  });
});

describe("URL parameter contract", () => {
  it("writes the documented parameter for each dimension", () => {
    expect(byId("due")?.param).toBe("due");
    expect(byId("parentType")?.param).toBe("parentType");
    expect(byId("person")?.param).toBe("person");
    expect(byId("completed")?.param).toBe("completed");
    expect(byId("layout")?.param).toBe("view");
    expect(byId("group")?.param).toBe("group");
    expect(byId("direction")?.param).toBe("dir");
  });

  it("treats the view's own completion rule as the default, writing no URL state", () => {
    expect(byId("completed")?.defaultValue).toBe("default");
    expect(activeFilterCount(groups, params("completed=default"))).toBe(0);
    expect(activeFilterCount(groups, params("completed=only"))).toBe(1);
  });
});
