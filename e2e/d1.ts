/**
 * The ONE way an E2E fixture talks to the local D1.
 *
 * Fifteen specs spawned `pnpm exec wrangler d1 execute` from their own private
 * helper and ten of those helpers carried their own copy of a `SQLITE_BUSY`
 * retry loop — so five did not, and whether a fixture survived contention was
 * decided by which file it happened to live in. The 9 August 2026 E2E audit
 * found `ai-assistance.spec.ts` failing on exactly that: a teardown `DELETE`
 * lost a race with the dev server's own write and the whole journey was reported
 * red, for a reason that had nothing to do with the product.
 *
 * ── Why contention happens at all ────────────────────────────────────────────
 * The suite drives ONE dev server against ONE local SQLite file while these
 * helpers open it a second time from a separate process. SQLite serialises
 * writers, so a fixture statement issued while the server is mid-write gets
 * `SQLITE_BUSY` — and a foreign-key failure can appear the same way when a late
 * autosave lands between two statements of an ordered cleanup. Both are
 * TRANSIENT: the next attempt sees a settled database.
 *
 * ── Why retrying is safe ─────────────────────────────────────────────────────
 * Every caller is a fixture statement — a `DELETE`, an `INSERT OR IGNORE`, or an
 * `UPDATE` to a fixed value — so re-running the whole command is idempotent. A
 * caller whose SQL is not idempotent must not use this helper.
 *
 * A genuine, non-transient error is NEVER swallowed: it is rethrown on the first
 * attempt, so a real fixture defect still fails loudly and immediately.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** How many times a transient failure is re-attempted before it is a failure. */
const ATTEMPTS = 5;

/**
 * Wrangler's own entry script, run directly by THIS Node process rather than
 * through `pnpm exec`.
 *
 * ── Why, and what it is worth ───────────────────────────────────────────────
 *
 * `pnpm exec wrangler …` spawns pnpm, which resolves the workspace and the bin
 * link and then spawns Node, which then loads wrangler. Only the last of those
 * does any work. MEASURED locally against the same statement, four runs each:
 *
 *     pnpm exec wrangler …                       median 2303 ms
 *     node <wrangler entry> …                    median 1842 ms
 *
 * — about 460 ms of pure process plumbing, on every fixture statement in the
 * suite. There are 114 `d1Execute`, 51 `d1Query` and 4 `d1ExecuteFile` call
 * sites and most sit in a `beforeEach`, so the suite pays it far more often than
 * that count suggests.
 *
 * It changes nothing else: the same wrangler, the same arguments, the same
 * environment, the same exit codes and the same stdout. What it does NOT address
 * is the ~1.8 s wrangler itself costs to boot, which is the larger half and is
 * discussed on {@link d1Query}.
 *
 * ── Resolution ──────────────────────────────────────────────────────────────
 *
 * Through `wrangler/package.json` and its `bin` field, not through a hardcoded
 * path: pnpm's store puts the real file under a versioned directory
 * (`node_modules/.pnpm/wrangler@x.y.z/…`) that changes with every upgrade, and
 * `wrangler/bin/wrangler.js` is not reachable by `require.resolve` because the
 * package's `exports` map does not name it.
 */
const WRANGLER_ENTRY = (() => {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve("wrangler/package.json");
    const packageJson = require("wrangler/package.json") as {
      bin: string | Record<string, string>;
    };
    const bin =
      typeof packageJson.bin === "string"
        ? packageJson.bin
        : packageJson.bin.wrangler;
    return join(dirname(packageJsonPath), bin);
  } catch (error) {
    /*
     * This runs at MODULE LOAD, so a failure here is "the spec file will not
     * load" rather than "one fixture statement failed" — and the default message
     * for that says nothing about wrangler. Resolution depends on `wrangler`
     * exposing `./package.json` in its `exports` map, which it does today and a
     * major upgrade could change, so the message names the fix.
     */
    throw new Error(
      "e2e/d1.ts could not resolve wrangler's entry script through " +
        "`wrangler/package.json`. If a wrangler upgrade stopped exporting it, " +
        "point WRANGLER_ENTRY at `node_modules/.bin/wrangler` instead — every " +
        "fixture statement in the suite runs through it.",
      { cause: error },
    );
  }
})();

/** SQL-escape a string for use as a single-quoted literal in a D1 command. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The two failures that mean "try again", and nothing else.
 *
 * `SQLITE_BUSY` is the writer lock. The foreign-key case is the ordered-cleanup
 * race described above — a child row written after its parent was selected for
 * deletion — which the next pass sweeps.
 *
 * The foreign-key entry has a cost worth stating: a cleanup sequence that is
 * simply WRONG — one that deletes an entity while a `RESTRICT` child of it still
 * exists — fails identically, and is retried five times before it reports. It
 * still fails, and loudly, but the message names contention rather than the
 * missing statement. If a teardown fails here, check the ORDER of the statements
 * before assuming the database was busy.
 *
 * `database is locked` is SQLite's own wording for the same condition wrangler
 * reports as the symbolic `SQLITE_BUSY`. Both are matched: the symbol is what
 * the CLI prints, the sentence is what the engine says, and a matcher that knows
 * only one of them is a retry loop that sometimes does not fire.
 */
