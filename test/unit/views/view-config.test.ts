/**
 * X-02 — the shared cross-module view configuration: what it accepts, what it
 * refuses, and what it does with a value it has never seen.
 *
 * The rules under test are the ones that make a stored configuration safe to
 * restore from an untrusted blob or a hand-edited URL: parsing is TOTAL,
 * unrecognised input is DROPPED rather than trusted, serialisation is CANONICAL,
 * and a dimension a record type cannot answer REMOVES that record type instead of
 * silently widening the result.
 */

import { describe, expect, it } from "vitest";

import {
  CROSS_VIEW_CONFIG_VERSION,
  DEFAULT_CROSS_VIEW_CONFIG,
  SHARED_DIMENSION_SUPPORT,
  crossViewConfigsEqual,
  crossViewFilterCount,
  parseCrossViewConfig,
  resolveViewScopes,
  serialiseCrossViewConfig,
  VIEW_SCOPES,
  type CrossViewConfig,
} from "~/kernel/views";

const ALL_SCOPES = [...VIEW_SCOPES];

describe("cross-module view configuration", () => {
  it("accepts a valid SHARED filter", () => {
    const config = parseCrossViewConfig({
      scopes: ["task", "project"],
      shared: { areaId: "area-1", attention: true, updatedWithin: "this_week" },
    });
    expect(config.shared).toEqual({
      areaId: "area-1",
      attention: true,
      updatedWithin: "this_week",
    });
    expect(config.version).toBe(CROSS_VIEW_CONFIG_VERSION);
  });

  it("accepts a valid MODULE filter and keeps it under its own scope", () => {
    const config = parseCrossViewConfig({
      scopes: ["task", "project", "review"],
      modules: {
        task: { priority: "p1", waiting: true },
        project: { health: "at_risk" },
        review: { reviewType: "weekly" },
      },
    });
    expect(config.modules.task).toEqual({ priority: "p1", waiting: true });
    expect(config.modules.project).toEqual({ health: "at_risk" });
    expect(config.modules.review).toEqual({ reviewType: "weekly" });
  });

  it("drops an unknown FIELD rather than storing it", () => {
    const config = parseCrossViewConfig({
      scopes: ["task"],
      shared: { areaId: "area-1", somethingElse: "nope" },
      modules: { task: { priority: "p1", inventedDimension: "x" } },
    });
    expect(Object.keys(config.shared)).toEqual(["areaId"]);
    expect(Object.keys(config.modules.task ?? {})).toEqual(["priority"]);
  });

  it("drops an unknown VALUE rather than storing it", () => {
    const config = parseCrossViewConfig({
      scopes: ["task"],
      shared: { state: "half-open", updatedWithin: "since_the_dawn_of_time" },
      modules: { task: { priority: "p9", status: "todo" } },
    });
    expect(config.shared).toEqual({});
    expect(config.modules.task).toEqual({ status: "todo" });
  });

  it("drops an unknown SCOPE, and falls back when none survives", () => {
    expect(
      parseCrossViewConfig({ scopes: ["task", "asteroid"] }).scopes,
    ).toEqual(["task"]);
    expect(parseCrossViewConfig({ scopes: ["asteroid"] }).scopes).toEqual(
      DEFAULT_CROSS_VIEW_CONFIG.scopes,
    );
  });

  it("never throws on hostile or nonsense input", () => {
    for (const raw of [null, undefined, 42, "config", [], { scopes: 7 }]) {
      expect(() => parseCrossViewConfig(raw)).not.toThrow();
    }
    expect(parseCrossViewConfig("config")).toEqual(DEFAULT_CROSS_VIEW_CONFIG);
  });

  it("reads a FUTURE version as this version's understood parts", () => {
    const config = parseCrossViewConfig({
      version: 99,
      scopes: ["task", "note"],
      shared: { updatedWithin: "this_week", quantumEntangled: true },
      sort: "vibes",
    });
    expect(config.version).toBe(CROSS_VIEW_CONFIG_VERSION);
    expect(config.scopes).toEqual(["task", "note"]);
    expect(config.shared).toEqual({ updatedWithin: "this_week" });
    expect(config.sort).toBe(DEFAULT_CROSS_VIEW_CONFIG.sort);
  });

  it("rejects a control character in an id-shaped value", () => {
    const config = parseCrossViewConfig({
      scopes: ["task"],
      shared: { areaId: "area\u0000-1", projectId: "proj-ok" },
    });
    expect(config.shared.areaId).toBeUndefined();
    expect(config.shared.projectId).toBe("proj-ok");
  });

  it("drops an over-long id rather than truncating it", () => {
    const config = parseCrossViewConfig({
      scopes: ["task"],
      shared: { areaId: "a".repeat(129) },
    });
    expect(config.shared.areaId).toBeUndefined();
  });

  it("treats the default archive mode as no filter at all", () => {
    expect(
      parseCrossViewConfig({
        scopes: ["note"],
        shared: { archived: "exclude" },
      }).shared.archived,
    ).toBeUndefined();
    expect(
      parseCrossViewConfig({ scopes: ["note"], shared: { archived: "only" } })
        .shared.archived,
    ).toBe("only");
  });
});

