/**
 * V2.7 RECALL-02 — the completion-time VOCABULARY, proved where it is pure.
 *
 * The repository proof lives in `test/kernel/recall-02-completed-time.test.ts`,
 * because ordering, windows and pagination are claims about SQL. What is
 * provable here is everything the declarative layer promises:
 *
 *   - the sort and the three window dimensions exist in the ONE vocabulary;
 *   - the Completed system view's sentence and its sort agree;
 *   - a completion window round-trips URL → config → URL unchanged, so a saved
 *     view and a copied link mean the same thing;
 *   - the named windows resolve against the owner's day and their own first day
 *     of the week;
 *   - the link Analytics renders is EXACTLY the link the Tasks URL codec writes
 *     for the same window — the two live in different layers and must not drift.
 */

import { describe, expect, it } from "vitest";

import {
  TASK_RECENCY_WINDOWS,
  TASK_SORTS,
  type TaskSort,
} from "~/kernel/tasks";
import {
  COMPLETED_WINDOW_IDS,
  DEFAULT_TASK_VIEW_CONFIG,
  TASK_SYSTEM_VIEW_DEFINITIONS,
  TASK_VIEW_FILTER_KEYS,
  completedRangeTasksHref,
  completedWindowBounds,
  completedWindowConfig,
  findTaskSystemView,
  parseCompletedWindowId,
  parseTaskViewConfig,
  serialiseTaskViewConfig,
  taskViewFilterCount,
  toWorkspaceFilters,
} from "~/kernel/task-views";
import { buildTasksControlGroups } from "~/modules/tasks/tasks-controls";
import {
  configFromParams,
  paramsFromConfig,
  TASKS_FILTER_PARAMS,
  TASKS_PARAMS,
} from "~/modules/tasks/tasks-url-state";
import { taskViewSensitivity } from "~/modules/tasks/task-revalidation";

describe("the completion-time dimensions join the one vocabulary", () => {
  it("adds a `completed` sort beside `created` and `updated`", () => {
    expect(TASK_SORTS).toContain("completed" satisfies TaskSort);
  });

  it("adds the window dimensions to the declarative filter keys", () => {
    expect(TASK_VIEW_FILTER_KEYS).toContain("completedWithin");
    expect(TASK_VIEW_FILTER_KEYS).toContain("completedFrom");
    expect(TASK_VIEW_FILTER_KEYS).toContain("completedTo");
  });

  it("reuses the EXISTING recency grammar rather than inventing one", () => {
    const config = parseTaskViewConfig({
      filters: { completedWithin: "7d" },
    });
    expect(config.filters.completedWithin).toBe("7d");
    expect(TASK_RECENCY_WINDOWS).toContain("7d");
    // A window outside the closed set is DROPPED, never passed through.
    expect(
      parseTaskViewConfig({ filters: { completedWithin: "45d" } }).filters
        .completedWithin,
    ).toBeUndefined();
  });

  it("validates the explicit bounds like every other date pair", () => {
    const good = parseTaskViewConfig({
      filters: { completedFrom: "2026-08-24", completedTo: "2026-08-30" },
    });
    expect(good.filters.completedFrom).toBe("2026-08-24");
    expect(good.filters.completedTo).toBe("2026-08-30");
    // Impossible calendar dates and junk are dropped, not repaired.
    const bad = parseTaskViewConfig({
      filters: { completedFrom: "2026-02-31", completedTo: "yesterday" },
    });
    expect(bad.filters.completedFrom).toBeUndefined();
    expect(bad.filters.completedTo).toBeUndefined();
  });

  it("translates to the repository's own filter shape and nothing else", () => {
    const filters = toWorkspaceFilters(
      parseTaskViewConfig({
        filters: {
          completedWithin: "30d",
          completedFrom: "2026-08-24",
          completedTo: "2026-08-30",
        },
      }),
    );
    expect(filters).toEqual({
      completedWithin: "30d",
      completedFrom: "2026-08-24",
      completedTo: "2026-08-30",
    });
  });

  it("counts as narrowing, so the filter badge tells the truth", () => {
    expect(
      taskViewFilterCount(
        parseTaskViewConfig({ filters: { completedWithin: "7d" } }),
      ),
    ).toBe(1);
  });

  it("makes the collection sensitive to COMPLETION and to nothing else", () => {
    // The point of the completion authority: `updated` had to be treated as
    // "any change", because every write touches it. This one moves only when a
    // Task is completed or reopened.
    const sorted = taskViewSensitivity(
      parseTaskViewConfig({ sort: "completed" }),
    );
    expect(sorted.anyChange).toBe(false);
    expect([...sorted.effects]).toContain("completion");

    const windowed = taskViewSensitivity(
      parseTaskViewConfig({ filters: { completedFrom: "2026-08-24" } }),
    );
    expect(windowed.anyChange).toBe(false);
    expect([...windowed.effects]).toContain("completion");
  });
});

describe("the Completed system view's sentence is true", () => {
  const completed = findTaskSystemView("completed");

  it("sorts by completion time", () => {
    expect(completed?.config.sort).toBe("completed");
  });

  it("says which `recent` it means", () => {
    expect(completed?.description).toBe(
      "Finished work, most recently completed first.",
    );
  });

  it("is the only built-in view claiming a completion order", () => {
    // A second view silently carrying `sort: "completed"` would be a second
    // definition of this question — the failure DEBT-230 recorded.
    const carrying = TASK_SYSTEM_VIEW_DEFINITIONS.filter(
      (view) => view.config.sort === "completed",
    ).map((view) => view.id);
    expect(carrying).toEqual(["completed"]);
  });
});

