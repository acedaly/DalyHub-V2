import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  serializeActivityPayload,
  type ActivityActorContext,
  type ActivityPayload,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  REVIEW_ARCHIVED,
  REVIEW_COMPLETED,
  REVIEW_CREATED,
  REVIEW_DELETED,
  REVIEW_ENTITY_TYPE,
  REVIEW_REOPENED,
  REVIEW_RESTORED,
  REVIEW_SECTION_IDS,
  REVIEW_STATUS_CHANGED,
  REVIEW_UPDATED,
  WEEKLY_REVIEW_STEP_IDS,
  ReviewArchivedError,
  ReviewConflictError,
  ReviewError,
  ReviewNotFoundError,
  ReviewStorageError,
  ReviewValidationError,
  defaultReviewTitle,
  decodeReviewCursorForScope,
  emptyReviewWorkflowState,
  encodeReviewCursor,
  normaliseReviewQuery,
  parseReviewSort,
  parseReviewType,
  parseReviewSectionId,
  parseReviewStatus,
  parseReviewView,
  parseWeeklyReviewStepId,
  resolveReviewTemplate,
  reviewTemplateId,
  validateReviewId,
  validateReviewLimit,
  validateReviewPeriod,
  validateReviewTitle,
  validateSectionContent,
  validateTemplateId,
  weeklyReviewStep,
  type CreateReviewInput,
  type CreateReviewResult,
  type ListReviewsInput,
  type Review,
  type ReviewChangeResult,
  type ReviewCursorScope,
  type ReviewDeleteResult,
  type ReviewLifecycleResult,
  type ReviewPage,
  type ReviewPeriodEntry,
  type ReviewRepository,
  type ReviewSection,
  type ReviewSectionId,
  type ReviewStatus,
  type ReviewType,
  type ReviewWorkflowState,
  type ReviewWorkflowStateResult,
  type SetReviewWorkflowStepOptions,
  type UpdateReviewSectionOptions,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";
import {
  secureIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { likeContains } from "./like-pattern";

export type D1ReviewCreateFault = "after-entity" | "after-details";

/**
 * TEST-ONLY deterministic purge-batch failure injection. Never set in production.
 *
 * `after-entity` fails BETWEEN the `entities` DELETE and the tombstone insert;
 * `after-tombstone` fails AFTER both. Either proves the destruction and its audit
 * event commit or roll back as one unit.
 */
export type D1ReviewDeleteFault = "after-entity" | "after-tombstone";

export interface D1ReviewRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  readonly createFault?: D1ReviewCreateFault;
  readonly mutationFault?: AtomicMutationFault;
  /** TEST-ONLY purge-batch fault (proves the purge + tombstone roll back). */
  readonly deleteFault?: D1ReviewDeleteFault;
}

interface ReviewRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly entity_updated_at: string;
  readonly deleted_at: string | null;
  readonly review_type: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly status: string;
  readonly template_id: string;
  readonly completed_at: string | null;
  readonly archived_at: string | null;
  readonly detail_updated_at: string;
  readonly effective_updated_at: string;
  readonly sort_primary?: string;
}

interface PeriodEntryRow {
  readonly id: string;
  readonly title: string;
  readonly review_type: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly status: string;
  readonly archived_at: string | null;
}

interface SectionRow {
  readonly review_id: string;
  readonly section_id: string;
  readonly body_markdown: string;
  readonly updated_at: string;
}

