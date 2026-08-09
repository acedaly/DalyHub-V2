/**
 * GOAL-02 Goal measurements — D1 implementation of the workspace-bound
 * `GoalMeasurementRepository`.
 *
 * Every write is ONE conditional SQL statement whose precondition (an ACTIVE Goal
 * in this workspace, and for an update/delete a row that belongs to one) is folded
 * into the statement's own `WHERE EXISTS`, then batched with its Activity append
 * through the shared `recordAtomicMutation` seam (ADR-012) — the same shape
 * `D1GoalDetailsRepository` uses. There is no read-then-write anywhere: a Goal
 * soft-deleted between a check and a write cannot leave an orphaned measurement.
 *
 * ── Reads are bounded and never per-Goal ────────────────────────────────────
 * `listMeasurementSummaries` gathers a whole page of Goals in a FIXED number of
 * statements (two per chunk of ids), using window functions to pick each Goal's
 * newest, oldest and last-before-the-window readings in one pass. That is what
 * lets Today show current values for four Goals without four round trips or four
 * full histories (AGENTS.md §16). Full history is only ever read for ONE Goal, on
 * its own record page, and even then it is capped.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  GOAL_MEASUREMENT_CORRECTED,
  GOAL_MEASUREMENT_LOGGED,
  GOAL_MEASUREMENT_REMOVED,
  GOAL_MILESTONE_COMPLETED,
  GOAL_MILESTONE_REOPENED,
  GOAL_TARGET_REACHED,
  GoalMeasurementNotFoundError,
  GoalMeasurementStorageError,
  normalizeGoalMeasurementNote,
  parseGoalMeasurementDirection,
  parseGoalMeasurementType,
  validateGoalMeasurementDate,
  validateGoalMeasurementValue,
  validateGoalMilestoneTitle,
  validateGoalMilestoneWeight,
  type GoalMeasurement,
  type GoalMeasurementRepository,
  type GoalMeasurementSummary,
  type GoalMeasurementSummaryInput,
  type GoalMilestone,
  type GoalMilestoneSummary,
  type NewGoalMeasurementInput,
  type NewGoalMilestoneInput,
  type UpdateGoalMeasurementInput,
  type UpdateGoalMilestoneInput,
} from "~/kernel/goals";
import {
  GOAL,
  systemClock,
  validateSpineId,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";

/**
 * The hard cap on a single Goal's measurement history read.
 *
 * A year of daily weigh-ins. Beyond that a chart is a smear and a list is a
 * scroll, and the cap is the difference between a bounded read and "load
 * everything" (AGENTS.md §16 — no unbounded lists). The most RECENT rows are the
 * ones kept when the cap bites, because those are the ones every derived figure
 * depends on.
 */
export const GOAL_MEASUREMENT_MAX_ROWS = 365;

/**
 * Ids per batched statement. Mirrors `GOAL_PROJECT_CONTRIBUTION_CHUNK_SIZE`: D1
 * caps bound variables at 100 per statement, and 50 ids plus a handful of fixed
 * binds stays comfortably inside that while gathering a whole collection page.
 */
const SUMMARY_CHUNK_SIZE = 50;

/** A milestone-measured Goal's stages. Bounded for the same reason. */
export const GOAL_MILESTONE_MAX_ROWS = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

