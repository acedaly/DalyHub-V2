import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
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
  ReviewArchivedError,
  ReviewConflictError,
  ReviewError,
  ReviewNotFoundError,
  ReviewStorageError,
  defaultReviewTitle,
  decodeReviewCursorForScope,
  encodeReviewCursor,
  normaliseReviewQuery,
  parseReviewSort,
  parseReviewType,
  parseReviewSectionId,
  parseReviewStatus,
  parseReviewView,
  resolveReviewTemplate,
  reviewTemplateId,
  validateReviewId,
  validateReviewLimit,
  validateReviewPeriod,
  validateReviewTitle,
  validateSectionContent,
  validateTemplateId,
  type CreateReviewInput,
  type CreateReviewResult,
  type ListReviewsInput,
  type Review,
  type ReviewChangeResult,
  type ReviewCursorScope,
  type ReviewDeleteResult,
  type ReviewLifecycleResult,
  type ReviewPage,
  type ReviewRepository,
  type ReviewSection,
  type ReviewSectionId,
  type ReviewStatus,
  type ReviewType,
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

export type D1ReviewCreateFault = "after-entity" | "after-details";

export interface D1ReviewRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  readonly createFault?: D1ReviewCreateFault;
  readonly mutationFault?: AtomicMutationFault;
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

function likeContains(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

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
  ): Promise<ReviewChangeResult> {
    const reviewId = validateReviewId(id);
    const safeSection = parseReviewSectionId(sectionId);
    const content = validateSectionContent(body);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
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
           AND body_markdown IS NOT ?
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
    return { review: refreshed, changed: result.changed };
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

  async permanentlyDelete(id: string): Promise<ReviewDeleteResult> {
    const reviewId = validateReviewId(id);
    const existing = await this.get(reviewId, { includeDeleted: true });
    if (!existing) return { deleted: false };

    const now = this.#clock();
    const event = this.#activity(REVIEW_DELETED, reviewId, {}, now);
    const append = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      event,
    );
    const deleteLinks = this.#db
      .prepare(
        `DELETE FROM entity_links
         WHERE workspace_id = ? AND (source_entity_id = ? OR target_entity_id = ?)`,
      )
      .bind(this.#workspaceId, reviewId, reviewId);
    const deleteSubjects = this.#db
      .prepare(
        `DELETE FROM activity_subjects
         WHERE workspace_id = ? AND entity_id = ?`,
      )
      .bind(this.#workspaceId, reviewId);
    const deleteSections = this.#db
      .prepare(
        `DELETE FROM review_sections WHERE workspace_id = ? AND review_id = ?`,
      )
      .bind(this.#workspaceId, reviewId);
    const deleteDetails = this.#db
      .prepare(
        `DELETE FROM review_details WHERE workspace_id = ? AND entity_id = ?`,
      )
      .bind(this.#workspaceId, reviewId);
    const deleteEntity = this.#db
      .prepare(
        `DELETE FROM entities
         WHERE workspace_id = ? AND id = ? AND type = '${REVIEW_ENTITY_TYPE}'
         RETURNING id`,
      )
      .bind(this.#workspaceId, reviewId);
    try {
      const results = await this.#db.batch([
        ...append,
        deleteLinks,
        deleteSubjects,
        deleteSections,
        deleteDetails,
        deleteEntity,
      ]);
      const removed = (results.at(-1)?.meta?.changes ?? 0) > 0;
      return { deleted: removed };
    } catch (cause) {
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
         WHERE e.workspace_id = ? AND e.type = '${REVIEW_ENTITY_TYPE}'
           AND d.review_type = ? AND d.period_start = ? AND d.period_end = ?
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
