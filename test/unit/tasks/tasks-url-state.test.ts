/**
 * TASKS-03 — the `/tasks` URL ⇄ configuration codec.
 *
 * Every claim the workspace makes about being shareable, bookmarkable and
 * Back/Forward-safe reduces to this codec being a faithful round trip that writes
 * no residue for a default and preserves parameters it does not own.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TASK_VIEW_CONFIG,
  parseTaskViewConfig,
  taskViewConfigsEqual,
  type TaskViewConfig,
} from "~/kernel/task-views";
import {
  configFromParams,
  effectiveGroupBy,
  groupDimensionFor,
  paramsFromConfig,
  TASKS_FILTER_PARAM_NAMES,
  toWorkspaceFilters,
} from "~/modules/tasks/tasks-url-state";

const config = (over: Partial<TaskViewConfig> = {}): TaskViewConfig =>
  parseTaskViewConfig({ ...DEFAULT_TASK_VIEW_CONFIG, ...over });

describe("round trip", () => {
  it("survives a complete configuration unchanged", () => {
    const original = config({
      presentation: "board",
      systemView: "waiting",
      sort: "due_date",
      direction: "desc",
      groupBy: "parent",
      density: "compact",
      filters: {
        priority: "p1",
        dueState: "overdue",
        delegated: true,
        delegatedTo: "Sam",
        completed: "hide",
      },
    });
    const restored = configFromParams(paramsFromConfig(original));
    expect(taskViewConfigsEqual(restored, original)).toBe(true);
  });

  it("writes NO residue for the standard configuration", () => {
    expect(paramsFromConfig(DEFAULT_TASK_VIEW_CONFIG).toString()).toBe("");
  });

  it("produces the same link for two equivalent configurations", () => {
    const a = paramsFromConfig(
      config({ filters: { priority: "p1", waiting: true } }),
    ).toString();
    const b = paramsFromConfig(
      config({ filters: { waiting: true, priority: "p1" } }),
    ).toString();
    expect(a).toBe(b);
  });

  it("PRESERVES parameters it does not own", () => {
    const base = new URLSearchParams("drawer=task%3At-1&tab=links");
    const next = paramsFromConfig(config({ sort: "title" }), base);
    expect(next.get("drawer")).toBe("task:t-1");
    expect(next.get("tab")).toBe("links");
    expect(next.get("sort")).toBe("title");
  });

  it("always clears a pagination cursor, because the query changed", () => {
    const base = new URLSearchParams("cursor=abc");
    expect(
      paramsFromConfig(config({ sort: "title" }), base).get("cursor"),
    ).toBeNull();
  });

  it("removes a filter parameter when the filter is cleared", () => {
    const base = new URLSearchParams("priority=p1&waiting=1");
    const next = paramsFromConfig(DEFAULT_TASK_VIEW_CONFIG, base);
    expect(next.get("priority")).toBeNull();
    expect(next.get("waiting")).toBeNull();
  });
});

describe("decoding untrusted URLs", () => {
  it("falls back to the SUPPLIED default for an invalid scalar", () => {
    const preferred = config({ presentation: "sectors", sort: "title" });
    const decoded = configFromParams(
      new URLSearchParams("view=nonsense&sort=DROP+TABLE"),
      preferred,
    );
    // A typo in a shared link must not silently discard the owner's preference.
    expect(decoded.presentation).toBe("sectors");
    expect(decoded.sort).toBe("title");
  });

  it("lets an EXPLICIT parameter win over the default view", () => {
    const preferred = config({ presentation: "sectors" });
    expect(
      configFromParams(new URLSearchParams("view=list"), preferred)
        .presentation,
    ).toBe("list");
  });

  it("drops an invalid filter value rather than passing it through", () => {
    const decoded = configFromParams(
      new URLSearchParams(
        "priority=p9&due=whenever&person=" + encodeURIComponent("' OR 1=1"),
      ),
    );
    expect(decoded.filters.priority).toBeUndefined();
    expect(decoded.filters.dueState).toBeUndefined();
    // A quoted value is legal TEXT for a delegatee — it is bound, never inlined —
    // so it is preserved as data rather than rejected.
    expect(decoded.filters.delegatedTo).toBe("' OR 1=1");
  });

  it("lets a link turn OFF a boolean filter the default view turns on", () => {
    const preferred = config({ filters: { waiting: true } });
    expect(
      configFromParams(new URLSearchParams(), preferred).filters.waiting,
    ).toBe(true);
    expect(
      configFromParams(new URLSearchParams("waiting=0"), preferred).filters
        .waiting,
    ).toBeUndefined();
  });

  it("ignores an empty parameter value", () => {
    expect(configFromParams(new URLSearchParams("priority=&sort=")).sort).toBe(
      DEFAULT_TASK_VIEW_CONFIG.sort,
    );
  });
});

describe("toWorkspaceFilters", () => {
  it("maps the explicit EMPTY-field filters to an explicit null", () => {
    const filters = toWorkspaceFilters(
      config({ filters: { priority: "__none", timeSector: "__none" } }),
    );
    expect(filters.priority).toBeNull();
    expect(filters.timeSector).toBeNull();
    // Absent is a different scope from null, and stays absent.
    expect(
      toWorkspaceFilters(DEFAULT_TASK_VIEW_CONFIG).priority,
    ).toBeUndefined();
  });

  it("maps Someday/Maybe to the COMMITMENT state, not to a status or a priority", () => {
    const filters = toWorkspaceFilters(config({ filters: { someday: true } }));
    expect(filters.commitmentState).toBe("someday");
    expect(filters.status).toBeUndefined();
    expect(filters.priority).toBeUndefined();
  });

  it("maps every remaining dimension onto its kernel filter", () => {
    const filters = toWorkspaceFilters(
      config({
        filters: {
          status: "on_hold",
          dueState: "overdue",
          plannedState: "unplanned",
          parentKind: "project",
          projectId: "p-1",
          areaId: "a-1",
          goalId: "g-1",
          delegatedTo: "Sam",
          delegated: true,
          waiting: true,
          createdWithin: "7d",
          updatedWithin: "30d",
          completed: "only",
        },
      }),
    );
    expect(filters).toMatchObject({
      status: "on_hold",
      dueState: "overdue",
      plannedState: "unplanned",
      parentKind: "project",
      projectId: "p-1",
      areaId: "a-1",
      goalId: "g-1",
      delegatedTo: "Sam",
      delegatedOnly: true,
      waitingOnly: true,
      createdWithin: "7d",
      updatedWithin: "30d",
      completedVisibility: "only",
    });
  });
});

describe("grouping resolution", () => {
  it("gives Time Sectors its own dimension", () => {
    expect(groupDimensionFor(config({ presentation: "sectors" }))).toBe(
      "sector",
    );
  });

  it("no longer knows about a Matrix presentation (V2.2 removed it)", () => {
    // The value is not in the closed set any more, so the config parser has already
    // dropped it; a stored or hand-typed `matrix` reaches the grouping resolver as the
    // default LIST and is therefore flat, never an unknown dimension.
    expect(
      groupDimensionFor(
        config({ presentation: "matrix" as unknown as "list" }),
      ),
    ).toBeNull();
  });

  it("leaves an ungrouped LIST flat", () => {
    expect(groupDimensionFor(config({ presentation: "list" }))).toBeNull();
  });

  it("honours an explicit grouping on the list", () => {
    expect(
      groupDimensionFor(config({ presentation: "list", groupBy: "due_state" })),
    ).toBe("due_state");
  });

  it("gives a BOARD a grouping, because a one-column board is just a list", () => {
    expect(groupDimensionFor(config({ presentation: "board" }))).toBe(
      "priority",
    );
    expect(effectiveGroupBy(config({ presentation: "board" }))).toBe(
      "priority",
    );
    expect(
      groupDimensionFor(config({ presentation: "board", groupBy: "status" })),
    ).toBe("status");
  });
});

describe("the reset contract", () => {
  it("names every filter parameter, and no shaping parameter", () => {
    expect(TASKS_FILTER_PARAM_NAMES).toContain("priority");
    expect(TASKS_FILTER_PARAM_NAMES).toContain("due");
    expect(TASKS_FILTER_PARAM_NAMES).toContain("completed");
    // Resetting FILTERS must never throw away the layout, sort or grouping the
    // user deliberately chose.
    expect(TASKS_FILTER_PARAM_NAMES).not.toContain("view");
    expect(TASKS_FILTER_PARAM_NAMES).not.toContain("sort");
    expect(TASKS_FILTER_PARAM_NAMES).not.toContain("group");
    expect(TASKS_FILTER_PARAM_NAMES).not.toContain("density");
  });
});
