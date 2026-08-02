import { env } from "cloudflare:test";

import {
  createActivityRepository,
  createAlignmentRepository,
  createAppPreferencesRepository,
  createTaskViewRepository,
  createAreaRepository,
  createAreaSettingsRepository,
  createAssetHistoryRepository,
  createAssetRepository,
  createDiaryRepository,
  createEntityLinkRepository,
  createEntityRepository,
  createGoalDetailsRepository,
  createGoalRepository,
  createMeetingRepository,
  createNoteDetailsRepository,
  createNoteRepository,
  createPersonRepository,
  createProjectHealthRepository,
  createRelationshipRepository,
  createProjectRepository,
  createProjectSettingsRepository,
  createReviewRepository,
  createSpineRepository,
  createTaskRepository,
  createWorkspaceRepository,
  type AtomicMutationFault,
  type D1AppPreferencesRepositoryOptions,
  type D1TaskViewRepositoryOptions,
  type D1AreaSettingsRepositoryOptions,
  type D1AssetHistoryRepositoryOptions,
  type D1AssetRepositoryOptions,
  type D1DiaryRepositoryOptions,
  type D1GoalDetailsRepositoryOptions,
  type D1NoteDetailsRepositoryOptions,
  type D1PersonRepositoryOptions,
  type D1ProjectSettingsRepositoryOptions,
  type D1ReviewRepositoryOptions,
  type D1SpineRepositoryOptions,
  type D1TaskRepositoryOptions,
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
  /** EntityLink-only: a test-only deterministic race barrier (see
   * `D1EntityLinkRepositoryOptions.raceBarrier`). Ignored by other factories. */
  raceBarrier?: () => Promise<void>;
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

/**
 * Construct a workspace-scoped D1-backed SpineRepository over the isolated test
 * database (FND-07: the authoritative Area → Goal → Project → Task repository,
 * bound to a `WorkspaceContext`).
 */
export function makeSpineRepository(
  context: WorkspaceContext,
  options?: D1SpineRepositoryOptions,
) {
  return createSpineRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed TaskRepository over the isolated test
 * database (TODAY-02: the task-detail repository composing the spine, bound to a
 * `WorkspaceContext`).
 */
export function makeTaskRepository(
  context: WorkspaceContext,
  options?: D1TaskRepositoryOptions,
) {
  return createTaskRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped, read-only D1-backed ProjectRepository over the
 * isolated test database (PROJ-01: the project read projection, bound to a
 * `WorkspaceContext`).
 */
export function makeProjectRepository(context: WorkspaceContext) {
  return createProjectRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped, read-only D1-backed AreaRepository over the
 * isolated test database (AREA-01: the Area read projection).
 */
export function makeAreaRepository(context: WorkspaceContext) {
  return createAreaRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped, read-only D1-backed GoalRepository over the
 * isolated test database (AREA-02: the Goal read projection).
 */
export function makeGoalRepository(context: WorkspaceContext) {
  return createGoalRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped D1-backed GoalDetailsRepository over the
 * isolated test database (AREA-02: target date + definition of done).
 */
export function makeGoalDetailsRepository(
  context: WorkspaceContext,
  options?: D1GoalDetailsRepositoryOptions,
) {
  return createGoalDetailsRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed NoteDetailsRepository over the
 * isolated test database (NOTES-01A: the Note-owned Markdown content slice).
 */
export function makeNoteDetailsRepository(
  context: WorkspaceContext,
  options?: D1NoteDetailsRepositoryOptions,
) {
  return createNoteDetailsRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped, read-only D1-backed NoteQueryRepository over the
 * isolated test database (NOTES-03: the Notes READ projection — collection
 * filtering/ordering, full-content search, tag facets, reference resolution).
 */
export function makeNoteRepository(context: WorkspaceContext) {
  return createNoteRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped D1-backed DiaryRepository over the isolated test
 * database (DIARY-01A: the authoritative Diary Entry capture surface + Timeline
 * read model, bound to a `WorkspaceContext`).
 */
export function makeDiaryRepository(
  context: WorkspaceContext,
  options?: D1DiaryRepositoryOptions,
) {
  return createDiaryRepository(env.DB, context, options);
}

/** Count all rows in `diary_entry_details` directly. */
export async function countDiaryEntryRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM diary_entry_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Construct a workspace-scoped D1-backed PersonRepository over the isolated test
 * database (PEOPLE-01: the authoritative Person capture surface + collection read
 * model, bound to a `WorkspaceContext`).
 */
export function makePersonRepository(
  context: WorkspaceContext,
  options?: D1PersonRepositoryOptions,
) {
  return createPersonRepository(env.DB, context, options);
}

/** Count all rows in `person_details` directly. */
export async function countPersonRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM person_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Construct a workspace-scoped D1-backed MeetingRepository over the isolated test
 * database (MEET-01/MEET-02: meeting details, structured items and the follow-up
 * Task mapping, bound to a `WorkspaceContext`).
 */
export function makeMeetingRepository(
  context: WorkspaceContext,
  options?: RepositoryTestOptions,
) {
  return createMeetingRepository(env.DB, context, options);
}

/** Count all rows in `meeting_details` directly. */
export async function countMeetingRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM meeting_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Construct a workspace-scoped D1-backed AssetRepository over the isolated test
 * database (ASSET-01: the authoritative Asset capture surface + collection read
 * model, bound to a `WorkspaceContext`).
 */
export function makeAssetRepository(
  context: WorkspaceContext,
  options?: D1AssetRepositoryOptions,
) {
  return createAssetRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed AssetHistoryRepository over the isolated
 * test database (ASSET-02: Asset events + obligations, bound to a
 * `WorkspaceContext`). The Task write gateway is injected per-test so a suite that
 * links no Tasks needs no Task repository at all.
 */
export function makeAssetHistoryRepository(
  context: WorkspaceContext,
  options?: D1AssetHistoryRepositoryOptions,
) {
  return createAssetHistoryRepository(env.DB, context, options);
}

/** Count all rows in `asset_events` directly. */
export async function countAssetEventRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM asset_events WHERE deleted_at IS NULL",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all live rows in `asset_obligations` directly. */
export async function countAssetObligationRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM asset_obligations WHERE deleted_at IS NULL",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all rows in `asset_details` directly. */
export async function countAssetRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM asset_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Construct a workspace-scoped D1-backed ReviewRepository over the isolated test
 * database (REVIEWS-01: Review identity/detail/sections/lifecycle).
 */
export function makeReviewRepository(
  context: WorkspaceContext,
  options?: D1ReviewRepositoryOptions,
) {
  return createReviewRepository(env.DB, context, options);
}

/** Count all rows in `review_details` directly. */
export async function countReviewRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM review_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all rows in `review_sections` directly. */
export async function countReviewSectionRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM review_sections",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Read the raw `payload_json` for the newest activity of a given type. */
export async function latestActivityPayload(
  type: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT payload_json FROM activities WHERE type = ? ORDER BY occurred_at DESC, id DESC LIMIT 1",
  )
    .bind(type)
    .first<{ payload_json: string }>();
  return row?.payload_json ?? null;
}

/** Count all rows in `meeting_item_tasks` (the MEET-02 source-item mapping). */
export async function countMeetingItemTaskRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM meeting_item_tasks",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Construct a workspace-scoped, read-only D1-backed ProjectHealthRepository over the
 * isolated test database (PROJ-02: the derived project-health facts projection,
 * bound to a `WorkspaceContext`).
 */
export function makeProjectHealthRepository(context: WorkspaceContext) {
  return createProjectHealthRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped, read-only D1-backed AlignmentRepository over
 * the isolated test database (AREA-03: the derived Goal-alignment
 * activity-facts projection, bound to a `WorkspaceContext`).
 */
export function makeAlignmentRepository(context: WorkspaceContext) {
  return createAlignmentRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped, read-only D1-backed RelationshipRepository over
 * the isolated test database (PEOPLE-03: the derived relationship-facts
 * projection, bound to a `WorkspaceContext`).
 */
export function makeRelationshipRepository(context: WorkspaceContext) {
  return createRelationshipRepository(env.DB, context);
}

/**
 * Construct a workspace-scoped D1-backed TaskViewRepository over the isolated
 * test database (TASKS-03: persisted saved Tasks views, bound to a
 * `WorkspaceContext` AND, per call, to an authenticated owner).
 */
export function makeTaskViewRepository(
  context: WorkspaceContext,
  options?: D1TaskViewRepositoryOptions,
) {
  return createTaskViewRepository(env.DB, context, options);
}

export function makeAppPreferencesRepository(
  context: WorkspaceContext,
  options?: D1AppPreferencesRepositoryOptions,
) {
  return createAppPreferencesRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed ProjectSettingsRepository over the
 * isolated test database (PROJ-05: workflow status + archival, bound to a
 * `WorkspaceContext`).
 */
export function makeProjectSettingsRepository(
  context: WorkspaceContext,
  options?: D1ProjectSettingsRepositoryOptions,
) {
  return createProjectSettingsRepository(env.DB, context, options);
}

/**
 * Construct a workspace-scoped D1-backed AreaSettingsRepository over the isolated
 * test database (AREA-05: Area archival, bound to a `WorkspaceContext`).
 */
export function makeAreaSettingsRepository(
  context: WorkspaceContext,
  options?: D1AreaSettingsRepositoryOptions,
) {
  return createAreaSettingsRepository(env.DB, context, options);
}

/** Count all rows in `project_details` directly. */
export async function countProjectDetailRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM project_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count `area_details` rows, optionally scoped to a workspace. */
export async function countAreaDetailRows(
  workspaceId?: string,
): Promise<number> {
  const row = workspaceId
    ? await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM area_details WHERE workspace_id = ?",
      )
        .bind(workspaceId)
        .first<{ n: number }>()
    : await env.DB.prepare("SELECT COUNT(*) AS n FROM area_details").first<{
        n: number;
      }>();
  return row?.n ?? 0;
}

/** Count all rows in `goal_details` directly. */
export async function countGoalDetailRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM goal_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all rows in `note_details` directly. */
export async function countNoteDetailRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM note_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all rows in `task_details` directly. */
export async function countTaskDetailRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM task_details",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Count all rows in `spine_records` directly. */
export async function countSpineRows(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM spine_records",
  ).first<{ n: number }>();
  return row?.n ?? 0;
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
    type = "widget",
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
  await env.DB.prepare("DELETE FROM spine_records").run();
  await env.DB.prepare("DELETE FROM task_details").run();
  await env.DB.prepare("DELETE FROM project_details").run();
  await env.DB.prepare("DELETE FROM goal_details").run();
  await env.DB.prepare("DELETE FROM area_details").run();
  await env.DB.prepare("DELETE FROM note_details").run();
  await env.DB.prepare("DELETE FROM diary_entry_details").run();
  await env.DB.prepare("DELETE FROM person_details").run();
  // Meeting children first (both cascade from meeting_details); meeting_details FK
  // to entities is ON DELETE RESTRICT so it must clear before entities.
  await env.DB.prepare("DELETE FROM meeting_item_tasks").run();
  await env.DB.prepare("DELETE FROM meeting_items").run();
  await env.DB.prepare("DELETE FROM meeting_details").run();
  // ASSET-02 children first: both reference entities ON DELETE RESTRICT.
  await env.DB.prepare("DELETE FROM asset_events").run();
  await env.DB.prepare("DELETE FROM asset_obligations").run();
  await env.DB.prepare("DELETE FROM asset_details").run();
  await env.DB.prepare("DELETE FROM review_sections").run();
  await env.DB.prepare("DELETE FROM review_details").run();
  await env.DB.prepare("DELETE FROM owner_app_preferences").run();
  await env.DB.prepare("DELETE FROM task_saved_views").run();
  // TASKS-04: the recurrence rows reference entities ON DELETE RESTRICT, so they
  // must clear before entities.
  await env.DB.prepare("DELETE FROM task_recurrence_rules").run();
  // PWA-05 offline capture receipts reference workspaces ON DELETE RESTRICT, so
  // they must clear before workspaces (they do not reference entities).
  await env.DB.prepare("DELETE FROM offline_capture_receipts").run();
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
