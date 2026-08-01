import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "migrations");
const compatibilityStart = 25;

function migrationNumber(filename: string): number | null {
  const match = /^(\d+)_.*\.sql$/.exec(filename);
  return match ? Number(match[1]) : null;
}

function stripCommentOnlyLines(fragment: string): string {
  return fragment
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
}

function checkedMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((filename) => {
      const number = migrationNumber(filename);
      return number !== null && number >= compatibilityStart;
    })
    .sort();
}

describe("D1 migration parser compatibility", () => {
  it("keeps pending and future migrations free of remote D1 statement-splitting hazards", () => {
    const failures: string[] = [];

    for (const filename of checkedMigrationFiles()) {
      const buffer = readFileSync(path.join(migrationsDir, filename));
      const sql = buffer.toString("utf8");

      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        failures.push(`${filename}: contains a UTF-8 BOM`);
      }

      if (sql.includes("\r")) {
        failures.push(`${filename}: contains CR or CRLF line endings`);
      }

      if ([...sql].some((character) => character.codePointAt(0)! > 0x7f)) {
        failures.push(`${filename}: contains non-ASCII characters`);
      }

      if (sql.includes("/*") || sql.includes("*/")) {
        failures.push(`${filename}: contains block comments`);
      }

      sql.split("\n").forEach((line, index) => {
        if (line.trimStart().startsWith("--") && line.includes(";")) {
          failures.push(
            `${filename}:${index + 1}: line comment contains a semicolon`,
          );
        }
      });

      const fragments = sql.split(";");
      fragments.forEach((fragment, index) => {
        const isTrailingFragment =
          index === fragments.length - 1 && sql.trimEnd().endsWith(";");
        if (isTrailingFragment) return;

        if (stripCommentOnlyLines(fragment) === "") {
          failures.push(
            `${filename}: semicolon fragment ${index + 1} contains no SQL statement`,
          );
        }
      });
    }

    expect(failures).toEqual([]);
  });
});
