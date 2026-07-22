import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator,
  type ActivityActorContext,
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
  ProjectSettingsNotFoundError,
  ProjectSettingsStorageError,
  parseProjectWorkflowStatus,
  type ProjectSettingsChangeResult,
  type ProjectSettingsRecord,
  type ProjectSettingsRepository,
  type ProjectWorkflowStatus,
} from "~/kernel/project-settings";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import { fromStorageTimestamp, toStorageTimestamp } from "./database";
export type D1ProjectSettingsRepositoryOptions = {
  actorContext?: ActivityActorContext;
  clock?: Clock;
  idGenerator?: IdGenerator;
};
export class D1ProjectSettingsRepository implements ProjectSettingsRepository {
  #db: D1Database;
  #workspaceId: string;
  #actor: ActivityActorContext;
  #clock: Clock;
  #id: IdGenerator;
  #recorder: D1ActivityRecorder;
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
  }
  async get(id: string): Promise<ProjectSettingsRecord | null> {
    const row = await this.#row(id);
    if (!row) return null;
    return this.#record(id, row.status ?? "planned", row.archived_at);
  }
  async setStatus(id: string, status: ProjectWorkflowStatus) {
    const next = parseProjectWorkflowStatus(status);
    const current = await this.#require(id);
    if (current.status === next) return { settings: current, changed: false };
    return this.#change(
      id,
      current,
      next,
      current.archivedAt,
      PROJECT_STATUS_CHANGED,
      { oldStatus: current.status, newStatus: next },
    );
  }
  async archive(id: string) {
    const current = await this.#require(id);
    if (current.archivedAt) return { settings: current, changed: false };
    const unfinished = await this.#db
      .prepare(
        `SELECT 1 FROM entity_links l JOIN entities e ON e.workspace_id=l.workspace_id AND e.id=l.source_entity_id JOIN spine_records s ON s.workspace_id=e.workspace_id AND s.entity_id=e.id WHERE l.workspace_id=? AND l.type='${TASK_BELONGS_TO_PROJECT}' AND l.target_entity_id=? AND l.deleted_at IS NULL AND e.type='${TASK}' AND e.deleted_at IS NULL AND s.completed_at IS NULL LIMIT 1`,
      )
      .bind(this.#workspaceId, id)
      .first();
    if (unfinished) throw new ProjectArchiveBlockedError();
    const at = this.#clock();
    return this.#change(id, current, current.status, at, PROJECT_ARCHIVED, {
      archivedAt: at.toISOString(),
    });
  }
  async restore(id: string) {
    const current = await this.#require(id);
    if (!current.archivedAt) return { settings: current, changed: false };
    return this.#change(id, current, current.status, null, PROJECT_RESTORED, {
      restoredAt: this.#clock().toISOString(),
    });
  }
  async #require(id: string) {
    const value = await this.get(id);
    if (!value) throw new ProjectSettingsNotFoundError();
    return value;
  }
  async #row(
    id: string,
  ): Promise<{ status: string | null; archived_at: string | null } | null> {
    try {
      return (await this.#db
        .prepare(
          `SELECT d.status,d.archived_at FROM entities e LEFT JOIN project_details d ON d.workspace_id=e.workspace_id AND d.entity_id=e.id WHERE e.workspace_id=? AND e.id=? AND e.type='${PROJECT}' AND e.deleted_at IS NULL LIMIT 1`,
        )
        .bind(this.#workspaceId, id)
        .first()) as {
        status: string | null;
        archived_at: string | null;
      } | null;
    } catch (cause) {
      throw new ProjectSettingsStorageError({ cause });
    }
  }
  #record(
    id: string,
    status: string,
    archived: string | null,
  ): ProjectSettingsRecord {
    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      status: parseProjectWorkflowStatus(status),
      archivedAt: archived ? fromStorageTimestamp(archived) : null,
    };
  }
  async #change(
    id: string,
    current: ProjectSettingsRecord,
    status: ProjectWorkflowStatus,
    archivedAt: Date | null,
    type: string,
    payload: Record<string, string>,
  ): Promise<ProjectSettingsChangeResult> {
    const now = this.#clock();
    const ts = toStorageTimestamp(now);
    const statement = this.#db
      .prepare(
        `INSERT INTO project_details (workspace_id,entity_id,status,archived_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM entities WHERE workspace_id=? AND id=? AND type='${PROJECT}' AND deleted_at IS NULL) ON CONFLICT(workspace_id,entity_id) DO UPDATE SET status=excluded.status,archived_at=excluded.archived_at,updated_at=excluded.updated_at`,
      )
      .bind(
        this.#workspaceId,
        id,
        status,
        archivedAt ? toStorageTimestamp(archivedAt) : null,
        ts,
        this.#workspaceId,
        id,
      );
    const model = buildActivityWriteModel(
      { type, payload, subjects: [{ entityId: id, role: "subject" }] },
      this.#actor.actor,
      this.#id(),
      now,
    );
    try {
      await this.#db.batch([
        statement,
        ...this.#recorder.buildAppendStatements(this.#workspaceId, model),
      ]);
    } catch (cause) {
      throw new ProjectSettingsStorageError({ cause });
    }
    return { settings: { ...current, status, archivedAt }, changed: true };
  }
}
