import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * The E2E fixture-date guard (V2.8 CONV-00-E, DEBT-236, ADR-115 decision 4).
 *
 * Loaded through `import()` at run time, as `e2e-partitions.test.ts` loads its
 * script: the guard is plain Node, not part of the application's TypeScript
 * project. These tests pin the CONTRACT the roadmap fixed — what the check
 * must catch and what it must leave alone — so the detection mechanics can be
 * rewritten without the rule moving.
 */
interface Finding {
  readonly form: "iso" | "long" | "short";
  readonly text: string;
  readonly iso: string;
  readonly line: number;
  readonly annotated: boolean;
  readonly verdict: "past" | "annotated" | "future" | "label";
  readonly file?: string;
}
let scanSource: (
  source: string,
  options: { kind: "sql" | "ts"; today: string },
) => Finding[];
let stripComments: (source: string, kind: "sql" | "ts") => string;
let scanFixtures: (options: { today: string }) => Finding[];
let offenders: (findings: Finding[]) => Finding[];
let referenceDay: () => string;
let listFixtureFiles: () => string[];

const TODAY = "2026-09-02";

beforeAll(async () => {
  const module = (await import(
    pathToFileURL(join(process.cwd(), "scripts", "e2e-fixture-dates.mjs")).href
  )) as {
    scanSource: typeof scanSource;
    stripComments: typeof stripComments;
    scanFixtures: typeof scanFixtures;
    offenders: typeof offenders;
    referenceDay: typeof referenceDay;
    listFixtureFiles: typeof listFixtureFiles;
  };
  ({
    scanSource,
    stripComments,
    scanFixtures,
    offenders,
    referenceDay,
    listFixtureFiles,
  } = module);
});

function verdicts(source: string, kind: "sql" | "ts" = "ts") {
  return scanSource(source, { kind, today: TODAY }).map((finding) => [
    finding.text,
    finding.verdict,
  ]);
}

describe("the three literal forms", () => {
  it("reads an ISO date, alone or leading a timestamp", () => {
    expect(
      verdicts(
        `due_date = '2026-09-14', created_at = '2026-07-19T02:20:03.000Z'`,
        "sql",
      ),
    ).toEqual([
      ["2026-09-14", "future"],
      ["2026-07-19", "past"],
    ]);
  });

  it("reads the long-form picker label, with or without the comma", () => {
    expect(
      verdicts(
        `name: "Wednesday 29 July 2026" }); link("Sunday, 31 May 2026")`,
      ),
    ).toEqual([
      ["Wednesday 29 July 2026", "label"],
      ["Sunday, 31 May 2026", "label"],
    ]);
  });

  it("reads the abbreviated display form, with or without a weekday, and both September spellings", () => {
    expect(
      verdicts(
        `/29 Jul 2026/ "Thu, 12 Jun 2027" "Due 31 Dec 2099" "15 Sept 2026" "15 Sep 2027"`,
      ),
    ).toEqual([
      ["29 Jul 2026", "past"],
      ["Thu, 12 Jun 2027", "future"],
      ["31 Dec 2099", "future"],
      ["15 Sept 2026", "future"],
      ["15 Sep 2027", "future"],
    ]);
  });

  it("does not read an impossible calendar day as a date", () => {
    // `2026-02-30` is an invalid-input fixture, not a fixture date.
    expect(verdicts(`dueDate: "2026-02-30"`)).toEqual([]);
    expect(verdicts(`"Wednesday 32 July 2026"`)).toEqual([]);
  });

  it("does not read a bare ISO fragment inside a longer token", () => {
    expect(verdicts(`id = 'sr-2026-08-17-x'; v = 12026-08-171`, "sql")).toEqual(
      [],
    );
  });
});