describe("the Tasks controls offer the window", () => {
  const groups = buildTasksControlGroups({
    delegates: [],
    parents: [],
    tags: [],
  });

  it("offers a Completed window beside Created and Updated", () => {
    const group = groups.find((entry) => entry.id === "completedWithin");
    expect(group?.param).toBe(TASKS_FILTER_PARAMS.completedWithin);
    expect(group?.options.map((option) => option.value)).toEqual([
      "",
      ...TASK_RECENCY_WINDOWS,
    ]);
  });

  it("offers the completion sort in the sort control", () => {
    const sort = groups.find((entry) => entry.id === "sort");
    expect(sort?.options.map((option) => option.value)).toContain("completed");
    expect(
      sort?.options.find((option) => option.value === "completed")?.label,
    ).toBe("Completed");
  });
});

describe("a completion window round-trips through the URL", () => {
  it("survives config → params → config unchanged", () => {
    const config = parseTaskViewConfig({
      systemView: "completed",
      sort: "completed",
      filters: {
        completedWithin: "30d",
        completedFrom: "2026-08-24",
        completedTo: "2026-08-30",
      },
    });
    const params = paramsFromConfig(config);
    expect(params.get(TASKS_PARAMS.sort)).toBe("completed");
    expect(params.get(TASKS_FILTER_PARAMS.completedWithin)).toBe("30d");
    expect(params.get(TASKS_FILTER_PARAMS.completedFrom)).toBe("2026-08-24");
    expect(params.get(TASKS_FILTER_PARAMS.completedTo)).toBe("2026-08-30");
    expect(configFromParams(params)).toEqual(config);
    expect(serialiseTaskViewConfig(configFromParams(params))).toBe(
      serialiseTaskViewConfig(config),
    );
  });

  it("degrades a hostile URL to no filter rather than to a query", () => {
    const params = new URLSearchParams({
      [TASKS_FILTER_PARAMS.completedFrom]: "2026-08-24' OR 1=1 --",
      [TASKS_FILTER_PARAMS.completedWithin]: "999d",
    });
    const config = configFromParams(params);
    expect(config.filters.completedFrom).toBeUndefined();
    expect(config.filters.completedWithin).toBeUndefined();
  });
});

describe("the named windows resolve against the owner's calendar", () => {
  it("knows exactly two, and refuses anything else", () => {
    expect([...COMPLETED_WINDOW_IDS]).toEqual(["yesterday", "this-week"]);
    expect(parseCompletedWindowId("yesterday")).toBe("yesterday");
    expect(parseCompletedWindowId("this-week")).toBe("this-week");
    expect(parseCompletedWindowId("last-decade")).toBeNull();
    expect(parseCompletedWindowId(null)).toBeNull();
  });

  it("closes `yesterday` at both ends", () => {
    // Not "since yesterday": work finished today must not answer a question
    // about yesterday.
    expect(completedWindowBounds("yesterday", "2026-08-30", "monday")).toEqual({
      from: "2026-08-29",
      to: "2026-08-29",
    });
    // Across a month boundary, through the kernel's own calendar arithmetic.
    expect(completedWindowBounds("yesterday", "2026-09-01", "monday")).toEqual({
      from: "2026-08-31",
      to: "2026-08-31",
    });
  });

  it("starts `this week` on the OWNER's first day", () => {
    // 2026-08-30 is a Sunday.
    expect(completedWindowBounds("this-week", "2026-08-30", "monday")).toEqual({
      from: "2026-08-24",
      to: "2026-08-30",
    });
    expect(completedWindowBounds("this-week", "2026-08-30", "sunday")).toEqual({
      from: "2026-08-30",
      to: "2026-09-05",
    });
  });

  it("resolves to an ORDINARY config, expressible in the URL and in a view", () => {
    const config = completedWindowConfig("yesterday", "2026-08-30", "monday");
    expect(config).toEqual({
      ...DEFAULT_TASK_VIEW_CONFIG,
      systemView: "completed",
      sort: "completed",
      filters: { completedFrom: "2026-08-29", completedTo: "2026-08-29" },
    });
    // The round trip is what makes the palette a shortcut rather than a private
    // route state: the redirect's URL parses back to exactly this config.
    expect(configFromParams(paramsFromConfig(config))).toEqual(config);
  });
});

describe("Analytics' completion link is the Tasks codec's own link", () => {
  it("matches `paramsFromConfig` for the same window, exactly", () => {
    const bounds = { from: "2026-08-24", to: "2026-08-30" };
    const config = parseTaskViewConfig({
      systemView: "completed",
      sort: "completed",
      filters: { completedFrom: bounds.from, completedTo: bounds.to },
    });
    expect(completedRangeTasksHref(bounds)).toBe(
      `/tasks?${paramsFromConfig(config).toString()}`,
    );
  });

  it("resolves back to the completion sort and the same window", () => {
    const href = completedRangeTasksHref({
      from: "2026-08-24",
      to: "2026-08-30",
    });
    const config = configFromParams(
      new URLSearchParams(href.slice(href.indexOf("?") + 1)),
    );
    expect(config.sort).toBe("completed");
    expect(config.systemView).toBe("completed");
    expect(config.filters.completedFrom).toBe("2026-08-24");
    expect(config.filters.completedTo).toBe("2026-08-30");
  });
});
