/**
 * FND-05 Activity — D1 activity statement builder (internal recording seam).
 *
 * Turns a validated, storage-ready `ActivityWriteModel` into the parameter-bound
 * `activities` + `activity_subjects` INSERT statements that append one event. It
 * is NOT a public repository — it is the shared seam the D1 mutation repositories
 * (entity, entity-link, and future modules/FND-07) use so event/subject insertion
 * logic lives in exactly one place and never drifts (ADR-012). Reads go through
 * the separate, read-only `D1ActivityRepository`.
 *
 * The two guards are what make recording COUPLED TO THE ACTUAL CHANGED-ROW
 * OUTCOME rather than merely following it:
 *
 *   - the `activities` insert runs only `WHERE changes() > 0` — i.e. only when the
 *     immediately-preceding domain statement in the same atomic batch actually
 *     changed a row. A no-op mutation (already-deleted, already-exists, a
 *     concurrent loser whose conditional UPDATE matched nothing) leaves
 *     `changes()` at 0, so no event is appended.
 *   - each `activity_subjects` insert runs only `WHERE EXISTS` the event it
 *     belongs to. Since the event id is a fresh unique id, the subject is inserted
 *     iff the event was — independent of statement ordering, so it is robust for
 *     any number of subjects.
 *
 * The `changes()`-across-a-batched-statement behaviour this relies on is proven in
 * the real Workers/D1 integration suite (`activity-atomic.test.ts`).
 *
 * All values are bound, never interpolated (AGENTS.md §17). The payload is
 * serialised exactly once here via the shared `serializeActivityPayload` helper,
 * which also enforces the documented maximum encoded byte size BEFORE any write.
 */

import type { ActivityWriteModel } from "~/kernel/activity";
import { serializeActivityPayload } from "~/kernel/activity";

import { toStorageTimestamp } from "./database";

export class D1ActivityRecorder {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  /**
   * Build the append statements for one event: the guarded `activities` insert
   * followed by one guarded `activity_subjects` insert per subject. These are
   * intended to run in the SAME `D1Database.batch()` as the domain mutation, with
   * the domain statement FIRST — the `changes() > 0` guard on the event insert
   * refers to that domain statement.
   *
   * Serialisation happens here (once), so a payload that violates the byte-size
   * limit throws `ActivityPayloadError` before the batch is ever assembled.
   */
  buildAppendStatements(
    workspaceId: string,
    model: ActivityWriteModel,
  ): D1PreparedStatement[] {
    const payloadJson = serializeActivityPayload(model.payload);
    const occurredAt = toStorageTimestamp(model.occurredAt);

    const activityInsert = this.#db
      .prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE changes() > 0`,
      )
      .bind(
        model.id,
        workspaceId,
        model.type,
        model.actor.type,
        model.actor.id,
        occurredAt,
        payloadJson,
      );

    const statements: D1PreparedStatement[] = [activityInsert];
    for (const subject of model.subjects) {
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO activity_subjects (workspace_id, activity_id, entity_id, role)
             SELECT ?, ?, ?, ?
             WHERE EXISTS (
                     SELECT 1 FROM activities WHERE workspace_id = ? AND id = ?
                   )`,
          )
          .bind(
            workspaceId,
            model.id,
            subject.entityId,
            subject.role,
            workspaceId,
            model.id,
          ),
      );
    }
    return statements;
  }
}
