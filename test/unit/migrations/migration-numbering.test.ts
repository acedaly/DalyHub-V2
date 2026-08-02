/**
 * The migration numbering contract — the check
 * [DEBT-40](../../../docs/product/PRODUCT_DEBT.md) asked for.
 *
 * The numeric prefix is the ONLY ordering contract this repository has. Wrangler
 * applies migrations in filename order and tracks them by name, so a duplicate
 * number is not a defect on its own — but it makes "apply in order" stop being
 * verifiable by inspection, and a future pair of same-numbered migrations with a
 * real dependency between them would order by alphabetical accident.
 *
 * DEBT-40 named the fix precisely: **do not rename an applied migration** (both
 * `0013`s are live in production, and renaming one would make Wrangler re-apply it),
 * and instead add a check that fails on a NEW duplicate. That is what this is. The
 * one historical collision is grandfathered by exact filename, so it cannot be used
 * to excuse a second one, and adding a third file numbered `0013` still fails.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "migrations");

/**
 * The one historical collision, grandfathered by EXACT filename.
 *
 * Both were authored in parallel (#65 and #66), both claimed `0013`, and both are
 * applied in production. They are independent slices, so the alphabetical order
 * Wrangler gives them (`area_details` then `person_details`) is deterministic and
 * harmless. This list is not a policy — it is a record of two specific files.
 */
const GRANDFATHERED_COLLISION: ReadonlySet<string> = new Set([
  "0013_create_area_details.sql",
  "0013_create_person_details.sql",
]);

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
}

describe("migration numbering", () => {
  it("names every migration `NNNN_snake_case_description.sql`", () => {
    const malformed = migrationFiles().filter(
      (filename) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(filename),
    );
    expect(malformed).toEqual([]);
  });

  it("issues each number exactly once, apart from the recorded 0013 collision", () => {
    const byNumber = new Map<string, string[]>();
    for (const filename of migrationFiles()) {
      const number = filename.slice(0, 4);
      byNumber.set(number, [...(byNumber.get(number) ?? []), filename]);
    }

    const collisions = [...byNumber.entries()]
      .filter(([, files]) => files.length > 1)
      .filter(
        ([, files]) =>
          // Only the two recorded files, and only as a PAIR, are excused.
          !(
            files.length === 2 &&
            files.every((file) => GRANDFATHERED_COLLISION.has(file))
          ),
      )
      .map(([number, files]) => `${number}: ${files.join(", ")}`);

    expect(
      collisions,
      "A new migration claimed a number that is already taken. Claim the next free " +
        "number at PR-open time, and renumber before merge if another PR took it. " +
        "Never rename a migration that has already been applied.",
    ).toEqual([]);
  });

  it("leaves no gap in the sequence, so 'apply in order' is verifiable by inspection", () => {
    const numbers = [
      ...new Set(
        migrationFiles().map((filename) => Number(filename.slice(0, 4))),
      ),
    ].sort((a, b) => a - b);

    expect(numbers[0]).toBe(1);
    const gaps = numbers.filter(
      (number, index) => index > 0 && number !== numbers[index - 1]! + 1,
    );
    expect(gaps).toEqual([]);
  });
});
