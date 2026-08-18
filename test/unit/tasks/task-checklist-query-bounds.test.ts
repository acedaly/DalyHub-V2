/**
 * TASKS-13 — the checklist progress BUDGET, asserted at the source.
 *
 * `test/kernel/task-checklist.test.ts` counts the statements for real and proves
 * a page of fifty Tasks costs the ONE aggregate that one Task does. This file
 * guards the other half: that no loader ever calls the aggregate from inside a
 * loop over Tasks, days or groups — the edit that would turn a bounded read into
 * an N+1 without changing a single line of the repository.
 *
 * It is a text check for the reason `plan-query-bounds.test.ts` gives: the shape
 * that would catch the regression at runtime is a workspace nobody seeds, while
 * the defect itself is plainly visible in the source.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Every loader that projects checklist progress, and where it lives. */
const PROJECTING_LOADERS = [
  ["the Tasks collection", "app/modules/tasks/routes/index.tsx"],
  ["Today", "app/modules/today/day/load.ts"],
  ["Weekly Planning", "app/modules/plan/plan-load.server.ts"],
] as const;

/**
 * Surfaces that deliberately project NO progress. Listed so the decision is a
 * recorded one rather than an omission somebody later "fixes" without noticing
 * it costs a query on a surface that does not draw the figure.
 */
const NON_PROJECTING = [
  ["the Review Inbox", "app/modules/tasks/routes/review.tsx"],
  ["the guided Review", "app/modules/reviews/guided/review-guide-context.ts"],
] as const;

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/**
 * Count the READ SITES in a loader: the places it actually asks for progress.
 *
 * That is the repository call itself, plus any call to a loader's own guarded
 * wrapper around it — the Tasks collection uses a wrapper so a failed aggregate
 * costs the FIGURE rather than the page. The wrapper's own DECLARATION is not a
 * read, so it is discounted.
 */
function readSites(source: string): number {
  const direct = source.split("listChecklistProgress(").length - 1;
  const wrapped = source.split("checklistProgressOrNone(").length - 1;
  const declaresWrapper = source.includes(
    "async function checklistProgressOrNone(",
  );
  // The wrapper both declares the helper and contains the one direct call
  // inside it, so those two mentions describe ONE read shape rather than two.
  return declaresWrapper ? wrapped - 1 + direct - 1 : wrapped + direct;
}

/** A read site that appears INSIDE an iteration — the N+1 signature, in text. */
const INSIDE_A_LOOP = /\.(map|flatMap|forEach)\(|for \(/;

describe("checklist progress is read once per page, never once per Task", () => {
  for (const [name, file] of PROJECTING_LOADERS) {
    it(`${name} reads it a fixed number of times`, () => {
      const sites = readSites(read(file));
      // At least one (it projects the figure) and at most two (the Tasks
      // collection reads once for a flat page and once for a grouped one; only
      // one of those runs per request).
      expect(sites, file).toBeGreaterThanOrEqual(1);
      expect(sites, file).toBeLessThanOrEqual(2);
    });

    it(`${name} never reads it inside a loop`, () => {
      const source = read(file);
      for (const line of source.split("\n")) {
        const marker = /listChecklistProgress\(|checklistProgressOrNone\(/.exec(
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
      expect(read(file)).not.toContain("listChecklistProgress");
    });
  }

  it("the shared serialiser takes progress as an ARGUMENT, never fetches it", () => {
    // `serializeTaskListItem` is called once per row. If it could read progress
    // itself, every surface would be an N+1 by construction — so it cannot: the
    // shared projection module is pure and imports no repository.
    const source = read("app/shared/task-record/task-view.ts");
    expect(source).toContain("serializeTaskListPage");
    expect(source).not.toContain("listChecklistProgress(");
    expect(source).not.toMatch(/\bawait\b/);
  });

  it("binds fewer ids per statement than D1 accepts parameters", () => {
    /*
     * The regression test for a real defect. D1 accepts at most 100 bound
     * parameters per query and the workspace id is one of them, so a chunk of
     * 100 is a hundred-and-one — and the statement fails. On a surface that
     * degrades a failed read (Today), the symptom was a day that said "Nothing
     * planned today" while thirty-seven Tasks were planned.
     */
    const source = read("app/platform/storage/d1/d1-task-repository.ts");
    const chunk = /const CHECKLIST_ID_CHUNK = (\d+);/.exec(source);
    expect(chunk, "CHECKLIST_ID_CHUNK is declared").not.toBeNull();
    expect(Number(chunk![1]) + 1).toBeLessThan(100);
  });
});
