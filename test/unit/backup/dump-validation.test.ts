/**
 * BACKUP-01 — dump validation, and its parity with the GitHub Actions pipeline.
 *
 * DalyHub now keeps two independent production D1 backups: the AUDIT-11
 * encrypted GitHub Actions artifact and the BACKUP-01 R2 object. They validate
 * the same dump for the same reasons, in two runtimes that cannot share a
 * module (`scripts/production-backup.mjs` is Node ESM over `node:fs`; the Worker
 * cannot import it). The parity test below is what stops those two lists
 * drifting apart, so a kernel table added to one is added to both.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_DUMP_TABLES,
  looksLikeSqlDump,
  validateDumpText,
} from "../../../infra/backup/src/dump-validation";

/**
 * The GitHub Actions pipeline's table list, read from its SOURCE rather than
 * imported.
 *
 * `scripts/production-backup.mjs` is plain, untyped Node ESM and predates this
 * work; importing it would pull it into the strict `checkJs` project and force
 * ~25 unrelated annotations onto an audited file that BACKUP-01 has no business
 * editing. Reading the declaration textually gives the same drift protection
 * with no blast radius.
 */
function tablesRequiredByGithubActionsPipeline(): string[] {
  const source = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "scripts",
      "production-backup.mjs",
    ),
    "utf8",
  );
  const declaration = /export const REQUIRED_DUMP_TABLES = \[([^\]]*)\]/.exec(
    source,
  );
  if (declaration === null) {
    throw new Error(
      "Could not find REQUIRED_DUMP_TABLES in scripts/production-backup.mjs — the parity check has broken, not passed.",
    );
  }
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function dumpWithAllTables(): string {
  const tables = REQUIRED_DUMP_TABLES.map(
    (table) => `CREATE TABLE ${table} (id TEXT PRIMARY KEY);`,
  ).join("\n");
  return `PRAGMA defer_foreign_keys=TRUE;\n${tables}\n`;
}

describe("parity with the GitHub Actions backup pipeline", () => {
  it("requires exactly the same tables as scripts/production-backup.mjs", () => {
    // If this fails, one of the two backup pipelines has a weaker idea of what
    // a complete DalyHub database is than the other.
    const theirs = tablesRequiredByGithubActionsPipeline();
    expect(theirs.length).toBeGreaterThan(0);
    expect([...REQUIRED_DUMP_TABLES]).toEqual(theirs);
  });
});

describe("validateDumpText", () => {
  it("accepts a complete dump", () => {
    expect(validateDumpText(dumpWithAllTables())).toEqual([]);
  });

  it("reports an empty dump once, not twelve times", () => {
    expect(validateDumpText("")).toEqual(["the dump is empty"]);
    expect(validateDumpText("   \n  \n")).toEqual(["the dump is empty"]);
  });

  it("names every missing table", () => {
    const problems = validateDumpText(
      "CREATE TABLE entities (id TEXT PRIMARY KEY);",
    );
    expect(problems).toContain('the dump has no CREATE TABLE for "workspaces"');
    expect(problems).toContain(
      'the dump has no CREATE TABLE for "diary_entry_details"',
    );
    expect(problems).not.toContain(
      'the dump has no CREATE TABLE for "entities"',
    );
  });

  it("accepts the identifier quoting styles D1 emits", () => {
    for (const form of [
      "CREATE TABLE entities (id TEXT);",
      'CREATE TABLE "entities" (id TEXT);',
      "CREATE TABLE `entities` (id TEXT);",
      "CREATE TABLE [entities] (id TEXT);",
      "CREATE TABLE IF NOT EXISTS entities (id TEXT);",
      "create table entities (id TEXT);",
    ]) {
      const problems = validateDumpText(form);
      expect(problems).not.toContain(
        'the dump has no CREATE TABLE for "entities"',
      );
    }
  });

  it("catches a dump cut off mid-statement", () => {
    const truncated = `${dumpWithAllTables()}INSERT INTO entities VALUES ('a', 'b'`;
    expect(validateDumpText(truncated)).toContain(
      "the dump does not end with a complete SQL statement",
    );
  });

  it("ignores trailing comments and blank lines when checking completeness", () => {
    const withComment = `${dumpWithAllTables()}\n-- end of dump\n\n`;
    // The last MEANINGFUL line still ends a statement, so this is complete.
    expect(validateDumpText(withComment)).toEqual([]);
  });

  it("never echoes dump content in a problem message", () => {
    const secretish = `CREATE TABLE entities (id TEXT);\nINSERT INTO person_details VALUES('alice@example.invalid');`;
    const problems = validateDumpText(secretish);
    expect(problems.join(" ")).not.toContain("alice@example.invalid");
  });
});

describe("looksLikeSqlDump", () => {
  it("accepts something that opens like a D1 dump", () => {
    expect(looksLikeSqlDump("PRAGMA defer_foreign_keys=TRUE;")).toBe(true);
    expect(looksLikeSqlDump("CREATE TABLE entities (id TEXT);")).toBe(true);
  });

  it("rejects the error pages a broken download actually returns", () => {
    expect(looksLikeSqlDump("<html><body>502 Bad Gateway</body></html>")).toBe(
      false,
    );
    expect(looksLikeSqlDump('{"success":false,"errors":[]}')).toBe(false);
    expect(looksLikeSqlDump("")).toBe(false);
  });
});
