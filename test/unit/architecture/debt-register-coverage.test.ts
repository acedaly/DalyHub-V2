/**
 * V2.16 CONSOL-03 — "every open entry has exactly one home", as a check.
 *
 * The disposition report opens with that sentence and a table ending
 * `REMAIN OPEN | 0`. Nothing read the register, so the sentence was a claim
 * about a document made by the same document — and V2.16's independent review
 * duly found it already false: `DEBT-255`, raised BY the CONSOL-03 commit
 * itself, was open with no disposition and in no table. The commit whose only
 * claim was "nothing remains open" had raised something and not said so.
 *
 * That is not a numbers error, it is the shape of error this whole programme is
 * about: a register that can gain an undisposed entry silently is a register
 * that has stopped meaning anything, and the next release inherits an ambiguous
 * loop while reading a document that says there are none.
 *
 * So the register is PARSED and every open entry must be either disposed in the
 * report or named in its "What this programme raised" section, with a stated
 * reason for being open. A release that finds something new stays honest by
 * writing it in one of two places; it cannot stay honest by writing it in
 * neither.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const REGISTER = readFileSync(
  path.join(ROOT, "docs/product/PRODUCT_DEBT.md"),
  "utf8",
);
const REPORT = readFileSync(
  path.join(ROOT, "docs/product/PRODUCT_DEBT_V2_16_DISPOSITION.md"),
  "utf8",
);

/** The id of every OPEN (`☐`/`◐`) entry heading, template excluded. */
function openEntries(): string[] {
  return (
    [...REGISTER.matchAll(/^#{2,4} [☐◐] ([A-Z]+-[0-9]+) —/gm)]
      .map((match) => match[1])
      // `DEBT-NN` is the entry template at the foot of the file, not an entry.
      .filter((id) => id !== "DEBT-NN")
  );
}

/** The section of the report a release's own findings go in. */
const RAISED = REPORT.slice(
  REPORT.indexOf("## What this programme raised"),
  REPORT.indexOf("## The three assessed for V2.16"),
);

describe("CONSOL-03 — the register and its disposition report agree", () => {
  it("finds a register to read at all", () => {
    // A parse that silently matches nothing would make every assertion below
    // vacuous, which is the failure mode this whole file exists to prevent.
    expect(openEntries().length).toBeGreaterThan(50);
    expect(RAISED.length).toBeGreaterThan(200);
  });

  it("gives every open entry a home — a disposition row, or a stated reason", () => {
    const homeless = openEntries().filter(
      (id) => !REPORT.includes(`[${id}]`) && !RAISED.includes(id),
    );
    expect(
      homeless,
      "these entries are open in the register and appear nowhere in the disposition report",
    ).toEqual([]);
  });

  it("names, in the register itself, every entry the report disposes of", () => {
    /*
     * The other direction. A report row for an entry that no longer exists —
     * renumbered, merged, or deleted — is a promise about a thing nobody can
     * read, and "never silently delete a historical entry" is a rule this
     * repository states and had no way to enforce.
     */
    const disposed = [
      ...REPORT.matchAll(/\[([A-Z]+-[0-9]+)\]\(PRODUCT_DEBT\.md#/g),
    ].map((match) => match[1]);
    expect(disposed.length).toBeGreaterThan(90);
    const missing = [...new Set(disposed)].filter(
      (id) => !new RegExp(`^#{2,4} [☐◐☑✗] ${id} —`, "m").test(REGISTER),
    );
    expect(
      missing,
      "the disposition report names entries the register does not have",
    ).toEqual([]);
  });

  it("keeps the report's summary table equal to the rows it actually carries", () => {
    const stated = Object.fromEntries(
      [
        ...REPORT.matchAll(
          /^\| \*\*(CLOSED|OWNER-GATED|RE-HOMED TO V3|STRUCK BY DECISION|REMAIN OPEN)\*\* \| (\d+) \|/gm,
        ),
      ].map((match) => [match[1], Number(match[2])]),
    );
    expect(new Set(Object.keys(stated))).toEqual(
      new Set([
        "CLOSED",
        "OWNER-GATED",
        "RE-HOMED TO V3",
        "STRUCK BY DECISION",
        "REMAIN OPEN",
      ]),
    );

    // Count the rows under each `##` heading the summary names.
    const counted: Record<string, number> = {
      CLOSED: 0,
      "OWNER-GATED": 0,
      "RE-HOMED TO V3": 0,
      "STRUCK BY DECISION": 0,
    };
    let section: string | null = null;
    for (const line of REPORT.split("\n")) {
      const heading = /^## (.+)$/.exec(line);
      if (heading) {
        const name = heading[1].split("—")[0].trim();
        section = name in counted ? name : null;
        continue;
      }
      if (section !== null && line.startsWith("| [")) counted[section] += 1;
    }
    for (const [name, count] of Object.entries(counted)) {
      expect(stated[name], `the ${name} count`).toBe(count);
    }
    expect(stated["REMAIN OPEN"]).toBe(0);
  });
});
