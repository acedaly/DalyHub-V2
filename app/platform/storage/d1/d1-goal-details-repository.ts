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
  readGoalMeasurementConfig,
  resolveGoalMeasurementConfig,
  validateGoalTargetDate,
  type GoalDetailsChangeResult,
  type GoalDetailsRecord,
  type GoalDetailsRepository,
  type GoalMeasurementConfig,
  type UpdateGoalDetailsInput,
} from "~/kernel/goals";
import { normaliseEntityIconKey } from "~/kernel/entities/entity-icon-keys";
import { normaliseIdentityColourSlot } from "~/kernel/entities/identity-colour-slots";
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
  /* GOAL-02 — the measurement configuration, on the SAME Goal-owned slice. */
  readonly measurement_type: string | null;
  readonly measurement_unit: string | null;
  readonly measurement_direction: string | null;
  readonly baseline_value: number | null;
  readonly target_value: number | null;
  /* IDENTITY-01 — the Goal's OWN chosen identity, on the same owned slice. */
  readonly icon_key: string | null;
  readonly colour_slot: string | null;
}

/** The columns every read of this slice selects, in one place. */
const GOAL_DETAILS_COLUMNS = `target_date, definition_of_done, measurement_type,
   measurement_unit, measurement_direction, baseline_value, target_value,
   icon_key, colour_slot`;

/**
 * Ids per batched statement. D1 caps bound variables at 100 per statement; 50
 * plus the workspace bind stays comfortably inside that, matching the chunk size
 * every other batched Goal read uses.
 */
const DETAILS_CHUNK_SIZE = 50;

/** Two configurations are the same when every field is. Used to keep a patch
 * that changes nothing an idempotent no-op, exactly as the two text fields are. */
