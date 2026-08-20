/**
 * TASKS-12 — the blocked-state BUDGET, asserted at the source.
 *
 * `test/kernel/task-dependencies.test.ts` counts the statements for real and
 * proves a page of thirty Tasks costs the ONE aggregate that one Task does. This
 * file guards the other half: that no loader ever calls the aggregate from inside
 * a loop over Tasks, days or groups — the edit that would turn a bounded read into
 * an N+1 without changing a single line of the repository.
 *
 * It is a text check for the reason `task-checklist-query-bounds.test.ts` gives:
 * the shape that would catch the regression at runtime is a workspace nobody
 * seeds, while the defect itself is plainly visible in the source.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Every loader that projects blocked state, and where it lives. */
const PROJECTING_LOADERS = [
  ["the Tasks collection", "app/modules/tasks/routes/index.tsx"],
  ["Today", "app/modules/today/day/load.ts"],
  ["Weekly Planning", "app/modules/plan/plan-load.server.ts"],
  ["a Project's record", "app/modules/projects/routes/detail.tsx"],
  ["a Project's task page", "app/modules/projects/routes/tasks.tsx"],
] as const;

/**
 * Surfaces that deliberately project NO blocked state. Recorded so the decision
 * is a decision rather than an omission somebody later "fixes" without noticing
 * it costs a query on a surface that draws no blocked line.
 */
const NON_PROJECTING = [
  ["global Search", "app/modules/tasks/search.ts"],
  ["the Review Inbox", "app/modules/tasks/routes/review.tsx"],
] as const;

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/**
 * Count the READ SITES in a loader: the places it actually asks for blocked
 * state — the repository call itself, plus any call to a loader's own guarded
 * wrapper around it. The wrapper's DECLARATION is not a read, so it is
 * discounted, along with the one direct call inside it.
 */
function readSites(source: string): number {
  const direct = source.split("listBlockedSummaries(").length - 1;
  const wrapped = source.split("blockedSummariesOrNone(").length - 1;
  const declaresWrapper = source.includes(
    "async function blockedSummariesOrNone(",
  );
  return declaresWrapper ? wrapped - 1 + direct - 1 : wrapped + direct;
}

/** A read site that appears INSIDE an iteration — the N+1 signature, in text. */
const INSIDE_A_LOOP = /\.(map|flatMap|forEach)\(|for \(/;

describe("blocked state is read once per page, never once per Task", () => {
  for (const [name, file] of PROJECTING_LOADERS) {
    it(`${name} reads it a fixed number of times`, () => {
      const sites = readSites(read(file));
      // At least one (it projects the state) and at most two (the Tasks
      // collection reads once for a flat page and once for a grouped one; only
      // one of those runs per request).
      expect(sites, file).toBeGreaterThanOrEqual(1);
      expect(sites, file).toBeLessThanOrEqual(2);
    });

    it(`${name} never reads it inside a loop`, () => {
      const source = read(file);
      for (const line of source.split("\n")) {
        const marker = /listBlockedSummaries\(|blockedSummariesOrNone\(/.exec(
          line,
        );
        if (!marker) continue;
        expect(
          line.slice(0, marker.index),
          `${file}: ${line.trim()}`,
        ).not.toMatch(INSIDE_A_LOOP);
      }
    });
  }

  for (const [name, file] of NON_PROJECTING) {
    it(`${name} deliberately projects none`, () => {
      expect(read(file)).not.toContain("listBlockedSummaries");
    });
  }

  it("the shared serialiser takes blocked state as an ARGUMENT, never fetches it", () => {
    const source = read("app/shared/task-record/task-view.ts");
    expect(source).toContain("withBlockedSummary");
    expect(source).not.toContain("listBlockedSummaries(");
    expect(source).not.toMatch(/\bawait\b/);
  });

  it("binds fewer ids per statement than D1 accepts parameters", () => {
    /*
     * D1 accepts at most 100 bound parameters per query, and the blocked
     * aggregate binds the workspace id AND the link type before the ids — so a
     * chunk of 100 would be a hundred-and-two, and the statement would fail on a
     * page nobody would think to test.
     */
    const source = read("app/platform/storage/d1/d1-task-repository.ts");
    const chunk = /const DEPENDENCY_ID_CHUNK = (\d+);/.exec(source);
    expect(chunk, "DEPENDENCY_ID_CHUNK is declared").not.toBeNull();
    expect(Number(chunk![1]) + 2).toBeLessThan(100);
  });

  it("bounds the cycle walk explicitly, in the recursive query itself", () => {
    /*
     * The walk must terminate even on a graph that already contains a cycle — a
     * restored archive, or a future defect. The bound is a `depth <` predicate in
     * the recursive term plus `UNION` (not `UNION ALL`), so an already-visited
     * Task is never expanded twice.
     */
    const source = read("app/platform/storage/d1/d1-task-repository.ts");
    expect(source).toContain("WITH RECURSIVE downstream(id, depth)");
    expect(source).toContain("downstream.depth < ${MAX_DEPENDENCY_DEPTH}");
    expect(source).not.toContain("UNION ALL\n               SELECT dep.");
  });

  it("counts the bounds INSIDE the write, never with a read-then-decide", () => {
    /*
     * The concurrency property, asserted structurally: the guard the insert and
     * the restore are gated on is one SQL expression containing both counts and
     * the cycle walk. A `listTaskDependencies(...).length >=` before the write
     * would be the read-then-decide two racers can both pass.
     */
    const source = read("app/platform/storage/d1/d1-task-repository.ts");
    expect(source).toContain("#dependencyWriteGuard(");
    expect(source).toMatch(/WHERE \$\{guard\.sql\}/);
    expect(source).not.toMatch(
      /const .*= await this\.listTaskDependencies\([^)]*\);\s*\n\s*if \(/,
    );
  });
});
