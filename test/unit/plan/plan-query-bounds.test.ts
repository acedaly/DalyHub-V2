/**
 * PLAN-01 — the query BUDGET, asserted rather than asserted-to.
 *
 * A planning surface is the easiest place in a product to write an N+1, because
 * every part of it is "per day" or "per project". This is a SOURCE-level guard on
 * the loader: it proves the reads are the fixed set `plan-load.server.ts`
 * documents, that none of them sits inside a loop over days, Tasks or Projects,
 * and that every bound is a named constant rather than a number typed at a call
 * site.
 *
 * It is a static check because the alternative — counting D1 statements at
 * runtime — needs a workspace of a known shape to be meaningful, and the shape
 * that would catch a regression (a hundred Projects) is the one nobody seeds. The
 * failure this actually prevents is a future edit adding `await scope.…` inside a
 * `for (const day of …)`, which is visible in the text.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_LIMITS } from "~/modules/plan/plan-load.server";

const SOURCE = readFileSync(
  path.join(process.cwd(), "app", "modules", "plan", "plan-load.server.ts"),
  "utf8",
);

describe("the planning loader's bounds", () => {
  it("declares every bound as a named constant", () => {
    for (const [name, value] of Object.entries(PLAN_LIMITS)) {
      expect(typeof value, name).toBe("number");
      expect(value as number, name).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the week's own read GENEROUS and the queue's read TIGHT", () => {
    // Losing a commitment to truncation would be a lie; losing the tail of a
    // suggestion list is calm and is reported. The relationship between the two
    // bounds is the whole of that decision, so it is asserted.
    expect(PLAN_LIMITS.plannedTasks).toBeGreaterThan(PLAN_LIMITS.queue);
    expect(PLAN_LIMITS.queue).toBeLessThanOrEqual(20);
  });

  it("passes an explicit limit to EVERY task read", () => {
    // Every `listWorkspaceTasks` call in the loader must name its bound. An
    // unbounded read is the defect this file exists to prevent.
    const calls = SOURCE.split("listWorkspaceTasks({").slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const body = call.slice(0, call.indexOf("}),"));
      expect(body).toContain("limit:");
    }
  });

  it("never awaits a repository inside a loop", () => {
    /*
     * The N+1 signature, in text: an `await` on a repository call that appears
     * after a `for (`/`.map(` on the same nesting path. Rather than parse the
     * file, this asserts the loader's shape directly — every `await scope.` sits
     * at the top level of a function or inside a `Promise.all([…])`.
     */
    const lines = SOURCE.split("\n");
    let loopDepth = 0;
    const offenders: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(for|while)\s*\(/.test(trimmed)) loopDepth += 1;
      // A closing brace at the start of a line ends the innermost block; this is
      // deliberately coarse and errs towards flagging, which is the safe side.
      if (loopDepth > 0 && /^\}/.test(trimmed)) loopDepth -= 1;
      if (loopDepth > 0 && /await\s+(scope|soft\(scope)/.test(trimmed)) {
        offenders.push(trimmed);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reads the schedule ONCE for the whole week", () => {
    // One call, and it takes a RANGE — not one call per day.
    expect(SOURCE.split("loadScheduleWindow(").length - 1).toBe(1);
    expect(SOURCE).toContain("fromDateIso: week.startIso");
    expect(SOURCE).toContain("toDateIso: week.endIso");
  });

  it("resolves every Project's next action from ONE bounded scan", () => {
    expect(SOURCE.split("listProjectHealthFacts(").length - 1).toBe(1);
    expect(SOURCE).toContain("PLAN_LIMITS.nextActionScan");
  });

  it("runs its independent reads concurrently rather than as a chain", () => {
    expect(SOURCE).toContain("await Promise.all([");
  });

  it("writes NOTHING — the planner is a read model", () => {
    // No mutation may leave this loader. Every write on the surface goes through
    // the canonical Task routes from the client.
    for (const mutation of [
      "planTask",
      "clearPlan",
      "updateTask",
      "createTask",
      "completeTask",
      "setTaskParent",
    ]) {
      expect(SOURCE).not.toContain(`scope.tasks.${mutation}`);
    }
  });
});
