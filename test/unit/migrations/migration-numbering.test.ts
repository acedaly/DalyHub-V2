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
 * and instead add a check that fails on a NEW duplicate. That is what this is. A
 * recorded collision is grandfathered by exact filename, so it cannot be used to
 * excuse another one, and adding a third file numbered `0013` still fails.
 *
 * ── Which half of the rule bites, and when (HARDEN-02) ──────────────────────
 *
 * The two halves apply at different moments, and reading the failure message as
 * an instruction to renumber AFTER a merge is how this check turned into an
 * outage:
 *
 *   - **Before merge**, a duplicate is cheap and renumbering is right. Nothing
 *     has applied the file, so no ledger names it.
 *   - **After merge, renumbering is the DEFECT.** Wrangler records an applied
 *     migration by its COMPLETE FILENAME in `d1_migrations` and applies whatever
 *     is not in that table. Renaming an identical file therefore makes it
 *     unapplied: `0039_add_owner_color_scheme_preference.sql` renamed to `0040_…`
 *     re-runs its `ALTER TABLE`, fails with `duplicate column name: color_scheme`,
 *     and takes every later migration down with it — on every database that
 *     applied the parent commit, which is every developer's, every CI shard's and
 *     potentially production's.
 *
 * So the moment a colliding pair reaches `main`, the collision is a fact about
 * the ledger and the only safe action is to record it. That is what
 * {@link GRANDFATHERED_COLLISIONS} is for, and why it is keyed by exact filename
 * rather than by number.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "migrations");

/**
 * The collisions that reached `main` and can therefore never be renumbered,
 * grandfathered by EXACT filename.
 *
 * This list is not a policy — it is a record of specific files whose names are
 * already written into `d1_migrations` tables that exist. Each pair is here
 * because renaming either half would re-run it.
 *
 *   - **`0013`** — authored in parallel (#65 and #66), both applied in
 *     production. Independent slices, so the alphabetical order Wrangler gives
 *     them (`area_details` then `person_details`) is deterministic and harmless.
 *   - **`0039`** — CAPTURE-01 (#161) and THEME-01 (#162), merged 27 minutes
 *     apart on 2026-08-11, both on `main` at `b806246`. Also independent: one
 *     `ALTER`s `owner_app_preferences`, the other `CREATE`s two new tables, and
 *     `add_owner_color_scheme_preference` sorts before `create_capture_credentials`
 *     deterministically. HARDEN-02 renumbered the second one and had to put it
 *     back — see the header above for what that broke.
 */
const GRANDFATHERED_COLLISIONS: readonly ReadonlySet<string>[] = [
  new Set(["0013_create_area_details.sql", "0013_create_person_details.sql"]),
  new Set([
    "0039_add_owner_color_scheme_preference.sql",
    "0039_create_capture_credentials.sql",
  ]),
];

/**
 * DEBT-40's OTHER half — the ambiguity of "which migration is `0013`?".
 *
 * The check above closes the "latent later" half: a NEW collision fails the
 * build. It cannot close the half that made this entry a P3 rather than a note,
 * which is that every document citing a colliding number by number alone is
 * unresolvable. `(migration 0013)` in an ADR could mean `area_details` or
 * `person_details`, and a reader has no way to tell.
 *
 * So the convention is: a COLLIDING number is cited by filename, everywhere.
 * Non-colliding numbers are unambiguous and stay as they are — this is not a
 * rule that every migration reference must be a filename, which would be noise.
 *
 * Prose ABOUT the collisions is exempt by necessity: the register, the roadmaps
 * and the audits that record "0013 and 0039 are each used twice" have to name
 * the numbers. They are recognised by naming BOTH colliding numbers, or by
 * saying "collision"/"duplicate"/"grandfathered" on the same line — a document
 * discussing the problem, rather than one citing a migration and getting it
 * wrong.
 */
const COLLIDING_NUMBERS = ["0013", "0039"];

/** Every `.md` under `docs/`, plus the repository's own root documents. */
function documentationFiles(root: string, out: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) {
      documentationFiles(full, out);
      continue;
    }
    if (full.endsWith(".md")) out.push(full);
  }
  return out;
}

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
          // Only a recorded pair, and only as a PAIR, is excused: a third file
          // sharing either number still fails.
          !GRANDFATHERED_COLLISIONS.some(
            (recorded) =>
              files.length === recorded.size &&
              files.every((file) => recorded.has(file)),
          ),
      )
      .map(([number, files]) => `${number}: ${files.join(", ")}`);

    expect(
      collisions,
      "A new migration claimed a number that is already taken. Claim the next free " +
        "number at PR-open time, and renumber BEFORE MERGE if another PR took it. " +
        "If the pair has already reached `main`, do NOT renumber: Wrangler keys " +
        "`d1_migrations` on the complete filename, so renaming an applied file " +
        "re-runs it and blocks every migration after it. Record it in " +
        "GRANDFATHERED_COLLISIONS instead.",
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

  /*
   * DEBT-40 — the citation half. See COLLIDING_NUMBERS above for the rule and
   * for why prose about the collisions is exempt.
   */
  it("cites a COLLIDING migration number by filename, never by number alone", () => {
    const offenders: string[] = [];
    for (const file of documentationFiles(path.join(process.cwd(), "docs"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        // Only a CITATION is in scope — a line that names a migration. Prose
        // that mentions a number for another reason is not this rule's
        // business.
        if (!/migrations?/i.test(line)) return;
        // A line ABOUT the collisions has to name the numbers. Recognised by
        // the words such a line actually uses, not by an exempt-file list.
        if (
          /collision|collidin|duplicate|grandfather|both claimed|share the number|DEBT-40/i.test(
            line,
          )
        ) {
          return;
        }
        for (const number of COLLIDING_NUMBERS) {
          if (!new RegExp("`" + number + "`").test(line)) continue;
          // The filename is present somewhere on the line — as a link target,
          // or spelled out — so the citation resolves. That is the convention
          // met, not evaded.
          if (line.includes(`${number}_`)) continue;
          offenders.push(
            `${path.relative(process.cwd(), file)}:${index + 1} cites \`${number}\``,
          );
        }
      });
    }
    expect(
      offenders,
      "a migration number used TWICE cannot identify a migration, so it must " +
        "be cited by filename or linked to one (DEBT-40):\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
