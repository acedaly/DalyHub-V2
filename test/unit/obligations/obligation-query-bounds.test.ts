/**
 * V2.10 LIFE-02 — the Life Admin query BUDGET, asserted rather than asserted-to.
 *
 * A collection whose every row is about another record is an easy place to
 * write an N+1: one read for the subject, one for the meter, one for the linked
 * Task, per row. This is a SOURCE-level guard on the shared read, following
 * PLAN-01's and HABITS-01's precedent: it proves the page is TWO statements
 * whatever it returns, and that no repository call sits inside a loop.
 *
 * It is a static check because the alternative — counting D1 statements — needs
 * a workspace of a known shape, and the shape that would catch a regression (a
 * thousand obligations) is the one nobody seeds. The runtime counterpart lives
 * in `test/kernel/asset-history-scale.test.ts`, which counts real statements
 * against a real D1 at thirty subjects.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

const FACTS = read(
  "app",
  "platform",
  "obligations",
  "obligation-facts.server.ts",
);
const LOADER = read(
  "app",
  "modules",
  "obligations",
  "obligations-load.server.ts",
);
const REPOSITORY = read(
  "app",
  "platform",
  "storage",
  "d1",
  "d1-obligation-repository.ts",
);

/** Source with comments stripped, so prose can never satisfy a guard (CONV-01). */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the obligation reads' bounds", () => {
  it("reads a page in exactly two statements: the rows, then the counts", () => {
    const body = code(FACTS);
    const awaits = body.match(/await scope\.\w+\.\w+\(/g) ?? [];
    /*
     * `list` and `countByBand`, and nothing else. A third would be a meter or a
     * subject read, which is the N+1 this budget exists to forbid — both ride
     * on the row projection instead.
     */
    expect(awaits).toEqual([
      "await scope.obligations.list(",
      "await scope.obligations.countByBand(",
    ]);
  });

  it("never calls a repository inside a loop or a map", () => {
    const body = code(FACTS);
    // A repository call inside a `.map(` callback is the classic per-row read.
    expect(body).not.toMatch(/\.map\([\s\S]{0,400}?await scope\./);
    expect(body).not.toMatch(/for\s*\([\s\S]{0,200}?await scope\./);
  });

  it("resolves the subject and its meter in the ROW read, not beside it", () => {
    const body = code(REPOSITORY);
    /*
     * The subject's title, type, subtype and current meter reading are one
     * projection selected by the same statement that reads the rows. Before
     * LIFE-02 the meter came from a second read per Asset subject.
     */
    expect(body).toContain("const SUBJECT_COLUMNS");
    expect(body).toContain("current_meter_value");
    expect(body).toContain("${SUBJECT_JOINS}");
  });

  it("counts the bands in ONE grouped statement over the whole collection", () => {
    const body = code(REPOSITORY);
    const countBody = body.slice(body.indexOf("async countByBand("));
    expect(countBody).toContain("GROUP BY band");
    // One prepare inside the method, not one per band.
    const prepares = countBody
      .slice(0, countBody.indexOf("\n  }\n"))
      .match(/\.prepare\(/g);
    expect(prepares?.length ?? 0).toBe(1);
  });

  it("adds exactly one statement of its own to the collection loader", () => {
    const body = code(LOADER);
    const awaits =
      body.match(/await (?:scope|readObligationPage)[.\w]*\(/g) ?? [];
    // The owner's calendar day, then the page read. Nothing per row.
    expect(awaits).toEqual([
      "await scope.ownerTodayIso(",
      "await readObligationPage(",
    ]);
  });

  it("keeps the count read and the row read on the SAME filter", () => {
    const body = code(FACTS);
    /*
     * A heading counting one list above the rows of another is the specific
     * defect D10 exists to prevent, and it is one forgotten argument away: both
     * calls must pass the filters, the query and the subject scope.
     */
    const listCall = body.slice(
      body.indexOf("await scope.obligations.list("),
      body.indexOf("await scope.obligations.countByBand("),
    );
    const countCall = body.slice(
      body.indexOf("await scope.obligations.countByBand("),
    );
    for (const field of ["filters", "query", "subjectEntityId", "today"]) {
      expect(listCall, `list must pass ${field}`).toContain(field);
      expect(
        countCall.slice(0, 400),
        `countByBand must pass ${field}`,
      ).toContain(field);
    }
  });
});