interface MeasurementRow {
  readonly id: string;
  readonly entity_id: string;
  readonly value: number;
  readonly measured_on: string;
  readonly note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface SummaryRow {
  readonly entity_id: string;
  readonly latest_value: number | null;
  readonly latest_on: string | null;
  readonly earliest_value: number | null;
  readonly earliest_on: string | null;
  readonly total: number;
}

interface PriorRow {
  readonly entity_id: string;
  readonly value: number;
  readonly measured_on: string;
}

interface MilestoneRow {
  readonly id: string;
  readonly entity_id: string;
  readonly title: string;
  readonly weight: number;
  readonly position: number;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MilestoneSummaryRow {
  readonly entity_id: string;
  readonly total: number;
  readonly completed: number;
  readonly total_weight: number;
  readonly completed_weight: number;
}

/** The target the Goal is measured against, read alongside a write so the
 * "reached the target" transition can be decided inside the same request. */
interface GoalTargetRow {
  readonly measurement_type: string | null;
  readonly measurement_direction: string | null;
  readonly target_value: number | null;
}

export type D1GoalMeasurementRepositoryOptions = {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  /** TEST-ONLY: force the atomic batch to fail at a chosen point. */
  readonly mutationFault?: AtomicMutationFault;
};

export class D1GoalMeasurementRepository implements GoalMeasurementRepository {
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
    options?: D1GoalMeasurementRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options?.actorContext ?? createSystemActorContext();
    this.#clock = options?.clock ?? systemClock;
    this.#id = options?.idGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#fault = options?.mutationFault;
  }

  /* ---------------------------------------------------------------------- */
  /* Measurements — read                                                     */
  /* ---------------------------------------------------------------------- */

