/**
 * PROJ-05 Project Settings — D1 implementation of the workspace-bound
 * `ProjectSettingsRepository` (ADR-037).
 *
 * Every transition (`setStatus`/`archive`/`restore`) is ONE conditional SQL
 * statement — never a separate precondition read followed by an unconditional
 * write. This mirrors the established DalyHub mutation pattern
 * (`D1SpineRepository.rename`/`#setCompletion`/`softDelete`,
 * `D1TaskRepository.updateTask`):
 *
 *   - the precondition (archived state, observed status, "no active unfinished
 *     direct Task") is folded directly into the statement's `WHERE`/`NOT EXISTS`
 *     clauses, so a task created/reopened or a status/archive transition racing
 *     between the read and the write is evaluated AT THE STATEMENT'S OWN COMMIT,
 *     never against a stale snapshot (closes the PR #37 TOCTOU);
 *   - the statement always carries `RETURNING` and the caller inspects
 *     `changes()` (via the shared `recordAtomicMutation` seam) before deciding
 *     the outcome — a guard miss is never silently reported as success;
 *   - the domain write and its Activity append run in the SAME
 *     `D1Database.batch()` as `recordAtomicMutation` (ADR-012's atomic
 *     mutation-plus-Activity seam, shared with the Entity/EntityLink
 *     repositories) — a no-op appends nothing, and an Activity-insert failure
 *     rolls the domain write back too;
 *   - a guard miss is reconciled by RE-READING the fresh, persisted state and
 *     classifying honestly (already-changed / blocked / not-found) — never by
 *     assuming the caller's stale read was still accurate.
 */

import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  PROJECT,
  TASK,
  TASK_BELONGS_TO_PROJECT,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";