describe("the verdicts", () => {
  it("a data literal before the reference day is history; the reference day itself, and after, is a bomb", () => {
    // A fixture dated TODAY reads "due today" today and "overdue" tomorrow —
    // the same calendar-armed class, one day later.
    expect(
      verdicts(`"${TODAY}" "2026-09-03" "2026-09-01" "2000-01-01"`),
    ).toEqual([
      [TODAY, "future"],
      ["2026-09-03", "future"],
      ["2026-09-01", "past"],
      ["2000-01-01", "past"],
    ]);
  });

  it("a picker label is flagged whatever its date — past included", () => {
    expect(verdicts(`"Wednesday 29 July 2026"`)).toEqual([
      ["Wednesday 29 July 2026", "label"],
    ]);
    expect(verdicts(`"Friday 25 December 2026"`)).toEqual([
      ["Friday 25 December 2026", "label"],
    ]);
  });

  it("a same-line annotation covers every form on the line, in both comment syntaxes", () => {
    expect(
      verdicts(
        `await grid.click("Wednesday 29 July 2026"); // fixed-date: one press from the seeded July month`,
      ),
    ).toEqual([["Wednesday 29 July 2026", "annotated"]]);
    expect(
      verdicts(`const far = "2099-12-31"; // fixed-date: no run reaches it`),
    ).toEqual([["2099-12-31", "annotated"]]);
    expect(
      verdicts(
        `  ('t-drawer', 'task', 'todo', 'p2', '2099-12-31'), -- fixed-date: far future on purpose`,
        "sql",
      ),
    ).toEqual([["2099-12-31", "annotated"]]);
  });

  it("an annotation on the PREVIOUS line does not carry", () => {
    expect(
      verdicts(`// fixed-date: for the next line\nconst far = "2099-12-31";`),
    ).toEqual([["2099-12-31", "future"]]);
  });

  it("only future data literals and picker labels are offenders", () => {
    const findings = scanSource(
      [
        `"2000-01-01"`,
        `"2099-12-31" // fixed-date: never reached`,
        `"2099-12-30"`,
        `"Monday 1 January 2001"`,
      ].join("\n"),
      { kind: "ts", today: TODAY },
    );
    expect(offenders(findings).map((finding) => finding.text)).toEqual([
      "2099-12-30",
      "Monday 1 January 2001",
    ]);
  });
});

describe("comments are prose, not fixtures", () => {
  it("ignores a date inside a TypeScript line or block comment", () => {
    expect(
      verdicts(
        [
          `// Observed in CI on 2099-08-02, clicking "Wednesday 29 July 2026".`,
          `/* the label the grid uses, e.g. "Friday 25 December 2026" */`,
          `/*`,
          ` * spanning 2099-01-01`,
          ` */ const live = "2099-01-02";`,
        ].join("\n"),
      ),
    ).toEqual([["2099-01-02", "future"]]);
  });

  it("ignores a date inside a SQL comment", () => {
    expect(
      verdicts(
        `-- arms on 2099-09-14\nUPDATE t SET d = '2099-09-14'; -- was 2099-09-15`,
        "sql",
      ),
    ).toEqual([["2099-09-14", "future"]]);
  });

  it("does not mistake a comment marker inside a string for a comment", () => {
    expect(
      verdicts(
        `const url = "http://x/2099-01-01"; const later = "2099-01-02";`,
      ),
    ).toEqual([
      ["2099-01-01", "future"],
      ["2099-01-02", "future"],
    ]);
    expect(
      verdicts(`SET note = 'a -- dash 2099-01-01', d = '2099-01-02'`, "sql"),
    ).toEqual([
      ["2099-01-01", "future"],
      ["2099-01-02", "future"],
    ]);
  });

  it("keeps line numbers while stripping", () => {
    const stripped = stripComments(`a // x\nb /* y\n z */ c`, "ts");
    expect(stripped.split("\n")).toHaveLength(3);
    expect(stripped).toBe(`a     \nb     \n      c`);
  });
});

describe("the repository's own fixtures", () => {
  it("carry no unannotated future data literal and no bare picker label", () => {
    const findings = scanFixtures({ today: referenceDay() });
    expect(findings.length).toBeGreaterThan(0);
    expect(
      offenders(findings).map(
        (finding) => `${finding.file}:${finding.line} ${finding.text}`,
      ),
    ).toEqual([]);
  });

  it("scan every kind of E2E source, the generator form included", async () => {
    const files = new Set(
      scanFixtures({ today: referenceDay() }).map((finding) =>
        finding.file?.slice(finding.file.lastIndexOf(".")),
      ),
    );
    expect(files.has(".sql")).toBe(true);
    expect(files.has(".ts")).toBe(true);
    // `e2e/seed-calendar-evidence.mts` is an executable fixture generator; a
    // date hard-coded there seeds exactly as one in a `.sql` file does, so it
    // is scanned whether or not it currently carries a literal.
    const listed = listFixtureFiles();
    expect(listed.some((path) => path.endsWith(".mts"))).toBe(true);
    expect(
      listed.every((path) =>
        [".sql", ".ts", ".mts", ".mjs"].some((ext) => path.endsWith(ext)),
      ),
    ).toBe(true);
  });
});