  async listMeasurements(
    goalId: string,
    limit = GOAL_MEASUREMENT_MAX_ROWS,
  ): Promise<readonly GoalMeasurement[]> {
    const id = validateSpineId(goalId, "id");
    const bounded = Math.min(
      GOAL_MEASUREMENT_MAX_ROWS,
      Math.max(1, Math.trunc(limit)),
    );
    try {
      const result = await this.#db
        .prepare(
          `SELECT m.id, m.entity_id, m.value, m.measured_on, m.note,
                  m.created_at, m.updated_at
           FROM goal_measurements m
           JOIN entities e
             ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                AND e.type = '${GOAL}' AND e.deleted_at IS NULL
           WHERE m.workspace_id = ? AND m.entity_id = ?
           ORDER BY m.measured_on DESC, m.created_at DESC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, id, bounded)
        .all<MeasurementRow>();
      // Read newest-first so a cap keeps the RECENT rows, present oldest-first
      // because that is the order a series is read and drawn in.
      return (result.results ?? [])
        .map((row) => this.#measurement(row))
        .reverse();
    } catch (cause) {
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  async listMeasurementSummaries(
    goalIds: readonly string[],
    input: GoalMeasurementSummaryInput,
  ): Promise<Map<string, GoalMeasurementSummary>> {
    const ids = [...new Set(goalIds.map((id) => validateSpineId(id, "id")))];
    const summaries = new Map<string, GoalMeasurementSummary>();
    if (ids.length === 0) return summaries;

    // Every requested id gets an entry, so a Goal with no readings renders its
    // honest "nothing logged yet" state rather than being silently absent.
    for (const id of ids) {
      summaries.set(id, {
        goalId: id,
        latest: null,
        earliest: null,
        priorInWindow: null,
        count: 0,
      });
    }

    const comparisonFrom = validateGoalMeasurementDate(input.comparisonFromIso);

    try {
      const chunks = chunk(ids, SUMMARY_CHUNK_SIZE);
      const gathered = await Promise.all(
        chunks.map(async (idChunk) => {
          const marks = placeholders(idChunk.length);
          const [aggregate, prior] = await Promise.all([
            /*
             * Newest, oldest and the count in ONE pass.
             *
             * Two `ROW_NUMBER()` windows rank each Goal's readings from both
             * ends, and the outer aggregate picks the value sitting at rank 1 of
             * each. Written this way rather than as two `MIN`/`MAX` aggregates
             * because SQLite's bare-column-with-aggregate shortcut only defines
             * ONE such row per query — with two it would be free to return the
             * date of one reading beside the value of another.
             */
            this.#db
              .prepare(
                `SELECT entity_id,
                        MAX(CASE WHEN rn_desc = 1 THEN value END) AS latest_value,
                        MAX(CASE WHEN rn_desc = 1 THEN measured_on END) AS latest_on,
                        MAX(CASE WHEN rn_asc = 1 THEN value END) AS earliest_value,
                        MAX(CASE WHEN rn_asc = 1 THEN measured_on END) AS earliest_on,
                        COUNT(*) AS total
                 FROM (
                        SELECT m.entity_id, m.value, m.measured_on,
                               ROW_NUMBER() OVER (
                                 PARTITION BY m.entity_id
                                 ORDER BY m.measured_on DESC, m.created_at DESC
                               ) AS rn_desc,
                               ROW_NUMBER() OVER (
                                 PARTITION BY m.entity_id
                                 ORDER BY m.measured_on ASC, m.created_at ASC
                               ) AS rn_asc
                        FROM goal_measurements m
                        JOIN entities e
                          ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                             AND e.type = '${GOAL}' AND e.deleted_at IS NULL
                        WHERE m.workspace_id = ? AND m.entity_id IN (${marks})
                      )
                 GROUP BY entity_id`,
              )
              .bind(this.#workspaceId, ...idChunk)
              .all<SummaryRow>(),
            /*
             * The comparison reading: the latest one strictly BEFORE the window
             * the caller asked about. This is what makes "↓ 0.3 kg this week" a
             * comparison against a real earlier reading instead of against
             * whatever happens to be second-newest.
             */
            this.#db
              .prepare(
                `SELECT entity_id, value, measured_on
                 FROM (
                        SELECT m.entity_id, m.value, m.measured_on,
                               ROW_NUMBER() OVER (
                                 PARTITION BY m.entity_id
                                 ORDER BY m.measured_on DESC, m.created_at DESC
                               ) AS rn
                        FROM goal_measurements m
                        JOIN entities e
                          ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                             AND e.type = '${GOAL}' AND e.deleted_at IS NULL
                        WHERE m.workspace_id = ? AND m.entity_id IN (${marks})
                              AND m.measured_on < ?
                      )
                 WHERE rn = 1`,
              )
              .bind(this.#workspaceId, ...idChunk, comparisonFrom)
              .all<PriorRow>(),
          ]);
          return {
            aggregate: aggregate.results ?? [],
            prior: prior.results ?? [],
          };
        }),
      );

      for (const part of gathered) {
        for (const row of part.aggregate) {
          const existing = summaries.get(row.entity_id);
          if (!existing) continue;
          summaries.set(row.entity_id, {
            ...existing,
            latest:
              row.latest_value !== null && row.latest_on !== null
                ? { value: row.latest_value, measuredOn: row.latest_on }
                : null,
            earliest:
              row.earliest_value !== null && row.earliest_on !== null
                ? { value: row.earliest_value, measuredOn: row.earliest_on }
                : null,
            count: row.total,
          });
        }
        for (const row of part.prior) {
          const existing = summaries.get(row.entity_id);
          if (!existing) continue;
          summaries.set(row.entity_id, {
            ...existing,
            priorInWindow: { value: row.value, measuredOn: row.measured_on },
          });
        }
      }
      return summaries;
    } catch (cause) {
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Measurements — write                                                    */
  /* ---------------------------------------------------------------------- */

  async createMeasurement(
    goalId: string,
    input: NewGoalMeasurementInput,
  ): Promise<GoalMeasurement> {
    const id = validateSpineId(goalId, "id");
    const value = validateGoalMeasurementValue(input.value);
    const measuredOn = validateGoalMeasurementDate(input.measuredOn);
    const note = normalizeGoalMeasurementNote(input.note);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const measurementId = this.#id();

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO goal_measurements
           (workspace_id, id, entity_id, value, measured_on, note, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = '${GOAL}'
                       AND deleted_at IS NULL
               )
         RETURNING id, entity_id, value, measured_on, note, created_at, updated_at`,
      )
      .bind(
        this.#workspaceId,
        measurementId,
        id,
        value,
        measuredOn,
        note,
        nowTs,
        nowTs,
        this.#workspaceId,
        id,
      );

    /*
     * "Reached the target" is decided from the configuration and the PREVIOUS
     * best reading, both read before the write. The transition is what earns an
     * event: a Goal already past its target logs an ordinary measurement, because
     * the second reading below 70 kg is not a second achievement.
     */
    const reached = await this.#targetTransition(id, value);

    const event: NewActivityEvent = {
      type: GOAL_MEASUREMENT_LOGGED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: { measuredOn, hasNote: note !== null },
    };
    const companions: NewActivityEvent[] = reached
      ? [
          {
            type: GOAL_TARGET_REACHED,
            subjects: [{ entityId: id, role: "subject" }],
            payload: { measuredOn },
          },
        ]
      : [];

    const result = await this.#runAtomic<MeasurementRow>(
      event,
      domainStatement,
      now,
      companions,
    );
    if (!result.changed || !result.row) {
      throw new GoalMeasurementNotFoundError();
    }
    return this.#measurement(result.row);
  }

