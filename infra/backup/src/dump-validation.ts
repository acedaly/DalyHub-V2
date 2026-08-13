/**
 * BACKUP-01 — structural validation of a D1 SQL dump, inside the Worker.
 *
 * ── Why validate at all ───────────────────────────────────────────────────────
 * "The Workflow completed" is not the same claim as "there is a usable backup".
 * A backup pipeline that cheerfully stores a truncated or schema-less dump every
 * night is worse than no pipeline, because it manufactures confidence. The whole
 * point of BACKUP-01's validation step is that the run FAILS on a bad dump
 * rather than reporting success over one.
 *
 * ── Relationship to scripts/production-backup.mjs ─────────────────────────────
 * The GitHub Actions backup (AUDIT-11) validates its dump with the same rules,
 * in `scripts/production-backup.mjs`. That file is Node ESM built on `node:fs`
 * and cannot be imported into a Worker, so the rules are restated here — but
 * they are NOT allowed to drift: `test/unit/backup/dump-validation.test.ts`
 * imports `REQUIRED_DUMP_TABLES` from the Node script and asserts the two lists
 * are identical. If someone adds a kernel table to one, the test fails until it
 * is added to the other.
 *
 * ── What it deliberately is not ───────────────────────────────────────────────
 * Not a SQL parser. It answers the three questions a nightly job actually needs
 * answered — did an export happen, did it carry the schema, and did it finish —
 * and leaves everything deeper to the restore, where `wrangler d1 execute` will
 * reject malformed SQL itself.
 *
 * PURE: takes text, returns problems. No I/O, no logging, no Workers API.
 */

/**
 * Tables whose presence proves the dump carries the real schema rather than a
 * partial or failed export.
 *
 * Deliberately the KERNEL tables plus the most sensitive module tables: if these
 * are absent, whatever was exported is not a DalyHub database and must not be
 * stored as one. Kept byte-identical to `REQUIRED_DUMP_TABLES` in
 * `scripts/production-backup.mjs` (asserted by test).
 */
export const REQUIRED_DUMP_TABLES = [
  "entities",
  "workspaces",
  "entity_links",
  "activities",
  "activity_subjects",
  "spine_records",
  "task_details",
  "note_details",
  "diary_entry_details",
  "person_details",
  "meeting_details",
  "review_details",
] as const;

/**
 * Structurally validate a D1 SQL dump.
 *
 * @returns a list of human-readable problems. Empty means the dump passed.
 *   Messages name rules, tables and counts — never dump CONTENT, because these
 *   strings end up in Workflow logs and the dump is the owner's private life.
 */
export function validateDumpText(text: string): string[] {
  const problems: string[] = [];

  if (text.trim().length === 0) {
    // Return early: every other rule would report a redundant failure, and one
    // clear cause is more useful than twelve consequences.
    return ["the dump is empty"];
  }

  for (const table of REQUIRED_DUMP_TABLES) {
    // D1 quotes identifiers inconsistently across versions, so match either an
    // unquoted name or one wrapped in ", ` or [ ].
    const pattern = new RegExp(
      `CREATE TABLE\\s+(IF NOT EXISTS\\s+)?["\`\\[]?${table}["\`\\]]?[\\s(]`,
      "i",
    );
    if (!pattern.test(text)) {
      problems.push(`the dump has no CREATE TABLE for "${table}"`);
    }
  }

  // A dump cut off mid-statement is the failure mode that looks fine until the
  // day it is needed: it is large, it is plausible, and it will not import. The
  // last meaningful line must end a statement.
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));
  const last = lines[lines.length - 1] ?? "";
  if (!last.endsWith(";")) {
    problems.push("the dump does not end with a complete SQL statement");
  }

  return problems;
}

/**
 * A cheap first look at bytes that claim to be a SQL dump, used before the full
 * text validation so an obviously-wrong download (an HTML error page, a JSON
 * error body, a gzip stream) fails with an accurate message instead of twelve
 * "no CREATE TABLE for …" lines.
 */
export function looksLikeSqlDump(text: string): boolean {
  const head = text.slice(0, 4096);
  return /CREATE TABLE|PRAGMA|BEGIN TRANSACTION|INSERT INTO/i.test(head);
}
