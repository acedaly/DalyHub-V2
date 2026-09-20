import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activityIdGenerator,
  type ActivityActorContext,
} from "~/kernel/activity";
import {
  DECISION_ENTITY_TYPE,
  DecisionRelationNotFoundError,
  DecisionStorageError,
  DecisionValidationError,
  parseDecisionStatus,
  validateCreateDecision,
  validateDecisionLimit,
  validateDecisionSearchText,
  type CreateDecisionInput,
  type DecisionRecord,
  type DecisionRepository,
  type ListDecisionsInput,
  type SearchDecisionsInput,
} from "~/kernel/decisions";
import {
  secureIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import type { WorkspaceContext, WorkspaceId } from "~/kernel/workspaces";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface DecisionRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly status: string;
  readonly rationale: string | null;
  readonly decision_date: string | null;
  readonly review_date: string | null;
  readonly related_entity_id: string | null;
  readonly related_entity_type: string | null;
  readonly related_entity_title: string | null;
}

export interface D1DecisionRepositoryOptions {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly activityIdGenerator?: IdGenerator;
}

const SELECT = `
  e.id, e.workspace_id, e.title, e.created_at, e.updated_at,
  d.status, d.rationale, d.decision_date, d.review_date,
  d.related_entity_id, d.related_entity_type,
  related.title AS related_entity_title`;

function rowToDecision(row: DecisionRow): DecisionRecord {
  const related: DecisionRecord["related"] =
    row.related_entity_id !== null &&
    (row.related_entity_type === "project" ||
      row.related_entity_type === "area") &&
    row.related_entity_title !== null
      ? {
          kind: row.related_entity_type,
          id: row.related_entity_id,
          title: row.related_entity_title,
        }
      : null;
  return {
    id: row.id,
    workspaceId: row.workspace_id as WorkspaceId,
    decision: row.title,
    status: parseDecisionStatus(row.status),
    rationale: row.rationale,
    decisionDate: row.decision_date,
    reviewDate: row.review_date,
    related,
    createdAt: fromStorageTimestamp(row.created_at),
    updatedAt: fromStorageTimestamp(row.updated_at),
  };
}

export class D1DecisionRepository implements DecisionRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #actor: ActivityActorContext;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1DecisionRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#newActivityId = options.activityIdGenerator ?? activityIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
  }

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    const value = validateCreateDecision(input);
    const related = value.related ?? null;
    if (related !== null) {
      const relation = await this.#db
        .prepare(
          `SELECT id FROM entities
           WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL`,
        )
        .bind(this.#workspaceId, related.id, related.kind)
        .first<{ readonly id: string }>();
      if (relation === null) throw new DecisionRelationNotFoundError();
    }

    const now = this.#clock();
    const timestamp = toStorageTimestamp(now);
    const id = this.#newId();
    const activity = buildActivityWriteModel(
      {
        type:
          value.status === "decided"
            ? "decision.recorded"
            : "decision.captured",
        subjects: [{ entityId: id, role: "subject" }],
        payload: {
          status: value.status,
          hasRationale: value.rationale !== null,
          relatedType: value.related?.kind ?? null,
        },
      },
      this.#actor.actor,
      this.#newActivityId(),
      now,
    );

    const entity = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        id,
        this.#workspaceId,
        DECISION_ENTITY_TYPE,
        value.decision,
        timestamp,
        timestamp,
      );
    const details = this.#db
      .prepare(
        `INSERT INTO decision_details
           (workspace_id, entity_id, entity_type, status, rationale,
            decision_date, review_date, related_entity_id, related_entity_type, updated_at)
         VALUES (?, ?, 'decision', ?, ?, ?, ?, ?, ?, ?)
         RETURNING entity_id`,
      )
      .bind(
        this.#workspaceId,
        id,
        value.status,
        value.rationale,
        value.decisionDate,
        value.reviewDate,
        value.related?.id ?? null,
        value.related?.kind ?? null,
        timestamp,
      );
    try {
      await this.#db.batch([
        entity,
        details,
        ...this.#recorder.buildAppendStatements(this.#workspaceId, activity),
      ]);
    } catch (cause) {
      throw new DecisionStorageError({ cause });
    }
    const created = await this.get(id);
    if (created === null) throw new DecisionStorageError();
    return created;
  }

  async get(id: string): Promise<DecisionRecord | null> {
    const row = await this.#db
      .prepare(
        `SELECT ${SELECT}
         FROM entities e
         JOIN decision_details d
           ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
         LEFT JOIN entities related
           ON related.workspace_id = d.workspace_id
          AND related.id = d.related_entity_id
          AND related.type = d.related_entity_type
          AND related.deleted_at IS NULL
         WHERE e.workspace_id = ? AND e.id = ? AND e.type = 'decision'
           AND e.deleted_at IS NULL`,
      )
      .bind(this.#workspaceId, id)
      .first<DecisionRow>();
    return row === null ? null : rowToDecision(row);
  }

  async list(
    input: ListDecisionsInput = {},
  ): Promise<readonly DecisionRecord[]> {
    const limit = validateDecisionLimit(input.limit);
    const relatedEntityId = input.relatedEntityId?.trim() || null;
    if (relatedEntityId !== null && relatedEntityId.length > 128) {
      throw new DecisionValidationError("related entity id is invalid");
    }
    const status =
      input.status === undefined ? null : parseDecisionStatus(input.status);
    const result = await this.#db
      .prepare(
        `SELECT ${SELECT}
         FROM entities e
         JOIN decision_details d
           ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
         LEFT JOIN entities related
           ON related.workspace_id = d.workspace_id
          AND related.id = d.related_entity_id
          AND related.type = d.related_entity_type
          AND related.deleted_at IS NULL
         WHERE e.workspace_id = ? AND e.type = 'decision' AND e.deleted_at IS NULL
           AND (? IS NULL OR d.status = ?)
           AND (? IS NULL OR d.related_entity_id = ?)
         ORDER BY COALESCE(d.decision_date, substr(e.created_at, 1, 10)) DESC, e.id DESC
         LIMIT ?`,
      )
      .bind(
        this.#workspaceId,
        status,
        status,
        relatedEntityId,
        relatedEntityId,
        limit,
      )
      .all<DecisionRow>();
    return result.results.map(rowToDecision);
  }

  async search(
    input: SearchDecisionsInput,
  ): Promise<readonly DecisionRecord[]> {
    const text = validateDecisionSearchText(input.text);
    const limit = validateDecisionLimit(input.limit);
    const pattern = `%${text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const result = await this.#db
      .prepare(
        `SELECT ${SELECT}
         FROM entities e
         JOIN decision_details d
           ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
         LEFT JOIN entities related
           ON related.workspace_id = d.workspace_id
          AND related.id = d.related_entity_id
          AND related.type = d.related_entity_type
          AND related.deleted_at IS NULL
         WHERE e.workspace_id = ? AND e.type = 'decision' AND e.deleted_at IS NULL
           AND (e.title LIKE ? ESCAPE '\\' COLLATE NOCASE
             OR d.rationale LIKE ? ESCAPE '\\' COLLATE NOCASE)
         ORDER BY e.updated_at DESC, e.id DESC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, pattern, pattern, limit)
      .all<DecisionRow>();
    return result.results.map(rowToDecision);
  }
}