  async updateMeasurement(
    measurementId: string,
    patch: UpdateGoalMeasurementInput,
  ): Promise<GoalMeasurement> {
    const id = validateSpineId(measurementId, "id");
    const current = await this.#requireMeasurement(id);

    const nextValue =
      patch.value === undefined
        ? current.value
        : validateGoalMeasurementValue(patch.value);
    const nextMeasuredOn =
      patch.measuredOn === undefined
        ? current.measuredOn
        : validateGoalMeasurementDate(patch.measuredOn);
    const nextNote =
      patch.note === undefined
        ? current.note
        : normalizeGoalMeasurementNote(patch.note);

    if (
      nextValue === current.value &&
      nextMeasuredOn === current.measuredOn &&
      nextNote === current.note
    ) {
      // Idempotent: no write, no Activity. Correcting a value to itself is not a
      // correction.
      return current;
    }

    const now = this.#clock();
    const domainStatement = this.#db
      .prepare(
        `UPDATE goal_measurements
         SET value = ?, measured_on = ?, note = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?
               AND EXISTS (
                     SELECT 1 FROM entities
                     WHERE workspace_id = goal_measurements.workspace_id
                           AND id = goal_measurements.entity_id
                           AND type = '${GOAL}' AND deleted_at IS NULL
                   )
         RETURNING id, entity_id, value, measured_on, note, created_at, updated_at`,
      )
      .bind(
        nextValue,
        nextMeasuredOn,
        nextNote,
        toStorageTimestamp(now),
        this.#workspaceId,
        id,
      );

    const event: NewActivityEvent = {
      type: GOAL_MEASUREMENT_CORRECTED,
      subjects: [{ entityId: current.goalId, role: "subject" }],
      payload: { measuredOn: nextMeasuredOn },
    };
    const result = await this.#runAtomic<MeasurementRow>(
      event,
      domainStatement,
      now,
    );
    if (!result.changed || !result.row) {
      throw new GoalMeasurementNotFoundError();
    }
    return this.#measurement(result.row);
  }

