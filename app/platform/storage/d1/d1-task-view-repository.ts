/**
 * TASKS-03 Task saved views — D1 implementation of the workspace-bound
 * `TaskViewRepository`.
 *
 * Constructed with a single `WorkspaceContext`; every statement constrains
 * `workspace_id = ?` with that context's id AND `owner_id = ?` with the
 * authenticated owner, so a saved view is unreachable from another workspace or
 * another owner — the isolation is in the QUERY, not in a caller's discipline.
 * Every value is bound; nothing is interpolated into SQL.
 *
 * What is stored is always the CANONICAL re-serialised config, so only known keys
 * with known values ever reach the column. What is read is parsed leniently, so a
 * row written by a later build degrades to the parts this build understands rather
 * than breaking the page.
 */

import { secureIdGenerator, systemClock, type Clock, type IdGenerator } from "~/kernel/spine";
import {
  MAX_TASK_SAVED_VIEWS,
  TASK_VIEW_CONFIG_VERSION,
  parseTaskViewConfig,
  serialiseTaskViewConfig,
  taskViewConfigsEqual,
  validateTaskViewConfigForWrite,
  validateTaskViewId,
  validateTaskViewName,
  validateTaskViewOwnerId,
  TaskViewLimitError,
  TaskViewNameTakenError,
  TaskViewNotFoundError,
  TaskViewStorageError,
  type NewTaskSavedView,
  type TaskSavedView,
  type TaskSavedViewChangeResult,
  type TaskSavedViewPatch,
  type TaskViewRepository,
} from "~/kernel/task-views";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface TaskSavedViewRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly config_version: number;
  readonly config: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface D1TaskViewRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
}

/** SQLite's uniqueness violation text, used to convert a race into a typed error. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  );
}

export class D1TaskViewRepository implements TaskViewRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: D1TaskViewRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options?.clock ?? systemClock;
    this.#newId = options?.idGenerator ?? secureIdGenerator;
  }

  async list(ownerId: string): Promise<readonly TaskSavedView[]> {
    const owner = validateTaskViewOwnerId(ownerId);
    try {
      const result = await this.#db
        .prepare(
          `SELECT * FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ?
           ORDER BY lower(name) ASC, id ASC
           LIMIT ?`,
        )
        .bind(this.#workspaceId, owner, MAX_TASK_SAVED_VIEWS)
        .all<TaskSavedViewRow>();
      return (result.results ?? []).map((row) => this.#record(row));
    } catch (error) {
      throw new TaskViewStorageError({ cause: error });
    }
  }

  async get(ownerId: string, viewId: string): Promise<TaskSavedView | null> {
    const owner = validateTaskViewOwnerId(ownerId);
    const id = validateTaskViewId(viewId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT * FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ? AND id = ?`,
        )
        .bind(this.#workspaceId, owner, id)
        .first<TaskSavedViewRow>();
      return row ? this.#record(row) : null;
    } catch (error) {
      throw new TaskViewStorageError({ cause: error });
    }
  }

  async create(
    ownerId: string,
    input: NewTaskSavedView,
  ): Promise<TaskSavedView> {
    const owner = validateTaskViewOwnerId(ownerId);
    const name = validateTaskViewName(input.name);
    const config = validateTaskViewConfigForWrite(input.config);

    // A bounded collection: the switcher stays scannable and one owner cannot fill
    // the table. Counted server-side, never trusted from the client.
    const existing = await this.#count(owner);
    if (existing >= MAX_TASK_SAVED_VIEWS) {
      throw new TaskViewLimitError(
        `You can save up to ${MAX_TASK_SAVED_VIEWS} Task views. Delete one to save another.`,
      );
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();
    try {
      const row = await this.#db
        .prepare(
          `INSERT INTO task_saved_views
             (workspace_id, id, owner_id, name, config_version, config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(
          this.#workspaceId,
          id,
          owner,
          name,
          TASK_VIEW_CONFIG_VERSION,
          serialiseTaskViewConfig(config),
          nowTs,
          nowTs,
        )
        .first<TaskSavedViewRow>();
      if (!row) throw new Error("Saved view insert returned no row.");
      return this.#record(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new TaskViewNameTakenError();
      throw new TaskViewStorageError({ cause: error });
    }
  }

  async update(
    ownerId: string,
    viewId: string,
    patch: TaskSavedViewPatch,
  ): Promise<TaskSavedViewChangeResult> {
    const owner = validateTaskViewOwnerId(ownerId);
    const id = validateTaskViewId(viewId);
    const current = await this.get(owner, id);
    if (!current) throw new TaskViewNotFoundError();

    const name =
      patch.name === undefined ? current.name : validateTaskViewName(patch.name);
    const config =
      patch.config === undefined
        ? current.config
        : validateTaskViewConfigForWrite(patch.config);

    if (name === current.name && taskViewConfigsEqual(config, current.config)) {
      return { view: current, changed: false };
    }

    const nowTs = toStorageTimestamp(this.#clock());
    try {
      const row = await this.#db
        .prepare(
          `UPDATE task_saved_views
             SET name = ?, config = ?, config_version = ?, updated_at = ?
           WHERE workspace_id = ? AND owner_id = ? AND id = ?
           RETURNING *`,
        )
        .bind(
          name,
          serialiseTaskViewConfig(config),
          TASK_VIEW_CONFIG_VERSION,
          nowTs,
          this.#workspaceId,
          owner,
          id,
        )
        .first<TaskSavedViewRow>();
      if (!row) throw new TaskViewNotFoundError();
      return { view: this.#record(row), changed: true };
    } catch (error) {
      if (error instanceof TaskViewNotFoundError) throw error;
      if (isUniqueViolation(error)) throw new TaskViewNameTakenError();
      throw new TaskViewStorageError({ cause: error });
    }
  }

  async duplicate(
    ownerId: string,
    viewId: string,
    name: string,
  ): Promise<TaskSavedView> {
    const owner = validateTaskViewOwnerId(ownerId);
    const source = await this.get(owner, validateTaskViewId(viewId));
    if (!source) throw new TaskViewNotFoundError();
    return this.create(owner, { name, config: source.config });
  }

  async remove(ownerId: string, viewId: string): Promise<boolean> {
    const owner = validateTaskViewOwnerId(ownerId);
    const id = validateTaskViewId(viewId);
    try {
      const result = await this.#db
        .prepare(
          `DELETE FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ? AND id = ?`,
        )
        .bind(this.#workspaceId, owner, id)
        .run();
      // Idempotent: deleting an already-deleted view is a defined no-op, not an
      // error the user has to understand.
      return (result.meta?.changes ?? 0) > 0;
    } catch (error) {
      throw new TaskViewStorageError({ cause: error });
    }
  }

  async #count(ownerId: string): Promise<number> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS total FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ?`,
        )
        .bind(this.#workspaceId, ownerId)
        .first<{ readonly total: number }>();
      return row?.total ?? 0;
    } catch (error) {
      throw new TaskViewStorageError({ cause: error });
    }
  }

  #record(row: TaskSavedViewRow): TaskSavedView {
    let raw: unknown;
    try {
      raw = JSON.parse(row.config) as unknown;
    } catch {
      // A corrupt blob degrades to the standard configuration rather than taking
      // the whole Tasks page down; the name and the row are preserved so the owner
      // can re-save it.
      raw = {};
    }
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      ownerId: row.owner_id,
      name: row.name,
      configVersion: row.config_version,
      config: parseTaskViewConfig(raw),
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }
}