const SUBJECT_ROLE = "subject";
const READ_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.title AS title,
  e.created_at AS created_at,
  e.updated_at AS entity_updated_at,
  e.deleted_at AS deleted_at,
  d.review_type AS review_type,
  d.period_start AS period_start,
  d.period_end AS period_end,
  d.status AS status,
  d.template_id AS template_id,
  d.completed_at AS completed_at,
  d.archived_at AS archived_at,
  d.updated_at AS detail_updated_at,
  max(
    e.updated_at,
    d.updated_at,
    coalesce((SELECT max(rs.updated_at)
              FROM review_sections rs
              WHERE rs.workspace_id = e.workspace_id AND rs.review_id = e.id), d.updated_at)
  ) AS effective_updated_at`;

const EFFECTIVE_UPDATED_EXPR = `max(
  e.updated_at,
  d.updated_at,
  coalesce((SELECT max(rs.updated_at)
            FROM review_sections rs
            WHERE rs.workspace_id = e.workspace_id AND rs.review_id = e.id), d.updated_at)
)`;

/**
 * STEER-05 — the ONE predicate that identifies "the Review for this period".
 *
 * `create` reads it to stay idempotent and `findPeriodEntry` reads it to answer
 * a surface's "is there one?". Stated once so the two cannot drift into
 * disagreeing about whether a Review already exists for the owner's week.
 */
const PERIOD_MATCH = `e.workspace_id = ? AND e.type = '${REVIEW_ENTITY_TYPE}'
   AND d.review_type = ? AND d.period_start = ? AND d.period_end = ?`;

function uniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  );
}

export class D1ReviewRepository implements ReviewRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #createFault?: D1ReviewCreateFault;
  readonly #mutationFault?: AtomicMutationFault;
  readonly #deleteFault?: D1ReviewDeleteFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1ReviewRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#createFault = options.createFault;
    this.#mutationFault = options.mutationFault;
    this.#deleteFault = options.deleteFault;
  }

  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_review_forced_fault__");
  }

  async create(input: CreateReviewInput): Promise<CreateReviewResult> {
    const { type, periodStart, periodEnd } = validateReviewPeriod(input);
    const templateId = validateTemplateId(
      input.templateId ?? reviewTemplateId(type),
    );
    const title = input.title
      ? validateReviewTitle(input.title)
      : defaultReviewTitle({
          type,
          periodStart,
          periodEnd,
          dateFormat: DEFAULT_APP_PREFERENCES.dateFormat,
        });

    const existing =
      type === "custom"
        ? null
        : await this.#findByPeriod(type, periodStart, periodEnd);
    if (existing) {
      if (existing.archivedAt) {
        const restored = await this.restore(existing.id);
        return { review: restored.review, outcome: "existing_restored" };
      }
      return { review: existing, outcome: "existing" };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();
    const template = resolveReviewTemplate(type);

    const entity = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, '${REVIEW_ENTITY_TYPE}', ?, ?, ?, NULL)`,
      )
      .bind(id, this.#workspaceId, title, nowTs, nowTs);
    const details = this.#db
      .prepare(
        `INSERT INTO review_details
           (workspace_id, entity_id, review_type, period_start, period_end,
            status, template_id, completed_at, archived_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, ?)`,
      )
      .bind(
        this.#workspaceId,
        id,
        type,
        periodStart,
        periodEnd,
        templateId,
        nowTs,
      );
    const sections = template.sections.map((section) =>
      this.#db
        .prepare(
          `INSERT INTO review_sections
             (workspace_id, review_id, section_id, body_markdown, updated_at)
           VALUES (?, ?, ?, '', ?)`,
        )
        .bind(this.#workspaceId, id, section.id, nowTs),
    );
    const event = this.#activity(
      REVIEW_CREATED,
      id,
      {
        reviewType: type,
        periodStart,
        periodEnd,
        templateId,
      },
      now,
    );
    const append = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      event,
    );

    const batch: D1PreparedStatement[] = [entity];
    if (this.#createFault === "after-entity") batch.push(this.#forcedFailure());
    batch.push(details);
    if (this.#createFault === "after-details")
      batch.push(this.#forcedFailure());
    batch.push(...sections, ...append);

    try {
      await this.#db.batch(batch);
    } catch (cause) {
      if (uniqueConstraint(cause) && type !== "custom") {
        const raced = await this.#findByPeriod(type, periodStart, periodEnd);
        if (raced) return { review: raced, outcome: "existing" };
      }
      throw new ReviewStorageError({ cause });
    }

    const review = await this.get(id);
    if (!review) throw new ReviewStorageError();
    return { review, outcome: "created" };
  }

  async get(
    id: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<Review | null> {
    const reviewId = validateReviewId(id);
    const deletedClause = options.includeDeleted
      ? ""
      : " AND e.deleted_at IS NULL";
    try {
      const row = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}
           FROM entities e
           JOIN review_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${REVIEW_ENTITY_TYPE}'${deletedClause}
           LIMIT 1`,
        )
        .bind(this.#workspaceId, reviewId)
        .first<ReviewRow>();
      if (!row) return null;
      const sections = await this.#sectionsForIds([row.id]);
      return this.#rowToReview(row, sections.get(row.id) ?? []);
    } catch (cause) {
      if (cause instanceof ReviewError) throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  async list(input: ListReviewsInput = {}): Promise<ReviewPage> {
    const view = parseReviewView(input.view);
    const sort = parseReviewSort(input.sort);
    const query = normaliseReviewQuery(input.query);
    const limit = validateReviewLimit(input.limit);
    const type =
      input.type && input.type !== "all" ? parseReviewType(input.type) : "all";
    const today = input.today ?? null;

    const scope: ReviewCursorScope = {
      workspaceId: this.#workspaceId,
      view,
      type,
      query,
      sort,
      today,
    };
    const conditions = [
      "e.workspace_id = ?",
      `e.type = '${REVIEW_ENTITY_TYPE}'`,
      "e.deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId];
    if (view === "archived") {
      conditions.push("d.archived_at IS NOT NULL");
    } else {
      conditions.push("d.archived_at IS NULL");
    }
    if (view === "current" && today) {
      conditions.push("d.period_start <= ? AND d.period_end >= ?");
      params.push(today, today);
    } else if (view === "in_progress") {
      conditions.push("d.status IN ('draft', 'in_progress')");
    } else if (view === "completed") {
      conditions.push("d.status = 'completed'");
    }
    if (type !== "all") {
      conditions.push("d.review_type = ?");
      params.push(type);
    }
    if (query) {
      conditions.push("lower(e.title) LIKE ? ESCAPE '\\'");
      params.push(likeContains(query));
    }

    const expr = sort === "period" ? "d.period_start" : EFFECTIVE_UPDATED_EXPR;
    const dir = "DESC";
    if (input.cursor) {
      const position = decodeReviewCursorForScope(input.cursor, scope);
      conditions.push(`(${expr} < ? OR (${expr} = ? AND e.id < ?))`);
      params.push(position.primary, position.primary, position.id);
    }
    params.push(limit + 1);

    try {
      const result = await this.#db
        .prepare(
          `SELECT * FROM (
             SELECT ${READ_COLUMNS}, ${expr} AS sort_primary
             FROM entities e
             JOIN review_details d
               ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
             WHERE ${conditions.join(" AND ")}
           )
           ORDER BY sort_primary ${dir}, id ${dir}
           LIMIT ?`,
        )
        .bind(...params)
        .all<ReviewRow>();
      const rows = result.results;
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const sectionMap = await this.#sectionsForIds(pageRows.map((r) => r.id));
      const items = pageRows.map((row) =>
        this.#rowToReview(row, sectionMap.get(row.id) ?? []),
      );
      const last = pageRows.at(-1);
      const nextCursor =
        hasMore && last
          ? encodeReviewCursor(scope, {
              primary: last.sort_primary ?? "",
              id: last.id,
            })
          : null;
      return { items, hasMore, nextCursor };
    } catch (cause) {
      if (cause instanceof ReviewError) throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  /**
   * STEER-05 — one bounded statement: is there a Review for exactly this period?
   *
   * The same `PERIOD_MATCH` predicate `create` reads, so a surface offering a
   * door and the creation path that would open it can never disagree about
   * whether the owner's week already has a Review. No section bodies are read:
   * the caller asked a yes/no question and gets the four facts a door needs.
   */
  async findPeriodEntry(
    type: Exclude<ReviewType, "custom">,
    periodStart: string,
    periodEnd: string,
  ): Promise<ReviewPeriodEntry | null> {
    const period = validateReviewPeriod({ type, periodStart, periodEnd });
    try {
      const row = await this.#db
        .prepare(
          `SELECT e.id AS id, e.title AS title, d.review_type AS review_type,
                  d.period_start AS period_start, d.period_end AS period_end,
                  d.status AS status, d.archived_at AS archived_at
           FROM entities e
           JOIN review_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE ${PERIOD_MATCH} AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(
          this.#workspaceId,
          period.type,
          period.periodStart,
          period.periodEnd,
        )
        .first<PeriodEntryRow>();
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        type: parseReviewType(row.review_type),
        periodStart: row.period_start,
        periodEnd: row.period_end,
        status: parseReviewStatus(row.status),
        archived: row.archived_at !== null,
      };
    } catch (cause) {
      if (cause instanceof ReviewError) throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  async updateTitle(id: string, title: string): Promise<ReviewChangeResult> {
    const reviewId = validateReviewId(id);
    const safeTitle = validateReviewTitle(title);
    const current = await this.get(reviewId);
    if (!current) throw new ReviewNotFoundError();
    if (current.archivedAt) throw new ReviewArchivedError();
    if (current.title === safeTitle) return { review: current, changed: false };

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const entityUpdate = this.#db
      .prepare(
        `UPDATE entities
         SET title = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND type = '${REVIEW_ENTITY_TYPE}'
           AND deleted_at IS NULL
           AND title IS NOT ?`,
      )
      .bind(safeTitle, nowTs, this.#workspaceId, reviewId, safeTitle);
    const detailUpdate = this.#db
      .prepare(
        `UPDATE review_details SET updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?`,
      )
      .bind(nowTs, this.#workspaceId, reviewId);
    const event = this.#activity(
      REVIEW_UPDATED,
      reviewId,
      { fields: ["title"] },
      now,
    );
    const append = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      event,
    );

    try {
      await this.#db.batch([entityUpdate, detailUpdate, ...append]);
      const refreshed = await this.get(reviewId);
      if (!refreshed) throw new ReviewStorageError();
      return { review: refreshed, changed: true };
    } catch (cause) {
      if (cause instanceof ReviewError || cause instanceof ActivityError)
        throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  async updateSection(
    id: string,
    sectionId: ReviewSectionId,
    body: string,
    options: UpdateReviewSectionOptions = {},
  ): Promise<ReviewChangeResult> {
    const reviewId = validateReviewId(id);
    const safeSection = parseReviewSectionId(sectionId);
    const content = validateSectionContent(body);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    /**
     * REVIEW-02 — optimistic concurrency on authored reflection, and ONLY here.
     *
     * When the caller quotes the `updatedAt` it loaded, the write becomes a
     * compare-and-set: the extra `AND updated_at = ?` clause makes a stale write
     * match zero rows, and the post-check below turns that into a
     * `ReviewConflictError` rather than a silent success. Without it the phone
     * and the desktop would both write blindly and the later save would erase
     * writing the owner cannot recover. Callers with no base version (the Review
     * record's own section editors) omit it and keep the original behaviour.
     */
    const expected =
      options.expectedUpdatedAt !== undefined
        ? toStorageTimestamp(options.expectedUpdatedAt)
        : null;
    const versionGuard = expected === null ? "" : " AND updated_at = ?";
    const versionBinds = expected === null ? [] : [expected];

    const domainStatement = this.#db
      .prepare(
        `UPDATE review_sections
         SET body_markdown = ?, updated_at = ?
         WHERE workspace_id = ? AND review_id = ? AND section_id = ?
           AND EXISTS (
             SELECT 1 FROM review_details d
             JOIN entities e ON e.workspace_id = d.workspace_id AND e.id = d.entity_id
             WHERE d.workspace_id = ? AND d.entity_id = ?
               AND e.deleted_at IS NULL AND d.archived_at IS NULL
           )
           AND body_markdown IS NOT ?${versionGuard}
         RETURNING review_id`,
      )
      .bind(
        content,
        nowTs,
        this.#workspaceId,
        reviewId,
        safeSection,
        this.#workspaceId,
        reviewId,
        content,
        ...versionBinds,
      );
    const event = this.#activity(
      REVIEW_UPDATED,
      reviewId,
      { sections: [safeSection] },
      now,
    );
    let result;
    try {
      const model = event;
      result = await recordAtomicMutation<{ review_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof ReviewError || cause instanceof ActivityError)
        throw cause;
      throw new ReviewStorageError({ cause });
    }
    const refreshed = await this.get(reviewId);
    if (!refreshed) throw new ReviewNotFoundError();
    if (refreshed.archivedAt) throw new ReviewArchivedError();
    if (expected !== null && !result.changed) {
      // Nothing was written. Either the body is already exactly this text (a
      // genuine, harmless no-op) or the row moved on under us — which is the one
      // case that must never be reported as a save.
      const stored = refreshed.sections.find(
        (section) => section.sectionId === safeSection,
      );
      const storedTs = stored ? toStorageTimestamp(stored.updatedAt) : null;
      if (storedTs !== expected && stored?.body !== content) {
        throw new ReviewConflictError();
      }
    }
    return { review: refreshed, changed: result.changed };
  }

  /* ---------------------------------------------------------------------- */
  /* REVIEW-02 — the guided flow's small workflow state                      */
  /*                                                                        */
  /* Two child tables, no Activity, nothing derivable stored. Every read and */
  /* write is workspace-scoped and refuses to touch a Review that is not a   */
  /* live Review in THIS workspace, so the guided flow can never reach       */
  /* across an isolation boundary the rest of the module respects.          */
  /* ---------------------------------------------------------------------- */

  async getWorkflowState(reviewId: string): Promise<ReviewWorkflowState> {
    const id = validateReviewId(reviewId);
    try {
      const [stateRow, ackRows] = await Promise.all([
        this.#db
          .prepare(
            `SELECT current_step, revision, updated_at
             FROM review_workflow_state
             WHERE workspace_id = ? AND review_id = ?`,
          )
          .bind(this.#workspaceId, id)
          .first<{
            current_step: string;
            revision: number;
            updated_at: string;
          }>(),
        this.#db
          .prepare(
            `SELECT step_id FROM review_step_acknowledgements
             WHERE workspace_id = ? AND review_id = ?`,
          )
          .bind(this.#workspaceId, id)
          .all<{ step_id: string }>(),
      ]);
      const acknowledgedSteps = WEEKLY_REVIEW_STEP_IDS.filter((stepId) =>
        (ackRows.results ?? []).some((row) => row.step_id === stepId),
      );
      if (!stateRow) {
        return { ...emptyReviewWorkflowState(id), acknowledgedSteps };
      }
      return {
        reviewId: id,
        // A row whose step is no longer in the vocabulary reads as "no bookmark"
        // rather than as an error: the derived position takes over.
        currentStep: parseWeeklyReviewStepId(stateRow.current_step),
        acknowledgedSteps,
        revision: stateRow.revision,
        updatedAt: fromStorageTimestamp(stateRow.updated_at),
      };
    } catch (cause) {
      if (cause instanceof ReviewError) throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  async setWorkflowStep(
    reviewId: string,
    stepId: WeeklyReviewStepId,
    options: SetReviewWorkflowStepOptions = {},
  ): Promise<ReviewWorkflowStateResult> {
    const id = validateReviewId(reviewId);
    const step = this.#requireStepId(stepId);
    const review = await this.get(id);
    if (!review) throw new ReviewNotFoundError();
    if (review.archivedAt) throw new ReviewArchivedError();

    const nowTs = toStorageTimestamp(this.#clock());
    const expected = options.expectedRevision;
    try {
      // Insert-or-update in ONE statement, guarded on the caller's expected
      // revision when one was supplied. `excluded` carries the incoming values,
      // so the revision advances monotonically and a stale writer matches nothing.
      const guard =
        expected === undefined ? "" : " AND review_workflow_state.revision = ?";
      const guardBinds = expected === undefined ? [] : [expected];
      const updated = await this.#db
        .prepare(
          `INSERT INTO review_workflow_state
             (workspace_id, review_id, current_step, revision, updated_at)
           VALUES (?, ?, ?, 1, ?)
           ON CONFLICT (workspace_id, review_id) DO UPDATE
             SET current_step = excluded.current_step,
                 revision = review_workflow_state.revision + 1,
                 updated_at = excluded.updated_at
             WHERE review_workflow_state.current_step IS NOT excluded.current_step${guard}
           RETURNING revision`,
        )
        .bind(this.#workspaceId, id, step, nowTs, ...guardBinds)
        .first<{ revision: number }>();
      const state = await this.getWorkflowState(id);
      if (updated) return { state, changed: true, conflict: false };
      // Nothing was written. Moving to the step already stored is an idempotent
      // no-op; anything else means a newer writer holds the bookmark, and the
      // caller follows `state` rather than overwriting it.
      const conflict = state.currentStep !== step;
      return { state, changed: false, conflict };
    } catch (cause) {
      if (cause instanceof ReviewError) throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  async setStepAcknowledged(
    reviewId: string,
    stepId: WeeklyReviewStepId,
    acknowledged: boolean,
  ): Promise<ReviewWorkflowStateResult> {
    const id = validateReviewId(reviewId);
    const step = this.#requireStepId(stepId);
    if (!weeklyReviewStep(step).acknowledgeable) {
      throw new ReviewValidationError(
        "stepId",
        "that step cannot be marked reviewed",
      );
    }
    const review = await this.get(id);
    if (!review) throw new ReviewNotFoundError();
    if (review.archivedAt) throw new ReviewArchivedError();

    const nowTs = toStorageTimestamp(this.#clock());
    try {
      const statement = acknowledged
        ? this.#db
            .prepare(
              `INSERT INTO review_step_acknowledgements
                 (workspace_id, review_id, step_id, acknowledged_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT (workspace_id, review_id, step_id) DO NOTHING
               RETURNING step_id`,
            )
            .bind(this.#workspaceId, id, step, nowTs)
        : this.#db
            .prepare(
              `DELETE FROM review_step_acknowledgements
               WHERE workspace_id = ? AND review_id = ? AND step_id = ?
               RETURNING step_id`,
            )
            .bind(this.#workspaceId, id, step);
      const changedRow = await statement.first<{ step_id: string }>();
      const state = await this.getWorkflowState(id);
      return { state, changed: changedRow !== null, conflict: false };
    } catch (cause) {
      if (cause instanceof ReviewError) throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  #requireStepId(value: unknown): WeeklyReviewStepId {
    const step = parseWeeklyReviewStepId(value);
    if (step === null) {
      throw new ReviewValidationError("stepId", "choose a supported step");
    }
    return step;
  }

  async setStatus(
    id: string,
    status: ReviewStatus,
  ): Promise<ReviewLifecycleResult> {
    const safe = parseReviewStatus(status);
    if (safe === "completed") return this.complete(id);
    return this.#setStatus(id, safe);
  }

  async complete(id: string): Promise<ReviewLifecycleResult> {
    return this.#setStatus(id, "completed");
  }

  async reopen(id: string): Promise<ReviewLifecycleResult> {
    return this.#setStatus(id, "in_progress");
  }

  async archive(id: string): Promise<ReviewLifecycleResult> {
    return this.#setArchived(id, true);
  }

  async restore(id: string): Promise<ReviewLifecycleResult> {
    return this.#setArchived(id, false);
  }

  /**
   * Permanently (hard) delete a Review — the guarded destructive path
   * (AUDIT-04 / DEBT-80), brought onto the Area/Asset purge standard.
   *
   * The previous implementation put the Activity append FIRST in the batch. That
   * broke the recorder's contract — its `WHERE changes() > 0` guard reads the
   * statement IMMEDIATELY BEFORE it, so a leading append saw a stale, unrelated
   * change count and fired regardless of whether anything was deleted; a raced
   * pair of purges therefore wrote TWO tombstones for one destroyed Review. The
   * batch then deleted every `activity_subjects` row for the Review, including
   * the subject it had just inserted for its own event, and it deleted ACTIVE
   * links outright instead of refusing.
   *
   * The order below is deliberate and child-first, so no `ON DELETE RESTRICT`
   * foreign key is violated:
   *
   *   1. `entity_links`      — remaining soft-deleted/historical link rows only;
   *      an ACTIVE one cannot reach here, or the guard already blocked.
   *   2. `activity_subjects` — the Review's OLD subject pointers. The `activities`
   *      rows themselves are RETAINED (append-only, ADR-012).
   *   3. `review_sections`   — the Review's section bodies.
   *   4. `review_details`    — the module-owned detail row.
   *   5. `entities`          — the entity row, with `RETURNING`; the AUTHORITATIVE
   *      statement whose `changes()` decides whether a purge happened.
   *   6. one subject-less `review.deleted` tombstone, `WHERE changes() > 0`,
   *      carrying `{ reviewId, title }`.
   *
   * Every destructive statement repeats the same "no active link" guard, so the
   * batch is strictly all-or-nothing evaluated AT COMMIT: a link created between
   * the precheck and the commit makes every statement match zero rows, nothing is
   * removed and no tombstone is written. Idempotency comes from that SQL, never
   * from catching and suppressing database errors.
   */
  async permanentlyDelete(id: string): Promise<ReviewDeleteResult> {
    const reviewId = validateReviewId(id);
    const existing = await this.get(reviewId, { includeDeleted: true });
    // Already gone: idempotent no-op that writes NOTHING — in particular no
    // second tombstone and no recreated subject pointer.
    if (!existing) return { deleted: false };
    // Captured BEFORE the purge: once the batch commits, the tombstone payload is
    // the only surviving record of WHICH Review was destroyed.
    const title = existing.title;

    // Guard: refuse while any ACTIVE relationship references the Review, so a
    // linked Area/Project/Note is never silently orphaned. The caller unlinks
    // first. Soft-deleted (historical) links do NOT block — they are the Review's
    // own dead rows and the purge removes them.
    let linkCount: number;
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS n FROM entity_links
           WHERE workspace_id = ? AND deleted_at IS NULL
             AND (source_entity_id = ? OR target_entity_id = ?)`,
        )
        .bind(this.#workspaceId, reviewId, reviewId)
        .first<{ n: number }>();
      linkCount = row?.n ?? 0;
    } catch (cause) {
      throw new ReviewStorageError({ cause });
    }
    if (linkCount > 0) {
      return { deleted: false, blockedReason: "has_links", linkCount };
    }

    // Binds (workspaceId, reviewId, reviewId) per use.
    const emptyGuard = `NOT EXISTS (
        SELECT 1 FROM entity_links gl
        WHERE gl.workspace_id = ? AND gl.deleted_at IS NULL
          AND (gl.source_entity_id = ? OR gl.target_entity_id = ?)
      )`;
    const g = [this.#workspaceId, reviewId, reviewId];

    const deleteLinks = this.#db
      .prepare(
        `DELETE FROM entity_links
         WHERE workspace_id = ? AND (source_entity_id = ? OR target_entity_id = ?)
           AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, reviewId, reviewId, ...g);
    const deleteSubjects = this.#db
      .prepare(
        `DELETE FROM activity_subjects
         WHERE workspace_id = ? AND entity_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, reviewId, ...g);
    const deleteSections = this.#db
      .prepare(
        `DELETE FROM review_sections
         WHERE workspace_id = ? AND review_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, reviewId, ...g);
    // REVIEW-02 — the guided flow's own child rows go with the Review, under the
    // same all-or-nothing guard as every other statement in the batch.
    const deleteWorkflowState = this.#db
      .prepare(
        `DELETE FROM review_workflow_state
         WHERE workspace_id = ? AND review_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, reviewId, ...g);
    const deleteAcknowledgements = this.#db
      .prepare(
        `DELETE FROM review_step_acknowledgements
         WHERE workspace_id = ? AND review_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, reviewId, ...g);
    const deleteDetails = this.#db
      .prepare(
        `DELETE FROM review_details
         WHERE workspace_id = ? AND entity_id = ? AND ${emptyGuard}`,
      )
      .bind(this.#workspaceId, reviewId, ...g);
    const deleteEntity = this.#db
      .prepare(
        `DELETE FROM entities
         WHERE workspace_id = ? AND id = ? AND type = '${REVIEW_ENTITY_TYPE}'
           AND ${emptyGuard}
         RETURNING id, title`,
      )
      .bind(this.#workspaceId, reviewId, ...g);

    const nowTs = toStorageTimestamp(this.#clock());
    let payloadJson: string;
    try {
      payloadJson = serializeActivityPayload({ reviewId, title });
    } catch (cause) {
      if (cause instanceof ActivityError) throw cause;
      throw new ReviewStorageError({ cause });
    }
    const tombstone = this.#db
      .prepare(
        `INSERT INTO activities
           (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE changes() > 0`,
      )
      .bind(
        this.#newActivityId(),
        this.#workspaceId,
        REVIEW_DELETED,
        this.#actor.actor.type,
        this.#actor.actor.id,
        nowTs,
        payloadJson,
      );

    const batch: D1PreparedStatement[] = [
      deleteLinks,
      deleteSubjects,
      deleteSections,
      deleteWorkflowState,
      deleteAcknowledgements,
      deleteDetails,
      deleteEntity,
    ];
    const entityDeleteIndex = batch.length - 1;
    if (this.#deleteFault === "after-entity") batch.push(this.#forcedFailure());
    batch.push(tombstone);
    if (this.#deleteFault === "after-tombstone")
      batch.push(this.#forcedFailure());

    try {
      const results = await this.#db.batch(batch);
      // The `entities` DELETE — the statement the tombstone's `changes()` guard
      // reads — is the LAST domain statement; its index is captured above rather
      // than hard-coded, so adding a child delete can never silently detach the
      // guard from the statement it is supposed to be guarding.
      const removed = (results[entityDeleteIndex]?.meta?.changes ?? 0) > 0;
      if (removed) return { deleted: true };
      // Nothing was removed. Either a concurrent purge already destroyed the
      // Review (idempotent no-op) or the commit-time guard blocked because a link
      // appeared after the precheck. Distinguish honestly rather than guessing.
      const still = await this.get(reviewId, { includeDeleted: true });
      if (!still) return { deleted: false };
      return { deleted: false, blockedReason: "has_links", linkCount: 1 };
    } catch (cause) {
      if (cause instanceof ReviewError || cause instanceof ActivityError)
        throw cause;
      throw new ReviewStorageError({ cause });
    }
  }

  async #setStatus(
    id: string,
    status: ReviewStatus,
  ): Promise<ReviewLifecycleResult> {
    const reviewId = validateReviewId(id);
    const current = await this.get(reviewId);
    if (!current) throw new ReviewNotFoundError();
    if (current.archivedAt) throw new ReviewArchivedError();
    if (current.status === status) {
      return {
        review: current,
        changed: false,
        outcome:
          status === "completed"
            ? "already_completed"
            : ("already_open" as const),
      };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const completedAt = status === "completed" ? nowTs : null;
    const domainStatement = this.#db
      .prepare(
        `UPDATE review_details
         SET status = ?, completed_at = ?, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?
           AND archived_at IS NULL
           AND EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = ? AND id = ? AND type = '${REVIEW_ENTITY_TYPE}'
               AND deleted_at IS NULL
           )
           AND status IS NOT ?
         RETURNING entity_id`,
      )
      .bind(
        status,
        completedAt,
        nowTs,
        this.#workspaceId,
        reviewId,
        this.#workspaceId,
        reviewId,
        status,
      );
    const eventType =
      status === "completed"
        ? REVIEW_COMPLETED
        : current.status === "completed"
          ? REVIEW_REOPENED
          : REVIEW_STATUS_CHANGED;
    const event = this.#activity(
      eventType,
      reviewId,
      { from: current.status, to: status },
      now,
    );
    let result;
    try {
      result = await recordAtomicMutation<{ entity_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model: event,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof ReviewError || cause instanceof ActivityError)
        throw cause;
      throw new ReviewStorageError({ cause });
    }
    const refreshed = await this.get(reviewId);
    if (!refreshed) throw new ReviewNotFoundError();
    if (!result.changed && refreshed.status !== status)
      throw new ReviewConflictError();
    return {
      review: refreshed,
      changed: result.changed,
      outcome:
        status === "completed"
          ? "completed"
          : current.status === "completed"
            ? "reopened"
            : "already_open",
    };
  }

  async #setArchived(
    id: string,
    archived: boolean,
  ): Promise<ReviewLifecycleResult> {
    const reviewId = validateReviewId(id);
    const current = await this.get(reviewId);
    if (!current) throw new ReviewNotFoundError();
    const isArchived = current.archivedAt !== null;
    if (isArchived === archived) {
      return {
        review: current,
        changed: false,
        outcome: archived ? "already_archived" : "already_active",
      };
    }
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const domainStatement = this.#db
      .prepare(
        `UPDATE review_details
         SET archived_at = ?, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ?
           AND EXISTS (
             SELECT 1 FROM entities
             WHERE workspace_id = ? AND id = ? AND type = '${REVIEW_ENTITY_TYPE}'
               AND deleted_at IS NULL
           )
           AND ${archived ? "archived_at IS NULL" : "archived_at IS NOT NULL"}
         RETURNING entity_id`,
      )
      .bind(
        archived ? nowTs : null,
        nowTs,
        this.#workspaceId,
        reviewId,
        this.#workspaceId,
        reviewId,
      );
    const event = this.#activity(
      archived ? REVIEW_ARCHIVED : REVIEW_RESTORED,
      reviewId,
      {},
      now,
    );
    let result;
    try {
      result = await recordAtomicMutation<{ entity_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model: event,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof ReviewError || cause instanceof ActivityError)
        throw cause;
      throw new ReviewStorageError({ cause });
    }
    const refreshed = await this.get(reviewId);
    if (!refreshed) throw new ReviewNotFoundError();
    return {
      review: refreshed,
      changed: result.changed,
      outcome: archived ? "archived" : "restored",
    };
  }

  async #findByPeriod(
    type: Exclude<ReviewType, "custom">,
    periodStart: string,
    periodEnd: string,
  ): Promise<Review | null> {
    const row = await this.#db
      .prepare(
        `SELECT ${READ_COLUMNS}
         FROM entities e
         JOIN review_details d
           ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
         WHERE ${PERIOD_MATCH}
         LIMIT 1`,
      )
      .bind(this.#workspaceId, type, periodStart, periodEnd)
      .first<ReviewRow>();
    if (!row) return null;
    const sections = await this.#sectionsForIds([row.id]);
    return this.#rowToReview(row, sections.get(row.id) ?? []);
  }

  async #sectionsForIds(
    ids: readonly string[],
  ): Promise<Map<string, readonly ReviewSection[]>> {
    const out = new Map<string, ReviewSection[]>();
    if (ids.length === 0) return out;
    const unique = [...new Set(ids)].map(validateReviewId);
    const placeholders = unique.map(() => "?").join(", ");
    const result = await this.#db
      .prepare(
        `SELECT review_id, section_id, body_markdown, updated_at
         FROM review_sections
         WHERE workspace_id = ? AND review_id IN (${placeholders})
         ORDER BY review_id, section_id`,
      )
      .bind(this.#workspaceId, ...unique)
      .all<SectionRow>();
    for (const row of result.results) {
      const section = {
        sectionId: row.section_id as ReviewSectionId,
        body: row.body_markdown,
        updatedAt: fromStorageTimestamp(row.updated_at),
      };
      const bucket = out.get(row.review_id) ?? [];
      bucket.push(section);
      out.set(row.review_id, bucket);
    }
    for (const id of unique) {
      const existing = out.get(id) ?? [];
      const byId = new Map(existing.map((s) => [s.sectionId, s]));
      out.set(
        id,
        REVIEW_SECTION_IDS.map(
          (sectionId) =>
            byId.get(sectionId) ?? {
              sectionId,
              body: "",
              updatedAt: new Date(0),
            },
        ),
      );
    }
    return out;
  }

  #rowToReview(row: ReviewRow, sections: readonly ReviewSection[]): Review {
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      title: row.title,
      type: row.review_type as ReviewType,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status as ReviewStatus,
      templateId: row.template_id,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.effective_updated_at),
      completedAt: row.completed_at
        ? fromStorageTimestamp(row.completed_at)
        : null,
      archivedAt: row.archived_at
        ? fromStorageTimestamp(row.archived_at)
        : null,
      deletedAt: row.deleted_at ? fromStorageTimestamp(row.deleted_at) : null,
      sections,
    };
  }

  #activity(
    type: string,
    reviewId: string,
    payload: ActivityPayload,
    occurredAt: Date,
  ) {
    const event: NewActivityEvent = {
      type,
      subjects: [{ entityId: reviewId, role: SUBJECT_ROLE }],
      payload,
    };
    return buildActivityWriteModel(
      event,
      this.#actor.actor,
      this.#newActivityId(),
      occurredAt,
    );
  }
}
