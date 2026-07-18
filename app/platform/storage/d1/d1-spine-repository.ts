/**
 * FND-07 Spine — D1 implementation of the authoritative spine repository.
 *
 * Implements the storage-independent, WORKSPACE-BOUND `SpineRepository` contract
 * over Cloudflare D1 (SQLite) using prepared, parameterised statements only. The
 * repository is constructed with a single `WorkspaceContext`; every statement
 * constrains `workspace_id = ?` with that context's id, and no method accepts a
 * `workspaceId` (ADR-010/ADR-014). No caller-supplied value is ever interpolated
 * into SQL — every value is bound (AGENTS.md §17). The five structural link types
 * and the four spine kinds ARE inlined as trusted kernel constants (the same
 * literals the migration pins), never caller data.
 *
 * Atomicity (ADR-014 §8, §21): every creation and structural mutation is ONE
 * `D1Database.batch()` — a single transaction that rolls back entirely on any
 * failure. Complex mutations chain several domain-statement/event groups in that
 * one batch; each Activity append is guarded on the `changes()` of the domain
 * statement IMMEDIATELY before it, so an event is appended iff that statement
 * actually changed a row. Parent validity is folded into the mutating SQL (an
 * `INSERT ... WHERE EXISTS (active parent of the required kind)`), so a parent
 * soft-deleted between a read and the write cannot commit an orphan. The
 * database's partial unique index over `entity_links` is the final backstop
 * guaranteeing a child never has two active structural parents.
 *
 * D1 specifics (rows, SQL, timestamp strings) stay inside this file,
 * `database.ts`, `entity-link-database.ts` and `spine-database.ts`.
 */

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
  AREA,
  GOAL,
  PROJECT,
  TASK,
  SPINE_LINK_TYPES,
  childLinkTypesOf,
  spineLinkTypeFor,
  completedActivityTypeFor,
  reopenedActivityTypeFor,
  CorruptSpineRecordError,
  SpineAreaCompletionError,
  SpineConflictError,
  SpineError,
  SpineHasActiveChildrenError,
  SpineInvalidParentKindError,
  SpineNotFoundError,
  SpineParentUnavailableError,
  SpineStorageError,
  SpineWrongKindError,
  secureIdGenerator,
  systemClock,
  validateChildKind,
  validateParentKind,
  validateSpineId,
  validateSpineLimit,
  validateSpineTitle,
  type Clock,
  type CompletionResult,
  type CompletionRollup,
  type CreateAreaInput,
  type CreateGoalInput,
  type CreateProjectInput,
  type CreateTaskInput,
  type GetSpineOptions,
  type IdGenerator,
  type ListSpineChildrenInput,
  type MoveParentInput,
  type MoveResult,
  type SpineChildPage,
  type SpineKind,
  type SpineLinkType,
  type SpineParent,
  type SpineParentKind,
  type SpineLifecycleResult,
  type SpineRecord,
  type SpineRepository,
  type SpineRollup,
  decodeSpineCursorForScope,
  encodeSpineCursor,
  type SpineCursorScope,
} from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { toStorageTimestamp, type EntityRow } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  composeSpineRecord,
  rowToSpineRecord,
  SPINE_JOINED_COLUMNS,
  type SpineJoinedRow,
} from "./spine-database";

/**
 * Deterministic, TEST-ONLY failure injection for the create batch, used to prove
 * the whole mutation rolls back when a later stage fails. Never set in production.
 */
export type SpineCreateFault =
  "entity-activity" | "link-activity" | "spine-insert";

/** Optional dependencies for the repository, injectable for deterministic tests. */
export interface D1SpineRepositoryOptions {
  /** Clock used for domain AND Activity timestamps (one call per mutation). */
  readonly clock?: Clock;
  /** Id generator for new entities and links. Defaults to a secure UUID generator. */
  readonly idGenerator?: IdGenerator;
  /** Trusted actor context recorded on every Activity event. Defaults to `system`. */
  readonly actorContext?: ActivityActorContext;
  /** Id generator for Activity events. Defaults to a secure UUID generator. */
  readonly activityIdGenerator?: IdGenerator;
  /** TEST-ONLY deterministic create-batch failure injection. Never set in production. */
  readonly createFault?: SpineCreateFault;
}

/** The entity columns a mutation returns, matching {@link EntityRow}. */
const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

/** Generic entity Activity event types (shared with the entity repository). */
const ENTITY_CREATED = "entity.created";
const ENTITY_UPDATED = "entity.updated";
const ENTITY_DELETED = "entity.deleted";
const ENTITY_RESTORED = "entity.restored";
/** Generic link Activity event types (shared with the EntityLink repository). */
const LINK_CREATED = "entity_link.created";
const LINK_UNLINKED = "entity_link.unlinked";
const LINK_RESTORED = "entity_link.restored";

const SUBJECT_ROLE = "subject";
const ROLE_SOURCE = "source";
const ROLE_TARGET = "target";

/** The five structural link types as a trusted, inlined SQL list (never caller data). */
const STRUCTURAL_LINK_LIST = SPINE_LINK_TYPES.map((t) => `'${t}'`).join(", ");

/** Bounded optimistic-retry budget for `rename`, mirroring the entity repository. */
const MAX_RENAME_ATTEMPTS = 5;

/** Bounded optimistic-retry budget for `complete`/`reopen` under contention. */
const MAX_COMPLETION_ATTEMPTS = 5;

/** A single domain statement plus the optional Activity event it should append. */
interface SpineStep {
  readonly statement: D1PreparedStatement;
  readonly event?: NewActivityEvent;
  /** TEST-ONLY: force a failure right after the statement (before its event). */
  readonly faultAfterStatement?: boolean;
  /** TEST-ONLY: force a failure right after the event's activity insert. */
  readonly faultAfterEvent?: boolean;
}

