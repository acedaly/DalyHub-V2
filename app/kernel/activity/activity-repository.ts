/**
 * FND-05 Activity kernel — the module-facing Activity READ contract.
 *
 * This is the storage-independent interface modules depend on to read history. It
 * speaks only in domain terms (camelCase `ActivityRecord`s, domain errors) and
 * never exposes D1, SQL, JSON text or Cloudflare types. It is READ-ONLY by
 * design: Activity is append-only through application contracts (ADR-005/ADR-012),
 * so there is deliberately NO create, update, delete, soft-delete or restore
 * method here. Events are appended only as the atomic side effect of a meaningful
 * domain mutation, through the internal recording seam used by the D1 repositories
 * — never through this module-facing surface.
 *
 * The repository is WORKSPACE-BOUND: it is constructed with a single
 * `WorkspaceContext` and every method operates only within that workspace. No
 * method accepts a `workspaceId` — module code cannot pass, select or override the
 * scope per operation (ADR-010).
 */

import type {
  ActivityPage,
  ActivityRecord,
  ActivityTypeBucketCount,
  CountActivityByTypeInput,
  ListActivityInWindowInput,
  ListEntitiesActivityInput,
  ListEntityActivityInput,
  ListWorkspaceActivityInput,
} from "./activity";

/** Injectable clock, so tests control time instead of sleeping. */
export type Clock = () => Date;

/** Injectable id generator, so tests get deterministic ids. */
export type IdGenerator = () => string;

/** The default clock: the current wall-clock time. */
export const systemClock: Clock = () => new Date();

/**
 * The default id generator: a Workers-native secure UUID. `crypto.randomUUID()`
 * is globally unique and unguessable; ids are never reused.
 */
export const secureIdGenerator: IdGenerator = () => crypto.randomUUID();

/**
 * The kernel's Activity read contract.
 *
 * Error semantics (thrown as the typed errors in `activity-errors.ts`):
 *   - invalid input        → `ActivityValidationError` (no storage touched)
 *   - unknown anchor entity → `ActivitySubjectUnavailableError`
 *   - bad cursor           → `InvalidActivityCursorError`
 *   - corrupt stored JSON  → `ActivityPayloadError`
 *   - storage failure      → `ActivityStorageError`
 */
export interface ActivityRepository {
  /**
   * Read one Activity event by id within the bound workspace, with ALL of its
   * subjects. Returns null when there is no such event in this workspace —
   * including when it exists in another workspace, which is indistinguishable
   * from "does not exist" and never discloses cross-workspace existence.
   */
  getById(id: string): Promise<ActivityRecord | null>;

  /**
   * List the whole workspace Activity Feed using bounded cursor pagination.
   * Orders events newest-first by `(occurredAt, id)`, optionally filters by a
   * single event type, returns each event with all of its subjects (no N+1),
   * and applies a safe default and maximum page size. A cursor is bound to the
   * workspace + type filter that produced it and is rejected if replayed under a
   * different scope.
   */
  listForWorkspace(input?: ListWorkspaceActivityInput): Promise<ActivityPage>;

  /**
   * List one entity's Timeline — the events it is a subject of — using bounded
   * cursor pagination. The anchor entity must exist in the bound workspace, but
   * may be active OR soft-deleted: a deleted entity's Timeline remains
   * queryable. Returns the SAME `ActivityRecord`s the workspace feed returns,
   * each with ALL of its subjects (not only the anchor), newest-first, optionally
   * filtered by type, with no N+1 lookups. A cross-workspace or nonexistent
   * anchor surfaces as `ActivitySubjectUnavailableError`, disclosing nothing.
   */
  listForEntity(
    entityId: string,
    input?: ListEntityActivityInput,
  ): Promise<ActivityPage>;

