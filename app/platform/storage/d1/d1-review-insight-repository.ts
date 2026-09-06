/**
 * REVIEW-03 Review insights — D1 implementation (ADR-079).
 *
 * Read-heavy and storage-specific. Every aggregate is computed IN THE DATABASE
 * as one grouped, workspace-scoped, parameterised statement — never by listing
 * records and counting them in the browser, and never one query per record.
 * The Review is a page the owner opens weekly; it does not get to be an N+1.
 *
 * Provenance of every number:
 *
 *   - **Completions** come from the append-only Activity stream, so they are
 *     exact for any period, including periods that ended months ago. Counted
 *     `DISTINCT` per record, so a Task completed twice inside one period counts
 *     once, and matched type-to-type (`task.completed` against a `task` entity)
 *     so a multi-subject event can never inflate a total.
 *   - **Contribution** resolves each completed Task's Goal and Area through the
 *     CURRENT spine links, because the spine stores no link history. This is a
 *     documented approximation the surface states out loud.
 *   - **Carry-over** is exact current state: still-open Tasks whose due date, or
 *     whose waiting episode, predates the period's first day.
 *   - **Overdue history** (CONVERGE-01 §8) reads the same two stored columns a
 *     LIVE overdue check reads — `task_details.due_date` and
 *     `spine_records.completed_at` — at a past moment instead of at today. Both
 *     are stored as plain comparable strings (a date-only `YYYY-MM-DD` and an
 *     ISO-8601 UTC instant), so the comparison carries no timezone assumption of
 *     its own and no new column, table or index is involved. It inherits the
 *     approximation those columns imply, which the kernel contract spells out
 *     and the Analytics surface prints: a due date changed since, or a Task
 *     deleted since, is read as it stands now.
 *
 * No caller-supplied value is interpolated into SQL. Ids, periods, instants and
 * limits are BOUND; entity types, structural link types and Activity types are
 * inlined as trusted kernel constants, exactly as `D1AlignmentRepository` and
 * `D1ProjectHealthRepository` already do.
 */

import {
  MAX_CARRY_OVER_TASKS,
  MAX_CONTRIBUTION_ROWS,
  MAX_OVERDUE_MOMENTS,
  MAX_TREND_PERIODS,
  parseReviewInsightSnapshot,
  serializeReviewInsightSnapshot,
  type CarryOverTaskFact,
  type PeriodContributionRow,
  type PeriodCountRequest,
  type PeriodCountResult,
  type PeriodOverdueResult,
  type ReviewInsightRepository,
  type ReviewInsightSnapshot,
  type ReviewPeriodWindow,
  type StoredReviewInsightSnapshot,
} from "~/kernel/review-insights";
import {
  GOAL,
  GOAL_BELONGS_TO_AREA,
  GOAL_COMPLETED,
  PROJECT,
  PROJECT_ADVANCES_GOAL,
  PROJECT_BELONGS_TO_AREA,
  PROJECT_COMPLETED,
  TASK,
  TASK_BELONGS_TO_AREA,
  TASK_BELONGS_TO_PROJECT,
  TASK_COMPLETED,
} from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { countPrimarySubjectsByTypeInBuckets } from "./history-window-read";
import { GRAIN_MAXIMUMS } from "~/kernel/history";

interface ContributionRow {
  readonly project_id: string | null;
  readonly project_title: string | null;
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly area_id: string | null;
  readonly area_title: string | null;
  readonly tasks_completed: number;
}

interface CarryOverRow {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly project_id: string | null;
  readonly project_title: string | null;
  readonly sort_key: string;
}

interface CarryOverCountRow {
  readonly overdue: number;
  readonly waiting: number;
}

interface SnapshotRow {
  readonly review_id: string;
  readonly captured_at: string;
  readonly facts_json: string;
}

/** Reject an unusable id before it reaches SQL. A Review id is an opaque
 * entity id; an empty or non-string value is a caller bug, not a lookup. */
function requireReviewId(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("reviewId must be a non-empty string");
  }
  return value;
}

function clampLimit(limit: number, max: number): number {
  const value = Math.trunc(limit);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, max);
}