function isTransientD1Error(output: string): boolean {
  return (
    output.includes("SQLITE_BUSY") ||
    output.includes("database is locked") ||
    output.includes("FOREIGN KEY constraint failed")
  );
}

function runOnce(
  source: { readonly command: string } | { readonly file: string },
  json = false,
): string {
  const input =
    "command" in source
      ? ["--command", source.command]
      : ["--file", source.file];
  return execFileSync(
    process.execPath,
    [
      WRANGLER_ENTRY,
      "d1",
      "execute",
      "DB",
      "--local",
      ...(json ? ["--json"] : []),
      ...input,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
      encoding: "utf8",
    },
  );
}

/** The retry loop itself, shared by every entry point below. */
function withRetries<T>(run: () => T): T {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return run();
    } catch (error) {
      const err = error as {
        message?: string;
        stdout?: unknown;
        stderr?: unknown;
      };
      const output = [err.message, err.stdout, err.stderr]
        .map((part) => String(part ?? ""))
        .join("\n");
      if (attempt === ATTEMPTS || !isTransientD1Error(output)) throw error;
    }
  }
  // Unreachable: the loop either returns or throws on its final attempt.
  throw new Error("d1: exhausted attempts without returning");
}

/**
 * Execute one or more SQL statements against the local D1, retrying only a
 * transient failure.
 *
 * Pass an ARRAY when the statements are an ordered sequence: they go to a single
 * `wrangler` invocation, which both removes several process spawns from the
 * suite's wall clock and shrinks the window in which the server can interleave a
 * write between them.
 */
export function d1Execute(command: string | readonly string[]): void {
  const sql = Array.isArray(command)
    ? (command as readonly string[]).join("\n")
    : (command as string);

  withRetries(() => runOnce({ command: sql }));
}

/**
 * Apply a whole `.sql` FILE, with the same retry rule.
 *
 * V2.3-GATE-01 — added because five specs could not use this module and had
 * therefore each grown a private `execFileSync` with no retry at all, which is
 * exactly the "whether a fixture survived contention was decided by which file
 * it happened to live in" this module was written to end. The largest fixtures
 * (the Review evidence week, the mobile Projects cleanup) are files rather than
 * commands, so a command-only helper could never have covered them.
 *
 * Same idempotency requirement as `d1Execute`: the file is re-run WHOLE on a
 * transient failure, so it must be safe to apply twice (`INSERT OR IGNORE` plus
 * `UPDATE`, which is how the seeds in this directory are written).
 */
export function d1ExecuteFile(path: string): void {
  withRetries(() => runOnce({ file: path }));
}

/**
 * Run one SELECT and return its rows.
 *
 * The read half of the same helper, with the same retry rule, added by PWA-12
 * because a recurrence assertion has to be able to COUNT what the domain wrote
 * — "exactly one successor" is not observable from the interface alone once the
 * completed occurrence leaves the default view.
 *
 * `--json` is what makes this parseable; without it wrangler prints a table
 * whose formatting is not a contract. A caller whose SQL is not a pure read must
 * use `d1Execute` instead.
 *
 * ── This spawns wrangler, and that is now a DELIBERATE choice ────────────────
 *
 * It costs **3.1 seconds of process startup before it reads a byte** (MEASURED,
 * 14 September 2026), which is a real and large cost: `assisted-ai.spec.ts`'s
 * heaviest journey makes eight fixture reads, so roughly twenty-five seconds of
 * its thirty-second budget is wrangler booting. That is the actual cause of the
 * timeout three passes attributed to contention over the Finance queue — the
 * queue is cursor-paginated at 50 rows and loads in 1.9s, faster than `/tasks`.
 *
 * Reading the SQLite file directly with `node:sqlite` costs **8ms** for the same
 * query, and this helper did exactly that until CI proved it unsafe:
 *
 *     Error: no obligation created        (assisted-ai.spec.ts:475)
 *
 * The obligation HAD been created, through the real form, moments earlier. The
 * dev server holds the database in WAL mode, and a `readOnly` connection cannot
 * maintain the WAL index (`-shm`) it needs in order to see frames another
 * process has committed — so the read silently returned a stale snapshot.
 *
 * The reason that is disqualifying rather than merely annoying: **a reader that
 * can miss committed rows can make an assertion PASS that should fail.** Every
 * `toHaveLength(0)` after a delete, and every "replays without a second" that
 * counts one row where two exist, becomes a false green. Sixteen files use this
 * helper — 11 spec files and 5 shared fixtures — to check invariants the
 * interface cannot show. Slow and correct
 * beats fast and occasionally blind.
 *
 * The safe way to spend the 3.1s remains open and is not this: issue FEWER
 * statements per invocation. `spendingCategory()` and `secondSpendingCategory()`
 * in `assisted-ai.spec.ts` run the identical query twice, in two processes, to
 * take row 0 and row 1 of the same result.
 */
export function d1Query<T = Record<string, unknown>>(
  command: string,
): readonly T[] {
  return withRetries(() => {
    const output = runOnce({ command }, true);
    // Wrangler prefixes its JSON with human-readable lines; the payload is the
    // first well-formed array in the output.
    const start = output.indexOf("[");
    if (start === -1) return [] as readonly T[];
    const parsed = JSON.parse(output.slice(start)) as {
      results?: T[];
    }[];
    return (parsed[0]?.results ?? []) as readonly T[];
  });
}
