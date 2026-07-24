/**
 * AREA-02 Goal Details — D1 implementation of the workspace-bound
 * `GoalDetailsRepository`.
 *
 * `update` is ONE conditional SQL statement — never a separate precondition
 * read followed by an unconditional write — mirroring the established DalyHub
 * mutation pattern (`D1ProjectSettingsRepository`, `D1SpineRepository.rename`):
 * the precondition (an ACTIVE Goal in this workspace) is folded directly into
 * the statement's `WHERE EXISTS` clause, so a Goal soft-deleted between the read
 * and the write cannot commit an orphaned details row. The domain write and its
 * `goal.details_updated` Activity append run in the SAME `D1Database.batch()` as
 * `recordAtomicMutation` (ADR-012) — a no-op appends nothing, and an
 * Activity-insert failure rolls the details write back too.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  GOAL,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import {
  GOAL_DETAILS_UPDATED,
  GoalDetailsConflictError,
  GoalDetailsNotFoundError,
  GoalDetailsStorageError,
  normalizeGoalDefinitionOfDone,
  validateGoalTargetDate,
  type GoalDetailsChangeResult,
  type GoalDetailsRecord,
  type GoalDetailsRepository,
  type UpdateGoalDetailsInput,
} from "~/kernel/goals";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { toStorageTimestamp } from "./database";

/** The `goal_details` row shape this adapter reads/writes, exactly as stored. */
interface GoalDetailsRow {
  readonly target_date: string | null;
  readonly definition_of_done: string | null;
}

export type D1GoalDetailsRepositoryOptions = {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  /** TEST-ONLY: force the atomic mutation's batch to fail at a chosen point,
   * proving the details write rolls back with it. Never set in production. */
  readonly mutationFault?: AtomicMutationFault;
};

export class D1GoalDetailsRepository implements GoalDetailsRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #actor: ActivityActorContext;
  readonly #clock: Clock;
  readonly #id: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #fault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: D1GoalDetailsRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options?.actorContext ?? createSystemActorContext();
    this.#clock = options?.clock ?? systemClock;
    this.#id = options?.idGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#fault = options?.mutationFault;
  }

  async get(id: string): Promise<GoalDetailsRecord | null> {
    const row = await this.#row(id);
    if (!row) return null;
    return this.#record(id, row.target_date, row.definition_of_done);
  }

  async update(
    id: string,
    patch: UpdateGoalDetailsInput,
  ): Promise<GoalDetailsChangeResult> {
    const current = await this.#require(id);
    const nextTargetDate =
      patch.targetDate === undefined
        ? current.targetDate
        : validateGoalTargetDate(patch.targetDate);
    const nextDefinitionOfDone =
      patch.definitionOfDone === undefined
        ? current.definitionOfDone
        : normalizeGoalDefinitionOfDone(patch.definitionOfDone);

    if (
      nextTargetDate === current.targetDate &&
      nextDefinitionOfDone === current.definitionOfDone
    ) {
      return { details: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO goal_details
           (workspace_id, entity_id, target_date, definition_of_done, updated_at)
         SELECT ?, ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${GOAL}'
                       AND deleted_at IS NULL
               )
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           target_date = excluded.target_date,
           definition_of_done = excluded.definition_of_done,
           updated_at = excluded.updated_at
         RETURNING target_date, definition_of_done`,
      )
      .bind(
        this.#workspaceId,
        id,
        nextTargetDate,
        nextDefinitionOfDone,
        nowTs,
        this.#workspaceId,
        id,
      );

    const event: NewActivityEvent = {
      type: GOAL_DETAILS_UPDATED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: {
        hasTargetDate: nextTargetDate !== null,
        hasDefinitionOfDone: nextDefinitionOfDone !== null,
      },
    };
    const result = await this.#runAtomic<GoalDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return {
        details: this.#record(
          id,
          result.row.target_date,
          result.row.definition_of_done,
        ),
        changed: true,
      };
    }

    // The gate failed: the Goal was soft-deleted (or otherwise became
    // unavailable) between the read above and this statement's execution.
    // Reconcile honestly rather than assume the stale read still holds.
    const refreshed = await this.get(id);
    if (!refreshed) {
      throw new GoalDetailsNotFoundError();
    }
    throw new GoalDetailsConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  async #require(id: string): Promise<GoalDetailsRecord> {
    const value = await this.get(id);
    if (!value) throw new GoalDetailsNotFoundError();
    return value;
  }

  /** Read the current details row. Missing, deleted, wrong-kind and
   * cross-workspace ids all resolve to `null` — the calm not-found contract. */
  async #row(id: string): Promise<GoalDetailsRow | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT d.target_date AS target_date, d.definition_of_done AS definition_of_done
           FROM entities e
           LEFT JOIN goal_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${GOAL}'
                 AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<GoalDetailsRow>();
      return row ?? null;
    } catch (cause) {
      throw new GoalDetailsStorageError({ cause });
    }
  }

  /**
   * Build a `GoalDetailsRecord` from a stored row — never an unchecked cast. A
   * malformed stored `target_date` (impossible under the DB's format CHECK
   * except for genuinely corrupt storage state) fails honestly as a storage
   * error rather than being silently coerced.
   */
  #record(
    id: string,
    targetDate: string | null,
    definitionOfDone: string | null,
  ): GoalDetailsRecord {
    let validatedTargetDate: string | null;
    try {
      validatedTargetDate = validateGoalTargetDate(targetDate);
    } catch (cause) {
      throw new GoalDetailsStorageError({ cause });
    }
    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      targetDate: validatedTargetDate,
      definitionOfDone,
    };
  }

  /**
   * Execute the domain statement and its Activity event atomically via the
   * SHARED `recordAtomicMutation` seam (ADR-012) — the same mechanism the
   * Entity/EntityLink/ProjectSettings repositories use, never a bespoke
   * transaction.
   */
  async #runAtomic<TRow>(
    event: NewActivityEvent,
    domainStatement: D1PreparedStatement,
    now: Date,
  ) {
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#id(),
      now,
    );
    try {
      return await recordAtomicMutation<TRow>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#fault,
      });
    } catch (cause) {
      throw new GoalDetailsStorageError({ cause });
    }
  }
}