import {
  PROJECT_ARCHIVED,
  PROJECT_RESTORED,
  PROJECT_STATUS_CHANGED,
  ProjectArchiveBlockedError,
  ProjectArchivedError,
  ProjectSettingsConflictError,
  ProjectSettingsNotFoundError,
  ProjectSettingsStorageError,
  parseProjectWorkflowStatus,
  type ProjectSettingsChangeResult,
  type ProjectSettingsRecord,
  type ProjectSettingsRepository,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";

import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";

/** Bounded optimistic-retry budget for `setStatus`, mirroring the spine's `rename`. */
const MAX_STATUS_ATTEMPTS = 5;

/** The `project_details` row shape this adapter reads/writes, exactly as stored. */
interface ProjectDetailsRow {
  readonly status: string;
  readonly archived_at: string | null;
}

export type D1ProjectSettingsRepositoryOptions = {
  readonly actorContext?: ActivityActorContext;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  /** TEST-ONLY: force the atomic mutation's batch to fail at a chosen point,
   * proving the domain write rolls back with it. Never set in production. */
  readonly mutationFault?: AtomicMutationFault;
};

export class D1ProjectSettingsRepository implements ProjectSettingsRepository {
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
    options?: D1ProjectSettingsRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#actor = options?.actorContext ?? createSystemActorContext();
    this.#clock = options?.clock ?? systemClock;
    this.#id = options?.idGenerator ?? secureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#fault = options?.mutationFault;
  }

  async get(id: string): Promise<ProjectSettingsRecord | null> {
    const row = await this.#row(id);
    if (!row) return null;
    return this.#record(id, row.status, row.archived_at);
  }

  /**
   * Change the workflow status. A genuine transition is determined at the
   * database boundary: the write commits only when the row still holds the
   * status THIS attempt observed (optimistic concurrency, mirroring `rename`'s
   * `WHERE title = ?` guard) and the project is not archived. A no-op (the
   * requested status already holds) appends no Activity; a losing race re-reads
   * the authoritative state rather than trusting the stale read.
   */
  async setStatus(
    id: string,
    status: ProjectWorkflowStatus,
  ): Promise<ProjectSettingsChangeResult> {
    const next = parseProjectWorkflowStatus(status);
    let current = await this.#require(id);

    for (let attempt = 0; attempt < MAX_STATUS_ATTEMPTS; attempt++) {
      if (current.archivedAt) {
        throw new ProjectArchivedError();
      }
      if (current.status === next) {
        return { settings: current, changed: false };
      }

      const observedStatus = current.status;
      const now = this.#clock();
      const nowTs = toStorageTimestamp(now);

      const domainStatement = this.#db
        .prepare(
          `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
           SELECT ?, ?, ?, NULL, ?
           WHERE EXISTS (${this.#activeProjectExistsSql})
             AND NOT EXISTS (
                   SELECT 1 FROM project_details
                   WHERE workspace_id = ? AND entity_id = ?
                     AND (status != ? OR archived_at IS NOT NULL)
                 )
           ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
             status = excluded.status, updated_at = excluded.updated_at
           WHERE project_details.status = ? AND project_details.archived_at IS NULL
           RETURNING status, archived_at`,
        )
        .bind(
          this.#workspaceId,
          id,
          next,
          nowTs,
          this.#workspaceId,
          id,
          this.#workspaceId,
          id,
          observedStatus,
          observedStatus,
        );

      const event: NewActivityEvent = {
        type: PROJECT_STATUS_CHANGED,
        subjects: [{ entityId: id, role: "subject" }],
        payload: { oldStatus: observedStatus, newStatus: next },
      };
      const result = await this.#runAtomic<ProjectDetailsRow>(
        event,
        domainStatement,
        now,
      );

      if (result.changed && result.row) {
        return {
          settings: this.#record(id, result.row.status, result.row.archived_at),
          changed: true,
        };
      }

      // Nothing changed: re-read the fresh, persisted state and classify it,
      // rather than assume the observed pre-state still held.
      const refreshed = await this.get(id);
      if (!refreshed) {
        throw new ProjectSettingsNotFoundError();
      }
      if (refreshed.status === next && !refreshed.archivedAt) {
        // A concurrent identical change already committed — idempotent no-op.
        return { settings: refreshed, changed: false };
      }
      // A DIFFERENT concurrent change won (or the project became archived):
      // retry against the fresh state — the loop head re-checks archived/no-op.
      current = refreshed;
    }
    throw new ProjectSettingsConflictError();
  }

  /**
   * Archive: reversible, and blocked while the project has any active
   * incomplete direct Task. The block is folded into the SAME conditional write
   * as the archive itself (mirroring `D1SpineRepository.softDelete`'s
   * active-children guard) — never a separate precondition `SELECT` — so a Task
   * created or reopened between the read above and this statement's execution
   * is evaluated AT COMMIT TIME, closing the TOCTOU race entirely.
   */
  async archive(id: string): Promise<ProjectSettingsChangeResult> {
    const current = await this.#require(id);
    if (current.archivedAt) {
      return { settings: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const observedStatus = current.status;

    const domainStatement = this.#db
      .prepare(
        `INSERT INTO project_details (workspace_id, entity_id, status, archived_at, updated_at)
         SELECT ?, ?, ?, ?, ?
         WHERE EXISTS (${this.#activeProjectExistsSql})
           AND NOT EXISTS (
                 SELECT 1 FROM project_details
                 WHERE workspace_id = ? AND entity_id = ? AND archived_at IS NOT NULL
               )
           AND NOT EXISTS (${this.#unfinishedDirectTaskExistsSql})
         ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
           archived_at = excluded.archived_at, updated_at = excluded.updated_at
         WHERE project_details.archived_at IS NULL
         RETURNING status, archived_at`,
      )
      .bind(
        this.#workspaceId,
        id,
        observedStatus,
        nowTs,
        nowTs,
        this.#workspaceId,
        id,
        this.#workspaceId,
        id,
        this.#workspaceId,
        id,
      );

    const event: NewActivityEvent = {
      type: PROJECT_ARCHIVED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: { archivedAt: nowTs },
    };
    const result = await this.#runAtomic<ProjectDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return {
        settings: this.#record(id, result.row.status, result.row.archived_at),
        changed: true,
      };
    }

    // Nothing changed: reconcile honestly — either a concurrent archive already
    // won, or an active unfinished Task blocked it (never assume which).
    const refreshed = await this.get(id);
    if (!refreshed) {
      throw new ProjectSettingsNotFoundError();
    }
    if (refreshed.archivedAt) {
      return { settings: refreshed, changed: false };
    }
    throw new ProjectArchiveBlockedError();
  }

  /** Restore: reversible, always allowed (an archived Project may hold only
   * completed Tasks, so there is nothing to re-validate on the way back). */
  async restore(id: string): Promise<ProjectSettingsChangeResult> {
    const current = await this.#require(id);
    if (!current.archivedAt) {
      return { settings: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const domainStatement = this.#db
      .prepare(
        `UPDATE project_details SET archived_at = NULL, updated_at = ?
         WHERE workspace_id = ? AND entity_id = ? AND archived_at IS NOT NULL
           AND EXISTS (${this.#activeProjectExistsSql})
         RETURNING status, archived_at`,
      )
      .bind(nowTs, this.#workspaceId, id, this.#workspaceId, id);

    const event: NewActivityEvent = {
      type: PROJECT_RESTORED,
      subjects: [{ entityId: id, role: "subject" }],
      payload: { restoredAt: nowTs },
    };
    const result = await this.#runAtomic<ProjectDetailsRow>(
      event,
      domainStatement,
      now,
    );

    if (result.changed && result.row) {
      return {
        settings: this.#record(id, result.row.status, result.row.archived_at),
        changed: true,
      };
    }

    const refreshed = await this.get(id);
    if (!refreshed) {
      throw new ProjectSettingsNotFoundError();
    }
    // Either already restored by a concurrent racer, or (unreachably in normal
    // use) the project itself became inactive — either way, honestly report the
    // fresh state rather than claim a restore that did not occur.
    return { settings: refreshed, changed: false };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  /** Reusable EXISTS clause: an active PROJECT entity in this workspace. Binds
   * `(workspaceId, id)` at each embedding site, in source order. */
  get #activeProjectExistsSql(): string {
    return `SELECT 1 FROM entities
            WHERE workspace_id = ? AND id = ? AND type = '${PROJECT}' AND deleted_at IS NULL`;
  }

  /** Reusable NOT-EXISTS target: an active, incomplete direct child Task of this
   * project. Soft-deleted Tasks, Tasks in another workspace and Tasks under a
   * DIFFERENT project can never match (the join is workspace- and link-target-
   * scoped). Binds `(workspaceId, id)` at its embedding site. */
  get #unfinishedDirectTaskExistsSql(): string {
    return `SELECT 1 FROM entity_links l
            JOIN entities e
              ON e.workspace_id = l.workspace_id AND e.id = l.source_entity_id
                 AND e.type = '${TASK}' AND e.deleted_at IS NULL
            JOIN spine_records s
              ON s.workspace_id = e.workspace_id AND s.entity_id = e.id
                 AND s.completed_at IS NULL
            WHERE l.workspace_id = ? AND l.target_entity_id = ?
              AND l.type = '${TASK_BELONGS_TO_PROJECT}' AND l.deleted_at IS NULL`;
  }

  async #require(id: string): Promise<ProjectSettingsRecord> {
    const value = await this.get(id);
    if (!value) throw new ProjectSettingsNotFoundError();
    return value;
  }

  /** Read the current settings row. Missing, deleted, wrong-kind and
   * cross-workspace ids all resolve to `null` — the calm not-found contract. */
  async #row(id: string): Promise<ProjectDetailsRow | null> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT COALESCE(d.status, 'planned') AS status, d.archived_at AS archived_at
           FROM entities e
           LEFT JOIN project_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${PROJECT}' AND e.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first<ProjectDetailsRow>();
      return row ?? null;
    } catch (cause) {
      throw new ProjectSettingsStorageError({ cause });
    }
  }

  /**
   * Parse a persisted `status` string at the storage boundary — never an
   * unchecked cast (Phase 9). The column carries a DB CHECK constraint
   * restricting it to the three valid values, so a parse failure here means
   * genuinely corrupt storage state, surfaced as a storage error.
   */
  #record(
    id: string,
    status: string,
    archived: string | null,
  ): ProjectSettingsRecord {
    let parsed: ProjectWorkflowStatus;
    try {
      parsed = parseProjectWorkflowStatus(status);
    } catch (cause) {
      throw new ProjectSettingsStorageError({ cause });
    }
    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      status: parsed,
      archivedAt: archived ? fromStorageTimestamp(archived) : null,
    };
  }

  /**
   * Execute the domain statement and its Activity event atomically via the
   * SHARED `recordAtomicMutation` seam (ADR-012) — the same mechanism the
   * Entity/EntityLink repositories use, never a bespoke transaction. Both run in
   * ONE `D1Database.batch()`: the Activity append is guarded on the domain
   * statement's `changes()`, and a failure appending it rolls the domain write
   * back too.
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
      throw new ProjectSettingsStorageError({ cause });
    }
  }
}
