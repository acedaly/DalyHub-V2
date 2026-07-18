/**
 * FND-05 Activity — the atomic domain-mutation + Activity-append coordinator.
 *
 * This is the small internal seam that makes "domain write then log" impossible
 * (ADR-012). A domain mutation and its Activity append are executed as ONE
 * `D1Database.batch()` — a single SQL transaction. D1 guarantees the statements
 * run sequentially and, if any statement fails, the ENTIRE sequence is rolled
 * back (verified against the official D1 documentation and proven in the real
 * Workers/D1 integration suite). Therefore:
 *
 *   - the Activity insert failing (e.g. a duplicate event id) rolls back the
 *     domain mutation — no orphaned domain change, no lost audit event;
 *   - a subject insert failing rolls back the domain mutation and the event;
 *   - a no-op or losing-race domain mutation (its conditional statement changed no
 *     row) appends no event, because the append statements are guarded on the
 *     domain statement's `changes()` (see `D1ActivityRecorder`).
 *
 * The domain statement MUST be first and MUST use `RETURNING` so the caller gets
 * the resulting row and an accurate `changes()` for the guard. Raw D1 failures are
 * NOT swallowed here — they propagate so each repository maps them to its own
 * typed storage error (and can detect a UNIQUE-constraint race to reconcile).
 */

import type { ActivityWriteModel } from "~/kernel/activity";

import type { D1ActivityRecorder } from "./d1-activity-recorder";

/**
 * Deterministic, TEST-ONLY failure injection. Inserts a statement guaranteed to
 * fail (a read from a non-existent table) at a chosen point in the batch, so
 * integration tests can prove the domain mutation is rolled back when a later
 * stage fails. Never set in production paths.
 */
export type AtomicMutationFault =
  "after-domain" | "after-activity" | "after-first-subject" | "after-subjects";

/** The outcome of an atomic mutation: whether the domain statement changed a row,
 * and the row it returned (via `RETURNING`), if any. */
export interface AtomicMutationResult<TRow> {
  /** True iff the domain statement changed exactly the row(s) it targeted
   * (`meta.changes > 0`) — i.e. a real state change, not an idempotent no-op. */
  readonly changed: boolean;
  /** The domain statement's `RETURNING` row, or null when it changed nothing. */
  readonly row: TRow | null;
}

export interface RecordAtomicMutationInput {
  readonly db: D1Database;
  readonly workspaceId: string;
  /** The domain mutation — MUST be first and MUST use `RETURNING`. */
  readonly domainStatement: D1PreparedStatement;
  readonly recorder: D1ActivityRecorder;
  readonly model: ActivityWriteModel;
  /** Test-only deterministic failure injection; omit in production. */
  readonly fault?: AtomicMutationFault;
}

/** A statement guaranteed to fail at execution ("no such table"), aborting and
 * rolling back the whole batch. Used only for test failure injection. */
function forcedFailure(db: D1Database): D1PreparedStatement {
  return db.prepare("SELECT 1 FROM __dalyhub_forced_fault__");
}

/**
 * Execute a domain mutation and its Activity append atomically. Returns whether
 * the domain statement changed a row and the row it returned. The Activity event
 * and its subjects are appended iff the domain statement changed a row (enforced
 * by the append guards), all within the one transaction.
 */
export async function recordAtomicMutation<TRow>(
  input: RecordAtomicMutationInput,
): Promise<AtomicMutationResult<TRow>> {
  // Build the append statements first: serialisation/byte-size validation happens
  // here and throws BEFORE any batch runs, so an invalid payload never leaves a
  // domain mutation dangling.
  const appendStatements = input.recorder.buildAppendStatements(
    input.workspaceId,
    input.model,
  );
  const [activityInsert, ...subjectInserts] = appendStatements;

  const batch: D1PreparedStatement[] = [input.domainStatement];
  if (input.fault === "after-domain") {
    batch.push(forcedFailure(input.db));
  }
  batch.push(activityInsert!);
  if (input.fault === "after-activity") {
    batch.push(forcedFailure(input.db));
  }
  subjectInserts.forEach((statement, index) => {
    batch.push(statement);
    if (index === 0 && input.fault === "after-first-subject") {
      batch.push(forcedFailure(input.db));
    }
  });
  if (input.fault === "after-subjects") {
    batch.push(forcedFailure(input.db));
  }

  const results = await input.db.batch<TRow>(batch);
  const domainResult = results[0];
  const changes = domainResult?.meta?.changes ?? 0;
  const rows = domainResult?.results ?? [];
  return { changed: changes > 0, row: rows[0] ?? null };
}
