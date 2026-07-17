import { env } from "cloudflare:test";

import {
  createEntityLinkRepository,
  createEntityRepository,
  createWorkspaceRepository,
} from "~/platform/storage/d1";
import type { Clock, IdGenerator } from "~/kernel/entities";
import {
  createWorkspaceContext,
  parseWorkspaceId,
  type WorkspaceContext,
  type WorkspaceId,
} from "~/kernel/workspaces";

/**
 * A deterministic, injectable clock for repository tests. Time only moves when
 * a test advances it — so timestamp assertions never depend on wall-clock or
 * arbitrary sleeps (see AGENTS.md §14).
 */
export class FakeClock {
  #current: Date;

  constructor(start: string | Date = "2026-07-17T00:00:00.000Z") {
    this.#current = new Date(start);
  }

  /** Bound so it can be passed directly as a `Clock`. */
  readonly now: Clock = () => new Date(this.#current);

  /** Advance the clock by a number of milliseconds. */
  advance(ms: number): this {
    this.#current = new Date(this.#current.getTime() + ms);
    return this;
  }
}

/**
 * A deterministic id generator producing lexically-ordered ids (`id_0001`,
 * `id_0002`, …). Ordering matters: it makes the `(created_at, id)` pagination
 * tiebreaker predictable in tests.
 */
export function sequentialIds(prefix = "id"): IdGenerator {
  let n = 0;
  return () => `${prefix}_${String(++n).padStart(4, "0")}`;
}

/** Build a `WorkspaceContext` for a test workspace id. */
export function makeContext(workspaceId: string): WorkspaceContext {
  return createWorkspaceContext(parseWorkspaceId(workspaceId));
}

/**
 * Construct a workspace-scoped D1-backed entity repository over the isolated
 * test database (FND-03: repositories are bound to a `WorkspaceContext`).
 */
export function makeRepository(
  context: WorkspaceContext,
  options?: {
    clock?: Clock;
    idGenerator?: IdGenerator;
  },
) {
  return createEntityRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed EntityLink repository over the isolated
 * test database (FND-04: link repositories are bound to a `WorkspaceContext`).
 */
export function makeLinkRepository(
  context: WorkspaceContext,
  options?: {
    clock?: Clock;
    idGenerator?: IdGenerator;
  },
) {
  return createEntityLinkRepository(env.DB, context, options);
}

/** Construct the low-level workspace repository over the isolated test database. */
export function makeWorkspaceRepository(options?: {
  clock?: Clock;
  idGenerator?: () => WorkspaceId;
}) {
  return createWorkspaceRepository(env.DB, options);
}

/** Count all rows in `entity_links` (including unlinked) directly. */
export async function countLinkRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entity_links",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Insert an entity row directly under a workspace, returning its id. Lets link
 * tests seed active endpoints deterministically without going through the entity
 * repository. The workspace must already exist (FK).
 */
export async function seedEntity(
  workspaceId: string,
  id: string,
  {
    type = "task",
    title = id,
    at = "2026-07-17T00:00:00.000Z",
    deletedAt = null as string | null,
  } = {},
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO entities
       (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, workspaceId, type, title, at, at, deletedAt)
    .run();
  return id;
}

/** Count all rows in `entities` (including deleted) directly, for write-safety assertions. */
export async function countRows(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM entities").first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

/** Count all workspace rows directly. */
export async function countWorkspaces(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM workspaces",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Insert a workspace row directly, so entities can reference it (the FK requires
 * the workspace to exist). Idempotent via `INSERT OR IGNORE`.
 */
export async function ensureWorkspace(
  id: string,
  at = "2026-07-17T00:00:00.000Z",
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, created_at, updated_at)
     VALUES (?, ?, ?)`,
  )
    .bind(id, at, at)
    .run();
}

/**
 * Reset the local test tables to a deterministic empty state, then re-create the
 * given workspace rows. Entities are cleared BEFORE workspaces because the
 * foreign key is `ON DELETE RESTRICT` — a workspace that still owns entities
 * cannot be removed. Scoped strictly to the local/isolated test database.
 */
export async function resetTables(workspaceIds: string[] = []): Promise<void> {
  // Order matters under ON DELETE RESTRICT: links reference entities, and
  // entities reference workspaces, so clear children before parents.
  await env.DB.prepare("DELETE FROM entity_links").run();
  await env.DB.prepare("DELETE FROM entities").run();
  await env.DB.prepare("DELETE FROM workspaces").run();
  for (const id of workspaceIds) {
    await ensureWorkspace(id);
  }
}
