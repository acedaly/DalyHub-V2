/**
 * X-02 / TASKS-03 saved views — the ONE D1 implementation of the workspace-bound
 * `SavedViewRepository`, for every saved-view KIND.
 *
 * Generalised in place from `D1TaskViewRepository`. It is parameterised by a
 * {@link SavedViewCodec}, so a kind contributes a parser, a canonical serialiser
 * and a write validator — never a table, a repository or an SQL path. That is what
 * makes "cross-module saved views" an additional KIND rather than a second
 * persistence architecture.
 *
 * Constructed with a single `WorkspaceContext`; every statement constrains
 * `workspace_id = ?` with that context's id, `owner_id = ?` with the authenticated
 * owner AND `kind = ?` with the codec's kind, so a saved view is unreachable from
 * another workspace, another owner or another kind's surface — the isolation is in
 * the QUERY, not in a caller's discipline. Every value is bound; nothing is
 * interpolated into SQL.
 *
 * What is stored is always the CANONICAL re-serialised config, so only known keys
 * with known values ever reach the column. What is read is parsed leniently, so a
 * row written by a later build degrades to the parts this build understands rather
 * than breaking the page.
 */

import {
  secureIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/spine";
import {
  MAX_SAVED_VIEWS_PER_KIND,
  SavedViewLimitError,
  SavedViewNameTakenError,
  SavedViewNotFoundError,
  SavedViewStorageError,
  validateSavedViewId,
  validateSavedViewName,
  validateSavedViewOwnerId,
  type NewSavedView,
  type SavedView,
  type SavedViewChangeResult,
  type SavedViewCodec,
  type SavedViewPatch,
  type SavedViewRepository,
} from "~/kernel/views";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface SavedViewRow {
  readonly workspace_id: string;
  readonly id: string;
  readonly owner_id: string;
  readonly kind: string;
  readonly name: string;
  readonly config_version: number;
  readonly config: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface D1SavedViewRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
}

/** SQLite's uniqueness violation text, used to convert a race into a typed error. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  );
}

export class D1SavedViewRepository<
  TConfig,
> implements SavedViewRepository<TConfig> {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #codec: SavedViewCodec<TConfig>;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    codec: SavedViewCodec<TConfig>,
    options?: D1SavedViewRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#codec = codec;
    this.#clock = options?.clock ?? systemClock;
    this.#newId = options?.idGenerator ?? secureIdGenerator;
  }

  async list(ownerId: string): Promise<readonly SavedView<TConfig>[]> {
    const owner = validateSavedViewOwnerId(ownerId);
    try {
      const result = await this.#db
        .prepare(
          `SELECT * FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ? AND kind = ?
           ORDER BY lower(name) ASC, id ASC
           LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          owner,
          this.#codec.kind,
          MAX_SAVED_VIEWS_PER_KIND,
        )
        .all<SavedViewRow>();
      return (result.results ?? []).map((row) => this.#record(row));
    } catch (error) {
      throw new SavedViewStorageError({ cause: error });
    }
  }

  async get(
    ownerId: string,
    viewId: string,
  ): Promise<SavedView<TConfig> | null> {
    const owner = validateSavedViewOwnerId(ownerId);
    const id = validateSavedViewId(viewId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT * FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ? AND kind = ? AND id = ?`,
        )
        .bind(this.#workspaceId, owner, this.#codec.kind, id)
        .first<SavedViewRow>();
      return row ? this.#record(row) : null;
    } catch (error) {
      throw new SavedViewStorageError({ cause: error });
    }
  }

  async create(
    ownerId: string,
    input: NewSavedView<TConfig>,
  ): Promise<SavedView<TConfig>> {
    const owner = validateSavedViewOwnerId(ownerId);
    const name = validateSavedViewName(input.name);
    const config = this.#codec.validateForWrite(input.config);

    // A bounded collection: the switcher stays scannable and one owner cannot fill
    // the table. Counted server-side, never trusted from the client.
    const existing = await this.#count(owner);
    if (existing >= MAX_SAVED_VIEWS_PER_KIND) {
      throw new SavedViewLimitError(
        `You can save up to ${MAX_SAVED_VIEWS_PER_KIND} views. Delete one to save another.`,
      );
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();
    try {
      const row = await this.#db
        .prepare(
          `INSERT INTO task_saved_views
             (workspace_id, id, owner_id, kind, name, config_version, config, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(
          this.#workspaceId,
          id,
          owner,
          this.#codec.kind,
          name,
          this.#codec.version,
          this.#codec.serialise(config),
          nowTs,
          nowTs,
        )
        .first<SavedViewRow>();
      if (!row) throw new Error("Saved view insert returned no row.");
      return this.#record(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new SavedViewNameTakenError();
      throw new SavedViewStorageError({ cause: error });
    }
  }

  async update(
    ownerId: string,
    viewId: string,
    patch: SavedViewPatch<TConfig>,
  ): Promise<SavedViewChangeResult<TConfig>> {
    const owner = validateSavedViewOwnerId(ownerId);
    const id = validateSavedViewId(viewId);
    const current = await this.get(owner, id);
    if (!current) throw new SavedViewNotFoundError();

    const name =
      patch.name === undefined
        ? current.name
        : validateSavedViewName(patch.name);
    const config =
      patch.config === undefined
        ? current.config
        : this.#codec.validateForWrite(patch.config);

    if (name === current.name && this.#codec.equals(config, current.config)) {
      return { view: current, changed: false };
    }

    const nowTs = toStorageTimestamp(this.#clock());
    try {
      const row = await this.#db
        .prepare(
          `UPDATE task_saved_views
             SET name = ?, config = ?, config_version = ?, updated_at = ?
           WHERE workspace_id = ? AND owner_id = ? AND kind = ? AND id = ?
           RETURNING *`,
        )
        .bind(
          name,
          this.#codec.serialise(config),
          this.#codec.version,
          nowTs,
          this.#workspaceId,
          owner,
          this.#codec.kind,
          id,
        )
        .first<SavedViewRow>();
      if (!row) throw new SavedViewNotFoundError();
      return { view: this.#record(row), changed: true };
    } catch (error) {
      if (error instanceof SavedViewNotFoundError) throw error;
      if (isUniqueViolation(error)) throw new SavedViewNameTakenError();
      throw new SavedViewStorageError({ cause: error });
    }
  }

  async duplicate(
    ownerId: string,
    viewId: string,
    name: string,
  ): Promise<SavedView<TConfig>> {
    const owner = validateSavedViewOwnerId(ownerId);
    const source = await this.get(owner, validateSavedViewId(viewId));
    if (!source) throw new SavedViewNotFoundError();
    return this.create(owner, { name, config: source.config });
  }

  async remove(ownerId: string, viewId: string): Promise<boolean> {
    const owner = validateSavedViewOwnerId(ownerId);
    const id = validateSavedViewId(viewId);
    try {
      const result = await this.#db
        .prepare(
          `DELETE FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ? AND kind = ? AND id = ?`,
        )
        .bind(this.#workspaceId, owner, this.#codec.kind, id)
        .run();
      // Idempotent: deleting an already-deleted view is a defined no-op, not an
      // error the user has to understand.
      return (result.meta?.changes ?? 0) > 0;
    } catch (error) {
      throw new SavedViewStorageError({ cause: error });
    }
  }

  async #count(ownerId: string): Promise<number> {
    try {
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS total FROM task_saved_views
           WHERE workspace_id = ? AND owner_id = ? AND kind = ?`,
        )
        .bind(this.#workspaceId, ownerId, this.#codec.kind)
        .first<{ readonly total: number }>();
      return row?.total ?? 0;
    } catch (error) {
      throw new SavedViewStorageError({ cause: error });
    }
  }

  #record(row: SavedViewRow): SavedView<TConfig> {
    let raw: unknown;
    try {
      raw = JSON.parse(row.config) as unknown;
    } catch {
      // A corrupt blob degrades to the standard configuration rather than taking
      // the whole page down; the name and the row are preserved so the owner can
      // re-save it.
      raw = {};
    }
    return {
      id: row.id,
      workspaceId: parseWorkspaceId(row.workspace_id),
      ownerId: row.owner_id,
      kind: this.#codec.kind,
      name: row.name,
      configVersion: row.config_version,
      config: this.#codec.parse(raw),
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
    };
  }
}
