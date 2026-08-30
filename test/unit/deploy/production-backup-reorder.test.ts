/**
 * DEBT-199 — the dump reordering that makes a D1 backup RESTORABLE.
 *
 * ── What this suite is defending ─────────────────────────────────────────────
 * A raw `wrangler d1 export` of DalyHub cannot be restored by
 * `wrangler d1 execute --file`. MEASURED twice: against the local Miniflare
 * executor (2026-08-22) and against Cloudflare's remote D1 import endpoint
 * (2026-08-30, with a real production artefact restored into a throwaway
 * database). Both fail identically with
 *
 *     foreign key mismatch - "entity_links" referencing "entities"
 *
 * because the export emits `CREATE UNIQUE INDEX entities_workspace_id_key` some
 * three thousand lines AFTER the first row that needs it, and `foreign key
 * mismatch` is a schema error that `PRAGMA defer_foreign_keys` does not defer.
 *
 * `production-backup.mjs reorder` moves every index ahead of the data. The risk
 * that carries is the point of most of this file: a transformation applied to
 * the owner's entire database on the worst day of their year must be a
 * PERMUTATION and provably nothing else. The invariants are asserted here as
 * tests rather than trusted as a docstring — they are the checks the 2026-08-30
 * recovery rehearsal ran by hand, promoted so they cannot silently stop holding.
 *
 * ── Why this drives the CLI instead of importing the function ────────────────
 * The same reason `production-backup-encryption.test.ts` gives for `validate`:
 * *"driven through the CLI rather than by importing"*. `scripts/
 * production-backup.mjs` is deliberately outside the TypeScript project (it is
 * not in `tsconfig.cloudflare.json`'s script allow-list), and importing it would
 * drag the whole file in for a test's convenience.
 *
 * It also makes the proofs STRONGER. This file splits statements with its own
 * small parser rather than the script's, so the assertions check the
 * implementation instead of agreeing with it — a bug in the script's splitter
 * cannot hide by being used to verify its own output.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "production-backup.mjs");

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The defect, in the smallest form that reproduces it.
 *
 * `entities` has a single-column PRIMARY KEY, so `(workspace_id, id)` is unique
 * only because of the index at the BOTTOM of the file, while `entity_links`
 * carries a composite foreign key referencing it. That is the real production
 * shape reduced to a handful of tables — a fixture rather than a copy of a dump,
 * precisely so this test can never contain anybody's data.
 *
 * `d1_migrations` is here because it is the AUTOINCREMENT table: without one,
 * SQLite never creates `sqlite_sequence`, and the `DELETE FROM sqlite_sequence`
 * / `INSERT INTO sqlite_sequence` pair a real D1 export always emits would have
 * nothing to act on.
 */
const RAW_DUMP = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);
INSERT INTO "d1_migrations" ("id","name") VALUES(1,'0001_init.sql');
CREATE TABLE workspaces (
  id TEXT NOT NULL PRIMARY KEY
);
INSERT INTO "workspaces" ("id") VALUES('ws-1');
CREATE TABLE IF NOT EXISTS "entities" (
  id           TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE RESTRICT
) STRICT;
INSERT INTO "entities" ("id","workspace_id") VALUES('e-1','ws-1');
INSERT INTO "entities" ("id","workspace_id") VALUES('e-2','ws-1');
CREATE TABLE entity_links (
  id               TEXT NOT NULL PRIMARY KEY,
  workspace_id     TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  CONSTRAINT entity_links_source_fk
    FOREIGN KEY (workspace_id, source_entity_id)
    REFERENCES entities (workspace_id, id) ON DELETE RESTRICT
) STRICT;
INSERT INTO "entity_links" ("id","workspace_id","source_entity_id","target_entity_id") VALUES('l-1','ws-1','e-1','e-2');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',51);
CREATE INDEX entities_workspace_created_idx
  ON entities (workspace_id, id);