function sameMeasurement(
  a: GoalMeasurementConfig,
  b: GoalMeasurementConfig,
): boolean {
  return (
    a.type === b.type &&
    a.unit === b.unit &&
    a.direction === b.direction &&
    a.baselineValue === b.baselineValue &&
    a.targetValue === b.targetValue
  );
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
    return this.#record(id, row);
  }

  /**
   * The batched read. ONE statement per chunk of ids, joined to `entities` so a
   * deleted, wrong-kind or cross-workspace id is simply absent rather than
   * returning another Goal's details.
   */
  async listMany(
    goalIds: readonly string[],
  ): Promise<Map<string, GoalDetailsRecord>> {
    const ids = [...new Set(goalIds)].filter((id) => id.length > 0);
    const records = new Map<string, GoalDetailsRecord>();
    if (ids.length === 0) return records;

    try {
      const chunks: string[][] = [];
      for (let index = 0; index < ids.length; index += DETAILS_CHUNK_SIZE) {
        chunks.push(ids.slice(index, index + DETAILS_CHUNK_SIZE));
      }
      const gathered = await Promise.all(
        chunks.map(async (chunk) => {
          const marks = new Array(chunk.length).fill("?").join(", ");
          const result = await this.#db
            .prepare(
              `SELECT e.id AS entity_id,
                      d.target_date AS target_date,
                      d.definition_of_done AS definition_of_done,
                      d.measurement_type AS measurement_type,
                      d.measurement_unit AS measurement_unit,
                      d.measurement_direction AS measurement_direction,
                      d.baseline_value AS baseline_value,
                      d.target_value AS target_value,
                      d.icon_key AS icon_key,
                      d.colour_slot AS colour_slot
               FROM entities e
               LEFT JOIN goal_details d
                 ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
               WHERE e.workspace_id = ? AND e.type = '${GOAL}'
                     AND e.deleted_at IS NULL
                     AND e.id IN (${marks})`,
            )
            .bind(this.#workspaceId, ...chunk)
            .all<GoalDetailsRow & { readonly entity_id: string }>();
          return result.results ?? [];
        }),
      );
      for (const part of gathered) {
        for (const row of part) {
          records.set(row.entity_id, this.#record(row.entity_id, row));
        }
      }
      return records;
    } catch (cause) {
      throw new GoalDetailsStorageError({ cause });
    }
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
    // GOAL-02 — the measurement patch is merged over the CURRENT configuration
    // and renormalised by the kernel, so an inline edit of one field can never
    // clear the field beside it and no adapter decides what a coherent
    // configuration looks like.
    const nextMeasurement = resolveGoalMeasurementConfig(
      current.measurement,
      patch.measurement,
    );
    // IDENTITY-01 — the Goal's own identity, on the same patch contract as
    // every other field here: an omitted key leaves it unchanged, and `null`
    // clears it back to inheriting the Area's.
    const nextIconKey =
      patch.iconKey === undefined ? current.iconKey : patch.iconKey;
    const nextColourSlot =
      patch.colourSlot === undefined ? current.colourSlot : patch.colourSlot;

    if (
      nextTargetDate === current.targetDate &&
      nextDefinitionOfDone === current.definitionOfDone &&
      sameMeasurement(nextMeasurement, current.measurement) &&
      nextIconKey === current.iconKey &&
      nextColourSlot === current.colourSlot
    ) {
      return { details: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO goal_details
           (workspace_id, entity_id, target_date, definition_of_done,
            measurement_type, measurement_unit, measurement_direction,
            baseline_value, target_value, icon_key, colour_slot, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${GOAL}'
                       AND deleted_at IS NULL
               )
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           target_date = excluded.target_date,
           definition_of_done = excluded.definition_of_done,
           measurement_type = excluded.measurement_type,
           measurement_unit = excluded.measurement_unit,
           measurement_direction = excluded.measurement_direction,
           baseline_value = excluded.baseline_value,
           target_value = excluded.target_value,
           icon_key = excluded.icon_key,
           colour_slot = excluded.colour_slot,
           updated_at = excluded.updated_at
         RETURNING ${GOAL_DETAILS_COLUMNS}`,
      )
      .bind(
        this.#workspaceId,
        id,
        nextTargetDate,
        nextDefinitionOfDone,
        nextMeasurement.type,
        nextMeasurement.unit,
        nextMeasurement.direction,
        nextMeasurement.baselineValue,
        nextMeasurement.targetValue,
        nextIconKey,
        nextColourSlot,
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
        // The TYPE only — never the owner's numbers. An Activity payload is read
        // by the feed and by exports; "measured by target value" explains the
        // change, "85 to 70" would put the body of the record into its log.
        measurementType: nextMeasurement.type,
      },
    };
    const result = await this.#runAtomic<GoalDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return { details: this.#record(id, result.row), changed: true };
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
          `SELECT d.target_date AS target_date,
                  d.definition_of_done AS definition_of_done,
                  d.measurement_type AS measurement_type,
                  d.measurement_unit AS measurement_unit,
                  d.measurement_direction AS measurement_direction,
                  d.baseline_value AS baseline_value,
                  d.target_value AS target_value
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
  #record(id: string, row: GoalDetailsRow): GoalDetailsRecord {
    let validatedTargetDate: string | null;
    try {
      validatedTargetDate = validateGoalTargetDate(row.target_date);
    } catch (cause) {
      throw new GoalDetailsStorageError({ cause });
    }
    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      targetDate: validatedTargetDate,
      definitionOfDone: row.definition_of_done,
      /*
       * GOAL-02 — a stored configuration is READ through the kernel, which
       * degrades an unrecognised measurement type or a corrupt number to "not
       * measured" instead of throwing. A target date is different: it has a DB
       * format CHECK, so a malformed one is genuine corruption and fails
       * honestly. A measurement type has deliberately no CHECK (see the 0038
       * migration), so an unknown value is a forward-compatibility case, not a
       * fault, and must not take the Goal record down with it.
       */
      measurement: readGoalMeasurementConfig({
        measurementType: row.measurement_type,
        measurementUnit: row.measurement_unit,
        measurementDirection: row.measurement_direction,
        baselineValue: row.baseline_value,
        targetValue: row.target_value,
      }),
      /*
       * IDENTITY-01 — normalised on the way OUT, the same posture the Area and
       * Project slices take. `icon_key` and `colour_slot` are deliberately
       * unconstrained columns (migrations 0032, 0042), so a value this build no
       * longer recognises degrades to `null` here — the Goal then inherits its
       * Area's identity, which is exactly what it did before it chose anything.
       */
      iconKey: normaliseEntityIconKey(row.icon_key),
      colourSlot: normaliseIdentityColourSlot(row.colour_slot),
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
