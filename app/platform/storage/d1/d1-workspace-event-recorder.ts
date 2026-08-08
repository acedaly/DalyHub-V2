/**
 * SET-03 Activity — the D1 workspace-event recorder.
 *
 * Implements the kernel's `WorkspaceEventRecorder` for D1: one parameter-bound
 * INSERT into the SAME `activities` table every other event lives in, with no
 * `activity_subjects` rows because a workspace-scoped event is about no entity.
 *
 * ── Why this does not use `recordAtomicMutation` ─────────────────────────────
 * That coordinator exists to make "domain write then log" impossible: it batches
 * the domain statement with the append, and guards the append on `changes() > 0`
 * so a no-op mutation records nothing. Here there IS no domain statement — the
 * event is the entire record of what happened — so the guard has nothing to
 * refer to and would in fact SUPPRESS the insert (a fresh batch reports zero
 * changes). Applying it would be cargo-culting a safety property into the one
 * shape it cannot describe, and would silently record nothing at all.
 *
 * What is preserved is everything that matters about the write: the workspace,
 * the id, the timestamp and the actor come from the bound composition rather than
 * from the caller; the payload is validated and serialised through the shared
 * kernel helpers before any SQL runs; and every value is bound, never
 * interpolated (AGENTS.md §17).
 */

import {
  buildWorkspaceActivityWriteModel,
  serializeActivityPayload,
  secureIdGenerator,
  systemClock,
  type ActivityActorContext,
  type Clock,
  type IdGenerator,
  type NewWorkspaceActivityEvent,
  type WorkspaceEventRecorder,
} from "~/kernel/activity";
import { ActivityStorageError } from "~/kernel/activity";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { toStorageTimestamp } from "./database";

export type D1WorkspaceEventRecorderOptions = {
  readonly actorContext: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
};

export class D1WorkspaceEventRecorder implements WorkspaceEventRecorder {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #actor: ActivityActorContext;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1WorkspaceEventRecorderOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options.actorContext;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
  }

  async record(event: NewWorkspaceActivityEvent): Promise<void> {
    // Validation (type, payload shape, depth, cycles) and serialisation both
    // happen BEFORE any statement is prepared, so an invalid event never reaches
    // the database and never half-writes.
    const model = buildWorkspaceActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newId(),
      this.#clock(),
    );
    const payloadJson = serializeActivityPayload(model.payload);

    try {
      await this.#db
        .prepare(
          `INSERT INTO activities
             (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          model.id,
          this.#workspaceId,
          model.type,
          model.actor.type,
          model.actor.id,
          toStorageTimestamp(model.occurredAt),
          payloadJson,
        )
        .run();
    } catch (cause) {
      throw new ActivityStorageError("record workspace event", { cause });
    }
  }
}
