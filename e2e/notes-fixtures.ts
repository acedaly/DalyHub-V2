/**
 * NOTES-05 — shared E2E fixtures for the Notes journeys.
 *
 * The Notes specs create real Notes in the seeded Worker/D1 app and must tear
 * them down deterministically afterwards. Two things make that non-trivial and
 * are the reason this lives in ONE reusable helper rather than being copied into
 * each spec:
 *
 *  1. **Foreign-key deletion order.** A Note entity is referenced by
 *     `activity_subjects` (its `entity.created` / `note.content_updated` /
 *     `entity.deleted` events), by `note_details` (its Markdown body) and,
 *     potentially, by `entity_links`. Every one of those is `ON DELETE RESTRICT`
 *     (migrations 0003/0004/0010), so the dependent rows MUST be removed before
 *     the `entities` row, or the delete fails with a FOREIGN KEY constraint.
 *
 *  2. **A race with the live app.** Local D1 is a single SQLite file shared by
 *     the dev-server process and `wrangler d1 execute`. A note's autosave is
 *     debounced (`NOTE_AUTOSAVE_DEBOUNCE_MS`), so a save can still be in flight
 *     when a test ends — it commits a fresh `note.content_updated` activity (and
 *     its `activity_subjects` row) AFTER cleanup has already deleted the note's
 *     earlier subjects but BEFORE it deletes the entity, and the entity delete
 *     then hits the FK constraint. D1 forbids explicit `BEGIN/COMMIT` from the
 *     CLI, so instead of a real transaction we (a) run all four deletes in ONE
 *     `wrangler` invocation, so they execute back-to-back in milliseconds rather
 *     than across four separate ~1s process spawns, shrinking the interleave
 *     window to almost nothing, and (b) retry the whole ordered sequence on a
 *     transient FK failure (or `SQLITE_BUSY`), so the one late autosave is swept
 *     on the next pass. The sequence is idempotent (every statement is a DELETE),
 *     so retrying is always safe.
 *
 * Scope discipline: cleanup only ever matches the test-owned title prefix, so it
 * can never touch a developer's own local Notes. Per-test teardown targets that
 * test's UNIQUE title; the suite-level sweep clears any orphans a previously
 * crashed run left behind under the shared prefix.
 */

import { execFileSync } from "node:child_process";

/** Every E2E-owned Note title starts with this; nothing a developer authors does. */
export const NOTE_TITLE_PREFIX = "Notes e2e note ";

let noteTitleCounter = 0;

/**
 * A per-test-unique Note title. `Date.now()` alone can collide when two tests
 * start within the same millisecond; the monotonic counter guarantees
 * uniqueness within a worker so one test's teardown never deletes another's
 * still-live Note.
 */
export function uniqueNoteTitle(label: string): string {
  noteTitleCounter += 1;
  return `${NOTE_TITLE_PREFIX}${label}-${Date.now()}-${noteTitleCounter}`;
}

/** SQL-escape a string literal for a single-quoted D1 command. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const WORKSPACE_ID = "local-dev-workspace";

/**
 * Build the ordered, single-invocation cleanup SQL for the note entities matched
 * by `entityPredicate` (an additional `AND …` clause on the note selection).
 * Dependent rows first (subjects → orphaned activities → details), entity last.
 */
function cleanupSql(entityPredicate: string): string {
  const noteSelection = `
    SELECT id FROM entities
    WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
      AND type = 'note'
      AND ${entityPredicate}
  `;
  return [
    `DELETE FROM activity_subjects WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN (${noteSelection});`,
    `DELETE FROM activities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM note_details WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN (${noteSelection});`,
    `DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND id IN (${noteSelection});`,
  ].join("\n");
}

/** Retriable local-tooling contention on the shared SQLite file. */
function isTransientD1Error(output: string): boolean {
  return (
    output.includes("SQLITE_BUSY") ||
    // A late autosave can insert a fresh subject row between the ordered deletes;
    // re-running the (idempotent) sequence sweeps it. See the module header.
    output.includes("FOREIGN KEY constraint failed")
  );
}

/**
 * Run one cleanup command as a single `wrangler d1 execute`, retrying the whole
 * (idempotent) sequence on transient contention or a raced FK failure. Never
 * swallows a genuine, non-transient error — it rethrows so a real cleanup defect
 * is not silently ignored.
 */
async function runCleanup(command: string): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
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
      return;
    } catch (error) {
      // execFileSync surfaces the wrangler output on the thrown error's
      // `.stdout`/`.stderr`, NOT in `.message`; inspect all three so the retry
      // predicate actually sees the SQLite error text.
      const err = error as {
        message?: string;
        stdout?: unknown;
        stderr?: unknown;
      };
      const output = [err.message, err.stdout, err.stderr]
        .map((part) => String(part ?? ""))
        .join("\n");
      if (attempt === attempts || !isTransientD1Error(output)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

/**
 * Remove a single test's Note by its UNIQUE title (exact match). Idempotent —
 * safe to call when the Note was never created or was already deleted.
 */
export async function cleanupNoteByTitle(title: string): Promise<void> {
  await runCleanup(cleanupSql(`title = ${sqlLiteral(title)}`));
}

/**
 * Suite-level sweep of any Notes left under the shared E2E prefix by a prior
 * crashed run. Scoped to the prefix, so it can never delete a developer's own
 * local Notes.
 */
export async function cleanupAllNoteFixtures(): Promise<void> {
  await runCleanup(
    cleanupSql(`title LIKE ${sqlLiteral(`${NOTE_TITLE_PREFIX}%`)}`),
  );
}
