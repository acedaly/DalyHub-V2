import { env } from "cloudflare:test";

import {
  createActivityRepository,
  createEntityLinkRepository,
  createEntityRepository,
  createWorkspaceRepository,
  type AtomicMutationFault,
} from "~/platform/storage/d1";
import type { ActivityActorContext } from "~/kernel/activity";
import type { Clock, IdGenerator } from "~/kernel/entities";
import {
  createWorkspaceContext,
  parseWorkspaceId,
  type WorkspaceContext,
  type WorkspaceId,
} from "~/kernel/workspaces";

/** Options accepted by the mutation-repository test factories. */
export interface RepositoryTestOptions {
  clock?: Clock;
  idGenerator?: IdGenerator;
  actorContext?: ActivityActorContext;
  activityIdGenerator?: IdGenerator;
  activityFault?: AtomicMutationFault;
}

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
  options?: RepositoryTestOptions,
) {
  return createEntityRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed EntityLink repository over the isolated
 * test database (FND-04: link repositories are bound to a `WorkspaceContext`).
 */
export function makeLinkRepository(
  context: WorkspaceContext,
  options?: RepositoryTestOptions,
) {
  return createEntityLinkRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped, read-only D1-backed Activity repository over the
 * isolated test database (FND-05: bound to a `WorkspaceContext`).
 */
export function makeActivityRepository(context: WorkspaceContext) {
  return createActivityRepository(env.DB, context);
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

/** Count all rows in `activities` directly. */
export async function countActivities(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activities",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all rows in `activity_subjects` directly. */
export async function countActivitySubjects(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activity_subjects",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count `activities` rows of a given event type directly. */
export async function countActivitiesOfType(type: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activities WHERE type = ?",
  )
    .bind(type)
    .first<{ n: number }>();
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
  // Order matters under ON DELETE RESTRICT: activity_subjects references both
  // activities and entities; activities and entity_links reference entities;
  // entities reference workspaces. Clear children strictly before parents.
  await env.DB.prepare("DELETE FROM activity_subjects").run();
  await env.DB.prepare("DELETE FROM activities").run();
  await env.DB.prepare("DELETE FROM entity_links").run();
  await env.DB.prepare("DELETE FROM entities").run();
  await env.DB.prepare("DELETE FROM workspaces").run();
  for (const id of workspaceIds) {
    await ensureWorkspace(id);
  }
}

/**
 * Wrap a `D1Database` so every `prepare` call is counted. Lets a test assert that
 * listing a page of Activity events issues a BOUNDED number of queries regardless
 * of page size — i.e. there is no N+1 subject lookup. Only `prepare` is proxied
 * (the sole entry point the repositories use to build statements).
 */
export function countingDb(db: D1Database): {
  db: D1Database;
  prepareCount: () => number;
  reset: () => void;
} {
  let count = 0;
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "prepare") {
        return (query: string) => {
          count += 1;
          return target.prepare(query);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
  return {
    db: proxy,
    prepareCount: () => count,
    reset: () => {
      count = 0;
    },
  };
}