describe("canonical serialisation", () => {
  it("is deterministic regardless of key order", () => {
    const a = parseCrossViewConfig({
      scopes: ["project", "task"],
      shared: { updatedWithin: "this_week", areaId: "area-1" },
      modules: { task: { waiting: true, priority: "p1" } },
    });
    const b = parseCrossViewConfig({
      scopes: ["task", "project"],
      shared: { areaId: "area-1", updatedWithin: "this_week" },
      modules: { task: { priority: "p1", waiting: true } },
    });
    expect(serialiseCrossViewConfig(a)).toBe(serialiseCrossViewConfig(b));
    expect(crossViewConfigsEqual(a, b)).toBe(true);
  });

  it("round-trips through its own serialised form unchanged", () => {
    const config = parseCrossViewConfig({
      scopes: ["task", "goal", "review"],
      shared: { attention: true, dueWithin: "overdue", archived: "include" },
      modules: {
        goal: { alignment: "neglected" },
        review: { status: "draft" },
      },
      sort: "due",
      direction: "asc",
      groupBy: "none",
    });
    const text = serialiseCrossViewConfig(config);
    expect(
      serialiseCrossViewConfig(parseCrossViewConfig(JSON.parse(text))),
    ).toBe(text);
  });

  it("counts every applied dimension, shared and module alike", () => {
    const config = parseCrossViewConfig({
      scopes: ["task", "project"],
      shared: { areaId: "area-1", attention: true },
      modules: { task: { priority: "p1" }, project: { health: "at_risk" } },
    });
    expect(crossViewFilterCount(config)).toBe(4);
    expect(crossViewFilterCount(DEFAULT_CROSS_VIEW_CONFIG)).toBe(0);
  });
});

describe("scope resolution", () => {
  const withShared = (shared: Record<string, unknown>): CrossViewConfig =>
    parseCrossViewConfig({ scopes: ALL_SCOPES, shared });

  it("keeps every scope when nothing narrows them", () => {
    const resolved = resolveViewScopes(withShared({}), ALL_SCOPES);
    expect(resolved.included).toEqual(ALL_SCOPES);
    expect(resolved.excluded).toEqual([]);
  });

  it("removes a scope that cannot answer an applied SHARED dimension", () => {
    const resolved = resolveViewScopes(
      withShared({ dueWithin: "overdue" }),
      ALL_SCOPES,
    );
    expect(resolved.included).toEqual(SHARED_DIMENSION_SUPPORT.dueWithin);
    expect(resolved.excluded).toEqual([
      { scope: "project", dimension: "dueWithin" },
      { scope: "note", dimension: "dueWithin" },
    ]);
  });

  it("removes scopes with no archive lifecycle from an archived-only view", () => {
    const resolved = resolveViewScopes(
      withShared({ archived: "only" }),
      ALL_SCOPES,
    );
    expect(resolved.included).toEqual(["project", "note", "meeting", "review"]);
    expect(resolved.excluded.map((entry) => entry.scope)).toEqual([
      "task",
      "goal",
    ]);
  });

  it("removes a scope the owner cannot see, without reporting it as a dimension", () => {
    const resolved = resolveViewScopes(withShared({}), ["task", "project"]);
    expect(resolved.included).toEqual(["task", "project"]);
    expect(resolved.excluded).toEqual([]);
  });

  it("never silently widens: an unanswerable dimension excludes, it does not relax", () => {
    // A Note has no open/closed state. Asking for "still open" must not return
    // every Note as though the condition had been dropped.
    const resolved = resolveViewScopes(
      withShared({ state: "open" }),
      ALL_SCOPES,
    );
    expect(resolved.included).not.toContain("note");
  });
});
