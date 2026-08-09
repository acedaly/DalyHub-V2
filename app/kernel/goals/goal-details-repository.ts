/**
 * AREA-02 Goals kernel — the Goal-details mutation + read repository contract.
 *
 * Storage-independent and workspace-bound at construction, mirroring
 * `~/kernel/project-settings/project-settings-repository.ts`. Every write
 * verifies the target is an ACTIVE Goal in the bound workspace (missing,
 * deleted, wrong-kind and cross-workspace ids fail closed via
 * {@link GoalDetailsNotFoundError}) and is atomic with its Activity append —
 * never a separate precondition read followed by an unguarded write.
 */

import type {
  GoalDetailsChangeResult,
  GoalDetailsRecord,
  UpdateGoalDetailsInput,
} from "./goal-details";

export interface GoalDetailsRepository {
  /**
   * Read a Goal's detail fields. Returns the default `{ targetDate: null,
   * definitionOfDone: null }` shape when the Goal exists but has no
   * `goal_details` row (never backfilled). Returns `null` for a missing,
   * deleted, wrong-kind or cross-workspace Goal id — the cases are never
   * distinguished.
   */
  get(id: string): Promise<GoalDetailsRecord | null>;

  /**
   * The SAME read as {@link get}, batched over a bounded set of Goal ids — a
   * fixed, small number of grouped queries, never one per Goal (mirrors
   * `GoalRepository.listGoalProjectContributions`).
   *
   * GOAL-02 added it because every collection surface now needs each Goal's
   * MEASUREMENT CONFIGURATION to derive its progress, and calling `get` per card
   * would have made a page of twenty Goals twenty round trips — the N+1 the
   * performance rules forbid. A Goal with no `goal_details` row still appears,
   * with the default all-null/unmeasured shape; an id that is not an active Goal
   * in this workspace is simply absent.
   */
  listMany(goalIds: readonly string[]): Promise<Map<string, GoalDetailsRecord>>;

  /**
   * Update one or both detail fields. An omitted key leaves that field
   * unchanged; `null` clears it. A patch that changes nothing (after
   * normalisation) is an idempotent no-op: no write, no Activity. A genuine
   * change atomically upserts `goal_details` and appends
   * `goal.details_updated` in the SAME transaction — an Activity-insert failure
   * rolls the details write back too.
   */
  update(
    id: string,
    patch: UpdateGoalDetailsInput,
  ): Promise<GoalDetailsChangeResult>;
}
