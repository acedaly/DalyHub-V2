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

/** How many times a transient failure is re-attempted before it is a failure. */
const ATTEMPTS = 5;

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
 */
function isTransientD1Error(output: string): boolean {
  return (
    output.includes("SQLITE_BUSY") ||
    output.includes("FOREIGN KEY constraint failed")
  );
}

function runOnce(command: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
    },
  );
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

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      runOnce(sql);
      return;
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
}
