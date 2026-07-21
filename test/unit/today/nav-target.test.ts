import { describe, expect, it } from "vitest";

import {
  buildTodayNavTarget,
  isTodayNavValue,
  TODAY_NAV_VALUES,
  type TodayNavValue,
} from "~/modules/today/keyboard/nav-target";

/**
 * TODAY-05 — the pure focus/section navigation-target builder. It strips the ENTIRE
 * Drawer stack (so a section command run from inside a drawer navigates it away
 * cleanly), preserves unrelated params, sets a bounded `today-nav` value, and never
 * duplicates it. The value guard bounds `today-nav` to the accepted set.
 */

/** Parse the query of a `/today?…` target back into params. */
function query(target: string): URLSearchParams {
  return new URLSearchParams(target.slice(target.indexOf("?") + 1));
}

function build(search: string, value: TodayNavValue): URLSearchParams {
  return query(buildTodayNavTarget(new URLSearchParams(search), value));
}

describe("buildTodayNavTarget", () => {
  it("builds a /today target with today-nav when there are no params", () => {
    expect(buildTodayNavTarget(new URLSearchParams(""), "anytime")).toBe(
      "/today?today-nav=anytime",
    );
    expect(buildTodayNavTarget(new URLSearchParams(""), "list")).toBe(
      "/today?today-nav=list",
    );
  });

  it("preserves unrelated params and adds today-nav", () => {
    const p = build("status=active&view=board", "today");
    expect(p.get("status")).toBe("active");
    expect(p.get("view")).toBe("board");
    expect(p.get("today-nav")).toBe("today");
    expect(p.getAll("drawer")).toEqual([]);
  });

  it("removes a single drawer param", () => {
    const p = build("drawer=task%3At1", "overdue");
    expect(p.getAll("drawer")).toEqual([]);
    expect(p.get("today-nav")).toBe("overdue");
  });

  it("removes MULTIPLE stacked drawer params, preserving others", () => {
    const p = build(
      "status=active&drawer=task%3At1&drawer=help%3Ashortcuts",
      "anytime",
    );
    expect(p.getAll("drawer")).toEqual([]);
    expect(p.get("status")).toBe("active");
    expect(p.get("today-nav")).toBe("anytime");
  });

  it("SETS today-nav (never appends a duplicate)", () => {
    const p = build("today-nav=overdue", "anytime");
    expect(p.getAll("today-nav")).toEqual(["anytime"]);
  });

  it("keeps encoded param values correct", () => {
    const target = buildTodayNavTarget(
      new URLSearchParams("q=a%20b%26c"),
      "today",
    );
    expect(query(target).get("q")).toBe("a b&c");
    // Re-serialised deterministically (space → +, & → %26).
    expect(target).toContain("q=a+b%26c");
  });
});

describe("isTodayNavValue", () => {
  it("accepts only the bounded values", () => {
    for (const value of ["list", "overdue", "today", "upcoming", "anytime"]) {
      expect(isTodayNavValue(value)).toBe(true);
    }
    for (const value of [
      "completedToday",
      "",
      "task:t1",
      "../evil",
      "LIST",
      "anything",
    ]) {
      expect(isTodayNavValue(value)).toBe(false);
    }
  });

  it("every generated TODAY_NAV_VALUES member passes the guard", () => {
    for (const value of TODAY_NAV_VALUES) {
      expect(isTodayNavValue(value)).toBe(true);
    }
  });
});