  /**
   * List the events of a BOUNDED SET of anchor entities as ONE stream — the
   * multi-anchor generalisation of {@link listForEntity}, and the read a unified
   * relationship history is built from (a Person plus the records they are linked
   * to).
   *
   * It reads the same single Activity stream at a wider scope; it introduces no
   * second event model, table or projection. Semantics:
   *   - an event is returned when ANY anchor is one of its subjects, EXACTLY ONCE
   *     even when several anchors are subjects of it (no duplicates to dedupe);
   *   - every returned event carries ALL of its subjects, not only the matched
   *     ones, so the caller can describe it fully with no N+1;
   *   - ordering is the same total newest-first `(occurredAt, id)` order, so a
   *     merged history is deterministic even for equal timestamps;
   *   - EVERY anchor must exist in the bound workspace (active or soft-deleted);
   *     a nonexistent or cross-workspace anchor surfaces as
   *     `ActivitySubjectUnavailableError`, disclosing nothing;
   *   - the anchor set is deduped, order-insensitive and bounded by
   *     `MAX_ACTIVITY_ANCHORS`; an empty or oversized set is an
   *     `ActivityValidationError`;
   *   - the cursor is bound to the anchor SET (via `activityAnchorKey`), so a
   *     cursor cannot be replayed against a different set and silently skip
   *     events — the caller must page with a STABLE anchor set.
   */
  listForEntities(
    entityIds: readonly string[],
    input?: ListEntitiesActivityInput,
  ): Promise<ActivityPage>;

  /**
   * V2.9 INS-01 — count events by type across a series of buckets, in ONE
   * grouped statement whatever the window (DEBT-238).
   *
   * Until V2.9 this contract had no time-window read at all — its inputs carried
   * `type`, `limit` and `cursor` and no from/to — so every surface that needed
   * one wrote its own `occurred_at` predicate, and "completions per week over
   * twelve weeks" had no source. This is that read.
   *
   * Guarantees, all asserted by `test/kernel/history-kernel.test.ts`:
   *   - ONE statement, whatever the bucket count — the bucket boundaries travel
   *     as a single bound parameter, so the statement's shape does not grow with
   *     the window (D1 binds at most 100 parameters, which a column-per-bucket
   *     read would exceed at 50 buckets);
   *   - flat in workspace size: the scan is the one index range the outermost
   *     bucket boundaries describe, over
   *     `(workspace_id, type, occurred_at, id)`;
   *   - every requested bucket and every requested type comes back, zero
   *     included;
   *   - DISTINCT SUBJECT ENTITIES per type, so a Task completed twice in one
   *     bucket counts once — the semantics `countPeriodCompletions` already has;
   *   - workspace-scoped: another workspace's events are not visible, and the
   *     bucket count is unaffected by their existence.
   *
   * **This is not the completion authority for Tasks.** A Task series is read
   * from `spine_records.completed_at` through
   * `TaskRepository.countCompletedInBuckets` (RECALL-02, ADR-114 decision 4),
   * because `task.completed` events survive a reopen and a delete. This read is
   * for series whose truth genuinely IS the event — Projects and Goals completed
   * keep their ADR-079 decision 2 Activity semantics — and for "what changed".
   */
  countByTypeInBuckets(
    input: CountActivityByTypeInput,
  ): Promise<readonly ActivityTypeBucketCount[]>;

  /**
   * V2.9 INS-01 — list the events inside one window, newest first, with bounded
   * cursor pagination (DEBT-238, INS-04).
   *
   * The windowed sibling of {@link listForWorkspace}: same ordering, same page
   * shape, same cursor discipline, plus a half-open `[startsAt, endsAt)` instant
   * range and an optional set of types. One statement per page.
   *
   * The cursor is bound to the WINDOW and the type filter as well as the
   * workspace, so a cursor issued for one fortnight cannot be replayed against
   * another and silently skip events — the same rule that binds a Timeline
   * cursor to its anchor set.
   */
  listInWindow(input: ListActivityInWindowInput): Promise<ActivityPage>;
}