/** The result of one domain step: whether it changed a row, and the row it returned. */
interface StepResult {
  readonly changed: boolean;
  readonly row: EntityRow | null;
}

/** True when a raw D1 failure is a UNIQUE-constraint violation. */
function isUniqueConstraintViolation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /UNIQUE constraint failed/i.test(message);
}

export class D1SpineRepository implements SpineRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #createFault?: SpineCreateFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1SpineRepositoryOptions = {},
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
  }

  /* ---------------------------------------------------------------------- */
  /* Creation                                                               */
  /* ---------------------------------------------------------------------- */

  async createArea(input: CreateAreaInput): Promise<SpineRecord> {
    const title = validateSpineTitle(input.title);
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();

    const entityStmt = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(id, this.#workspaceId, AREA, title, nowTs, nowTs);

    const spineStmt = this.#db
      .prepare(
        `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         VALUES (?, ?, ?, NULL)`,
      )
      .bind(this.#workspaceId, id, AREA);

    const steps: SpineStep[] = [
      {
        statement: entityStmt,
        event: this.#entityEvent(ENTITY_CREATED, id, AREA, title),
      },
      { statement: spineStmt },
    ];

    const results = await this.#runBatch(steps, now);
    const row = results[0]?.row;
    if (!results[0]?.changed || !row) {
      throw new SpineStorageError();
    }
    return composeSpineRecord(row, AREA, null, null);
  }

  createGoal(input: CreateGoalInput): Promise<SpineRecord> {
    const areaId = validateSpineId(input.areaId, "parentId");
    return this.#createChild(GOAL, input.title, AREA, areaId);
  }

  createProject(input: CreateProjectInput): Promise<SpineRecord> {
    const parentKind = validateParentKind(input.parent?.kind);
    if (parentKind !== AREA && parentKind !== GOAL) {
      throw new SpineInvalidParentKindError();
    }
    const parentId = validateSpineId(input.parent.id, "parentId");
    return this.#createChild(PROJECT, input.title, parentKind, parentId);
  }

  createTask(input: CreateTaskInput): Promise<SpineRecord> {
    const parentKind = validateParentKind(input.parent?.kind);
    if (parentKind !== AREA && parentKind !== PROJECT) {
      throw new SpineInvalidParentKindError();
    }
    const parentId = validateSpineId(input.parent.id, "parentId");
    return this.#createChild(TASK, input.title, parentKind, parentId);
  }

  /**
   * Create a non-Area child atomically: the `entities` row (gated on an active
   * parent of the required kind), the `spine_records` row, the structural
   * EntityLink, and both `entity.created` + `entity_link.created` events. A
   * missing/deleted/wrong-type/cross-workspace parent gates the entity insert to
   * zero rows, so the batch commits nothing and a typed parent error is raised —
   * leaving no entity, no spine row, no link and no Activity.
   */
  async #createChild(
    kind: SpineKind,
    rawTitle: unknown,
    parentKind: SpineParentKind,
    parentId: string,
  ): Promise<SpineRecord> {
    const title = validateSpineTitle(rawTitle);
    const linkType = spineLinkTypeFor(kind, parentKind);
    if (linkType === null) {
      throw new SpineInvalidParentKindError();
    }
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();
    const linkId = this.#newId();

    const entityStmt = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, ?, ?, ?, NULL
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL
               )
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(
        id,
        this.#workspaceId,
        kind,
        title,
        nowTs,
        nowTs,
        this.#workspaceId,
        parentId,
        parentKind,
      );

    const spineStmt = this.#db
      .prepare(
        `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
         SELECT ?, ?, ?, NULL
         WHERE EXISTS (
                 SELECT 1 FROM entities WHERE workspace_id = ? AND id = ?
               )`,
      )
      .bind(this.#workspaceId, id, kind, this.#workspaceId, id);

    const linkStmt = this.#db
      .prepare(
        `INSERT INTO entity_links
           (id, workspace_id, source_entity_id, target_entity_id, type,
            created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, NULL
         WHERE EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
               )
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL
               )
         RETURNING id`,
      )
      .bind(
        linkId,
        this.#workspaceId,
        id,
        parentId,
        linkType,
        nowTs,
        nowTs,
        this.#workspaceId,
        id,
        this.#workspaceId,
        parentId,
        parentKind,
      );

    const steps: SpineStep[] = [
      {
        statement: entityStmt,
        event: this.#entityEvent(ENTITY_CREATED, id, kind, title),
        faultAfterEvent: this.#createFault === "entity-activity",
      },
      {
        statement: spineStmt,
        faultAfterStatement: this.#createFault === "spine-insert",
      },
      {
        statement: linkStmt,
        event: this.#linkEvent(LINK_CREATED, linkId, id, parentId, linkType),
        faultAfterEvent: this.#createFault === "link-activity",
      },
    ];

    const results = await this.#runBatch(steps, now);
    const entityResult = results[0];
    if (!entityResult?.changed || !entityResult.row) {
      // The entity insert was gated out: the parent is missing, soft-deleted, of
      // the wrong kind, or in another workspace. Nothing committed.
      throw new SpineParentUnavailableError();
    }
    const parent: SpineParent = { kind: parentKind, id: parentId };
    return composeSpineRecord(entityResult.row, kind, null, parent);
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                  */
  /* ---------------------------------------------------------------------- */

  async getById(
    id: string,
    options: GetSpineOptions = {},
  ): Promise<SpineRecord | null> {
    const entityId = validateSpineId(id);
    const row = await this.#readJoined(
      entityId,
      options.includeDeleted === true,
    );
    return row ? rowToSpineRecord(row) : null;
  }

  async getParent(id: string): Promise<SpineRecord | null> {
    const record = await this.getById(id, { includeDeleted: true });
    if (!record || record.parent === null) {
      return null;
    }
    return this.getById(record.parent.id, { includeDeleted: true });
  }

  async listChildren(input: ListSpineChildrenInput): Promise<SpineChildPage> {
    const parentId = validateSpineId(input.parentId, "parentId");
    const childKind = validateChildKind(input.childKind);
    const limit = validateSpineLimit(input.limit);
    const includeDeleted = input.includeDeleted === true;

    // Resolve the parent's kind (including a soft-deleted parent) to derive the
    // single structural link type connecting it to children of `childKind`.
    const parentRow = await this.#readJoined(parentId, true);
    if (!parentRow) {
      throw new SpineNotFoundError();
    }
    const parentKind = parentRow.type as SpineKind;
    const linkType = spineLinkTypeFor(childKind, parentKind as SpineParentKind);
    if (linkType === null) {
      throw new SpineInvalidParentKindError();
    }

    const scope: SpineCursorScope = {
      workspaceId: this.#workspaceId,
      parentId,
      childKind,
      includeDeleted,
    };

    const conditions = [
      "l.workspace_id = ?",
      "l.target_entity_id = ?",
      "l.type = ?",
      "l.deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId, parentId, linkType];
    if (!includeDeleted) {
      conditions.push("e.deleted_at IS NULL");
    }
    if (input.cursor !== undefined) {
      const position = decodeSpineCursorForScope(input.cursor, scope);
      conditions.push("(e.created_at > ? OR (e.created_at = ? AND e.id > ?))");
      params.push(position.createdAt, position.createdAt, position.id);
    }

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    const rows = await this.#allJoined(
      this.#db
        .prepare(
          `SELECT ${SPINE_JOINED_COLUMNS},
                  l.target_entity_id AS parent_id,
                  l.type AS parent_link_type
           FROM entity_links l
           JOIN entities e
             ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           WHERE ${conditions.join(" AND ")}
           ORDER BY e.created_at ASC, e.id ASC
           LIMIT ?`,
        )
        .bind(...params),
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(rowToSpineRecord);
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeSpineCursor(scope, { createdAt: last.created_at, id: last.id })
        : null;

    return { items, nextCursor, hasMore };
  }

  /* ---------------------------------------------------------------------- */
  /* Rollups (derived, never stored)                                        */
  /* ---------------------------------------------------------------------- */

  async getRollup(id: string): Promise<SpineRollup> {
    const record = await this.getById(id);
    if (!record) {
      throw new SpineNotFoundError();
    }
    switch (record.kind) {
      case PROJECT:
        return { kind: PROJECT, tasks: await this.#projectTasks(record.id) };
      case GOAL:
        return {
          kind: GOAL,
          projects: await this.#goalProjects(record.id),
          tasks: await this.#goalTasks(record.id),
        };
      case AREA:
        return {
          kind: AREA,
          goals: await this.#areaGoals(record.id),
          projects: await this.#areaProjects(record.id),
          tasks: await this.#areaTasks(record.id),
        };
      case TASK:
        throw new SpineWrongKindError("A Task has no rollup");
    }
  }

  /** Active direct children of `parentId` via `linkType`, with completed count. */
  async #directRollup(
    parentId: string,
    linkType: SpineLinkType,
  ): Promise<CompletionRollup> {
    const counts = await this.#count(
      this.#db
        .prepare(
          `SELECT COUNT(*) AS total, COUNT(sr.completed_at) AS completed
           FROM entity_links l
           JOIN entities e
             ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
                AND e.deleted_at IS NULL
           JOIN spine_records sr
             ON sr.workspace_id = l.workspace_id AND sr.entity_id = l.source_entity_id
           WHERE l.workspace_id = ? AND l.target_entity_id = ?
             AND l.type = ? AND l.deleted_at IS NULL`,
        )
        .bind(this.#workspaceId, parentId, linkType),
    );
    return toCompletionRollup(counts);
  }

  #projectTasks(projectId: string): Promise<CompletionRollup> {
    return this.#directRollup(projectId, "task.belongs_to_project");
  }

  #goalProjects(goalId: string): Promise<CompletionRollup> {
    return this.#directRollup(goalId, "project.advances_goal");
  }

  /** All active Tasks under a Goal's active Projects. */
  async #goalTasks(goalId: string): Promise<CompletionRollup> {
    const counts = await this.#count(
      this.#db
        .prepare(
          `SELECT COUNT(*) AS total, COUNT(tsr.completed_at) AS completed
           FROM entity_links pl
           JOIN entities pe
             ON pe.workspace_id = pl.workspace_id AND pe.id = pl.source_entity_id
                AND pe.deleted_at IS NULL
           JOIN entity_links tl
             ON tl.workspace_id = pl.workspace_id
                AND tl.target_entity_id = pl.source_entity_id
                AND tl.type = 'task.belongs_to_project' AND tl.deleted_at IS NULL
           JOIN entities te
             ON te.workspace_id = tl.workspace_id AND te.id = tl.source_entity_id
                AND te.deleted_at IS NULL
           JOIN spine_records tsr
             ON tsr.workspace_id = tl.workspace_id AND tsr.entity_id = tl.source_entity_id
           WHERE pl.workspace_id = ? AND pl.target_entity_id = ?
             AND pl.type = 'project.advances_goal' AND pl.deleted_at IS NULL`,
        )
        .bind(this.#workspaceId, goalId),
    );
    return toCompletionRollup(counts);
  }

  #areaGoals(areaId: string): Promise<CompletionRollup> {
    return this.#directRollup(areaId, "goal.belongs_to_area");
  }

  /**
   * A subquery yielding the ids of all ACTIVE Projects in an Area's scope: those
   * directly under the Area, plus those advancing a Goal that belongs to the Area
   * (the Goal itself active). Its single bound parameter is the area id, reused.
   */
  #areaProjectIdsSql(): string {
    return `SELECT dpl.source_entity_id AS pid
            FROM entity_links dpl
            JOIN entities dpe
              ON dpe.workspace_id = dpl.workspace_id AND dpe.id = dpl.source_entity_id
                 AND dpe.deleted_at IS NULL
            WHERE dpl.workspace_id = ? AND dpl.target_entity_id = ?
              AND dpl.type = 'project.belongs_to_area' AND dpl.deleted_at IS NULL
            UNION
            SELECT gpl.source_entity_id AS pid
            FROM entity_links gpl
            JOIN entities gpe
              ON gpe.workspace_id = gpl.workspace_id AND gpe.id = gpl.source_entity_id
                 AND gpe.deleted_at IS NULL
            JOIN entity_links gal
              ON gal.workspace_id = gpl.workspace_id
                 AND gal.source_entity_id = gpl.target_entity_id
                 AND gal.type = 'goal.belongs_to_area' AND gal.deleted_at IS NULL
            JOIN entities ge
              ON ge.workspace_id = gal.workspace_id AND ge.id = gal.source_entity_id
                 AND ge.deleted_at IS NULL
            WHERE gpl.workspace_id = ? AND gal.target_entity_id = ?
              AND gpl.type = 'project.advances_goal' AND gpl.deleted_at IS NULL`;
  }

  /** All active Projects directly under an Area or under its Goals. */
  async #areaProjects(areaId: string): Promise<CompletionRollup> {
    const counts = await this.#count(
      this.#db
        .prepare(
          `SELECT COUNT(*) AS total, COUNT(psr.completed_at) AS completed
           FROM ( ${this.#areaProjectIdsSql()} ) ids
           JOIN spine_records psr
             ON psr.workspace_id = ? AND psr.entity_id = ids.pid`,
        )
        .bind(
          this.#workspaceId,
          areaId,
          this.#workspaceId,
          areaId,
          this.#workspaceId,
        ),
    );
    return toCompletionRollup(counts);
  }

  /** All active Tasks directly under an Area or under the Area's Projects. */
  async #areaTasks(areaId: string): Promise<CompletionRollup> {
    const counts = await this.#count(
      this.#db
        .prepare(
          `SELECT COUNT(*) AS total, COUNT(tsr.completed_at) AS completed
           FROM (
             SELECT dtl.source_entity_id AS tid
             FROM entity_links dtl
             JOIN entities dte
               ON dte.workspace_id = dtl.workspace_id AND dte.id = dtl.source_entity_id
                  AND dte.deleted_at IS NULL
             WHERE dtl.workspace_id = ? AND dtl.target_entity_id = ?
               AND dtl.type = 'task.belongs_to_area' AND dtl.deleted_at IS NULL
             UNION
             SELECT ptl.source_entity_id AS tid
             FROM entity_links ptl
             JOIN entities pte
               ON pte.workspace_id = ptl.workspace_id AND pte.id = ptl.source_entity_id
                  AND pte.deleted_at IS NULL
             JOIN ( ${this.#areaProjectIdsSql()} ) ap ON ap.pid = ptl.target_entity_id
             WHERE ptl.workspace_id = ? AND ptl.type = 'task.belongs_to_project'
               AND ptl.deleted_at IS NULL
           ) ids
           JOIN spine_records tsr
             ON tsr.workspace_id = ? AND tsr.entity_id = ids.tid`,
        )
        .bind(
          this.#workspaceId,
          areaId,
          // area-project-ids subquery params (nested inside the UNION branch):
          this.#workspaceId,
          areaId,
          this.#workspaceId,
          areaId,
          this.#workspaceId,
          this.#workspaceId,
        ),
    );
    return toCompletionRollup(counts);
  }

  /* ---------------------------------------------------------------------- */
  /* Rename                                                                 */
  /* ---------------------------------------------------------------------- */

  async rename(id: string, title: string): Promise<SpineRecord> {
    const entityId = validateSpineId(id);
    const after = validateSpineTitle(title);

    let current = await this.getById(entityId);
    if (!current) {
      throw new SpineNotFoundError();
    }

    for (let attempt = 0; attempt < MAX_RENAME_ATTEMPTS; attempt++) {
      // A same-title update after normalisation is a no-op (ADR-014 §13): return
      // the CURRENT persisted record unchanged, no `updatedAt` churn, no
      // `entity.updated` event. Under a concurrent identical rename, the loser
      // refreshes `current` to the PERSISTED record below, so it returns the live
      // title written by the winner — never a stale pre-loop snapshot.
      const before = current.title;
      if (before === after) {
        return current;
      }
      const now = this.#clock();
      const nowTs = toStorageTimestamp(now);

      const domainStmt = this.#db
        .prepare(
          `UPDATE entities SET title = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND title = ?
           RETURNING ${ENTITY_RETURNING}`,
        )
        .bind(after, nowTs, entityId, this.#workspaceId, before);

      const results = await this.#runBatch(
        [
          {
            statement: domainStmt,
            event: {
              type: ENTITY_UPDATED,
              subjects: [{ entityId, role: SUBJECT_ROLE }],
              payload: { changes: { title: { before, after } } },
            },
          },
        ],
        now,
      );
      const result = results[0];
      if (result?.changed && result.row) {
        return composeSpineRecord(
          result.row,
          current.kind,
          current.completedAt,
          current.parent,
        );
      }

      // The optimistic guard matched nothing: re-read the fresh, persisted record
      // and retry (or, next iteration, return it if it already holds `after`).
      const refreshed = await this.#readJoined(entityId, false);
      if (!refreshed) {
        throw new SpineNotFoundError();
      }
      current = rowToSpineRecord(refreshed);
    }
    throw new SpineStorageError();
  }

  /* ---------------------------------------------------------------------- */
  /* Completion & reopening                                                 */
  /* ---------------------------------------------------------------------- */

  complete(id: string): Promise<CompletionResult> {
    return this.#setCompletion(id, true);
  }

  reopen(id: string): Promise<CompletionResult> {
    return this.#setCompletion(id, false);
  }

  /**
   * Set or clear a record's completion atomically: update `spine_records`, advance
   * the entity's `updated_at`, and append the kind's `*.completed`/`*.reopened`
   * event — all on one clock, in one batch.
   *
   * Concurrency (ADR-014 §14):
   *   - The `spine_records` mutation is GATED on the entity still being active in
   *     this workspace, so a delete racing a complete/reopen cannot change
   *     completion state without also advancing `updated_at` and appending the
   *     event. If the gate matches nothing, the whole logical mutation is a no-op.
   *   - The `updated_at` bump and the event are guarded on the spine update's
   *     `changes()`, so a losing racer causes no churn and appends nothing.
   *   - Reopening guards on the EXACT observed `completed_at`, so
   *     `previousCompletedAt` is accurate even under concurrent complete/reopen
   *     interleavings; a mismatch retries against the fresh state.
   * Idempotent: an already-completed complete (or already-open reopen) is a no-op.
   */
  async #setCompletion(
    id: string,
    complete: boolean,
  ): Promise<CompletionResult> {
    const entityId = validateSpineId(id);
    let record = await this.getById(entityId);
    if (!record) {
      throw new SpineNotFoundError();
    }
    if (record.kind === AREA) {
      if (complete) {
        throw new SpineAreaCompletionError();
      }
      // An Area is never completed, so reopening it is always an idempotent no-op.
      return { record, outcome: "already_open", changed: false };
    }

    const eventType = complete
      ? completedActivityTypeFor(record.kind)
      : reopenedActivityTypeFor(record.kind);
    if (eventType === null) {
      throw new SpineWrongKindError();
    }

    for (let attempt = 0; attempt < MAX_COMPLETION_ATTEMPTS; attempt++) {
      const alreadyInTargetState = complete
        ? record.completedAt !== null
        : record.completedAt === null;
      if (alreadyInTargetState) {
        return {
          record,
          outcome: complete ? "already_completed" : "already_open",
          changed: false,
        };
      }

      const now = this.#clock();
      const nowTs = toStorageTimestamp(now);

      let spineStmt: D1PreparedStatement;
      let payload: ActivityPayload;
      if (complete) {
        spineStmt = this.#db
          .prepare(
            `UPDATE spine_records SET completed_at = ?
             WHERE workspace_id = ? AND entity_id = ? AND completed_at IS NULL
               AND EXISTS (SELECT 1 FROM entities
                           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL)
             RETURNING entity_id`,
          )
          .bind(
            nowTs,
            this.#workspaceId,
            entityId,
            this.#workspaceId,
            entityId,
          );
        payload = { completedAt: nowTs };
      } else {
        // `record.completedAt` is non-null here (we are past the already-open guard).
        const observed = toStorageTimestamp(record.completedAt!);
        spineStmt = this.#db
          .prepare(
            `UPDATE spine_records SET completed_at = NULL
             WHERE workspace_id = ? AND entity_id = ? AND completed_at = ?
               AND EXISTS (SELECT 1 FROM entities
                           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL)
             RETURNING entity_id`,
          )
          .bind(
            this.#workspaceId,
            entityId,
            observed,
            this.#workspaceId,
            entityId,
          );
        payload = { previousCompletedAt: observed };
      }

      // Advance updated_at ONLY when the completion actually changed (guarded on the
      // spine update's changes()), so a no-op or losing race causes no churn.
      const entityStmt = this.#db
        .prepare(
          `UPDATE entities SET updated_at = ?
           WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL AND changes() > 0
           RETURNING ${ENTITY_RETURNING}`,
        )
        .bind(nowTs, this.#workspaceId, entityId);

      const results = await this.#runBatch(
        [
          { statement: spineStmt },
          {
            statement: entityStmt,
            event: {
              type: eventType,
              subjects: [{ entityId, role: SUBJECT_ROLE }],
              payload,
            },
          },
        ],
        now,
      );

      const spineChanged = results[0]?.changed === true;
      const entityRow = results[1]?.row;
      if (spineChanged && entityRow) {
        return {
          record: composeSpineRecord(
            entityRow,
            record.kind,
            complete ? now : null,
            record.parent,
          ),
          outcome: complete ? "completed" : "reopened",
          changed: true,
        };
      }

      // Nothing changed: re-read the active record and either report an idempotent
      // outcome next iteration, retry against the fresh state (reopen guarding on a
      // new `completed_at`), or fail if the record is no longer active.
      const refreshed = await this.getById(entityId);
      if (!refreshed) {
        // A concurrent soft-delete won: completion state is unchanged (gated), and
        // an inactive record cannot be completed or reopened.
        throw new SpineNotFoundError();
      }
      record = refreshed;
    }
    throw new SpineConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Move / reparent                                                        */
  /* ---------------------------------------------------------------------- */

  async move(id: string, parent: MoveParentInput): Promise<MoveResult> {
    const entityId = validateSpineId(id);
    const parentKind = validateParentKind(parent?.kind);
    const parentId = validateSpineId(parent.id, "parentId");

    const record = await this.getById(entityId);
    if (!record) {
      throw new SpineNotFoundError();
    }
    if (record.kind === AREA) {
      throw new SpineWrongKindError(
        "An Area has no parent and cannot be moved",
      );
    }
    const linkType = spineLinkTypeFor(record.kind, parentKind);
    if (linkType === null) {
      throw new SpineInvalidParentKindError();
    }

    // Idempotent no-op: already under the requested parent.
    if (
      record.parent !== null &&
      record.parent.id === parentId &&
      record.parent.kind === parentKind
    ) {
      return { record, outcome: "already_there", changed: false };
    }
    if (record.parent === null) {
      // A non-Area active record must have a parent; its absence is corrupt state.
      throw new CorruptSpineRecordError();
    }

    const oldParentId = record.parent.id;
    const oldParentKind = record.parent.kind;
    const oldLinkType = this.#linkTypeForParent(record.kind, oldParentKind);
    // The STABLE id of the (child → old-parent) relationship, for the unlink
    // event only. The relationship's link id is preserved across unlink/restore,
    // so this id accurately names the exact link the conditional UPDATE targets.
    const oldLinkId = await this.#findDestLink(
      entityId,
      oldParentId,
      oldLinkType,
    );
    if (oldLinkId === null) {
      // record.parent claimed an active parent link but none exists — a race we
      // cannot classify. Reconcile safely (never having touched anything).
      return this.#reconcileMove(entityId, parentId, parentKind);
    }
    const destLink = await this.#findDestLink(entityId, parentId, linkType);

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // 1. Unlink the current parent, BOUND to the exact (source, target, type)
    //    relationship we observed — not merely a separately-read link id — so a
    //    concurrent move that already changed the parent cannot be unlinked by a
    //    stale id. Gated on BOTH the child being active AND the destination parent
    //    being active: a move racing a child deletion therefore never strips the
    //    deleted child's retained parent link, and the removal never commits
    //    unless the destination (established below in the same batch, under the
    //    identical active gates) can be created/restored too.
    const unlinkStmt = this.#db
      .prepare(
        `UPDATE entity_links SET deleted_at = ?, updated_at = ?
         WHERE workspace_id = ? AND source_entity_id = ? AND target_entity_id = ?
           AND type = ? AND deleted_at IS NULL
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
               )
           AND EXISTS (
                 SELECT 1 FROM entities
                 WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL
               )
         RETURNING id`,
      )
      .bind(
        nowTs,
        nowTs,
        this.#workspaceId,
        entityId,
        oldParentId,
        oldLinkType,
        this.#workspaceId,
        entityId,
        this.#workspaceId,
        parentId,
        parentKind,
      );

    // 2. Establish the destination link: restore an existing soft-deleted one in
    //    place (same id → entity_link.restored) or insert a new one
    //    (entity_link.created). Both are gated on the child + destination parent
    //    being active; the old link is already unlinked above, so the one-active-
    //    parent index is free.
    let destStmt: D1PreparedStatement;
    let destEventType: string;
    let destLinkId: string;
    if (destLink) {
      destLinkId = destLink;
      destEventType = LINK_RESTORED;
      destStmt = this.#db
        .prepare(
          `UPDATE entity_links SET deleted_at = NULL, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL
             AND EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
                 )
             AND EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL
                 )
           RETURNING id`,
        )
        .bind(
          nowTs,
          destLinkId,
          this.#workspaceId,
          this.#workspaceId,
          entityId,
          this.#workspaceId,
          parentId,
          parentKind,
        );
    } else {
      destLinkId = this.#newId();
      destEventType = LINK_CREATED;
      destStmt = this.#db
        .prepare(
          `INSERT INTO entity_links
             (id, workspace_id, source_entity_id, target_entity_id, type,
              created_at, updated_at, deleted_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, NULL
           WHERE EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL
                 )
             AND EXISTS (
                   SELECT 1 FROM entities
                   WHERE workspace_id = ? AND id = ? AND type = ? AND deleted_at IS NULL
                 )
           RETURNING id`,
        )
        .bind(
          destLinkId,
          this.#workspaceId,
          entityId,
          parentId,
          linkType,
          nowTs,
          nowTs,
          this.#workspaceId,
          entityId,
          this.#workspaceId,
          parentId,
          parentKind,
        );
    }

    // The unlink event is built from the ACTUAL relationship the conditional
    // UPDATE targets — the observed (child, old parent, old link type) and its
    // stable link id — never a re-derived guess. It is appended only when that
    // exact link is unlinked (guarded on the unlink's changes()).
    const steps: SpineStep[] = [
      {
        statement: unlinkStmt,
        event: this.#linkEvent(
          LINK_UNLINKED,
          oldLinkId,
          entityId,
          oldParentId,
          oldLinkType,
        ),
      },
      {
        statement: destStmt,
        event: this.#linkEvent(
          destEventType,
          destLinkId,
          entityId,
          parentId,
          linkType,
        ),
      },
    ];

    let results: StepResult[];
    try {
      results = await this.#runBatchRaw(steps, now);
    } catch (cause) {
      if (cause instanceof SpineError || cause instanceof ActivityError) {
        throw cause;
      }
      // The one-active-parent index (or a concurrent move) fired: reconcile.
      if (isUniqueConstraintViolation(cause)) {
        return this.#reconcileMove(entityId, parentId, parentKind);
      }
      throw new SpineStorageError(undefined, { cause });
    }

    // The unlink and the destination establishment share identical active gates,
    // and the destination INSERT fails (rolling the batch back) on any uniqueness
    // conflict — so a committed unlink is always paired with a committed
    // destination link. Require both to have changed before reporting success.
    if (results[0]?.changed && results[1]?.changed) {
      const moved = await this.getById(entityId);
      if (moved) {
        return { record: moved, outcome: "moved", changed: true };
      }
      throw new SpineConflictError();
    }
    // Nothing moved: the destination parent is unavailable, the child was deleted
    // concurrently, or a concurrent move already changed the parent. Reconcile —
    // the original parent link was never dropped (the unlink is gated).
    return this.#reconcileMove(entityId, parentId, parentKind);
  }

  /** Classify a move that changed nothing (destination gate failed or a race). */
  async #reconcileMove(
    entityId: string,
    parentId: string,
    parentKind: SpineParentKind,
  ): Promise<MoveResult> {
    const current = await this.getById(entityId);
    if (current === null) {
      // The child is no longer active (e.g. a concurrent soft-delete won). Its
      // retained parent link was never touched — the unlink is gated on the child
      // being active — so no move applied and the hierarchy is intact.
      throw new SpineNotFoundError();
    }
    if (
      current.parent !== null &&
      current.parent.id === parentId &&
      current.parent.kind === parentKind
    ) {
      // A concurrent move already placed it here — idempotent.
      return { record: current, outcome: "already_there", changed: false };
    }
    // The destination parent is not an active parent of the required kind.
    throw new SpineParentUnavailableError();
  }

  /* ---------------------------------------------------------------------- */
  /* Soft-delete & restore                                                  */
  /* ---------------------------------------------------------------------- */

  async softDelete(id: string): Promise<SpineLifecycleResult> {
    const entityId = validateSpineId(id);
    const record = await this.getById(entityId, { includeDeleted: true });
    if (!record) {
      throw new SpineNotFoundError();
    }
    if (record.deletedAt !== null) {
      return { record, outcome: "already_deleted", changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // A container cannot be soft-deleted while it has any active direct child.
    // The check is folded into the UPDATE, so a child created concurrently cannot
    // slip under a parent that is being deleted.
    const childTypes = childLinkTypesOf(record.kind);
    const noActiveChildren =
      childTypes.length === 0
        ? ""
        : ` AND NOT EXISTS (
              SELECT 1 FROM entity_links cl
              JOIN entities ce
                ON ce.workspace_id = cl.workspace_id AND ce.id = cl.source_entity_id
                   AND ce.deleted_at IS NULL
              WHERE cl.workspace_id = entities.workspace_id
                AND cl.target_entity_id = entities.id
                AND cl.deleted_at IS NULL
                AND cl.type IN (${childTypes.map((t) => `'${t}'`).join(", ")})
            )`;

    const domainStmt = this.#db
      .prepare(
        `UPDATE entities SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL${noActiveChildren}
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(nowTs, nowTs, entityId, this.#workspaceId);

    const results = await this.#runBatch(
      [
        {
          statement: domainStmt,
          event: this.#entityEvent(
            ENTITY_DELETED,
            entityId,
            record.kind,
            record.title,
          ),
        },
      ],
      now,
    );
    const result = results[0];
    if (result?.changed && result.row) {
      return {
        record: composeSpineRecord(
          result.row,
          record.kind,
          record.completedAt,
          record.parent,
        ),
        outcome: "deleted",
        changed: true,
      };
    }

    // Nothing changed: either a concurrent delete won, or active children blocked
    // it. Re-read to classify safely.
    const current = await this.getById(entityId, { includeDeleted: true });
    if (current && current.deletedAt !== null) {
      return { record: current, outcome: "already_deleted", changed: false };
    }
    if (current) {
      throw new SpineHasActiveChildrenError();
    }
    throw new SpineNotFoundError();
  }

  async restore(id: string): Promise<SpineLifecycleResult> {
    const entityId = validateSpineId(id);
    const record = await this.getById(entityId, { includeDeleted: true });
    if (!record) {
      throw new SpineNotFoundError();
    }
    if (record.deletedAt === null) {
      return { record, outcome: "already_active", changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // A non-Area record can only be restored when its retained parent is active.
    // The requirement is folded into the UPDATE.
    const parentRequirement =
      record.kind === AREA
        ? ""
        : ` AND EXISTS (
              SELECT 1 FROM entity_links pl
              JOIN entities pe
                ON pe.workspace_id = pl.workspace_id AND pe.id = pl.target_entity_id
                   AND pe.deleted_at IS NULL
              WHERE pl.workspace_id = entities.workspace_id
                AND pl.source_entity_id = entities.id
                AND pl.deleted_at IS NULL
                AND pl.type IN (${STRUCTURAL_LINK_LIST})
            )`;

    const domainStmt = this.#db
      .prepare(
        `UPDATE entities SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND deleted_at IS NOT NULL${parentRequirement}
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(nowTs, entityId, this.#workspaceId);

    const results = await this.#runBatch(
      [
        {
          statement: domainStmt,
          event: this.#entityEvent(
            ENTITY_RESTORED,
            entityId,
            record.kind,
            record.title,
          ),
        },
      ],
      now,
    );
    const result = results[0];
    if (result?.changed && result.row) {
      return {
        record: composeSpineRecord(
          result.row,
          record.kind,
          record.completedAt,
          record.parent,
        ),
        outcome: "restored",
        changed: true,
      };
    }

    // Nothing changed: a concurrent restore won, or the retained parent is gone.
    const current = await this.getById(entityId, { includeDeleted: true });
    if (current && current.deletedAt === null) {
      return { record: current, outcome: "already_active", changed: false };
    }
    if (current) {
      throw new SpineParentUnavailableError();
    }
    throw new SpineNotFoundError();
  }

  /* ---------------------------------------------------------------------- */
  /* Internal atomic batch + helpers                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Execute an ordered list of domain steps and their Activity appends as ONE D1
   * batch (transaction), mapping any raw D1 failure to a safe `SpineStorageError`.
   * Each step's event insert is guarded on the `changes()` of the step's own
   * domain statement, placed immediately before it, so an event is appended iff
   * that statement changed a row. Any failure rolls the whole batch back.
   */
  async #runBatch(steps: SpineStep[], now: Date): Promise<StepResult[]> {
    try {
      return await this.#runBatchRaw(steps, now);
    } catch (cause) {
      if (cause instanceof SpineError || cause instanceof ActivityError) {
        throw cause;
      }
      throw new SpineStorageError(undefined, { cause });
    }
  }

  /**
   * Like {@link #runBatch} but PROPAGATES the raw D1 failure (only re-typing kernel
   * errors), so callers that must detect a UNIQUE-constraint race — the
   * one-active-parent index firing during a `move` — can reconcile instead of
   * surfacing a storage error.
   */
  async #runBatchRaw(steps: SpineStep[], now: Date): Promise<StepResult[]> {
    const batch: D1PreparedStatement[] = [];
    const domainIndex: number[] = [];
    for (const step of steps) {
      domainIndex.push(batch.length);
      batch.push(step.statement);
      if (step.faultAfterStatement) {
        batch.push(this.#forcedFailure());
      }
      if (step.event) {
        const model = buildActivityWriteModel(
          step.event,
          this.#actor.actor,
          this.#newActivityId(),
          now,
        );
        const appends = this.#recorder.buildAppendStatements(
          this.#workspaceId,
          model,
        );
        const [activityInsert, ...subjectInserts] = appends;
        batch.push(activityInsert!);
        if (step.faultAfterEvent) {
          batch.push(this.#forcedFailure());
        }
        batch.push(...subjectInserts);
      }
    }

    const results = await this.#db.batch<EntityRow>(batch);
    return domainIndex.map((idx) => {
      const r = results[idx];
      const changes = r?.meta?.changes ?? 0;
      const rows = r?.results ?? [];
      return { changed: changes > 0, row: rows[0] ?? null };
    });
  }

  /** A statement guaranteed to fail, aborting and rolling back the batch. */
  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare("SELECT 1 FROM __dalyhub_forced_spine_fault__");
  }

  /** Build a generic entity lifecycle event with the record as its sole subject. */
  #entityEvent(
    type: string,
    entityId: string,
    kind: SpineKind,
    title: string,
  ): NewActivityEvent {
    return {
      type,
      subjects: [{ entityId, role: SUBJECT_ROLE }],
      payload: { entityType: kind, title },
    };
  }

  /** Build a generic link event with both endpoints (source + target) as subjects. */
  #linkEvent(
    type: string,
    linkId: string,
    sourceEntityId: string,
    targetEntityId: string,
    linkType: string,
  ): NewActivityEvent {
    return {
      type,
      subjects: [
        { entityId: sourceEntityId, role: ROLE_SOURCE },
        { entityId: targetEntityId, role: ROLE_TARGET },
      ],
      payload: { linkId, linkType, sourceEntityId, targetEntityId },
    };
  }

  /** The structural link type for a (childKind, parentKind) edge (asserts valid). */
  #linkTypeForParent(
    childKind: SpineKind,
    parentKind: SpineParentKind,
  ): SpineLinkType {
    const type = spineLinkTypeFor(childKind, parentKind);
    if (type === null) {
      throw new CorruptSpineRecordError();
    }
    return type;
  }

  /** Read the joined spine row for one entity, or null. */
  async #readJoined(
    entityId: string,
    includeDeleted: boolean,
  ): Promise<SpineJoinedRow | null> {
    const deletedClause = includeDeleted ? "" : " AND e.deleted_at IS NULL";
    return this.#firstJoined(
      this.#db
        .prepare(
          `SELECT ${SPINE_JOINED_COLUMNS},
                  pl.target_entity_id AS parent_id,
                  pl.type AS parent_link_type
           FROM entities e
           JOIN spine_records sr
             ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
           LEFT JOIN entity_links pl
             ON pl.workspace_id = e.workspace_id AND pl.source_entity_id = e.id
                AND pl.deleted_at IS NULL AND pl.type IN (${STRUCTURAL_LINK_LIST})
           WHERE e.id = ? AND e.workspace_id = ?${deletedClause}`,
        )
        .bind(entityId, this.#workspaceId),
    );
  }

  /** The id of an existing (any-state) structural link for (child → parent, type), or null. */
  async #findDestLink(
    entityId: string,
    parentId: string,
    linkType: SpineLinkType,
  ): Promise<string | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT id FROM entity_links
           WHERE workspace_id = ? AND source_entity_id = ?
             AND target_entity_id = ? AND type = ?`,
        )
        .bind(this.#workspaceId, entityId, parentId, linkType)
        .first<{ id: string }>();
      return row?.id ?? null;
    } catch (cause) {
      throw new SpineStorageError(undefined, { cause });
    }
  }

  async #firstJoined(
    statement: D1PreparedStatement,
  ): Promise<SpineJoinedRow | null> {
    try {
      return await statement.first<SpineJoinedRow>();
    } catch (cause) {
      throw new SpineStorageError(undefined, { cause });
    }
  }

  async #allJoined(statement: D1PreparedStatement): Promise<SpineJoinedRow[]> {
    try {
      const { results } = await statement.all<SpineJoinedRow>();
      return results;
    } catch (cause) {
      throw new SpineStorageError(undefined, { cause });
    }
  }

  async #count(
    statement: D1PreparedStatement,
  ): Promise<{ total: number; completed: number }> {
    try {
      const row = await statement.first<{ total: number; completed: number }>();
      return { total: row?.total ?? 0, completed: row?.completed ?? 0 };
    } catch (cause) {
      throw new SpineStorageError(undefined, { cause });
    }
  }
}

/** Build a `CompletionRollup` from raw counts: `ratio` is null when total is 0. */
function toCompletionRollup(counts: {
  total: number;
  completed: number;
}): CompletionRollup {
  return {
    total: counts.total,
    completed: counts.completed,
    ratio: counts.total === 0 ? null : counts.completed / counts.total,
  };
}