  async deleteMeasurement(measurementId: string): Promise<void> {
    const id = validateSpineId(measurementId, "id");
    const current = await this.#requireMeasurement(id);
    const now = this.#clock();

    const domainStatement = this.#db
      .prepare(
        `DELETE FROM goal_measurements
         WHERE workspace_id = ? AND id = ?
         RETURNING id, entity_id, value, measured_on, note, created_at, updated_at`,
      )
      .bind(this.#workspaceId, id);

    const event: NewActivityEvent = {
      type: GOAL_MEASUREMENT_REMOVED,
      subjects: [{ entityId: current.goalId, role: "subject" }],
      payload: { measuredOn: current.measuredOn },
    };
    const result = await this.#runAtomic<MeasurementRow>(
      event,
      domainStatement,
      now,
    );
    if (!result.changed) {
      throw new GoalMeasurementNotFoundError();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Milestones                                                              */
  /* ---------------------------------------------------------------------- */

  async listMilestones(goalId: string): Promise<readonly GoalMilestone[]> {
    const id = validateSpineId(goalId, "id");
    try {
      const result = await this.#db
        .prepare(
          `SELECT m.id, m.entity_id, m.title, m.weight, m.position,
                  m.completed_at, m.created_at, m.updated_at
           FROM goal_milestones m
           JOIN entities e
             ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                AND e.type = '${GOAL}' AND e.deleted_at IS NULL
           WHERE m.workspace_id = ? AND m.entity_id = ?
           ORDER BY m.position ASC, m.created_at ASC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, id, GOAL_MILESTONE_MAX_ROWS)
        .all<MilestoneRow>();
      return (result.results ?? []).map((row) => this.#milestone(row));
    } catch (cause) {
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  async listMilestoneSummaries(
    goalIds: readonly string[],
  ): Promise<Map<string, GoalMilestoneSummary>> {
    const ids = [...new Set(goalIds.map((id) => validateSpineId(id, "id")))];
    const summaries = new Map<string, GoalMilestoneSummary>();
    if (ids.length === 0) return summaries;
    for (const id of ids) {
      summaries.set(id, {
        goalId: id,
        total: 0,
        completed: 0,
        totalWeight: 0,
        completedWeight: 0,
      });
    }

    try {
      const gathered = await Promise.all(
        chunk(ids, SUMMARY_CHUNK_SIZE).map(async (idChunk) => {
          const result = await this.#db
            .prepare(
              `SELECT m.entity_id,
                      COUNT(*) AS total,
                      SUM(CASE WHEN m.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                      SUM(m.weight) AS total_weight,
                      SUM(CASE WHEN m.completed_at IS NOT NULL THEN m.weight ELSE 0 END) AS completed_weight
               FROM goal_milestones m
               JOIN entities e
                 ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                    AND e.type = '${GOAL}' AND e.deleted_at IS NULL
               WHERE m.workspace_id = ? AND m.entity_id IN (${placeholders(idChunk.length)})
               GROUP BY m.entity_id`,
            )
            .bind(this.#workspaceId, ...idChunk)
            .all<MilestoneSummaryRow>();
          return result.results ?? [];
        }),
      );
      for (const part of gathered) {
        for (const row of part) {
          if (!summaries.has(row.entity_id)) continue;
          summaries.set(row.entity_id, {
            goalId: row.entity_id,
            total: row.total ?? 0,
            completed: row.completed ?? 0,
            totalWeight: row.total_weight ?? 0,
            completedWeight: row.completed_weight ?? 0,
          });
        }
      }
      return summaries;
    } catch (cause) {
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  async createMilestone(
    goalId: string,
    input: NewGoalMilestoneInput,
  ): Promise<GoalMilestone> {
    const id = validateSpineId(goalId, "id");
    const title = validateGoalMilestoneTitle(input.title);
    const weight = validateGoalMilestoneWeight(input.weight);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const milestoneId = this.#id();

    /*
     * Position is assigned by the DATABASE (`MAX(position) + 1` in the same
     * statement) rather than read first and written second: two stages added in
     * quick succession must not race to the same position.
     *
     * A milestone's definition is CONFIGURATION rather than progress, so adding
     * one appends no Activity — see the repository contract for why. That is also
     * why this is a plain statement rather than an atomic mutation.
     */
    try {
      const row = await this.#db
        .prepare(
          `INSERT INTO goal_milestones
             (workspace_id, id, entity_id, title, weight, position, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?,
                  COALESCE((SELECT MAX(position) + 1 FROM goal_milestones
                            WHERE workspace_id = ? AND entity_id = ?), 0),
                  ?, ?
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = '${GOAL}'
                         AND deleted_at IS NULL
                 )
           RETURNING id, entity_id, title, weight, position, completed_at, created_at, updated_at`,
        )
        .bind(
          this.#workspaceId,
          milestoneId,
          id,
          title,
          weight,
          this.#workspaceId,
          id,
          nowTs,
          nowTs,
          this.#workspaceId,
          id,
        )
        .first<MilestoneRow>();
      if (!row) throw new GoalMeasurementNotFoundError();
      return this.#milestone(row);
    } catch (cause) {
      if (cause instanceof GoalMeasurementNotFoundError) throw cause;
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  async updateMilestone(
    milestoneId: string,
    patch: UpdateGoalMilestoneInput,
  ): Promise<GoalMilestone> {
    const id = validateSpineId(milestoneId, "id");
    const current = await this.#requireMilestone(id);

    const nextTitle =
      patch.title === undefined
        ? current.title
        : validateGoalMilestoneTitle(patch.title);
    const nextWeight =
      patch.weight === undefined
        ? current.weight
        : validateGoalMilestoneWeight(patch.weight);
    const nextPosition =
      patch.position === undefined
        ? current.position
        : Math.max(0, Math.trunc(patch.position));
    const wasCompleted = current.completedAt !== null;
    const willBeCompleted = patch.completed ?? wasCompleted;

    if (
      nextTitle === current.title &&
      nextWeight === current.weight &&
      nextPosition === current.position &&
      willBeCompleted === wasCompleted
    ) {
      return current;
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const completedAt = willBeCompleted
      ? wasCompleted
        ? toStorageTimestamp(current.completedAt!)
        : nowTs
      : null;

    const domainStatement = this.#db
      .prepare(
        `UPDATE goal_milestones
         SET title = ?, weight = ?, position = ?, completed_at = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?
               AND EXISTS (
                     SELECT 1 FROM entities
                     WHERE workspace_id = goal_milestones.workspace_id
                           AND id = goal_milestones.entity_id
                           AND type = '${GOAL}' AND deleted_at IS NULL
                   )
         RETURNING id, entity_id, title, weight, position, completed_at, created_at, updated_at`,
      )
      .bind(
        nextTitle,
        nextWeight,
        nextPosition,
        completedAt,
        nowTs,
        this.#workspaceId,
        id,
      );

    // Only a COMPLETION TRANSITION is progress worth recording; a rename or a
    // reweight is configuration, and an Activity feed full of those is the
    // flooding this feature is told to avoid.
    if (willBeCompleted === wasCompleted) {
      try {
        const row = await domainStatement.first<MilestoneRow>();
        if (!row) throw new GoalMeasurementNotFoundError();
        return this.#milestone(row);
      } catch (cause) {
        if (cause instanceof GoalMeasurementNotFoundError) throw cause;
        throw new GoalMeasurementStorageError({ cause });
      }
    }

    const event: NewActivityEvent = {
      type: willBeCompleted
        ? GOAL_MILESTONE_COMPLETED
        : GOAL_MILESTONE_REOPENED,
      subjects: [{ entityId: current.goalId, role: "subject" }],
      payload: { title: nextTitle },
    };
    const result = await this.#runAtomic<MilestoneRow>(
      event,
      domainStatement,
      now,
    );
    if (!result.changed || !result.row) {
      throw new GoalMeasurementNotFoundError();
    }
    return this.#milestone(result.row);
  }

  async deleteMilestone(milestoneId: string): Promise<void> {
    const id = validateSpineId(milestoneId, "id");
    try {
      const row = await this.#db
        .prepare(
          `DELETE FROM goal_milestones
           WHERE workspace_id = ? AND id = ?
           RETURNING id`,
        )
        .bind(this.#workspaceId, id)
        .first<{ readonly id: string }>();
      if (!row) throw new GoalMeasurementNotFoundError();
    } catch (cause) {
      if (cause instanceof GoalMeasurementNotFoundError) throw cause;
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Would this new reading be the FIRST to reach the Goal's target?
   *
   * Reads the configuration and the best reading so far in one statement. The
   * answer only ever adds a companion Activity event; the measurement itself is
   * written by the guarded statement regardless, so a race here can at worst
   * mis-attribute which of two simultaneous readings "reached" the target — it
   * can never lose a measurement or write a wrong value.
   */
  async #targetTransition(goalId: string, value: number): Promise<boolean> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT measurement_type, measurement_direction, target_value
           FROM goal_details
           WHERE workspace_id = ? AND entity_id = ?`,
        )
        .bind(this.#workspaceId, goalId)
        .first<GoalTargetRow>();
      const type = parseGoalMeasurementType(row?.measurement_type);
      const target = row?.target_value ?? null;
      if (type === null || target === null || !Number.isFinite(target)) {
        return false;
      }
      const direction =
        parseGoalMeasurementDirection(row?.measurement_direction) ?? "increase";
      const reaches = (candidate: number) =>
        direction === "decrease" ? candidate <= target : candidate >= target;
      if (!reaches(value)) return false;

      const best = await this.#db
        .prepare(
          direction === "decrease"
            ? `SELECT MIN(value) AS value FROM goal_measurements
               WHERE workspace_id = ? AND entity_id = ?`
            : `SELECT MAX(value) AS value FROM goal_measurements
               WHERE workspace_id = ? AND entity_id = ?`,
        )
        .bind(this.#workspaceId, goalId)
        .first<{ readonly value: number | null }>();
      const previous = best?.value ?? null;
      return previous === null || !reaches(previous);
    } catch {
      // A failure to classify the transition must never fail the measurement. The
      // reading is the fact; the celebratory event is not.
      return false;
    }
  }

  async #requireMeasurement(id: string): Promise<GoalMeasurement> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT m.id, m.entity_id, m.value, m.measured_on, m.note,
                  m.created_at, m.updated_at
           FROM goal_measurements m
           JOIN entities e
             ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                AND e.type = '${GOAL}' AND e.deleted_at IS NULL
           WHERE m.workspace_id = ? AND m.id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<MeasurementRow>();
      if (!row) throw new GoalMeasurementNotFoundError();
      return this.#measurement(row);
    } catch (cause) {
      if (cause instanceof GoalMeasurementNotFoundError) throw cause;
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  async #requireMilestone(id: string): Promise<GoalMilestone> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT m.id, m.entity_id, m.title, m.weight, m.position,
                  m.completed_at, m.created_at, m.updated_at
           FROM goal_milestones m
           JOIN entities e
             ON e.workspace_id = m.workspace_id AND e.id = m.entity_id
                AND e.type = '${GOAL}' AND e.deleted_at IS NULL
           WHERE m.workspace_id = ? AND m.id = ?
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<MilestoneRow>();
      if (!row) throw new GoalMeasurementNotFoundError();
      return this.#milestone(row);
    } catch (cause) {
      if (cause instanceof GoalMeasurementNotFoundError) throw cause;
      throw new GoalMeasurementStorageError({ cause });
    }
  }

  #measurement(row: MeasurementRow): GoalMeasurement {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      goalId: row.entity_id,
      value: row.value,
      measuredOn: row.measured_on,
      note: row.note,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }

  #milestone(row: MilestoneRow): GoalMilestone {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      goalId: row.entity_id,
      title: row.title,
      weight: row.weight,
      position: row.position,
      completedAt: row.completed_at
        ? fromStorageTimestamp(row.completed_at)
        : null,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }

  async #runAtomic<TRow>(
    event: NewActivityEvent,
    domainStatement: D1PreparedStatement,
    now: Date,
    companions: readonly NewActivityEvent[] = [],
  ) {
    const model = buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#id(),
      now,
    );
    const companionModels = companions.map((companion) =>
      buildActivityWriteModel(companion, this.#actor.actor, this.#id(), now),
    );
    try {
      return await recordAtomicMutation<TRow>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        companions: companionModels,
        fault: this.#fault,
      });
    } catch (cause) {
      throw new GoalMeasurementStorageError({ cause });
    }
  }
}