CREATE UNIQUE INDEX entities_workspace_id_key ON entities (workspace_id, id);
`;

let scratch: string;

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "dalyhub-reorder-test-"));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* Helpers — this file's OWN parser, deliberately not the script's            */
/* -------------------------------------------------------------------------- */

/** Run the real CLI, exactly as the recovery documentation tells an operator to. */
function reorderViaCli(
  input: string,
  name: string,
): { status: number; stderr: string; out: string | null; outPath: string } {
  const inPath = join(scratch, `${name}.sql`);
  const outPath = join(scratch, `${name}-restorable.sql`);
  writeFileSync(inPath, input);
  const result = spawnSync(
    process.execPath,
    [SCRIPT, "reorder", "--in", inPath, "--out", outPath],
    { encoding: "utf8" },
  );
  return {
    status: result.status ?? 1,
    stderr: `${result.stderr ?? ""}${result.stdout ?? ""}`,
    out: existsSync(outPath) ? readFileSync(outPath, "utf8") : null,
    outPath,
  };
}

/** Reorder and insist it succeeded, for the many tests that assume it did. */
function reordered(input: string, name: string): string {
  const result = reorderViaCli(input, name);
  expect(result.status, `reorder failed: ${result.stderr}`).toBe(0);
  expect(result.out).not.toBeNull();
  return result.out as string;
}

/**
 * Split into statements. Independent of the script's own splitter on purpose —
 * see the header. A statement runs to the first line ending in `;`.
 */
function statementsOf(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (current === null) {
      current = [];
      out.push(current);
    }
    current.push(line);
    if (line.trimEnd().endsWith(";")) current = null;
  }
  return out.map((s) => s.join("\n"));
}

const sortedDigest = (values: string[]) =>
  createHash("sha256").update(values.slice().sort().join(" ")).digest("hex");

const isTable = (s: string) => /^CREATE\s+TABLE\b/i.test(s.trimStart());
const isIndex = (s: string) =>
  /^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s.trimStart());
const isData = (s: string) =>
  /^(INSERT|DELETE|UPDATE|REPLACE)\b/i.test(s.trimStart());
const isPragma = (s: string) => /^PRAGMA\b/i.test(s.trimStart());

const firstIndexWhere = (text: string, p: (s: string) => boolean) =>
  statementsOf(text).findIndex(p);
const lastIndexWhere = (text: string, p: (s: string) => boolean) => {
  const all = statementsOf(text);
  for (let i = all.length - 1; i >= 0; i -= 1) if (p(all[i])) return i;
  return -1;
};

/* -------------------------------------------------------------------------- */
/* The permutation invariants — nothing may be added, removed or altered      */
/* -------------------------------------------------------------------------- */

describe("reorder — it is a permutation and nothing else", () => {
  it("keeps the statement count unchanged", () => {
    const out = reordered(RAW_DUMP, "count");
    expect(statementsOf(out)).toHaveLength(statementsOf(RAW_DUMP).length);
  });

  it("keeps the byte length unchanged", () => {
    // A permutation of whole statements cannot change the total size; an edit
    // almost certainly would. Cheap, and load-bearing.
    const out = reordered(RAW_DUMP, "bytes");
    expect(Buffer.byteLength(out)).toBe(Buffer.byteLength(RAW_DUMP));
  });

  it("keeps the sorted LINE multiset unchanged", () => {
    // No line was added, removed or edited — only moved.
    const out = reordered(RAW_DUMP, "lines");
    expect(sortedDigest(out.split("\n"))).toBe(
      sortedDigest(RAW_DUMP.split("\n")),
    );
  });

  it("keeps the sorted STATEMENT multiset unchanged", () => {
    // The same claim at statement granularity, which line-sorting alone cannot
    // make: two statements could in principle swap lines between them and still
    // pass the check above.
    const out = reordered(RAW_DUMP, "stmts");
    expect(sortedDigest(statementsOf(out))).toBe(
      sortedDigest(statementsOf(RAW_DUMP)),
    );
  });

  it("accounts for every line of the input in the output", () => {
    const out = reordered(RAW_DUMP, "account");
    const inLines = RAW_DUMP.split("\n");
    const outLines = out.split("\n");
    expect(outLines).toHaveLength(inLines.length);
    // And every statement is whole: re-splitting the output loses nothing.
    expect(statementsOf(out).join("\n").split("\n")).toHaveLength(
      outLines.length - 1, // the trailing "" from the final newline
    );
  });

  it("leaves the input file untouched", () => {
    // The ARTEFACT stays canonical: reordering is a step in the restore, not a
    // change to what was backed up.
    const inPath = join(scratch, "untouched.sql");
    writeFileSync(inPath, RAW_DUMP);
    spawnSync(
      process.execPath,
      [
        SCRIPT,
        "reorder",
        "--in",
        inPath,
        "--out",
        join(scratch, "untouched-out.sql"),
      ],
      { encoding: "utf8" },
    );
    expect(readFileSync(inPath, "utf8")).toBe(RAW_DUMP);
  });
});

/* -------------------------------------------------------------------------- */
/* The ordering contract — what makes the output restorable                   */
/* -------------------------------------------------------------------------- */

describe("reorder — the restorable order", () => {
  it("puts the prologue before any schema", () => {
    const out = reordered(RAW_DUMP, "order-pragma");
    expect(lastIndexWhere(out, isPragma)).toBeLessThan(
      firstIndexWhere(out, isTable),
    );
  });

  it("puts every CREATE TABLE before every CREATE INDEX", () => {
    const out = reordered(RAW_DUMP, "order-table");
    expect(lastIndexWhere(out, isTable)).toBeLessThan(
      firstIndexWhere(out, isIndex),
    );
  });

  it("puts every CREATE INDEX before every data statement", () => {
    // The whole point: a composite foreign key's parent index must exist before
    // the first row that references it.
    const out = reordered(RAW_DUMP, "order-index");
    expect(lastIndexWhere(out, isIndex)).toBeLessThan(
      firstIndexWhere(out, isData),
    );
  });

  it("keeps DELETE FROM sqlite_sequence immediately before its INSERT", () => {
    // Both are DATA and relative order within a class is preserved, so the pair
    // cannot be separated or inverted.
    const out = reordered(RAW_DUMP, "order-seq");
    const all = statementsOf(out);
    const del = all.findIndex((s) => /^DELETE FROM sqlite_sequence/i.test(s));
    const ins = all.findIndex((s) => /^INSERT INTO "sqlite_sequence"/i.test(s));
    expect(del).toBeGreaterThan(-1);
    expect(ins).toBe(del + 1);
  });

  it("preserves relative order within each class", () => {
    // `entities` must still be created before `entity_links`, or the reorder has
    // sorted rather than partitioned.
    const tables = statementsOf(reordered(RAW_DUMP, "order-rel")).filter(
      isTable,
    );
    const names = tables.map(
      (s) => /CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)/i.exec(s)?.[1],
    );
    expect(names).toEqual([
      "d1_migrations",
      "workspaces",
      "entities",
      "entity_links",
    ]);
  });

  it("reports a census on stdout without printing dump contents", () => {
    const result = reorderViaCli(RAW_DUMP, "census");
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/4 CREATE TABLE/);
    expect(result.stderr).toMatch(/2 CREATE INDEX/);
    expect(result.stderr).not.toContain("ws-1");
    expect(result.stderr).not.toContain("0001_init.sql");
  });
});

/* -------------------------------------------------------------------------- */
/* Falsification — it must refuse rather than transform on doubt              */
/* -------------------------------------------------------------------------- */

describe("reorder — falsification", () => {
  it("leaves an already-correct dump unchanged", () => {
    // Idempotence. Reordering a restorable dump must be a no-op, or the command
    // is doing something other than partitioning statements into classes.
    const once = reordered(RAW_DUMP, "idem-1");
    const twice = reordered(once, "idem-2");
    expect(twice).toBe(once);
  });

  it("refuses input it cannot classify, and writes no file", () => {
    // The failure that would matter most: an unrecognised statement is quietly
    // dropped and the restore silently comes back short.
    const result = reorderViaCli(
      RAW_DUMP.replace(
        "DELETE FROM sqlite_sequence;",
        "ANALYZE sqlite_master;",
      ),
      "unknown",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/cannot classify/i);
    expect(result.out).toBeNull();
  });

  it("names only the leading keywords of an unclassifiable statement", () => {
    // A diagnostic must never carry a row of the owner's life. The first version
    // of this reporter sliced by CHARACTERS and would have printed the literal
    // below into a log; this test is why it does not.
    const secret = "jamie.rivers@example.test";
    const result = reorderViaCli(
      `PRAGMA defer_foreign_keys=TRUE;\nANALYZE '${secret}';\n`,
      "secret",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ANALYZE");
    expect(result.stderr).not.toContain(secret);
    expect(result.out).toBeNull();
  });

  it("refuses a dump that ends mid-statement", () => {
    const result = reorderViaCli(RAW_DUMP.replace(/;\n$/, "\n"), "truncated");
    expect(result.status).not.toBe(0);
    expect(result.out).toBeNull();
  });

  it("refuses an empty dump", () => {
    // `--in` is required to be a non-empty file, so a whitespace-only dump is
    // the emptiest thing that reaches the transformation itself.
    const result = reorderViaCli("   \n  \n", "blank");
    expect(result.status).not.toBe(0);
    expect(result.out).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The defect itself, demonstrated against a real SQLite database             */
/* -------------------------------------------------------------------------- */

describe("the composite foreign key ordering defect (DEBT-199)", () => {
  /**
   * Load a dump the way a statement-by-statement executor does: foreign keys
   * ENFORCED, which is how both `wrangler d1 execute --file` and Cloudflare's
   * remote import endpoint behave. `rehearse` deliberately loads with
   * enforcement OFF and checks at the end, which is exactly why it never saw
   * this.
   */
  function load(sql: string): { ok: boolean; message: string } {
    const database = new DatabaseSync(":memory:", {
      enableForeignKeyConstraints: true,
    });
    try {
      database.exec(sql);
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      database.close();
    }
  }

  it("FAILS to restore a raw D1 export, with the measured error", () => {
    const outcome = load(RAW_DUMP);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/foreign key mismatch/i);
  });

  it("SUCCEEDS once the dump is reordered", () => {
    expect(load(reordered(RAW_DUMP, "load-ok")).ok).toBe(true);
  });

  it("restores exactly the rows the raw dump describes", () => {
    // A transformation that made the load succeed by LOSING rows would pass
    // every ordering test above it. This is the one that catches that.
    const database = new DatabaseSync(":memory:", {
      enableForeignKeyConstraints: true,
    });
    try {
      database.exec(reordered(RAW_DUMP, "load-rows"));
      const count = (table: string) =>
        Number(
          (
            database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
              n: number;
            }
          ).n,
        );
      expect(count("workspaces")).toBe(1);
      expect(count("entities")).toBe(2);
      expect(count("entity_links")).toBe(1);
      expect(count("d1_migrations")).toBe(1);
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("restores every index the dump declared", () => {
    const database = new DatabaseSync(":memory:", {
      enableForeignKeyConstraints: true,
    });
    try {
      database.exec(reordered(RAW_DUMP, "load-indexes"));
      const names = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
        )
        .all()
        .map((row) => String((row as { name: string }).name));
      expect(names).toContain("entities_workspace_id_key");
      expect(names).toContain("entities_workspace_created_idx");
    } finally {
      database.close();
    }
  });
});
