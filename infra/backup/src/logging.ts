/**
 * BACKUP-01 — structured, deliberately incurious logging.
 *
 * Workflow logs are the only view an operator has of a backup that ran at 02:00
 * while they were asleep, so they need to carry enough to diagnose a failing
 * stage. They are also written to Cloudflare's observability store, so what goes
 * in them is a security decision, not a formatting one.
 *
 * The rule is an ALLOW-LIST, enforced by the shape of `BackupLogFields`: a log
 * line may carry stage names, the database NAME, the trigger, the bookmark, the
 * object key, byte counts and durations. It may not carry the API token, the
 * signed download URL, any part of the dump, or any row of the owner's data.
 * `test/unit/backup/no-secret-leakage.test.ts` drives the whole Workflow and
 * asserts that no token or signed URL ever reaches a log line or an error
 * message, so this stays true under editing rather than by good intentions.
 *
 * The export bookmark is included on purpose: it is an opaque D1 position
 * marker, it is what makes a stored backup traceable to the export that
 * produced it, and it grants nothing to anyone who reads it.
 */

/** The fields a backup log line is permitted to carry. */
export interface BackupLogFields {
  /** The pipeline stage, e.g. "initiate-export". */
  stage?: string;
  /** The D1 database NAME (never a connection string or credential). */
  database?: string;
  /** The D1 database UUID — an identifier, not a secret. */
  databaseId?: string;
  /** "daily" or "manual". */
  trigger?: string;
  /** The D1 export bookmark. Opaque position marker; grants nothing. */
  bookmark?: string;
  /** The R2 object key. */
  key?: string;
  /** Object or dump size in bytes. */
  bytes?: number;
  /** Cloudflare's own generated export filename. */
  sourceFilename?: string;
  /** The Workflow instance id. */
  instanceId?: string;
  /** How many times the export was polled before it was ready. */
  polls?: number;
  /** Retention tier in days, as configured by the R2 lifecycle rule. */
  retentionDays?: number;
  /** A human-readable reason, for failures. Never carries dump content. */
  reason?: string;
}

type Level = "info" | "error";

function emit(level: Level, event: string, fields: BackupLogFields): void {
  // One JSON object per line: greppable in `wrangler tail`, and structured for
  // Workers Logs without needing a parser that understands prose.
  const line = JSON.stringify({ backup: event, level, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export function logInfo(event: string, fields: BackupLogFields = {}): void {
  emit("info", event, fields);
}

export function logError(event: string, fields: BackupLogFields = {}): void {
  emit("error", event, fields);
}
