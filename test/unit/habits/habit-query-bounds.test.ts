/**
 * HABITS-01 — the query BUDGET, asserted rather than asserted-to.
 *
 * A habit surface is an easy place to write an N+1: everything about it is
 * "per habit" or "per day". This is a SOURCE-level guard on the shared reads,
 * following PLAN-01's precedent (`plan-query-bounds.test.ts`): it proves the
 * completions are read for a SET of habits over a WINDOW rather than one habit
 * at a time, and that no repository call sits inside a loop.
 *
 * It is a static check because the alternative — counting D1 statements — needs
 * a workspace of a known shape, and the shape that would catch a regression (a
 * hundred habits) is the one nobody seeds. The runtime counterpart lives in
 * `test/kernel/habits.test.ts`, which counts real statements against a real D1.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Whether a call's argument body names a field — in EITHER form.
 *
 * `{ fromIso: fromIso }` and `{ fromIso }` are the same argument, and ES6
 * shorthand is the form the linter prefers. UX-02's `readHabitOverview` writes
 * the shorthand, and the first version of this guard failed on it — which is a
 * defect in the guard, not in the read: the invariant being asserted is that the
 * call NAMES a bounded window, and both spellings do.
 */
function names(body: string, field: string): boolean {
  return (
    body.includes(`${field}:`) ||
    new RegExp(`\\b${field}\\s*(?:[,}]|$)`).test(body.trimEnd())
  );
}

const SOURCE = readFileSync(
  path.join(
    process.cwd(),
    "app",
    "platform",
    "habits",
    "habit-facts.server.ts",
  ),
  "utf8",
);

const REPOSITORY = readFileSync(
  path.join(
    process.cwd(),
    "app",
    "platform",
    "storage",
    "d1",
    "d1-habit-repository.ts",
  ),
  "utf8",
);

describe("the habit reads' bounds", () => {
  it("reads completions for a SET of habits, never one at a time", () => {
    // Every completion read passes `habitIds`, which is what makes a page of
    // twenty habits one statement rather than twenty.
    const calls = SOURCE.split("listCompletionsInRange({").slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const body = call.slice(0, call.indexOf("})"));
      expect(names(body, "habitIds")).toBe(true);
      expect(names(body, "fromIso")).toBe(true);
      expect(names(body, "toIso")).toBe(true);
    }
  });

  it("never awaits a repository inside a loop", () => {
    /*
     * The N+1 signature in text: an `await scope.` after a `for (` or `.map(`
     * on the same nesting path. The reads are deliberately structured so the
     * only loops in this file are over already-fetched rows.
     */
    const lines = SOURCE.split("\n");
    const offenders: string[] = [];
    let loopDepth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      // Only a BLOCK loop opens a scope worth tracking; a single-statement
      // `for (…) x;` cannot contain an await on its own line.
      if (
        /^(for \(|\} ?for \()/.test(trimmed) ||
        /\.(map|forEach|flatMap)\(\s*async/.test(trimmed)
      ) {
        if (trimmed.endsWith("{")) loopDepth += 1;
      }
      if (loopDepth > 0 && /await scope\./.test(trimmed)) {
        offenders.push(trimmed);
      }
      if (loopDepth > 0 && (trimmed === "}" || trimmed.startsWith("})"))) {
        loopDepth -= 1;
      }
    }
    expect(offenders).toEqual([]);
  });

  it("bounds every list read it makes", () => {
    const calls = SOURCE.split("habits.list({").slice(1);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const body = call.slice(0, call.indexOf("})"));
      expect(names(body, "limit")).toBe(true);
    }
  });

  it("bounds the UX-02 overview below D1's parameter ceiling", () => {
    /*
     * The overview binds one parameter per habit id plus the workspace and two
     * dates, and D1 accepts at most 100 bound parameters per query — the limit
     * TASKS-13 found the hard way. The constant is asserted here so raising it
     * carelessly fails a test rather than a production read.
     */
    const match = SOURCE.match(/HABIT_OVERVIEW_LIMIT = (\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(90);
  });

  it("has no per-habit completion read on the repository at all", () => {
    /*
     * The contract deliberately offers no `getCompletions(habitId)`. Its absence
     * is what makes the N+1 unwritable rather than merely discouraged, so it is
     * asserted here as well as documented.
     */
    expect(REPOSITORY).not.toMatch(/getCompletions\s*\(/);
  });

  it("reads every schedule chain for a page in ONE statement", () => {
    // `#readVersions` takes an array of ids and binds them as placeholders.
    expect(REPOSITORY).toContain("habit_id IN (${placeholders(ids.length)})");
  });
});
