/**
 * FND-03 Workspace kernel — D1 implementation of the workspace repository.
 *
 * A LOW-LEVEL platform/bootstrap adapter (ADR-010): it persists and verifies
 * workspace boundary records so the server composition boundary can establish a
 * `WorkspaceContext`. It is not module-facing. Like the entity adapter, it uses
 * prepared, parameterised statements only — no value is interpolated into SQL —
 * and maps raw D1 failures to `WorkspaceStorageError` so storage internals never
 * escape the kernel boundary (AGENTS.md §17).
 */

import {
  WorkspaceConflictError,
  WorkspaceStorageError,
  newWorkspaceId,
  parseWorkspaceId,
  type CreateWorkspaceInput,
  type WorkspaceId,
  type WorkspaceRecord,
  type WorkspaceRepository,
} from "~/kernel/workspaces";
import type { Clock } from "~/kernel/entities";
import { systemClock } from "~/kernel/entities";

import { toStorageTimestamp } from "./database";
import { rowToWorkspace, type WorkspaceRow } from "./workspace-database";

/** Optional dependencies, injectable for deterministic tests. */
export interface D1WorkspaceRepositoryOptions {
  /** Clock used for lifecycle timestamps. Defaults to the system clock. */
  readonly clock?: Clock;
  /** Id generator for new workspaces. Defaults to `crypto.randomUUID()`. */
  readonly idGenerator?: () => WorkspaceId;
}

const SELECT_COLUMNS = "id, created_at, updated_at";

export class D1WorkspaceRepository implements WorkspaceRepository {
  readonly #db: D1Database;
  readonly #clock: Clock;
  readonly #newId: () => WorkspaceId;

  constructor(db: D1Database, options: D1WorkspaceRepositoryOptions = {}) {
    this.#db = db;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? newWorkspaceId;
  }

  async create(input: CreateWorkspaceInput = {}): Promise<WorkspaceRecord> {
    // Re-validate the id at the storage boundary BEFORE any query or write. The
    // `WorkspaceId` brand is a compile-time guarantee only — a caller can defeat
    // it with a type assertion, and an injected id generator could return an
    // invalid value — so a supplied or generated id is parsed here. An invalid
    // id throws `WorkspaceValidationError` and nothing (no existence check, no
    // insert) touches the database, honouring the repository contract.
    const id = parseWorkspaceId(input.id ?? this.#newId());

    // Fail closed on a duplicate id rather than silently overwriting an existing
    // boundary. The PRIMARY KEY is the database backstop; this gives a typed,
    // safe error for the ordinary case.
    if (await this.exists(id)) {
      throw new WorkspaceConflictError();
    }

    const now = toStorageTimestamp(this.#clock());
    const row = await this.#firstOrThrow(
      this.#db
        .prepare(
          `INSERT INTO workspaces (id, created_at, updated_at)
           VALUES (?, ?, ?)
           RETURNING ${SELECT_COLUMNS}`,
        )
        .bind(id, now, now),
    );

    return rowToWorkspace(row);
  }

  async getById(id: WorkspaceId): Promise<WorkspaceRecord | null> {
    const row = await this.#first(
      this.#db
        .prepare(`SELECT ${SELECT_COLUMNS} FROM workspaces WHERE id = ?`)
        .bind(id),
    );
    return row ? rowToWorkspace(row) : null;
  }

  async exists(id: WorkspaceId): Promise<boolean> {
    try {
      const row = await this.#db
        .prepare(`SELECT 1 AS present FROM workspaces WHERE id = ? LIMIT 1`)
        .bind(id)
        .first<{ present: number }>();
      return row !== null;
    } catch (cause) {
      throw new WorkspaceStorageError(undefined, { cause });
    }
  }

  /** Run a statement returning at most one workspace row, mapping D1 failures. */
  async #first(statement: D1PreparedStatement): Promise<WorkspaceRow | null> {
    try {
      return await statement.first<WorkspaceRow>();
    } catch (cause) {
      throw new WorkspaceStorageError(undefined, { cause });
    }
  }

  /** Like {@link #first} but throws when no row is returned (invariant guard). */
  async #firstOrThrow(statement: D1PreparedStatement): Promise<WorkspaceRow> {
    const row = await this.#first(statement);
    if (!row) {
      throw new WorkspaceStorageError();
    }
    return row;
  }
}
