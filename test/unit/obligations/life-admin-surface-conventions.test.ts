/**
 * V2.10 LIFE-02/LIFE-03 — three conventions the Life Admin surfaces have to
 * hold, each of which was found broken by review rather than by a test.
 *
 * They are asserted STRUCTURALLY, in the shape `shared-row-consumers.test.ts`
 * established, because each failure mode is a default quietly left in place
 * rather than a wrong answer a behavioural test would catch. The next surface
 * that forgets one of them fails here.
 *
 *   1. An ACTIONABLE collection merges its refreshed first page. `/obligations`
 *      holds, dismisses, reopens and completes, and every one of those
 *      revalidates; left at `useKeysetPagination`'s default `reset`, an owner
 *      three pages in was sent back to page one after every action — the defect
 *      TASKS-09 measured and the hook's own comment predicts for "a second
 *      actionable collection".
 *
 *   2. The record's action buttons are DISABLED while that obligation has a
 *      mutation in flight. The shared row has passed `busy` since LIFE-02; the
 *      record read `actions.pendingId` and never used it, so "Create task"
 *      stayed live and two clicks could create two Tasks racing to claim one
 *      `task_id`.
 *
 *   3. The record offers meter editing on the SUBJECT'S capability, not on
 *      whether a meter target is already set. The Asset tab passes the unit
 *      vocabulary unconditionally, so gating on `obligation.meterUnit` made one
 *      record offer different edits depending on which door it was opened
 *      through.
 *
 * Falsified before it was trusted: removing `refresh: "merge"`, removing a
 * `disabled={busy}`, and restoring the `obligation.meterUnit` gate each make
 * exactly one assertion below fail.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Strip comments, so prose about a rule can neither satisfy nor trip it. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const COLLECTION = "app/modules/obligations/ObligationsCollection.tsx";
const RECORD = "app/modules/obligations/ObligationRecord.tsx";

describe("the Life Admin collection keeps the owner's place", () => {
  it("merges a refreshed first page rather than resetting it", () => {
    const source = code(read(COLLECTION));
    expect(source).toContain("useKeysetPagination");
    expect(source).toMatch(/refresh:\s*"merge"/);
  });

  it("still mutates, which is what makes the merge load-bearing", () => {
    const source = code(read(COLLECTION));
    // If these ever leave, the convention above stops being required and this
    // test should be revisited rather than silently over-constraining.
    expect(source).toMatch(/actions\.(hold|dismiss|reopen)/);
  });
});

describe("the Obligation record guards a mutation in flight", () => {
  const source = code(read(RECORD));

  it("derives a busy flag from the action hook's pending id", () => {
    expect(source).toMatch(/actions\.pendingId\s*===\s*obligation\.id/);
  });

  it("disables every write button while it is set", () => {
    /*
     * Counted rather than named, so a fifth button added later without a guard
     * fails here. Four today: create task, hold, dismiss, and reopen.
     */
    const guards = source.match(/disabled=\{busy\}/g) ?? [];
    expect(guards).toHaveLength(4);
  });

  it("leaves createTask behind that guard specifically", () => {
    // The one where a double click costs a real, orphaned Task.
    const createTask = source.slice(
      Math.max(0, source.indexOf("actions.createTask") - 400),
      source.indexOf("actions.createTask"),
    );
    expect(createTask).toContain("disabled={busy}");
  });
});

describe("the Obligation record offers the same edits as the Asset tab", () => {
  it("decides meter editing from the subject, not from the stored unit", () => {
    const source = code(read(RECORD));
    expect(source).toMatch(/obligation\.subject\?\.type\s*===\s*"asset"/);
    // The old rule, which made the two doors disagree.
    expect(source).not.toMatch(
      /const meterUnits = obligation\.meterUnit\s*\n?\s*\?/,
    );
  });

  it("keeps an existing target editable whatever the subject is", () => {
    const source = code(read(RECORD));
    // Data written before the rule — or by a client that ignored it — must not
    // become a value the owner can see and never clear.
    expect(source).toMatch(/subjectKeepsMeter \|\| obligation\.meterUnit/);
  });
});
