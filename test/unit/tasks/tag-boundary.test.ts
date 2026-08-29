import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.6 FIND-03 — the two things a tag must NEVER become, asserted at the source.
 *
 * ADR-112 decision 4 states them in so many words: a tag *"never orders a
 * collection"* and *"never feeds the kernel next-action rule"*. Both are claims
 * about what a piece of code may READ, and both are therefore checked by reading
 * it rather than by a ranking that happens to agree today.
 *
 * This is the shape V2.5's STEER-02 review asked for after a value-level test
 * let a deliberate falsifier through: *"one assertion was value-level where it
 * needed to be source-level."* The behavioural halves live in
 * `test/kernel/task-tags.test.ts`, so neither stands alone.
 */

function source(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/** Strip comments — prose ABOUT tags is not a tag reaching a rule. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("*"))
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("FIND-03 — a tag never becomes a ranking input", () => {
  it("does not appear in the kernel next-action rule", () => {
    // STEER-04's rule reads `NextActionFacts` and nothing else. A tag is not in
    // that shape and is not named anywhere in the module, so it cannot reach the
    // decision — and a change that made it possible fails here.
    expect(code(source("app/kernel/tasks/next-action.ts"))).not.toMatch(
      /\btags?\b/i,
    );
  });

  it("does not appear in the smart-sort expression", () => {
    /*
     * The ordering expression is a self-contained string built by
     * `#workspaceSortSpec("smart")`, and its pure twin is `smartSortKey` in
     * `next-action.ts` (already covered above). Read the SQL builder's own
     * segment list: four segments, none of them a tag.
     */
    const repository = source("app/platform/storage/d1/d1-task-repository.ts");
    const start = repository.indexOf('case "smart":');
    expect(start).toBeGreaterThan(0);
    const end = repository.indexOf("#activePlanningWhere", start);
    const expression = code(repository.slice(start, end));
    expect(expression).not.toMatch(/\btags?\b/i);
    expect(expression).not.toContain("entity_tags");
  });
});
