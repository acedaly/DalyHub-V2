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
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
 *
 * The foreign-key entry has a cost worth stating: a cleanup sequence that is
 * simply WRONG — one that deletes an entity while a `RESTRICT` child of it still
 * exists — fails identically, and is retried five times before it reports. It
 * still fails, and loudly, but the message names contention rather than the
 * missing statement. If a teardown fails here, check the ORDER of the statements
 * before assuming the database was busy.
 *
 * `database is locked` is the SAME condition seen through a different messenger.
 * Wrangler surfaces SQLite's busy result as the symbolic `SQLITE_BUSY`;
 * `node:sqlite` — which `d1Query` now uses — reports it by SQLite's own message
 * text instead. Matching only the symbol would have left the read path with a
 * retry loop that never fired, which is worse than no retry loop because it
 * looks like one.
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
    "pnpm",
    [
      "exec",
      "wrangler",
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
 * Where miniflare keeps the local D1, for the READ path below.
 *
 * The file is named by a content hash, so it is discovered rather than spelled:
 * the directory holds exactly one `*.sqlite` that is not miniflare's own
 * `metadata.sqlite`. Resolved once and cached — the path does not move inside a
 * run, and the gate deletes and recreates the whole directory between runs.
 */
const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

let databaseFile: string | null = null;

function localDatabaseFile(): string {
  if (databaseFile !== null) return databaseFile;
  const candidates = readdirSync(D1_DIR).filter(
    (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
  );
  if (candidates.length !== 1) {
    throw new Error(
      `d1: expected exactly one database in ${D1_DIR}, found ${candidates.length}` +
        ` (${candidates.join(", ") || "none"}). Has the local D1 been created?`,
    );
  }
  databaseFile = join(D1_DIR, candidates[0] as string);
  return databaseFile;
}

/**
 * Run one SELECT and return its rows.
 *
 * The read half of the same helper, with the same retry rule, added by PWA-12
 * because a recurrence assertion has to be able to COUNT what the domain wrote
 * — "exactly one successor" is not observable from the interface alone once the
 * completed occurrence leaves the default view.
 *
 * ── This does NOT spawn wrangler, and the reason is a measurement ────────────
 *
 * `wrangler d1 execute --local` costs **3.1 seconds of process startup** before
 * it reads a byte (MEASURED, 14 September 2026, this sandbox). That is not a
 * detail: `assisted-ai.spec.ts`'s "applies, replays as unchanged, refuses stale,
 * and undoes exactly" makes EIGHT fixture reads, so roughly twenty-five seconds
 * of its thirty-second budget was wrangler booting — which is why it passed
 * alone and timed out under load, and why three passes looking for contention in
 * the PRODUCT found nothing. The queue page it drives loads in 1.9s, faster than
 * `/tasks`; there was never anything wrong with it.
 *
 * Reading the SQLite file directly costs **8ms** for the same query — the same
 * bytes, through the same file miniflare writes. `readOnly` is the whole safety
 * argument: this connection cannot write, so it cannot corrupt the database the
 * dev server owns, and it sees committed data through the WAL exactly as a
 * second wrangler process would.
 *
 * WRITES deliberately stay on wrangler (`d1Execute`, `d1ExecuteFile`). The win
 * is concentrated in reads, and a second writing process against a file the
 * server also writes is a risk worth no amount of wall clock.
 *
 * The retry loop still wraps it, because the contention this module exists for
 * — SQLite serialising against the dev server's writer — is a property of the
 * file, not of wrangler.
 */
export function d1Query<T = Record<string, unknown>>(
  command: string,
): readonly T[] {
  return withRetries(() => {
    const db = new DatabaseSync(localDatabaseFile(), { readOnly: true });
    try {
      return db.prepare(command).all() as unknown as readonly T[];
    } finally {
      db.close();
    }
  });
}
