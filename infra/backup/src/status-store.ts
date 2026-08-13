/**
 * BACKUP-02 — reading and writing backup run state in R2.
 *
 * ── Two representations, on purpose ──────────────────────────────────────────
 *
 *   status/runs/<stamp>-<id>.json   one durable file per run — the audit trail
 *   status/latest.json              a rolling log of the last 30 runs
 *
 * The rolling log exists so answering "are my backups working?" costs ONE R2 GET
 * rather than a list plus thirty gets. The per-run files exist because the log is
 * capped and lossy by design, and a backup system should keep its own history
 * beyond what one screen displays. Neither is derived from the other at read
 * time, so a corrupt log cannot destroy the audit trail.
 *
 * ── The log is read-modify-write, and that is acceptable here ────────────────
 * Two runs writing the log concurrently could lose one entry. That is tolerated
 * deliberately: backups run once a night plus the occasional manual trigger, the
 * trigger endpoint refuses to start a second run while one is in flight, the
 * per-run file is always written first and is never lost, and the next run
 * rewrites the log anyway. Locking a nightly backup behind a coordination
 * primitive would add a failure mode strictly worse than the one it removes.
 *
 * ── Nothing here reads a dump ────────────────────────────────────────────────
 * Every function in this file touches `status/` keys or object METADATA only. No
 * function returns object bodies, and `countRetainedBackups` deliberately uses
 * `list()` rather than `get()` so the byte content of a backup is never loaded to
 * count it.
 */

import {
  RUN_LOG_KEY,
  RUN_LOG_LIMIT,
  parseRunRecord,
  runRecordKey,
  sortRunsNewestFirst,
  upsertRun,
  type BackupRunRecord,
} from "./run-records";
import { BACKUP_PREFIX } from "./object-key";

/** R2 `list()` returns at most 1000 keys per page. */
const LIST_PAGE_LIMIT = 1000;

/**
 * How many list pages `countRetainedBackups` will walk.
 *
 * Ninety daily plus a year of manual backups is a few hundred objects, so one
 * page is the realistic case and five is a generous ceiling. It is bounded rather
 * than unbounded because a status endpoint must not be able to turn into a
 * thousand-request scan of a bucket, and an approximate count reported as
 * approximate is better than a page that never loads.
 */
const MAX_COUNT_PAGES = 5;

/** Read the rolling run log. Returns `null` when it cannot be read at all. */
export async function readRunLog(
  bucket: R2Bucket,
): Promise<BackupRunRecord[] | null> {
  let object: R2ObjectBody | null;
  try {
    object = await bucket.get(RUN_LOG_KEY);
  } catch {
    // Distinguish "storage is unreachable" from "there is no log yet": the first
    // must surface as `unknown`, the second as "no backups yet".
    return null;
  }
  if (object === null) return [];

  let parsed: unknown;
  try {
    parsed = await object.json();
  } catch {
    return null;
  }
  const runs = Array.isArray((parsed as { runs?: unknown })?.runs)
    ? (parsed as { runs: unknown[] }).runs
    : null;
  if (runs === null) return null;

  // Individually validated: one malformed entry is dropped rather than
  // invalidating the whole log.
  const records = runs
    .map((entry) => parseRunRecord(entry))
    .filter((entry): entry is BackupRunRecord => entry !== null);
  return sortRunsNewestFirst(records);
}

/**
 * Record a run: the durable per-run file first, then the rolling log.
 *
 * Ordered that way on purpose. The per-run file is the audit trail and must
 * survive even if the log write fails, so it is written first and its failure is
 * the one that propagates.
 */
export async function recordRun(
  bucket: R2Bucket,
  record: BackupRunRecord,
): Promise<void> {
  const body = `${JSON.stringify(record, null, 2)}\n`;
  await bucket.put(runRecordKey(record), body, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      runId: record.id,
      status: record.status,
      trigger: record.trigger,
    },
  });

  const existing = (await readRunLog(bucket)) ?? [];
  const log = upsertRun(existing, record, RUN_LOG_LIMIT);
  await bucket.put(RUN_LOG_KEY, `${JSON.stringify({ runs: log }, null, 2)}\n`, {
    httpMetadata: { contentType: "application/json" },
  });
}

/**
 * Count the backups currently retained under the two dump prefixes.
 *
 * Metadata only — `list()` never loads an object body. Returns the count and
 * whether it was truncated by {@link MAX_COUNT_PAGES}, so a caller can say
 * "at least N" rather than presenting a bounded scan as exact.
 */
export async function countRetainedBackups(
  bucket: R2Bucket,
): Promise<{ count: number; exact: boolean }> {
  let count = 0;
  let exact = true;

  for (const prefix of Object.values(BACKUP_PREFIX)) {
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const listed = await bucket.list({
        prefix,
        limit: LIST_PAGE_LIMIT,
        cursor,
      });
      count += listed.objects.length;
      pages += 1;
      if (!listed.truncated) break;
      if (pages >= MAX_COUNT_PAGES) {
        exact = false;
        break;
      }
      cursor = listed.cursor;
    }
  }

  return { count, exact };
}