export class D1ReviewInsightRepository implements ReviewInsightRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  /* ---------------------------------------------------------------------- */
  /* (1) Historical completions — exact, from the Activity stream            */
  /* ---------------------------------------------------------------------- */

  /**
   * HARDEN-06C (F-07) — the count is of EVENTS, not of surviving records.
   *
   * This scan used to join `entities … AND e.deleted_at IS NULL`, so a
   * soft-deleted record silently left every historical bucket: a weekly Review
   * that said "3 Tasks completed" said "2" after the owner tidied up, and the
   * Analytics trend moved with it. That contradicted the guarantee this
   * repository's own contract makes one layer up — exact for every period, past
   * or present, because completion events are never rewritten.
   *
   * The join REMAINS, because `e.type` is what stops a `project.completed` event
   * that also names its Area being counted as an Area completion; only the
   * liveness predicate is gone. A soft-deleted record keeps its `entities` row,
   * and the one path that removes the row (an EMPTY Area's permanent deletion)
   * removes its `activity_subjects` in the same batch — so a record with no row
   * has no events either, and nothing is double-counted or orphaned.
   *
   * `listPeriodContributions` deliberately KEEPS its liveness predicate: it
   * groups completions by living Project/Goal/Area ancestry, which a deleted
   * record does not have. The two answer different questions.
   */
  async countPeriodCompletions(
    requests: readonly PeriodCountRequest[],
  ): Promise<readonly PeriodCountResult[]> {
    const wanted = requests.slice(0, MAX_TREND_PERIODS);
    if (wanted.length === 0) return [];

    /*
     * V2.9 INS-01 — this read CONVERGED onto the ONE windowed Activity read
     * (`history-window-read.ts`, DEBT-238). It had carried its own
     * `occurred_at` predicate since REVIEW-03, and it was asking exactly the
     * question the kernel's `countByTypeInBuckets` now asks: distinct
     * primary-subject entities per (period, completion event type), with no
     * liveness filter so a closed period's figures never move.
     *
     * Two things changed shape and NEITHER changed the answer: the Review's
     * own kernel tests (`test/kernel/review-insights.test.ts`), written against
     * the old shape, pass unchanged through the converged read, and
     * `test/kernel/history-kernel.test.ts` pins the new shape's counts on a
     * fixture whose events are known:
     *
     *   - the period boundaries travel as one bound JSON parameter rather than
     *     as a `CASE WHEN` arm per period, so the statement no longer grows
     *     with the series. `MAX_TREND_PERIODS` is now purely the Review panel's
     *     DISPLAY bound, rather than also a limit D1's 100-bound-variable
     *     ceiling was imposing;
     *   - `COMPLETION_TYPE_MATCH`'s table of event-type-to-entity-type pairs is
     *     replaced by the primary-subject role filter, which says the same
     *     thing generically. That is why the `entities` join is gone: the event
     *     type already names the kind, and the role already names the one
     *     entity the event is about.
     *
     * Still ONE statement for the whole series, and still exact for a period
     * that ended months ago (HARDEN-06C F-07: no liveness predicate).
     */
    const counts = await countPrimarySubjectsByTypeInBuckets(
      this.#db,
      this.#workspaceId,
      [TASK_COMPLETED, PROJECT_COMPLETED, GOAL_COMPLETED],
      wanted.map((request) => ({
        key: request.key,
        startAt: request.window.startInstantIso,
        endAt: request.window.endInstantIso,
      })),
    );

    return wanted.map((request, index) => ({
      key: request.key,
      tasksCompleted: counts[index][TASK_COMPLETED] ?? 0,
      projectsCompleted: counts[index][PROJECT_COMPLETED] ?? 0,
      goalsCompleted: counts[index][GOAL_COMPLETED] ?? 0,
    }));
  }

  /* ---------------------------------------------------------------------- */
  /* (1) Historical overdue — the backlog, read at past moments               */
  /* ---------------------------------------------------------------------- */

  async countOverdueAtPeriodEnd(
    requests: readonly PeriodCountRequest[],
  ): Promise<readonly PeriodOverdueResult[]> {
    const wanted = requests.slice(0, MAX_OVERDUE_MOMENTS);
    if (wanted.length === 0) return [];

    /*
     * ONE statement for every requested moment, and it is a different SHAPE
     * from `countPeriodCompletions` for a reason worth stating.
     *
     * A completion is an EVENT: it falls in exactly one window, so the windows
     * partition the rows and a `CASE` that names the bucket lets one grouped
     * scan answer the whole series. Being overdue is a STATE, and one Task can
     * be overdue at five of the six moments asked about — the moments do not
     * partition anything. So each moment gets its own `SUM(CASE …)` COLUMN over
     * the same single scan, rather than its own row.
     *
     * That is still one statement and one pass over the workspace's tasks; the
     * column count is bounded by `MAX_OVERDUE_MOMENTS` — larger than the Review
     * panel's display bound because this is a storage bound (two bound
     * parameters per column against D1's ceiling of 100). Only the column ALIAS
     * index is generated, and it is an integer this method produced — every
     * date and instant is bound.
     */
    const columns = wanted
      .map(
        (_, index) =>
          `SUM(CASE WHEN td.due_date < ?
                     AND (sr.completed_at IS NULL OR sr.completed_at >= ?)
                    THEN 1 ELSE 0 END) AS n${index}`,
      )
      .join(",\n           ");
    const bounds = wanted.flatMap((request) => [
      request.window.periodEnd,
      request.window.endInstantIso,
    ]);

    /*
     * The scan's own filter is the WIDEST of the requested moments, so the
     * grouped columns above are computed over a set that already excludes every
     * Task no moment could count: no due date at all, cancelled, or parked.
     *
     * `completed_at` is NOT filtered here. A Task completed long ago may still
     * have been overdue at an earlier moment, and dropping it from the scan
     * would silently make history disagree with itself.
     */
    const latestDueBound = wanted.reduce(
      (latest, request) =>
        request.window.periodEnd > latest ? request.window.periodEnd : latest,
      wanted[0].window.periodEnd,
    );

    const statement = this.#db
      .prepare(
        `SELECT ${columns}
         FROM spine_records sr
         JOIN entities e
           ON e.workspace_id = sr.workspace_id AND e.id = sr.entity_id
              AND e.type = '${TASK}' AND e.deleted_at IS NULL
         JOIN task_details td
           ON td.workspace_id = sr.workspace_id AND td.entity_id = sr.entity_id
         WHERE sr.workspace_id = ? AND sr.kind = '${TASK}'
           AND td.due_date IS NOT NULL AND td.due_date < ?
           AND COALESCE(td.status, 'todo') <> 'cancelled'
           AND COALESCE(td.commitment_state, 'active') <> 'someday'`,
      )
      .bind(...bounds, this.#workspaceId, latestDueBound);

    const row = await statement.first<Record<string, number | null>>();
    return wanted.map((request, index) => ({
      key: request.key,
      overdue: Number(row?.[`n${index}`] ?? 0),
    }));
  }

  /* ---------------------------------------------------------------------- */
  /* (1) Where the completed work landed                                     */
  /* ---------------------------------------------------------------------- */

  async listPeriodContributions(
    window: ReviewPeriodWindow,
    limit: number,
  ): Promise<readonly PeriodContributionRow[]> {
    const bounded = clampLimit(limit, MAX_CONTRIBUTION_ROWS);
    /*
     * The Area is resolved by the spine's own precedence: a Task's Project may
     * sit directly in an Area, or advance a Goal that does; a Task with no
     * Project may float in an Area itself. COALESCE encodes exactly that order,
     * so this can never disagree with how the hierarchy is read elsewhere.
     */
    const statement = this.#db
      .prepare(
        `WITH completed AS (
           SELECT DISTINCT s.entity_id AS task_id
           FROM activities a
           JOIN activity_subjects s
             ON s.workspace_id = a.workspace_id AND s.activity_id = a.id
           JOIN entities e
             ON e.workspace_id = s.workspace_id AND e.id = s.entity_id
                AND e.type = '${TASK}' AND e.deleted_at IS NULL
           WHERE a.workspace_id = ? AND a.type = '${TASK_COMPLETED}'
             AND a.occurred_at >= ? AND a.occurred_at < ?
         )
         SELECT p.id AS project_id, p.title AS project_title,
                g.id AS goal_id, g.title AS goal_title,
                COALESCE(pa.id, ga.id, ta.id) AS area_id,
                COALESCE(pa.title, ga.title, ta.title) AS area_title,
                COUNT(*) AS tasks_completed
         FROM completed c
         LEFT JOIN entity_links tp
           ON tp.workspace_id = ? AND tp.source_entity_id = c.task_id
              AND tp.type = '${TASK_BELONGS_TO_PROJECT}' AND tp.deleted_at IS NULL
         LEFT JOIN entities p
           ON p.workspace_id = ? AND p.id = tp.target_entity_id
              AND p.type = '${PROJECT}' AND p.deleted_at IS NULL
         LEFT JOIN entity_links pg
           ON pg.workspace_id = ? AND pg.source_entity_id = p.id
              AND pg.type = '${PROJECT_ADVANCES_GOAL}' AND pg.deleted_at IS NULL
         LEFT JOIN entities g
           ON g.workspace_id = ? AND g.id = pg.target_entity_id
              AND g.type = '${GOAL}' AND g.deleted_at IS NULL
         LEFT JOIN entity_links pal
           ON pal.workspace_id = ? AND pal.source_entity_id = p.id
              AND pal.type = '${PROJECT_BELONGS_TO_AREA}' AND pal.deleted_at IS NULL
         LEFT JOIN entities pa
           ON pa.workspace_id = ? AND pa.id = pal.target_entity_id AND pa.deleted_at IS NULL
         LEFT JOIN entity_links gal
           ON gal.workspace_id = ? AND gal.source_entity_id = g.id
              AND gal.type = '${GOAL_BELONGS_TO_AREA}' AND gal.deleted_at IS NULL
         LEFT JOIN entities ga
           ON ga.workspace_id = ? AND ga.id = gal.target_entity_id AND ga.deleted_at IS NULL
         LEFT JOIN entity_links tal
           ON tal.workspace_id = ? AND tal.source_entity_id = c.task_id
              AND tal.type = '${TASK_BELONGS_TO_AREA}' AND tal.deleted_at IS NULL
         LEFT JOIN entities ta
           ON ta.workspace_id = ? AND ta.id = tal.target_entity_id AND ta.deleted_at IS NULL
         GROUP BY project_id, goal_id, area_id
         ORDER BY tasks_completed DESC,
                  COALESCE(project_id, ''), COALESCE(goal_id, ''), COALESCE(area_id, '')
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        window.startInstantIso,
        window.endInstantIso,
        ...Array<string>(10).fill(this.#workspaceId),
        bounded,
      );

    const result = await statement.all<ContributionRow>();
    return (result.results ?? []).map((row) => ({
      projectId: row.project_id,
      projectTitle: row.project_title,
      goalId: row.goal_id,
      goalTitle: row.goal_title,
      areaId: row.area_id,
      areaTitle: row.area_title,
      tasksCompleted: Number(row.tasks_completed ?? 0),
    }));
  }

  /* ---------------------------------------------------------------------- */
  /* (2) Carry-over — exact current state                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * The shared predicate for "already a commitment before this period, still
   * open now". `cancelled` and `someday` work is excluded deliberately: a Task
   * the owner has parked or dropped is not an unfinished commitment, and
   * counting it would turn a considered decision into a nag.
   *
   * Both binds are the period's FIRST wall-calendar day. A due date is stored
   * date-only, so the comparison is a plain string compare with no timezone
   * involved; `waiting_since` is an instant, so its date part is taken first.
   */
  static readonly #CARRY_OVER_PREDICATE = `
      sr.workspace_id = ? AND sr.kind = '${TASK}' AND sr.completed_at IS NULL
      AND COALESCE(td.status, 'todo') <> 'cancelled'
      AND COALESCE(td.commitment_state, 'active') <> 'someday'
      AND (
        (td.due_date IS NOT NULL AND td.due_date < ?)
        OR (td.waiting_since IS NOT NULL AND substr(td.waiting_since, 1, 10) < ?)
      )`;

  async listCarryOverTasks(
    window: ReviewPeriodWindow,
    limit: number,
  ): Promise<readonly CarryOverTaskFact[]> {
    const bounded = clampLimit(limit, MAX_CARRY_OVER_TASKS);
    const statement = this.#db
      .prepare(
        `SELECT e.id AS id, e.title AS title,
                CASE WHEN td.due_date IS NOT NULL AND td.due_date < ?
                     THEN 'overdue' ELSE 'waiting' END AS kind,
                p.id AS project_id, p.title AS project_title,
                COALESCE(td.due_date, substr(td.waiting_since, 1, 10)) AS sort_key
         FROM spine_records sr
         JOIN entities e
           ON e.workspace_id = sr.workspace_id AND e.id = sr.entity_id
              AND e.type = '${TASK}' AND e.deleted_at IS NULL
         LEFT JOIN task_details td
           ON td.workspace_id = sr.workspace_id AND td.entity_id = sr.entity_id
         LEFT JOIN entity_links tp
           ON tp.workspace_id = sr.workspace_id AND tp.source_entity_id = sr.entity_id
              AND tp.type = '${TASK_BELONGS_TO_PROJECT}' AND tp.deleted_at IS NULL
         LEFT JOIN entities p
           ON p.workspace_id = sr.workspace_id AND p.id = tp.target_entity_id
              AND p.type = '${PROJECT}' AND p.deleted_at IS NULL
         WHERE ${D1ReviewInsightRepository.#CARRY_OVER_PREDICATE}
         ORDER BY sort_key ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(
        window.periodStart,
        this.#workspaceId,
        window.periodStart,
        window.periodStart,
        bounded,
      );
    const result = await statement.all<CarryOverRow>();
    return (result.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind === "overdue" ? "overdue" : "waiting",
      projectId: row.project_id,
      projectTitle: row.project_title,
    }));
  }

  async countCarryOverTasks(
    window: ReviewPeriodWindow,
  ): Promise<{ readonly overdue: number; readonly waiting: number }> {
    /*
     * The two arms partition the same predicate: a Task that is BOTH overdue
     * and long-waiting is counted once, as overdue, because that is the more
     * actionable of the two. So `overdue + waiting` is the total and neither
     * number double-counts.
     */
    const statement = this.#db
      .prepare(
        `SELECT
           SUM(CASE WHEN td.due_date IS NOT NULL AND td.due_date < ? THEN 1 ELSE 0 END) AS overdue,
           SUM(CASE WHEN td.due_date IS NOT NULL AND td.due_date < ? THEN 0 ELSE 1 END) AS waiting
         FROM spine_records sr
         JOIN entities e
           ON e.workspace_id = sr.workspace_id AND e.id = sr.entity_id
              AND e.type = '${TASK}' AND e.deleted_at IS NULL
         LEFT JOIN task_details td
           ON td.workspace_id = sr.workspace_id AND td.entity_id = sr.entity_id
         WHERE ${D1ReviewInsightRepository.#CARRY_OVER_PREDICATE}`,
      )
      .bind(
        window.periodStart,
        window.periodStart,
        this.#workspaceId,
        window.periodStart,
        window.periodStart,
      );
    const row = await statement.first<CarryOverCountRow>();
    return {
      overdue: Number(row?.overdue ?? 0),
      waiting: Number(row?.waiting ?? 0),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* (3) The snapshot                                                        */
  /* ---------------------------------------------------------------------- */

  async getSnapshot(
    reviewId: string,
  ): Promise<StoredReviewInsightSnapshot | null> {
    const id = requireReviewId(reviewId);
    const row = await this.#db
      .prepare(
        `SELECT review_id, captured_at, facts_json
         FROM review_insight_snapshots
         WHERE workspace_id = ? AND review_id = ?`,
      )
      .bind(this.#workspaceId, id)
      .first<SnapshotRow>();
    return row === null ? null : this.#toStored(row);
  }

  async listSnapshotsBefore(
    beforePeriodEnd: string,
    limit: number,
  ): Promise<readonly StoredReviewInsightSnapshot[]> {
    const bounded = clampLimit(limit, MAX_TREND_PERIODS);
    const result = await this.#db
      .prepare(
        `SELECT review_id, captured_at, facts_json
         FROM review_insight_snapshots
         WHERE workspace_id = ? AND period_end < ?
         ORDER BY period_end DESC, captured_at DESC, review_id DESC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, beforePeriodEnd, bounded)
      .all<SnapshotRow>();
    const stored: StoredReviewInsightSnapshot[] = [];
    for (const row of result.results ?? []) {
      const parsed = this.#toStored(row);
      if (parsed !== null) stored.push(parsed);
    }
    return stored;
  }

  /**
   * V2.9 INS-01 — the anchor Review's snapshot and the ones before it, oldest
   * first, in ONE statement (INS-02's source).
   *
   * ── The same-type rule is enforced in SQL, not remembered by a caller ─────
   * The series joins each snapshot back to its `review_details` row and keeps
   * only those whose `review_type` matches the anchor's. A monthly Review
   * therefore never appears in a weekly Review's trend — a period four times
   * the length would make "at risk in 3 of the last 4" a comparison of unlike
   * things while looking exactly like a comparison of like ones. Putting the
   * rule here means a future caller cannot forget it.
   *
   * ── Ordering and inclusion ────────────────────────────────────────────────
   * The anchor's own snapshot is included when it has one; everything else must
   * end strictly before the anchor's period **START**, so a Review is never
   * compared with one covering the same days.
   *
   * That comparison is against the start rather than the end deliberately, and
   * it is the SAME rule the comparison series already applies in JavaScript
   * (`readPriorReviews`: `candidate.periodEnd < input.review.periodStart`).
   * Overlapping periods are permitted — `validateReviewPeriod` and the create
   * form both allow them — so comparing against the anchor's END would admit a
   * Review that ends a day earlier but starts inside the anchor's own period,
   * and the panel would report two overlapping Reviews as consecutive history
   * while the trend beside it disagreed. Two reads answering "which Reviews came
   * before this one" must answer it identically.
   *
   * Ties break on `(period_end, captured_at,
   * review_id)` exactly as `listSnapshotsBefore` breaks them — one ordering
   * rule, two reads. The database returns newest first (that is the order the
   * `LIMIT` must apply in, since a series is the most RECENT n) and the result
   * is reversed to Review order.
   *
   * A snapshot whose `facts_json` this build cannot parse is SKIPPED, which
   * shortens the series rather than leaving a hole — the same fail-soft
   * `listSnapshotsBefore` has, and the reason the panel says "over the last N
   * Reviews" with the N it actually holds (ADR-079 decision 5).
   */
  async listSnapshotSeries(
    reviewId: string,
    n: number,
  ): Promise<readonly StoredReviewInsightSnapshot[]> {
    const id = requireReviewId(reviewId);
    // Bounded by the kernel's own maximum for the review_period grain, NOT by
    // the Review panel's eight: `MAX_TREND_PERIODS` is a display bound, and a
    // read that imposed it would leave `bucketPeriods` unable to ever report a
    // bound of its own (found by review).
    const bounded = clampLimit(n, GRAIN_MAXIMUMS.review_period);
    const result = await this.#db
      .prepare(
        `WITH anchor AS (
           SELECT review_type, period_start
           FROM review_details
           WHERE workspace_id = ? AND entity_id = ?
         )
         SELECT s.review_id, s.captured_at, s.facts_json
         FROM review_insight_snapshots s
         JOIN review_details rd
           ON rd.workspace_id = s.workspace_id AND rd.entity_id = s.review_id
         JOIN entities e
           ON e.workspace_id = s.workspace_id AND e.id = s.review_id
          AND e.deleted_at IS NULL
         JOIN anchor a ON rd.review_type = a.review_type
         WHERE s.workspace_id = ?
           AND (
             s.review_id = ?
             OR (
               s.period_end < a.period_start
               AND rd.status = 'completed'
               AND rd.archived_at IS NULL
             )
           )
         ORDER BY s.period_end DESC, s.captured_at DESC, s.review_id DESC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, id, this.#workspaceId, id, bounded)
      .all<SnapshotRow>();
    const stored: StoredReviewInsightSnapshot[] = [];
    for (const row of result.results ?? []) {
      const parsed = this.#toStored(row);
      if (parsed !== null) stored.push(parsed);
    }
    // Review order: oldest first, the direction a series is read and drawn.
    return stored.reverse();
  }

  async saveSnapshot(
    reviewId: string,
    snapshot: ReviewInsightSnapshot,
  ): Promise<boolean> {
    const id = requireReviewId(reviewId);
    /*
     * The INSERT is guarded by a SELECT over `review_details` in the same
     * statement, so a Review in another workspace writes nothing rather than
     * raising a foreign-key error a completion would then have to swallow.
     */
    const result = await this.#db
      .prepare(
        `INSERT INTO review_insight_snapshots
           (workspace_id, review_id, version, period_start, period_end, captured_at, facts_json)
         SELECT rd.workspace_id, rd.entity_id, ?, ?, ?, ?, ?
         FROM review_details rd
         WHERE rd.workspace_id = ? AND rd.entity_id = ?
         ON CONFLICT (workspace_id, review_id) DO UPDATE SET
           version = excluded.version,
           period_start = excluded.period_start,
           period_end = excluded.period_end,
           captured_at = excluded.captured_at,
           facts_json = excluded.facts_json`,
      )
      .bind(
        snapshot.version,
        snapshot.periodStart,
        snapshot.periodEnd,
        toStorageTimestamp(new Date()),
        serializeReviewInsightSnapshot(snapshot),
        this.#workspaceId,
        id,
      )
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  #toStored(row: SnapshotRow): StoredReviewInsightSnapshot | null {
    const snapshot = parseReviewInsightSnapshot(row.facts_json);
    if (snapshot === null) return null;
    return {
      reviewId: row.review_id,
      capturedAt: fromStorageTimestamp(row.captured_at),
      snapshot,
    };
  }
}
